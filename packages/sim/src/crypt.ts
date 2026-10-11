// The Drowned Crypt's terrain rule: it's dark, and the light is yours to make. Candles stand around every room;
// shoot one and it burns for a while, pushing back the dark and exposing whatever stands near it. Some of the family
// is stone in the dark, and the Night Auditor's blackout puts every light out at once.

import { dist, type Vec } from "./math";
import type { Room, World } from "./types";

export const CRYPT = {
  /** How far a lit candle's light reaches. */
  candleRadius: 52,
  /** Seconds a candle burns once lit. */
  burnS: 18,
  /** How close a shot has to pass to light a candle. */
  lightReach: 6,
  /** The glow around each hero in the dark, and what's left of it in a blackout. */
  heroLight: 90,
  blackoutLight: 36,
  /** A Warden's owl lights the way too. */
  owlLight: 50,
  /** Enemies standing in candlelight take this much more damage from everything. */
  exposed: 1.15,
  /** What stone enemies take while they're in the dark. */
  stone: 0.2,
};

/** Lights Out, the Drowned Crypt: rooms where you can only see what's lit. */
export const roomDark = (room: Pick<Room, "biome" | "twist">): boolean => room.biome === "crypt" || room.twist === "dark";

/** How far each hero's own glow reaches right now. */
export const heroLight = (room: Pick<Room, "blackoutT">): number => (room.blackoutT > 0 ? CRYPT.blackoutLight : CRYPT.heroLight);

/** Standing in a lit candle's light. */
export function inCandleLight(w: World, at: Vec): boolean {
  return w.run.room.candles.some((c) => c.litT > 0 && dist(c.pos, at) < CRYPT.candleRadius);
}

/** Can you see it: always, unless the room is dark; then near a lit candle, a hero or a Warden's owl. */
export function isLit(w: World, at: Vec): boolean {
  const room = w.run.room;
  if (!roomDark(room)) return true;
  if (inCandleLight(w, at)) return true;
  const r = heroLight(room);
  if (w.players.some((p) => !p.away && dist(p.pos, at) < (p.downed ? r * 0.45 : r))) return true;
  return w.gadgets.some((g) => g.kind === "drone" && dist(g.pos, at) < CRYPT.owlLight);
}

/** Shots and blasts light any candle they pass close to. */
export function lightCandles(w: World, at: Vec, radius: number): void {
  const room = w.run.room;
  if (room.candles.length === 0 || room.blackoutT > 0) return;
  for (const c of room.candles) {
    if (dist(c.pos, at) > radius + CRYPT.lightReach) continue;
    if (c.litT <= 0) w.events.push({ type: "candleLit", x: c.pos.x, y: c.pos.y });
    c.litT = CRYPT.burnS;
  }
}

/** Puts out every lit candle within `radius` of `at` (a Bell Ringer), or all of them. */
export function snuffCandles(w: World, at?: Vec, radius = Infinity): void {
  for (const c of w.run.room.candles) if (!at || dist(c.pos, at) < radius) c.litT = 0;
}

/** Candles burn down; a blackout runs out. Candles can't be lit during one. */
export function updateCandles(room: Room, dt: number): void {
  room.blackoutT = Math.max(0, room.blackoutT - dt);
  for (const c of room.candles) c.litT = Math.max(0, c.litT - dt);
}

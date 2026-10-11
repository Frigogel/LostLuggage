// Grabbers (design doc: Co-op enemies): they catch the player in front of them and hold on. A pinned player can't
// move, dash, shoot or throw. A teammate standing next to them pulls them free in a moment; on your own, mash dash.
// Enough damage to the grabber breaks its grip too. Nobody helps in time and you get thrown.

import { confine, DT, hurtPlayer, pointInDome } from "./combat";
import { ENEMIES } from "./data/enemies";
import { REVIVE } from "./data/heroes";
import { add, dist, dot, len, norm, scale, sub } from "./math";
import type { AttackDef, Enemy, Player, PlayerInput, World } from "./types";

type GrabAttack = Extract<AttackDef, { type: "grab" }>;

export const GRAB = {
  /** Seconds for one teammate standing close to pull you free (a second one helps a little). */
  freeS: 0.7,
  /** What each dash press adds to your own escape. */
  struggle: 0.22,
  /** Escape progress lost per second while nobody is helping. */
  decay: 0.15,
  squeezeEvery: 0.6,
  /** A grabber that loses its grip is dazed this long: the reward for freeing someone. */
  stunS: 1.4,
  /** Breathing room once you're loose. */
  freedIframes: 0.8,
  freedShove: 170,
  tossShove: 260,
};

/** The grab attack an enemy is using right now, if it's holding someone. */
export function holding(e: Enemy): GrabAttack | undefined {
  const atk = ENEMIES[e.defId]?.attacks[e.attackIdx];
  return e.state === "attack" && atk?.type === "grab" ? atk : undefined;
}

/** The grab lands on whoever is in reach and in front. Returns false on a whiff. */
export function tryGrab(w: World, e: Enemy, atk: GrabAttack): boolean {
  const p = w.players.find((pl) => {
    if (pl.downed || pl.away || pl.pinnedBy || pl.iframes > 0) return false;
    const off = sub(pl.pos, e.pos);
    return len(off) < e.radius + pl.radius + atk.reach && dot(norm(off), e.attackDir) > 0.2 && !pointInDome(w, pl.pos);
  });
  if (!p || !hurtPlayer(w, p, atk.damage)) return false;
  p.pinnedBy = e.id;
  p.freeProgress = 0;
  p.charging = false;
  p.burstLeft = 0;
  p.dashT = 0;
  p.knock = { x: 0, y: 0 };
  e.state = "attack";
  e.stateT = atk.holdMs / 1000;
  e.hitPlayers = [p.id];
  e.gripHp = e.hp;
  e.burst = GRAB.squeezeEvery;
  e.knock = { x: 0, y: 0 };
  w.events.push({ type: "grabbed", id: p.id, by: e.id });
  return true;
}

/** The grabber's side of a hold: keep them close, squeeze now and then, let go if hit hard enough, throw at the end. */
export function updateGrab(w: World, e: Enemy, atk: GrabAttack): void {
  const p = w.players.find((pl) => pl.id === e.hitPlayers[0] && pl.pinnedBy === e.id);
  if (!p) {
    letGo(e, atk, false);
    return;
  }
  p.pos = add(e.pos, scale(e.attackDir, e.radius + p.radius));
  confine(w, p.pos, p.radius);
  p.vel = { x: 0, y: 0 };
  if (e.gripHp !== undefined && e.gripHp - e.hp >= atk.breakFrac * e.maxHp) {
    release(w, p, e, -1);
    return;
  }
  e.stateT -= DT;
  e.burst -= DT;
  if (e.burst <= 0) {
    e.burst = GRAB.squeezeEvery;
    p.iframes = 0;
    hurtPlayer(w, p, atk.squeeze);
    if (p.downed) return;
  }
  if (e.stateT <= 0) {
    // Nobody came: thrown across the room.
    p.iframes = 0;
    hurtPlayer(w, p, atk.toss);
    release(w, p, e, -2);
    p.knock = scale(e.attackDir, GRAB.tossShove);
  }
}

/**
 * The pinned player's side, run before they'd move: teammates close by pull them free, dash presses struggle, and
 * anything that stops the grabber holding (it died, got stunned, frozen, put to sleep or misplaced) lets them go.
 */
export function updatePinned(w: World, p: Player, input: PlayerInput): void {
  const e = w.enemies.find((en) => en.id === p.pinnedBy);
  const atk = e && e.hp > 0 && e.spawnT <= 0 && e.stunT <= 0 && e.sleepT <= 0 && e.status.frozenT <= 0 ? holding(e) : undefined;
  if (!e || !atk || e.hitPlayers[0] !== p.id || p.downed || p.away) {
    // Whatever stopped it holding on already dealt with the grabber.
    release(w, p, e, -1, false);
    return;
  }
  const helpers = w.players.filter((o) => o !== p && !o.downed && !o.away && !o.pinnedBy && dist(o.pos, p.pos) < REVIVE.reach + o.radius);
  if (helpers.length > 0) p.freeProgress += (DT * (1 + 0.5 * (helpers.length - 1))) / GRAB.freeS;
  else p.freeProgress = Math.max(0, p.freeProgress - GRAB.decay * DT);
  if (input.dash) p.freeProgress += GRAB.struggle;
  if (p.freeProgress >= 1) release(w, p, e, helpers[0]?.id ?? -1);
}

/**
 * Lets a pinned player go. `by` is who freed them (-1 for nobody in particular, -2 for a throw). Losing its grip
 * leaves the grabber dazed, unless it threw them or something else already stopped it.
 */
export function release(w: World, p: Player, e: Enemy | undefined, by: number, daze = by !== -2): void {
  if (!p.pinnedBy) return;
  p.pinnedBy = 0;
  p.freeProgress = 0;
  w.events.push({ type: "freed", id: p.id, by });
  const atk = e ? holding(e) : undefined;
  if (!e || !atk) return;
  if (by !== -2 && !p.downed) {
    p.iframes = Math.max(p.iframes, GRAB.freedIframes);
    p.knock = scale(norm(sub(p.pos, e.pos)), GRAB.freedShove);
  }
  letGo(e, atk, daze && e.hp > 0);
}

function letGo(e: Enemy, atk: GrabAttack, dazed: boolean): void {
  e.hitPlayers = [];
  e.gripHp = undefined;
  e.state = "recover";
  e.stateT = atk.recoverMs / 1000;
  if (dazed) e.stunT = Math.max(e.stunT, GRAB.stunS);
}

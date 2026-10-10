import { damageEnemy, dropHeal, DT, hurtPlayer, insideArenaSolid, newId, spawnEnemy } from "./combat";
import { ENEMIES } from "./data/enemies";
import { MAX_ENEMIES, planCombatWaves } from "./director";
import { canAct, startPos } from "./players";
import { newGun, BOOSTS } from "./loot";
import { dist, pick, randRange, type Rect, type Vec } from "./math";
import type { BoostId, Room, Vent, World } from "./types";

export const ARENA = { w: 720, h: 440 };
export const START = { x: ARENA.w / 2, y: ARENA.h - 40 };
export const EXIT: Rect = { x: ARENA.w / 2 - 24, y: 0, w: 48, h: 14 };

interface Layout {
  obstacles: Rect[];
  vents: Vec[];
}

const crate = (x: number, y: number, w = 32, h = 32): Rect => ({ x, y, w, h });

/** Hand-placed room layouts. Crates come in 32x32 and 48x16 so the client has art for them. */
export const LAYOUTS: Layout[] = [
  // 0: intro, open with four crates
  {
    obstacles: [crate(160, 112), crate(528, 112), crate(160, 296), crate(528, 296), crate(336, 200, 48, 16)],
    vents: [{ x: 260, y: 220 }, { x: 460, y: 220 }],
  },
  // 1: cargo rows, long lanes for chargers
  {
    obstacles: [crate(96, 160, 48, 16), crate(208, 160, 48, 16), crate(464, 160, 48, 16), crate(576, 160, 48, 16), crate(176, 280), crate(512, 280), crate(344, 100)],
    vents: [{ x: 360, y: 220 }, { x: 140, y: 340 }, { x: 580, y: 340 }],
  },
  // 2: crossroads, cover in every quadrant
  {
    obstacles: [crate(240, 140), crate(448, 140), crate(240, 268), crate(448, 268), crate(336, 60, 48, 16), crate(80, 212, 48, 16), crate(592, 212, 48, 16)],
    vents: [{ x: 360, y: 220 }, { x: 180, y: 110 }, { x: 540, y: 110 }, { x: 360, y: 340 }],
  },
  // 3: breather, the shrine and chest sit up top
  {
    obstacles: [crate(200, 200), crate(488, 200)],
    vents: [{ x: 360, y: 300 }],
  },
  // 4: mini-boss arena, wide open with vents to bait the charge into
  {
    obstacles: [crate(120, 120), crate(568, 120), crate(120, 288), crate(568, 288)],
    vents: [{ x: 230, y: 150 }, { x: 490, y: 150 }, { x: 230, y: 300 }, { x: 490, y: 300 }, { x: 360, y: 220 }],
  },
];

// ---------------------------------------------------------------- vents

export type VentState = "idle" | "warn" | "erupt";

export function ventState(v: Vent): VentState {
  const c = v.t % v.periodS;
  if (c >= v.periodS - v.eruptS) return "erupt";
  if (c >= v.periodS - v.eruptS - v.warnS) return "warn";
  return "idle";
}

function updateVents(w: World, room: Room): void {
  for (const v of room.vents) {
    const before = ventState(v);
    const beforeC = v.t % v.periodS;
    v.t += DT;
    const now = ventState(v);
    if (before === "idle" && now === "warn") w.events.push({ type: "ventWarn", id: v.id });
    if (now !== "erupt") continue;
    if (before !== "erupt") w.events.push({ type: "ventErupt", id: v.id, x: v.pos.x, y: v.pos.y });

    for (const p of w.players) {
      if (!p.downed && dist(p.pos, v.pos) < v.radius + p.radius * 0.5) hurtPlayer(w, p, v.damage);
    }
    // Enemies get burned at the start and middle of an eruption. Fire-immune ones don't care.
    const mid = v.periodS - v.eruptS / 2;
    if (before !== "erupt" || (beforeC < mid && v.t % v.periodS >= mid)) {
      for (const e of [...w.enemies]) {
        if (e.spawnT > 0 || ENEMIES[e.defId]!.fireImmune || dist(e.pos, v.pos) > v.radius + e.radius) continue;
        damageEnemy(w, e, v.damage, { dir: { x: e.pos.x - v.pos.x, y: e.pos.y - v.pos.y }, knockback: 80, sourcePlayerId: -1, element: "fire" });
      }
    }
  }
}

// ---------------------------------------------------------------- rooms

/** How long the exit waits for the rest of the party once someone steps on it. */
export const EXIT_WAIT_S = 4;

export function enterRoom(w: World, index: number): void {
  const plan = w.run.plans[index]!;
  const party = w.players.filter((p) => !p.away).length || 1;
  if (plan.kind === "combat" && plan.party !== party) {
    // Someone dropped in or left: re-plan this room for the party that's actually here.
    plan.waves = planCombatWaves(w, index, w.run.tier, party);
    plan.party = party;
  }
  const layout = LAYOUTS[plan.layout]!;
  w.arena.obstacles = layout.obstacles.map((o) => ({ ...o }));
  w.enemies = [];
  w.projectiles = [];
  w.hazards = [];
  w.domes = [];
  w.pickups = [];

  const vents: Vent[] = layout.vents.map((pos) => {
    const periodS = randRange(w, 5, 7.5);
    return { id: newId(w), pos: { ...pos }, radius: 18, periodS, warnS: 1.2, eruptS: 0.9, t: randRange(w, 0, periodS * 0.6), damage: 18 };
  });
  // Plain wave ids; "!" marks ambushers that wait in the room from the start.
  const waves = plan.waves.map((wave) => wave.filter((id) => !id.startsWith("!")));
  const props = plan.waves.flatMap((wave) => wave.filter((id) => id.startsWith("!")).map((id) => id.slice(1)));

  const room: Room = { index, kind: plan.kind, waves, waveIdx: 0, waveTimer: 1.5, cleared: false, exit: { ...EXIT }, exitT: -1, vents };
  w.run.room = room;

  w.players.forEach((p, i) => {
    p.pos = startPos(START, i, w.players.length);
    p.vel = { x: 0, y: 0 };
    p.dashT = 0;
    p.burstLeft = 0;
    p.charging = false;
    p.panicUsed = false;
    // Teammates left down in the last room get carried along.
    if (p.downed && p.reviveT === Infinity && index > 0) {
      p.downed = false;
      p.reviveProgress = 0;
      p.reviveT = 0;
      p.hp = Math.max(1, Math.round(p.maxHp * 0.3));
      p.iframes = 2;
      w.events.push({ type: "playerRevived", id: p.id, by: -1 });
    }
  });

  for (const id of props) spawnEnemy(w, id, spawnPoint(w, 110), 0);

  if (plan.kind === "intro") {
    // Gun pedestals: try every archetype before the real fights start.
    for (const [defId, x] of [["smg", 280], ["sniper", 360], ["launcher", 440]] as const) {
      w.pickups.push({ id: newId(w), kind: "gun", pos: { x, y: START.y - 30 + (x === 360 ? 10 : 0) }, gun: { ...newGun(w, defId), loaner: true }, used: false });
    }
  }
  if (plan.kind === "breather") {
    const boost = pick(w, Object.keys(BOOSTS) as BoostId[]);
    w.pickups.push({ id: newId(w), kind: "shrine", pos: { x: 280, y: 110 }, boost, used: false });
    w.pickups.push({ id: newId(w), kind: "chest", pos: { x: 440, y: 110 }, used: false });
    dropHeal(w, { x: 360, y: 180 }, 40);
  }

  w.events.push({ type: "roomEnter", index, kind: plan.kind, rooms: w.run.plans.length });
}

function liveThreat(w: World): number {
  return w.enemies.reduce((sum, e) => (e.state === "hidden" ? sum : sum + Math.max(0.5, ENEMIES[e.defId]!.threatCost)), 0);
}

export function updateRoom(w: World): void {
  const run = w.run;
  const room = run.room;
  run.time += DT;
  updateVents(w, room);

  if (!room.cleared) {
    if (room.waveIdx < room.waves.length) {
      // The next wave arrives once the current one is nearly beaten, so fights flow into each other.
      if (liveThreat(w) <= 2) {
        room.waveTimer -= DT;
        if (room.waveTimer <= 0) spawnWave(w, room);
      }
    } else if (w.enemies.every((e) => e.state === "hidden")) {
      room.cleared = true;
      w.events.push({ type: "roomCleared", index: room.index });
      if (room.kind === "boss") {
        run.victory = true;
        w.events.push({ type: "victory" });
      }
    }
    return;
  }

  if (run.victory) return;
  const e = room.exit;
  const up = w.players.filter(canAct);
  const waiting = up.filter((p) => p.pos.x > e.x && p.pos.x < e.x + e.w && p.pos.y < e.y + e.h + p.radius + 4);
  if (waiting.length === 0) {
    room.exitT = -1;
    return;
  }
  // Everyone who can walk is at the door: go now. Otherwise give the stragglers a few seconds.
  if (waiting.length === up.length) {
    enterRoom(w, room.index + 1);
    return;
  }
  if (room.exitT < 0) room.exitT = EXIT_WAIT_S;
  room.exitT -= DT;
  if (room.exitT <= 0) enterRoom(w, room.index + 1);
}

function spawnWave(w: World, room: Room): void {
  const ids = room.waves[room.waveIdx]!;
  room.waveIdx++;
  room.waveTimer = 1.2;
  w.events.push({ type: "waveStart", wave: room.waveIdx, waves: room.waves.length });

  let packCenter: Vec | undefined;
  ids.slice(0, MAX_ENEMIES - w.enemies.length).forEach((id, i) => {
    const def = ENEMIES[id]!;
    const swarm = def.role === "swarmer";
    let pos: Vec;
    if (swarm && packCenter) pos = nearPoint(w, packCenter);
    else {
      pos = def.role === "boss" ? { x: ARENA.w / 2, y: 170 } : spawnPoint(w, 140);
      if (swarm) packCenter = pos;
    }
    spawnEnemy(w, id, pos, 0.8 + i * 0.1);
  });
}

function spawnPoint(w: World, minPlayerDist: number): Vec {
  for (let tries = 0; tries < 50; tries++) {
    const p = { x: randRange(w, 30, w.arena.w - 30), y: randRange(w, 40, w.arena.h - 30) };
    if (insideArenaSolid(w, p) || w.arena.obstacles.some((o) => p.x > o.x - 12 && p.x < o.x + o.w + 12 && p.y > o.y - 12 && p.y < o.y + o.h + 12)) continue;
    if (w.players.some((pl) => dist(pl.pos, p) < minPlayerDist)) continue;
    if (w.run.room.vents.some((v) => dist(v.pos, p) < v.radius + 12)) continue;
    return p;
  }
  return { x: 40, y: 60 };
}

function nearPoint(w: World, c: Vec): Vec {
  for (let tries = 0; tries < 10; tries++) {
    const p = { x: c.x + randRange(w, -24, 24), y: c.y + randRange(w, -24, 24) };
    if (!insideArenaSolid(w, p)) return p;
  }
  return { ...c };
}

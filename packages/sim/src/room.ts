import { damageEnemy, dropGun, dropHeal, DT, healPlayer, hurtPlayer, insideArenaSolid, newId, partyLuck, spawnEnemy } from "./combat";
import { boostOffers } from "./data/boosts";
import { ENEMIES } from "./data/enemies";
import { ACT_ROOMS, FINAL_ACT, MAX_ENEMIES, planDoors, planRoom, firstRoom } from "./director";
import { linkPairs, parseElite } from "./elites";
import { canAct, startPos } from "./players";
import { newGun } from "./loot";
import { clamp, dist, distToSegment, norm, randRange, rand, scale, sub, type Rect, type Vec } from "./math";
import type { Belt, Current, Door, Enemy, Pad, Player, Room, RoomKind, RoomSpec, Vent, World } from "./types";

export const ARENA = { w: 720, h: 440 };
export const START = { x: ARENA.w / 2, y: ARENA.h - 40 };
/** One door's size; doors sit along the top wall (see director planDoors). */
export const DOOR = { w: 48, h: 14 };
/** The door rect around a door's center. */
export const doorRect = (d: Pick<Door, "x">): Rect => ({ x: d.x - DOOR.w / 2, y: 0, w: DOOR.w, h: DOOR.h });

interface Layout {
  obstacles: Rect[];
  vents: Vec[];
  /** Frozen Caverns: spike walls. */
  spikes?: Rect[];
  /** Icy floor. */
  ice?: boolean;
  /** Bilge Sewers: sludge pipes, from the mouth in the wall to the end of the jet. */
  pipes?: [Vec, Vec][];
  /** Bilge Sewers: deep water and which way it flows. */
  water?: Current[];
  /** Orbital Deck: laser fences between two posts. */
  lasers?: [Vec, Vec][];
  /** Orbital Deck: linked teleporter pads. */
  pads?: Pad[];
}

const crate = (x: number, y: number, w = 32, h = 32): Rect => ({ x, y, w, h });
/** Spike strips are 8 px deep. */
const SPIKE = 8;
const leftSpikes = (y: number, h: number): Rect => ({ x: 0, y, w: SPIKE, h });
const rightSpikes = (y: number, h: number): Rect => ({ x: ARENA.w - SPIKE, y, w: SPIKE, h });
// Top-wall spikes stay in the corners: the middle of the top wall is where the doors open.
const topSpikes = (x: number, w: number): Rect => ({ x, y: 0, w, h: SPIKE });
const v = (x: number, y: number): Vec => ({ x, y });
/** A channel of sewer water flowing (vx, vy). */
const water = (x: number, y: number, w: number, h: number, vx: number, vy: number): Current => ({ x, y, w, h, vx, vy });
const pads = (ax: number, ay: number, bx: number, by: number): Pad => ({ a: v(ax, ay), b: v(bx, by) });

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
  // 3: rest stop: room for a suitcase, offers and a snack
  {
    obstacles: [crate(200, 200), crate(488, 200)],
    vents: [{ x: 360, y: 300 }],
  },
  // 4: boss arena, wide open with vents to bait the charge into
  {
    obstacles: [crate(120, 120), crate(568, 120), crate(120, 288), crate(568, 288)],
    vents: [{ x: 230, y: 150 }, { x: 490, y: 150 }, { x: 230, y: 300 }, { x: 490, y: 300 }, { x: 360, y: 220 }],
  },

  // Frozen Caverns: icy floors, ice blocks for crates, and spike walls instead of vents.
  // 5: intro, spikes only on the side walls so you learn to slide before you learn to fear them
  {
    obstacles: [crate(160, 112), crate(528, 112), crate(160, 296), crate(528, 296), crate(336, 200, 48, 16)],
    vents: [],
    spikes: [leftSpikes(150, 140), rightSpikes(150, 140)],
    ice: true,
  },
  // 6: the rink, open ice around a spiked pillar
  {
    obstacles: [crate(344, 204), crate(120, 110, 48, 16), crate(552, 110, 48, 16), crate(120, 320, 48, 16), crate(552, 320, 48, 16)],
    vents: [],
    spikes: [{ x: 336, y: 204, w: SPIKE, h: 32 }, { x: 376, y: 204, w: SPIKE, h: 32 }, leftSpikes(100, 240), rightSpikes(100, 240), topSpikes(16, 110), topSpikes(594, 110)],
    ice: true,
  },
  // 7: the crevasse, spike walls the whole way down both sides
  {
    obstacles: [crate(240, 200), crate(448, 200), crate(344, 100), crate(344, 300), crate(100, 70, 48, 16), crate(572, 70, 48, 16)],
    vents: [],
    spikes: [leftSpikes(40, 360), rightSpikes(40, 360)],
    ice: true,
  },
  // 8: rest stop
  {
    obstacles: [crate(200, 200), crate(488, 200)],
    vents: [],
    ice: true,
  },
  // 9: the dragon's office, spikes on three walls so its shoves matter
  {
    obstacles: [crate(120, 120), crate(568, 120), crate(120, 288), crate(568, 288)],
    vents: [],
    spikes: [leftSpikes(40, 360), rightSpikes(40, 360), topSpikes(16, 110), topSpikes(594, 110)],
    ice: true,
  },

  // More foundry fights.
  // 10: the furnace ring, a loop of cover around a hot middle
  {
    obstacles: [crate(296, 150), crate(392, 150), crate(296, 258), crate(392, 258), crate(140, 204, 48, 16), crate(532, 204, 48, 16)],
    vents: [{ x: 360, y: 222 }, { x: 120, y: 120 }, { x: 600, y: 120 }, { x: 120, y: 340 }, { x: 600, y: 340 }],
  },
  // 11: loading dock, a wall of crates with gaps to funnel through
  {
    obstacles: [crate(60, 220, 48, 16), crate(150, 220, 48, 16), crate(300, 220, 48, 16), crate(372, 220, 48, 16), crate(522, 220, 48, 16), crate(612, 220, 48, 16), crate(250, 110), crate(438, 110)],
    vents: [{ x: 240, y: 300 }, { x: 480, y: 300 }, { x: 360, y: 140 }],
  },
  // 12: the shop floor, scattered cover and nowhere to hide for long
  {
    obstacles: [crate(110, 90), crate(578, 90), crate(220, 190), crate(468, 190), crate(344, 280), crate(110, 330), crate(578, 330), crate(336, 120, 48, 16)],
    vents: [{ x: 160, y: 220 }, { x: 560, y: 220 }, { x: 360, y: 210 }, { x: 260, y: 350 }, { x: 460, y: 350 }],
  },

  // More caverns fights.
  // 13: the ice maze, blocks to slide around and spikes at the ends
  {
    obstacles: [crate(150, 130), crate(270, 210), crate(418, 210), crate(538, 130), crate(150, 300), crate(538, 300), crate(344, 330)],
    vents: [],
    spikes: [leftSpikes(60, 120), leftSpikes(280, 120), rightSpikes(60, 120), rightSpikes(280, 120), { x: 344, y: 120, w: 32, h: SPIKE }],
    ice: true,
  },
  // 14: the frozen lake, nearly no cover and a spiked island
  {
    obstacles: [crate(200, 160, 48, 16), crate(472, 160, 48, 16), crate(336, 300, 48, 16)],
    vents: [],
    spikes: [{ x: 340, y: 200, w: 40, h: SPIKE }, { x: 340, y: 240, w: 40, h: SPIKE }, leftSpikes(120, 200), rightSpikes(120, 200), topSpikes(16, 110), topSpikes(594, 110)],
    ice: true,
  },
  // 15: the glacier corridor, a spiked spine down the middle
  {
    obstacles: [crate(120, 100), crate(568, 100), crate(120, 310), crate(568, 310), crate(240, 330, 48, 16), crate(432, 330, 48, 16)],
    vents: [],
    spikes: [{ x: 356, y: 130, w: SPIKE, h: 60 }, { x: 356, y: 250, w: SPIKE, h: 60 }, leftSpikes(180, 80), rightSpikes(180, 80)],
    ice: true,
  },

  // Bilge Sewers: deep water you wade through (the sewer family swims it), and sludge pipes that blast a lane.
  // 16: intro, one channel across the middle and a single pipe to learn the warning drip on
  {
    obstacles: [crate(160, 150), crate(528, 150), crate(160, 300), crate(528, 300)],
    vents: [],
    water: [water(0, 196, ARENA.w, 48, 55, 0)],
    pipes: [[v(0, 120), v(300, 120)]],
  },
  // 17: the outflow, two channels pouring down the room and pipes from either side
  {
    obstacles: [crate(96, 200), crate(592, 200), crate(344, 110), crate(336, 260, 48, 16)],
    vents: [],
    water: [water(196, 30, 48, 410, 0, 60), water(476, 30, 48, 410, 0, 60)],
    pipes: [[v(0, 310), v(330, 310)], [v(ARENA.w, 140), v(390, 140)]],
  },
  // 18: the cistern, a slow pool in the middle and pipes at the top and bottom
  {
    obstacles: [crate(120, 100), crate(568, 100), crate(120, 300), crate(568, 300), crate(336, 214, 48, 16)],
    vents: [],
    water: [water(220, 150, 280, 140, 45, 0)],
    pipes: [[v(0, 80), v(320, 80)], [v(ARENA.w, 360), v(400, 360)]],
  },
  // 19: the sluice, two channels flowing opposite ways and pipes that meet in the middle
  {
    obstacles: [crate(150, 150), crate(538, 150), crate(336, 40, 48, 16), crate(336, 384, 48, 16)],
    vents: [],
    water: [water(0, 100, ARENA.w, 40, 65, 0), water(0, 300, ARENA.w, 40, -65, 0)],
    pipes: [[v(0, 222), v(340, 222)], [v(ARENA.w, 222), v(380, 222)]],
  },
  // 20: the drain, channels up one side and down the other
  {
    obstacles: [crate(300, 150), crate(388, 150), crate(300, 260), crate(388, 260), crate(60, 60, 48, 16), crate(612, 60, 48, 16)],
    vents: [],
    water: [water(150, 40, 44, 400, 0, 65), water(526, 0, 44, 400, 0, -65)],
    pipes: [[v(0, 340), v(300, 340)], [v(ARENA.w, 110), v(420, 110)]],
  },
  // 21: rest stop
  {
    obstacles: [crate(200, 200), crate(488, 200)],
    vents: [],
    water: [water(0, 280, ARENA.w, 36, 40, 0)],
  },
  // 22: the overflow chamber, water circling the room and pipes on both sides
  {
    obstacles: [crate(120, 200), crate(568, 200)],
    vents: [],
    water: [water(60, 100, 600, 40, 55, 0), water(60, 300, 600, 40, -55, 0)],
    pipes: [[v(0, 60), v(260, 60)], [v(ARENA.w, 60), v(460, 60)], [v(0, 380), v(240, 380)], [v(ARENA.w, 380), v(480, 380)]],
  },

  // Orbital Deck: laser fences on a timer, and teleporter pads in pairs (only the crew knows how to use them).
  // 23: intro, one fence across the middle and one pair of pads
  {
    obstacles: [crate(160, 112), crate(528, 112), crate(160, 296), crate(528, 296)],
    vents: [],
    lasers: [[v(250, 220), v(470, 220)]],
    pads: [pads(90, 340, 630, 90)],
  },
  // 24: the hangar, two fences and pads corner to corner
  {
    obstacles: [crate(120, 200), crate(568, 200), crate(344, 120), crate(336, 300, 48, 16)],
    vents: [],
    lasers: [[v(240, 70), v(240, 210)], [v(480, 230), v(480, 370)]],
    pads: [pads(70, 70, 650, 330), pads(650, 70, 70, 330)],
  },
  // 25: the corridor, fences from either side with a gap to slip through
  {
    obstacles: [crate(110, 60), crate(578, 340), crate(250, 210), crate(438, 210)],
    vents: [],
    lasers: [[v(30, 150), v(330, 150)], [v(390, 290), v(690, 290)]],
    pads: [pads(90, 330, 630, 110)],
  },
  // 26: the reactor, a laser cross in the middle
  {
    obstacles: [crate(110, 90), crate(578, 90), crate(110, 310), crate(578, 310)],
    vents: [],
    lasers: [[v(280, 220), v(440, 220)], [v(360, 140), v(360, 300)]],
    pads: [pads(220, 100, 500, 340), pads(500, 100, 220, 340)],
  },
  // 27: the airlock, two slanted fences pointing at the doors
  {
    obstacles: [crate(336, 150, 48, 16), crate(344, 280), crate(80, 330, 48, 16), crate(592, 330, 48, 16)],
    vents: [],
    lasers: [[v(140, 90), v(290, 250)], [v(580, 90), v(430, 250)]],
    pads: [pads(60, 220, 660, 220)],
  },
  // 28: rest stop
  {
    obstacles: [crate(200, 200), crate(488, 200)],
    vents: [],
    pads: [pads(90, 330, 630, 330)],
  },
  // 29: the bridge, short fences at the sides and pads in every corner
  {
    obstacles: [crate(150, 300), crate(538, 300)],
    vents: [],
    lasers: [[v(40, 220), v(190, 220)], [v(530, 220), v(680, 220)]],
    pads: [pads(70, 70, 650, 370), pads(650, 70, 70, 370)],
  },
];

/** Teleporter pads: how close to the middle counts as standing on one. */
export const PAD = { radius: 12 };

/** The pad a point is standing on and where it leads, if any. */
export function padAt(arena: { pads: Pad[] }, p: Vec): { from: Vec; to: Vec } | undefined {
  for (const pd of arena.pads) {
    if (dist(p, pd.a) < PAD.radius) return { from: pd.a, to: pd.b };
    if (dist(p, pd.b) < PAD.radius) return { from: pd.b, to: pd.a };
  }
  return undefined;
}

/** The water under a point, if any. */
export function waterAt(arena: { water: Current[] }, p: Vec): Current | undefined {
  return arena.water.find((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
}

/** A room's terrain, built the same way by the sim and by co-op clients from the layout number. */
export function arenaFor(layout: number, twist: string): Pick<World["arena"], "obstacles" | "spikes" | "ice" | "belts" | "water" | "pads"> {
  const l = LAYOUTS[layout] ?? LAYOUTS[0]!;
  return {
    obstacles: l.obstacles.map((o) => ({ ...o })),
    spikes: (l.spikes ?? []).map((o) => ({ ...o })),
    ice: !!l.ice,
    belts: beltsFor(twist),
    water: (l.water ?? []).map((c) => ({ ...c })),
    pads: (l.pads ?? []).map((pd) => ({ a: { ...pd.a }, b: { ...pd.b } })),
  };
}

/** Baggage Claim: three conveyor belts across the room, alternating directions. */
export function beltsFor(twist: string): Belt[] {
  if (twist !== "belts") return [];
  return [
    { x: 0, y: 92, w: ARENA.w, h: 44, vx: 70 },
    { x: 0, y: 198, w: ARENA.w, h: 44, vx: -70 },
    { x: 0, y: 304, w: ARENA.w, h: 44, vx: 70 },
  ];
}

/** The belt under a point, if any. */
export function beltAt(arena: { belts: Belt[] }, p: Vec): Belt | undefined {
  return arena.belts.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
}

// ---------------------------------------------------------------- vents

export type VentState = "idle" | "warn" | "erupt";

/** The middle of a vent, or the point of a pipe's or laser's lane nearest to `p`. */
export function trapPoint(v: Pick<Vent, "pos" | "to">, p: Vec): Vec {
  if (!v.to) return v.pos;
  const ab = sub(v.to, v.pos);
  const l2 = ab.x * ab.x + ab.y * ab.y || 1;
  const k = clamp(((p.x - v.pos.x) * ab.x + (p.y - v.pos.y) * ab.y) / l2, 0, 1);
  return { x: v.pos.x + ab.x * k, y: v.pos.y + ab.y * k };
}

/** How far a point is from a trap's area. */
export function trapDist(v: Pick<Vent, "pos" | "to">, p: Vec): number {
  return v.to ? distToSegment(p, v.pos, v.to) : dist(p, v.pos);
}

/** Pipes and lasers loop faster than vents, and lasers stay on longer. */
const TRAPS = {
  vent: { period: [5, 7.5], warn: 1.2, erupt: 0.9, radius: 18, damage: 18 },
  pipe: { period: [5, 7], warn: 1.2, erupt: 1.1, radius: 14, damage: 14 },
  laser: { period: [4, 5.5], warn: 0.9, erupt: 1.8, radius: 3, damage: 16 },
} as const;
/** A sludge jet shoves you down its lane; a laser bumps you off it. */
const PIPE_PUSH = 280;
const LASER_PUSH = 140;

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

    // Which way a lane shoves: down a pipe's jet, or sideways off a laser.
    const along = v.to ? norm(sub(v.to, v.pos)) : { x: 0, y: 0 };
    const away = (p: Vec): Vec => {
      if (v.kind === "pipe") return along;
      if (!v.to) return norm(sub(p, v.pos));
      const across = { x: -along.y, y: along.x };
      return (p.x - v.pos.x) * across.x + (p.y - v.pos.y) * across.y >= 0 ? across : scale(across, -1);
    };
    for (const p of w.players) {
      if (p.downed || trapDist(v, p.pos) >= v.radius + p.radius * 0.5) continue;
      if (hurtPlayer(w, p, v.damage) && v.kind !== "vent") p.knock = scale(away(p.pos), v.kind === "pipe" ? PIPE_PUSH : LASER_PUSH);
    }
    // Enemies get hit at the start and middle of an eruption. Vents don't burn the fire-immune.
    const mid = v.periodS - v.eruptS / 2;
    if (before !== "erupt" || (beforeC < mid && v.t % v.periodS >= mid)) {
      for (const e of [...w.enemies]) {
        if (e.spawnT > 0 || (v.kind === "vent" && ENEMIES[e.defId]!.fireImmune) || trapDist(v, e.pos) > v.radius + e.radius) continue;
        const dir = v.kind === "vent" ? { x: e.pos.x - v.pos.x, y: e.pos.y - v.pos.y } : away(e.pos);
        damageEnemy(w, e, v.damage, { dir, knockback: v.kind === "pipe" ? 200 : 80, sourcePlayerId: -1, element: v.kind === "vent" ? "fire" : "none" });
      }
    }
  }
}

// ---------------------------------------------------------------- rooms

/** How long the doors wait for the rest of the party once someone steps into one. */
export const EXIT_WAIT_S = 4;
/** Hold the Line: seconds to survive. */
export const HOLD_S = 40;
/** Falling Luggage: a suitcase lands this often, plus one aimed at each player now and then. */
const LUGGAGE = { every: 0.9, radius: 22, damage: 14, flight: 1.1 };

/** The act the current room belongs to. */
export const roomAct = (w: World): number => w.run.plans[w.run.room.index]?.act ?? 0;

/** Plans the room a door leads to and walks the party in. */
export function enterRoom(w: World, spec: RoomSpec): void {
  const party = w.players.filter((p) => !p.away).length || 1;
  const plan = planRoom(w, spec, w.run.tier, party);
  w.run.plans.push(plan);
  const index = w.run.plans.length - 1;
  const layout = LAYOUTS[plan.layout]!;
  Object.assign(w.arena, arenaFor(plan.layout, plan.twist));
  w.enemies = [];
  w.projectiles = [];
  w.hazards = [];
  w.domes = [];
  w.gadgets = [];
  w.pickups = [];

  const trap = (kind: Vent["kind"], pos: Vec, to?: Vec): Vent => {
    const c = TRAPS[kind];
    const periodS = randRange(w, c.period[0], c.period[1]);
    const t: Vent = { id: newId(w), kind, pos: { ...pos }, radius: c.radius, periodS, warnS: c.warn, eruptS: c.erupt, t: randRange(w, 0, periodS * 0.6), damage: c.damage };
    if (to) t.to = { ...to };
    return t;
  };
  const vents: Vent[] = [
    ...layout.vents.map((pos) => trap("vent", pos)),
    ...(layout.pipes ?? []).map(([a, b]) => trap("pipe", a, b)),
    ...(layout.lasers ?? []).map(([a, b]) => trap("laser", a, b)),
  ];
  // Plain wave ids; "!" marks ambushers that wait in the room from the start.
  const waves = plan.waves.map((wave) => wave.filter((id) => !id.startsWith("!")));
  const props = plan.waves.flatMap((wave) => wave.filter((id) => id.startsWith("!")).map((id) => id.slice(1)));

  const room: Room = {
    index, kind: plan.kind, biome: plan.biome, twist: plan.twist, doors: [], holdT: plan.twist === "hold" ? HOLD_S : 0, twistT: 2,
    waves, waveIdx: 0, waveTimer: 1.5, cleared: false, exitT: -1, vents,
  };
  w.run.room = room;

  w.players.forEach((p, i) => {
    p.pos = startPos(START, i, w.players.length);
    p.vel = { x: 0, y: 0 };
    p.knock = { x: 0, y: 0 };
    p.slowT = 0;
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

  for (const raw of props) {
    const { defId, elite } = parseElite(raw);
    spawnEnemy(w, defId, spawnPoint(w, 110), 0, elite);
  }

  if (plan.kind === "intro") {
    // Gun pedestals: try every archetype before the real fights start.
    for (const [defId, x] of [["smg", 280], ["sniper", 360], ["launcher", 440]] as const) {
      w.pickups.push({ id: newId(w), kind: "gun", pos: { x, y: START.y - 30 + (x === 360 ? 10 : 0) }, gun: { ...newGun(w, defId), loaner: true }, used: false });
    }
  }
  if (plan.kind === "rest") {
    // A breather: everyone gets half their health back, there's a snack, and a suitcase of guns.
    for (const p of w.players) healPlayer(w, p, p.maxHp * 0.5);
    w.pickups.push({ id: newId(w), kind: "chest", pos: { x: 360, y: 110 }, used: false });
    dropHeal(w, { x: 360, y: 180 }, 40);
  }
  if (plan.kind === "shrine") {
    // Two picks for everyone, from better offers than usual.
    w.pickups.push({ id: newId(w), kind: "shrine", pos: { x: 360, y: 100 }, used: true });
    offerBoosts(w, { x: 240, y: 300 }, 1);
    offerBoosts(w, { x: 480, y: 300 }, 1);
  }
  if (plan.kind === "rest" || plan.kind === "shrine") clearRoom(w, room);

  w.events.push({ type: "roomEnter", index, kind: plan.kind, act: plan.act });
}

/** Rewards for clearing a room, and the doors to what's next. */
function clearRoom(w: World, room: Room): void {
  room.cleared = true;
  w.events.push({ type: "roomCleared", index: room.index });
  const plan = w.run.plans[room.index]!;
  const mid = { x: 360, y: 230 };
  if (plan.kind === "combat" || plan.kind === "intro") offerBoosts(w, mid, 0);
  if (plan.kind === "event") offerBoosts(w, mid, 0.6);
  if (plan.kind === "elite") {
    offerBoosts(w, mid, 1.2);
    // And something shiny for everyone.
    w.players.forEach((p, i) => dropGun(w, { x: 300 + i * 40, y: 300 }, 0.9 + w.run.tier * 0.3 + partyLuck(w), "rare"));
  }
  if (plan.kind === "boss") {
    w.run.bosses++;
    offerBoosts(w, mid, 2);
    // Patch everyone up for the next act.
    for (const p of w.players) healPlayer(w, p, p.maxHp * 0.4);
    if (plan.act === FINAL_ACT && !w.run.finale) {
      w.run.finale = true;
      w.events.push({ type: "finale" });
    }
  }
  if (plan.kind !== "rest" && plan.kind !== "shrine") {
    // Hotel Mint: a little health back for every room cleared.
    for (const p of w.players) if (p.boosts.mint) healPlayer(w, p, p.maxHp * 0.15 * p.boosts.mint);
  }
  room.doors = planDoors(w);
}

/** Three boosts for each player to pick from, laid out around `at`. Only the owner sees and takes them. */
export function offerBoosts(w: World, near: Vec, quality: number): void {
  const at = openSpot(w, near);
  for (const p of w.players) {
    const group = newId(w);
    const offers = boostOffers(p, w.players, quality, () => rand(w));
    offers.forEach((boost, i) => {
      const pos = { x: at.x + (i - (offers.length - 1) / 2) * 36, y: at.y + (i === 1 ? -8 : 0) };
      w.pickups.push({ id: newId(w), kind: "boost", pos, boost, owner: p.id, group, used: false });
    });
  }
}

/** The spot nearest `near` with room for a row of three offers: clear of crates, spikes, traps, water and pads. */
function openSpot(w: World, near: Vec): Vec {
  const blocked = (c: Vec) =>
    [...w.arena.obstacles, ...w.arena.spikes, ...w.arena.water].some((o) => c.x > o.x - 66 && c.x < o.x + o.w + 66 && c.y > o.y - 22 && c.y < o.y + o.h + 22) ||
    w.run.room.vents.some((v) => (v.to ? trapDist(v, c) < v.radius + 22 : Math.abs(v.pos.x - c.x) < v.radius + 50 && Math.abs(v.pos.y - c.y) < v.radius + 14)) ||
    w.arena.pads.some((pd) => [pd.a, pd.b].some((at) => Math.abs(at.x - c.x) < PAD.radius + 50 && Math.abs(at.y - c.y) < PAD.radius + 14));
  for (let r = 0; r < 220; r += 12) {
    for (let k = 0; k < 12; k++) {
      const c = { x: clamp(near.x + Math.cos((k / 12) * Math.PI * 2) * r, 70, ARENA.w - 70), y: clamp(near.y + Math.sin((k / 12) * Math.PI * 2) * r * 0.7, 60, ARENA.h - 50) };
      if (!blocked(c)) return c;
      if (r === 0) break;
    }
  }
  return near;
}

function liveThreat(w: World): number {
  return w.enemies.reduce((sum, e) => (e.state === "hidden" ? sum : sum + Math.max(0.5, ENEMIES[e.defId]!.threatCost)), 0);
}

/** The door a player is standing in, or -1. */
export function doorAt(room: Room, p: Player): number {
  if (!room.cleared) return -1;
  return room.doors.findIndex((d) => p.pos.x > d.x - DOOR.w / 2 && p.pos.x < d.x + DOOR.w / 2 && p.pos.y < DOOR.h + p.radius + 4);
}

/**
 * Who wants which door: everyone who can act and is standing in one. The door with the most votes wins; a tie goes
 * to the host's pick (the first player), or else the leftmost tied door.
 */
export function doorVotes(w: World): { votes: number[]; winner: number } {
  const room = w.run.room;
  const votes = room.doors.map(() => 0);
  for (const p of w.players) {
    if (!canAct(p)) continue;
    const d = doorAt(room, p);
    if (d >= 0) votes[d]!++;
  }
  const best = Math.max(0, ...votes);
  if (best === 0) return { votes, winner: -1 };
  const tied = votes.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  const host = w.players[0];
  const hostDoor = host && canAct(host) ? doorAt(room, host) : -1;
  return { votes, winner: tied.includes(hostDoor) ? hostDoor : tied[0]! };
}

function goThrough(w: World, door: Door): void {
  if (door.kind === "home") {
    w.run.victory = true;
    w.events.push({ type: "victory" });
    return;
  }
  const { x: _x, ...spec } = door;
  enterRoom(w, { ...spec, kind: door.kind });
}

export function updateRoom(w: World): void {
  const run = w.run;
  const room = run.room;
  run.time += DT;
  updateVents(w, room);

  if (!room.cleared) {
    updateTwist(w, room);
    if (room.twist === "hold") {
      updateHold(w, room);
      return;
    }
    if (room.waveIdx < room.waves.length) {
      // The next wave arrives once the current one is nearly beaten, so fights flow into each other.
      // Rush Hour doesn't wait: the next wave comes on a clock.
      const ready = liveThreat(w) <= 2;
      if (ready || room.twist === "rush") {
        room.waveTimer -= DT;
        if (room.waveTimer <= 0) spawnWave(w, room);
      }
    } else if (w.enemies.every((e) => e.state === "hidden")) {
      clearRoom(w, room);
    }
    return;
  }

  if (run.victory) return;
  const up = w.players.filter(canAct);
  const { winner } = doorVotes(w);
  if (winner < 0) {
    room.exitT = -1;
    return;
  }
  // Everyone who can walk is at a door: go now. Otherwise give the stragglers a few seconds.
  const voting = up.filter((p) => doorAt(room, p) >= 0).length;
  if (voting === up.length) {
    goThrough(w, room.doors[winner]!);
    return;
  }
  if (room.exitT < 0) room.exitT = EXIT_WAIT_S;
  room.exitT -= DT;
  if (room.exitT <= 0) goThrough(w, room.doors[winner]!);
}

/** Per-tick twist rules that aren't about waves. */
function updateTwist(w: World, room: Room): void {
  if (room.twist !== "luggage" || room.waveIdx === 0) return;
  room.twistT -= DT;
  if (room.twistT > 0) return;
  room.twistT = LUGGAGE.every;
  // Mostly random spots, sometimes right where a player is heading.
  const up = w.players.filter(canAct);
  const aimed = up.length > 0 && rand(w) < 0.4 ? up[Math.floor(rand(w) * up.length)]! : undefined;
  const to = aimed
    ? { x: clamp(aimed.pos.x + aimed.vel.x * 0.5, 20, ARENA.w - 20), y: clamp(aimed.pos.y + aimed.vel.y * 0.5, 30, ARENA.h - 20) }
    : { x: randRange(w, 30, ARENA.w - 30), y: randRange(w, 40, ARENA.h - 30) };
  w.projectiles.push({
    id: newId(w), owner: "enemy", ownerId: 0, kind: "mortar", element: "none", pos: { x: to.x, y: to.y - 160 }, vel: { x: 0, y: 0 }, radius: 4,
    damage: LUGGAGE.damage, pierce: 0, bounces: 0, knockback: 0, life: 99, hitIds: [], gunUid: -1,
    lob: { from: { x: to.x, y: to.y - 160 }, to, t: 0, dur: LUGGAGE.flight, radius: LUGGAGE.radius },
  });
}

/** Hold the Line: spawns come on a clock until time runs out, then whatever's left gives up. */
function updateHold(w: World, room: Room): void {
  if (room.waveIdx === 0) {
    room.waveTimer -= DT;
    if (room.waveTimer <= 0) spawnWave(w, room);
    return;
  }
  room.holdT = Math.max(0, room.holdT - DT);
  if (room.holdT <= 0) {
    for (const e of w.enemies) {
      e.noLoot = true;
      w.events.push({ type: "enemyDied", x: e.pos.x, y: e.pos.y, id: e.id, defId: e.defId });
    }
    w.enemies = [];
    w.projectiles = w.projectiles.filter((pr) => pr.owner === "player");
    clearRoom(w, room);
    return;
  }
  room.twistT -= DT;
  if ((room.twistT <= 0 || liveThreat(w) <= 2) && w.enemies.length < MAX_ENEMIES - 8) {
    room.twistT = 6;
    // Cycle through the planned waves for as long as it takes.
    if (room.waveIdx >= room.waves.length) room.waveIdx = 0;
    spawnWave(w, room);
  }
}

function spawnWave(w: World, room: Room): void {
  const ids = room.waves[room.waveIdx]!;
  room.waveIdx++;
  room.waveTimer = room.twist === "rush" ? 7 : 1.2;
  w.events.push({ type: "waveStart", wave: room.waveIdx, waves: room.waves.length });

  let packCenter: Vec | undefined;
  const spawned: Enemy[] = [];
  // Ambush: everything arrives in a ring around the party.
  const ring = room.twist === "surrounded" ? partyCenter(w) : undefined;
  const list = ids.slice(0, Math.max(0, MAX_ENEMIES - w.enemies.length));
  list.forEach((raw, i) => {
    const { defId: id, elite } = parseElite(raw);
    const def = ENEMIES[id]!;
    const swarm = def.role === "swarmer";
    let pos: Vec;
    if (def.role === "boss") {
      // A duo of bosses stands side by side.
      const duo = list.length > 1;
      pos = { x: ARENA.w / 2 + (duo ? (i === 0 ? -110 : 110) : 0), y: 170 };
    } else if (ring) pos = ringPoint(w, ring, (i / list.length) * Math.PI * 2);
    else if (swarm && packCenter) pos = nearPoint(w, packCenter);
    else {
      pos = spawnPoint(w, 140);
      if (swarm) packCenter = pos;
    }
    const e = spawnEnemy(w, id, pos, 0.8 + i * 0.1, elite);
    // The final act's two bosses share the stage, so each brings a bit less.
    if (raw.endsWith("@duo")) e.hp = e.maxHp = Math.round(e.maxHp * 0.65);
    spawned.push(e);
  });
  linkPairs(spawned);
}

function partyCenter(w: World): Vec {
  const up = w.players.filter(canAct);
  if (up.length === 0) return { x: ARENA.w / 2, y: ARENA.h / 2 };
  return { x: up.reduce((s, p) => s + p.pos.x, 0) / up.length, y: up.reduce((s, p) => s + p.pos.y, 0) / up.length };
}

function ringPoint(w: World, c: Vec, a: number): Vec {
  for (let r = 120; r > 60; r -= 15) {
    const p = { x: clamp(c.x + Math.cos(a) * r, 24, ARENA.w - 24), y: clamp(c.y + Math.sin(a) * r, 30, ARENA.h - 24) };
    if (!insideArenaSolid(w, p) && w.players.every((pl) => dist(pl.pos, p) > 55)) return p;
  }
  return spawnPoint(w, 100);
}

function spawnPoint(w: World, minPlayerDist: number): Vec {
  for (let tries = 0; tries < 50; tries++) {
    const p = { x: randRange(w, 30, w.arena.w - 30), y: randRange(w, 40, w.arena.h - 30) };
    if (insideArenaSolid(w, p) || [...w.arena.obstacles, ...w.arena.spikes].some((o) => p.x > o.x - 12 && p.x < o.x + o.w + 12 && p.y > o.y - 12 && p.y < o.y + o.h + 12)) continue;
    if (w.players.some((pl) => dist(pl.pos, p) < minPlayerDist)) continue;
    if (w.run.room.vents.some((v) => trapDist(v, p) < v.radius + 12)) continue;
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

// ---------------------------------------------------------------- helpers for tests and dev shortcuts

/** A room of `kind` in the current act (or `act`), for jumping straight to it. */
export function roomSpec(w: World, kind: RoomKind, over: Partial<RoomSpec> = {}): RoomSpec {
  const here = w.run.plans[w.run.room.index] ?? firstRoom(w);
  const act = over.act ?? here.act;
  const biome = over.biome ?? (act === 0 ? w.run.biome : here.biome);
  return { kind, biome, twist: "", mix: false, act, step: kind === "boss" ? ACT_ROOMS : Math.min(ACT_ROOMS - 1, here.step + 1), ...over };
}

/** Names for the HUD and doors. */
export const ROOM_NAMES: Record<RoomKind | "home", string> = {
  intro: "Check-In",
  combat: "Fight",
  elite: "Elite Fight",
  event: "Event",
  shrine: "Shrine",
  rest: "Rest Stop",
  boss: "Boss",
  home: "Fly Home",
};


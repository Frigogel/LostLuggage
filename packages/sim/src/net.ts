// Wire format for co-op, shared by the server and the clients.
//
// The server runs the real sim and sends snapshots of it. A snapshot is plain arrays of small integers
// (positions in quarter pixels, timers in centiseconds), which msgpack packs into a few bytes each, so
// four phones on mobile data stay well under the bandwidth of a music stream. Clients decode a snapshot
// back into an ordinary `World`, so the renderer doesn't care whether it is drawing solo or co-op.

import { BIOME_IDS, ENEMIES } from "./data/enemies";
import { BOOST_IDS } from "./data/boosts";
import { TWIST_IDS } from "./director";
import { GRENADE_KINDS } from "./data/grenades";
import { GUNS } from "./data/guns";
import { HEROES } from "./data/heroes";
import { LEGENDARY_IDS } from "./data/legendaries";
import { MYTHIC_GUN_IDS } from "./data/mythics";
import { RELIC_KINDS } from "./data/relics";
import { MAKER_IDS } from "./data/makers";
import { SIGNATURE_IDS } from "./data/signatures";
import { ELITE_IDS } from "./elites";
import { PERKS, RARITIES } from "./loot";
import { clamp, fromAngle, angleOf, type Vec } from "./math";
import { EMPTY_INPUT } from "./players";
import type { Outfit } from "./data/cosmetics";
import type { Profile, RunReward } from "./progress";
import { arenaFor } from "./room";
import { ARENA } from "./room";
import type {
  Biome,
  BoostId,
  Door,
  DoorKind,
  Dome,
  Element,
  Enemy,
  EnemyState,
  Gadget,
  Grenade,
  Gun,
  Hazard,
  PerkId,
  Pickup,
  PickupKind,
  Player,
  PlayerInput,
  Projectile,
  Relic,
  RoomKind,
  RoomPlan,
  TwistId,
  TrapKind,
  SimEvent,
  Vent,
  World,
} from "./types";

/** The server sends a snapshot every this many ticks (30 Hz sim → 15 Hz snapshots). */
export const SNAPSHOT_EVERY = 2;

const ENEMY_IDS = Object.keys(ENEMIES);
const GUN_IDS = Object.keys(GUNS);
const HERO_IDS = Object.keys(HEROES);
const PERK_IDS = Object.keys(PERKS) as PerkId[];
const ELEMENT_IDS: Element[] = ["none", "fire", "shock", "frost", "acid"];
const STATES: EnemyState[] = ["move", "windup", "attack", "recover", "hidden", "reveal"];
const ROOM_KINDS: RoomKind[] = ["intro", "combat", "elite", "event", "shrine", "rest", "boss"];
const DOOR_KINDS: DoorKind[] = [...ROOM_KINDS, "home"];
const TWISTS: TwistId[] = ["", ...TWIST_IDS];
const PICKUP_KINDS: PickupKind[] = ["gun", "heal", "shrine", "chest", "boost", "grenade", "relic"];
const PROJ_KINDS = ["pistol", "shotgun", "smg", "sniper", "launcher", "grenade", "mortar", "acid", "bolt", "rocket", "turret", "doom", "slush", "page"];
const HAZARD_KINDS: Hazard["kind"][] = ["acid", "fire", "ice", "wave", "rewind"];
const TRAP_KINDS: TrapKind[] = ["vent", "pipe", "laser"];

const POS = 4; // quarter pixels
const T = 100; // centiseconds

const q = (v: number, s: number): number => Math.round(v * s);
const qa = (a: number): number => Math.round(a * 1000);
const dqa = (n: number): Vec => fromAngle(n / 1000);
const idx = <T>(list: readonly T[], v: T): number => Math.max(0, list.indexOf(v));
const b = (v: boolean): number => (v ? 1 : 0);

export interface Snapshot {
  /** World tick. */
  t: number;
  /** Last input sequence the server applied for each player: [playerId, seq, playerId, seq, ...]. */
  a: number[];
  /** Run and room numbers, see encodeRun. */
  r: number[];
  /** Rooms so far: [kind, layout, act, step, biome, twist] each. */
  pl: number[];
  /** Doors out of the room: [x, kind, twist, biome, act, step] each. */
  dr: number[][];
  v: number[][];
  /** Drowned Crypt candles: [x, y, seconds left burning] each. */
  c: number[][];
  p: unknown[][];
  /** Enemies: plain numbers, with one nested array (or 0) for elite and status extras. */
  e: (number | number[])[][];
  j: number[][];
  d: number[][];
  /** Gadgets: turrets and drones. */
  g: number[][];
  h: number[][];
  k: unknown[][];
  /** Every sim event since the previous snapshot, oldest first. */
  ev: unknown[][];
}

// ---------------------------------------------------------------- guns

/** [uid, gun, element, rarity, perks, pips, maker, legendary or -1, loaner, mythic or -1]. */
type GunWire = [number, number, number, number, number[], number, number, number, number, number];

const encodeGun = (g: Gun): GunWire => [
  g.uid, idx(GUN_IDS, g.defId), idx(ELEMENT_IDS, g.element), idx(RARITIES, g.rarity), g.perks.map((p) => idx(PERK_IDS, p)), q(g.pips, T),
  idx(MAKER_IDS, g.maker), g.legendary ? LEGENDARY_IDS.indexOf(g.legendary) : -1, b(!!g.loaner), g.mythic ? MYTHIC_GUN_IDS.indexOf(g.mythic) : -1,
];

function decodeGun(a: GunWire): Gun {
  const g: Gun = {
    uid: a[0],
    defId: GUN_IDS[a[1]] ?? "pistol",
    element: ELEMENT_IDS[a[2]] ?? "none",
    rarity: RARITIES[a[3]] ?? "common",
    perks: a[4].map((i) => PERK_IDS[i]!).filter(Boolean),
    pips: a[5] / T,
    maker: MAKER_IDS[a[6]] ?? "cruise",
  };
  const leg = LEGENDARY_IDS[a[7]];
  if (leg) g.legendary = leg;
  if (a[8]) g.loaner = true;
  const myth = MYTHIC_GUN_IDS[a[9]];
  if (myth) g.mythic = myth;
  return g;
}

// ---------------------------------------------------------------- grenades

/** [kind, rarity]. */
type GrenadeWire = [number, number];

const encodeGrenade = (g: Grenade): GrenadeWire => [idx(GRENADE_KINDS, g.defId), idx(RARITIES, g.rarity)];
const decodeGrenade = (a: GrenadeWire): Grenade => ({ defId: GRENADE_KINDS[a[0]] ?? "frag", rarity: RARITIES[a[1]] ?? "common" });

// ---------------------------------------------------------------- relics

/** [kind, rarity]. */
type RelicWire = [number, number];

const encodeRelic = (r: Relic): RelicWire => [idx(RELIC_KINDS, r.defId), idx(RARITIES, r.rarity)];
const decodeRelic = (a: RelicWire): Relic => ({ defId: RELIC_KINDS[a[0]] ?? "neck_pillow", rarity: RARITIES[a[1]] ?? "common" });

// ---------------------------------------------------------------- players

function encodePlayer(p: Player): unknown[] {
  const boosts = Object.entries(p.boosts).flatMap(([id, n]) => [idx(BOOST_IDS, id as BoostId), n ?? 0]);
  return [
    p.id, idx(HERO_IDS, p.heroId), p.name, p.slot, p.level, p.syncLevel, b(p.away),
    q(p.pos.x, POS), q(p.pos.y, POS), Math.round(p.vel.x), Math.round(p.vel.y),
    q(p.hp, 10), p.maxHp, qa(angleOf(p.facing)), p.guns.map(encodeGun), p.active,
    q(p.shotCd, T), p.burstLeft, b(p.charging), q(p.chargeT, T),
    q(p.dashT, T), q(p.dashCd, T), qa(angleOf(p.dashDir)), q(p.iframes, T), q(p.hurtT, T),
    q(p.skillCharge, 1000), q(p.grenadeCd, T), b(p.downed), p.reviveT === Infinity ? -1 : q(p.reviveT, T),
    q(p.reviveProgress, 1000), p.selfRevives, boosts, q(p.streakT, T),
    // Souvenir mods the client's movement prediction needs.
    q(p.mods.speed, 1000), q(p.mods.dashCd, 1000),
    SIGNATURE_IDS.indexOf(p.signature), q(p.shield, 10), Math.round(p.knock.x), Math.round(p.knock.y), q(p.slowT, T),
    encodeGrenade(p.grenade), p.pinnedBy, q(p.freeProgress, 100), p.relic ? encodeRelic(p.relic) : 0,
  ];
}

function decodePlayer(a: unknown[]): Player {
  const n = (i: number) => a[i] as number;
  const heroId = HERO_IDS[n(1)] ?? "vanguard";
  const boostsFlat = a[31] as number[];
  const boosts: Player["boosts"] = {};
  for (let i = 0; i < boostsFlat.length; i += 2) boosts[BOOST_IDS[boostsFlat[i]!]!] = boostsFlat[i + 1]!;
  const relic = Array.isArray(a[43]) ? decodeRelic(a[43] as RelicWire) : undefined;
  return {
    id: n(0),
    heroId,
    name: a[2] as string,
    slot: n(3),
    level: n(4),
    syncLevel: n(5),
    away: n(6) === 1,
    pos: { x: n(7) / POS, y: n(8) / POS },
    vel: { x: n(9), y: n(10) },
    radius: HEROES[heroId]!.radius,
    hp: n(11) / 10,
    maxHp: n(12),
    facing: dqa(n(13)),
    guns: (a[14] as GunWire[]).map(decodeGun),
    active: n(15),
    shotCd: n(16) / T,
    burstLeft: n(17),
    burstT: 0,
    shotAim: { x: 1, y: 0 },
    charging: n(18) === 1,
    chargeT: n(19) / T,
    dashT: n(20) / T,
    dashCd: n(21) / T,
    dashDir: dqa(n(22)),
    iframes: n(23) / T,
    hurtT: n(24) / T,
    skillCharge: n(25) / 1000,
    grenade: decodeGrenade(a[40] as GrenadeWire),
    grenadeCd: n(26) / T,
    downed: n(27) === 1,
    reviveT: n(28) < 0 ? Infinity : n(28) / T,
    reviveProgress: n(29) / 1000,
    selfRevives: n(30),
    boosts,
    streakT: n(32) / T,
    skills: [],
    mods: { damage: 1, speed: n(33) / 1000, dashCd: n(34) / 1000, charge: 1, luck: 0, offerQuality: 0, extraOffer: 0 },
    panicUsed: false,
    signature: SIGNATURE_IDS[n(35)] ?? "",
    shield: n(36) / 10,
    knock: { x: n(37), y: n(38) },
    slowT: n(39) / T,
    holsterCd: 0,
    markHits: 0,
    pinnedBy: (a[41] as number | undefined) ?? 0,
    freeProgress: ((a[42] as number | undefined) ?? 0) / 100,
    ...(relic ? { relic } : {}),
  };
}

// ---------------------------------------------------------------- enemies

function encodeEnemy(e: Enemy): (number | number[])[] {
  const s = e.status;
  return [
    e.id, idx(ENEMY_IDS, e.defId), q(e.pos.x, POS), q(e.pos.y, POS), Math.round(e.vel.x), Math.round(e.vel.y),
    q(Math.max(0, e.hp), 10), e.maxHp, q(e.shield, 10), idx(STATES, e.state), q(e.stateT, T), e.attackIdx,
    qa(angleOf(e.attackDir)), q(e.hitFlash, T), q(e.spawnT, T), q(s.burnT, T), q(s.frost, 10), q(s.frozenT, T), q(s.acidT, T), e.phase,
    encodeExtras(e),
    ...e.attackPoints.flatMap((p) => [q(p.x, POS), q(p.y, POS)]),
  ];
}

/** Elites, marks, stuns, sleep, slows and split copies, or just 0 for the plain enemies that make up most of a room. */
function encodeExtras(e: Enemy): number[] | 0 {
  if (!e.elite && e.size === 1 && e.stunT <= 0 && e.sleepT <= 0 && !e.lost && e.dutyT <= 0 && e.markT <= 0 && e.slow <= 0) return 0;
  return [
    e.elite ? ELITE_IDS.indexOf(e.elite) + 1 : 0, q(e.size, 100), q(e.stunT, T), q(e.markT, T), e.markBy, qa(angleOf(e.facing)),
    e.link, q(e.linkT, T), e.blinkTo ? q(e.blinkTo.x, POS) : -1, e.blinkTo ? q(e.blinkTo.y, POS) : -1, q(e.slow, 100), q(e.guard, 1), q(e.sleepT, T), b(e.lost), q(e.dutyT, T),
  ];
}

/** Where an enemy's attack points start on the wire. */
const ENEMY_POINTS = 21;

function decodeEnemy(raw: (number | number[])[]): Enemy {
  const x = (Array.isArray(raw[20]) ? raw[20] : [0, 100, 0, 0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0]) as number[];
  const a = raw.map((v) => (Array.isArray(v) ? 0 : v));
  const defId = ENEMY_IDS[a[1]!] ?? "cone_rat";
  const points: Vec[] = [];
  for (let i = ENEMY_POINTS; i + 1 < a.length; i += 2) points.push({ x: a[i]! / POS, y: a[i + 1]! / POS });
  const size = x[1]! / 100;
  const e: Enemy = {
    id: a[0]!,
    defId,
    pos: { x: a[2]! / POS, y: a[3]! / POS },
    vel: { x: a[4]!, y: a[5]! },
    knock: { x: 0, y: 0 },
    radius: Math.max(4, Math.round(ENEMIES[defId]!.radius * size)),
    hp: a[6]! / 10,
    maxHp: a[7]!,
    shield: a[8]! / 10,
    state: STATES[a[9]!] ?? "move",
    stateT: a[10]! / T,
    attackIdx: a[11]!,
    cooldowns: [],
    attackDir: dqa(a[12]!),
    attackPoints: points,
    hitPlayers: [],
    hitFlash: a[13]! / T,
    spawnT: a[14]! / T,
    steer: 0,
    strafe: 1,
    status: { burnT: a[15]! / T, burnDps: 0, burnSource: 0, burnTick: 0, frost: a[16]! / 10, frozenT: a[17]! / T, acidT: a[18]! / T },
    trailT: 0,
    parentId: 0,
    phase: a[19]!,
    size,
    noLoot: false,
    stunT: x[2]! / T,
    sleepT: (x[12] ?? 0) / T,
    lost: x[13] === 1,
    dutyT: (x[14] ?? 0) / T,
    slowT: x[10]! > 0 ? 0.1 : 0,
    slow: x[10]! / 100,
    markT: x[3]! / T,
    markBy: x[4]!,
    taunt: 0,
    guard: x[11]!,
    facing: dqa(x[5]!),
    link: x[6]!,
    linkT: x[7]! / T,
    blinkT: 0,
    burst: 0,
    dodgeT: 0,
  };
  const elite = ELITE_IDS[x[0]! - 1];
  if (elite) e.elite = elite;
  if (x[8]! >= 0) e.blinkTo = { x: x[8]! / POS, y: x[9]! / POS };
  return e;
}

const GADGET_KINDS: Gadget["kind"][] = ["turret", "drone", "ghost"];

/** [id, kind, owner, x, y, t, maxT, hp, maxHp, element, mini, ghost's enemy or -1]. */
const encodeGadget = (g: Gadget): number[] => [
  g.id, idx(GADGET_KINDS, g.kind), g.ownerId, q(g.pos.x, POS), q(g.pos.y, POS), q(g.t, T), q(g.maxT, T), Math.max(0, Math.round(g.hp)), Math.round(g.maxHp), idx(ELEMENT_IDS, g.element), b(g.mini),
  g.defId ? ENEMY_IDS.indexOf(g.defId) : -1,
];
function decodeGadget(a: number[]): Gadget {
  const g: Gadget = {
    id: a[0]!, kind: GADGET_KINDS[a[1]!] ?? "turret", ownerId: a[2]!, pos: { x: a[3]! / POS, y: a[4]! / POS }, t: a[5]! / T, maxT: a[6]! / T, hp: a[7]!, maxHp: a[8]!,
    element: ELEMENT_IDS[a[9]!] ?? "none", fireCd: 0, tickT: 0, mini: a[10] === 1, saved: false,
  };
  const defId = ENEMY_IDS[a[11] ?? -1];
  if (defId) g.defId = defId;
  return g;
}

// ---------------------------------------------------------------- projectiles, domes, hazards, vents, pickups

function encodeProjectile(p: Projectile): number[] {
  const out = [
    p.id, b(p.owner === "enemy") | (b(!!p.special) << 1), p.ownerId, idx(PROJ_KINDS, p.kind), idx(ELEMENT_IDS, p.element),
    q(p.pos.x, POS), q(p.pos.y, POS), Math.round(p.vel.x), Math.round(p.vel.y), p.radius, p.bounces,
  ];
  const l = p.lob;
  if (l) out.push(q(l.from.x, POS), q(l.from.y, POS), q(l.to.x, POS), q(l.to.y, POS), q(l.t, T), q(l.dur, T), l.radius, b(!!l.puddle));
  return out;
}

function decodeProjectile(a: number[]): Projectile {
  const pr: Projectile = {
    id: a[0]!,
    owner: a[1]! & 1 ? "enemy" : "player",
    ownerId: a[2]!,
    kind: PROJ_KINDS[a[3]!] ?? "pistol",
    element: ELEMENT_IDS[a[4]!] ?? "none",
    pos: { x: a[5]! / POS, y: a[6]! / POS },
    vel: { x: a[7]!, y: a[8]! },
    radius: a[9]!,
    damage: 0,
    pierce: 0,
    bounces: a[10]!,
    knockback: 0,
    life: 1,
    hitIds: [],
    gunUid: -1,
  };
  if (a[1]! & 2) pr.special = true;
  if (a.length > 11) {
    pr.lob = {
      from: { x: a[11]! / POS, y: a[12]! / POS },
      to: { x: a[13]! / POS, y: a[14]! / POS },
      t: a[15]! / T,
      dur: a[16]! / T,
      radius: a[17]!,
      // Only its presence matters to the renderer.
      puddle: a[18] ? { radius: 0, durationMs: 0, damage: 0 } : undefined,
    };
  }
  return pr;
}

const encodeDome = (d: Dome): number[] => [d.id, d.ownerId, q(d.pos.x, POS), q(d.pos.y, POS), Math.round(d.radius), q(d.t, T), q(d.maxT, T)];
const decodeDome = (a: number[]): Dome => ({ id: a[0]!, ownerId: a[1]!, pos: { x: a[2]! / POS, y: a[3]! / POS }, radius: a[4]!, t: a[5]! / T, maxT: a[6]! / T, tickT: 0, bonus: 0 });

const encodeHazard = (h: Hazard): number[] => [h.id, idx(HAZARD_KINDS, h.kind), b(h.owner === "enemy"), q(h.pos.x, POS), q(h.pos.y, POS), h.radius, q(h.t, T), q(h.maxT, T)];
const decodeHazard = (a: number[]): Hazard => ({
  id: a[0]!, kind: HAZARD_KINDS[a[1]!] ?? "acid", owner: a[2] ? "enemy" : "player", pos: { x: a[3]! / POS, y: a[4]! / POS }, radius: a[5]!, t: a[6]! / T, maxT: a[7]! / T, damage: 0,
});

/** [id, x, y, radius, period, warn, erupt, t, kind, and for lanes: toX, toY]. */
const encodeVent = (v: Vent): number[] => [
  v.id, v.pos.x, v.pos.y, v.radius, q(v.periodS, T), q(v.warnS, T), q(v.eruptS, T), q(v.t, T), idx(TRAP_KINDS, v.kind), ...(v.to ? [v.to.x, v.to.y] : []),
];
function decodeVent(a: number[]): Vent {
  const v: Vent = {
    id: a[0]!, kind: TRAP_KINDS[a[8]!] ?? "vent", pos: { x: a[1]!, y: a[2]! }, radius: a[3]!, periodS: a[4]! / T, warnS: a[5]! / T, eruptS: a[6]! / T, t: a[7]! / T, damage: 0,
  };
  if (a.length > 10) v.to = { x: a[9]!, y: a[10]! };
  return v;
}

function encodePickup(p: Pickup): unknown[] {
  const extra =
    p.kind === "gun" && p.gun ? encodeGun(p.gun) : p.kind === "grenade" && p.grenade ? encodeGrenade(p.grenade) : p.kind === "relic" && p.relic ? encodeRelic(p.relic) : p.kind === "boost" && p.boost ? [idx(BOOST_IDS, p.boost), p.owner ?? -1, p.group ?? 0] : p.kind === "shrine" && p.boost ? idx(BOOST_IDS, p.boost) : (p.heal ?? 0);
  return [p.id, idx(PICKUP_KINDS, p.kind), q(p.pos.x, POS), q(p.pos.y, POS), b(p.used), extra];
}

function decodePickup(a: unknown[]): Pickup {
  const kind = PICKUP_KINDS[a[1] as number] ?? "heal";
  const pk: Pickup = { id: a[0] as number, kind, pos: { x: (a[2] as number) / POS, y: (a[3] as number) / POS }, used: a[4] === 1 };
  if (kind === "gun") pk.gun = decodeGun(a[5] as GunWire);
  else if (kind === "grenade") pk.grenade = decodeGrenade(a[5] as GrenadeWire);
  else if (kind === "relic") pk.relic = decodeRelic(a[5] as RelicWire);
  else if (kind === "shrine") pk.boost = BOOST_IDS[a[5] as number];
  else if (kind === "boost") {
    const [boost, owner, group] = a[5] as number[];
    pk.boost = BOOST_IDS[boost!];
    if (owner! >= 0) pk.owner = owner;
    pk.group = group;
  }
  else if (kind === "heal") pk.heal = a[5] as number;
  return pk;
}

// ---------------------------------------------------------------- events

type EventKeys = { [K in SimEvent["type"]]: readonly Exclude<keyof Extract<SimEvent, { type: K }>, "type">[] };

/** Field order for each event type on the wire. A test round-trips every type so this can't silently drift. */
const EVENT_KEYS: EventKeys = {
  shot: ["playerId", "x", "y", "angle", "archetype", "element"],
  charge: ["playerId"],
  hit: ["x", "y", "targetId", "damage", "kill", "element", "weak", "shield"],
  enemyDied: ["x", "y", "id", "defId"],
  explosion: ["x", "y", "radius", "owner", "element"],
  chain: ["x1", "y1", "x2", "y2"],
  frozen: ["id"],
  shieldUp: ["id"],
  shieldBroken: ["id", "x", "y"],
  blocked: ["x", "y"],
  domePulse: ["id", "x", "y", "radius"],
  reflect: ["x", "y"],
  spark: ["x", "y"],
  enemyWindup: ["id", "attack"],
  enemyAttack: ["id", "attack"],
  reveal: ["id"],
  split: ["id", "x", "y"],
  bossPhase: ["id", "phase"],
  bonk: ["id", "x", "y"],
  ventWarn: ["id"],
  ventErupt: ["id", "x", "y"],
  playerHurt: ["id", "damage"],
  spiked: ["x", "y"],
  warp: ["id", "x1", "y1", "x2", "y2"],
  surface: ["id", "x", "y"],
  mark: ["id", "by"],
  crit: ["x", "y"],
  gadget: ["id", "kind", "x", "y", "gone"],
  gadgetHit: ["id"],
  saved: ["id"],
  blink: ["id", "x", "y", "done"],
  relink: ["id"],
  deflect: ["x", "y"],
  grabbed: ["id", "by"],
  freed: ["id", "by"],
  candleLit: ["x", "y"],
  blackout: ["id"],
  confiscate: ["id", "x", "y"],
  asleep: ["id"],
  rewound: ["id", "by"],
  misplaced: ["id", "x", "y"],
  found: ["id"],
  swapped: ["id", "other", "x1", "y1", "x2", "y2"],
  playerDowned: ["id", "canRevive"],
  secondWind: ["id"],
  playerRevived: ["id", "by"],
  playerJoined: ["id"],
  playerLeft: ["id"],
  dash: ["id"],
  skill: ["id", "x", "y"],
  grenade: ["id"],
  swap: ["id"],
  pickup: ["id", "gun"],
  grenadePickup: ["id", "grenade"],
  relicPickup: ["id", "relic"],
  vest: ["id"],
  clock: ["x", "y", "radius"],
  loot: ["x", "y", "rarity"],
  heal: ["id", "amount"],
  shrine: ["id", "boost"],
  chestOpened: ["x", "y"],
  enemySpawn: ["id"],
  waveStart: ["wave", "waves"],
  roomCleared: ["index"],
  roomEnter: ["index", "kind", "act"],
  finale: [],
  bossCall: ["id", "attack"],
  victory: [],
  gameOver: [],
};
const EVENT_TYPES = Object.keys(EVENT_KEYS) as SimEvent["type"][];
/** Keys rounded to whole pixels on the wire; angles keep three decimals. Everything else is sent as is. */
const ROUNDED = new Set(["x", "y", "x1", "y1", "x2", "y2", "radius", "amount", "damage"]);

export function encodeEvent(ev: SimEvent): unknown[] {
  const rec = ev as unknown as Record<string, unknown>;
  const keys = EVENT_KEYS[ev.type] as readonly string[];
  return [
    EVENT_TYPES.indexOf(ev.type),
    ...keys.map((k) => {
      const v = rec[k];
      if (k === "angle") return qa(v as number);
      if (k === "gun") return encodeGun(v as Gun);
      if (k === "grenade") return encodeGrenade(v as Grenade);
      if (k === "relic") return encodeRelic(v as Relic);
      return ROUNDED.has(k) ? Math.round(v as number) : v;
    }),
  ];
}

export function decodeEvent(a: unknown[]): SimEvent | undefined {
  const type = EVENT_TYPES[a[0] as number];
  if (!type) return undefined;
  const ev: Record<string, unknown> = { type };
  (EVENT_KEYS[type] as readonly string[]).forEach((k, i) => {
    const v = a[i + 1];
    ev[k] = k === "angle" ? (v as number) / 1000 : k === "gun" ? decodeGun(v as GunWire) : k === "grenade" ? decodeGrenade(v as GrenadeWire) : k === "relic" ? decodeRelic(v as RelicWire) : v;
  });
  return ev as unknown as SimEvent;
}

// ---------------------------------------------------------------- whole snapshots

/** `events` are all sim events since the last snapshot; `acks` maps player id → last applied input seq. */
export function encodeSnapshot(w: World, events: readonly SimEvent[], acks: ReadonlyMap<number, number>): Snapshot {
  const run = w.run;
  const room = run.room;
  return {
    t: w.tick,
    a: [...acks].flat(),
    r: [
      room.index, idx(ROOM_KINDS, room.kind), room.waveIdx, room.waves.length, b(room.cleared), room.exitT < 0 ? -1 : q(room.exitT, 10),
      b(run.victory), b(w.gameOver), run.kills, run.gunsFound, q(run.time, 10), run.tier, b(run.coop), idx(BIOME_IDS, run.biome),
      b(run.finale), run.bosses, idx(BIOME_IDS, room.biome), idx(TWISTS, room.twist), q(room.holdT, 10), q(room.blackoutT, 10),
    ],
    pl: run.plans.flatMap((p) => [idx(ROOM_KINDS, p.kind), p.layout, p.act, p.step, idx(BIOME_IDS, p.biome), idx(TWISTS, p.twist)]),
    dr: room.doors.map((d) => [d.x, idx(DOOR_KINDS, d.kind), idx(TWISTS, d.twist), idx(BIOME_IDS, d.biome), d.act, d.step]),
    v: room.vents.map(encodeVent),
    c: room.candles.map((c) => [c.pos.x, c.pos.y, q(c.litT, 10)]),
    p: w.players.map(encodePlayer),
    e: w.enemies.map(encodeEnemy),
    j: w.projectiles.map(encodeProjectile),
    d: w.domes.map(encodeDome),
    g: w.gadgets.map(encodeGadget),
    h: w.hazards.map(encodeHazard),
    k: w.pickups.map(encodePickup),
    ev: events.map(encodeEvent),
  };
}

/** Rebuilds a renderable World from a snapshot. Server-only details (RNG, cooldowns, damage numbers) are left blank. */
export function decodeSnapshot(s: Snapshot): { world: World; events: SimEvent[]; acks: Map<number, number> } {
  const r = s.r;
  const plans: RoomPlan[] = [];
  for (let i = 0; i + 5 < s.pl.length; i += 6) {
    plans.push({
      kind: ROOM_KINDS[s.pl[i]!] ?? "combat", layout: s.pl[i + 1]!, act: s.pl[i + 2]!, step: s.pl[i + 3]!, biome: BIOME_IDS[s.pl[i + 4]!] ?? "foundry",
      twist: TWISTS[s.pl[i + 5]!] ?? "", waves: [], party: 0,
    });
  }
  const index = r[0]!;
  const twist = TWISTS[r[17]!] ?? "";
  const doors: Door[] = (s.dr ?? []).map((d) => ({
    x: d[0]!, kind: DOOR_KINDS[d[1]!] ?? "combat", twist: TWISTS[d[2]!] ?? "", biome: BIOME_IDS[d[3]!] ?? "foundry", act: d[4]!, step: d[5]!,
  }));
  const world: World = {
    tick: s.t,
    time: s.t / 30,
    seed: 0,
    nextId: 0,
    arena: { w: ARENA.w, h: ARENA.h, ...arenaFor(plans[index]?.layout ?? 0, twist) },
    players: s.p.map(decodePlayer),
    enemies: s.e.map(decodeEnemy),
    projectiles: s.j.map(decodeProjectile),
    domes: s.d.map(decodeDome),
    gadgets: (s.g ?? []).map(decodeGadget),
    hazards: s.h.map(decodeHazard),
    pickups: s.k.map(decodePickup),
    run: {
      biome: BIOME_IDS[r[13]!] ?? "foundry",
      order: [],
      plans,
      room: {
        index,
        kind: ROOM_KINDS[r[1]!] ?? "combat",
        biome: BIOME_IDS[r[16]!] ?? "foundry",
        twist,
        doors,
        holdT: r[18]! / 10,
        twistT: 0,
        waveIdx: r[2]!,
        waves: Array.from({ length: r[3]! }, () => []),
        waveTimer: 0,
        cleared: r[4] === 1,
        exitT: r[5]! < 0 ? -1 : r[5]! / 10,
        vents: s.v.map(decodeVent),
        candles: (s.c ?? []).map((c) => ({ pos: { x: c[0]!, y: c[1]! }, litT: c[2]! / 10 })),
        blackoutT: (r[19] ?? 0) / 10,
      },
      tier: r[11]!,
      coop: r[12] === 1,
      kills: r[8]!,
      gunsFound: r[9]!,
      time: r[10]! / 10,
      victory: r[6] === 1,
      finale: r[14] === 1,
      bosses: r[15]!,
    },
    events: [],
    gameOver: r[7] === 1,
  };
  const acks = new Map<number, number>();
  for (let i = 0; i + 1 < s.a.length; i += 2) acks.set(s.a[i]!, s.a[i + 1]!);
  const events = s.ev.map(decodeEvent).filter((e): e is SimEvent => !!e);
  return { world, events, acks };
}

// ---------------------------------------------------------------- input

const FLAGS = ["fire", "autoAim", "dash", "skill", "grenade", "swap", "interact"] as const;

/** One tick of input from a client: [seq, moveX, moveY, aimX, aimY, flags, grenadeX, grenadeY]. */
export function encodeInput(seq: number, inp: PlayerInput): number[] {
  let flags = 0;
  FLAGS.forEach((f, i) => {
    if (inp[f]) flags |= 1 << i;
  });
  return [seq, q(inp.move.x, 100), q(inp.move.y, 100), Math.round(inp.aim.x), Math.round(inp.aim.y), flags, Math.round(inp.grenadeAim.x), Math.round(inp.grenadeAim.y)];
}

/** Decodes untrusted input from the network: anything malformed becomes "do nothing". */
export function decodeInput(a: unknown): { seq: number; input: PlayerInput } | undefined {
  if (!Array.isArray(a) || a.length < 8) return undefined;
  const n = (i: number, lim: number) => {
    const v = Number(a[i]);
    return Number.isFinite(v) ? clamp(v, -lim, lim) : 0;
  };
  const seq = Number(a[0]);
  if (!Number.isSafeInteger(seq)) return undefined;
  const flags = n(5, 1 << FLAGS.length);
  const input: PlayerInput = {
    ...EMPTY_INPUT,
    move: { x: n(1, 100) / 100, y: n(2, 100) / 100 },
    aim: { x: n(3, 2000), y: n(4, 2000) },
    grenadeAim: { x: n(6, 2000), y: n(7, 2000) },
  };
  FLAGS.forEach((f, i) => {
    input[f] = (flags & (1 << i)) !== 0;
  });
  return { seq, input };
}

// ---------------------------------------------------------------- room protocol

/** Sent when creating a room. */
export interface RoomOptions {
  /** Code-only room for friends, hidden from quick match. */
  private?: boolean;
  /** Difficulty tier, 0 = Normal. */
  tier?: number;
  /** Which adventure the room runs. */
  biome?: Biome;
}

/** Sent when joining. */
export interface JoinOptions {
  name?: string;
  /** Guests only (development): accounts use their saved hero. */
  level?: number;
  /** Guests only: which hero to play. Accounts use their saved hero. */
  heroId?: string;
  /** Account session token: the server loads your hero, loadout and skills, and saves your rewards. */
  token?: string;
  /** Guests only: what to wear (starter cosmetics). Accounts wear their saved outfit. */
  outfit?: Partial<Outfit>;
}

/** Sent as "reward" to each account when its run ends (or when it leaves a run early). */
export interface RewardInfo {
  runId: number;
  reward: RunReward;
  /** The account's profile after the reward. */
  profile: Profile;
}

export interface SeatInfo {
  sessionId: string;
  name: string;
  level: number;
  heroId: string;
  /** The sim player this seat drives, or -1 before the run starts. */
  playerId: number;
  connected: boolean;
  outfit: Outfit;
}

/** Broadcast as "emote" when someone in the room plays one. */
export interface EmoteInfo {
  sessionId: string;
  emote: string;
}

/** Broadcast as "lobby" whenever the party or the run changes. */
export interface LobbyInfo {
  code: string;
  /** Session id of the host, who starts runs. */
  host: string;
  tier: number;
  biome: Biome;
  /** Goes up every time a run starts. */
  runId: number;
  running: boolean;
  seats: SeatInfo[];
}

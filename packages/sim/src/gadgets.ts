// Things heroes put on the field: the Tinker's turrets and the Warden's owl drone, with the skill nodes and signature
// powers that change them.
import { confine, damageEnemy, DT, healPlayer, nearestEnemy, newId, playerExplosion, skillDamage, targetable } from "./combat";
import { ENEMIES } from "./data/enemies";
import { HEROES, REVIVE } from "./data/heroes";
import { MYTHIC } from "./data/mythics";
import { add, angleOf, dist, fromAngle, len, norm, rand, scale, sub, type Vec } from "./math";
import { canAct, hasSkill, revive } from "./players";
import type { Enemy, Gadget, HeroSkill, Player, World } from "./types";

/** Projectiles fired by turrets carry this gun uid, so kills can be credited to the turret. */
export const TURRET_GUN = -3;
/** Ghost bites carry this gun uid, so a ghost's kills don't raise more ghosts. */
export const GHOST_GUN = -4;

export const TURRET = {
  /** How far in front of you the turret lands. */
  offset: 14,
  radius: 6,
  speed: 260,
  tape: 4,
  overclock: 1 / 1.5,
  recycle: 0.2,
  army: { chance: 0.25, seconds: 5, max: 4, hpFrac: 0.4 },
  taunt: 80,
  doorstop: 0.6,
  spite: 8,
  magnet: { range: 50, turn: 7 },
  boom: { radius: 40, damage: 30, bomblets: 3, nuke: 1.6, pull: 90 },
  hazard: { patches: 4, seconds: 3, damage: 4 },
  /** Turret With Legs signature. */
  walker: { speed: 40, keep: 50, hp: 1.5, slower: 1.3 },
  /** Patio Heater signature: short fiery bursts. */
  heater: { pellets: 3, spreadDeg: 40, range: 75, fireMs: 260, damage: 4 },
};

export const DRONE = {
  follow: { x: -10, y: -14 },
  speed: 160,
  hunt: 130,
  /** Owl Ambulance: how far from you the owl will fly to a downed teammate. */
  ambulance: 150,
  zap: { reach: 30, damage: 7 },
  raptor: { range: 150, radius: 26, damage: 45 },
  hug: { radius: 80, amount: 25 },
  longer: 4,
  /** Owl Parliament signature: three small owls orbiting you. */
  flock: { count: 3, orbit: 26, spin: 2.2, share: 0.4 },
  /** Rescue Owl signature: picks up the party at once, then only slows. */
  rescue: { radius: 90, heal: 30, hpFrac: 0.5 },
};

type TurretSkill = Extract<HeroSkill, { type: "turret" }>;
type DroneSkill = Extract<HeroSkill, { type: "drone" }>;
const TURRET_DEFAULT: TurretSkill = { type: "turret", durationMs: 10000, hp: 90, range: 160, fireMs: 450, damage: 7 };
const DRONE_DEFAULT: DroneSkill = { type: "drone", durationMs: 8000, radius: 60, heal: 6, slow: 0.35 };

function turretSkill(p: Player): TurretSkill {
  const s = HEROES[p.heroId]?.skill;
  return s?.type === "turret" ? s : TURRET_DEFAULT;
}
function droneSkill(p: Player): DroneSkill {
  const s = HEROES[p.heroId]?.skill;
  return s?.type === "drone" ? s : DRONE_DEFAULT;
}

const ownerOf = (w: World, g: Gadget): Player | undefined => w.players.find((p) => p.id === g.ownerId);

function makeGadget(w: World, kind: Gadget["kind"], p: Player, pos: Vec, seconds: number, hp: number, mini = false): Gadget {
  const g: Gadget = {
    id: newId(w), kind, ownerId: p.id, pos: { ...pos }, t: seconds, maxT: seconds, hp, maxHp: hp,
    element: p.guns[p.active]!.element, fireCd: 0.3, tickT: 0.5, mini, saved: false,
  };
  confine(w, g.pos, TURRET.radius);
  w.gadgets.push(g);
  w.events.push({ type: "gadget", id: g.id, kind, x: g.pos.x, y: g.pos.y, gone: false });
  return g;
}

// ---------------------------------------------------------------- turrets

export function useTurret(w: World, p: Player): void {
  const s = turretSkill(p);
  w.events.push({ type: "skill", id: p.id, x: p.pos.x, y: p.pos.y });
  const seconds = s.durationMs / 1000 + (hasSkill(p, "tk_tape") ? TURRET.tape : 0);
  const hp = s.hp * (hasSkill(p, "tk_armor") ? 2 : 1) * (p.signature === "sig_walker" ? TURRET.walker.hp : 1);
  const ahead = add(p.pos, scale(p.facing, TURRET.offset));
  if (hasSkill(p, "tk_twin")) {
    const side = { x: -p.facing.y * 12, y: p.facing.x * 12 };
    makeGadget(w, "turret", p, add(ahead, side), seconds, hp);
    makeGadget(w, "turret", p, sub(ahead, side), seconds, hp);
  } else makeGadget(w, "turret", p, ahead, seconds, hp);
}

/** Early Retirement: the skill button with no charge blows your turrets up right away. */
export function detonateTurrets(w: World, p: Player): boolean {
  let any = false;
  for (const g of w.gadgets) {
    if (g.kind === "turret" && g.ownerId === p.id && !g.mini && g.t > 0) {
      g.t = 0;
      any = true;
    }
  }
  return any;
}

function updateTurret(w: World, g: Gadget, owner: Player | undefined): void {
  if (!owner) return;
  const s = turretSkill(owner);
  const walker = owner.signature === "sig_walker" && !g.mini;
  const heater = owner.signature === "sig_heater" && !g.mini;
  const range = heater ? TURRET.heater.range : s.range;
  const target = nearestEnemy(w, g.pos, range);

  if (walker) {
    const prey = target ?? nearestEnemy(w, g.pos, 300);
    if (prey && dist(prey.pos, g.pos) > TURRET.walker.keep) {
      g.pos = add(g.pos, scale(norm(sub(prey.pos, g.pos)), TURRET.walker.speed * DT));
      confine(w, g.pos, TURRET.radius);
    }
  }

  g.fireCd -= DT;
  if (g.fireCd > 0 || !target) return;
  const base = angleOf(sub(target.pos, g.pos));
  const common = {
    owner: "player" as const, ownerId: owner.id, kind: "turret", pierce: 0, bounces: 0, hitIds: [] as number[], gunUid: TURRET_GUN,
    special: true, noCharge: true,
  };
  if (heater) {
    g.fireCd = TURRET.heater.fireMs / 1000;
    const spread = (TURRET.heater.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < TURRET.heater.pellets; i++) {
      const a = base + (i / (TURRET.heater.pellets - 1) - 0.5) * spread;
      w.projectiles.push({
        ...common, hitIds: [], id: newId(w), element: "fire", pos: { ...g.pos }, vel: fromAngle(a, 200), radius: 3,
        damage: skillDamage(owner, TURRET.heater.damage), knockback: 10, life: TURRET.heater.range / 200,
      });
    }
    return;
  }
  g.fireCd = (s.fireMs / 1000) * (hasSkill(owner, "tk_overclock") ? TURRET.overclock : 1) * (walker ? TURRET.walker.slower : 1);
  w.projectiles.push({
    ...common, id: newId(w), element: g.element, pos: add(g.pos, fromAngle(base, 5)), vel: fromAngle(base, TURRET.speed), radius: 2,
    damage: skillDamage(owner, s.damage), knockback: 20, life: (range / TURRET.speed) * 1.15,
  });
}

/** A turret ran out or broke: Self-Destruct and friends, and Recycling. */
function endTurret(w: World, g: Gadget, owner: Player | undefined): void {
  if (!owner || g.mini) return;
  if (hasSkill(owner, "tk_recycle") && !owner.downed) owner.skillCharge = Math.min(1, owner.skillCharge + TURRET.recycle);
  if (!hasSkill(owner, "tk_boom")) return;
  const b = TURRET.boom;
  const nuke = hasSkill(owner, "tk_nuke");
  const radius = b.radius * (nuke ? b.nuke : 1);
  if (nuke) {
    // Warranty Void: everything nearby gets yanked toward the turret first.
    for (const e of w.enemies) {
      if (!targetable(e) || ENEMIES[e.defId]!.boss || dist(e.pos, g.pos) > radius * 1.6) continue;
      e.knock = add(e.knock, scale(norm(sub(g.pos, e.pos)), b.pull * 3));
    }
  }
  playerExplosion(w, g.pos, radius, skillDamage(owner, b.damage), 160, owner.id, g.element, false, TURRET_GUN);
  if (hasSkill(owner, "tk_bomblets")) {
    for (let i = 0; i < b.bomblets; i++) {
      const to = add(g.pos, fromAngle(rand(w) * Math.PI * 2, 30 + rand(w) * 20));
      w.projectiles.push({
        id: newId(w), owner: "player", ownerId: owner.id, kind: "grenade", element: g.element, pos: { ...g.pos }, vel: { x: 0, y: 0 }, radius: 2,
        damage: skillDamage(owner, b.damage * 0.5), pierce: 0, bounces: 0, knockback: 80, life: 99, hitIds: [], gunUid: TURRET_GUN, noCharge: true,
        lob: { from: { ...g.pos }, to, t: 0, dur: 0.45, radius: 22 },
      });
    }
  }
  if (hasSkill(owner, "tk_hazard")) {
    const h = TURRET.hazard;
    for (let i = 0; i < h.patches; i++) {
      const at = i === 0 ? { ...g.pos } : add(g.pos, fromAngle((i / (h.patches - 1)) * Math.PI * 2, radius * 0.5));
      w.hazards.push({ id: newId(w), kind: "fire", owner: "player", ownerId: owner.id, pos: at, radius: 14, t: h.seconds, maxT: h.seconds, damage: skillDamage(owner, h.damage), tickT: 0.5 });
    }
  }
}

/** Turret Army: a turret's kill can build a tiny turret where the enemy fell. */
export function onTurretKill(w: World, e: Enemy, p: Player): void {
  if (!hasSkill(p, "tk_army") || rand(w) >= TURRET.army.chance) return;
  if (w.gadgets.filter((g) => g.mini && g.ownerId === p.id).length >= TURRET.army.max) return;
  const s = turretSkill(p);
  makeGadget(w, "turret", p, e.pos, TURRET.army.seconds, s.hp * TURRET.army.hpFrac, true);
}

/** A turret takes a hit from an enemy attack. Spite zaps back. */
export function hurtGadget(w: World, g: Gadget, amount: number, attacker?: Enemy): void {
  if (g.kind !== "turret" || g.hp <= 0) return;
  g.hp -= amount;
  w.events.push({ type: "gadgetHit", id: g.id });
  const owner = ownerOf(w, g);
  if (owner && attacker && hasSkill(owner, "tk_spite") && targetable(attacker)) {
    w.events.push({ type: "chain", x1: g.pos.x, y1: g.pos.y, x2: attacker.pos.x, y2: attacker.pos.y });
    damageEnemy(w, attacker, skillDamage(owner, TURRET.spite), { dir: sub(attacker.pos, g.pos), knockback: 40, sourcePlayerId: owner.id, element: "shock", secondary: true, noCharge: true });
  }
  if (g.hp <= 0) g.t = 0;
}

/** Turrets caught in an area attack. */
export function hurtGadgetsIn(w: World, at: Vec, radius: number, amount: number, attacker?: Enemy): void {
  for (const g of w.gadgets) if (g.kind === "turret" && g.hp > 0 && dist(g.pos, at) < radius + TURRET.radius) hurtGadget(w, g, amount, attacker);
}

/** The turret an enemy is fixated on (Look At Me), if any. Bosses don't fall for it. */
export function tauntOf(w: World, e: Enemy): Gadget | undefined {
  if (ENEMIES[e.defId]!.boss) return undefined;
  const cur = e.taunt ? w.gadgets.find((g) => g.id === e.taunt && g.hp > 0 && g.t > 0) : undefined;
  if (cur && dist(cur.pos, e.pos) < TURRET.taunt * 1.6) return cur;
  e.taunt = 0;
  for (const g of w.gadgets) {
    if (g.kind !== "turret" || g.mini || g.hp <= 0 || dist(g.pos, e.pos) > TURRET.taunt) continue;
    const owner = ownerOf(w, g);
    if (owner && hasSkill(owner, "tk_taunt")) {
      e.taunt = g.id;
      return g;
    }
  }
  return undefined;
}

/** Doorstop: enemies after a turret move slower. */
export function tauntSlow(w: World, e: Enemy): number {
  if (!e.taunt) return 1;
  const g = w.gadgets.find((gg) => gg.id === e.taunt);
  const owner = g && ownerOf(w, g);
  return owner && hasSkill(owner, "tk_doorstop") ? TURRET.doorstop : 1;
}

/** Bullet Magnet: enemy bolts near a turret curve into it. Returns the turret the bolt hit, if it did. */
export function magnetize(w: World, pos: Vec, vel: Vec): { vel: Vec; hit?: Gadget } {
  let out = vel;
  for (const g of w.gadgets) {
    if (g.kind !== "turret" || g.hp <= 0) continue;
    const d = dist(g.pos, pos);
    if (d < TURRET.radius + 3) return { vel, hit: g };
    const owner = ownerOf(w, g);
    if (d > TURRET.magnet.range || !owner || !hasSkill(owner, "tk_magnet")) continue;
    const want = angleOf(sub(g.pos, pos));
    const cur = angleOf(out);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const max = TURRET.magnet.turn * DT;
    out = fromAngle(cur + Math.max(-max, Math.min(max, diff)), len(out));
  }
  return { vel: out };
}

// ---------------------------------------------------------------- drones

export function useDrone(w: World, p: Player): void {
  const s = droneSkill(p);
  w.events.push({ type: "skill", id: p.id, x: p.pos.x, y: p.pos.y });
  const seconds = s.durationMs / 1000 + (hasSkill(p, "wd_nightowl") ? DRONE.longer : 0);
  // A new owl replaces the old one, so the party isn't buried in owls.
  for (const g of w.gadgets) if (g.kind === "drone" && g.ownerId === p.id) g.t = 0;
  const start = add(p.pos, DRONE.follow);
  if (p.signature === "sig_flock") {
    for (let i = 0; i < DRONE.flock.count; i++) makeGadget(w, "drone", p, start, seconds, 1);
  } else makeGadget(w, "drone", p, start, seconds, 1);

  if (p.signature === "sig_rescue") {
    // Rescue Owl: everyone down nearby gets up now, and everyone close gets a burst of health.
    const r = DRONE.rescue;
    for (const o of w.players) {
      if (o.away || dist(o.pos, p.pos) > r.radius) continue;
      if (o.downed) revive(w, o, p.id, r.hpFrac);
      else healPlayer(w, o, r.heal, p);
    }
  } else if (hasSkill(p, "wd_hug")) {
    for (const o of w.players) if (canAct(o) && dist(o.pos, p.pos) < DRONE.hug.radius) healPlayer(w, o, DRONE.hug.amount, p);
  }
}

function updateDrone(w: World, g: Gadget, owner: Player | undefined, index: number, count: number): void {
  if (!owner) return;
  const s = droneSkill(owner);
  const flock = owner.signature === "sig_flock";
  const share = flock ? DRONE.flock.share : 1;
  const radius = s.radius * (flock ? 0.7 : 1);

  // Where the owl wants to be: on your shoulder, orbiting you (flock), or on the nearest enemy (Hunting Season).
  let want: Vec = add(owner.pos, DRONE.follow);
  let speed = DRONE.speed;
  const patient = hasSkill(owner, "wd_ambulance") && index === 0 ? w.players.find((o) => o !== owner && o.downed && o.reviveT === Infinity && dist(o.pos, owner.pos) < DRONE.ambulance) : undefined;
  if (patient) want = patient.pos;
  else if (flock) want = add(owner.pos, fromAngle(w.time * DRONE.flock.spin + (index / count) * Math.PI * 2, DRONE.flock.orbit));
  else if (hasSkill(owner, "wd_hunt")) {
    const prey = nearestEnemy(w, g.pos, 220);
    if (prey) {
      want = prey.pos;
      speed = DRONE.hunt;
    }
  }
  const off = sub(want, g.pos);
  const l = len(off);
  g.pos = l <= speed * DT ? want : add(g.pos, scale(off, (speed * DT) / l));

  // Slow everything close, a little more for Cold Comfort.
  const slow = Math.min(0.8, s.slow * (hasSkill(owner, "wd_cold") ? 2 : 1));
  for (const e of w.enemies) {
    if (!targetable(e) || dist(e.pos, g.pos) > radius + e.radius) continue;
    e.slowT = 0.25;
    e.slow = Math.max(e.slow, slow);
  }

  // Healing once a second (none for the Rescue Owl, which spent it all up front).
  g.tickT -= DT;
  if (g.tickT <= 0) {
    g.tickT = 1;
    if (owner.signature !== "sig_rescue") {
      for (const p of w.players) if (canAct(p) && dist(p.pos, g.pos) < radius) healPlayer(w, p, s.heal * share, owner);
    }
  }

  // Hoot: zaps the nearest enemy.
  if (hasSkill(owner, "wd_hoot")) {
    g.fireCd -= DT;
    if (g.fireCd <= 0) {
      g.fireCd = hasSkill(owner, "wd_talons") ? 0.5 : 1;
      const e = nearestEnemy(w, g.pos, radius + DRONE.zap.reach);
      if (e) {
        w.events.push({ type: "chain", x1: g.pos.x, y1: g.pos.y, x2: e.pos.x, y2: e.pos.y });
        damageEnemy(w, e, skillDamage(owner, DRONE.zap.damage * share), {
          dir: sub(e.pos, g.pos), knockback: 20, sourcePlayerId: owner.id, element: "shock", secondary: !hasSkill(owner, "wd_night"), noCharge: true,
        });
      }
    }
  }
}

/** The owl leaves: Raptor Mode dives into the nearest enemy on the way out. */
function endDrone(w: World, g: Gadget, owner: Player | undefined): void {
  if (!owner || !hasSkill(owner, "wd_raptor")) return;
  const r = DRONE.raptor;
  const e = nearestEnemy(w, g.pos, r.range);
  if (!e) return;
  const share = owner.signature === "sig_flock" ? DRONE.flock.share : 1;
  w.events.push({ type: "chain", x1: g.pos.x, y1: g.pos.y, x2: e.pos.x, y2: e.pos.y });
  playerExplosion(w, e.pos, r.radius, skillDamage(owner, r.damage * share), 140, owner.id, "shock", true);
}

/** Owl Ambulance: an owl close to a downed teammate counts as someone helping them up. */
export function ambulanceNear(w: World, p: Player): Player | undefined {
  for (const g of w.gadgets) {
    const owner = g.kind === "drone" && dist(g.pos, p.pos) < REVIVE.reach + 8 ? ownerOf(w, g) : undefined;
    if (owner && owner !== p && hasSkill(owner, "wd_ambulance")) return owner;
  }
  return undefined;
}

// ---------------------------------------------------------------- ghosts (Excess Baggage)

/** An enemy Excess Baggage killed gets back up on your side. The oldest goes when there are too many. */
export function raiseGhost(w: World, p: Player, e: Enemy): void {
  const mine = w.gadgets.filter((g) => g.kind === "ghost" && g.ownerId === p.id && g.t > 0).sort((a, b) => a.t - b.t);
  for (const g of mine.slice(0, Math.max(0, mine.length - MYTHIC.ghost.max + 1))) g.t = 0;
  const g = makeGadget(w, "ghost", p, e.pos, MYTHIC.ghost.seconds, 1);
  g.defId = e.defId;
  g.fireCd = 0.4;
}

/** A ghost runs at the nearest enemy and bites it. Enemies pay it no attention. */
function updateGhost(w: World, g: Gadget, owner: Player | undefined): void {
  if (!owner) return;
  const def = ENEMIES[g.defId ?? ""];
  const radius = def?.radius ?? 6;
  const prey = nearestEnemy(w, g.pos, 400);
  if (!prey) return;
  const reach = radius + prey.radius + 2;
  const d = dist(prey.pos, g.pos);
  if (d > reach) {
    const speed = Math.max(60, (def?.speed ?? 60) * MYTHIC.ghost.speed);
    g.pos = add(g.pos, scale(norm(sub(prey.pos, g.pos)), Math.min(d - reach, speed * DT)));
    confine(w, g.pos, radius);
  }
  g.fireCd -= DT;
  if (g.fireCd > 0 || d > reach + 3) return;
  g.fireCd = MYTHIC.ghost.biteS;
  damageEnemy(w, prey, skillDamage(owner, MYTHIC.ghost.bite), { dir: sub(prey.pos, g.pos), knockback: 60, sourcePlayerId: owner.id, element: "none", gunUid: GHOST_GUN, noCharge: true });
}

// ---------------------------------------------------------------- all gadgets

export function updateGadgets(w: World): void {
  const drones = new Map<number, Gadget[]>();
  for (const g of w.gadgets) if (g.kind === "drone") drones.set(g.ownerId, [...(drones.get(g.ownerId) ?? []), g]);
  for (const g of w.gadgets) {
    if (g.t <= 0) continue;
    const owner = ownerOf(w, g);
    g.t -= DT;
    if (g.kind === "turret") updateTurret(w, g, owner);
    else if (g.kind === "ghost") updateGhost(w, g, owner);
    else {
      const mine = drones.get(g.ownerId) ?? [g];
      updateDrone(w, g, owner, mine.indexOf(g), mine.length);
    }
  }
  // Gadgets whose owner left the run go with them.
  for (const g of w.gadgets) {
    const owner = ownerOf(w, g);
    if (!owner) g.t = 0;
    if (g.t > 0 && g.hp > 0) continue;
    w.events.push({ type: "gadget", id: g.id, kind: g.kind, x: g.pos.x, y: g.pos.y, gone: true });
    if (g.kind === "turret") endTurret(w, g, owner);
    else if (g.kind === "drone") endDrone(w, g, owner);
  }
  w.gadgets = w.gadgets.filter((g) => g.t > 0 && g.hp > 0);
}

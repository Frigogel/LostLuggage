import { confine, dropGun, DT, healPlayer, hurtPlayer, nearestEnemy, newId, partyLuck, playerExplosion, spawnDome } from "./combat";
import { BOOSTS } from "./data/boosts";
import { GRENADE } from "./data/guns";
import { DASH, HEROES, levelMultiplier, MAX_LEVEL, REVIVE, tierLevel } from "./data/heroes";
import { LEGENDARIES, MOOD_CYCLE } from "./data/legendaries";
import { SIGNATURES } from "./data/signatures";
import { validSkills } from "./data/skills";
import { souvenirMods, type SouvenirRanks } from "./data/souvenirs";
import { ambulanceNear, detonateTurrets, useDrone, useTurret } from "./gadgets";
import { gunFromData, gunStats, heldStats, newGun, rollGun } from "./loot";
import { marksUp, nearestMarked, MARK, useMarks } from "./marks";
import { add, angleOf, clamp, clampLen, dist, fromAngle, len, norm, rand, scale, sub, type Vec } from "./math";
import type { BoostId, Gun, GunData, Pickup, Player, PlayerInput, World } from "./types";
import { beltAt } from "./room";

export const MAX_PLAYERS = 4;

export interface PlayerOptions {
  heroId?: string;
  name?: string;
  /** The hero's own level (1-30). */
  level?: number;
  /** Saved loadout. `sid` is the stash id, so the run knows which guns are already at home. Defaults to the starter kit. */
  guns?: (GunData & { sid?: string })[];
  /** Learned skill nodes. Anything the level can't afford is dropped. */
  skills?: string[];
  souvenirs?: SouvenirRanks;
  /** Equipped signature power. Ignored unless it belongs to this hero. */
  signature?: string;
}

/** Level sync: co-op sets everyone to the dungeon tier's level; solo uses your own. */
export function syncLevelFor(w: World, level: number): number {
  return w.run.coop ? tierLevel(w.run.tier) : level;
}

export function makePlayer(w: World, opts: PlayerOptions, pos: Vec, slot = 0): Player {
  const heroId = opts.heroId && HEROES[opts.heroId] ? opts.heroId : "vanguard";
  const hero = HEROES[heroId]!;
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(opts.level ?? 1)));
  const syncLevel = syncLevelFor(w, level);
  const { hp: hpMod, ...mods } = souvenirMods(opts.souvenirs);
  const maxHp = Math.round(hero.maxHp * levelMultiplier(syncLevel) * hpMod);
  const saved = (opts.guns ?? []).slice(0, 2).map((g) => gunFromData(w, g, g.sid));
  const guns = saved.length === 2 ? saved : [newGun(w, "pistol"), newGun(w, "shotgun")];
  const p: Player = {
    id: newId(w),
    heroId,
    name: opts.name ?? "",
    slot,
    level,
    syncLevel,
    away: false,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: hero.radius,
    hp: maxHp,
    maxHp,
    facing: { x: 1, y: 0 },
    guns,
    active: 0,
    shotCd: 0,
    burstLeft: 0,
    burstT: 0,
    shotAim: { x: 1, y: 0 },
    charging: false,
    chargeT: 0,
    dashT: 0,
    dashCd: 0,
    dashDir: { x: 1, y: 0 },
    iframes: 0,
    hurtT: 0,
    skillCharge: 0,
    grenadeCd: 0,
    downed: false,
    reviveT: 0,
    reviveProgress: 0,
    selfRevives: 1,
    boosts: {},
    streakT: 0,
    // Veterans keep their wider toolbox in co-op: skills follow the hero's own level, not the synced one.
    skills: validSkills(heroId, level, opts.skills ?? []),
    mods,
    panicUsed: false,
    signature: opts.signature && SIGNATURES[opts.signature]?.heroId === heroId ? opts.signature : "",
    shield: 0,
    knock: { x: 0, y: 0 },
    slowT: 0,
    holsterCd: 0,
    markHits: 0,
  };
  // Second Opinion: one more Second Wind.
  if (p.skills.includes("wd_opinion")) p.selfRevives = 2;
  return p;
}

/** Started a dash in the last `s` seconds. */
export const dashedWithin = (p: Player, s: number): boolean => p.dashCd > 0 && (DASH.cooldownMs / 1000) * p.mods.dashCd - p.dashCd < s;

/** Learned a skill node. */
export const hasSkill = (p: Pick<Player, "skills">, id: string): boolean => p.skills.includes(id);

/** Where player `i` of `n` stands at a room's entrance: side by side, so nobody spawns inside a friend. */
export function startPos(start: Vec, i: number, n: number): Vec {
  return { x: start.x + (i - (n - 1) / 2) * 18, y: start.y };
}

/** Drop-in: adds a player to a run in progress, next to a teammate who is still up. */
export function addPlayer(w: World, opts: PlayerOptions): Player | undefined {
  if (w.players.length >= MAX_PLAYERS) return undefined;
  let slot = 0;
  while (w.players.some((p) => p.slot === slot)) slot++;
  const buddy = w.players.find(canAct);
  const pos = buddy ? { x: buddy.pos.x + 14, y: buddy.pos.y } : startPos({ x: w.arena.w / 2, y: w.arena.h - 40 }, slot, MAX_PLAYERS);
  const p = makePlayer(w, opts, pos, slot);
  confine(w, p.pos, p.radius);
  // Late joiners get a better second gun so they aren't stuck with starter gear.
  const room = w.run.room.index;
  if (room > 0) p.guns[1] = rollGun(w, 0.3 * room, "uncommon");
  p.iframes = 2;
  w.players.push(p);
  w.events.push({ type: "playerJoined", id: p.id });
  return p;
}

export function removePlayer(w: World, id: number): void {
  const i = w.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  w.players.splice(i, 1);
  w.events.push({ type: "playerLeft", id });
}

/** Up, present and able to act. */
export const canAct = (p: Player): boolean => !p.downed && !p.away;

export const EMPTY_INPUT: PlayerInput = {
  move: { x: 0, y: 0 },
  aim: { x: 0, y: 0 },
  fire: false,
  autoAim: false,
  dash: false,
  skill: false,
  grenade: false,
  grenadeAim: { x: 0, y: 0 },
  swap: false,
  interact: false,
};

/**
 * Dash and walking. Shared by the sim and by co-op clients, which run it ahead of the server
 * to predict their own movement. Only touches the player and reads the arena. Returns true when a dash starts.
 */
export function stepMovement(w: Pick<World, "arena">, p: Player, input: PlayerInput): boolean {
  const hero = HEROES[p.heroId]!;
  p.dashCd = Math.max(0, p.dashCd - DT);
  let dashed = false;
  if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
    p.dashDir = len(input.move) > 0.1 ? norm(input.move) : { ...p.facing };
    p.dashT = DASH.durationMs / 1000;
    p.dashCd = (DASH.cooldownMs / 1000) * p.mods.dashCd;
    p.iframes = Math.max(p.iframes, DASH.iframesMs / 1000);
    p.charging = false; // Dashing cancels a sniper charge; the pip is already spent.
    dashed = true;
  }

  const ice = w.arena.ice;
  p.slowT = Math.max(0, p.slowT - DT);
  let vel: Vec;
  if (p.dashT > 0) {
    vel = scale(p.dashDir, DASH.speed * (ice ? DASH.iceBoost : 1) * (1 + 0.3 * (p.boosts.express ?? 0)));
    p.dashT -= DT;
  } else {
    const speed = hero.speed * p.mods.speed * (p.charging ? 0.45 : 1) * (p.slowT > 0 ? ICE.slush : 1);
    const want = scale(clampLen(input.move, 1), speed);
    // On ice you steer your momentum rather than set it: a dash keeps sliding, and stopping takes a moment.
    vel = ice ? add(p.vel, scale(sub(want, p.vel), Math.min(1, DT * ICE.grip))) : want;
  }
  // Baggage Claim: the belt under you carries you along (not while dashing).
  const belt = w.arena.belts.length > 0 && p.dashT <= 0 ? beltAt(w.arena, p.pos) : undefined;
  p.pos = add(p.pos, scale(add(add(vel, p.knock), { x: belt?.vx ?? 0, y: 0 }), DT));
  // Shoves fade fast on deck plating and slowly on ice.
  p.knock = scale(p.knock, ice ? ICE.knockKeep : 0.7);
  if (len(p.knock) < 2) p.knock = { x: 0, y: 0 };
  const before = { ...p.pos };
  if (confine(w, p.pos, p.radius) && ice) {
    // Sliding into a wall stops you along that wall instead of gluing you to it.
    if (Math.abs(before.x - p.pos.x) > 0.01) vel = { x: 0, y: vel.y };
    if (Math.abs(before.y - p.pos.y) > 0.01) vel = { x: vel.x, y: 0 };
  }
  p.vel = vel;
  return dashed;
}

/** Frozen Caverns movement. */
export const ICE = {
  /** How quickly your velocity follows the stick on ice, per second. */
  grip: 4.5,
  /** Shove kept per tick on ice (0.7 on plating). */
  knockKeep: 0.9,
  /** Speed left while standing in slush. */
  slush: 0.6,
  /** Spike walls: damage and the bounce off them. */
  spikeDamage: 8,
  spikeBounce: 240,
  /** Longer than a normal hit's, so one bad slide is one hit, not three. */
  spikeIframes: 0.9,
};

/** Touching a spike wall hurts and bounces you off it. */
function touchSpikes(w: World, p: Player): void {
  for (const r of w.arena.spikes) {
    const cx = clamp(p.pos.x, r.x, r.x + r.w);
    const cy = clamp(p.pos.y, r.y, r.y + r.h);
    const off = sub(p.pos, { x: cx, y: cy });
    if (len(off) > p.radius + 1) continue;
    const out = len(off) > 0.01 ? norm(off) : { x: 0, y: 1 };
    if (hurtPlayer(w, p, ICE.spikeDamage)) {
      p.knock = scale(out, ICE.spikeBounce);
      p.vel = { x: 0, y: 0 };
      p.iframes = Math.max(p.iframes, ICE.spikeIframes);
      w.events.push({ type: "spiked", x: cx, y: cy });
    }
    return;
  }
}

/** Facing follows the aim, or the movement when not aiming. */
export function updateFacing(p: Player, input: PlayerInput): void {
  if (len(input.aim) > 1) p.facing = norm(input.aim);
  else if (len(input.move) > 0.1 && !p.charging && p.burstLeft === 0) p.facing = norm(input.move);
}

export function updatePlayer(w: World, p: Player, input: PlayerInput): void {
  const hero = HEROES[p.heroId]!;

  p.iframes = Math.max(0, p.iframes - DT);
  p.hurtT = Math.max(0, p.hurtT - DT);
  p.grenadeCd = Math.max(0, p.grenadeCd - DT);
  p.shotCd = Math.max(0, p.shotCd - DT);
  p.streakT = Math.max(0, p.streakT - DT);
  p.holsterCd = Math.max(0, p.holsterCd - DT);
  // Every carried gun reloads, holstered or not: generous on purpose.
  const steady = hasSkill(p, "gs_steady") && marksUp(w, p) ? 0.5 : 0;
  const reloadBoost = 1 + 0.15 * (p.boosts.quickPips ?? 0) + (p.streakT > 0 ? 0.5 : 0) + steady;
  for (const g of p.guns) {
    const s = gunStats(g);
    if (g.pips < s.pips) g.pips = Math.min(s.pips, g.pips + (DT * 1000 * reloadBoost) / s.reloadMs);
  }

  if (p.downed) {
    p.vel = { x: 0, y: 0 };
    updateDowned(w, p);
    return;
  }
  // In-Flight Meal: a little health back all the time.
  if (p.boosts.meal && !p.away) p.hp = Math.min(p.maxHp, p.hp + p.boosts.meal * DT);
  if (p.away) {
    p.vel = { x: 0, y: 0 };
    return;
  }

  updateFacing(p, input);

  if (input.swap && !p.charging && p.burstLeft === 0) {
    p.active = (p.active + 1) % p.guns.length;
    w.events.push({ type: "swap", id: p.id });
    // Hot Holster: the gun you swap to comes up with a fresh pip.
    if (hasSkill(p, "gs_holster") && p.holsterCd <= 0) {
      refillPip(p);
      p.holsterCd = 1.5;
    }
  }

  if (stepMovement(w, p, input)) {
    w.events.push({ type: "dash", id: p.id });
    if (p.boosts.dashBurst) playerExplosion(w, p.pos, 34, 8 * p.boosts.dashBurst * levelMultiplier(p.syncLevel), 120, p.id, "shock");
    if (hasSkill(p, "gs_spin") || p.boosts.quickDraw) refillPip(p);
    if (p.boosts.seatbelt) p.shield = Math.min(10 * p.boosts.seatbelt + 10, p.shield + 10);
    if (p.boosts.jetLag) {
      // Jet Lag: a line of fire along the dash.
      const reach = DASH.speed * (DASH.durationMs / 1000);
      for (let i = 0; i < 4; i++) {
        const at = add(p.pos, scale(p.dashDir, (reach * i) / 3));
        w.hazards.push({ id: newId(w), kind: "fire", owner: "player", ownerId: p.id, pos: at, radius: 10, t: 2.5, maxT: 2.5, damage: 5 * p.boosts.jetLag * levelMultiplier(p.syncLevel), tickT: 0 });
      }
    }
  }
  if (w.arena.spikes.length > 0) touchSpikes(w, p);

  if (input.skill && p.skillCharge >= 1) {
    p.skillCharge = 0;
    useSkill(w, p);
  } else if (input.skill && hasSkill(p, "tk_early")) detonateTurrets(w, p);

  if (input.grenade && p.grenadeCd <= 0) {
    let offset: Vec;
    if (len(input.grenadeAim) > 1) {
      offset = clampLen(input.grenadeAim, GRENADE.range);
    } else {
      const target = nearestEnemy(w, p.pos, GRENADE.range);
      offset = target ? sub(target.pos, p.pos) : scale(p.facing, GRENADE.range * 0.6);
    }
    const to = add(p.pos, offset);
    const d = Math.max(16, len(offset));
    w.projectiles.push({
      id: newId(w), owner: "player", ownerId: p.id, kind: "grenade", element: "none", pos: { ...p.pos }, vel: { x: 0, y: 0 },
      radius: 3, damage: GRENADE.damage * levelMultiplier(p.syncLevel) * p.mods.damage, pierce: 0, bounces: 0, knockback: GRENADE.knockback, life: 99, hitIds: [], gunUid: -1,
      lob: { from: { ...p.pos }, to, t: 0, dur: d / GRENADE.speed, radius: GRENADE.radius * (1 + 0.3 * (p.boosts.explosives ?? 0)) },
      ...(p.boosts.partyPack ? { cluster: 3 } : {}),
    });
    p.grenadeCd = (GRENADE.cooldownMs / 1000) * Math.pow(0.7, p.boosts.explosives ?? 0);
    w.events.push({ type: "grenade", id: p.id });
  }

  updateShooting(w, p, input);
}

/** One pip back on the gun in hand. */
function refillPip(p: Player): void {
  const g = p.guns[p.active]!;
  g.pips = Math.min(gunStats(g).pips, g.pips + 1);
}

/** The hero's action skill. */
export function useSkill(w: World, p: Player): void {
  if (p.boosts.grandOpening) playerExplosion(w, p.pos, 60, 30 * p.boosts.grandOpening * levelMultiplier(p.syncLevel), 220, p.id, "none", true);
  if (p.boosts.spa) healPlayer(w, p, 15 * p.boosts.spa);
  switch (HEROES[p.heroId]!.skill.type) {
    case "dome":
      spawnDome(w, p);
      break;
    case "mark":
      useMarks(w, p);
      break;
    case "turret":
      useTurret(w, p);
      break;
    case "drone":
      useDrone(w, p);
      break;
  }
}

/** Downed: either Second Wind is counting down, or teammates standing close fill the revive bar. */
function updateDowned(w: World, p: Player): void {
  if (p.reviveT !== Infinity) {
    p.reviveT -= DT;
    if (p.reviveT <= 0) revive(w, p, -1, 0.5);
    return;
  }
  const helpers = w.players.filter((o) => o !== p && canAct(o) && dist(o.pos, p.pos) < REVIVE.reach + o.radius);
  // Owl Ambulance: a Warden's owl counts as a helper.
  const owl = ambulanceNear(w, p);
  if (helpers.length > 0 || owl) {
    // A second helper speeds it up a little; stacking the whole party doesn't trivialize it. Bedside Manner doubles yours.
    const n = helpers.length + (owl ? 1 : 0);
    const fast = (helpers.some((o) => hasSkill(o, "wd_hustle")) ? 2 : 1) * (helpers.some((o) => o.boosts.firstAid) ? 2 : 1);
    p.reviveProgress += (DT * fast * (1 + 0.5 * (n - 1))) / REVIVE.seconds;
    if (p.reviveProgress >= 1) {
      const by = helpers.find((o) => hasSkill(o, "wd_getup")) ?? helpers[0];
      const credit = by ?? owl!;
      revive(w, p, credit.id, (hasSkill(credit, "wd_getup") ? 0.7 : REVIVE.hpFrac) + (helpers.some((o) => o.boosts.firstAid) ? 0.2 : 0));
    }
  } else {
    // Progress drains slowly, so stepping away to dodge doesn't throw it all away.
    p.reviveProgress = Math.max(0, p.reviveProgress - DT / (REVIVE.seconds * 2));
  }
}

export function revive(w: World, p: Player, by: number, hpFrac: number): void {
  p.downed = false;
  p.reviveT = 0;
  p.reviveProgress = 0;
  p.hp = Math.max(1, Math.round(p.maxHp * hpFrac));
  p.iframes = 2;
  w.events.push({ type: "playerRevived", id: p.id, by });
  // Shockwave: shoves everything away from the revived player without hurting it much.
  playerExplosion(w, p.pos, 60, 1, 260, p.id, "none", true);
}

/**
 * When everyone present is down for good, the first player with Second Wind left gets back up.
 * Nobody has it: the run is over. Players who are away (disconnected) don't hold the run open.
 */
export function checkWipe(w: World): void {
  const present = w.players.filter((p) => !p.away);
  if (present.length === 0 || present.some((p) => !p.downed || p.reviveT !== Infinity)) return;
  const lucky = present.find((p) => p.selfRevives > 0);
  if (lucky) {
    lucky.selfRevives--;
    lucky.reviveT = hasSkill(lucky, "wd_hustle") ? 1.5 : 3;
    w.events.push({ type: "secondWind", id: lucky.id });
    return;
  }
  w.gameOver = true;
  w.events.push({ type: "gameOver" });
}

/** Resolves where a shot goes. Returns an offset whose length matters for lobbed guns. */
function resolveAim(w: World, p: Player, input: PlayerInput, range: number): Vec {
  if (!input.autoAim && len(input.aim) > 1) return input.aim;
  // Gunslinger: auto-aim goes for your marks first.
  const target = nearestMarked(w, p.pos, p.id, range * 1.3) ?? nearestEnemy(w, p.pos, range * 1.15);
  if (target) return sub(target.pos, p.pos);
  return scale(p.facing, range * 0.75);
}

function updateShooting(w: World, p: Player, input: PlayerInput): void {
  const gun = p.guns[p.active]!;
  const s = gunStats(gun);

  if (p.charging) {
    p.chargeT -= DT;
    if (p.chargeT <= 0) {
      p.charging = false;
      fireGun(w, p, gun, p.shotAim);
    }
    return;
  }

  if (p.burstLeft > 0) {
    p.burstT -= DT;
    while (p.burstT <= 0 && p.burstLeft > 0) {
      fireGun(w, p, gun, p.shotAim);
      p.burstLeft--;
      p.burstT += s.shotIntervalMs / 1000;
    }
    return;
  }

  if (input.fire && p.shotCd <= 0 && gun.pips >= 1) {
    const aim = resolveAim(w, p, input, s.range);
    gun.pips -= 1;
    p.shotCd = (s.fireDelayMs / 1000) * (hasSkill(p, "gs_fan") && marksUp(w, p) ? 0.5 : 1);
    p.shotAim = aim;
    p.facing = norm(aim);
    if (s.chargeMs > 0) {
      p.charging = true;
      p.chargeT = s.chargeMs / 1000;
      w.events.push({ type: "charge", playerId: p.id });
    } else {
      fireGun(w, p, gun, aim);
      p.burstLeft = s.shotsPerPip - 1;
      p.burstT = s.shotIntervalMs / 1000;
    }
  }
}

/** Overachiever's rocket: slow, homing, and it explodes. */
const ROCKET = { speed: 190, damage: 30, radius: 24, homing: 5, life: 2.2 };

function fireGun(w: World, p: Player, gun: Gun, aim: Vec): void {
  const s = heldStats(gun, p);
  const effect = gun.legendary ? LEGENDARIES[gun.legendary]?.effect : undefined;
  gun.count = (gun.count ?? 0) + 1;
  // Mood Ring changes element every shot.
  const element = effect === "moodRing" ? MOOD_CYCLE[(gun.count - 1) % MOOD_CYCLE.length]! : gun.element;
  const base = angleOf(aim);
  const muzzle = add(p.pos, fromAngle(base, p.radius + 5));
  w.events.push({ type: "shot", playerId: p.id, x: muzzle.x, y: muzzle.y, angle: base, archetype: s.archetype, element });

  const damage = s.damage * levelMultiplier(p.syncLevel) * p.mods.damage;
  const common = { owner: "player" as const, ownerId: p.id, kind: s.archetype, element, damage, knockback: s.knockback, gunUid: gun.uid };
  if (s.lob) {
    const d = clamp(len(aim), 24, s.range);
    const to = add(p.pos, fromAngle(base, d));
    for (let i = 0; i < s.pellets; i++) {
      // Extra shells (Goblin Surplus) land scattered around the aim point.
      const at = i === 0 ? to : add(to, fromAngle(rand(w) * Math.PI * 2, 10 + rand(w) * 16));
      const dur = (Math.hypot(at.x - muzzle.x, at.y - muzzle.y) || d) / s.speed;
      w.projectiles.push({
        ...common, hitIds: [], id: newId(w), pos: { ...muzzle }, vel: { x: 0, y: 0 }, radius: s.projRadius, pierce: 0, bounces: s.bounces, life: 99,
        lob: { from: { ...muzzle }, to: at, t: 0, dur, radius: s.lob.radius },
        ...(effect === "cluster" ? { cluster: 4 } : {}),
      });
    }
    return;
  }

  const bounces = s.bounces;
  // While you have marks up, your shots seek them out.
  const seek = marksUp(w, p);
  const spread = (s.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < s.pellets; i++) {
    let a = base;
    if (s.pellets > 1) a += (i / (s.pellets - 1) - 0.5) * spread + (rand(w) - 0.5) * spread * 0.15;
    else if (spread > 0) a += (rand(w) - 0.5) * spread;
    // Shotgun pellets vary in speed a little so the cone looks chunky, not like a fan.
    const speed = s.pellets > 1 ? s.speed * (0.9 + rand(w) * 0.2) : s.speed;
    // Bouncing shots get a little extra range to use their bounce. Boomerangs fly out and all the way back.
    const life = (s.range / s.speed) * (bounces > 0 ? 1.4 : 1);
    const pr = {
      ...common, hitIds: [] as number[], id: newId(w), pos: { ...muzzle }, vel: fromAngle(a, speed), radius: s.projRadius, pierce: s.pierce, bounces,
      life: effect === "boomerang" ? life * 2 : life,
    };
    w.projectiles.push({
      ...pr,
      ...(s.homing > 0 ? { homing: s.homing, special: true } : {}),
      ...(seek ? { seekMarks: p.id, homing: Math.max(s.homing, MARK.homing), special: true } : {}),
      ...(effect === "boomerang" ? { turnT: life, pierce: pr.pierce + 2, special: true } : {}),
      ...(effect === "ricochet" ? { ricochet: 3, special: true } : {}),
      ...(effect === "fireLine" ? { fireLine: true } : {}),
    });
  }

  // Buy One Get One: sometimes the shot comes out twice, a little off to the side. Drawn from the server in co-op.
  if (p.boosts.twin && rand(w) < 0.2 * p.boosts.twin) {
    for (let i = 0; i < s.pellets; i++) {
      const a = base + (rand(w) < 0.5 ? -0.14 : 0.14) + (s.pellets > 1 ? (i / (s.pellets - 1) - 0.5) * spread : 0);
      w.projectiles.push({
        ...common, hitIds: [], id: newId(w), pos: { ...muzzle }, vel: fromAngle(a, s.speed), radius: s.projRadius, pierce: s.pierce, bounces,
        life: (s.range / s.speed) * (bounces > 0 ? 1.4 : 1), special: true, ...(s.homing > 0 ? { homing: s.homing } : {}),
      });
    }
  }

  if (effect === "rockets" && gun.count % 10 === 0) {
    w.projectiles.push({
      ...common, kind: "rocket", hitIds: [], id: newId(w), pos: { ...muzzle }, vel: fromAngle(base, ROCKET.speed), radius: 3, pierce: 0, bounces: 0,
      damage: ROCKET.damage * levelMultiplier(p.syncLevel) * p.mods.damage, life: ROCKET.life, homing: ROCKET.homing, explode: ROCKET.radius, special: true,
    });
  }
}

// ---------------------------------------------------------------- pickups

/** How close an item must be for the pickup button to reach it. */
export const PICKUP_REACH = 22;

/** The item a player's pickup button would use right now: the nearest one in reach. Health snacks aren't buttons. */
export function interactable(w: World, p: Player): Pickup | undefined {
  let best: Pickup | undefined;
  let bestD = PICKUP_REACH;
  for (const pk of w.pickups) {
    if (pk.used || pk.kind === "heal" || (pk.owner !== undefined && pk.owner !== p.id)) continue;
    const d = dist(pk.pos, p.pos);
    if (d < bestD) {
      bestD = d;
      best = pk;
    }
  }
  return best;
}

/** Health snacks are grabbed on touch; guns, shrines and suitcases wait for the pickup button. */
export function updatePickups(w: World, inputs: readonly PlayerInput[]): void {
  w.players.forEach((p, i) => {
    if (!canAct(p)) return;
    for (const pk of [...w.pickups]) {
      if (pk.kind !== "heal" || p.hp >= p.maxHp || dist(p.pos, pk.pos) >= 12) continue;
      const amount = Math.min(pk.heal ?? 0, p.maxHp - p.hp);
      p.hp += amount;
      w.events.push({ type: "heal", id: p.id, amount });
      w.pickups.splice(w.pickups.indexOf(pk), 1);
    }

    if (!inputs[i]?.interact) return;
    const pk = interactable(w, p);
    if (!pk) return;
    if (pk.kind === "gun" && pk.gun) {
      // Swap: your old gun stays on the floor so you can change your mind.
      const old = p.guns[p.active]!;
      p.guns[p.active] = pk.gun;
      pk.gun = old;
      p.burstLeft = 0;
      p.charging = false;
      w.events.push({ type: "pickup", id: p.id, gun: p.guns[p.active]! });
    } else if (pk.kind === "boost" && pk.boost) {
      applyBoost(w, p, pk.boost);
      // The other two offers go away.
      w.pickups = w.pickups.filter((o) => !(o.kind === "boost" && o.group === pk.group));
    } else if (pk.kind === "shrine" && pk.boost) {
      applyBoost(w, p, pk.boost);
      pk.used = true;
    } else if (pk.kind === "chest") {
      pk.used = true;
      w.events.push({ type: "chestOpened", x: pk.pos.x, y: pk.pos.y });
      dropGun(w, add(pk.pos, { x: -22, y: 26 }), 0.5 + w.run.tier * 0.3 + partyLuck(w), "uncommon");
      dropGun(w, add(pk.pos, { x: 22, y: 26 }), 0.5 + w.run.tier * 0.3 + partyLuck(w), "uncommon");
    }
  });
}

/** Takes a run boost: one more stack, and the boosts that change a stat right away do so now. */
export function applyBoost(w: World, p: Player, id: BoostId): void {
  const def = BOOSTS[id];
  if (!def || (p.boosts[id] ?? 0) >= def.max) return;
  p.boosts[id] = (p.boosts[id] ?? 0) + 1;
  switch (id) {
    case "vitamins":
      p.maxHp += 20;
      p.hp += 20;
      break;
    case "fragile":
      p.mods.damage *= 1.35;
      p.maxHp = Math.round(p.maxHp * 0.75);
      p.hp = Math.min(p.hp, p.maxHp);
      break;
    case "insurance":
      p.selfRevives++;
      break;
    case "espresso":
      p.mods.speed *= 1.08;
      break;
    case "sneakers":
      p.mods.dashCd *= 0.8;
      break;
    case "powerBank":
      p.mods.charge *= 1.25;
      break;
    case "luckyTag":
      p.mods.luck += 0.3;
      break;
  }
  w.events.push({ type: "shrine", id: p.id, boost: id });
}

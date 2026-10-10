import { confine, dropGun, DT, nearestEnemy, newId, playerExplosion } from "./combat";
import { GRENADE } from "./data/guns";
import { DASH, HEROES, levelMultiplier, REVIVE, tierLevel } from "./data/heroes";
import { gunStats, newGun, rollGun } from "./loot";
import { add, angleOf, clamp, clampLen, dist, fromAngle, len, norm, rand, scale, sub, type Vec } from "./math";
import type { Gun, Pickup, Player, PlayerInput, World } from "./types";

export const MAX_PLAYERS = 4;

export interface PlayerOptions {
  heroId?: string;
  name?: string;
  /** The hero's own level (1-30). */
  level?: number;
}

/** Level sync: co-op sets everyone to the dungeon tier's level; solo uses your own. */
export function syncLevelFor(w: World, level: number): number {
  return w.run.coop ? tierLevel(w.run.tier) : level;
}

export function makePlayer(w: World, opts: PlayerOptions, pos: Vec, slot = 0): Player {
  const heroId = opts.heroId ?? "vanguard";
  const hero = HEROES[heroId]!;
  const level = Math.max(1, Math.round(opts.level ?? 1));
  const syncLevel = syncLevelFor(w, level);
  const maxHp = Math.round(hero.maxHp * levelMultiplier(syncLevel));
  return {
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
    guns: [newGun(w, "pistol"), newGun(w, "shotgun")],
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
  };
}

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
    p.dashCd = DASH.cooldownMs / 1000;
    p.iframes = Math.max(p.iframes, DASH.iframesMs / 1000);
    p.charging = false; // Dashing cancels a sniper charge; the pip is already spent.
    dashed = true;
  }

  let vel: Vec;
  if (p.dashT > 0) {
    vel = scale(p.dashDir, DASH.speed);
    p.dashT -= DT;
  } else {
    const speed = hero.speed * (p.charging ? 0.45 : 1);
    vel = scale(clampLen(input.move, 1), speed);
  }
  p.pos = add(p.pos, scale(vel, DT));
  confine(w, p.pos, p.radius);
  p.vel = vel;
  return dashed;
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
  // Every carried gun reloads, holstered or not: generous on purpose.
  const reloadBoost = 1 + 0.15 * (p.boosts.quickPips ?? 0) + (p.streakT > 0 ? 0.5 : 0);
  for (const g of p.guns) {
    const s = gunStats(g);
    if (g.pips < s.pips) g.pips = Math.min(s.pips, g.pips + (DT * 1000 * reloadBoost) / s.reloadMs);
  }

  if (p.downed) {
    p.vel = { x: 0, y: 0 };
    updateDowned(w, p);
    return;
  }
  if (p.away) {
    p.vel = { x: 0, y: 0 };
    return;
  }

  updateFacing(p, input);

  if (input.swap && !p.charging && p.burstLeft === 0) {
    p.active = (p.active + 1) % p.guns.length;
    w.events.push({ type: "swap", id: p.id });
  }

  if (stepMovement(w, p, input)) {
    w.events.push({ type: "dash", id: p.id });
    if (p.boosts.dashBurst) playerExplosion(w, p.pos, 34, 8 * p.boosts.dashBurst, 120, p.id, "shock");
  }

  if (input.skill && p.skillCharge >= 1) {
    p.skillCharge = 0;
    const s = hero.skill;
    w.domes.push({ id: newId(w), ownerId: p.id, pos: { ...p.pos }, radius: s.radius, t: s.durationMs / 1000, maxT: s.durationMs / 1000 });
    w.events.push({ type: "skill", id: p.id, x: p.pos.x, y: p.pos.y });
  }

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
      radius: 3, damage: GRENADE.damage * levelMultiplier(p.syncLevel), pierce: 0, bounces: 0, knockback: GRENADE.knockback, life: 99, hitIds: [], gunUid: -1,
      lob: { from: { ...p.pos }, to, t: 0, dur: d / GRENADE.speed, radius: GRENADE.radius },
    });
    p.grenadeCd = GRENADE.cooldownMs / 1000;
    w.events.push({ type: "grenade", id: p.id });
  }

  updateShooting(w, p, input);
}

/** Downed: either Second Wind is counting down, or teammates standing close fill the revive bar. */
function updateDowned(w: World, p: Player): void {
  if (p.reviveT !== Infinity) {
    p.reviveT -= DT;
    if (p.reviveT <= 0) revive(w, p, -1, 0.5);
    return;
  }
  const helpers = w.players.filter((o) => o !== p && canAct(o) && dist(o.pos, p.pos) < REVIVE.reach + o.radius);
  if (helpers.length > 0) {
    // A second helper speeds it up a little; stacking the whole party doesn't trivialize it.
    p.reviveProgress += (DT * (1 + 0.5 * (helpers.length - 1))) / REVIVE.seconds;
    if (p.reviveProgress >= 1) revive(w, p, helpers[0]!.id, REVIVE.hpFrac);
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
    lucky.reviveT = 3;
    w.events.push({ type: "secondWind", id: lucky.id });
    return;
  }
  w.gameOver = true;
  w.events.push({ type: "gameOver" });
}

/** Resolves where a shot goes. Returns an offset whose length matters for lobbed guns. */
function resolveAim(w: World, p: Player, input: PlayerInput, range: number): Vec {
  if (!input.autoAim && len(input.aim) > 1) return input.aim;
  const target = nearestEnemy(w, p.pos, range * 1.15);
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
    p.shotCd = s.fireDelayMs / 1000;
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

function fireGun(w: World, p: Player, gun: Gun, aim: Vec): void {
  const s = gunStats(gun);
  const base = angleOf(aim);
  const muzzle = add(p.pos, fromAngle(base, p.radius + 5));
  w.events.push({ type: "shot", playerId: p.id, x: muzzle.x, y: muzzle.y, angle: base, archetype: s.archetype, element: gun.element });

  const common = {
    owner: "player" as const, ownerId: p.id, kind: s.archetype, element: gun.element, damage: s.damage * levelMultiplier(p.syncLevel), knockback: s.knockback, hitIds: [] as number[], gunUid: gun.uid,
  };
  if (s.lob) {
    const d = clamp(len(aim), 24, s.range);
    w.projectiles.push({
      ...common, id: newId(w), pos: { ...muzzle }, vel: { x: 0, y: 0 }, radius: s.projRadius, pierce: 0, bounces: 0, life: 99,
      lob: { from: muzzle, to: add(p.pos, fromAngle(base, d)), t: 0, dur: d / s.speed, radius: s.lob.radius },
    });
    return;
  }

  const bounces = (gun.perks.includes("bounce") ? 1 : 0) + (p.boosts.bounce ?? 0);
  const spread = (s.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < s.pellets; i++) {
    let a = base;
    if (s.pellets > 1) a += (i / (s.pellets - 1) - 0.5) * spread + (rand(w) - 0.5) * spread * 0.15;
    else if (spread > 0) a += (rand(w) - 0.5) * spread;
    // Shotgun pellets vary in speed a little so the cone looks chunky, not like a fan.
    const speed = s.pellets > 1 ? s.speed * (0.9 + rand(w) * 0.2) : s.speed;
    w.projectiles.push({
      ...common, hitIds: [], id: newId(w), pos: { ...muzzle }, vel: fromAngle(a, speed), radius: s.projRadius, pierce: s.pierce, bounces,
      // Bouncing shots get a little extra range to use their bounce.
      life: (s.range / s.speed) * (bounces > 0 ? 1.4 : 1),
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
    if (pk.used || pk.kind === "heal") continue;
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
    } else if (pk.kind === "shrine" && pk.boost) {
      p.boosts[pk.boost] = (p.boosts[pk.boost] ?? 0) + 1;
      pk.used = true;
      w.events.push({ type: "shrine", id: p.id, boost: pk.boost });
    } else if (pk.kind === "chest") {
      pk.used = true;
      w.events.push({ type: "chestOpened", x: pk.pos.x, y: pk.pos.y });
      dropGun(w, add(pk.pos, { x: -22, y: 26 }), 0.5 + w.run.tier * 0.3, "uncommon");
      dropGun(w, add(pk.pos, { x: 22, y: 26 }), 0.5 + w.run.tier * 0.3, "uncommon");
    }
  });
}

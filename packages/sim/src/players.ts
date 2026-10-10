import { confine, DT, nearestEnemy, newId, playerExplosion } from "./combat";
import { GRENADE, GUNS } from "./data/guns";
import { DASH, HEROES } from "./data/heroes";
import { add, angleOf, clamp, clampLen, dist, fromAngle, len, norm, rand, scale, sub, type Vec } from "./math";
import type { Gun, Player, PlayerInput, World } from "./types";

export function makeGun(defId: string): Gun {
  const def = GUNS[defId]!;
  return { defId, element: "none", rarity: "common", pips: def.pips };
}

export function makePlayer(w: World, heroId: string, pos: Vec): Player {
  const hero = HEROES[heroId]!;
  return {
    id: newId(w),
    heroId,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: hero.radius,
    hp: hero.maxHp,
    maxHp: hero.maxHp,
    facing: { x: 1, y: 0 },
    guns: [makeGun("pistol"), makeGun("shotgun")],
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
    selfRevives: 1,
  };
}

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
};

export function updatePlayer(w: World, p: Player, input: PlayerInput): void {
  const hero = HEROES[p.heroId]!;

  p.dashCd = Math.max(0, p.dashCd - DT);
  p.iframes = Math.max(0, p.iframes - DT);
  p.hurtT = Math.max(0, p.hurtT - DT);
  p.grenadeCd = Math.max(0, p.grenadeCd - DT);
  p.shotCd = Math.max(0, p.shotCd - DT);
  // Every carried gun reloads, holstered or not: generous on purpose.
  for (const g of p.guns) {
    const def = GUNS[g.defId]!;
    if (g.pips < def.pips) g.pips = Math.min(def.pips, g.pips + (DT * 1000) / def.reloadMs);
  }

  if (p.downed) {
    p.vel = { x: 0, y: 0 };
    p.reviveT -= DT;
    if (p.reviveT <= 0) revive(w, p);
    return;
  }

  // Facing follows the aim, or the movement when not aiming.
  if (len(input.aim) > 1) p.facing = norm(input.aim);
  else if (len(input.move) > 0.1 && !p.charging && p.burstLeft === 0) p.facing = norm(input.move);

  if (input.swap && !p.charging && p.burstLeft === 0) {
    p.active = (p.active + 1) % p.guns.length;
    w.events.push({ type: "swap", id: p.id });
  }

  if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
    p.dashDir = len(input.move) > 0.1 ? norm(input.move) : { ...p.facing };
    p.dashT = DASH.durationMs / 1000;
    p.dashCd = DASH.cooldownMs / 1000;
    p.iframes = Math.max(p.iframes, DASH.iframesMs / 1000);
    p.charging = false; // Dashing cancels a sniper charge; the pip is already spent.
    w.events.push({ type: "dash", id: p.id });
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
      id: newId(w),
      owner: "player",
      ownerId: p.id,
      kind: "grenade",
      pos: { ...p.pos },
      vel: { x: 0, y: 0 },
      radius: 3,
      damage: GRENADE.damage,
      pierce: 0,
      knockback: GRENADE.knockback,
      life: 99,
      hitIds: [],
      lob: { from: { ...p.pos }, to, t: 0, dur: d / GRENADE.speed, radius: GRENADE.radius },
    });
    p.grenadeCd = GRENADE.cooldownMs / 1000;
    w.events.push({ type: "grenade", id: p.id });
  }

  updateShooting(w, p, input);
}

function revive(w: World, p: Player): void {
  p.downed = false;
  p.hp = Math.round(p.maxHp * 0.5);
  p.iframes = 2;
  w.events.push({ type: "playerRevived", id: p.id });
  // Second Wind shockwave: shoves everything away without hurting it much.
  playerExplosion(w, p.pos, 60, 1, 260, p.id);
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
  const def = GUNS[gun.defId]!;

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
      p.burstT += def.shotIntervalMs / 1000;
    }
    return;
  }

  if (input.fire && p.shotCd <= 0 && gun.pips >= 1) {
    const aim = resolveAim(w, p, input, def.range);
    gun.pips -= 1;
    p.shotCd = def.fireDelayMs / 1000;
    p.shotAim = aim;
    p.facing = norm(aim);
    if (def.chargeMs > 0) {
      p.charging = true;
      p.chargeT = def.chargeMs / 1000;
      w.events.push({ type: "charge", playerId: p.id });
    } else {
      fireGun(w, p, gun, aim);
      p.burstLeft = def.shotsPerPip - 1;
      p.burstT = def.shotIntervalMs / 1000;
    }
  }
}

function fireGun(w: World, p: Player, gun: Gun, aim: Vec): void {
  const def = GUNS[gun.defId]!;
  const base = angleOf(aim);
  const muzzle = add(p.pos, fromAngle(base, p.radius + 5));
  w.events.push({ type: "shot", playerId: p.id, x: muzzle.x, y: muzzle.y, angle: base, archetype: def.archetype });

  if (def.lob) {
    const d = clamp(len(aim), 24, def.range);
    w.projectiles.push({
      id: newId(w),
      owner: "player",
      ownerId: p.id,
      kind: def.archetype,
      pos: { ...muzzle },
      vel: { x: 0, y: 0 },
      radius: def.projRadius,
      damage: def.damage,
      pierce: 0,
      knockback: def.knockback,
      life: 99,
      hitIds: [],
      lob: { from: muzzle, to: add(p.pos, fromAngle(base, d)), t: 0, dur: d / def.speed, radius: def.lob.radius },
    });
    return;
  }

  const spread = (def.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < def.pellets; i++) {
    let a = base;
    if (def.pellets > 1) a += (i / (def.pellets - 1) - 0.5) * spread + (rand(w) - 0.5) * spread * 0.15;
    else if (spread > 0) a += (rand(w) - 0.5) * spread;
    // Shotgun pellets vary in speed a little so the cone looks chunky, not like a fan.
    const speed = def.pellets > 1 ? def.speed * (0.9 + rand(w) * 0.2) : def.speed;
    w.projectiles.push({
      id: newId(w),
      owner: "player",
      ownerId: p.id,
      kind: def.archetype,
      pos: { ...muzzle },
      vel: fromAngle(a, speed),
      radius: def.projRadius,
      damage: def.damage,
      pierce: def.pierce,
      knockback: def.knockback,
      life: def.range / def.speed,
      hitIds: [],
    });
  }
}

/** Standing on a gun pedestal for a moment swaps it with the gun in your hands. */
export function updatePickups(w: World): void {
  for (const pk of w.pickups) {
    const p = w.players.find((pl) => !pl.downed && dist(pl.pos, pk.pos) < 14);
    if (!p) {
      pk.standT = 0;
      pk.armed = true;
      continue;
    }
    if (!pk.armed) continue;
    pk.standT += DT;
    if (pk.standT >= 0.6) {
      const old = p.guns[p.active]!;
      p.guns[p.active] = pk.gun;
      pk.gun = old;
      p.burstLeft = 0;
      p.charging = false;
      pk.standT = 0;
      pk.armed = false;
      w.events.push({ type: "pickup", id: p.id, defId: p.guns[p.active]!.defId });
    }
  }
}


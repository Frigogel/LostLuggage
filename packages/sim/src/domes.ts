// The Vanguard's dome and the skill nodes that change it: following you around, zapping, shoving, healing,
// exploding at the end, and sending enemy shots back where they came from.
import { damageEnemy, DT, nearestEnemy, playerExplosion, targetable } from "./combat";
import { ENEMIES } from "./data/enemies";
import { levelMultiplier } from "./data/heroes";
import { add, dist, len, norm, scale, sub } from "./math";
import { canAct, hasSkill } from "./players";
import type { Dome, Player, Projectile, World } from "./types";

/** Capacitor: zap damage gained per blocked shot, and its ceiling. */
const CAPACITOR = { perShot: 2, max: 20 };

const ownerOf = (w: World, d: Dome): Player | undefined => w.players.find((p) => p.id === d.ownerId);

/** Skill damage scales like gun damage: level (synced in co-op) and souvenirs. */
const skillDamage = (p: Player, base: number) => base * levelMultiplier(p.syncLevel) * p.mods.damage;

export function updateDomes(w: World): void {
  for (const d of w.domes) {
    const owner = ownerOf(w, d);
    if (owner && hasSkill(owner, "vg_moving") && canAct(owner)) d.pos = { ...owner.pos };
    d.t -= DT;
    d.tickT -= DT;
    if (owner && d.tickT <= 0) {
      d.tickT = hasSkill(owner, "vg_thunder") ? 0.5 : 1;
      domeTick(w, d, owner);
    }
    if (d.t <= 0 && owner && hasSkill(owner, "vg_overload")) {
      playerExplosion(w, d.pos, d.radius + 14, skillDamage(owner, 25 + d.bonus * 2), 220, owner.id, "shock");
    }
  }
  w.domes = w.domes.filter((d) => d.t > 0);
}

/** Once a second (twice with Thunderdome): zap, shove and heal around the dome. */
function domeTick(w: World, d: Dome, owner: Player): void {
  let pulse = 0;
  if (hasSkill(owner, "vg_cling")) {
    const reach = d.radius + (hasSkill(owner, "vg_thunder") ? 24 : 12);
    for (const e of [...w.enemies]) {
      if (!targetable(e) || dist(e.pos, d.pos) > reach + e.radius) continue;
      // Without Bug Zapper the zap is a plain hit; with it, it's a real shock hit that chains.
      damageEnemy(w, e, skillDamage(owner, 6 + d.bonus), { dir: sub(e.pos, d.pos), knockback: 30, sourcePlayerId: owner.id, element: "shock", secondary: !hasSkill(owner, "vg_zapper") });
    }
    pulse = reach;
  }
  if (hasSkill(owner, "vg_bouncer")) {
    for (const e of [...w.enemies]) {
      if (!targetable(e) || dist(e.pos, d.pos) > d.radius + e.radius + 6) continue;
      const out = sub(e.pos, d.pos);
      const boss = !!ENEMIES[e.defId]!.boss;
      if (!boss) e.knock = add(e.knock, scale(norm(len(out) > 0.01 ? out : { x: 1, y: 0 }), 280));
      damageEnemy(w, e, skillDamage(owner, 5), { dir: out, knockback: 0, sourcePlayerId: owner.id, element: "none", secondary: true });
    }
    pulse = Math.max(pulse, d.radius + 6);
  }
  if (hasSkill(owner, "vg_patch")) {
    for (const p of w.players) {
      if (!canAct(p) || p.hp >= p.maxHp || dist(p.pos, d.pos) > d.radius) continue;
      const amount = Math.min(5, p.maxHp - p.hp);
      p.hp += amount;
      w.events.push({ type: "heal", id: p.id, amount });
    }
  }
  if (pulse > 0) w.events.push({ type: "domePulse", id: d.id, x: d.pos.x, y: d.pos.y, radius: pulse });
}

/** A dome stopped an enemy shot. Returns the dome's owner if the shot should come back at the enemies (Rebound). */
export function domeBlocked(w: World, d: Dome): Player | undefined {
  const owner = ownerOf(w, d);
  if (!owner) return undefined;
  if (hasSkill(owner, "vg_capacitor")) d.bonus = Math.min(CAPACITOR.max, d.bonus + CAPACITOR.perShot);
  return owner;
}

/** Turns an enemy bolt into the player's: back toward whoever fired it, or the nearest enemy. */
export function reflect(w: World, pr: Projectile, by: Player): void {
  const shooter = w.enemies.find((e) => e.id === pr.ownerId && targetable(e)) ?? nearestEnemy(w, pr.pos, 220);
  const speed = Math.max(160, len(pr.vel) * 1.4);
  const dir = shooter ? norm(sub(shooter.pos, pr.pos)) : norm(scale(pr.vel, -1));
  pr.owner = "player";
  pr.ownerId = by.id;
  pr.vel = scale(dir, speed);
  pr.pos = add(pr.pos, scale(dir, 4));
  // Enemy bolts are tuned against player health; doubled, they sting enemies about as much.
  pr.damage *= 2;
  pr.life = 1.6;
  pr.hitIds = [];
  pr.pierce = 0;
  pr.bounces = 0;
  pr.gunUid = -1;
  pr.special = true;
  if (hasSkill(by, "vg_service")) pr.homing = 6;
  w.events.push({ type: "reflect", x: pr.pos.x, y: pr.pos.y });
}

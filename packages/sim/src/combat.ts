import { HEROES } from "./data/heroes";
import { clamp, dist, norm, pushCircleOutOfRect, scale, sub, add, type Vec } from "./math";
import type { Enemy, Player, World } from "./types";

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

export function newId(w: World): number {
  return w.nextId++;
}

/** Keeps a circle inside the arena and out of obstacles. Mutates `p`. Returns true on any contact. */
export function confine(w: World, p: Vec, r: number): boolean {
  let hit = false;
  for (const o of w.arena.obstacles) hit = pushCircleOutOfRect(p, r, o) || hit;
  const x = clamp(p.x, r, w.arena.w - r);
  const y = clamp(p.y, r, w.arena.h - r);
  if (x !== p.x || y !== p.y) hit = true;
  p.x = x;
  p.y = y;
  return hit;
}

export function insideArenaSolid(w: World, p: Vec): boolean {
  if (p.x < 0 || p.y < 0 || p.x > w.arena.w || p.y > w.arena.h) return true;
  for (const o of w.arena.obstacles) {
    if (p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h) return true;
  }
  return false;
}

export function clampToArena(w: World, p: Vec, margin: number): Vec {
  return { x: clamp(p.x, margin, w.arena.w - margin), y: clamp(p.y, margin, w.arena.h - margin) };
}

export function activeEnemies(w: World): Enemy[] {
  return w.enemies.filter((e) => e.spawnT <= 0);
}

export function nearestEnemy(w: World, from: Vec, maxRange = Infinity): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = maxRange;
  for (const e of w.enemies) {
    if (e.spawnT > 0) continue;
    const d = dist(from, e.pos) - e.radius;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function nearestPlayer(w: World, from: Vec): Player | undefined {
  let best: Player | undefined;
  let bestD = Infinity;
  for (const p of w.players) {
    if (p.downed) continue;
    const d = dist(from, p.pos);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function damageEnemy(w: World, e: Enemy, amount: number, knockDir: Vec, knockback: number, sourcePlayerId: number): void {
  if (e.hp <= 0) return;
  const dealt = Math.min(amount, e.hp);
  e.hp -= amount;
  e.hitFlash = 0.1;
  const k = scale(norm(knockDir), knockback);
  e.knock = add(e.knock, k);

  const p = w.players.find((pl) => pl.id === sourcePlayerId);
  if (p && !p.downed) {
    const hero = HEROES[p.heroId]!;
    p.skillCharge = Math.min(1, p.skillCharge + dealt / hero.skillChargeDamage);
  }

  const kill = e.hp <= 0;
  w.events.push({ type: "hit", x: e.pos.x, y: e.pos.y, targetId: e.id, damage: Math.round(amount), kill });
  if (kill) {
    w.events.push({ type: "enemyDied", x: e.pos.x, y: e.pos.y, id: e.id, defId: e.defId });
    w.director.kills++;
  }
}

export function hurtPlayer(w: World, p: Player, amount: number): boolean {
  if (p.downed || p.iframes > 0) return false;
  p.hp -= amount;
  p.iframes = 0.45;
  p.hurtT = 0.2;
  w.events.push({ type: "playerHurt", id: p.id, damage: amount });
  if (p.hp <= 0) {
    p.hp = 0;
    p.downed = true;
    p.charging = false;
    p.burstLeft = 0;
    const canRevive = p.selfRevives > 0;
    if (canRevive) {
      p.selfRevives--;
      p.reviveT = 3;
    } else {
      p.reviveT = Infinity;
    }
    w.events.push({ type: "playerDowned", id: p.id, canRevive });
  }
  return true;
}

/** Area damage from a player explosion: hurts enemies, never teammates or yourself (for now). */
export function playerExplosion(w: World, at: Vec, radius: number, damage: number, knockback: number, ownerId: number): void {
  w.events.push({ type: "explosion", x: at.x, y: at.y, radius, owner: "player" });
  for (const e of w.enemies) {
    if (e.spawnT > 0 || e.hp <= 0) continue;
    const d = dist(at, e.pos);
    if (d > radius + e.radius) continue;
    // Full damage in the middle, 60% at the edge.
    const falloff = 1 - 0.4 * clamp(d / radius, 0, 1);
    const dir = d > 0.01 ? sub(e.pos, at) : { x: 1, y: 0 };
    damageEnemy(w, e, damage * falloff, dir, knockback, ownerId);
  }
}

export function pointInDome(w: World, p: Vec): boolean {
  return w.domes.some((d) => dist(d.pos, p) < d.radius);
}

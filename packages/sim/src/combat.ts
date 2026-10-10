import { ENEMIES } from "./data/enemies";
import { HEROES } from "./data/heroes";
import { gunStats, rollGun } from "./loot";
import { add, clamp, dist, norm, pushCircleOutOfRect, rand, scale, sub, type Vec } from "./math";
import type { Dome, Element, Enemy, EnemyDef, Player, Status, World } from "./types";

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

export function newId(w: World): number {
  return w.nextId++;
}

export const freshStatus = (): Status => ({ burnT: 0, burnDps: 0, burnSource: 0, burnTick: 0, frost: 0, frozenT: 0, acidT: 0 });

/** Keeps a circle inside the arena and out of obstacles. Mutates `p`. Returns true on any contact. */
export function confine(w: Pick<World, "arena">, p: Vec, r: number): boolean {
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

/** Enemies that can be targeted: arrived, alive and not disguised. */
export function targetable(e: Enemy): boolean {
  return e.spawnT <= 0 && e.hp > 0 && e.state !== "hidden";
}

export function nearestEnemy(w: World, from: Vec, maxRange = Infinity, except = -1): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = maxRange;
  for (const e of w.enemies) {
    if (!targetable(e) || e.id === except) continue;
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
    if (p.downed || p.away) continue;
    const d = dist(from, p.pos);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Element vs defense: the reason to carry two guns with different elements. */
export function elementMultiplier(def: EnemyDef, element: Element): { mult: number; weak: boolean } {
  switch (element) {
    case "fire":
      if (def.fireImmune) return { mult: 0.25, weak: false };
      return def.defense === "flesh" ? { mult: 1.5, weak: true } : def.defense === "armor" ? { mult: 0.75, weak: false } : { mult: 0.9, weak: false };
    case "shock":
      return def.defense === "shield" ? { mult: 1.6, weak: true } : { mult: 0.9, weak: false };
    case "acid":
      return def.defense === "armor" ? { mult: 1.5, weak: true } : { mult: 0.9, weak: false };
    default:
      return { mult: 1, weak: false };
  }
}

export interface DamageOpts {
  dir: Vec;
  knockback: number;
  sourcePlayerId: number;
  element: Element;
  gunUid?: number;
  /** Damage-over-time ticks and chain hits don't re-apply statuses or chain again. */
  secondary?: boolean;
}

export function damageEnemy(w: World, e: Enemy, amount: number, o: DamageOpts): void {
  if (e.hp <= 0 || e.state === "hidden") return;
  const def = ENEMIES[e.defId]!;
  const { mult, weak } = elementMultiplier(def, o.element);
  let dmg = amount * mult;
  if (e.status.acidT > 0 && def.defense === "armor") dmg *= 1.25;

  // Support shields soak damage first; Shock tears through them.
  let hitShield = false;
  if (e.shield > 0) {
    hitShield = true;
    const shieldDmg = o.element === "shock" ? dmg * 2 : dmg;
    if (shieldDmg >= e.shield) {
      dmg = (shieldDmg - e.shield) / (o.element === "shock" ? 2 : 1);
      e.shield = 0;
      w.events.push({ type: "shieldBroken", id: e.id, x: e.pos.x, y: e.pos.y });
    } else {
      e.shield -= shieldDmg;
      dmg = 0;
    }
  }

  const dealt = Math.min(dmg, e.hp);
  e.hp -= dmg;
  e.hitFlash = 0.1;
  if (!def.boss) e.knock = add(e.knock, scale(norm(o.dir), o.knockback));

  const p = w.players.find((pl) => pl.id === o.sourcePlayerId);
  if (p && !p.downed) p.skillCharge = Math.min(1, p.skillCharge + (dealt * p.mods.charge) / HEROES[p.heroId]!.skillChargeDamage);

  if (!o.secondary) applyStatus(w, e, def, amount, o);

  const kill = e.hp <= 0;
  w.events.push({ type: "hit", x: e.pos.x, y: e.pos.y, targetId: e.id, damage: Math.max(1, Math.round(dmg || amount * 0.01)), kill, element: o.element, weak, shield: hitShield && dmg === 0 });
  if (kill) onKill(w, e, def, o, p);
}

function applyStatus(w: World, e: Enemy, def: EnemyDef, amount: number, o: DamageOpts): void {
  const s = e.status;
  switch (o.element) {
    case "fire":
      if (def.fireImmune) return;
      s.burnT = 3;
      s.burnDps = Math.max(s.burnDps, 3 + amount * 0.35);
      s.burnSource = o.sourcePlayerId;
      break;
    case "frost":
      s.frost += Math.max(0.5, amount / 12);
      if (def.boss) s.frost = Math.min(s.frost, 3); // Frost is weak against bosses: slow, never freeze.
      else if (s.frost >= 5 && s.frozenT <= 0) {
        s.frost = 0;
        s.frozenT = 1.6;
        w.events.push({ type: "frozen", id: e.id });
      }
      break;
    case "acid":
      s.acidT = 4;
      break;
    case "shock": {
      const next = nearestEnemy(w, e.pos, 55, e.id);
      if (next) {
        w.events.push({ type: "chain", x1: e.pos.x, y1: e.pos.y, x2: next.pos.x, y2: next.pos.y });
        damageEnemy(w, next, amount * 0.5, { ...o, secondary: true, knockback: 0 });
      }
      break;
    }
  }
}

function onKill(w: World, e: Enemy, def: EnemyDef, o: DamageOpts, p: Player | undefined): void {
  w.events.push({ type: "enemyDied", x: e.pos.x, y: e.pos.y, id: e.id, defId: e.defId });
  w.run.kills++;

  if (def.onDeath?.split) {
    const { enemyId, count } = def.onDeath.split;
    w.events.push({ type: "split", id: e.id, x: e.pos.x, y: e.pos.y });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(w);
      const child = spawnEnemy(w, enemyId, { x: e.pos.x + Math.cos(a) * 6, y: e.pos.y + Math.sin(a) * 6 }, 0);
      child.knock = { x: Math.cos(a) * 140, y: Math.sin(a) * 140 };
      child.parentId = e.id;
    }
  }

  // Loot: guns by the enemy's drop chance, health snacks sometimes.
  const luck = w.run.tier * 0.3 + (def.boss ? 0.9 : 0) + partyLuck(w);
  const drops = def.boss ? 2 : rand(w) < def.dropChance ? 1 : 0;
  for (let i = 0; i < drops; i++) dropGun(w, add(e.pos, { x: (i - (drops - 1) / 2) * 20, y: 0 }), luck, def.boss ? "rare" : "common");
  if (!def.boss && rand(w) < 0.07) dropHeal(w, e.pos, 15);

  if (!p) return;
  const gun = o.gunUid !== undefined ? p.guns.find((g) => g.uid === o.gunUid) : undefined;
  if (gun?.perks.includes("killReload")) gun.pips = Math.min(gunStats(gun).pips, gun.pips + 1);
  if (gun?.perks.includes("hotStreak")) p.streakT = 3;
  if (gun?.perks.includes("volatile")) playerExplosion(w, e.pos, 22, 10, 80, p.id, gun.element, true);
  if (p.boosts.vampire) p.hp = Math.min(p.maxHp, p.hp + 2 * p.boosts.vampire);
  if (p.boosts.burnSpread && e.status.burnT > 0) {
    for (const other of w.enemies) {
      if (other === e || !targetable(other) || dist(other.pos, e.pos) > 40 + 10 * p.boosts.burnSpread) continue;
      const od = ENEMIES[other.defId]!;
      if (od.fireImmune) continue;
      other.status.burnT = 3;
      other.status.burnDps = Math.max(other.status.burnDps, e.status.burnDps);
      other.status.burnSource = p.id;
    }
    w.events.push({ type: "explosion", x: e.pos.x, y: e.pos.y, radius: 40, owner: "player", element: "fire" });
  }
}

/** Lucky Keychain souvenirs: the party's average, so one lucky friend helps a little without dominating. */
export function partyLuck(w: World): number {
  return w.players.length ? w.players.reduce((sum, p) => sum + p.mods.luck, 0) / w.players.length : 0;
}

export function dropGun(w: World, at: Vec, luck: number, minRarity: Parameters<typeof rollGun>[2] = "common"): void {
  const gun = rollGun(w, luck, minRarity);
  const pos = clampToArena(w, at, 16);
  w.pickups.push({ id: newId(w), kind: "gun", pos, gun, used: false });
  w.run.gunsFound++;
  w.events.push({ type: "loot", x: pos.x, y: pos.y, rarity: gun.rarity });
}

export function dropHeal(w: World, at: Vec, amount: number): void {
  w.pickups.push({ id: newId(w), kind: "heal", pos: clampToArena(w, at, 10), heal: amount, used: false });
}

export function spawnEnemy(w: World, defId: string, pos: Vec, spawnDelay: number): Enemy {
  const def = ENEMIES[defId]!;
  const hp = Math.round(def.hp * partyHpMultiplier(w, !!def.boss));
  const e: Enemy = {
    id: newId(w),
    defId,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    knock: { x: 0, y: 0 },
    radius: def.radius,
    hp,
    maxHp: hp,
    shield: 0,
    state: def.movement.type === "ambush" ? "hidden" : "move",
    stateT: 0,
    attackIdx: 0,
    // Stagger first attacks so a fresh wave doesn't fire in unison.
    cooldowns: def.attacks.map((a) => (a.cooldownMs / 1000) * (0.3 + rand(w) * 0.7)),
    attackDir: { x: 1, y: 0 },
    attackPoints: [],
    hitPlayers: [],
    hitFlash: 0,
    spawnT: spawnDelay,
    steer: (rand(w) - 0.5) * 1.4,
    strafe: rand(w) < 0.5 ? -1 : 1,
    status: freshStatus(),
    trailT: 0,
    parentId: 0,
    phase: 0,
  };
  w.enemies.push(e);
  return e;
}

export function hurtPlayer(w: World, p: Player, amount: number): boolean {
  if (p.downed || p.away || p.iframes > 0) return false;
  p.hp -= amount;
  p.iframes = 0.45;
  p.hurtT = 0.2;
  w.events.push({ type: "playerHurt", id: p.id, damage: amount });
  // Panic Room: a free dome when things get bad, once per room.
  if (p.hp > 0 && p.hp < p.maxHp * 0.3 && !p.panicUsed && p.skills.includes("vg_panic")) {
    p.panicUsed = true;
    spawnDome(w, p);
  }
  if (p.hp <= 0) {
    p.hp = 0;
    p.downed = true;
    p.charging = false;
    p.burstLeft = 0;
    // Wait for a teammate. If nobody is left standing, the end of the tick hands out Second Wind (see checkWipe).
    p.reviveT = Infinity;
    p.reviveProgress = 0;
    const canRevive = p.selfRevives > 0 || w.players.some((o) => o !== p && !o.downed && !o.away);
    w.events.push({ type: "playerDowned", id: p.id, canRevive });
  }
  return true;
}

/** Enemy health scales with the party: a bit for regular enemies (there are also more of them), a lot for bosses. */
export function partyHpMultiplier(w: World, boss: boolean): number {
  const extra = Math.max(0, w.players.filter((p) => !p.away).length - 1);
  return 1 + extra * (boss ? 0.7 : 0.2);
}

/** Area damage from a player explosion: hurts enemies, never teammates or yourself (for now). */
export function playerExplosion(w: World, at: Vec, radius: number, damage: number, knockback: number, ownerId: number, element: Element, secondary = false, gunUid?: number): void {
  w.events.push({ type: "explosion", x: at.x, y: at.y, radius, owner: "player", element });
  for (const e of [...w.enemies]) {
    if (!targetable(e)) continue;
    const d = dist(at, e.pos);
    if (d > radius + e.radius) continue;
    // Full damage in the middle, 60% at the edge.
    const falloff = 1 - 0.4 * clamp(d / radius, 0, 1);
    const dir = d > 0.01 ? sub(e.pos, at) : { x: 1, y: 0 };
    damageEnemy(w, e, damage * falloff, { dir, knockback, sourcePlayerId: ownerId, element, secondary, gunUid });
  }
}

/** The dome covering a point, if any. */
export function domeAt(w: World, p: Vec): Dome | undefined {
  return w.domes.find((d) => dist(d.pos, p) < d.radius);
}

export function pointInDome(w: World, p: Vec): boolean {
  return !!domeAt(w, p);
}

/** The Vanguard's action skill, shaped by the Bulkhead branch. */
export function spawnDome(w: World, p: Player): Dome {
  const s = HEROES[p.heroId]!.skill;
  const radius = s.radius * (p.skills.includes("vg_wide") ? 1.3 : 1);
  const t = s.durationMs / 1000 + (p.skills.includes("vg_overtime") ? 2 : 0);
  const d: Dome = { id: newId(w), ownerId: p.id, pos: { ...p.pos }, radius, t, maxT: t, tickT: 0.5, bonus: 0 };
  w.domes.push(d);
  w.events.push({ type: "skill", id: p.id, x: p.pos.x, y: p.pos.y });
  return d;
}

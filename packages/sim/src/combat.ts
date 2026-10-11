import { actDamage, actHp } from "./director";
import { ENEMIES } from "./data/enemies";
import { HEROES, levelMultiplier } from "./data/heroes";
import { ELITE, ELITE_HP, onEliteDeath } from "./elites";
import { onTurretKill, TURRET_GUN } from "./gadgets";
import { gunStats, rollGrenade, rollGun } from "./loot";
import { markBonus, onMarkedDeath } from "./marks";
import { add, clamp, dist, norm, pushCircleOutOfRect, rand, scale, sub, type Vec } from "./math";
import type { Dome, Element, EliteId, Enemy, EnemyDef, HeroSkill, Player, Status, World } from "./types";

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
  for (const o of w.arena.spikes) hit = pushCircleOutOfRect(p, r, o) || hit;
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
  for (const o of w.arena.spikes) {
    if (p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h) return true;
  }
  return false;
}

export function clampToArena(w: World, p: Vec, margin: number): Vec {
  return { x: clamp(p.x, margin, w.arena.w - margin), y: clamp(p.y, margin, w.arena.h - margin) };
}

/** Enemies that can be targeted: arrived, alive, not disguised and not under the water. */
export function targetable(e: Enemy): boolean {
  return e.spawnT <= 0 && e.hp > 0 && e.state !== "hidden" && !submerged(e);
}

/** A boss swimming under the water (Submerge): out of reach until it comes up. */
export function submerged(e: Pick<Enemy, "defId" | "state" | "attackIdx">): boolean {
  return e.state === "attack" && ENEMIES[e.defId]?.attacks[e.attackIdx]?.type === "submerge";
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
    case "frost":
      return def.frostImmune ? { mult: 0.5, weak: false } : { mult: 1, weak: false };
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
  /** Gadget damage doesn't charge the action skill. */
  noCharge?: boolean;
}

/** Skill damage scales like gun damage: level (synced in co-op) and souvenirs. */
export const skillDamage = (p: Player, base: number): number => base * levelMultiplier(p.syncLevel) * p.mods.damage;

export function damageEnemy(w: World, e: Enemy, amount: number, o: DamageOpts): void {
  if (e.hp <= 0 || e.state === "hidden" || submerged(e)) return;
  const def = ENEMIES[e.defId]!;
  const { mult, weak } = elementMultiplier(def, o.element);
  let dmg = amount * mult;
  if (e.status.acidT > 0 && def.defense === "armor") dmg *= 1.25;
  const p = w.players.find((pl) => pl.id === o.sourcePlayerId);
  const mark = markBonus(w, e, p, !!o.secondary);
  dmg *= mark.mult;
  if (e.status.acidT > 0 && def.defense === "armor" && p?.boosts.meltdown) dmg *= 1.6 / 1.25;
  // Wildfire: anything burning takes more from everyone.
  if (e.status.burnT > 0 && w.players.some((pl) => pl.boosts.wildfire)) dmg *= 1.4;
  let crit = false;
  if (p) {
    const boost = boostDamage(w, p, e, def, weak, !!o.secondary);
    dmg *= boost.mult;
    crit = boost.crit;
    // Shatter: a frozen enemy takes triple, and the freeze breaks in a burst of ice.
    if (p.boosts.shatter && e.status.frozenT > 0 && !o.secondary) {
      dmg *= 3;
      e.status.frozenT = 0;
      crit = true;
      playerExplosion(w, e.pos, 30, 12, 120, p.id, "frost", true);
    }
  }

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

  if (p && !p.downed && !o.noCharge) p.skillCharge = Math.min(1, p.skillCharge + (dealt * p.mods.charge) / HEROES[p.heroId]!.skillChargeDamage);

  if (!o.secondary) applyStatus(w, e, def, amount, o);
  if (!o.secondary && p && e.hp > 0) procBoosts(w, e, def, amount, o, p);

  const kill = e.hp <= 0;
  w.events.push({ type: "hit", x: e.pos.x, y: e.pos.y, targetId: e.id, damage: Math.max(1, Math.round(dmg || amount * 0.01)), kill, element: o.element, weak: weak || mark.crit || crit, shield: hitShield && dmg === 0 });
  if (mark.crit || crit) w.events.push({ type: "crit", x: e.pos.x, y: e.pos.y });
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
      // Frost is weak against bosses and useless against the frost-immune: slow, never freeze.
      if (def.boss || def.frostImmune) s.frost = Math.min(s.frost, def.frostImmune ? 1.5 : 3);
      else if (s.frost >= 5 && s.frozenT <= 0) {
        s.frost = 0;
        s.frozenT = 1.6;
        w.events.push({ type: "frozen", id: e.id });
      }
      break;
    case "acid":
      s.acidT = w.players.find((pl) => pl.id === o.sourcePlayerId)?.boosts.meltdown ? 8 : 4;
      break;
    case "shock": {
      // Overload: the chain keeps jumping.
      const jumps = 1 + (w.players.find((pl) => pl.id === o.sourcePlayerId)?.boosts.overload ? 2 : 0);
      chain(w, e, amount * 0.5, o, jumps);
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

  onEliteDeath(w, e, def);
  onMarkedDeath(w, e);

  // Loot: guns and grenades by the enemy's drop chance (elites twice as likely, and luckier), health snacks sometimes.
  if (!e.noLoot) {
    const luck = w.run.tier * 0.3 + (def.boss ? 0.9 : 0) + (e.elite ? 0.4 : 0) + partyLuck(w);
    // Rush Hour pays double.
    const rush = w.run.room.twist === "rush" ? 2 : 1;
    const drops = def.boss ? 2 : rand(w) < def.dropChance * (e.elite ? 2 : 1) * rush ? 1 : 0;
    for (let i = 0; i < drops; i++) dropGun(w, add(e.pos, { x: (i - (drops - 1) / 2) * 20, y: 0 }), luck, def.boss ? "rare" : e.elite ? "uncommon" : "common");
    // Grenades: rarer than guns, and every boss leaves a good one.
    if (def.boss || rand(w) < def.dropChance * 0.5 * (e.elite ? 2 : 1) * rush) dropGrenade(w, add(e.pos, { x: 0, y: drops > 0 ? 16 : 0 }), luck, def.boss ? "rare" : e.elite ? "uncommon" : "common");
    if (!def.boss && rand(w) < 0.07) dropHeal(w, e.pos, 15);
  }

  if (!p) return;
  if (o.gunUid === TURRET_GUN) onTurretKill(w, e, p);
  const gun = o.gunUid !== undefined ? p.guns.find((g) => g.uid === o.gunUid) : undefined;
  if (gun?.perks.includes("killReload")) gun.pips = Math.min(gunStats(gun).pips, gun.pips + 1);
  if (gun?.perks.includes("hotStreak")) p.streakT = 3;
  if (gun?.perks.includes("volatile")) playerExplosion(w, e.pos, 22, 10, 80, p.id, gun.element, true);
  if (p.boosts.vampire) p.hp = Math.min(p.maxHp, p.hp + 2 * p.boosts.vampire);
  if (p.boosts.souvenirs) playerExplosion(w, e.pos, 30, 15 * p.boosts.souvenirs * levelMultiplier(p.syncLevel), 100, p.id, "none", true);
  if (p.boosts.refill) {
    const g = p.guns[p.active]!;
    g.pips = Math.min(gunStats(g).pips, g.pips + 0.5 * p.boosts.refill);
  }
  if (p.boosts.miles) p.skillCharge = Math.min(1, p.skillCharge + 0.03 * p.boosts.miles);
  if (p.boosts.rush) p.dashCd = Math.max(0, p.dashCd - 0.5 * p.boosts.rush);
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

export function dropGrenade(w: World, at: Vec, luck: number, minRarity: Parameters<typeof rollGrenade>[2] = "common"): void {
  const grenade = rollGrenade(w, luck, minRarity);
  const pos = clampToArena(w, at, 16);
  w.pickups.push({ id: newId(w), kind: "grenade", pos, grenade, used: false });
  w.events.push({ type: "loot", x: pos.x, y: pos.y, rarity: grenade.rarity });
}

export function dropHeal(w: World, at: Vec, amount: number): void {
  w.pickups.push({ id: newId(w), kind: "heal", pos: clampToArena(w, at, 10), heal: amount, used: false });
}

export function spawnEnemy(w: World, defId: string, pos: Vec, spawnDelay: number, elite?: EliteId): Enemy {
  const def = ENEMIES[defId]!;
  const act = w.run.plans[w.run.room.index]?.act ?? 0;
  const hp = Math.round(def.hp * partyHpMultiplier(w, !!def.boss) * (elite ? ELITE_HP : 1) * actHp(act));
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
    size: 1,
    noLoot: false,
    stunT: 0,
    slowT: 0,
    slow: 0,
    markT: 0,
    markBy: 0,
    taunt: 0,
    guard: elite === "shielded" ? hp * ELITE.guard : 0,
    facing: { x: 0, y: 1 },
    link: 0,
    linkT: 0,
    // Teleporters wait a few seconds before their first blink, so they're seen arriving.
    blinkT: elite === "teleporting" ? 3 + rand(w) * 2 : 0,
    burst: 0,
    dodgeT: 0,
  };
  if (elite) e.elite = elite;
  w.enemies.push(e);
  return e;
}

export function hurtPlayer(w: World, p: Player, raw: number): boolean {
  if (p.downed || p.away || p.iframes > 0) return false;
  // Later acts hit harder; Bubble Wrap takes the edge off.
  const amount = raw * actDamage(w.run.plans[w.run.room.index]?.act ?? 0) * Math.pow(0.9, p.boosts.bubbleWrap ?? 0);
  // Overheal shields soak the hit first.
  const soaked = Math.min(p.shield, amount);
  p.shield -= soaked;
  p.hp -= amount - soaked;
  p.iframes = 0.45;
  p.hurtT = 0.2;
  w.events.push({ type: "playerHurt", id: p.id, damage: amount });
  // Do Not Disturb: getting hit zaps everything close.
  if (p.boosts.dnd) playerExplosion(w, p.pos, 50, 20 * p.boosts.dnd * levelMultiplier(p.syncLevel), 200, p.id, "shock", true);
  // Guardian Owl: once per owl, a nearby ally who would go down stays up at 1 HP.
  if (p.hp <= 0) {
    const owl = w.gadgets.find((g) => g.kind === "drone" && !g.saved && dist(g.pos, p.pos) < 70 && w.players.find((o) => o.id === g.ownerId)?.skills.includes("wd_guardian"));
    if (owl) {
      owl.saved = true;
      p.hp = 1;
      p.iframes = 1.2;
      w.events.push({ type: "saved", id: p.id });
    }
  }
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

/** Overheal shield caps (Warden's Overheal and Bubble Wrap). */
export const OVERHEAL = { cap: 30, padded: 60 };

/** Heals a player. With a Warden's Overheal, what doesn't fit becomes a shield. Returns the amount that landed. */
export function healPlayer(w: World, p: Player, amount: number, healer?: Player): number {
  if (p.downed || p.away || amount <= 0) return 0;
  const toHp = Math.min(amount, p.maxHp - p.hp);
  p.hp += toHp;
  let toShield = 0;
  if (healer?.skills.includes("wd_overheal")) {
    const cap = healer.skills.includes("wd_padding") ? OVERHEAL.padded : OVERHEAL.cap;
    toShield = Math.max(0, Math.min(amount - toHp, cap - p.shield));
    p.shield += toShield;
  }
  const total = toHp + toShield;
  if (total > 0) w.events.push({ type: "heal", id: p.id, amount: total });
  return total;
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
  // Panic Room can pop a dome for any hero shape, so fall back to the Vanguard's numbers.
  const hs = HEROES[p.heroId]!.skill;
  const s = hs.type === "dome" ? hs : (HEROES.vanguard!.skill as Extract<HeroSkill, { type: "dome" }>);
  // Signatures: the black hole is smaller; the revolving door is short-lived.
  const sig = p.signature === "sig_blackhole" ? 0.8 : 1;
  const radius = s.radius * (p.skills.includes("vg_wide") ? 1.3 : 1) * sig;
  const t = (s.durationMs / 1000 + (p.skills.includes("vg_overtime") ? 2 : 0)) * (p.signature === "sig_revolving" ? 0.55 : 1);
  const d: Dome = { id: newId(w), ownerId: p.id, pos: { ...p.pos }, radius, t, maxT: t, tickT: 0.5, bonus: 0 };
  w.domes.push(d);
  w.events.push({ type: "skill", id: p.id, x: p.pos.x, y: p.pos.y });
  return d;
}

/** Shock chains: hop to the nearest enemy not hit yet, `jumps` times. */
function chain(w: World, from: Enemy, damage: number, o: DamageOpts, jumps: number): void {
  const hit = [from.id];
  let at = from;
  for (let i = 0; i < jumps; i++) {
    let next: Enemy | undefined;
    let best = 55;
    for (const e of w.enemies) {
      if (!targetable(e) || hit.includes(e.id)) continue;
      const d = dist(at.pos, e.pos) - e.radius;
      if (d < best) {
        best = d;
        next = e;
      }
    }
    if (!next) return;
    w.events.push({ type: "chain", x1: at.pos.x, y1: at.pos.y, x2: next.pos.x, y2: next.pos.y });
    damageEnemy(w, next, damage, { ...o, secondary: true, knockback: 0 });
    hit.push(next.id);
    at = next;
  }
}

/** Run boosts that change how hard a player's hits land. */
function boostDamage(w: World, p: Player, e: Enemy, def: EnemyDef, weak: boolean, secondary: boolean): { mult: number; crit: boolean } {
  const n = (id: string) => p.boosts[id] ?? 0;
  let mult = 1;
  if (n("lastCall") && e.hp < e.maxHp * 0.3) mult *= 1 + 0.5 * n("lastCall");
  if (n("priority") && (e.elite || def.boss)) mult *= 1 + 0.25 * n("priority");
  const d = dist(p.pos, e.pos);
  if (n("personal") && d < 70) mult *= 1 + 0.3 * n("personal");
  if (n("window") && d > 150) mult *= 1 + 0.3 * n("window");
  if (n("emergency") && p.hp < p.maxHp * 0.3) mult *= 1 + 0.4 * n("emergency");
  if (n("adapter") && weak) mult *= 1 + 0.25 * n("adapter");
  if (n("buddy") && w.players.some((o) => o !== p && !o.downed && !o.away && dist(o.pos, p.pos) < 90)) mult *= 1 + 0.15 * n("buddy");
  let crit = false;
  if (!secondary && n("firstClass") && rand(w) < 0.1 * n("firstClass")) {
    crit = true;
    mult *= n("upgrade") ? 3 : 2;
  }
  return { mult, crit };
}

/** On-hit chances from run boosts: set alight, chill, zap, melt. */
function procBoosts(w: World, e: Enemy, def: EnemyDef, amount: number, o: DamageOpts, p: Player): void {
  const n = (id: string) => p.boosts[id] ?? 0;
  const s = e.status;
  if (n("hotSauce") && !def.fireImmune && rand(w) < 0.15 * n("hotSauce")) {
    s.burnT = 3;
    s.burnDps = Math.max(s.burnDps, 3 + amount * 0.3);
    s.burnSource = p.id;
  }
  if (n("extraIce") && rand(w) < 0.15 * n("extraIce")) applyStatus(w, e, def, Math.max(18, amount), { ...o, element: "frost" });
  if (n("staticSocks") && rand(w) < 0.15 * n("staticSocks")) chain(w, e, amount * 0.5, { ...o, element: "shock" }, 1 + (n("overload") ? 2 : 0));
  if (n("shampoo") && rand(w) < 0.15 * n("shampoo")) s.acidT = Math.max(s.acidT, n("meltdown") ? 8 : 4);
}

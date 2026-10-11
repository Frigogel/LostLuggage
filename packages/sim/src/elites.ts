// Elite modifiers: any enemy can roll one, and it changes how the fight plays, not just the numbers
// (design doc: Elite modifiers). The director spends part of a room's budget on them.
import { clampToArena, DT, insideArenaSolid, newId, spawnEnemy, targetable } from "./combat";
import { ENEMIES } from "./data/enemies";
import { add, angleOf, dist, dot, fromAngle, norm, scale, sub, type Vec } from "./math";
import type { EliteId, Enemy, EnemyDef, Projectile, World } from "./types";

export interface EliteDef {
  id: EliteId;
  name: string;
  /** What to do about it, in a few words: shown the first time you meet one. */
  hint: string;
}

export const ELITES: Record<EliteId, EliteDef> = {
  shielded: { id: "shielded", name: "Shielded", hint: "Front shield. Flank it, lob over it, or hit it while it swings" },
  splitting: { id: "splitting", name: "Splitting", hint: "Splits into two smaller copies" },
  teleporting: { id: "teleporting", name: "Teleporting", hint: "Blinks behind you. Watch for the shimmer" },
  vengeful: { id: "vengeful", name: "Vengeful", hint: "Explodes when it dies. Step back" },
  linked: { id: "linked", name: "Linked", hint: "Kill both within 4 seconds, or one comes back" },
  hasted: { id: "hasted", name: "Hasted", hint: "Faster attacks, shorter windups" },
};
export const ELITE_IDS = Object.keys(ELITES) as EliteId[];

/** Elites are tougher than their plain kind. */
export const ELITE_HP = 1.6;

export const ELITE = {
  /** Hasted: windups and cooldowns this much faster, and a little quicker on its feet. */
  haste: 1.4,
  hasteSpeed: 1.2,
  /** Shielded: how fast it turns to face you, and how square-on a shot must be to bounce off. */
  shieldTurn: 1.8,
  shieldArc: 0.35,
  /** The front shield shatters after soaking this share of the elite's health. */
  guard: 0.5,
  /** Teleporting: time between blinks, the shimmer warning, and how far behind you it lands. */
  blinkEvery: 4.5,
  blinkWarn: 0.7,
  blinkBehind: 30,
  /** Vengeful: the death blast. */
  vengeful: { delay: 0.9, radius: 38, damage: 16 },
  /** Splitting: the copies. */
  split: { count: 2, hp: 0.35, size: 0.75 },
  /** Linked: seconds to kill the second one. */
  linkS: 4,
};

/** Which enemies can carry which modifiers. Bosses never roll one. */
export function canBeElite(def: EnemyDef, id: EliteId): boolean {
  if (def.boss || def.role === "swarmer" || def.threatCost === 0) return false;
  const still = def.movement.type === "stationary";
  switch (id) {
    case "shielded":
      // Only things that come to you: a shooter that always faces you from range is no fun.
      return def.role === "bruiser" || def.role === "charger" || def.role === "splitter";
    case "splitting":
      return !still && !def.onDeath?.split;
    case "teleporting":
      // A grabber blinking away would take whoever it's holding with it.
      return !still && def.movement.type !== "ambush" && def.role !== "grabber";
    case "linked":
    case "vengeful":
    case "hasted":
      return true;
  }
}

/** Hasted elites run their attack clock faster. */
export const eliteHaste = (e: Enemy): number => (e.elite === "hasted" ? ELITE.haste : 1);
export const eliteSpeed = (e: Enemy): number => (e.elite === "hasted" ? ELITE.hasteSpeed : 1);

/** Per-tick elite behavior. Returns true while a teleporter is mid-blink (it stands still and doesn't attack). */
export function updateElite(w: World, e: Enemy, target: { pos: Vec; facing?: Vec } | undefined): boolean {
  // Everyone turns toward their target; only the shielded care, and they turn slowly so you can get around.
  if (target) {
    const want = angleOf(sub(target.pos, e.pos));
    const cur = angleOf(e.facing);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = e.elite === "shielded" ? ELITE.shieldTurn * DT : Math.PI;
    e.facing = fromAngle(cur + Math.max(-turn, Math.min(turn, diff)));
  }

  if (e.elite === "linked" && e.linkT > 0) {
    e.linkT -= DT;
    if (e.linkT <= 0) relink(w, e);
  }

  if (e.elite !== "teleporting" || !target || e.state !== "move") return false;
  if (e.blinkTo) {
    e.blinkT -= DT;
    if (e.blinkT > 0) return true;
    e.pos = { ...e.blinkTo };
    e.blinkTo = undefined;
    e.blinkT = ELITE.blinkEvery;
    w.events.push({ type: "blink", id: e.id, x: e.pos.x, y: e.pos.y, done: true });
    return false;
  }
  e.blinkT -= DT;
  if (e.blinkT > 0 || dist(e.pos, target.pos) < 50) return false;
  const behind = blinkSpot(w, e, target);
  if (!behind) {
    e.blinkT = 1;
    return false;
  }
  e.blinkTo = behind;
  e.blinkT = ELITE.blinkWarn;
  w.events.push({ type: "blink", id: e.id, x: behind.x, y: behind.y, done: false });
  return true;
}

/** A clear spot behind the target (or beside it, if a crate is in the way). */
function blinkSpot(w: World, e: Enemy, target: { pos: Vec; facing?: Vec }): Vec | undefined {
  const back = scale(target.facing ?? norm(sub(target.pos, e.pos)), -1);
  for (const turn of [0, 0.9, -0.9, 1.8, -1.8]) {
    const dir = fromAngle(angleOf(back) + turn);
    const at = clampToArena(w, add(target.pos, scale(dir, ELITE.blinkBehind + e.radius)), e.radius + 4);
    const clear = [at, add(at, { x: e.radius, y: 0 }), add(at, { x: -e.radius, y: 0 }), add(at, { x: 0, y: e.radius }), add(at, { x: 0, y: -e.radius })].every((p) => !insideArenaSolid(w, p));
    if (clear && dist(at, target.pos) > 16) return at;
  }
  return undefined;
}

/**
 * Customs Officer: the elite's modifier is confiscated, and so is any shield bar a support gave it. It keeps its
 * health; it just plays like its plain kind from now on (no blinks, no death blast, no copies, no twin coming back).
 */
export function confiscate(w: World, e: Enemy): void {
  if (!e.elite && e.shield <= 0) return;
  if (e.elite === "linked") {
    const partner = w.enemies.find((o) => o.id === e.link);
    if (partner?.link === e.id) partner.link = 0;
    e.link = 0;
    e.linkT = 0;
    e.linkGhost = undefined;
  }
  delete e.elite;
  e.guard = 0;
  e.blinkTo = undefined;
  e.blinkT = 0;
  e.shield = 0;
  w.events.push({ type: "confiscate", id: e.id, x: e.pos.x, y: e.pos.y });
}

/** A shielded elite has its shield up: not while stunned, frozen, or swinging (it needs both hands to attack). */
export const shieldUp = (e: Enemy): boolean => e.elite === "shielded" && e.guard > 0 && e.stunT <= 0 && e.status.frozenT <= 0 && (e.state === "move" || e.state === "reveal");

/** Shielded: shots flying into its face bounce off. Explosions, lobs, burns and zaps still work. */
export function shieldBlocks(w: World, e: Enemy, pr: Projectile): boolean {
  if (!shieldUp(e) || dot(norm(pr.vel), e.facing) >= -ELITE.shieldArc) return false;
  // Enough punishment and it breaks anyway: flanking is faster, not the only way.
  e.guard -= pr.damage;
  if (e.guard <= 0) {
    e.guard = 0;
    w.events.push({ type: "shieldBroken", id: e.id, x: e.pos.x, y: e.pos.y });
  }
  return true;
}

/** Death rattles: Vengeful blasts, Splitting copies, Linked partners start their countdown. */
export function onEliteDeath(w: World, e: Enemy, def: EnemyDef): void {
  switch (e.elite) {
    case "vengeful": {
      // A shell that "lands" where it died after a short delay: the ground circle is the telegraph.
      const v = ELITE.vengeful;
      w.projectiles.push({
        id: newId(w), owner: "enemy", ownerId: e.id, kind: "doom", element: "fire", pos: { ...e.pos }, vel: { x: 0, y: 0 }, radius: 4, damage: v.damage,
        pierce: 0, bounces: 0, knockback: 0, life: 99, hitIds: [], gunUid: -1,
        lob: { from: { ...e.pos }, to: { ...e.pos }, t: 0, dur: v.delay, radius: v.radius },
      });
      break;
    }
    case "splitting": {
      const s = ELITE.split;
      w.events.push({ type: "split", id: e.id, x: e.pos.x, y: e.pos.y });
      for (let i = 0; i < s.count; i++) {
        const a = (i / s.count) * Math.PI * 2 + 0.7;
        const c = spawnEnemy(w, e.defId, add(e.pos, fromAngle(a, 6)), 0);
        c.size = s.size;
        c.radius = Math.max(4, Math.round(def.radius * s.size));
        c.maxHp = c.hp = Math.max(1, Math.round(e.maxHp * s.hp));
        c.noLoot = true;
        c.knock = fromAngle(a, 150);
      }
      break;
    }
    case "linked": {
      const partner = w.enemies.find((o) => o.id === e.link && o.hp > 0);
      // The partner was already counting down for us: both are gone, job done.
      if (!partner || partner.linkT > 0) break;
      partner.linkT = ELITE.linkS;
      partner.linkGhost = { defId: e.defId, pos: { ...e.pos }, maxHp: e.maxHp, elite: "linked" };
      break;
    }
  }
}

/** The partner wasn't killed in time: the dead twin comes back at half health. */
function relink(w: World, e: Enemy): void {
  const g = e.linkGhost;
  e.linkT = 0;
  e.linkGhost = undefined;
  if (!g || !targetable(e)) return;
  const twin = spawnEnemy(w, g.defId, g.pos, 0.6, "linked");
  twin.maxHp = g.maxHp;
  twin.hp = Math.round(g.maxHp * 0.5);
  twin.noLoot = true;
  twin.link = e.id;
  e.link = twin.id;
  w.events.push({ type: "relink", id: e.id });
}

/** Pairs up Linked elites that arrived together. */
export function linkPairs(enemies: Enemy[]): void {
  const linked = enemies.filter((e) => e.elite === "linked" && !e.link);
  for (let i = 0; i + 1 < linked.length; i += 2) {
    linked[i]!.link = linked[i + 1]!.id;
    linked[i + 1]!.link = linked[i]!.id;
  }
  // An odd one out has nobody to wait for: it's just a plain elite.
  const odd = linked.length % 2 === 1 ? linked[linked.length - 1] : undefined;
  if (odd) odd.elite = "hasted";
}

/** Elites in plans are written "enemy@modifier". */
export function parseElite(id: string): { defId: string; elite?: EliteId } {
  const [defId, mod] = id.split("@");
  return { defId: defId!, elite: ELITE_IDS.includes(mod as EliteId) && ENEMIES[defId!] ? (mod as EliteId) : undefined };
}


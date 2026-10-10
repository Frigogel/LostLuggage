// The Gunslinger's marks and the skill nodes that build on them: shots that seek marked enemies, crits, marks that
// spread on kill, and the two signature powers (Six Shooter, Dead or Alive).
import { dropHeal, DT, newId, playerExplosion, skillDamage, targetable } from "./combat";
import { ENEMIES } from "./data/enemies";
import { HEROES } from "./data/heroes";
import { gunStats } from "./loot";
import { angleOf, dist, fromAngle, rand, sub } from "./math";
import type { Enemy, HeroSkill, Player, World } from "./types";

export const MARK = {
  /** Grand Finale: the bang when a mark runs out. */
  finale: { radius: 26, damage: 30 },
  /** Bullseye: every this many hits on a marked enemy is a crit. */
  critEvery: 4,
  /** Wanted Poster: speed left to marked enemies. */
  wanted: 0.7,
  /** Hands Up: stun on marking. */
  stun: 1,
  /** Lucky Streak: skill charge back per marked kill. */
  lucky: 0.25,
  /** Bounty: chance a marked enemy drops a snack. */
  bounty: 0.35,
  /** Word Gets Around: how far a mark jumps on a kill, and how long the new one lasts at least. */
  gossip: { range: 130, minT: 3 },
  /** Most Wanted: a hit keeps at least this much time on the mark. */
  outlaw: 3,
  /** Turn rate of shots seeking marks, radians per second. */
  homing: 6,
  /** Six Shooter signature. */
  six: { shots: 6, damage: 22, speed: 420 },
  /** Dead or Alive signature: one mark, longer and much stronger. */
  wanted1: { durationMs: 10000, bonus: 1.0 },
};

type MarkSkill = Extract<HeroSkill, { type: "mark" }>;
const markSkill = (p: Player): MarkSkill | undefined => {
  const s = HEROES[p.heroId]?.skill;
  return s?.type === "mark" ? s : undefined;
};

const hasSkill = (p: Player, id: string) => p.skills.includes(id);

/** Enemies this player has marked right now. */
export function marksOf(w: World, p: Pick<Player, "id">): Enemy[] {
  return w.enemies.filter((e) => e.markT > 0 && e.markBy === p.id && targetable(e));
}

export const marksUp = (w: World, p: Pick<Player, "id">): boolean => w.enemies.some((e) => e.markT > 0 && e.markBy === p.id && e.hp > 0);

/** The nearest enemy this player marked, for auto-aim and seeking shots. */
export function nearestMarked(w: World, from: { x: number; y: number }, byId: number, range: number, except: readonly number[] = []): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = range;
  for (const e of w.enemies) {
    if (e.markT <= 0 || e.markBy !== byId || !targetable(e) || except.includes(e.id)) continue;
    const d = dist(from, e.pos) - e.radius;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function mark(w: World, e: Enemy, p: Player, seconds: number): void {
  e.markT = Math.max(e.markBy === p.id ? e.markT : 0, seconds);
  e.markBy = p.id;
  if (hasSkill(p, "gs_handsup") && !ENEMIES[e.defId]!.boss) e.stunT = Math.max(e.stunT, MARK.stun);
  w.events.push({ type: "mark", id: e.id, by: p.id });
}

/** The Gunslinger's action skill. */
export function useMarks(w: World, p: Player): void {
  const s = markSkill(p) ?? { type: "mark", count: 3, range: 230, durationMs: 6000, bonus: 0.4 };
  w.events.push({ type: "skill", id: p.id, x: p.pos.x, y: p.pos.y });
  const inRange = w.enemies.filter((e) => targetable(e) && dist(e.pos, p.pos) < s.range).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));

  if (p.signature === "sig_sixshooter") {
    // Six Shooter: no marks, just six shots that each find someone.
    const targets = inRange.slice(0, MARK.six.shots);
    for (let i = 0; i < MARK.six.shots; i++) {
      const t = targets[i % Math.max(1, targets.length)];
      const a = t ? angleOf(sub(t.pos, p.pos)) : angleOf(p.facing) + (i - 2.5) * 0.3;
      w.projectiles.push({
        id: newId(w), owner: "player", ownerId: p.id, kind: "pistol", element: p.guns[p.active]!.element, pos: { ...p.pos }, vel: fromAngle(a, MARK.six.speed),
        radius: 2, damage: skillDamage(p, MARK.six.damage), pierce: 0, bounces: 0, knockback: 60, life: s.range / MARK.six.speed + 0.2, hitIds: [], gunUid: -1,
        homing: 8, special: true,
      });
    }
    return;
  }
  if (p.signature === "sig_deadoralive") {
    // Dead or Alive: the toughest enemy in range gets one long, very strong mark.
    const t = [...inRange].sort((a, b) => b.hp - a.hp)[0];
    if (t) mark(w, t, p, MARK.wanted1.durationMs / 1000);
    return;
  }

  const count = s.count + (hasSkill(p, "gs_quick") ? 1 : 0);
  // Fresh targets first, so a second use spreads out instead of re-marking the same three.
  const fresh = [...inRange.filter((e) => e.markT <= 0), ...inRange.filter((e) => e.markT > 0)];
  for (const e of fresh.slice(0, count)) mark(w, e, p, s.durationMs / 1000);
}

/** Counts a mark down. Grand Finale makes the end of a mark go bang. */
export function tickMark(w: World, e: Enemy): void {
  if (e.markT <= 0) return;
  e.markT -= DT;
  if (e.markT > 0) return;
  e.markT = 0;
  const p = w.players.find((pl) => pl.id === e.markBy);
  if (p && hasSkill(p, "gs_finale")) {
    w.events.push({ type: "crit", x: e.pos.x, y: e.pos.y });
    playerExplosion(w, e.pos, MARK.finale.radius, skillDamage(p, MARK.finale.damage), 120, p.id, "none", true);
  }
}

/**
 * Bonus damage on a marked enemy from the player who marked it. Bullseye counts primary hits and turns every
 * fourth into a crit; Encore refills a pip on a crit; Most Wanted keeps the mark fresh.
 */
export function markBonus(w: World, e: Enemy, p: Player | undefined, secondary: boolean): { mult: number; crit: boolean } {
  if (!p || e.markT <= 0 || e.markBy !== p.id) return { mult: 1, crit: false };
  const s = markSkill(p);
  let mult = 1 + (p.signature === "sig_deadoralive" ? MARK.wanted1.bonus : (s?.bonus ?? 0.4));
  let crit = false;
  if (!secondary) {
    if (hasSkill(p, "gs_outlaw")) e.markT = Math.max(e.markT, MARK.outlaw);
    if (hasSkill(p, "gs_bullseye") && ++p.markHits % MARK.critEvery === 0) {
      crit = true;
      mult *= 2;
      if (hasSkill(p, "gs_encore")) {
        const gun = p.guns[p.active]!;
        gun.pips = Math.min(gunStats(gun).pips, gun.pips + 1);
      }
    }
  }
  return { mult, crit };
}

/** A marked enemy died: marks spread, skills charge, snacks drop. */
export function onMarkedDeath(w: World, e: Enemy): void {
  if (e.markT <= 0) return;
  const p = w.players.find((pl) => pl.id === e.markBy);
  if (!p) return;
  if (hasSkill(p, "gs_lucky") && !p.downed) p.skillCharge = Math.min(1, p.skillCharge + MARK.lucky);
  if (hasSkill(p, "gs_bounty") && rand(w) < MARK.bounty) dropHeal(w, e.pos, 15);
  if (hasSkill(p, "gs_gossip")) {
    let best: Enemy | undefined;
    let bestD = MARK.gossip.range;
    for (const o of w.enemies) {
      if (o === e || !targetable(o) || (o.markT > 0 && o.markBy === p.id)) continue;
      const d = dist(o.pos, e.pos);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) mark(w, best, p, Math.max(MARK.gossip.minT, e.markT));
  }
}

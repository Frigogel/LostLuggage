import { damageEnemy, domeAt, DT, hurtPlayer, insideArenaSolid, nearestEnemy, newId, playerExplosion, targetable } from "./combat";
import { domeBlocked, reflect } from "./domes";
import { shieldBlocks } from "./elites";
import { hurtGadget, hurtGadgetsIn, magnetize } from "./gadgets";
import { nearestMarked } from "./marks";
import { levelMultiplier } from "./data/heroes";
import { add, angleOf, dist, distToSegment, fromAngle, len, lerp, norm, rand, scale, sub } from "./math";
import { dashedWithin, hasSkill } from "./players";
import type { Projectile, World } from "./types";

/** Hot Take's burning line: one patch per tick of flight, each burning what stands in it twice a second. */
const FIRE_LINE = { radius: 9, seconds: 3, damage: 4, maxHazards: 90 };

export function updateProjectiles(w: World): void {
  // Shots spawned during the update (bomblets, hops, thrown-back shells) land in the fresh list and start next tick.
  const current = w.projectiles;
  w.projectiles = [];
  const kept = current.filter((pr) => (pr.lob ? updateLob(w, pr) : updateStraight(w, pr)));
  w.projectiles = [...kept, ...w.projectiles];
}

/** Returns false when the projectile is done. */
function updateLob(w: World, pr: Projectile): boolean {
  const lob = pr.lob!;
  lob.t += DT;
  const k = Math.min(1, lob.t / lob.dur);
  pr.pos = { x: lerp(lob.from.x, lob.to.x, k), y: lerp(lob.from.y, lob.to.y, k) };
  if (k < 1) return true;

  if (pr.owner === "player") {
    playerExplosion(w, lob.to, lob.radius, pr.damage, pr.knockback, pr.ownerId, pr.element, false, pr.gunUid);
    // Party Favor: the shell bursts into bomblets.
    for (let i = 0; i < (pr.cluster ?? 0); i++) {
      const to = add(lob.to, fromAngle(rand(w) * Math.PI * 2, 26 + rand(w) * 18));
      w.projectiles.push({ ...pr, id: newId(w), hitIds: [], cluster: 0, bounces: 0, damage: pr.damage * 0.45, pos: { ...lob.to }, lob: { from: { ...lob.to }, to, t: 0, dur: 0.35, radius: lob.radius * 0.6 } });
    }
    // Wizard Labs shells hop once more along the ground.
    if (pr.bounces > 0) {
      const hop = scale(sub(lob.to, lob.from), 0.45);
      const to = add(lob.to, hop);
      if (!insideArenaSolid(w, to)) {
        w.projectiles.push({ ...pr, id: newId(w), hitIds: [], bounces: pr.bounces - 1, damage: pr.damage * 0.6, pos: { ...lob.to }, lob: { ...lob, from: { ...lob.to }, to, t: 0, dur: Math.max(0.25, lob.dur * 0.5) } });
      }
    }
    return false;
  }

  const dome = domeAt(w, lob.to);
  if (dome) {
    const owner = domeBlocked(w, dome);
    w.events.push({ type: "blocked", x: lob.to.x, y: lob.to.y });
    // Hot Potato (and the Revolving Door): the shell goes back to whoever lobbed it.
    if (owner && (hasSkill(owner, "vg_potato") || owner.signature === "sig_revolving")) {
      const shooter = w.enemies.find((e) => e.id === pr.ownerId && targetable(e)) ?? nearestEnemy(w, lob.to, 260);
      if (shooter) {
        const d = Math.max(30, dist(lob.to, shooter.pos));
        w.projectiles.push({
          ...pr, id: newId(w), owner: "player", ownerId: owner.id, hitIds: [], damage: Math.max(20, pr.damage * 2) * levelMultiplier(owner.syncLevel) * owner.mods.damage, knockback: 120,
          special: true, pos: { ...lob.to }, lob: { from: { ...lob.to }, to: { ...shooter.pos }, t: 0, dur: Math.min(1, d / 260), radius: lob.radius },
        });
        w.events.push({ type: "reflect", x: lob.to.x, y: lob.to.y });
      }
    }
    return false;
  }
  w.events.push({ type: "explosion", x: lob.to.x, y: lob.to.y, radius: lob.radius, owner: "enemy", element: pr.element });
  hurtGadgetsIn(w, lob.to, lob.radius, pr.damage);
  for (const p of w.players) {
    if (dist(p.pos, lob.to) < lob.radius + p.radius * 0.5) hurtPlayer(w, p, pr.damage);
  }
  if (lob.puddle) {
    const pd = lob.puddle;
    w.hazards.push({ id: newId(w), kind: pd.ice ? "ice" : "acid", owner: "enemy", pos: { ...lob.to }, radius: pd.radius, t: pd.durationMs / 1000, maxT: pd.durationMs / 1000, damage: pd.damage });
  }
  return false;
}

/** Turns a player shot a little toward the nearest enemy it hasn't hit yet. */
function steer(w: World, pr: Projectile): void {
  // Gunslinger shots look for marks first, a little further out.
  const target = (pr.seekMarks ? nearestMarked(w, pr.pos, pr.seekMarks, 200, pr.hitIds) : undefined) ?? nearestEnemyExcept(w, pr, 130);
  if (!target) return;
  const want = angleOf(sub(target.pos, pr.pos));
  const cur = angleOf(pr.vel);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const max = pr.homing! * DT;
  pr.vel = fromAngle(cur + Math.max(-max, Math.min(max, diff)), len(pr.vel));
}

function nearestEnemyExcept(w: World, pr: Projectile, range: number) {
  let best: (typeof w.enemies)[number] | undefined;
  let bestD = range;
  for (const e of w.enemies) {
    if (!targetable(e) || pr.hitIds.includes(e.id)) continue;
    const d = dist(pr.pos, e.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Rockets: the blast does the damage. */
function detonate(w: World, pr: Projectile): void {
  playerExplosion(w, pr.pos, pr.explode!, pr.damage, 160, pr.ownerId, pr.element, false, pr.gunUid);
}

function updateStraight(w: World, pr: Projectile): boolean {
  const from = pr.pos;
  if (pr.owner === "player" && pr.homing) steer(w, pr);
  if (pr.turnT !== undefined) {
    // Boomerang: turn around halfway, able to hit everything again on the way back.
    pr.turnT -= DT;
    if (pr.turnT <= 0 && pr.turnT > -DT) {
      pr.vel = scale(pr.vel, -1);
      pr.hitIds = [];
    }
  }
  pr.pos = add(pr.pos, scale(pr.vel, DT));
  pr.life -= DT;
  if (pr.life <= 0) {
    if (pr.explode) detonate(w, pr);
    return false;
  }
  if (insideArenaSolid(w, pr.pos)) {
    w.events.push({ type: "spark", x: pr.pos.x, y: pr.pos.y });
    if (pr.explode) {
      pr.pos = from;
      detonate(w, pr);
      return false;
    }
    if (pr.bounces <= 0) return false;
    // Ricochet: flip whichever axis ran into the wall.
    const hitX = insideArenaSolid(w, { x: pr.pos.x, y: from.y });
    const hitY = insideArenaSolid(w, { x: from.x, y: pr.pos.y });
    if (hitX || !hitY) pr.vel.x = -pr.vel.x;
    if (hitY || !hitX) pr.vel.y = -pr.vel.y;
    pr.pos = from;
    pr.bounces--;
    pr.hitIds = [];
    return true;
  }

  if (pr.owner === "player") {
    if (pr.fireLine && w.hazards.length < FIRE_LINE.maxHazards) {
      const owner = w.players.find((p) => p.id === pr.ownerId);
      const dmg = FIRE_LINE.damage * (owner ? levelMultiplier(owner.syncLevel) * owner.mods.damage : 1);
      w.hazards.push({ id: newId(w), kind: "fire", owner: "player", ownerId: pr.ownerId, pos: { ...pr.pos }, radius: FIRE_LINE.radius, t: FIRE_LINE.seconds, maxT: FIRE_LINE.seconds, damage: dmg, tickT: 0.5 });
    }
    for (const e of [...w.enemies]) {
      if (!targetable(e) || pr.hitIds.includes(e.id)) continue;
      if (distToSegment(e.pos, from, pr.pos) > pr.radius + e.radius) continue;
      if (pr.explode) {
        detonate(w, pr);
        return false;
      }
      // Shielded elites: a shot into the shield just bounces off.
      if (shieldBlocks(w, e, pr)) {
        w.events.push({ type: "deflect", x: pr.pos.x, y: pr.pos.y });
        return false;
      }
      const marked = e.markT > 0 && e.markBy === pr.ownerId;
      damageEnemy(w, e, pr.damage, { dir: pr.vel, knockback: pr.knockback, sourcePlayerId: pr.ownerId, element: pr.element, gunUid: pr.gunUid, noCharge: pr.noCharge });
      pr.hitIds.push(e.id);
      // Trick Shot: a hit on a mark bounces on to another mark.
      if (marked && pr.seekMarks) {
        const owner = w.players.find((pl) => pl.id === pr.ownerId);
        const next = owner && hasSkill(owner, "gs_trick") ? nearestMarked(w, e.pos, owner.id, 160, pr.hitIds) : undefined;
        if (next) {
          pr.vel = scale(norm(sub(next.pos, e.pos)), len(pr.vel));
          pr.pos = { ...e.pos };
          pr.life = Math.max(pr.life, 0.6);
          w.events.push({ type: "chain", x1: e.pos.x, y1: e.pos.y, x2: next.pos.x, y2: next.pos.y });
          return true;
        }
      }
      // Show-Off: jump to the next enemy instead of stopping.
      if (pr.ricochet) {
        const next = nearestEnemyExcept(w, pr, 110);
        if (next) {
          pr.ricochet--;
          pr.vel = scale(norm(sub(next.pos, e.pos)), len(pr.vel));
          pr.pos = { ...e.pos };
          pr.life = Math.max(pr.life, 0.6);
          w.events.push({ type: "chain", x1: e.pos.x, y1: e.pos.y, x2: next.pos.x, y2: next.pos.y });
          return true;
        }
      }
      if (pr.pierce <= 0) return false;
      pr.pierce--;
    }
    return true;
  }

  // Turrets soak bolts (and Bullet Magnet pulls them in).
  if (w.gadgets.length > 0) {
    const m = magnetize(w, pr.pos, pr.vel);
    pr.vel = m.vel;
    if (m.hit) {
      hurtGadget(w, m.hit, pr.damage, w.enemies.find((e) => e.id === pr.ownerId));
      w.events.push({ type: "spark", x: pr.pos.x, y: pr.pos.y });
      return false;
    }
  }
  const dome = domeAt(w, pr.pos);
  if (dome) {
    const owner = domeBlocked(w, dome);
    // Rebound (and the Revolving Door signature): the dome sends it back instead of eating it.
    if (owner && (hasSkill(owner, "vg_rebound") || owner.signature === "sig_revolving")) {
      reflect(w, pr, owner);
      return true;
    }
    w.events.push({ type: "blocked", x: pr.pos.x, y: pr.pos.y });
    return false;
  }
  for (const p of w.players) {
    if (p.downed || p.away || distToSegment(p.pos, from, pr.pos) > pr.radius + p.radius) continue;
    // Door Slam: a dashing Vanguard bats bolts away.
    if (p.dashT > 0 && hasSkill(p, "vg_doorslam")) {
      reflect(w, pr, p);
      return true;
    }
    hurtPlayer(w, p, pr.damage);
    return false;
  }
  return true;
}

export function updateHazards(w: World): void {
  for (const h of w.hazards) {
    h.t -= DT;
    if (h.owner === "player") {
      // Burning ground: hits whatever stands in it twice a second, and sets it on fire.
      h.tickT = (h.tickT ?? 0) - DT;
      if (h.tickT > 0) continue;
      h.tickT = 0.5;
      for (const e of [...w.enemies]) {
        if (!targetable(e) || dist(e.pos, h.pos) > h.radius + e.radius) continue;
        damageEnemy(w, e, h.damage, { dir: { x: 0, y: 0 }, knockback: 0, sourcePlayerId: h.ownerId ?? -1, element: "fire" });
      }
      continue;
    }
    if (h.kind === "wave") {
      // A boss shockwave: a thin ring racing outward. Dash through it, or be inside a dome when it passes.
      const r = h.radius * (1 - h.t / h.maxT);
      for (const p of w.players) {
        // Dashing over it counts if the dash started a moment before the ring got there.
        if (p.downed || p.away || dashedWithin(p, 0.35) || Math.abs(dist(p.pos, h.pos) - r) > 5 + p.radius * 0.5) continue;
        if (domeAt(w, p.pos)) {
          w.events.push({ type: "blocked", x: p.pos.x, y: p.pos.y });
          continue;
        }
        if (hurtPlayer(w, p, h.damage) && h.push) p.knock = add(p.knock, scale(norm(sub(p.pos, h.pos)), h.push));
      }
      continue;
    }
    for (const p of w.players) {
      if (p.downed || p.dashT > 0 || dist(p.pos, h.pos) >= h.radius + p.radius * 0.3) continue;
      // Slush slows you down; acid hurts (player i-frames pace it into a hit about every half second).
      if (h.kind === "ice") p.slowT = 0.3;
      else hurtPlayer(w, p, h.damage);
    }
  }
  w.hazards = w.hazards.filter((h) => h.t > 0);
}

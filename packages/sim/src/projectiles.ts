import { damageEnemy, DT, hurtPlayer, insideArenaSolid, newId, playerExplosion, pointInDome, targetable } from "./combat";
import { add, dist, distToSegment, lerp, scale } from "./math";
import type { Projectile, World } from "./types";

export function updateProjectiles(w: World): void {
  w.projectiles = w.projectiles.filter((pr) => (pr.lob ? updateLob(w, pr) : updateStraight(w, pr)));
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
  } else if (pointInDome(w, lob.to)) {
    w.events.push({ type: "blocked", x: lob.to.x, y: lob.to.y });
  } else {
    w.events.push({ type: "explosion", x: lob.to.x, y: lob.to.y, radius: lob.radius, owner: "enemy", element: pr.element });
    for (const p of w.players) {
      if (dist(p.pos, lob.to) < lob.radius + p.radius * 0.5) hurtPlayer(w, p, pr.damage);
    }
    if (lob.puddle) {
      const pd = lob.puddle;
      w.hazards.push({ id: newId(w), kind: "acid", owner: "enemy", pos: { ...lob.to }, radius: pd.radius, t: pd.durationMs / 1000, maxT: pd.durationMs / 1000, damage: pd.damage });
    }
  }
  return false;
}

function updateStraight(w: World, pr: Projectile): boolean {
  const from = pr.pos;
  pr.pos = add(pr.pos, scale(pr.vel, DT));
  pr.life -= DT;
  if (pr.life <= 0) return false;
  if (insideArenaSolid(w, pr.pos)) {
    w.events.push({ type: "spark", x: pr.pos.x, y: pr.pos.y });
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
    for (const e of [...w.enemies]) {
      if (!targetable(e) || pr.hitIds.includes(e.id)) continue;
      if (distToSegment(e.pos, from, pr.pos) > pr.radius + e.radius) continue;
      damageEnemy(w, e, pr.damage, { dir: pr.vel, knockback: pr.knockback, sourcePlayerId: pr.ownerId, element: pr.element, gunUid: pr.gunUid });
      pr.hitIds.push(e.id);
      if (pr.pierce <= 0) return false;
      pr.pierce--;
    }
    return true;
  }

  if (pointInDome(w, pr.pos)) {
    w.events.push({ type: "blocked", x: pr.pos.x, y: pr.pos.y });
    return false;
  }
  for (const p of w.players) {
    if (p.downed || distToSegment(p.pos, from, pr.pos) > pr.radius + p.radius) continue;
    hurtPlayer(w, p, pr.damage);
    return false;
  }
  return true;
}

export function updateHazards(w: World): void {
  for (const h of w.hazards) {
    h.t -= DT;
    if (h.owner !== "enemy") continue;
    for (const p of w.players) {
      // Player i-frames pace this into a hit about every half second.
      if (!p.downed && p.dashT <= 0 && dist(p.pos, h.pos) < h.radius + p.radius * 0.3) hurtPlayer(w, p, h.damage);
    }
  }
  w.hazards = w.hazards.filter((h) => h.t > 0);
}

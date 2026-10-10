import { damageEnemy, DT, hurtPlayer, insideArenaSolid, playerExplosion, pointInDome } from "./combat";
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
    playerExplosion(w, lob.to, lob.radius, pr.damage, pr.knockback, pr.ownerId);
  } else if (pointInDome(w, lob.to)) {
    w.events.push({ type: "blocked", x: lob.to.x, y: lob.to.y });
  } else {
    w.events.push({ type: "explosion", x: lob.to.x, y: lob.to.y, radius: lob.radius, owner: "enemy" });
    for (const p of w.players) {
      if (dist(p.pos, lob.to) < lob.radius + p.radius * 0.5) hurtPlayer(w, p, pr.damage);
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
    return false;
  }

  if (pr.owner === "player") {
    for (const e of w.enemies) {
      if (e.spawnT > 0 || e.hp <= 0 || pr.hitIds.includes(e.id)) continue;
      if (distToSegment(e.pos, from, pr.pos) > pr.radius + e.radius) continue;
      damageEnemy(w, e, pr.damage, pr.vel, pr.knockback, pr.ownerId);
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

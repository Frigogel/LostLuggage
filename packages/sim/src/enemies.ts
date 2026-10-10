import { clampToArena, confine, damageEnemy, DT, hurtPlayer, newId, nearestPlayer, pointInDome, spawnEnemy, targetable } from "./combat";
import { ENEMIES } from "./data/enemies";
import { isBlackHole } from "./domes";
import { eliteHaste, eliteSpeed, updateElite } from "./elites";
import { hurtGadget, hurtGadgetsIn, tauntOf, tauntSlow, TURRET } from "./gadgets";
import { MARK, tickMark } from "./marks";
import { add, clamp, dist, dot, fromAngle, angleOf, len, norm, rand, randRange, rotate, scale, sub, type Vec } from "./math";
import type { AttackDef, Enemy, EnemyDef, World } from "./types";
import { ventState } from "./room";

/** Whatever an enemy is going after: a player, or a turret that taunted it. */
interface Target {
  pos: Vec;
  vel: Vec;
  radius: number;
  facing?: Vec;
}

/** Spike walls hurt enemies too, when they're shoved into them hard enough. */
const SPIKES = { minKnock: 60, damage: 25, bounce: 180 };

export function updateEnemies(w: World): void {
  for (const e of [...w.enemies]) updateEnemy(w, e);
  separate(w);
  for (const e of w.enemies) {
    const def = ENEMIES[e.defId]!;
    if (e.state === "hidden" || def.movement.type === "stationary") continue;
    for (const d of w.domes) {
      // Domes keep enemies out entirely (except the Black Hole Dome, which wants them in).
      if (isBlackHole(w, d)) continue;
      const off = sub(e.pos, d.pos);
      const l = len(off);
      const min = d.radius + e.radius;
      if (l < min) {
        e.pos = add(d.pos, scale(l > 0.01 ? scale(off, 1 / l) : { x: 1, y: 0 }, min));
        if (e.state === "attack") endDash(w, e, true);
      }
    }
    confine(w, e.pos, e.radius);
    if (w.arena.spikes.length > 0) spikeEnemy(w, e);
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);
}

/** An enemy shoved into a spike wall gets hurt and bounced off it: the reward for knockback on ice. */
function spikeEnemy(w: World, e: Enemy): void {
  if (len(e.knock) < SPIKES.minKnock) return;
  for (const r of w.arena.spikes) {
    const c = { x: clamp(e.pos.x, r.x, r.x + r.w), y: clamp(e.pos.y, r.y, r.y + r.h) };
    const off = sub(e.pos, c);
    if (len(off) > e.radius + 1) continue;
    const out = len(off) > 0.01 ? norm(off) : { x: 0, y: 1 };
    e.knock = scale(out, SPIKES.bounce);
    w.events.push({ type: "spiked", x: c.x, y: c.y });
    damageEnemy(w, e, SPIKES.damage, { dir: out, knockback: 0, sourcePlayerId: -1, element: "none", secondary: true });
    return;
  }
}

function haste(e: Enemy, def: EnemyDef): number {
  return (def.boss ? def.boss.phases[e.phase]!.haste : 1) * eliteHaste(e);
}

/** A taunting turret wins over the nearest player. */
function targetOf(w: World, e: Enemy): Target | undefined {
  const t = tauntOf(w, e);
  if (t) return { pos: t.pos, vel: { x: 0, y: 0 }, radius: TURRET.radius };
  return nearestPlayer(w, e.pos);
}

function updateEnemy(w: World, e: Enemy): void {
  const def = ENEMIES[e.defId]!;
  if (e.hp <= 0) return;
  if (e.spawnT > 0) {
    e.spawnT -= DT;
    if (e.spawnT <= 0) w.events.push({ type: "enemySpawn", id: e.id });
    return;
  }
  e.hitFlash = Math.max(0, e.hitFlash - DT);

  // Statuses.
  const s = e.status;
  s.acidT = Math.max(0, s.acidT - DT);
  s.frost = Math.max(0, s.frost - 0.8 * DT);
  e.slowT = Math.max(0, e.slowT - DT);
  if (e.slowT <= 0) e.slow = 0;
  tickMark(w, e);
  if (s.burnT > 0) {
    s.burnT -= DT;
    s.burnTick -= DT;
    if (s.burnTick <= 0) {
      s.burnTick = 0.5;
      damageEnemy(w, e, s.burnDps * 0.5, { dir: { x: 0, y: 0 }, knockback: 0, sourcePlayerId: s.burnSource, element: "fire", secondary: true });
      if (e.hp <= 0) return;
    }
    if (s.burnT <= 0) s.burnDps = 0;
  }

  e.pos = add(e.pos, scale(e.knock, DT));
  e.knock = scale(e.knock, w.arena.ice ? 0.88 : 0.8);
  if (s.frozenT > 0 || e.stunT > 0) {
    s.frozenT = Math.max(0, s.frozenT - DT);
    e.stunT = Math.max(0, e.stunT - DT);
    e.vel = { x: 0, y: 0 };
    return;
  }

  const h = haste(e, def);
  for (let i = 0; i < e.cooldowns.length; i++) e.cooldowns[i] = Math.max(0, e.cooldowns[i]! - DT * h);

  if (def.boss) {
    let phase = 0;
    def.boss.phases.forEach((ph, i) => {
      if (e.hp / e.maxHp <= ph.hpFrac) phase = i;
    });
    if (phase > e.phase) {
      e.phase = phase;
      w.events.push({ type: "bossPhase", id: e.id, phase });
    }
  }

  const target = targetOf(w, e);
  // Frost, an owl's slow, a Wanted Poster and a Doorstop all stack, but never to a full stop.
  const marker = e.markT > 0 ? w.players.find((p) => p.id === e.markBy) : undefined;
  const wanted = marker?.skills.includes("gs_wanted") ? MARK.wanted : 1;
  const slow = Math.max(0.15, (1 - 0.1 * Math.min(s.frost, 5)) * (1 - e.slow) * wanted * tauntSlow(w, e));
  e.vel = { x: 0, y: 0 };
  if (updateElite(w, e, target)) return;

  switch (e.state) {
    case "hidden": {
      const m = def.movement;
      if (m.type === "ambush" && w.players.some((p) => !p.downed && !p.away && dist(p.pos, e.pos) < m.trigger)) {
        e.state = "reveal";
        e.stateT = m.revealMs / 1000;
        w.events.push({ type: "reveal", id: e.id });
      }
      break;
    }
    case "reveal": {
      e.stateT -= DT;
      if (e.stateT <= 0) e.state = "move";
      break;
    }
    case "move": {
      if (!target) break;
      move(w, e, def, target, slow * eliteSpeed(e));
      dropTrail(w, e, def);
      tryStartAttack(w, e, def, target);
      break;
    }
    case "windup": {
      // Frost stretches windups too.
      e.stateT -= DT * slow;
      if (e.stateT <= 0) executeAttack(w, e, def, def.attacks[e.attackIdx]!, target);
      break;
    }
    case "attack": {
      const atk = def.attacks[e.attackIdx]!;
      if (atk.type !== "dash") break;
      e.vel = scale(e.attackDir, atk.dashSpeed * slow);
      e.pos = add(e.pos, scale(e.vel, DT));
      for (const p of w.players) {
        if (p.downed || e.hitPlayers.includes(p.id)) continue;
        if (dist(p.pos, e.pos) < p.radius + e.radius + 2) {
          if (hurtPlayer(w, p, atk.damage)) {
            e.hitPlayers.push(p.id);
            // Shoved out of the lane, sideways.
            if (atk.push) p.knock = add(p.knock, scale(sideOf(e.attackDir, sub(p.pos, e.pos)), atk.push));
          }
        }
      }
      for (const g of w.gadgets) {
        if (g.kind === "turret" && !e.hitPlayers.includes(-g.id) && dist(g.pos, e.pos) < TURRET.radius + e.radius + 2) {
          e.hitPlayers.push(-g.id);
          hurtGadget(w, g, atk.damage, e);
        }
      }
      // Ending the charge in a wall stuns: the reward for baiting it.
      const before = { ...e.pos };
      if (confine(w, e.pos, e.radius) && dist(before, e.pos) > 0.5) {
        endDash(w, e, true);
        break;
      }
      e.stateT -= DT;
      if (e.stateT <= 0) endDash(w, e, false);
      break;
    }
    case "recover": {
      e.stateT -= DT;
      if (e.stateT <= 0) e.state = "move";
      break;
    }
  }
}

/** The side of a line a point is on, as a unit vector across it. */
function sideOf(dir: Vec, off: Vec): Vec {
  const across = { x: -dir.y, y: dir.x };
  return dot(across, off) >= 0 ? across : scale(across, -1);
}

function move(w: World, e: Enemy, def: EnemyDef, target: Target, slow: number): void {
  const m = def.movement;
  if (m.type === "stationary") return;
  const to = sub(target.pos, e.pos);
  const d = len(to);
  const dir = norm(to);
  let want: Vec = { x: 0, y: 0 };

  if (m.type === "chase" || m.type === "ambush" || e.taunt) {
    const stopAt = Math.max(0, attackRange(def) * 0.6);
    if (d > stopAt + target.radius + e.radius) {
      // Fan out while far away so packs surround instead of queueing.
      want = d > 50 ? rotate(dir, e.steer) : dir;
    }
  } else {
    if (d < m.min) want = scale(dir, -1);
    else if (d > m.max) want = dir;
    else {
      want = scale({ x: -dir.y, y: dir.x }, e.strafe * 0.6);
      if (rand(w) < 0.01) e.strafe *= -1;
    }
  }

  // Enemies that can burn keep clear of vents that are about to blow. Fire-immune ones use them as bait.
  if (!def.fireImmune) {
    for (const v of w.run.room.vents) {
      if (ventState(v) === "idle") continue;
      const off = sub(e.pos, v.pos);
      const l = len(off);
      if (l < v.radius + e.radius + 14) want = add(want, scale(norm(off), 1.5));
    }
  }

  e.vel = scale(norm(want), def.speed * slow * Math.min(1, len(want) || 0));
  e.pos = add(e.pos, scale(e.vel, DT));
}

function dropTrail(w: World, e: Enemy, def: EnemyDef): void {
  const t = def.trail;
  if (!t || len(e.vel) < 1) return;
  e.trailT -= DT;
  if (e.trailT > 0) return;
  e.trailT = t.intervalMs / 1000;
  // In the caverns, trails are slush that slows you instead of acid that burns.
  const kind = w.arena.ice ? "ice" : "acid";
  w.hazards.push({ id: newId(w), kind, owner: "enemy", pos: { ...e.pos }, radius: t.radius, t: t.durationMs / 1000, maxT: t.durationMs / 1000, damage: t.damage });
}

function attackRange(def: EnemyDef): number {
  return def.attacks.reduce((m, a) => (a.type === "shieldAllies" || a.type === "summon" ? m : Math.min(m, a.range)), Infinity);
}

function childrenAlive(w: World, e: Enemy): number {
  return w.enemies.filter((c) => c.parentId === e.id && c.hp > 0).length;
}

function canUse(w: World, e: Enemy, atk: AttackDef, d: number): boolean {
  switch (atk.type) {
    case "shieldAllies":
      return w.enemies.some((o) => o !== e && targetable(o) && o.shield < atk.amount * 0.5 && dist(o.pos, e.pos) < atk.radius);
    case "summon":
      return childrenAlive(w, e) < atk.maxAlive;
    default:
      return d <= atk.range;
  }
}

function tryStartAttack(w: World, e: Enemy, def: EnemyDef, target: Target): void {
  const d = dist(e.pos, target.pos) - target.radius - e.radius;
  const usable = def.boss ? def.boss.phases[e.phase]!.attacks : def.attacks.map((_, i) => i);
  for (const i of usable) {
    const atk = def.attacks[i]!;
    if (e.cooldowns[i]! > 0 || !canUse(w, e, atk, d)) continue;
    e.state = "windup";
    e.stateT = atk.windupMs / 1000 / haste(e, def);
    e.attackIdx = i;
    e.attackDir = norm(sub(target.pos, e.pos));
    if (atk.type === "lobbedProjectile") {
      // Lead the target a little so standing still isn't enough, but walking sideways is.
      const lead = add(target.pos, scale(target.vel, 0.25));
      e.attackPoints = [clampToArena(w, lead, 8)];
      for (let k = 1; k < (atk.count ?? 1); k++) {
        const a = rand(w) * Math.PI * 2;
        e.attackPoints.push(clampToArena(w, add(target.pos, fromAngle(a, randRange(w, 20, atk.scatter ?? 40))), 8));
      }
    }
    w.events.push({ type: "enemyWindup", id: e.id, attack: atk.type });
    return;
  }
}

/** Is a point inside an enemy's breath wedge? */
export function inCone(e: Pick<Enemy, "pos" | "attackDir">, at: Vec, length: number, angleDeg: number, pad = 0): boolean {
  const off = sub(at, e.pos);
  const d = len(off);
  if (d > length + pad) return false;
  if (d < pad + 4) return true;
  return dot(norm(off), e.attackDir) >= Math.cos((angleDeg * Math.PI) / 360);
}

function executeAttack(w: World, e: Enemy, def: EnemyDef, atk: AttackDef, target: Target | undefined): void {
  e.cooldowns[e.attackIdx] = atk.cooldownMs / 1000;
  e.state = "recover";
  e.stateT = atk.recoverMs / 1000;
  w.events.push({ type: "enemyAttack", id: e.id, attack: atk.type });

  switch (atk.type) {
    case "melee": {
      for (const p of w.players) {
        if (p.downed) continue;
        const off = sub(p.pos, e.pos);
        const inReach = len(off) < e.radius + p.radius + atk.reach;
        const inFront = dot(norm(off), e.attackDir) > 0.2;
        if (inReach && inFront) hurtPlayer(w, p, atk.damage);
      }
      for (const g of w.gadgets) {
        const off = sub(g.pos, e.pos);
        if (g.kind === "turret" && len(off) < e.radius + TURRET.radius + atk.reach && dot(norm(off), e.attackDir) > 0.2) hurtGadget(w, g, atk.damage, e);
      }
      // A small lunge sells the bite.
      e.knock = add(e.knock, scale(e.attackDir, 90));
      break;
    }
    case "dash": {
      e.state = "attack";
      e.stateT = atk.dashMs / 1000;
      e.hitPlayers = [];
      break;
    }
    case "lobbedProjectile": {
      for (const to of e.attackPoints) {
        const d = dist(e.pos, to);
        w.projectiles.push({
          id: newId(w), owner: "enemy", ownerId: e.id, kind: atk.puddle ? (atk.puddle.ice ? "slush" : "acid") : "mortar",
          element: atk.puddle ? (atk.puddle.ice ? "frost" : "acid") : "none",
          pos: { ...e.pos }, vel: { x: 0, y: 0 }, radius: 4, damage: atk.damage, pierce: 0, bounces: 0, knockback: 0, life: 99,
          hitIds: [], gunUid: -1,
          lob: { from: { ...e.pos }, to: { ...to }, t: 0, dur: Math.max(0.3, (atk.flightMs / 1000) * (0.6 + (0.4 * d) / atk.range)), radius: atk.radius, puddle: atk.puddle },
        });
      }
      break;
    }
    case "slam": {
      w.events.push({ type: "explosion", x: e.pos.x, y: e.pos.y, radius: atk.radius, owner: "enemy", element: "none" });
      for (const p of w.players) {
        if (p.downed || p.away || dist(p.pos, e.pos) > atk.radius + p.radius * 0.5) continue;
        if (pointInDome(w, p.pos)) w.events.push({ type: "blocked", x: p.pos.x, y: p.pos.y });
        else if (hurtPlayer(w, p, atk.damage) && atk.push) p.knock = add(p.knock, scale(norm(sub(p.pos, e.pos)), atk.push));
      }
      hurtGadgetsIn(w, e.pos, atk.radius, atk.damage, e);
      break;
    }
    case "cone": {
      w.events.push({ type: "explosion", x: e.pos.x + e.attackDir.x * atk.length * 0.5, y: e.pos.y + e.attackDir.y * atk.length * 0.5, radius: atk.length * 0.4, owner: "enemy", element: "frost" });
      for (const p of w.players) {
        if (p.downed || p.away || !inCone(e, p.pos, atk.length, atk.angleDeg, p.radius)) continue;
        if (pointInDome(w, p.pos)) w.events.push({ type: "blocked", x: p.pos.x, y: p.pos.y });
        else if (hurtPlayer(w, p, atk.damage) && atk.push) p.knock = add(p.knock, scale(e.attackDir, atk.push));
      }
      for (const g of w.gadgets) if (g.kind === "turret" && inCone(e, g.pos, atk.length, atk.angleDeg, TURRET.radius)) hurtGadget(w, g, atk.damage, e);
      if (atk.ice) {
        // Slush left along the breath, so the floor stays dangerous for a while.
        const n = Math.max(2, Math.round(atk.length / 30));
        for (let k = 1; k <= n; k++) {
          const at = add(e.pos, scale(e.attackDir, (atk.length * k) / (n + 0.5)));
          w.hazards.push({ id: newId(w), kind: "ice", owner: "enemy", pos: at, radius: atk.ice.radius, t: atk.ice.durationMs / 1000, maxT: atk.ice.durationMs / 1000, damage: 0 });
        }
      }
      break;
    }
    case "projectile": {
      const aimAt = target ? norm(sub(target.pos, e.pos)) : e.attackDir;
      const base = angleOf(aimAt);
      const spread = (atk.spreadDeg * Math.PI) / 180;
      for (let k = 0; k < atk.count; k++) {
        const a = atk.count > 1 ? base + (k / (atk.count - 1) - 0.5) * spread : base;
        w.projectiles.push({
          id: newId(w), owner: "enemy", ownerId: e.id, kind: "bolt", element: "none", pos: add(e.pos, fromAngle(a, e.radius)),
          vel: fromAngle(a, atk.speed), radius: atk.radius, damage: atk.damage, pierce: 0, bounces: 0, knockback: 0,
          life: 3, hitIds: [], gunUid: -1,
        });
      }
      break;
    }
    case "shieldAllies": {
      for (const o of w.enemies) {
        if (o === e || !targetable(o) || dist(o.pos, e.pos) > atk.radius) continue;
        o.shield = Math.max(o.shield, atk.amount);
        w.events.push({ type: "shieldUp", id: o.id });
      }
      break;
    }
    case "summon": {
      const n = Math.min(atk.count, atk.maxAlive - childrenAlive(w, e));
      for (let k = 0; k < n; k++) {
        const a = rand(w) * Math.PI * 2;
        const child = spawnEnemy(w, atk.enemyId, clampToArena(w, add(e.pos, fromAngle(a, e.radius + 10)), 10), 0.6);
        child.parentId = e.id;
      }
      break;
    }
  }
}

function endDash(w: World, e: Enemy, hitWall: boolean): void {
  const def = ENEMIES[e.defId]!;
  const atk = def.attacks[e.attackIdx]!;
  if (atk.type !== "dash") return;
  e.state = "recover";
  e.stateT = (hitWall ? atk.stunMs : atk.recoverMs) / 1000;
  e.vel = { x: 0, y: 0 };
  if (hitWall) w.events.push({ type: "bonk", id: e.id, x: e.pos.x, y: e.pos.y });
}

/** Pushes overlapping enemies apart, and out of players (players are never shoved by bodies). */
function separate(w: World): void {
  const es = w.enemies;
  const fixed = (e: Enemy) => e.state === "hidden" || ENEMIES[e.defId]!.movement.type === "stationary";
  for (let i = 0; i < es.length; i++) {
    const a = es[i]!;
    if (a.spawnT > 0) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j]!;
      if (b.spawnT > 0) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const fa = fixed(a);
      const fb = fixed(b);
      if (fa && fb) continue;
      const push = min - d;
      const nx = dx / d;
      const ny = dy / d;
      // Heavier things (and props) don't get shoved around.
      const wa = fa ? 0 : fb ? 1 : b.radius / (a.radius + b.radius);
      a.pos.x -= nx * push * wa;
      a.pos.y -= ny * push * wa;
      b.pos.x += nx * push * (1 - wa);
      b.pos.y += ny * push * (1 - wa);
    }
    if (fixed(a)) continue;
    for (const p of w.players) {
      if (p.downed || p.away || p.dashT > 0) continue;
      const off = sub(a.pos, p.pos);
      const min = a.radius + p.radius;
      const l = len(off);
      if (l < min) a.pos = add(p.pos, scale(l > 0.01 ? scale(off, 1 / l) : { x: 1, y: 0 }, min));
    }
  }
}

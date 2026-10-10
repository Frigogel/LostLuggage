import { clampToArena, confine, DT, hurtPlayer, newId, nearestPlayer } from "./combat";
import { ENEMIES } from "./data/enemies";
import { add, dist, dot, len, norm, rand, rotate, scale, sub, type Vec } from "./math";
import type { AttackDef, Enemy, EnemyDef, Player, World } from "./types";

export function makeEnemy(w: World, defId: string, pos: Vec, spawnDelay: number): Enemy {
  const def = ENEMIES[defId]!;
  return {
    id: newId(w),
    defId,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    knock: { x: 0, y: 0 },
    radius: def.radius,
    hp: def.hp,
    maxHp: def.hp,
    state: "move",
    stateT: 0,
    attackIdx: 0,
    // Stagger first attacks so a fresh wave doesn't fire in unison.
    cooldowns: def.attacks.map((a) => (a.cooldownMs / 1000) * (0.3 + rand(w) * 0.7)),
    attackDir: { x: 1, y: 0 },
    attackPoint: { ...pos },
    hitPlayers: [],
    hitFlash: 0,
    spawnT: spawnDelay,
    steer: (rand(w) - 0.5) * 1.4,
    strafe: rand(w) < 0.5 ? -1 : 1,
  };
}

export function updateEnemies(w: World): void {
  for (const e of w.enemies) updateEnemy(w, e);
  separate(w);
  for (const e of w.enemies) {
    for (const d of w.domes) {
      // Domes keep enemies out entirely.
      const off = sub(e.pos, d.pos);
      const l = len(off);
      const min = d.radius + e.radius;
      if (l < min) {
        const dir = l > 0.01 ? scale(off, 1 / l) : { x: 1, y: 0 };
        e.pos = add(d.pos, scale(dir, min));
        if (e.state === "attack") endDash(w, e, true);
      }
    }
    confine(w, e.pos, e.radius);
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);
}

function updateEnemy(w: World, e: Enemy): void {
  const def = ENEMIES[e.defId]!;
  if (e.spawnT > 0) {
    e.spawnT -= DT;
    if (e.spawnT <= 0) w.events.push({ type: "enemySpawn", id: e.id });
    return;
  }
  e.hitFlash = Math.max(0, e.hitFlash - DT);
  for (let i = 0; i < e.cooldowns.length; i++) e.cooldowns[i] = Math.max(0, e.cooldowns[i]! - DT);

  e.pos = add(e.pos, scale(e.knock, DT));
  e.knock = scale(e.knock, 0.8);

  const target = nearestPlayer(w, e.pos);
  e.vel = { x: 0, y: 0 };

  switch (e.state) {
    case "move": {
      if (!target) break;
      move(w, e, def, target);
      tryStartAttack(w, e, def, target);
      break;
    }
    case "windup": {
      e.stateT -= DT;
      if (e.stateT <= 0) executeAttack(w, e, def.attacks[e.attackIdx]!);
      break;
    }
    case "attack": {
      const atk = def.attacks[e.attackIdx]!;
      if (atk.type !== "dash") break;
      e.vel = scale(e.attackDir, atk.dashSpeed);
      e.pos = add(e.pos, scale(e.vel, DT));
      for (const p of w.players) {
        if (p.downed || e.hitPlayers.includes(p.id)) continue;
        if (dist(p.pos, e.pos) < p.radius + e.radius + 2) {
          if (hurtPlayer(w, p, atk.damage)) e.hitPlayers.push(p.id);
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

function move(w: World, e: Enemy, def: EnemyDef, target: Player): void {
  const to = sub(target.pos, e.pos);
  const d = len(to);
  const dir = norm(to);
  let want: Vec = { x: 0, y: 0 };

  if (def.movement.type === "chase") {
    const stopAt = Math.max(0, attackRange(def) * 0.6);
    if (d > stopAt + target.radius + e.radius) {
      // Fan out while far away so packs surround instead of queueing.
      want = d > 50 ? rotate(dir, e.steer) : dir;
    }
  } else {
    const { min, max } = def.movement;
    if (d < min) want = scale(dir, -1);
    else if (d > max) want = dir;
    else {
      want = scale({ x: -dir.y, y: dir.x }, e.strafe * 0.6);
      if (rand(w) < 0.01) e.strafe *= -1;
    }
  }

  e.vel = scale(want, def.speed);
  e.pos = add(e.pos, scale(e.vel, DT));
}

function attackRange(def: EnemyDef): number {
  return def.attacks.reduce((m, a) => Math.min(m, a.range), Infinity);
}

function tryStartAttack(w: World, e: Enemy, def: EnemyDef, target: Player): void {
  const d = dist(e.pos, target.pos) - target.radius - e.radius;
  for (let i = 0; i < def.attacks.length; i++) {
    const atk = def.attacks[i]!;
    if (e.cooldowns[i]! > 0 || d > atk.range) continue;
    e.state = "windup";
    e.stateT = atk.windupMs / 1000;
    e.attackIdx = i;
    e.attackDir = norm(sub(target.pos, e.pos));
    if (atk.type === "lobbedProjectile") {
      // Lead the target a little so standing still isn't enough, but walking sideways is.
      const lead = add(target.pos, scale(target.vel, 0.25));
      e.attackPoint = clampToArena(w, lead, 8);
    }
    w.events.push({ type: "enemyWindup", id: e.id, attack: atk.type });
    return;
  }
}

function executeAttack(w: World, e: Enemy, atk: AttackDef): void {
  const i = e.attackIdx;
  e.cooldowns[i] = atk.cooldownMs / 1000;
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
      // A small lunge sells the bite.
      e.knock = add(e.knock, scale(e.attackDir, 90));
      e.state = "recover";
      e.stateT = atk.recoverMs / 1000;
      break;
    }
    case "dash": {
      e.state = "attack";
      e.stateT = atk.dashMs / 1000;
      e.hitPlayers = [];
      break;
    }
    case "lobbedProjectile": {
      const d = dist(e.pos, e.attackPoint);
      w.projectiles.push({
        id: newId(w),
        owner: "enemy",
        ownerId: e.id,
        kind: "mortar",
        pos: { ...e.pos },
        vel: { x: 0, y: 0 },
        radius: 4,
        damage: atk.damage,
        pierce: 0,
        knockback: 0,
        life: 99,
        hitIds: [],
        lob: { from: { ...e.pos }, to: { ...e.attackPoint }, t: 0, dur: Math.max(0.3, (atk.flightMs / 1000) * (0.6 + (0.4 * d) / atk.range)), radius: atk.radius },
      });
      e.state = "recover";
      e.stateT = atk.recoverMs / 1000;
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
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.pos.x -= nx * push;
      a.pos.y -= ny * push;
      b.pos.x += nx * push;
      b.pos.y += ny * push;
    }
    for (const p of w.players) {
      if (p.downed || p.dashT > 0) continue;
      const off = sub(a.pos, p.pos);
      const min = a.radius + p.radius;
      const l = len(off);
      if (l < min) a.pos = add(p.pos, scale(l > 0.01 ? scale(off, 1 / l) : { x: 1, y: 0 }, min));
    }
  }
}

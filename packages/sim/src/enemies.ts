import { clampToArena, confine, damageEnemy, DT, hurtPlayer, newId, nearestPlayer, pointInDome, shovePlayer, spawnEnemy, submerged, targetable } from "./combat";
import { ENEMIES } from "./data/enemies";
import { MYTHIC } from "./data/mythics";
import { isBlackHole } from "./domes";
import { eliteHaste, eliteSpeed, updateElite } from "./elites";
import { hurtGadget, hurtGadgetsIn, tauntOf, tauntSlow, TURRET } from "./gadgets";
import { MARK, tickMark } from "./marks";
import { add, clamp, dist, distToSegment, dot, fromAngle, angleOf, len, norm, rand, randRange, rotate, scale, sub, type Vec } from "./math";
import type { Arena, AttackDef, Enemy, EnemyDef, Player, Puddle, World } from "./types";
import { snuffCandles } from "./crypt";
import { tryGrab, updateGrab } from "./grabs";
import { beltAt, trapPoint, ventState, waterAt } from "./room";
import { WATER } from "./players";
import { actHaste } from "./director";

/** Whatever an enemy is going after: a player, or a turret that taunted it. */
interface Target {
  pos: Vec;
  vel: Vec;
  radius: number;
  facing?: Vec;
}

/** Spike walls hurt enemies too, when they're shoved into them hard enough. */
const SPIKES = { minKnock: 60, damage: 25, bounce: 180 };

/** How many enemies are already after each player this tick, so packs spread over the party. */
let pressure = new Map<number, number>();

export function updateEnemies(w: World): void {
  pressure = new Map();
  for (const e of [...w.enemies]) updateEnemy(w, e);
  separate(w);
  // Baggage Claim belts carry enemies too, and so does sewer water (unless they swim).
  if (w.arena.belts.length > 0 || w.arena.water.length > 0) {
    for (const e of w.enemies) {
      const def = ENEMIES[e.defId]!;
      if (e.state === "hidden" || e.spawnT > 0 || def.movement.type === "stationary" || e.state === "attack") continue;
      const belt = beltAt(w.arena, e.pos);
      if (belt) e.pos.x += belt.vx * DT;
      const current = def.swimmer ? undefined : waterAt(w.arena, e.pos);
      if (current) e.pos = add(e.pos, scale({ x: current.vx, y: current.vy }, DT));
    }
  }
  for (const e of w.enemies) {
    const def = ENEMIES[e.defId]!;
    if (e.state === "hidden") continue;
    if (def.movement.type === "stationary") {
      // Props stay put: no shoving them around (or out of the room).
      e.knock = { x: 0, y: 0 };
      confine(w, e.pos, e.radius);
      continue;
    }
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

/** Everything that speeds up an enemy's attack clock: boss phases, Hasted, and how deep into the run this is. */
function haste(w: World, e: Enemy, def: EnemyDef): number {
  const act = w.run.plans[w.run.room.index]?.act ?? 0;
  return (def.boss ? def.boss.phases[e.phase]!.haste : 1) * eliteHaste(e) * actHaste(act);
}

/**
 * A taunting turret wins. Otherwise the nearest player, but enemies spread over the party: a player who already has
 * a crowd on them counts as a bit further away, so friends standing back still get company.
 */
function targetOf(w: World, e: Enemy): Target | undefined {
  const t = tauntOf(w, e);
  if (t) return { pos: t.pos, vel: { x: 0, y: 0 }, radius: TURRET.radius };
  const up = w.players.filter((p) => !p.downed && !p.away);
  if (up.length <= 1) return up[0] ?? nearestPlayer(w, e.pos);
  if (ENEMIES[e.defId]!.farAggro) {
    // Far-aggro: whoever has strayed furthest from the rest of the party.
    const c = scale(up.reduce((acc, p) => add(acc, p.pos), { x: 0, y: 0 }), 1 / up.length);
    return up.reduce((a, b) => (dist(b.pos, c) > dist(a.pos, c) ? b : a));
  }
  let best: Player | undefined;
  let bestScore = Infinity;
  for (const p of up) {
    const score = dist(e.pos, p.pos) + 35 * Math.max(0, (pressure.get(p.id) ?? 0) - 2);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best) pressure.set(best.id, (pressure.get(best.id) ?? 0) + 1);
  return best;
}

/** Where a target will be in `t` seconds if it keeps going. Enemies aim at that, so strafing in a line doesn't work. */
function lead(target: Target, t: number, k = 1): Vec {
  return add(target.pos, scale(target.vel, t * k));
}

function updateEnemy(w: World, e: Enemy): void {
  const def = ENEMIES[e.defId]!;
  if (e.hp <= 0) return;
  if (e.spawnT > 0) {
    e.spawnT -= DT;
    if (e.spawnT > 0) return;
    if (e.lost) {
      // Lost & Found: it turns up again where it was misplaced, not quite sure what happened.
      e.lost = false;
      e.stunT = Math.max(e.stunT, MYTHIC.foundDazeS);
      w.events.push({ type: "found", id: e.id });
    } else w.events.push({ type: "enemySpawn", id: e.id });
    return;
  }
  e.hitFlash = Math.max(0, e.hitFlash - DT);

  // Statuses.
  const s = e.status;
  s.acidT = Math.max(0, s.acidT - DT);
  e.dutyT = Math.max(0, e.dutyT - DT);
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
  if (s.frozenT > 0 || e.stunT > 0 || e.sleepT > 0) {
    s.frozenT = Math.max(0, s.frozenT - DT);
    e.stunT = Math.max(0, e.stunT - DT);
    e.sleepT = Math.max(0, e.sleepT - DT);
    e.vel = { x: 0, y: 0 };
    return;
  }

  const h = haste(w, e, def);
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
      const atk = def.attacks[e.attackIdx]!;
      // Melee and charges keep turning toward you for the first part of the windup: stepping aside early doesn't
      // work, dodging at the last moment does.
      const total = atk.windupMs / 1000 / h;
      if (target && (atk.type === "melee" || atk.type === "dash" || atk.type === "grab") && e.stateT > total * 0.4) {
        const want = norm(sub(atk.type === "dash" ? lead(target, 0.2) : target.pos, e.pos));
        e.attackDir = norm(add(scale(e.attackDir, 0.82), scale(want, 0.18)));
      }
      // Frost stretches windups too.
      e.stateT -= DT * slow;
      if (e.stateT <= 0) executeAttack(w, e, def, atk, target);
      break;
    }
    case "attack": {
      const atk = def.attacks[e.attackIdx]!;
      if (atk.type === "nova" || atk.type === "shockwave") {
        updateBurst(w, e, atk);
        break;
      }
      if (atk.type === "submerge") {
        updateSubmerge(w, e, atk, target);
        break;
      }
      if (atk.type === "sweep") {
        updateSweep(w, e, atk);
        break;
      }
      if (atk.type === "grab") {
        updateGrab(w, e, atk);
        break;
      }
      if (atk.type !== "dash") break;
      e.vel = scale(e.attackDir, atk.dashSpeed * slow);
      e.pos = add(e.pos, scale(e.vel, DT));
      for (const p of w.players) {
        if (p.downed || e.hitPlayers.includes(p.id)) continue;
        if (dist(p.pos, e.pos) < p.radius + e.radius + 2) {
          if (hurtPlayer(w, p, atk.damage)) {
            e.hitPlayers.push(p.id);
            // Shoved out of the lane, sideways.
            if (atk.push) shovePlayer(p, scale(sideOf(e.attackDir, sub(p.pos, e.pos)), atk.push));
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
      if (d > 70 && !def.boss) {
        // Surround: each chaser heads for its own spot around the target, so packs come from several sides
        // instead of queueing up in front of your gun.
        const slot = add(target.pos, fromAngle(e.id * 2.39996 + e.steer, 46));
        want = norm(sub(slot, e.pos));
      } else want = d > 50 ? rotate(dir, e.steer) : dir;
    }
  } else {
    if (d < m.min) want = scale(dir, -1);
    else if (d > m.max) want = dir;
    else {
      want = scale({ x: -dir.y, y: dir.x }, e.strafe * 0.6);
      if (rand(w) < 0.01) e.strafe *= -1;
    }
    // Supports hang back behind their friends instead of out in the open.
    if (def.role === "support") {
      const friends = w.enemies.filter((o) => o !== e && targetable(o) && ENEMIES[o.defId]!.role !== "support");
      if (friends.length > 0) {
        const c = scale(friends.reduce((acc, o) => add(acc, o.pos), { x: 0, y: 0 }), 1 / friends.length);
        const behind = add(c, scale(norm(sub(c, target.pos)), 40));
        if (dist(e.pos, behind) > 30) want = add(want, scale(norm(sub(behind, e.pos)), 0.8));
      }
    }
    // Ranged enemies sidestep shots coming straight at them (not every time, or they'd be unhittable).
    dodge(w, e, (v) => (want = add(want, v)));
  }

  // Nobody likes standing in fire: enemies step out of burning ground unless they're fire-immune.
  if (!def.fireImmune) {
    for (const hz of w.hazards) {
      if (hz.owner !== "player") continue;
      const off = sub(e.pos, hz.pos);
      const l = len(off);
      if (l < hz.radius + e.radius + 6) want = add(want, scale(norm(off), 0.8));
    }
  }

  // Enemies keep clear of traps that are about to go off. Fire-immune ones use vents as bait.
  for (const v of w.run.room.vents) {
    if (ventState(v) === "idle" || (v.kind === "vent" && def.fireImmune)) continue;
    const off = sub(e.pos, trapPoint(v, e.pos));
    const l = len(off);
    if (l < v.radius + e.radius + 14) want = add(want, scale(l > 0.01 ? norm(off) : { x: -dir.y, y: dir.x }, 1.5));
  }

  // Wading is slow for everyone but the sewer family.
  const wade = !def.swimmer && w.arena.water.length > 0 && waterAt(w.arena, e.pos) ? WATER.wade : 1;
  e.vel = scale(norm(want), def.speed * slow * wade * Math.min(1, len(want) || 0));
  e.pos = add(e.pos, scale(e.vel, DT));
}

/** Sidestep the nearest player shot heading this way. Re-decided now and then, so it's a habit, not a guarantee. */
function dodge(w: World, e: Enemy, push: (v: Vec) => void): void {
  if (e.dodgeT > 0) {
    e.dodgeT -= DT;
    return;
  }
  for (const pr of w.projectiles) {
    if (pr.owner !== "player" || pr.lob) continue;
    const off = sub(e.pos, pr.pos);
    const d = len(off);
    if (d > 80 || d < 1) continue;
    const v = norm(pr.vel);
    if (dot(v, norm(off)) < 0.93) continue;
    // Half the time it reacts; either way it won't think about it again for a moment.
    e.dodgeT = 0.6;
    if (rand(w) < 0.5) push(scale({ x: -v.y * e.strafe, y: v.x * e.strafe }, 2.2));
    return;
  }
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
  return def.attacks.reduce((m, a) => (a.type === "shieldAllies" || a.type === "summon" || a.type === "nova" || a.type === "shockwave" || a.type === "submerge" || a.type === "sweep" || a.type === "blackout" ? m : Math.min(m, a.range)), Infinity);
}

function childrenAlive(w: World, e: Enemy): number {
  return w.enemies.filter((c) => c.parentId === e.id && c.hp > 0).length;
}

function canUse(w: World, e: Enemy, atk: AttackDef, d: number): boolean {
  switch (atk.type) {
    case "shieldAllies":
      return (
        w.enemies.some((o) => o !== e && targetable(o) && o.shield < atk.amount * 0.5 && dist(o.pos, e.pos) < atk.radius) ||
        (!!atk.snuff && w.run.room.candles.some((c) => c.litT > 0 && dist(c.pos, e.pos) < atk.snuff!))
      );
    case "summon":
      return childrenAlive(w, e) < atk.maxAlive;
    default:
      return d <= atk.range;
  }
}

/** Boss attacks big enough to get their own call-out on screen. */
const BIG = new Set(["nova", "shockwave", "submerge", "sweep", "blackout"]);

function tryStartAttack(w: World, e: Enemy, def: EnemyDef, target: Target): void {
  const d = dist(e.pos, target.pos) - target.radius - e.radius;
  const usable = def.boss ? def.boss.phases[e.phase]!.attacks : def.attacks.map((_, i) => i);
  const ready = usable.filter((i) => e.cooldowns[i]! <= 0 && canUse(w, e, def.attacks[i]!, d));
  if (ready.length === 0) return;
  // Bosses mix it up; everyone else uses their first ready attack.
  const i = def.boss ? ready[Math.floor(rand(w) * ready.length)]! : ready[0]!;
  const atk = def.attacks[i]!;
  e.state = "windup";
  e.stateT = atk.windupMs / 1000 / haste(w, e, def);
  e.attackIdx = i;
  e.attackDir = norm(sub(atk.type === "dash" ? lead(target, 0.25) : target.pos, e.pos));
  if (atk.type === "lobbedProjectile") {
    // Lead the target by most of the flight: walking in a straight line gets you hit, changing direction doesn't.
    e.attackPoints = [clampToArena(w, lead(target, atk.flightMs / 1000, 0.55), 8)];
    if (atk.cross) {
      // Slag Cross: lines marching out from the boss, one of them straight at you. Step between the arms.
      // Past half health it grows two more arms, so the gaps get tighter.
      e.attackPoints = [];
      const arms = atk.cross.arms + (e.phase >= 2 ? 2 : 0);
      const base = angleOf(sub(target.pos, e.pos));
      for (let a = 0; a < arms; a++) {
        const dir = fromAngle(base + (a / arms) * Math.PI * 2);
        for (let d = atk.cross.spacing; d <= atk.range; d += atk.cross.spacing) {
          const at = add(e.pos, scale(dir, d));
          if (at.x < 8 || at.y < 8 || at.x > w.arena.w - 8 || at.y > w.arena.h - 8) break;
          e.attackPoints.push(at);
        }
      }
    } else if (atk.rain) {
      // Boss rain: one on every player, the rest all over the arena.
      for (const p of w.players) if (!p.downed && !p.away && dist(p.pos, target.pos) > 1) e.attackPoints.push(clampToArena(w, lead(p, atk.flightMs / 1000, 0.4), 8));
      while (e.attackPoints.length < (atk.count ?? 1)) e.attackPoints.push({ x: randRange(w, 30, w.arena.w - 30), y: randRange(w, 40, w.arena.h - 30) });
    } else {
      for (let k = 1; k < (atk.count ?? 1); k++) {
        const a = rand(w) * Math.PI * 2;
        e.attackPoints.push(clampToArena(w, add(target.pos, fromAngle(a, randRange(w, 20, atk.scatter ?? 40))), 8));
      }
    }
  }
  if (atk.type === "blackout") {
    // Pages rain all over the room in the dark, one on every player. They glow, so you can still see them coming.
    e.attackPoints = [];
    for (const p of w.players) if (!p.downed && !p.away) e.attackPoints.push(clampToArena(w, lead(p, atk.flightMs / 1000, 0.4), 8));
    while (e.attackPoints.length < atk.count) e.attackPoints.push({ x: randRange(w, 30, w.arena.w - 30), y: randRange(w, 40, w.arena.h - 30) });
  }
  // Sweeps turn whichever way the target isn't already running. The direction rides along in attackPoints[0].x so
  // co-op clients can draw the beams too.
  if (atk.type === "sweep") e.attackPoints = [{ x: target.vel.x * -e.attackDir.y + target.vel.y * e.attackDir.x > 0 ? -1 : 1, y: 0 }];
  w.events.push({ type: "enemyWindup", id: e.id, attack: atk.type });
  if (BIG.has(atk.type) || (atk.type === "lobbedProjectile" && atk.rain)) w.events.push({ type: "bossCall", id: e.id, attack: atk.type });
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
      // A lunge sells the bite (and closes the gap if you only just stepped back).
      e.knock = add(e.knock, scale(e.attackDir, 150));
      break;
    }
    case "dash": {
      e.state = "attack";
      e.stateT = atk.dashMs / 1000;
      e.hitPlayers = [];
      // The first charge of a chain sets how many more follow.
      if (e.burst <= 0 && atk.chain) e.burst = atk.chain - 1;
      break;
    }
    case "lobbedProjectile": {
      const pd = atk.puddle;
      const kind = pd && !pd.fire ? (pd.ice ? "slush" : "acid") : "mortar";
      for (const to of e.attackPoints) lobAt(w, e, to, atk, kind);
      break;
    }
    case "grab": {
      // A lunge sells the grab. Catching nobody leaves it off balance for a moment.
      e.knock = add(e.knock, scale(e.attackDir, 150));
      if (!tryGrab(w, e, atk)) e.stateT += 0.3;
      break;
    }
    case "blackout": {
      // Every light goes out, and the pages come down while you can barely see.
      snuffCandles(w);
      w.run.room.blackoutT = atk.durationMs / 1000;
      w.events.push({ type: "blackout", id: e.id });
      for (const to of e.attackPoints) lobAt(w, e, to, { ...atk, range: Math.hypot(w.arena.w, w.arena.h) }, "page");
      break;
    }
    case "slam": {
      w.events.push({ type: "explosion", x: e.pos.x, y: e.pos.y, radius: atk.radius, owner: "enemy", element: "none" });
      for (const p of w.players) {
        if (p.downed || p.away || dist(p.pos, e.pos) > atk.radius + p.radius * 0.5) continue;
        if (pointInDome(w, p.pos)) w.events.push({ type: "blocked", x: p.pos.x, y: p.pos.y });
        else if (hurtPlayer(w, p, atk.damage) && atk.push) shovePlayer(p, scale(norm(sub(p.pos, e.pos)), atk.push));
      }
      hurtGadgetsIn(w, e.pos, atk.radius, atk.damage, e);
      break;
    }
    case "cone": {
      w.events.push({ type: "explosion", x: e.pos.x + e.attackDir.x * atk.length * 0.5, y: e.pos.y + e.attackDir.y * atk.length * 0.5, radius: atk.length * 0.4, owner: "enemy", element: "frost" });
      for (const p of w.players) {
        if (p.downed || p.away || !inCone(e, p.pos, atk.length, atk.angleDeg, p.radius)) continue;
        if (pointInDome(w, p.pos)) w.events.push({ type: "blocked", x: p.pos.x, y: p.pos.y });
        else if (hurtPlayer(w, p, atk.damage) && atk.push) shovePlayer(p, scale(e.attackDir, atk.push));
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
      // Aim where you're going: about how long the bolt takes to get there.
      const aimAt = target ? norm(sub(lead(target, dist(e.pos, target.pos) / atk.speed, 0.7), e.pos)) : e.attackDir;
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
    case "nova":
    case "shockwave": {
      // Several volleys (or rings) in a row, handled in the attack state.
      e.state = "attack";
      e.burst = atk.type === "nova" ? atk.volleys : atk.rings;
      e.stateT = 0;
      e.attackPoints = [];
      break;
    }
    case "submerge": {
      // Under it goes: the swim and the surfacing are handled in the attack state.
      e.state = "attack";
      e.stateT = (atk.swimMs + atk.surfaceMs) / 1000;
      e.knock = { x: 0, y: 0 };
      break;
    }
    case "sweep": {
      e.state = "attack";
      e.stateT = atk.sweepMs / 1000;
      e.hitPlayers = [];
      break;
    }
    case "shieldAllies": {
      // A Bell Ringer's toll puts the candles around it out.
      if (atk.snuff) snuffCandles(w, e.pos, atk.snuff);
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

/** One lobbed shell from an enemy to `to`: further shots take a little longer. */
function lobAt(w: World, e: Enemy, to: Vec, atk: { flightMs: number; range: number; radius: number; damage: number; puddle?: Puddle }, kind: string): void {
  const d = dist(e.pos, to);
  const pd = atk.puddle;
  w.projectiles.push({
    id: newId(w), owner: "enemy", ownerId: e.id, kind,
    element: pd ? (pd.ice ? "frost" : pd.fire ? "fire" : "acid") : "none",
    pos: { ...e.pos }, vel: { x: 0, y: 0 }, radius: 4, damage: atk.damage, pierce: 0, bounces: 0, knockback: 0, life: 99,
    hitIds: [], gunUid: -1,
    lob: { from: { ...e.pos }, to: { ...to }, t: 0, dur: Math.max(0.3, (atk.flightMs / 1000) * (0.6 + (0.4 * d) / atk.range)), radius: atk.radius, puddle: atk.puddle },
  });
}

/**
 * Return to Sender: a charge caught mid-run is cut short and sent back the way it came, then stunned as if it had
 * hit a wall (bosses aren't shoved, but still lose the rest of a chained charge). Returns true if it was charging.
 */
export function returnCharge(w: World, e: Enemy): boolean {
  const def = ENEMIES[e.defId]!;
  const atk = def.attacks[e.attackIdx];
  if (e.state !== "attack" || atk?.type !== "dash") return false;
  if (!def.boss) e.knock = scale(e.attackDir, -atk.dashSpeed * RETURN_SHOVE);
  e.burst = 0;
  endDash(w, e, true);
  w.events.push({ type: "reflect", x: e.pos.x, y: e.pos.y });
  return true;
}

/** How hard a returned charge is shoved back, as a share of its own charge speed. */
const RETURN_SHOVE = 0.9;

function endDash(w: World, e: Enemy, hitWall: boolean): void {
  const def = ENEMIES[e.defId]!;
  const atk = def.attacks[e.attackIdx]!;
  if (atk.type !== "dash") return;
  e.vel = { x: 0, y: 0 };
  if (hitWall) w.events.push({ type: "bonk", id: e.id, x: e.pos.x, y: e.pos.y });
  // Chained charges: a short re-aim, then off again. A wall still stuns it out of the chain.
  if (e.burst > 0 && !hitWall) {
    e.burst--;
    const target = targetOf(w, e);
    e.state = "windup";
    e.stateT = 0.45 / haste(w, e, def);
    if (target) e.attackDir = norm(sub(lead(target, 0.3), e.pos));
    w.events.push({ type: "enemyWindup", id: e.id, attack: "dash" });
    return;
  }
  e.burst = 0;
  e.state = "recover";
  e.stateT = (hitWall ? atk.stunMs : atk.recoverMs) / 1000;
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
    if (fixed(a) || submerged(a)) continue;
    for (const p of w.players) {
      if (p.downed || p.away || p.dashT > 0 || p.pinnedBy === a.id) continue;
      const off = sub(a.pos, p.pos);
      const min = a.radius + p.radius;
      const l = len(off);
      if (l < min) a.pos = add(p.pos, scale(l > 0.01 ? scale(off, 1 / l) : { x: 1, y: 0 }, min));
    }
  }
}

/** Submerge: swim after the target out of reach, stop where it's going to come up, then burst out of the water. */
function updateSubmerge(w: World, e: Enemy, atk: Extract<AttackDef, { type: "submerge" }>, target: Target | undefined): void {
  e.stateT -= DT;
  if (e.stateT > atk.surfaceMs / 1000) {
    if (target && dist(target.pos, e.pos) > 4) {
      e.vel = scale(norm(sub(target.pos, e.pos)), Math.min(atk.swimSpeed, dist(target.pos, e.pos) / DT));
      e.pos = add(e.pos, scale(e.vel, DT));
      confine(w, e.pos, e.radius);
    }
    return;
  }
  // The circle is showing: it holds still so you can get out.
  if (e.stateT > 0) return;
  w.events.push({ type: "surface", id: e.id, x: e.pos.x, y: e.pos.y });
  w.events.push({ type: "explosion", x: e.pos.x, y: e.pos.y, radius: atk.radius, owner: "enemy", element: "acid" });
  for (const p of w.players) {
    if (p.downed || p.away || dist(p.pos, e.pos) > atk.radius + p.radius * 0.5) continue;
    if (pointInDome(w, p.pos)) w.events.push({ type: "blocked", x: p.pos.x, y: p.pos.y });
    else if (hurtPlayer(w, p, atk.damage) && atk.push) shovePlayer(p, scale(norm(sub(p.pos, e.pos)), atk.push));
  }
  hurtGadgetsIn(w, e.pos, atk.radius, atk.damage, e);
  const turn = rand(w) * Math.PI;
  for (let k = 0; k < atk.bolts; k++) {
    const a = turn + (k / atk.bolts) * Math.PI * 2;
    w.projectiles.push({
      id: newId(w), owner: "enemy", ownerId: e.id, kind: "bolt", element: "none", pos: add(e.pos, fromAngle(a, e.radius)),
      vel: fromAngle(a, atk.boltSpeed), radius: 3, damage: atk.boltDamage, pierce: 0, bounces: 0, knockback: 0, life: 4, hitIds: [], gunUid: -1,
    });
  }
  e.state = "recover";
  e.stateT = atk.recoverMs / 1000;
}

/** How many beams a sweep has: one more once the boss is past half health. */
export function sweepBeams(e: Pick<Enemy, "phase">, atk: Extract<AttackDef, { type: "sweep" }>): number {
  return atk.beams + (e.phase >= 2 ? 1 : 0);
}

/**
 * The angle of a sweep's first beam: from where it aimed, turning at a steady rate through the attack. Worked out from
 * the attack clock, so co-op clients draw the same beams the server hits with.
 */
export function sweepAngle(e: Pick<Enemy, "state" | "stateT" | "attackDir" | "attackPoints">, atk: Extract<AttackDef, { type: "sweep" }>): number {
  const done = e.state === "attack" ? clamp(1 - e.stateT / (atk.sweepMs / 1000), 0, 1) : 0;
  const spin = (e.attackPoints[0]?.x ?? 1) < 0 ? -1 : 1;
  return angleOf(e.attackDir) + spin * done * (atk.turnDeg * Math.PI) / 180;
}

/** How far a beam from `from` gets before a crate or a wall stops it. Crates are cover. */
export function beamLength(arena: Pick<Arena, "w" | "h" | "obstacles">, from: Vec, dir: Vec): number {
  const max = Math.hypot(arena.w, arena.h);
  for (let d = 12; d < max; d += 4) {
    const x = from.x + dir.x * d;
    const y = from.y + dir.y * d;
    if (x < 0 || y < 0 || x > arena.w || y > arena.h) return d;
    if (arena.obstacles.some((o) => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)) return d;
  }
  return max;
}

/** Laser Sweep: the beams turn; anyone they cross gets hit (dashing through works, crates block them). */
function updateSweep(w: World, e: Enemy, atk: Extract<AttackDef, { type: "sweep" }>): void {
  e.stateT -= DT;
  const n = sweepBeams(e, atk);
  const a0 = sweepAngle(e, atk);
  for (let k = 0; k < n; k++) {
    const dir = fromAngle(a0 + (k / n) * Math.PI * 2);
    const end = add(e.pos, scale(dir, beamLength(w.arena, e.pos, dir)));
    for (const p of w.players) {
      if (p.downed || p.away || distToSegment(p.pos, e.pos, end) > atk.width + p.radius * 0.6 || pointInDome(w, p.pos)) continue;
      hurtPlayer(w, p, atk.damage);
    }
    for (const g of w.gadgets) {
      if (g.kind === "turret" && !e.hitPlayers.includes(-g.id) && distToSegment(g.pos, e.pos, end) < atk.width + TURRET.radius) {
        e.hitPlayers.push(-g.id);
        hurtGadget(w, g, atk.damage, e);
      }
    }
  }
  if (e.stateT <= 0) {
    e.hitPlayers = [];
    e.state = "recover";
    e.stateT = atk.recoverMs / 1000;
  }
}

/** Nova volleys and shockwave rings: one part every `gapMs`, then recover. */
function updateBurst(w: World, e: Enemy, atk: Extract<AttackDef, { type: "nova" | "shockwave" }>): void {
  e.stateT -= DT;
  if (e.stateT > 0) return;
  if (e.burst <= 0) {
    e.state = "recover";
    e.stateT = atk.recoverMs / 1000;
    return;
  }
  e.burst--;
  e.stateT = atk.gapMs / 1000;
  w.events.push({ type: "enemyAttack", id: e.id, attack: atk.type });
  if (atk.type === "nova") {
    // Each volley turns half a step, so the safe gaps move and you have to move with them.
    const turn = (e.burst % 2) * (Math.PI / atk.count) + rand(w) * 0.2;
    for (let k = 0; k < atk.count; k++) {
      const a = turn + (k / atk.count) * Math.PI * 2;
      w.projectiles.push({
        id: newId(w), owner: "enemy", ownerId: e.id, kind: "bolt", element: "none", pos: add(e.pos, fromAngle(a, e.radius)),
        vel: fromAngle(a, atk.speed), radius: atk.radius, damage: atk.damage, pierce: 0, bounces: 0, knockback: 0, life: 4, hitIds: [], gunUid: -1,
      });
    }
    return;
  }
  // A ring that sweeps out to the far corners. It moves fast enough that you can't outrun it: dash through.
  const reach = Math.hypot(w.arena.w, w.arena.h);
  const t = reach / atk.speed;
  w.hazards.push({ id: newId(w), kind: "wave", owner: "enemy", pos: { ...e.pos }, radius: Math.round(reach), t, maxT: t, damage: atk.damage, push: atk.push });
  w.events.push({ type: "explosion", x: e.pos.x, y: e.pos.y, radius: 40, owner: "enemy", element: "none" });
}

import { DT, insideArenaSolid } from "./combat";
import { ENEMIES } from "./data/enemies";
import { makeEnemy } from "./enemies";
import { dist, pick, rand, randRange, type Vec } from "./math";
import type { World } from "./types";

export const MAX_ENEMIES = 40;
const BREATHER_S = 4;

/**
 * Prototype director: endless arena waves with a growing threat budget.
 * Phase 2 replaces this with the full room-by-room director from the design doc.
 */
export function updateDirector(w: World): void {
  const dir = w.director;
  if (dir.state === "breather") {
    dir.timer -= DT;
    if (dir.timer <= 0) startWave(w);
    return;
  }
  if (w.enemies.length === 0) {
    dir.state = "breather";
    dir.timer = BREATHER_S;
    w.events.push({ type: "waveCleared", wave: dir.wave });
  }
}

/** Which enemies a wave may use. Early waves introduce one problem at a time. */
function rosterFor(wave: number): string[] {
  if (wave <= 1) return ["cone_rat"];
  if (wave === 2) return ["cone_rat", "jet_boar"];
  if (wave === 3) return ["cone_rat", "mortar_beetle"];
  return ["cone_rat", "jet_boar", "mortar_beetle"];
}

export function planWave(w: World, wave: number): string[] {
  const roster = rosterFor(wave);
  let budget = 4 + Math.floor(wave * 2.5);
  const out: string[] = [];
  const heavies = roster.filter((id) => id !== "cone_rat");
  const maxArtillery = 1 + Math.floor(wave / 3);

  // Rule against dull mixes: every wave after the first leads with a non-swarmer.
  if (heavies.length > 0) {
    const first = heavies[wave % heavies.length]!;
    out.push(first);
    budget -= ENEMIES[first]!.threatCost;
  }

  while (budget > 0 && out.length < MAX_ENEMIES) {
    const id = pick(w, roster);
    const def = ENEMIES[id]!;
    if (def.role === "artillery" && out.filter((x) => ENEMIES[x]!.role === "artillery").length >= maxArtillery) continue;
    if (def.role === "swarmer") {
      // Swarmers come in packs.
      const pack = Math.min(budget, 3 + Math.floor(rand(w) * 3));
      for (let i = 0; i < pack; i++) out.push(id);
      budget -= pack;
    } else {
      if (def.threatCost > budget + 1) break;
      out.push(id);
      budget -= def.threatCost;
    }
  }
  return out;
}

function startWave(w: World): void {
  const dir = w.director;
  dir.wave++;
  dir.state = "fighting";
  w.events.push({ type: "waveStart", wave: dir.wave });

  const plan = planWave(w, dir.wave).slice(0, MAX_ENEMIES - w.enemies.length);
  let packCenter: Vec | undefined;
  plan.forEach((id, i) => {
    const isSwarmer = ENEMIES[id]!.role === "swarmer";
    let pos: Vec;
    if (isSwarmer && packCenter && rand(w) < 0.75) pos = spawnNear(w, packCenter);
    else {
      pos = spawnPoint(w);
      if (isSwarmer) packCenter = pos;
    }
    w.enemies.push(makeEnemy(w, id, pos, 0.8 + i * 0.12));
  });
}

function spawnPoint(w: World): Vec {
  for (let tries = 0; tries < 40; tries++) {
    const p = { x: randRange(w, 24, w.arena.w - 24), y: randRange(w, 24, w.arena.h - 24) };
    if (insideArenaSolid(w, p)) continue;
    if (w.players.some((pl) => dist(pl.pos, p) < 140)) continue;
    return p;
  }
  return { x: 24, y: 24 };
}

function spawnNear(w: World, c: Vec): Vec {
  for (let tries = 0; tries < 10; tries++) {
    const p = { x: c.x + randRange(w, -24, 24), y: c.y + randRange(w, -24, 24) };
    if (!insideArenaSolid(w, p)) return p;
  }
  return { ...c };
}

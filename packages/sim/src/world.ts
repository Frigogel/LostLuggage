import { DT } from "./combat";
import { planRun } from "./director";
import { updateEnemies } from "./enemies";
import { EMPTY_INPUT, makePlayer, updatePickups, updatePlayer } from "./players";
import { updateHazards, updateProjectiles } from "./projectiles";
import { ARENA, enterRoom, START, updateRoom } from "./room";
import type { PlayerInput, World } from "./types";

export interface WorldOptions {
  seed: number;
  heroId?: string;
  /** Difficulty tier: 0 = Normal. */
  tier?: number;
}

export function createWorld(opts: WorldOptions): World {
  const w: World = {
    tick: 0,
    time: 0,
    seed: opts.seed | 0,
    nextId: 1,
    arena: { w: ARENA.w, h: ARENA.h, obstacles: [] },
    players: [],
    enemies: [],
    projectiles: [],
    domes: [],
    hazards: [],
    pickups: [],
    run: {
      plans: [],
      // Replaced by enterRoom below.
      room: { index: 0, kind: "intro", waves: [], waveIdx: 0, waveTimer: 0, cleared: false, exit: { x: 0, y: 0, w: 0, h: 0 }, vents: [] },
      tier: opts.tier ?? 0,
      kills: 0,
      gunsFound: 0,
      time: 0,
      victory: false,
    },
    events: [],
    gameOver: false,
  };

  w.players.push(makePlayer(w, opts.heroId ?? "vanguard", START));
  w.run.plans = planRun(w, w.run.tier, w.players.length);
  enterRoom(w, 0);
  return w;
}

/** Advances the world by one fixed tick. `inputs[i]` drives `world.players[i]`. Events are rebuilt each tick. */
export function step(w: World, inputs: readonly PlayerInput[]): void {
  w.events = [];
  if (w.gameOver) return;
  w.tick++;
  w.time += DT;

  w.players.forEach((p, i) => updatePlayer(w, p, inputs[i] ?? EMPTY_INPUT));
  updatePickups(w, inputs);

  for (const d of w.domes) d.t -= DT;
  w.domes = w.domes.filter((d) => d.t > 0);

  updateEnemies(w);
  updateProjectiles(w);
  updateHazards(w);
  w.enemies = w.enemies.filter((e) => e.hp > 0);
  updateRoom(w);

  if (w.players.every((p) => p.downed && p.reviveT === Infinity)) {
    w.gameOver = true;
    w.events.push({ type: "gameOver" });
  }
}


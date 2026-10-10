import { DT } from "./combat";
import { planRun } from "./director";
import { updateEnemies } from "./enemies";
import { checkWipe, EMPTY_INPUT, makePlayer, MAX_PLAYERS, startPos, updatePickups, updatePlayer, type PlayerOptions } from "./players";
import { updateHazards, updateProjectiles } from "./projectiles";
import { ARENA, enterRoom, START, updateRoom } from "./room";
import type { PlayerInput, World } from "./types";

export interface WorldOptions {
  seed: number;
  /** Solo shorthand for a single player. Ignored when `players` is given. */
  heroId?: string;
  /** Everyone starting the run, up to four. Defaults to one Vanguard. */
  players?: PlayerOptions[];
  /** Difficulty tier: 0 = Normal. */
  tier?: number;
  /** Co-op run: level sync and waiting for the party at the exit. A co-op room with one player is still co-op. */
  coop?: boolean;
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
      room: { index: 0, kind: "intro", waves: [], waveIdx: 0, waveTimer: 0, cleared: false, exit: { x: 0, y: 0, w: 0, h: 0 }, exitT: -1, vents: [] },
      tier: opts.tier ?? 0,
      coop: opts.coop ?? false,
      kills: 0,
      gunsFound: 0,
      time: 0,
      victory: false,
    },
    events: [],
    gameOver: false,
  };

  const party = (opts.players ?? [{ heroId: opts.heroId }]).slice(0, MAX_PLAYERS);
  party.forEach((o, i) => w.players.push(makePlayer(w, o, startPos(START, i, party.length), i)));
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
  checkWipe(w);
}

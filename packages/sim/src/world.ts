import { DT } from "./combat";
import { actOrder, firstRoom } from "./director";
import { updateDomes } from "./domes";
import { updateEnemies } from "./enemies";
import { updateGadgets } from "./gadgets";
import { checkWipe, EMPTY_INPUT, makePlayer, MAX_PLAYERS, startPos, updatePickups, updatePlayer, type PlayerOptions } from "./players";
import { updateHazards, updateProjectiles } from "./projectiles";
import { ARENA, enterRoom, START, updateRoom } from "./room";
import { BIOMES } from "./data/enemies";
import type { Biome, PlayerInput, World } from "./types";

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
  /** Which adventure starts the run (default the Burning Foundry). The others follow. */
  biome?: Biome;
}

export function createWorld(opts: WorldOptions): World {
  const w: World = {
    tick: 0,
    time: 0,
    seed: opts.seed | 0,
    nextId: 1,
    arena: { w: ARENA.w, h: ARENA.h, obstacles: [], ice: false, spikes: [], belts: [], water: [], pads: [] },
    players: [],
    enemies: [],
    projectiles: [],
    domes: [],
    gadgets: [],
    hazards: [],
    pickups: [],
    run: {
      biome: opts.biome && BIOMES[opts.biome] ? opts.biome : "foundry",
      order: [],
      plans: [],
      // Replaced by enterRoom below.
      room: { index: 0, kind: "intro", biome: "foundry", twist: "", doors: [], holdT: 0, twistT: 0, waves: [], waveIdx: 0, waveTimer: 0, cleared: false, exitT: -1, vents: [] },
      tier: opts.tier ?? 0,
      coop: opts.coop ?? false,
      kills: 0,
      gunsFound: 0,
      time: 0,
      victory: false,
      finale: false,
      bosses: 0,
    },
    events: [],
    gameOver: false,
  };

  w.run.order = actOrder(w.run.biome, w.seed);
  const party = (opts.players ?? [{ heroId: opts.heroId }]).slice(0, MAX_PLAYERS);
  party.forEach((o, i) => w.players.push(makePlayer(w, o, startPos(START, i, party.length), i)));
  enterRoom(w, firstRoom(w));
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

  updateDomes(w);
  updateGadgets(w);

  updateEnemies(w);
  updateProjectiles(w);
  updateHazards(w);
  w.enemies = w.enemies.filter((e) => e.hp > 0);
  updateRoom(w);
  checkWipe(w);
}

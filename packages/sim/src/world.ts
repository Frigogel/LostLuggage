import { DT, newId } from "./combat";
import { updateDirector } from "./director";
import { updateEnemies } from "./enemies";
import { len, sub } from "./math";
import { EMPTY_INPUT, makeGun, makePlayer, updatePickups, updatePlayer } from "./players";
import { updateProjectiles } from "./projectiles";
import type { PlayerInput, World } from "./types";

export interface WorldOptions {
  seed: number;
  heroId?: string;
}

export const ARENA = { w: 720, h: 440 };

export function createWorld(opts: WorldOptions): World {
  const w: World = {
    tick: 0,
    time: 0,
    seed: opts.seed | 0,
    nextId: 1,
    arena: {
      w: ARENA.w,
      h: ARENA.h,
      // Crates of cruise-line cargo give cover, and a reason to own a launcher.
      obstacles: [
        { x: 160, y: 112, w: 32, h: 32 },
        { x: 528, y: 112, w: 32, h: 32 },
        { x: 160, y: 296, w: 32, h: 32 },
        { x: 528, y: 296, w: 32, h: 32 },
        { x: 336, y: 200, w: 48, h: 16 },
      ],
    },
    players: [],
    enemies: [],
    projectiles: [],
    domes: [],
    pickups: [],
    director: { wave: 0, state: "breather", timer: 2.5, kills: 0 },
    events: [],
    gameOver: false,
  };

  w.players.push(makePlayer(w, opts.heroId ?? "vanguard", { x: ARENA.w / 2, y: ARENA.h / 2 + 60 }));

  // Gun pedestals: stand on one to trade the gun in your hands for it.
  const pedestals: [string, number, number][] = [
    ["smg", 280, 380],
    ["sniper", 360, 400],
    ["launcher", 440, 380],
  ];
  for (const [defId, x, y] of pedestals) {
    w.pickups.push({ id: newId(w), pos: { x, y }, gun: makeGun(defId), standT: 0, armed: true });
  }
  return w;
}

/** Advances the world by one fixed tick. `inputs[i]` drives `world.players[i]`. Events are rebuilt each tick. */
export function step(w: World, inputs: readonly PlayerInput[]): void {
  w.events = [];
  if (w.gameOver) return;
  w.tick++;
  w.time += DT;

  w.players.forEach((p, i) => updatePlayer(w, p, inputs[i] ?? EMPTY_INPUT));
  updatePickups(w);

  for (const d of w.domes) d.t -= DT;
  w.domes = w.domes.filter((d) => d.t > 0);

  updateEnemies(w);
  updateProjectiles(w);
  w.enemies = w.enemies.filter((e) => e.hp > 0);
  updateDirector(w);

  if (w.players.every((p) => p.downed && p.reviveT === Infinity)) {
    w.gameOver = true;
    w.events.push({ type: "gameOver" });
  }
}

/** True when the player is close enough to a pickup for the UI to describe it. */
export function nearbyPickup(w: World, playerIdx = 0) {
  const p = w.players[playerIdx];
  if (!p) return undefined;
  return w.pickups.find((pk) => len(sub(pk.pos, p.pos)) < 28);
}

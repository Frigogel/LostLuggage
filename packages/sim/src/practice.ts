import { DT, newId, spawnEnemy } from "./combat";
import { GRENADE_IDS } from "./data/grenades";
import { newGun } from "./loot";
import type { Vec } from "./math";
import type { Archetype, PracticeSpot, World } from "./types";

// The practice range: a quiet room of training dummies to try a loadout on. Solo only, and nothing in it is saved.
// Dummies never fight back. Killed ones stand back up a moment later (so kill effects can be tested), and one left
// alone for a few seconds heals to full (so damage readings start fresh).

export const PRACTICE = {
  /** Seconds before a killed dummy stands back up. */
  respawnS: 1.5,
  /** Seconds without taking damage before a dummy heals to full. */
  resetS: 3,
};

/** Where the dummies stand: a row of small ones (one per defense), and the big one behind them. */
const DUMMIES: { defId: string; pos: Vec }[] = [
  { defId: "dummy_big", pos: { x: 360, y: 140 } },
  { defId: "dummy", pos: { x: 200, y: 210 } },
  { defId: "dummy_armor", pos: { x: 290, y: 220 } },
  { defId: "dummy_shield", pos: { x: 430, y: 220 } },
  { defId: "dummy", pos: { x: 520, y: 210 } },
];

/** A loaner of every archetype, so a gun can be compared against the others. */
const RACK: Archetype[] = ["pistol", "shotgun", "smg", "sniper", "launcher"];

/** Turns the world's first room into the practice range. Call right after `createWorld`. */
export function enterPractice(w: World): void {
  const room = w.run.room;
  room.waves = [];
  room.waveIdx = 0;
  room.vents = [];
  room.candles = [];
  room.twist = "";
  w.arena.obstacles = [];
  w.arena.spikes = [];
  w.arena.water = [];
  w.arena.pads = [];
  w.arena.belts = [];
  w.enemies = [];
  w.pickups = [];
  w.run.practice = DUMMIES.map((d) => ({ ...d, pos: { ...d.pos }, enemyId: 0, t: 0, hp: 0 }));
  for (const spot of w.run.practice) standUp(w, spot);
  RACK.forEach((defId, i) => {
    w.pickups.push({ id: newId(w), kind: "gun", pos: { x: 220 + i * 70, y: 320 }, gun: { ...newGun(w, defId), loaner: true }, used: false });
  });
  // And one of every grenade, at the sides.
  GRENADE_IDS.forEach((defId, i) => {
    const side = i % 2 === 0 ? 70 : 650;
    w.pickups.push({ id: newId(w), kind: "grenade", pos: { x: side, y: 150 + Math.floor(i / 2) * 40 }, grenade: { defId, rarity: "common" }, used: false });
  });
}

function standUp(w: World, spot: PracticeSpot): void {
  const e = spawnEnemy(w, spot.defId, spot.pos, 0);
  e.noLoot = true;
  spot.enemyId = e.id;
  spot.hp = e.hp;
  spot.t = 0;
}

/** Per tick in the practice range: dummies stand back up and heal when left alone. The room never clears. */
export function updatePractice(w: World): void {
  for (const spot of w.run.practice ?? []) {
    const e = spot.enemyId ? w.enemies.find((o) => o.id === spot.enemyId && o.hp > 0) : undefined;
    if (!e) {
      if (spot.enemyId) {
        spot.enemyId = 0;
        spot.t = PRACTICE.respawnS;
      }
      spot.t -= DT;
      if (spot.t <= 0) standUp(w, spot);
      continue;
    }
    if (e.hp < spot.hp) spot.t = 0;
    else spot.t += DT;
    if (spot.t >= PRACTICE.resetS && e.hp < e.maxHp) e.hp = e.maxHp;
    spot.hp = e.hp;
  }
}

// Balance harness: a simple bot plays full runs on many seeds and reports pacing and survival.
// Run with `npm run balance -w @lostluggage/sim` (optionally `-- 50` for the number of runs, `--hero tinker`,
// `--biome caverns`, `--level 20`, `--tier 1`).
// The bot is much worse than a person (no real dodging), so treat deaths as an upper bound on difficulty.
import { createWorld, EMPTY_INPUT, runResult, runXp, step, type Biome, type PlayerInput, type Vec, type World } from "../src";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 20);
const god = args.includes("--god");
const heroId = opt("--hero") ?? "vanguard";
const biome = (opt("--biome") ?? "foundry") as Biome;
const level = Number(opt("--level") ?? 1);
const tier = Number(opt("--tier") ?? 0);
/** Forces every elite the director rolls to one kind, to see what each costs. */
const forceElite = opt("--elite");
let elites = 0;
let spiked = 0;

function botInput(w: World): PlayerInput {
  const p = w.players[0]!;
  const inp: PlayerInput = { ...EMPTY_INPUT, fire: true, autoAim: true };
  const room = w.run.room;
  let move: Vec = { x: 0, y: 0 };

  if (room.cleared) {
    const pk = w.pickups.find((k) => !k.used && (k.kind === "chest" || k.kind === "shrine"));
    const to = pk ? pk.pos : { x: room.exit.x + room.exit.w / 2, y: 0 };
    move = { x: to.x - p.pos.x, y: to.y - p.pos.y };
    if (pk && Math.hypot(move.x, move.y) < 10) inp.interact = true;
    // Crates sit in the way of the exit in some layouts: slide around them.
    if (Math.abs(move.x) < 30 && w.arena.obstacles.some((o) => p.pos.x > o.x - 10 && p.pos.x < o.x + o.w + 10 && p.pos.y > o.y && p.pos.y < o.y + o.h + 20)) move = { x: 1, y: -0.2 };
  } else {
    const es = w.enemies.filter((e) => e.spawnT <= 0 && e.state !== "hidden");
    let near = es[0];
    let nd = Infinity;
    for (const e of es) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
      if (d < nd) {
        nd = d;
        near = e;
      }
    }
    if (near) {
      const dx = (near.pos.x - p.pos.x) / nd;
      const dy = (near.pos.y - p.pos.y) / nd;
      if (nd > 140) move = { x: dx, y: dy };
      else if (nd < 60) move = { x: -dx + dy * 0.5, y: -dy - dx * 0.5 };
      else move = { x: dy, y: -dx }; // circle-strafe
    }
    const danger =
      w.projectiles.some((pr) => pr.owner === "enemy" && pr.lob && Math.hypot(pr.lob.to.x - p.pos.x, pr.lob.to.y - p.pos.y) < pr.lob.radius + 8) ||
      w.enemies.some((e) => e.state === "windup" && Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) < 50) ||
      w.hazards.some((h) => Math.hypot(h.pos.x - p.pos.x, h.pos.y - p.pos.y) < h.radius + 6);
    if (danger) {
      move = { x: -move.y || 1, y: move.x || 0.3 };
      if (p.dashCd <= 0) inp.dash = true;
    }
    if (p.skillCharge >= 1 && es.length > 2) inp.skill = true;
    if (p.grenadeCd <= 0 && es.length >= 3) inp.grenade = true;
    // Swap to the fuller gun when the current one runs dry.
    const cur = p.guns[p.active]!;
    const other = p.guns[1 - p.active]!;
    if (cur.pips < 1 && other.pips >= 2) inp.swap = true;
  }
  // Steer away from spike walls you can see, like a person would.
  for (const s of w.arena.spikes) {
    const cx = Math.max(s.x, Math.min(s.x + s.w, p.pos.x));
    const cy = Math.max(s.y, Math.min(s.y + s.h, p.pos.y));
    const d = Math.hypot(p.pos.x - cx, p.pos.y - cy);
    if (d < 36) {
      move.x += ((p.pos.x - cx) / (d || 1)) * 2;
      move.y += ((p.pos.y - cy) / (d || 1)) * 2;
    }
  }
  const l = Math.hypot(move.x, move.y) || 1;
  inp.move = { x: move.x / l, y: move.y / l };
  return inp;
}

const roomTimes: number[][] = [];
let wins = 0;
const deathsByRoom: Record<number, number> = {};
const totals: number[] = [];
const hurt: number[] = [];
const downs: number[] = [];
const minHp: number[] = [];
const xps: number[] = [];
const kills: number[] = [];
const found: number[] = [];

for (let seed = 1; seed <= runs; seed++) {
  const w = createWorld({ seed: seed * 7919, biome, tier, players: [{ heroId, level }] });
  if (forceElite) for (const plan of w.run.plans) plan.waves = plan.waves.map((wave) => wave.map((id) => id.replace(/@\w+/, "@" + forceElite)));
  let roomStart = 0;
  let lastRoom = 0;
  let taken = 0;
  let downed = 0;
  let lowest = 999;
  for (let t = 0; t < 30 * 60 * 20; t++) {
    if (god) w.players[0]!.hp = w.players[0]!.maxHp;
    step(w, [botInput(w)]);
    for (const ev of w.events) {
      if (ev.type === "playerHurt") taken += ev.damage;
      if (ev.type === "playerDowned") downed++;
      // Spike walls hurt in the same tick they report the hit.
      if (ev.type === "playerHurt" && w.events.some((x) => x.type === "spiked")) spiked += ev.damage;
      if (ev.type === "enemySpawn" && w.enemies.find((e) => e.id === ev.id)?.elite) elites++;
    }
    lowest = Math.min(lowest, w.players[0]!.hp);
    if (w.run.room.index !== lastRoom) {
      (roomTimes[lastRoom] ??= []).push(w.run.time - roomStart);
      roomStart = w.run.time;
      lastRoom = w.run.room.index;
    }
    if (w.gameOver || w.run.victory) break;
  }
  hurt.push(taken);
  kills.push(w.run.kills);
  found.push(w.run.gunsFound);
  xps.push(runXp(runResult(w, w.players[0]!, { mode: "solo", day: "" }), false).xp);
  downs.push(downed);
  minHp.push(lowest);
  if (w.run.victory) {
    wins++;
    (roomTimes[lastRoom] ??= []).push(w.run.time - roomStart);
    totals.push(w.run.time);
  } else deathsByRoom[w.run.room.index] = (deathsByRoom[w.run.room.index] ?? 0) + 1;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const kinds = createWorld({ seed: 1, biome }).run.plans.map((p) => p.kind);
console.log(`${runs} runs as ${heroId} LV ${level} in the ${biome}, tier ${tier}${god ? " (god mode)" : ""}: ${wins} victories, ${(elites / runs).toFixed(1)} elites a run`);
roomTimes.forEach((ts, i) => console.log(`  room ${i + 1} ${kinds[i]!.padEnd(8)} avg ${avg(ts).toFixed(0)}s over ${ts.length} clears`));
if (totals.length) console.log(`  full run avg ${(avg(totals) / 60).toFixed(1)} min`);
console.log(`  damage taken avg ${avg(hurt).toFixed(0)} (${(spiked / runs).toFixed(0)} from spikes), downs avg ${avg(downs).toFixed(2)}, lowest hp avg ${avg(minHp).toFixed(0)}`);
console.log(`  kills avg ${avg(kills).toFixed(0)}, guns dropped avg ${avg(found).toFixed(1)}, XP avg ${avg(xps).toFixed(0)} (first win of the day x1.5)`);
console.log(`  deaths by room: ${JSON.stringify(Object.fromEntries(Object.entries(deathsByRoom).map(([k, v]) => [Number(k) + 1, v])))}`);

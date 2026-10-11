// Balance harness: a simple bot plays full runs on many seeds and reports pacing and survival.
// Run with `npm run balance -w @lostluggage/sim` (optionally `-- 50` for the number of runs, `--hero tinker`,
// `--biome caverns`, `--level 20`, `--tier 1`).
// The bot is much worse than a person (no real dodging), so treat deaths as an upper bound on difficulty.
import { createWorld, doorRect, EMPTY_INPUT, runResult, runXp, step, trapPoint, ventState, type Biome, type PlayerInput, type Vec, type World } from "../src";

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
/** Keep going into endless after the final boss instead of flying home. */
const endless = args.includes("--endless");
let elites = 0;
let spiked = 0;

function botInput(w: World): PlayerInput {
  const p = w.players[0]!;
  const inp: PlayerInput = { ...EMPTY_INPUT, fire: true, autoAim: true };
  const room = w.run.room;
  let move: Vec = { x: 0, y: 0 };

  if (room.cleared) {
    // Take a boost (the first offer: the bot has no taste), open the suitcase, then pick a door at random.
    const pk = w.pickups.find((k) => !k.used && ((k.kind === "boost" && k.owner === p.id) || k.kind === "chest"));
    const doors = room.doors;
    const pickDoor = doors.find((d) => d.kind === "home") && !endless ? doors.find((d) => d.kind === "home")! : doors[(w.run.plans.length * 7) % doors.length];
    const door = pickDoor ? doorRect(pickDoor) : { x: 336, y: 0, w: 48, h: 14 };
    const to = pk ? pk.pos : { x: door.x + door.w / 2, y: 0 };
    move = { x: to.x - p.pos.x, y: to.y - p.pos.y };
    if (pk && Math.hypot(move.x, move.y) < 10) inp.interact = true;
    // Crates sit in the way of the exit in some layouts: slide around them.
    if (!pk && Math.abs(move.x) < 30 && w.arena.obstacles.some((o) => p.pos.x > o.x - 10 && p.pos.x < o.x + o.w + 10 && p.pos.y > o.y && p.pos.y < o.y + o.h + 20)) move = { x: 1, y: -0.2 };
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
      w.hazards.some((h) =>
        h.kind === "wave"
          ? Math.abs(Math.hypot(h.pos.x - p.pos.x, h.pos.y - p.pos.y) - h.radius * (1 - h.t / h.maxT)) < 26
          : h.owner === "enemy" && Math.hypot(h.pos.x - p.pos.x, h.pos.y - p.pos.y) < h.radius + 6,
      );
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
  // Step out of vents, sludge pipes and laser fences that are warning or going off, like a person would.
  for (const v of w.run.room.vents) {
    if (ventState(v) === "idle") continue;
    const c = trapPoint(v, p.pos);
    const d = Math.hypot(p.pos.x - c.x, p.pos.y - c.y);
    if (d < v.radius + 22) {
      move.x += ((p.pos.x - c.x) / (d || 1)) * 2;
      move.y += ((p.pos.y - c.y) / (d || 1)) * 2;
    }
  }
  // Walked into a crate and not getting anywhere: try sideways for a moment, like a person would.
  // Checked once a second: barely moved while trying to get somewhere means stuck.
  if (++bot.tick % 30 === 0) {
    const moved = Math.hypot(p.pos.x - bot.last.x, p.pos.y - bot.last.y);
    bot.last = { ...p.pos };
    bot.stuck = moved < 10 && Math.hypot(move.x, move.y) > 0.5 ? 9 : 0;
  }
  if (bot.stuck > 8) {
    // Go around: sideways toward the target (or the other way if that didn't work last time), backing off a little.
    bot.detour = 30;
    bot.side = Math.abs(move.x) > 4 && bot.tries++ % 2 === 0 ? Math.sign(move.x) : -bot.side;
    bot.stuck = 0;
  }
  if (bot.detour > 0) {
    bot.detour--;
    move = { x: bot.side, y: 0.35 };
  }
  const l = Math.hypot(move.x, move.y) || 1;
  inp.move = { x: move.x / l, y: move.y / l };
  return inp;
}
const bot = { last: { x: 0, y: 0 }, stuck: 0, detour: 0, side: 1, tries: 0, tick: 0 };

const reached: string[] = [];
const bosses: number[] = [];
let wins = 0;
const deathsAt: Record<string, number> = {};
const times: number[] = [];
const hurt: number[] = [];
const downs: number[] = [];
const xps: number[] = [];
const kills: number[] = [];
const found: number[] = [];
const boostCount: number[] = [];
const bossTimes: number[] = [];

for (let seed = 1; seed <= runs; seed++) {
  const w = createWorld({ seed: seed * 7919, biome, tier, players: [{ heroId, level }] });
  let taken = 0;
  let downed = 0;
  let bossStart = -1;
  for (let t = 0; t < 30 * 60 * 90; t++) {
    if (god) w.players[0]!.hp = w.players[0]!.maxHp;
    // Forcing an elite kind rewrites each room's waves as it starts.
    if (forceElite && w.run.room.waveIdx === 0) w.run.room.waves = w.run.room.waves.map((wave) => wave.map((id) => id.replace(/@\w+/, "@" + forceElite)));
    step(w, [botInput(w)]);
    for (const ev of w.events) {
      if (ev.type === "playerHurt") taken += ev.damage;
      if (ev.type === "playerDowned") downed++;
      if (ev.type === "playerHurt" && w.events.some((x) => x.type === "spiked")) spiked += ev.damage;
      if (ev.type === "enemySpawn" && w.enemies.find((e) => e.id === ev.id)?.elite) elites++;
      if (ev.type === "roomEnter" && ev.kind === "boss") bossStart = w.run.time;
      if (ev.type === "roomCleared" && w.run.room.kind === "boss" && bossStart >= 0) bossTimes.push(w.run.time - bossStart);
    }
    if (w.gameOver || w.run.victory) break;
  }
  const plan = w.run.plans[w.run.room.index]!;
  const where = `act ${plan.act + 1} room ${plan.step + 1}${plan.kind === "boss" ? " (boss)" : ""}`;
  reached.push(where);
  bosses.push(w.run.bosses);
  hurt.push(taken);
  kills.push(w.run.kills);
  found.push(w.run.gunsFound);
  times.push(w.run.time);
  boostCount.push(Object.values(w.players[0]!.boosts).reduce<number>((a, b) => a + (b ?? 0), 0));
  xps.push(runXp(runResult(w, w.players[0]!, { mode: "solo", day: "" }), false).xp);
  downs.push(downed);
  if (w.run.victory || w.run.finale) wins++;
  else deathsAt[where] = (deathsAt[where] ?? 0) + 1;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log(`${runs} runs as ${heroId} LV ${level} from the ${biome}, tier ${tier}${god ? " (god mode)" : ""}: ${wins} wins, ${(elites / runs).toFixed(1)} elites a run`);
console.log(`  bosses beaten: ${[0, 1, 2, 3, 4].map((n) => `${n}: ${bosses.filter((b) => b === n).length}`).join("  ")}${bosses.some((b) => b > 4) ? "  more: " + bosses.filter((b) => b > 4).length : ""}`);
console.log(`  run length avg ${(avg(times) / 60).toFixed(1)} min (longest ${(Math.max(...times) / 60).toFixed(1)}), boss fights avg ${avg(bossTimes).toFixed(0)}s`);
console.log(`  damage taken avg ${avg(hurt).toFixed(0)} (${(spiked / runs).toFixed(0)} from spikes), downs avg ${avg(downs).toFixed(2)}, boosts taken avg ${avg(boostCount).toFixed(1)}`);
console.log(`  kills avg ${avg(kills).toFixed(0)}, guns dropped avg ${avg(found).toFixed(1)}, XP avg ${avg(xps).toFixed(0)}`);
console.log(`  runs ended at: ${JSON.stringify(Object.fromEntries(Object.entries(deathsAt).sort()))}`);

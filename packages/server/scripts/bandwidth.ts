// How much does co-op cost on mobile data? Four bots play a full run; every snapshot is packed exactly
// like Colyseus sends it (msgpack), then deflated like the websocket does. Run with `npm run bandwidth`.
import { deflateRawSync } from "node:zlib";
import { Packr } from "msgpackr";
import { createWorld, EMPTY_INPUT, encodeSnapshot, SNAPSHOT_EVERY, step, TICK_HZ, type PlayerInput, type SimEvent, type World } from "@lostluggage/sim";

const packr = new Packr({ useRecords: false });
const seconds = Number(process.argv[2] ?? 240);

function bot(w: World, i: number): PlayerInput {
  const p = w.players[i]!;
  const t = w.tick / TICK_HZ + i * 1.7;
  const room = w.run.room;
  // Fight in a loose circle, then head for the exit when the room is clear.
  let move = room.cleared ? { x: (room.exit.x + 24 - p.pos.x) / 100, y: -1 } : { x: Math.cos(t * 0.8), y: Math.sin(t * 1.1) };
  // A crate between you and the exit: slide around it.
  const blocked = w.arena.obstacles.some((o) => p.pos.x > o.x - 10 && p.pos.x < o.x + o.w + 10 && p.pos.y > o.y && p.pos.y < o.y + o.h + 20);
  if (room.cleared && blocked) move = { x: 1, y: -0.2 };
  return { ...EMPTY_INPUT, move, fire: true, autoAim: true, grenade: w.tick % 150 === i * 20, dash: w.tick % 97 === i };
}

const w = createWorld({ seed: 7, coop: true, players: [{ name: "ANA" }, { name: "BO" }, { name: "CY" }, { name: "DEE" }] });
// Bots are bad at dodging: keep them alive so the measurement covers the whole run.
const sizes: number[] = [];
const deflated: number[] = [];
let events: SimEvent[] = [];
for (let tick = 0; tick < seconds * TICK_HZ && !w.run.victory; tick++) {
  for (const p of w.players) p.hp = p.maxHp;
  step(w, w.players.map((_, i) => bot(w, i)));
  events.push(...w.events);
  if (w.tick % SNAPSHOT_EVERY !== 0) continue;
  const packed = packr.pack(encodeSnapshot(w, events, new Map(w.players.map((p) => [p.id, w.tick]))));
  sizes.push(packed.length);
  deflated.push(deflateRawSync(packed).length);
  events = [];
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)]!;
const perSec = TICK_HZ / SNAPSHOT_EVERY;
console.log(`${sizes.length} snapshots over ${(w.tick / TICK_HZ).toFixed(0)} s, reached room ${w.run.room.index + 1}${w.run.victory ? " (victory)" : ""}`);
console.log(`msgpack:  avg ${avg(sizes).toFixed(0)} B, p95 ${p95(sizes)} B, max ${Math.max(...sizes)} B`);
console.log(`deflated: avg ${avg(deflated).toFixed(0)} B, p95 ${p95(deflated)} B`);
console.log(`download per phone: ${((avg(deflated) * perSec) / 1024).toFixed(1)} KB/s avg, ${((p95(deflated) * perSec) / 1024).toFixed(1)} KB/s in busy moments`);
console.log(`a 15-minute dungeon: about ${((avg(deflated) * perSec * 900) / 1024 / 1024).toFixed(1)} MB per phone`);

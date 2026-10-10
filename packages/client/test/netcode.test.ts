// Drives the real client netcode (NetSession) against the real server with mobile-like latency,
// and measures what a player would feel: how far prediction is off, and whether the interpolation buffer runs dry.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server, WebSocketTransport } from "colyseus";
import { DT, EMPTY_INPUT, len, sub, type PlayerInput } from "@lostluggage/sim";
import { RunRoom } from "../../server/src/RunRoom";
import { NetSession } from "../src/net";

const PORT = 25800 + Math.floor(Math.random() * 100);
const url = `http://localhost:${PORT}`;
let server: Server;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define("run", RunRoom);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(ok: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(10);
  }
}

/** Walks a square with a dash, like a player kiting enemies. */
function scripted(t: number): PlayerInput {
  if (t < 1) return { ...EMPTY_INPUT, move: { x: 1, y: 0 } };
  if (t < 2) return { ...EMPTY_INPUT, move: { x: 0, y: -1 }, dash: t > 1.5 && t < 1.55 };
  if (t < 3) return { ...EMPTY_INPUT, move: { x: -0.7, y: 0.7 } };
  return EMPTY_INPUT;
}

/** Plays like the game loop does: inputs at 30 Hz from a jittery timer, a frame drawn after each. */
async function play(s: NetSession, seconds: number, observer?: NetSession, script = scripted): Promise<void> {
  const start = performance.now();
  let sent = 0;
  for (;;) {
    const t = (performance.now() - start) / 1000;
    if (t > seconds) break;
    while (sent < Math.floor(t / DT)) {
      s.input(script(sent * DT), () => undefined);
      sent++;
    }
    s.frame(1, 1 / 60);
    observer?.frame(1, 1 / 60);
    await wait(16);
  }
}

async function measure(lagMs: number) {
  server.simulateLatency(lagMs);
  const host = await NetSession.connect({ kind: "create" }, { name: "A" }, {}, url);
  await until(() => !!host.lobby);
  const friend = await NetSession.connect({ kind: "code", code: host.lobby!.code }, { name: "B" }, {}, url);
  await until(() => host.lobby?.seats.length === 2);
  host.start();
  await until(() => host.ready && friend.ready && host.myId > 0);

  await play(host, 4, friend);
  // Let the last inputs land, then compare what A sees with the server's answer.
  await play(host, 1, friend, () => EMPTY_INPUT);
  const drawn = host.frame(1, 0)!.world.players.find((p) => p.id === host.myId)!;
  const truth = (host as unknown as { latest: { world: { players: { id: number; pos: { x: number; y: number } }[] } } }).latest.world.players.find((p) => p.id === host.myId)!;
  const settled = len(sub(drawn.pos, truth.pos));

  const result = { host: { ...host.stats }, friend: { ...friend.stats }, settled };
  host.leave();
  friend.leave();
  await wait(100);
  return result;
}

describe("co-op netcode under latency", () => {
  it("predicts your own movement closely at a typical 4G round trip (120 ms)", async () => {
    const r = await measure(120);
    console.log("120 ms:", JSON.stringify(r));
    // Corrections exist (timer jitter makes the server repeat or merge an input now and then) but stay a few pixels.
    expect(r.host.maxCorrection).toBeLessThan(8);
    expect(r.settled).toBeLessThan(1);
    // The interpolation buffer almost never runs dry for either player.
    expect(r.host.starved / r.host.frames).toBeLessThan(0.05);
    expect(r.friend.starved / r.friend.frames).toBeLessThan(0.05);
  }, 20000);

  it("still holds together on a bad connection (300 ms)", async () => {
    const r = await measure(300);
    console.log("300 ms:", JSON.stringify(r));
    expect(r.host.maxCorrection).toBeLessThan(12);
    expect(r.settled).toBeLessThan(1);
    expect(r.friend.starved / r.friend.frames).toBeLessThan(0.1);
  }, 20000);
});

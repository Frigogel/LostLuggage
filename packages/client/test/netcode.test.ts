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

describe("coming back after a reload", () => {
  it("takes the same hero back mid-run from the saved token, and its inputs count again", async () => {
    server.simulateLatency(0);
    // Node has no localStorage: a plain in-memory one, like a browser's.
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const hadStorage = "localStorage" in g;
    const old = g.localStorage;
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    try {
      const host = await NetSession.connect({ kind: "create" }, { name: "A" }, {}, url);
      await until(() => !!host.lobby);
      const friend = await NetSession.connect({ kind: "code", code: host.lobby!.code }, { name: "B" }, {}, url);
      await until(() => host.lobby?.seats.length === 2);
      host.start();
      await until(() => host.ready && friend.ready && host.myId > 0);
      const myId = host.myId;
      expect(NetSession.canResume).toBe(true);

      // The page dies: the socket closes without a goodbye, and nothing on this side gets to tidy up.
      // Both test clients share this storage; on a phone only one session writes it.
      host.saveResume();
      const saved = new Map(store);
      host.room.reconnection.enabled = false;
      host.room.connection.close(4001); // anything but 4000 (a consented leave) is a drop
      await until(() => friend.lobby?.seats.some((s) => !s.connected) === true);
      for (const [k, v] of saved) store.set(k, v);

      const back = await NetSession.resume(url);
      await until(() => back.ready && back.myId === myId && friend.lobby?.seats.every((s) => s.connected) === true);
      expect(friend.lobby!.seats.length).toBe(2);

      // The reloaded page counts inputs from 1 again; the server must take them.
      const truth = () => (back as unknown as { latest: { world: { players: { id: number; pos: { x: number } }[] } } }).latest.world.players.find((p) => p.id === myId)!.pos.x;
      const before = truth();
      await play(back, 1, undefined, () => ({ ...EMPTY_INPUT, move: { x: 1, y: 0 } }));
      await wait(200);
      expect(truth()).toBeGreaterThan(before + 20);

      back.leave();
      friend.leave();
      expect(NetSession.canResume).toBe(false);
      await wait(100);
    } finally {
      if (hadStorage) g.localStorage = old;
      else delete g.localStorage;
    }
  }, 20000);
});

// End-to-end: a real Colyseus server on a local port, driven by the same SDK the browser uses.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker, Server, WebSocketTransport } from "colyseus";
import { decodeSnapshot, EMPTY_INPUT, encodeInput, type LobbyInfo, type Snapshot, type World } from "@lostluggage/sim";
import { cleanName, RunRoom } from "../src/RunRoom";

const PORT = 25670 + Math.floor(Math.random() * 100);
let server: Server;
const url = `http://localhost:${PORT}`;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define("run", RunRoom);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

function nextMessage<T>(room: Room, type: string, until: (m: T) => boolean = () => true, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
    const off = room.onMessage(type, (m: T) => {
      if (!until(m)) return;
      clearTimeout(timer);
      off();
      resolve(m);
    });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("co-op server", () => {
  it("cleans names down to what the pixel font can draw", () => {
    expect(cleanName("  ana_bé!!  the great ", "X")).toBe("ANAB!! THE");
    expect(cleanName("", "PLAYER 2")).toBe("PLAYER 2");
  });

  it("creates a code room, lets a friend join by code, runs the sim and streams snapshots", async () => {
    const a = new Client(url);
    const b = new Client(url);
    const host = await a.create("run", { private: true, name: "Host", level: 3 });
    expect(host.roomId).toMatch(/^[A-HJ-NP-Z]{4}$/);

    const friendLobby = nextMessage<LobbyInfo>(host, "lobby", (l) => l.seats.length === 2);
    const friend = await b.joinById(host.roomId, { name: "Friend", level: 25 });
    const lobby = await friendLobby;
    expect(lobby.code).toBe(host.roomId);
    expect(lobby.host).toBe(host.sessionId);
    expect(lobby.seats.map((s) => s.name)).toEqual(["HOST", "FRIEND"]);
    expect(lobby.running).toBe(false);

    // Only the host can start.
    friend.send("start");
    await wait(100);
    const started = nextMessage<LobbyInfo>(friend, "lobby", (l) => l.running);
    host.send("start");
    const run = await started;
    const me = run.seats.find((s) => s.sessionId === friend.sessionId)!;
    expect(me.playerId).toBeGreaterThan(0);

    // Walk right for a while and watch our player move in the snapshots, with our inputs acknowledged.
    const sizes: number[] = [];
    const snaps: Snapshot[] = [];
    friend.onMessage("s", (s: Snapshot) => {
      snaps.push(s);
      sizes.push(JSON.stringify(s).length);
    });
    for (let seq = 0; seq < 30; seq++) {
      friend.send("i", encodeInput(seq, { ...EMPTY_INPUT, move: { x: 1, y: 0 } }));
      await wait(33);
    }
    await wait(300);
    expect(snaps.length).toBeGreaterThan(10);
    const first = decodeSnapshot(snaps[0]!);
    const last = decodeSnapshot(snaps.at(-1)!);
    const x0 = first.world.players.find((p) => p.id === me.playerId)!.pos.x;
    const x1 = last.world.players.find((p) => p.id === me.playerId)!.pos.x;
    expect(x1).toBeGreaterThan(x0 + 30);
    expect(last.acks.get(me.playerId)).toBe(29);
    // Co-op level sync: both heroes are at the Normal tier's level regardless of their own.
    expect(last.world.players.map((p) => p.syncLevel)).toEqual([10, 10]);
    expect(Math.max(...sizes)).toBeLessThan(6000);

    await friend.leave();
    await host.leave();
  });

  it("drops a late joiner into a run in progress", async () => {
    const a = new Client(url);
    const host = await a.create("run", { private: true, name: "A" });
    host.send("start");
    await nextMessage<LobbyInfo>(host, "lobby", (l) => l.running);
    const late = await new Client(url).joinById(host.roomId, { name: "Late" });
    const lobby = await nextMessage<LobbyInfo>(late, "lobby", (l) => l.seats.length === 2);
    const seat = lobby.seats.find((s) => s.sessionId === late.sessionId)!;
    expect(seat.playerId).toBeGreaterThan(0);
    const snap = decodeSnapshot(await nextMessage<Snapshot>(late, "s"));
    expect(snap.world.players.map((p) => p.name)).toEqual(["A", "LATE"]);
    await late.leave();
    const after = decodeSnapshot(await nextMessage<Snapshot>(host, "s", (s) => s.p.length === 1));
    expect(after.world.players.length).toBe(1);
    await host.leave();
  });

  it("quick match puts players in the same public room but never in a private one", async () => {
    const priv = await new Client(url).create("run", { private: true, name: "Secret" });
    const q1 = await new Client(url).joinOrCreate("run", { name: "Q1" });
    const q2 = await new Client(url).joinOrCreate("run", { name: "Q2" });
    expect(q1.roomId).toBe(q2.roomId);
    expect(q1.roomId).not.toBe(priv.roomId);
    await Promise.all([priv.leave(), q1.leave(), q2.leave()]);
  });

  it("after a wipe, only the host can start another run, which keeps the whole party", async () => {
    const host = await new Client(url).create("run", { private: true, name: "A" });
    const friend = await new Client(url).joinById(host.roomId, { name: "B" });
    host.send("start");
    const first = await nextMessage<LobbyInfo>(friend, "lobby", (l) => l.running);

    // Not over yet: "again" does nothing.
    host.send("again");
    await wait(100);
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as { world: World };
    for (const p of room.world.players) Object.assign(p, { downed: true, reviveT: Infinity, selfRevives: 0 });
    await nextMessage<Snapshot>(friend, "s", (s) => decodeSnapshot(s).world.gameOver);

    friend.send("again");
    await wait(100);
    expect(room.world.gameOver).toBe(true);
    const next = nextMessage<LobbyInfo>(friend, "lobby", (l) => l.runId > first.runId);
    host.send("again");
    const second = await next;
    expect(second.seats.every((s) => s.playerId > 0)).toBe(true);
    const fresh = decodeSnapshot(await nextMessage<Snapshot>(friend, "s"));
    expect(fresh.world.gameOver).toBe(false);
    expect(fresh.world.players.map((p) => p.name)).toEqual(["A", "B"]);
    await Promise.all([host.leave(), friend.leave()]);
  });

  it("marks a backgrounded player as away, and holds the run while nobody is playing", async () => {
    const host = await new Client(url).create("run", { private: true, name: "A" });
    const friend = await new Client(url).joinById(host.roomId, { name: "B" });
    host.send("start");
    await nextMessage<LobbyInfo>(host, "lobby", (l) => l.running);

    friend.send("away", true);
    await nextMessage<Snapshot>(host, "s", (m) => decodeSnapshot(m).world.players[1]!.away);

    // Both away: the sim holds still, so snapshots stop.
    host.send("away", true);
    await wait(150);
    let more = 0;
    host.onMessage("s", () => more++);
    await wait(300);
    expect(more).toBe(0);

    host.send("away", false);
    const back = decodeSnapshot(await nextMessage<Snapshot>(host, "s"));
    expect(back.world.players[0]!.away).toBe(false);
    expect(back.world.players[1]!.away).toBe(true);
    await Promise.all([host.leave(), friend.leave()]);
  });
});

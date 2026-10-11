// End-to-end: a real Colyseus server on a local port, driven by the same SDK the browser uses.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { matchMaker, Server, WebSocketTransport } from "colyseus";
import { decodeSnapshot, EMPTY_INPUT, encodeInput, enterRoom, FINAL_ACT, newGun, roomSpec, type Action, type EmoteInfo, type LobbyInfo, type Profile, type RewardInfo, type RunReward, type Snapshot, type World } from "@lostluggage/sim";
import { mountApi } from "../src/api";
import { Db, setDb } from "../src/db";
import { cleanName, RunRoom } from "../src/RunRoom";

const PORT = 25670 + Math.floor(Math.random() * 100);
let server: Server;
const url = `http://localhost:${PORT}`;

beforeAll(async () => {
  // A fresh in-memory database for every test run.
  setDb(new Db());
  server = new Server({ transport: new WebSocketTransport(), greet: false, express: (app) => mountApi(app) });
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

interface AuthReply {
  token: string;
  username: string;
  profile: Profile;
  error?: string;
}

async function api<T>(path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

describe("accounts", () => {
  it("signs up, signs in, and rejects bad names, short passwords, taken names and wrong passwords", async () => {
    expect((await api<AuthReply>("/api/register", { username: "a", password: "secret1" })).status).toBe(400);
    expect((await api<AuthReply>("/api/register", { username: "ANA", password: "123" })).status).toBe(400);
    const made = await api<AuthReply>("/api/register", { username: "ana", password: "secret1" });
    expect(made.status).toBe(201);
    expect(made.data.username).toBe("ANA");
    expect(made.data.profile.heroes.vanguard!.level).toBe(1);
    expect(made.data.profile.name).toBe("ANA");
    expect((await api<AuthReply>("/api/register", { username: "Ana", password: "other12" })).status).toBe(409);
    expect((await api<AuthReply>("/api/login", { username: "ana", password: "nope123" })).status).toBe(401);
    const back = await api<AuthReply>("/api/login", { username: "ana", password: "secret1" });
    expect(back.status).toBe(200);
    expect((await api<{ profile: Profile }>("/api/profile", undefined, back.data.token)).data.profile.name).toBe("ANA");
    expect((await api("/api/profile", undefined, "garbage")).status).toBe(401);
    await api("/api/logout", {}, back.data.token);
    expect((await api("/api/profile", undefined, back.data.token)).status).toBe(401);
  });

  it("syncs queued actions exactly once", async () => {
    const { data } = await api<AuthReply>("/api/register", { username: "BOB", password: "secret1" });
    const run: Action = {
      type: "run",
      id: "solo-1",
      result: { mode: "solo", heroId: "vanguard", tier: 0, victory: true, rooms: 5, kills: 120, guns: [{ id: "g1", defId: "smg", element: "fire", rarity: "rare", perks: [], maker: "goblin" }], hand: ["g1", ""], day: "2026-10-10" },
    };
    const equip: Action = { type: "equip", id: "eq-1", slot: 1, gunId: "starter-pistol" };
    const first = await api<{ profile: Profile; rewards: Record<string, RunReward> }>("/api/sync", { actions: [run, equip] }, data.token);
    expect(first.data.rewards["solo-1"]!.xp).toBeGreaterThan(100);
    expect(first.data.profile.loadout).toEqual(["g1", "starter-pistol"]);
    const xp = first.data.profile.heroes.vanguard!;
    // The phone never heard back and retries: nothing is applied twice.
    const again = await api<{ profile: Profile; rewards: Record<string, RunReward> }>("/api/sync", { actions: [run, equip] }, data.token);
    expect(again.data.rewards).toEqual({});
    expect(again.data.profile.heroes.vanguard).toEqual(xp);
    expect(again.data.profile.stash.length).toBe(3);
  });

  it("co-op runs use the saved hero and save the loot to the account", async () => {
    const { data } = await api<AuthReply>("/api/register", { username: "CYD", password: "secret1" });
    await api("/api/sync", { actions: [{ type: "skills", id: "k", heroId: "vanguard", skills: [] }] }, data.token);
    const host = await new Client(url).create("run", { private: true, name: "ignored", token: data.token });
    const guest = await new Client(url).joinById(host.roomId, { name: "Guest" });
    const lobby = await nextMessage<LobbyInfo>(host, "lobby", (l) => l.seats.length === 2);
    // Accounts play under their account name.
    expect(lobby.seats.map((s) => s.name)).toEqual(["CYD", "GUEST"]);
    host.send("start");
    await nextMessage<LobbyInfo>(host, "lobby", (l) => l.running);

    // Hand the account a gun, then wipe the party.
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as { world: World };
    const me = room.world.players[0]!;
    const gun = newGun(room.world, "launcher", "epic", "acid", [], "dwarfcorp");
    me.guns[0] = gun;
    me.haul.push(gun);
    const reward = nextMessage<RewardInfo>(host, "reward");
    let guestReward = false;
    guest.onMessage("reward", () => (guestReward = true));
    for (const p of room.world.players) Object.assign(p, { downed: true, reviveT: Infinity, selfRevives: 0 });
    const r = await reward;
    expect(r.reward.kept).toBe(1);
    expect(r.profile.stash.some((g) => g.defId === "launcher" && g.maker === "dwarfcorp")).toBe(true);
    expect(r.profile.loadout[0]).toBe(r.profile.stash.find((g) => g.defId === "launcher")!.id);
    await wait(100);
    expect(guestReward).toBe(false);

    // Losing never drops a signature power.
    expect(r.reward.signature).toBeUndefined();

    // The next run starts with the launcher in hand.
    host.send("again");
    const fresh = decodeSnapshot(await nextMessage<Snapshot>(host, "s", (s) => !decodeSnapshot(s).world.gameOver));
    expect(fresh.world.players[0]!.guns[0]!.defId).toBe("launcher");
    await Promise.all([host.leave(), guest.leave()]);
  });

  it("rooms run the adventure they were made for, with each guest's own hero", async () => {
    const host = await new Client(url).create("run", { private: true, name: "A", heroId: "tinker", biome: "caverns" });
    const friend = await new Client(url).joinById(host.roomId, { name: "B", heroId: "warden" });
    const lobby = await nextMessage<LobbyInfo>(host, "lobby", (l) => l.seats.length === 2);
    expect(lobby.biome).toBe("caverns");
    expect(lobby.seats.map((s) => s.heroId)).toEqual(["tinker", "warden"]);
    host.send("start");
    const snap = decodeSnapshot(await nextMessage<Snapshot>(friend, "s"));
    expect(snap.world.run.biome).toBe("caverns");
    expect(snap.world.arena.ice).toBe(true);
    expect(snap.world.players.map((p) => p.heroId)).toEqual(["tinker", "warden"]);
    await Promise.all([host.leave(), friend.leave()]);
  });

  it("a co-op win can drop a signature power for the hero you played", async () => {
    const { data } = await api<AuthReply>("/api/register", { username: "DEE", password: "secret1" });
    await api("/api/sync", { actions: [{ type: "hero", id: "h", heroId: "gunslinger" }] }, data.token);
    const host = await new Client(url).create("run", { private: true, token: data.token });
    host.send("start");
    await nextMessage<LobbyInfo>(host, "lobby", (l) => l.running);
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as { world: World };
    expect(room.world.players[0]!.heroId).toBe("gunslinger");

    // Skip to an empty final boss room: it clears on the next tick, then fly home with the win. Make the drop roll lucky.
    const reward = nextMessage<RewardInfo>(host, "reward");
    const random = Math.random;
    Math.random = () => 0;
    const w = room.world;
    const home = setInterval(() => {
      const door = w.run.room.doors.find((d) => d.kind === "home");
      if (door) w.players[0]!.pos = { x: door.x, y: 8 };
    }, 10);
    try {
      enterRoom(w, roomSpec(w, "boss", { act: FINAL_ACT, mix: true }));
      w.run.room.waves = [];
      w.enemies = [];
      const r = await reward;
      expect(w.run.finale).toBe(true);
      expect(r.reward.signature).toBe("sig_sixshooter");
      expect(r.profile.signatures).toEqual(["sig_sixshooter"]);
    } finally {
      clearInterval(home);
      Math.random = random;
    }
    await host.leave();
  });
});

describe("lobby looks", () => {
  it("shows everyone's outfit, updates it from the lobby, and passes emotes around", async () => {
    // An account that won the Foundry owns the traffic cone and wears it.
    const { data } = await api<AuthReply>("/api/register", { username: "EVE", password: "secret1" });
    const win = { mode: "solo", heroId: "vanguard", tier: 0, victory: true, rooms: 6, kills: 50, guns: [], hand: [], day: "2026-10-10", biome: "foundry" };
    await api("/api/sync", { actions: [{ type: "run", id: "eve-win", result: win }, { type: "outfit", id: "eve-hat", slot: "hat", cosmetic: "hat_cone" }] }, data.token);
    const host = await new Client(url).create("run", { private: true, token: data.token });

    // A guest asking for an earned hat only gets the starters.
    const joined = nextMessage<LobbyInfo>(host, "lobby", (l) => l.seats.length === 2);
    const guest = await new Client(url).joinById(host.roomId, { name: "Guest", outfit: { hat: "hat_cone", trail: "trail_confetti", emote: "emote_shrug" } });
    const lobby = await joined;
    expect(lobby.seats[0]!.outfit.hat).toBe("hat_cone");
    expect(lobby.seats[1]!.outfit).toEqual({ hat: "", trail: "trail_confetti", skin: "", emote: "emote_shrug" });

    // Changing hero and hat in the lobby: the account saves first, then asks the room to reload it.
    await api("/api/sync", { actions: [{ type: "hero", id: "eve-hero", heroId: "warden" }, { type: "outfit", id: "eve-hat2", slot: "hat", cosmetic: "hat_party" }] }, data.token);
    const changed = nextMessage<LobbyInfo>(guest, "lobby", (l) => l.seats[0]!.heroId === "warden");
    host.send("me", { heroId: "tinker", outfit: { hat: "hat_crown" } });
    expect((await changed).seats[0]!.outfit.hat).toBe("hat_party");
    const guestChange = nextMessage<LobbyInfo>(host, "lobby", (l) => l.seats[1]!.heroId === "tinker");
    guest.send("me", { name: "Guest", heroId: "tinker", outfit: { hat: "hat_party", emote: "emote_wave" } });
    expect((await guestChange).seats[1]!.outfit.hat).toBe("hat_party");

    // Emotes go to everyone, only the one you're wearing, and not too fast.
    const emotes: EmoteInfo[] = [];
    host.onMessage("emote", (e: EmoteInfo) => emotes.push(e));
    guest.onMessage("emote", () => {});
    guest.send("emote", "emote_bow");
    guest.send("emote", "emote_wave");
    guest.send("emote", "emote_wave");
    await wait(300);
    expect(emotes).toEqual([{ sessionId: guest.sessionId, emote: "emote_wave" }]);

    await guest.leave();
    await host.leave();
  });

  it("lets the host pick the adventure in the lobby, and nobody else", async () => {
    const host = await new Client(url).create("run", { private: true, name: "H", biome: "foundry" });
    const guest = await new Client(url).joinById(host.roomId, { name: "G" });
    await nextMessage<LobbyInfo>(host, "lobby", (l) => l.seats.length === 2);
    guest.send("biome", "caverns");
    await wait(150);
    host.send("biome", "atlantis");
    await wait(150);
    const changed = nextMessage<LobbyInfo>(guest, "lobby");
    host.send("biome", "caverns");
    expect((await changed).biome).toBe("caverns");
    host.send("start");
    const run = await nextMessage<LobbyInfo>(host, "lobby", (l) => l.running);
    expect(run.biome).toBe("caverns");
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as { world: World };
    expect(room.world.run.biome).toBe("caverns");
    await guest.leave();
    await host.leave();
  });
});

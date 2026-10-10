import { Room, type Client } from "colyseus";
import {
  addPlayer,
  createWorld,
  decodeInput,
  DT,
  EMPTY_INPUT,
  encodeSnapshot,
  MAX_LEVEL,
  MAX_PLAYERS,
  removePlayer,
  SNAPSHOT_EVERY,
  step,
  TIER_LEVELS,
  type PlayerInput,
  type SimEvent,
  type World,
} from "@lostluggage/sim";
import type { JoinOptions, LobbyInfo, RoomOptions } from "@lostluggage/sim";

/** Inputs a client may queue ahead of the sim before the oldest are folded together. */
const MAX_QUEUE = 4;
/** No input for this long (lag spike, frozen tab): stop repeating the last one and stand still. */
const STALE_INPUT_MS = 250;
/** A dropped phone keeps its seat this long, as the doc asks for mobile sessions. */
const RECONNECT_S = 60;

// Codes skip I and O so nobody reads them as 1 and 0.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const codesInUse = new Set<string>();

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!codesInUse.has(code)) {
      codesInUse.add(code);
      return code;
    }
  }
}

/** Names are drawn with the pixel font, which has capitals, digits and a few symbols. */
export function cleanName(raw: unknown, fallback: string): string {
  const name = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .!?-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10);
  return name || fallback;
}

interface Seat {
  sessionId: string;
  name: string;
  level: number;
  /** The sim player this client drives, or -1 before the run starts. */
  playerId: number;
  queue: { seq: number; input: PlayerInput }[];
  /** Last input sequence applied to the sim, echoed in snapshots for client reconciliation. */
  lastSeq: number;
  /** The last input's held parts (move, aim, trigger), repeated when the next input is late. */
  held: PlayerInput;
  lastInputAt: number;
  /** App in the background (told by the client). */
  backgrounded: boolean;
  connected: boolean;
}

/**
 * One co-op run: a lobby, then the shared sim at 30 Hz with snapshots at 15 Hz.
 * The room id is the 4-letter code friends type in.
 */
export class RunRoom extends Room {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 300;

  private seats = new Map<string, Seat>();
  /** Join order: the first seat is the host. */
  private order: string[] = [];
  private world?: World;
  private pending: SimEvent[] = [];
  private acc = 0;
  private runId = 0;
  private tier = 0;

  onCreate(options: RoomOptions = {}): void {
    this.roomId = newCode();
    this.tier = Math.max(0, Math.min(TIER_LEVELS.length - 1, Math.round(Number(options.tier) || 0)));
    // Code rooms are for friends; only quick-match rooms show up in matchmaking.
    if (options.private) void this.setPrivate(true);
    void this.setMetadata({ phase: "lobby" });

    this.onMessage("i", (client, msg: unknown) => {
      const seat = this.seats.get(client.sessionId);
      const decoded = decodeInput(msg);
      if (!seat || !decoded || decoded.seq <= seat.lastSeq) return;
      seat.queue.push(decoded);
      seat.lastInputAt = Date.now();
    });
    this.onMessage("start", (client) => {
      if (this.isHost(client) && !this.world) this.startRun();
    });
    this.onMessage("again", (client) => {
      const w = this.world;
      if (this.isHost(client) && w && (w.gameOver || w.run.victory)) this.startRun();
    });
    this.onMessage("away", (client, away: unknown) => {
      const seat = this.seats.get(client.sessionId);
      if (!seat) return;
      seat.backgrounded = away === true;
      this.syncAway(seat);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 1000 / 60);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    const seat: Seat = {
      sessionId: client.sessionId,
      name: cleanName(options.name, `PLAYER ${this.seats.size + 1}`),
      level: Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(options.level) || 1))),
      playerId: -1,
      queue: [],
      lastSeq: -1,
      held: EMPTY_INPUT,
      lastInputAt: 0,
      backgrounded: false,
      connected: true,
    };
    this.seats.set(client.sessionId, seat);
    this.order.push(client.sessionId);
    // Drop-in: a run in progress gets a new hero next to the party.
    if (this.world) {
      const p = addPlayer(this.world, { name: seat.name, level: seat.level });
      if (p) seat.playerId = p.id;
    }
    this.broadcastLobby();
  }

  onDrop(client: Client): void {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    seat.connected = false;
    seat.queue = [];
    this.syncAway(seat);
    this.broadcastLobby();
    try {
      // If they don't make it back in time, Colyseus calls onLeave and the seat opens up.
      this.allowReconnection(client, RECONNECT_S).catch(() => {});
    } catch {
      // The room is shutting down: nothing to come back to.
    }
  }

  onReconnect(client: Client): void {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    seat.connected = true;
    seat.backgrounded = false;
    this.syncAway(seat);
    this.broadcastLobby();
  }

  onLeave(client: Client): void {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    this.seats.delete(client.sessionId);
    this.order = this.order.filter((id) => id !== client.sessionId);
    if (this.world && seat.playerId >= 0) removePlayer(this.world, seat.playerId);
    this.broadcastLobby();
  }

  onDispose(): void {
    codesInUse.delete(this.roomId);
  }

  private isHost(client: Client): boolean {
    return this.order[0] === client.sessionId;
  }

  private syncAway(seat: Seat): void {
    const p = this.world?.players.find((pl) => pl.id === seat.playerId);
    if (p) p.away = seat.backgrounded || !seat.connected;
  }

  private startRun(): void {
    const seats = this.order.map((id) => this.seats.get(id)!);
    this.world = createWorld({
      seed: (Math.random() * 2 ** 31) | 0,
      coop: true,
      tier: this.tier,
      players: seats.map((s) => ({ name: s.name, level: s.level })),
    });
    seats.forEach((s, i) => {
      s.playerId = this.world!.players[i]!.id;
      s.queue = [];
      this.syncAway(s);
    });
    this.pending = [];
    this.acc = 0;
    this.runId++;
    void this.setMetadata({ phase: "run" });
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    const info: LobbyInfo = {
      code: this.roomId,
      host: this.order[0] ?? "",
      tier: this.tier,
      runId: this.runId,
      running: !!this.world,
      seats: this.order.map((id) => {
        const s = this.seats.get(id)!;
        return { sessionId: s.sessionId, name: s.name, level: s.level, playerId: s.playerId, connected: s.connected };
      }),
    };
    this.broadcast("lobby", info);
  }

  /** Fixed 30 Hz sim on top of a faster, jittery timer. */
  private update(deltaMs: number): void {
    const w = this.world;
    if (!w) return;
    // Nobody here (everyone backgrounded or reconnecting): hold the run instead of letting it play itself.
    if (w.players.every((p) => p.away)) return;
    this.acc += Math.min(deltaMs, 250) / 1000;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick(w);
    }
  }

  private tick(w: World): void {
    // The final snapshot already told everyone it's over.
    if (w.gameOver) return;
    const now = Date.now();
    const bySeat = new Map<number, Seat>();
    for (const s of this.seats.values()) bySeat.set(s.playerId, s);

    const inputs = w.players.map((p) => {
      const seat = bySeat.get(p.id);
      if (!seat || p.away) return EMPTY_INPUT;
      // A client that got ahead (burst after a hitch) has its oldest inputs folded together, keeping their presses.
      while (seat.queue.length > MAX_QUEUE) {
        const old = seat.queue.shift()!;
        const next = seat.queue[0]!.input;
        for (const k of ["dash", "skill", "grenade", "swap", "interact"] as const) next[k] ||= old.input[k];
      }
      const next = seat.queue.shift();
      if (next) {
        seat.lastSeq = next.seq;
        seat.held = { ...next.input, dash: false, skill: false, grenade: false, swap: false, interact: false };
        return next.input;
      }
      // Late input: keep doing what they were doing for a moment, rather than stuttering to a stop.
      return now - seat.lastInputAt < STALE_INPUT_MS ? seat.held : EMPTY_INPUT;
    });

    step(w, inputs);
    for (const ev of w.events) this.pending.push(ev);

    if (w.tick % SNAPSHOT_EVERY === 0 || w.gameOver) {
      const acks = new Map<number, number>();
      for (const s of this.seats.values()) if (s.playerId >= 0) acks.set(s.playerId, s.lastSeq);
      this.broadcast("s", encodeSnapshot(w, this.pending, acks));
      this.pending = [];
    }
  }
}

import { Room, type Client } from "colyseus";
import {
  addPlayer,
  cleanName,
  helpedNewer,
  localDay,
  playerOptions,
  randomId,
  rollGun,
  runResult,
  signatureChance,
  signatureDrop,
  ADVENTURE_IDS,
  cleanOutfit,
  HEROES,
  isStarter,
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
  type Outfit,
  type PlayerOptions,
  type RewardInfo,
  type SimEvent,
  type World,
} from "@lostluggage/sim";
import type { EmoteInfo, JoinOptions, LobbyInfo, RoomOptions } from "@lostluggage/sim";
import { getDb } from "./db";

export { cleanName };

/** Inputs a client may queue ahead of the sim before the oldest are folded together. */
const MAX_QUEUE = 4;
/** No input for this long (lag spike, frozen tab): stop repeating the last one and stand still. */
const STALE_INPUT_MS = 250;
/** A dropped phone keeps its seat this long, as the doc asks for mobile sessions. */
const RECONNECT_S = 60;
/** Emotes are fun until someone holds the button down. */
const EMOTE_GAP_MS = 1200;

// Codes skip I and O so nobody reads them as 1 and 0.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const codesInUse = new Set<string>();

/** A difficulty tier from a client: a whole number in range, Normal for anything else. */
function clampTier(tier: unknown): number {
  return Math.max(0, Math.min(TIER_LEVELS.length - 1, Math.round(Number(tier)) || 0));
}

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

interface Seat {
  sessionId: string;
  name: string;
  level: number;
  heroId: string;
  outfit: Outfit;
  lastEmoteAt: number;
  /** Signed-in players: rewards are saved to this account. Guests have none and keep nothing. */
  accountId?: number;
  /** Guests: what they asked for when joining. Accounts reload their saved hero at every run start. */
  guest: PlayerOptions;
  /** The run this seat was last paid for, so nobody is rewarded twice. */
  awardedRun: number;
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
    this.tier = clampTier(options.tier);
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
    // Changed hero or outfit in the lobby. Accounts saved it already, so their profile is reloaded; guests say what they picked.
    this.onMessage("me", (client, msg: unknown) => {
      const seat = this.seats.get(client.sessionId);
      if (!seat) return;
      if (seat.accountId === undefined) this.setGuest(seat, (msg ?? {}) as JoinOptions);
      else this.refresh(seat);
      this.broadcastLobby();
    });
    // The host picks the difficulty from the lobby, between runs.
    this.onMessage("tier", (client, tier: unknown) => {
      if (!this.isHost(client) || this.world || typeof tier !== "number") return;
      this.tier = clampTier(tier);
      this.broadcastLobby();
    });
    this.onMessage("emote", (client, emote: unknown) => {
      const seat = this.seats.get(client.sessionId);
      const now = Date.now();
      if (!seat || emote !== seat.outfit.emote || now - seat.lastEmoteAt < EMOTE_GAP_MS) return;
      seat.lastEmoteAt = now;
      this.broadcast("emote", { sessionId: seat.sessionId, emote } satisfies EmoteInfo);
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
    const account = getDb().accountForToken(options.token);
    const seat: Seat = {
      sessionId: client.sessionId,
      name: "",
      level: 1,
      heroId: "vanguard",
      outfit: cleanOutfit(undefined, isStarter),
      lastEmoteAt: 0,
      accountId: account?.id,
      guest: {},
      awardedRun: -1,
      playerId: -1,
      queue: [],
      lastSeq: -1,
      held: EMPTY_INPUT,
      lastInputAt: 0,
      backgrounded: false,
      connected: true,
    };
    this.setGuest(seat, options);
    this.refresh(seat);
    this.seats.set(client.sessionId, seat);
    this.order.push(client.sessionId);
    // Drop-in: a run in progress gets a new hero next to the party.
    if (this.world) {
      const p = addPlayer(this.world, this.optionsFor(seat));
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
    // Leaving early still takes your loot home.
    if (this.world) this.award(seat, this.world, undefined);
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

  /** What a guest asked for. Guests wear starter cosmetics only: the rest are earned on an account. */
  private setGuest(seat: Seat, options: JoinOptions): void {
    seat.name = cleanName(options.name, seat.name || `PLAYER ${this.seats.size + 1}`);
    seat.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(options.level) || 1)));
    seat.heroId = typeof options.heroId === "string" && HEROES[options.heroId] ? options.heroId : "vanguard";
    seat.outfit = cleanOutfit(options.outfit, isStarter);
    seat.guest = { name: seat.name, level: seat.level, heroId: seat.heroId };
  }

  /** Reloads a signed-in seat's saved hero: the loadout may have changed since the last run. */
  private refresh(seat: Seat): void {
    if (seat.accountId === undefined) return;
    const profile = getDb().profile(seat.accountId);
    seat.name = cleanName(profile.name, seat.name);
    const opts = playerOptions(profile);
    seat.level = opts.level ?? 1;
    seat.heroId = opts.heroId ?? "vanguard";
    seat.outfit = profile.outfit;
  }

  private optionsFor(seat: Seat): PlayerOptions {
    if (seat.accountId === undefined) return seat.guest;
    return { ...playerOptions(getDb().profile(seat.accountId)), name: seat.name };
  }

  /** Saves a seat's run to its account and tells the client what it earned. */
  private award(seat: Seat, w: World, client: Client | undefined): void {
    if (seat.accountId === undefined || seat.awardedRun === this.runId) return;
    const p = w.players.find((pl) => pl.id === seat.playerId);
    if (!p) return;
    seat.awardedRun = this.runId;
    const helped = helpedNewer(w, p);
    const result = runResult(w, p, { mode: "coop", day: localDay(), helped });
    // The doc's extra loot roll for helping someone below the dungeon tier.
    if (helped && (w.run.victory || w.run.finale)) result.guns.push({ ...rollGun(w, 0.6, "rare"), id: randomId(), new: true });
    // Signature powers only drop in co-op, and only for a win.
    if ((w.run.victory || w.run.finale) && Math.random() < signatureChance(w.run.tier)) result.signature = signatureDrop(getDb().profile(seat.accountId), p.heroId, Math.random());
    const actionId = `coop-${randomId()}`;
    const { profile, rewards } = getDb().apply(seat.accountId, [{ type: "run", id: actionId, result }]);
    const reward = rewards[actionId];
    if (client && reward) client.send("reward", { runId: this.runId, reward, profile } satisfies RewardInfo);
  }

  private startRun(): void {
    const seats = this.order.map((id) => this.seats.get(id)!);
    seats.forEach((s) => this.refresh(s));
    this.world = createWorld({
      seed: (Math.random() * 2 ** 31) | 0,
      coop: true,
      tier: this.tier,
      // Every run starts in a random adventure, then visits the others and ends in the Crypt.
      biome: ADVENTURE_IDS[Math.floor(Math.random() * ADVENTURE_IDS.length)],
      players: seats.map((s) => this.optionsFor(s)),
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
        return { sessionId: s.sessionId, name: s.name, level: s.level, heroId: s.heroId, playerId: s.playerId, connected: s.connected, outfit: s.outfit };
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
    if (w.events.some((ev) => ev.type === "victory" || ev.type === "gameOver")) {
      for (const seat of this.seats.values()) this.award(seat, w, this.clients.find((c) => c.sessionId === seat.sessionId));
    }

    if (w.tick % SNAPSHOT_EVERY === 0 || w.gameOver) {
      const acks = new Map<number, number>();
      for (const s of this.seats.values()) if (s.playerId >= 0) acks.set(s.playerId, s.lastSeq);
      this.broadcast("s", encodeSnapshot(w, this.pending, acks));
      this.pending = [];
    }
  }
}

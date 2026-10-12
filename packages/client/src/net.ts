// Client side of co-op. The server owns the real sim; this file turns its snapshots into something that feels local:
// - everyone else is drawn a little in the past, interpolated between two snapshots, so they move smoothly;
// - your own movement and dash are predicted (the same `stepMovement` the server runs), then corrected
//   against the server's answer by replaying the inputs it hasn't seen yet;
// - your own shots are predicted too, so the muzzle flash, sound and bullets leave the gun the moment you fire.
import { Client, type Room } from "@colyseus/sdk";
import {
  canAct,
  decodeSnapshot,
  DT,
  encodeInput,
  gunStats,
  len,
  stepMovement,
  sub,
  TICK_HZ,
  updateFacing,
  SNAPSHOT_EVERY,
  type EmoteInfo,
  type Gun,
  type JoinOptions,
  type LobbyInfo,
  type Player,
  type PlayerInput,
  type RewardInfo,
  type RoomOptions,
  type SimEvent,
  type Snapshot,
  type Vec,
  type World,
} from "@lostluggage/sim";

/** How far behind the newest snapshot others are drawn, in ticks: two snapshot gaps plus room for jitter. */
const INTERP_TICKS = SNAPSHOT_EVERY * 2;
const MAX_BUFFER = 30;
const CONNECT_TIMEOUT_MS = 10000;
/** Where the seat's reconnect token is kept, so a reload or a killed app can take the same hero back. */
const RESUME_KEY = "lostluggage.resume";
/** The server holds a dropped seat for 60 s; give up a little sooner so we never knock on a seat that's gone. */
const RESUME_MS = 50000;

interface Resume {
  token: string;
  /** When the connection was last known to be alive (the server's countdown starts after that). */
  at: number;
}

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  // In development the server runs next to Vite; in production it serves the game itself.
  return import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : location.origin;
}

interface Decoded {
  tick: number;
  world: World;
  events: SimEvent[];
  acks: Map<number, number>;
}

/** A predicted shot: the scene draws it right away instead of waiting for the server. */
export interface LocalShot {
  x: number;
  y: number;
  angle: number;
  gun: Gun;
}

export interface Frame {
  /** The world to draw: the interpolation target, with your own hero swapped for the predicted one. */
  world: World;
  /** Positions one snapshot earlier, by entity id, for interpolation. */
  prev: Map<number, Vec>;
  alpha: number;
  /** Sim events that just came into view. */
  events: SimEvent[];
}

export type JoinKind = { kind: "quick" } | { kind: "create" } | { kind: "code"; code: string };

function readResume(): Resume | undefined {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as Resume | null;
    if (r && typeof r.token === "string" && Date.now() - r.at < RESUME_MS) return r;
    localStorage.removeItem(RESUME_KEY);
  } catch {
    // No storage (private window): there's just nothing to resume.
  }
  return undefined;
}

function clearResume(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    // ignore
  }
}

export class NetSession {
  lobby?: LobbyInfo;
  onLobby?: (l: LobbyInfo) => void;
  /** Connection gone for good (left, kicked, or reconnecting failed). */
  onClosed?: (reason: string) => void;
  /** The connection dropped and is being re-established (true), or it came back (false). */
  onReconnecting?: (reconnecting: boolean) => void;
  /** True while a dropped connection is being re-established: the world on screen is frozen. */
  reconnecting = false;
  /** Joined with an account: the server saves this player's rewards. */
  isAccount = false;
  /** What the server saved to your account for the last run that ended (accounts only). */
  reward?: RewardInfo;
  onReward?: (r: RewardInfo) => void;
  /** Someone in the room (maybe you) played an emote. */
  onEmote?: (e: EmoteInfo) => void;
  /** Round-trip time in ms, refreshed every few seconds. */
  rtt = 0;
  /** How well the netcode is keeping up, for tests and debugging. */
  readonly stats = {
    frames: 0,
    /** Frames that wanted a snapshot newer than any we had (the buffer ran dry). */
    starved: 0,
    corrections: 0,
    /** Largest prediction error the server corrected, in pixels. */
    maxCorrection: 0,
  };

  private snaps: Decoded[] = [];
  private latest?: Decoded;
  /** Estimated server tick = local ms * TICK_HZ / 1000 + offset. */
  private clockOffset?: number;
  private shown = -1;

  private seq = 0;
  private pending: { seq: number; input: PlayerInput; firedGun: number }[] = [];
  private predicted?: Player;
  private predPrev: Vec = { x: 0, y: 0 };
  /** Visual offset left over from a correction; fades out so corrections never snap. */
  private smooth: Vec = { x: 0, y: 0 };
  private shotCd = 0;
  private busyT = 0;
  /** Shots still to come: a charged shot keeps its aim, the rest of a burst follows the current one. */
  private scheduled: { t: number; aim: Vec; burst?: boolean }[] = [];
  private shots: LocalShot[] = [];
  private pingTimer?: ReturnType<typeof setInterval>;
  private leaving = false;

  private constructor(readonly room: Room) {
    room.onMessage("lobby", (l: LobbyInfo) => {
      const newRun = l.runId !== this.lobby?.runId;
      this.lobby = l;
      if (newRun) this.resetRun();
      this.onLobby?.(l);
    });
    room.onMessage("s", (s: Snapshot) => this.onSnapshot(s));
    room.onMessage("emote", (e: EmoteInfo) => this.onEmote?.(e));
    room.onMessage("reward", (r: RewardInfo) => {
      this.reward = r;
      this.onReward?.(r);
    });
    room.onLeave((code) => {
      clearInterval(this.pingTimer);
      clearResume();
      this.reconnecting = false;
      if (!this.leaving) this.onClosed?.(code === 4000 ? "LEFT THE ROOM" : "CONNECTION LOST");
    });
    room.onDrop(() => {
      this.reconnecting = true;
      this.onReconnecting?.(true);
    });
    room.onReconnect(() => {
      this.reconnecting = false;
      this.saveResume();
      this.onReconnecting?.(false);
    });
    // The SDK won't retry a connection younger than this; a phone can lose signal right after joining.
    room.reconnection.minUptime = 1000;
    this.pingTimer = setInterval(() => {
      room.ping((ms) => (this.rtt = ms));
      if (!this.reconnecting) this.saveResume();
    }, 3000);
    room.ping((ms) => (this.rtt = ms));
    this.saveResume();
  }

  /** Remembers this seat (refreshed while connected) so a reload or a restarted app can come back to it. */
  saveResume(): void {
    if (this.leaving) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ token: this.room.reconnectionToken, at: Date.now() } satisfies Resume));
    } catch {
      // No storage: reloading just won't resume.
    }
  }

  /** A seat this device dropped recently enough that the server should still be holding it. */
  static get canResume(): boolean {
    return !!readResume();
  }

  /** Takes back the seat (same hero, mid-run) this device dropped by reloading or closing the game. */
  static async resume(url = serverUrl()): Promise<NetSession> {
    const saved = readResume();
    if (!saved) throw new Error("nothing to resume");
    const client = new Client(url);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), CONNECT_TIMEOUT_MS));
    try {
      return new NetSession(await Promise.race([client.reconnect(saved.token), timeout]));
    } catch (err) {
      clearResume();
      throw err;
    }
  }

  /** `room` only matters when a room gets made: which adventure it runs. */
  static async connect(how: JoinKind, me: JoinOptions, room: RoomOptions = {}, url = serverUrl()): Promise<NetSession> {
    const client = new Client(url);
    const join = (): Promise<Room> => {
      if (how.kind === "quick") return client.joinOrCreate("run", { ...me, ...room } satisfies JoinOptions & RoomOptions);
      if (how.kind === "create") return client.create("run", { ...me, ...room, private: true } satisfies JoinOptions & RoomOptions);
      return client.joinById(how.code.toUpperCase(), me);
    };
    // A phone that lost signal mid-handshake shouldn't sit on "connecting" forever.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), CONNECT_TIMEOUT_MS));
    const s = new NetSession(await Promise.race([join(), timeout]));
    s.isAccount = !!me.token;
    return s;
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  get isHost(): boolean {
    return this.lobby?.host === this.room.sessionId;
  }

  /** The sim player this client drives in the current run. */
  get myId(): number {
    return this.lobby?.seats.find((s) => s.sessionId === this.room.sessionId)?.playerId ?? -1;
  }

  /** True once the first snapshot of the current run has arrived. */
  get ready(): boolean {
    return !!this.latest;
  }

  start(): void {
    this.room.send("start");
  }

  again(): void {
    this.room.send("again");
  }

  /** Changed hero or outfit: accounts sync first and the server reloads them; guests send what they picked. */
  updateMe(me: JoinOptions): void {
    this.room.send("me", me);
  }

  /** Host only, between runs. */
  setTier(tier: number): void {
    this.room.send("tier", tier);
  }

  emote(id: string): void {
    this.room.send("emote", id);
  }

  setAway(away: boolean): void {
    this.room.send("away", away);
  }

  leave(): void {
    this.leaving = true;
    clearInterval(this.pingTimer);
    clearResume();
    void this.room.leave(true);
  }

  private resetRun(): void {
    this.snaps = [];
    this.latest = undefined;
    this.shown = -1;
    this.pending = [];
    this.predicted = undefined;
    this.scheduled = [];
    this.shots = [];
  }

  // ---------------------------------------------------------------- snapshots and the clock

  private onSnapshot(s: Snapshot): void {
    const d = decodeSnapshot(s);
    const snap: Decoded = { tick: d.world.tick, world: d.world, events: d.events, acks: d.acks };
    // A new run (or an older one's stragglers): start the buffer over.
    if (this.latest && snap.tick < this.latest.tick - TICK_HZ) this.resetRun();
    if (this.latest && snap.tick <= this.latest.tick) return;
    this.snaps.push(snap);
    if (this.snaps.length > MAX_BUFFER) this.snaps.shift();
    this.latest = snap;

    // Clock: lean quickly toward snapshots that arrive "early" and slowly toward late ones, which tracks the fast path through jitter.
    const sample = snap.tick - (performance.now() * TICK_HZ) / 1000;
    if (this.clockOffset === undefined || Math.abs(sample - this.clockOffset) > TICK_HZ) this.clockOffset = sample;
    else this.clockOffset += (sample - this.clockOffset) * (sample > this.clockOffset ? 0.2 : 0.02);

    this.reconcile(snap);
  }

  private renderTick(): number {
    const est = (performance.now() * TICK_HZ) / 1000 + (this.clockOffset ?? 0);
    return est - INTERP_TICKS;
  }

  /** What to draw this frame. `predAlpha` is how far the scene is between its own fixed input ticks. */
  frame(predAlpha: number, dt: number): Frame | undefined {
    const latest = this.latest;
    if (!latest) return undefined;
    const want = this.renderTick();
    this.stats.frames++;
    if (want > latest.tick + 0.5) this.stats.starved++;
    const rt = Math.min(want, latest.tick);
    let a = this.snaps[0]!;
    let b = a;
    for (const s of this.snaps) {
      if (s.tick <= rt) a = s;
      else {
        b = s;
        break;
      }
    }
    if (b.tick <= a.tick) b = a;
    const alpha = b === a ? 1 : Math.max(0, Math.min(1, (rt - a.tick) / (b.tick - a.tick)));

    const events: SimEvent[] = [];
    for (const s of this.snaps) {
      if (s.tick > this.shown && s.tick <= b.tick) events.push(...s.events);
    }
    this.shown = Math.max(this.shown, b.tick);
    // Drop snapshots we'll never interpolate from again.
    while (this.snaps.length > 2 && this.snaps[1]!.tick <= rt) this.snaps.shift();

    const prev = new Map<number, Vec>();
    for (const p of a.world.players) prev.set(p.id, p.pos);
    for (const e of a.world.enemies) prev.set(e.id, e.pos);
    for (const pr of a.world.projectiles) prev.set(pr.id, pr.pos);

    const world: World = { ...b.world, players: b.world.players.map((p) => (p.id === this.myId ? this.drawnMe(p, predAlpha, dt) : p)) };
    return { world, prev, alpha, events };
  }

  /** Your own hero: the freshest server state, at the predicted position. */
  private drawnMe(interp: Player, alpha: number, dt: number): Player {
    const fresh = this.latest?.world.players.find((p) => p.id === interp.id) ?? interp;
    const pr = this.predicted;
    if (!pr) return fresh;
    const k = Math.exp(-dt * 12);
    this.smooth = { x: this.smooth.x * k, y: this.smooth.y * k };
    const pos = {
      x: this.predPrev.x + (pr.pos.x - this.predPrev.x) * alpha + this.smooth.x,
      y: this.predPrev.y + (pr.pos.y - this.predPrev.y) * alpha + this.smooth.y,
    };
    return { ...fresh, pos, vel: pr.vel, facing: pr.facing, dashT: pr.dashT, dashCd: pr.dashCd, active: pr.active, guns: pr.guns };
  }

  // ---------------------------------------------------------------- prediction

  /** Sends one tick of input and runs it on the predicted hero. Returns what to show right away. */
  input(input: PlayerInput, resolveAim: (from: Vec, range: number) => Vec | undefined): { shots: LocalShot[]; dashed: boolean } {
    const none = { shots: [], dashed: false };
    if (!this.latest || this.myId < 0) return none;
    this.seq++;
    this.room.send("i", encodeInput(this.seq, input));
    const entry = { seq: this.seq, input, firedGun: -1 };
    this.pending.push(entry);
    // Way behind (tab hitch, dead connection): stop hoarding inputs the server will never ack.
    if (this.pending.length > TICK_HZ * 2) this.pending.shift();

    const p = this.predicted;
    // Held by a grabber: the server decides where you are (dash presses still go out, to struggle).
    if (!p || !canAct(p) || p.pinnedBy) return none;
    this.predPrev = { ...p.pos };
    const dashed = this.applyMovement(p, input);
    this.shots = [];
    this.predictShooting(p, input, entry, resolveAim);
    return { shots: this.shots, dashed };
  }

  /** The predicted hero as the input code should see it: can I fire, is my dash ready. */
  controlPlayer(): Player | undefined {
    const p = this.predicted;
    if (!p) return undefined;
    return { ...p, shotCd: this.shotCd, burstLeft: this.busyT > 0 ? 1 : 0, charging: false };
  }

  private applyMovement(p: Player, input: PlayerInput): boolean {
    updateFacing(p, input);
    if (input.swap && this.busyT <= 0) p.active = (p.active + 1) % p.guns.length;
    return stepMovement(this.latest!.world, p, input);
  }

  /** Server state plus every input it hasn't applied yet. */
  private reconcile(snap: Decoded): void {
    const me = snap.world.players.find((p) => p.id === this.myId);
    const ack = snap.acks.get(this.myId) ?? -1;
    this.pending = this.pending.filter((e) => e.seq > ack);
    if (!me) {
      this.predicted = undefined;
      return;
    }
    const old = this.predicted?.pos;
    const p: Player = { ...me, pos: { ...me.pos }, guns: me.guns.map((g) => ({ ...g })) };
    if (canAct(p) && !p.pinnedBy) for (const e of this.pending) this.applyMovement(p, e.input);
    // Ammo already spent on shots the server hasn't seen yet.
    for (const e of this.pending) {
      const g = p.guns.find((gg) => gg.uid === e.firedGun);
      if (g) g.pips = Math.max(0, g.pips - 1);
    }
    this.predicted = p;
    if (old) {
      const d = sub(old, p.pos);
      if (len(d) > 0.01 && len(d) < 40) {
        this.stats.corrections++;
        this.stats.maxCorrection = Math.max(this.stats.maxCorrection, len(d));
      }
      // Small corrections are smoothed out; teleports (room changes, revives) just happen.
      if (len(d) < 40) {
        this.smooth = { x: this.smooth.x + d.x, y: this.smooth.y + d.y };
        this.predPrev = { x: this.predPrev.x - d.x, y: this.predPrev.y - d.y };
      } else {
        this.smooth = { x: 0, y: 0 };
        this.predPrev = { ...p.pos };
      }
    } else this.predPrev = { ...p.pos };
  }

  /** Mirrors the sim's trigger logic closely enough to know when a shot leaves the gun. */
  private predictShooting(p: Player, input: PlayerInput, entry: { firedGun: number }, resolveAim: (from: Vec, range: number) => Vec | undefined): void {
    const gun = p.guns[p.active]!;
    const s = gunStats(gun);
    this.shotCd = Math.max(0, this.shotCd - DT);
    this.busyT = Math.max(0, this.busyT - DT);
    const aimNow = (): Vec => (!input.autoAim && len(input.aim) > 1 ? input.aim : (resolveAim(p.pos, s.range * 1.15) ?? { x: p.facing.x * s.range * 0.75, y: p.facing.y * s.range * 0.75 }));
    for (const sh of this.scheduled) {
      sh.t -= DT;
      if (sh.t > 0) continue;
      const aim = sh.burst ? aimNow() : sh.aim;
      const l = len(aim) || 1;
      if (sh.burst) p.facing = { x: aim.x / l, y: aim.y / l };
      this.emit(p, gun, aim);
    }
    this.scheduled = this.scheduled.filter((sh) => sh.t > 0);

    if (!input.fire || this.shotCd > 0 || this.busyT > 0 || gun.pips < 1) return;
    const aim = aimNow();
    gun.pips -= 1;
    entry.firedGun = gun.uid;
    this.shotCd = s.fireDelayMs / 1000;
    const l = len(aim) || 1;
    p.facing = { x: aim.x / l, y: aim.y / l };
    if (s.chargeMs > 0) {
      this.scheduled.push({ t: s.chargeMs / 1000, aim });
      this.busyT = s.chargeMs / 1000;
      return;
    }
    this.emit(p, gun, aim);
    for (let i = 1; i < s.shotsPerPip; i++) this.scheduled.push({ t: (i * s.shotIntervalMs) / 1000, aim, burst: true });
    this.busyT = ((s.shotsPerPip - 1) * s.shotIntervalMs) / 1000;
  }

  private emit(p: Player, gun: Gun, aim: Vec): void {
    const angle = Math.atan2(aim.y, aim.x);
    this.shots.push({ x: p.pos.x + Math.cos(angle) * (p.radius + 5), y: p.pos.y + Math.sin(angle) * (p.radius + 5), angle, gun });
  }
}

// Who you are and what you've earned.
//
// Guests get a hero that lives only in memory: nothing is saved when they leave (design doc: Guest play).
// Signed-in players keep their profile on this device too. Every change is an Action applied right away with the
// sim's own reducer (so solo works offline), then queued and sent to the server, which applies the same actions.
// Whatever the server says wins; actions it hasn't seen yet are replayed on top.
// A solo run in progress is saved as it goes, so closing the game mid-run still brings it home on the next launch.
import { applyAction, cleanProfile, newProfile, randomId, type Action, type Profile, type RunResult, type RunReward } from "@lostluggage/sim";
import { serverUrl } from "./net";

const KEY = "lostluggage.account";
const GUEST_NAME_KEY = "lostluggage.profile";

/** An action before it gets its id. */
type NewAction = Action extends infer A ? (A extends Action ? Omit<A, "id"> : never) : never;

interface Saved {
  token: string;
  username: string;
  profile: unknown;
  queue: Action[];
  /** The solo run in progress, as it stood at its last checkpoint. */
  run?: RunResult;
}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export class AccountStore {
  token?: string;
  username?: string;
  profile: Profile;
  /** Applied here, not yet confirmed by the server. */
  queue: Action[] = [];
  /** The last sync failed for lack of a connection. */
  offline = false;
  /** The server no longer accepts our token: sign in again (local progress is kept until then). */
  expired = false;
  /** What a run cut short last time (the game was closed mid-run) earned when it came home at launch. */
  recovered?: RunReward;
  /** The solo run in progress, saved with the profile so it's never lost or counted twice. */
  private run?: RunResult;
  private syncing?: Promise<void>;
  private listeners = new Set<() => void>();

  constructor() {
    const saved = read<Saved>(KEY);
    if (saved?.token) {
      this.token = saved.token;
      this.username = saved.username;
      this.profile = cleanProfile(saved.profile, saved.username);
      this.queue = Array.isArray(saved.queue) ? saved.queue : [];
      this.run = saved.run;
    } else {
      this.profile = newProfile(read<{ name?: string }>(GUEST_NAME_KEY)?.name ?? "");
    }
    // The game was closed mid-run last time: that run comes home now.
    this.recovered = this.bankRun();
    addEventListener("online", () => void this.sync());
    // Ask the browser not to clear our save under storage pressure (matters most on iPhone).
    void navigator.storage?.persist?.().catch(() => {});
  }

  get signedIn(): boolean {
    return !!this.token;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      if (this.token) localStorage.setItem(KEY, JSON.stringify({ token: this.token, username: this.username ?? "", profile: this.profile, queue: this.queue, run: this.run } satisfies Saved));
      else localStorage.setItem(GUEST_NAME_KEY, JSON.stringify({ name: this.profile.name }));
    } catch {
      /* private mode or full storage: the server copy still has it */
    }
  }

  /** Applies a change now and queues it for the server. */
  dispatch(a: NewAction): { reward?: RunReward; xp?: number } {
    const action = { ...a, id: randomId() } as Action;
    const r = applyAction(this.profile, action);
    this.profile = r.profile;
    // A run's result replaces its checkpoint in the same save.
    if (action.type === "run") this.run = undefined;
    if (this.token) this.queue.push(action);
    this.changed();
    void this.sync();
    return { reward: r.reward, xp: r.xp };
  }

  /** Saves the solo run so far. Guests keep nothing, so there's nothing to save for them. */
  checkpoint(result: RunResult): void {
    if (!this.token) return;
    this.run = result;
    this.save();
  }

  /** Brings home a checkpointed run that never got its ending (the game was closed mid-run). */
  bankRun(): RunReward | undefined {
    const run = this.run;
    return run ? this.dispatch({ type: "run", result: run }).reward : undefined;
  }

  /** The server's copy, plus whatever it hasn't seen yet. */
  private adoptServer(server: Profile, pending: readonly Action[]): void {
    let p = cleanProfile(server, this.username);
    for (const a of pending) p = applyAction(p, a).profile;
    this.profile = p;
  }

  /** A co-op reward came in: the server already saved it. */
  adopt(server: Profile): void {
    if (!this.token) return;
    this.adoptServer(server, this.queue);
    this.changed();
  }

  /** Sends queued actions. Safe to call any time; concurrent calls share one request. */
  sync(): Promise<void> {
    if (!this.token) return Promise.resolve();
    this.syncing ??= this.doSync().finally(() => (this.syncing = undefined));
    return this.syncing;
  }

  private async doSync(): Promise<void> {
    const sent = this.queue.slice();
    try {
      const res = await fetch(`${serverUrl()}/api/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ actions: sent }),
      });
      if (res.status === 401) {
        this.expired = true;
        this.changed();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { profile: Profile };
      this.offline = false;
      this.expired = false;
      this.queue = this.queue.filter((a) => !sent.includes(a));
      this.adoptServer(data.profile, this.queue);
      this.changed();
      // Changes made while this request was out go in the next one.
      if (this.queue.length) setTimeout(() => void this.sync(), 0);
    } catch {
      this.offline = true;
      this.changed();
    }
  }

  /** Sign in or sign up. Returns an error message for the form, or undefined on success. */
  async authenticate(kind: "login" | "register", username: string, password: string, invite = ""): Promise<string | undefined> {
    try {
      const res = await fetch(`${serverUrl()}/api/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, invite }),
      });
      const data = (await res.json()) as { token?: string; username?: string; profile?: Profile; error?: string };
      if (!res.ok || !data.token) return data.error ?? "SOMETHING WENT WRONG";
      // Signing in as someone else drops the other account's unsynced changes; the same account keeps them.
      const same = this.username === data.username;
      this.token = data.token;
      this.username = data.username;
      this.expired = false;
      if (!same) {
        this.queue = [];
        this.run = undefined;
      }
      this.adoptServer(data.profile!, this.queue);
      this.changed();
      void this.sync();
      return undefined;
    } catch {
      return "CAN'T REACH THE SERVER";
    }
  }

  signOut(): void {
    const token = this.token;
    if (token) void fetch(`${serverUrl()}/api/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* fine */
    }
    this.token = this.username = undefined;
    this.queue = [];
    this.run = undefined;
    this.expired = false;
    this.profile = newProfile();
    this.changed();
  }

  /** Whether the server wants an invite code to sign up. */
  static async inviteRequired(): Promise<boolean> {
    try {
      const res = await fetch(`${serverUrl()}/api/config`);
      return ((await res.json()) as { inviteRequired?: boolean }).inviteRequired === true;
    } catch {
      return false;
    }
  }
}

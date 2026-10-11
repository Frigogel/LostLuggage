// Accounts and saved profiles, in SQLite through Node's built-in driver (no native build step on the Pi).
// A profile is one JSON document per account; every change to it goes through the sim's `applyAction`,
// the same reducer the browser runs, so the server and every device always agree.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { applyAction, cleanProfile, newProfile, type Action, type Profile, type RunReward } from "@lostluggage/sim";

export interface Account {
  id: number;
  username: string;
}

/** Usernames are drawn with the pixel font: capitals and digits. */
export function cleanUsername(raw: unknown): string | undefined {
  const name = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,10}$/.test(name) ? name : undefined;
}

export class Db {
  private db: DatabaseSync;

  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles (account_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS applied (account_id INTEGER NOT NULL, action_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account_id, action_id));
    `);
  }

  close(): void {
    this.db.close();
  }

  private hash(password: string, salt: string): string {
    return scryptSync(password, salt, 32).toString("hex");
  }

  /** Returns undefined when the name is taken. */
  register(username: string, password: string): Account | undefined {
    if (this.db.prepare("SELECT 1 FROM accounts WHERE username = ?").get(username)) return undefined;
    const salt = randomBytes(16).toString("hex");
    const r = this.db.prepare("INSERT INTO accounts (username, salt, hash, created) VALUES (?, ?, ?, ?)").run(username, salt, this.hash(password, salt), Date.now());
    const id = Number(r.lastInsertRowid);
    this.saveProfile(id, newProfile(username));
    return { id, username };
  }

  login(username: string, password: string): Account | undefined {
    const row = this.db.prepare("SELECT id, salt, hash FROM accounts WHERE username = ?").get(username) as { id: number; salt: string; hash: string } | undefined;
    if (!row) return undefined;
    const ok = timingSafeEqual(Buffer.from(this.hash(password, row.salt), "hex"), Buffer.from(row.hash, "hex"));
    return ok ? { id: row.id, username } : undefined;
  }

  newSession(accountId: number): string {
    const token = randomBytes(24).toString("base64url");
    this.db.prepare("INSERT INTO sessions (token, account_id, created) VALUES (?, ?, ?)").run(token, accountId, Date.now());
    return token;
  }

  endSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  accountForToken(token: unknown): Account | undefined {
    if (typeof token !== "string" || !token) return undefined;
    const row = this.db.prepare("SELECT a.id, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token = ?").get(token) as Account | undefined;
    return row ? { id: row.id, username: row.username } : undefined;
  }

  profile(accountId: number): Profile {
    const row = this.db.prepare("SELECT data FROM profiles WHERE account_id = ?").get(accountId) as { data: string } | undefined;
    let raw: unknown;
    try {
      raw = row ? JSON.parse(row.data) : undefined;
    } catch {
      raw = undefined;
    }
    return cleanProfile(raw);
  }

  saveProfile(accountId: number, p: Profile): void {
    this.db.prepare("INSERT INTO profiles (account_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated = excluded.updated").run(accountId, JSON.stringify(p), Date.now());
  }

  /**
   * Applies actions in order, each exactly once: a phone that retries a sync after losing the response
   * doesn't get paid twice. Returns the new profile and the reward for every run action that was applied.
   */
  apply(accountId: number, actions: readonly Action[]): { profile: Profile; rewards: Record<string, RunReward> } {
    const rewards: Record<string, RunReward> = {};
    const seen = this.db.prepare("SELECT 1 FROM applied WHERE account_id = ? AND action_id = ?");
    const mark = this.db.prepare("INSERT INTO applied (account_id, action_id, at) VALUES (?, ?, ?)");
    this.db.exec("BEGIN");
    try {
      let p = this.profile(accountId);
      for (const a of actions) {
        if (!a || typeof a !== "object" || typeof a.id !== "string" || !a.id || a.id.length > 64) continue;
        if (seen.get(accountId, a.id)) continue;
        const r = applyAction(p, a);
        p = r.profile;
        if (r.reward) rewards[a.id] = r.reward;
        mark.run(accountId, a.id, Date.now());
      }
      this.saveProfile(accountId, p);
      this.db.exec("COMMIT");
      return { profile: p, rewards };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}

let shared: Db | undefined;

/** The process-wide database: `DB_PATH`, or data/lostluggage.db next to the server. */
export function getDb(): Db {
  shared ??= new Db(process.env.DB_PATH ?? fileURLToPath(new URL("../data/lostluggage.db", import.meta.url)));
  return shared;
}

export function setDb(db: Db): void {
  shared = db;
}

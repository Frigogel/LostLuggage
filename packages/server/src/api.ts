// Account API: sign up, sign in, and profile sync. Small JSON endpoints next to the Colyseus rooms.
import express, { type Application, type Request, type Response } from "express";
import type { Action } from "@lostluggage/sim";
import { cleanUsername, getDb, type Account } from "./db";

/** Friends-only server: when INVITE_CODE is set, signing up needs it. */
const inviteCode = () => process.env.INVITE_CODE?.trim().toUpperCase() || "";

/** A few wrong passwords a minute per address is plenty for people; it stops scripts guessing. */
const attempts = new Map<string, { n: number; until: number }>();
function limited(req: Request): boolean {
  const key = req.ip ?? "?";
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) {
    attempts.set(key, { n: 1, until: now + 60_000 });
    return false;
  }
  return ++a.n > 10;
}

function auth(req: Request, res: Response): Account | undefined {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const account = getDb().accountForToken(token);
  if (!account) res.status(401).json({ error: "SIGN IN AGAIN" });
  return account;
}

export function mountApi(app: Application): void {
  // The dev client (and VITE_SERVER_URL builds) live on another origin. Tokens travel in a header, not a cookie,
  // so letting any origin call the API gives a page nothing it didn't already have.
  app.use("/api", (req, res, next) => {
    res.set({ "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "GET, POST" });
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });
  app.use("/api", express.json({ limit: "256kb" }));

  app.get("/api/config", (_req, res) => {
    res.json({ inviteRequired: !!inviteCode() });
  });

  app.post("/api/register", (req, res) => {
    if (limited(req)) return void res.status(429).json({ error: "TOO MANY TRIES. WAIT A MINUTE" });
    const username = cleanUsername(req.body?.username);
    const password = String(req.body?.password ?? "");
    if (!username) return void res.status(400).json({ error: "NAMES ARE 3-10 LETTERS OR DIGITS" });
    if (password.length < 6 || password.length > 200) return void res.status(400).json({ error: "PASSWORDS NEED 6+ CHARACTERS" });
    if (inviteCode() && String(req.body?.invite ?? "").trim().toUpperCase() !== inviteCode()) return void res.status(403).json({ error: "WRONG INVITE CODE" });
    const db = getDb();
    const account = db.register(username, password);
    if (!account) return void res.status(409).json({ error: "THAT NAME IS TAKEN" });
    res.status(201).json({ token: db.newSession(account.id), username, profile: db.profile(account.id) });
  });

  app.post("/api/login", (req, res) => {
    if (limited(req)) return void res.status(429).json({ error: "TOO MANY TRIES. WAIT A MINUTE" });
    const db = getDb();
    const username = cleanUsername(req.body?.username);
    const account = username && db.login(username, String(req.body?.password ?? ""));
    if (!account) return void res.status(401).json({ error: "WRONG NAME OR PASSWORD" });
    res.json({ token: db.newSession(account.id), username: account.username, profile: db.profile(account.id) });
  });

  app.post("/api/logout", (req, res) => {
    const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) getDb().endSession(token);
    res.json({ ok: true });
  });

  app.get("/api/profile", (req, res) => {
    const account = auth(req, res);
    if (account) res.json({ username: account.username, profile: getDb().profile(account.id) });
  });

  /** Applies a device's queued actions (offline solo runs, equips, skills...) and returns the account's profile. */
  app.post("/api/sync", (req, res) => {
    const account = auth(req, res);
    if (!account) return;
    const actions = Array.isArray(req.body?.actions) ? (req.body.actions as Action[]).slice(0, 500) : [];
    res.json(getDb().apply(account.id, actions));
  });
}

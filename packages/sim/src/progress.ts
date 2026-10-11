// Progression: hero levels, the gun stash, loadouts, skills and souvenirs.
//
// Everything that changes a saved profile is an Action, applied by the pure `applyAction` below. The browser applies
// actions right away (solo runs work offline) and queues them; the server applies the same actions to the account
// when they sync. Co-op rewards are applied on the server directly. Because both sides run this one reducer, they
// always agree, and replaying a queue on top of a newer server profile just works.
//
// Actions carry their own ids (for exactly-once syncing) and every random choice (new stash ids, the souvenir roll)
// is decided from data inside the action, never inside the reducer.
import { COSMETIC_IDS, COSMETICS, cleanOutfit, cosmeticDropChance, DEFAULT_OUTFIT, isStarter, type CosmeticSlot, type Outfit } from "./data/cosmetics";
import { GUNS } from "./data/guns";
import { HEROES, MAX_LEVEL, tierLevel } from "./data/heroes";
import { LEGENDARIES } from "./data/legendaries";
import { MAKERS } from "./data/makers";
import { SIGNATURES } from "./data/signatures";
import { validSkills } from "./data/skills";
import { SOUVENIR_CAP, SOUVENIR_IDS, SOUVENIRS, souvenirTotal, type SouvenirId, type SouvenirRanks } from "./data/souvenirs";
import { gunData, PERKS, RARITIES } from "./loot";
import type { PlayerOptions } from "./players";
import type { Biome, Element, GunData, MakerId, PerkId, Player, Rarity, World } from "./types";

export const PROFILE_VERSION = 1;
/** Guns kept at home. Overflow scraps the worst unequipped ones. */
export const STASH_CAP = 40;
/** XP for scrapping a gun, by rarity. Recycling is good for you. */
export const SCRAP_XP: Record<Rarity, number> = { common: 4, uncommon: 8, rare: 15, epic: 30, legendary: 60 };

export interface StashGun extends GunData {
  id: string;
  /** Not looked at in the armory yet. */
  new?: boolean;
}

export interface HeroProgress {
  level: number;
  /** XP toward the next level. */
  xp: number;
  skills: string[];
  /** Equipped signature power, or "" for the plain action skill. */
  signature?: string;
}

export interface Profile {
  v: number;
  name: string;
  heroId: string;
  heroes: Record<string, HeroProgress>;
  stash: StashGun[];
  /** Stash ids of the two equipped guns. */
  loadout: string[];
  souvenirs: SouvenirRanks;
  /** Signature powers found in co-op dungeons, for any hero. */
  signatures: string[];
  /** Souvenirs found but not unpacked yet. */
  pendingSouvenirs: number;
  /** Seeds the next souvenir offer, so every device shows the same three. */
  offerSeed: number;
  /** Local date (YYYY-MM-DD) of the last first-win-of-the-day bonus. */
  lastDailyWin: string;
  stats: { runs: number; wins: number; kills: number; legendaries: number };
  /** Cosmetics earned (starters aren't listed: everyone has them). */
  cosmetics: string[];
  /** Earned but not looked at in the wardrobe yet. */
  newCosmetics: string[];
  outfit: Outfit;
  /** Adventures won, as "biome:tier", for first-clear cosmetics. */
  clears: string[];
}

export interface RunResult {
  mode: "solo" | "coop";
  heroId: string;
  tier: number;
  victory: boolean;
  /** Rooms cleared. */
  rooms: number;
  /** Bosses beaten (one per act). */
  acts?: number;
  kills: number;
  /** Guns coming home (the ones in your hands), with fresh stash ids. */
  guns: StashGun[];
  /** Stash ids of the guns in hand at the end; "" keeps that loadout slot as it was. */
  hand: string[];
  /** Local date (YYYY-MM-DD), for the first win of the day. */
  day: string;
  /** Co-op: you helped someone below the dungeon tier's level. */
  helped?: boolean;
  /** Co-op: a signature power dropped for you. */
  signature?: string;
  /** Which adventure, for first-clear cosmetics. */
  biome?: Biome;
}

export interface RunReward {
  xp: number;
  /** Lines like "FIRST WIN OF THE DAY +50%". */
  bonuses: string[];
  levelBefore: number;
  levelAfter: number;
  /** Guns added to the stash. */
  kept: number;
  /** Guns scrapped because the stash was full. */
  scrapped: number;
  legendaries: number;
  souvenir: boolean;
  /** A new signature power was found. */
  signature?: string;
  /** Cosmetics earned by this run. */
  cosmetics?: string[];
}

export type Action =
  | { type: "run"; id: string; result: RunResult }
  | { type: "equip"; id: string; slot: number; gunId: string }
  | { type: "scrap"; id: string; gunIds: string[] }
  | { type: "skills"; id: string; heroId: string; skills: string[] }
  | { type: "souvenir"; id: string; pick: SouvenirId }
  | { type: "name"; id: string; name: string }
  | { type: "hero"; id: string; heroId: string }
  | { type: "signature"; id: string; heroId: string; signature: string }
  | { type: "seen"; id: string }
  | { type: "outfit"; id: string; slot: CosmeticSlot; cosmetic: string }
  | { type: "seenWardrobe"; id: string };

// ---------------------------------------------------------------- basics

/** XP from level L to L+1 grows linearly (design doc: 125 for 1→2, 825 for 29→30, 13,775 in total). */
export function xpToNext(level: number): number {
  return 100 + 25 * level;
}

/** Names are drawn with the pixel font, which has capitals, digits and a few symbols. */
export function cleanName(raw: unknown, fallback = ""): string {
  const name = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .!?-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10);
  return name || fallback;
}

/** A stable number in [0, 1) from a string, for choices that every device must make the same way. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Random ids for stash guns and actions: plenty unique for a friends-only game. */
export function randomId(): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)];
  return s;
}

const STARTERS: StashGun[] = [
  { id: "starter-pistol", defId: "pistol", element: "none", rarity: "common", perks: [], maker: "cruise" },
  { id: "starter-shotgun", defId: "shotgun", element: "none", rarity: "common", perks: [], maker: "cruise" },
];

export function newProfile(name = ""): Profile {
  return {
    v: PROFILE_VERSION,
    name: cleanName(name),
    heroId: "vanguard",
    heroes: { vanguard: { level: 1, xp: 0, skills: [] } },
    stash: STARTERS.map((g) => ({ ...g, perks: [] })),
    loadout: STARTERS.map((g) => g.id),
    souvenirs: {},
    signatures: [],
    pendingSouvenirs: 0,
    offerSeed: 1,
    lastDailyWin: "",
    stats: { runs: 0, wins: 0, kills: 0, legendaries: 0 },
    cosmetics: [],
    newCosmetics: [],
    outfit: { ...DEFAULT_OUTFIT },
    clears: [],
  };
}

export function ownsCosmetic(p: Profile, id: string): boolean {
  return !!COSMETICS[id] && (isStarter(id) || p.cosmetics.includes(id));
}

function give(p: Profile, ids: readonly string[]): void {
  for (const id of ids) {
    if (p.cosmetics.includes(id)) continue;
    p.cosmetics.push(id);
    p.newCosmetics.push(id);
  }
}

/** Gives every stat or level cosmetic the profile has earned. Returns the new ones. */
function grantMilestones(p: Profile): string[] {
  const got: string[] = [];
  const topLevel = Math.max(1, ...Object.values(p.heroes).map((h) => h.level));
  for (const id of COSMETIC_IDS) {
    const u = COSMETICS[id]!.unlock;
    if (u.kind !== "stat" || p.cosmetics.includes(id)) continue;
    if ((u.stat === "level" ? topLevel : p.stats[u.stat]) >= u.n) got.push(id);
  }
  give(p, got);
  return got;
}

export function heroOf(p: Profile, heroId = p.heroId): HeroProgress {
  return p.heroes[heroId] ?? { level: 1, xp: 0, skills: [] };
}

/** The two equipped guns. Missing ones (scrapped elsewhere, a corrupt save) fall back to the starter kit. */
export function loadoutGuns(p: Profile): StashGun[] {
  return [0, 1].map((i) => p.stash.find((g) => g.id === p.loadout[i]) ?? STARTERS[i]!);
}

/** What a run needs to know about this profile's hero. */
export function playerOptions(p: Profile): PlayerOptions {
  const hero = heroOf(p);
  return {
    heroId: p.heroId,
    name: p.name || undefined,
    level: hero.level,
    skills: hero.skills,
    guns: loadoutGuns(p).map((g) => ({ ...gunData(g), sid: g.id })),
    souvenirs: p.souvenirs,
    signature: hero.signature && p.signatures.includes(hero.signature) ? hero.signature : undefined,
  };
}

// ---------------------------------------------------------------- validation

const ELEMENT_LIST: Element[] = ["none", "fire", "shock", "frost", "acid"];

/** Guns arrive from clients and old saves: anything that isn't a real gun is dropped. */
export function cleanGun(raw: unknown): StashGun | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as Record<string, unknown>;
  const id = typeof g.id === "string" ? g.id.slice(0, 40) : "";
  const defId = String(g.defId);
  if (!id || !GUNS[defId]) return undefined;
  const element = ELEMENT_LIST.includes(g.element as Element) ? (g.element as Element) : "none";
  const rarity = RARITIES.includes(g.rarity as Rarity) ? (g.rarity as Rarity) : "common";
  const maker = typeof g.maker === "string" && g.maker in MAKERS ? (g.maker as MakerId) : "cruise";
  const perks = [...new Set(Array.isArray(g.perks) ? g.perks : [])].filter((x): x is PerkId => typeof x === "string" && x in PERKS).slice(0, 3);
  const out: StashGun = { id, defId, element, rarity, perks, maker };
  const leg = typeof g.legendary === "string" ? LEGENDARIES[g.legendary] : undefined;
  if (leg) Object.assign(out, { legendary: leg.id, defId: leg.defId, maker: leg.maker, rarity: "legendary" });
  if (g.new === true) out.new = true;
  return out;
}

const int = (v: unknown, lo: number, hi: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

/** Repairs a profile from storage or the network into something the game can use. */
export function cleanProfile(raw: unknown, name = ""): Profile {
  const p = newProfile(name);
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Partial<Profile>;
  p.name = cleanName(r.name, p.name);
  if (typeof r.heroId === "string" && HEROES[r.heroId]) p.heroId = r.heroId;
  for (const [id, h] of Object.entries(r.heroes ?? {})) {
    if (!HEROES[id] || !h) continue;
    const level = int(h.level, 1, MAX_LEVEL);
    p.heroes[id] = { level, xp: level >= MAX_LEVEL ? 0 : int(h.xp, 0, xpToNext(level) - 1), skills: validSkills(id, level, Array.isArray(h.skills) ? h.skills : []) };
  }
  if (Array.isArray(r.signatures)) p.signatures = [...new Set(r.signatures.filter((s): s is string => typeof s === "string" && !!SIGNATURES[s]))];
  for (const [id, h] of Object.entries(r.heroes ?? {})) {
    const sig = h?.signature;
    if (p.heroes[id] && typeof sig === "string" && p.signatures.includes(sig) && SIGNATURES[sig]!.heroId === id) p.heroes[id]!.signature = sig;
  }
  if (Array.isArray(r.stash)) {
    const seen = new Set<string>();
    p.stash = r.stash.map(cleanGun).filter((g): g is StashGun => !!g && !seen.has(g.id) && !!seen.add(g.id));
  }
  if (Array.isArray(r.loadout)) p.loadout = [0, 1].map((i) => String(r.loadout![i] ?? p.loadout[i]));
  for (const id of SOUVENIR_IDS) {
    const n = int(r.souvenirs?.[id], 0, SOUVENIRS[id].maxRanks);
    if (n > 0) p.souvenirs[id] = n;
  }
  p.pendingSouvenirs = int(r.pendingSouvenirs, 0, 99);
  p.offerSeed = int(r.offerSeed, 0, 2 ** 31);
  p.lastDailyWin = typeof r.lastDailyWin === "string" ? r.lastDailyWin.slice(0, 10) : "";
  const s = r.stats;
  if (s) p.stats = { runs: int(s.runs, 0, 1e9), wins: int(s.wins, 0, 1e9), kills: int(s.kills, 0, 1e9), legendaries: int(s.legendaries, 0, 1e9) };
  const known = (x: unknown): x is string => typeof x === "string" && !!COSMETICS[x] && !isStarter(x);
  if (Array.isArray(r.cosmetics)) p.cosmetics = [...new Set(r.cosmetics.filter(known))];
  if (Array.isArray(r.newCosmetics)) p.newCosmetics = [...new Set(r.newCosmetics.filter((x) => known(x) && p.cosmetics.includes(x)))];
  p.outfit = cleanOutfit(r.outfit, (id) => ownsCosmetic(p, id));
  if (Array.isArray(r.clears)) p.clears = [...new Set(r.clears.filter((c): c is string => typeof c === "string" && /^[a-z]+:[0-2]$/.test(c)))].slice(0, 20);
  return p;
}

// ---------------------------------------------------------------- souvenirs

/** The three souvenirs on offer for the next unpacking (fewer when most are maxed). */
export function souvenirOffers(p: Profile): SouvenirId[] {
  if (p.pendingSouvenirs <= 0 || souvenirTotal(p.souvenirs) >= SOUVENIR_CAP) return [];
  const pool = SOUVENIR_IDS.filter((id) => (p.souvenirs[id] ?? 0) < SOUVENIRS[id].maxRanks);
  const ranked = pool.map((id) => ({ id, k: hash01(`${p.offerSeed}:${id}`) })).sort((a, b) => a.k - b.k);
  return ranked.slice(0, 3).map((r) => r.id);
}

// ---------------------------------------------------------------- rewards

export function runXp(r: RunResult, daily: boolean): { xp: number; bonuses: string[] } {
  const bonuses: string[] = [];
  // Runs are long and rarely won: every room and every act pays, and the win pays a lot.
  let xp = r.rooms * 12 + Math.min(r.kills, 1500) * 0.25 + (r.acts ?? 0) * 40 + (r.victory ? 100 : 0);
  if (r.tier > 0) {
    xp *= 1 + 0.25 * r.tier;
    bonuses.push(`HARDER TIER +${25 * r.tier}%`);
  }
  // Dungeons are the bigger, harder outing: about 160 XP against a solo run's 100.
  if (r.mode === "coop") {
    xp *= 1.3;
    bonuses.push("CO-OP +30%");
  }
  if (r.helped) {
    xp *= 1.25;
    bonuses.push("HELPED A NEWER HERO +25%");
  }
  if (daily) {
    xp *= 1.5;
    bonuses.push("FIRST BOSS OF THE DAY +50%");
  }
  return { xp: Math.round(xp), bonuses };
}

/** Builds a run's result for one player. `newId` makes stash ids for guns that are new to the stash. */
export function runResult(w: World, p: Player, opts: { mode: "solo" | "coop"; day: string; newId?: () => string; helped?: boolean }): RunResult {
  const newId = opts.newId ?? randomId;
  const ids = new Map<number, string>();
  const guns: StashGun[] = [];
  for (const g of p.guns) {
    if (g.sid || g.loaner || ids.has(g.uid)) continue;
    const id = newId();
    ids.set(g.uid, id);
    guns.push({ ...gunData(g), id, new: true });
  }
  const room = w.run.room;
  return {
    mode: opts.mode,
    heroId: p.heroId,
    tier: w.run.tier,
    // Beating the final boss is the win, even if endless got you afterwards.
    victory: w.run.victory || w.run.finale,
    rooms: room.index + (room.cleared ? 1 : 0),
    acts: w.run.bosses,
    kills: w.run.kills,
    guns,
    hand: p.guns.map((g) => g.sid ?? ids.get(g.uid) ?? ""),
    day: opts.day,
    helped: opts.helped || undefined,
    biome: w.run.biome,
  };
}

/** A signature power for this profile's hero that it doesn't own yet, or any it doesn't own. The roll is in [0, 1). */
export function signatureDrop(p: Profile, heroId: string, roll: number): string | undefined {
  const unowned = Object.values(SIGNATURES).filter((s) => !p.signatures.includes(s.id));
  const mine = unowned.filter((s) => s.heroId === heroId);
  const pool = mine.length > 0 ? mine : unowned;
  return pool.length > 0 ? pool[Math.floor(roll * pool.length)]!.id : undefined;
}

/** Odds that a co-op win drops a signature power: rare on Normal, better on harder tiers. */
export function signatureChance(tier: number): number {
  return 0.3 + 0.15 * tier;
}

/** Co-op "reasons to group with newer players": you're at or above the tier's level and someone else is below it. */
export function helpedNewer(w: World, p: Player): boolean {
  const lv = tierLevel(w.run.tier);
  return p.level >= lv && w.players.some((o) => o !== p && o.level < lv);
}

/** Today's date where the player is, YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addXp(p: Profile, heroId: string, xp: number): void {
  const h = (p.heroes[heroId] ??= { level: 1, xp: 0, skills: [] });
  h.xp += Math.max(0, Math.round(xp));
  while (h.level < MAX_LEVEL && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level++;
  }
  if (h.level >= MAX_LEVEL) h.xp = 0;
}

/** Removes guns from the stash (never the equipped ones). Returns the XP they were worth. */
function scrap(p: Profile, ids: readonly string[]): number {
  let xp = 0;
  const kill = new Set(ids.filter((id) => !p.loadout.includes(id)));
  p.stash = p.stash.filter((g) => {
    if (!kill.has(g.id)) return true;
    xp += SCRAP_XP[g.rarity];
    return false;
  });
  return xp;
}

/** A win's cosmetics: the first clear of an adventure and tier, and sometimes a boss drop. */
function runCosmetics(p: Profile, id: string, r: RunResult): string[] {
  // A boss is enough for a chance at a drop; first-clear hats need the whole adventure.
  if (!r.victory && !(r.acts && r.acts > 0)) return [];
  const got: string[] = [];
  const clear = `${r.biome}:${r.tier}`;
  if (r.victory && !p.clears.includes(clear)) {
    p.clears.push(clear);
    for (const cid of COSMETIC_IDS) {
      const u = COSMETICS[cid]!.unlock;
      if (u.kind === "clear" && u.biome === r.biome && u.tier === r.tier && !p.cosmetics.includes(cid)) got.push(cid);
    }
  }
  const drops = COSMETIC_IDS.filter((cid) => COSMETICS[cid]!.unlock.kind === "drop" && !p.cosmetics.includes(cid));
  if (drops.length > 0 && hash01(`cosmetic:${id}`) < cosmeticDropChance(r.mode, r.tier)) got.push(drops[Math.floor(hash01(`cosmetic-pick:${id}`) * drops.length)]!);
  give(p, got);
  return got;
}

function applyRun(p: Profile, id: string, raw: RunResult): RunReward {
  const heroId = HEROES[raw.heroId] ? raw.heroId : p.heroId;
  const r: RunResult = {
    mode: raw.mode === "coop" ? "coop" : "solo",
    heroId,
    tier: int(raw.tier, 0, 2),
    victory: raw.victory === true,
    rooms: int(raw.rooms, 0, 300),
    acts: int(raw.acts, 0, 60),
    kills: int(raw.kills, 0, 5000),
    guns: (Array.isArray(raw.guns) ? raw.guns : []).slice(0, 80).map(cleanGun).filter((g): g is StashGun => !!g),
    hand: (Array.isArray(raw.hand) ? raw.hand : []).slice(0, 2).map((h) => String(h ?? "")),
    day: String(raw.day ?? "").slice(0, 10),
    helped: raw.helped === true,
    biome: raw.biome === "caverns" ? "caverns" : "foundry",
  };
  // Signature powers only come from co-op dungeons.
  const sig = raw.mode === "coop" && typeof raw.signature === "string" && SIGNATURES[raw.signature] && !p.signatures.includes(raw.signature) ? raw.signature : undefined;
  if (sig) p.signatures.push(sig);
  const levelBefore = heroOf(p, heroId).level;
  // The daily bonus (and the guaranteed souvenir) comes from the first boss of the day: wins are rare now.
  const daily = (r.acts ?? 0) > 0 && !!r.day && r.day !== p.lastDailyWin;
  if (daily) p.lastDailyWin = r.day;
  const { xp, bonuses } = runXp(r, daily);

  // Only the guns in your hands come home.
  let kept = 0;
  let legendaries = 0;
  for (const g of r.guns) {
    if (p.stash.some((s) => s.id === g.id)) continue;
    p.stash.push({ ...g, new: true });
    kept++;
    if (g.legendary) legendaries++;
  }
  // You keep playing with whatever you were holding.
  r.hand.forEach((gid, slot) => {
    if (gid && p.stash.some((s) => s.id === gid) && !p.loadout.some((l, i) => l === gid && i !== slot)) p.loadout[slot] = gid;
  });
  // A full stash scraps its worst unequipped guns, oldest first.
  let scrapped = 0;
  let scrapXp = 0;
  while (p.stash.length > STASH_CAP) {
    const spare = p.stash.filter((g) => !p.loadout.includes(g.id));
    if (spare.length === 0) break;
    const worst = spare.reduce((a, b) => (RARITIES.indexOf(b.rarity) < RARITIES.indexOf(a.rarity) ? b : a));
    scrapXp += scrap(p, [worst.id]);
    scrapped++;
  }

  // Souvenirs come from solo adventures that beat a boss: always from the first of the day, sometimes otherwise.
  let souvenir = false;
  if (r.mode === "solo" && ((r.acts ?? 0) > 0 || r.victory) && souvenirTotal(p.souvenirs) + p.pendingSouvenirs < SOUVENIR_CAP) {
    souvenir = daily || hash01(`souvenir:${id}`) < 0.35;
    if (souvenir) p.pendingSouvenirs++;
  }
  if (r.helped) bonuses.push("+1 THANK-YOU GIFT");

  addXp(p, heroId, xp + scrapXp);
  p.stats.runs++;
  if (r.victory) p.stats.wins++;
  p.stats.kills += r.kills;
  p.stats.legendaries += legendaries;
  const cosmetics = [...runCosmetics(p, id, r), ...grantMilestones(p)];
  const reward: RunReward = { xp: xp + scrapXp, bonuses, levelBefore, levelAfter: heroOf(p, heroId).level, kept, scrapped, legendaries, souvenir };
  if (sig) reward.signature = sig;
  if (cosmetics.length) reward.cosmetics = cosmetics;
  return reward;
}

/** Applies one action to a copy of the profile. Invalid actions change nothing. */
export function applyAction(profile: Profile, action: Action): { profile: Profile; reward?: RunReward; xp?: number } {
  const p = JSON.parse(JSON.stringify(profile)) as Profile;
  switch (action?.type) {
    case "run":
      return { profile: p, reward: applyRun(p, action.id, action.result ?? ({} as RunResult)) };
    case "equip": {
      const slot = int(action.slot, 0, 1);
      const gid = String(action.gunId);
      if (!p.stash.some((g) => g.id === gid)) break;
      // Equipping the gun that's in the other slot swaps the two.
      const other = p.loadout.indexOf(gid);
      if (other >= 0 && other !== slot) p.loadout[other] = p.loadout[slot]!;
      p.loadout[slot] = gid;
      break;
    }
    case "scrap": {
      const xp = scrap(p, (Array.isArray(action.gunIds) ? action.gunIds : []).map(String));
      addXp(p, p.heroId, xp);
      // Scrapping can level a hero up to the crown.
      grantMilestones(p);
      return { profile: p, xp };
    }
    case "skills": {
      if (!HEROES[action.heroId]) break;
      const h = (p.heroes[action.heroId] ??= { level: 1, xp: 0, skills: [] });
      h.skills = validSkills(action.heroId, h.level, Array.isArray(action.skills) ? action.skills.map(String) : []);
      break;
    }
    case "souvenir": {
      if (!souvenirOffers(p).includes(action.pick)) break;
      p.souvenirs[action.pick] = (p.souvenirs[action.pick] ?? 0) + 1;
      p.pendingSouvenirs--;
      p.offerSeed = Math.floor(hash01(`${p.offerSeed}:${action.pick}:next`) * 2 ** 31);
      break;
    }
    case "name":
      p.name = cleanName(action.name, p.name);
      break;
    case "hero": {
      if (!HEROES[action.heroId]) break;
      p.heroId = action.heroId;
      p.heroes[action.heroId] ??= { level: 1, xp: 0, skills: [] };
      break;
    }
    case "signature": {
      const h = p.heroes[action.heroId];
      const sig = String(action.signature ?? "");
      if (!h) break;
      if (sig === "") delete h.signature;
      else if (p.signatures.includes(sig) && SIGNATURES[sig]?.heroId === action.heroId) h.signature = sig;
      break;
    }
    case "seen":
      for (const g of p.stash) delete g.new;
      break;
    case "outfit": {
      const slot = action.slot;
      const id = String(action.cosmetic ?? "");
      if (!(slot in p.outfit)) break;
      // Hats, trails and skins can be taken off; there's always an emote.
      if (id === "" ? slot !== "emote" : COSMETICS[id]?.slot === slot && ownsCosmetic(p, id)) p.outfit[slot] = id;
      break;
    }
    case "seenWardrobe":
      p.newCosmetics = [];
      break;
  }
  return { profile: p };
}

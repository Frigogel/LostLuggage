import { GUNS } from "./data/guns";
import { LEGENDARIES, LEGENDARY_IDS } from "./data/legendaries";
import { MAKER_IDS, MAKERS } from "./data/makers";
import { pick, rand } from "./math";
import type { Archetype, BoostId, Element, Gun, GunData, GunStats, MakerId, PerkId, Rarity, World } from "./types";

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
export const ELEMENTS: Exclude<Element, "none">[] = ["fire", "shock", "frost", "acid"];

/** Rarity mostly adds perks. Raw stats grow at most ~10% from common to legendary (design rule). */
const RARITY = {
  common: { weight: 52, perks: 0, elementChance: 0.15, statMult: 1.0 },
  uncommon: { weight: 28, perks: 1, elementChance: 0.35, statMult: 1.025 },
  rare: { weight: 14, perks: 1, elementChance: 0.6, statMult: 1.05 },
  epic: { weight: 5, perks: 2, elementChance: 0.85, statMult: 1.075 },
  // Legendaries trade a perk for their named effect.
  legendary: { weight: 1, perks: 2, elementChance: 1, statMult: 1.1 },
} satisfies Record<Rarity, unknown>;

export interface PerkDef {
  name: string;
  text: string;
  /** Archetypes it makes sense on. */
  only?: Archetype[];
  not?: Archetype[];
}

export const PERKS: Record<PerkId, PerkDef> = {
  pierce: { name: "Skewering", text: "Shots pierce one more enemy", not: ["launcher"] },
  bounce: { name: "Bouncy", text: "Shots ricochet off walls", not: ["launcher"] },
  extraPip: { name: "Roomy", text: "+1 ammo pip" },
  quickReload: { name: "Twitchy", text: "Pips reload 20% faster" },
  bigShots: { name: "Chonky", text: "Bigger projectiles", not: ["launcher"] },
  killReload: { name: "Thrifty", text: "Kills refill a pip" },
  hotStreak: { name: "Streaky", text: "Kills speed up reload for 3s" },
  volatile: { name: "Volatile", text: "Kills cause a small blast" },
};

export const ELEMENT_INFO: Record<Element, { adjective: string; text: string }> = {
  none: { adjective: "", text: "" },
  fire: { adjective: "Toasty", text: "Burns flesh. Weak vs armor" },
  shock: { adjective: "Zappy", text: "Chains, strips shields" },
  frost: { adjective: "Chilly", text: "Slows, then freezes" },
  acid: { adjective: "Corrosive", text: "Melts armor" },
};

export const BOOSTS: Record<BoostId, { name: string; text: string }> = {
  bounce: { name: "Shrine of Ricochet", text: "+1 bounce on every shot" },
  burnSpread: { name: "Shrine of Arson", text: "Burning enemies spread fire on death" },
  vampire: { name: "Shrine of Snacks", text: "Kills heal 2 HP" },
  quickPips: { name: "Shrine of Haste", text: "All pips reload 15% faster" },
  dashBurst: { name: "Shrine of Zoom", text: "Dashing releases a shock burst" },
};

function weighted<T extends string>(w: World, table: Record<T, { weight: number }>, luck = 0): T {
  // Luck shifts weight away from the first (worst) entry.
  const keys = Object.keys(table) as T[];
  const weights = keys.map((k, i) => table[k].weight * (i === 0 ? Math.max(0.15, 1 - luck) : 1 + luck * i * 0.6));
  let r = rand(w) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return keys[i]!;
  }
  return keys[0]!;
}

/** A gun in hand: saved data plus a fresh uid and a full ammo bar. */
export function gunFromData(w: World, data: GunData, sid?: string): Gun {
  const gun: Gun = { uid: w.nextId++, defId: data.defId, element: data.element, rarity: data.rarity, perks: [...data.perks], maker: data.maker, pips: 0 };
  if (data.legendary) gun.legendary = data.legendary;
  if (sid) gun.sid = sid;
  gun.pips = gunStats(gun).pips;
  return gun;
}

export function newGun(w: World, defId: string, rarity: Rarity = "common", element: Element = "none", perks: PerkId[] = [], maker: MakerId = "cruise"): Gun {
  return gunFromData(w, { defId, rarity, element, perks, maker });
}

/** Just the saved parts of a gun. */
export function gunData(g: GunData): GunData {
  const d: GunData = { defId: g.defId, element: g.element, rarity: g.rarity, perks: [...g.perks], maker: g.maker };
  if (g.legendary) d.legendary = g.legendary;
  return d;
}

function rollPerks(w: World, archetype: Archetype, n: number): PerkId[] {
  const pool = (Object.keys(PERKS) as PerkId[]).filter((p) => {
    const d = PERKS[p];
    return (!d.only || d.only.includes(archetype)) && (!d.not || !d.not.includes(archetype));
  });
  const perks: PerkId[] = [];
  while (perks.length < n && pool.length > 0) {
    const i = Math.floor(rand(w) * pool.length);
    perks.push(pool.splice(i, 1)[0]!);
  }
  return perks;
}

export function rollGun(w: World, luck = 0, minRarity: Rarity = "common"): Gun {
  let rarity = weighted(w, RARITY, luck);
  if (RARITIES.indexOf(rarity) < RARITIES.indexOf(minRarity)) rarity = minRarity;
  const r = RARITY[rarity];

  if (rarity === "legendary") {
    // Every legendary is a named gun with one rule-breaking effect.
    const def = LEGENDARIES[pick(w, LEGENDARY_IDS)]!;
    const element = def.element ?? (def.effect === "moodRing" ? "none" : pick(w, ELEMENTS));
    const perks = rollPerks(w, GUNS[def.defId]!.archetype, r.perks);
    return gunFromData(w, { defId: def.defId, rarity, element, perks, maker: def.maker, legendary: def.id });
  }

  const defId = pick(w, Object.keys(GUNS));
  const maker = pick(w, MAKER_IDS.filter((m) => MAKERS[m].weight > 0));
  // Arcane Electric guns are always elemental.
  const element = maker === "arcane" || rand(w) < r.elementChance ? pick(w, ELEMENTS) : "none";
  return newGun(w, defId, rarity, element, rollPerks(w, GUNS[defId]!.archetype, r.perks), maker);
}

/** The gun's effective stats after manufacturer, rarity and perks. */
export function gunStats(gun: GunData): GunStats {
  const base = GUNS[gun.defId]!;
  const m = RARITY[gun.rarity].statMult;
  const has = (p: PerkId) => gun.perks.includes(p);
  // Elemental guns trade a little base damage for their effect.
  const elementMult = gun.element === "none" ? 1 : 0.9;
  const s: GunStats = {
    ...base,
    lob: base.lob && { ...base.lob },
    damage: base.damage * m * elementMult,
    pips: base.pips + (has("extraPip") ? 1 : 0),
    reloadMs: base.reloadMs / m / (has("quickReload") ? 1.2 : 1),
    pierce: base.pierce + (has("pierce") ? 1 : 0),
    projRadius: base.projRadius + (has("bigShots") ? 1 : 0),
    bounces: has("bounce") ? 1 : 0,
    homing: 0,
  };
  // Manufacturer quirks keep sustained damage within a few percent of each other: they change the feel, not the power.
  switch (gun.maker) {
    case "dwarfcorp":
      s.pips = Math.max(1, s.pips - 1);
      s.damage *= 1.5;
      s.reloadMs *= 1.4;
      s.projRadius += 1;
      s.knockback *= 1.5;
      if (s.lob) s.lob.radius *= 1.2;
      break;
    case "arcane":
      s.damage *= 0.88;
      break;
    case "goblin": {
      const n = s.pellets + 2;
      s.damage *= (s.pellets / n) * 1.2;
      s.pellets = n;
      s.spreadDeg += 14;
      if (s.lob) s.lob.radius *= 0.75;
      break;
    }
    case "wizard":
      s.damage *= 0.95;
      s.bounces += 1;
      if (!s.lob) s.homing = 2.5;
      break;
    case "megamart":
      s.pips += 3;
      s.reloadMs *= 1.15;
      s.damage *= 0.95;
      break;
  }
  return s;
}

export function gunName(gun: GunData): string {
  if (gun.legendary) return LEGENDARIES[gun.legendary]?.name ?? GUNS[gun.defId]!.name;
  const base = GUNS[gun.defId]!.name;
  const adj = ELEMENT_INFO[gun.element].adjective;
  const perk = gun.perks[0] ? PERKS[gun.perks[0]].name : "";
  return [perk, adj, base].filter(Boolean).join(" ");
}

/** Rough damage per second for comparing two guns at a glance. */
export function gunDps(gun: GunData): number {
  const s = gunStats(gun);
  const perPip = s.damage * s.shotsPerPip * s.pellets * (s.lob ? 1.6 : 1);
  const pipTime = Math.max(s.reloadMs, s.fireDelayMs) / 1000;
  return perPip / pipTime;
}

/** Shots from this gun fly in ways co-op clients can't predict, so they're drawn from the server instead. */
export function unpredictable(gun: GunData): boolean {
  const effect = gun.legendary ? LEGENDARIES[gun.legendary]?.effect : undefined;
  return gunStats(gun).homing > 0 || effect === "boomerang" || effect === "ricochet";
}

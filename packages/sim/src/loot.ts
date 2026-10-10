import { GUNS } from "./data/guns";
import { pick, rand } from "./math";
import type { Archetype, BoostId, Element, Gun, GunDef, PerkId, Rarity, World } from "./types";

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
export const ELEMENTS: Exclude<Element, "none">[] = ["fire", "shock", "frost", "acid"];

/** Rarity mostly adds perks. Raw stats grow at most ~10% from common to legendary (design rule). */
const RARITY = {
  common: { weight: 52, perks: 0, elementChance: 0.15, statMult: 1.0 },
  uncommon: { weight: 28, perks: 1, elementChance: 0.35, statMult: 1.025 },
  rare: { weight: 14, perks: 1, elementChance: 0.6, statMult: 1.05 },
  epic: { weight: 5, perks: 2, elementChance: 0.85, statMult: 1.075 },
  legendary: { weight: 1, perks: 3, elementChance: 1, statMult: 1.1 },
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

export function newGun(w: World, defId: string, rarity: Rarity = "common", element: Element = "none", perks: PerkId[] = []): Gun {
  const gun: Gun = { uid: w.nextId++, defId, element, rarity, perks, pips: 0 };
  gun.pips = gunStats(gun).pips;
  return gun;
}

export function rollGun(w: World, luck = 0, minRarity: Rarity = "common"): Gun {
  const defId = pick(w, Object.keys(GUNS));
  const archetype = GUNS[defId]!.archetype;
  let rarity = weighted(w, RARITY, luck);
  if (RARITIES.indexOf(rarity) < RARITIES.indexOf(minRarity)) rarity = minRarity;
  const r = RARITY[rarity];
  const element = rand(w) < r.elementChance ? pick(w, ELEMENTS) : "none";
  const pool = (Object.keys(PERKS) as PerkId[]).filter((p) => {
    const d = PERKS[p];
    return (!d.only || d.only.includes(archetype)) && (!d.not || !d.not.includes(archetype));
  });
  const perks: PerkId[] = [];
  while (perks.length < r.perks && pool.length > 0) {
    const i = Math.floor(rand(w) * pool.length);
    perks.push(pool.splice(i, 1)[0]!);
  }
  return newGun(w, defId, rarity, element, perks);
}

/** The gun's effective stats after rarity and perks. */
export function gunStats(gun: Gun): GunDef {
  const base = GUNS[gun.defId]!;
  const m = RARITY[gun.rarity].statMult;
  const has = (p: PerkId) => gun.perks.includes(p);
  // Elemental guns trade a little base damage for their effect.
  const elementMult = gun.element === "none" ? 1 : 0.9;
  return {
    ...base,
    damage: base.damage * m * elementMult,
    pips: base.pips + (has("extraPip") ? 1 : 0),
    reloadMs: base.reloadMs / m / (has("quickReload") ? 1.2 : 1),
    pierce: base.pierce + (has("pierce") ? 1 : 0),
    projRadius: base.projRadius + (has("bigShots") ? 1 : 0),
  };
}

export function gunName(gun: Gun): string {
  const base = GUNS[gun.defId]!.name;
  const adj = ELEMENT_INFO[gun.element].adjective;
  const perk = gun.perks[0] ? PERKS[gun.perks[0]].name : "";
  return [perk, adj, base].filter(Boolean).join(" ");
}

/** Rough damage per second for comparing two guns at a glance. */
export function gunDps(gun: Gun): number {
  const s = gunStats(gun);
  const perPip = s.damage * s.shotsPerPip * s.pellets * (s.lob ? 1.6 : 1);
  const pipTime = Math.max(s.reloadMs, s.fireDelayMs) / 1000;
  return perPip / pipTime;
}

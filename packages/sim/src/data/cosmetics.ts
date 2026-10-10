import type { Biome } from "../types";

// Cosmetics are goofy, earned only by playing, and never sold (design doc: Cosmetics). They change how a hero looks,
// never how it plays, so the sim ignores them: they travel with the lobby, not in snapshots.

export type CosmeticSlot = "hat" | "trail" | "skin" | "emote";
export const COSMETIC_SLOTS: CosmeticSlot[] = ["hat", "trail", "skin", "emote"];
export const SLOT_NAMES: Record<CosmeticSlot, string> = { hat: "Hat", trail: "Dash trail", skin: "Gun skin", emote: "Emote" };

/** How a cosmetic is earned. */
export type Unlock =
  /** Everyone has it from the start. */
  | { kind: "starter" }
  /** The first win of this adventure on this tier. */
  | { kind: "clear"; biome: Biome; tier: number }
  /** A random drop from a win (the boss drops it). */
  | { kind: "drop" }
  /** A milestone in the profile's stats; "level" is any hero's level. */
  | { kind: "stat"; stat: "runs" | "wins" | "kills" | "legendaries" | "level"; n: number };

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  flavor: string;
  unlock: Unlock;
}

const starter: Unlock = { kind: "starter" };
const drop: Unlock = { kind: "drop" };

const LIST: CosmeticDef[] = [
  // Hats sit on top of the hero's head.
  { id: "hat_party", slot: "hat", name: "Party Hat", flavor: "Someone's birthday. Probably.", unlock: starter },
  { id: "hat_cone", slot: "hat", name: "Traffic Cone", flavor: "Found on the foundry floor. Still warm.", unlock: { kind: "clear", biome: "foundry", tier: 0 } },
  { id: "hat_fish", slot: "hat", name: "A Fish", flavor: "It's frozen. For now.", unlock: { kind: "clear", biome: "caverns", tier: 0 } },
  { id: "hat_captain", slot: "hat", name: "Captain's Cap", flavor: "The captain won't be needing it.", unlock: { kind: "clear", biome: "foundry", tier: 1 } },
  { id: "hat_beanie", slot: "hat", name: "Bobble Beanie", flavor: "Knitted by a yeti. Itchy.", unlock: { kind: "clear", biome: "caverns", tier: 1 } },
  { id: "hat_horns", slot: "hat", name: "Furnace Horns", flavor: "The foreman's. He has spares.", unlock: { kind: "clear", biome: "foundry", tier: 2 } },
  { id: "hat_iceberg", slot: "hat", name: "Tiny Iceberg", flavor: "Only the tip is showing.", unlock: { kind: "clear", biome: "caverns", tier: 2 } },
  { id: "hat_propeller", slot: "hat", name: "Propeller Wizard Hat", flavor: "Spins when you think hard.", unlock: drop },
  { id: "hat_chef", slot: "hat", name: "Chef's Toque", flavor: "From the buffet. Don't ask.", unlock: drop },
  { id: "hat_head", slot: "hat", name: "Tiny Second Head", flavor: "He has opinions.", unlock: { kind: "stat", stat: "wins", n: 25 } },
  { id: "hat_crown", slot: "hat", name: "Lost & Found Crown", flavor: "Unclaimed for 30 days. Yours now.", unlock: { kind: "stat", stat: "level", n: 30 } },

  // Dash trails replace the plain afterimage.
  { id: "trail_confetti", slot: "trail", name: "Confetti", flavor: "Somebody has to sweep that up.", unlock: starter },
  { id: "trail_bubbles", slot: "trail", name: "Bubbles", flavor: "From the pool deck.", unlock: drop },
  { id: "trail_ducks", slot: "trail", name: "Rubber Ducks", flavor: "A line of them. They follow you now.", unlock: drop },
  { id: "trail_flames", slot: "trail", name: "Afterburner", flavor: "Not covered by the warranty.", unlock: drop },
  { id: "trail_snow", slot: "trail", name: "Flurry", flavor: "Your own little weather.", unlock: drop },
  { id: "trail_receipts", slot: "trail", name: "Receipts", flavor: "Keep them for the claim form.", unlock: { kind: "stat", stat: "runs", n: 50 } },
  { id: "trail_rainbow", slot: "trail", name: "Rainbow", flavor: "Fast enough to bend light.", unlock: { kind: "stat", stat: "kills", n: 2000 } },

  // Gun skins dress up whatever you're holding.
  { id: "skin_sticker", slot: "skin", name: "Property of the Cruise Line", flavor: "Please return to the purser.", unlock: starter },
  { id: "skin_googly", slot: "skin", name: "Googly Eyes", flavor: "It's watching what you do with it.", unlock: drop },
  { id: "skin_candy", slot: "skin", name: "Candy Stripe", flavor: "Do not lick the gun.", unlock: drop },
  { id: "skin_floral", slot: "skin", name: "Tourist Floral", flavor: "Matches your shirt.", unlock: drop },
  { id: "skin_gold", slot: "skin", name: "Gold Plated", flavor: "Mostly paint.", unlock: { kind: "stat", stat: "legendaries", n: 3 } },

  // Emotes play in the lobby.
  { id: "emote_wave", slot: "emote", name: "Wave", flavor: "Hello! Have you seen my bag?", unlock: starter },
  { id: "emote_shrug", slot: "emote", name: "Shrug", flavor: "The cruise line is not liable.", unlock: starter },
  { id: "emote_bow", slot: "emote", name: "Dramatic Bow", flavor: "Thank you. Thank you all.", unlock: drop },
  { id: "emote_guitar", slot: "emote", name: "Air Guitar", flavor: "Encore!", unlock: drop },
  { id: "emote_laugh", slot: "emote", name: "Ha Ha Ha", flavor: "At you, not with you.", unlock: drop },
  { id: "emote_floss", slot: "emote", name: "The Floss But Worse", flavor: "Please stop.", unlock: { kind: "stat", stat: "wins", n: 10 } },
];

export const COSMETICS: Record<string, CosmeticDef> = Object.fromEntries(LIST.map((c) => [c.id, c]));
export const COSMETIC_IDS = LIST.map((c) => c.id);

/** One item per slot; "" is the plain look (no hat, the usual afterimage, factory paint). */
export type Outfit = Record<CosmeticSlot, string>;
export const DEFAULT_OUTFIT: Outfit = { hat: "", trail: "", skin: "", emote: "emote_wave" };

export function cosmeticsFor(slot: CosmeticSlot): CosmeticDef[] {
  return LIST.filter((c) => c.slot === slot);
}

export function isStarter(id: string): boolean {
  return COSMETICS[id]?.unlock.kind === "starter";
}

/** How to earn it, for the wardrobe's locked items. */
export function unlockText(c: CosmeticDef): string {
  const u = c.unlock;
  const tiers = ["Normal", "Hard", "Nightmare"];
  const biomes: Record<Biome, string> = { foundry: "the Burning Foundry", caverns: "the Frozen Caverns" };
  switch (u.kind) {
    case "starter":
      return "Everyone has this one.";
    case "clear":
      return `Win ${biomes[u.biome]} on ${tiers[u.tier]}.`;
    case "drop":
      return "Bosses sometimes drop it. Win runs.";
    case "stat":
      return u.stat === "level" ? `Get any hero to level ${u.n}.` : `${{ runs: "Play", wins: "Win", kills: "Defeat", legendaries: "Find" }[u.stat]} ${u.n.toLocaleString("en-US")} ${{ runs: "runs", wins: "runs", kills: "enemies", legendaries: "legendaries" }[u.stat]}.`;
  }
}

/** Repairs an outfit from a save or the network. `owns` says which items may be worn. */
export function cleanOutfit(raw: unknown, owns: (id: string) => boolean): Outfit {
  const out = { ...DEFAULT_OUTFIT };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const slot of COSMETIC_SLOTS) {
    const id = r[slot];
    if (id === "" && slot !== "emote") out[slot] = "";
    else if (typeof id === "string" && COSMETICS[id]?.slot === slot && owns(id)) out[slot] = id;
  }
  return out;
}

/** Odds that a win drops a cosmetic: better in co-op dungeons and on harder tiers. */
export function cosmeticDropChance(mode: "solo" | "coop", tier: number): number {
  return (mode === "coop" ? 0.2 : 0.12) + 0.05 * tier;
}

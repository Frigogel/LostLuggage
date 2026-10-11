import type { Rarity } from "../types";

// Relics: the charm in your carry-on, one slot of the loadout. Nothing to press: a relic just works.
// Regular relics nudge one stat, more the rarer they are, inside the gear's narrow band (a legendary is worth about
// two maxed souvenirs' worth of that stat). Mythic relics are their own kinds, flagged `mythic`, and never come from
// the regular roll: instead of a stat, they bend a rule (design doc: Mythics).

export type RelicStat = "hp" | "damage" | "speed" | "dash" | "charge" | "armor" | "luck";
export type MythicRelicEffect = "vest" | "headphones" | "clock" | "plusOne";

export interface RelicDef {
  id: string;
  name: string;
  flavor: string;
  /** Mythics: what the ability does, plainly. Stat relics build theirs from the stat (see relicText). */
  text?: string;
  stat?: RelicStat;
  mythic?: MythicRelicEffect;
}

export const RELICS: Record<string, RelicDef> = {
  neck_pillow: { id: "neck_pillow", name: "Neck Pillow", flavor: "Memory foam. It remembers every hit.", stat: "hp" },
  energy_drink: { id: "energy_drink", name: "Energy Drink", flavor: "Flavor: blue.", stat: "damage" },
  spinner_wheels: { id: "spinner_wheels", name: "Spinner Wheels", flavor: "Four-way. No way back.", stat: "speed" },
  priority_tag: { id: "priority_tag", name: "Priority Tag", flavor: "Skip the queue. Skip the danger.", stat: "dash" },
  travel_adapter: { id: "travel_adapter", name: "Travel Adapter", flavor: "Fits every socket. Eventually.", stat: "charge" },
  hard_case: { id: "hard_case", name: "Hard-Shell Case", flavor: "Fell out of a plane once. Fine.", stat: "armor" },
  pressed_penny: { id: "pressed_penny", name: "Pressed Penny", flavor: "Squashed for luck. Worth less, means more.", stat: "luck" },

  life_vest: {
    id: "life_vest",
    name: "Life Vest",
    flavor: "Located under your seat. Pull the tab.",
    text: "Once a room, a hit that would down you leaves you at 1 health instead, in a blast that throws enemies back",
    mythic: "vest",
  },
  headphones: {
    id: "headphones",
    name: "Noise-Cancelling Headphones",
    flavor: "The crying baby is someone else's problem now.",
    text: "Nothing moves you: grabbers can't hold you, hits don't shove you and slush doesn't slow you",
    mythic: "headphones",
  },
  world_clock: {
    id: "world_clock",
    name: "World Clock",
    flavor: "It's five o'clock somewhere. Mostly right here.",
    text: "Dashing leaves the clock behind: enemies near where you started crawl at a fifth of their speed for 3s",
    mythic: "clock",
  },
  plus_one: {
    id: "plus_one",
    name: "Plus-One",
    flavor: "Your name's on the list. So is theirs.",
    text: "Every grenade brings a friend: a second one lands beside it",
    mythic: "plusOne",
  },
};

/** Every relic kind, mythic ones included (for the wire and the stash). */
export const RELIC_KINDS = Object.keys(RELICS);
/** The kinds the regular roll picks from. */
export const RELIC_IDS = RELIC_KINDS.filter((id) => !RELICS[id]!.mythic);
export const MYTHIC_RELIC_IDS = RELIC_KINDS.filter((id) => !!RELICS[id]!.mythic);

/** A stat relic's bonus, common to legendary. */
export const RELIC_STATS: Record<RelicStat, { amount: number[]; text: (pct: number) => string }> = {
  hp: { amount: [0.04, 0.06, 0.08, 0.1, 0.12], text: (n) => `+${n}% max health` },
  damage: { amount: [0.03, 0.04, 0.05, 0.06, 0.08], text: (n) => `+${n}% damage` },
  speed: { amount: [0.03, 0.04, 0.05, 0.06, 0.08], text: (n) => `+${n}% move speed` },
  dash: { amount: [0.05, 0.075, 0.1, 0.125, 0.15], text: (n) => `-${n}% dash cooldown` },
  charge: { amount: [0.05, 0.075, 0.1, 0.125, 0.15], text: (n) => `+${n}% action skill charge` },
  armor: { amount: [0.03, 0.04, 0.05, 0.06, 0.08], text: (n) => `Take ${n}% less damage` },
  luck: { amount: [0.05, 0.1, 0.15, 0.2, 0.25], text: (n) => `+${n}% loot luck` },
};

/** A stat relic's bonus at this rarity, or 0 (mythics carry an ability instead). */
export function relicAmount(def: RelicDef | undefined, rarity: Rarity): number {
  if (!def?.stat) return 0;
  const a = RELIC_STATS[def.stat].amount;
  return a[Math.min(a.length - 1, Math.max(0, ["common", "uncommon", "rare", "epic", "legendary"].indexOf(rarity)))]!;
}

/** What a relic does, plainly. */
export function relicText(def: RelicDef, rarity: Rarity): string {
  if (def.text) return def.text;
  return RELIC_STATS[def.stat!].text(Math.round(relicAmount(def, rarity) * 1000) / 10);
}

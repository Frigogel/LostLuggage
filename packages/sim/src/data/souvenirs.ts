import type { PlayerMods } from "../types";

// Souvenirs are the permanent boosts from solo adventures: tiny, stackable and hard-capped, so a new player is never
// more than about 15% weaker than a veteran (design doc: Progression and balance).

export type SouvenirId = "snacks" | "gym" | "shoes" | "batteries" | "charger" | "keychain";

export interface SouvenirDef {
  id: SouvenirId;
  name: string;
  /** Per rank, plainly. */
  text: string;
  flavor: string;
  maxRanks: number;
}

export const SOUVENIRS: Record<SouvenirId, SouvenirDef> = {
  snacks: { id: "snacks", name: "Emergency Snacks", text: "+2% max health", flavor: "Mostly crumbs. Still counts.", maxRanks: 5 },
  gym: { id: "gym", name: "Gym Membership", text: "+1% damage", flavor: "You went once. It shows.", maxRanks: 5 },
  shoes: { id: "shoes", name: "Comfy Shoes", text: "+1% move speed", flavor: "Velcro. No regrets.", maxRanks: 5 },
  batteries: { id: "batteries", name: "Spare Batteries", text: "-3% dash cooldown", flavor: "AA. The universal currency.", maxRanks: 5 },
  charger: { id: "charger", name: "Phone Charger", text: "+3% action skill charge", flavor: "Wrong plug. Works anyway.", maxRanks: 5 },
  keychain: { id: "keychain", name: "Lucky Keychain", text: "Slightly better loot", flavor: "A tiny rubber duck. It believes in you.", maxRanks: 5 },
};

export const SOUVENIR_IDS = Object.keys(SOUVENIRS) as SouvenirId[];
/** Hard cap on souvenir ranks across all kinds: 15 of the 30 possible, so you pick a direction. */
export const SOUVENIR_CAP = 15;

export type SouvenirRanks = Partial<Record<SouvenirId, number>>;

export function souvenirTotal(s: SouvenirRanks): number {
  return SOUVENIR_IDS.reduce((sum, id) => sum + (s[id] ?? 0), 0);
}

const rank = (s: SouvenirRanks, id: SouvenirId) => Math.max(0, Math.min(SOUVENIRS[id].maxRanks, Math.floor(s[id] ?? 0)));

export function souvenirMods(s: SouvenirRanks = {}): PlayerMods & { hp: number } {
  return {
    hp: 1 + 0.02 * rank(s, "snacks"),
    damage: 1 + 0.01 * rank(s, "gym"),
    speed: 1 + 0.01 * rank(s, "shoes"),
    dashCd: 1 - 0.03 * rank(s, "batteries"),
    charge: 1 + 0.03 * rank(s, "charger"),
    luck: 0.05 * rank(s, "keychain"),
  };
}

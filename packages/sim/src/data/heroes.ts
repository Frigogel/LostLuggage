import type { HeroDef } from "../types";

export const HEROES: Record<string, HeroDef> = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    maxHp: 120,
    speed: 95,
    radius: 6,
    skill: { type: "dome", radius: 44, durationMs: 4500 },
    skillChargeDamage: 300,
  },
};

export const MAX_LEVEL = 30;
/** Each hero level adds 0.5% health and damage: about 15% from level 1 to 30 (the doc's "tiny stat growth"). */
const GROWTH_PER_LEVEL = 0.005;
/** Co-op level sync: everyone's stats are set to the dungeon tier's level (Normal, Hard, Nightmare). */
export const TIER_LEVELS = [10, 20, 30];

export function levelMultiplier(level: number): number {
  return 1 + GROWTH_PER_LEVEL * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
}

export function tierLevel(tier: number): number {
  return TIER_LEVELS[Math.max(0, Math.min(TIER_LEVELS.length - 1, tier))]!;
}

/** Revives: stand next to a downed teammate to pick them back up. */
export const REVIVE = {
  reach: 22,
  seconds: 2.5,
  hpFrac: 0.4,
};

export const DASH = {
  speed: 400,
  durationMs: 150,
  iframesMs: 170,
  cooldownMs: 3000,
};

import type { HeroDef } from "../types";

// The starting cast (design doc: Heroes and powers). Any hero can use any gun; what changes is the action skill,
// a little health and speed, and the skill tree. Charge costs are tuned so each skill comes up about as often.
export const HEROES: Record<string, HeroDef> = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    role: "Tank",
    flavor: "A knight whose shield is a salvaged spaceship door.",
    maxHp: 120,
    speed: 95,
    radius: 6,
    skill: { type: "dome", radius: 44, durationMs: 4500 },
    skillName: "DOME",
    skillText: "A dome that blocks enemy shots and keeps enemies out",
    skillChargeDamage: 300,
  },
  gunslinger: {
    id: "gunslinger",
    name: "Gunslinger",
    role: "Damage",
    flavor: "An elf cowboy with a laser revolver and too much confidence.",
    maxHp: 95,
    speed: 104,
    radius: 6,
    skill: { type: "mark", count: 3, range: 230, durationMs: 6000, bonus: 0.4 },
    skillName: "MARK",
    skillText: "Marks the 3 nearest enemies: your shots seek them and hit 40% harder",
    skillChargeDamage: 260,
  },
  tinker: {
    id: "tinker",
    name: "Tinker",
    role: "Area control",
    flavor: "A goblin engineer whose turret is held together with tape.",
    maxHp: 110,
    speed: 92,
    radius: 6,
    skill: { type: "turret", durationMs: 10000, hp: 110, range: 160, fireMs: 450, damage: 8 },
    skillName: "BUILD",
    skillText: "Drops a turret that shoots with your gun's element",
    skillChargeDamage: 300,
  },
  warden: {
    id: "warden",
    name: "Warden",
    role: "Support",
    flavor: "A druid whose healing drone is a very polite robot owl.",
    maxHp: 115,
    speed: 98,
    radius: 6,
    skill: { type: "drone", durationMs: 8000, radius: 60, heal: 5, slow: 0.35 },
    skillName: "OWL",
    skillText: "Summons an owl drone that heals allies and slows enemies near it",
    skillChargeDamage: 300,
  },
};

export const HERO_IDS = Object.keys(HEROES);

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
  /** Frozen Caverns: dashes go this much further on ice. */
  iceBoost: 1.35,
};

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

export const DASH = {
  speed: 400,
  durationMs: 150,
  iframesMs: 170,
  cooldownMs: 3000,
};

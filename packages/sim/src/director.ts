import { BIOMES, ENEMIES } from "./data/enemies";
import { canBeElite, ELITE_IDS } from "./elites";
import { pick, rand } from "./math";
import type { Biome, EliteId, EnemyDef, Role, RoomPlan, World } from "./types";

export const MAX_ENEMIES = 40;

/**
 * Role combinations that each pose a distinct problem (design doc: "Combinations are the puzzles").
 * The first roles of a template are guaranteed; the rest of the budget cycles through it.
 */
const TEMPLATES: Role[][] = [
  ["bruiser", "artillery", "swarmer"], // can't just rush the shooter
  ["charger", "zoner", "swarmer"], // dodge lanes while the floor shrinks
  ["support", "bruiser", "swarmer"], // kill the wizard first
  ["summoner", "artillery", "swarmer"], // the crate keeps making it worse
  ["splitter", "support", "artillery"],
  ["charger", "ambusher", "swarmer"],
  ["support", "charger", "zoner"],
  ["splitter", "zoner", "swarmer"],
];

/** Per-wave caps that stop dull or unfair mixes (three artillery alone, two healers, …). */
const ROLE_CAP: Partial<Record<Role, number>> = { artillery: 2, support: 1, summoner: 1, ambusher: 2, bruiser: 2, charger: 3 };

/** Pacing curve for a combat room's waves: tense fight, breather, tense again, spike. */
const PACING = [1.0, 0.7, 1.2, 1.5];

/** Layouts by biome (see room.LAYOUTS): intro, two combat rooms, breather, boss. */
const BIOME_LAYOUTS: Record<Biome, { intro: number; combat: [number, number]; breather: number; boss: number }> = {
  foundry: { intro: 0, combat: [1, 2], breather: 3, boss: 4 },
  caverns: { intro: 5, combat: [6, 7], breather: 8, boss: 9 },
};

function family(biome: string, role: Role): EnemyDef[] {
  return Object.values(ENEMIES).filter((d) => d.role === role && d.threatCost > 0 && d.biomes.includes(biome));
}

export function roomBudget(roomIndex: number, tier: number, partySize: number): number {
  // Each extra player adds 60% more enemies (their health also scales a little, see partyHpMultiplier).
  return (10 + roomIndex * 4) * (1 + tier * 0.35) * (1 + (partySize - 1) * 0.6);
}

/**
 * Share of a wave's budget spent on elite modifiers instead of more enemies (design doc: "Higher difficulty spends
 * part of the budget on elite modifiers"). Normal still sees a few, more in later rooms.
 */
export function eliteShare(roomIndex: number, tier: number): number {
  return Math.min(0.5, 0.1 + 0.04 * roomIndex + 0.15 * tier);
}

/** What an elite costs against the budget. */
const eliteCost = (def: EnemyDef) => Math.max(2, def.threatCost);

export interface WavePlan {
  enemies: string[];
  /** Ambushers wait in the room as props instead of arriving with the wave. */
  props: string[];
}

export function planWave(w: World, budget: number, biome = "foundry", avoidTemplate = -1, elites = 0): WavePlan & { template: number } {
  let t = Math.floor(rand(w) * TEMPLATES.length);
  if (t === avoidTemplate) t = (t + 1) % TEMPLATES.length;
  const template = TEMPLATES[t]!;
  const out: string[] = [];
  const props: string[] = [];
  const count: Partial<Record<Role, number>> = {};
  const eliteBudget = budget * elites;
  let left = budget - eliteBudget;

  const add = (role: Role): boolean => {
    if ((count[role] ?? 0) >= (ROLE_CAP[role] ?? 99)) return false;
    const options = family(biome, role).filter((d) => d.threatCost <= left + 0.5);
    if (options.length === 0) return false;
    const def = pick(w, options);
    if (role === "swarmer") {
      // Swarmers come in packs.
      const pack = Math.max(1, Math.min(Math.floor(left / def.threatCost), 3 + Math.floor(rand(w) * 3)));
      for (let i = 0; i < pack; i++) out.push(def.id);
      left -= pack * def.threatCost;
    } else {
      (role === "ambusher" ? props : out).push(def.id);
      left -= def.threatCost;
    }
    count[role] = (count[role] ?? 0) + 1;
    return true;
  };

  for (const role of template) add(role);
  let i = 0;
  let stuck = 0;
  while (left >= 1 && out.length + props.length < MAX_ENEMIES && stuck < template.length * 2) {
    stuck = add(template[i % template.length]!) ? 0 : stuck + 1;
    i++;
  }
  if (eliteBudget > 0) makeElites(w, out, eliteBudget);
  return { enemies: out, props, template: t };
}

/** Spends the elite share on modifiers for enemies already in the wave. Written as "enemy@modifier". */
function makeElites(w: World, out: string[], budget: number): void {
  let left = budget;
  for (let tries = 0; tries < 8 && left >= 2; tries++) {
    const mod = pick(w, ELITE_IDS);
    const open = out.map((id, i) => ({ id, i })).filter(({ id }) => !id.includes("@") && canBeElite(ENEMIES[id]!, mod));
    // Linked elites come in pairs.
    const n = mod === "linked" ? 2 : 1;
    if (open.length < n) continue;
    const chosen: number[] = [];
    let cost = 0;
    for (let k = 0; k < n; k++) {
      const c = pick(w, open.filter((o) => !chosen.includes(o.i)));
      chosen.push(c.i);
      cost += eliteCost(ENEMIES[c.id]!);
    }
    if (cost > left + 1) continue;
    for (const i of chosen) out[i] = `${out[i]}@${mod satisfies EliteId}`;
    left -= cost;
  }
}

/** One adventure: hand-made intro, combat, breather, combat spike, boss. About 6-8 minutes. */
export function planRun(w: World, tier: number, partySize = 1, biome: Biome = w.run.biome): RoomPlan[] {
  const plans: RoomPlan[] = [];
  const b = BIOMES[biome];
  const lay = BIOME_LAYOUTS[biome];
  // The first room of a biome is hand-made, so it teaches instead of surprising. Co-op adds a couple of swarmers per friend.
  const extra = Array<string>(Math.max(0, partySize - 1) * 2).fill(b.swarmer);
  plans.push({ kind: "intro", layout: lay.intro, waves: b.intro.map((wave) => [...wave, ...extra]), party: partySize });

  const combatLayouts = rand(w) < 0.5 ? lay.combat : ([lay.combat[1], lay.combat[0]] as const);
  for (const [n, roomIndex] of [[0, 1], [1, 3]] as const) {
    if (roomIndex === 3) plans.push({ kind: "breather", layout: lay.breather, waves: [], party: partySize });
    plans.push({ kind: "combat", layout: combatLayouts[n]!, waves: planCombatWaves(w, roomIndex, tier, partySize, biome), party: partySize });
  }

  plans.push({ kind: "boss", layout: lay.boss, waves: [[b.boss]], party: partySize });
  return plans;
}

/** Waves for a director-built combat room. Rooms are re-planned on entry when players dropped in or left. */
export function planCombatWaves(w: World, roomIndex: number, tier: number, partySize: number, biome: Biome = w.run.biome): string[][] {
  const waves: string[][] = [];
  let last = -1;
  const pacing = roomIndex <= 1 ? PACING.slice(0, 3) : PACING;
  pacing.forEach((p, i) => {
    // The first wave of the first room stays plain, so elites show up once you have your feet.
    const elites = roomIndex <= 1 && i === 0 ? 0 : eliteShare(roomIndex, tier);
    const plan = planWave(w, roomBudget(roomIndex, tier, partySize) * p, biome, last, elites);
    last = plan.template;
    // Props are marked with a leading "!" so the room can place them hidden at entry.
    waves.push([...plan.enemies, ...plan.props.map((id) => "!" + id)]);
  });
  return waves;
}

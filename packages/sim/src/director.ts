import { ENEMIES } from "./data/enemies";
import { pick, rand } from "./math";
import type { EnemyDef, Role, RoomPlan, World } from "./types";

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

function family(biome: string, role: Role): EnemyDef[] {
  return Object.values(ENEMIES).filter((d) => d.role === role && d.threatCost > 0 && d.biomes.includes(biome));
}

export function roomBudget(roomIndex: number, tier: number, partySize: number): number {
  // Each extra player adds 60% more enemies (their health also scales a little, see partyHpMultiplier).
  return (10 + roomIndex * 4) * (1 + tier * 0.35) * (1 + (partySize - 1) * 0.6);
}

export interface WavePlan {
  enemies: string[];
  /** Ambushers wait in the room as props instead of arriving with the wave. */
  props: string[];
}

export function planWave(w: World, budget: number, biome = "foundry", avoidTemplate = -1): WavePlan & { template: number } {
  let t = Math.floor(rand(w) * TEMPLATES.length);
  if (t === avoidTemplate) t = (t + 1) % TEMPLATES.length;
  const template = TEMPLATES[t]!;
  const out: string[] = [];
  const props: string[] = [];
  const count: Partial<Record<Role, number>> = {};
  let left = budget;

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
  return { enemies: out, props, template: t };
}

/** A solo adventure: hand-made intro, combat, breather, combat spike, mini-boss. About 6-8 minutes. */
export function planRun(w: World, tier: number, partySize = 1): RoomPlan[] {
  const plans: RoomPlan[] = [];
  // The first room of a biome is hand-made, so it teaches instead of surprising. Co-op adds a couple of rats per friend.
  const extraRats = Array<string>(Math.max(0, partySize - 1) * 2).fill("cone_rat");
  plans.push({
    kind: "intro",
    layout: 0,
    waves: [["cone_rat", "cone_rat", "cone_rat", "cone_rat"], ["slag_golem", "cone_rat", "cone_rat", "cone_rat"], ["mortar_beetle", "acid_slime", "cone_rat", "cone_rat"]].map((wave) => [...wave, ...extraRats]),
    party: partySize,
  });

  const combatLayouts = rand(w) < 0.5 ? [1, 2] : [2, 1];
  for (const [n, roomIndex] of [[0, 1], [1, 3]] as const) {
    if (roomIndex === 3) plans.push({ kind: "breather", layout: 3, waves: [], party: partySize });
    plans.push({ kind: "combat", layout: combatLayouts[n]!, waves: planCombatWaves(w, roomIndex, tier, partySize), party: partySize });
  }

  plans.push({ kind: "boss", layout: 4, waves: [["furnace_foreman"]], party: partySize });
  return plans;
}

/** Waves for a director-built combat room. Rooms are re-planned on entry when players dropped in or left. */
export function planCombatWaves(w: World, roomIndex: number, tier: number, partySize: number): string[][] {
  const waves: string[][] = [];
  let last = -1;
  const pacing = roomIndex <= 1 ? PACING.slice(0, 3) : PACING;
  for (const p of pacing) {
    const plan = planWave(w, roomBudget(roomIndex, tier, partySize) * p, "foundry", last);
    last = plan.template;
    // Props are marked with a leading "!" so the room can place them hidden at entry.
    waves.push([...plan.enemies, ...plan.props.map((id) => "!" + id)]);
  }
  return waves;
}

import { BIOME_IDS, BIOMES, ENEMIES } from "./data/enemies";
import { canBeElite, ELITE_IDS } from "./elites";
import { pick, rand } from "./math";
import type { Biome, Door, DoorKind, EliteId, EnemyDef, Role, RoomKind, RoomPlan, RoomSpec, TwistId, World } from "./types";

export const MAX_ENEMIES = 40;

// ---------------------------------------------------------------- run shape
//
// A run is three acts, each a string of rooms picked at the doors and a boss at the end (design doc: Run structure).
// Act one is the adventure you picked, act two the other biome, act three a mix of both, ending with both bosses at
// once. Beat that and you can fly home with the win, or keep going in endless, where every act is harder than the last.

/** Rooms in an act before its boss: the arrival (step 0), then the rooms picked at the doors. */
export const ACT_ROOMS = 6;
/** The act whose boss ends the adventure. Acts after it are endless. */
export const FINAL_ACT = 2;

/** One rule that changes how a room plays (shown on the door, explained when you walk in). */
export const TWISTS: Record<Exclude<TwistId, "">, { name: string; text: string }> = {
  rush: { name: "Rush Hour", text: "Waves don't wait. Double the loot" },
  dark: { name: "Lights Out", text: "Power cut. Stay close to your friends" },
  hold: { name: "Hold the Line", text: "Survive until the timer runs out" },
  belts: { name: "Baggage Claim", text: "The floor moves. So does everything on it" },
  overbooked: { name: "Overbooked", text: "Every family showed up at once" },
  convention: { name: "Elite Convention", text: "Fewer enemies. All of them elite" },
  luggage: { name: "Falling Luggage", text: "Watch the circles. Keep moving" },
  surrounded: { name: "Ambush", text: "They come from all sides" },
};
export const TWIST_IDS = Object.keys(TWISTS) as Exclude<TwistId, "">[];

/** The act's home biome. Act three (and every third endless act) mixes both, room by room. */
export function actBiome(w: World, act: number): { biome: Biome; mix: boolean } {
  const start = w.run.biome;
  const other = BIOME_IDS.find((b) => b !== start) ?? start;
  if (act === FINAL_ACT || (act > FINAL_ACT && (act - FINAL_ACT) % 3 === 0)) return { biome: pick(w, BIOME_IDS), mix: true };
  return { biome: act % 2 === 0 ? start : other, mix: false };
}

/** How deep into the run a room is: what the budgets, elites and enemy toughness grow with. */
export const depthOf = (spec: Pick<RoomSpec, "act" | "step">): number => spec.act * (ACT_ROOMS + 1) + spec.step;

/** Enemy health by act: each act is a step up, and endless keeps climbing. */
export function actHp(act: number): number {
  return act <= FINAL_ACT ? 1 + 0.3 * act : 1.6 * Math.pow(1.3, act - FINAL_ACT);
}

/** Enemy damage by act. */
export function actDamage(act: number): number {
  return 1 + 0.15 * Math.min(act, 8);
}

/** Enemies attack faster in later acts (windups and cooldowns). */
export function actHaste(act: number): number {
  return Math.min(1.5, 1 + 0.08 * act);
}

// ---------------------------------------------------------------- waves

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
  ["charger", "charger", "artillery"], // crossfire lanes
  ["bruiser", "splitter", "support"], // a wall that keeps coming
];

/** Per-wave caps that stop dull or unfair mixes (three artillery alone, two healers, …). */
const ROLE_CAP: Partial<Record<Role, number>> = { artillery: 3, support: 1, summoner: 1, ambusher: 2, bruiser: 3, charger: 3 };

/** Pacing curve for a combat room's waves: tense fight, breather, tense again, spike. */
const PACING = [1.0, 0.7, 1.2, 1.5];

/** Layouts by biome (see room.LAYOUTS). */
export const BIOME_LAYOUTS: Record<Biome, { intro: number; combat: number[]; rest: number; boss: number }> = {
  foundry: { intro: 0, combat: [1, 2, 10, 11, 12], rest: 3, boss: 4 },
  caverns: { intro: 5, combat: [6, 7, 13, 14, 15], rest: 8, boss: 9 },
};

function family(biomes: readonly string[], role: Role): EnemyDef[] {
  return Object.values(ENEMIES).filter((d) => d.role === role && d.threatCost > 0 && d.biomes.some((b) => biomes.includes(b)));
}

/** A room's threat budget: grows with how deep the room is, the tier and the party. */
export function roomBudget(depth: number, tier: number, partySize: number): number {
  // Each extra player adds 60% more enemies (their health also scales a little, see partyHpMultiplier).
  return (10 + depth * 3.2) * (1 + tier * 0.35) * (1 + (partySize - 1) * 0.6);
}

/**
 * Share of a wave's budget spent on elite modifiers instead of more enemies (design doc: "Higher difficulty spends
 * part of the budget on elite modifiers"). A few early, more and more as the run goes on.
 */
export function eliteShare(depth: number, tier: number): number {
  return Math.min(0.6, 0.1 + 0.03 * depth + 0.15 * tier);
}

/** What an elite costs against the budget. */
const eliteCost = (def: EnemyDef) => Math.max(2, def.threatCost);

export interface WavePlan {
  enemies: string[];
  /** Ambushers wait in the room as props instead of arriving with the wave. */
  props: string[];
}

export function planWave(w: World, budget: number, biomes: readonly string[] = ["foundry"], avoidTemplate = -1, elites = 0): WavePlan & { template: number } {
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
    const options = family(biomes, role).filter((d) => d.threatCost <= left + 0.5);
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
  for (let tries = 0; tries < 16 && left >= 2; tries++) {
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

/** Every biome's family in a mixed room; just the room's own otherwise. */
const biomesFor = (spec: Pick<RoomSpec, "biome" | "mix" | "twist">): string[] => (spec.mix || spec.twist === "overbooked" ? [...BIOME_IDS] : [spec.biome]);

/** Waves for a director-built fight. Rooms are re-planned on entry when players dropped in or left. */
export function planCombatWaves(w: World, spec: RoomSpec, tier: number, partySize: number): string[][] {
  const depth = depthOf(spec);
  let budget = roomBudget(depth, tier, partySize);
  let elites = eliteShare(depth, tier);
  if (spec.kind === "elite") {
    budget *= 1.25;
    elites = Math.min(0.75, elites + 0.3);
  }
  if (spec.twist === "convention") {
    budget *= 0.9;
    elites = 0.95;
  }
  if (spec.twist === "overbooked") budget *= 1.2;
  let pacing = depth <= 2 ? PACING.slice(0, 3) : PACING;
  if (spec.twist === "rush") pacing = [...pacing, 1.1];
  // Hold the Line spawns in smaller, steady bites until the timer runs out.
  if (spec.twist === "hold") pacing = [0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9];

  const waves: string[][] = [];
  let last = -1;
  pacing.forEach((p, i) => {
    // The very first wave of the run stays plain, so elites show up once you have your feet.
    const share = depth <= 1 && i === 0 && spec.twist !== "convention" ? 0 : elites;
    const plan = planWave(w, budget * p, biomesFor(spec), last, share);
    last = plan.template;
    // Props are marked with a leading "!" so the room can place them hidden at entry.
    waves.push([...plan.enemies, ...plan.props.map((id) => "!" + id)]);
  });
  return waves;
}

/** The boss (or bosses) at the end of an act. The final act brings both at once. */
export function bossWaves(w: World, spec: RoomSpec): string[][] {
  const both = spec.act === FINAL_ACT || (spec.act > FINAL_ACT && spec.mix);
  if (both) return [BIOME_IDS.map((b) => BIOMES[b].boss + "@duo")];
  return [[BIOMES[spec.biome].boss]];
}

/** Turns a door's destination into a room: layout and waves. */
export function planRoom(w: World, spec: RoomSpec, tier: number, partySize: number): RoomPlan {
  const lay = BIOME_LAYOUTS[spec.biome];
  const base = { ...spec, party: partySize };
  switch (spec.kind) {
    case "intro": {
      // The first room of a run is hand-made, so it teaches instead of surprising. Co-op adds a couple of swarmers per friend.
      const b = BIOMES[spec.biome];
      const extra = Array<string>(Math.max(0, partySize - 1) * 2).fill(b.swarmer);
      return { ...base, layout: lay.intro, waves: b.intro.map((wave) => [...wave, ...extra]) };
    }
    case "rest":
    case "shrine":
      return { ...base, layout: lay.rest, waves: [] };
    case "boss":
      return { ...base, layout: lay.boss, waves: bossWaves(w, spec) };
    default:
      return { ...base, layout: pick(w, lay.combat), waves: planCombatWaves(w, spec, tier, partySize) };
  }
}

/** The first room of a run. */
export function firstRoom(w: World): RoomSpec {
  return { kind: "intro", biome: w.run.biome, twist: "", mix: false, act: 0, step: 0 };
}

// ---------------------------------------------------------------- doors

/** What the doors after a normal room can offer, and how often. */
const DOOR_WEIGHTS: Partial<Record<RoomKind, number>> = { combat: 4, elite: 2, event: 2.2, shrine: 1.3, rest: 1.1 };
const FIGHTS: RoomKind[] = ["combat", "elite", "event"];
/** Where doors sit along the top wall, by how many there are. */
const DOOR_X = [[360], [250, 470], [170, 360, 550]];

/** The choices waiting at the top of the room once it's clear. */
export function planDoors(w: World): Door[] {
  const room = w.run.room;
  const here = w.run.plans[room.index]!;
  const place = (specs: (Omit<Door, "x">)[]): Door[] => specs.map((s, i) => ({ ...s, x: DOOR_X[specs.length - 1]![i]! }));

  if (here.kind === "boss") {
    const next = here.act + 1;
    const { biome, mix } = actBiome(w, next);
    const onward: Omit<Door, "x"> = { kind: "combat", biome, mix, twist: "", act: next, step: 0 };
    // From the final boss on, every boss is a chance to fly home with the win.
    return place(here.act >= FINAL_ACT ? [{ ...onward, kind: "home" }, onward] : [onward]);
  }
  const step = here.step + 1;
  const act = here.act;
  const spec = (kind: DoorKind): Omit<Door, "x"> => {
    const { biome, mix } = act === FINAL_ACT || mix0(w, act) ? actBiome(w, act) : { biome: here.biome, mix: here.mix };
    let twist: TwistId = "";
    if (kind === "event" || (kind === "combat" && act >= 1 && rand(w) < 0.2)) twist = pick(w, TWIST_IDS);
    return { kind, biome, mix, twist, act, step };
  };
  if (step >= ACT_ROOMS) return place([spec("boss")]);

  // Two or three different doors, at least one of them a fight.
  const n = rand(w) < 0.55 ? 3 : 2;
  const weights = { ...DOOR_WEIGHTS };
  if (here.kind === "rest") delete weights.rest;
  if (here.kind === "shrine") delete weights.shrine;
  // The room before the boss leans toward getting ready for it.
  if (step === ACT_ROOMS - 1) {
    weights.rest = (weights.rest ?? 0) * 2;
    weights.shrine = (weights.shrine ?? 0) * 1.5;
  }
  if (act === 0 && step <= 1) delete weights.elite;
  const kinds: RoomKind[] = [];
  while (kinds.length < n) {
    const open = (Object.keys(weights) as RoomKind[]).filter((k) => !kinds.includes(k));
    if (open.length === 0) break;
    const total = open.reduce((s, k) => s + weights[k]!, 0);
    let r = rand(w) * total;
    let kind = open[open.length - 1]!;
    for (const k of open) {
      r -= weights[k]!;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    kinds.push(kind);
  }
  if (!kinds.some((k) => FIGHTS.includes(k))) kinds[0] = "combat";
  return place(kinds.map(spec));
}

/** Mixed endless acts pick a biome per room, like the final act. */
const mix0 = (w: World, act: number): boolean => act > FINAL_ACT && actBiome(w, act).mix;

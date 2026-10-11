import type { Element, MakerId } from "../types";

// Mythics: the rarest drops in the game, one tier above legendary. They hit harder than a legendary (see
// MYTHIC.damage), but what sets them apart is one ability that bends a rule everyone else plays by: the thing a
// fresh profile and a maxed one can't otherwise get from each other (design doc: Mythics).
//
// Guns are a base gun plus an ability, like legendaries. Grenades and relics are their own kinds in data/grenades and
// data/relics, flagged `mythic`, and never come from the regular rolls.

export type MythicGunEffect = "swat" | "confiscate" | "service" | "baggage" | "swap";

export interface MythicGunDef {
  id: string;
  name: string;
  flavor: string;
  /** What the ability does, plainly. */
  text: string;
  defId: string;
  maker: MakerId;
  effect: MythicGunEffect;
  /** Fixed element, if the ability wants one. Otherwise it rolls. */
  element?: Element;
}

export const MYTHIC_GUNS: Record<string, MythicGunDef> = {
  return_to_sender: {
    id: "return_to_sender",
    name: "Return to Sender",
    flavor: "No forwarding address. It goes back where it came from.",
    text: "Pellets bat enemy shots and shells back at the shooter, and send charging enemies back where they came from",
    defId: "shotgun",
    maker: "goblin",
    effect: "swat",
  },
  customs_officer: {
    id: "customs_officer",
    name: "Customs Officer",
    flavor: "Anything to declare? Not anymore.",
    text: "Hits confiscate an elite's modifier and strip shield bars",
    defId: "pistol",
    maker: "cruise",
    effect: "confiscate",
  },
  in_flight_service: {
    id: "in_flight_service",
    name: "In-Flight Service",
    flavor: "Something to drink? It's going in either way.",
    text: "Shots pass through allies and heal them. Kills sometimes drop a snack",
    defId: "smg",
    maker: "megamart",
    effect: "service",
  },
  excess_baggage: {
    id: "excess_baggage",
    name: "Excess Baggage",
    flavor: "Over the weight limit. Now it works for you.",
    text: "Enemies it kills get back up as ghosts and fight for you for 8s (not bosses)",
    defId: "launcher",
    maker: "dwarfcorp",
    effect: "baggage",
  },
  boarding_pass: {
    id: "boarding_pass",
    name: "Boarding Pass",
    flavor: "Seat change requested. Request granted.",
    text: "Shots swap your place with the first teammate or enemy they hit, in a blast. Enemies are stunned, teammates shielded, and the shot comes back",
    defId: "sniper",
    maker: "cruise",
    effect: "swap",
  },
};

export const MYTHIC_GUN_IDS = Object.keys(MYTHIC_GUNS);
/** The mythic grenade kinds (their defs live in GRENADES). */
export const MYTHIC_GRENADE_IDS = ["snooze_button", "black_box", "lost_and_found", "duty_free"];

/** How rare they are, and how their abilities are tuned. */
export const MYTHIC = {
  /** Damage on top of a legendary's: mythics are meant to feel overpowered, not just clever. */
  damage: 1.5,
  /** Chance per boss kill on Normal, before anything else. A full Normal adventure has five bosses: ~1.5% a run. */
  bossChance: 0.003,
  /** Elites have a tenth of a boss's chance. */
  eliteChance: 0.0003,
  /** Each tier above Normal adds this much of the base chance (Nightmare is 2.5x). */
  tierStep: 0.75,
  /** Co-op with someone below the dungeon tier's level: reasons to group with newer players. */
  helped: 2,
  /** Bad-luck protection: every boss beaten since your last mythic adds this much of the base chance. */
  pityPerBoss: 0.01,
  /** Snooze Button: how long enemies sleep (any damage wakes them), and how long a boss nods off. */
  sleepS: 10,
  bossDozeS: 1.2,
  /** Black Box: seconds until it rewinds the health of everyone it caught. */
  rewindS: 4,
  /** Return to Sender: how far past a pellet's own size it reaches for enemy shots. */
  swatReach: 5,
  /** In-Flight Service: health per bullet that passes through an ally, and the snack its kills sometimes drop. */
  serviceHeal: 3,
  snackChance: 0.25,
  snackHeal: 10,
  /** Excess Baggage: ghosts last this long, at most this many at once, biting this hard this often. */
  ghost: { seconds: 8, max: 3, bite: 10, biteS: 0.5, speed: 1.3 },
  /**
   * Boarding Pass: a moment of safety after a swap; the Turbulence blast (a share of the shot's damage) where the
   * enemy lands or where you arrive at a teammate's side; the enemy's jet lag; the teammate's shield.
   */
  swapIframes: 0.6,
  swap: { blast: 1, radius: 45, knockback: 200, stunS: 2, shield: 25 },
  /** Lost & Found: how long enemies stay misplaced, how dazed they turn up, and how long a boss staggers. */
  lostS: 6,
  foundDazeS: 1.5,
  bossStaggerS: 0.8,
  /** Duty Free: how long the tag lasts, and how much luckier its extra gun is. */
  dutyS: 5,
  dutyLuck: 0.6,
  /** Life Vest: the safety after it saves you, and the blast that clears some room. */
  vest: { iframes: 1.5, radius: 60, damage: 20, knockback: 320 },
  /** World Clock: how far from where you dashed, how much slower, for how long. Bosses only feel part of it. */
  clock: { radius: 70, slow: 0.8, bossSlow: 0.4, seconds: 3 },
  /** Plus-One: how far from the first grenade the second one lands. */
  plusOneSpread: 30,
};

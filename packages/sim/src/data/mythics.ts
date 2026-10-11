import type { Element, MakerId } from "../types";

// Mythics: the rarest drops in the game, one tier above legendary. They hit harder than a legendary (see
// MYTHIC.damage), but what sets them apart is one ability that bends a rule everyone else plays by: the thing a
// fresh profile and a maxed one can't otherwise get from each other (design doc: Mythics).
//
// Guns are a base gun plus an ability, like legendaries. Grenades are their own kinds in data/grenades, flagged
// `mythic`, and never come from the regular grenade roll.

export type MythicGunEffect = "swat" | "confiscate";

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
    text: "Pellets bat enemy shots back at whoever fired them",
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
};

export const MYTHIC_GUN_IDS = Object.keys(MYTHIC_GUNS);
/** The mythic grenade kinds (their defs live in GRENADES). */
export const MYTHIC_GRENADE_IDS = ["snooze_button", "black_box"];

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
};

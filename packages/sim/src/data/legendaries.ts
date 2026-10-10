import type { Element, MakerId } from "../types";

export type LegendaryEffect = "boomerang" | "rockets" | "fireLine" | "ricochet" | "cluster" | "moodRing";

export interface LegendaryDef {
  id: string;
  name: string;
  /** Every legendary is one rule-breaking effect with a gag (design doc: Legendaries). */
  flavor: string;
  /** What the effect does, plainly. */
  text: string;
  defId: string;
  maker: MakerId;
  effect: LegendaryEffect;
  /** Fixed element, if the effect needs one. Otherwise it rolls. */
  element?: Element;
}

export const LEGENDARIES: Record<string, LegendaryDef> = {
  the_ex: {
    id: "the_ex",
    name: "The Ex",
    flavor: "Always comes back. Always.",
    text: "Pellets fly out, then return like boomerangs",
    defId: "shotgun",
    maker: "goblin",
    effect: "boomerang",
  },
  overachiever: {
    id: "overachiever",
    name: "Overachiever",
    flavor: "Every 10th bullet is a homing rocket. It tries its best.",
    text: "Every 10th bullet is a homing rocket",
    defId: "smg",
    maker: "megamart",
    effect: "rockets",
  },
  hot_take: {
    id: "hot_take",
    name: "Hot Take",
    flavor: "Leaves a line of fire. Opinions were had.",
    text: "Shots leave a burning line on the ground",
    defId: "sniper",
    maker: "dwarfcorp",
    effect: "fireLine",
    element: "fire",
  },
  show_off: {
    id: "show_off",
    name: "Show-Off",
    flavor: "Every hit ricochets to another enemy. It wants you to watch.",
    text: "Each shot jumps between up to 4 enemies",
    defId: "pistol",
    maker: "wizard",
    effect: "ricochet",
  },
  party_favor: {
    id: "party_favor",
    name: "Party Favor",
    flavor: "Explodes into confetti. The confetti also explodes.",
    text: "Shells burst into four bomblets",
    defId: "launcher",
    maker: "goblin",
    effect: "cluster",
  },
  mood_ring: {
    id: "mood_ring",
    name: "Mood Ring",
    flavor: "Changes element every shot. It's going through something.",
    text: "Cycles fire, shock, frost and acid, shot by shot",
    defId: "pistol",
    maker: "arcane",
    effect: "moodRing",
  },
};

export const LEGENDARY_IDS = Object.keys(LEGENDARIES);
export const MOOD_CYCLE: Element[] = ["fire", "shock", "frost", "acid"];

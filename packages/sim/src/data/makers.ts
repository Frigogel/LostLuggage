import type { MakerId } from "../types";

export interface MakerDef {
  id: MakerId;
  name: string;
  /** Short name for tight HUD spots. */
  short: string;
  /** What you notice when you fire one. */
  quirk: string;
  flavor: string;
  /** Drop weight. The cruise line's own guns never drop: they're the starter kit. */
  weight: number;
}

/** Manufacturers give every gun a quirk you can spot at a glance (design doc: Loot system). Stats live in loot.gunStats. */
export const MAKERS: Record<MakerId, MakerDef> = {
  cruise: {
    id: "cruise",
    name: "Cruise Line Standard Issue",
    short: "CRUISE",
    quirk: "No surprises",
    flavor: "Please return to the gift shop after use.",
    weight: 0,
  },
  dwarfcorp: {
    id: "dwarfcorp",
    name: "Dwarfcorp Heavy Industries",
    short: "DWARFCORP",
    quirk: "Fewer pips, much bigger shots",
    flavor: "Measure twice. Shoot once. Hard.",
    weight: 1,
  },
  arcane: {
    id: "arcane",
    name: "Arcane Electric Co.",
    short: "ARCANE",
    quirk: "Always elemental, weaker base damage",
    flavor: "Now with 40% more magic smoke.",
    weight: 1,
  },
  goblin: {
    id: "goblin",
    name: "Goblin Surplus",
    short: "GOBLIN",
    quirk: "Extra shots in a messy spread",
    flavor: "Held together with tape and optimism.",
    weight: 1,
  },
  wizard: {
    id: "wizard",
    name: "Wizard Labs",
    short: "WIZARD",
    quirk: "Shots bounce and curve toward enemies",
    flavor: "The bullets went to university.",
    weight: 1,
  },
  megamart: {
    id: "megamart",
    name: "Mega-Mart Blasters",
    short: "MEGA-MART",
    quirk: "Huge ammo bar, slow reload",
    flavor: "Buy one, spray forever.",
    weight: 1,
  },
};

export const MAKER_IDS = Object.keys(MAKERS) as MakerId[];

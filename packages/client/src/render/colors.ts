import type { Defense, Element, Rarity } from "@lostluggage/sim";

export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xe8e8e8,
  uncommon: 0x5fd36a,
  rare: 0x4aa3ff,
  epic: 0xb46cff,
  legendary: 0xff9a2a,
};

export const ELEMENT_COLORS: Record<Element, number> = {
  none: 0xfff6c8,
  fire: 0xff7a1a,
  shock: 0x7ad7ff,
  frost: 0xd6f4ff,
  acid: 0x7ee05a,
};

/** Health bar colors per defense, matching the doc: shields blue, armor yellow, flesh red. */
export const DEFENSE_COLORS: Record<Defense, number> = { flesh: 0xe0533d, armor: 0xf2c14e, shield: 0x5fb3ff };
export const SHIELD_COLOR = 0x5fb3ff;

/** Particle colors for each enemy's death burst. */
export const ENEMY_COLORS: Record<string, number[]> = {
  cone_rat: [0x8a7f7a, 0xff7a1a, 0xffffff],
  jet_boar: [0x8a5a3c, 0xa7b0bb, 0xffb238],
  mortar_beetle: [0x3e8f5a, 0x8fd18f, 0xa7b0bb],
  slag_golem: [0x6d5f66, 0x8f8088, 0xff7a1a],
  acid_slime: [0x7ee05a, 0x4fa63a, 0xff7a1a],
  hover_wizard: [0x8c5ad1, 0x3b6fd1, 0xf2c14e],
  rat_crate: [0xb5773f, 0xcf9152, 0x8a7f7a],
  vending_mimic: [0xd1423a, 0xffffff, 0xf2c14e],
  molten_blob: [0xff7a1a, 0xffc14a, 0xc23b22],
  blobling: [0xff7a1a, 0xffc14a],
  furnace_foreman: [0x6d7682, 0xf2c14e, 0xff7a1a],
};

export const toCss = (c: number) => "#" + c.toString(16).padStart(6, "0");

import type { Defense, EliteId, Element, Rarity } from "@lostluggage/sim";

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
  waiter_penguin: [0x22283a, 0xffffff, 0xf2a23a],
  yeti_bouncer: [0xffffff, 0xcfd8e3, 0x2a2f3a],
  curling_golem: [0x8a93a3, 0xe0533d, 0xf2c14e],
  frost_slime: [0x7ad7ff, 0x4aa3d8, 0xffffff],
  ski_instructor: [0x2ab0a0, 0xe0533d, 0xf2c14e],
  penguin_igloo: [0xffffff, 0xcfe8ff, 0x22283a],
  ice_machine: [0xa8c8d8, 0x9ff3ff, 0xffffff],
  snowman: [0xffffff, 0xcfe8ff, 0xff7a1a],
  snowball: [0xffffff, 0xcfe8ff],
  complaint_dragon: [0x6fa8dc, 0xcfe8ff, 0xf4ecd8],
  sewer_roach: [0x7a4a2a, 0xc89a6a, 0x4e2e1a],
  plunger_ogre: [0x7a9a4a, 0x3a5a8a, 0xe0533d],
  sewer_eel: [0x3a8a7a, 0xf2c14e, 0x9ff3ff],
  spitting_toad: [0x5e9a4a, 0xf2e08a, 0xe05a9a],
  sludge_slime: [0x8a8a3a, 0xc8c86a, 0x5e5e2a],
  drain_shaman: [0x8a5a2a, 0x7fbf4a, 0x5fd3e8],
  roach_motel: [0xf2c14e, 0xe0533d, 0x7a4a2a],
  toilet_mimic: [0xffffff, 0xa7b0bb, 0xe0533d],
  fatberg: [0xd8c890, 0xa8985a, 0xf4ecd8],
  fatberglet: [0xd8c890, 0xf4ecd8],
  lost_found_gator: [0x5e9a4a, 0xa8c87a, 0x3b6fd1],
  roomba_drone: [0xa7b0bb, 0x5fd3e8, 0xe0533d],
  security_mech: [0xa7b0bb, 0x6d7682, 0x5fd3e8],
  rocket_cart: [0x3b6fd1, 0xa7b0bb, 0xffb238],
  dish_crab: [0xe0533d, 0xc9cfd6, 0x5fd3e8],
  gray_goo: [0x8a93a3, 0x9ff3ff, 0x5a6270],
  holo_concierge: [0x5fd3e8, 0x9ff3ff, 0xffffff],
  drone_dock: [0xa7b0bb, 0xf2c14e, 0x5fd3e8],
  cryo_pod: [0xa7b0bb, 0x9ff3ff, 0xe0533d],
  space_blob: [0xb46cff, 0x7a3ac8, 0x5fd36a],
  blob_spawn: [0xb46cff, 0x5fd36a],
  autopilot: [0xc9cfd6, 0x5fd3e8, 0xe0533d],
};

/** Elite auras and tags: each modifier has its own color, so a glance tells you what you're dealing with. */
export const ELITE_COLORS: Record<EliteId, number> = {
  shielded: 0x5fb3ff,
  splitting: 0x7ee05a,
  teleporting: 0xb46cff,
  vengeful: 0xff6a3c,
  linked: 0xf2c14e,
  hasted: 0xffffff,
};

/** Party colors by slot: name tags, HUD and arrows. */
export const SLOT_COLORS = [0x5fb3ff, 0xff6a5a, 0x5fd36a, 0xd29bff];
/** Armor recolors for each slot's hero sprite (body, body shade, plume). */
export const SLOT_PALETTES = [
  { b: "#3b6fd1", B: "#274a94", r: "#e0533d" },
  { b: "#d1423a", B: "#8f2a26", r: "#f2c14e" },
  { b: "#3e9f5a", B: "#2a6b3d", r: "#f2c14e" },
  { b: "#8c5ad1", B: "#5d3a94", r: "#5fd3e8" },
];

export const toCss =(c: number) => "#" + c.toString(16).padStart(6, "0");

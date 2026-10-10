// Placeholder pixel art drawn in code, so the prototype needs no asset packs.
// Each sprite is rows of palette characters; "." is transparent. All sprites face right.

type Palette = Record<string, string>;

const BASE: Palette = {
  k: "#1b1020", // outline
  W: "#ffffff",
};

interface PixelSprite {
  palette: Palette;
  rows: string[];
}

export const SPRITES: Record<string, PixelSprite> = {
  vanguard: {
    palette: { r: "#e0533d", s: "#c9cfd6", d: "#7a8494", v: "#2a2f3a", w: "#b9c2c9", c: "#5fd3e8", b: "#3b6fd1", B: "#274a94", y: "#f2c14e" },
    rows: [
      ".....rr.....",
      "....krrk....",
      "...kssssk...",
      "..kssssssk..",
      "..ksvvvvsk..",
      "..kssssssk..",
      "kwwkkbbbbk..",
      "kwcwkbybbsk.",
      "kwcwkbbbbsk.",
      "kwwwkbbbbk..",
      "kwwwkBBBBk..",
      ".kkkdk..dk..",
      "....dk..dk..",
      "....kk..kk..",
    ],
  },
  // The other heroes use the same b/B/r keys as the Vanguard, so party-slot recolors work on all of them.
  gunslinger: {
    palette: { n: "#9a6a42", N: "#6e4a2c", f: "#f0c8a0", e: "#1b1020", r: "#e0533d", b: "#3b6fd1", B: "#274a94", y: "#f2c14e", d: "#5e3a26" },
    rows: [
      "....nnnn....",
      "...nNNNNn...",
      ".nnnnnnnnnn.",
      "...kffffk...",
      "..fkfffek...",
      "...kffffk...",
      "...krrrrk...",
      "..kbbbbbbk..",
      ".kbbbybbbbk.",
      ".kbBbbbbBbk.",
      "..kBBBBBBk..",
      "...kdk.kdk..",
      "...kdk.kdk..",
      "...kkk.kkk..",
    ],
  },
  tinker: {
    palette: { g: "#7fbf4a", G: "#5a8f32", c: "#5fd3e8", e: "#1b1020", r: "#e0533d", b: "#3b6fd1", B: "#274a94", y: "#f2c14e", d: "#5a6270" },
    rows: [
      "....kkkkk...",
      "...kgggggk..",
      "..kgcckcckk.",
      "gkkgcckcckkg",
      ".kGgggggggk.",
      "..kgggegek..",
      "...krrrrk...",
      "..kbbbbbbk..",
      ".kbWbybbbbk.",
      ".kbbbbbbbbk.",
      "..kBBBBBBk..",
      "..kdk..kdk..",
      "..kdk..kdk..",
      "..kkk..kkk..",
    ],
  },
  warden: {
    palette: { n: "#8a5a3c", l: "#5fd36a", f: "#f0c8a0", e: "#1b1020", r: "#e0533d", b: "#3b6fd1", B: "#274a94" },
    rows: [
      "..n......n..",
      "..nl....ln..",
      "...nkkkkn...",
      "..kbbbbbbk..",
      "..kbffffbk..",
      "..kbffefbk..",
      "..kbffffbk..",
      ".kbbrrrrbbk.",
      ".kbbbbbbbbk.",
      "kbbBbbbbBbbk",
      "kbbBbbbbBbbk",
      ".kBBBBBBBBk.",
      "..kfk..kfk..",
      "..kkk..kkk..",
    ],
  },
  turret: {
    palette: { m: "#a7b0bb", M: "#6d7682", c: "#5fd3e8", d: "#3a3a46" },
    rows: [
      "....kkkkk...",
      "...kmmmmmkkk",
      "..kmMmmmmmmm",
      "..kmmcmmmkkk",
      "..kmmmmmmk..",
      "...kWkkkk...",
      "....kdk.....",
      "...kdkdk....",
      "..kdk.kdk...",
      ".kdk...kdk..",
      ".kk.....kk..",
    ],
  },
  owl: {
    palette: { o: "#a87a4a", O: "#7a5432", e: "#1b1020", y: "#f2c14e", m: "#a7b0bb", c: "#5fd3e8" },
    rows: [
      ".kkkkkkkk.",
      "....kk....",
      ".kkkkkkkk.",
      "kooWooWook",
      "koWeooWeok",
      "kooooyooOk",
      ".kooooooOk",
      "..kmcmmk..",
      "...k..k...",
    ],
  },
  cone_rat: {
    palette: { o: "#ff7a1a", g: "#8a7f7a", G: "#5e5450", e: "#1b1020", p: "#f29bb0" },
    rows: [
      "........o...",
      ".......ooo..",
      ".......WWW..",
      "......ooooo.",
      "...kkkgggggk",
      "..kggggggegp",
      "pkgggggggggk",
      "p.kGGgGGgkk.",
      "...k.k.k.k..",
    ],
  },
  jet_boar: {
    palette: { m: "#a7b0bb", M: "#6d7682", n: "#8a5a3c", N: "#5e3a26", t: "#f4ecd8", e: "#1b1020", h: "#e8a0a0", f: "#ffb238" },
    rows: [
      "..mmm.........",
      ".kmMmkkkkkk...",
      ".kmMmknnnnnk..",
      ".kmMmknnnnnnk.",
      "fkkkkknnnnenhk",
      "ff.knnnnnnnnhh",
      "f..knnnnnnnnt.",
      "...kNNNNNNNNkt",
      "....kNk..kNk..",
      "....kk....kk..",
    ],
  },
  mortar_beetle: {
    palette: { q: "#3e8f5a", Q: "#2a6140", l: "#8fd18f", m: "#a7b0bb", M: "#6d7682", a: "#3a3a46", e: "#f2c14e" },
    rows: [
      "......mm....",
      ".....kmMk...",
      ".....kmMk...",
      "...kkkmMkkk.",
      "..klqqqqqqqk",
      ".klqqqQqqqqk",
      "kkqqqQqqqQqk",
      "kqqQqqqqQqek",
      ".kkkkkkkkkk.",
      "..a.a..a.a..",
    ],
  },
  gun_pistol: {
    palette: { m: "#c9cfd6", d: "#5a6270", y: "#ff5c8a" },
    rows: ["dmmmmmy", ".dd....", ".d....."],
  },
  gun_shotgun: {
    palette: { m: "#c9cfd6", d: "#5a6270", n: "#9a6a42" },
    rows: ["nnndmmmmmm", "nn..dd....", "n........."],
  },
  gun_smg: {
    palette: { m: "#2a2f3a", y: "#f2c14e", d: "#5a6270" },
    rows: ["dymymymym", "ddddd....", ".d..d....", "....d...."],
  },
  gun_sniper: {
    palette: { m: "#c9cfd6", d: "#5a6270", n: "#9a6a42", c: "#5fd3e8" },
    rows: ["...dccd......", "nnndmmmmmmmmm", "nn..d........", "n............"],
  },
  gun_launcher: {
    palette: { m: "#4e8a4e", M: "#356535", r: "#e0533d", d: "#5a6270" },
    rows: [".mmmmmmmmm.", "rMMMMMMMMMr", ".mmmmmmmmm.", "...d..d....", "...d......."],
  },
  grenade: {
    palette: { g: "#4e8a4e", G: "#356535", y: "#f2c14e" },
    rows: [".yy.", "gggg", "gGgg", ".gg."],
  },
  mortar_shell: {
    palette: { o: "#ff9a3c", y: "#ffe08a", r: "#c23b22" },
    rows: [".rr.", "royr", "royr", ".rr."],
  },
  shell: {
    palette: { m: "#c9cfd6", r: "#e0533d" },
    rows: [".mm.", "mrrm", "mrrm", ".mm."],
  },
  pedestal: {
    palette: { m: "#59606e", M: "#3c4250", y: "#f2c14e", s: "#8a93a3" },
    rows: [
      "..ssssssssss..",
      ".smmmmmmmmmms.",
      "kyMyMyMyMyMyMk",
      "kMMMMMMMMMMMMk",
      ".kkkkkkkkkkkk.",
    ],
  },
  slag_golem: {
    palette: { g: "#4a3f45", G: "#6d5f66", l: "#8f8088", o: "#ff7a1a" },
    rows: [
      "....kkkkkkk.....",
      "...kGGGGGGGk....",
      "..kGlGGGGGGGk...",
      "..kGGoGGGoGGk...",
      "..kGGGGGGGGGk...",
      ".kkGGoooooGGkk..",
      "kGGkGGGGGGGkGGk.",
      "kGlkGGoGGGGkGlk.",
      "kGGkGGGoGGGkGGk.",
      "kGGkgGGGGGgkGGk.",
      ".kk.kgggggk.kk..",
      "....kGGkGGk.....",
      "...kGGk.kGGk....",
      "...kggk.kggk....",
      "...kkk...kkk....",
    ],
  },
  acid_slime: {
    palette: { o: "#ff7a1a", a: "#7ee05a", A: "#4fa63a", e: "#1b1020" },
    rows: [
      ".....o......",
      "....ooo.....",
      "....WWW.....",
      "...ooooo....",
      "..kkaaaakk..",
      ".kaaAaaaaak.",
      "kaaeaaaeaaak",
      "kaaaaaaaaaak",
      "kAaaaaaaaAak",
      ".kkkkkkkkkk.",
    ],
  },
  hover_wizard: {
    palette: { p: "#8c5ad1", y: "#f2c14e", f: "#f0c8a0", b: "#3b6fd1", m: "#a7b0bb", r: "#ff7a1a", e: "#1b1020" },
    rows: [
      ".....pp.....",
      "....pppp....",
      "...ppypp....",
      "..pppppppp..",
      "...kffffk...",
      "...kfefek...",
      "..mkWWWWk...",
      "..mkWWWWWk..",
      ".mmkbbybbk..",
      ".mmkbbbbbk..",
      ".m.kbbbbbbk.",
      "...kbbbbbbk.",
      "..r.kkkkkk..",
      ".ryr........",
      "..r.........",
    ],
  },
  rat_crate: {
    palette: { n: "#b5773f", N: "#cf9152", r: "#e0533d", e: "#ffe08a", c: "#5fd3e8", p: "#f29bb0" },
    rows: [
      "kkkkkkkkkkkkkkkkkk",
      "knnnnnnnnnnnnnnnnk",
      "knNNNNNNNNNNNNNNnk",
      "knnnnnnnnnnnnnnnnk",
      "kkkkkkkkkkkkkkkkkk",
      "knnnnnnnnnnnnnnnnk",
      "knkkkkkkkkkkkkkknk",
      "knkrekkkkkkkrekknk",
      "knkkkkkkkkkkkkkknk",
      "knnnnnnnnnnnnnnnnk",
      "kkkkkkkkkkkkkkkkkk",
      "knnnnnnnnnnnnnnnnk",
      "knNNNcccccNNNNNNnk",
      "knnnnnnnnnnnnnnnnk",
      "kkkkkkkkkkkkkkkkkk",
      "pp................",
      ".pp...............",
    ],
  },
  vending_hidden: {
    palette: { r: "#d1423a", R: "#8c2a24", y: "#f2c14e", o: "#ff7a1a", g: "#5fd36a", b: "#4aa3ff", M: "#a7b0bb" },
    rows: [
      "kkkkkkkkkkkkkk",
      "krrrrrrrrrrrrk",
      "krWWWWWWWWWWrk",
      "krrrrrrrrrrrrk",
      "krkkkkkkkkrrrk",
      "krkyogyobkrMrk",
      "krkkkkkkkkrMrk",
      "krkgbyogykrrrk",
      "krkkkkkkkkrMrk",
      "krkobgyyokrMrk",
      "krkkkkkkkkrrrk",
      "krkyygobgkrkrk",
      "krkkkkkkkkrrrk",
      "krrrrrrrrrrrrk",
      "krkkkkkkkkkkrk",
      "krkkkkkkkkkkrk",
      "krrrrrrrrrrrrk",
      "kRRRRRRRRRRRRk",
      "kkkkkkkkkkkkkk",
    ],
  },
  vending_mimic: {
    palette: { r: "#d1423a", R: "#8c2a24", e: "#ffe08a", p: "#4a1020", t: "#f29bb0" },
    rows: [
      "kkkkkkkkkkkkkk",
      "krrrrrrrrrrrrk",
      "krWWWWWWWWWWrk",
      "krrrrrrrrrrrrk",
      "krreerrrreerrk",
      "krrekrrrrekrrk",
      "krrrrrrrrrrrrk",
      "kkWkWkWkWkWkWk",
      "kppppppppppppk",
      "kpppttttpppppk",
      "kppppppppppppk",
      "kWkWkWkWkWkWkk",
      "krrrrrrrrrrrrk",
      "krrrrrrrrrrrrk",
      "krkkkkkkkkkkrk",
      "krrrrrrrrrrrrk",
      "kRRRRRRRRRRRRk",
      ".kk........kk.",
      ".kk........kk.",
    ],
  },
  molten_blob: {
    palette: { o: "#ff7a1a", y: "#ffc14a", R: "#c23b22", c: "#5a2a22", e: "#1b1020" },
    rows: [
      ".....kkkk.....",
      "...kkoyyokk...",
      "..kooyyyyook..",
      ".koooyyoooocRk",
      ".kooeoooeoocRk",
      "kooooooooooRRk",
      "koRoooooooRook",
      "kRooooooooooRk",
      "kRRoooooooRRRk",
      ".kRRRRRRRRRRk.",
      "..kkkkkkkkkk..",
    ],
  },
  blobling: {
    palette: { o: "#ff7a1a", y: "#ffc14a", R: "#c23b22", e: "#1b1020" },
    rows: [
      "..kkkk..",
      ".koyyok.",
      "koeooeok",
      "kooooooR",
      "kRooooRk",
      ".kkkkkk.",
    ],
  },
  furnace_foreman: {
    palette: { h: "#f2c14e", M: "#6d7682", m: "#4a525e", e: "#ff7a1a", o: "#ff7a1a", y: "#ffc14a", C: "#3a3a46" },
    rows: [
      "..........hhhhhhh...........",
      ".........hhhhhhhhh..........",
      "........khhhhhhhhhk.........",
      ".......khhhhhhhhhhhk........",
      "......kkkkkkkkkkkkkkk.......",
      ".......kMMMMMMMMMMMk........",
      ".......kMeeMMMMMeeMk........",
      ".......kMMMMMMMMMMMk........",
      ".......kMMkkkkkkkMMk........",
      "....kkkkkMMMMMMMMMkkkkk.....",
      "...kMMMMkMMMMMMMMMkMMMMk....",
      "..kMMmmMkMkkkkkkkMkMmmMMk...",
      "..kMmmMkkMkoyoyokMkkMmmMk...",
      "..kMMMk.kMkyoyoykMk.kMMMk...",
      "..kMMk..kMkoyoyokMk..kMMk...",
      "..kMMk..kMkkkkkkkMk..kWWWk..",
      "..kCCk..kMMMMMMMMMk..kWkWk..",
      "..kCCk..kMMMMMMMMMk..kWWWk..",
      "...kk...kmmmmmmmmmk...kkk...",
      ".........kMMk.kMMk..........",
      ".........kMMk.kMMk..........",
      "........kMMMk.kMMMk.........",
      "........kkkkk.kkkkk.........",
    ],
  },
  shrine: {
    palette: { y: "#f2c14e", Y: "#b5862a", s: "#8a93a3", S: "#5a6270", c: "#9ff3ff" },
    rows: [
      "....kkkk....",
      "...kyyyyk...",
      "...kycyyk...",
      "...kyyyyk...",
      "....kYYk....",
      "...kyyyyk...",
      "..kyyyyyyk..",
      "..kYyyyyYk..",
      "...kYYYYk...",
      "..kssssssk..",
      ".kSSSSSSSSk.",
      ".kkkkkkkkkk.",
    ],
  },
  suitcase: {
    palette: { b: "#3b6fd1", B: "#274a94", y: "#f2c14e", t: "#f4ecd8", r: "#e0533d" },
    rows: [
      "......kkkk......",
      ".....k....k.....",
      "kkkkkkkkkkkkkkkk",
      "kbbbbbbbbbbbbbbk",
      "kbtttbbbbbbrrrbk",
      "kbtttbbyybbrrrbk",
      "kBBBBBByyBBBBBBk",
      "kbbbbbbbbbbbbbbk",
      "kbbbbbbbbbbbbbbk",
      "kBBBBBBBBBBBBBBk",
      "kkkkkkkkkkkkkkkk",
    ],
  },
  suitcase_open: {
    palette: { b: "#3b6fd1", B: "#274a94", y: "#f2c14e", s: "#c9cfd6", d: "#2a2f3a" },
    rows: [
      "kkkkkkkkkkkkkkkk",
      "kbbbbbbbbbbbbbbk",
      "kBBBBBBBBBBBBBBk",
      "kkkkkkkkkkkkkkkk",
      "kddddddddddddddk",
      "kdsdddddddddsddk",
      "kddddddWdddddddk",
      "kbbbbbbbbbbbbbbk",
      "kBBBBBBBBBBBBBBk",
      "kkkkkkkkkkkkkkkk",
    ],
  },
  snack: {
    palette: { p: "#f29bb0", P: "#d9708f", d: "#c8915a", y: "#f2c14e", c: "#5fd3e8" },
    rows: [".kkkkk.", "kpypcpk", "kPpddpk", "kpd.dPk", "kPpddpk", "kdPpPdk", ".kkkkk."],
  },

  // ---------------------------------------------------------------- Frozen Caverns
  waiter_penguin: {
    palette: { p: "#22283a", y: "#f2a23a", e: "#1b1020", t: "#c9cfd6" },
    rows: [
      "....kkk...",
      "...kpppk..",
      "...kpWey..",
      "..kppWWk..",
      "..kpWWWk..",
      "ttkpWWWk..",
      "..kpWWpk..",
      "..kppppk..",
      "...yk.yk..",
    ],
  },
  yeti_bouncer: {
    palette: { w: "#cfd8e3", b: "#2a2f3a", y: "#f2c14e", m: "#8a93a3" },
    rows: [
      "....kkkkkk......",
      "...kWWWWWWk.....",
      "..kWWWWWWWWk....",
      "..kWkkkWkkkk....",
      "..kWWWWWWWWk....",
      ".kkWWWmmmWWkk...",
      "kWWkWWWWWWkWWk..",
      "kWwkbbbbbbkwWk..",
      "kWwkbbybbbkwWk..",
      "kWWkbbbbbbkWWk..",
      ".kk.kbbbbk.kk...",
      "....kWWkWWk.....",
      "...kWWk.kWWk....",
      "...kwwk.kwwk....",
      "...kkk...kkk....",
    ],
  },
  curling_golem: {
    palette: { s: "#8a93a3", S: "#5a6270", r: "#e0533d", e: "#1b1020", Y: "#f2c14e" },
    rows: [
      "....kkkk......",
      "....krrk......",
      "...kkrrkk.....",
      ".kkssssssskk..",
      "kssSsssssSssk.",
      "ksssesssssesk.",
      "kYYYYYYYYYYYk.",
      "kssssssssssssk",
      ".kSSSSSSSSSSk.",
      "..kkkkkkkkkk..",
    ],
  },
  frost_slime: {
    palette: { r: "#e0533d", a: "#7ad7ff", A: "#4aa3d8", e: "#1b1020" },
    rows: [
      "........r...",
      ".......r....",
      "......r.....",
      "..kkaaaakk..",
      ".kaaAaaaaak.",
      "kaaeaaaeaaak",
      "kaaaaaaaaaak",
      "kAaaaaaaaAak",
      ".kkkkkkkkkk.",
    ],
  },
  ski_instructor: {
    palette: { p: "#e0533d", y: "#ffffff", f: "#f0c8a0", b: "#2ab0a0", m: "#f2c14e", r: "#5fd3e8", e: "#1b1020", c: "#5fd3e8" },
    rows: [
      ".....yy.....",
      "....pppp....",
      "...pppppp...",
      "..pppppppp..",
      "...kccccck..",
      "...kfffek...",
      "..mkbbbbk...",
      "..mkbbbbbk..",
      ".mmkbbybbk..",
      ".mmkbbbbbk..",
      ".m.kbbbbbbk.",
      "...kbbbbbbk.",
      "....kk.kk...",
      "mmmmmmmmmmmm",
    ],
  },
  penguin_igloo: {
    palette: { w: "#cfe8ff", p: "#22283a", e: "#ffffff", y: "#f2a23a" },
    rows: [
      "......kkkkkk......",
      "....kkWWWWWWkk....",
      "...kWWwWWWWwWWk...",
      "..kWWWWWWWWWWWWk..",
      ".kwWWWwWWWWwWWWWk.",
      ".kWWWWWWWWWWWWWWk.",
      "kWWwWWkkkkkkWWwWWk",
      "kWWWWkppppppkWWWWk",
      "kWWWWkpepepykWWWWk",
      "kwWWWkppppppkWWwWk",
      "kWWWWkppppppkWWWWk",
      "kkkkkkkkkkkkkkkkkk",
    ],
  },
  snowman: {
    palette: { w: "#cfe8ff", o: "#ff7a1a", n: "#9a6a42", N: "#6e4a2c", e: "#1b1020" },
    rows: [
      ".....kkkk.....",
      "....kWWWWk....",
      "....kWeWek....",
      "....kWWoook...",
      ".....kWWk.....",
      "...kkWWWWkk...",
      "..knWWWWWWnk..",
      "..knWWeWWWnk..",
      "..knWWWWWWnk..",
      ".knNWWWWWWNnk.",
      ".knNWWeWWWNnk.",
      ".knNwWWWWwNnk.",
      "..kkkkkkkkkk..",
    ],
  },
  snowball: {
    palette: { w: "#cfe8ff", e: "#1b1020" },
    rows: ["..kkkk..", ".kWWWWk.", "kWeWWeWk", "kWWWWWWw", "kwWWWWwk", ".kkkkkk."],
  },
  complaint_dragon: {
    palette: { b: "#6fa8dc", B: "#cfe8ff", e: "#e0533d", y: "#f4ecd8", N: "#5a6270", c: "#9ff3ff" },
    rows: [
      "..........kk....kk............",
      "..........kck..kck............",
      ".........kbbbkkbbbk...........",
      "........kbbbbbbbbbbk..........",
      "........kbbebbbbebbk..........",
      "........kbbbbbbbbbbbkkk.......",
      "........kbbbbbbbbbbbbbbk......",
      ".........kbbbbkkkkkbbbbk......",
      "..........kbbk..cc.kkkk.......",
      "...kk.....kbbbk...............",
      "..kbbk...kbbbbbk..............",
      ".kbbbbk.kbbBBBbbk.............",
      "kbbBBbbkbbBBBBBbbk..kkkkk.....",
      "kbBBBBbbbbBBBBBBbbkkyyyyyk....",
      "kbBBkBbbbbBBBBBBbbbkyNNNyk....",
      ".kbk.kbbbbBBBBBBbbbkyyyyyk....",
      "..k...kbbbBBBBBBbbbkyNNNyk....",
      "......kbbbbBBBBbbbbkyyyyyk....",
      ".......kbbbbbbbbbbk.kkkkk.....",
      "........kbbk..kbbk............",
      "........kbbk..kbbk............",
      ".......kbbbk..kbbbk...........",
      ".......kkkkk..kkkkk...........",
    ],
  },
};

// Recolors of existing shapes.
SPRITES.ice_hidden = {
  rows: SPRITES.vending_hidden!.rows,
  palette: { r: "#a8c8d8", R: "#6a8ca0", y: "#e8f8ff", o: "#cfe8ff", g: "#9ff3ff", b: "#7ad7ff", M: "#5a6270" },
};
SPRITES.ice_machine = {
  rows: SPRITES.vending_mimic!.rows,
  palette: { r: "#a8c8d8", R: "#6a8ca0", e: "#9ff3ff", p: "#1b3040", t: "#cfe8ff" },
};

/** The biome-specific look of the rooms. */
export const BIOME_ART = {
  foundry: { sea: ["#5a0f12", "#8c1d14", "#c8401a", "#f07a22", "#ffc14a"], glow: 0xff7a1a, ambient: [0xffb238, 0xff7a1a, 0xffe08a], fade: [27, 16, 32] },
  caverns: { sea: ["#0c1a2e", "#14304a", "#1f4a6e", "#3a7aa8", "#9fd8ff"], glow: 0x5fb3ff, ambient: [0xffffff, 0xcfe8ff, 0x9ff3ff], fade: [12, 20, 36] },
} as const;

export function drawVent(r: number): HTMLCanvasElement {
  const size = r * 2 + 2;
  const [c, ctx] = canvas(size, size);
  const cx = size / 2;
  ctx.fillStyle = "#1b1020";
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a30";
  ctx.beginPath();
  ctx.arc(cx, cx, r - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8c1d14";
  ctx.beginPath();
  ctx.arc(cx, cx, r - 5, 0, Math.PI * 2);
  ctx.fill();
  // Grate bars.
  ctx.fillStyle = "#2a2230";
  for (let x = -r; x < r; x += 4) ctx.fillRect(cx + x, cx - r + 3, 2, r * 2 - 6);
  ctx.fillStyle = "#f2c14e";
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(ang) * (r - 1) - 0.5), Math.round(cx + Math.sin(ang) * (r - 1) - 0.5), 1, 1);
  }
  return c;
}

/** The exit hatch in the top wall. */
export function drawDoor(w: number, h: number, open: boolean): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(0, 0, w, h);
  if (open) {
    ctx.fillStyle = "#0c0710";
    ctx.fillRect(3, 0, w - 6, h - 2);
    ctx.fillStyle = "#5fd36a";
    // Chevrons pointing out.
    for (let i = 0; i < 2; i++) {
      const y = 3 + i * 5;
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(w / 2 - 1 - k, y + k, 1, 1);
        ctx.fillRect(w / 2 + k, y + k, 1, 1);
      }
    }
  } else {
    for (let x = -h; x < w; x += 6) {
      ctx.fillStyle = "#f2c14e";
      ctx.beginPath();
      ctx.moveTo(x + 3, 2);
      ctx.lineTo(x + 6, 2);
      ctx.lineTo(x + 6 + h - 4, h - 2);
      ctx.lineTo(x + 3 + h - 4, h - 2);
      ctx.fill();
    }
    ctx.fillStyle = "#1b1020";
    ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.fillStyle = "#e0533d";
    ctx.fillRect(w / 2 - 2, h / 2 - 1, 4, 2);
  }
  return c;
}

// 3x5 pixel font, each glyph as five octal digits (one per row, bit 4 = left pixel).
const GLYPHS: Record<string, string> = {
  A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553", H: "55755",
  I: "72227", J: "11152", K: "55655", L: "44447", M: "57755", N: "65555", O: "25552", P: "65644",
  Q: "25563", R: "65655", S: "34216", T: "72222", U: "55557", V: "55552", W: "55775", X: "55255",
  Y: "55222", Z: "71247", "0": "75557", "1": "26227", "2": "61247", "3": "61216", "4": "55711",
  "5": "74616", "6": "34652", "7": "71122", "8": "25252", "9": "25316", ".": "00002", ",": "00024",
  "!": "22202", "?": "61202", ":": "02020", "-": "00700", "+": "02720", "/": "11224", "%": "51245",
  "(": "12221", ")": "42224", "'": "22000", " ": "00000", "<": "12421", ">": "42124", "=": "07070",
  '"': "55000", "*": "05250", "&": "25257", "#": "57575",
};
export const FONT_CHARS = Object.keys(GLYPHS).join("");
export const FONT_CELL = { w: 5, h: 7 };

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function drawSprite(s: PixelSprite): HTMLCanvasElement {
  const w = Math.max(...s.rows.map((r) => r.length));
  const [c, ctx] = canvas(w, s.rows.length);
  const pal = { ...BASE, ...s.palette };
  s.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]!];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

/** Font atlas: white glyphs with a dark 1px outline, one 5x7 cell per character. */
export function drawFont(): HTMLCanvasElement {
  const chars = FONT_CHARS;
  const [c, ctx] = canvas(chars.length * FONT_CELL.w, FONT_CELL.h);
  const on = (ch: string, x: number, y: number) => {
    if (x < 0 || x > 2 || y < 0 || y > 4) return false;
    return ((parseInt(GLYPHS[ch]![y]!, 8) >> (2 - x)) & 1) === 1;
  };
  [...chars].forEach((ch, i) => {
    const ox = i * FONT_CELL.w;
    for (let y = -1; y <= 5; y++) {
      for (let x = -1; x <= 3; x++) {
        if (on(ch, x, y)) {
          ctx.fillStyle = "#ffffff";
        } else {
          let near = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near ||= on(ch, x + dx, y + dy);
          if (!near) continue;
          ctx.fillStyle = "#1b1020";
        }
        ctx.fillRect(ox + x + 1, y + 1, 1, 1);
      }
    }
  });
  return c;
}

export function drawGlow(size: number): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function drawRing(size: number, thickness: number): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - thickness / 2 - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

export function drawShadow(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = "rgba(10,4,8,0.45)";
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export function drawVignette(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
  g.addColorStop(0, "rgba(10,4,8,0)");
  g.addColorStop(1, "rgba(10,4,8,0.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** Small deterministic hash so the generated floor looks the same every visit. */
function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The sea under the deck: lava in the foundry, icy water in the caverns. */
export function drawLava(size: number, cols: readonly string[] = BIOME_ART.foundry.sea): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  // Tileable value noise: sample a wrapped lattice and smooth it.
  const cell = 8;
  const n = size / cell;
  const lattice = (ix: number, iy: number) => hash(((ix % n) + n) % n, ((iy % n) + n) % n, 7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = lattice(ix, iy) * (1 - sx) + lattice(ix + 1, iy) * sx;
      const b = lattice(ix, iy + 1) * (1 - sx) + lattice(ix + 1, iy + 1) * sx;
      const v = a * (1 - sy) + b * sy + (hash(x, y, 3) - 0.5) * 0.12;
      ctx.fillStyle = cols[Math.max(0, Math.min(cols.length - 1, Math.floor(v * cols.length)))]!;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** The deck floor: riveted metal plates, a hazard-striped rim, scorch marks and glowing cracks. */
export function drawFloor(w: number, h: number, pad: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  // Rim with hazard stripes.
  ctx.fillStyle = "#2a2230";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = -c.height; i < c.width; i += 8) {
    ctx.fillStyle = "#f2c14e";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 4, 0);
    ctx.lineTo(i + 4 + c.height, c.height);
    ctx.lineTo(i + c.height, c.height);
    ctx.fill();
  }
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(pad - 2, pad - 2, w + 4, h + 4);

  const T = 16;
  for (let ty = 0; ty < h / T; ty++) {
    for (let tx = 0; tx < w / T; tx++) {
      const x = pad + tx * T;
      const y = pad + ty * T;
      const r = hash(tx, ty);
      ctx.fillStyle = r < 0.15 ? "#3a3340" : r < 0.6 ? "#423a48" : "#463e4d";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#4f4757";
      ctx.fillRect(x, y, T, 1);
      ctx.fillRect(x, y, 1, T);
      ctx.fillStyle = "#2c2632";
      ctx.fillRect(x, y + T - 1, T, 1);
      ctx.fillRect(x + T - 1, y, 1, T);
      ctx.fillStyle = "#5c5464";
      ctx.fillRect(x + 2, y + 2, 1, 1);
      ctx.fillRect(x + T - 3, y + 2, 1, 1);
      ctx.fillRect(x + 2, y + T - 3, 1, 1);
      ctx.fillRect(x + T - 3, y + T - 3, 1, 1);
      if (r > 0.975) {
        // Vent grate.
        ctx.fillStyle = "#211b26";
        for (let i = 3; i < T - 3; i += 2) ctx.fillRect(x + 3, y + i, T - 6, 1);
      } else if (r > 0.94) {
        // Glowing crack.
        ctx.fillStyle = "#c8401a";
        let cx = x + 3;
        let cy = y + 4 + Math.floor(hash(tx, ty, 2) * 8);
        for (let i = 0; i < 10; i++) {
          ctx.fillRect(cx, cy, 1, 1);
          cx += 1;
          cy += hash(tx + i, ty, 5) < 0.5 ? -1 : 1;
        }
      }
    }
  }
  // Scorch marks.
  for (let i = 0; i < 18; i++) {
    const sx = pad + hash(i, 1, 9) * w;
    const sy = pad + hash(i, 2, 9) * h;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
    g.addColorStop(0, "rgba(15,8,12,0.4)");
    g.addColorStop(1, "rgba(15,8,12,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 14, sy - 14, 28, 28);
  }
  return c;
}

/** A cargo crate with a top face and an 8px front face. Footprint is w x h. */
export function drawCrate(w: number, h: number): HTMLCanvasElement {
  const front = 8;
  const [c, ctx] = canvas(w, h + front);
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(0, 0, w, h + front);
  ctx.fillStyle = "#b5773f";
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "#cf9152";
  for (let y = 3; y < h - 2; y += 5) ctx.fillRect(2, y, w - 4, 1);
  ctx.fillStyle = "#7c4b25";
  ctx.fillRect(1, h - 1, w - 2, front);
  ctx.fillStyle = "#5fd3e8";
  ctx.fillRect(3, h + 2, Math.min(w - 6, 10), 2);
  ctx.fillStyle = "#e0533d";
  ctx.fillRect(w - 6, h + 2, 3, 3);
  return c;
}

/** The caverns floor: packed ice tiles with frost cracks and snow drifts. */
export function drawIceFloor(w: number, h: number, pad: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  // Rim: a frosty edge instead of hazard stripes.
  ctx.fillStyle = "#1f3a52";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < c.width; i += 6) {
    ctx.fillStyle = hash(i, 3, 4) < 0.5 ? "#cfe8ff" : "#9fd8ff";
    ctx.fillRect(i, 0, 3, 2);
    ctx.fillRect(i, c.height - 2, 3, 2);
  }
  ctx.fillStyle = "#0c1a2e";
  ctx.fillRect(pad - 2, pad - 2, w + 4, h + 4);

  const T = 16;
  for (let ty = 0; ty < h / T; ty++) {
    for (let tx = 0; tx < w / T; tx++) {
      const x = pad + tx * T;
      const y = pad + ty * T;
      const r = hash(tx, ty, 11);
      ctx.fillStyle = r < 0.2 ? "#3f6584" : r < 0.65 ? "#466d8c" : "#4c7494";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#5e88a8";
      ctx.fillRect(x, y, T, 1);
      ctx.fillRect(x, y, 1, T);
      ctx.fillStyle = "#34556f";
      ctx.fillRect(x, y + T - 1, T, 1);
      ctx.fillRect(x + T - 1, y, 1, T);
      // A glint on some tiles sells the slipperiness.
      if (r > 0.8) {
        ctx.fillStyle = "#a8d8f0";
        ctx.fillRect(x + 3, y + 3, 3, 1);
        ctx.fillRect(x + 3, y + 4, 1, 1);
      } else if (r > 0.72) {
        // Frost crack.
        ctx.fillStyle = "#2e4c66";
        let cx = x + 2;
        let cy = y + 4 + Math.floor(hash(tx, ty, 12) * 8);
        for (let i = 0; i < 11; i++) {
          ctx.fillRect(cx, cy, 1, 1);
          cx += 1;
          cy += hash(tx + i, ty, 13) < 0.5 ? -1 : 1;
        }
      }
    }
  }
  // Snow drifts.
  for (let i = 0; i < 16; i++) {
    const sx = pad + hash(i, 1, 14) * w;
    const sy = pad + hash(i, 2, 14) * h;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
    g.addColorStop(0, "rgba(200,230,250,0.22)");
    g.addColorStop(1, "rgba(200,230,250,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 16, sy - 16, 32, 32);
  }
  return c;
}

/** An ice block with a top face and an 8px front face, in place of a cargo crate. */
export function drawIceBlock(w: number, h: number): HTMLCanvasElement {
  const front = 8;
  const [c, ctx] = canvas(w, h + front);
  ctx.fillStyle = "#1b3040";
  ctx.fillRect(0, 0, w, h + front);
  ctx.fillStyle = "#cfe8ff";
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "#e8f8ff";
  ctx.fillRect(2, 2, w - 4, 2);
  ctx.fillStyle = "#9fd8ff";
  for (let i = 0; i < 3; i++) ctx.fillRect(3 + i * 7, 6 + i * 3, 4, 1);
  ctx.fillStyle = "#7ab8e0";
  ctx.fillRect(1, h - 1, w - 2, front);
  ctx.fillStyle = "#9fd8ff";
  ctx.fillRect(3, h + 1, w - 6, 1);
  return c;
}

/** A strip of icicle spikes, pointing away from the wall they grow on. */
export function drawSpikes(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = "#1b3040";
  ctx.fillRect(0, 0, w, h);
  const across = w >= h;
  const n = Math.max(1, Math.floor((across ? w : h) / 6));
  for (let i = 0; i < n; i++) {
    const o = i * 6 + 3;
    ctx.fillStyle = "#e8f8ff";
    ctx.beginPath();
    if (across) {
      ctx.moveTo(o - 3, 0);
      ctx.lineTo(o + 3, 0);
      ctx.lineTo(o, h);
      ctx.moveTo(o - 3, h);
      ctx.lineTo(o + 3, h);
      ctx.lineTo(o, 0);
    } else {
      ctx.moveTo(0, o - 3);
      ctx.lineTo(0, o + 3);
      ctx.lineTo(w, o);
      ctx.moveTo(w, o - 3);
      ctx.lineTo(w, o + 3);
      ctx.lineTo(0, o);
    }
    ctx.fill();
  }
  ctx.fillStyle = "#e0533d";
  for (let i = 0; i < n; i += 3) ctx.fillRect(across ? i * 6 + 2 : Math.floor(w / 2), across ? Math.floor(h / 2) : i * 6 + 2, 1, 1);
  return c;
}

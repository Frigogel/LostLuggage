// Placeholder pixel art drawn in code, so the prototype needs no asset packs.
// Each sprite is rows of palette characters; "." is transparent. All sprites face right.

type Palette = Record<string, string>;

const BASE: Palette = {
  k: "#1b1020", // outline
  W: "#ffffff",
};

export interface PixelSprite {
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

  // ---------------------------------------------------------------- Bilge Sewers
  sewer_roach: {
    palette: { n: "#7a4a2a", N: "#4e2e1a", a: "#c89a6a", e: "#f2c14e" },
    rows: [
      ".a.......a..",
      "..a.....a...",
      "...kkkkkk...",
      "..knnnnnnkk.",
      ".knNnnNnnnek",
      "kknnNnnNnnkk",
      "..kNNNNNNk..",
      ".k.k.k.k.k..",
    ],
  },
  plunger_ogre: {
    palette: { g: "#7a9a4a", G: "#56703a", b: "#3a5a8a", B: "#2a3f63", r: "#e0533d", n: "#9a6a42", e: "#1b1020" },
    rows: [
      "..........rrr...",
      ".........rrrrr..",
      "....kkkkk.kn....",
      "...kgggggk.n....",
      "..kgegggegkn....",
      "..kgggggggkn....",
      ".kkkgGGGgkkn....",
      "kggkbbbbbkgnk...",
      "kggkbbybbkggk...",
      "kgGkbbbbbkGgk...",
      ".kk.kBBBBk.kk...",
      "....kbbkbbk.....",
      "...kggk.kggk....",
      "...kkk...kkk....",
    ],
  },
  sewer_eel: {
    palette: { t: "#3a8a7a", T: "#245a50", y: "#f2c14e", e: "#1b1020", c: "#9ff3ff" },
    rows: [
      "...........c..",
      "......kkkkkc..",
      "....kkttttttk.",
      "..kkttTtttettk",
      ".kttTttyttttkk",
      "kttTttyykkkk..",
      "kTkkkkkk......",
      ".k............",
    ],
  },
  spitting_toad: {
    palette: { g: "#5e9a4a", G: "#3e6a32", y: "#f2e08a", e: "#f2c14e", p: "#e05a9a" },
    rows: [
      "...kk..kk...",
      "..kek.kekk..",
      ".kggkkkgggk.",
      "kgggggggggkp",
      "kgGgggGggggp",
      "kyyyyyyyyyk.",
      ".kGGgggGGk..",
      "kGk.....kGk.",
    ],
  },
  sludge_slime: {
    palette: { s: "#8a8a3a", S: "#5e5e2a", e: "#1b1020", b: "#c8c86a" },
    rows: [
      "......b.....",
      "....b.......",
      "..kkssssskk.",
      ".ksssSsssssk",
      "kssesssessssk",
      "ksssssssssSk",
      "kSssssssSssk",
      ".kkkkkkkkkk.",
    ],
  },
  drain_shaman: {
    palette: { r: "#8a5a2a", R: "#5e3a1a", g: "#7fbf4a", f: "#c8b48a", e: "#1b1020", c: "#5fd3e8", m: "#a7b0bb" },
    rows: [
      ".m..........",
      ".m..kkkk....",
      ".m.kggggk...",
      ".mkggggggk..",
      ".m.kffefk...",
      ".m.kffffk...",
      "cmkrrrrrrk..",
      ".mkrRrrRrrk.",
      ".mkrrcrrrrk.",
      ".mkrRrrrRrk.",
      ".m.krrrrrrk.",
      "...kkk.kkk..",
    ],
  },
  roach_motel: {
    palette: { y: "#f2c14e", Y: "#b5862a", r: "#e0533d", d: "#2a2230", n: "#7a4a2a" },
    rows: [
      "..kkkkkkkkkkkkkk..",
      ".kyyyyyyyyyyyyyyk.",
      "kyyrrrrrrrrrrrryyk",
      "kyyyyyyyyyyyyyyyyk",
      "kYYYYYYYYYYYYYYYYk",
      "kyykkkkkykkkkkkyyk",
      "kyykddddykddddkyyk",
      "kyykddndykdnddkyyk",
      "kyykddddykddddkyyk",
      "kYYYYYYYYYYYYYYYYk",
      "kkkkkkkkkkkkkkkkkk",
    ],
  },
  toilet_mimic: {
    palette: { w: "#e8eef2", s: "#a7b0bb", r: "#e0533d", e: "#f2c14e", t: "#f4ecd8" },
    rows: [
      "kkkkkkk.......",
      "kWWWWWk.......",
      "kWsssWk.......",
      "kWWWWWkkkkkk..",
      "kWWWkrrrrrrrk.",
      "kWWkrtrtrtrtek",
      "kWWkrrrrrrrrrk",
      "kWWWkWWWWWWWk.",
      ".kWWWWWWWWWk..",
      "..kWsssssWk...",
      "..kkkkkkkkk...",
    ],
  },
  fatberg: {
    palette: { f: "#d8c890", F: "#a8985a", w: "#f4ecd8", e: "#1b1020", b: "#7a6a3a" },
    rows: [
      "....kkkkkk....",
      "..kkffwfffkk..",
      ".kfffffFfwffk.",
      "kffefffffeffFk",
      "kfFffwffffffbk",
      "kffffffbFffffk",
      "kfwfFfffffwfFk",
      "kFfffffwffffFk",
      ".kFFfbFFFFFFk.",
      "..kkkkkkkkkk..",
    ],
  },
  fatberglet: {
    palette: { f: "#d8c890", F: "#a8985a", w: "#f4ecd8", e: "#1b1020" },
    rows: ["..kkkk..", ".kfwffk.", "kfeffefk", "kffffFfk", "kFfwfFFk", ".kkkkkk."],
  },
  toilet_hidden: {
    palette: { s: "#a7b0bb" },
    rows: [
      "kkkkkkk.......",
      "kWWWWWk.......",
      "kWsssWk.......",
      "kWWWWWkkkkkk..",
      "kWWWkWWWWWWWk.",
      "kWWkssssssssWk",
      "kWWkssssssssWk",
      "kWWWkWWWWWWWk.",
      ".kWWWWWWWWWk..",
      "..kWsssssWk...",
      "..kkkkkkkkk...",
    ],
  },
  lost_found_gator: {
    palette: { g: "#5e9a4a", G: "#3e6a32", l: "#a8c87a", e: "#f2c14e", t: "#f4ecd8", b: "#3b6fd1", B: "#274a94", y: "#f2c14e", r: "#e0533d" },
    rows: [
      "...........kkk..kkk...........",
      "..........kgekkkgek...........",
      ".........kggggggggggkkkkkkkk..",
      "........kgggGgggggggggggggggk.",
      "........kggggggggggggggGgggggk",
      "........kgggggggggtgtgtgtgtgk.",
      ".........kgggggkkkkkkkkkkkkk..",
      "..........kggggktgtgtgtgk.....",
      "...........kgggkkkkkkkkk......",
      "...kk.....kggggggk............",
      "..kggk...kgglllllgk...........",
      ".kgGggk.kggllllllggkkkkkkk....",
      "kgggGgkkggllllllllgkbbbbbbk...",
      "kgGgggggggllllllllgkbrryrrbk..",
      ".kggGggggglllllllggkbbbbbbbk..",
      "..kkggGgggglllllgggkbBByBBBk..",
      "....kgggggggllllggggkbbbbbbk..",
      ".....kgggggggggggggk.kkkkkk...",
      "......kGGGGGGGGGGGk...........",
      ".......kggk...kggk............",
      "......kggGk...kggGk...........",
      "......kkkkk...kkkkk...........",
    ],
  },

  // ---------------------------------------------------------------- Orbital Deck
  roomba_drone: {
    palette: { m: "#a7b0bb", M: "#6d7682", c: "#5fd3e8", r: "#e0533d" },
    rows: [
      "....kkkk....",
      "..kkmmmmkk..",
      ".kmmmccmmmk.",
      "kmmMmmmmmMrk",
      "kMMMMMMMMMMk",
      ".kkkkkkkkkk.",
      "..k......k..",
    ],
  },
  security_mech: {
    palette: { m: "#a7b0bb", M: "#6d7682", d: "#3a3a46", c: "#5fd3e8", y: "#f2c14e" },
    rows: [
      ".....kkkkkk.....",
      "....kmmmmmmk....",
      "....kmccccmk....",
      "....kmmmmmmk....",
      "..kkkkMMMMkkkk..",
      ".kmmkmmmmmmkmmk.",
      "kmMmkmyyyymkmMmk",
      "kmMmkmmmmmmkmMmk",
      "kMMkkMMMMMMkkMMk",
      ".kk.kddkddk..kk.",
      "....kmmkmmk.....",
      "...kmmk.kmmk....",
      "...kMMk.kMMk....",
      "...kkk...kkk....",
    ],
  },
  rocket_cart: {
    palette: { m: "#a7b0bb", M: "#6d7682", b: "#3b6fd1", r: "#e0533d", f: "#ffb238", y: "#f2c14e", d: "#2a2230" },
    rows: [
      "....kkkkkkkk..",
      "...kbbbbbbbbk.",
      "...kbrrbbbbbk.",
      "kkkkmmmmmmmmmk",
      "fkMMmmmmmmmmmk",
      "ffkMMMMMMMMMMk",
      "f..kkkkkkkkkk.",
      "....kdk..kdk..",
      "....kk....kk..",
    ],
  },
  dish_crab: {
    palette: { m: "#c9cfd6", M: "#7a8494", r: "#e0533d", R: "#a33a24", e: "#1b1020", c: "#5fd3e8" },
    rows: [
      "....kkkk....",
      "...kmmmMk...",
      "..kmmcmMk...",
      "...kmmMk....",
      ".....k......",
      "..kkkkkkkk..",
      ".krrrrrrrrk.",
      "krerrrrrerRk",
      "kRRRRRRRRRRk",
      ".k.k.kk.k.k.",
    ],
  },
  gray_goo: {
    palette: { s: "#8a93a3", S: "#5a6270", c: "#9ff3ff", e: "#1b1020" },
    rows: [
      ".........c..",
      "...c........",
      "..kkssssskk.",
      ".ksssSssssk.",
      "kssessseSssk",
      "ksSsssssssSk",
      "kSssscssSssk",
      ".kkkkkkkkkk.",
    ],
  },
  holo_concierge: {
    palette: { c: "#5fd3e8", C: "#3a8aa8", h: "#9ff3ff", e: "#1b1020" },
    rows: [
      "....kkkk....",
      "...khhhhk...",
      "...khehek...",
      "...khhhhk...",
      "....kcck....",
      "..kcccccck..",
      ".kcChcchCck.",
      ".kcCcccccCk.",
      "..kcccccck..",
      "...kCcCck...",
      "....kcck....",
      ".....kk.....",
      "...h.h.h....",
    ],
  },
  drone_dock: {
    palette: { m: "#a7b0bb", M: "#6d7682", d: "#2a2230", c: "#5fd3e8", y: "#f2c14e" },
    rows: [
      "......kkkkkk......",
      "....kkmmmmmmkk....",
      "...kmmmmccmmmmk...",
      "..kmmMMMMMMMMmmk..",
      ".kmmkkkkkkkkkkmmk.",
      ".kmkddddddddddkmk.",
      "kmmkdcdddddddckmmk",
      "kmmkddddddddddkmmk",
      "kMMkkkkkkkkkkkkMMk",
      "kyMyMyMyMyMyMyMyMk",
      "kkkkkkkkkkkkkkkkkk",
    ],
  },
  cryo_pod: {
    palette: { m: "#a7b0bb", M: "#6d7682", c: "#9ff3ff", C: "#5fd3e8", r: "#e0533d", t: "#f4ecd8", e: "#e0533d" },
    rows: [
      "..kkkkkkkk....",
      ".kmmmmmmmmk...",
      "kmkkkkkkkkmk..",
      "kmkrrrrrrkmkk.",
      "kmkrtrtrtekmk.",
      "kmkrrrrrrrkmk.",
      "kmkkkkkkkkmk..",
      "kmmmmrmmmmmk..",
      "kMMMMMMMMMMk..",
      ".kkkkkkkkkk...",
    ],
  },
  cryo_hidden: {
    palette: { m: "#a7b0bb", M: "#6d7682", c: "#9ff3ff", C: "#5fd3e8", g: "#5fd36a" },
    rows: [
      "..kkkkkkkk....",
      ".kmmmmmmmmk...",
      "kmkkkkkkkkmk..",
      "kmkcccccckmk..",
      "kmkcCccWckmk..",
      "kmkccCcccckmk.",
      "kmkkkkkkkkmk..",
      "kmmmmgmmmmmk..",
      "kMMMMMMMMMMk..",
      ".kkkkkkkkkk...",
    ],
  },
  space_blob: {
    palette: { p: "#b46cff", P: "#7a3ac8", e: "#5fd36a", c: "#e8d0ff" },
    rows: [
      "..k.....k.....",
      "..kek..kek....",
      "...kk..kk.....",
      "...kkkkkkkk...",
      "..kppcppppppk.",
      ".kppppepPpppk.",
      "kpppPpppppPppk",
      "kppppppPppppPk",
      "kPpppPpppppPPk",
      ".kPPPPPPPPPPk.",
      "..kkkkkkkkkk..",
    ],
  },
  blob_spawn: {
    palette: { p: "#b46cff", P: "#7a3ac8", e: "#5fd36a" },
    rows: ["..k..k..", ".kkkkkk.", "kpeppepk", "kppppPpk", "kPpppPPk", ".kkkkkk."],
  },
  autopilot: {
    palette: { m: "#c9cfd6", M: "#7a8494", d: "#2a2230", c: "#5fd3e8", C: "#3a8aa8", r: "#e0533d", y: "#f2c14e", w: "#ffffff" },
    rows: [
      ".............c.............",
      ".............k.............",
      "..........kkkmkkk..........",
      "........kkmmmmmmmkk........",
      ".......kmmmmmmmmmmmk.......",
      "......kmmddddddddddmk......",
      "......kmdcccccccccdmk......",
      "......kmdcwcccrcccdmk......",
      "......kmdcccccccccdmk......",
      "......kmmddddddddddmk......",
      ".......kmmmmmmmmmmmk.......",
      "...kkkkkkMMMMMMMMMkkkkkk...",
      "..kmmmmkmmmmmmmmmmkmmmmmk..",
      ".kmMMmkkmkkkkkkkkmkkmMMmk..",
      ".kmMmk.kmkyCcCcykmk.kmMmk..",
      ".kmMmk.kmkCcCcCckmk.kmMmk..",
      ".kmmk..kmkyCcCcykmk..kmmk..",
      ".kccck.kmkkkkkkkkmk.kccck..",
      "..kkk..kmmmmmmmmmmk..kkk...",
      "........kMMk..kMMk.........",
      ".......kMMMk..kMMMk........",
      ".......kkkkk..kkkkk........",
    ],
  },

  // ---------------------------------------------------------------- grabbers
  claw_machine: {
    palette: { p: "#e05a9a", P: "#a03a6e", y: "#f2c14e", c: "#5fd3e8", m: "#c9cfd6", M: "#7a8494", e: "#1b1020", r: "#e0533d" },
    rows: [
      "..kkkkkkkkk.....",
      ".kyyyyyyyyyk....",
      ".kpcccccccpk....",
      ".kpcmmmmmcpkkkk.",
      ".kpccMcMccpmmmmk",
      ".kpcceccecpk.kmk",
      ".kpcccccccpk.kmk",
      ".kpppppppppk.mkm",
      ".kPPPPPPPPPk.m.m",
      ".kpprrrrrppk....",
      ".kppyyyyyppk....",
      ".kPPPPPPPPPk....",
      "..kMk...kMk.....",
      "..kkk...kkk.....",
    ],
  },
  polar_hugger: {
    palette: { s: "#cfd8e3", e: "#1b1020", p: "#f29bb0", r: "#e0533d" },
    rows: [
      "....kkkkk.....",
      "...kWWWWWk....",
      "..kWWeWWeWk...",
      "..kWWWWkWWk...",
      "..kWWWppWWk...",
      "...krrrrrk....",
      "kkkWWWWWWWkkk.",
      "kWWWWWWWWWWWWk",
      "kWskWWWWWWksWk",
      ".kk.kWWWWWWk..",
      "....kWsWWsWk..",
      "....kWWkkWWk..",
      "...kWWk..kWWk.",
      "...kkk....kkk.",
    ],
  },
  ubend_lurker: {
    palette: { g: "#4e8a6a", G: "#2e5a44", p: "#a7b0bb", P: "#6d7682", e: "#f2c14e" },
    rows: [
      ".....kkkk.....",
      "....kggggk....",
      "...kggeeggk...",
      "...kgekeggk...",
      "...kggggggk...",
      "..kgGgggGgkk..",
      ".kgGkgggkgGgk.",
      "kgk.kgGgk.kgGk",
      "kk..kpppppk.kk",
      "...kpPPPPPpk..",
      "...kpppppppk..",
      "....kkkkkkk...",
    ],
  },
  cargo_loader: {
    palette: { y: "#f2c14e", Y: "#b5862a", m: "#c9cfd6", M: "#7a8494", c: "#5fd3e8", r: "#e0533d" },
    rows: [
      "...kkkkkk.......",
      "..kyyyyyyk......",
      "..kyccccyk......",
      "..kycrccyk......",
      "..kyyyyyyk.kkkkk",
      ".kkYYYYYYkkmmmmk",
      ".kyyyyyyyykmkkkk",
      ".kyyMMMMyykmk...",
      ".kyyyyyyyykmkkkk",
      ".kYYYYYYYYkmmmmk",
      ".kkkkkkkkkkkkkk.",
      ".kMMk....kMMk...",
      ".kMMk....kMMk...",
      "..kk......kk....",
    ],
  },

  // ---------------------------------------------------------------- Drowned Crypt
  mummy_chaperone: {
    palette: { b: "#e8dcc0", B: "#b8a88a", e: "#7ee05a" },
    rows: [
      "...kkkkk....",
      "..kbbbbbk...",
      "..kBbbbBk...",
      "..kbbebek...",
      "..kBbbbbk...",
      "...kbBbk....",
      "..kbbbbbkkkk",
      ".kbBbbbbbbbk",
      ".kbbbBbkkkkk",
      ".kbBbbbk....",
      ".kbbbBbk....",
      "..kbbkbbk...",
      "..kBbkBbk...",
      "..kkk.kkk...",
    ],
  },
  souvenir_hunter: {
    palette: { b: "#e8e4d8", B: "#a8a498", d: "#a7b0bb", r: "#e0533d" },
    rows: [
      "...kkk......",
      "..kbbbk.....",
      "..kbkbk.....",
      "..kbbbk.....",
      "...kbk...d..",
      "..kbbbkkdd..",
      "..kbBbk.d...",
      "..kbbbk.d...",
      "..kb.bk.drr.",
      "..kk.kk..kk.",
    ],
  },
  zombie_porter: {
    palette: { g: "#7aa06a", G: "#56704a", r: "#a8323a", R: "#6e2026", y: "#f2c14e", n: "#9a6a42", N: "#6e4a2c", e: "#ffe08a" },
    rows: [
      "....kkkkk.......",
      "...krrrrrk......",
      "...kyyyyyk......",
      "...kggegek......",
      "...kgGgggk......",
      "..kkkgggkkk.....",
      ".kgkrrrrrkgk....",
      ".kgkrryrrkgkkkk.",
      ".kGkrrrrrkGknnk.",
      "..kkRRRRRkknNnk.",
      "....kRRkRRk.knk.",
      "....kggkggk.kkk.",
      "...kGGk.kGGk....",
      "...kkkk.kkkk....",
    ],
  },
  gargoyle_bellhop: {
    palette: { s: "#8a8a96", S: "#5e5e6a", l: "#b0b0bc", r: "#a8323a", e: "#ff6a3c" },
    rows: [
      "....krrk......",
      "...kkrrkk.....",
      "k..kssssk...k.",
      "kk.ksssesk.kk.",
      "ksk.kSssk.ksk.",
      "kssksssssksSk.",
      ".kSksslssksk..",
      "..kkssssskk...",
      "...kslllsk....",
      "...kSsssSk....",
      "...kSk.kSk....",
      "...kkk.kkk....",
    ],
  },
  banshee_guide: {
    palette: { c: "#bfe8e0", C: "#7fbfb8", h: "#e8e8f0", m: "#3a3040", f: "#f2c14e", p: "#9a6a42" },
    rows: [
      "...kkkk...ff",
      "..khhhhk..pf",
      ".khcccchk.p.",
      ".khcmcmck.p.",
      ".khccccck.p.",
      ".khcCmCck.p.",
      "..kccccckkp.",
      ".kcCcccccck.",
      ".kcccCcccck.",
      "kcCcccccCcck",
      "kcccCcccccck",
      ".kcCkcCkcCk.",
      "..kk.kk.kk..",
    ],
  },
  ecto_slime: {
    palette: { g: "#7ef0b0", G: "#3ea878", b: "#d8ffe8" },
    rows: [
      "......b.....",
      "....b.......",
      "..kkggggkk..",
      ".kgggGgggggk",
      "kggkgggkgggk",
      "kgggggggggGk",
      "kGgggggGgggk",
      ".kkkkkkkkkk.",
    ],
  },
  bell_ringer: {
    palette: { g: "#9ab08a", G: "#6a805a", r: "#4a3a5a", R: "#2e2440", y: "#f2c14e", Y: "#b5862a", e: "#ff6a3c" },
    rows: [
      "...kkkk.....",
      "..kggggk....",
      "..kggegk....",
      "..kgGggk....",
      "...kggk..kk.",
      "..krrrrk.kyk",
      ".krrRrrrkkyk",
      ".krrrRrrkyYk",
      ".krRrrrkyyyk",
      ".krrrrRrkkkk",
      ".kRRRRRRk...",
      "..kgk.kgk...",
      "..kk..kk....",
    ],
  },
  crypt_urn: {
    palette: { u: "#6a7a8a", U: "#3e4a5a", g: "#c8a050", s: "#e8e4d8", e: "#7ef0b0" },
    rows: [
      ".....kkkkkk.....",
      "....kggggggk....",
      ".....kuuuuk.....",
      "....kuuuuuuk....",
      "...kuuussuuuk...",
      "..kuuusesuuuuk..",
      "..kuuussssuuuk..",
      "..kUuuuuuuuUk...",
      "..kggggggggggk..",
      "...kUuuuuuuUk...",
      "....kUUUUUUk....",
      "...kkkkkkkkkk...",
    ],
  },
  ecto_wisp: {
    palette: { c: "#9ff3c8", C: "#4ec898", e: "#1b1020" },
    rows: ["..kkk...", ".kccck..", "kcecek..", "kcccccCk", ".kCcCck.", "..k.k.k."],
  },
  coffin_hidden: {
    palette: { n: "#7a4a2a", N: "#4e2e1a", g: "#c8a050" },
    rows: [
      "...kkkkkk...",
      "..knnnnnnk..",
      ".knnnnnnnnk.",
      ".knnnggnnnk.",
      ".knggggggnk.",
      ".knnnggnnnk.",
      ".knnnggnnnk.",
      ".kNnnggnnNk.",
      "..knnnnnnk..",
      "..kNnnnnNk..",
      "...knnnnk...",
      "...kNNNNk...",
      "....kkkk....",
    ],
  },
  coffin_mimic: {
    palette: { n: "#7a4a2a", N: "#4e2e1a", g: "#c8a050", t: "#f4ecd8", p: "#3a1020", e: "#ff6a3c" },
    rows: [
      "...kkkkkk...",
      "..knnnnnnk..",
      ".knnennnenk.",
      ".knnnnnnnnk.",
      ".kttttttttk.",
      ".kppppppppk.",
      ".kppppppppk.",
      ".kttttttttk.",
      "..knnnnnnk..",
      "..kNnggnNk..",
      "...knnnnk...",
      "...kNNNNk...",
      "....kkkk....",
    ],
  },
  haunted_hatbox: {
    palette: { h: "#d29bff", H: "#8c5ad1", s: "#f4ecd8", e: "#9ff3c8", d: "#2a1a3a" },
    rows: [
      "..kkkkkkkkk...",
      ".khhhhhhhhhk..",
      "..kkkkkkkkk...",
      ".kdddddddddk..",
      ".kdeddedddddk.",
      ".khhhhhhhhhhk.",
      ".kssssssssssk.",
      ".khhhhhhhhhhk.",
      ".kHhhhhhhhhHk.",
      ".kssssssssssk.",
      ".kHHHHHHHHHHk.",
      "..kkkkkkkkkk..",
    ],
  },
  night_auditor: {
    palette: { r: "#3a2a5a", R: "#241838", b: "#e8e4d8", e: "#7ef0b0", v: "#5fd36a", g: "#f2c14e", p: "#f4ecd8", P: "#c9c0a8" },
    rows: [
      "..........kkkkkk..........",
      ".........kvvvvvvk.........",
      "........kvvvvvvvvk........",
      ".........kbbbbbbk.........",
      "........kbbebbebbk........",
      "........kbbbbbbbbk........",
      ".........kbkbkbbk.........",
      "..........kbbbbk..........",
      "......kkkkrrrrrrkkkk......",
      ".....krrrrrrggrrrrrrk.....",
      "....krrRrrrrggrrrrRrrk....",
      "...kbkrrrrrrggrrrrrrkbk...",
      "...kbkrRrrrrggrrrrRrkpppk.",
      "....kkrrrrrrggrrrrrrkpPpk.",
      ".....krrrrRrggrRrrrrkpppk.",
      ".....krrRrrrggrrrRrrkkkkk.",
      "....krrrrrrrggrrrrrrrk....",
      "....kRrrRrrrrrrrRrrrRk....",
      "...kRRrRRrRRrRRrRRrRRRk...",
      "...kkk.kkk..kk..kkk.kkk...",
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
  sewers: { sea: ["#0e1a10", "#18301a", "#24462a", "#3a6a3a", "#8ab86a"], glow: 0x7ee05a, ambient: [0xc8ff9a, 0x7ee05a, 0xe8f0c8], fade: [12, 22, 14] },
  orbital: { sea: ["#05030f", "#0c0a24", "#1a1440", "#2a2060", "#8a7aff"], glow: 0x8a7aff, ambient: [0xffffff, 0x9ff3ff, 0xd8c8ff], fade: [8, 6, 24] },
  crypt: { sea: ["#04060a", "#0a121c", "#122030", "#1c3446", "#4f9a90"], glow: 0x5fd3b8, ambient: [0x9ff3c8, 0xd8c8ff, 0xffffff], fade: [6, 10, 16] },
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

/** The sea under the deck: lava in the foundry, icy water in the caverns, sludge in the sewers, space in orbit. */
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

/** A run boost on offer: a small cut gem, drawn in greys so it can be tinted by rarity. */
export function drawOrb(): HTMLCanvasElement {
  const [c, ctx] = canvas(11, 13);
  const rows = ["....111....", "...12221...", "..1222221..", ".122333221.", "12233333221", "12233333221", "12223332221", ".122222221.", "..1222221..", "...12221...", "....121....", ".....1.....", "..........."];
  const cols: Record<string, string> = { "1": "#1b1020", "2": "#c9cfd6", "3": "#ffffff" };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!cols[ch]) return;
    ctx.fillStyle = cols[ch]!;
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}

/** The sewers floor: wet brick with moss in the cracks and puddles. */
export function drawSewerFloor(w: number, h: number, pad: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  // Rim: a rusty pipe all the way round.
  ctx.fillStyle = "#3a2a1e";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#6a4a2a";
  ctx.fillRect(0, 2, c.width, 2);
  ctx.fillRect(0, c.height - 4, c.width, 2);
  for (let x = 0; x < c.width; x += 24) {
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(x, 0, 3, 6);
    ctx.fillRect(x, c.height - 6, 3, 6);
  }
  ctx.fillStyle = "#101810";
  ctx.fillRect(pad - 2, pad - 2, w + 4, h + 4);

  // Bricks, offset every other row.
  const BW = 16;
  const BH = 8;
  for (let ty = 0; ty < h / BH; ty++) {
    const off = ty % 2 === 0 ? 0 : BW / 2;
    for (let tx = -1; tx < w / BW + 1; tx++) {
      const x = pad + tx * BW + off;
      const y = pad + ty * BH;
      const r = hash(tx, ty, 21);
      ctx.fillStyle = r < 0.2 ? "#3a4a3a" : r < 0.65 ? "#425244" : "#4a5a4a";
      ctx.fillRect(Math.max(pad, x), y, Math.min(BW - 1, pad + w - x), BH - 1);
      ctx.fillStyle = "#56685a";
      if (x >= pad) ctx.fillRect(x, y, BW - 1, 1);
      if (r > 0.85 && x >= pad) {
        // Moss.
        ctx.fillStyle = "#5e8a3a";
        ctx.fillRect(x + 2, y + BH - 2, 5, 1);
        ctx.fillRect(x + 3, y + BH - 3, 2, 1);
      }
    }
  }
  // Puddles that catch the light.
  for (let i = 0; i < 14; i++) {
    const sx = pad + hash(i, 1, 22) * w;
    const sy = pad + hash(i, 2, 22) * h;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
    g.addColorStop(0, "rgba(120,180,120,0.18)");
    g.addColorStop(1, "rgba(120,180,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 14, sy - 14, 28, 28);
  }
  return c;
}

/** The orbital floor: clean white panels, seams and blinking guide lights. */
export function drawOrbitalFloor(w: number, h: number, pad: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  // Rim: a glowing cyan edge.
  ctx.fillStyle = "#1a1e2e";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#5fd3e8";
  ctx.fillRect(0, 2, c.width, 1);
  ctx.fillRect(0, c.height - 3, c.width, 1);
  ctx.fillRect(2, 0, 1, c.height);
  ctx.fillRect(c.width - 3, 0, 1, c.height);
  ctx.fillStyle = "#0a0c16";
  ctx.fillRect(pad - 2, pad - 2, w + 4, h + 4);

  const T = 24;
  for (let ty = 0; ty < h / T; ty++) {
    for (let tx = 0; tx < w / T; tx++) {
      const x = pad + tx * T;
      const y = pad + ty * T;
      const r = hash(tx, ty, 31);
      ctx.fillStyle = r < 0.2 ? "#4a5068" : r < 0.7 ? "#525a72" : "#58607a";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#6a7290";
      ctx.fillRect(x, y, T, 1);
      ctx.fillRect(x, y, 1, T);
      ctx.fillStyle = "#363c52";
      ctx.fillRect(x, y + T - 1, T, 1);
      ctx.fillRect(x + T - 1, y, 1, T);
      if (r > 0.9) {
        // A guide light.
        ctx.fillStyle = "#5fd3e8";
        ctx.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2);
      } else if (r > 0.8) {
        // A vent grille.
        ctx.fillStyle = "#3a4058";
        for (let i = 6; i < T - 6; i += 3) ctx.fillRect(x + 6, y + i, T - 12, 1);
      }
    }
  }
  return c;
}

/** A mossy stone block, in place of a cargo crate. */
export function drawStoneBlock(w: number, h: number): HTMLCanvasElement {
  const front = 8;
  const [c, ctx] = canvas(w, h + front);
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(0, 0, w, h + front);
  ctx.fillStyle = "#6a7a6a";
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "#7a8a7a";
  ctx.fillRect(2, 2, w - 4, 2);
  ctx.fillStyle = "#5e8a3a";
  ctx.fillRect(2, 1, Math.min(8, w - 4), 2);
  ctx.fillRect(w - 8, h - 4, 5, 2);
  ctx.fillStyle = "#4a5a4a";
  ctx.fillRect(1, h - 1, w - 2, front);
  ctx.fillStyle = "#3a4a3a";
  for (let x = 6; x < w - 2; x += 10) ctx.fillRect(x, h, 1, front - 2);
  return c;
}

/** A sealed cargo pod with a status light, in place of a cargo crate. */
export function drawCargoPod(w: number, h: number): HTMLCanvasElement {
  const front = 8;
  const [c, ctx] = canvas(w, h + front);
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(0, 0, w, h + front);
  ctx.fillStyle = "#c9cfd6";
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "#e8eef2";
  ctx.fillRect(2, 2, w - 4, 1);
  ctx.fillStyle = "#a7b0bb";
  ctx.fillRect(3, Math.floor(h / 2) - 1, w - 6, 2);
  ctx.fillStyle = "#7a8494";
  ctx.fillRect(1, h - 1, w - 2, front);
  ctx.fillStyle = "#5fd3e8";
  ctx.fillRect(3, h + 2, Math.min(w - 6, 8), 2);
  ctx.fillStyle = "#5fd36a";
  ctx.fillRect(w - 6, h + 2, 2, 2);
  return c;
}

/** The crypt floor: worn flagstones, cracks, the odd bone, and shallow water pooled in the low spots. */
export function drawCryptFloor(w: number, h: number, pad: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  // Rim: a carved stone border with a gold inlay.
  ctx.fillStyle = "#1e2230";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#8a7440";
  ctx.fillRect(0, 2, c.width, 1);
  ctx.fillRect(0, c.height - 3, c.width, 1);
  ctx.fillRect(2, 0, 1, c.height);
  ctx.fillRect(c.width - 3, 0, 1, c.height);
  ctx.fillStyle = "#0a0c12";
  ctx.fillRect(pad - 2, pad - 2, w + 4, h + 4);

  // Big flagstones, offset every other row, each a slightly different stone.
  const SW = 30;
  const SH = 20;
  for (let ty = 0; ty < h / SH; ty++) {
    const off = ty % 2 === 0 ? 0 : SW / 2;
    for (let tx = -1; tx < w / SW + 1; tx++) {
      const x = pad + tx * SW + off;
      const y = pad + ty * SH;
      const r = hash(tx, ty, 41);
      const x0 = Math.max(pad, x);
      const ww = Math.min(SW - 1, pad + w - x0, x + SW - 1 - x0);
      if (ww <= 0) continue;
      ctx.fillStyle = r < 0.25 ? "#2a3040" : r < 0.7 ? "#30364a" : "#363c52";
      ctx.fillRect(x0, y, ww, SH - 1);
      ctx.fillStyle = "#3e4660";
      ctx.fillRect(x0, y, ww, 1);
      if (r > 0.8 && x >= pad) {
        // A crack across the stone.
        ctx.fillStyle = "#1a1e2a";
        for (let i = 0; i < 8; i++) ctx.fillRect(x + 4 + i * 2, y + 6 + Math.round(Math.sin(i + tx) * 2), 2, 1);
      } else if (r < 0.06 && x >= pad) {
        // A bone someone left behind.
        ctx.fillStyle = "#c8c4b8";
        ctx.fillRect(x + 9, y + 9, 8, 2);
        ctx.fillRect(x + 8, y + 8, 2, 4);
        ctx.fillRect(x + 16, y + 8, 2, 4);
      }
    }
  }
  // Shallow water in the low spots, catching what little light there is.
  for (let i = 0; i < 12; i++) {
    const sx = pad + hash(i, 1, 42) * w;
    const sy = pad + hash(i, 2, 42) * h;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
    g.addColorStop(0, "rgba(80,170,160,0.22)");
    g.addColorStop(1, "rgba(80,170,160,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 22, sy - 22, 44, 44);
  }
  return c;
}

/** A stone tomb with a carved lid, in place of a cargo crate. */
export function drawTombBlock(w: number, h: number): HTMLCanvasElement {
  const front = 8;
  const [c, ctx] = canvas(w, h + front);
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(0, 0, w, h + front);
  ctx.fillStyle = "#5a6070";
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "#6e7486";
  ctx.fillRect(2, 2, w - 4, 2);
  // The lid's edge and a cross carved into it.
  ctx.fillStyle = "#454a58";
  ctx.fillRect(3, 4, w - 6, 1);
  ctx.fillRect(3, h - 4, w - 6, 1);
  ctx.fillStyle = "#8a7440";
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  ctx.fillRect(cx - 1, cy - Math.min(5, cy - 3), 2, Math.min(10, h - 6));
  ctx.fillRect(cx - Math.min(4, cx - 3), cy - 2, Math.min(8, w - 6), 2);
  ctx.fillStyle = "#3a3e4a";
  ctx.fillRect(1, h - 1, w - 2, front);
  ctx.fillStyle = "#2a2e38";
  for (let x = 5; x < w - 2; x += 8) ctx.fillRect(x, h + 1, 1, front - 3);
  return c;
}

/** A teleporter pad: a ring of lights round a glowing plate. Tinted per pair in the game. */
export function drawPad(r: number): HTMLCanvasElement {
  const size = r * 2 + 4;
  const [c, ctx] = canvas(size, size);
  const cx = size / 2;
  ctx.fillStyle = "#1b1020";
  ctx.beginPath();
  ctx.arc(cx, cx, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a7290";
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8f4ff";
  ctx.beginPath();
  ctx.arc(cx, cx, r - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(ang) * (r - 1) - 0.5), Math.round(cx + Math.sin(ang) * (r - 1) - 0.5), 1, 1);
  }
  return c;
}

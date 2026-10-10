// Cosmetic art, drawn in code like everything else: hats, gun skins, dash trail bits, and the baggage-claim lobby.
import type { Outfit } from "@lostluggage/sim";
import { SLOT_PALETTES } from "./colors";
import { drawSprite, SPRITES, type PixelSprite } from "./pixels";

/** Hats face right like the heroes. The bottom row sits on the hero's head. */
export const HATS: Record<string, PixelSprite> = {
  hat_party: {
    palette: { p: "#e05a9a", y: "#f2c14e" },
    rows: ["....W....", "...kpk...", "...kyk...", "..kpypk..", "..kypyk..", ".kpypypk.", ".kkkkkkk."],
  },
  hat_cone: {
    palette: { o: "#ff7a1a", O: "#c8501a" },
    rows: ["....k....", "...kok...", "...kWk...", "..koook..", "..kWWWk..", ".koooook.", "kOOOOOOOk", "kkkkkkkkk"],
  },
  hat_fish: {
    palette: { f: "#7ab0d8", F: "#4a7aa8", e: "#1b1020", p: "#e8a0b0" },
    rows: ["k...kkkkk..", "Fk.kfffffk.", "FFkffffWefk", "Fk.kFFFFFpk", "k...kkkkkk."],
  },
  hat_captain: {
    palette: { d: "#2a2f3a", y: "#f2c14e" },
    rows: ["..kkkkk...", ".kWWWWWk..", "kWWWyWWWk.", "kdddddddkk", "...kkkkkkk"],
  },
  hat_beanie: {
    palette: { r: "#e0533d", R: "#a33a24" },
    rows: ["...kWk...", "..kkWkk..", ".krrrrrk.", "krrrrrrrk", "kWWWWWWWk", "kRRRRRRRk", "kkkkkkkkk"],
  },
  hat_horns: {
    palette: { r: "#e0533d", R: "#a33a24" },
    rows: ["W........W", "rk......kr", "rRk....kRr", ".rRk..kRr.", "..kk..kk.."],
  },
  hat_iceberg: {
    palette: { c: "#9fd8ff", C: "#5fa3d8" },
    rows: ["....k....", "...kWk...", "..kWck...", "..kccck..", ".kcccCck.", "kcccCCCck", "kkkkkkkkk"],
  },
  hat_propeller: {
    palette: { p: "#8c5ad1", P: "#5d3a94", y: "#f2c14e", r: "#e0533d" },
    rows: ["rrrrkyyyy", "....k....", "...kpk...", "..kpypk..", "..kpppk..", ".kpyppPk.", "kpppppPPk", "kkkkkkkkk"],
  },
  hat_chef: {
    palette: { s: "#c9cfd6" },
    rows: [".kkk.kkk.", "kWWWkWWWk", "kWWWWWWWk", ".kWWWWWk.", ".kWWWWWk.", ".ksssssk.", ".kkkkkkk."],
  },
  hat_head: {
    palette: { f: "#f0c8a0", e: "#1b1020", n: "#9a6a42", p: "#e8a0a0" },
    rows: ["..knnk..", ".kffffk.", ".kfefek.", ".kpffpk.", ".kfeefk.", "..kffk..", "...kk..."],
  },
  hat_crown: {
    palette: { y: "#f2c14e", Y: "#c89a2a", r: "#e0533d", b: "#5fb3ff" },
    rows: ["y...y...y", "yk.kyk.ky", "yykyyykyy", "yyryybyry", "YYYYYYYYY", "kkkkkkkkk"],
  },
};

/** Where a hat sits on each hero, in sprite pixels from the feet (origin bottom-center), facing right. */
export const HAT_ANCHOR: Record<string, { x: number; y: number }> = {
  vanguard: { x: -0.5, y: -11 },
  gunslinger: { x: 0, y: -13 },
  tinker: { x: 0.5, y: -13 },
  warden: { x: 0, y: -11 },
};

const CASE_COLORS = [
  ["#3b6fd1", "#274a94"],
  ["#d1423a", "#8f2a26"],
  ["#3e9f5a", "#2a6b3d"],
  ["#8c5ad1", "#5d3a94"],
  ["#c8915a", "#8a5a3c"],
  ["#5a6270", "#3a3a46"],
] as const;
export const CASE_COUNT = CASE_COLORS.length;

export const GUN_ARCHETYPES = ["pistol", "shotgun", "smg", "sniper", "launcher"] as const;
const SKINS = ["skin_sticker", "skin_googly", "skin_candy", "skin_floral", "skin_gold"] as const;

/** Texture key for a gun in a skin. */
export const gunKey = (archetype: string, skin: string) => (skin ? `gun_${archetype}~${skin}` : `gun_${archetype}`);
export const hatKey = (id: string) => `hat~${id}`;

/** The "paint" pixels of a gun: everything that isn't outline, grip or a transparent gap. */
const PAINT = new Set(["m", "M", "n"]);

/** Repaints a gun sprite for a skin. */
function skinGun(base: PixelSprite, skin: string): PixelSprite {
  const rows = base.rows.map((r) => [...r]);
  const palette: Record<string, string> = { ...base.palette };
  const paint: [number, number][] = [];
  rows.forEach((r, y) => r.forEach((ch, x) => PAINT.has(ch) && paint.push([x, y])));
  const top = paint.filter(([, y]) => y === Math.min(...paint.map((q) => q[1])));
  const mid = top[Math.floor(top.length / 2)] ?? paint[0]!;
  switch (skin) {
    case "skin_gold":
      Object.assign(palette, { m: "#f2c14e", M: "#c89a2a", n: "#d8a83a", d: "#a87a1a" });
      break;
    case "skin_candy":
      Object.assign(palette, { 1: "#e0533d", 2: "#ffffff" });
      for (const [x, y] of paint) rows[y]![x] = (x + y) % 3 === 0 ? "2" : "1";
      break;
    case "skin_floral":
      Object.assign(palette, { 3: "#2ab0a0", 4: "#f29bb0", 5: "#f2c14e" });
      for (const [x, y] of paint) rows[y]![x] = (x * 3 + y * 2) % 5 === 0 ? "4" : (x + y * 3) % 7 === 0 ? "5" : "3";
      break;
    case "skin_sticker": {
      // A tiny white label with a red stripe, about where the brand would go.
      Object.assign(palette, { 6: "#e0533d" });
      const [x, y] = mid;
      rows[y]![x] = "W";
      if (PAINT.has(rows[y]![x + 1] ?? "")) rows[y]![x + 1] = "6";
      if (PAINT.has(rows[y]![x - 1] ?? "")) rows[y]![x - 1] = "W";
      break;
    }
    case "skin_googly": {
      // Two eyes on top of the barrel, looking down at what you're doing with it.
      const w = rows[0]!.length;
      const x = mid[0];
      let y = mid[1];
      if (y === 0) {
        rows.unshift(Array<string>(w).fill("."));
        y = 1;
      }
      for (const ex of [x - 1, x + 1]) {
        if (ex < 0 || ex >= w) continue;
        if (rows[y - 1]![ex] === ".") rows[y - 1]![ex] = "W";
        rows[y]![ex] = "e";
      }
      Object.assign(palette, { e: "#1b1020" });
      break;
    }
  }
  return { palette, rows: rows.map((r) => r.join("")) };
}

/** Every texture the cosmetics need, by key. */
export function cosmeticTextures(): Record<string, HTMLCanvasElement> {
  const out: Record<string, HTMLCanvasElement> = {};
  for (const [id, s] of Object.entries(HATS)) out[hatKey(id)] = drawSprite(s);
  for (const a of GUN_ARCHETYPES) for (const skin of SKINS) out[gunKey(a, skin)] = drawSprite(skinGun(SPRITES[`gun_${a}`]!, skin));
  out["fx-duck"] = drawSprite({ palette: { y: "#f2c14e", o: "#ff7a1a", e: "#1b1020" }, rows: ["..kk..", ".kyek.", "kkyyko", "kyyyyk", ".kkkk."] });
  out["fx-bubble"] = drawSprite({ palette: { c: "#9fe8ff" }, rows: [".ccc.", "cW..c", "c...c", "c...c", ".ccc."] });
  out["fx-receipt"] = drawSprite({ palette: { s: "#c9cfd6" }, rows: ["WWWW", "WssW", "WWWW", "WssW", "WWWW"] });
  out["fx-flake"] = drawSprite({ palette: { c: "#cfe8ff" }, rows: [".c.", "cWc", ".c."] });
  out["fx-note"] = drawSprite({ palette: {}, rows: ["..WW", "..WW", "..W.", "WWW.", "WWW."] });
  // Everyone's luggage on the carousel but yours.
  CASE_COLORS.forEach(([b, B], i) => (out[`case-${i}`] = drawSprite({ ...SPRITES.suitcase!, palette: { ...SPRITES.suitcase!.palette, b, B } })));
  return out;
}

// ---------------------------------------------------------------- HTML previews (wardrobe and home)

/** A still picture of a hero in an outfit, for the menu: hero, hat and gun skin on one small canvas. */
export function drawPreview(heroId: string, outfit: Outfit, slot = 0, archetype = "pistol"): HTMLCanvasElement {
  const base = SPRITES[heroId] ?? SPRITES.vanguard!;
  const hero = drawSprite({ ...base, palette: { ...base.palette, ...SLOT_PALETTES[slot] } });
  const hat = outfit.hat && HATS[outfit.hat] ? drawSprite(HATS[outfit.hat]!) : undefined;
  const gun = drawSprite(skinOrPlain(archetype, outfit.skin));
  const w = 28;
  const h = 26;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const feet = { x: Math.round(w / 2) - 2, y: h - 1 };
  ctx.fillStyle = "rgba(10,4,8,0.45)";
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y - 1, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(hero, feet.x - hero.width / 2, feet.y - hero.height);
  if (hat) {
    const a = HAT_ANCHOR[heroId] ?? HAT_ANCHOR.vanguard!;
    ctx.drawImage(hat, Math.round(feet.x + a.x - hat.width / 2), feet.y + a.y - hat.height);
  }
  ctx.drawImage(gun, feet.x + 2, feet.y - 9 - Math.floor(gun.height / 2));
  return c;
}

/** A gun as the armory shows it, in the skin you wear. */
export function drawGun(archetype: string, skin: string): HTMLCanvasElement {
  return drawSprite(skinOrPlain(archetype, skin));
}

function skinOrPlain(archetype: string, skin: string): PixelSprite {
  const base = SPRITES[`gun_${archetype}`] ?? SPRITES.gun_pistol!;
  return skin ? skinGun(base, skin) : base;
}

/** What each emote says in its speech bubble. */
export const EMOTE_LINES: Record<string, string> = {
  emote_wave: "HI!",
  emote_shrug: "MEH.",
  emote_bow: "THANK YOU!",
  emote_guitar: "WAAAH!",
  emote_laugh: "HA HA HA!",
  emote_floss: "LOOK AT ME",
};

const TRAIL_ICONS: Record<string, PixelSprite> = {
  trail_confetti: { palette: { p: "#e05a9a", y: "#f2c14e", c: "#5fd3e8", g: "#5fd36a" }, rows: ["p..y.", "..c..", "g...p", ".y.c.", "c..g."] },
  trail_bubbles: { palette: { c: "#9fe8ff" }, rows: [".ccc.", "cW..c", "c...c", "c...c", ".ccc."] },
  trail_ducks: { palette: { y: "#f2c14e", o: "#ff7a1a", e: "#1b1020" }, rows: ["..kk..", ".kyek.", "kkyyko", "kyyyyk", ".kkkk."] },
  trail_flames: { palette: { r: "#c8401a", o: "#ff7a1a", y: "#ffc14a" }, rows: ["..o..", ".oyo.", "oyyyo", "royor", ".rrr."] },
  trail_snow: { palette: { c: "#cfe8ff" }, rows: ["c.c.c", ".cWc.", "cWWWc", ".cWc.", "c.c.c"] },
  trail_receipts: { palette: { s: "#c9cfd6" }, rows: ["WWWW", "WssW", "WWWW", "WssW", "WWWW"] },
  trail_rainbow: { palette: { r: "#e0533d", o: "#ff9a2a", y: "#f2c14e", g: "#5fd36a", b: "#5fb3ff", p: "#b46cff" }, rows: ["rrrrrr", "oooooo", "yyyyyy", "gggggg", "bbbbbb", "pppppp"] },
};

/** A small icon for an item in the wardrobe. Emotes show their line instead. */
export function drawIcon(id: string): HTMLCanvasElement | undefined {
  if (HATS[id]) return drawSprite(HATS[id]!);
  if (id.startsWith("skin_")) return drawSprite(skinGun(SPRITES.gun_shotgun!, id));
  if (TRAIL_ICONS[id]) return drawSprite(TRAIL_ICONS[id]!);
  return undefined;
}

// ---------------------------------------------------------------- the lobby stage

/** Baggage claim: a back wall with a sign, a carousel, and a tiled floor. Heroes stand in front of the belt. */
export function drawLobby(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // Back wall.
  const wall = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  wall.addColorStop(0, "#1b1020");
  wall.addColorStop(1, "#3a2638");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  // Wall panels and windows onto the sea.
  for (let x = 12; x < w; x += 76) {
    ctx.fillStyle = "#2a1c30";
    ctx.fillRect(x, 22, 60, 50);
    const sea = ctx.createLinearGradient(0, 26, 0, 68);
    sea.addColorStop(0, "#2a3a6a");
    sea.addColorStop(0.55, "#e08a5a");
    sea.addColorStop(0.6, "#1f4a6e");
    sea.addColorStop(1, "#14304a");
    ctx.fillStyle = sea;
    ctx.fillRect(x + 4, 26, 52, 42);
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(x + 26, 46, 8, 3);
    ctx.fillStyle = "#1b1020";
    ctx.fillRect(x + 29, 26, 2, 42);
  }
  // Floor tiles, getting closer.
  const floorY = Math.round(h * 0.5);
  ctx.fillStyle = "#4a3a44";
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = "#3a2c36";
  for (let y = floorY, step = 6; y < h; y += step, step += 2) ctx.fillRect(0, y, w, 1);
  for (let x = -w; x < w * 2; x += 40) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + (x - w / 2) * 0.35, floorY);
    ctx.lineTo(x, h);
    ctx.lineTo(x + 1, h);
    ctx.lineTo(w / 2 + (x - w / 2) * 0.35 + 1, floorY);
    ctx.fill();
  }
  // The carousel's base, under the belt (the belt itself scrolls, see LobbyScene).
  ctx.fillStyle = "#6d7682";
  ctx.fillRect(0, floorY - 6, w, 4);
  ctx.fillStyle = "#2a2f3a";
  ctx.fillRect(0, floorY + 8, w, 8);
  ctx.fillStyle = "#1b1020";
  ctx.fillRect(0, floorY + 16, w, 2);
  // Hazard stripes along the front.
  for (let x = 0; x < w; x += 8) {
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(x, floorY + 10, 4, 3);
  }
  return c;
}

/** One link of the carousel belt; it tiles and scrolls. */
export function drawBelt(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 10;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3a3a46";
  ctx.fillRect(0, 0, 16, 10);
  ctx.fillStyle = "#565664";
  ctx.fillRect(0, 0, 15, 9);
  ctx.fillStyle = "#2a2a34";
  ctx.fillRect(15, 0, 1, 10);
  ctx.fillRect(0, 9, 16, 1);
  return c;
}

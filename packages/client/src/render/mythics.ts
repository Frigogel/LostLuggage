// Mythic art: each mythic has its own hand-drawn sprite (16x16, bigger and richer than any other item), and a framed,
// shimmering icon built around it for the armory and the pickup banner. The in-game pickup spins `mythic-rays` behind
// the sprite and cycles its glow through the mythic colors (see GameScene).
import { MYTHIC_GUNS, type Grenade, type GunData } from "@lostluggage/sim";
import { drawSprite, type PixelSprite } from "./pixels";

/** The mythic colors, in order: pearl teal, violet, pink, gold. Glows and beams cycle through them. */
export const MYTHIC_HUES = [0x62f5e0, 0xb46cff, 0xff6ad5, 0xffd34d];
const HUES_CSS = MYTHIC_HUES.map((c) => `#${c.toString(16).padStart(6, "0")}`);

/** The mythic color at time `t` (ms): a smooth walk around MYTHIC_HUES, one lap every `lap` ms. */
export function mythicHue(t: number, lap = 2400): number {
  const n = MYTHIC_HUES.length;
  const k = (((t / lap) % 1) + 1) % 1 * n;
  const a = MYTHIC_HUES[Math.floor(k) % n]!;
  const b = MYTHIC_HUES[(Math.floor(k) + 1) % n]!;
  const f = k - Math.floor(k);
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f) << sh;
  return mix(16) | mix(8) | mix(0);
}

export const MYTHIC_ART: Record<string, PixelSprite> = {
  // A shotgun with an envelope for a stock, and the arrow that sends it all back.
  return_to_sender: {
    palette: { t: "#3fe0c8", T: "#16857a", D: "#0d4f4a", g: "#ffd34d", G: "#c98a1a", e: "#f6eedb", E: "#cbbd9c", r: "#e0405a", m: "#ff6ad5", M: "#a8288c" },
    rows: [
      "...kk...........",
      "..kmk...........",
      ".kmmkkkkkkkkk...",
      "kmmmmmmmmmmmmk..",
      ".kmmkMMMMMMMMmk.",
      "..kmk.kkkkkkkMmk",
      "...kk.......kMmk",
      "kkkkkk.......kMk",
      "keeeekkkkkkkkkkk",
      "kerreGgtttttttgW",
      "keEEeGgTTTTTTTgk",
      "keeeeGgtttttttgW",
      "kkkkkGgDkkkkkkkk",
      "....kDDk........",
      "....kDDk........",
      "....kkkk........",
    ],
  },
  // A service pistol under a gold customs badge.
  customs_officer: {
    palette: { n: "#3b4fa8", N: "#25306e", s: "#a9bbff", g: "#ffd34d", G: "#c98a1a", r: "#e0405a", w: "#b07a4a", x: "#7a4f2c" },
    rows: [
      "..........k.....",
      ".........kgk....",
      "........kgggk...",
      "......kkggggGkk.",
      ".....kggggrggGGk",
      "......kgggrggGk.",
      ".......kggggGk..",
      "......kggkkGGk..",
      "kkkkkkkkkk.kkkk.",
      "ksssssssssssssk.",
      "knnnnnnnnnnnnnnW",
      "kNNNNNNNNNNNNNk.",
      "kkkkxwwkGGGkkk..",
      "...kxwwkG.Gk....",
      "...kxwwkkGGk....",
      "...kkkkk.kk.....",
    ],
  },
  // A twin-bell alarm clock, already drifting off.
  snooze_button: {
    palette: { b: "#8f7cff", B: "#5a46c8", l: "#c9c0ff", g: "#ffd34d", G: "#c98a1a", f: "#fff6e0", h: "#e0405a", z: "#7ff0ff" },
    rows: [
      ".kk.......kk..zz",
      "kggk.....kggk..z",
      "kgGkkkkkkkGgk.z.",
      ".kkbbbbbbbbkk.zz",
      "..kblllllbbBk...",
      ".kblkkkkkkkbBk..",
      ".kblkffffffkbk..",
      "kbblkfffhfffkbk.",
      "kbbkffffhfffkbk.",
      "kbbkfffhkfffkBk.",
      "kbbkffffffffkBk.",
      ".kbbkffffffkBBk.",
      ".kbbbkkkkkkBBk..",
      "..kBBBBBBBBBk...",
      ".kGk.kkkkk.kGk..",
      ".kk.........kk..",
    ],
  },
  // The flight recorder (they're really orange), playing it back.
  black_box: {
    palette: { o: "#ff8a1f", O: "#c4570c", y: "#ffd34d", d: "#2a2f3a", c: "#5ff2ff", C: "#1d9fb8", s: "#d9dde3" },
    rows: [
      "....kkkkkkkk....",
      "...kssssssssk...",
      "..kkkkkkkkkkkk..",
      ".kooooooooooook.",
      ".koddddcdddcOok.",
      ".kodddccddccOok.",
      ".koddccCdccCOok.",
      ".kodddcCddcCOok.",
      ".koddddCdddCOok.",
      ".kyykyykyykyyOk.",
      ".kkyykyykyykyyk.",
      ".kooooooooooook.",
      ".koOOOOOOOOOOOk.",
      ".kOOOOOOOOOOOOk.",
      "..kkkkkkkkkkkk..",
      "................",
    ],
  },
};

/** The mythic art id of a gun or grenade, or undefined for everything else. */
export function mythicArtId(item: GunData | Grenade): string | undefined {
  if ("perks" in item) return item.mythic && MYTHIC_ART[item.mythic] && MYTHIC_GUNS[item.mythic] ? item.mythic : undefined;
  return item.rarity === "mythic" && MYTHIC_ART[item.defId] ? item.defId : undefined;
}

/** The plain sprite, for the world: pickups, the HUD. */
export function drawMythicArt(id: string): HTMLCanvasElement {
  return drawSprite(MYTHIC_ART[id] ?? MYTHIC_ART.return_to_sender!);
}

/** The sprite's shape filled with one color: for glowing outlines. */
function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** A four-pointed pixel sparkle, `r` pixels from its middle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, px: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - px / 2, y - r * px, px, r * 2 * px);
  ctx.fillRect(x - r * px, y - px / 2, r * 2 * px, px);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - px / 2, y - px / 2, px, px);
}

/**
 * The framed icon: the sprite on a deep starry backdrop with pearly rays behind it, a chromatic glowing outline and
 * a notched gold-and-teal frame. `px` is screen pixels per sprite pixel. `phase` (0..1) turns the rays, so callers
 * can draw a few frames of it; the armory just spins a CSS ring around one.
 */
export function drawMythicIcon(id: string, px = 3, phase = 0): HTMLCanvasElement {
  const art = drawMythicArt(id);
  const pad = 4;
  const cells = art.width + pad * 2;
  const size = cells * px;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const mid = size / 2;

  // Backdrop: a violet glow in the middle fading to night at the edges.
  const bg = ctx.createRadialGradient(mid, mid * 0.9, size * 0.05, mid, mid, size * 0.72);
  bg.addColorStop(0, "#4a2a78");
  bg.addColorStop(0.55, "#22143e");
  bg.addColorStop(1, "#0c0716");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Rays: twelve soft wedges in the mythic colors.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12 + phase / 12) * Math.PI * 2;
    const a1 = a0 + Math.PI / 18;
    const ray = ctx.createRadialGradient(mid, mid, 0, mid, mid, size * 0.7);
    ray.addColorStop(0, `${HUES_CSS[i % HUES_CSS.length]}66`);
    ray.addColorStop(1, `${HUES_CSS[i % HUES_CSS.length]}00`);
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(mid, mid);
    ctx.arc(mid, mid, size * 0.75, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Dust: a few pinpricks of starlight, always in the same places for the same item.
  let seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const next = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#ffffff" : HUES_CSS[i % HUES_CSS.length]!;
    ctx.globalAlpha = 0.35 + next() * 0.5;
    ctx.fillRect(Math.floor(next() * cells) * px, Math.floor(next() * cells) * px, px, px);
  }
  ctx.globalAlpha = 1;

  // A chromatic halo around the sprite: teal to one side, pink to the other, gold above, violet below.
  const ox = pad * px;
  const w = art.width * px;
  const h = art.height * px;
  const halo: [number, number, string][] = [[-1, 0, HUES_CSS[0]!], [1, 0, HUES_CSS[2]!], [0, -1, HUES_CSS[3]!], [0, 1, HUES_CSS[1]!], [-1, -1, HUES_CSS[0]!], [1, 1, HUES_CSS[2]!], [1, -1, HUES_CSS[3]!], [-1, 1, HUES_CSS[1]!]];
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const [dx, dy, col] of halo) ctx.drawImage(silhouette(art, col), ox + dx * px, ox + dy * px, w, h);
  ctx.globalAlpha = 0.35;
  for (const [dx, dy, col] of halo) ctx.drawImage(silhouette(art, col), ox + dx * px * 2, ox + dy * px * 2, w, h);
  ctx.restore();
  ctx.drawImage(art, ox, ox, w, h);

  // Sparkles at the corners of the art.
  sparkle(ctx, px * 3, px * 3, 2, px, HUES_CSS[3]!);
  sparkle(ctx, size - px * 3, px * 5, 1, px, HUES_CSS[0]!);
  sparkle(ctx, size - px * 4, size - px * 3, 2, px, HUES_CSS[2]!);
  sparkle(ctx, px * 4, size - px * 5, 1, px, HUES_CSS[1]!);

  // The frame: a gold outer line, a teal inner line, with notched corners.
  ctx.fillStyle = "#ffd34d";
  ctx.fillRect(px, 0, size - px * 2, px);
  ctx.fillRect(px, size - px, size - px * 2, px);
  ctx.fillRect(0, px, px, size - px * 2);
  ctx.fillRect(size - px, px, px, size - px * 2);
  ctx.fillStyle = "#62f5e0";
  ctx.fillRect(px * 2, px, size - px * 4, px);
  ctx.fillRect(px * 2, size - px * 2, size - px * 4, px);
  ctx.fillRect(px, px * 2, px, size - px * 4);
  ctx.fillRect(size - px * 2, px * 2, px, size - px * 4);
  ctx.clearRect(0, 0, px, px);
  ctx.clearRect(size - px, 0, px, px);
  ctx.clearRect(0, size - px, px, px);
  ctx.clearRect(size - px, size - px, px, px);
  return c;
}

/** Soft white rays for behind a mythic pickup in the world (tinted and spun by the game). */
export function drawMythicRays(size = 48): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const mid = size / 2;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(mid, mid);
    ctx.arc(mid, mid, mid, a0, a0 + Math.PI / 11);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

import Phaser from "phaser";
import { ARENA, DOOR, HERO_IDS, PAD } from "@lostluggage/sim";
import { SLOT_PALETTES } from "../render/colors";
import { cosmeticTextures, drawBelt, drawLobby } from "../render/cosmetics";
import { drawMythicArt, drawMythicRays, MYTHIC_ART } from "../render/mythics";
import {
  BIOME_ART,
  drawCargoPod,
  drawCrate,
  drawCryptFloor,
  drawTombBlock,
  drawDoor,
  drawFloor,
  drawFont,
  drawGlow,
  drawIceBlock,
  drawIceFloor,
  drawLava,
  drawOrb,
  drawOrbitalFloor,
  drawPad,
  drawRing,
  drawSewerFloor,
  drawShadow,
  drawSprite,
  drawStoneBlock,
  drawVent,
  drawVignette,
  FONT_CELL,
  FONT_CHARS,
  SPRITES,
} from "../render/pixels";

export const FLOOR_PAD = 8;

/** Generates every texture in code, then hands over to the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    const add = (key: string, c: HTMLCanvasElement) => this.textures.addCanvas(key, c);

    for (const [key, s] of Object.entries(SPRITES)) add(key, drawSprite(s));
    // One recolored hero per party slot, so friends can tell each other apart.
    for (const hero of HERO_IDS) {
      const s = SPRITES[hero]!;
      SLOT_PALETTES.forEach((pal, i) => add(`${hero}_${i}`, drawSprite({ ...s, palette: { ...s.palette, ...pal } })));
    }
    for (const [key, c] of Object.entries(cosmeticTextures())) add(key, c);
    for (const id of Object.keys(MYTHIC_ART)) add(`mythic_${id}`, drawMythicArt(id));
    add("mythic-rays", drawMythicRays());
    add("lobby-bg", drawLobby(480, 270));
    add("belt", drawBelt());
    add("font", drawFont());
    add("glow", drawGlow(32));
    add("ring", drawRing(64, 3));
    add("shadow-s", drawShadow(10, 4));
    add("shadow-m", drawShadow(14, 5));
    add("shadow-l", drawShadow(18, 6));
    add("shadow-xl", drawShadow(30, 9));
    add("vignette", drawVignette(480, 270));
    add("lava", drawLava(64));
    add("sea-caverns", drawLava(64, BIOME_ART.caverns.sea));
    add("floor", drawFloor(ARENA.w, ARENA.h, FLOOR_PAD));
    add("floor-caverns", drawIceFloor(ARENA.w, ARENA.h, FLOOR_PAD));
    add("sea-sewers", drawLava(64, BIOME_ART.sewers.sea));
    add("floor-sewers", drawSewerFloor(ARENA.w, ARENA.h, FLOOR_PAD));
    add("sea-orbital", drawLava(64, BIOME_ART.orbital.sea));
    add("floor-orbital", drawOrbitalFloor(ARENA.w, ARENA.h, FLOOR_PAD));
    add("sea-crypt", drawLava(64, BIOME_ART.crypt.sea));
    add("floor-crypt", drawCryptFloor(ARENA.w, ARENA.h, FLOOR_PAD));
    add("pad", drawPad(PAD.radius + 2));
    add("vent", drawVent(18));
    add("door-closed", drawDoor(DOOR.w, DOOR.h, false));
    add("door-open", drawDoor(DOOR.w, DOOR.h, true));
    add("orb", drawOrb());

    const px = document.createElement("canvas");
    px.width = px.height = 2;
    const ctx = px.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 2, 2);
    add("px", px);

    const streak = document.createElement("canvas");
    streak.width = 10;
    streak.height = 2;
    const sctx = streak.getContext("2d")!;
    sctx.fillStyle = "#fff6c8";
    sctx.fillRect(0, 0, 10, 2);
    add("streak", streak);

    for (const size of [[32, 32], [48, 16]] as const) {
      add(`crate-${size[0]}x${size[1]}`, drawCrate(size[0], size[1]));
      add(`ice-${size[0]}x${size[1]}`, drawIceBlock(size[0], size[1]));
      add(`stone-${size[0]}x${size[1]}`, drawStoneBlock(size[0], size[1]));
      add(`pod-${size[0]}x${size[1]}`, drawCargoPod(size[0], size[1]));
      add(`tomb-${size[0]}x${size[1]}`, drawTombBlock(size[0], size[1]));
    }

    this.cache.bitmapFont.add(
      "pixel",
      Phaser.GameObjects.RetroFont.Parse(this, {
        image: "font",
        width: FONT_CELL.w,
        height: FONT_CELL.h,
        chars: FONT_CHARS,
        charsPerRow: FONT_CHARS.length,
        "spacing.x": 0,
        "spacing.y": 0,
        "offset.x": 0,
        "offset.y": 0,
        lineSpacing: 2,
      }),
    );

    // The menu (plain HTML over the canvas) decides what to start.
    this.game.events.emit("booted");
  }
}

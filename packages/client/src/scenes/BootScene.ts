import Phaser from "phaser";
import { ARENA, EXIT } from "@lostluggage/sim";
import { drawCrate, drawDoor, drawFloor, drawVent, drawFont, drawGlow, drawLava, drawRing, drawShadow, drawSprite, drawVignette, FONT_CELL, FONT_CHARS, SPRITES } from "../render/pixels";

export const FLOOR_PAD = 8;

/** Generates every texture in code, then starts the game and its HUD. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    const add = (key: string, c: HTMLCanvasElement) => this.textures.addCanvas(key, c);

    for (const [key, s] of Object.entries(SPRITES)) add(key, drawSprite(s));
    add("font", drawFont());
    add("glow", drawGlow(32));
    add("ring", drawRing(64, 3));
    add("shadow-s", drawShadow(10, 4));
    add("shadow-m", drawShadow(14, 5));
    add("shadow-l", drawShadow(18, 6));
    add("shadow-xl", drawShadow(30, 9));
    add("vignette", drawVignette(480, 270));
    add("lava", drawLava(64));
    add("floor", drawFloor(ARENA.w, ARENA.h, FLOOR_PAD));
    add("vent", drawVent(18));
    add("door-closed", drawDoor(EXIT.w, EXIT.h, false));
    add("door-open", drawDoor(EXIT.w, EXIT.h, true));

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

    for (const size of [[32, 32], [48, 16]] as const) add(`crate-${size[0]}x${size[1]}`, drawCrate(size[0], size[1]));

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

    this.scene.start("game");
    this.scene.launch("ui");
  }
}

// Dash trails: what a hero leaves behind mid-dash. Shared by runs (pooled images) and the lobby (throwaway ones).
import Phaser from "phaser";

export interface FxHost {
  scene: Phaser.Scene;
  take(key: string): Phaser.GameObjects.Image;
  give(img: Phaser.GameObjects.Image): void;
}

export interface TrailAt {
  /** Feet of the hero, where its sprite's origin is. */
  x: number;
  y: number;
  /** The hero's texture, for afterimages. */
  heroKey: string;
  flip: boolean;
  /** 1 in runs; the lobby draws heroes bigger. */
  scale: number;
  depth: number;
  /** Scene time in ms. */
  t: number;
}

const CONFETTI = [0xe05a9a, 0xf2c14e, 0x5fd3e8, 0x5fd36a, 0xb46cff];

/** Seconds between puffs while dashing: ducks need room to sit in a line. */
export function trailGap(trail: string): number {
  return trail === "trail_ducks" ? 0.06 : trail === "trail_bubbles" || trail === "trail_receipts" ? 0.04 : 0.025;
}

export function trailFx(host: FxHost, trail: string, at: TrailAt): void {
  const { scene } = host;
  const s = at.scale;
  const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const fade = (img: Phaser.GameObjects.Image, ms: number, extra: Record<string, unknown> = {}, delay = 0) =>
    scene.tweens.add({ targets: img, alpha: 0, duration: ms, delay, ...extra, onComplete: () => host.give(img) });
  const bit = (key: string, dx: number, dy: number) =>
    host
      .take(key)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setFlipX(false)
      .setPosition(at.x + dx * s, at.y + dy * s)
      .setScale(s)
      .setDepth(at.depth);
  const ghost = (tint: number) => {
    const g = host.take(at.heroKey).setBlendMode(Phaser.BlendModes.NORMAL).setOrigin(0.5, 1).setPosition(at.x, at.y).setFlipX(at.flip).setScale(s).setTintFill(tint).setAlpha(0.6).setDepth(at.depth);
    fade(g, 180);
  };

  switch (trail) {
    case "trail_rainbow":
      ghost(Phaser.Display.Color.HSVToRGB((at.t / 250) % 1, 0.75, 1).color as number);
      break;
    case "trail_confetti":
      for (let i = 0; i < 2; i++) {
        const c = bit("px", rnd(-4, 4), rnd(-10, -2)).setTint(CONFETTI[Math.floor(Math.random() * CONFETTI.length)]!).setScale(s * rnd(0.5, 1));
        fade(c, 600, { y: c.y + rnd(4, 10) * s, x: c.x + rnd(-6, 6) * s, angle: rnd(-180, 180) });
      }
      break;
    case "trail_bubbles": {
      const b = bit("fx-bubble", rnd(-3, 3), rnd(-10, -2)).setScale(s * rnd(0.5, 1)).setAlpha(0.9);
      fade(b, 650, { y: b.y - 10 * s, scale: s * 1.3 });
      break;
    }
    case "trail_ducks": {
      // They sit in a line where you were, then waddle off (fade).
      const d = bit("fx-duck", 0, -3).setFlipX(at.flip);
      fade(d, 300, {}, 450);
      break;
    }
    case "trail_flames": {
      const f = bit("glow", rnd(-2, 2), rnd(-8, -2)).setBlendMode(Phaser.BlendModes.ADD).setTint(Math.random() < 0.5 ? 0xff7a1a : 0xffc14a).setScale(s * 0.35);
      fade(f, 320, { y: f.y - 6 * s, scale: 0.05 });
      ghost(0xff7a1a);
      break;
    }
    case "trail_snow":
      for (let i = 0; i < 2; i++) {
        const f = bit("fx-flake", rnd(-5, 5), rnd(-12, 0));
        fade(f, 700, { y: f.y + rnd(4, 8) * s, x: f.x + rnd(-4, 4) * s, angle: 90 });
      }
      break;
    case "trail_receipts": {
      const r = bit("fx-receipt", rnd(-3, 3), rnd(-10, -4)).setAngle(rnd(-30, 30));
      fade(r, 700, { y: r.y + 8 * s, x: r.x + rnd(-6, 6) * s, angle: rnd(-120, 120) });
      break;
    }
    default:
      ghost(0x5fd3e8);
  }
}

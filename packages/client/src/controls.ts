import Phaser from "phaser";
import { EMPTY_INPUT, GRENADE, clampLen, gunStats, len, scale, sub, type Player, type PlayerInput, type Vec, type World } from "@lostluggage/sim";
import { sfx } from "./sfx";

export const SCREEN = { w: 480, h: 270 };
export const STICK_R = 26;
const DEADZONE = 5;
/** Resting spots for the touch pads, always drawn so thumbs know where to go. */
export const PADS = {
  move: { x: 50, y: 214 },
  aim: { x: 428, y: 220 },
};
/** A touch landing this close to a pad grabs it at its fixed center; farther out the stick floats under the thumb. */
const PAD_SNAP = STICK_R + 22;
/** A touch fire that can't happen yet (pips empty, between shots) is buffered this long. */
const FIRE_BUFFER_MS = 220;

export type ButtonId = "dash" | "skill" | "grenade" | "interact" | "emote" | "pause";
export interface Button {
  x: number;
  y: number;
  r: number;
}
// Radii are in internal pixels; scaled to a phone they stay at or above 48 CSS px.
export const BUTTONS: Record<ButtonId, Button> = {
  skill: { x: 404, y: 140, r: 19 },
  // Only shown (and tappable) while an item is in reach; kept away from where the aim thumb rests.
  interact: { x: 354, y: 150, r: 16 },
  grenade: { x: 452, y: 116, r: 14 },
  dash: { x: 450, y: 168, r: 16 },
  // Up under the weapon slots, out of the way of the fight thumbs.
  emote: { x: 460, y: 44, r: 14 },
  // Touch only (desktop has P/Esc), just left of the weapon slots. The HUD opens the menu itself.
  pause: { x: 380, y: 15, r: 12 },
};
export const WEAPON_SLOTS = [
  { x: 398, y: 4, w: 38, h: 22 },
  { x: 438, y: 4, w: 38, h: 22 },
];

export interface Stick {
  pointerId: number;
  base: Vec;
  /** Where the thumb first landed: a tap is judged from here, since a locked base isn't under the thumb. */
  start: Vec;
  cur: Vec;
}

export interface AimPreview {
  kind: "gun" | "grenade";
  /** World-space offset from the player. */
  offset: Vec;
}

export function stickValue(s: Stick): Vec {
  return scale(clampLen(sub(s.cur, s.base), STICK_R), 1 / STICK_R);
}

const isDragging = (s: Stick | undefined): s is Stick => !!s && len(sub(s.cur, s.start)) > DEADZONE;

function padStick(pointerId: number, at: Vec, pad: Vec): Stick {
  const base = len(sub(at, pad)) <= PAD_SNAP ? { ...pad } : { ...at };
  return { pointerId, base, start: { ...at }, cur: { ...at } };
}

export class Controls {
  touchMode = false;
  autoAimDesktop = false;
  moveStick?: Stick;
  aimStick?: Stick;
  grenadeStick?: Stick;
  pressed: Partial<Record<ButtonId, number>> = {};

  private mouseDown = false;
  private mouse: Vec = { x: SCREEN.w / 2, y: SCREEN.h / 2 };
  private fireLatch: { aim: Vec; auto: boolean; until: number } | null = null;
  private grenadeLatch: { aim: Vec } | null = null;
  private dashLatch = false;
  private skillLatch = false;
  private interactLatch = false;
  /** Emotes aren't sim input: the HUD takes this itself (see takeEmote). */
  private emoteLatch = false;
  /** Set by the HUD each frame: is there an item in reach for the pickup button? */
  interactAvailable = false;
  private swapLatch = false;
  private slotLatch: number | null = null;
  private gunRange = 190;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(
    scene: Phaser.Scene,
    private toWorld: (x: number, y: number) => Vec,
  ) {
    const input = scene.input;
    input.mouse?.disableContextMenu();
    this.keys = input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Q,ONE,TWO,T,M,F,G") as Record<string, Phaser.Input.Keyboard.Key>;

    const kb = input.keyboard!;
    kb.on("keydown", () => {
      sfx.unlock();
      this.touchMode = false;
    });
    kb.on("keydown-SPACE", () => (this.dashLatch = true));
    kb.on("keydown-E", () => (this.skillLatch = true));
    kb.on("keydown-F", () => (this.interactLatch = true));
    kb.on("keydown-G", () => (this.emoteLatch = true));
    kb.on("keydown-Q", () => (this.grenadeLatch = { aim: { x: NaN, y: NaN } }));
    kb.on("keydown-ONE", () => (this.slotLatch = 0));
    kb.on("keydown-TWO", () => (this.slotLatch = 1));
    kb.on("keydown-T", () => (this.autoAimDesktop = !this.autoAimDesktop));
    kb.on("keydown-M", () => (sfx.muted = !sfx.muted));

    input.on("wheel", () => (this.swapLatch = true));
    input.on("pointerdown", this.onDown, this);
    input.on("pointermove", this.onMove, this);
    input.on("pointerup", this.onUp, this);
    input.on("pointerupoutside", this.onUp, this);
    input.on("gameout", () => (this.mouseDown = false));
  }

  reset(): void {
    this.moveStick = this.aimStick = this.grenadeStick = undefined;
    this.mouseDown = false;
    this.fireLatch = this.grenadeLatch = null;
    this.emoteLatch = false;
    this.pressed = {};
  }

  /** True once per emote press. */
  takeEmote(): boolean {
    const e = this.emoteLatch;
    this.emoteLatch = false;
    return e;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    if (!p.wasTouch) {
      this.touchMode = false;
      this.mouse = { x: p.x, y: p.y };
      if (p.button === 2) this.skillLatch = true;
      else if (p.button === 0 && !this.hitWeaponSlot(p.x, p.y)) this.mouseDown = true;
      return;
    }

    this.touchMode = true;
    const at = { x: p.x, y: p.y };
    if (this.hitWeaponSlot(p.x, p.y)) return;
    const btn = this.hitButton(p.x, p.y);
    if (btn) {
      this.pressed[btn] = p.id;
      if (btn === "dash") this.dashLatch = true;
      else if (btn === "skill") this.skillLatch = true;
      else if (btn === "interact") this.interactLatch = true;
      else if (btn === "emote") this.emoteLatch = true;
      else if (btn === "pause") return;
      else if (!this.grenadeStick) this.grenadeStick = { pointerId: p.id, base: at, start: at, cur: at };
      return;
    }
    if (p.x < SCREEN.w * 0.45) {
      if (!this.moveStick) this.moveStick = padStick(p.id, at, PADS.move);
    } else if (!this.aimStick) {
      this.aimStick = padStick(p.id, at, PADS.aim);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) {
      // Ignore the synthetic mouse moves some phones send after a touch.
      if (Math.abs(p.x - this.mouse.x) + Math.abs(p.y - this.mouse.y) > 2 && !p.wasTouch) this.touchMode = false;
      this.mouse = { x: p.x, y: p.y };
      return;
    }
    for (const s of [this.moveStick, this.aimStick, this.grenadeStick]) {
      if (s && s.pointerId === p.id) s.cur = { x: p.x, y: p.y };
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) {
      if (p.button === 0) this.mouseDown = false;
      return;
    }
    for (const id of Object.keys(this.pressed) as ButtonId[]) if (this.pressed[id] === p.id) delete this.pressed[id];

    if (this.moveStick?.pointerId === p.id) this.moveStick = undefined;
    if (this.aimStick?.pointerId === p.id) {
      const s = this.aimStick;
      this.aimStick = undefined;
      // Tap = auto-aim at the nearest enemy; drag = aim, and the shot goes on release.
      const auto = !isDragging(s);
      this.fireLatch = {
        aim: auto ? { x: 0, y: 0 } : scale(stickValue(s), this.gunRange),
        auto,
        until: performance.now() + FIRE_BUFFER_MS,
      };
    }
    if (this.grenadeStick?.pointerId === p.id) {
      const s = this.grenadeStick;
      this.grenadeStick = undefined;
      this.grenadeLatch = { aim: isDragging(s) ? scale(stickValue(s), GRENADE.range) : { x: 0, y: 0 } };
    }
  }

  hitButton(x: number, y: number): ButtonId | undefined {
    for (const [id, b] of Object.entries(BUTTONS) as [ButtonId, Button][]) {
      if (id === "interact" && !this.interactAvailable) continue;
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 4) return id;
    }
    return undefined;
  }

  private hitWeaponSlot(x: number, y: number): boolean {
    const i = WEAPON_SLOTS.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
    if (i < 0) return false;
    this.slotLatch = i;
    return true;
  }

  /** Where the player is aiming right now, for drawing the aim guide. */
  aimPreview(player: Player): AimPreview | null {
    if (this.touchMode) {
      if (isDragging(this.grenadeStick)) return { kind: "grenade", offset: scale(stickValue(this.grenadeStick), GRENADE.range) };
      if (isDragging(this.aimStick)) return { kind: "gun", offset: scale(stickValue(this.aimStick), this.gunRange) };
      return null;
    }
    return { kind: "gun", offset: this.mouseOffset(player) };
  }

  private mouseOffset(player: Player): Vec {
    return sub(this.toWorld(this.mouse.x, this.mouse.y), player.pos);
  }

  private keyMove(): Vec {
    const k = this.keys;
    const x = (k.D!.isDown || k.RIGHT!.isDown ? 1 : 0) - (k.A!.isDown || k.LEFT!.isDown ? 1 : 0);
    const y = (k.S!.isDown || k.DOWN!.isDown ? 1 : 0) - (k.W!.isDown || k.UP!.isDown ? 1 : 0);
    return clampLen({ x, y }, 1);
  }

  /** Builds this tick's input and consumes one-shot presses. */
  build(_world: World, player: Player | undefined): PlayerInput {
    if (!player) return EMPTY_INPUT;
    const gun = player.guns[player.active]!;
    const def = gunStats(gun);
    this.gunRange = def.range;

    const inp: PlayerInput = { ...EMPTY_INPUT, move: this.keyMove() };
    if (this.moveStick) {
      const v = stickValue(this.moveStick);
      if (len(v) > 0.15) inp.move = v;
    }

    if (this.touchMode) {
      if (isDragging(this.aimStick)) inp.aim = scale(stickValue(this.aimStick), def.range);
      if (this.fireLatch) {
        const canFire = player.shotCd <= 0 && gun.pips >= 1 && player.burstLeft === 0 && !player.charging;
        if (canFire) {
          inp.fire = true;
          inp.aim = this.fireLatch.aim;
          inp.autoAim = this.fireLatch.auto;
          this.fireLatch = null;
        } else if (performance.now() > this.fireLatch.until) {
          this.fireLatch = null;
        }
      }
    } else {
      inp.aim = this.mouseOffset(player);
      inp.fire = this.mouseDown;
      inp.autoAim = this.autoAimDesktop;
    }

    inp.dash = this.dashLatch;
    inp.skill = this.skillLatch;
    inp.interact = this.interactLatch;
    inp.swap = this.swapLatch || (this.slotLatch !== null && this.slotLatch !== player.active);
    if (this.grenadeLatch) {
      inp.grenade = true;
      // Keyboard grenades (NaN marker) go where the mouse points.
      inp.grenadeAim = Number.isNaN(this.grenadeLatch.aim.x) ? this.mouseOffset(player) : this.grenadeLatch.aim;
    }
    this.dashLatch = this.skillLatch = this.swapLatch = this.interactLatch = false;
    this.slotLatch = null;
    this.grenadeLatch = null;
    return inp;
  }
}

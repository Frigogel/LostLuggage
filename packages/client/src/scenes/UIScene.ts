import Phaser from "phaser";
import { DASH, GRENADE, GUNS, HEROES, nearbyPickup, type SimEvent } from "@lostluggage/sim";
import { BUTTONS, Controls, SCREEN, STICK_R, WEAPON_SLOTS, stickValue, type ButtonId, type Stick } from "../controls";
import type { GameScene } from "./GameScene";

const BUTTON_LABELS: Record<ButtonId, { touch: string; keys: string }> = {
  skill: { touch: "DOME", keys: "E" },
  dash: { touch: "DASH", keys: "SPC" },
  grenade: { touch: "NADE", keys: "Q" },
};
const DESKTOP_HELP = "WASD MOVE  CLICK SHOOT  SPACE DASH  E DOME  Q NADE\n1/2 SWAP  T AUTO-AIM  M MUTE  P PAUSE";

export class UIScene extends Phaser.Scene {
  controls!: Controls;

  private gfx!: Phaser.GameObjects.Graphics;
  private hurtOverlay!: Phaser.GameObjects.Rectangle;
  private heroLabel!: Phaser.GameObjects.BitmapText;
  private hpText!: Phaser.GameObjects.BitmapText;
  private waveText!: Phaser.GameObjects.BitmapText;
  private killText!: Phaser.GameObjects.BitmapText;
  private buttonText = new Map<ButtonId, Phaser.GameObjects.BitmapText>();
  private banner!: Phaser.GameObjects.BitmapText;
  private subBanner!: Phaser.GameObjects.BitmapText;
  private pickupName!: Phaser.GameObjects.BitmapText;
  private pickupFlavor!: Phaser.GameObjects.BitmapText;
  private help!: Phaser.GameObjects.BitmapText;
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private panel?: Phaser.GameObjects.Container;
  private pausePanel?: Phaser.GameObjects.Container;

  constructor() {
    super("ui");
  }

  init(): void {
    // Scene instances are reused on restart, so drop references to the old run's objects.
    this.slotIcons = [];
    this.buttonText.clear();
    this.panel = undefined;
    this.pausePanel = undefined;
  }

  private get game_(): GameScene {
    return this.scene.get("game") as GameScene;
  }

  create(): void {
    const game = this.game_;
    this.controls = new Controls(this, (x, y) => {
      const p = game.cameras.main.getWorldPoint(x, y);
      return { x: p.x, y: p.y };
    });

    this.add.image(0, 0, "vignette").setOrigin(0);
    this.hurtOverlay = this.add.rectangle(0, 0, SCREEN.w, SCREEN.h, 0xe0533d, 0).setOrigin(0);
    this.gfx = this.add.graphics();

    const text = (x: number, y: number, s: string, size = 8) => this.add.bitmapText(x, y, "pixel", s, size).setLetterSpacing(-1);
    this.heroLabel = text(6, 4, HEROES.vanguard!.name.toUpperCase());
    this.hpText = text(110, 14, "");
    this.waveText = text(SCREEN.w / 2, 4, "").setOrigin(0.5, 0);
    this.killText = text(SCREEN.w / 2, 15, "").setOrigin(0.5, 0).setTint(0xc9cfd6);
    for (const id of Object.keys(BUTTONS) as ButtonId[]) {
      const b = BUTTONS[id];
      this.buttonText.set(id, text(b.x + 1, b.y, "").setOrigin(0.5));
    }
    WEAPON_SLOTS.forEach((s) => this.slotIcons.push(this.add.image(s.x + s.w / 2, s.y + 8, "gun_pistol")));

    this.banner = text(SCREEN.w / 2, 92, "", 16).setOrigin(0.5).setAlpha(0);
    this.subBanner = text(SCREEN.w / 2, 112, "", 8).setOrigin(0.5).setAlpha(0).setTint(0xffe08a);
    this.pickupName = text(SCREEN.w / 2, SCREEN.h - 50, "", 8).setOrigin(0.5).setTint(0xf2c14e);
    this.pickupFlavor = text(SCREEN.w / 2, SCREEN.h - 38, "", 8).setOrigin(0.5).setTint(0xc9cfd6);
    this.help = text(SCREEN.w / 2, SCREEN.h - 4, DESKTOP_HELP, 8).setOrigin(0.5, 1).setCenterAlign().setTint(0xc9cfd6);
    this.tweens.add({ targets: this.help, alpha: 0, delay: 12000, duration: 1500 });

    game.events.on("sim", this.onSim, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => game.events.off("sim", this.onSim, this));

    this.input.on("pointerdown", () => {
      if (this.game_.paused) this.unpause();
      else if (this.game_.world.gameOver && this.panel?.getData("ready")) this.restart();
      // Fullscreen needs a user gesture; on iPhone it only works once installed to the home screen.
      if (this.controls.touchMode && !this.scale.isFullscreen && this.sys.game.device.os.android) {
        try {
          this.scale.startFullscreen();
        } catch {
          /* not allowed: fine */
        }
      }
    });
    this.input.keyboard!.on("keydown-P", () => (this.game_.paused ? this.unpause() : this.pause()));
    this.input.keyboard!.on("keydown-ENTER", () => {
      if (this.game_.world.gameOver) this.restart();
    });
    this.input.keyboard!.on("keydown-ESC", () => (this.game_.paused ? this.unpause() : this.pause()));
  }

  private restart(): void {
    this.controls.reset();
    this.game_.scene.restart();
    this.scene.restart();
  }

  private pause(): void {
    if (this.game_.world.gameOver) return;
    this.game_.paused = true;
  }

  private unpause(): void {
    this.game_.resume();
    this.pausePanel?.destroy();
    this.pausePanel = undefined;
  }

  private showBanner(main: string, sub = "", tint = 0xffffff): void {
    this.banner.setText(main).setTint(tint).setAlpha(1).setScale(1.6);
    this.subBanner.setText(sub).setAlpha(sub ? 1 : 0);
    this.tweens.killTweensOf([this.banner, this.subBanner]);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: "Back.out" });
    this.tweens.add({ targets: [this.banner, this.subBanner], alpha: 0, delay: 1600, duration: 400 });
  }

  private onSim(events: SimEvent[]): void {
    const world = this.game_.world;
    for (const ev of events) {
      switch (ev.type) {
        case "waveStart":
          this.showBanner(`WAVE ${ev.wave}`, ev.wave === 1 ? "SURVIVE THE CARGO DECK" : "");
          break;
        case "waveCleared":
          this.showBanner("WAVE CLEAR!", "CATCH YOUR BREATH", 0x5fd36a);
          break;
        case "playerHurt":
          this.hurtOverlay.setAlpha(0.25);
          this.tweens.add({ targets: this.hurtOverlay, alpha: 0, duration: 250 });
          break;
        case "playerDowned":
          if (ev.canRevive) this.showBanner("DOWNED!", "SECOND WIND INCOMING...", 0xe0533d);
          break;
        case "playerRevived":
          this.showBanner("SECOND WIND!", "", 0x9ff3ff);
          break;
        case "pickup":
          this.showBanner(GUNS[ev.defId]!.name.toUpperCase(), GUNS[ev.defId]!.archetype.toUpperCase(), 0xf2c14e);
          break;
        case "gameOver":
          this.showGameOver(world.director.wave, world.director.kills);
          break;
      }
    }
  }

  private showGameOver(wave: number, kills: number): void {
    const c = this.add.container(SCREEN.w / 2, SCREEN.h / 2);
    const bg = this.add.rectangle(0, 0, 260, 110, 0x1b1020, 0.92).setStrokeStyle(2, 0xf2c14e);
    const t = (y: number, s: string, size: number, tint = 0xffffff) => this.add.bitmapText(0, y, "pixel", s, size).setOrigin(0.5).setLetterSpacing(-1).setTint(tint);
    c.add([
      bg,
      t(-34, "LUGGAGE LOST", 16, 0xe0533d),
      t(-8, `REACHED WAVE ${wave}   ${kills} KILLS`, 8),
      t(10, "THE CRUISE LINE IS NOT LIABLE.", 8, 0xc9cfd6),
      t(34, this.controls.touchMode ? "TAP TO TRY AGAIN" : "CLICK OR ENTER TO TRY AGAIN", 8, 0xf2c14e),
    ]);
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 350, ease: "Back.out", delay: 500 });
    // Ignore the taps that were already happening when you went down.
    this.time.delayedCall(1100, () => c.setData("ready", true));
    this.panel = c;
  }

  update(): void {
    const game = this.game_;
    const world = game?.world;
    if (!world) return;
    const p = world.players[0]!;
    const g = this.gfx;
    g.clear();

    if (game.paused && !this.pausePanel && !world.gameOver) {
      const c = this.add.container(SCREEN.w / 2, SCREEN.h / 2);
      c.add([
        this.add.rectangle(0, 0, SCREEN.w, SCREEN.h, 0x1b1020, 0.7),
        this.add.bitmapText(0, -8, "pixel", "PAUSED", 16).setOrigin(0.5).setLetterSpacing(-1),
        this.add.bitmapText(0, 14, "pixel", this.controls.touchMode ? "TAP TO RESUME" : "CLICK OR P TO RESUME", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xf2c14e),
      ]);
      this.pausePanel = c;
    }

    // Health.
    const hpW = 100;
    g.fillStyle(0x1b1020).fillRect(5, 14, hpW + 2, 8);
    g.fillStyle(0x3a2a30).fillRect(6, 15, hpW, 6);
    const frac = p.hp / p.maxHp;
    g.fillStyle(frac > 0.3 ? 0x5fd36a : 0xe0533d).fillRect(6, 15, Math.round(hpW * frac), 6);
    g.fillStyle(0xffffff, 0.25).fillRect(6, 15, Math.round(hpW * frac), 1);
    for (let i = 1; i < 6; i++) g.fillStyle(0x1b1020, 0.5).fillRect(6 + (hpW / 6) * i, 15, 1, 6);
    this.hpText.setText(`${Math.ceil(p.hp)}`);
    this.heroLabel.setText(p.selfRevives > 0 ? "VANGUARD" : "VANGUARD  NO SECOND WIND");

    this.waveText.setText(world.director.wave > 0 ? `WAVE ${world.director.wave}` : "GET READY");
    this.killText.setText(`${world.director.kills} KILLS`);

    // Weapon slots (tap to swap).
    WEAPON_SLOTS.forEach((s, i) => {
      const gun = p.guns[i]!;
      const def = GUNS[gun.defId]!;
      const active = i === p.active;
      g.fillStyle(0x1b1020, 0.8).fillRect(s.x, s.y, s.w, s.h);
      g.lineStyle(1, active ? 0xf2c14e : 0x5a5060).strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      this.slotIcons[i]!.setTexture("gun_" + def.archetype).setAlpha(active ? 1 : 0.5);
      const pw = Math.floor((s.w - 8) / def.pips) - 1;
      for (let k = 0; k < def.pips; k++) {
        const fill = Math.max(0, Math.min(1, gun.pips - k));
        const x = s.x + 4 + k * (pw + 1);
        g.fillStyle(0x4a3a2a).fillRect(x, s.y + s.h - 5, pw, 2);
        g.fillStyle(fill >= 1 ? 0xffb238 : 0xb07a30).fillRect(x, s.y + s.h - 5, Math.round(pw * fill), 2);
      }
    });

    // Action buttons with cooldown fills.
    const touch = this.controls.touchMode;
    this.drawButton("skill", p.skillCharge, p.skillCharge >= 1, 0x5fd3e8, touch);
    this.drawButton("dash", 1 - p.dashCd / (DASH.cooldownMs / 1000), p.dashCd <= 0, 0xffffff, touch);
    this.drawButton("grenade", 1 - p.grenadeCd / (GRENADE.cooldownMs / 1000), p.grenadeCd <= 0, 0x8fd18f, touch);

    // Joysticks.
    if (touch) {
      this.drawStick(this.controls.moveStick, 0xffffff);
      this.drawStick(this.controls.aimStick, 0xffb238);
      this.drawStick(this.controls.grenadeStick, 0x8fd18f);
    }
    this.help.setVisible(!touch);

    // Describe the gun on a pedestal you're standing near.
    const pk = nearbyPickup(world);
    if (pk) {
      const def = GUNS[pk.gun.defId]!;
      this.pickupName.setText(`${def.name.toUpperCase()} (${def.archetype.toUpperCase()})  STAND TO SWAP`);
      this.pickupFlavor.setText(`"${def.flavor.toUpperCase()}"`);
    } else {
      this.pickupName.setText("");
      this.pickupFlavor.setText("");
    }

    if (p.downed && p.reviveT !== Infinity) {
      this.subBanner.setText(`SECOND WIND IN ${Math.ceil(p.reviveT)}`).setAlpha(1);
    }
  }

  private drawButton(id: ButtonId, fill: number, ready: boolean, color: number, touch: boolean): void {
    const b = BUTTONS[id];
    const g = this.gfx;
    const pressed = this.controls.pressed[id] !== undefined;
    const r = touch ? b.r : Math.round(b.r * 0.75);
    g.fillStyle(0x1b1020, pressed ? 0.85 : 0.55).fillCircle(b.x, b.y, r);
    g.lineStyle(2, ready ? color : 0x5a5060, ready ? 1 : 0.8).strokeCircle(b.x, b.y, r);
    if (!ready && fill > 0) {
      g.lineStyle(2, color, 0.8)
        .beginPath()
        .arc(b.x, b.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, fill))
        .strokePath();
    }
    if (ready && id === "skill") {
      // The super glows when charged, Brawl Stars style.
      g.fillStyle(color, 0.25 + 0.15 * Math.sin(this.time.now * 0.008)).fillCircle(b.x, b.y, r - 2);
    }
    this.buttonText.get(id)!.setText(touch ? BUTTON_LABELS[id].touch : BUTTON_LABELS[id].keys).setTint(ready ? 0xffffff : 0x8a8090);
  }

  private drawStick(s: Stick | undefined, color: number): void {
    if (!s) return;
    const v = stickValue(s);
    const g = this.gfx;
    g.fillStyle(0x1b1020, 0.35).fillCircle(s.base.x, s.base.y, STICK_R);
    g.lineStyle(1, color, 0.5).strokeCircle(s.base.x, s.base.y, STICK_R);
    g.fillStyle(color, 0.7).fillCircle(s.base.x + v.x * STICK_R, s.base.y + v.y * STICK_R, 8);
  }
}


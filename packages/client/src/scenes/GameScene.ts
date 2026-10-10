import Phaser from "phaser";
import {
  createWorld,
  DT,
  EMPTY_INPUT,
  ENEMIES,
  GRENADE,
  GUNS,
  angleOf,
  len,
  step as simStep,
  type Enemy,
  type Player,
  type Projectile,
  type SimEvent,
  type Vec,
  type World,
} from "@lostluggage/sim";
import { sfx } from "../sfx";
import { FLOOR_PAD } from "./BootScene";
import type { UIScene } from "./UIScene";

const ENEMY_COLORS: Record<string, number[]> = {
  cone_rat: [0x8a7f7a, 0xff7a1a, 0xffffff],
  jet_boar: [0x8a5a3c, 0xa7b0bb, 0xffb238],
  mortar_beetle: [0x3e8f5a, 0x8fd18f, 0xa7b0bb],
};
const DEFENSE_COLORS = { flesh: 0xe0533d, armor: 0xf2c14e, shield: 0x5fb3ff };
const SHADOW_FOR = (r: number) => (r <= 5 ? "shadow-s" : r <= 7 ? "shadow-m" : "shadow-l");

const D = {
  lava: -1000,
  floor: -900,
  ground: -800, // telegraphs, shadows
  overlay: 5000, // bars, domes, aim guides
  air: 6000, // lobbed shots
  light: 7000,
  text: 8000,
};

interface EnemyView {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  faceLeft: boolean;
}

interface ProjView {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  paused = false;

  private acc = 0;
  private hitStop = 0;
  private prev = new Map<number, Vec>();
  private enemyViews = new Map<number, EnemyView>();
  private projViews = new Map<number, ProjView>();
  private pickupViews = new Map<number, { base: Phaser.GameObjects.Image; gun: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }>();
  private pools = new Map<string, Phaser.GameObjects.Image[]>();

  private pBody!: Phaser.GameObjects.Image;
  private pShadow!: Phaser.GameObjects.Image;
  private pGun!: Phaser.GameObjects.Image;
  private pLight!: Phaser.GameObjects.Image;
  private chargeGlow!: Phaser.GameObjects.Image;
  private gunKick = 0;
  private ghostTimer = 0;

  private ground!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private domeLights = new Map<number, Phaser.GameObjects.Image>();
  private lava!: Phaser.GameObjects.TileSprite;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private goo = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor() {
    super("game");
  }

  init(): void {
    // Scene instances are reused on restart, so reset all per-run state here.
    this.acc = 0;
    this.hitStop = 0;
    this.paused = false;
    this.prev.clear();
    this.enemyViews.clear();
    this.projViews.clear();
    this.pickupViews.clear();
    this.pools.clear();
    this.domeLights.clear();
    this.goo.clear();
  }

  get ui(): UIScene | undefined {
    const s = this.scene.get("ui") as UIScene | undefined;
    return s?.controls ? s : undefined;
  }

  create(): void {
    this.world = createWorld({ seed: (Math.random() * 2 ** 31) | 0 });
    const { w, h, obstacles } = this.world.arena;

    // Lava sea under the deck, with glow along the rim: atmosphere for the price of one tile.
    this.lava = this.add.tileSprite(-240, -240, w + 480, h + 480, "lava").setOrigin(0).setDepth(D.lava);
    this.add.image(-FLOOR_PAD, -FLOOR_PAD, "floor").setOrigin(0).setDepth(D.floor);
    for (let x = 0; x <= w; x += 60) {
      for (const y of [-14, h + 14]) this.lavaGlow(x, y);
    }
    for (let y = 30; y < h; y += 60) {
      for (const x of [-14, w + 14]) this.lavaGlow(x, y);
    }

    for (const o of obstacles) {
      this.add
        .image(o.x, o.y - 8, `crate-${o.w}x${o.h}`)
        .setOrigin(0)
        .setDepth(o.y + o.h);
    }

    this.ground = this.add.graphics().setDepth(D.ground);
    this.over = this.add.graphics().setDepth(D.overlay);

    // Particles.
    this.add.particles(0, 0, "px", {
      emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-200, -100, w + 400, h + 300) } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
      lifespan: { min: 2000, max: 4500 },
      speedY: { min: -26, max: -8 },
      speedX: { min: -6, max: 6 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffb238, 0xff7a1a, 0xffe08a],
      frequency: 45,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(D.light);
    this.sparks = this.add.particles(0, 0, "px", {
      lifespan: 220,
      speed: { min: 40, max: 120 },
      scale: { start: 0.6, end: 0 },
      tint: [0xffffff, 0xffe08a],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(D.light);
    this.fire = this.add.particles(0, 0, "px", {
      lifespan: { min: 250, max: 550 },
      speed: { min: 30, max: 140 },
      scale: { start: 1.6, end: 0 },
      tint: [0xffe08a, 0xffb238, 0xff7a1a, 0xe0533d],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(D.light);
    this.smoke = this.add.particles(0, 0, "px", {
      lifespan: { min: 500, max: 900 },
      speed: { min: 8, max: 40 },
      speedY: { min: -30, max: -10 },
      scale: { start: 2.5, end: 0.5 },
      alpha: { start: 0.45, end: 0 },
      tint: [0x2a2230, 0x3c3444],
      emitting: false,
    }).setDepth(D.overlay - 1);
    for (const [id, cols] of Object.entries(ENEMY_COLORS)) {
      this.goo.set(
        id,
        this.add.particles(0, 0, "px", {
          lifespan: { min: 250, max: 500 },
          speed: { min: 40, max: 130 },
          scale: { start: 1.3, end: 0 },
          tint: cols,
          emitting: false,
        }).setDepth(D.overlay - 2),
      );
    }

    // Player.
    const p = this.world.players[0]!;
    this.pShadow = this.add.image(0, 0, "shadow-m").setDepth(D.ground + 1);
    this.pBody = this.add.image(0, 0, "vanguard").setOrigin(0.5, 1);
    this.pGun = this.add.image(0, 0, "gun_pistol").setOrigin(0.15, 0.5);
    this.pLight = this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x5fb3ff).setAlpha(0.18).setScale(3).setDepth(D.light);
    this.chargeGlow = this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x9ff3ff).setDepth(D.light).setVisible(false);

    for (const pk of this.world.pickups) {
      this.pickupViews.set(pk.id, {
        base: this.add.image(pk.pos.x, pk.pos.y + 3, "pedestal").setDepth(pk.pos.y),
        gun: this.add.image(pk.pos.x, pk.pos.y - 6, "gun_" + GUNS[pk.gun.defId]!.archetype).setDepth(pk.pos.y + 1),
        glow: this.add.image(pk.pos.x, pk.pos.y - 4, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xf2c14e).setAlpha(0.35).setDepth(D.light),
      });
    }

    const cam = this.cameras.main;
    cam.setBounds(-120, -120, w + 240, h + 240);
    cam.centerOn(p.pos.x, p.pos.y);
    cam.setRoundPixels(true);

    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this));
  }

  private onHidden(): void {
    // Phones background the tab all the time: pause instead of dying off-screen.
    this.paused = true;
    sfx.suspend();
    this.ui?.controls.reset();
  }

  resume(): void {
    this.paused = false;
    this.acc = 0;
    sfx.unlock();
  }

  private lavaGlow(x: number, y: number): void {
    const g = this.add.image(x, y, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a1a).setScale(3.5).setAlpha(0.35).setDepth(D.floor + 1);
    this.tweens.add({ targets: g, alpha: 0.18, duration: 900 + Math.random() * 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 100) / 1000;
    const ui = this.ui;

    if (!this.paused) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.capturePrev();
        const input = ui ? ui.controls.build(this.world, this.world.players[0]) : EMPTY_INPUT;
        this.stepWorld(input);
        if (this.hitStop > 0) {
          this.acc = 0;
          break;
        }
      }
    }

    this.lava.tilePositionX += dt * 4;
    this.lava.tilePositionY += dt * 2;
    this.render(this.acc / DT, dt);
  }

  private stepWorld(input: typeof EMPTY_INPUT): void {
    simStep(this.world, [input]);
    for (const ev of this.world.events) this.onEvent(ev);
    this.events.emit("sim", this.world.events);
  }

  private capturePrev(): void {
    this.prev.clear();
    const w = this.world;
    for (const p of w.players) this.prev.set(p.id, { ...p.pos });
    for (const e of w.enemies) this.prev.set(e.id, { ...e.pos });
    for (const pr of w.projectiles) this.prev.set(pr.id, { ...pr.pos });
  }

  private lerpPos(id: number, cur: Vec, a: number): Vec {
    const p = this.prev.get(id);
    if (!p) return cur;
    return { x: p.x + (cur.x - p.x) * a, y: p.y + (cur.y - p.y) * a };
  }

  // ---------------------------------------------------------------- pooling

  private take(key: string): Phaser.GameObjects.Image {
    const img = this.pools.get(key)?.pop();
    if (img) return img.setVisible(true).setAlpha(1).setScale(1).setAngle(0).clearTint();
    return this.add.image(0, 0, key);
  }

  private give(img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    this.tweens.killTweensOf(img);
    const key = img.texture.key;
    let pool = this.pools.get(key);
    if (!pool) this.pools.set(key, (pool = []));
    pool.push(img);
  }

  /** Additive light sprite that fades out: muzzle flashes, impacts, explosions. */
  private flash(x: number, y: number, tint: number, size: number, ms: number, alpha = 0.9): void {
    const g = this.take("glow").setPosition(x, y).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(alpha).setDepth(D.light).setScale(size / 32);
    this.tweens.add({ targets: g, alpha: 0, scale: (size / 32) * 1.3, duration: ms, onComplete: () => this.give(g) });
  }

  private ringFx(x: number, y: number, radius: number, tint: number, ms: number): void {
    const r = this.take("ring").setPosition(x, y).setTint(tint).setDepth(D.overlay).setScale(0.1).setAlpha(0.9);
    this.tweens.add({ targets: r, scale: (radius * 2) / 64, alpha: 0, duration: ms, ease: "Cubic.out", onComplete: () => this.give(r) });
  }

  private floatText(x: number, y: number, text: string, tint: number, size = 8, ms = 600): void {
    const t = this.add.bitmapText(x, y, "pixel", text, size).setOrigin(0.5).setLetterSpacing(-1).setTint(tint).setDepth(D.text);
    this.tweens.add({ targets: t, y: y - 14, duration: ms, ease: "Cubic.out" });
    this.tweens.add({ targets: t, alpha: 0, delay: ms * 0.6, duration: ms * 0.4, onComplete: () => t.destroy() });
  }

  private shake(ms: number, intensity: number): void {
    this.cameras.main.shake(ms, intensity, false);
  }

  // ---------------------------------------------------------------- events → juice

  private onEvent(ev: SimEvent): void {
    switch (ev.type) {
      case "shot": {
        sfx.play(ev.archetype);
        const big = ev.archetype === "shotgun" || ev.archetype === "sniper";
        this.flash(ev.x, ev.y, 0xffd27a, big ? 22 : 12, 70);
        this.gunKick = ev.archetype === "sniper" || ev.archetype === "shotgun" ? 4 : 2;
        if (ev.archetype === "sniper") this.shake(90, 0.005);
        else if (ev.archetype === "shotgun" || ev.archetype === "launcher") this.shake(60, 0.003);
        break;
      }
      case "charge":
        sfx.play("charge");
        break;
      case "hit": {
        const big = ev.damage >= 30;
        this.floatText(ev.x + (Math.random() - 0.5) * 6, ev.y - 10, String(ev.damage), big ? 0xffe08a : 0xffffff, big ? 16 : 8);
        this.sparks.explode(3, ev.x, ev.y);
        sfx.play("hit");
        if (ev.kill) this.hitStop = Math.max(this.hitStop, 0.035);
        break;
      }
      case "enemyDied": {
        this.goo.get(ev.defId)?.explode(14, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xffffff, 26, 120, 0.7);
        this.smoke.explode(4, ev.x, ev.y);
        sfx.play("kill");
        this.shake(60, 0.002);
        const v = this.enemyViews.get(ev.id);
        if (v) {
          v.body.destroy();
          v.shadow.destroy();
          this.enemyViews.delete(ev.id);
        }
        break;
      }
      case "explosion": {
        const mine = ev.owner === "player";
        this.flash(ev.x, ev.y, mine ? 0xffb238 : 0xff6a3c, ev.radius * 3, 300);
        this.ringFx(ev.x, ev.y, ev.radius, mine ? 0xffe08a : 0xff6a3c, 260);
        this.fire.explode(mine ? 26 : 18, ev.x, ev.y);
        this.smoke.explode(8, ev.x, ev.y);
        this.shake(180, mine ? 0.006 : 0.004);
        sfx.play(mine ? "explode" : "mortarBoom");
        if (mine) this.hitStop = Math.max(this.hitStop, 0.04);
        break;
      }
      case "blocked":
        this.flash(ev.x, ev.y, 0x5fd3e8, 30, 200);
        this.ringFx(ev.x, ev.y, 14, 0x9ff3ff, 200);
        sfx.play("blocked");
        break;
      case "spark":
        this.sparks.explode(2, ev.x, ev.y);
        break;
      case "enemyWindup":
        sfx.play(ev.attack === "melee" ? "windupMelee" : ev.attack === "dash" ? "windupDash" : "windupLob");
        break;
      case "enemyAttack":
        if (ev.attack === "melee") sfx.play("bite");
        else if (ev.attack === "lobbedProjectile") sfx.play("mortarFire");
        break;
      case "bonk":
        this.floatText(ev.x, ev.y - 14, "BONK!", 0xffe08a, 8, 900);
        this.sparks.explode(8, ev.x, ev.y);
        this.shake(100, 0.004);
        sfx.play("bonk");
        break;
      case "playerHurt":
        this.shake(150, 0.008);
        this.hitStop = Math.max(this.hitStop, 0.06);
        sfx.play("hurt");
        navigator.vibrate?.(40);
        break;
      case "playerDowned":
        this.shake(300, 0.012);
        sfx.play("downed");
        navigator.vibrate?.([60, 40, 120]);
        break;
      case "playerRevived": {
        const p = this.world.players.find((pl) => pl.id === ev.id);
        if (p) {
          this.ringFx(p.pos.x, p.pos.y, 60, 0x9ff3ff, 400);
          this.flash(p.pos.x, p.pos.y, 0x9ff3ff, 120, 400);
        }
        sfx.play("revive");
        break;
      }
      case "dash": {
        const p = this.world.players.find((pl) => pl.id === ev.id);
        if (p) this.smoke.explode(5, p.pos.x, p.pos.y + 4);
        sfx.play("dash");
        break;
      }
      case "skill":
        this.flash(ev.x, ev.y, 0x5fd3e8, 140, 350);
        this.ringFx(ev.x, ev.y, 44, 0x9ff3ff, 300);
        this.shake(120, 0.004);
        sfx.play("skill");
        break;
      case "grenade":
        sfx.play("throw");
        break;
      case "swap":
        sfx.play("swap");
        break;
      case "pickup":
        sfx.play("pickup");
        break;
      case "enemySpawn": {
        const e = this.world.enemies.find((en) => en.id === ev.id);
        if (e) {
          this.smoke.explode(6, e.pos.x, e.pos.y);
          this.flash(e.pos.x, e.pos.y, 0xb48cff, 30, 200);
        }
        sfx.play("spawn");
        break;
      }
      case "waveStart":
        sfx.play("wave");
        break;
      case "waveCleared":
        sfx.play("clear");
        break;
    }
  }

  // ---------------------------------------------------------------- rendering

  private render(alpha: number, dt: number): void {
    const w = this.world;
    const t = this.time.now;
    this.ground.clear();
    this.over.clear();

    const player = w.players[0]!;
    const pp = this.lerpPos(player.id, player.pos, alpha);

    this.renderPickups(t);
    this.renderDomes(t);
    this.renderEnemies(alpha, t);
    this.renderProjectiles(alpha);
    this.renderPlayer(player, pp, dt, t);
    this.renderAimGuide(player, pp);

    // Camera leads slightly toward where you're facing.
    const cam = this.cameras.main;
    const tx = pp.x + player.facing.x * 18 - cam.width / 2;
    const ty = pp.y + player.facing.y * 12 - cam.height / 2;
    const k = Math.min(1, dt * 7);
    cam.setScroll(cam.scrollX + (tx - cam.scrollX) * k, cam.scrollY + (ty - cam.scrollY) * k);
  }

  private renderPlayer(p: Player, pos: Vec, dt: number, t: number): void {
    const moving = len(p.vel) > 5;
    const bob = moving && p.dashT <= 0 ? -Math.abs(Math.sin(t * 0.02)) * 1.5 : 0;
    const left = p.facing.x < 0;

    this.pShadow.setPosition(pos.x, pos.y + p.radius - 1);
    this.pBody.setPosition(pos.x, pos.y + p.radius + bob).setFlipX(left).setDepth(pos.y);
    this.pLight.setPosition(pos.x, pos.y);

    if (p.downed) {
      this.pBody.setAngle(left ? -90 : 90).setTint(0x9a8a9a).setAlpha(1);
      this.pGun.setVisible(false);
      this.chargeGlow.setVisible(false);
      return;
    }
    this.pBody.setAngle(0);
    if (p.hurtT > 0) this.pBody.setTintFill(0xffffff);
    else this.pBody.clearTint();
    // Blink while invulnerable after a hit (not during a dash: the trail shows that).
    this.pBody.setAlpha(p.iframes > 0 && p.dashT <= 0 && Math.floor(t / 60) % 2 === 0 ? 0.4 : 1);

    // Dash afterimages.
    if (p.dashT > 0) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.025;
        const g = this.take("vanguard").setOrigin(0.5, 1).setPosition(pos.x, pos.y + p.radius).setFlipX(left).setTintFill(0x5fd3e8).setAlpha(0.6).setDepth(pos.y - 1);
        this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => this.give(g) });
      }
    }

    // Gun in hand, with recoil.
    const gun = p.guns[p.active]!;
    const def = GUNS[gun.defId]!;
    const ang = angleOf(p.facing);
    this.gunKick = Math.max(0, this.gunKick - dt * 30);
    const hand = { x: pos.x + p.facing.x * (4 - this.gunKick), y: pos.y - 1 + bob + p.facing.y * (3 - this.gunKick) };
    this.pGun
      .setVisible(true)
      .setTexture("gun_" + def.archetype)
      .setPosition(hand.x, hand.y)
      .setRotation(ang)
      .setFlipY(left)
      .setDepth(pos.y + (p.facing.y < -0.3 ? -0.5 : 0.5));

    if (p.charging) {
      const k = 1 - p.chargeT / (def.chargeMs / 1000);
      this.chargeGlow
        .setVisible(true)
        .setPosition(hand.x + p.facing.x * 12, hand.y + p.facing.y * 12)
        .setScale(0.3 + k * 0.5)
        .setAlpha(0.5 + k * 0.5);
    } else this.chargeGlow.setVisible(false);

    // Brawl Stars-style ammo pips under your feet and health over your head.
    const o = this.over;
    const pipW = 7;
    const total = def.pips * (pipW + 1) - 1;
    const bx = Math.round(pos.x - total / 2);
    const by = Math.round(pos.y + p.radius + 3);
    for (let i = 0; i < def.pips; i++) {
      const fill = Math.max(0, Math.min(1, gun.pips - i));
      o.fillStyle(0x1b1020).fillRect(bx + i * (pipW + 1) - 1, by - 1, pipW + 2, 4);
      o.fillStyle(0x4a3a2a).fillRect(bx + i * (pipW + 1), by, pipW, 2);
      if (fill > 0) o.fillStyle(fill >= 1 ? 0xffb238 : 0xb07a30).fillRect(bx + i * (pipW + 1), by, Math.round(pipW * fill), 2);
    }
    const hpW = 18;
    const hx = Math.round(pos.x - hpW / 2);
    const hy = Math.round(pos.y - 14);
    o.fillStyle(0x1b1020).fillRect(hx - 1, hy - 1, hpW + 2, 4);
    o.fillStyle(p.hp / p.maxHp > 0.3 ? 0x5fd36a : 0xe0533d).fillRect(hx, hy, Math.round((hpW * p.hp) / p.maxHp), 2);
  }

  private renderEnemies(alpha: number, t: number): void {
    const w = this.world;
    const seen = new Set<number>();
    const g = this.ground;

    for (const e of w.enemies) {
      seen.add(e.id);
      const def = ENEMIES[e.defId]!;
      let v = this.enemyViews.get(e.id);
      if (!v) {
        v = {
          body: this.add.image(0, 0, e.defId).setOrigin(0.5, 1),
          shadow: this.add.image(0, 0, SHADOW_FOR(e.radius)).setDepth(D.ground + 1),
          faceLeft: false,
        };
        this.enemyViews.set(e.id, v);
      }
      const pos = this.lerpPos(e.id, e.pos, alpha);

      if (e.spawnT > 0) {
        // Arrival telegraph: a portal ring that closes in, so spawns are never unfair.
        const k = Math.min(1, e.spawnT / 0.8);
        g.lineStyle(1, 0xb48cff, 0.9 - k * 0.5).strokeCircle(pos.x, pos.y, e.radius + 2 + k * 10);
        g.fillStyle(0xb48cff, 0.15).fillCircle(pos.x, pos.y, e.radius + 2);
        v.body.setVisible(false);
        v.shadow.setVisible(false);
        continue;
      }
      v.body.setVisible(true);
      v.shadow.setVisible(true).setPosition(pos.x, pos.y + e.radius - 1);

      const target = w.players[0]!;
      const dx = e.state === "move" ? (Math.abs(e.vel.x) > 2 ? e.vel.x : target.pos.x - e.pos.x) : e.attackDir.x;
      if (Math.abs(dx) > 0.5) v.faceLeft = dx < 0;

      let sx = 1;
      let sy = 1;
      let jitter = 0;
      const atk = def.attacks[e.attackIdx]!;
      if (e.state === "windup") {
        const k = 1 - e.stateT / (atk.windupMs / 1000);
        sx = 1 + 0.15 * k;
        sy = 1 - 0.15 * k;
        if (atk.type === "dash") jitter = Math.sin(t * 0.08) * 1;
        this.drawTelegraph(e, pos, k, t);
      } else if (e.state === "attack") {
        sx = 1.15;
        sy = 0.9;
      } else if (e.state === "move") {
        sy = 1 + Math.sin(t * 0.025 + e.id) * 0.06;
      }

      v.body
        .setPosition(pos.x + jitter, pos.y + e.radius)
        .setFlipX(v.faceLeft)
        .setScale(sx, sy)
        .setDepth(pos.y);

      if (e.hitFlash > 0) v.body.setTintFill(0xffffff);
      else if (e.state === "windup" && atk.telegraph === "redFlash" && Math.floor(t / 70) % 2 === 0) v.body.setTintFill(0xff3030);
      else if (e.state === "windup") v.body.setTint(0xffb0a0);
      else v.body.clearTint();

      if (e.hp < e.maxHp) {
        const bw = Math.max(10, e.radius * 2 + 2);
        const bx = Math.round(pos.x - bw / 2);
        const by = Math.round(pos.y - e.radius - 9);
        this.over.fillStyle(0x1b1020).fillRect(bx - 1, by - 1, bw + 2, 4);
        this.over.fillStyle(DEFENSE_COLORS[def.defense]).fillRect(bx, by, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 2);
      }
    }

    for (const [id, v] of this.enemyViews) {
      if (seen.has(id)) continue;
      v.body.destroy();
      v.shadow.destroy();
      this.enemyViews.delete(id);
    }
  }

  /** Telegraphs stay serious even when the enemies aren't: red flash = melee, line = dash, circle = area. */
  private drawTelegraph(e: Enemy, pos: Vec, k: number, t: number): void {
    const def = ENEMIES[e.defId]!;
    const atk = def.attacks[e.attackIdx]!;
    const g = this.ground;
    if (atk.type === "dash") {
      const length = (atk.dashSpeed * atk.dashMs) / 1000;
      const ang = angleOf(e.attackDir);
      const wdt = e.radius * 2;
      const pts = [
        { x: 0, y: -wdt / 2 },
        { x: length, y: -wdt / 2 },
        { x: length, y: wdt / 2 },
        { x: 0, y: wdt / 2 },
      ].map((p) => ({ x: pos.x + p.x * Math.cos(ang) - p.y * Math.sin(ang), y: pos.y + p.x * Math.sin(ang) + p.y * Math.cos(ang) }));
      g.fillStyle(0xe0533d, 0.12 + 0.25 * k).fillPoints(pts, true);
      g.lineStyle(1, 0xff6a5a, 0.6 + 0.4 * Math.sin(t * 0.03)).strokePoints(pts, true);
      // Fill sweeps along the lane to show when it fires.
      const fillPts = [pts[0]!, { x: pts[0]!.x + (pts[1]!.x - pts[0]!.x) * k, y: pts[0]!.y + (pts[1]!.y - pts[0]!.y) * k }, { x: pts[3]!.x + (pts[2]!.x - pts[3]!.x) * k, y: pts[3]!.y + (pts[2]!.y - pts[3]!.y) * k }, pts[3]!];
      g.fillStyle(0xe0533d, 0.3).fillPoints(fillPts, true);
    } else if (atk.type === "lobbedProjectile") {
      this.groundCircle(e.attackPoint, atk.radius, k * 0.5, t);
    }
  }

  private groundCircle(at: Vec, r: number, k: number, t: number): void {
    const g = this.ground;
    g.fillStyle(0xe0533d, 0.1).fillCircle(at.x, at.y, r);
    g.fillStyle(0xe0533d, 0.3).fillCircle(at.x, at.y, Math.max(1, r * k));
    g.lineStyle(1, 0xff6a5a, 0.7 + 0.3 * Math.sin(t * 0.03)).strokeCircle(at.x, at.y, r);
  }

  private renderProjectiles(alpha: number): void {
    const w = this.world;
    const seen = new Set<number>();
    for (const pr of w.projectiles) {
      seen.add(pr.id);
      let v = this.projViews.get(pr.id);
      if (!v) {
        v = this.makeProjView(pr);
        this.projViews.set(pr.id, v);
      }
      const pos = this.lerpPos(pr.id, pr.pos, alpha);
      if (pr.lob) {
        const k = Math.min(1, (pr.lob.t + alpha * DT) / pr.lob.dur);
        const arc = 16 + pr.lob.dur * 40;
        const z = Math.sin(Math.PI * k) * arc;
        v.img.setPosition(pos.x, pos.y - z).setDepth(D.air).setAngle(pr.kind === "grenade" ? k * 720 : 0);
        v.glow.setPosition(pos.x, pos.y - z);
        v.shadow?.setPosition(pos.x, pos.y).setScale(1 - (z / arc) * 0.5);
        if (pr.owner === "enemy") this.groundCircle(pr.lob.to, pr.lob.radius, 0.5 + k * 0.5, this.time.now);
      } else {
        v.img.setPosition(pos.x, pos.y).setRotation(Math.atan2(pr.vel.y, pr.vel.x)).setDepth(pos.y + 1);
        v.glow.setPosition(pos.x, pos.y);
      }
    }
    for (const [id, v] of this.projViews) {
      if (seen.has(id)) continue;
      this.give(v.img);
      this.give(v.glow);
      if (v.shadow) this.give(v.shadow);
      this.projViews.delete(id);
    }
  }

  private makeProjView(pr: Projectile): ProjView {
    const glow = this.take("glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(D.light);
    if (pr.lob) {
      const key = pr.owner === "enemy" ? "mortar_shell" : pr.kind === "grenade" ? "grenade" : "shell";
      glow.setTint(pr.owner === "enemy" ? 0xff6a3c : 0xffd27a).setScale(0.5).setAlpha(0.6);
      return { img: this.take(key), glow, shadow: this.take("shadow-s").setDepth(D.ground + 1) };
    }
    const img = this.take(pr.kind === "sniper" ? "streak" : "px").setTint(0xfff6c8);
    if (pr.kind === "smg") img.setScale(0.75);
    glow.setTint(pr.kind === "sniper" ? 0x9ff3ff : 0xffb238).setScale(pr.kind === "sniper" ? 0.5 : 0.3).setAlpha(0.8);
    return { img, glow };
  }

  private renderDomes(t: number): void {
    const seen = new Set<number>();
    for (const d of this.world.domes) {
      seen.add(d.id);
      const fading = d.t < 1 && Math.floor(t / 80) % 2 === 0;
      const a = fading ? 0.4 : 1;
      this.over.fillStyle(0x5fd3e8, 0.1 * a).fillCircle(d.pos.x, d.pos.y, d.radius);
      this.over.lineStyle(1, 0x9ff3ff, 0.8 * a).strokeCircle(d.pos.x, d.pos.y, d.radius);
      this.over.lineStyle(1, 0x9ff3ff, 0.25 * a).strokeCircle(d.pos.x, d.pos.y, d.radius - 3 + Math.sin(t * 0.01) * 1.5);
      let light = this.domeLights.get(d.id);
      if (!light) {
        light = this.take("glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x5fd3e8).setDepth(D.light);
        this.domeLights.set(d.id, light);
      }
      light.setPosition(d.pos.x, d.pos.y).setScale((d.radius * 2.4) / 32).setAlpha(0.25 * a);
    }
    for (const [id, light] of this.domeLights) {
      if (seen.has(id)) continue;
      this.give(light);
      this.domeLights.delete(id);
    }
  }

  private renderPickups(t: number): void {
    for (const pk of this.world.pickups) {
      const v = this.pickupViews.get(pk.id)!;
      const arch = GUNS[pk.gun.defId]!.archetype;
      v.gun.setTexture("gun_" + arch).setY(pk.pos.y - 7 + Math.sin(t * 0.004 + pk.id) * 1.5);
      v.glow.setAlpha(0.25 + Math.sin(t * 0.005 + pk.id) * 0.1);
      if (pk.standT > 0) {
        this.over.lineStyle(2, 0xf2c14e, 1).beginPath().arc(pk.pos.x, pk.pos.y - 4, 12, -Math.PI / 2, -Math.PI / 2 + (pk.standT / 0.6) * Math.PI * 2).strokePath();
      }
    }
  }

  private renderAimGuide(p: Player, pos: Vec): void {
    const ui = this.ui;
    if (!ui || p.downed) return;
    const prev = ui.controls.aimPreview(p);
    if (!prev) return;
    const g = this.ground;

    if (prev.kind === "grenade") {
      const d = Math.min(len(prev.offset), GRENADE.range);
      const at = { x: pos.x + (prev.offset.x / (len(prev.offset) || 1)) * d, y: pos.y + (prev.offset.y / (len(prev.offset) || 1)) * d };
      g.lineStyle(1, 0xffffff, 0.6).strokeCircle(at.x, at.y, GRENADE.radius);
      g.fillStyle(0xffffff, 0.08).fillCircle(at.x, at.y, GRENADE.radius);
      return;
    }

    const def = GUNS[p.guns[p.active]!.defId]!;
    const dir = len(prev.offset) > 0.01 ? { x: prev.offset.x / len(prev.offset), y: prev.offset.y / len(prev.offset) } : p.facing;
    if (def.lob) {
      const d = Math.max(24, Math.min(def.range, len(prev.offset)));
      const at = { x: pos.x + dir.x * d, y: pos.y + dir.y * d };
      g.lineStyle(1, 0xffffff, 0.6).strokeCircle(at.x, at.y, def.lob.radius);
      g.fillStyle(0xffffff, 0.08).fillCircle(at.x, at.y, def.lob.radius);
      return;
    }
    // Touch only: on desktop the mouse cursor already shows the aim.
    if (!ui.controls.touchMode) return;
    const ang = angleOf(dir);
    const half = Math.max((def.spreadDeg * Math.PI) / 360, 0.04);
    g.fillStyle(0xffffff, 0.12).slice(pos.x, pos.y, def.range, ang - half, ang + half, false).fillPath();
  }
}


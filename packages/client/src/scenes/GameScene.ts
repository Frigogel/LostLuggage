import Phaser from "phaser";
import {
  createWorld,
  enterRoom,
  DT,
  EMPTY_INPUT,
  ENEMIES,
  GRENADE,
  angleOf,
  gunStats,
  interactable,
  len,
  step as simStep,
  ventState,
  type Enemy,
  type Pickup,
  type Player,
  type PlayerInput,
  type Projectile,
  type SimEvent,
  type Vec,
  type World,
} from "@lostluggage/sim";
import { DEFENSE_COLORS, ELEMENT_COLORS, ENEMY_COLORS, RARITY_COLORS, SHIELD_COLOR } from "../render/colors";
import { sfx } from "../sfx";
import { FLOOR_PAD } from "./BootScene";
import type { UIScene } from "./UIScene";

const SHADOW_FOR = (r: number) => (r <= 5 ? "shadow-s" : r <= 7 ? "shadow-m" : r <= 11 ? "shadow-l" : "shadow-xl");
const textureFor = (e: Enemy) => (e.defId === "vending_mimic" && e.state === "hidden" ? "vending_hidden" : e.defId);
const BEAM_HEIGHT = { common: 0, uncommon: 14, rare: 24, epic: 36, legendary: 64 };

const D = {
  lava: -1000,
  floor: -900,
  ground: -800, // telegraphs, puddles, shadows
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

interface PickupView {
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  beam?: Phaser.GameObjects.Image;
  key: string;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  paused = false;

  private acc = 0;
  private hitStop = 0;
  private prev = new Map<number, Vec>();
  private enemyViews = new Map<number, EnemyView>();
  private projViews = new Map<number, ProjView>();
  private pickupViews = new Map<number, PickupView>();
  private pools = new Map<string, Phaser.GameObjects.Image[]>();
  private roomObjs: Phaser.GameObjects.GameObject[] = [];
  private ventViews = new Map<number, { glow: Phaser.GameObjects.Image }>();
  private door?: Phaser.GameObjects.Image;
  private doorGlow?: Phaser.GameObjects.Image;
  private zaps: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];

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
  private flames!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ice!: Phaser.GameObjects.Particles.ParticleEmitter;
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
    this.ventViews.clear();
    this.goo.clear();
    this.roomObjs = [];
    this.zaps = [];
    this.door = this.doorGlow = undefined;
  }

  get ui(): UIScene | undefined {
    const s = this.scene.get("ui") as UIScene | undefined;
    return s?.controls ? s : undefined;
  }

  create(): void {
    // Dev shortcuts: ?seed=123 replays a run, ?room=4 jumps straight to a room.
    const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
    const seed = Number(params.get("seed")) || (Math.random() * 2 ** 31) | 0;
    this.world = createWorld({ seed });
    const room = Number(params.get("room"));
    if (room > 1 && room <= this.world.run.plans.length) enterRoom(this.world, room - 1);
    const { w, h } = this.world.arena;

    // Lava sea under the deck, with glow along the rim: atmosphere for the price of one tile.
    this.lava = this.add.tileSprite(-240, -240, w + 480, h + 480, "lava").setOrigin(0).setDepth(D.lava);
    this.add.image(-FLOOR_PAD, -FLOOR_PAD, "floor").setOrigin(0).setDepth(D.floor);
    for (let x = 0; x <= w; x += 60) {
      for (const y of [-14, h + 14]) this.lavaGlow(x, y);
    }
    for (let y = 30; y < h; y += 60) {
      for (const x of [-14, w + 14]) this.lavaGlow(x, y);
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
    // Rising flames: burning enemies and erupting vents.
    this.flames = this.add.particles(0, 0, "px", {
      lifespan: { min: 300, max: 700 },
      speedY: { min: -70, max: -25 },
      speedX: { min: -12, max: 12 },
      scale: { start: 1.3, end: 0 },
      tint: [0xffe08a, 0xffb238, 0xff7a1a],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(D.light);
    this.ice = this.add.particles(0, 0, "px", {
      lifespan: { min: 300, max: 600 },
      speed: { min: 20, max: 80 },
      scale: { start: 1.2, end: 0 },
      tint: [0xffffff, 0xd6f4ff, 0x9ff3ff],
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
    this.pShadow = this.add.image(0, 0, "shadow-m").setDepth(D.ground + 1);
    this.pBody = this.add.image(0, 0, "vanguard").setOrigin(0.5, 1);
    this.pGun = this.add.image(0, 0, "gun_pistol").setOrigin(0.15, 0.5);
    this.pLight = this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x5fb3ff).setAlpha(0.18).setScale(3).setDepth(D.light);
    this.chargeGlow = this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x9ff3ff).setDepth(D.light).setVisible(false);

    this.buildRoom();
    const p = this.world.players[0]!;
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

  /** Static room visuals: crates, vents and the exit hatch. Rebuilt on every room change. */
  private buildRoom(): void {
    for (const o of this.roomObjs) o.destroy();
    this.roomObjs = [];
    this.ventViews.clear();
    for (const v of this.enemyViews.values()) {
      v.body.destroy();
      v.shadow.destroy();
    }
    this.enemyViews.clear();
    for (const v of this.pickupViews.values()) this.destroyPickupView(v);
    this.pickupViews.clear();
    for (const v of this.projViews.values()) this.releaseProj(v);
    this.projViews.clear();

    const room = this.world.run.room;
    for (const o of this.world.arena.obstacles) {
      this.roomObjs.push(this.add.image(o.x, o.y - 8, `crate-${o.w}x${o.h}`).setOrigin(0).setDepth(o.y + o.h));
    }
    for (const v of room.vents) {
      this.roomObjs.push(this.add.image(v.pos.x, v.pos.y, "vent").setDepth(D.floor + 2));
      const glow = this.add.image(v.pos.x, v.pos.y, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a1a).setScale(1.6).setAlpha(0.2).setDepth(D.light);
      this.roomObjs.push(glow);
      this.ventViews.set(v.id, { glow });
    }
    const e = room.exit;
    this.door = this.add.image(e.x, e.y - 6, "door-closed").setOrigin(0).setDepth(D.floor + 3);
    this.doorGlow = this.add.image(e.x + e.w / 2, e.y + 4, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x5fd36a).setScale(2.5, 1.2).setAlpha(0).setDepth(D.light);
    this.roomObjs.push(this.door, this.doorGlow);
    this.setDoor(room.cleared);
  }

  private setDoor(open: boolean): void {
    this.door?.setTexture(open && !this.world.run.victory ? "door-open" : "door-closed");
    if (this.doorGlow) {
      this.tweens.killTweensOf(this.doorGlow);
      this.doorGlow.setAlpha(0);
      if (open && !this.world.run.victory) this.tweens.add({ targets: this.doorGlow, alpha: { from: 0.7, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
    }
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

  private stepWorld(input: PlayerInput): void {
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
    // Teleports (room changes) shouldn't smear across the screen.
    if (!p || Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y) > 60) return cur;
    return { x: p.x + (cur.x - p.x) * a, y: p.y + (cur.y - p.y) * a };
  }

  // ---------------------------------------------------------------- pooling

  private take(key: string): Phaser.GameObjects.Image {
    const img = this.pools.get(key)?.pop();
    if (img) return img.setVisible(true).setAlpha(1).setScale(1).setAngle(0).clearTint().setOrigin(0.5);
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

  private enemyById(id: number): Enemy | undefined {
    return this.world.enemies.find((e) => e.id === id);
  }

  // ---------------------------------------------------------------- events → juice

  private onEvent(ev: SimEvent): void {
    const player = this.world.players[0]!;
    switch (ev.type) {
      case "shot": {
        sfx.play(ev.archetype);
        const big = ev.archetype === "shotgun" || ev.archetype === "sniper";
        this.flash(ev.x, ev.y, ev.element === "none" ? 0xffd27a : ELEMENT_COLORS[ev.element], big ? 22 : 12, 70);
        this.gunKick = ev.archetype === "sniper" || ev.archetype === "shotgun" ? 4 : 2;
        if (ev.archetype === "sniper") this.shake(90, 0.005);
        else if (ev.archetype === "shotgun" || ev.archetype === "launcher") this.shake(60, 0.003);
        break;
      }
      case "charge":
        sfx.play("charge");
        break;
      case "hit": {
        // Burn ticks are small and orange; weak-point hits are big and gold; shield hits are blue.
        const burnTick = ev.element === "fire" && !ev.kill && ev.damage < 8 && !ev.weak;
        const tint = ev.shield ? SHIELD_COLOR : ev.weak ? 0xffe08a : burnTick ? 0xffb238 : 0xffffff;
        const size = ev.weak || ev.damage >= 30 ? 16 : 8;
        this.floatText(ev.x + (Math.random() - 0.5) * 8, ev.y - 10, String(ev.damage), tint, size);
        if (!burnTick) this.sparks.explode(3, ev.x, ev.y);
        sfx.play(ev.shield ? "shieldHit" : ev.weak ? "weakHit" : burnTick ? "burn" : "hit");
        if (ev.kill) this.hitStop = Math.max(this.hitStop, 0.035);
        break;
      }
      case "enemyDied": {
        const boss = ENEMIES[ev.defId]!.role === "boss";
        this.goo.get(ev.defId)?.explode(boss ? 60 : 14, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xffffff, boss ? 120 : 26, boss ? 500 : 120, 0.7);
        this.smoke.explode(boss ? 20 : 4, ev.x, ev.y);
        sfx.play(boss ? "explode" : "kill");
        this.shake(boss ? 600 : 60, boss ? 0.015 : 0.002);
        if (boss) this.hitStop = 0.25;
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
        const tint = ev.element !== "none" ? ELEMENT_COLORS[ev.element] : mine ? 0xffb238 : 0xff6a3c;
        this.flash(ev.x, ev.y, tint, ev.radius * 3, 300);
        this.ringFx(ev.x, ev.y, ev.radius, tint, 260);
        if (ev.element === "acid") this.goo.get("acid_slime")?.explode(10, ev.x, ev.y);
        else if (ev.element === "frost") this.ice.explode(14, ev.x, ev.y);
        else this.fire.explode(mine ? 26 : 18, ev.x, ev.y);
        this.smoke.explode(8, ev.x, ev.y);
        this.shake(180, mine ? 0.006 : 0.004);
        sfx.play(mine ? "explode" : ev.radius >= 36 ? "slam" : "mortarBoom");
        if (mine) this.hitStop = Math.max(this.hitStop, 0.04);
        break;
      }
      case "chain":
        this.zaps.push({ ...ev, t: 0.12 });
        sfx.play("zap");
        break;
      case "frozen": {
        const e = this.enemyById(ev.id);
        if (e) {
          this.ice.explode(12, e.pos.x, e.pos.y);
          this.floatText(e.pos.x, e.pos.y - 16, "FROZEN", 0xd6f4ff, 8, 700);
        }
        sfx.play("freeze");
        break;
      }
      case "shieldUp": {
        const e = this.enemyById(ev.id);
        if (e) this.ringFx(e.pos.x, e.pos.y, e.radius + 6, SHIELD_COLOR, 300);
        sfx.play("shieldUp");
        break;
      }
      case "shieldBroken":
        this.ringFx(ev.x, ev.y, 18, SHIELD_COLOR, 250);
        this.ice.explode(8, ev.x, ev.y);
        sfx.play("shieldBreak");
        break;
      case "blocked":
        this.flash(ev.x, ev.y, 0x5fd3e8, 30, 200);
        this.ringFx(ev.x, ev.y, 14, 0x9ff3ff, 200);
        sfx.play("blocked");
        break;
      case "spark":
        this.sparks.explode(2, ev.x, ev.y);
        break;
      case "enemyWindup": {
        const map: Record<string, string> = { melee: "windupMelee", dash: "windupDash", lobbedProjectile: "windupLob", slam: "windupLob", projectile: "windupMelee", summon: "summon", shieldAllies: "summon" };
        sfx.play(map[ev.attack] ?? "windupMelee");
        break;
      }
      case "enemyAttack":
        if (ev.attack === "melee") sfx.play("bite");
        else if (ev.attack === "lobbedProjectile") sfx.play("mortarFire");
        else if (ev.attack === "projectile") sfx.play("bolt");
        break;
      case "reveal": {
        const e = this.enemyById(ev.id);
        if (e) {
          this.floatText(e.pos.x, e.pos.y - 26, "!", 0xe0533d, 16, 600);
          this.smoke.explode(6, e.pos.x, e.pos.y);
        }
        this.shake(120, 0.004);
        sfx.play("reveal");
        break;
      }
      case "split":
        this.flash(ev.x, ev.y, 0xffb238, 40, 200);
        sfx.play("split");
        break;
      case "bossPhase": {
        const e = this.enemyById(ev.id);
        if (e) {
          this.ringFx(e.pos.x, e.pos.y, 70, 0xff7a1a, 500);
          this.flames.explode(30, e.pos.x, e.pos.y);
        }
        this.shake(400, 0.01);
        sfx.play("bossPhase");
        break;
      }
      case "bonk":
        this.floatText(ev.x, ev.y - 14, "BONK!", 0xffe08a, 8, 900);
        this.sparks.explode(8, ev.x, ev.y);
        this.shake(100, 0.004);
        sfx.play("bonk");
        break;
      case "ventWarn":
        sfx.play("ventWarn");
        break;
      case "ventErupt": {
        this.flames.explode(30, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xff7a1a, 80, 500);
        const near = Math.hypot(player.pos.x - ev.x, player.pos.y - ev.y) < 160;
        if (near) {
          this.shake(150, 0.004);
          sfx.play("ventErupt");
        }
        break;
      }
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
      case "playerRevived":
        this.ringFx(player.pos.x, player.pos.y, 60, 0x9ff3ff, 400);
        this.flash(player.pos.x, player.pos.y, 0x9ff3ff, 120, 400);
        sfx.play("revive");
        break;
      case "dash":
        this.smoke.explode(5, player.pos.x, player.pos.y + 4);
        sfx.play("dash");
        break;
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
      case "loot": {
        const c = RARITY_COLORS[ev.rarity];
        this.flash(ev.x, ev.y, c, ev.rarity === "legendary" ? 120 : 50, 500);
        if (ev.rarity === "legendary") {
          this.ringFx(ev.x, ev.y, 50, c, 600);
          this.shake(250, 0.006);
        }
        sfx.play(ev.rarity === "legendary" ? "lootLegendary" : ev.rarity === "common" || ev.rarity === "uncommon" ? "loot" : "lootRare");
        break;
      }
      case "heal":
        this.floatText(player.pos.x, player.pos.y - 18, `+${Math.round(ev.amount)}`, 0x5fd36a, 8, 700);
        this.flash(player.pos.x, player.pos.y, 0x5fd36a, 40, 300);
        sfx.play("heal");
        break;
      case "shrine":
        this.ringFx(player.pos.x, player.pos.y, 40, 0xf2c14e, 500);
        this.flash(player.pos.x, player.pos.y, 0xf2c14e, 100, 500);
        sfx.play("shrine");
        break;
      case "chestOpened":
        this.fire.explode(16, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xffe08a, 60, 400);
        sfx.play("chest");
        break;
      case "enemySpawn": {
        const e = this.enemyById(ev.id);
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
      case "roomCleared":
        sfx.play("clear");
        this.time.delayedCall(500, () => {
          this.setDoor(true);
          if (!this.world.run.victory) sfx.play("door");
        });
        break;
      case "roomEnter":
        this.cameras.main.fadeIn(350, 27, 16, 32);
        this.buildRoom();
        this.cameras.main.centerOn(player.pos.x, player.pos.y);
        this.prev.clear();
        break;
      case "victory":
        sfx.play("victory");
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

    this.renderVents(t);
    this.renderHazards(t);
    this.renderPickups(t);
    this.renderDomes(t);
    this.renderEnemies(alpha, t);
    this.renderProjectiles(alpha);
    this.renderPlayer(player, pp, dt, t);
    this.renderAimGuide(player, pp);
    this.renderZaps(dt);

    // Camera leads slightly toward where you're facing.
    const cam = this.cameras.main;
    const tx = pp.x + player.facing.x * 18 - cam.width / 2;
    const ty = pp.y + player.facing.y * 12 - cam.height / 2;
    const k = Math.min(1, dt * 7);
    cam.setScroll(cam.scrollX + (tx - cam.scrollX) * k, cam.scrollY + (ty - cam.scrollY) * k);
  }

  private renderVents(t: number): void {
    const g = this.ground;
    for (const v of this.world.run.room.vents) {
      const view = this.ventViews.get(v.id);
      const state = ventState(v);
      if (state === "warn") {
        // Warning: the grate glows and a ring pulses so you know to step off.
        const k = ((v.t % v.periodS) - (v.periodS - v.eruptS - v.warnS)) / v.warnS;
        g.fillStyle(0xff6a3c, 0.12 + 0.2 * k).fillCircle(v.pos.x, v.pos.y, v.radius);
        g.lineStyle(1, 0xff6a5a, 0.6 + 0.4 * Math.sin(t * 0.04)).strokeCircle(v.pos.x, v.pos.y, v.radius);
        view?.glow.setAlpha(0.3 + 0.4 * k).setScale(1.6 + k);
      } else if (state === "erupt") {
        g.fillStyle(0xffb238, 0.35).fillCircle(v.pos.x, v.pos.y, v.radius);
        view?.glow.setAlpha(0.9).setScale(3.2 + Math.sin(t * 0.05) * 0.3);
        if (Math.random() < 0.8) this.flames.explode(3, v.pos.x + (Math.random() - 0.5) * v.radius, v.pos.y + (Math.random() - 0.5) * v.radius);
      } else {
        view?.glow.setAlpha(0.18 + Math.sin(t * 0.003 + v.id) * 0.05).setScale(1.6);
      }
    }
  }

  private renderHazards(t: number): void {
    const g = this.ground;
    for (const h of this.world.hazards) {
      const k = Math.min(1, h.t / 0.6); // fade out at the end
      const grow = Math.min(1, (h.maxT - h.t) / 0.25); // and pop in at the start
      const r = h.radius * grow;
      g.fillStyle(0x4fa63a, 0.45 * k).fillEllipse(h.pos.x, h.pos.y, r * 2, r * 1.5);
      g.fillStyle(0x7ee05a, 0.35 * k).fillEllipse(h.pos.x - 1, h.pos.y - 1, r * 1.4, r);
      // Bubbles.
      const b = (t * 0.002 + h.id) % 1;
      g.fillStyle(0xc8ff9a, 0.6 * k * (1 - b)).fillCircle(h.pos.x + Math.sin(h.id) * r * 0.4, h.pos.y + Math.cos(h.id) * r * 0.3, 1 + b);
    }
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

    if (p.dashT > 0) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.025;
        const g = this.take("vanguard").setOrigin(0.5, 1).setPosition(pos.x, pos.y + p.radius).setFlipX(left).setTintFill(0x5fd3e8).setAlpha(0.6).setDepth(pos.y - 1);
        this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => this.give(g) });
      }
    }

    // Gun in hand, with recoil and an element glint.
    const gun = p.guns[p.active]!;
    const s = gunStats(gun);
    const ang = angleOf(p.facing);
    this.gunKick = Math.max(0, this.gunKick - dt * 30);
    const hand = { x: pos.x + p.facing.x * (4 - this.gunKick), y: pos.y - 1 + bob + p.facing.y * (3 - this.gunKick) };
    this.pGun
      .setVisible(true)
      .setTexture("gun_" + s.archetype)
      .setPosition(hand.x, hand.y)
      .setRotation(ang)
      .setFlipY(left)
      .setDepth(pos.y + (p.facing.y < -0.3 ? -0.5 : 0.5));
    if (gun.element !== "none" && Math.floor(t / 400) % 3 === 0) this.pGun.setTint(ELEMENT_COLORS[gun.element]);
    else this.pGun.clearTint();

    if (p.charging) {
      const k = 1 - p.chargeT / (s.chargeMs / 1000);
      this.chargeGlow
        .setVisible(true)
        .setTint(gun.element === "none" ? 0x9ff3ff : ELEMENT_COLORS[gun.element])
        .setPosition(hand.x + p.facing.x * 12, hand.y + p.facing.y * 12)
        .setScale(0.3 + k * 0.5)
        .setAlpha(0.5 + k * 0.5);
    } else this.chargeGlow.setVisible(false);

    // Brawl Stars-style ammo pips under your feet and health over your head.
    const o = this.over;
    const pipW = s.pips > 3 ? 5 : 7;
    const total = s.pips * (pipW + 1) - 1;
    const bx = Math.round(pos.x - total / 2);
    const by = Math.round(pos.y + p.radius + 3);
    for (let i = 0; i < s.pips; i++) {
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
          body: this.add.image(0, 0, textureFor(e)).setOrigin(0.5, 1),
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
      v.body.setVisible(true).setTexture(textureFor(e));
      v.shadow.setVisible(true).setPosition(pos.x, pos.y + e.radius - 1);

      const target = w.players[0]!;
      if (e.state !== "hidden" && def.movement.type !== "stationary") {
        const dx = e.state === "move" ? (Math.abs(e.vel.x) > 2 ? e.vel.x : target.pos.x - e.pos.x) : e.attackDir.x;
        if (Math.abs(dx) > 0.5) v.faceLeft = dx < 0;
      }

      let sx = 1;
      let sy = 1;
      let jitter = 0;
      let hover = 0;
      const atk = def.attacks[e.attackIdx]!;
      const frozen = e.status.frozenT > 0;
      if (e.state === "hidden") {
        // A careful player can spot the tell: the "machine" breathes, just barely.
        sy = 1 + Math.max(0, Math.sin(t * 0.004 + e.id)) * 0.02;
      } else if (e.state === "reveal") {
        jitter = Math.sin(t * 0.1) * 2;
        sy = 1.1;
      } else if (e.state === "windup" && !frozen) {
        const k = 1 - e.stateT / (atk.windupMs / 1000);
        sx = 1 + 0.15 * k;
        sy = 1 - 0.15 * k;
        if (atk.type === "dash" || atk.type === "summon") jitter = Math.sin(t * 0.08) * 1;
        this.drawTelegraph(e, pos, k, t);
      } else if (e.state === "attack") {
        sx = 1.15;
        sy = 0.9;
      } else if (e.state === "move" && !frozen) {
        sy = 1 + Math.sin(t * 0.025 + e.id) * 0.06;
      }
      if (e.defId === "hover_wizard") hover = -3 + Math.sin(t * 0.006 + e.id) * 1.5;

      v.body
        .setPosition(pos.x + jitter, pos.y + e.radius + hover)
        .setFlipX(v.faceLeft)
        .setScale(sx, sy)
        .setDepth(pos.y);

      // Tint priority: hit flash > red telegraph > frozen > burning > acid > chilled.
      const s = e.status;
      if (e.hitFlash > 0) v.body.setTintFill(0xffffff);
      else if (e.state === "windup" && atk.telegraph === "redFlash" && Math.floor(t / 70) % 2 === 0) v.body.setTintFill(0xff3030);
      else if (frozen) v.body.setTint(0xa8e4ff);
      else if (e.state === "windup") v.body.setTint(0xffb0a0);
      else if (s.burnT > 0) v.body.setTint(0xffc090);
      else if (s.acidT > 0) v.body.setTint(0xb8ff9a);
      else if (s.frost > 0.5) v.body.setTint(0xcfefff);
      else v.body.clearTint();

      if (s.burnT > 0 && Math.random() < 0.3) this.flames.explode(1, pos.x + (Math.random() - 0.5) * e.radius, pos.y - e.radius * 0.5);
      if (frozen) {
        this.over.lineStyle(1, 0xd6f4ff, 0.8).strokeRect(Math.round(pos.x - e.radius - 1), Math.round(pos.y - e.radius * 2), e.radius * 2 + 2, e.radius * 2 + 2);
      }
      if (s.acidT > 0 && Math.random() < 0.15) this.goo.get("acid_slime")?.explode(1, pos.x, pos.y);

      if (e.shield > 0) {
        this.over.lineStyle(1, SHIELD_COLOR, 0.5 + 0.3 * Math.sin(t * 0.01 + e.id)).strokeCircle(pos.x, pos.y - e.radius * 0.6, e.radius + 4);
      }

      // Bars: red/yellow/blue health by defense, with a blue support-shield bar above. Bosses use the HUD bar.
      if (def.role !== "boss" && e.state !== "hidden" && (e.hp < e.maxHp || e.shield > 0)) {
        const bw = Math.max(10, e.radius * 2 + 2);
        const bx = Math.round(pos.x - bw / 2);
        const by = Math.round(pos.y - e.radius * 2 - 6);
        this.over.fillStyle(0x1b1020).fillRect(bx - 1, by - 1, bw + 2, 4);
        this.over.fillStyle(DEFENSE_COLORS[def.defense]).fillRect(bx, by, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 2);
        if (e.shield > 0) {
          this.over.fillStyle(0x1b1020).fillRect(bx - 1, by - 4, bw + 2, 3);
          this.over.fillStyle(SHIELD_COLOR).fillRect(bx, by - 3, Math.max(1, Math.round(bw * Math.min(1, e.shield / 35))), 1);
        }
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
    switch (atk.type) {
      case "dash": {
        const length = (atk.dashSpeed * atk.dashMs) / 1000;
        const ang = angleOf(e.attackDir);
        const wdt = e.radius * 2;
        const pt = (x: number, y: number) => ({ x: pos.x + x * Math.cos(ang) - y * Math.sin(ang), y: pos.y + x * Math.sin(ang) + y * Math.cos(ang) });
        const pts = [pt(0, -wdt / 2), pt(length, -wdt / 2), pt(length, wdt / 2), pt(0, wdt / 2)];
        g.fillStyle(0xe0533d, 0.12 + 0.25 * k).fillPoints(pts, true);
        g.lineStyle(1, 0xff6a5a, 0.6 + 0.4 * Math.sin(t * 0.03)).strokePoints(pts, true);
        // Fill sweeps along the lane to show when it fires.
        g.fillStyle(0xe0533d, 0.3).fillPoints([pt(0, -wdt / 2), pt(length * k, -wdt / 2), pt(length * k, wdt / 2), pt(0, wdt / 2)], true);
        break;
      }
      case "lobbedProjectile":
        for (const p of e.attackPoints) this.groundCircle(p, atk.radius, k * 0.5, t, atk.puddle ? 0x7ee05a : 0xe0533d);
        break;
      case "slam":
        this.groundCircle(e.pos, atk.radius, k, t);
        break;
      case "shieldAllies":
        g.lineStyle(1, SHIELD_COLOR, 0.3 + 0.3 * k).strokeCircle(pos.x, pos.y, atk.radius * k);
        this.over.fillStyle(SHIELD_COLOR, 0.25 * k).fillCircle(pos.x, pos.y - e.radius, 4 + 6 * k);
        break;
      case "summon":
        g.lineStyle(1, 0xb48cff, 0.4 + 0.5 * k).strokeCircle(pos.x, pos.y, e.radius + 4 + 10 * (1 - k));
        break;
    }
  }

  private groundCircle(at: Vec, r: number, k: number, t: number, color = 0xe0533d): void {
    const g = this.ground;
    g.fillStyle(color, 0.1).fillCircle(at.x, at.y, r);
    g.fillStyle(color, 0.3).fillCircle(at.x, at.y, Math.max(1, r * k));
    g.lineStyle(1, color === 0xe0533d ? 0xff6a5a : color, 0.7 + 0.3 * Math.sin(t * 0.03)).strokeCircle(at.x, at.y, r);
  }

  private renderZaps(dt: number): void {
    const o = this.over;
    for (const z of this.zaps) {
      z.t -= dt;
      // Jagged bolt between the two enemies.
      const n = 5;
      o.lineStyle(1, 0xd6f4ff, Math.min(1, z.t * 12)).beginPath().moveTo(z.x1, z.y1);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        o.lineTo(z.x1 + (z.x2 - z.x1) * k + (Math.random() - 0.5) * 8, z.y1 + (z.y2 - z.y1) * k + (Math.random() - 0.5) * 8);
      }
      o.lineTo(z.x2, z.y2).strokePath();
    }
    this.zaps = this.zaps.filter((z) => z.t > 0);
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
        if (pr.owner === "enemy") this.groundCircle(pr.lob.to, pr.lob.radius, 0.5 + k * 0.5, this.time.now, pr.lob.puddle ? 0x7ee05a : 0xe0533d);
      } else {
        v.img.setPosition(pos.x, pos.y).setRotation(Math.atan2(pr.vel.y, pr.vel.x)).setDepth(pos.y + 1);
        v.glow.setPosition(pos.x, pos.y);
      }
    }
    for (const [id, v] of this.projViews) {
      if (seen.has(id)) continue;
      this.releaseProj(v);
      this.projViews.delete(id);
    }
  }

  private releaseProj(v: ProjView): void {
    this.give(v.img);
    this.give(v.glow);
    if (v.shadow) this.give(v.shadow);
  }

  private makeProjView(pr: Projectile): ProjView {
    const glow = this.take("glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(D.light);
    const elem = ELEMENT_COLORS[pr.element];
    if (pr.lob) {
      const key = pr.owner === "enemy" ? "mortar_shell" : pr.kind === "grenade" ? "grenade" : "shell";
      const img = this.take(key);
      if (pr.kind === "acid") img.setTint(0x7ee05a);
      glow.setTint(pr.owner === "enemy" ? (pr.kind === "acid" ? 0x7ee05a : 0xff6a3c) : pr.element === "none" ? 0xffd27a : elem).setScale(0.5).setAlpha(0.6);
      return { img, glow, shadow: this.take("shadow-s").setDepth(D.ground + 1) };
    }
    if (pr.owner === "enemy") {
      // Wizard bolts: slow, big, purple and readable.
      glow.setTint(0xb46cff).setScale(0.45).setAlpha(0.9);
      return { img: this.take("px").setTint(0xf0d8ff).setScale(1.5), glow };
    }
    const img = this.take(pr.kind === "sniper" ? "streak" : "px").setTint(pr.element === "none" ? 0xfff6c8 : elem);
    if (pr.kind === "smg") img.setScale(0.75);
    if (pr.radius >= 3 && pr.kind !== "sniper") img.setScale(1.5);
    glow.setTint(pr.element !== "none" ? elem : pr.kind === "sniper" ? 0x9ff3ff : 0xffb238).setScale(pr.kind === "sniper" ? 0.5 : 0.3).setAlpha(0.8);
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

  private pickupKey(pk: Pickup): string {
    switch (pk.kind) {
      case "gun":
        return "gun_" + gunStats(pk.gun!).archetype;
      case "heal":
        return "snack";
      case "shrine":
        return "shrine";
      case "chest":
        return pk.used ? "suitcase_open" : "suitcase";
    }
  }

  private destroyPickupView(v: PickupView): void {
    v.sprite.destroy();
    v.glow.destroy();
    v.beam?.destroy();
  }

  private renderPickups(t: number): void {
    const seen = new Set<number>();
    const player = this.world.players[0]!;
    const inReach = player.downed ? undefined : interactable(this.world, player);
    for (const pk of this.world.pickups) {
      seen.add(pk.id);
      const key = this.pickupKey(pk);
      let v = this.pickupViews.get(pk.id);
      if (v && v.key !== key) {
        // Swapped guns change archetype; rebuild the view.
        this.destroyPickupView(v);
        this.pickupViews.delete(pk.id);
        v = undefined;
      }
      if (!v) {
        const color = pk.kind === "gun" ? RARITY_COLORS[pk.gun!.rarity] : pk.kind === "heal" ? 0x5fd36a : 0xf2c14e;
        v = {
          key,
          sprite: this.add.image(pk.pos.x, pk.pos.y, key).setOrigin(0.5, pk.kind === "gun" ? 0.5 : 1),
          glow: this.add.image(pk.pos.x, pk.pos.y - 2, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(D.light),
        };
        const beamH = pk.kind === "gun" ? BEAM_HEIGHT[pk.gun!.rarity] : 0;
        if (beamH > 0) v.beam = this.add.image(pk.pos.x, pk.pos.y, "px").setOrigin(0.5, 1).setScale(1, beamH / 2).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5).setDepth(D.light);
        this.pickupViews.set(pk.id, v);
      }
      const bob = Math.sin(t * 0.004 + pk.id);
      if (pk.kind === "gun") {
        const rarity = pk.gun!.rarity;
        v.sprite.setPosition(pk.pos.x, pk.pos.y - 5 + bob * 1.5).setDepth(pk.pos.y + 1);
        if (pk.gun!.element !== "none" && Math.floor(t / 500) % 2 === 0) v.sprite.setTint(ELEMENT_COLORS[pk.gun!.element]);
        else v.sprite.clearTint();
        v.glow.setAlpha(0.35 + bob * 0.1).setScale(rarity === "legendary" ? 1.4 : 0.9);
        v.beam?.setAlpha(0.35 + bob * 0.15);
        this.ground.fillStyle(RARITY_COLORS[rarity], 0.25).fillEllipse(pk.pos.x, pk.pos.y + 3, 16, 5);
      } else if (pk.kind === "heal") {
        v.sprite.setPosition(pk.pos.x, pk.pos.y + 3 + bob).setDepth(pk.pos.y);
        v.glow.setAlpha(0.3).setScale(0.6);
      } else {
        v.sprite.setPosition(pk.pos.x, pk.pos.y + 6).setDepth(pk.pos.y + 6).setAlpha(pk.used && pk.kind === "shrine" ? 0.5 : 1);
        v.sprite.setTexture(key);
        v.glow.setAlpha(pk.used ? 0 : 0.35 + bob * 0.1).setScale(1.6).setPosition(pk.pos.x, pk.pos.y - 4);
      }
      // The item the pickup button would grab gets a pulsing ring.
      if (pk === inReach) {
        this.ground.lineStyle(1, 0xffffff, 0.5 + 0.4 * Math.sin(t * 0.012)).strokeEllipse(pk.pos.x, pk.pos.y + 3, 26, 10);
      }
    }
    for (const [id, v] of this.pickupViews) {
      if (seen.has(id)) continue;
      this.destroyPickupView(v);
      this.pickupViews.delete(id);
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

    const s = gunStats(p.guns[p.active]!);
    const dir = len(prev.offset) > 0.01 ? { x: prev.offset.x / len(prev.offset), y: prev.offset.y / len(prev.offset) } : p.facing;
    if (s.lob) {
      const d = Math.max(24, Math.min(s.range, len(prev.offset)));
      const at = { x: pos.x + dir.x * d, y: pos.y + dir.y * d };
      g.lineStyle(1, 0xffffff, 0.6).strokeCircle(at.x, at.y, s.lob.radius);
      g.fillStyle(0xffffff, 0.08).fillCircle(at.x, at.y, s.lob.radius);
      return;
    }
    // Touch only: on desktop the mouse cursor already shows the aim.
    if (!ui.controls.touchMode) return;
    const ang = angleOf(dir);
    const half = Math.max((s.spreadDeg * Math.PI) / 360, 0.04);
    g.fillStyle(0xffffff, 0.12).slice(pos.x, pos.y, s.range, ang - half, ang + half, false).fillPath();
  }
}

import Phaser from "phaser";
import {
  actBiome,
  BIOMES,
  BOOSTS,
  beamLength,
  CRYPT,
  FINAL_ACT,
  heroLight,
  roomDark,
  PAD,
  submerged,
  sweepAngle,
  sweepBeams,
  trapDist,
  createWorld,
  DEFAULT_OUTFIT,
  DOOR,
  doorAt,
  doorVotes,
  enterRoom,
  MYTHIC,
  MYTHIC_IDS,
  mythicItem,
  roomSpec,
  ROOM_NAMES,
  TWISTS,
  distToSegment,
  DT,
  EMPTY_INPUT,
  ENEMIES,
  GRENADES,
  marksUp,
  angleOf,
  fromAngle,
  gunStats,
  heldGrenade,
  heldStats,
  interactable,
  len,
  REVIVE,
  step as simStep,
  sub,
  unpredictable,
  ventState,
  type Biome,
  type Door,
  type Enemy,
  type RoomKind,
  type TwistId,
  type Gadget,
  type EmoteInfo,
  type Outfit,
  type Pickup,
  type Player,
  type PlayerInput,
  type PlayerOptions,
  type Projectile,
  type RunReward,
  type SimEvent,
  type Vec,
  type World,
} from "@lostluggage/sim";
import type { LocalShot, NetSession } from "../net";
import { DEFENSE_COLORS, ELEMENT_COLORS, ELITE_COLORS, ENEMY_COLORS, RARITY_COLORS, SHIELD_COLOR, SLOT_COLORS } from "../render/colors";
import { EMOTE_LINES, gunKey, HAT_ANCHOR, hatKey } from "../render/cosmetics";
import { mythicArtId, mythicHue } from "../render/mythics";
import { BIOME_ART, drawSpikes } from "../render/pixels";
import { trailFx, trailGap, type FxHost } from "../render/trails";
import { sfx } from "../sfx";
import { FLOOR_PAD } from "./BootScene";
import type { UIScene } from "./UIScene";

/** What the menu hands the game: a co-op session, or nothing for solo. */
export interface GameData {
  net?: NetSession;
  profile?: PlayerOptions;
  /** Solo: which adventure the run starts in. Co-op gets it from the server. */
  biome?: Biome;
  /** Solo: the difficulty (see DIFFICULTIES). Co-op gets it from the server. */
  tier?: number;
  /** Solo: the practice range instead of a run (training dummies, nothing saved). */
  practice?: boolean;
  /** Solo: what you're wearing. Co-op gets everyone's from the lobby. */
  outfit?: Outfit;
  /** Solo: saves the run (XP, loot) and says what it earned. Co-op rewards come from the server instead. */
  onRunEnd?: (w: World, me: Player) => RunReward | undefined;
}

/** How long an emote's hops last. */
const EMOTE_HOP_MS = 400;
const SHADOW_FOR = (r: number) => (r <= 5 ? "shadow-s" : r <= 7 ? "shadow-m" : r <= 11 ? "shadow-l" : "shadow-xl");
/** Mimics look like their prop until they reveal. */
const HIDDEN_TEXTURE: Record<string, string> = { vending_mimic: "vending_hidden", ice_machine: "ice_hidden", toilet_mimic: "toilet_hidden", cryo_pod: "cryo_hidden", coffin_mimic: "coffin_hidden" };
/** Each biome's look: the sea under the deck, the floor, what the crates are, and the weather. */
const BIOME_LOOK: Record<Biome, { sea: string; floor: string; block: string; ambient: { speedY: [number, number]; speedX: [number, number]; scale: number; every: number } }> = {
  // Embers rising.
  foundry: { sea: "lava", floor: "floor", block: "crate", ambient: { speedY: [-26, -8], speedX: [-6, 6], scale: 0.6, every: 45 } },
  // Snow drifting down.
  caverns: { sea: "sea-caverns", floor: "floor-caverns", block: "ice", ambient: { speedY: [8, 24], speedX: [-14, 4], scale: 0.9, every: 30 } },
  // Bubbles and spores, slowly rising.
  sewers: { sea: "sea-sewers", floor: "floor-sewers", block: "stone", ambient: { speedY: [-12, -4], speedX: [-4, 4], scale: 0.7, every: 60 } },
  // Stars streaming past the windows.
  orbital: { sea: "sea-orbital", floor: "floor-orbital", block: "pod", ambient: { speedY: [-2, 2], speedX: [-40, -18], scale: 0.5, every: 35 } },
  // Ghostly motes, drifting nowhere in particular.
  crypt: { sea: "sea-crypt", floor: "floor-crypt", block: "tomb", ambient: { speedY: [-6, 4], speedX: [-6, 6], scale: 0.6, every: 70 } },
};
/** Teleporter pad pairs: each pair glows its own color. */
const PAD_COLORS = [0x5fd3e8, 0xd29bff, 0x5fd36a];
const textureFor = (e: Enemy) => (e.state === "hidden" && HIDDEN_TEXTURE[e.defId]) || e.defId;
const heroKey = (p: Player) => `${p.heroId}_${p.slot}`;
const BEAM_HEIGHT = { common: 0, uncommon: 14, rare: 24, epic: 36, legendary: 64, mythic: 110 };
/** Boost rarity colors: white, blue, orange. */
export const BOOST_COLORS = { common: 0xe8e8f0, rare: 0x4aa3ff, epic: 0xff9a2a };
/** Door label colors by what's behind them. */
const DOOR_COLORS: Record<Door["kind"], number> = {
  intro: 0xc9cfd6, combat: 0xe0533d, elite: 0xff9a2a, event: 0xb46cff, shrine: 0xf2c14e, rest: 0x5fd36a, boss: 0xff3030, home: 0x5fd3e8,
};

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
  /** Mythics: rays turning behind the item, and a second, wider beam. */
  rays?: Phaser.GameObjects.Image;
  halo?: Phaser.GameObjects.Image;
  key: string;
  /** Glow and beam color: a swap can leave the same archetype at a different rarity, which needs a rebuild. */
  color: number;
}

interface GadgetView {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
}

interface PlayerView {
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  gun: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
  chargeGlow: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.BitmapText;
  gunKick: number;
  ghostTimer: number;
  /** An emote's speech bubble, riding above the head until it fades. */
  bubble?: Phaser.GameObjects.Container;
  /** When the last emote started (scene ms), for its happy hop. */
  emoteAt: number;
}

/** A predicted bullet of yours, drawn before the server confirms it. It only looks: the server deals the damage. */
interface LocalBullet {
  pos: Vec;
  vel: Vec;
  life: number;
  radius: number;
  bounces: number;
  pierce: number;
  hit: number[];
  view: ProjView;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  paused = false;
  /** Co-op session; undefined in solo. */
  net?: NetSession;
  /** The player this device controls. */
  myId = -1;

  private profile: PlayerOptions = {};
  private outfit: Outfit = DEFAULT_OUTFIT;
  private biome?: Biome;
  private tier = 0;
  /** The practice range: training dummies instead of a run. */
  practice = false;
  private onRunEnd?: GameData["onRunEnd"];
  /** Solo: what this run earned, once it has been saved. */
  reward?: RunReward;
  private reported = false;
  private acc = 0;
  private alpha = 0;
  private hitStop = 0;
  private builtRoom = -1;
  private prev = new Map<number, Vec>();
  private playerViews = new Map<number, PlayerView>();
  private bullets: LocalBullet[] = [];
  private enemyViews = new Map<number, EnemyView>();
  private projViews = new Map<number, ProjView>();
  private pickupViews = new Map<number, PickupView>();
  private pools = new Map<string, Phaser.GameObjects.Image[]>();
  private roomObjs: Phaser.GameObjects.GameObject[] = [];
  private ventViews = new Map<number, { glow: Phaser.GameObjects.Image }>();
  private door?: Phaser.GameObjects.Image;
  private doorGlow?: Phaser.GameObjects.Image;
  /** Doors out of a cleared room: sprite, glow and what's behind it. */
  private doorViews: { door: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; sub: Phaser.GameObjects.BitmapText }[] = [];
  private doorKey = "";
  /** The biome the floor and sea are drawn for; rebuilt when a room in another biome starts. */
  private builtBiome?: Biome;
  private biomeObjs: Phaser.GameObjects.GameObject[] = [];
  private ambient?: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Lights Out and the Drowned Crypt: the darkness, with holes cut around the heroes and lit candles. */
  private dark?: Phaser.GameObjects.RenderTexture;
  /** Drowned Crypt: each candle's glow, by its place in the room's list. */
  private candleGlows: Phaser.GameObjects.Image[] = [];
  /** Orbital Deck: each teleporter pad and its glow, so they can dim while yours recharge. */
  private padViews: { pad: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];
  private stamp?: Phaser.GameObjects.Image;
  private zaps: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];

  private ground!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private domeLights = new Map<number, Phaser.GameObjects.Image>();
  private gadgetViews = new Map<number, GadgetView>();
  private lava?: Phaser.GameObjects.TileSprite;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flames!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ice!: Phaser.GameObjects.Particles.ParticleEmitter;
  private goo = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor() {
    super("game");
  }

  init(data: GameData = {}): void {
    // Scene instances are reused on restart, so reset all per-run state here.
    this.net = data.net;
    this.profile = data.profile ?? {};
    this.outfit = data.outfit ?? DEFAULT_OUTFIT;
    this.biome = data.biome;
    this.tier = data.tier ?? 0;
    this.practice = !!data.practice;
    this.onRunEnd = data.onRunEnd;
    this.reward = undefined;
    this.reported = false;
    this.myId = -1;
    this.acc = 0;
    this.alpha = 0;
    this.hitStop = 0;
    this.builtRoom = -1;
    this.paused = false;
    this.prev.clear();
    this.playerViews.clear();
    this.bullets = [];
    this.enemyViews.clear();
    this.projViews.clear();
    this.pickupViews.clear();
    this.pools.clear();
    this.domeLights.clear();
    this.gadgetViews.clear();
    this.ventViews.clear();
    this.goo.clear();
    this.roomObjs = [];
    this.zaps = [];
    this.door = this.doorGlow = undefined;
    this.doorViews = [];
    this.doorKey = "";
    this.builtBiome = undefined;
    this.biomeObjs = [];
    this.ambient = undefined;
    this.dark = undefined;
    this.candleGlows = [];
  }

  get ui(): UIScene | undefined {
    const s = this.scene.get("ui") as UIScene | undefined;
    return s?.controls ? s : undefined;
  }

  /** The hero this device controls. */
  get me(): Player {
    return this.world.players.find((p) => p.id === this.myId) ?? this.world.players[0]!;
  }

  create(): void {
    if (this.net) {
      // The menu only starts co-op once the first snapshot is in.
      this.world = this.net.frame(0, 0)!.world;
      this.myId = this.net.myId;
    } else {
      // Dev shortcuts: ?seed=123 replays a run; ?biome=sewers starts in that adventure; ?room=boss (or combat, elite,
      // event, shrine, rest) jumps to a room, with &act=4 for a later act (in that act's biome: 4 is the Drowned Crypt)
      // and &twist=belts;
      // ?mythics lays every mythic out on the floor of the first room.
      const params = import.meta.env.DEV && !this.practice ? new URLSearchParams(location.search) : new URLSearchParams();
      const seed = Number(params.get("seed")) || (Math.random() * 2 ** 31) | 0;
      const biome = params.get("biome") as Biome | null;
      this.world = createWorld({ seed, players: [this.profile], tier: this.tier, biome: biome && biome in BIOMES ? biome : this.biome, practice: this.practice });
      const room = params.get("room") as RoomKind | null;
      if (room && room in ROOM_NAMES) {
        const act = Number(params.get("act")) || 0;
        enterRoom(this.world, roomSpec(this.world, room, { act, twist: (params.get("twist") ?? "") as TwistId, biome: actBiome(this.world, act) }));
      }
      if (params.has("mythics")) {
        const at = this.world.players[0]!.pos;
        const perRow = Math.ceil(MYTHIC_IDS.length / 3);
        MYTHIC_IDS.forEach((id, i) => {
          const m = mythicItem(this.world, id);
          const row = Math.floor(i / perRow);
          const inRow = Math.min(perRow, MYTHIC_IDS.length - row * perRow);
          // Rows above and below you, clear of the HUD and the lava.
          const pos = { x: at.x + ((i % perRow) - (inRow - 1) / 2) * 40, y: at.y + [-34, 26, -74][row]! };
          this.world.pickups.push({ id: this.world.nextId++, kind: "gun" in m ? "gun" : "relic" in m ? "relic" : "grenade", pos, ...m, used: false });
        });
      }
      this.myId = this.world.players[0]!.id;
    }
    const { w, h } = this.world.arena;
    this.buildBiome();

    this.ground = this.add.graphics().setDepth(D.ground);
    this.over = this.add.graphics().setDepth(D.overlay);
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

    this.buildRoom();
    const p = this.me;
    const cam = this.cameras.main;
    cam.setBounds(-120, -120, w + 240, h + 240);
    cam.centerOn(p.pos.x, p.pos.y);
    cam.setRoundPixels(true);

    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.game.events.on(Phaser.Core.Events.VISIBLE, this.onVisible, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
      this.game.events.off(Phaser.Core.Events.VISIBLE, this.onVisible, this);
    });
  }

  private onHidden(): void {
    sfx.suspend();
    this.ui?.controls.reset();
    // Phones background the tab all the time. Solo pauses; co-op can't, so the server takes you out of harm's way.
    if (this.net) this.net.setAway(true);
    else this.paused = true;
  }

  private onVisible(): void {
    if (!this.net) return;
    this.net.setAway(false);
    sfx.unlock();
  }

  /** Solo: saves the run once, at the end or when quitting early (you keep the guns in your hands). */
  reportRun(): RunReward | undefined {
    if (this.net || this.reported || !this.onRunEnd) return this.reward;
    this.reported = true;
    this.reward = this.onRunEnd(this.world, this.me);
    return this.reward;
  }

  resume(): void {
    this.paused = false;
    this.acc = 0;
    sfx.unlock();
  }

  private makePlayerView(p: Player): PlayerView {
    return {
      shadow: this.add.image(0, 0, "shadow-m").setDepth(D.ground + 1),
      body: this.add.image(0, 0, heroKey(p)).setOrigin(0.5, 1),
      gun: this.add.image(0, 0, "gun_pistol").setOrigin(0.15, 0.5),
      hat: this.add.image(0, 0, "px").setOrigin(0.5, 1).setVisible(false),
      light: this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(SLOT_COLORS[p.slot] ?? 0x5fb3ff).setAlpha(0.18).setScale(3).setDepth(D.light),
      chargeGlow: this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x9ff3ff).setDepth(D.light).setVisible(false),
      tag: this.add.bitmapText(0, 0, "pixel", p.name, 8).setOrigin(0.5, 1).setLetterSpacing(-1).setTint(SLOT_COLORS[p.slot] ?? 0xffffff).setDepth(D.text),
      gunKick: 0,
      ghostTimer: 0,
      emoteAt: -Infinity,
    };
  }

  private destroyPlayerView(v: PlayerView): void {
    for (const o of [v.shadow, v.body, v.gun, v.hat, v.light, v.chargeGlow, v.tag]) o.destroy();
    v.bubble?.destroy();
  }

  /** The emote you're wearing. */
  get myEmote(): string {
    return this.outfitOf(this.me).emote;
  }

  /** Co-op: the server says someone in the room emoted. */
  emoteFrom(e: EmoteInfo): void {
    if (!this.sys.isActive() || !this.net) return;
    const seat = this.net.lobby?.seats.find((s) => s.sessionId === e.sessionId);
    if (seat && seat.playerId >= 0) this.emote(seat.playerId, e.emote);
  }

  /** A speech bubble over a hero, with a little hop, like on the lobby stage. */
  emote(playerId: number, emote: string): void {
    const v = this.playerViews.get(playerId);
    const p = this.world.players.find((pl) => pl.id === playerId);
    if (!v || !p) return;
    sfx.play("emote");
    v.emoteAt = this.time.now;
    v.bubble?.destroy();
    const color = SLOT_COLORS[p.slot] ?? 0xffffff;
    const text = this.add.bitmapText(0, 0, "pixel", EMOTE_LINES[emote] ?? "!", 8).setOrigin(0.5).setLetterSpacing(-1);
    const w = Math.max(24, text.width + 10);
    const bg = this.add.rectangle(0, 0, w, 14, 0x1b1020).setStrokeStyle(2, color);
    const tail = this.add.triangle(0, 9, -3, 0, 3, 0, 0, 5, color);
    const c = this.add.container(v.body.x, v.body.y, [tail, bg, text]).setDepth(D.text + 1).setScale(0);
    v.bubble = c;
    this.tweens.chain({
      targets: c,
      tweens: [
        { scale: 1, duration: 220, ease: "Back.out" },
        { alpha: 0, duration: 300, delay: 1300 },
      ],
      onComplete: () => {
        c.destroy();
        if (v.bubble === c) v.bubble = undefined;
      },
    });
  }

  /** What a player is wearing: yours from the menu in solo, everyone's from the lobby in co-op. */
  private outfitOf(p: Player): Outfit {
    if (!this.net) return this.outfit;
    return this.net.lobby?.seats.find((s) => s.playerId === p.id)?.outfit ?? DEFAULT_OUTFIT;
  }

  /** The hat follows the head; when the hero goes down it falls off beside them. */
  private placeHat(v: PlayerView, p: Player, pos: Vec, bob: number, left: boolean, hat: string): void {
    if (!hat) {
      v.hat.setVisible(false);
      return;
    }
    v.hat.setTexture(hatKey(hat)).setVisible(true).setFlipX(left).setAlpha(v.body.alpha);
    if (p.downed) {
      v.hat.setPosition(pos.x + (left ? -9 : 9), pos.y + p.radius).setAngle(left ? -25 : 25).setDepth(pos.y - 0.2).clearTint();
      return;
    }
    const a = HAT_ANCHOR[p.heroId] ?? HAT_ANCHOR.vanguard!;
    v.hat
      .setPosition(pos.x + (left ? -a.x : a.x), pos.y + p.radius + bob + a.y)
      .setAngle(0)
      .setDepth(pos.y + 0.1);
    if (p.hurtT > 0 && !p.away) v.hat.setTintFill(0xffffff);
    else v.hat.clearTint();
  }

  private lavaGlow(x: number, y: number): void {
    const g = this.add.image(x, y, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(BIOME_ART[this.world.run.room.biome].glow).setScale(3.5).setAlpha(0.35).setDepth(D.floor + 1);
    this.tweens.add({ targets: g, alpha: 0.18, duration: 900 + Math.random() * 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.biomeObjs.push(g);
  }

  /**
   * The sea under the deck, the floor and the weather, for the current room's biome. Runs cross biomes now, so this
   * is rebuilt whenever a room in a different one starts.
   */
  private buildBiome(): void {
    const biome = this.world.run.room.biome;
    if (biome === this.builtBiome) return;
    this.builtBiome = biome;
    for (const o of this.biomeObjs) o.destroy();
    this.biomeObjs = [];
    const { w, h } = this.world.arena;
    const look = BIOME_LOOK[biome];
    const art = BIOME_ART[biome];
    // Lava (or icy water, or sludge, or space) under the deck, with glow along the rim: atmosphere for one tile.
    this.lava = this.add.tileSprite(-240, -240, w + 480, h + 480, look.sea).setOrigin(0).setDepth(D.lava);
    this.biomeObjs.push(this.lava, this.add.image(-FLOOR_PAD, -FLOOR_PAD, look.floor).setOrigin(0).setDepth(D.floor));
    for (let x = 0; x <= w; x += 60) {
      for (const y of [-14, h + 14]) this.lavaGlow(x, y);
    }
    for (let y = 30; y < h; y += 60) {
      for (const x of [-14, w + 14]) this.lavaGlow(x, y);
    }
    // Ambient particles: the biome's weather.
    const a = look.ambient;
    this.ambient = this.add.particles(0, 0, "px", {
      emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-200, -100, w + 400, h + 300) } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
      lifespan: { min: 2000, max: 4500 },
      speedY: { min: a.speedY[0], max: a.speedY[1] },
      speedX: { min: a.speedX[0], max: a.speedX[1] },
      scale: { start: a.scale, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [...art.ambient],
      frequency: a.every,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(D.light);
    this.biomeObjs.push(this.ambient);
  }

  /** Static room visuals: crates, vents and the exit hatch. Rebuilt on every room change. */
  private buildRoom(): void {
    for (const o of this.roomObjs) o.destroy();
    this.roomObjs = [];
    this.padViews = [];
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
    this.builtRoom = room.index;
    this.buildBiome();
    this.bullets.forEach((b) => this.releaseProj(b.view));
    this.bullets = [];
    for (const v of this.doorViews) for (const o of [v.door, v.glow, v.label, v.sub]) o.destroy();
    this.doorViews = [];
    this.doorKey = "";
    this.dark?.destroy();
    this.dark = undefined;
    if (roomDark(room)) {
      // Lights Out and the Crypt: a dark layer over the room, under the HUD bits (bars, telegraphs) that keep it fair.
      this.dark = this.add.renderTexture(0, 0, this.scale.width, this.scale.height).setOrigin(0).setScrollFactor(0).setDepth(D.overlay - 10);
    }
    // Candle glows: pale gold, flickering while they burn.
    this.candleGlows = room.candles.map((c) => {
      const glow = this.add.image(c.pos.x, c.pos.y - 6, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a).setDepth(D.light);
      this.roomObjs.push(glow);
      return glow;
    });
    const block = BIOME_LOOK[room.biome].block;
    for (const o of this.world.arena.obstacles) {
      this.roomObjs.push(this.add.image(o.x, o.y - 8, `${block}-${o.w}x${o.h}`).setOrigin(0).setDepth(o.y + o.h));
    }
    for (const s of this.world.arena.spikes) {
      const key = `spikes-${s.w}x${s.h}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawSpikes(s.w, s.h));
      this.roomObjs.push(this.add.image(s.x, s.y, key).setOrigin(0).setDepth(s.y + s.h));
    }
    for (const v of room.vents) {
      if (v.kind === "vent") this.roomObjs.push(this.add.image(v.pos.x, v.pos.y, "vent").setDepth(D.floor + 2));
      const tint = v.kind === "pipe" ? 0x7ee05a : v.kind === "laser" ? 0xff3a5a : 0xff7a1a;
      const glow = this.add.image(v.pos.x, v.pos.y, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(1.6).setAlpha(0.2).setDepth(D.light);
      this.roomObjs.push(glow);
      this.ventViews.set(v.id, { glow });
    }
    // Teleporter pads: a pair shares a color, so you can tell where each one goes.
    this.world.arena.pads.forEach((pd, i) => {
      const c = PAD_COLORS[i % PAD_COLORS.length]!;
      for (const at of [pd.a, pd.b]) {
        const pad = this.add.image(at.x, at.y, "pad").setTint(c).setDepth(D.floor + 2);
        const glow = this.add.image(at.x, at.y, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(c).setScale(1.4).setAlpha(0.5).setDepth(D.light);
        this.tweens.add({ targets: glow, alpha: 0.2, scale: 1.1, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        this.roomObjs.push(pad, glow);
        this.padViews.push({ pad, glow });
      }
    });
    // A shut hatch in the middle of the top wall while the fight is on; the real doors appear once it's clear.
    this.door = this.add.image(this.world.arena.w / 2 - DOOR.w / 2, -6, "door-closed").setOrigin(0).setDepth(D.floor + 3);
    this.roomObjs.push(this.door);
    this.syncDoors();
  }

  /** The doors out of a cleared room, with what's behind each. Rebuilt when the set of doors changes. */
  private syncDoors(): void {
    const room = this.world.run.room;
    const doors = room.cleared && !this.world.run.victory ? room.doors : [];
    const key = doors.map((d) => `${d.kind}${d.x}${d.twist}`).join("|");
    if (key === this.doorKey) return;
    this.doorKey = key;
    for (const v of this.doorViews) for (const o of [v.door, v.glow, v.label, v.sub]) o.destroy();
    this.doorViews = [];
    this.door?.setVisible(doors.length === 0);
    for (const d of doors) {
      const color = DOOR_COLORS[d.kind];
      const door = this.add.image(d.x - DOOR.w / 2, -6, "door-open").setOrigin(0).setDepth(D.floor + 3);
      const glow = this.add.image(d.x, 4, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(2.5, 1.2).setDepth(D.light);
      this.tweens.add({ targets: glow, alpha: { from: 0.7, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
      const label = this.add.bitmapText(d.x, 32, "pixel", this.doorLabel(d), 8).setOrigin(0.5).setLetterSpacing(-1).setTint(color).setDepth(D.text);
      const sub = this.add.bitmapText(d.x, 42, "pixel", this.doorSub(d), 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xc9cfd6).setDepth(D.text);
      this.doorViews.push({ door, glow, label, sub });
    }
  }

  private doorLabel(d: Door): string {
    const here = this.world.run.plans[this.world.run.room.index];
    if (d.kind === "home") return "FLY HOME";
    if (here && d.act > here.act) return d.act > FINAL_ACT ? `ENDLESS ${d.act - FINAL_ACT}` : `ACT ${d.act + 1}`;
    return ROOM_NAMES[d.kind].toUpperCase();
  }

  private doorSub(d: Door): string {
    const here = this.world.run.plans[this.world.run.room.index];
    if (d.kind === "home") return "TAKE THE WIN";
    if (here && d.act > here.act) return BIOMES[d.biome].name.replace("The ", "").toUpperCase();
    if (d.twist) return TWISTS[d.twist].name.toUpperCase();
    if (here && d.biome !== here.biome) return BIOMES[d.biome].name.replace("The ", "").toUpperCase();
    return "";
  }

  /** Who's standing in which door: a little square in their color under the door. */
  private renderDoors(): void {
    this.syncDoors();
    const room = this.world.run.room;
    if (!room.cleared || this.doorViews.length === 0) return;
    const { winner } = doorVotes(this.world);
    const counts = room.doors.map(() => 0);
    for (const p of this.world.players) {
      const d = doorAt(room, p);
      if (d < 0 || p.downed || p.away) continue;
      const x = room.doors[d]!.x - 12 + counts[d]! * 8;
      counts[d]!++;
      this.over.fillStyle(0x1b1020).fillRect(x - 1, 15, 7, 7);
      this.over.fillStyle(SLOT_COLORS[p.slot] ?? 0xffffff).fillRect(x, 16, 5, 5);
    }
    this.doorViews.forEach((v, i) => v.label.setScale(i === winner ? 1.25 : 1));
  }

  /**
   * Lights Out and the Crypt: everything is dark except around the heroes, lit candles and owls (and a glint of enemy
   * eyes). The Night Auditor's blackout shrinks every hero's glow to almost nothing.
   */
  private renderDark(t: number): void {
    const rt = this.dark;
    if (!rt) return;
    const cam = this.cameras.main;
    const room = this.world.run.room;
    const blackout = room.blackoutT > 0;
    rt.clear().fill(0x05030a, blackout ? 0.96 : 0.9);
    // A soft hole of light around each hero, and a little around your shots.
    const stamp = (this.stamp ??= this.make.image({ key: "glow", add: false }).setOrigin(0.5));
    const glow = heroLight(room);
    for (const p of this.world.players) {
      if (p.away) continue;
      const r = (p.downed ? glow * 0.45 : glow) + Math.sin(t * 0.004 + p.id) * 3;
      rt.erase(stamp.setScale((r * 2) / 32), p.pos.x - cam.scrollX, p.pos.y - cam.scrollY);
    }
    for (const c of room.candles) {
      if (c.litT <= 0) continue;
      // A candle about to go out gutters.
      const gutter = c.litT < 3 ? 0.75 + 0.25 * Math.sin(t * 0.03 + c.pos.x) : 1;
      const r = (CRYPT.candleRadius + Math.sin(t * 0.009 + c.pos.y) * 2) * gutter;
      rt.erase(stamp.setScale((r * 2) / 32), c.pos.x - cam.scrollX, c.pos.y - cam.scrollY);
    }
    for (const g of this.world.gadgets) {
      if (g.kind === "drone") rt.erase(stamp.setScale((CRYPT.owlLight * 2) / 32), g.pos.x - cam.scrollX, g.pos.y - cam.scrollY);
    }
    for (const pr of this.world.projectiles) {
      if (pr.owner !== "player" || pr.lob) continue;
      rt.erase(stamp.setScale(0.7), pr.pos.x - cam.scrollX, pr.pos.y - cam.scrollY);
    }
    // Eyes in the dark: you can always tell where they are, just not what they're doing.
    for (const e of this.world.enemies) {
      if (e.spawnT > 0 || e.state === "hidden") continue;
      const c = e.state === "windup" ? 0xff3030 : 0xffe08a;
      this.over.fillStyle(c, 0.9).fillRect(Math.round(e.pos.x - 2), Math.round(e.pos.y - e.radius * 1.4), 1, 1).fillRect(Math.round(e.pos.x + 1), Math.round(e.pos.y - e.radius * 1.4), 1, 1);
    }
  }

  /**
   * Drowned Crypt candles: a stub of wax on a little dish. Lit ones flicker and glow; out ones show a wisp of smoke
   * and a faint ring now and then, so you know they're worth a shot.
   */
  /** Teleporter pads go dark while yours recharge, with a ring that fills back up. */
  private renderPads(): void {
    const cd = this.me.padCd;
    const left = cd > 0 ? cd / PAD.cooldown : 0;
    for (const { pad, glow } of this.padViews) {
      pad.setAlpha(left > 0 ? 0.35 : 1);
      glow.setVisible(left <= 0);
      if (left > 0) {
        const start = -Math.PI / 2;
        this.ground.lineStyle(2, 0x8a8aa0, 0.6).beginPath().arc(pad.x, pad.y, PAD.radius + 4, start, start + (1 - left) * Math.PI * 2).strokePath();
      }
    }
  }

  private renderCandles(t: number): void {
    const g = this.ground;
    const o = this.over;
    const room = this.world.run.room;
    room.candles.forEach((c, i) => {
      const x = Math.round(c.pos.x);
      const y = Math.round(c.pos.y);
      // Dish and wax (drawn over the dark, so you can find the unlit ones).
      o.fillStyle(0x1b1020).fillRect(x - 4, y, 9, 3).fillRect(x - 2, y - 7, 5, 8);
      o.fillStyle(0x8a7440).fillRect(x - 3, y + 1, 7, 1);
      o.fillStyle(0xe8e0c8).fillRect(x - 1, y - 6, 3, 6);
      o.fillStyle(0xfff6e0).fillRect(x - 1, y - 6, 1, 5);
      const glow = this.candleGlows[i];
      if (c.litT > 0) {
        const flick = Math.sin(t * 0.02 + i * 1.7) + Math.sin(t * 0.033 + i);
        const gutter = c.litT < 3 && Math.floor(t / 90) % 2 === 0;
        o.fillStyle(0xff9a2a).fillRect(x - 1, y - 10 + (flick > 1 ? -1 : 0), 3, 3);
        o.fillStyle(0xffe08a).fillRect(x, y - 9, 1, 2);
        glow?.setVisible(true).setAlpha(gutter ? 0.25 : 0.45 + flick * 0.05).setScale(1.6 + flick * 0.05);
        // The circle it lights: faint, so you can see who's standing in it.
        g.lineStyle(1, 0xffd27a, 0.12).strokeCircle(c.pos.x, c.pos.y, CRYPT.candleRadius);
      } else {
        glow?.setVisible(false);
        o.fillStyle(0x3a3040).fillRect(x, y - 8, 1, 2);
        if ((t * 0.001 + i * 0.37) % 2 < 0.15) o.lineStyle(1, 0xffd27a, 0.5).strokeCircle(c.pos.x, c.pos.y - 3, 7);
      }
    });
  }

  /**
   * Someone in a grabber's hold: a wrap between the two, and a ring like a revive's that fills as a teammate (or
   * mashing dash) pulls them free.
   */
  private drawPinned(p: Player, pos: Vec, t: number, mine: boolean): void {
    const e = this.enemyById(p.pinnedBy);
    if (e) {
      const ep = this.lerpPos(e.id, e.pos, this.alpha);
      this.over.lineStyle(2, 0xe8dcc0, 0.8).lineBetween(ep.x, ep.y - e.radius * 0.8, pos.x, pos.y - 4);
      this.over.lineStyle(1, 0x1b1020, 0.8).lineBetween(ep.x, ep.y - e.radius * 0.8 + 2, pos.x, pos.y - 2);
    }
    const r = REVIVE.reach;
    const pulse = mine ? 0.5 : 0.5 + 0.4 * Math.sin(t * 0.012);
    this.ground.fillStyle(0xff9a2a, 0.07).fillCircle(pos.x, pos.y, r);
    this.ground.lineStyle(1, 0xff9a2a, pulse).strokeCircle(pos.x, pos.y, r);
    if (p.freeProgress > 0) {
      this.over.lineStyle(2, 0xffe08a, 1).beginPath().arc(pos.x, pos.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.freeProgress)).strokePath();
    }
  }

  /** Sewer water: murky channels with ripples drifting the way the current goes. */
  private renderWater(t: number): void {
    const g = this.ground;
    for (const c of this.world.arena.water) {
      g.fillStyle(0x1e3a24, 0.75).fillRect(c.x, c.y, c.w, c.h);
      g.fillStyle(0x3a6a3a, 0.35).fillRect(c.x, c.y, c.w, 2).fillRect(c.x, c.y + c.h - 2, c.w, 2);
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const dx = c.vx / sp;
      const dy = c.vy / sp;
      // Streaks laid out on a grid that slides with the flow.
      const off = ((t / 1000) * sp) % 28;
      for (let i = 0; i < c.w; i += 28) {
        for (let j = 0; j < c.h; j += 14) {
          const x = c.x + ((i + dx * off + 28 + (j % 28 === 0 ? 0 : 14)) % c.w);
          const y = c.y + ((j + dy * off + c.h) % c.h);
          g.lineStyle(1, 0x8ab86a, 0.35).lineBetween(x, y, x + dx * 6, y + dy * 6);
        }
      }
    }
  }

  /** Baggage Claim: conveyor belts with chevrons sliding the way they carry you. */
  private renderBelts(t: number): void {
    const g = this.ground;
    for (const b of this.world.arena.belts) {
      g.fillStyle(0x1b1020, 0.55).fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle(0x3c3444, 0.6).fillRect(b.x, b.y, b.w, 2).fillRect(b.x, b.y + b.h - 2, b.w, 2);
      const dir = Math.sign(b.vx);
      const off = ((t / 1000) * b.vx) % 24;
      for (let x = b.x - 24 + off; x < b.x + b.w + 24; x += 24) {
        const cy = b.y + b.h / 2;
        g.lineStyle(2, 0xf2c14e, 0.35).beginPath().moveTo(x - 4 * dir, cy - 8).lineTo(x + 4 * dir, cy).lineTo(x - 4 * dir, cy + 8).strokePath();
      }
    }
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 100) / 1000;
    if (this.net) this.updateOnline(dt);
    else this.updateSolo(dt);

    this.lava?.setTilePosition((this.lava.tilePositionX + dt * 4) % 64, (this.lava.tilePositionY + dt * 2) % 64);
    this.render(this.alpha, dt);
  }

  private updateSolo(dt: number): void {
    const ui = this.ui;
    if (!this.paused) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.capturePrev();
        const input = ui ? ui.controls.build(this.world, this.me) : EMPTY_INPUT;
        this.stepWorld(input);
        if (this.hitStop > 0) {
          this.acc = 0;
          break;
        }
      }
    }
    this.alpha = this.acc / DT;
  }

  /** Co-op: inputs go out at the sim's 30 Hz, the picture comes from the server's snapshots. */
  private updateOnline(dt: number): void {
    const net = this.net!;
    const ui = this.ui;
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT) {
      this.acc -= DT;
      // After a long hitch, don't flood the server with a burst of stale inputs.
      if (++n > 4) {
        this.acc = 0;
        break;
      }
      const ctrl = net.controlPlayer();
      const input = ui && ctrl && !this.paused ? ui.controls.build(this.world, ctrl) : EMPTY_INPUT;
      const local = net.input(input, (from, range) => this.aimAt(from, range));
      for (const shot of local.shots) this.localShot(shot);
      if (local.dashed) {
        const p = net.controlPlayer();
        if (p) this.smoke.explode(5, p.pos.x, p.pos.y + 4);
        sfx.play("dash");
      }
    }
    const f = net.frame(this.acc / DT, dt);
    if (!f) return;
    this.world = f.world;
    this.myId = net.myId;
    this.prev = f.prev;
    this.prev.delete(this.myId);
    this.alpha = f.alpha;
    // Normally a roomEnter event rebuilds the room; this also covers coming back from a dropped connection.
    if (this.world.run.room.index !== this.builtRoom) this.buildRoom();
    for (const ev of f.events) this.onEvent(ev);
    this.events.emit("sim", f.events);
  }

  private stepWorld(input: PlayerInput): void {
    simStep(this.world, [input]);
    for (const ev of this.world.events) this.onEvent(ev);
    this.events.emit("sim", this.world.events);
  }

  /** Auto-aim for predicted shots, against the enemies as drawn. */
  private aimAt(from: Vec, range: number): Vec | undefined {
    let best: Vec | undefined;
    let bestD = range;
    for (const e of this.world.enemies) {
      if (e.spawnT > 0 || e.hp <= 0 || e.state === "hidden") continue;
      const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y) - e.radius;
      if (d < bestD) {
        bestD = d;
        best = sub(e.pos, from);
      }
    }
    return best;
  }

  /** Your shot, the moment you fire: flash, sound, kick and bullets that only look real. */
  private localShot(shot: LocalShot): void {
    const me = this.me;
    const s = heldStats(shot.gun, me);
    this.shotFx(me.id, shot.x, shot.y, s.archetype, shot.gun.element, true);
    // Lobbed shots are slow arcs, and curving or returning shots can't be guessed: the server's version shows up in time.
    // That includes a Gunslinger's shots while marks are up: they seek.
    if (s.lob || s.homing > 0 || unpredictable(shot.gun) || marksUp(this.world, me)) return;
    const bounces = s.bounces;
    const spread = (s.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < s.pellets; i++) {
      let a = shot.angle;
      if (s.pellets > 1) a += (i / (s.pellets - 1) - 0.5) * spread + (Math.random() - 0.5) * spread * 0.15;
      else if (spread > 0) a += (Math.random() - 0.5) * spread;
      const speed = s.pellets > 1 ? s.speed * (0.9 + Math.random() * 0.2) : s.speed;
      const fake = { kind: s.archetype, element: shot.gun.element, radius: s.projRadius, owner: "player" } as Projectile;
      this.bullets.push({
        pos: { x: shot.x, y: shot.y },
        vel: fromAngle(a, speed),
        life: (s.range / s.speed) * (bounces > 0 ? 1.4 : 1),
        radius: s.projRadius,
        bounces,
        pierce: s.pierce,
        hit: [],
        view: this.makeProjView(fake),
      });
    }
  }

  private solidAt(p: Vec): boolean {
    const w = this.world;
    if (p.x < 0 || p.y < 0 || p.x > w.arena.w || p.y > w.arena.h) return true;
    return w.arena.obstacles.some((o) => p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h);
  }

  /** Moves predicted bullets: they bounce off crates and stop at the enemies you see. */
  private renderLocalBullets(dt: number): void {
    for (const b of this.bullets) {
      const from = b.pos;
      b.pos = { x: from.x + b.vel.x * dt, y: from.y + b.vel.y * dt };
      b.life -= dt;
      if (this.solidAt(b.pos)) {
        this.sparks.explode(2, b.pos.x, b.pos.y);
        if (b.bounces-- <= 0) b.life = 0;
        else {
          if (this.solidAt({ x: b.pos.x, y: from.y })) b.vel.x = -b.vel.x;
          if (this.solidAt({ x: from.x, y: b.pos.y })) b.vel.y = -b.vel.y;
          b.pos = from;
          b.hit = [];
        }
      }
      for (const e of this.world.enemies) {
        if (b.life <= 0) break;
        if (e.spawnT > 0 || e.state === "hidden" || b.hit.includes(e.id)) continue;
        const at = this.lerpPos(e.id, e.pos, this.alpha);
        if (distToSegment(at, from, b.pos) > b.radius + e.radius) continue;
        b.hit.push(e.id);
        if (b.pierce-- <= 0) b.life = 0;
      }
      if (b.life > 0) {
        b.view.img.setPosition(b.pos.x, b.pos.y).setRotation(Math.atan2(b.vel.y, b.vel.x)).setDepth(b.pos.y + 1);
        b.view.glow.setPosition(b.pos.x, b.pos.y);
      }
    }
    for (const b of this.bullets) if (b.life <= 0) this.releaseProj(b.view);
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  /** Muzzle flash, sound and recoil for anyone's shot. Only your own shakes the camera. */
  private shotFx(playerId: number, x: number, y: number, archetype: string, element: keyof typeof ELEMENT_COLORS, mine: boolean): void {
    sfx.play(archetype);
    const big = archetype === "shotgun" || archetype === "sniper";
    this.flash(x, y, element === "none" ? 0xffd27a : ELEMENT_COLORS[element], big ? 22 : 12, 70);
    const v = this.playerViews.get(playerId);
    if (v) v.gunKick = big ? 4 : 2;
    if (!mine) return;
    if (archetype === "sniper") this.shake(90, 0.005);
    else if (archetype === "shotgun" || archetype === "launcher") this.shake(60, 0.003);
  }

  /** Hit-stop freezes a solo sim for punch. Co-op can't stop the server, so it's skipped there. */
  private stop(s: number): void {
    if (!this.net) this.hitStop = Math.max(this.hitStop, s);
  }

  private playerById(id: number): Player | undefined {
    return this.world.players.find((p) => p.id === id);
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

  /** Pooled images for effects drawn by shared code (dash trails). */
  private readonly fx: FxHost = { scene: this, take: (key) => this.take(key), give: (img) => this.give(img) };

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
    const me = this.me;
    // Where an event about a player happened: their hero if we can see it, else ours.
    const at = (id: number) => (this.playerById(id) ?? me).pos;
    switch (ev.type) {
      case "shot": {
        const mine = ev.playerId === this.myId;
        // In co-op your own shots were already shown the moment you fired.
        if (!(mine && this.net)) this.shotFx(ev.playerId, ev.x, ev.y, ev.archetype, ev.element, mine);
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
        if (ev.kill) this.stop(0.035);
        break;
      }
      case "enemyDied": {
        const boss = ENEMIES[ev.defId]!.role === "boss";
        this.goo.get(ev.defId)?.explode(boss ? 60 : 14, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xffffff, boss ? 120 : 26, boss ? 500 : 120, 0.7);
        this.smoke.explode(boss ? 20 : 4, ev.x, ev.y);
        sfx.play(boss ? "explode" : "kill");
        this.shake(boss ? 600 : 60, boss ? 0.015 : 0.002);
        if (boss) this.stop(0.25);
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
        if (mine) this.stop(0.04);
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
      case "domePulse":
        this.ringFx(ev.x, ev.y, ev.radius, 0x9ff3ff, 280);
        sfx.play("zap");
        break;
      case "reflect":
        this.flash(ev.x, ev.y, 0x9ff3ff, 40, 200);
        this.ringFx(ev.x, ev.y, 12, 0xffffff, 200);
        sfx.play("blocked");
        break;
      case "spark":
        this.sparks.explode(2, ev.x, ev.y);
        break;
      case "enemyWindup": {
        const map: Record<string, string> = {
          melee: "windupMelee", dash: "windupDash", lobbedProjectile: "windupLob", slam: "windupLob", cone: "windupBreath", projectile: "windupMelee", summon: "summon", shieldAllies: "summon",
          nova: "bossPhase", shockwave: "windupLob", submerge: "windupLob", sweep: "charge", grab: "windupMelee", blackout: "bossPhase",
        };
        sfx.play(map[ev.attack] ?? "windupMelee");
        break;
      }
      case "enemyAttack":
        if (ev.attack === "melee") sfx.play("bite");
        else if (ev.attack === "lobbedProjectile") sfx.play("mortarFire");
        else if (ev.attack === "projectile" || ev.attack === "nova") sfx.play("bolt");
        else if (ev.attack === "sweep") sfx.play("sweep");
        else if (ev.attack === "submerge") sfx.play("splash");
        else if (ev.attack === "shockwave") {
          sfx.play("slam");
          this.shake(250, 0.008);
        }
        else if (ev.attack === "cone") {
          sfx.play("breath");
          const e = this.enemyById(ev.id);
          if (e) for (let i = 1; i <= 4; i++) this.ice.explode(6, e.pos.x + e.attackDir.x * i * 26, e.pos.y + e.attackDir.y * i * 26);
          this.shake(200, 0.006);
        }
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
        const v = this.world.run.room.vents.find((x) => x.id === ev.id);
        const near = (v ? trapDist(v, me.pos) : Math.hypot(me.pos.x - ev.x, me.pos.y - ev.y)) < 160;
        if (v?.kind === "laser") {
          if (near) sfx.play("laserOn");
          break;
        }
        if (v?.kind === "pipe") {
          this.goo.get("sludge_slime")?.explode(20, ev.x, ev.y);
          if (near) {
            this.shake(120, 0.003);
            sfx.play("pipeBlast");
          }
          break;
        }
        this.flames.explode(30, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xff7a1a, 80, 500);
        if (near) {
          this.shake(150, 0.004);
          sfx.play("ventErupt");
        }
        break;
      }
      case "warp":
        for (const [x, y] of [[ev.x1, ev.y1], [ev.x2, ev.y2]] as const) {
          this.flash(x, y, 0x9ff3ff, 40, 250);
          this.ringFx(x, y, 18, 0x9ff3ff, 300);
          this.sparks.explode(6, x, y);
        }
        sfx.play("warp");
        // Don't smear the hero across the room.
        this.prev.delete(ev.id);
        break;
      case "surface":
        this.goo.get("lost_found_gator")?.explode(40, ev.x, ev.y);
        this.goo.get("sludge_slime")?.explode(30, ev.x, ev.y);
        this.ringFx(ev.x, ev.y, 50, 0x8ab86a, 400);
        this.shake(300, 0.01);
        sfx.play("splash");
        break;
      case "playerHurt":
        if (ev.id === this.myId) {
          this.shake(150, 0.008);
          this.stop(0.06);
          sfx.play("hurt");
          navigator.vibrate?.(40);
        } else {
          const p = at(ev.id);
          this.flash(p.x, p.y, 0xe0533d, 24, 150);
        }
        break;
      case "playerDowned": {
        sfx.play("downed");
        if (ev.id === this.myId) {
          this.shake(300, 0.012);
          navigator.vibrate?.([60, 40, 120]);
        } else {
          const p = at(ev.id);
          this.floatText(p.x, p.y - 22, "DOWN!", 0xe0533d, 8, 1200);
        }
        break;
      }
      case "playerRevived": {
        const p = at(ev.id);
        this.ringFx(p.x, p.y, 60, 0x9ff3ff, 400);
        this.flash(p.x, p.y, 0x9ff3ff, 120, 400);
        sfx.play("revive");
        break;
      }
      case "playerJoined": {
        const p = at(ev.id);
        this.flash(p.x, p.y, 0xb48cff, 60, 400);
        this.ringFx(p.x, p.y, 30, 0xb48cff, 400);
        sfx.play("spawn");
        break;
      }
      case "dash": {
        // Co-op shows your own dash when you press it (see updateOnline).
        if (ev.id === this.myId && this.net) break;
        const p = at(ev.id);
        this.smoke.explode(5, p.x, p.y + 4);
        sfx.play("dash");
        break;
      }
      case "skill": {
        // Each hero's skill has its own color; turrets and owls get their own pop when they appear.
        const hero = this.playerById(ev.id)?.heroId ?? "vanguard";
        const tint = hero === "gunslinger" ? 0xf2c14e : hero === "tinker" ? 0xffb238 : hero === "warden" ? 0x5fd36a : 0x5fd3e8;
        this.flash(ev.x, ev.y, tint, hero === "vanguard" ? 140 : 80, 350);
        this.ringFx(ev.x, ev.y, hero === "gunslinger" ? 90 : 44, tint, 300);
        this.shake(120, 0.004);
        sfx.play("skill");
        break;
      }
      case "mark": {
        const e = this.enemyById(ev.id);
        if (e) this.ringFx(e.pos.x, e.pos.y - e.radius, e.radius + 10, 0xf2c14e, 250);
        sfx.play("mark");
        break;
      }
      case "crit":
        this.floatText(ev.x, ev.y - 20, "CRIT!", 0xffe08a, 8, 700);
        this.flash(ev.x, ev.y, 0xffe08a, 40, 160);
        sfx.play("crit");
        break;
      case "gadget":
        if (ev.gone) {
          this.smoke.explode(6, ev.x, ev.y);
          sfx.play("gadgetGone");
        } else if (ev.kind === "ghost") {
          // Excess Baggage: the enemy rises again, pale and on your side.
          this.flash(ev.x, ev.y, 0x9ff3ff, 60, 400);
          this.ringFx(ev.x, ev.y, 18, 0x9ff3ff, 350);
          sfx.play("ghost");
        } else {
          this.flash(ev.x, ev.y, ev.kind === "drone" ? 0x5fd36a : 0xffb238, 50, 300);
          this.smoke.explode(4, ev.x, ev.y + 4);
          sfx.play(ev.kind === "drone" ? "owl" : "build");
        }
        break;
      case "gadgetHit": {
        const g = this.world.gadgets.find((x) => x.id === ev.id);
        if (g) this.sparks.explode(3, g.pos.x, g.pos.y - 4);
        break;
      }
      case "saved": {
        const p = at(ev.id);
        this.ringFx(p.x, p.y, 50, 0x5fd36a, 450);
        this.floatText(p.x, p.y - 22, "SAVED!", 0x5fd36a, 8, 1000);
        sfx.play("saved");
        break;
      }
      case "blink":
        if (ev.done) {
          this.flash(ev.x, ev.y, 0xb46cff, 50, 250);
          this.smoke.explode(5, ev.x, ev.y);
          sfx.play("blinkDone");
        } else sfx.play("blink");
        break;
      case "relink": {
        const e = this.enemyById(ev.id);
        if (e) {
          this.ringFx(e.pos.x, e.pos.y, 40, 0xf2c14e, 400);
          this.floatText(e.pos.x, e.pos.y - 26, "RELINKED", 0xf2c14e, 8, 1000);
        }
        sfx.play("relink");
        break;
      }
      case "confiscate":
        // Customs: a red stamp slams down over the elite.
        this.ringFx(ev.x, ev.y, 26, 0xe0405a, 300);
        this.flash(ev.x, ev.y, 0xffd34d, 40, 250);
        this.floatText(ev.x, ev.y - 16, "CONFISCATED", 0xe0405a, 8, 900);
        this.shake(80, 0.003);
        sfx.play("confiscate");
        break;
      case "asleep": {
        const e = this.enemyById(ev.id);
        if (e) this.floatText(e.pos.x, e.pos.y - e.radius * 2 - 4, "Z", 0x7ff0ff, 8, 900);
        sfx.play("snooze");
        break;
      }
      case "misplaced":
        // Lost & Found: a puff, and it's gone.
        this.smoke.explode(8, ev.x, ev.y);
        this.flash(ev.x, ev.y, 0xe8b04a, 40, 300);
        this.floatText(ev.x, ev.y - 14, "MISPLACED", 0xe8b04a, 8, 800);
        sfx.play("misplace");
        break;
      case "found": {
        const e = this.enemyById(ev.id);
        if (e) {
          this.smoke.explode(6, e.pos.x, e.pos.y);
          this.floatText(e.pos.x, e.pos.y - e.radius * 2 - 4, "FOUND?", 0xe8b04a, 8, 800);
        }
        sfx.play("found");
        break;
      }
      case "swapped": {
        // Boarding Pass: a streak of light between the two seats, and a flash at each end.
        for (const [x, y] of [[ev.x1, ev.y1], [ev.x2, ev.y2]] as const) {
          this.flash(x, y, 0x5ff2ff, 50, 350);
          this.ringFx(x, y, 16, 0xffd34d, 300);
        }
        const steps = 8;
        for (let i = 1; i < steps; i++) this.flash(ev.x1 + ((ev.x2 - ev.x1) * i) / steps, ev.y1 + ((ev.y2 - ev.y1) * i) / steps, 0x5ff2ff, 14, 300);
        sfx.play("chime");
        break;
      }
      case "rewound": {
        const p = at(ev.id);
        this.ringFx(p.x, p.y, 34, 0x5ff2ff, 500);
        this.ringFx(p.x, p.y, 20, 0xff8a1f, 400);
        this.floatText(p.x, p.y - 22, "REWOUND!", 0x5ff2ff, 8, 1100);
        sfx.play("rewind");
        break;
      }
      case "grabbed": {
        const p = at(ev.id);
        this.ringFx(p.x, p.y, 16, 0xff9a2a, 250);
        this.floatText(p.x, p.y - 22, "GRABBED!", 0xff9a2a, 8, 900);
        this.shake(ev.id === this.myId ? 180 : 60, ev.id === this.myId ? 0.008 : 0.002);
        if (ev.id === this.myId) navigator.vibrate?.([50, 30, 50]);
        sfx.play("grab");
        break;
      }
      case "freed": {
        const p = at(ev.id);
        if (ev.by === -2) {
          this.floatText(p.x, p.y - 22, "THROWN!", 0xe0533d, 8, 900);
          this.smoke.explode(6, p.x, p.y + 4);
          this.shake(150, 0.006);
          sfx.play("bonk");
          break;
        }
        this.ringFx(p.x, p.y, 30, 0xffe08a, 300);
        this.floatText(p.x, p.y - 22, ev.by >= 0 ? "FREED!" : "BROKE FREE!", 0xffe08a, 8, 900);
        sfx.play("freed");
        break;
      }
      case "candleLit":
        this.flash(ev.x, ev.y - 8, 0xffd27a, 40, 300);
        this.sparks.explode(4, ev.x, ev.y - 8);
        sfx.play("candle");
        break;
      case "blackout": {
        // Every light in the room goes out at once.
        for (const c of this.world.run.room.candles) this.smoke.explode(3, c.pos.x, c.pos.y - 8);
        this.cameras.main.flash(120, 0, 0, 0);
        this.shake(300, 0.006);
        sfx.play("blackout");
        break;
      }
      case "deflect":
        this.flash(ev.x, ev.y, 0x5fb3ff, 20, 120);
        this.sparks.explode(3, ev.x, ev.y);
        sfx.play("deflect");
        break;
      case "spiked": {
        this.ice.explode(10, ev.x, ev.y);
        this.sparks.explode(4, ev.x, ev.y);
        const near = Math.hypot(me.pos.x - ev.x, me.pos.y - ev.y) < 30;
        if (near) this.shake(120, 0.006);
        sfx.play("spiked");
        break;
      }
      case "grenade":
        sfx.play("throw");
        break;
      case "swap":
        sfx.play("swap");
        break;
      case "pickup":
      case "grenadePickup":
      case "relicPickup":
        sfx.play("pickup");
        break;
      case "vest": {
        const p = at(ev.id);
        this.ringFx(p.x, p.y, MYTHIC.vest.radius, 0xff8a1f, 500);
        this.ringFx(p.x, p.y, 30, mythicHue(this.time.now), 450);
        this.flash(p.x, p.y, 0xff8a1f, 80, 500);
        this.floatText(p.x, p.y - 22, "LIFE VEST!", mythicHue(this.time.now), 8, 1200);
        sfx.play("saved");
        break;
      }
      case "clock": {
        // The air where you were goes still: a slow violet ripple, and a clock face's ticks around it.
        this.ringFx(ev.x, ev.y, ev.radius, 0xb46cff, 900);
        this.ringFx(ev.x, ev.y, ev.radius * 0.6, 0x62f5e0, 700);
        this.flash(ev.x, ev.y, 0xb46cff, ev.radius, 900, 0.5);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.flash(ev.x + Math.cos(a) * ev.radius * 0.8, ev.y + Math.sin(a) * ev.radius * 0.8, i % 3 === 0 ? 0xffd34d : 0xb46cff, 6, 700);
        }
        sfx.play("chime");
        break;
      }
      case "loot": {
        if (ev.rarity === "mythic") {
          // The rarest thing in the game just dropped: everyone should know.
          for (let i = 0; i < 4; i++) this.time.delayedCall(i * 120, () => this.ringFx(ev.x, ev.y, 40 + i * 25, mythicHue(i * 600), 700));
          this.flash(ev.x, ev.y, 0xffffff, 200, 700);
          this.flash(ev.x, ev.y, mythicHue(this.time.now), 140, 1200);
          this.sparks.explode(24, ev.x, ev.y);
          this.floatText(ev.x, ev.y - 24, "MYTHIC!", mythicHue(this.time.now), 10, 1600);
          this.shake(450, 0.01);
          sfx.play("lootMythic");
          break;
        }
        const c = RARITY_COLORS[ev.rarity];
        this.flash(ev.x, ev.y, c, ev.rarity === "legendary" ? 120 : 50, 500);
        if (ev.rarity === "legendary") {
          this.ringFx(ev.x, ev.y, 50, c, 600);
          this.shake(250, 0.006);
        }
        sfx.play(ev.rarity === "legendary" ? "lootLegendary" : ev.rarity === "common" || ev.rarity === "uncommon" ? "loot" : "lootRare");
        break;
      }
      case "heal": {
        const p = at(ev.id);
        this.floatText(p.x, p.y - 18, `+${Math.round(ev.amount)}`, 0x5fd36a, 8, 700);
        this.flash(p.x, p.y, 0x5fd36a, 40, 300);
        sfx.play("heal");
        break;
      }
      case "shrine": {
        const p = at(ev.id);
        this.ringFx(p.x, p.y, 40, 0xf2c14e, 500);
        this.flash(p.x, p.y, 0xf2c14e, 100, 500);
        sfx.play("shrine");
        break;
      }
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
          if (!this.world.run.victory) sfx.play("door");
        });
        break;
      case "finale":
        sfx.play("victory");
        this.shake(400, 0.01);
        break;
      case "roomEnter": {
        const [r, g, b] = BIOME_ART[this.world.run.room.biome].fade;
        this.cameras.main.fadeIn(350, r, g, b);
        if (this.builtRoom !== this.world.run.room.index) this.buildRoom();
        this.cameras.main.centerOn(me.pos.x, me.pos.y);
        if (!this.net) this.prev.clear();
        break;
      }
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

    const player = this.me;
    const pp = this.lerpPos(player.id, player.pos, alpha);

    this.renderWater(t);
    this.renderBelts(t);
    this.renderVents(t);
    this.renderCandles(t);
    this.renderPads();
    this.renderHazards(t);
    this.renderDoors();
    this.renderPickups(t);
    this.renderDomes(t);
    this.renderGadgets(t);
    this.renderEnemies(alpha, t);
    this.renderProjectiles(alpha);
    this.renderLocalBullets(dt);
    this.renderPlayers(alpha, dt, t);
    this.renderAimGuide(player, pp);
    this.renderZaps(dt);
    this.renderDark(t);

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
      if (v.to) {
        this.renderLane(v, state, t);
        view?.glow.setAlpha(state === "erupt" ? 0.9 : state === "warn" ? 0.5 : 0.2);
        continue;
      }
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

  /** Sewer pipes and laser fences: the lane they cover, faint when idle, flashing as a warning, solid when on. */
  private renderLane(v: World["run"]["room"]["vents"][number], state: ReturnType<typeof ventState>, t: number): void {
    const g = this.ground;
    const o = this.over;
    const to = v.to!;
    const k = state === "warn" ? ((v.t % v.periodS) - (v.periodS - v.eruptS - v.warnS)) / v.warnS : 0;
    if (v.kind === "pipe") {
      this.renderPipe(v.pos, to, v.radius, state, k, t);
      return;
    }
    // Laser fence: two posts and the beam between them.
    for (const p of [v.pos, to]) {
      g.fillStyle(0x1b1020).fillRect(p.x - 4, p.y - 4, 8, 8);
      g.fillStyle(0xa7b0bb).fillRect(p.x - 3, p.y - 3, 6, 6);
      g.fillStyle(state === "idle" ? 0x5a6270 : 0xff3a5a).fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    if (state === "warn") {
      // Flickers on, more and more often.
      if (Math.sin(t * (0.02 + 0.05 * k)) > 0.2) o.lineStyle(1, 0xff6a7a, 0.3 + 0.5 * k).lineBetween(v.pos.x, v.pos.y, to.x, to.y);
    } else if (state === "erupt") {
      o.lineStyle(v.radius * 2 + 2, 0xff3a5a, 0.35).lineBetween(v.pos.x, v.pos.y, to.x, to.y);
      o.lineStyle(2, 0xffd0d8, 0.95).lineBetween(v.pos.x, v.pos.y, to.x, to.y);
      if (Math.random() < 0.3) {
        const r = Math.random();
        this.sparks.explode(1, v.pos.x + (to.x - v.pos.x) * r, v.pos.y + (to.y - v.pos.y) * r);
      }
    }
  }

  /**
   * A sludge pipe sticking out of the wall: a rusty body with a bolted flange and a dark mouth that drips. Sludge
   * builds up in the mouth during the warning, then the jet fires down the lane from there.
   */
  private renderPipe(from: Vec, to: Vec, radius: number, state: ReturnType<typeof ventState>, k: number, t: number): void {
    const g = this.ground;
    const o = this.over;
    const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const d = { x: (to.x - from.x) / l, y: (to.y - from.y) / l };
    const across = { x: -d.y, y: d.x };
    const at = (along: number, side = 0): Vec => ({ x: from.x + d.x * along + across.x * side, y: from.y + d.y * along + across.y * side });
    const body = radius * 2 - 6;
    const len = 18;
    const mouth = at(len + 2);
    const lane = radius * 2;

    // The lane: a pulsing warning band while it builds up, a jet of sludge when it fires.
    if (state === "warn") {
      g.fillStyle(0x7ee05a, 0.06 + 0.16 * k);
      g.lineStyle(1, 0x9ff36a, 0.35 + 0.35 * Math.sin(t * 0.04));
      this.laneRect(g, mouth, to, lane, true);
    } else if (state === "erupt") {
      g.fillStyle(0x6a7a2a, 0.75);
      this.laneRect(g, mouth, to, lane, false);
      o.fillStyle(0xc8c86a, 0.4);
      this.laneRect(o, mouth, to, lane * 0.45, false);
      if (Math.random() < 0.7) {
        const r = Math.random();
        this.goo.get("sludge_slime")?.explode(2, mouth.x + (to.x - mouth.x) * r, mouth.y + (to.y - mouth.y) * r);
      }
    } else {
      // A little puddle where it has been dripping.
      const p = at(len + 8);
      g.fillStyle(0x3a6a3a, 0.45).fillEllipse(p.x, p.y + 2, radius * 1.4, radius * 0.7);
    }

    // The pipe itself: outline, rusty body, a highlight along one side and a shadow along the other.
    g.fillStyle(0x1b1020);
    this.laneRect(g, at(-4), at(len), body + 2, false);
    g.fillStyle(0x7a5232);
    this.laneRect(g, at(-4), at(len), body, false);
    g.fillStyle(0xa8743e);
    this.laneRect(g, at(-4, -body / 2 + 3), at(len, -body / 2 + 3), 2, false);
    g.fillStyle(0x4e3220);
    this.laneRect(g, at(-4, body / 2 - 3), at(len, body / 2 - 3), 3, false);
    // Rust patches.
    g.fillStyle(0xb8602a, 0.8);
    this.laneRect(g, at(5, -2), at(8, -2), 3, false);
    this.laneRect(g, at(11, 3), at(13, 3), 2, false);
    // The flange round the mouth, with bolts.
    g.fillStyle(0x1b1020);
    this.laneRect(g, at(len - 5), at(len + 2), body + 8, false);
    g.fillStyle(0x8a6a4a);
    this.laneRect(g, at(len - 4), at(len + 1), body + 6, false);
    g.fillStyle(0xc9cfd6);
    for (const side of [-(body + 6) / 2 + 2, (body + 6) / 2 - 2]) {
      const b = at(len - 1.5, side);
      g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
    }
    // The dark mouth, filling with sludge as the warning runs.
    g.fillStyle(0x0e1a10);
    this.laneRect(g, at(len + 1), at(len + 3), body - 4, false);
    if (state !== "idle") {
      g.fillStyle(0x7ee05a, state === "erupt" ? 0.9 : 0.4 + 0.5 * k);
      this.laneRect(g, at(len + 1), at(len + 3 + (state === "erupt" ? 2 : 3 * k)), (body - 4) * (state === "erupt" ? 1 : 0.4 + 0.6 * k), false);
    }
    // Drips: now and then while idle, constantly while it builds up.
    if (Math.random() < (state === "warn" ? 0.35 : state === "idle" ? 0.02 : 0)) this.goo.get("sludge_slime")?.explode(1, mouth.x, mouth.y);
  }

  /** A lane `w` wide from `a` to `b`, filled (and outlined, if asked). */
  private laneRect(g: Phaser.GameObjects.Graphics, a: Vec, b: Vec, w: number, stroke: boolean): void {
    const ang = angleOf(sub(b, a));
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const pt = (x: number, y: number) => ({ x: a.x + x * Math.cos(ang) - y * Math.sin(ang), y: a.y + x * Math.sin(ang) + y * Math.cos(ang) });
    const pts = [pt(0, -w / 2), pt(l, -w / 2), pt(l, w / 2), pt(0, w / 2)];
    g.fillPoints(pts, true);
    if (stroke) g.strokePoints(pts, true);
  }

  private renderHazards(t: number): void {
    const g = this.ground;
    for (const h of this.world.hazards) {
      const k = Math.min(1, h.t / 0.6); // fade out at the end
      const grow = Math.min(1, (h.maxT - h.t) / 0.25); // and pop in at the start
      const r = h.radius * grow;
      if (h.kind === "fire") {
        // Burning ground from Hot Take: flickering orange, with a flame now and then.
        g.fillStyle(0xff7a1a, 0.35 * k).fillEllipse(h.pos.x, h.pos.y, r * 2, r * 1.4);
        g.fillStyle(0xffe08a, (0.2 + 0.15 * Math.sin(t * 0.02 + h.id)) * k).fillEllipse(h.pos.x, h.pos.y, r, r * 0.7);
        if (Math.random() < 0.08 * k) this.flames.explode(1, h.pos.x + (Math.random() - 0.5) * r, h.pos.y);
        continue;
      }
      if (h.kind === "wave") {
        // A boss shockwave racing outward: a bright ring with a warning band just ahead of it.
        const ring = h.radius * (1 - h.t / h.maxT);
        g.lineStyle(6, 0xe0533d, 0.25).strokeCircle(h.pos.x, h.pos.y, ring + 10);
        this.over.lineStyle(3, 0xff9a2a, 0.95).strokeCircle(h.pos.x, h.pos.y, ring);
        this.over.lineStyle(1, 0xffe08a, 0.9).strokeCircle(h.pos.x, h.pos.y, Math.max(1, ring - 3));
        continue;
      }
      if (h.kind === "rewind") {
        // Black Box: a cyan clock face with its hand sweeping backwards, its orange ring emptying as the rewind comes due.
        const left = h.t / h.maxT;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.012);
        g.fillStyle(0x5ff2ff, 0.08 + 0.05 * pulse).fillEllipse(h.pos.x, h.pos.y, h.radius * 2, h.radius * 1.4);
        this.over.lineStyle(1, 0x5ff2ff, 0.8).strokeEllipse(h.pos.x, h.pos.y, h.radius * 2, h.radius * 1.4);
        this.over.lineStyle(2, 0xff8a1f, 0.9).beginPath().arc(h.pos.x, h.pos.y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left).strokePath();
        const a = -Math.PI / 2 - (1 - left) * Math.PI * 8;
        this.over.lineStyle(1, 0xffffff, 0.9).lineBetween(h.pos.x, h.pos.y, h.pos.x + Math.cos(a) * 8, h.pos.y + Math.sin(a) * 8);
        continue;
      }
      if (h.kind === "ice") {
        // Slush: pale blue and glinting. It slows you; it doesn't hurt.
        g.fillStyle(0x9fd8ff, 0.45 * k).fillEllipse(h.pos.x, h.pos.y, r * 2, r * 1.5);
        g.fillStyle(0xe8f8ff, 0.35 * k).fillEllipse(h.pos.x - 1, h.pos.y - 1, r * 1.3, r * 0.9);
        if ((t * 0.003 + h.id) % 1 < 0.08) g.fillStyle(0xffffff, 0.9 * k).fillRect(h.pos.x + Math.sin(h.id) * r * 0.5, h.pos.y - 1, 2, 1);
        continue;
      }
      g.fillStyle(0x4fa63a, 0.45 * k).fillEllipse(h.pos.x, h.pos.y, r * 2, r * 1.5);
      g.fillStyle(0x7ee05a, 0.35 * k).fillEllipse(h.pos.x - 1, h.pos.y - 1, r * 1.4, r);
      // Bubbles.
      const b = (t * 0.002 + h.id) % 1;
      g.fillStyle(0xc8ff9a, 0.6 * k * (1 - b)).fillCircle(h.pos.x + Math.sin(h.id) * r * 0.4, h.pos.y + Math.cos(h.id) * r * 0.3, 1 + b);
    }
  }

  private renderPlayers(alpha: number, dt: number, t: number): void {
    const seen = new Set<number>();
    const coop = this.world.players.length > 1 || !!this.net;
    for (const p of this.world.players) {
      seen.add(p.id);
      let v = this.playerViews.get(p.id);
      if (!v) {
        v = this.makePlayerView(p);
        this.playerViews.set(p.id, v);
      }
      this.renderPlayer(p, this.lerpPos(p.id, p.pos, alpha), dt, t, v, coop);
    }
    for (const [id, v] of this.playerViews) {
      if (seen.has(id)) continue;
      this.destroyPlayerView(v);
      this.playerViews.delete(id);
    }
  }

  private renderPlayer(p: Player, pos: Vec, dt: number, t: number, v: PlayerView, coop: boolean): void {
    const mine = p.id === this.myId;
    const moving = len(p.vel) > 5;
    let bob = moving && p.dashT <= 0 ? -Math.abs(Math.sin(t * 0.02)) * 1.5 : 0;
    const left = p.facing.x < 0;
    const key = heroKey(p);
    const outfit = this.outfitOf(p);
    // Emoting: two quick hops (none while downed).
    const since = t - v.emoteAt;
    if (since < EMOTE_HOP_MS && !p.downed) bob -= Math.abs(Math.sin((since / EMOTE_HOP_MS) * Math.PI * 2)) * 4;
    v.bubble?.setPosition(Math.round(pos.x), Math.round(pos.y - 30));

    v.shadow.setPosition(pos.x, pos.y + p.radius - 1);
    v.body.setTexture(key).setPosition(pos.x, pos.y + p.radius + bob).setFlipX(left).setDepth(pos.y);
    v.light.setPosition(pos.x, pos.y).setVisible(!p.away);
    // Teammates get a name tag; yours would just be clutter. An emote bubble covers it for a moment.
    v.tag
      .setVisible(coop && !mine && !v.bubble)
      .setText(p.away ? `${p.name} (AWAY)` : p.name)
      .setPosition(Math.round(pos.x), Math.round(pos.y - 17));

    if (p.downed) {
      v.body.setAngle(left ? -90 : 90).setTint(0x9a8a9a).setAlpha(1);
      v.gun.setVisible(false);
      v.chargeGlow.setVisible(false);
      this.placeHat(v, p, pos, 0, left, outfit.hat);
      if (coop && p.reviveT === Infinity) this.drawReviveRing(p, pos, t, mine);
      return;
    }
    v.body.setAngle(0);
    if (p.away) {
      // Backgrounded or reconnecting: a ghost the enemies ignore.
      v.body.clearTint().setAlpha(0.35);
      v.gun.setVisible(false);
      v.chargeGlow.setVisible(false);
      this.placeHat(v, p, pos, bob, left, outfit.hat);
      return;
    }
    if (p.hurtT > 0) v.body.setTintFill(0xffffff);
    else v.body.clearTint();
    if (p.pinnedBy) {
      // Held: squirming in place.
      v.body.setX(pos.x + Math.sin(t * 0.05) * 1.2);
      this.drawPinned(p, pos, t, mine);
    }
    // Blink while invulnerable after a hit (not during a dash: the trail shows that).
    v.body.setAlpha(p.iframes > 0 && p.dashT <= 0 && Math.floor(t / 60) % 2 === 0 ? 0.4 : 1);
    this.placeHat(v, p, pos, bob, left, outfit.hat);

    if (p.dashT > 0) {
      v.ghostTimer -= dt;
      if (v.ghostTimer <= 0) {
        v.ghostTimer = trailGap(outfit.trail);
        trailFx(this.fx, outfit.trail, { x: pos.x, y: pos.y + p.radius, heroKey: key, flip: left, scale: 1, depth: pos.y - 1, t });
      }
    }

    // Gun in hand, with recoil and an element glint.
    const gun = p.guns[p.active]!;
    const s = gunStats(gun);
    const ang = angleOf(p.facing);
    v.gunKick = Math.max(0, v.gunKick - dt * 30);
    const hand = { x: pos.x + p.facing.x * (4 - v.gunKick), y: pos.y - 1 + bob + p.facing.y * (3 - v.gunKick) };
    v.gun
      .setVisible(true)
      .setTexture(gunKey(s.archetype, outfit.skin))
      .setPosition(hand.x, hand.y)
      .setRotation(ang)
      .setFlipY(left)
      .setDepth(pos.y + (p.facing.y < -0.3 ? -0.5 : 0.5));
    if (gun.element !== "none" && Math.floor(t / 400) % 3 === 0) v.gun.setTint(ELEMENT_COLORS[gun.element]);
    else v.gun.clearTint();

    if (p.charging) {
      const k = 1 - p.chargeT / (s.chargeMs / 1000);
      v.chargeGlow
        .setVisible(true)
        .setTint(gun.element === "none" ? 0x9ff3ff : ELEMENT_COLORS[gun.element])
        .setPosition(hand.x + p.facing.x * 12, hand.y + p.facing.y * 12)
        .setScale(0.3 + k * 0.5)
        .setAlpha(0.5 + k * 0.5);
    } else v.chargeGlow.setVisible(false);

    // Brawl Stars-style ammo pips under your own feet, and health over everyone's head.
    const o = this.over;
    if (mine) {
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
    }
    const hpW = 18;
    const hx = Math.round(pos.x - hpW / 2);
    const hy = Math.round(pos.y - 14);
    o.fillStyle(0x1b1020).fillRect(hx - 1, hy - 1, hpW + 2, 4);
    o.fillStyle(p.hp / p.maxHp > 0.3 ? (mine || !coop ? 0x5fd36a : SLOT_COLORS[p.slot]!) : 0xe0533d).fillRect(hx, hy, Math.round((hpW * p.hp) / p.maxHp), 2);
    // Overheal shield: a cyan line over the health bar and a faint bubble.
    if (p.shield > 0) {
      o.fillStyle(0x9ff3ff).fillRect(hx, hy - 1, Math.max(1, Math.round((hpW * Math.min(p.shield, 60)) / 60)), 1);
      o.lineStyle(1, 0x9ff3ff, 0.35 + 0.15 * Math.sin(t * 0.01)).strokeCircle(pos.x, pos.y - 3, p.radius + 4);
    }
  }

  /** A downed teammate: the circle to stand in, filling up as they get picked up. */
  private drawReviveRing(p: Player, pos: Vec, t: number, mine: boolean): void {
    const r = REVIVE.reach;
    // Teammates' rings pulse harder: that's where you need to be.
    const pulse = mine ? 0.4 : 0.5 + 0.4 * Math.sin(t * 0.01);
    this.ground.fillStyle(0x9ff3ff, 0.06).fillCircle(pos.x, pos.y, r);
    this.ground.lineStyle(1, 0x9ff3ff, pulse).strokeCircle(pos.x, pos.y, r);
    if (p.reviveProgress > 0) {
      this.over
        .lineStyle(2, 0x9ff3ff, 1)
        .beginPath()
        .arc(pos.x, pos.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.reviveProgress)
        .strokePath();
    }
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

      if (e.spawnT > 0 && e.lost) {
        // Lost & Found: gone, but a luggage tag marks where it'll turn up, swinging and filling as the time runs out.
        const swing = Math.sin(t * 0.006 + e.id) * 2;
        const fill = 1 - Math.min(1, e.spawnT / 6);
        const tx = Math.round(pos.x + swing);
        const ty = Math.round(pos.y - 6);
        g.lineStyle(1, 0xd9dde3, 0.6).lineBetween(pos.x, pos.y - 14, tx, ty - 4);
        g.fillStyle(0x1b1020, 0.8).fillRect(tx - 4, ty - 4, 9, 8);
        g.fillStyle(0xe8b04a, 0.9).fillRect(tx - 3, ty - 3, 7, 6);
        g.fillStyle(0xffd34d, 0.9).fillRect(tx - 3, ty + 3 - Math.round(6 * fill), 7, Math.round(6 * fill));
        g.fillStyle(0x3b2a6e, 1).fillRect(tx - 1, ty - 2, 3, 1).fillRect(tx + 1, ty - 1, 1, 1).fillRect(tx, ty, 1, 1).fillRect(tx, ty + 2, 1, 1);
        v.body.setVisible(false);
        v.shadow.setVisible(false);
        continue;
      }
      if (e.spawnT > 0) {
        // Arrival telegraph: a portal ring that closes in, so spawns are never unfair.
        const k = Math.min(1, e.spawnT / 0.8);
        g.lineStyle(1, 0xb48cff, 0.9 - k * 0.5).strokeCircle(pos.x, pos.y, e.radius + 2 + k * 10);
        g.fillStyle(0xb48cff, 0.15).fillCircle(pos.x, pos.y, e.radius + 2);
        v.body.setVisible(false);
        v.shadow.setVisible(false);
        continue;
      }
      if (submerged(e)) {
        // Under the water: just a wake, then the circle where it's about to come up.
        v.body.setVisible(false);
        v.shadow.setVisible(false);
        this.drawSubmerged(e, pos, t);
        continue;
      }
      v.body.setVisible(true).setTexture(textureFor(e));
      v.shadow.setVisible(true).setPosition(pos.x, pos.y + e.radius - 1);

      const target = this.me;
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
        if (atk.type === "sweep") this.drawSweep(e, pos, 1, t);
        if (atk.type === "grab" && atk.hook && e.attackPoints[0]) this.drawHook(pos, e.attackPoints[0]);
      } else if (e.state === "move" && !frozen) {
        sy = 1 + Math.sin(t * 0.025 + e.id) * 0.06;
      }
      if (e.defId === "hover_wizard") hover = -3 + Math.sin(t * 0.006 + e.id) * 1.5;
      // A teleporter about to blink flickers out.
      v.body.setAlpha(e.blinkTo && Math.floor(t / 50) % 2 === 0 ? 0.3 : 1);

      v.body
        .setPosition(pos.x + jitter, pos.y + e.radius + hover)
        .setFlipX(v.faceLeft)
        .setScale(sx * e.size, sy * e.size)
        .setDepth(pos.y);
      if (e.state !== "hidden") this.drawEnemyExtras(e, pos, t);

      // Tint priority: hit flash > red telegraph > frozen > burning > acid > chilled.
      const s = e.status;
      if (e.hitFlash > 0) v.body.setTintFill(0xffffff);
      else if (e.state === "windup" && atk.telegraph === "redFlash" && Math.floor(t / 70) % 2 === 0) v.body.setTintFill(0xff3030);
      else if (frozen) v.body.setTint(0xa8e4ff);
      else if (e.state === "windup") v.body.setTint(0xffb0a0);
      else if (s.burnT > 0) v.body.setTint(0xffc090);
      else if (s.acidT > 0) v.body.setTint(0xb8ff9a);
      else if (s.frost > 0.5 || e.slow > 0) v.body.setTint(0xcfefff);
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

  /**
   * Everything that marks an enemy as special: elite auras and their tells, Gunslinger marks, stuns.
   * Each elite gets its own color and one clear tell, so a glance says what to do about it.
   */
  private drawEnemyExtras(e: Enemy, pos: Vec, t: number): void {
    const g = this.ground;
    const o = this.over;
    if (e.elite) {
      const c = ELITE_COLORS[e.elite];
      g.lineStyle(1, c, 0.55 + 0.25 * Math.sin(t * 0.008 + e.id)).strokeEllipse(pos.x, pos.y + e.radius - 1, e.radius * 2.6, e.radius * 1.1);
      if (Math.random() < 0.12) this.sparks.explode(1, pos.x + (Math.random() - 0.5) * e.radius * 2, pos.y - Math.random() * e.radius * 2);
      // A small diamond over its head in the elite's color.
      const top = Math.round(pos.y - e.radius * 2 - 11);
      o.fillStyle(0x1b1020).fillTriangle(pos.x, top - 4, pos.x - 4, top, pos.x + 4, top).fillTriangle(pos.x, top + 4, pos.x - 4, top, pos.x + 4, top);
      o.fillStyle(c).fillTriangle(pos.x, top - 3, pos.x - 3, top, pos.x + 3, top).fillTriangle(pos.x, top + 3, pos.x - 3, top, pos.x + 3, top);
      switch (e.elite) {
        case "shielded": {
          // The front shield: an arc on the side it faces, gone while it swings or once it's broken.
          const up = e.guard > 0 && e.stunT <= 0 && e.status.frozenT <= 0 && (e.state === "move" || e.state === "reveal");
          if (!up) break;
          const a = Math.atan2(e.facing.y, e.facing.x);
          o.lineStyle(2, c, 0.9).beginPath().arc(pos.x, pos.y - e.radius * 0.6, e.radius + 5, a - 1.1, a + 1.1).strokePath();
          o.lineStyle(1, 0xffffff, 0.5).beginPath().arc(pos.x, pos.y - e.radius * 0.6, e.radius + 7, a - 0.8, a + 0.8).strokePath();
          break;
        }
        case "teleporting":
          if (e.blinkTo) {
            // Where it's about to appear: a shimmer that closes in.
            const k = (t * 0.004) % 1;
            g.lineStyle(1, c, 0.9).strokeCircle(e.blinkTo.x, e.blinkTo.y, e.radius + 2 + (1 - k) * 12);
            g.fillStyle(c, 0.25).fillCircle(e.blinkTo.x, e.blinkTo.y, e.radius + 2);
          }
          break;
        case "vengeful":
          g.fillStyle(c, 0.12 + 0.08 * Math.sin(t * 0.012 + e.id)).fillCircle(pos.x, pos.y, 38);
          break;
        case "linked": {
          const twin = this.world.enemies.find((x) => x.id === e.link && x.spawnT <= 0);
          if (twin && e.id < twin.id) {
            const tp = this.lerpPos(twin.id, twin.pos, this.alpha);
            o.lineStyle(1, c, 0.5 + 0.3 * Math.sin(t * 0.02)).lineBetween(pos.x, pos.y - e.radius, tp.x, tp.y - twin.radius);
          }
          // Its partner fell: a ring that empties as the time to kill this one runs out.
          if (e.linkT > 0) {
            o.lineStyle(2, c, 1).beginPath().arc(pos.x, pos.y - e.radius, e.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, e.linkT / 4)).strokePath();
          }
          break;
        }
      }
    }
    if (e.markT > 0) {
      // Gunslinger mark: a bounty-red crosshair that spins slowly (elites own the other colors).
      const c = 0xff5a5a;
      const cy = pos.y - e.radius;
      const r = e.radius + 6;
      const a = t * 0.003;
      const fade = e.markT < 1 && Math.floor(t / 100) % 2 === 0 ? 0.4 : 1;
      o.lineStyle(1, c, 0.9 * fade).strokeCircle(pos.x, cy, r);
      for (let i = 0; i < 4; i++) {
        const ang = a + (i * Math.PI) / 2;
        o.lineBetween(pos.x + Math.cos(ang) * (r - 3), cy + Math.sin(ang) * (r - 3), pos.x + Math.cos(ang) * (r + 3), cy + Math.sin(ang) * (r + 3));
      }
    }
    if (e.dutyT > 0) {
      // Duty Free: a gold price tag bobbing over its head. Kill it before it runs out for an extra gun.
      const bob = Math.round(Math.sin(t * 0.008 + e.id) * 1.5);
      const tx = Math.round(pos.x - e.radius - 4);
      const ty = Math.round(pos.y - e.radius * 2 - 6 + bob);
      const blink = e.dutyT < 1 && Math.floor(t / 100) % 2 === 0 ? 0.4 : 1;
      o.fillStyle(0x1b1020, blink).fillRect(tx - 1, ty - 1, 7, 9);
      o.fillStyle(0xffd34d, blink).fillRect(tx, ty, 5, 7);
      o.fillStyle(0x7a3fc4, blink).fillRect(tx + 1, ty + 1, 3, 1).fillRect(tx + 1, ty + 2, 1, 1).fillRect(tx + 1, ty + 3, 3, 1).fillRect(tx + 3, ty + 4, 1, 1).fillRect(tx + 1, ty + 5, 3, 1);
    }
    if (e.sleepT > 0) {
      // Asleep (Snooze Button): little z's drifting up off its head.
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.0007 + i / 3 + e.id * 0.13) % 1;
        const zx = Math.round(pos.x + 3 + k * 6 + Math.sin(k * 6 + i) * 2);
        const zy = Math.round(pos.y - e.radius * 2 - 2 - k * 12);
        const sz = k < 0.5 ? 2 : 3;
        o.lineStyle(1, 0x7ff0ff, 1 - k).lineBetween(zx, zy, zx + sz, zy).lineBetween(zx + sz, zy, zx, zy + sz).lineBetween(zx, zy + sz, zx + sz, zy + sz);
      }
    } else if (e.stunT > 0) {
      // Stunned: stars circling its head.
      for (let i = 0; i < 3; i++) {
        const ang = t * 0.008 + (i * Math.PI * 2) / 3;
        o.fillStyle(0xffe08a).fillRect(Math.round(pos.x + Math.cos(ang) * 6), Math.round(pos.y - e.radius * 2 - 4 + Math.sin(ang) * 2), 2, 2);
      }
    }
  }

  /** A boss under the water: ripples where it swims, then a closing circle where it surfaces. */
  private drawSubmerged(e: Enemy, pos: Vec, t: number): void {
    const atk = ENEMIES[e.defId]!.attacks[e.attackIdx]!;
    if (atk.type !== "submerge") return;
    const g = this.dark ? this.over : this.ground;
    const surfacing = e.stateT <= atk.surfaceMs / 1000;
    for (let i = 0; i < 3; i++) {
      const r = ((t * 0.05 + i * 8) % 24) + 4;
      g.lineStyle(1, 0x8ab86a, 0.7 * (1 - r / 28)).strokeEllipse(pos.x, pos.y, r * 2, r * 1.2);
    }
    if (surfacing) this.groundCircle(pos, atk.radius, 1 - e.stateT / (atk.surfaceMs / 1000), t);
    else if (Math.random() < 0.2) this.goo.get("sludge_slime")?.explode(1, pos.x, pos.y);
  }

  /** A grappler's hook out on its line (flying, or dragging someone in). */
  private drawHook(from: Vec, tip: Vec): void {
    const o = this.over;
    o.lineStyle(2, 0x1b1020, 0.9).lineBetween(from.x, from.y - 2, tip.x, tip.y);
    o.lineStyle(1, 0xc9cfd6, 1).lineBetween(from.x, from.y - 2, tip.x, tip.y);
    const a = Math.atan2(tip.y - from.y + 2, tip.x - from.x);
    o.lineStyle(2, 0xc9cfd6, 1).beginPath().arc(tip.x, tip.y, 4, a - Math.PI * 0.6, a + Math.PI * 0.6).strokePath();
  }

  /** Laser Sweep beams: thin and flickering while it charges (`k` < 1), then solid as they turn. */
  private drawSweep(e: Enemy, pos: Vec, k: number, t: number): void {
    const atk = ENEMIES[e.defId]!.attacks[e.attackIdx]!;
    if (atk.type !== "sweep") return;
    const n = sweepBeams(e, atk);
    const a0 = sweepAngle(e, atk);
    const live = e.state === "attack";
    const g = this.over;
    for (let i = 0; i < n; i++) {
      const dir = fromAngle(a0 + (i / n) * Math.PI * 2);
      const l = beamLength(this.world.arena, pos, dir);
      const end = { x: pos.x + dir.x * l, y: pos.y + dir.y * l };
      if (live) {
        g.lineStyle(atk.width * 2 + 4, 0xff3a5a, 0.3).lineBetween(pos.x, pos.y, end.x, end.y);
        g.lineStyle(atk.width, 0xffd0d8, 0.95).lineBetween(pos.x, pos.y, end.x, end.y);
        if (Math.random() < 0.5) this.sparks.explode(1, end.x, end.y);
      } else {
        g.lineStyle(1, 0xff3a5a, (0.3 + 0.6 * k) * (0.6 + 0.4 * Math.sin(t * 0.05))).lineBetween(pos.x, pos.y, end.x, end.y);
        // Which way it will turn: a short arc at the end of the first beam.
        if (i === 0) {
          const spin = (e.attackPoints[0]?.x ?? 1) < 0 ? -1 : 1;
          const ang = a0 + spin * 0.35;
          g.lineStyle(2, 0xff9a2a, 0.8).beginPath().arc(pos.x, pos.y, 40, Math.min(a0, ang), Math.max(a0, ang)).strokePath();
        }
      }
    }
  }

  /** Telegraphs stay serious even when the enemies aren't: red flash = melee, line = dash, circle = area. */
  private drawTelegraph(e: Enemy, pos: Vec, k: number, t: number): void {
    const def = ENEMIES[e.defId]!;
    const atk = def.attacks[e.attackIdx]!;
    const g = this.dark ? this.over : this.ground;
    switch (atk.type) {
      case "shockwave":
        // A stomp coming: rings pulse out of the boss, faster as it gets close.
        for (let i = 0; i < 3; i++) {
          const r = ((t * 0.12 * (1 + k) + i * 30) % 90) + e.radius;
          g.lineStyle(2, 0xff9a2a, 0.8 * (1 - (r - e.radius) / 90)).strokeCircle(pos.x, pos.y, r);
        }
        g.fillStyle(0xe0533d, 0.15 + 0.25 * k).fillCircle(pos.x, pos.y, e.radius + 10);
        break;
      case "nova":
        // Bolts gathering: spokes all the way round.
        for (let i = 0; i < atk.count; i++) {
          const a = (i / atk.count) * Math.PI * 2;
          const r0 = e.radius + 4;
          const r1 = r0 + 6 + 20 * k;
          g.lineStyle(1, 0xb46cff, 0.4 + 0.5 * k).lineBetween(pos.x + Math.cos(a) * r0, pos.y + Math.sin(a) * r0, pos.x + Math.cos(a) * r1, pos.y + Math.sin(a) * r1);
        }
        break;
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
        for (const p of e.attackPoints) this.groundCircle(p, atk.radius, k * 0.5, t, atk.puddle?.fire ? 0xff9a2a : atk.puddle ? 0x7ee05a : 0xe0533d);
        break;
      case "submerge":
        // Taking a breath: the water churns around it.
        g.lineStyle(2, 0x8ab86a, 0.4 + 0.5 * k).strokeEllipse(pos.x, pos.y + e.radius * 0.5, (e.radius + 6 + 10 * k) * 2, (e.radius + 6 + 10 * k) * 1.1);
        break;
      case "sweep":
        this.drawSweep(e, pos, k, t);
        break;
      case "slam":
        this.groundCircle(e.pos, atk.radius, k, t);
        break;
      case "cone": {
        // Breath: the wedge it will cover, filling from the mouth outward.
        const ang = angleOf(e.attackDir);
        const half = (atk.angleDeg * Math.PI) / 360;
        g.fillStyle(0x7ad7ff, 0.12 + 0.12 * k).slice(pos.x, pos.y, atk.length, ang - half, ang + half, false).fillPath();
        g.fillStyle(0x7ad7ff, 0.3).slice(pos.x, pos.y, Math.max(1, atk.length * k), ang - half, ang + half, false).fillPath();
        g.lineStyle(1, 0xcfe8ff, 0.6 + 0.4 * Math.sin(t * 0.03)).slice(pos.x, pos.y, atk.length, ang - half, ang + half, false).strokePath();
        break;
      }
      case "shieldAllies":
        g.lineStyle(1, SHIELD_COLOR, 0.3 + 0.3 * k).strokeCircle(pos.x, pos.y, atk.radius * k);
        this.over.fillStyle(SHIELD_COLOR, 0.25 * k).fillCircle(pos.x, pos.y - e.radius, 4 + 6 * k);
        break;
      case "summon":
        g.lineStyle(1, 0xb48cff, 0.4 + 0.5 * k).strokeCircle(pos.x, pos.y, e.radius + 4 + 10 * (1 - k));
        break;
      case "grab": {
        const a = angleOf(e.attackDir);
        if (atk.hook) {
          // Winding up a hook: the line it will fly along, filling toward the end as the throw comes.
          const l = Math.min(atk.hook.range, beamLength(this.world.arena, pos, e.attackDir));
          const end = { x: pos.x + Math.cos(a) * l, y: pos.y + Math.sin(a) * l };
          g.lineStyle(3, 0xe0533d, 0.15 + 0.2 * k).lineBetween(pos.x, pos.y, end.x, end.y);
          g.lineStyle(1, 0xff6a5a, 0.6 + 0.4 * Math.sin(t * 0.03)).lineBetween(pos.x, pos.y, end.x, end.y);
          g.lineStyle(3, 0xff6a5a, 0.5).lineBetween(pos.x, pos.y, pos.x + Math.cos(a) * l * k, pos.y + Math.sin(a) * l * k);
          break;
        }
        // Arms out: the reach it's about to close, in front of it.
        const reach = e.radius + atk.reach + 6;
        g.fillStyle(0xe0533d, 0.1 + 0.2 * k).slice(pos.x, pos.y, reach, a - 0.9, a + 0.9, false).fillPath();
        g.lineStyle(1, 0xff6a5a, 0.6 + 0.4 * Math.sin(t * 0.03)).slice(pos.x, pos.y, reach, a - 0.9, a + 0.9, false).strokePath();
        break;
      }
      case "blackout":
        // The lights are about to go: darkness gathering in toward it.
        for (let i = 0; i < 3; i++) {
          const r = ((1 - k) * 120 + i * 24) % 140 + e.radius;
          this.over.lineStyle(2, 0x1b1020, 0.5 + 0.4 * k).strokeCircle(pos.x, pos.y, r);
        }
        this.over.lineStyle(1, 0x7ef0b0, 0.5 + 0.5 * k).strokeCircle(pos.x, pos.y, e.radius + 6);
        break;
    }
  }

  private groundCircle(at: Vec, r: number, k: number, t: number, color = 0xe0533d): void {
    const g = this.dark ? this.over : this.ground;
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
      // Co-op draws your own straight shots from prediction (renderLocalBullets), not from the server.
      if (this.net && pr.owner === "player" && pr.ownerId === this.myId && !pr.lob && !pr.special) continue;
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
        // A vengeful elite's death blast is only a circle on the floor, no shell.
        const doom = pr.kind === "doom";
        v.img.setPosition(pos.x, pos.y - z).setDepth(D.air).setAngle(pr.kind === "grenade" ? k * 720 : 0).setVisible(!doom);
        v.glow.setPosition(pos.x, pos.y - z).setVisible(!doom);
        v.shadow?.setPosition(pos.x, pos.y).setScale(1 - (z / arc) * 0.5).setVisible(!doom);
        const ring = doom ? 0xff6a3c : pr.kind === "page" ? 0xd8ffe8 : pr.kind === "slush" ? 0x7ad7ff : pr.lob.puddle && pr.element === "fire" ? 0xff9a2a : pr.lob.puddle ? 0x7ee05a : 0xe0533d;
        if (pr.owner === "enemy") this.groundCircle(pr.lob.to, pr.lob.radius, 0.5 + k * 0.5, this.time.now, ring);
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
      if (pr.kind === "slush") img.setTint(0x9ff3ff);
      // The Night Auditor's pages glow, so you can see them coming in the blackout.
      if (pr.kind === "page") img.setTint(0xf4ecd8);
      const enemyGlow = pr.kind === "acid" ? 0x7ee05a : pr.kind === "slush" ? 0x9ff3ff : pr.kind === "page" ? 0x9ff3c8 : 0xff6a3c;
      glow.setTint(pr.owner === "enemy" ? enemyGlow : pr.element === "none" ? 0xffd27a : elem).setScale(pr.kind === "page" ? 0.9 : 0.5).setAlpha(pr.kind === "page" ? 0.9 : 0.6);
      return { img, glow, shadow: this.take("shadow-s").setDepth(D.ground + 1) };
    }
    if (pr.kind === "rocket") {
      glow.setTint(0xff7a1a).setScale(0.6).setAlpha(0.9);
      return { img: this.take("shell").setTint(0xffe08a), glow };
    }
    if (pr.kind === "turret") {
      glow.setTint(pr.element === "none" ? 0xffb238 : elem).setScale(0.3).setAlpha(0.8);
      return { img: this.take("px").setTint(pr.element === "none" ? 0xffe08a : elem), glow };
    }
    if (pr.owner === "enemy") {
      // Wizard bolts: slow, big, purple and readable.
      glow.setTint(0xb46cff).setScale(0.45).setAlpha(0.9);
      return { img: this.take("px").setTint(0xf0d8ff).setScale(1.5), glow };
    }
    const img = this.take(pr.kind === "sniper" ? "streak" : "px").setTint(pr.element === "none" ? 0xfff6c8 : elem);
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
      // Signature domes look different: a purple black hole, a gold revolving door.
      const sig = this.playerById(d.ownerId)?.signature;
      const [fill, line] = sig === "sig_blackhole" ? [0x8c5ad1, 0xd29bff] : sig === "sig_revolving" ? [0xf2c14e, 0xffe08a] : [0x5fd3e8, 0x9ff3ff];
      this.over.fillStyle(fill, (sig === "sig_blackhole" ? 0.2 : 0.1) * a).fillCircle(d.pos.x, d.pos.y, d.radius);
      this.over.lineStyle(1, line, 0.8 * a).strokeCircle(d.pos.x, d.pos.y, d.radius);
      // The black hole's inner ring spirals in; the others breathe.
      const inner = sig === "sig_blackhole" ? d.radius * (1 - ((t * 0.001) % 1)) : d.radius - 3 + Math.sin(t * 0.01) * 1.5;
      this.over.lineStyle(1, line, 0.25 * a).strokeCircle(d.pos.x, d.pos.y, Math.max(2, inner));
      let light = this.domeLights.get(d.id);
      if (!light) {
        light = this.take("glow").setBlendMode(Phaser.BlendModes.ADD).setTint(fill).setDepth(D.light);
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

  /** Turrets and owls: sprite, light, health and time left. */
  private renderGadgets(t: number): void {
    const seen = new Set<number>();
    for (const g of this.world.gadgets) {
      seen.add(g.id);
      let v = this.gadgetViews.get(g.id);
      if (!v) {
        v = {
          shadow: this.add.image(0, 0, "shadow-s").setDepth(D.ground + 1),
          body: this.add.image(0, 0, g.kind === "turret" ? "turret" : g.kind === "ghost" ? (g.defId ?? "cone_rat") : "owl").setOrigin(0.5, 1),
          light: this.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setDepth(D.light),
        };
        this.gadgetViews.set(g.id, v);
      }
      this.renderGadget(g, v, t);
    }
    for (const [id, v] of this.gadgetViews) {
      if (seen.has(id)) continue;
      for (const o of [v.body, v.shadow, v.light]) o.destroy();
      this.gadgetViews.delete(id);
    }
  }

  private renderGadget(g: Gadget, v: GadgetView, t: number): void {
    const owner = this.playerById(g.ownerId);
    const color = SLOT_COLORS[owner?.slot ?? 0] ?? 0xffffff;
    // Blink in the last second so you know it's about to go.
    const ending = g.t < 1 && Math.floor(t / 90) % 2 === 0;
    if (g.kind === "turret") {
      const target = this.world.enemies.reduce<Enemy | undefined>((best, e) => (e.spawnT > 0 || e.state === "hidden" ? best : !best || Math.hypot(e.pos.x - g.pos.x, e.pos.y - g.pos.y) < Math.hypot(best.pos.x - g.pos.x, best.pos.y - g.pos.y) ? e : best), undefined);
      const scale = g.mini ? 0.7 : 1;
      v.body.setPosition(g.pos.x, g.pos.y + 5).setScale(scale).setFlipX(!!target && target.pos.x < g.pos.x).setDepth(g.pos.y).setAlpha(ending ? 0.5 : 1);
      v.shadow.setPosition(g.pos.x, g.pos.y + 4);
      const elem = g.element === "none" ? 0xffd27a : ELEMENT_COLORS[g.element];
      v.light.setPosition(g.pos.x, g.pos.y - 3).setTint(elem).setScale(0.6 * scale).setAlpha(0.35);
      // Health, once it's been hit, and a ring in your color so friends know whose it is.
      this.ground.lineStyle(1, color, 0.5).strokeEllipse(g.pos.x, g.pos.y + 4, 14 * scale, 5 * scale);
      if (g.hp < g.maxHp) {
        const bw = 12;
        this.over.fillStyle(0x1b1020).fillRect(Math.round(g.pos.x - bw / 2) - 1, Math.round(g.pos.y - 14) - 1, bw + 2, 3);
        this.over.fillStyle(0xf2c14e).fillRect(Math.round(g.pos.x - bw / 2), Math.round(g.pos.y - 14), Math.max(1, Math.round((bw * g.hp) / g.maxHp)), 1);
      }
      return;
    }
    if (g.kind === "ghost") {
      // Excess Baggage: the enemy as a pale, flickering ghost, floating a little, glowing your color underneath.
      const prey = this.world.enemies.reduce<Enemy | undefined>((best, e) => (e.spawnT > 0 || e.state === "hidden" ? best : !best || Math.hypot(e.pos.x - g.pos.x, e.pos.y - g.pos.y) < Math.hypot(best.pos.x - g.pos.x, best.pos.y - g.pos.y) ? e : best), undefined);
      const hover = Math.sin(t * 0.01 + g.id) * 1.5;
      const flicker = 0.55 + 0.15 * Math.sin(t * 0.03 + g.id);
      v.body.setPosition(g.pos.x, g.pos.y + 5 + hover - 2).setTint(0x9ff3ff).setAlpha(ending ? 0.3 : flicker).setFlipX(!!prey && prey.pos.x < g.pos.x).setDepth(g.pos.y);
      v.shadow.setPosition(g.pos.x, g.pos.y + 4).setAlpha(0.3);
      v.light.setPosition(g.pos.x, g.pos.y - 4).setTint(0x9ff3ff).setScale(0.8).setAlpha(0.35);
      this.ground.lineStyle(1, color, 0.5).strokeEllipse(g.pos.x, g.pos.y + 4, 14, 5);
      return;
    }
    // The owl bobs, and its healing reach shows as a soft green circle on the floor.
    const bob = Math.sin(t * 0.008 + g.id) * 2;
    v.body.setPosition(g.pos.x, g.pos.y + bob).setDepth(g.pos.y + 20).setAlpha(ending ? 0.5 : 1).setFlipX(!!owner && owner.pos.x < g.pos.x);
    v.shadow.setPosition(g.pos.x, g.pos.y + 12).setAlpha(0.6);
    v.light.setPosition(g.pos.x, g.pos.y - 4 + bob).setTint(0x5fd36a).setScale(0.8).setAlpha(0.3);
    const reach = owner?.signature === "sig_flock" ? 42 : 60;
    this.ground.fillStyle(0x5fd36a, 0.05).fillCircle(g.pos.x, g.pos.y + 8, reach);
    this.ground.lineStyle(1, 0x5fd36a, 0.25 + 0.1 * Math.sin(t * 0.006)).strokeCircle(g.pos.x, g.pos.y + 8, reach);
  }

  private pickupKey(pk: Pickup): string {
    switch (pk.kind) {
      case "gun": {
        const myth = mythicArtId(pk.gun!);
        return myth ? `mythic_${myth}` : "gun_" + gunStats(pk.gun!).archetype;
      }
      case "heal":
        return "snack";
      case "shrine":
        return "shrine";
      case "chest":
        return pk.used ? "suitcase_open" : "suitcase";
      case "boost":
        return "orb";
      case "grenade": {
        const myth = mythicArtId(pk.grenade!);
        return myth ? `mythic_${myth}` : "grenade";
      }
      case "relic": {
        const myth = mythicArtId(pk.relic!);
        return myth ? `mythic_${myth}` : `relic_${pk.relic!.defId}`;
      }
    }
  }

  private destroyPickupView(v: PickupView): void {
    v.sprite.destroy();
    v.glow.destroy();
    v.beam?.destroy();
    v.rays?.destroy();
    v.halo?.destroy();
  }

  /**
   * A mythic on the floor: the item floats higher, over turning rays and a tall beam that walk through the mythic
   * colors, with sparkles orbiting it. You should be able to spot one from across the room.
   */
  private renderMythicPickup(pk: Pickup, v: PickupView, t: number, bob: number): void {
    const hue = mythicHue(t + pk.id * 300);
    const y = pk.pos.y - 8 + bob * 2;
    v.sprite.setPosition(pk.pos.x, y).setDepth(pk.pos.y + 1).setAngle(Math.sin(t * 0.002 + pk.id) * 6).clearTint();
    // Rays and glow sit just behind the item, not over it, so the art stays crisp.
    v.rays!.setPosition(pk.pos.x, y).setDepth(pk.pos.y).setRotation(t * 0.0012).setTint(hue).setAlpha(0.5 + bob * 0.1).setScale(0.9 + 0.08 * Math.sin(t * 0.003));
    v.glow.setPosition(pk.pos.x, y).setDepth(pk.pos.y - 1).setTint(hue).setAlpha(0.45 + bob * 0.1).setScale(1.5);
    v.beam?.setTint(hue).setAlpha(0.45 + bob * 0.15);
    v.halo!.setPosition(pk.pos.x, pk.pos.y).setScale(3, (BEAM_HEIGHT.mythic * 0.7) / 2).setTint(mythicHue(t + 1200 + pk.id * 300)).setAlpha(0.18 + 0.08 * Math.sin(t * 0.005));
    this.ground.fillStyle(hue, 0.3).fillEllipse(pk.pos.x, pk.pos.y + 3, 22 + bob * 2, 7);
    this.ground.lineStyle(1, 0xffffff, 0.35).strokeEllipse(pk.pos.x, pk.pos.y + 3, 26 + bob * 2, 9);
    // Three sparkles orbiting, each blinking on its own beat.
    for (let i = 0; i < 3; i++) {
      const a = t * 0.0025 + (i * Math.PI * 2) / 3;
      const sx = Math.round(pk.pos.x + Math.cos(a) * 13);
      const sy = Math.round(y + Math.sin(a) * 5);
      const on = (t * 0.004 + i * 0.37 + pk.id) % 1;
      if (on > 0.6) continue;
      const r = on < 0.3 ? 2 : 1;
      this.over.fillStyle(mythicHue(t + i * 800), 0.95).fillRect(sx - r, sy, r * 2 + 1, 1).fillRect(sx, sy - r, 1, r * 2 + 1);
      this.over.fillStyle(0xffffff, 1).fillRect(sx, sy, 1, 1);
    }
    // Now and then a mote drifts up the beam.
    if (Math.random() < 0.15) this.flash(pk.pos.x + (Math.random() - 0.5) * 8, pk.pos.y - Math.random() * BEAM_HEIGHT.mythic, mythicHue(t + Math.random() * 2400), 6, 500);
  }

  private renderPickups(t: number): void {
    const seen = new Set<number>();
    const player = this.me;
    const inReach = player.downed ? undefined : interactable(this.world, player);
    for (const pk of this.world.pickups) {
      // Boost offers are personal: you only see your own.
      if (pk.owner !== undefined && pk.owner !== this.myId) continue;
      seen.add(pk.id);
      const key = this.pickupKey(pk);
      const color = pk.kind === "gun" ? RARITY_COLORS[pk.gun!.rarity] : pk.kind === "grenade" ? RARITY_COLORS[pk.grenade!.rarity] : pk.kind === "relic" ? RARITY_COLORS[pk.relic!.rarity] : pk.kind === "heal" ? 0x5fd36a : pk.kind === "boost" ? BOOST_COLORS[BOOSTS[pk.boost!]?.rarity ?? "common"] : 0xf2c14e;
      let v = this.pickupViews.get(pk.id);
      if (v && (v.key !== key || v.color !== color)) {
        // A swap left a different archetype or rarity on the floor; rebuild the view.
        this.destroyPickupView(v);
        this.pickupViews.delete(pk.id);
        v = undefined;
      }
      if (!v) {
        v = {
          key,
          color,
          sprite: this.add.image(pk.pos.x, pk.pos.y, key).setOrigin(0.5, pk.kind === "gun" || pk.kind === "grenade" || pk.kind === "relic" ? 0.5 : 1),
          glow: this.add.image(pk.pos.x, pk.pos.y - 2, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(D.light),
        };
        const beamH = pk.kind === "gun" ? BEAM_HEIGHT[pk.gun!.rarity] : pk.kind === "grenade" ? BEAM_HEIGHT[pk.grenade!.rarity] * 0.6 : pk.kind === "relic" ? BEAM_HEIGHT[pk.relic!.rarity] * 0.8 : 0;
        if (beamH > 0) v.beam = this.add.image(pk.pos.x, pk.pos.y, "px").setOrigin(0.5, 1).setScale(1, beamH / 2).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5).setDepth(D.light);
        if (key.startsWith("mythic_")) {
          v.rays = this.add.image(pk.pos.x, pk.pos.y, "mythic-rays").setBlendMode(Phaser.BlendModes.ADD).setDepth(D.light);
          v.halo = this.add.image(pk.pos.x, pk.pos.y, "px").setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.light);
        }
        this.pickupViews.set(pk.id, v);
      }
      const bob = Math.sin(t * 0.004 + pk.id);
      if (v.rays) {
        this.renderMythicPickup(pk, v, t, bob);
      } else if (pk.kind === "gun") {
        const rarity = pk.gun!.rarity;
        v.sprite.setPosition(pk.pos.x, pk.pos.y - 5 + bob * 1.5).setDepth(pk.pos.y + 1);
        if (pk.gun!.element !== "none" && Math.floor(t / 500) % 2 === 0) v.sprite.setTint(ELEMENT_COLORS[pk.gun!.element]);
        else v.sprite.clearTint();
        v.glow.setAlpha(0.35 + bob * 0.1).setScale(rarity === "legendary" ? 1.4 : 0.9);
        v.beam?.setAlpha(0.35 + bob * 0.15);
        this.ground.fillStyle(RARITY_COLORS[rarity], 0.25).fillEllipse(pk.pos.x, pk.pos.y + 3, 16, 5);
      } else if (pk.kind === "grenade") {
        // A grenade spinning gently over a rarity puddle, flashing its element now and then.
        const rarity = pk.grenade!.rarity;
        const element = GRENADES[pk.grenade!.defId]?.element ?? "none";
        v.sprite.setPosition(pk.pos.x, pk.pos.y - 4 + bob * 1.5).setDepth(pk.pos.y + 1).setScale(1.5).setAngle(Math.sin(t * 0.003 + pk.id) * 20);
        if (element !== "none" && Math.floor(t / 500) % 2 === 0) v.sprite.setTint(ELEMENT_COLORS[element]);
        else v.sprite.clearTint();
        v.glow.setAlpha(0.3 + bob * 0.1).setScale(rarity === "legendary" ? 1.1 : 0.7);
        v.beam?.setAlpha(0.35 + bob * 0.15);
        this.ground.fillStyle(RARITY_COLORS[rarity], 0.25).fillEllipse(pk.pos.x, pk.pos.y + 3, 12, 4);
      } else if (pk.kind === "relic") {
        // A relic hangs in the air turning slowly, as if on a string, over a rarity puddle.
        const rarity = pk.relic!.rarity;
        v.sprite.setPosition(pk.pos.x, pk.pos.y - 6 + bob * 2).setDepth(pk.pos.y + 1).setScale(1.3).setAngle(Math.sin(t * 0.002 + pk.id) * 12);
        v.glow.setAlpha(0.35 + bob * 0.12).setScale(rarity === "legendary" ? 1.3 : 0.8);
        v.beam?.setAlpha(0.35 + bob * 0.15);
        this.ground.fillStyle(RARITY_COLORS[rarity], 0.25).fillEllipse(pk.pos.x, pk.pos.y + 3, 14, 5);
      } else if (pk.kind === "heal") {
        v.sprite.setPosition(pk.pos.x, pk.pos.y + 3 + bob).setDepth(pk.pos.y);
        v.glow.setAlpha(0.3).setScale(0.6);
      } else if (pk.kind === "boost") {
        // A gem hovering over a little shadow, tinted by rarity.
        const c = BOOST_COLORS[BOOSTS[pk.boost!]?.rarity ?? "common"];
        v.sprite.setPosition(pk.pos.x, pk.pos.y - 4 + bob * 2).setDepth(pk.pos.y + 1).setTint(c);
        v.glow.setAlpha(0.45 + bob * 0.15).setScale(1.1).setPosition(pk.pos.x, pk.pos.y - 8 + bob * 2);
        this.ground.fillStyle(c, 0.25).fillEllipse(pk.pos.x, pk.pos.y + 3, 14, 5);
      } else {
        v.sprite.setPosition(pk.pos.x, pk.pos.y + 6).setDepth(pk.pos.y + 6).setAlpha(pk.used && pk.kind === "shrine" && pk.boost ? 0.5 : 1);
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
      const s = heldGrenade(p);
      const d = Math.min(len(prev.offset), s.range);
      const at = { x: pos.x + (prev.offset.x / (len(prev.offset) || 1)) * d, y: pos.y + (prev.offset.y / (len(prev.offset) || 1)) * d };
      const c = s.def.element === "none" ? 0xffffff : ELEMENT_COLORS[s.def.element];
      g.lineStyle(1, c, 0.6).strokeCircle(at.x, at.y, s.radius);
      g.fillStyle(c, 0.08).fillCircle(at.x, at.y, s.radius);
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

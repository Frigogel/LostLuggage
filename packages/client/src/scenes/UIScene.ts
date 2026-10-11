import Phaser from "phaser";
import {
  ACT_ROOMS,
  BIOMES,
  BOOSTS,
  FINAL_ACT,
  ROOM_NAMES,
  TWISTS,
  ELITES,
  COSMETICS,
  SIGNATURES,
  DASH,
  ELEMENT_INFO,
  ENEMIES,
  GRENADE,
  HEROES,
  LEGENDARIES,
  MAKERS,
  PERKS,
  gunDps,
  gunName,
  gunStats,
  interactable,
  type Gun,
  type Pickup,
  type Player,
  type RoomKind,
  type RunReward,
  type SimEvent,
  type World,
} from "@lostluggage/sim";
import { BUTTONS, Controls, SCREEN, STICK_R, WEAPON_SLOTS, stickValue, type ButtonId, type Stick } from "../controls";
import { ELEMENT_COLORS, RARITY_COLORS, SLOT_COLORS } from "../render/colors";
import { BOOST_COLORS, type GameScene } from "./GameScene";

const BUTTON_LABELS: Record<ButtonId, { touch: string; keys: string }> = {
  skill: { touch: "DOME", keys: "E" },
  dash: { touch: "DASH", keys: "SPC" },
  grenade: { touch: "NADE", keys: "Q" },
  interact: { touch: "GRAB", keys: "F" },
};
const DESKTOP_HELP = (skill: string) => `WASD MOVE  CLICK SHOOT  SPACE DASH  E ${skill}  Q NADE\n1/2 SWAP  T AUTO-AIM  M MUTE  P PAUSE`;
/** Each hero's skill button has its own color. */
const SKILL_COLORS: Record<string, number> = { vanguard: 0x5fd3e8, gunslinger: 0xf2c14e, tinker: 0xffb238, warden: 0x5fd36a };
/** What the bosses have to say as they get angrier. */
const BOSS_PHASES: Record<string, string[]> = {
  furnace_foreman: ["HE'S FILING A COMPLAINT", "HE WANTS A FULL REFUND", "HE'S TAKING THIS TO THE TOP"],
  complaint_dragon: ["IT'S CC'ING YOUR MANAGER", "IT WANTS COMPENSATION. IN GOLD.", "IT'S WRITING A ONE-STAR REVIEW"],
};
/** What the big boss attacks want from you, said out loud the first few times. */
const BOSS_CALLS: Record<string, [string, string]> = {
  shockwave: ["SHOCKWAVE!", "DASH THROUGH THE RING"],
  nova: ["INCOMING!", "SLIP THROUGH THE GAPS"],
  lobbedProjectile: ["IT'S RAINING!", "KEEP MOVING. WATCH THE CIRCLES"],
};
const BOSS_WINS: Record<string, string> = {
  furnace_foreman: "THE FOREMAN HAS BEEN ESCALATED.",
  complaint_dragon: "THE COMPLAINT HAS BEEN FILED. AND IGNORED.",
};
/** Who splits into what, for introducing the pieces. */
const SPLITS: Record<string, string> = { foundry: "blobling", caverns: "snowball" };
/** What the pickup button says for each kind of item. */
const PICKUP_VERBS = { gun: "SWAP", shrine: "PRAY", chest: "OPEN", heal: "GRAB", boost: "TAKE" };
const ROOM_ICONS: Record<RoomKind, number> = { intro: 0xc9cfd6, combat: 0xe0533d, elite: 0xff9a2a, event: 0xb46cff, shrine: 0xf2c14e, rest: 0x5fd36a, boss: 0xff3030 };
/** What each kind of room says when you walk in. */
const ROOM_BANNERS: Partial<Record<RoomKind, [string, string, number]>> = {
  rest: ["REST STOP", "HALF YOUR HEALTH BACK, AND A SUITCASE. TAKE A BREATH.", 0x5fd36a],
  shrine: ["SHRINE", "TWO BOOSTS FOR EVERYONE. CHOOSE WELL.", 0xf2c14e],
  elite: ["ELITE FIGHT", "TOUGH CROWD. BETTER LOOT.", 0xff9a2a],
};
const SEEN_KEY = "lostluggage.seenEnemies";

type Text = Phaser.GameObjects.BitmapText;

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export class UIScene extends Phaser.Scene {
  controls!: Controls;

  private gfx!: Phaser.GameObjects.Graphics;
  private hurtOverlay!: Phaser.GameObjects.Rectangle;
  private heroLabel!: Text;
  private hpText!: Text;
  private roomText!: Text;
  private actText!: Text;
  private killText!: Text;
  private bossName!: Text;
  private boostText!: Text;
  private buttonText = new Map<ButtonId, Text>();
  private banner!: Text;
  private subBanner!: Text;
  private card!: Text[];
  private help!: Text;
  private exitLabel!: Text;
  private toast!: Text[];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private panel?: Phaser.GameObjects.Container;
  private pausePanel?: Phaser.GameObjects.Container;
  /** Tappable areas on the end and pause panels, in screen pixels. */
  private panelButtons: { x: number; y: number; w: number; h: number; action: () => void }[] = [];
  private partyText: Text[] = [];
  private netText!: Text;
  private partyToast!: Text;
  /** Names of everyone seen this run, so "X left" still has a name after they're gone. */
  private names = new Map<number, string>();
  private secondWind = false;
  /** Reward lines on the end panel, filled in when the co-op server's reward arrives. */
  private rewardText: Text[] = [];
  private rewardShown = false;
  private statusShown = false;
  private seen = loadSeen();
  /** Toasts wait their turn, so a new enemy and a new elite arriving together are both read. */
  private toastQueue: [string, string, number][] = [];
  private toastUntil = 0;

  constructor() {
    super("ui");
  }

  init(): void {
    // Scene instances are reused on restart, so drop references to the old run's objects.
    this.slotIcons = [];
    this.buttonText.clear();
    this.panel = undefined;
    this.pausePanel = undefined;
    this.panelButtons = [];
    this.partyText = [];
    this.names.clear();
    this.secondWind = false;
    this.statusShown = false;
    this.rewardText = [];
    this.rewardShown = false;
    this.toastQueue = [];
    this.toastUntil = 0;
  }

  private get game_(): GameScene {
    return this.scene.get("game") as GameScene;
  }

  private text(x: number, y: number, s: string, size = 8): Text {
    return this.add.bitmapText(x, y, "pixel", s, size).setLetterSpacing(-1);
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

    this.heroLabel = this.text(6, 4, HEROES.vanguard!.name.toUpperCase());
    this.hpText = this.text(110, 14, "");
    this.boostText = this.text(6, 26, "").setTint(0xf2c14e);
    this.roomText = this.text(SCREEN.w / 2, 13, "").setOrigin(0.5, 0);
    this.actText = this.text(SCREEN.w / 2, 3, "").setOrigin(1, 0).setTint(0xf2c14e);
    this.killText = this.text(SCREEN.w / 2, 23, "").setOrigin(0.5, 0).setTint(0xc9cfd6);
    this.bossName = this.text(SCREEN.w / 2, 23, "").setOrigin(0.5, 0).setTint(0xff9a2a);
    for (const id of Object.keys(BUTTONS) as ButtonId[]) {
      const b = BUTTONS[id];
      this.buttonText.set(id, this.text(b.x + 1, b.y, "").setOrigin(0.5));
    }
    WEAPON_SLOTS.forEach((s) => this.slotIcons.push(this.add.image(s.x + s.w / 2, s.y + 8, "gun_pistol")));

    this.banner = this.text(SCREEN.w / 2, 92, "", 16).setOrigin(0.5).setAlpha(0);
    this.subBanner = this.text(SCREEN.w / 2, 112, "", 8).setOrigin(0.5).setAlpha(0).setTint(0xffe08a);
    this.card = [0, 1, 2, 3, 4, 5, 6].map((i) => this.text(SCREEN.w / 2, SCREEN.h - 70 + i * 11, "").setOrigin(0.5, 0));
    this.help = this.text(SCREEN.w / 2, SCREEN.h - 4, DESKTOP_HELP(HEROES[game.me.heroId]!.skillName), 8).setOrigin(0.5, 1).setCenterAlign().setTint(0xc9cfd6);
    this.tweens.add({ targets: this.help, alpha: 0, delay: 12000, duration: 1500 });
    this.exitLabel = this.text(0, 0, "DOORS", 8).setOrigin(0.5).setTint(0x5fd36a);
    this.toast = [this.text(6, 52, "").setTint(0xffe08a), this.text(6, 63, "").setTint(0xc9cfd6)];
    // Party panel under your health: one line per teammate.
    this.partyText = [0, 1, 2].map((i) => this.text(14, 38 + i * 10, ""));
    this.partyToast = this.text(SCREEN.w / 2, 132, "").setOrigin(0.5).setAlpha(0);
    this.netText = this.text(4, SCREEN.h - 3, "").setOrigin(0, 1).setTint(0x8a8090);

    game.events.on("sim", this.onSim, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => game.events.off("sim", this.onSim, this));

    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      const w = this.game_.world;
      const btn = this.panelButtons.find((b) => ptr.x >= b.x && ptr.x <= b.x + b.w && ptr.y >= b.y && ptr.y <= b.y + b.h);
      if (btn && (this.pausePanel || this.panel?.getData("ready"))) btn.action();
      else if (this.game_.paused) this.unpause();
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
      if (this.panel?.getData("ready")) this.restart();
    });
    this.input.keyboard!.on("keydown-L", () => {
      if (this.pausePanel || this.panel) this.leave();
    });
    this.input.keyboard!.on("keydown-ESC", () => (this.game_.paused ? this.unpause() : this.pause()));
  }

  private restart(): void {
    const net = this.game_.net;
    // Co-op: the host asks the server for a new run, and everyone's scenes restart when it starts.
    if (net) {
      if (net.isHost) net.again();
      return;
    }
    // Solo: the menu starts a fresh run with your updated loadout.
    this.controls.reset();
    this.game.events.emit("soloAgain");
  }

  /** Back to the menu. Quitting a solo run early still takes your loot home. */
  private leave(): void {
    this.game_.reportRun();
    this.game.events.emit("leave");
  }

  private pause(): void {
    if (this.game_.world.gameOver || this.panel) return;
    // Co-op keeps running: "pause" is a menu, and your hero stands still while it's open.
    this.game_.paused = true;
    this.controls.reset();
  }

  private unpause(): void {
    this.game_.resume();
    this.pausePanel?.destroy();
    this.pausePanel = undefined;
    this.panelButtons = [];
  }

  /** A tappable text button inside a panel container centered on screen. */
  private panelButton(c: Phaser.GameObjects.Container, x: number, y: number, label: string, tint: number, action: () => void): void {
    const t = this.add.bitmapText(x, y, "pixel", label, 8).setOrigin(0.5).setLetterSpacing(-1).setTint(tint);
    const w = t.width + 16;
    const h = 16;
    const bg = this.add.rectangle(x, y, w, h, 0x1b1020, 1).setStrokeStyle(1, tint);
    c.add([bg, t]);
    this.panelButtons.push({ x: c.x + x - w / 2, y: c.y + y - h / 2, w, h, action });
  }

  /** Short party news under the banner: joins, leaves, downs. */
  private partyNews(text: string, tint: number): void {
    this.partyToast.setText(text).setTint(tint).setAlpha(1);
    this.tweens.killTweensOf(this.partyToast);
    this.tweens.add({ targets: this.partyToast, alpha: 0, delay: 2500, duration: 500 });
  }

  private nameOf(id: number): string {
    return this.names.get(id) ?? "A FRIEND";
  }

  private showBanner(main: string, sub = "", tint = 0xffffff, ms = 1600): void {
    this.banner.setText(main).setTint(tint).setAlpha(1).setScale(1.6);
    this.subBanner.setText(sub).setAlpha(sub ? 1 : 0);
    this.tweens.killTweensOf([this.banner, this.subBanner]);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: "Back.out" });
    this.tweens.add({ targets: [this.banner, this.subBanner], alpha: 0, delay: ms, duration: 400 });
  }

  /** First time you meet an enemy type, it gets introduced with its one-line gag. */
  private introduce(defId: string): void {
    // Bosses get a full-screen banner instead.
    if (this.seen.has(defId) || ENEMIES[defId]!.role === "boss") return;
    const def = ENEMIES[defId]!;
    this.toastOnce(defId, `NEW: ${def.name.toUpperCase()}`, def.flavor.toUpperCase(), 0xffe08a);
  }

  /** The first time a toast's key comes up, it slides in under the party list. Remembered across runs. */
  private toastOnce(key: string, title: string, line: string, tint: number): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* private mode: show it again next time */
    }
    this.showToast(title, line, tint);
  }

  private showToast(title: string, line: string, tint: number): void {
    if (this.time.now < this.toastUntil) {
      this.toastQueue.push([title, line, tint]);
      return;
    }
    this.toastUntil = this.time.now + 4500;
    this.time.delayedCall(4600, () => {
      const next = this.toastQueue.shift();
      if (next) this.showToast(...next);
    });
    this.toast[0]!.setText(title).setTint(tint);
    this.toast[1]!.setText(line);
    this.tweens.killTweensOf(this.toast);
    const top = 52 + Math.max(0, this.game_.world.players.length - 1) * 10;
    this.toast.forEach((t, i) => t.setAlpha(1).setX(-200).setY(top + i * 11));
    this.tweens.add({ targets: this.toast, x: 6, duration: 300, ease: "Cubic.out" });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 4000, duration: 500 });
  }

  private onSim(events: SimEvent[]): void {
    const world = this.game_.world;
    const myId = this.game_.myId;
    for (const p of world.players) this.names.set(p.id, p.name);
    for (const ev of events) {
      switch (ev.type) {
        case "waveStart": {
          const room = world.run.room;
          if (room.kind === "boss") {
            if (ev.wave > 1) break;
            const bosses = world.enemies.filter((e) => ENEMIES[e.defId]!.role === "boss");
            if (bosses.length > 1) this.showBanner("THE COMPLAINTS DEPARTMENT", "BOTH OF THEM. AT ONCE.", 0xff3030, 2600);
            else {
              const boss = ENEMIES[BIOMES[room.biome].boss]!;
              this.showBanner(boss.name.toUpperCase(), boss.flavor.toUpperCase(), 0xff9a2a, 2400);
            }
          } else if (room.twist === "hold") break;
          else this.showBanner(`WAVE ${ev.wave}/${ev.waves}`, room.index === 0 && ev.wave === 1 ? BIOMES[room.biome].name.toUpperCase() : "");
          break;
        }
        case "roomCleared": {
          // Rest stops and shrines start clear; their own banner already says so.
          const kind = world.run.room.kind;
          if (world.run.victory || kind === "rest" || kind === "shrine") break;
          if (kind === "boss" && world.run.finale && world.run.bosses === FINAL_ACT + 1) break;
          this.showBanner(kind === "boss" ? "BOSS DOWN!" : "ROOM CLEAR!", "TAKE A BOOST, THEN PICK A DOOR", 0x5fd36a, 2000);
          break;
        }
        case "finale":
          this.showBanner("LUGGAGE RECOVERED!", "FLY HOME WITH THE WIN, OR KEEP GOING: ENDLESS", 0x5fd36a, 3600);
          break;
        case "bossCall": {
          const call = BOSS_CALLS[ev.attack];
          if (call) this.showBanner(call[0], call[1], 0xff9a2a, 1100);
          break;
        }
        case "roomEnter": {
          const room = world.run.room;
          const plan = world.run.plans[ev.index];
          const prev = world.run.plans[ev.index - 1];
          if (plan && prev && plan.act > prev.act) {
            // A new act: say where we are.
            const name = plan.act > FINAL_ACT ? `ENDLESS ${plan.act - FINAL_ACT}` : `ACT ${plan.act + 1}`;
            this.showBanner(name, plan.act === FINAL_ACT ? "A BIT OF EVERYTHING" : BIOMES[room.biome].name.toUpperCase(), 0xf2c14e, 2600);
          } else if (room.twist) this.showBanner(TWISTS[room.twist].name.toUpperCase(), TWISTS[room.twist].text.toUpperCase(), 0xb46cff, 2600);
          else if (ev.kind === "boss") this.showBanner(BIOMES[room.biome].bossRoom.toUpperCase(), "", 0xff9a2a);
          else if (ROOM_BANNERS[ev.kind]) this.showBanner(...ROOM_BANNERS[ev.kind]!, 2400);
          else if (ev.index === 0 && room.biome === "caverns") this.showBanner("MIND THE ICE", "YOU SLIDE. YOUR DASH GOES FURTHER. SPIKES HURT.", 0x9ff3ff, 2600);
          break;
        }
        case "enemySpawn": {
          const e = world.enemies.find((en) => en.id === ev.id);
          if (!e) break;
          this.introduce(e.defId);
          // Each kind of elite gets explained once.
          if (e.elite) this.toastOnce(`elite:${e.elite}`, `ELITE: ${ELITES[e.elite].name.toUpperCase()}`, ELITES[e.elite].hint.toUpperCase(), 0xff9a2a);
          break;
        }
        case "reveal": {
          const e = world.enemies.find((en) => en.id === ev.id);
          if (e) this.introduce(e.defId);
          break;
        }
        case "split":
          this.introduce(SPLITS[world.run.room.biome] ?? "blobling");
          break;
        case "bossPhase": {
          const boss = world.enemies.find((en) => en.id === ev.id);
          const lines = BOSS_PHASES[boss?.defId ?? ""] ?? BOSS_PHASES.furnace_foreman!;
          this.showBanner(lines[ev.phase - 1] ?? lines.at(-1)!, "", 0xe0533d);
          break;
        }
        case "playerHurt":
          if (ev.id !== myId) break;
          this.hurtOverlay.setAlpha(0.25);
          this.tweens.add({ targets: this.hurtOverlay, alpha: 0, duration: 250 });
          break;
        case "playerDowned":
          if (ev.id === myId) {
            if (world.players.some((p) => p.id !== myId && !p.downed && !p.away)) this.showBanner("DOWNED!", "HANG ON. A FRIEND CAN PICK YOU UP.", 0xe0533d, 2400);
          } else this.partyNews(`${this.nameOf(ev.id)} IS DOWN! STAND NEXT TO THEM`, 0xe0533d);
          break;
        case "secondWind":
          if (ev.id === myId) {
            this.secondWind = true;
            this.showBanner("DOWNED!", "SECOND WIND INCOMING...", 0xe0533d);
          }
          break;
        case "playerRevived":
          if (ev.id === myId) {
            if (ev.by >= 0) this.showBanner("PICKED UP!", `THANKS, ${this.nameOf(ev.by)}`, 0x9ff3ff);
            else if (this.secondWind) this.showBanner("SECOND WIND!", "", 0x9ff3ff);
            this.secondWind = false;
          } else if (ev.by === myId) this.partyNews(`YOU PICKED UP ${this.nameOf(ev.id)}!`, 0x9ff3ff);
          else if (ev.by >= 0) this.partyNews(`${this.nameOf(ev.by)} PICKED UP ${this.nameOf(ev.id)}`, 0x9ff3ff);
          break;
        case "playerJoined":
          if (ev.id !== myId) this.partyNews(`${this.nameOf(ev.id)} DROPPED IN`, 0xb48cff);
          break;
        case "playerLeft":
          this.partyNews(`${this.nameOf(ev.id)} LEFT`, 0xc9cfd6);
          break;
        case "pickup":
          if (ev.id !== myId) break;
          this.showBanner(gunName(ev.gun).toUpperCase(), `${ev.gun.rarity} ${gunStats(ev.gun).archetype}`.toUpperCase(), RARITY_COLORS[ev.gun.rarity]);
          break;
        case "shrine": {
          if (ev.id !== myId) break;
          const b = BOOSTS[ev.boost];
          if (b) this.showBanner(b.name.toUpperCase(), b.text.toUpperCase(), BOOST_COLORS[b.rarity], 2200);
          break;
        }
        case "gameOver":
          // Going down in endless after beating the final boss still counts as a win.
          this.showEndPanel(world, world.run.finale);
          break;
        case "victory":
          this.time.delayedCall(1500, () => this.showEndPanel(world, true));
          break;
      }
    }
  }

  private showEndPanel(world: World, won: boolean): void {
    const run = world.run;
    const c = this.add.container(SCREEN.w / 2, SCREEN.h / 2);
    const bg = this.add.rectangle(0, 0, 330, 176, 0x1b1020, 0.92).setStrokeStyle(2, won ? 0x5fd36a : 0xf2c14e);
    const t = (y: number, s: string, size: number, tint = 0xffffff) => this.add.bitmapText(0, y, "pixel", s, size).setOrigin(0.5).setLetterSpacing(-1).setTint(tint);
    const mins = Math.floor(run.time / 60);
    const secs = String(Math.floor(run.time % 60)).padStart(2, "0");
    const plan = run.plans[run.room.index];
    const where = plan ? (plan.act > FINAL_ACT ? `ENDLESS ${plan.act - FINAL_ACT}` : `ACT ${plan.act + 1}`) + (plan.kind === "boss" ? ", THE BOSS" : `, ROOM ${plan.step + 1}`) : "";
    const line = run.victory
      ? "FLEW HOME WITH EVERYTHING. THE CRUISE LINE IS STUNNED."
      : won
        ? `THE ADVENTURE IS WON. ENDLESS GOT YOU AT ${where}.`
        : `REACHED ${where}. THE CRUISE LINE IS NOT LIABLE.`;
    c.add([
      bg,
      t(-70, won ? "LUGGAGE RECOVERED!" : "LUGGAGE LOST", 16, won ? 0x5fd36a : 0xe0533d),
      t(-50, line, 8),
      t(-38, `${mins}:${secs}   ${run.bosses} BOSS${run.bosses === 1 ? "" : "ES"}   ${run.kills} KILLS   ${run.gunsFound} GUNS`, 8, 0xc9cfd6),
    ]);
    this.rewardText = [-20, -8, 4, 16, 28].map((y) => t(y, "", 8));
    c.add(this.rewardText);
    this.rewardShown = false;
    const net = this.game_.net;
    if (!net) {
      this.showReward(this.game_.reportRun());
      this.panelButton(c, -55, 60, this.controls.touchMode ? "ANOTHER RUN" : "ANOTHER RUN (ENTER)", 0xf2c14e, () => this.restart());
      this.panelButton(c, 70, 60, this.controls.touchMode ? "MENU" : "MENU (L)", 0xc9cfd6, () => this.leave());
    } else {
      this.rewardText[0]!.setText(net.lobby?.seats.length ? "SAVING YOUR LOOT..." : "").setTint(0xc9cfd6);
      if (net.isHost) this.panelButton(c, -50, 60, "ANOTHER RUN", 0xf2c14e, () => this.restart());
      else c.add(t(46, "WAITING FOR THE HOST...", 8, 0xc9cfd6));
      this.panelButton(c, net.isHost ? 50 : 0, 60, "LEAVE", 0xc9cfd6, () => this.leave());
    }
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 350, ease: "Back.out", delay: won ? 0 : 500 });
    // Ignore the taps that were already happening when the run ended.
    this.time.delayedCall(1100, () => c.setData("ready", true));
    this.panel = c;
  }

  /** XP, levels and loot on the end panel. Guests see what they would have kept. */
  private showReward(r: RunReward | undefined, guest = false): void {
    const lines = this.rewardText;
    if (lines.length === 0) return;
    this.rewardShown = true;
    if (!r) {
      lines[0]!.setText(guest ? "PLAYING AS A GUEST: NOTHING IS SAVED." : "").setTint(0xc9cfd6);
      lines[1]!.setText(guest ? "SIGN IN FROM THE MENU TO KEEP XP AND LOOT." : "").setTint(0xc9cfd6);
      return;
    }
    const up = r.levelAfter > r.levelBefore;
    lines[0]!.setText(`+${r.xp} XP${up ? `   LEVEL UP! LV ${r.levelAfter}` : ""}`).setTint(up ? 0xf2c14e : 0x5fd3e8);
    lines[1]!.setText(r.bonuses.join("  ")).setTint(0xc9cfd6);
    const loot = r.kept === 0 ? "NO NEW GUNS THIS TIME" : `${r.kept} GUN${r.kept === 1 ? "" : "S"} BROUGHT HOME${r.legendaries ? `, ${r.legendaries} LEGENDARY!` : ""}`;
    lines[2]!.setText(loot + (r.scrapped ? ` (${r.scrapped} SCRAPPED: STASH FULL)` : "")).setTint(r.legendaries ? 0xff9a2a : 0xffffff);
    // The last two lines go to the rarest news first.
    const sig = r.signature ? SIGNATURES[r.signature] : undefined;
    const looks = (r.cosmetics ?? []).map((id) => COSMETICS[id]?.name.toUpperCase()).filter(Boolean);
    const news: [string, number][] = [];
    if (sig) news.push([`SIGNATURE POWER: ${sig.name.toUpperCase()}! EQUIP IT IN SKILLS`, 0xff9a2a]);
    if (looks.length) news.push([`NEW LOOK: ${looks.join(", ")}! TRY IT IN THE WARDROBE`, 0xe05a9a]);
    if (r.souvenir) news.push(["SOUVENIR FOUND! UNPACK IT IN THE MENU", 0xf2c14e]);
    if (up) news.push([news.length ? "NEW SKILL POINTS TOO" : "NEW SKILL POINTS: SPEND THEM IN THE MENU", 0xf2c14e]);
    news.slice(0, 2).forEach(([text, tint], i) => lines[3 + i]!.setText(text).setTint(tint));
    if (up || r.souvenir || r.legendaries || sig || looks.length) this.tweens.add({ targets: lines[0], scale: { from: 1.4, to: 1 }, duration: 400, ease: "Back.out" });
  }

  update(): void {
    const game = this.game_;
    const world = game?.world;
    if (!world) return;
    // Co-op: the server's reward for this run arrives a moment after the end.
    const net = game.net;
    if (net && this.panel && !this.rewardShown) {
      const r = net.reward;
      if (r && r.runId === net.lobby?.runId) this.showReward(r.reward);
      else if (!net.isAccount && this.rewardText.length) this.showReward(undefined, true);
    }
    const p = game.me;
    const g = this.gfx;
    g.clear();

    if (game.paused && !this.pausePanel && !world.gameOver) {
      const c = this.add.container(SCREEN.w / 2, SCREEN.h / 2);
      const net = game.net;
      c.add([
        this.add.rectangle(0, 0, SCREEN.w, SCREEN.h, 0x1b1020, 0.7),
        this.add.bitmapText(0, -50, "pixel", net ? "MENU" : "PAUSED", 16).setOrigin(0.5).setLetterSpacing(-1),
        this.add.bitmapText(0, -30, "pixel", this.controls.touchMode ? "TAP TO RESUME" : "CLICK OR P TO RESUME", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xf2c14e),
      ]);
      if (net) {
        // The party keeps going while this is open.
        c.add(this.add.bitmapText(0, -14, "pixel", `ROOM ${net.lobby?.code ?? ""}  THE RUN DOESN'T STOP IN CO-OP`, 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xc9cfd6));
        this.panelButton(c, 0, 26, this.controls.touchMode ? "LEAVE ROOM" : "LEAVE ROOM (L)", 0xe0533d, () => this.leave());
      } else {
        c.add(this.add.bitmapText(0, -14, "pixel", "QUITTING KEEPS THE GUNS YOU PICKED UP", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xc9cfd6));
        this.panelButton(c, 0, 26, this.controls.touchMode ? "QUIT TO MENU" : "QUIT TO MENU (L)", 0xe0533d, () => this.leave());
      }
      // Your build so far, in two columns.
      const entries = Object.entries(game.me.boosts);
      entries.slice(0, 16).forEach(([id, n], i) => {
        const b = BOOSTS[id];
        if (!b) return;
        const x = i < 8 ? -110 : 110;
        const y = 58 + (i % 8) * 10;
        c.add(this.add.bitmapText(x, y, "pixel", `${b.name.toUpperCase()}${n! > 1 ? " X" + n : ""}`, 8).setOrigin(0.5).setLetterSpacing(-1).setTint(BOOST_COLORS[b.rarity]));
      });
      if (entries.length > 0) c.add(this.add.bitmapText(0, 48, "pixel", "YOUR BOOSTS", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xf2c14e));
      this.pausePanel = c;
    }

    for (const pl of world.players) this.names.set(pl.id, pl.name);
    this.drawHealth(p);
    this.drawParty(world);
    this.drawTeammateArrows(world);
    this.drawRoomProgress(world);
    this.drawWeaponSlots(p);
    this.drawExitArrow(world);

    // Action buttons with cooldown fills.
    const touch = this.controls.touchMode;
    this.drawButton("skill", p.skillCharge, p.skillCharge >= 1, SKILL_COLORS[p.heroId] ?? 0x5fd3e8, touch, HEROES[p.heroId]!.skillName);
    this.drawButton("dash", 1 - p.dashCd / (DASH.cooldownMs / 1000), p.dashCd <= 0, 0xffffff, touch);
    this.drawButton("grenade", 1 - p.grenadeCd / (GRENADE.cooldownMs / 1000), p.grenadeCd <= 0, 0x8fd18f, touch);

    if (touch) {
      this.drawStick(this.controls.moveStick, 0xffffff);
      this.drawStick(this.controls.aimStick, 0xffb238);
      this.drawStick(this.controls.grenadeStick, 0x8fd18f);
    }

    const pk = p.downed ? undefined : interactable(world, p);
    this.controls.interactAvailable = !!pk;
    if (pk) this.drawButton("interact", 1, true, 0xf2c14e, touch, PICKUP_VERBS[pk.kind]);
    else this.buttonText.get("interact")!.setText("");
    this.drawCard(pk, p.guns[p.active]!);
    this.help.setVisible(!touch && !pk && !this.panel);

    // Live status lines borrow the sub-banner while they apply, and hand it back when they stop.
    let status: [string, number] | undefined;
    if (p.downed && p.reviveT !== Infinity) status = [`SECOND WIND IN ${Math.ceil(p.reviveT)}`, 0xffe08a];
    else if (p.downed && !world.gameOver) {
      // Waiting for a friend: show how close they are to picking you up.
      const bw = 80;
      const bx = SCREEN.w / 2 - bw / 2;
      g.fillStyle(0x1b1020, 0.85).fillRect(bx - 1, 125, bw + 2, 6);
      g.fillStyle(0x9ff3ff).fillRect(bx, 126, Math.round(bw * p.reviveProgress), 4);
      status = [p.reviveProgress > 0 ? "GETTING PICKED UP..." : "DOWNED. WAIT FOR A FRIEND", 0xffe08a];
    } else if (world.run.room.exitT >= 0 && !world.run.victory) {
      status = [`GOING THROUGH IN ${Math.ceil(world.run.room.exitT)}... (MOST VOTES WINS, HOST BREAKS TIES)`, 0x5fd36a];
    }
    if (status) {
      // Set every frame, so it wins over the banner's fade-out tween without cancelling it.
      this.subBanner.setText(status[0]).setTint(status[1]).setAlpha(1);
    } else if (this.statusShown) this.subBanner.setAlpha(0).setTint(0xffe08a);
    this.statusShown = !!status;

    this.netText.setVisible(!!net).setText(net ? `ROOM ${net.lobby?.code ?? ""}  ${Math.round(net.rtt)}MS` : "");
  }

  /** Teammates under your health bar: color, name, health, and whether they need help. */
  private drawParty(world: World): void {
    const g = this.gfx;
    const others = world.players.filter((pl) => pl.id !== this.game_.myId);
    this.partyText.forEach((t, i) => {
      const o = others[i];
      t.setVisible(!!o);
      if (!o) return;
      const y = 38 + i * 10;
      const color = SLOT_COLORS[o.slot] ?? 0xffffff;
      g.fillStyle(color).fillRect(6, y + 1, 5, 5);
      const status = o.away ? "AWAY" : o.downed ? "DOWN!" : "";
      t.setText(`${o.name} ${status}`).setTint(o.downed ? 0xe0533d : o.away ? 0x8a8090 : 0xffffff);
      const bx = 16 + t.width + 3;
      g.fillStyle(0x1b1020).fillRect(bx - 1, y + 1, 32, 4);
      g.fillStyle(o.downed ? 0x5a5060 : color).fillRect(bx, y + 2, Math.round((30 * o.hp) / o.maxHp), 2);
    });
  }

  /** Off-screen teammates get an arrow at the screen edge, so the party never loses each other. */
  private drawTeammateArrows(world: World): void {
    const cam = this.game_.cameras.main;
    const view = cam.worldView;
    const g = this.gfx;
    for (const o of world.players) {
      if (o.id === this.game_.myId || o.away) continue;
      const sx = o.pos.x - view.x;
      const sy = o.pos.y - view.y;
      if (sx > 0 && sx < SCREEN.w && sy > 0 && sy < SCREEN.h) continue;
      const cx = SCREEN.w / 2;
      const cy = SCREEN.h / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const x = Phaser.Math.Clamp(sx, 12, SCREEN.w - 12);
      const y = Phaser.Math.Clamp(sy, 12, SCREEN.h - 12);
      const color = o.downed ? 0xe0533d : (SLOT_COLORS[o.slot] ?? 0xffffff);
      const tip = (d: number, da: number) => ({ x: x + Math.cos(a + da) * d, y: y + Math.sin(a + da) * d });
      const p1 = tip(6, 0);
      const p2 = tip(5, 2.4);
      const p3 = tip(5, -2.4);
      g.fillStyle(color, o.downed && Math.floor(this.time.now / 250) % 2 === 0 ? 0.4 : 1).fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }
  }

  private drawHealth(p: Player): void {
    const g = this.gfx;
    const hpW = 100;
    g.fillStyle(0x1b1020).fillRect(5, 14, hpW + 2, 8);
    g.fillStyle(0x3a2a30).fillRect(6, 15, hpW, 6);
    const frac = p.hp / p.maxHp;
    g.fillStyle(frac > 0.3 ? 0x5fd36a : 0xe0533d).fillRect(6, 15, Math.round(hpW * frac), 6);
    g.fillStyle(0xffffff, 0.25).fillRect(6, 15, Math.round(hpW * frac), 1);
    // Overheal shield sits on top of the health bar.
    if (p.shield > 0) g.fillStyle(0x9ff3ff).fillRect(6, 13, Math.round((hpW * Math.min(p.shield, 60)) / 60), 2);
    for (let i = 1; i < 6; i++) g.fillStyle(0x1b1020, 0.5).fillRect(6 + (hpW / 6) * i, 15, 1, 6);
    this.hpText.setText(`${Math.ceil(p.hp)}`);
    const name = p.name || HEROES[p.heroId]!.name.toUpperCase();
    // Level sync: co-op shows the level your stats were set to.
    const lv = this.game_.net ? `LV ${p.syncLevel}` : `LV ${p.level}`;
    this.heroLabel.setText(`${name}  ${lv}${p.selfRevives > 0 ? "" : "  NO SECOND WIND"}`);
    // Builds get long: the HUD shows the count and the newest; the pause menu lists the lot.
    const ids = Object.keys(p.boosts);
    const total = Object.values(p.boosts).reduce<number>((a, b) => a + (b ?? 0), 0);
    const newest = ids.at(-1);
    this.boostText.setText(total === 0 ? "" : `${total} BOOST${total === 1 ? "" : "S"}${newest ? `  NEW: ${(BOOSTS[newest]?.name ?? "").toUpperCase()}` : ""}`);
  }

  private drawRoomProgress(world: World): void {
    const g = this.gfx;
    const run = world.run;
    const room = run.room;
    // This act's rooms so far, then empty slots up to the boss.
    const here = run.plans[room.index];
    const act = here?.act ?? 0;
    const slots = ACT_ROOMS + 1;
    const actPlans = run.plans.map((plan, i) => ({ plan, i })).filter(({ plan }) => plan.act === act);
    const x0 = SCREEN.w / 2 - (slots * 12) / 2 + 6;
    for (let k = 0; k < slots; k++) {
      const x = x0 + k * 12;
      const entry = actPlans.find(({ plan }) => (plan.kind === "boss" ? ACT_ROOMS : plan.step) === k);
      const current = entry?.i === room.index;
      const done = !!entry && (entry.i < room.index || (current && room.cleared));
      if (k < slots - 1) g.fillStyle(0x5a5060).fillRect(x + 3, 7, 6, 1);
      g.fillStyle(0x1b1020).fillRect(x - 4, 3, 9, 9);
      if (current) g.lineStyle(1, 0xffffff).strokeRect(x - 4.5, 2.5, 10, 10);
      const kind: RoomKind = entry?.plan.kind ?? (k === ACT_ROOMS ? "boss" : "combat");
      g.fillStyle(entry ? ROOM_ICONS[kind] : 0x5a5060, done || current ? 1 : entry ? 0.3 : 0.5).fillRect(x - 2, 5, 5, 5);
      if (kind === "boss") g.fillStyle(0x1b1020).fillRect(x, 6, 1, 3);
    }
    this.actText.setText(act > FINAL_ACT ? `ENDLESS ${act - FINAL_ACT}` : `ACT ${act + 1}/${FINAL_ACT + 1}`).setX(x0 - 10);

    const bosses = world.enemies.filter((e) => ENEMIES[e.defId]!.role === "boss" && e.spawnT <= 0);
    if (bosses.length > 0) {
      // One bar per boss (the final act brings two).
      const bw = bosses.length > 1 ? 150 : 200;
      bosses.slice(0, 2).forEach((boss, i) => {
        const def = ENEMIES[boss.defId]!;
        const bx = bosses.length > 1 ? SCREEN.w / 2 - bw - 4 + i * (bw + 8) : SCREEN.w / 2 - bw / 2;
        g.fillStyle(0x1b1020).fillRect(bx - 1, 34, bw + 2, 7);
        g.fillStyle(0x3a2a30).fillRect(bx, 35, bw, 5);
        g.fillStyle(0xff9a2a).fillRect(bx, 35, Math.max(0, Math.round((bw * boss.hp) / boss.maxHp)), 5);
        for (const ph of def.boss!.phases.slice(1)) g.fillStyle(0x1b1020).fillRect(bx + Math.round(bw * ph.hpFrac), 35, 1, 5);
      });
      const names = bosses.slice(0, 2).map((b) => ENEMIES[b.defId]!.name.toUpperCase());
      this.bossName.setText(names.join("   &   ")).setVisible(true);
      this.roomText.setText("");
      this.killText.setVisible(false);
      return;
    }
    this.bossName.setVisible(false);
    this.killText.setVisible(true);
    if (run.victory) this.roomText.setText("VICTORY").setTint(0x5fd36a);
    else if (room.cleared) this.roomText.setText(room.doors.length > 1 ? "PICK A DOOR" : "DOOR OPEN").setTint(0x5fd36a);
    else if (room.twist === "hold") this.roomText.setText(`HOLD THE LINE: ${Math.ceil(room.holdT)}`).setTint(0xb46cff);
    else if (room.waves.length > 0) this.roomText.setText(`WAVE ${Math.max(1, room.waveIdx)}/${room.waves.length}`).setTint(0xffffff);
    else this.roomText.setText("");
    this.killText.setText(room.twist && !room.cleared ? TWISTS[room.twist].name.toUpperCase() : `${run.kills} KILLS`).setTint(room.twist && !room.cleared ? 0xb46cff : 0xc9cfd6);
  }

  private drawWeaponSlots(p: Player): void {
    const g = this.gfx;
    WEAPON_SLOTS.forEach((s, i) => {
      const gun = p.guns[i]!;
      const st = gunStats(gun);
      const active = i === p.active;
      const color = RARITY_COLORS[gun.rarity];
      g.fillStyle(0x1b1020, 0.85).fillRect(s.x, s.y, s.w, s.h);
      g.lineStyle(active ? 2 : 1, color, active ? 1 : 0.5).strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      if (gun.element !== "none") g.fillStyle(ELEMENT_COLORS[gun.element]).fillRect(s.x + 3, s.y + 3, 3, 3);
      this.slotIcons[i]!.setTexture("gun_" + st.archetype).setAlpha(active ? 1 : 0.45);
      const pw = Math.floor((s.w - 8) / st.pips) - 1;
      for (let k = 0; k < st.pips; k++) {
        const fill = Math.max(0, Math.min(1, gun.pips - k));
        const x = s.x + 4 + k * (pw + 1);
        g.fillStyle(0x4a3a2a).fillRect(x, s.y + s.h - 5, pw, 2);
        g.fillStyle(fill >= 1 ? 0xffb238 : 0xb07a30).fillRect(x, s.y + s.h - 5, Math.round(pw * fill), 2);
      }
    });
  }

  /** A bobbing arrow at the exit (or the screen edge toward it) once the room is clear. */
  private drawExitArrow(world: World): void {
    const room = world.run.room;
    if (!room.cleared || world.run.victory || room.doors.length === 0) {
      this.exitLabel.setVisible(false);
      return;
    }
    const cam = this.game_.cameras.main;
    const me = this.game_.me;
    const door = room.doors.reduce((a, b) => (Math.abs(b.x - me.pos.x) < Math.abs(a.x - me.pos.x) ? b : a));
    // Once the doors are on screen their own labels do the talking.
    if (door.x - cam.worldView.x > 0 && door.x - cam.worldView.x < SCREEN.w && cam.worldView.y < 10) {
      this.exitLabel.setVisible(false);
      return;
    }
    const ex = door.x - cam.worldView.x;
    const ey = 14 + 14 - cam.worldView.y;
    const x = Phaser.Math.Clamp(ex, 20, SCREEN.w - 20);
    const y = Phaser.Math.Clamp(ey, 48, SCREEN.h - 30) + Math.sin(this.time.now * 0.008) * 3;
    const g = this.gfx;
    g.fillStyle(0x1b1020).fillTriangle(x, y - 9, x - 7, y + 1, x + 7, y + 1);
    g.fillStyle(0x5fd36a).fillTriangle(x, y - 7, x - 5, y, x + 5, y);
    this.exitLabel.setVisible(true).setPosition(x, y + 8);
  }

  /** Details for whatever you're standing near: gun comparison, shrine, or suitcase. */
  private drawCard(pk: Pickup | undefined, current: Gun): void {
    const press = (verb: string) => (this.controls.touchMode ? `TAP ${verb}` : `PRESS F TO ${verb}`);
    const lines: [string, number][] = [];
    if (pk?.kind === "gun" && pk.gun) {
      const gun = pk.gun;
      const st = gunStats(gun);
      lines.push([gunName(gun).toUpperCase(), RARITY_COLORS[gun.rarity]]);
      const elem = gun.element !== "none" ? `  ${ELEMENT_INFO[gun.element].adjective}: ${ELEMENT_INFO[gun.element].text}` : "";
      lines.push([`${gun.rarity} ${st.archetype} BY ${MAKERS[gun.maker].short}${elem}`.toUpperCase(), gun.element !== "none" ? ELEMENT_COLORS[gun.element] : 0xc9cfd6]);
      const leg = gun.legendary ? LEGENDARIES[gun.legendary] : undefined;
      if (leg) lines.push([leg.text.toUpperCase(), 0xff9a2a]);
      else if (gun.maker !== "cruise") lines.push([MAKERS[gun.maker].quirk.toUpperCase(), 0xc9cfd6]);
      for (const perk of gun.perks) lines.push([`+ ${PERKS[perk].text}`.toUpperCase(), 0xffffff]);
      if (gun.loaner) lines.push(["LOANER: PROPERTY OF THE CRUISE LINE. STAYS HERE.", 0xc9cfd6]);
      const dps = Math.round(gunDps(gun));
      const diff = dps - Math.round(gunDps(current));
      lines.push([`DPS ${dps} (${diff >= 0 ? "+" : ""}${diff} VS YOURS)  ${press("SWAP")}`, diff >= 0 ? 0x5fd36a : 0xe0533d]);
    } else if ((pk?.kind === "boost" || pk?.kind === "shrine") && pk.boost && BOOSTS[pk.boost]) {
      const b = BOOSTS[pk.boost]!;
      const have = this.game_.me.boosts[pk.boost] ?? 0;
      lines.push([`${b.name.toUpperCase()}${have ? `  (HAVE ${have}/${b.max})` : ""}`, BOOST_COLORS[b.rarity]]);
      lines.push([b.text.toUpperCase(), 0xffffff]);
      lines.push([`${b.rarity.toUpperCase()}  ${b.tags.map((t) => t.toUpperCase()).join(" ")}`, 0xc9cfd6]);
      lines.push([`ONE OF THREE: THE OTHERS GO AWAY. ${press("TAKE")}`, 0xc9cfd6]);
    } else if (pk?.kind === "chest") {
      lines.push(["LOST & FOUND SUITCASE", 0x4aa3ff]);
      lines.push(["SOMEBODY'S LUGGAGE. FINDERS KEEPERS.", 0xc9cfd6]);
      lines.push([press("OPEN"), 0xffffff]);
    }

    const top = SCREEN.h - 8 - lines.length * 11;
    this.card.forEach((t, i) => {
      const line = lines[i];
      t.setText(line?.[0] ?? "").setY(top + i * 11).setTint(line?.[1] ?? 0xffffff);
    });
    if (lines.length > 0) {
      const g = this.gfx;
      const w = Math.max(...this.card.map((t) => t.width)) + 14;
      g.fillStyle(0x1b1020, 0.85).fillRect(Math.round(SCREEN.w / 2 - w / 2), top - 4, w, lines.length * 11 + 6);
      g.lineStyle(1, lines[0]![1], 0.8).strokeRect(Math.round(SCREEN.w / 2 - w / 2) + 0.5, top - 3.5, w - 1, lines.length * 11 + 5);
    }
  }

  private drawButton(id: ButtonId, fill: number, ready: boolean, color: number, touch: boolean, label?: string): void {
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
    this.buttonText.get(id)!.setText(touch ? (label ?? BUTTON_LABELS[id].touch) : BUTTON_LABELS[id].keys).setTint(ready ? 0xffffff : 0x8a8090);
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

import Phaser from "phaser";
import { DEFAULT_OUTFIT, DIFFICULTIES, HEROES, MAX_PLAYERS, type EmoteInfo, type LobbyInfo, type Outfit, type SeatInfo } from "@lostluggage/sim";
import { SLOT_COLORS } from "../render/colors";
import { CASE_COUNT, EMOTE_LINES, gunKey, HAT_ANCHOR, hatKey } from "../render/cosmetics";
import { trailFx, trailGap, type FxHost } from "../render/trails";
import { sfx } from "../sfx";

// The co-op lobby: everyone in the room stands at the baggage carousel in their outfit, Brawl Stars style.
// The menu draws the room code and buttons in HTML over the top and bottom; this scene is the stage between them.

const W = 480;
const SCALE = 4;
const FEET_Y = 212;
const BELT_Y = 133;
/** Four marks on the floor, in join order (the same order as party colors in the run): you or the host in the
 *  middle, friends filling in toward the edges. */
const SPOTS = [192, 288, 96, 384];
/** Heroes face the middle of the stage. */
const inward = (i: number) => (SPOTS[i]! < W / 2 ? 1 : -1);
/** What each hero holds on stage: we don't know other players' loadouts, so each hero brings their favorite. */
const STAGE_GUN: Record<string, string> = { vanguard: "shotgun", gunslinger: "pistol", tinker: "smg", warden: "sniper" };

interface Spot {
  index: number;
  sessionId: string;
  /** Hero, hat and gun, in sprite pixels around the feet; scaled up and flipped as one. */
  figure: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  gun: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.BitmapText;
  info: Phaser.GameObjects.BitmapText;
  tag: Phaser.GameObjects.BitmapText;
  /** Which way they face: +1 right, -1 left. */
  face: number;
  look: number;
  /** Playing an emote or landing: the idle animation waits. */
  busy: boolean;
  dashT: number;
  trailT: number;
  /** Hero, slot, hat and skin last drawn, to spot changes. */
  dressed: string;
  outfit: Outfit;
}

export class LobbyScene extends Phaser.Scene {
  private lobby?: LobbyInfo;
  private me = "";
  private built = false;
  private spots = new Map<string, Spot>();
  private empties: (Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText)[][] = [];
  private belt!: Phaser.GameObjects.TileSprite;
  private cases: Phaser.GameObjects.Image[] = [];
  private sign!: Phaser.GameObjects.BitmapText;
  private readonly fx: FxHost = { scene: this, take: (key) => this.add.image(0, 0, key), give: (img) => img.destroy() };

  constructor() {
    super("lobby");
  }

  /** The menu calls this for every lobby update, before or after the scene has been built. */
  setLobby(l: LobbyInfo, me: string): void {
    this.lobby = l;
    this.me = me;
    if (this.built) this.sync();
  }

  create(): void {
    this.spots.clear();
    this.empties = [];
    this.cases = [];
    this.add.image(0, 0, "lobby-bg").setOrigin(0);
    // The sign over the carousel.
    this.add.rectangle(W / 2, 18, 172, 26, 0x1b1020).setStrokeStyle(2, 0xf2c14e);
    this.add.bitmapText(W / 2, 13, "pixel", "BAGGAGE CLAIM", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xf2c14e);
    this.sign = this.add.bitmapText(W / 2, 24, "pixel", "", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0xc9cfd6);
    this.belt = this.add.tileSprite(0, BELT_Y, W, 10, "belt").setOrigin(0);
    for (let i = 0; i < 6; i++) {
      this.cases.push(
        this.add
          .image(i * 92 + Math.random() * 40, BELT_Y + 3, `case-${Math.floor(Math.random() * CASE_COUNT)}`)
          .setOrigin(0.5, 1)
          .setScale(2),
      );
    }
    // Spotlights on the marks.
    SPOTS.forEach((x, i) => {
      const cone = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      cone.fillStyle(SLOT_COLORS[i]!, 0.07).fillTriangle(x - 10, 0, x + 10, 0, x + 44, FEET_Y + 4).fillTriangle(x - 10, 0, x - 44, FEET_Y + 4, x + 44, FEET_Y + 4);
      this.add.image(x, FEET_Y, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(SLOT_COLORS[i]!).setScale(3.2, 0.9).setAlpha(0.45);
    });
    this.built = true;
    this.events.once("shutdown", () => (this.built = false));
    this.input.on("gameobjectdown", (_p: unknown, obj: Phaser.GameObjects.GameObject) => {
      const spot = [...this.spots.values()].find((s) => s.body === obj);
      if (spot && spot.sessionId === this.me) this.flourish(spot);
    });
    if (this.lobby) this.sync();
  }

  update(time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.belt.tilePositionX -= dt * 24;
    for (const c of this.cases) {
      c.x += dt * 24;
      if (c.x > W + 20) {
        c.x = -20 - Math.random() * 60;
        c.setTexture(`case-${Math.floor(Math.random() * CASE_COUNT)}`);
      }
    }
    for (const s of this.spots.values()) this.animate(s, time, dt);
    this.empties.forEach((objs, i) => {
      for (const o of objs) o.setAlpha(0.35 + 0.15 * Math.sin(time * 0.003 + i));
    });
  }

  // ---------------------------------------------------------------- the party

  private sync(): void {
    const l = this.lobby!;
    const tier = (DIFFICULTIES[l.tier] ?? DIFFICULTIES[0]).name.toUpperCase();
    this.sign.setText(l.code ? `${tier} - ROOM ${l.code}` : tier);
    const seats = l.seats.slice(0, MAX_PLAYERS);
    const ids = new Set(seats.map((s) => s.sessionId));
    for (const [id, s] of this.spots) {
      if (ids.has(id)) continue;
      this.spots.delete(id);
      this.leaveStage(s);
    }
    seats.forEach((seat, i) => {
      let s = this.spots.get(seat.sessionId);
      if (s && s.index !== i) {
        // Someone ahead left: slide over to the new mark.
        s.index = i;
        for (const o of [s.figure, s.name, s.info, s.tag]) this.tweens.add({ targets: o, x: SPOTS[i]!, duration: 400, ease: "Sine.inOut" });
      }
      if (!s) {
        s = this.makeSpot(seat, i);
        this.spots.set(seat.sessionId, s);
        this.land(s);
      }
      this.dress(s, seat, l);
    });
    for (const objs of this.empties) for (const o of objs) o.destroy();
    this.empties = [];
    for (let i = seats.length; i < MAX_PLAYERS; i++) this.empties.push(this.makeEmpty(i, l.code));
  }

  private makeSpot(seat: SeatInfo, i: number): Spot {
    const x = SPOTS[i]!;
    const shadow = this.add.image(0, -1, "shadow-m");
    const body = this.add.image(0, 0, `${seat.heroId}_${i}`).setOrigin(0.5, 1);
    const gun = this.add.image(0, 0, "gun_pistol").setOrigin(0.15, 0.5);
    const hat = this.add.image(0, 0, "px").setOrigin(0.5, 1).setVisible(false);
    const figure = this.add.container(x, FEET_Y, [shadow, body, hat, gun]).setScale(SCALE).setDepth(10);
    body.setInteractive({ useHandCursor: false });
    const text = (y: number, size: number) => this.add.bitmapText(x, FEET_Y + y, "pixel", "", size).setOrigin(0.5).setLetterSpacing(-1).setDepth(20);
    return {
      index: i,
      sessionId: seat.sessionId,
      figure,
      body,
      gun,
      hat,
      name: text(-100, 16),
      info: text(14, 8).setTint(0xc9cfd6).setCenterAlign(),
      tag: text(-116, 8),
      face: inward(i),
      look: 3 + Math.random() * 4,
      busy: false,
      dashT: 0,
      trailT: 0,
      dressed: "",
      outfit: DEFAULT_OUTFIT,
    };
  }

  /** Puts the seat's hero, outfit and labels on a spot. */
  private dress(s: Spot, seat: SeatInfo, l: LobbyInfo): void {
    const outfit = seat.outfit ?? DEFAULT_OUTFIT;
    s.outfit = outfit;
    const look = `${seat.heroId}|${s.index}|${outfit.hat}|${outfit.skin}`;
    if (look !== s.dressed) {
      // A new hero or a new hat: a quick pop so everyone notices.
      if (s.dressed) this.tweens.add({ targets: s.figure, scaleY: { from: SCALE * 0.7, to: SCALE }, duration: 250, ease: "Back.out" });
      s.dressed = look;
      const hero = HEROES[seat.heroId] ?? HEROES.vanguard!;
      s.body.setTexture(`${seat.heroId}_${s.index}`);
      s.gun.setTexture(gunKey(STAGE_GUN[seat.heroId] ?? "pistol", outfit.skin)).setPosition(4, -hero.radius - 1);
      const a = HAT_ANCHOR[seat.heroId] ?? HAT_ANCHOR.vanguard!;
      if (outfit.hat) s.hat.setTexture(hatKey(outfit.hat)).setPosition(a.x, a.y).setVisible(true);
      else s.hat.setVisible(false);
    }
    const color = SLOT_COLORS[s.index] ?? 0xffffff;
    // Long names (up to 10 letters) drop a size so they don't run into the next mark.
    s.name.setText(seat.name).setFontSize(seat.name.length > 7 ? 8 : 16).setTint(color);
    s.info.setText(seat.connected ? `${(HEROES[seat.heroId]?.name ?? "").toUpperCase()}\nLV ${seat.level}` : "RECONNECTING...");
    // On your own there's nobody to be host of.
    const host = seat.sessionId === l.host && l.seats.length > 1;
    const you = seat.sessionId === this.me;
    s.tag.setText([host ? "HOST" : "", you ? "YOU" : ""].filter(Boolean).join(" - ")).setTint(you ? 0x5fd36a : 0xf2c14e);
    s.figure.setAlpha(seat.connected ? 1 : 0.4);
  }

  private makeEmpty(i: number, code: string): (Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText)[] {
    const x = SPOTS[i]!;
    const ghost = this.add.image(x, FEET_Y, `vanguard_${i}`).setOrigin(0.5, 1).setScale(SCALE).setTintFill(0x2a1c30).setFlipX(inward(i) < 0).setAlpha(0.4);
    // Not in a room yet: an empty mark is an invitation. Tapping it makes a room for friends.
    const q = this.add.bitmapText(x, FEET_Y - 34, "pixel", code ? "?" : "+", 16).setOrigin(0.5).setTint(0x5a5060);
    const label = this.add.bitmapText(x, FEET_Y + 10, "pixel", code ? "OPEN SEAT" : "INVITE", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0x8a7f8a);
    const hint = this.add.bitmapText(x, FEET_Y + 20, "pixel", code ? `CODE ${code}` : "A FRIEND", 8).setOrigin(0.5).setLetterSpacing(-1).setTint(0x5a5060);
    if (!code) ghost.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.game.events.emit("invite"));
    return [ghost, q, label, hint];
  }

  // ---------------------------------------------------------------- animation

  private animate(s: Spot, t: number, dt: number): void {
    // Glance around now and then; mostly face the middle.
    s.look -= dt;
    if (s.look <= 0 && !s.busy) {
      const middle = inward(s.index);
      s.face = s.face === middle && Math.random() < 0.5 ? -middle : middle;
      s.look = s.face === middle ? 3 + Math.random() * 5 : 0.8 + Math.random();
    }
    if (!s.busy) {
      const breathe = Math.sin(t * 0.004 + s.index * 1.7);
      s.figure.setScale(SCALE * s.face * (1 - 0.015 * breathe), SCALE * (1 + 0.03 * breathe));
    }
    // Mid-flourish: leave the trail behind.
    if (s.dashT > 0) {
      s.dashT -= dt;
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = trailGap(s.outfit.trail);
        trailFx(this.fx, s.outfit.trail, { x: s.figure.x, y: s.figure.y, heroKey: s.body.texture.key, flip: s.figure.scaleX < 0, scale: SCALE, depth: 9, t });
      }
    }
  }

  /** Dropped in from above, like a bag onto the carousel. */
  private land(s: Spot): void {
    s.busy = true;
    const x = SPOTS[s.index]!;
    s.figure.setPosition(x, FEET_Y - 280).setScale(SCALE * s.face, SCALE);
    this.tweens.add({
      targets: s.figure,
      y: FEET_Y,
      duration: 650,
      ease: "Bounce.out",
      onComplete: () => {
        s.busy = false;
        sfx.play("land");
        this.dust(x);
        this.flourish(s);
      },
    });
    for (const o of [s.name, s.info, s.tag]) this.tweens.add({ targets: o, alpha: { from: 0, to: 1 }, duration: 400, delay: 400 });
  }

  private leaveStage(s: Spot): void {
    this.tweens.add({
      targets: [s.figure, s.name, s.info, s.tag],
      alpha: 0,
      y: "-=20",
      duration: 300,
      onComplete: () => {
        for (const o of [s.figure, s.name, s.info, s.tag]) o.destroy();
      },
    });
  }

  private dust(x: number): void {
    for (let i = 0; i < 8; i++) {
      const d = this.add.image(x + (Math.random() - 0.5) * 30, FEET_Y - 2, "px").setTint(0xc9cfd6).setScale(2).setDepth(11);
      this.tweens.add({ targets: d, x: d.x + (d.x - x) * 1.5, y: d.y - 4 - Math.random() * 8, alpha: 0, duration: 450, onComplete: () => d.destroy() });
    }
  }

  /** A quick dash out and back, to show off the trail. */
  private flourish(s: Spot): void {
    if (s.busy) return;
    s.busy = true;
    s.dashT = 0.5;
    s.trailT = 0;
    const x = SPOTS[s.index]!;
    const dir = -inward(s.index);
    s.figure.setScale(SCALE * dir, SCALE);
    sfx.play("dash");
    this.tweens.chain({
      targets: s.figure,
      tweens: [
        { x: x + dir * 28, duration: 200, ease: "Quad.out" },
        { scaleX: -SCALE * dir, duration: 1 },
        { x, duration: 220, ease: "Quad.out" },
      ],
      onComplete: () => {
        s.busy = false;
        s.face = -dir;
      },
    });
  }

  // ---------------------------------------------------------------- emotes

  emote(e: EmoteInfo): void {
    const s = this.spots.get(e.sessionId);
    if (!s || !this.built) return;
    sfx.play("emote");
    this.bubble(s, EMOTE_LINES[e.emote] ?? "!");
    if (s.busy) return;
    s.busy = true;
    const f = s.figure;
    const sx = SCALE * s.face;
    const done = () => {
      f.setAngle(0).setScale(sx, SCALE).setX(SPOTS[s.index]!).setY(FEET_Y);
      s.busy = false;
    };
    switch (e.emote) {
      case "emote_bow":
        this.tweens.chain({ targets: f, tweens: [{ angle: 40 * s.face, duration: 300, ease: "Back.out" }, { angle: 40 * s.face, duration: 600 }, { angle: 0, duration: 250 }], onComplete: done });
        break;
      case "emote_guitar":
        this.tweens.add({ targets: f, angle: { from: -10 * s.face, to: 6 * s.face }, duration: 90, yoyo: true, repeat: 7, onComplete: done });
        for (let i = 0; i < 5; i++) {
          this.time.delayedCall(i * 220, () => {
            const n = this.add.image(f.x + s.face * 18, FEET_Y - 40, "fx-note").setScale(2).setTint(SLOT_COLORS[s.index]!).setDepth(21);
            this.tweens.add({ targets: n, y: n.y - 40, x: n.x + (Math.random() - 0.5) * 30, alpha: 0, duration: 900, onComplete: () => n.destroy() });
          });
        }
        break;
      case "emote_laugh":
        this.tweens.add({ targets: f, y: FEET_Y - 6, duration: 80, yoyo: true, repeat: 7, ease: "Sine.out", onComplete: done });
        break;
      case "emote_shrug":
        this.tweens.add({ targets: f, scaleY: SCALE * 0.82, scaleX: sx * 1.12, duration: 160, yoyo: true, hold: 300, repeat: 1, onComplete: done });
        break;
      case "emote_floss": {
        let flips = 0;
        this.time.addEvent({
          delay: 110,
          repeat: 13,
          callback: () => {
            flips++;
            f.setScale(SCALE * (flips % 2 ? -s.face : s.face), SCALE).setX(SPOTS[s.index]! + (flips % 2 ? 5 : -5));
            if (flips === 14) done();
          },
        });
        break;
      }
      default:
        // Wave: two happy hops.
        this.tweens.add({ targets: f, y: FEET_Y - 18, duration: 160, yoyo: true, repeat: 1, ease: "Quad.out", onComplete: done });
    }
  }

  private bubble(s: Spot, line: string): void {
    const x = s.figure.x;
    const text = this.add.bitmapText(0, 0, "pixel", line, 8).setOrigin(0.5).setLetterSpacing(-1);
    const w = Math.max(24, text.width + 10);
    const bg = this.add.rectangle(0, 0, w, 14, 0x1b1020).setStrokeStyle(2, SLOT_COLORS[s.index] ?? 0xffffff);
    const tail = this.add.triangle(0, 9, -3, 0, 3, 0, 0, 5, SLOT_COLORS[s.index] ?? 0xffffff);
    const c = this.add.container(Phaser.Math.Clamp(x, w / 2 + 4, W - w / 2 - 4), FEET_Y - 134, [tail, bg, text]).setDepth(30).setScale(0);
    this.tweens.chain({
      targets: c,
      tweens: [
        { scale: 1, duration: 220, ease: "Back.out" },
        { alpha: 0, y: c.y - 8, duration: 300, delay: 1300 },
      ],
      onComplete: () => c.destroy(),
    });
  }
}

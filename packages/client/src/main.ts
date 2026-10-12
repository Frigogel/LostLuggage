import Phaser from "phaser";
import { Menu } from "./menu";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { UIScene } from "./scenes/UIScene";

// Low internal resolution scaled up with crisp pixels (see Art direction in the design doc).
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 480,
  height: 270,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#1b1020",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  scene: [BootScene, GameScene, UIScene, LobbyScene],
});

// The game listens for keys on the whole window and swallows the ones it plays with (WASD, space, …). While a text
// field has focus, the keys belong to it: no swallowed letters, and typing an "m" doesn't mute the game.
const typing = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
addEventListener("focusin", (e) => {
  if (!typing(e.target) || !game.input?.keyboard) return;
  game.input.keyboard.enabled = false;
  // Keys held when the field took focus would never see their keyup.
  for (const s of game.scene.getScenes(true)) s.input.keyboard?.resetKeys();
});
addEventListener("focusout", (e) => {
  if (typing(e.target) && game.input?.keyboard) game.input.keyboard.enabled = true;
});

// The height the browser really shows, which on phones leaves out the address bar (see #menu and #game).
const fitHeight = () => document.documentElement.style.setProperty("--app-h", `${innerHeight}px`);
fitHeight();
addEventListener("resize", fitHeight);
visualViewport?.addEventListener("resize", fitHeight);

// Android: the first tap goes fullscreen, which hides the address bar for good. The whole page, not just the canvas,
// so the lobby and menus (HTML over the canvas) stay visible. Needs a user gesture; iPhone only allows it for video.
if (/Android/i.test(navigator.userAgent)) {
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {
      /* not allowed: fine */
    });
  });
}

const menu = new Menu(game);
game.events.once("booted", () => {
  // Dev shortcuts (?seed=, ?room=, ?mythics) skip the menu straight into a solo run, and ?practice into the range.
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && params.has("practice")) menu.startPractice();
  else if (import.meta.env.DEV && (params.has("seed") || params.has("room") || params.has("mythics"))) menu.startSolo();
  else menu.show();
});

// Cache the game for offline solo runs. Only in builds: in development it would get in the way of hot reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Handy for poking at the sim from the browser console while developing.
if (import.meta.env.DEV) Object.assign(window, { game, menu });

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

const menu = new Menu(game);
game.events.once("booted", () => {
  // Dev shortcuts (?seed=, ?room=) skip the menu straight into a solo run.
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && (params.has("seed") || params.has("room"))) menu.startSolo();
  else menu.show();
});

// Cache the game for offline solo runs. Only in builds: in development it would get in the way of hot reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Handy for poking at the sim from the browser console while developing.
if (import.meta.env.DEV) Object.assign(window, { game, menu });

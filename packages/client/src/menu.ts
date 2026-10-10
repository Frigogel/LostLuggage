// Main menu and co-op lobby. Plain HTML over the canvas: phones bring up their own keyboard for names and codes.
import type Phaser from "phaser";
import { MAX_LEVEL, type LobbyInfo, type PlayerOptions } from "@lostluggage/sim";
import { NetSession, type JoinKind } from "./net";
import { SLOT_COLORS, toCss } from "./render/colors";
import { sfx } from "./sfx";
import type { GameData } from "./scenes/GameScene";

const PROFILE_KEY = "lostluggage.profile";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Who you are. Hero levels arrive with accounts (roadmap phase 4); until then `?level=N` fakes one in development. */
function loadProfile(): PlayerOptions {
  let name = "";
  try {
    name = (JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") as { name?: string }).name ?? "";
  } catch {
    /* private mode */
  }
  const devLevel = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("level")) : 0;
  return { name, level: Math.max(1, Math.min(MAX_LEVEL, devLevel || 1)) };
}

function cleanName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 .!?-]/g, "").trim().slice(0, 10);
}

export class Menu {
  private session?: NetSession;
  private startedRun = -1;
  private waitTimer?: ReturnType<typeof setInterval>;
  private profile = loadProfile();

  constructor(private game: Phaser.Game) {
    const name = $<HTMLInputElement>("name");
    name.value = this.profile.name ?? "";
    name.addEventListener("input", () => {
      const clean = cleanName(name.value);
      this.profile.name = clean;
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: clean }));
      } catch {
        /* private mode: fine */
      }
    });
    const code = $<HTMLInputElement>("code");
    code.addEventListener("input", () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)));
    code.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.join({ kind: "code", code: code.value });
    });

    $("solo").addEventListener("click", () => this.startSolo());
    $("quick").addEventListener("click", () => this.join({ kind: "quick" }));
    $("create").addEventListener("click", () => this.join({ kind: "create" }));
    $("join").addEventListener("click", () => this.join({ kind: "code", code: code.value }));
    $("start").addEventListener("click", () => this.session?.start());
    $("leave").addEventListener("click", () => this.leave());

    game.events.on("leave", () => this.leave());
    // Any tap in the menu counts as the user gesture browsers want before playing audio.
    $("menu").addEventListener("pointerdown", () => sfx.unlock());
  }

  private get me(): PlayerOptions {
    return { ...this.profile, name: this.profile.name || undefined };
  }

  show(status = ""): void {
    document.body.classList.add("in-menu");
    $("menu").hidden = false;
    $("home").hidden = false;
    $("lobby").hidden = true;
    $("status").textContent = status;
    this.setBusy(false);
  }

  private setBusy(busy: boolean): void {
    for (const id of ["solo", "quick", "create", "join"]) $<HTMLButtonElement>(id).disabled = busy;
  }

  private stopScenes(): void {
    for (const key of ["game", "ui"]) if (this.game.scene.isActive(key) || this.game.scene.isPaused(key)) this.game.scene.stop(key);
  }

  private runScenes(data: GameData): void {
    document.body.classList.remove("in-menu");
    $("menu").hidden = true;
    this.stopScenes();
    this.game.scene.start("game", data);
    this.game.scene.start("ui");
  }

  startSolo(): void {
    this.runScenes({ profile: this.me });
  }

  private async join(how: JoinKind): Promise<void> {
    if (how.kind === "code" && how.code.length !== 4) {
      $("status").textContent = "ROOM CODES ARE 4 LETTERS";
      return;
    }
    this.setBusy(true);
    $("status").textContent = how.kind === "quick" ? "LOOKING FOR A PARTY..." : "CONNECTING...";
    try {
      const s = await NetSession.connect(how, this.me);
      this.session = s;
      this.startedRun = -1;
      s.onLobby = (l) => this.onLobby(l);
      s.onClosed = (reason) => {
        if (this.session !== s) return;
        this.session = undefined;
        this.stopScenes();
        this.show(reason);
      };
      if (s.lobby) this.onLobby(s.lobby);
      else this.showLobby();
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      this.show(how.kind === "code" && /not found|invalid|locked|full/i.test(msg) ? "NO OPEN ROOM WITH THAT CODE" : "CAN'T REACH THE SERVER");
    }
  }

  private showLobby(): void {
    document.body.classList.add("in-menu");
    $("menu").hidden = false;
    $("home").hidden = true;
    $("lobby").hidden = false;
  }

  private onLobby(l: LobbyInfo): void {
    const s = this.session;
    if (!s) return;
    if (l.running) {
      // A run is on (just started, restarted, or we dropped in): start drawing once its first snapshot lands.
      if (l.runId !== this.startedRun) this.startWhenReady(l.runId);
      return;
    }
    this.showLobby();
    $("lobby-code").textContent = l.code;
    const list = $("lobby-seats");
    list.replaceChildren(
      ...l.seats.map((seat, i) => {
        const li = document.createElement("li");
        li.style.borderColor = toCss(SLOT_COLORS[i] ?? 0xffffff);
        const host = seat.sessionId === l.host ? " (HOST)" : "";
        const you = seat.sessionId === s.sessionId ? " - YOU" : "";
        li.append(`${seat.name}${host}${you}`);
        const small = document.createElement("small");
        small.textContent = seat.connected ? `LV ${seat.level}` : "RECONNECTING";
        li.append(small);
        return li;
      }),
    );
    $("start").hidden = !s.isHost;
    $("lobby-wait").hidden = s.isHost;
  }

  private startWhenReady(runId: number): void {
    clearInterval(this.waitTimer);
    this.waitTimer = setInterval(() => {
      const s = this.session;
      if (!s || s.lobby?.runId !== runId) return clearInterval(this.waitTimer);
      if (!s.ready || s.myId < 0) return;
      clearInterval(this.waitTimer);
      this.startedRun = runId;
      this.runScenes({ net: s, profile: this.me });
    }, 30);
  }

  leave(): void {
    clearInterval(this.waitTimer);
    const s = this.session;
    this.session = undefined;
    s?.leave();
    this.stopScenes();
    this.show();
  }
}

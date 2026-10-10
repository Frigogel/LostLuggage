// Main menu, account, skills, armory, souvenirs and the co-op lobby. Plain HTML over the canvas: phones bring up
// their own keyboard for names and codes, and lists scroll like any web page.
import type Phaser from "phaser";
import {
  ELEMENT_INFO,
  GUNS,
  heroOf,
  HEROES,
  LEGENDARIES,
  localDay,
  MAKERS,
  MAX_LEVEL,
  PERKS,
  playerOptions,
  runResult,
  SCRAP_XP,
  SKILL_TREES,
  skillPoints,
  SOUVENIR_CAP,
  souvenirOffers,
  SOUVENIRS,
  SOUVENIR_IDS,
  souvenirTotal,
  spentPoints,
  gunDps,
  gunName,
  xpToNext,
  type JoinOptions,
  type LobbyInfo,
  type PlayerOptions,
  type RunReward,
  type StashGun,
} from "@lostluggage/sim";
import { AccountStore } from "./account";
import { NetSession, type JoinKind } from "./net";
import { RARITY_COLORS, SLOT_COLORS, toCss } from "./render/colors";
import { sfx } from "./sfx";
import type { GameData } from "./scenes/GameScene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SCREENS = ["home", "lobby", "signin", "skills", "armory", "souvenirs"] as const;
type Screen = (typeof SCREENS)[number];

function cleanName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 .!?-]/g, "").trim().slice(0, 10);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** Waits for a promise, but not forever. */
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

export class Menu {
  readonly account = new AccountStore();
  private session?: NetSession;
  private startedRun = -1;
  private waitTimer?: ReturnType<typeof setInterval>;
  private screen: Screen = "home";
  private openGun = "";
  /** Guns that were new when the armory opened: they keep their badge while you look. */
  private fresh = new Set<string>();

  constructor(private game: Phaser.Game) {
    const name = $<HTMLInputElement>("name");
    name.addEventListener("input", () => (name.value = cleanName(name.value)));
    name.addEventListener("change", () => {
      const clean = cleanName(name.value);
      if (clean !== this.account.profile.name) this.account.dispatch({ type: "name", name: clean });
    });
    const code = $<HTMLInputElement>("code");
    code.addEventListener("input", () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)));
    code.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.join({ kind: "code", code: code.value });
    });

    $("solo").addEventListener("click", () => this.startSolo());
    $("quick").addEventListener("click", () => void this.join({ kind: "quick" }));
    $("create").addEventListener("click", () => void this.join({ kind: "create" }));
    $("join").addEventListener("click", () => void this.join({ kind: "code", code: code.value }));
    $("start").addEventListener("click", () => this.session?.start());
    $("leave").addEventListener("click", () => this.leave());
    $("account-btn").addEventListener("click", () => {
      if (this.account.signedIn && !this.account.expired) {
        if (confirm("Sign out? Your progress stays on your account.")) this.account.signOut();
      } else this.go("signin");
    });
    $("to-skills").addEventListener("click", () => this.go("skills"));
    $("to-armory").addEventListener("click", () => this.go("armory"));
    $("to-souvenirs").addEventListener("click", () => this.go("souvenirs"));
    for (const b of document.querySelectorAll<HTMLButtonElement>("#menu .back")) b.addEventListener("click", () => this.go("home"));
    $("si-login").addEventListener("click", () => void this.signIn("login"));
    $("si-register").addEventListener("click", () => void this.signIn("register"));
    $("skills-reset").addEventListener("click", () => this.account.dispatch({ type: "skills", heroId: this.account.profile.heroId, skills: [] }));
    $("armory-scrap").addEventListener("click", () => this.scrapCommons());

    this.account.onChange(() => this.render());
    game.events.on("leave", () => this.leave());
    game.events.on("soloAgain", () => this.startSolo());
    // Any tap in the menu counts as the user gesture browsers want before playing audio.
    $("menu").addEventListener("pointerdown", () => sfx.unlock());
    this.render();
  }

  /** The hero a run should use: the saved one, or a guest (with `?level=N` in development). */
  private get me(): PlayerOptions {
    const opts = playerOptions(this.account.profile);
    if (!this.account.signedIn && import.meta.env.DEV) {
      const lv = Number(new URLSearchParams(location.search).get("level"));
      if (lv > 0) opts.level = Math.max(1, Math.min(MAX_LEVEL, lv));
    }
    return opts;
  }

  private get joinOptions(): JoinOptions {
    const me = this.me;
    return { name: me.name, level: me.level, token: this.account.signedIn ? this.account.token : undefined };
  }

  // ---------------------------------------------------------------- screens

  private go(screen: Screen): void {
    this.screen = screen;
    for (const id of SCREENS) $(id).hidden = id !== screen;
    $("menu").scrollTop = 0;
    if (screen === "signin") {
      $("si-status").textContent = "";
      $<HTMLInputElement>("si-user").value = this.account.username ?? "";
      void AccountStore.inviteRequired().then((need) => ($("si-invite-wrap").hidden = !need));
    }
    this.render();
    // Opening the armory counts as seeing what's new; badges stay until you leave it.
    if (screen === "armory" && this.account.profile.stash.some((g) => g.new)) {
      this.fresh = new Set(this.account.profile.stash.filter((g) => g.new).map((g) => g.id));
      this.account.dispatch({ type: "seen" });
    }
  }

  show(status = ""): void {
    document.body.classList.add("in-menu");
    $("menu").hidden = false;
    this.go("home");
    $("status").textContent = status;
    this.setBusy(false);
    void this.account.sync();
  }

  private render(): void {
    const a = this.account;
    const p = a.profile;
    const hero = heroOf(p);
    const heroName = HEROES[p.heroId]!.name.toUpperCase();
    $("account-line").textContent = a.expired
      ? `${a.username}: SIGN IN AGAIN TO SAVE`
      : a.signedIn
        ? `${a.username}${a.queue.length ? (a.offline ? " · OFFLINE, WILL SYNC" : " · SYNCING...") : " · SAVED"}`
        : "GUEST: NOTHING IS SAVED";
    $("account-btn").textContent = a.signedIn && !a.expired ? "Sign out" : "Sign in";
    $("hero-name").textContent = `${heroName} LV ${hero.level}`;
    const need = xpToNext(hero.level);
    $("hero-xp").textContent = hero.level >= MAX_LEVEL ? "MAX LEVEL" : `${hero.xp}/${need} XP`;
    $("hero-bar").style.width = hero.level >= MAX_LEVEL ? "100%" : `${Math.round((100 * hero.xp) / need)}%`;
    const name = $<HTMLInputElement>("name");
    if (document.activeElement !== name) name.value = p.name;
    $("name-label").textContent = a.signedIn ? "Name shown to friends" : "Your name";

    const free = skillPoints(hero.level) - spentPoints(p.heroId, hero.skills);
    const newGuns = p.stash.filter((g) => g.new).length;
    this.label("to-skills", "Skills", free > 0 ? String(free) : "");
    this.label("to-armory", "Armory", newGuns > 0 ? `${newGuns} NEW` : "");
    this.label("to-souvenirs", "Souvenirs", souvenirOffers(p).length > 0 ? String(p.pendingSouvenirs) : "");

    if (this.screen === "skills") this.renderSkills();
    if (this.screen === "armory") this.renderArmory();
    if (this.screen === "souvenirs") this.renderSouvenirs();
  }

  private label(id: string, text: string, badge: string): void {
    $(id).replaceChildren(text, ...(badge ? [el("span", { className: "badge", textContent: badge })] : []));
  }

  private setBusy(busy: boolean): void {
    for (const id of ["solo", "quick", "create", "join"]) $<HTMLButtonElement>(id).disabled = busy;
  }

  // ---------------------------------------------------------------- account

  private async signIn(kind: "login" | "register"): Promise<void> {
    const user = $<HTMLInputElement>("si-user").value.trim();
    const pass = $<HTMLInputElement>("si-pass").value;
    $("si-status").textContent = kind === "login" ? "SIGNING IN..." : "CREATING...";
    const err = await this.account.authenticate(kind, user, pass, $<HTMLInputElement>("si-invite").value);
    if (err) {
      $("si-status").textContent = err;
      return;
    }
    $<HTMLInputElement>("si-pass").value = "";
    this.go("home");
  }

  // ---------------------------------------------------------------- skills

  private renderSkills(): void {
    const p = this.account.profile;
    const hero = heroOf(p);
    const tree = SKILL_TREES[p.heroId]!;
    const free = skillPoints(hero.level) - spentPoints(p.heroId, hero.skills);
    $("skills-points").textContent = `${HEROES[p.heroId]!.name.toUpperCase()} LV ${hero.level}: ${free} OF ${skillPoints(hero.level)} POINTS FREE. ONE PER LEVEL. RESPEC ANY TIME.`;
    $("skills-tree").replaceChildren(
      ...tree.branches.map((br, b) => {
        const nodes = tree.nodes.filter((n) => n.branch === b);
        const col = el("div", {}, el("h3", { textContent: br.name }), el("p", { textContent: br.text }));
        let open = true;
        for (const n of nodes) {
          const on = hero.skills.includes(n.id);
          const next = !on && open;
          if (!on) open = false;
          const btn = el("button", { className: `node${on ? " on" : next && n.cost <= free ? " next" : " locked"}` }, el("b", { textContent: `${n.name} · ${n.cost}` }), n.text);
          btn.addEventListener("click", () => {
            // Tap the next node to learn it; tap a learned one to forget it and everything after it.
            const idx = nodes.indexOf(n);
            const others = hero.skills.filter((id) => !nodes.some((m) => m.id === id));
            const mine = on ? nodes.slice(0, idx) : next && n.cost <= free ? nodes.slice(0, idx + 1) : undefined;
            if (mine) this.account.dispatch({ type: "skills", heroId: p.heroId, skills: [...others, ...mine.map((m) => m.id)] });
          });
          col.append(btn);
        }
        return col;
      }),
    );
  }

  // ---------------------------------------------------------------- armory

  private gunLine(g: StashGun): string {
    const def = GUNS[g.defId]!;
    const elem = g.element !== "none" ? ` · ${ELEMENT_INFO[g.element].adjective.toUpperCase()}` : "";
    return `${g.rarity.toUpperCase()} ${def.archetype.toUpperCase()} · ${MAKERS[g.maker].short}${elem}`;
  }

  private renderArmory(): void {
    const p = this.account.profile;
    const equipped = p.loadout;
    const eqDps = Math.min(...p.loadout.map((id) => p.stash.find((g) => g.id === id)).filter(Boolean).map((g) => gunDps(g!)));
    const rank = (g: StashGun) => (equipped.includes(g.id) ? -10 + equipped.indexOf(g.id) : 0) - ["common", "uncommon", "rare", "epic", "legendary"].indexOf(g.rarity);
    const guns = [...p.stash].sort((a, b) => rank(a) - rank(b));
    $("armory-hint").textContent = `${p.stash.length}/40 GUNS. TAP ONE TO EQUIP OR SCRAP IT. SCRAPPING GIVES XP.${this.account.signedIn ? "" : " GUESTS KEEP NOTHING."}`;
    $("armory-list").replaceChildren(
      ...guns.map((g) => {
        const slot = equipped.indexOf(g.id);
        const dps = Math.round(gunDps(g));
        const better = slot < 0 && dps > eqDps;
        const li = el("li");
        li.style.borderColor = toCss(RARITY_COLORS[g.rarity]);
        const title = el("b", { textContent: gunName(g) });
        title.style.color = toCss(RARITY_COLORS[g.rarity]);
        li.append(title, slot >= 0 ? `  [SLOT ${slot + 1}]` : "", this.fresh.has(g.id) ? el("span", { className: "badge", textContent: "NEW" }) : "", el("br"), this.gunLine(g), el("br"));
        li.append(el("span", { className: better ? "up" : "", textContent: `${better ? "▲ " : ""}DPS ${dps}` }));
        const leg = g.legendary ? LEGENDARIES[g.legendary] : undefined;
        if (leg) li.append(el("br"), el("span", { className: "up", textContent: leg.text }), el("br"), `"${leg.flavor}"`);
        else li.append(el("br"), MAKERS[g.maker].quirk);
        for (const perk of g.perks) li.append(el("br"), `+ ${PERKS[perk].text}`);
        if (this.openGun === g.id) {
          const act = el("div", { className: "act" });
          for (const s of [0, 1]) {
            const b = el("button", { textContent: slot === s ? `In slot ${s + 1}` : `Equip slot ${s + 1}`, disabled: slot === s });
            b.addEventListener("click", (e) => {
              e.stopPropagation();
              this.account.dispatch({ type: "equip", slot: s, gunId: g.id });
            });
            act.append(b);
          }
          const scrap = el("button", { textContent: `Scrap +${SCRAP_XP[g.rarity]} XP`, disabled: slot >= 0 });
          scrap.addEventListener("click", (e) => {
            e.stopPropagation();
            if (g.rarity !== "legendary" || confirm(`Scrap ${gunName(g)}? Legendaries are rare.`)) this.account.dispatch({ type: "scrap", gunIds: [g.id] });
          });
          act.append(scrap);
          li.append(act);
        }
        li.addEventListener("click", () => {
          this.openGun = this.openGun === g.id ? "" : g.id;
          this.renderArmory();
        });
        return li;
      }),
    );
  }

  private scrapCommons(): void {
    const p = this.account.profile;
    const ids = p.stash.filter((g) => g.rarity === "common" && !p.loadout.includes(g.id)).map((g) => g.id);
    if (ids.length === 0) {
      $("armory-status").textContent = "NO SPARE COMMONS";
      return;
    }
    const { xp } = this.account.dispatch({ type: "scrap", gunIds: ids });
    $("armory-status").textContent = `SCRAPPED ${ids.length}: +${xp ?? 0} XP`;
  }

  // ---------------------------------------------------------------- souvenirs

  private renderSouvenirs(): void {
    const p = this.account.profile;
    const offers = souvenirOffers(p);
    const total = souvenirTotal(p.souvenirs);
    $("souv-hint").textContent = offers.length
      ? `YOU HAVE ${p.pendingSouvenirs} TO UNPACK. PICK ONE TO KEEP FOREVER.`
      : `${total}/${SOUVENIR_CAP} SOUVENIRS. WIN SOLO RUNS TO FIND MORE: THE FIRST WIN EACH DAY ALWAYS BRINGS ONE.`;
    $("souv-offers").replaceChildren(
      ...offers.map((id) => {
        const d = SOUVENIRS[id];
        const b = el("button", {}, el("b", { textContent: d.name }), `${d.text} (${p.souvenirs[id] ?? 0}/${d.maxRanks})`, el("br"), el("i", { textContent: d.flavor }));
        b.addEventListener("click", () => this.account.dispatch({ type: "souvenir", pick: id }));
        return b;
      }),
    );
    $("souv-list").replaceChildren(
      ...SOUVENIR_IDS.map((id) => {
        const d = SOUVENIRS[id];
        const n = p.souvenirs[id] ?? 0;
        const li = el("li", {}, el("b", { textContent: `${d.name} ${n}/${d.maxRanks}` }), el("br"), `${d.text} each. ${d.flavor}`);
        li.style.borderColor = n > 0 ? "#f2c14e" : "#5a5060";
        li.style.cursor = "default";
        return li;
      }),
    );
  }

  // ---------------------------------------------------------------- runs

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
    this.runScenes({
      profile: this.me,
      // Solo results are trusted (friends-only game): applied here and synced when there's a connection.
      onRunEnd: (w, p): RunReward | undefined => this.account.dispatch({ type: "run", result: runResult(w, p, { mode: "solo", day: localDay() }) }).reward,
    });
  }

  private async join(how: JoinKind): Promise<void> {
    if (how.kind === "code" && how.code.length !== 4) {
      $("status").textContent = "ROOM CODES ARE 4 LETTERS";
      return;
    }
    this.setBusy(true);
    $("status").textContent = how.kind === "quick" ? "LOOKING FOR A PARTY..." : "CONNECTING...";
    // The server loads your saved loadout, so get the latest changes to it first.
    await within(this.account.sync(), 3000);
    try {
      const s = await NetSession.connect(how, this.joinOptions);
      this.session = s;
      this.startedRun = -1;
      s.onLobby = (l) => this.onLobby(l);
      s.onReward = (r) => this.account.adopt(r.profile);
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
    this.go("lobby");
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

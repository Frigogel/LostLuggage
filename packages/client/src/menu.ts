// The lobby (which is also the home screen), account, skills, armory, souvenirs and wardrobe. Plain HTML over the
// canvas: phones bring up their own keyboard for names and codes, and lists scroll like any web page. The lobby's
// stage itself is drawn by LobbyScene; the HTML only frames it.
import type Phaser from "phaser";
import {
  ADVENTURE_IDS,
  AUTO_SCRAP_OPTIONS,
  DIFFICULTIES,
  COSMETIC_SLOTS,
  COSMETICS,
  cosmeticsFor,
  ELEMENT_INFO,
  HERO_IDS,
  SIGNATURES,
  signaturesFor,
  GRENADE_CAP,
  grenadeStats,
  GUNS,
  heroOf,
  HEROES,
  LEGENDARIES,
  MYTHIC_GUNS,
  localDay,
  MAKERS,
  MAX_LEVEL,
  ownsCosmetic,
  PERKS,
  playerOptions,
  RELIC_CAP,
  relicDef,
  relicText,
  runResult,
  SCRAP_XP,
  SKILL_TREES,
  skillPoints,
  SLOT_NAMES,
  SOUVENIR_CAP,
  STASH_CAP,
  souvenirOffers,
  SOUVENIRS,
  SOUVENIR_IDS,
  souvenirTotal,
  spentPoints,
  gunDps,
  gunName,
  unlockText,
  xpToNext,
  type AutoScrap,
  type CosmeticSlot,
  type JoinOptions,
  type LobbyInfo,
  type PlayerOptions,
  type Rarity,
  type RunReward,
  type StashGun,
} from "@lostluggage/sim";
import { AccountStore } from "./account";
import { NetSession, type JoinKind } from "./net";
import { ELEMENT_COLORS, RARITY_COLORS, toCss } from "./render/colors";
import { drawGrenade, drawGun, drawIcon, drawPreview, EMOTE_LINES } from "./render/cosmetics";
import { drawSouvenir, iconEl, iconSvg } from "./render/icons";
import { drawMythicIcon, mythicArtId } from "./render/mythics";
import { drawSprite, SPRITES } from "./render/pixels";
import { sfx } from "./sfx";
import type { GameData, GameScene } from "./scenes/GameScene";
import type { LobbyScene } from "./scenes/LobbyScene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TIER_KEY = "lostluggage.tier";

function loadTier(): number {
  try {
    const t = Number(localStorage.getItem(TIER_KEY));
    return Number.isInteger(t) && t >= 0 && t < DIFFICULTIES.length ? t : 0;
  } catch {
    return 0;
  }
}
const SCREENS = ["lobby", "signin", "skills", "armory", "souvenirs", "wardrobe"] as const;
/** Your own seat in the lobby when you aren't in a room yet. */
const LOCAL = "local";
/** What "take it off" is called in each slot. */
const NONE_NAMES: Record<CosmeticSlot, string> = { hat: "No hat", trail: "Plain afterimage", skin: "Factory paint", emote: "" };
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

/** Worst to best, for sorting the armory. */
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Favorites, legendaries and mythics ask before they go. */
function confirmScrap(rarity: Rarity, name: string, favorite = false): boolean {
  if (rarity === "mythic") return confirm(`Scrap ${name}? It's a MYTHIC: the rarest thing in the game. You may never see another.`);
  if (favorite) return confirm(`Scrap ${name}? It's one of your favorites.`);
  if (rarity === "legendary") return confirm(`Scrap ${name}? Legendaries are rare.`);
  return true;
}

/** What the auto-scrap button says for each setting. */
const AUTO_SCRAP_NAMES: Record<AutoScrap, string> = { "": "Off", common: "Commons", uncommon: "Uncommon & worse", rare: "Rare & worse", epic: "Epic & worse" };

/** Armory tiles sort equipped first, then favorites, then best to worst. */
const tileRank = (equipped: number, favorite: boolean | undefined, rarity: Rarity) => (equipped >= 0 ? -20 + equipped : 0) + (favorite ? -6 : 0) - RARITY_ORDER.indexOf(rarity);

/** A mythic's armory tile: the framed icon inside a turning rainbow ring, with a shine sweeping over it. */
function mythicThumb(id: string): HTMLElement {
  const icon = drawMythicIcon(id, 2);
  icon.className = "px";
  return el("span", { className: "thumb mythic" }, icon);
}

/** The archetype of an equipped gun, so the hero preview holds what you'll actually bring. */
function loadoutArchetype(id: string | undefined, stash: readonly StashGun[]): string {
  const g = stash.find((s) => s.id === id);
  return g ? GUNS[g.defId]!.archetype : "pistol";
}

type ArmoryTab = "guns" | "grenades" | "relics";
type ArmoryKind = "gun" | "grenade" | "relic";

const TAB_NAMES: Record<ArmoryTab, string> = { guns: "Guns", grenades: "Grenades", relics: "Relics" };

/** One thing in the armory: a tile in the grid, and what the detail panel shows when it's picked. */
interface ArmoryItem {
  id: string;
  kind: ArmoryKind;
  rarity: Rarity;
  favorite?: boolean;
  /** Sort key: equipped first, then favorites, then best to worst. */
  rank: number;
  /** The tile's corner chip when it's equipped ("1", "2" or "ON"); equipped things can't be scrapped. */
  chip: string;
  /** A gun that hits harder than one you carry. */
  better?: boolean;
  /** Mythic art id: mythics get the turning rainbow ring instead of a sprite. */
  myth?: string;
  /** The sprite, and how much of a tile's width it fills (guns are long; grenades and charms are small and round). */
  art: () => HTMLCanvasElement;
  fill: number;
  name: string;
  /** "RARE SMG · WIZARD · SHOCK" and the like. */
  sub: string;
  body: HTMLElement[];
  /** Equip buttons; favorite and scrap are added for every kind. */
  actions: HTMLElement[];
}

function scrapAction(kind: ArmoryKind, id: string): { type: "scrap"; gunIds: string[]; grenadeIds?: string[]; relicIds?: string[] } {
  if (kind === "grenade") return { type: "scrap", gunIds: [], grenadeIds: [id] };
  if (kind === "relic") return { type: "scrap", gunIds: [], relicIds: [id] };
  return { type: "scrap", gunIds: [id] };
}

export class Menu {
  readonly account = new AccountStore();
  private session?: NetSession;
  private startedRun = -1;
  private waitTimer?: ReturnType<typeof setInterval>;
  private screen: Screen = "lobby";
  private openGun = "";
  /** Guns that were new when the armory opened: they keep their badge while you look. */
  private fresh = new Set<string>();
  /** Same for cosmetics in the wardrobe. */
  private freshLooks = new Set<string>();
  private wardTab: CosmeticSlot = "hat";
  private armoryTab: ArmoryTab = "guns";
  /** The difficulty for solo runs and rooms you create. Remembered on this device. */
  private tier = loadTier();

  constructor(private game: Phaser.Game) {
    const name = $<HTMLInputElement>("name");
    name.addEventListener("input", () => (name.value = cleanName(name.value)));
    name.addEventListener("change", () => {
      const clean = cleanName(name.value);
      if (clean === this.account.profile.name) return;
      this.account.dispatch({ type: "name", name: clean });
      void this.pushLook();
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") name.blur();
    });
    const code = $<HTMLInputElement>("code");
    code.addEventListener("input", () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)));
    code.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.join({ kind: "code", code: code.value });
    });

    $("play").addEventListener("click", () => this.play());
    $("quick").addEventListener("click", () => void this.join({ kind: "quick" }));
    $("create").addEventListener("click", () => void this.join({ kind: "create" }));
    $("join").addEventListener("click", () => void this.join({ kind: "code", code: code.value }));
    $("practice").addEventListener("click", () => this.startPractice());
    $("leave").addEventListener("click", () => this.leave());
    $("account-btn").addEventListener("click", () => {
      if (this.account.signedIn && !this.account.expired) {
        if (confirm("Sign out? Your progress stays on your account.")) this.account.signOut();
      } else this.go("signin");
    });
    $("to-skills").addEventListener("click", () => this.go("skills"));
    $("to-armory").addEventListener("click", () => this.go("armory"));
    $("to-souvenirs").addEventListener("click", () => this.go("souvenirs"));
    $("to-wardrobe").addEventListener("click", () => this.go("wardrobe"));
    $("lobby-emote").addEventListener("click", () => {
      const emote = this.account.profile.outfit.emote;
      if (this.session) this.session.emote(emote);
      else this.lobbyScene?.emote({ sessionId: LOCAL, emote });
    });
    $("lobby-tier").addEventListener("click", () => this.nextTier());
    $("lobby-hero").addEventListener("click", () => {
      // Brawl Stars style: switch heroes right in the lobby.
      const p = this.account.profile;
      this.account.dispatch({ type: "hero", heroId: HERO_IDS[(HERO_IDS.indexOf(p.heroId) + 1) % HERO_IDS.length]! });
      void this.pushLook();
    });
    $("ward-tabs").replaceChildren(
      ...COSMETIC_SLOTS.map((slot) => {
        const b = el("button", { textContent: SLOT_NAMES[slot] });
        b.dataset.slot = slot;
        b.addEventListener("click", () => {
          this.wardTab = slot;
          this.renderWardrobe();
        });
        return b;
      }),
    );
    for (const b of document.querySelectorAll<HTMLButtonElement>("#menu .back")) b.addEventListener("click", () => this.showStage());
    $("si-login").addEventListener("click", () => void this.signIn("login"));
    $("si-register").addEventListener("click", () => void this.signIn("register"));
    $("skills-reset").addEventListener("click", () => this.account.dispatch({ type: "skills", heroId: this.account.profile.heroId, skills: [] }));
    $("armory-scrap").addEventListener("click", () => this.scrapCommons());
    $("armory-auto").addEventListener("click", () => {
      const opts = AUTO_SCRAP_OPTIONS;
      this.account.dispatch({ type: "autoScrap", rarity: opts[(opts.indexOf(this.account.profile.autoScrap) + 1) % opts.length]! });
    });
    for (const b of $("armory-tabs").querySelectorAll<HTMLButtonElement>("button")) {
      b.addEventListener("click", () => {
        this.armoryTab = b.dataset.tab === "grenades" || b.dataset.tab === "relics" ? b.dataset.tab : "guns";
        this.openGun = "";
        $("armory-status").textContent = "";
        this.renderArmory();
      });
    }
    // Every iconed button gets its icon now; the ones that change are relabeled in render().
    for (const b of document.querySelectorAll<HTMLElement>("#menu [data-icon]")) this.label(b, b.textContent ?? "", "");
    this.account.onChange(() => this.render());
    game.events.on("leave", () => this.leave());
    // Closing or reloading the page mid co-op run only drops the connection: the server holds the seat for a minute
    // and, opened again in time, the game takes the same hero back (see `resume`). Otherwise the loot goes home then.
    addEventListener("pagehide", () => this.session?.saveResume());
    game.events.on("soloAgain", () => this.startSolo());
    // Tapping an empty mark on the stage: bring friends.
    game.events.on("invite", () => {
      if (!this.session) void this.join({ kind: "create" });
    });
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
    return { name: me.name, level: me.level, heroId: me.heroId, outfit: this.account.profile.outfit, token: this.account.signedIn ? this.account.token : undefined };
  }

  /** Undefined until the game has booted. */
  private get lobbyScene(): LobbyScene | undefined {
    return (this.game.scene.getScene("lobby") as LobbyScene | null) ?? undefined;
  }

  private get gameScene(): GameScene | undefined {
    return (this.game.scene.getScene("game") as GameScene | null) ?? undefined;
  }

  /** Changed hero or outfit while in a room: save it, then tell the room so everyone sees it. */
  private async pushLook(): Promise<void> {
    const s = this.session;
    if (!s) return;
    // The server reloads accounts from their saved profile, so the change has to get there first.
    for (let i = 0; i < 3 && this.account.signedIn && this.account.queue.length > 0; i++) await within(this.account.sync(), 3000);
    if (this.session === s) s.updateMe(this.joinOptions);
  }

  // ---------------------------------------------------------------- screens

  private go(screen: Screen): void {
    this.screen = screen;
    for (const id of SCREENS) $(id).hidden = id !== screen;
    // The lobby is see-through: the stage behind it is the canvas.
    $("menu").classList.toggle("stage", screen === "lobby");
    if (screen === "lobby" && !this.game.scene.isActive("lobby")) this.game.scene.start("lobby");
    $("menu").scrollTop = 0;
    if (screen === "signin") {
      $("si-status").textContent = "";
      $<HTMLInputElement>("si-user").value = this.account.username ?? "";
      void AccountStore.inviteRequired().then((need) => ($("si-invite-wrap").hidden = !need));
    }
    this.render();
    // Opening the armory counts as seeing what's new; badges stay until you leave it.
    const prof = this.account.profile;
    if (screen === "armory" && [...prof.stash, ...prof.grenades, ...prof.relics].some((g) => g.new)) {
      this.fresh = new Set([...prof.stash, ...prof.grenades, ...prof.relics].filter((g) => g.new).map((g) => g.id));
      // Open on the first tab with something new in it.
      if (!prof.stash.some((g) => g.new)) this.armoryTab = prof.grenades.some((g) => g.new) ? "grenades" : "relics";
      this.account.dispatch({ type: "seen" });
    }
    if (screen === "wardrobe" && this.account.profile.newCosmetics.length) {
      this.freshLooks = new Set(this.account.profile.newCosmetics);
      // Open on the slot with something new in it.
      this.wardTab = COSMETICS[this.account.profile.newCosmetics[0]!]?.slot ?? this.wardTab;
      this.account.dispatch({ type: "seenWardrobe" });
    }
  }

  /** Back to the lobby on your own, after a run or when leaving a room. */
  show(status = ""): void {
    this.showStage();
    // The game was closed mid-run last time: say that run came home (once).
    const back = this.account.recovered;
    this.account.recovered = undefined;
    if (back && !status) status = `YOUR LAST RUN CAME HOME: +${back.xp} XP${back.kept ? `, ${back.kept} GUN${back.kept === 1 ? "" : "S"}` : ""}`;
    $("status").textContent = status;
    this.setBusy(false);
    void this.account.sync();
  }

  /** The lobby stage: the home screen, alone or with a room. */
  private showStage(): void {
    document.body.classList.add("in-menu");
    $("menu").hidden = false;
    this.go("lobby");
  }

  private render(): void {
    const a = this.account;
    const p = a.profile;
    const hero = heroOf(p);
    const heroDef = HEROES[p.heroId]!;
    $("account-line").textContent = a.expired
      ? `${a.username}: SIGN IN AGAIN`
      : a.signedIn
        ? `${a.username}${a.queue.length ? (a.offline ? " · OFFLINE" : " · SYNCING...") : " · SAVED"}`
        : "GUEST: NOTHING SAVED";
    this.label("account-btn", a.signedIn && !a.expired ? "Sign out" : "Sign in", "");
    $("hero-name").textContent = `${heroDef.name.toUpperCase()} LV ${hero.level}`;
    const need = xpToNext(hero.level);
    $("hero-xp").textContent = hero.level >= MAX_LEVEL ? "MAX LEVEL" : `${hero.xp}/${need} XP`;
    $("hero-bar").style.width = hero.level >= MAX_LEVEL ? "100%" : `${Math.round((100 * hero.xp) / need)}%`;
    const name = $<HTMLInputElement>("name");
    if (document.activeElement !== name) name.value = p.name;

    const free = skillPoints(hero.level) - spentPoints(p.heroId, hero.skills);
    const newGuns = [...p.stash, ...p.grenades, ...p.relics].filter((g) => g.new).length;
    this.label("to-skills", "Skills", free > 0 ? String(free) : "");
    this.label("to-armory", "Armory", newGuns > 0 ? "NEW" : "");
    this.label("to-souvenirs", "Souvenirs", souvenirOffers(p).length > 0 ? String(p.pendingSouvenirs) : "");
    this.label("to-wardrobe", "Wardrobe", p.newCosmetics.length > 0 ? "NEW" : "");
    this.label("lobby-hero", el("span", {}, `${heroDef.name} ▸`, el("small", { textContent: heroDef.role })), "");
    this.label("lobby-emote", el("span", {}, "Emote", el("small", { textContent: COSMETICS[p.outfit.emote]?.name ?? "" })), "");
    this.renderStageBar();

    if (this.screen === "wardrobe") this.renderWardrobe();
    if (this.screen === "skills") this.renderSkills();
    if (this.screen === "armory") this.renderArmory();
    if (this.screen === "souvenirs") this.renderSouvenirs();
  }

  /** What the lobby's bottom bar and party panel say: solo, host, or waiting for the host. */
  private renderStageBar(): void {
    const s = this.session;
    const l = s?.lobby;
    const host = !s || s.isHost;
    const tier = DIFFICULTIES[l?.tier ?? this.tier] ?? DIFFICULTIES[0];
    this.label("lobby-tier", el("span", {}, tier.name, el("small", { textContent: host ? "Change difficulty ▸" : "Host picks" })), "");
    $("lobby-tier").title = tier.text;
    $<HTMLButtonElement>("lobby-tier").disabled = !host;
    $("party-solo").hidden = !!s;
    $("party-room").hidden = !s;
    this.label("play", !s ? "Play solo" : (l?.seats.length ?? 1) > 1 ? "Start run" : "Start alone", "");
    $("play").hidden = !host;
    $("lobby-wait").hidden = host;
    if (l) {
      $("lobby-code").textContent = l.code;
      $("lobby-count").textContent = l.seats.length < 4 ? `${l.seats.length}/4 · FRIENDS TYPE THIS CODE` : "4/4 · FULL PARTY";
    }
    if (!s) this.lobbyScene?.setLobby(this.localLobby(), LOCAL);
  }

  /** The lobby before you join anyone: just you, with three open marks for friends. */
  private localLobby(): LobbyInfo {
    const me = this.me;
    const p = this.account.profile;
    return {
      code: "",
      host: LOCAL,
      tier: this.tier,
      runId: 0,
      running: false,
      seats: [{ sessionId: LOCAL, name: me.name || "TRAVELER", level: me.level ?? 1, heroId: p.heroId, playerId: -1, connected: true, outfit: p.outfit }],
    };
  }

  /** Solo: start a run. In a room: the host starts it for everyone. */
  private play(): void {
    if (this.session) this.session.start();
    else this.startSolo();
  }

  private nextTier(): void {
    const s = this.session;
    if (s && !s.isHost) return;
    this.tier = ((s?.lobby?.tier ?? this.tier) + 1) % DIFFICULTIES.length;
    try {
      localStorage.setItem(TIER_KEY, String(this.tier));
    } catch {
      /* private mode: it just won't be remembered */
    }
    s?.setTier(this.tier);
    this.render();
  }

  /** A button's text, with its pixel icon (from `data-icon`) and an optional badge. */
  private label(target: string | HTMLElement, text: string | Node, badge: string): void {
    const b = typeof target === "string" ? $(target) : target;
    const icon = b.dataset.icon ? document.createRange().createContextualFragment(iconSvg(b.dataset.icon)) : "";
    b.replaceChildren(icon, text, ...(badge ? [el("span", { className: "badge", textContent: badge })] : []));
  }

  private setBusy(busy: boolean): void {
    for (const id of ["play", "quick", "create", "join", "practice"]) $<HTMLButtonElement>(id).disabled = busy;
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
    this.showStage();
  }

  // ---------------------------------------------------------------- skills

  private renderSkills(): void {
    const p = this.account.profile;
    const hero = heroOf(p);
    const tree = SKILL_TREES[p.heroId]!;
    const free = skillPoints(hero.level) - spentPoints(p.heroId, hero.skills);
    $("skills-points").textContent = `${HEROES[p.heroId]!.name.toUpperCase()} LV ${hero.level}: ${free} OF ${skillPoints(hero.level)} POINTS FREE. ONE PER LEVEL. RESPEC ANY TIME.`;
    this.renderSignatures();
    $("skills-tree").replaceChildren(
      ...tree.branches.map((br, b) => {
        const nodes = tree.nodes.filter((n) => n.branch === b);
        const col = el("div", {}, el("h3", { textContent: br.name }), el("p", { textContent: br.text }));
        let open = true;
        for (const n of nodes) {
          const on = hero.skills.includes(n.id);
          const next = !on && open;
          if (!on) open = false;
          const state = on ? "on" : next && n.cost <= free ? "next" : "locked";
          const mark = { on: "check", next: "plus", locked: "lock" }[state];
          const btn = el("button", { className: `node ${state}` }, el("b", {}, iconEl(mark), `${n.name} · ${n.cost}`), n.text);
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

  /** Signature powers for this hero: the plain skill, plus any found in co-op dungeons. */
  private renderSignatures(): void {
    const p = this.account.profile;
    const h = HEROES[p.heroId]!;
    const current = heroOf(p).signature ?? "";
    const option = (id: string, name: string, text: string, owned: boolean) => {
      const mark = id === current ? "check" : owned ? "star" : "lock";
      const b = el("button", { className: id === current ? "on" : "", disabled: !owned }, el("b", {}, iconEl(mark), owned ? name : "???"), owned ? text : "Not found yet. Signature powers drop in co-op dungeons.");
      b.addEventListener("click", () => this.account.dispatch({ type: "signature", heroId: p.heroId, signature: id }));
      return b;
    };
    $("skills-sig").replaceChildren(
      el("h3", {}, iconEl("star"), `Action skill: ${h.skillName}`),
      el("div", { className: "row3" }, option("", h.skillName, h.skillText, true), ...signaturesFor(p.heroId).map((id) => option(id, SIGNATURES[id]!.name, SIGNATURES[id]!.text, p.signatures.includes(id)))),
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
    const tab = this.armoryTab;
    const lists: Record<ArmoryTab, [{ id: string }[], number]> = { guns: [p.stash, STASH_CAP], grenades: [p.grenades, GRENADE_CAP], relics: [p.relics, RELIC_CAP] };
    for (const b of $("armory-tabs").querySelectorAll<HTMLButtonElement>("button")) {
      const t = (b.dataset.tab ?? "guns") as ArmoryTab;
      const [list, cap] = lists[t];
      b.classList.toggle("on", t === tab);
      b.replaceChildren(el("span", {}, TAB_NAMES[t], el("small", { textContent: `${list.length}/${cap}` })), ...(list.some((g) => this.fresh.has(g.id)) ? [el("span", { className: "badge", textContent: "!" })] : []));
    }
    // Auto-scrap is for guns: they're the ones that pile up.
    $("armory-auto").hidden = tab !== "guns";
    this.label("armory-auto", el("span", {}, "Auto-scrap", el("small", { textContent: AUTO_SCRAP_NAMES[p.autoScrap] })), "");
    this.label("armory-scrap", el("span", {}, "Scrap commons", el("small", { textContent: "Not equipped or starred" })), "");

    const items = (tab === "grenades" ? this.grenadeItems() : tab === "relics" ? this.relicItems() : this.gunItems()).sort((a, b) => a.rank - b.rank);
    // Something is always picked, so the panel is never empty: what you tapped, or else the first tile.
    const picked = items.find((t) => t.id === this.openGun) ?? items[0];
    const guest = this.account.signedIn ? "" : " GUESTS KEEP NOTHING: SIGN IN TO SAVE IT.";
    const empty = tab === "relics" ? "NO RELICS YET. BOSSES ALWAYS DROP ONE; ELITES AND SUITCASES SOMETIMES DO." : `NO ${tab.toUpperCase()} YET.`;
    $("armory-hint").textContent = (items.length ? "EVERYTHING YOU PICK UP IN A RUN COMES HOME." : empty) + guest;
    $("armory-list").replaceChildren(...items.map((t) => this.tileEl(t, t === picked)));
    $("armory-detail").hidden = !picked;
    if (picked) this.renderDetail(picked);
  }

  /** A sprite (or a mythic's ring), drawn to fill a tile or, bigger, the detail panel. */
  private itemArt(t: ArmoryItem, big: boolean): HTMLElement {
    if (t.myth) return mythicThumb(t.myth);
    const art = t.art();
    art.className = "px";
    if (!big) art.style.width = `${t.fill}%`;
    return art;
  }

  private tileEl(t: ArmoryItem, picked: boolean): HTMLElement {
    const b = el("button", { className: `tile${picked ? " on" : ""}${t.myth ? " mythic" : ""}`, title: t.name }, this.itemArt(t, false));
    b.style.setProperty("--r", toCss(RARITY_COLORS[t.rarity]));
    if (t.chip) b.append(el("span", { className: "chip", textContent: t.chip }));
    if (t.favorite) b.append(Object.assign(iconEl("star"), { className: "ic star" }));
    if (this.fresh.has(t.id)) b.append(el("span", { className: "new", textContent: "NEW" }));
    if (t.better) b.append(el("span", { className: "better", textContent: "▲" }));
    b.addEventListener("click", () => {
      this.openGun = t.id;
      this.renderArmory();
    });
    return b;
  }

  /** The picked item up close: big art, everything about it, and what you can do with it. */
  private renderDetail(t: ArmoryItem): void {
    const d = $("armory-detail");
    d.className = `armory-detail panel${t.myth ? " mythic" : ""}`;
    d.style.setProperty("--r", toCss(RARITY_COLORS[t.rarity]));
    const title = el("h3", {}, el("span", { textContent: t.name }));
    title.style.color = toCss(RARITY_COLORS[t.rarity]);
    if (t.favorite) title.prepend(Object.assign(iconEl("star"), { className: "ic star" }));
    const scrap = el("button", { className: "scrap", disabled: !!t.chip, title: t.chip ? "Equipped: unequip it to scrap it" : "" }, iconEl("scrap"), `Scrap +${SCRAP_XP[t.rarity]} XP`);
    scrap.addEventListener("click", () => {
      if (!confirmScrap(t.rarity, t.name, t.favorite)) return;
      this.openGun = "";
      this.account.dispatch(scrapAction(t.kind, t.id));
    });
    d.replaceChildren(
      el("div", { className: "big" }, this.itemArt(t, true)),
      title,
      el("div", { className: "sub", textContent: t.sub }),
      ...t.body,
      el("div", { className: "act" }, ...t.actions, this.favButton(t.kind, t), scrap),
    );
  }

  /** Stars or unstars an item: favorites sort to the top, survive a full stash, and ask before you scrap them. */
  private favButton(kind: ArmoryKind, item: { id: string; favorite?: boolean }): HTMLElement {
    const b = el("button", { className: item.favorite ? "fav on" : "fav", title: item.favorite ? "Remove from favorites" : "Add to favorites" }, iconEl("star"));
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", () => this.account.dispatch({ type: "favorite", kind, itemId: item.id, on: !item.favorite }));
    return b;
  }

  private equipButton(on: boolean, onText: string, offText: string, act: () => void, canUndo = false): HTMLElement {
    const b = el("button", { className: "equip", disabled: on && !canUndo }, iconEl(on ? "check" : "equip"), on ? onText : offText);
    b.addEventListener("click", act);
    return b;
  }

  private gunItems(): ArmoryItem[] {
    const p = this.account.profile;
    const eqDps = Math.min(...p.loadout.map((id) => p.stash.find((g) => g.id === id)).filter(Boolean).map((g) => gunDps(g!)));
    return p.stash.map((g) => {
      const slot = p.loadout.indexOf(g.id);
      const dps = Math.round(gunDps(g));
      const better = slot < 0 && dps > eqDps;
      const leg = g.legendary ? LEGENDARIES[g.legendary] : undefined;
      const mdef = g.mythic ? MYTHIC_GUNS[g.mythic] : undefined;
      const special = mdef ?? leg;
      return {
        id: g.id,
        kind: "gun",
        rarity: g.rarity,
        favorite: g.favorite,
        rank: tileRank(slot, g.favorite, g.rarity),
        chip: slot >= 0 ? String(slot + 1) : "",
        better,
        myth: mythicArtId(g),
        art: () => drawGun(GUNS[g.defId]!.archetype, p.outfit.skin),
        fill: 80,
        name: gunName(g),
        sub: this.gunLine(g),
        body: [
          el("p", { className: `stat${better ? " up" : ""}`, textContent: `${better ? "▲ " : ""}DPS ${dps}${better ? `  (BEATS YOUR ${Math.round(eqDps)})` : ""}` }),
          ...(special
            ? [el("p", { className: mdef ? "mythic-text" : "up", textContent: special.text }), el("p", { className: "flavor", textContent: `"${special.flavor}"` })]
            : [el("p", { textContent: MAKERS[g.maker].quirk })]),
          ...g.perks.map((k) => el("p", { className: "perk", textContent: `+ ${PERKS[k].text}` })),
        ],
        actions: [0, 1].map((s) => this.equipButton(slot === s, `In slot ${s + 1}`, `Equip slot ${s + 1}`, () => this.account.dispatch({ type: "equip", slot: s, gunId: g.id }))),
      };
    });
  }

  private grenadeItems(): ArmoryItem[] {
    const p = this.account.profile;
    return p.grenades.map((g) => {
      const st = grenadeStats(g);
      const on = g.id === p.grenade;
      const elem = st.def.element;
      return {
        id: g.id,
        kind: "grenade",
        rarity: g.rarity,
        favorite: g.favorite,
        rank: tileRank(on ? 0 : -1, g.favorite, g.rarity),
        chip: on ? "ON" : "",
        myth: mythicArtId(g),
        art: () => drawGrenade(elem !== "none" ? toCss(ELEMENT_COLORS[elem]) : undefined),
        fill: 42,
        name: st.def.name,
        sub: `${g.rarity.toUpperCase()} GRENADE${elem !== "none" ? ` · ${ELEMENT_INFO[elem].adjective.toUpperCase()}` : ""}`,
        // No better/worse arrow: effect grenades trade damage for what they do, so damage alone would mislead.
        body: [
          el("p", { className: "stat", textContent: `DMG ${Math.round(st.damage)} · EVERY ${st.cooldown.toFixed(1)}S` }),
          el("p", { className: "up", textContent: st.def.text }),
          el("p", { className: "flavor", textContent: `"${st.def.flavor}"` }),
        ],
        actions: [this.equipButton(on, "On your belt", "Equip", () => this.account.dispatch({ type: "equipGrenade", grenadeId: g.id }))],
      };
    });
  }

  private relicItems(): ArmoryItem[] {
    const p = this.account.profile;
    return p.relics.map((r) => {
      const def = relicDef(r);
      const on = r.id === p.relic;
      const myth = mythicArtId(r);
      return {
        id: r.id,
        kind: "relic",
        rarity: r.rarity,
        favorite: r.favorite,
        rank: tileRank(on ? 0 : -1, r.favorite, r.rarity),
        chip: on ? "ON" : "",
        myth,
        art: () => drawSprite(SPRITES[`relic_${r.defId}`]!),
        fill: 52,
        name: def.name,
        sub: `${r.rarity.toUpperCase()} RELIC`,
        body: [el("p", { className: myth ? "mythic-text" : "up", textContent: relicText(def, r.rarity) }), el("p", { className: "flavor", textContent: `"${def.flavor}"` })],
        // Tap the equipped relic's button again to empty your pocket.
        actions: [this.equipButton(on, "Take off", "Equip", () => this.account.dispatch({ type: "equipRelic", relicId: on ? "" : r.id }), true)],
      };
    });
  }

  private scrapCommons(): void {
    const p = this.account.profile;
    const tab = this.armoryTab;
    const ids =
      tab === "grenades"
        ? p.grenades.filter((g) => g.rarity === "common" && !g.favorite && g.id !== p.grenade).map((g) => g.id)
        : tab === "relics"
          ? p.relics.filter((r) => r.rarity === "common" && !r.favorite && r.id !== p.relic).map((r) => r.id)
          : p.stash.filter((g) => g.rarity === "common" && !g.favorite && !p.loadout.includes(g.id)).map((g) => g.id);
    if (ids.length === 0) {
      $("armory-status").textContent = "NO SPARE COMMONS";
      return;
    }
    const { xp } = this.account.dispatch(
      tab === "grenades" ? { type: "scrap", gunIds: [], grenadeIds: ids } : tab === "relics" ? { type: "scrap", gunIds: [], relicIds: ids } : { type: "scrap", gunIds: ids },
    );
    $("armory-status").textContent = `SCRAPPED ${ids.length}: +${xp ?? 0} XP`;
  }

  // ---------------------------------------------------------------- souvenirs

  private souvenirArt(id: string): HTMLElement {
    const art = drawSouvenir(id);
    return el("span", { className: "thumb" }, ...(art ? [Object.assign(art, { className: "px" })] : []));
  }

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
        const b = el("button", {}, this.souvenirArt(id), el("b", { textContent: d.name }), `${d.text} (${p.souvenirs[id] ?? 0}/${d.maxRanks})`, el("br"), el("i", { textContent: d.flavor }));
        b.addEventListener("click", () => this.account.dispatch({ type: "souvenir", pick: id }));
        return b;
      }),
    );
    $("souv-list").replaceChildren(
      ...SOUVENIR_IDS.map((id) => {
        const d = SOUVENIRS[id];
        const n = p.souvenirs[id] ?? 0;
        const li = el("li", { className: "art" }, this.souvenirArt(id), el("div", {}, el("b", { textContent: `${d.name} ${n}/${d.maxRanks}` }), el("br"), `${d.text} each. ${d.flavor}`));
        li.style.borderColor = n > 0 ? "#f2c14e" : "#5a5060";
        li.style.cursor = "default";
        return li;
      }),
    );
  }

  // ---------------------------------------------------------------- wardrobe

  private renderWardrobe(): void {
    const p = this.account.profile;
    const slot = this.wardTab;
    $("ward-preview").replaceChildren(Object.assign(drawPreview(p.heroId, p.outfit, 0, loadoutArchetype(p.loadout[0], p.stash)), { className: "px" }));
    $("ward-wearing").textContent = COSMETIC_SLOTS.map((s) => (p.outfit[s] ? COSMETICS[p.outfit[s]]?.name : "")).filter(Boolean).join(" · ") || "Just the basics";
    for (const b of $("ward-tabs").querySelectorAll<HTMLButtonElement>("button")) {
      const s = b.dataset.slot as CosmeticSlot;
      const fresh = cosmeticsFor(s).some((c) => this.freshLooks.has(c.id));
      b.classList.toggle("on", s === slot);
      b.replaceChildren(SLOT_NAMES[s], ...(fresh ? [el("span", { className: "badge", textContent: "!" })] : []));
    }
    const item = (id: string, name: string, text: string, owned: boolean) => {
      const on = p.outfit[slot] === id;
      const icon = el("span", { className: "ico" });
      const art = id ? drawIcon(id) : undefined;
      if (art) icon.append(Object.assign(art, { className: "px" }));
      else icon.textContent = slot === "emote" ? (EMOTE_LINES[id] ?? "") : "-";
      const badge = this.freshLooks.has(id) ? [el("span", { className: "badge", textContent: "NEW" })] : [];
      const b = el("button", { className: on ? "on" : owned ? "" : "locked", disabled: !owned }, icon, el("span", {}, el("b", { textContent: owned ? name : "???" }, ...badge), text));
      b.addEventListener("click", () => {
        // Tap what you're wearing to take it off (there's always an emote).
        const next = on && slot !== "emote" ? "" : id;
        if (next === p.outfit[slot]) return;
        this.account.dispatch({ type: "outfit", slot, cosmetic: next });
        void this.pushLook();
      });
      return b;
    };
    const none = slot === "emote" ? [] : [item("", NONE_NAMES[slot], "The classic look.", true)];
    $("ward-items").replaceChildren(
      ...none,
      ...cosmeticsFor(slot).map((c) => {
        const owned = ownsCosmetic(p, c.id);
        return item(c.id, c.name, owned ? c.flavor : unlockText(c), owned);
      }),
    );
  }

  // ---------------------------------------------------------------- runs

  private stopScenes(): void {
    for (const key of ["game", "ui", "lobby"]) if (this.game.scene.isActive(key) || this.game.scene.isPaused(key)) this.game.scene.stop(key);
  }

  private runScenes(data: GameData): void {
    document.body.classList.remove("in-menu");
    $("menu").hidden = true;
    this.stopScenes();
    this.game.scene.start("game", data);
    this.game.scene.start("ui");
  }

  startSolo(): void {
    // A run that never got its ending comes home before the next one starts.
    this.account.bankRun();
    this.runScenes({
      profile: this.me,
      tier: this.tier,
      // Every run starts in a random adventure, then visits the others and ends in the Crypt.
      biome: ADVENTURE_IDS[Math.floor(Math.random() * ADVENTURE_IDS.length)],
      outfit: this.account.profile.outfit,
      // Solo results are trusted (friends-only game): applied here and synced when there's a connection.
      onRunEnd: (w, p): RunReward | undefined => this.account.dispatch({ type: "run", result: runResult(w, p, { mode: "solo", day: localDay() }) }).reward,
      onCheckpoint: (w, p) => this.account.checkpoint(runResult(w, p, { mode: "solo", day: localDay() })),
    });
  }

  /** The practice range: your loadout against training dummies. Nothing is saved, so there's no `onRunEnd`. */
  startPractice(): void {
    this.runScenes({ profile: this.me, practice: true, biome: "foundry", outfit: this.account.profile.outfit });
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
      this.adopt(await NetSession.connect(how, this.joinOptions, { tier: this.tier }));
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      this.show(how.kind === "code" && /not found|invalid|locked|full/i.test(msg) ? "NO OPEN ROOM WITH THAT CODE" : "CAN'T REACH THE SERVER");
    }
  }

  /** Opened again soon after closing mid co-op: take the same seat (and hero, mid-run) back. True if it worked. */
  async resume(): Promise<boolean> {
    if (!NetSession.canResume || this.session) return false;
    this.setBusy(true);
    $("status").textContent = "REJOINING YOUR PARTY...";
    try {
      const s = await NetSession.resume();
      s.isAccount = this.account.signedIn;
      this.adopt(s);
      return true;
    } catch {
      // The seat is gone (too late, or the room closed): carry on from the menu.
      this.show();
      return false;
    }
  }

  private adopt(s: NetSession): void {
    this.session = s;
    this.startedRun = -1;
    s.onLobby = (l) => this.onLobby(l);
    s.onReward = (r) => this.account.adopt(r.profile);
    s.onEmote = (e) => {
      this.lobbyScene?.emote(e);
      this.gameScene?.emoteFrom(e);
    };
    s.onClosed = (reason) => {
      if (this.session !== s) return;
      this.session = undefined;
      this.stopScenes();
      this.show(reason);
    };
    // In a run the HUD says so; in the lobby, the status line does.
    s.onReconnecting = (on) => {
      if (this.session === s) $("status").textContent = on ? "RECONNECTING..." : "";
    };
    $("status").textContent = "";
    this.setBusy(false);
    if (s.lobby) this.onLobby(s.lobby);
    else this.render();
  }

  private onLobby(l: LobbyInfo): void {
    const s = this.session;
    if (!s) return;
    if (l.running) {
      // A run is on (just started, restarted, or we dropped in): start drawing once its first snapshot lands.
      if (l.runId !== this.startedRun) this.startWhenReady(l.runId);
      return;
    }
    this.lobbyScene?.setLobby(l, s.sessionId);
    // Back from a run, the stage comes back; someone joining doesn't pull you out of the wardrobe or skills.
    if ($("menu").hidden) this.showStage();
    else if (!this.game.scene.isActive("lobby")) this.game.scene.start("lobby");
    this.render();
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

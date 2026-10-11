// The lobby (which is also the home screen), account, skills, armory, souvenirs and wardrobe. Plain HTML over the
// canvas: phones bring up their own keyboard for names and codes, and lists scroll like any web page. The lobby's
// stage itself is drawn by LobbyScene; the HTML only frames it.
import type Phaser from "phaser";
import {
  ADVENTURE_IDS,
  BIOMES,
  COSMETIC_SLOTS,
  COSMETICS,
  cosmeticsFor,
  ELEMENT_INFO,
  HERO_IDS,
  SIGNATURES,
  signaturesFor,
  type Biome,
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
  runResult,
  SCRAP_XP,
  SKILL_TREES,
  skillPoints,
  SLOT_NAMES,
  SOUVENIR_CAP,
  souvenirOffers,
  SOUVENIRS,
  SOUVENIR_IDS,
  souvenirTotal,
  spentPoints,
  gunDps,
  gunName,
  unlockText,
  xpToNext,
  type CosmeticSlot,
  type JoinOptions,
  type LobbyInfo,
  type PlayerOptions,
  type Rarity,
  type RunReward,
  type StashGrenade,
  type StashGun,
} from "@lostluggage/sim";
import { AccountStore } from "./account";
import { NetSession, type JoinKind } from "./net";
import { ELEMENT_COLORS, RARITY_COLORS, toCss } from "./render/colors";
import { drawGrenade, drawGun, drawIcon, drawPreview, EMOTE_LINES } from "./render/cosmetics";
import { drawSouvenir, iconEl, iconSvg } from "./render/icons";
import { drawMythicIcon, mythicArtId } from "./render/mythics";
import { sfx } from "./sfx";
import type { GameData } from "./scenes/GameScene";
import type { LobbyScene } from "./scenes/LobbyScene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const BIOME_KEY = "lostluggage.biome";

function loadBiome(): Biome {
  try {
    const b = localStorage.getItem(BIOME_KEY) as Biome | null;
    return b && ADVENTURE_IDS.includes(b) ? b : "foundry";
  } catch {
    return "foundry";
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

/** Legendaries and mythics ask before they go. */
function confirmScrap(rarity: Rarity, name: string): boolean {
  if (rarity === "mythic") return confirm(`Scrap ${name}? It's a MYTHIC: the rarest thing in the game. You may never see another.`);
  if (rarity === "legendary") return confirm(`Scrap ${name}? Legendaries are rare.`);
  return true;
}

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
  private armoryTab: "guns" | "grenades" = "guns";
  /** The adventure for solo runs and rooms you create. Remembered on this device. */
  private biome: Biome = loadBiome();

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
    $("lobby-biome").addEventListener("click", () => this.nextBiome());
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
    for (const b of $("armory-tabs").querySelectorAll<HTMLButtonElement>("button")) {
      b.addEventListener("click", () => {
        this.armoryTab = b.dataset.tab === "grenades" ? "grenades" : "guns";
        this.openGun = "";
        $("armory-status").textContent = "";
        this.renderArmory();
      });
    }
    // Every iconed button gets its icon now; the ones that change are relabeled in render().
    for (const b of document.querySelectorAll<HTMLElement>("#menu [data-icon]")) this.label(b, b.textContent ?? "", "");
    this.account.onChange(() => this.render());
    game.events.on("leave", () => this.leave());
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
    if (screen === "armory" && (prof.stash.some((g) => g.new) || prof.grenades.some((g) => g.new))) {
      this.fresh = new Set([...prof.stash, ...prof.grenades].filter((g) => g.new).map((g) => g.id));
      // Open on grenades when only grenades are new.
      if (!prof.stash.some((g) => g.new)) this.armoryTab = "grenades";
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
    const newGuns = p.stash.filter((g) => g.new).length + p.grenades.filter((g) => g.new).length;
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
    const biome = l?.biome ?? this.biome;
    this.label("lobby-biome", el("span", {}, BIOMES[biome]?.name ?? "", el("small", { textContent: host ? "Change adventure ▸" : "Host picks" })), "");
    $<HTMLButtonElement>("lobby-biome").disabled = !host;
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
      tier: 0,
      biome: this.biome,
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

  private nextBiome(): void {
    const s = this.session;
    if (s && !s.isHost) return;
    // The Drowned Crypt isn't on the list: every adventure ends there.
    const ids = ADVENTURE_IDS;
    this.biome = ids[(ids.indexOf(s?.lobby?.biome ?? this.biome) + 1) % ids.length]!;
    try {
      localStorage.setItem(BIOME_KEY, this.biome);
    } catch {
      /* private mode: it just won't be remembered */
    }
    s?.setBiome(this.biome);
    this.render();
  }

  /** A button's text, with its pixel icon (from `data-icon`) and an optional badge. */
  private label(target: string | HTMLElement, text: string | Node, badge: string): void {
    const b = typeof target === "string" ? $(target) : target;
    const icon = b.dataset.icon ? document.createRange().createContextualFragment(iconSvg(b.dataset.icon)) : "";
    b.replaceChildren(icon, text, ...(badge ? [el("span", { className: "badge", textContent: badge })] : []));
  }

  private setBusy(busy: boolean): void {
    for (const id of ["play", "quick", "create", "join"]) $<HTMLButtonElement>(id).disabled = busy;
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
    for (const b of $("armory-tabs").querySelectorAll<HTMLButtonElement>("button")) {
      const tab = b.dataset.tab;
      const list: { id: string }[] = tab === "grenades" ? this.account.profile.grenades : this.account.profile.stash;
      b.classList.toggle("on", tab === this.armoryTab);
      b.replaceChildren(tab === "grenades" ? "Grenades" : "Guns", ...(list.some((g) => this.fresh.has(g.id)) ? [el("span", { className: "badge", textContent: "!" })] : []));
    }
    if (this.armoryTab === "grenades") this.renderGrenades();
    else this.renderGuns();
  }

  private renderGrenades(): void {
    const p = this.account.profile;
    const rank = (g: StashGrenade) => (g.id === p.grenade ? -10 : 0) - RARITY_ORDER.indexOf(g.rarity);
    const nades = [...p.grenades].sort((a, b) => rank(a) - rank(b));
    $("armory-hint").textContent = `${p.grenades.length}/${GRENADE_CAP} GRENADES. TAP ONE TO EQUIP OR SCRAP IT. THE ONE ON YOUR BELT COMES HOME.${this.account.signedIn ? "" : " GUESTS KEEP NOTHING."}`;
    $("armory-list").replaceChildren(
      ...nades.map((g) => {
        const st = grenadeStats(g);
        const on = g.id === p.grenade;
        const elem = st.def.element;
        const myth = mythicArtId(g);
        const li = el("li", { className: myth ? "art mythic" : "art" });
        li.style.borderColor = toCss(RARITY_COLORS[g.rarity]);
        if (myth) li.append(mythicThumb(myth));
        else {
          const art = drawGrenade(elem !== "none" ? toCss(ELEMENT_COLORS[elem]) : undefined);
          // Grenades are tiny sprites: drawn bigger than guns so they fill the tile.
          art.style.transform = "scale(7)";
          li.append(el("span", { className: "thumb" }, Object.assign(art, { className: "px" })));
        }
        const body = el("div");
        li.append(body);
        const title = el("b", { textContent: st.def.name });
        title.style.color = toCss(RARITY_COLORS[g.rarity]);
        const elemText = elem !== "none" ? ` · ${ELEMENT_INFO[elem].adjective.toUpperCase()}` : "";
        body.append(title, on ? "  [EQUIPPED]" : "", this.fresh.has(g.id) ? el("span", { className: "badge", textContent: "NEW" }) : "", el("br"), `${g.rarity.toUpperCase()} GRENADE${elemText}`, el("br"));
        // No better/worse arrow: effect grenades trade damage for what they do, so damage alone would mislead.
        body.append(`DMG ${Math.round(st.damage)} · EVERY ${st.cooldown.toFixed(1)}S`);
        body.append(el("br"), el("span", { className: "up", textContent: st.def.text }), el("br"), `"${st.def.flavor}"`);
        if (this.openGun === g.id) {
          const act = el("div", { className: "act" });
          const eq = el("button", { disabled: on }, iconEl(on ? "check" : "equip"), on ? "Equipped" : "Equip");
          eq.addEventListener("click", (e) => {
            e.stopPropagation();
            this.account.dispatch({ type: "equipGrenade", grenadeId: g.id });
          });
          const scrap = el("button", { disabled: on }, iconEl("scrap"), `Scrap +${SCRAP_XP[g.rarity]} XP`);
          scrap.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirmScrap(g.rarity, st.def.name)) this.account.dispatch({ type: "scrap", gunIds: [], grenadeIds: [g.id] });
          });
          act.append(eq, scrap);
          body.append(act);
        }
        li.addEventListener("click", () => {
          this.openGun = this.openGun === g.id ? "" : g.id;
          this.renderArmory();
        });
        return li;
      }),
    );
  }

  private renderGuns(): void {
    const p = this.account.profile;
    const equipped = p.loadout;
    const eqDps = Math.min(...p.loadout.map((id) => p.stash.find((g) => g.id === id)).filter(Boolean).map((g) => gunDps(g!)));
    const rank = (g: StashGun) => (equipped.includes(g.id) ? -10 + equipped.indexOf(g.id) : 0) - RARITY_ORDER.indexOf(g.rarity);
    const guns = [...p.stash].sort((a, b) => rank(a) - rank(b));
    $("armory-hint").textContent = `${p.stash.length}/40 GUNS. TAP ONE TO EQUIP OR SCRAP IT. SCRAPPING GIVES XP.${this.account.signedIn ? "" : " GUESTS KEEP NOTHING."}`;
    $("armory-list").replaceChildren(
      ...guns.map((g) => {
        const slot = equipped.indexOf(g.id);
        const dps = Math.round(gunDps(g));
        const better = slot < 0 && dps > eqDps;
        const myth = mythicArtId(g);
        const li = el("li", { className: myth ? "art mythic" : "art" });
        li.style.borderColor = toCss(RARITY_COLORS[g.rarity]);
        const body = el("div");
        li.append(myth ? mythicThumb(myth) : el("span", { className: "thumb" }, Object.assign(drawGun(GUNS[g.defId]!.archetype, p.outfit.skin), { className: "px" })), body);
        const title = el("b", { textContent: gunName(g) });
        title.style.color = toCss(RARITY_COLORS[g.rarity]);
        body.append(title, slot >= 0 ? `  [SLOT ${slot + 1}]` : "", this.fresh.has(g.id) ? el("span", { className: "badge", textContent: "NEW" }) : "", el("br"), this.gunLine(g), el("br"));
        body.append(el("span", { className: better ? "up" : "", textContent: `${better ? "▲ " : ""}DPS ${dps}` }));
        const leg = g.legendary ? LEGENDARIES[g.legendary] : undefined;
        const mdef = g.mythic ? MYTHIC_GUNS[g.mythic] : undefined;
        if (mdef) body.append(el("br"), el("span", { className: "mythic-text", textContent: mdef.text }), el("br"), `"${mdef.flavor}"`);
        else if (leg) body.append(el("br"), el("span", { className: "up", textContent: leg.text }), el("br"), `"${leg.flavor}"`);
        else body.append(el("br"), MAKERS[g.maker].quirk);
        for (const perk of g.perks) body.append(el("br"), `+ ${PERKS[perk].text}`);
        if (this.openGun === g.id) {
          const act = el("div", { className: "act" });
          for (const s of [0, 1]) {
            const b = el("button", { disabled: slot === s }, iconEl(slot === s ? "check" : "equip"), slot === s ? `In slot ${s + 1}` : `Equip slot ${s + 1}`);
            b.addEventListener("click", (e) => {
              e.stopPropagation();
              this.account.dispatch({ type: "equip", slot: s, gunId: g.id });
            });
            act.append(b);
          }
          const scrap = el("button", { disabled: slot >= 0 }, iconEl("scrap"), `Scrap +${SCRAP_XP[g.rarity]} XP`);
          scrap.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirmScrap(g.rarity, gunName(g))) this.account.dispatch({ type: "scrap", gunIds: [g.id] });
          });
          act.append(scrap);
          body.append(act);
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
    const grenades = this.armoryTab === "grenades";
    const ids = grenades
      ? p.grenades.filter((g) => g.rarity === "common" && g.id !== p.grenade).map((g) => g.id)
      : p.stash.filter((g) => g.rarity === "common" && !p.loadout.includes(g.id)).map((g) => g.id);
    if (ids.length === 0) {
      $("armory-status").textContent = "NO SPARE COMMONS";
      return;
    }
    const { xp } = this.account.dispatch(grenades ? { type: "scrap", gunIds: [], grenadeIds: ids } : { type: "scrap", gunIds: ids });
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
    this.runScenes({
      profile: this.me,
      biome: this.biome,
      outfit: this.account.profile.outfit,
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
      const s = await NetSession.connect(how, this.joinOptions, { biome: this.biome });
      this.session = s;
      this.startedRun = -1;
      s.onLobby = (l) => this.onLobby(l);
      s.onReward = (r) => this.account.adopt(r.profile);
      s.onEmote = (e) => this.lobbyScene?.emote(e);
      s.onClosed = (reason) => {
        if (this.session !== s) return;
        this.session = undefined;
        this.stopScenes();
        this.show(reason);
      };
      $("status").textContent = "";
      this.setBusy(false);
      if (s.lobby) this.onLobby(s.lobby);
      else this.render();
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      this.show(how.kind === "code" && /not found|invalid|locked|full/i.test(msg) ? "NO OPEN ROOM WITH THAT CODE" : "CAN'T REACH THE SERVER");
    }
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

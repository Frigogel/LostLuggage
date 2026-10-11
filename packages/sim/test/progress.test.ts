import { describe, expect, it } from "vitest";
import {
  applyAction,
  cleanProfile,
  createWorld,
  decodeSnapshot,
  EMPTY_INPUT,
  encodeSnapshot,
  gunDps,
  gunStats,
  HEROES,
  MAX_LEVEL,
  newProfile,
  playerOptions,
  runResult,
  SCRAP_XP,
  skillPoints,
  SOUVENIR_CAP,
  souvenirOffers,
  STASH_CAP,
  stepMovement,
  step,
  validSkills,
  xpToNext,
  type Action,
  type PlayerInput,
  type PlayerOptions,
  type Profile,
  type RunResult,
  type StashGun,
  type World,
} from "../src";
import { spawnEnemy } from "../src/combat";
import { newGun } from "../src/loot";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });

function run(w: World, ticks: number, inp: PlayerInput = EMPTY_INPUT) {
  for (let i = 0; i < ticks; i++) step(w, [inp]);
}

/** A world with no waves, vents or pickups, for one mechanic at a time. */
function quiet(opts: PlayerOptions = {}, seed = 1): World {
  const w = createWorld({ seed, players: [opts] });
  w.run.room.waves = [];
  w.run.room.vents = [];
  w.run.room.cleared = true;
  w.run.victory = true; // keeps the exit shut
  w.enemies = [];
  w.pickups = [];
  return w;
}

/** A dummy enemy that stands still and never attacks. */
function dummy(w: World, x: number, y: number, defId = "slag_golem") {
  const e = spawnEnemy(w, defId, { x, y }, 0);
  e.hp = e.maxHp = 5000;
  e.cooldowns = e.cooldowns.map(() => 1e9);
  return e;
}

const bolt = (w: World, from: { x: number; y: number }, vx: number, ownerId: number) => {
  w.projectiles.push({
    id: 9000 + w.projectiles.length, owner: "enemy", ownerId, kind: "bolt", element: "none", pos: { ...from }, vel: { x: vx, y: 0 },
    radius: 3, damage: 10, pierce: 0, bounces: 0, knockback: 0, life: 3, hitIds: [], gunUid: -1,
  });
};

const ALL_VG = ["vg_wide", "vg_overtime", "vg_moving", "vg_patch", "vg_panic", "vg_cling", "vg_zapper", "vg_capacitor", "vg_overload", "vg_thunder", "vg_rebound", "vg_potato", "vg_bouncer", "vg_service", "vg_doorslam"];

describe("skill trees", () => {
  it("one point per level, nodes in order, and a maxed hero still can't take everything", () => {
    expect(skillPoints(1)).toBe(0);
    expect(skillPoints(MAX_LEVEL)).toBe(29);
    expect(validSkills("vanguard", 1, ["vg_wide"])).toEqual([]);
    expect(validSkills("vanguard", 2, ["vg_wide", "vg_cling"])).toEqual(["vg_wide"]);
    // Out of order: Overtime without Wide Load is dropped.
    expect(validSkills("vanguard", 10, ["vg_overtime", "vg_cling"])).toEqual(["vg_cling"]);
    expect(validSkills("vanguard", 10, ["nope", "vg_cling"])).toEqual(["vg_cling"]);
    const maxed = validSkills("vanguard", MAX_LEVEL, ALL_VG);
    expect(maxed.length).toBeLessThan(ALL_VG.length);
    expect(maxed.length).toBeGreaterThanOrEqual(12);
  });

  it("Bulkhead: a wider, longer dome that follows you", () => {
    const plain = quiet();
    const built = quiet({ level: 10, skills: ["vg_wide", "vg_overtime", "vg_moving"] });
    for (const w of [plain, built]) {
      w.players[0]!.skillCharge = 1;
      step(w, [input({ skill: true })]);
    }
    const a = plain.domes[0]!;
    const b = built.domes[0]!;
    expect(b.radius).toBeCloseTo(a.radius * 1.3);
    expect(b.maxT).toBeCloseTo(a.maxT + 2);
    run(built, 15, input({ move: { x: 1, y: 0 } }));
    run(plain, 15, input({ move: { x: 1, y: 0 } }));
    expect(built.domes[0]!.pos.x).toBeCloseTo(built.players[0]!.pos.x, 0);
    expect(plain.domes[0]!.pos.x).toBeLessThan(plain.players[0]!.pos.x - 10);
  });

  it("Static: the dome zaps enemies at its edge, and Overload blows it up at the end", () => {
    const w = quiet({ level: 10, skills: ["vg_cling", "vg_zapper", "vg_capacitor", "vg_overload"] });
    const p = w.players[0]!;
    const e = dummy(w, p.pos.x + 50, p.pos.y);
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    const zapped = () => w.events.filter((ev) => ev.type === "hit" && ev.targetId === e.id).length;
    let hits = 0;
    let pulses = 0;
    let blasts = 0;
    for (let i = 0; i < 30 * 6; i++) {
      step(w, [EMPTY_INPUT]);
      hits += zapped();
      pulses += w.events.filter((ev) => ev.type === "domePulse").length;
      blasts += w.events.filter((ev) => ev.type === "explosion" && ev.owner === "player").length;
    }
    expect(pulses).toBeGreaterThanOrEqual(4);
    expect(hits).toBeGreaterThanOrEqual(5); // zaps plus the final blast
    expect(blasts).toBe(1);
    expect(w.domes.length).toBe(0);
  });

  it("Return to Sender: the dome sends bolts back, and a dash bats them away with Door Slam", () => {
    const w = quiet({ level: 30, skills: ["vg_rebound", "vg_potato", "vg_bouncer", "vg_service", "vg_doorslam"] });
    const p = w.players[0]!;
    const shooter = dummy(w, p.pos.x + 140, p.pos.y);
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    bolt(w, { x: p.pos.x + 80, y: p.pos.y }, -150, shooter.id);
    let reflected = 0;
    for (let i = 0; i < 30 * 2; i++) {
      step(w, [EMPTY_INPUT]);
      reflected += w.events.filter((ev) => ev.type === "reflect").length;
    }
    expect(reflected).toBe(1);
    expect(shooter.hp).toBeLessThan(shooter.maxHp);

    // Without a dome, a dash reflects too.
    run(w, 30 * 8);
    expect(w.domes.length).toBe(0);
    const hp = p.hp;
    bolt(w, { x: p.pos.x + 30, y: p.pos.y }, -200, shooter.id);
    let batted = 0;
    for (let i = 0; i < 5; i++) {
      step(w, [input({ dash: i === 0, move: { x: 1, y: 0 } })]);
      batted += w.events.filter((ev) => ev.type === "reflect").length;
    }
    expect(p.hp).toBe(hp);
    expect(batted).toBe(1);
  });

  it("Panic Room pops a free dome once per room when health gets low", () => {
    const w = quiet({ level: 20, skills: ["vg_wide", "vg_overtime", "vg_moving", "vg_patch", "vg_panic"] });
    const p = w.players[0]!;
    bolt(w, { ...p.pos }, 0, 0);
    p.hp = p.maxHp * 0.32;
    step(w, [EMPTY_INPUT]);
    expect(w.domes.length).toBe(1);
    // Hull Patch heals inside it.
    const low = p.hp;
    run(w, 40);
    expect(p.hp).toBeGreaterThan(low);
    // Used up for this room.
    w.domes = [];
    p.iframes = 0;
    p.hp = p.maxHp * 0.25;
    bolt(w, { ...p.pos }, 0, 0);
    step(w, [EMPTY_INPUT]);
    expect(w.domes.length).toBe(0);
  });
});

describe("legendaries and manufacturers in play", () => {
  const fireAt = (w: World, defId: string, rarity: StashGun["rarity"], element: StashGun["element"], maker: StashGun["maker"], legendary?: string) => {
    const p = w.players[0]!;
    p.guns[0] = { ...newGun(w, defId, rarity, element, [], maker), ...(legendary ? { legendary } : {}) };
    p.guns[0].pips = gunStats(p.guns[0]).pips;
    return p;
  };

  it("The Ex: pellets come back", () => {
    const w = quiet();
    const p = fireAt(w, "shotgun", "legendary", "none", "goblin", "the_ex");
    step(w, [input({ fire: true, aim: { x: 100, y: 0 } })]);
    const ids = w.projectiles.map((pr) => pr.id);
    expect(ids.length).toBe(gunStats(p.guns[0]!).pellets);
    run(w, 12);
    const back = w.projectiles.filter((pr) => ids.includes(pr.id));
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((pr) => pr.vel.x < 0)).toBe(true);
  });

  it("Overachiever: every 10th bullet is a rocket", () => {
    const w = quiet();
    const p = fireAt(w, "smg", "legendary", "none", "megamart", "overachiever");
    dummy(w, p.pos.x + 120, p.pos.y);
    let rockets = 0;
    for (let i = 0; i < 30 * 3; i++) {
      step(w, [input({ fire: true, aim: { x: 120, y: 0 } })]);
      rockets = Math.max(rockets, w.projectiles.filter((pr) => pr.kind === "rocket").length);
    }
    expect(p.guns[0]!.count).toBeGreaterThanOrEqual(10);
    expect(rockets).toBeGreaterThanOrEqual(1);
  });

  it("Hot Take leaves burning ground that hurts enemies", () => {
    const w = quiet();
    const p = fireAt(w, "sniper", "legendary", "fire", "dwarfcorp", "hot_take");
    const e = dummy(w, p.pos.x + 60, p.pos.y, "cone_rat");
    e.hp = e.maxHp = 5000;
    step(w, [input({ fire: true, aim: { x: 200, y: 0 } })]);
    run(w, 20);
    expect(w.hazards.filter((h) => h.owner === "player" && h.kind === "fire").length).toBeGreaterThan(3);
    const before = e.hp;
    run(w, 30);
    expect(e.hp).toBeLessThan(before);
  });

  it("Show-Off jumps between enemies", () => {
    const w = quiet();
    const p = fireAt(w, "pistol", "legendary", "none", "wizard", "show_off");
    const a = dummy(w, p.pos.x + 60, p.pos.y, "cone_rat");
    const b = dummy(w, p.pos.x + 60, p.pos.y - 50, "cone_rat");
    const c = dummy(w, p.pos.x + 110, p.pos.y - 50, "cone_rat");
    step(w, [input({ fire: true, aim: { x: 60, y: 0 } })]);
    run(w, 30);
    expect([a, b, c].every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it("Party Favor bursts into bomblets; Goblin launchers lob extra shells", () => {
    const w = quiet();
    fireAt(w, "launcher", "legendary", "none", "goblin", "party_favor");
    step(w, [input({ fire: true, aim: { x: 100, y: 0 } })]);
    const shells = w.projectiles.length;
    expect(shells).toBe(3);
    let blasts = 0;
    for (let i = 0; i < 60; i++) {
      step(w, [EMPTY_INPUT]);
      blasts += w.events.filter((ev) => ev.type === "explosion").length;
    }
    expect(blasts).toBe(shells * 5);
  });

  it("Mood Ring cycles elements shot by shot", () => {
    const w = quiet();
    fireAt(w, "pistol", "legendary", "none", "arcane", "mood_ring");
    const seen: string[] = [];
    for (let i = 0; i < 30 * 4 && seen.length < 4; i++) {
      step(w, [input({ fire: true, aim: { x: 100, y: 0 } })]);
      for (const ev of w.events) if (ev.type === "shot") seen.push(ev.element);
    }
    expect(seen).toEqual(["fire", "shock", "frost", "acid"]);
  });

  it("Wizard Labs shots curve toward enemies", () => {
    const w = quiet();
    const p = fireAt(w, "pistol", "common", "none", "wizard");
    const e = dummy(w, p.pos.x + 100, p.pos.y - 40, "cone_rat");
    e.stunT = 99; // hold still: rats go around you now
    // Aim straight right: the enemy is off to the side.
    step(w, [input({ fire: true, aim: { x: 100, y: 0 } })]);
    run(w, 20);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe("souvenirs", () => {
  it("apply small permanent boosts, carried over the wire for prediction", () => {
    const w = createWorld({ seed: 2, players: [{ souvenirs: { snacks: 5, shoes: 5, batteries: 5 } }] });
    const plain = createWorld({ seed: 2 });
    const p = w.players[0]!;
    expect(p.maxHp).toBe(Math.round(plain.players[0]!.maxHp * 1.1));
    expect(p.mods.speed).toBeCloseTo(1.05);
    const d = decodeSnapshot(encodeSnapshot(w, [], new Map())).world.players[0]!;
    expect(d.mods.speed).toBeCloseTo(p.mods.speed, 3);
    expect(d.mods.dashCd).toBeCloseTo(p.mods.dashCd, 3);
    // Prediction from the snapshot moves exactly like the server.
    const inp = input({ move: { x: 1, y: 0 }, dash: true });
    stepMovement(w, d, inp);
    step(w, [inp]);
    expect(d.pos.x).toBeCloseTo(p.pos.x, 0);
    expect(d.dashCd).toBeCloseTo(p.dashCd, 5);
  });

  it("are capped, and offered three at a time", () => {
    let p = { ...newProfile(), pendingSouvenirs: 20 };
    for (let i = 0; i < 20; i++) {
      const offers = souvenirOffers(p);
      if (offers.length === 0) break;
      expect(new Set(offers).size).toBe(offers.length);
      p = applyAction(p, { type: "souvenir", id: `s${i}`, pick: offers[0]! }).profile;
    }
    const total = Object.values(p.souvenirs).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(SOUVENIR_CAP);
    expect(souvenirOffers(p)).toEqual([]);
    // Picking something that isn't on offer does nothing.
    const q = { ...newProfile(), pendingSouvenirs: 1 };
    const off = souvenirOffers(q);
    const notOffered = (["snacks", "gym", "shoes", "batteries", "charger", "keychain"] as const).find((id) => !off.includes(id))!;
    expect(applyAction(q, { type: "souvenir", id: "x", pick: notOffered }).profile.souvenirs).toEqual({});
  });
});

describe("progression", () => {
  const gun = (id: string, rarity: StashGun["rarity"] = "rare", extra: Partial<StashGun> = {}): StashGun => ({ id, defId: "smg", element: "shock", rarity, perks: ["bounce"], maker: "wizard", ...extra });
  // A typical run: through the first act and its boss.
  const result = (over: Partial<RunResult> = {}): RunResult => ({ mode: "solo", heroId: "vanguard", tier: 0, victory: false, rooms: 7, acts: 1, kills: 100, guns: [], hand: [], day: "2026-10-10", ...over });
  const act = (p: Profile, a: Action) => applyAction(p, a);

  it("a run through the first boss is worth about 150 XP, the first boss of the day half again, and a win far more", () => {
    const p = newProfile("Ana");
    const first = act(p, { type: "run", id: "r1", result: result() });
    expect(first.reward!.bonuses.join()).toMatch(/FIRST BOSS/);
    const second = act(first.profile, { type: "run", id: "r2", result: result() });
    expect(second.reward!.xp).toBeGreaterThan(120);
    expect(second.reward!.xp).toBeLessThan(180);
    const win = act(first.profile, { type: "run", id: "r4", result: result({ victory: true, rooms: 20, acts: 3, kills: 600 }) });
    expect(win.reward!.xp).toBeGreaterThan(second.reward!.xp * 3);
    expect(first.reward!.xp).toBeCloseTo(second.reward!.xp * 1.5, -1);
    // A loss still pays for the rooms you cleared.
    const loss = act(p, { type: "run", id: "r3", result: result({ victory: false, rooms: 2, acts: 0, kills: 30 }) });
    expect(loss.reward!.xp).toBeGreaterThan(20);
    expect(loss.reward!.souvenir).toBe(false);
    expect(first.reward!.souvenir).toBe(true);
  });

  it("levels follow the design doc's curve up to the cap", () => {
    let p = newProfile();
    expect(xpToNext(1)).toBe(125);
    let total = 0;
    for (let l = 1; l < MAX_LEVEL; l++) total += xpToNext(l);
    expect(total).toBe(13775);
    for (let i = 0; i < 200; i++) p = act(p, { type: "run", id: `r${i}`, result: result({ day: "" }) }).profile;
    expect(p.heroes.vanguard!.level).toBe(MAX_LEVEL);
    expect(p.heroes.vanguard!.xp).toBe(0);
  });

  it("brings home everything you picked up and keeps the guns in your hands equipped", () => {
    const p = newProfile();
    const { profile, reward } = act(p, { type: "run", id: "r1", result: result({ guns: [gun("a"), gun("b", "legendary", { legendary: "show_off" })], hand: ["starter-pistol", "b"] }) });
    expect(reward!.kept).toBe(2);
    expect(reward!.legendaries).toBe(1);
    expect(profile.stash.map((g) => g.id)).toEqual(["starter-pistol", "starter-shotgun", "a", "b"]);
    // A legendary is always the real thing, whatever the client claimed.
    expect(profile.stash[3]).toMatchObject({ defId: "pistol", maker: "wizard", rarity: "legendary" });
    expect(profile.loadout).toEqual(["starter-pistol", "b"]);
    // Replaying the same guns doesn't duplicate them.
    expect(act(profile, { type: "run", id: "r2", result: result({ guns: [gun("a")] }) }).profile.stash.length).toBe(4);
  });

  it("equips, swaps, scraps for XP, and never scraps what you're holding", () => {
    let p = act(newProfile(), { type: "run", id: "r", result: result({ guns: [gun("a", "common"), gun("b", "epic")] }) }).profile;
    p = act(p, { type: "equip", id: "e1", slot: 0, gunId: "b" }).profile;
    expect(p.loadout).toEqual(["b", "starter-shotgun"]);
    p = act(p, { type: "equip", id: "e2", slot: 1, gunId: "b" }).profile;
    expect(p.loadout).toEqual(["starter-shotgun", "b"]);
    const before = p.heroes.vanguard!;
    const s = act(p, { type: "scrap", id: "s", gunIds: ["a", "b", "starter-pistol"] });
    expect(s.xp).toBe(SCRAP_XP.common * 2);
    expect(s.profile.stash.map((g) => g.id).sort()).toEqual(["b", "starter-shotgun"]);
    expect(s.profile.heroes.vanguard!.xp + s.profile.heroes.vanguard!.level * 1000).toBeGreaterThan(before.xp + before.level * 1000);
  });

  it("a full stash scraps its worst unequipped guns", () => {
    let p = newProfile();
    const guns = Array.from({ length: STASH_CAP + 5 }, (_, i) => gun(`g${i}`, i < 10 ? "common" : "rare"));
    const r = act(p, { type: "run", id: "r", result: result({ guns: guns.slice(0, 30) }) });
    p = act(r.profile, { type: "run", id: "r2", result: result({ guns: guns.slice(30) }) }).profile;
    expect(p.stash.length).toBe(STASH_CAP);
    expect(p.stash.filter((g) => g.rarity === "common").length).toBeLessThan(10);
    expect(p.loadout.every((id) => p.stash.some((g) => g.id === id))).toBe(true);
  });

  it("skills are set as a whole (free respec) and trimmed to what the level allows", () => {
    let p = newProfile();
    p.heroes.vanguard!.level = 4;
    p = act(p, { type: "skills", id: "k", heroId: "vanguard", skills: ["vg_cling", "vg_zapper", "vg_rebound"] }).profile;
    expect(p.heroes.vanguard!.skills).toEqual(["vg_cling", "vg_zapper"]);
    p = act(p, { type: "skills", id: "k2", heroId: "vanguard", skills: ["vg_rebound"] }).profile;
    expect(p.heroes.vanguard!.skills).toEqual(["vg_rebound"]);
  });

  it("a run's result comes from the world, and the profile drives the next run", () => {
    let p = newProfile("Bo");
    p.heroes.vanguard = { level: 8, xp: 0, skills: ["vg_wide"] };
    p.souvenirs = { gym: 3 };
    const w = createWorld({ seed: 5, players: [playerOptions(p)] });
    const me = w.players[0]!;
    expect(me.level).toBe(8);
    expect(me.skills).toEqual(["vg_wide"]);
    expect(me.guns.map((g) => g.sid)).toEqual(["starter-pistol", "starter-shotgun"]);
    expect(me.mods.damage).toBeCloseTo(1.03);
    // Pick up the intro's loaner sniper and a real drop.
    const loaner = w.pickups.find((k) => k.gun?.defId === "sniper")!;
    me.pos = { ...loaner.pos };
    step(w, [input({ interact: true })]);
    const drop = { ...newGun(w, "launcher", "epic", "acid", [], "dwarfcorp") };
    me.pos = { x: 100, y: 100 };
    w.pickups.push({ id: 7777, kind: "gun", pos: { ...me.pos }, gun: drop, used: false });
    me.active = 1;
    step(w, [input({ interact: true })]);
    let n = 0;
    const r = runResult(w, me, { mode: "solo", day: "2026-10-10", newId: () => `new${n++}` });
    expect(r.guns.map((g) => g.defId)).toEqual(["launcher"]);
    expect(r.hand).toEqual(["", "new0"]);
    p = act(p, { type: "run", id: "x", result: r }).profile;
    expect(p.loadout).toEqual(["starter-pistol", "new0"]);
    expect(createWorld({ seed: 6, players: [playerOptions(p)] }).players[0]!.guns[1]!.defId).toBe("launcher");
  });

  it("cleans hostile or broken saves", () => {
    const p = cleanProfile({ name: "<script>", heroes: { vanguard: { level: 99, xp: -5, skills: ["vg_wide", "evil"] }, hacker: { level: 3 } }, stash: [{ id: "a", defId: "bfg" }, { id: "b", defId: "smg", rarity: "mythic", perks: ["pierce", "pierce", "nope"] }, { id: "b", defId: "smg" }], souvenirs: { gym: 50 } });
    expect(p.name).toBe("SCRIPT");
    expect(p.heroes.vanguard!.level).toBe(MAX_LEVEL);
    expect(p.heroes.vanguard!.skills).toEqual(["vg_wide"]);
    // Unknown heroes are dropped; real ones the save never played are simply absent.
    expect(Object.keys(p.heroes)).toEqual(["vanguard"]);
    expect(p.stash.map((g) => [g.id, g.rarity, g.perks])).toEqual([["b", "common", ["pierce"]]]);
    expect(p.souvenirs.gym).toBe(5);
    // The loadout points at guns that no longer exist: the starter kit fills in.
    expect(playerOptions(p).guns!.map((g) => g.defId)).toEqual(["pistol", "shotgun"]);
    expect(gunDps(playerOptions(p).guns![0]!)).toBeGreaterThan(0);
  });
});

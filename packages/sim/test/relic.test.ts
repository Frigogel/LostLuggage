import { describe, expect, it } from "vitest";
import {
  applyAction,
  cleanProfile,
  createWorld,
  decodeEvent,
  decodeSnapshot,
  EMPTY_INPUT,
  ENEMIES,
  encodeEvent,
  encodeSnapshot,
  MYTHIC,
  MYTHIC_RELIC_IDS,
  newProfile,
  playerOptions,
  RELIC_IDS,
  RELIC_STATS,
  RELICS,
  relicAmount,
  rollRelic,
  runResult,
  step,
  type Action,
  type PlayerInput,
  type Profile,
  type Relic,
  type World,
} from "../src";
import { damageEnemy, hurtPlayer, shovePlayer, spawnEnemy } from "../src/combat";
import { tryGrab } from "../src/grabs";
import { cleanRelic, RELIC_CAP, SCRAP_XP } from "../src/progress";
import { equipRelic } from "../src/players";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });
const act = (p: Profile, a: Action) => applyAction(p, a);

/** A world with nothing in it but you, holding `relic`. */
function quiet(relic?: Relic, seed = 1): World {
  const w = createWorld({ seed, players: [{ relic }] });
  w.run.room.waves = [];
  w.run.room.vents = [];
  w.run.room.cleared = true;
  w.enemies = [];
  w.pickups = [];
  w.players[0]!.pos = { x: 240, y: 200 };
  return w;
}

describe("relics: loot", () => {
  it("the regular roll gives every stat relic and never a mythic one, however lucky", () => {
    const w = quiet();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const r = rollRelic(w, 5);
      expect(r.rarity).not.toBe("mythic");
      seen.add(r.defId);
    }
    expect([...seen].sort()).toEqual([...RELIC_IDS].sort());
    for (const id of MYTHIC_RELIC_IDS) expect(RELIC_IDS).not.toContain(id);
  });

  it("stat relics grow with rarity and stay inside the gear's narrow band", () => {
    for (const id of RELIC_IDS) {
      const def = RELICS[id]!;
      const amounts = (["common", "uncommon", "rare", "epic", "legendary"] as const).map((r) => relicAmount(def, r));
      for (let i = 1; i < amounts.length; i++) expect(amounts[i]).toBeGreaterThan(amounts[i - 1]!);
      if (def.stat !== "luck") expect(amounts[4]).toBeLessThanOrEqual(0.15);
    }
    // Mythic relics carry an ability, not a stat.
    for (const id of MYTHIC_RELIC_IDS) expect(relicAmount(RELICS[id], "mythic")).toBe(0);
    expect(Object.keys(RELIC_STATS).length).toBe(RELIC_IDS.length);
  });

  it("every boss drops one, at rare or better", () => {
    const w = quiet();
    const boss = Object.keys(ENEMIES).find((id) => ENEMIES[id]!.boss)!;
    const e = spawnEnemy(w, boss, { x: 300, y: 150 }, 0);
    e.hp = 1;
    w.players[0]!.pos = { x: 300, y: 250 };
    damageEnemy(w, e, 999, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: w.players[0]!.id, element: "none" });
    const relic = w.pickups.find((p) => p.kind === "relic");
    expect(relic).toBeDefined();
    expect(["rare", "epic", "legendary"]).toContain(relic!.relic!.rarity);
  });
});

describe("relics: stats", () => {
  it("a stat relic changes the stat when the run starts, and swapping takes the old one off", () => {
    const bare = quiet().players[0]!;
    const w = quiet({ defId: "energy_drink", rarity: "legendary" });
    const p = w.players[0]!;
    expect(p.mods.damage).toBeCloseTo(bare.mods.damage * 1.08, 9);
    equipRelic(p, { defId: "neck_pillow", rarity: "legendary" });
    expect(p.mods.damage).toBeCloseTo(bare.mods.damage, 9);
    expect(p.maxHp).toBe(Math.round(bare.maxHp * 1.12));
    // Health keeps its share of the bar.
    expect(p.hp).toBe(p.maxHp);
    equipRelic(p, undefined);
    expect(p.maxHp).toBe(bare.maxHp);
    expect(p.relic).toBeUndefined();
  });

  it("works on top of run boosts", () => {
    const w = quiet({ defId: "spinner_wheels", rarity: "rare" });
    const p = w.players[0]!;
    p.mods.speed *= 1.08; // Espresso.
    equipRelic(p, undefined);
    expect(p.mods.speed).toBeCloseTo(1.08, 9);
  });

  it("a Hard-Shell Case takes a share off every hit", () => {
    const w = quiet({ defId: "hard_case", rarity: "legendary" });
    const bare = quiet();
    const [a, b] = [w.players[0]!, bare.players[0]!];
    hurtPlayer(w, a, 20);
    hurtPlayer(bare, b, 20);
    expect(a.maxHp - a.hp).toBeCloseTo((b.maxHp - b.hp) * 0.92, 6);
  });

  it("picking one up with empty pockets takes it off the floor; with a relic, the old one stays there", () => {
    const w = quiet();
    const p = w.players[0]!;
    w.pickups.push({ id: 9001, kind: "relic", pos: { ...p.pos }, relic: { defId: "priority_tag", rarity: "epic" }, used: false });
    step(w, [input({ interact: true })]);
    expect(p.relic).toEqual({ defId: "priority_tag", rarity: "epic" });
    expect(w.pickups.some((k) => k.kind === "relic")).toBe(false);
    expect(w.events.some((e) => e.type === "relicPickup")).toBe(true);
    w.pickups.push({ id: 9002, kind: "relic", pos: { ...p.pos }, relic: { defId: "life_vest", rarity: "mythic" }, used: false });
    step(w, [EMPTY_INPUT]);
    step(w, [input({ interact: true })]);
    expect(p.relic!.defId).toBe("life_vest");
    expect(w.pickups.find((k) => k.id === 9002)!.relic).toEqual({ defId: "priority_tag", rarity: "epic" });
    // The dash cooldown bonus went with it.
    expect(p.mods.dashCd).toBeCloseTo(quiet().players[0]!.mods.dashCd, 9);
  });
});

describe("relics: mythic abilities", () => {
  it("Life Vest: once a room, a downing hit leaves you at 1 HP in a blast", () => {
    const w = quiet({ defId: "life_vest", rarity: "mythic" });
    const p = w.players[0]!;
    hurtPlayer(w, p, 9999);
    expect(p.downed).toBe(false);
    expect(p.hp).toBe(1);
    expect(p.iframes).toBeCloseTo(MYTHIC.vest.iframes, 6);
    expect(w.events.some((e) => e.type === "vest")).toBe(true);
    expect(w.events.some((e) => e.type === "explosion")).toBe(true);
    p.iframes = 0;
    hurtPlayer(w, p, 9999);
    expect(p.downed).toBe(true);
  });

  it("Noise-Cancelling Headphones: no shoves, no slush, no grabs", () => {
    const w = quiet({ defId: "headphones", rarity: "mythic" });
    const p = w.players[0]!;
    shovePlayer(p, { x: 300, y: 0 });
    expect(p.knock).toEqual({ x: 0, y: 0 });
    w.hazards.push({ id: 1, kind: "ice", owner: "enemy", ownerId: 0, pos: { ...p.pos }, radius: 30, t: 5, maxT: 5, damage: 0, tickT: 0 });
    step(w, [EMPTY_INPUT]);
    expect(p.slowT).toBe(0);
    const grabberId = Object.keys(ENEMIES).find((id) => ENEMIES[id]!.attacks.some((a) => a.type === "grab"))!;
    const atk = ENEMIES[grabberId]!.attacks.find((a) => a.type === "grab")! as Parameters<typeof tryGrab>[2];
    const e = spawnEnemy(w, grabberId, { x: p.pos.x - 12, y: p.pos.y }, 0);
    e.attackDir = { x: 1, y: 0 };
    p.iframes = 0;
    expect(tryGrab(w, e, atk)).toBe(false);
    expect(p.pinnedBy).toBe(0);
    // Without them, the same grab lands.
    const plain = quiet();
    const q = plain.players[0]!;
    const e2 = spawnEnemy(plain, grabberId, { x: q.pos.x - 12, y: q.pos.y }, 0);
    e2.attackDir = { x: 1, y: 0 };
    expect(tryGrab(plain, e2, atk)).toBe(true);
  });

  it("World Clock: a dash leaves enemies near where you started crawling, bosses less", () => {
    const w = quiet({ defId: "world_clock", rarity: "mythic" });
    const p = w.players[0]!;
    const boss = Object.keys(ENEMIES).find((id) => ENEMIES[id]!.boss)!;
    const near = spawnEnemy(w, "cone_rat", { x: p.pos.x - 30, y: p.pos.y }, 0);
    const big = spawnEnemy(w, boss, { x: p.pos.x, y: p.pos.y + 40 }, 0);
    const far = spawnEnemy(w, "cone_rat", { x: p.pos.x + 200, y: p.pos.y - 150 }, 0);
    step(w, [input({ dash: true, move: { x: 1, y: 0 } })]);
    expect(w.events.some((e) => e.type === "clock")).toBe(true);
    expect(near.slow).toBe(MYTHIC.clock.slow);
    expect(big.slow).toBe(MYTHIC.clock.bossSlow);
    expect(far.slow).toBe(0);
  });

  it("Plus-One: every grenade brings a second one", () => {
    const count = (relic?: Relic) => {
      const w = quiet(relic);
      step(w, [input({ grenade: true, grenadeAim: { x: 80, y: 0 } })]);
      return w.projectiles.filter((pr) => pr.kind === "grenade" && pr.owner === "player").map((pr) => pr.lob!.to);
    };
    expect(count().length).toBe(1);
    const two = count({ defId: "plus_one", rarity: "mythic" });
    expect(two.length).toBe(2);
    expect(Math.hypot(two[0]!.x - two[1]!.x, two[0]!.y - two[1]!.y)).toBeCloseTo(MYTHIC.plusOneSpread, 6);
  });
});

describe("relics: co-op wire", () => {
  it("players, pickups and pickup events carry their relics", () => {
    const w = quiet({ defId: "world_clock", rarity: "mythic" });
    w.pickups.push({ id: 5, kind: "relic", pos: { x: 100, y: 100 }, relic: { defId: "pressed_penny", rarity: "rare" }, used: false });
    const snap = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w, [], new Map())))).world;
    expect(snap.players[0]!.relic).toEqual({ defId: "world_clock", rarity: "mythic" });
    expect(snap.pickups[0]!.relic).toEqual({ defId: "pressed_penny", rarity: "rare" });
    const ev = { type: "relicPickup" as const, id: 3, relic: { defId: "hard_case", rarity: "epic" as const } };
    expect(decodeEvent(JSON.parse(JSON.stringify(encodeEvent(ev))))).toEqual(ev);
    // No relic stays no relic.
    expect(decodeSnapshot(encodeSnapshot(quiet(), [], new Map())).world.players[0]!.relic).toBeUndefined();
  });
});

describe("relics: progress", () => {
  it("new profiles have empty pockets, and old saves load that way", () => {
    expect(newProfile().relics).toEqual([]);
    expect(newProfile().relic).toBe("");
    const old = cleanProfile({ name: "OLD", stash: [] });
    expect([old.relics, old.relic]).toEqual([[], ""]);
    expect(playerOptions(old).relic).toBeUndefined();
  });

  it("the relic in your pocket comes home, stays equipped, and starts the next run", () => {
    let p = newProfile("Cy");
    const w = createWorld({ seed: 5, players: [playerOptions(p)] });
    const me = w.players[0]!;
    expect(runResult(w, me, { mode: "solo", day: "2026-10-10" }).relics).toEqual([]);
    equipRelic(me, { defId: "headphones", rarity: "mythic" });
    const r = runResult(w, me, { mode: "solo", day: "2026-10-10", newId: () => "rel1" });
    expect(r.relics).toMatchObject([{ id: "rel1", defId: "headphones", rarity: "mythic" }]);
    const { profile, reward } = act(p, { type: "run", id: "x", result: r });
    p = profile;
    expect(reward!.relics).toBe(1);
    expect(reward!.mythics).toBe(1);
    expect(p.relic).toBe("rel1");
    expect(createWorld({ seed: 6, players: [playerOptions(p)] }).players[0]!.relic).toEqual({ defId: "headphones", rarity: "mythic", sid: "rel1" });
    // Replaying doesn't duplicate it.
    expect(act(p, { type: "run", id: "y", result: r }).profile.relics.length).toBe(1);
  });

  it("equips, takes off and scraps relics, never the equipped one", () => {
    let p = newProfile();
    p.relics.push({ id: "r1", defId: "energy_drink", rarity: "rare" }, { id: "r2", defId: "hard_case", rarity: "common" });
    p = act(p, { type: "equipRelic", id: "e1", relicId: "r1" }).profile;
    expect(p.relic).toBe("r1");
    expect(act(p, { type: "equipRelic", id: "e2", relicId: "nope" }).profile.relic).toBe("r1");
    const r = act(p, { type: "scrap", id: "s1", gunIds: [], relicIds: ["r1", "r2"] });
    expect(r.xp).toBe(SCRAP_XP.common);
    expect(r.profile.relics.map((x) => x.id)).toEqual(["r1"]);
    expect(act(p, { type: "equipRelic", id: "e3", relicId: "" }).profile.relic).toBe("");
  });

  it("a full relic stash scraps its worst unequipped relics", () => {
    const p = newProfile();
    for (let i = 0; i < RELIC_CAP; i++) p.relics.push({ id: `r${i}`, defId: "neck_pillow", rarity: i === 0 ? "common" : "rare" });
    const base = { mode: "solo" as const, heroId: "vanguard", tier: 0, victory: false, rooms: 3, kills: 10, guns: [], hand: [], day: "" };
    const r = act(p, { type: "run", id: "r", result: { ...base, relic: { id: "new", defId: "pressed_penny", rarity: "epic" }, relicHand: "new" } });
    expect(r.profile.relics.length).toBe(RELIC_CAP);
    expect(r.profile.relics.some((x) => x.id === "r0")).toBe(false);
    expect(r.profile.relic).toBe("new");
  });

  it("only mythic kinds are mythic, and unknown kinds are dropped", () => {
    expect(cleanRelic({ id: "a", defId: "life_vest", rarity: "common" })!.rarity).toBe("mythic");
    expect(cleanRelic({ id: "b", defId: "neck_pillow", rarity: "mythic" })!.rarity).toBe("common");
    expect(cleanRelic({ id: "c", defId: "rubber_duck", rarity: "rare" })).toBeUndefined();
    // An equipped id that isn't in the stash empties the pocket.
    expect(cleanProfile({ relics: [], relic: "ghost" }).relic).toBe("");
  });
});

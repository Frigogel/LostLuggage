import { describe, expect, it } from "vitest";
import {
  applyAction,
  cleanProfile,
  createWorld,
  decodeEvent,
  decodeSnapshot,
  EMPTY_INPUT,
  encodeEvent,
  encodeSnapshot,
  GRENADE_IDS,
  GRENADES,
  grenadeStats,
  gunDps,
  gunName,
  gunStats,
  MYTHIC,
  MYTHIC_GRENADE_IDS,
  MYTHIC_GUN_IDS,
  MYTHIC_GUNS,
  mythicChance,
  newProfile,
  playerOptions,
  rollGrenade,
  rollGun,
  rollMythic,
  step,
  type PlayerInput,
  type RunResult,
  type SimEvent,
  type World,
} from "../src";
import { damageEnemy, dropMythic, hurtPlayer, spawnEnemy } from "../src/combat";
import { gunFromData } from "../src/loot";
import { cleanGrenade, cleanGun, SCRAP_XP } from "../src/progress";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });

/** Steps the world, returning every event along the way (each step clears the last one's). */
function run(w: World, ticks: number, inp: PlayerInput = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    step(w, [inp]);
    events.push(...w.events);
  }
  return events;
}

function quiet(seed = 1): World {
  const w = createWorld({ seed });
  w.run.room.waves = [];
  w.run.room.vents = [];
  w.run.room.cleared = true;
  w.run.victory = true;
  w.enemies = [];
  w.pickups = [];
  return w;
}

const mythicGun = (w: World, id: string) => {
  const def = MYTHIC_GUNS[id]!;
  return gunFromData(w, { defId: def.defId, rarity: "mythic", element: "none", perks: [], maker: def.maker, mythic: id });
};

describe("mythics: power", () => {
  it("a mythic gun hits MYTHIC.damage times harder than a legendary of the same gun, and fires the same", () => {
    const w = quiet();
    for (const id of MYTHIC_GUN_IDS) {
      const g = mythicGun(w, id);
      const legendary = { ...g, rarity: "legendary" as const, mythic: undefined };
      expect(gunDps(g)).toBeCloseTo(gunDps(legendary) * MYTHIC.damage, 6);
      expect(gunStats(g).reloadMs).toBe(gunStats(legendary).reloadMs);
      expect(gunName(g)).toBe(MYTHIC_GUNS[id]!.name);
    }
  });

  it("a mythic grenade hits MYTHIC.damage times harder than a legendary one, with the same radius and cooldown", () => {
    for (const id of MYTHIC_GRENADE_IDS) {
      const m = grenadeStats({ defId: id, rarity: "mythic" });
      const l = grenadeStats({ defId: id, rarity: "legendary" });
      expect(m.damage).toBeCloseTo(l.damage * MYTHIC.damage, 6);
      expect([m.radius, m.cooldown]).toEqual([l.radius, l.cooldown]);
    }
  });

  it("never come from the regular rolls, however lucky", () => {
    const w = quiet();
    for (let i = 0; i < 2000; i++) {
      expect(rollGun(w, 5).rarity).not.toBe("mythic");
      expect(rollGrenade(w, 5).rarity).not.toBe("mythic");
    }
    for (const id of MYTHIC_GRENADE_IDS) {
      expect(GRENADE_IDS).not.toContain(id);
      expect(GRENADES[id]!.mythic).toBeDefined();
    }
  });

  it("are rare, better on harder tiers, when helping someone newer, and after a dry spell", () => {
    const base = mythicChance(0, true, false);
    expect(base).toBe(MYTHIC.bossChance);
    expect(mythicChance(2, true, false)).toBeCloseTo(base * 2.5, 9);
    expect(mythicChance(0, true, true)).toBeCloseTo(base * 2, 9);
    expect(mythicChance(0, true, false, 100)).toBeCloseTo(base * 2, 9);
    expect(mythicChance(0, false, false)).toBeLessThan(base);
    // Even Nightmare, helping, after 100 dry bosses is still under one in twenty.
    expect(mythicChance(2, true, true, 100)).toBeLessThan(0.05);
  });

  it("rolls every mythic, and drops them as pickups with a mythic loot beam", () => {
    const w = quiet();
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const m = rollMythic(w);
      if ("gun" in m) {
        expect(m.gun.rarity).toBe("mythic");
        expect(m.gun.perks.length).toBe(1);
        seen.add(m.gun.mythic!);
      } else {
        expect(m.grenade.rarity).toBe("mythic");
        seen.add(m.grenade.defId);
      }
    }
    expect([...seen].sort()).toEqual([...MYTHIC_GUN_IDS, ...MYTHIC_GRENADE_IDS].sort());
    dropMythic(w, { x: 200, y: 150 });
    expect(w.pickups.length).toBe(1);
    expect(w.events.some((e) => e.type === "loot" && e.rarity === "mythic")).toBe(true);
  });
});

describe("mythics: the abilities", () => {
  it("Return to Sender bats enemy shots back at the shooter", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "return_to_sender");
    const shooter = spawnEnemy(w, "jet_boar", { x: p.pos.x + 160, y: p.pos.y }, 0);
    shooter.cooldowns = shooter.cooldowns.map(() => 99);
    w.projectiles.push({
      id: 9001, owner: "enemy", ownerId: shooter.id, kind: "bolt", element: "none", pos: { x: p.pos.x + 60, y: p.pos.y }, vel: { x: -60, y: 0 },
      radius: 3, damage: 5, pierce: 0, bounces: 0, knockback: 0, life: 5, hitIds: [], gunUid: -1,
    });
    const events = run(w, 1, input({ fire: true, aim: { x: 60, y: 0 } }));
    events.push(...run(w, 10));
    const bolt = w.projectiles.find((pr) => pr.id === 9001);
    // Either it's flying back as ours, or it already hit the shooter.
    expect(!bolt || bolt.owner === "player").toBe(true);
    expect(p.hp).toBe(p.maxHp);
    expect(events.some((e) => e.type === "reflect")).toBe(true);
  });

  it("Customs Officer confiscates an elite's modifier, so a Vengeful elite dies quietly", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "customs_officer");
    const e = spawnEnemy(w, "jet_boar", { x: p.pos.x + 50, y: p.pos.y }, 0, "vengeful");
    e.cooldowns = e.cooldowns.map(() => 99);
    e.shield = 20;
    const events = [...run(w, 1, input({ fire: true, aim: { x: 50, y: 0 } })), ...run(w, 6)];
    expect(e.elite).toBeUndefined();
    expect(e.shield).toBe(0);
    expect(events.some((ev) => ev.type === "confiscate")).toBe(true);
    damageEnemy(w, e, 99999, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: p.id, element: "none" });
    expect(w.projectiles.some((pr) => pr.kind === "doom")).toBe(false);
  });

  it("Customs Officer unlinks a Linked pair, so the twin never comes back", () => {
    const w = quiet();
    const a = spawnEnemy(w, "jet_boar", { x: 100, y: 100 }, 0, "linked");
    const b = spawnEnemy(w, "jet_boar", { x: 300, y: 100 }, 0, "linked");
    a.link = b.id;
    b.link = a.id;
    w.projectiles.push({
      id: 9002, owner: "player", ownerId: w.players[0]!.id, kind: "pistol", element: "none", pos: { x: 90, y: 100 }, vel: { x: 300, y: 0 },
      radius: 2, damage: 1, pierce: 0, bounces: 0, knockback: 0, life: 1, hitIds: [], gunUid: -1, confiscate: true,
    });
    run(w, 3);
    expect(a.elite).toBeUndefined();
    expect(b.link).toBe(0);
    damageEnemy(w, b, 99999, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: w.players[0]!.id, element: "none" });
    expect(a.linkT).toBe(0);
  });

  it("Snooze Button puts enemies to sleep until something hits them; bosses only nod off", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.grenade = { defId: "snooze_button", rarity: "mythic" };
    const e = spawnEnemy(w, "jet_boar", { x: p.pos.x + 70, y: p.pos.y }, 0);
    const boss = spawnEnemy(w, "furnace_foreman", { x: p.pos.x + 80, y: p.pos.y + 10 }, 0);
    step(w, [input({ grenade: true, grenadeAim: { x: 72, y: 0 } })]);
    run(w, 30);
    expect(e.sleepT).toBeGreaterThan(MYTHIC.sleepS - 2);
    expect(boss.sleepT).toBe(0);
    const at = { ...e.pos };
    run(w, 30);
    expect(e.pos.x).toBeCloseTo(at.x, 3);
    damageEnemy(w, e, 1, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: p.id, element: "none" });
    expect(e.sleepT).toBe(0);
  });

  it("Black Box rewinds health, brings the downed back up, and holds off the wipe while it counts", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.selfRevives = 0;
    p.grenade = { defId: "black_box", rarity: "mythic" };
    step(w, [input({ grenade: true, grenadeAim: { x: 4, y: 0 } })]);
    run(w, 5);
    expect(w.hazards.some((h) => h.kind === "rewind")).toBe(true);
    p.iframes = 0;
    hurtPlayer(w, p, 99999);
    expect(p.downed).toBe(true);
    run(w, 30);
    expect(w.gameOver).toBe(false);
    const events = run(w, MYTHIC.rewindS * 30);
    expect(p.downed).toBe(false);
    expect(p.hp).toBe(p.maxHp);
    expect(events.some((e) => e.type === "rewound")).toBe(true);
  });

  it("go over the wire: guns, grenades, sleep and the new events", () => {
    const w = createWorld({ seed: 3, coop: true, players: [{ name: "Ana" }, { name: "Bo" }] });
    w.players[0]!.guns[0] = mythicGun(w, "customs_officer");
    w.players[1]!.grenade = { defId: "black_box", rarity: "mythic" };
    const e = spawnEnemy(w, "jet_boar", { x: 200, y: 150 }, 0);
    e.sleepT = 5;
    const d = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w, [], new Map())))).world;
    expect(d.players[0]!.guns[0]).toMatchObject({ rarity: "mythic", mythic: "customs_officer" });
    expect(d.players[1]!.grenade).toEqual({ defId: "black_box", rarity: "mythic" });
    expect(d.enemies.find((q) => q.id === e.id)!.sleepT).toBeCloseTo(5, 1);
    for (const ev of [{ type: "confiscate", id: 4, x: 10, y: 20 }, { type: "asleep", id: 4 }, { type: "rewound", id: 2, by: 1 }] as const) {
      expect(decodeEvent(JSON.parse(JSON.stringify(encodeEvent(ev))))).toEqual(ev);
    }
  });
});

describe("mythics: coming home", () => {
  const result = (over: Partial<RunResult> = {}): RunResult => ({ mode: "solo", heroId: "vanguard", tier: 0, victory: false, rooms: 7, acts: 1, kills: 100, guns: [], hand: [], day: "2026-10-10", ...over });

  it("a mythic is always the real thing, and nothing else can claim to be one", () => {
    expect(cleanGun({ id: "a", defId: "smg", element: "fire", rarity: "common", perks: [], maker: "wizard", mythic: "return_to_sender" })).toMatchObject({ defId: "shotgun", maker: "goblin", rarity: "mythic", mythic: "return_to_sender" });
    expect(cleanGun({ id: "b", defId: "smg", element: "fire", rarity: "mythic", perks: [], maker: "wizard" })!.rarity).toBe("common");
    expect(cleanGrenade({ id: "c", defId: "snooze_button", rarity: "common" })!.rarity).toBe("mythic");
    expect(cleanGrenade({ id: "d", defId: "frag", rarity: "mythic" })!.rarity).toBe("common");
    expect(SCRAP_XP.mythic).toBeGreaterThan(SCRAP_XP.legendary);
  });

  it("bosses without a mythic build up pity, solo too; one coming home resets it", () => {
    let p = newProfile("Ana");
    p = applyAction(p, { type: "run", id: "r1", result: result({ acts: 3 }) }).profile;
    expect(p.mythicPity).toBe(3);
    expect(playerOptions(p).mythicPity).toBe(3);
    const nade = { id: "m1", defId: "black_box", rarity: "mythic" as const, new: true };
    const got = applyAction(p, { type: "run", id: "r2", result: result({ acts: 2, grenade: nade, grenadeHand: "m1" }) });
    expect(got.reward!.mythics).toBe(1);
    expect(got.profile.mythicPity).toBe(0);
    expect(got.profile.stats.mythics).toBe(1);
    expect(cleanProfile(JSON.parse(JSON.stringify(got.profile))).stats.mythics).toBe(1);
  });

  it("pity reaches the sim, so a long dry spell really does help", () => {
    const w = createWorld({ seed: 9, players: [{ mythicPity: 200 }] });
    expect(w.players[0]!.mythicPity).toBe(200);
  });
});

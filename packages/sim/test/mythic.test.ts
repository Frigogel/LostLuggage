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
  type Player,
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

  it("Return to Sender bats a lobbed shell back onto whoever lobbed it", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "return_to_sender");
    const beetle = spawnEnemy(w, "mortar_beetle", { x: p.pos.x + 200, y: p.pos.y }, 0);
    beetle.cooldowns = beetle.cooldowns.map(() => 99);
    const from = { ...beetle.pos };
    w.projectiles.push({
      id: 9003, owner: "enemy", ownerId: beetle.id, kind: "mortar", element: "none", pos: { x: p.pos.x + 40, y: p.pos.y }, vel: { x: 0, y: 0 },
      radius: 4, damage: 12, pierce: 0, bounces: 0, knockback: 0, life: 99, hitIds: [], gunUid: -1,
      lob: { from, to: { ...p.pos }, t: 0.8, dur: 1, radius: 20 },
    });
    const events = run(w, 1, input({ fire: true, aim: { x: 40, y: 0 } }));
    events.push(...run(w, 40));
    expect(events.some((e) => e.type === "reflect")).toBe(true);
    expect(p.hp).toBe(p.maxHp);
    expect(beetle.hp).toBeLessThan(beetle.maxHp);
  });

  it("Return to Sender sends a charging enemy back the way it came, stunned", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "return_to_sender");
    const boar = spawnEnemy(w, "jet_boar", { x: p.pos.x + 60, y: p.pos.y }, 0);
    boar.hp = boar.maxHp = 99999;
    boar.state = "attack";
    boar.attackIdx = 0;
    boar.stateT = 1;
    boar.attackDir = { x: -1, y: 0 };
    const events = run(w, 1, input({ fire: true, aim: { x: 60, y: 0 } }));
    events.push(...run(w, 2));
    expect(boar.state).toBe("recover");
    expect(events.some((e) => e.type === "bonk" && e.id === boar.id)).toBe(true);
    const at = boar.pos.x;
    run(w, 6);
    // Shoved back away from the player, not still coming.
    expect(boar.pos.x).toBeGreaterThan(at);
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

  it("In-Flight Service heals the allies its shots pass through, and keeps going", () => {
    const w = createWorld({ seed: 4, coop: true, players: [{ name: "Ana" }, { name: "Bo" }] });
    w.run.room.waves = [];
    w.enemies = [];
    const [a, b] = w.players as [Player, Player];
    a.guns[0] = mythicGun(w, "in_flight_service");
    b.pos = { x: a.pos.x + 40, y: a.pos.y };
    b.hp = 20;
    for (let i = 0; i < 20; i++) step(w, [input({ fire: true, aim: { x: 40, y: 0 } }), EMPTY_INPUT]);
    expect(b.hp).toBeGreaterThan(20);
  });

  it("In-Flight Service kills sometimes drop a snack", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "in_flight_service");
    for (let i = 0; i < 40; i++) {
      const e = spawnEnemy(w, "cone_rat", { x: 200, y: 150 }, 0);
      damageEnemy(w, e, 99999, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: p.id, element: "none", gunUid: p.guns[0]!.uid });
    }
    expect(w.pickups.filter((k) => k.kind === "heal" && k.heal === MYTHIC.snackHeal).length).toBeGreaterThan(3);
  });

  it("Excess Baggage raises its kills as ghosts that bite enemies (never bosses, at most three)", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "excess_baggage");
    const kill = (defId: string) => {
      const e = spawnEnemy(w, defId, { x: p.pos.x + 80, y: p.pos.y }, 0);
      damageEnemy(w, e, 999999, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: p.id, element: "none", gunUid: p.guns[0]!.uid });
    };
    kill("jet_boar");
    expect(w.gadgets.filter((g) => g.kind === "ghost").map((g) => g.defId)).toEqual(["jet_boar"]);
    for (let i = 0; i < 4; i++) kill("cone_rat");
    step(w, [EMPTY_INPUT]);
    expect(w.gadgets.filter((g) => g.kind === "ghost").length).toBe(MYTHIC.ghost.max);
    kill("furnace_foreman");
    step(w, [EMPTY_INPUT]);
    expect(w.gadgets.some((g) => g.defId === "furnace_foreman")).toBe(false);
    const prey = spawnEnemy(w, "slag_golem", { x: p.pos.x + 120, y: p.pos.y }, 0);
    prey.cooldowns = prey.cooldowns.map(() => 99);
    run(w, 60);
    expect(prey.hp).toBeLessThan(prey.maxHp);
  });

  it("Boarding Pass swaps you with the teammate it reaches", () => {
    const w = createWorld({ seed: 5, coop: true, players: [{ name: "Ana" }, { name: "Bo" }] });
    w.run.room.waves = [];
    w.enemies = [];
    const [a, b] = w.players as [Player, Player];
    a.guns[0] = mythicGun(w, "boarding_pass");
    b.pos = { x: a.pos.x + 90, y: a.pos.y };
    const was = { ...a.pos };
    const there = { ...b.pos };
    // Something has Bo cornered: Ana arrives in a blast that hits it.
    const bully = spawnEnemy(w, "slag_golem", { x: b.pos.x + 25, y: b.pos.y }, 0);
    bully.hp = bully.maxHp = 99999;
    bully.cooldowns = bully.cooldowns.map(() => 99);
    for (let i = 0; i < 30; i++) step(w, [input({ fire: i === 0, aim: { x: 90, y: 0 } }), EMPTY_INPUT]);
    expect(a.pos.x).toBeCloseTo(there.x, 0);
    expect(b.pos.x).toBeCloseTo(was.x, 0);
    expect(b.shield).toBeGreaterThan(0);
    expect(bully.hp).toBeLessThan(bully.maxHp);
  });

  it("Boarding Pass swaps you with an enemy, but not a boss", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = mythicGun(w, "boarding_pass");
    const e = spawnEnemy(w, "slag_golem", { x: p.pos.x + 90, y: p.pos.y }, 0);
    e.hp = e.maxHp = 99999;
    e.cooldowns = e.cooldowns.map(() => 99);
    const was = { ...p.pos };
    run(w, 1, input({ fire: true, aim: { x: 90, y: 0 } }));
    let swap: SimEvent | undefined;
    for (let i = 0; i < 30 && !swap; i++) swap = run(w, 1).find((ev) => ev.type === "swapped");
    // The moment it lands: you're where the golem stood (it had been walking at you), and it's where you stood.
    expect(swap).toMatchObject({ id: p.id, other: e.id, x1: was.x, y1: was.y });
    expect(p.pos.x).toBeGreaterThan(was.x + 30);
    expect(Math.abs(e.pos.x - was.x)).toBeLessThan(3);
    // Jet-lagged, caught in the blast, and the shot came back.
    expect(e.stunT).toBeGreaterThan(MYTHIC.swap.stunS - 0.2);
    expect(e.maxHp - e.hp).toBeGreaterThan(gunStats(p.guns[0]!).damage * 1.3);
    expect(p.guns[0]!.pips).toBeCloseTo(gunStats(p.guns[0]!).pips, 0);

    const v = quiet();
    const q = v.players[0]!;
    q.guns[0] = mythicGun(v, "boarding_pass");
    const boss = spawnEnemy(v, "furnace_foreman", { x: q.pos.x + 90, y: q.pos.y }, 0);
    boss.cooldowns = boss.cooldowns.map(() => 99);
    const at = { ...q.pos };
    expect(run(v, 30, input({ fire: true, aim: { x: 90, y: 0 } })).some((ev) => ev.type === "swapped")).toBe(false);
    expect(q.pos).toEqual(at);
  });

  it("Lost & Found misplaces enemies, then they turn up dazed; bosses only stagger", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.grenade = { defId: "lost_and_found", rarity: "mythic" };
    const e = spawnEnemy(w, "jet_boar", { x: p.pos.x + 70, y: p.pos.y }, 0);
    const boss = spawnEnemy(w, "furnace_foreman", { x: p.pos.x + 80, y: p.pos.y + 10 }, 0);
    run(w, 1, input({ grenade: true, grenadeAim: { x: 72, y: 0 } }));
    run(w, 30);
    expect(e.lost).toBe(true);
    expect(boss.lost).toBe(false);
    // Gone: nothing can hit it.
    damageEnemy(w, e, 5, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: p.id, element: "none" });
    const events = run(w, MYTHIC.lostS * 30);
    expect(e.lost).toBe(false);
    expect(events.some((ev) => ev.type === "found" && ev.id === e.id)).toBe(true);
    expect(e.stunT).toBeGreaterThan(0);
  });

  it("Duty Free: tagged enemies that die drop an extra gun", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.grenade = { defId: "duty_free", rarity: "mythic" };
    const tagged = spawnEnemy(w, "slag_golem", { x: p.pos.x + 70, y: p.pos.y }, 0);
    tagged.hp = tagged.maxHp = 99999;
    tagged.cooldowns = tagged.cooldowns.map(() => 99);
    run(w, 1, input({ grenade: true, grenadeAim: { x: 72, y: 0 } }));
    run(w, 30);
    expect(tagged.dutyT).toBeGreaterThan(0);
    const before = w.pickups.filter((k) => k.kind === "gun").length;
    damageEnemy(w, tagged, 999999, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: p.id, element: "none" });
    expect(w.pickups.filter((k) => k.kind === "gun").length).toBeGreaterThan(before);
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
    e.lost = true;
    e.dutyT = 3;
    w.gadgets.push({ id: 777, kind: "ghost", ownerId: w.players[0]!.id, pos: { x: 100, y: 100 }, t: 5, maxT: 8, hp: 1, maxHp: 1, element: "none", fireCd: 0, tickT: 0, mini: false, saved: false, defId: "jet_boar" });
    const d2 = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w, [], new Map())))).world;
    expect(d2.enemies.find((q) => q.id === e.id)).toMatchObject({ lost: true });
    expect(d2.enemies.find((q) => q.id === e.id)!.dutyT).toBeCloseTo(3, 1);
    expect(d2.gadgets.find((g) => g.id === 777)).toMatchObject({ kind: "ghost", defId: "jet_boar" });
    for (const ev of [
      { type: "confiscate", id: 4, x: 10, y: 20 },
      { type: "asleep", id: 4 },
      { type: "rewound", id: 2, by: 1 },
      { type: "misplaced", id: 4, x: 10, y: 20 },
      { type: "found", id: 4 },
      { type: "swapped", id: 2, other: 4, x1: 1, y1: 2, x2: 3, y2: 4 },
    ] as const) {
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

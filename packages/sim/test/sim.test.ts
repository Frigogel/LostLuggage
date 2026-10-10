import { describe, expect, it } from "vitest";
import { createWorld, EMPTY_INPUT, ENEMIES, GUNS, gunDps, gunName, gunStats, LEGENDARIES, MAKER_IDS, planRun, planWave, rollGun, step, type PlayerInput, type World } from "../src";
import { damageEnemy, spawnEnemy } from "../src/combat";
import { newGun } from "../src/loot";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });

function run(w: World, ticks: number, inp: PlayerInput = EMPTY_INPUT) {
  for (let i = 0; i < ticks; i++) step(w, [inp]);
}

/** A world with no waves, vents, props or pickups, for testing one mechanic at a time. */
function quiet(seed = 1): World {
  const w = createWorld({ seed });
  w.run.room.waves = [];
  w.run.room.vents = [];
  w.run.room.cleared = true;
  w.run.victory = true; // keeps the exit shut
  w.enemies = [];
  w.pickups = [];
  return w;
}

const hit = (w: World, e: ReturnType<typeof spawnEnemy>, dmg: number, element: "none" | "fire" | "shock" | "frost" | "acid") =>
  damageEnemy(w, e, dmg, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: w.players[0]!.id, element });

describe("core", () => {
  it("is deterministic for the same seed and inputs", () => {
    const a = createWorld({ seed: 42 });
    const b = createWorld({ seed: 42 });
    const inp = input({ move: { x: 1, y: -0.3 }, fire: true, autoAim: true });
    run(a, 900, inp);
    run(b, 900, inp);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("spends one pip per trigger pull and reloads over time", () => {
    const w = quiet();
    const p = w.players[0]!;
    step(w, [input({ fire: true, aim: { x: 50, y: 0 } })]);
    expect(p.guns[0]!.pips).toBeCloseTo(2, 0);
    run(w, 60);
    expect(p.guns[0]!.pips).toBe(gunStats(p.guns[0]!).pips);
  });

  it("dash grants i-frames against a lobbed hit", () => {
    const w = quiet(3);
    const p = w.players[0]!;
    w.projectiles.push({
      id: 999, owner: "enemy", ownerId: 0, kind: "mortar", element: "none", pos: { ...p.pos }, vel: { x: 0, y: 0 },
      radius: 4, damage: 15, pierce: 0, bounces: 0, knockback: 0, life: 99, hitIds: [], gunUid: -1,
      lob: { from: { ...p.pos }, to: { ...p.pos }, t: 0, dur: 2 / 30, radius: 20 },
    });
    step(w, [input({ dash: true, move: { x: 1, y: 0 } })]);
    step(w, [EMPTY_INPUT]);
    expect(p.hp).toBe(p.maxHp);
  });

  it("downs the player once, self-revives, then ends the run", () => {
    const w = quiet(5);
    const p = w.players[0]!;
    const rat = spawnEnemy(w, "cone_rat", { x: p.pos.x + 8, y: p.pos.y }, 0);
    rat.hp = 1e9;
    p.hp = 1;
    run(w, 70);
    expect(p.downed).toBe(true);
    run(w, 100);
    expect(p.downed).toBe(false);
    p.hp = 1;
    run(w, 300);
    expect(w.gameOver).toBe(true);
  });

  it("sniper pierces through a line of enemies", () => {
    const w = quiet(7);
    const p = w.players[0]!;
    p.guns[0] = newGun(w, "sniper");
    for (let i = 0; i < 3; i++) spawnEnemy(w, "jet_boar", { x: p.pos.x + 40 + i * 30, y: p.pos.y }, 0);
    step(w, [input({ fire: true, aim: { x: 200, y: 0 } })]);
    run(w, 20);
    expect(w.enemies.every((e) => e.hp < e.maxHp)).toBe(true);
  });
});

describe("elements and defenses", () => {
  it("fire is strong vs flesh, weak vs armor, nearly useless vs fire-immune", () => {
    const w = quiet();
    const rat = spawnEnemy(w, "cone_rat", { x: 100, y: 100 }, 0);
    const boar = spawnEnemy(w, "jet_boar", { x: 200, y: 100 }, 0);
    const golem = spawnEnemy(w, "slag_golem", { x: 300, y: 100 }, 0);
    rat.hp = boar.hp = golem.hp = 1000;
    hit(w, rat, 10, "fire");
    hit(w, boar, 10, "fire");
    hit(w, golem, 10, "fire");
    expect(1000 - rat.hp).toBeCloseTo(15);
    expect(1000 - boar.hp).toBeCloseTo(7.5);
    expect(1000 - golem.hp).toBeCloseTo(2.5);
    expect(rat.status.burnT).toBeGreaterThan(0);
    expect(golem.status.burnT).toBe(0);
  });

  it("shock strips support shields twice as fast and chains to a neighbour", () => {
    const w = quiet();
    const a = spawnEnemy(w, "jet_boar", { x: 100, y: 100 }, 0);
    const b = spawnEnemy(w, "jet_boar", { x: 130, y: 100 }, 0);
    a.shield = 20;
    // 15 shock vs armor = 13.5, doubled against the shield = 27: breaks it and 3.5 spills into health.
    hit(w, a, 15, "shock");
    expect(a.shield).toBe(0);
    expect(a.maxHp - a.hp).toBeCloseTo(3.5);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it("frost stacks into a freeze, but never freezes a boss", () => {
    const w = quiet();
    const boar = spawnEnemy(w, "jet_boar", { x: 100, y: 100 }, 0);
    const boss = spawnEnemy(w, "furnace_foreman", { x: 300, y: 100 }, 0);
    for (let i = 0; i < 6; i++) {
      hit(w, boar, 12, "frost");
      hit(w, boss, 12, "frost");
    }
    expect(boar.status.frozenT).toBeGreaterThan(0);
    expect(boss.status.frozenT).toBe(0);
    expect(boss.status.frost).toBeLessThanOrEqual(3);
  });

  it("acid breaks armor so everything hits harder", () => {
    const w = quiet();
    const boar = spawnEnemy(w, "jet_boar", { x: 100, y: 100 }, 0);
    boar.hp = 1000;
    hit(w, boar, 10, "acid");
    const before = boar.hp;
    hit(w, boar, 10, "none");
    expect(before - boar.hp).toBeCloseTo(12.5);
  });
});

describe("enemies", () => {
  it("splitters split into children on death", () => {
    const w = quiet();
    const blob = spawnEnemy(w, "molten_blob", { x: 200, y: 200 }, 0);
    hit(w, blob, 999, "none");
    run(w, 1);
    expect(w.enemies.filter((e) => e.defId === "blobling").length).toBe(3);
  });

  it("supports shield their allies", () => {
    const w = quiet();
    const p = w.players[0]!;
    const wiz = spawnEnemy(w, "hover_wizard", { x: p.pos.x, y: p.pos.y - 150 }, 0);
    const boar = spawnEnemy(w, "jet_boar", { x: p.pos.x + 30, y: p.pos.y - 150 }, 0);
    wiz.cooldowns = [0, 99];
    run(w, 50);
    expect(boar.shield).toBeGreaterThan(0);
  });

  it("ambushers hide until you get close", () => {
    const w = quiet();
    const p = w.players[0]!;
    const mimic = spawnEnemy(w, "vending_mimic", { x: p.pos.x + 120, y: p.pos.y }, 0);
    run(w, 30);
    expect(mimic.state).toBe("hidden");
    run(w, 30, input({ move: { x: 1, y: 0 } }));
    expect(mimic.state).not.toBe("hidden");
  });

  it("summoners respect their cap", () => {
    const w = quiet();
    spawnEnemy(w, "rat_crate", { x: 200, y: 100 }, 0);
    const p = w.players[0]!;
    p.iframes = 1e9;
    run(w, 30 * 40);
    expect(w.enemies.filter((e) => e.defId === "cone_rat").length).toBeLessThanOrEqual(ENEMIES.rat_crate!.attacks[0]!.type === "summon" ? 5 : 0);
  });
});

describe("loot", () => {
  it("rarity adds perks but at most ~10% raw stats", () => {
    const w = quiet();
    for (let i = 0; i < 200; i++) {
      const g = rollGun(w, 2);
      // Same gun from the same maker, as a plain common: rarity alone may add at most 10%.
      const base = newGun(w, g.defId, "common", "none", [], g.maker);
      expect(gunStats({ ...g, element: "none" }).damage / gunStats(base).damage).toBeLessThanOrEqual(1.1 + 1e-9);
    }
  });

  it("every legendary is a named gun with its own effect", () => {
    const w = quiet();
    const names = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const g = rollGun(w, 0, "legendary");
      const def = LEGENDARIES[g.legendary!]!;
      expect(def).toBeDefined();
      expect(g.defId).toBe(def.defId);
      expect(g.maker).toBe(def.maker);
      expect(g.perks.length).toBe(2);
      names.add(gunName(g));
    }
    expect(names.size).toBe(Object.keys(LEGENDARIES).length);
  });

  it("manufacturers change the feel, not the power: sustained DPS stays within a narrow band", () => {
    const w = quiet();
    for (const defId of Object.keys(GUNS)) {
      const cruise = gunDps(newGun(w, defId));
      for (const maker of MAKER_IDS) {
        const ratio = gunDps(newGun(w, defId, "common", "none", [], maker)) / cruise;
        expect(ratio, `${maker} ${defId}`).toBeGreaterThan(0.8);
        expect(ratio, `${maker} ${defId}`).toBeLessThan(1.25);
      }
    }
    // And each has its quirk.
    expect(gunStats(newGun(w, "pistol", "common", "none", [], "dwarfcorp")).pips).toBe(2);
    expect(gunStats(newGun(w, "pistol", "common", "none", [], "megamart")).pips).toBe(6);
    expect(gunStats(newGun(w, "pistol", "common", "none", [], "goblin")).pellets).toBe(3);
    expect(gunStats(newGun(w, "pistol", "common", "none", [], "wizard")).homing).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) {
      const g = rollGun(w, 1);
      // (Mood Ring is the exception: it cycles through every element.)
      if (g.maker === "arcane" && !g.legendary) expect(g.element).not.toBe("none");
      expect(g.maker).not.toBe("cruise");
    }
  });

  it("suitcases open with the pickup button and drop two guns", () => {
    const w = quiet();
    const p = w.players[0]!;
    w.pickups.push({ id: 5000, kind: "chest", pos: { ...p.pos }, used: false });
    run(w, 30);
    // Standing on it does nothing: the pickup button opens it.
    expect(w.pickups.filter((k) => k.kind === "gun").length).toBe(0);
    step(w, [input({ interact: true })]);
    expect(w.pickups.filter((k) => k.kind === "gun").length).toBe(2);
  });
});

describe("director and run", () => {
  it("plans intro, combat, breather, combat, boss", () => {
    const w = createWorld({ seed: 11 });
    expect(planRun(w, 0).map((r) => r.kind)).toEqual(["intro", "combat", "breather", "combat", "boss"]);
  });

  it("respects role caps and stays near budget", () => {
    const w = createWorld({ seed: 13 });
    for (let i = 0; i < 300; i++) {
      const plan = planWave(w, 20);
      const all = [...plan.enemies, ...plan.props];
      const roles = all.map((id) => ENEMIES[id]!.role);
      expect(roles.filter((r) => r === "support").length).toBeLessThanOrEqual(1);
      expect(roles.filter((r) => r === "artillery").length).toBeLessThanOrEqual(2);
      const cost = all.reduce((s, id) => s + ENEMIES[id]!.threatCost, 0);
      expect(cost).toBeLessThanOrEqual(21);
      expect(cost).toBeGreaterThanOrEqual(12);
    }
  });

  it("can be played from first room to victory", () => {
    const w = createWorld({ seed: 17 });
    const p = w.players[0]!;
    const rooms: string[] = [];
    for (let t = 0; t < 30 * 60 * 10 && !w.run.victory; t++) {
      p.hp = p.maxHp;
      // A god-mode bot: delete visible enemies, then hop to the exit.
      for (const e of w.enemies) if (e.spawnT <= 0 && e.state !== "hidden") damageEnemy(w, e, 1e6, { dir: { x: 0, y: 1 }, knockback: 0, sourcePlayerId: p.id, element: "none" });
      const exit = w.run.room.exit;
      if (w.run.room.cleared) p.pos = { x: exit.x + exit.w / 2, y: 20 };
      step(w, [EMPTY_INPUT]);
      for (const ev of w.events) if (ev.type === "roomEnter") rooms.push(ev.kind);
    }
    expect(rooms).toEqual(["combat", "breather", "combat", "boss"]);
    expect(w.run.victory).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  ACT_ROOMS,
  actBiome,
  actHp,
  BIOMES,
  BIOME_IDS,
  BOOSTS,
  BOOST_IDS,
  boostOffers,
  createWorld,
  DIFFICULTIES,
  doorRect,
  eliteShare,
  EMPTY_INPUT,
  ENEMIES,
  enterRoom,
  FINAL_ACT,
  GRENADES,
  GRENADE_IDS,
  grenadeStats,
  GUNS,
  gunDps,
  gunName,
  gunStats,
  LEGENDARIES,
  MAKER_IDS,
  offerBoosts,
  planDoors,
  planRoom,
  planWave,
  rollGrenade,
  rollGun,
  roomBudget,
  roomSpec,
  step,
  type PlayerInput,
  type World,
} from "../src";
import { damageEnemy, hurtPlayer, spawnEnemy } from "../src/combat";
import { applyBoost } from "../src/players";
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

  it("the rest of an SMG burst follows the aim as it moves", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.guns[0] = newGun(w, "smg");
    const angles: number[] = [];
    const shots = () => {
      for (const ev of w.events) if (ev.type === "shot" && ev.playerId === p.id) angles.push(ev.angle);
    };
    step(w, [input({ fire: true, aim: { x: 100, y: 0 } })]);
    shots();
    // Swing the aim straight down mid-burst.
    for (let i = 0; i < 10; i++) {
      step(w, [input({ aim: { x: 0, y: 100 } })]);
      shots();
    }
    expect(angles.length).toBe(gunStats(p.guns[0]!).shotsPerPip);
    expect(angles[0]).toBeCloseTo(0);
    for (const a of angles.slice(1)) expect(a).toBeCloseTo(Math.PI / 2);
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
    expect(w.pickups.filter((k) => k.kind === "grenade").length).toBe(1);
  });
});

describe("grenades", () => {
  it("everyone starts with a plain frag; better rarities hit harder and come back sooner", () => {
    const w = quiet();
    expect(w.players[0]!.grenade).toEqual({ defId: "frag", rarity: "common" });
    const common = grenadeStats({ defId: "frag", rarity: "common" });
    const legendary = grenadeStats({ defId: "frag", rarity: "legendary" });
    expect(legendary.damage).toBeGreaterThan(common.damage);
    expect(legendary.radius).toBeGreaterThan(common.radius);
    expect(legendary.cooldown).toBeLessThan(common.cooldown);
    for (const id of GRENADE_IDS) expect(GRENADES[id]!.id).toBe(id);
  });

  it("drop as loot and swap with the pickup button, leaving the old one on the floor", () => {
    const w = quiet();
    const p = w.players[0]!;
    w.pickups.push({ id: 5000, kind: "grenade", pos: { ...p.pos }, grenade: { defId: "shock", rarity: "rare" }, used: false });
    step(w, [input({ interact: true })]);
    expect(p.grenade).toEqual({ defId: "shock", rarity: "rare" });
    expect(w.pickups.find((k) => k.id === 5000)!.grenade).toEqual({ defId: "frag", rarity: "common" });
    expect(w.events.some((e) => e.type === "grenadePickup")).toBe(true);
    // Static Cling comes back faster than a frag.
    step(w, [input({ grenade: true, grenadeAim: { x: 60, y: 0 } })]);
    expect(p.grenadeCd).toBeCloseTo(grenadeStats(p.grenade).cooldown, 5);
    expect(w.projectiles.find((pr) => pr.kind === "grenade")!.element).toBe("shock");
  });

  it("rolls every kind, and enemies drop them", () => {
    const w = quiet();
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) kinds.add(rollGrenade(w).defId);
    expect([...kinds].sort()).toEqual([...GRENADE_IDS].sort());
    let drops = 0;
    for (let i = 0; i < 200; i++) {
      const e = spawnEnemy(w, "cone_rat", { x: 200, y: 150 }, 0);
      hit(w, e, 9999, "none");
      drops = w.pickups.filter((k) => k.kind === "grenade").length;
    }
    expect(drops).toBeGreaterThan(0);
  });

  it("Hot Pocket leaves burning floor; Snow Globe's frost freezes what stays in it", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.grenade = { defId: "fire", rarity: "common" };
    step(w, [input({ grenade: true, grenadeAim: { x: 60, y: 0 } })]);
    run(w, 40);
    expect(w.hazards.some((h) => h.kind === "fire" && h.owner === "player")).toBe(true);

    const v = quiet();
    const q = v.players[0]!;
    q.grenade = { defId: "frost", rarity: "common" };
    const e = spawnEnemy(v, "cone_rat", { x: q.pos.x + 60, y: q.pos.y }, 0);
    e.hp = e.maxHp = 1e6;
    let frozen = false;
    step(v, [input({ grenade: true, grenadeAim: { x: 60, y: 0 } })]);
    for (let i = 0; i < 150 && !frozen; i++) {
      e.pos = { x: q.pos.x + 60, y: q.pos.y };
      step(v, [EMPTY_INPUT]);
      frozen = e.status.frozenT > 0;
    }
    expect(frozen).toBe(true);
  });

  it("Lint Trap pulls enemies toward the blast instead of shoving them away", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.grenade = { defId: "vortex", rarity: "common" };
    const at = { x: p.pos.x + 60, y: p.pos.y - 40 };
    const e = spawnEnemy(w, "cone_rat", { x: at.x + 30, y: at.y }, 0);
    e.hp = e.maxHp = 1e6;
    step(w, [input({ grenade: true, grenadeAim: { x: 60, y: -40 } })]);
    for (let i = 0; i < 60 && !w.events.some((ev) => ev.type === "explosion"); i++) {
      e.pos = { x: at.x + 30, y: at.y };
      step(w, [EMPTY_INPUT]);
    }
    expect(e.knock.x).toBeLessThan(-100);
  });
});

describe("director and run", () => {
  it("harder difficulties bring tougher, harder-hitting enemies, and more of them", () => {
    const normal = quiet();
    const nightmare = quiet();
    nightmare.run.tier = 2;
    const hp = (w: World) => spawnEnemy(w, "jet_boar", { x: 300, y: 300 }, 0).hp;
    expect(hp(nightmare) / hp(normal)).toBeCloseTo(DIFFICULTIES[2].hp, 1);
    const taken = (w: World) => {
      const p = w.players[0]!;
      const before = p.hp;
      hurtPlayer(w, p, 10);
      return before - p.hp;
    };
    expect(taken(nightmare) / taken(normal)).toBeCloseTo(DIFFICULTIES[2].damage);
    expect(roomBudget(10, 2, 1)).toBeGreaterThan(roomBudget(10, 0, 1));
  });

  it("endless climbs on a gentle curve, and leans on elites instead", () => {
    // The adventure's health ramp is a straight line up to the final act.
    for (let act = 0; act <= FINAL_ACT; act++) expect(actHp(act)).toBeCloseTo(1 + (0.3 * act * 2) / FINAL_ACT);
    // Endless keeps climbing, each step a little bigger, but nowhere near the old 30% a step.
    for (let act = FINAL_ACT + 1; act < FINAL_ACT + 12; act++) {
      expect(actHp(act)).toBeGreaterThan(actHp(act - 1));
      expect(actHp(act + 1) - actHp(act)).toBeGreaterThan(actHp(act) - actHp(act - 1));
      expect(actHp(act) / actHp(act - 1)).toBeLessThan(1.3);
    }
    // The elite share still tops out at 60% in the adventure, and climbs past it in endless (with a cap).
    expect(eliteShare(99, 2)).toBe(0.6);
    expect(eliteShare(99, 2, 3)).toBeGreaterThan(0.6);
    expect(eliteShare(99, 2, 99)).toBe(0.85);
  });

  it("starts at check-in, then offers two or three different doors with at least one fight", () => {
    const w = createWorld({ seed: 11 });
    expect(w.run.plans.map((r) => r.kind)).toEqual(["intro"]);
    for (let seed = 1; seed <= 40; seed++) {
      const v = createWorld({ seed });
      v.run.room.cleared = true;
      const doors = planDoors(v);
      expect(doors.length).toBeGreaterThanOrEqual(2);
      expect(doors.length).toBeLessThanOrEqual(3);
      expect(new Set(doors.map((d) => d.kind)).size).toBe(doors.length);
      expect(doors.some((d) => d.kind === "combat" || d.kind === "elite" || d.kind === "event")).toBe(true);
      // Events always come with a twist; doors never overlap.
      for (const d of doors) if (d.kind === "event") expect(d.twist).not.toBe("");
      const rects = doors.map(doorRect);
      for (let i = 1; i < rects.length; i++) expect(rects[i]!.x).toBeGreaterThan(rects[i - 1]!.x + rects[i - 1]!.w);
    }
  });

  it("ends each act with a boss, visits every adventure, and ends in the Drowned Crypt", () => {
    const w = createWorld({ seed: 5 });
    // The last room of an act only leads to its boss.
    enterRoom(w, roomSpec(w, "combat", { step: ACT_ROOMS - 1 }));
    w.run.room.cleared = true;
    expect(planDoors(w).map((d) => d.kind)).toEqual(["boss"]);
    // The adventure visits every biome once, starting with the picked one and ending in the Crypt.
    expect(w.run.order[0]).toBe("foundry");
    expect([...w.run.order].sort()).toEqual([...BIOME_IDS].sort());
    expect(w.run.order[FINAL_ACT]).toBe("crypt");
    expect(FINAL_ACT).toBe(BIOME_IDS.length - 1);
    // After the first boss, the next act is in the next biome.
    enterRoom(w, roomSpec(w, "boss"));
    expect(w.run.plans.at(-1)!.waves).toEqual([[BIOMES.foundry.boss]]);
    w.run.room.cleared = true;
    const next = planDoors(w);
    expect(next.map((d) => [d.kind, d.act, d.biome])).toEqual([["combat", 1, w.run.order[1]]]);
    // A different seed can visit them in a different order, but the Crypt is always last, and never a start.
    const orders = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => createWorld({ seed }).run.order);
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(1);
    expect(orders.every((o) => o.at(-1) === "crypt")).toBe(true);
    expect(createWorld({ seed: 1, biome: "crypt" }).run.biome).toBe("foundry");
    // The final act's boss room brings the Night Auditor alone, and its doors lead home or on into endless.
    enterRoom(w, roomSpec(w, "boss", { act: FINAL_ACT, biome: actBiome(w, FINAL_ACT) }));
    expect(w.run.plans.at(-1)!.waves).toEqual([["night_auditor"]]);
    w.run.room.cleared = true;
    expect(planDoors(w).map((d) => [d.kind, d.act, d.biome])).toEqual([["home", FINAL_ACT + 1, "foundry"], ["combat", FINAL_ACT + 1, "foundry"]]);
  });

  it("Overbooked rooms draw enemies from every family", () => {
    const w = createWorld({ seed: 3 });
    const biomes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const plan = planRoom(w, roomSpec(w, "combat", { act: 2, twist: "overbooked", step: 3 }), 0, 1);
      for (const id of plan.waves.flat()) {
        const def = ENEMIES[id.replace("!", "").split("@")[0]!]!;
        if (def.biomes.length === 1) biomes.add(def.biomes[0]!);
      }
    }
    expect([...biomes].sort()).toEqual([...BIOME_IDS].sort());
  });

  it("later acts make enemies tougher, hit harder and attack sooner", () => {
    const hpAt = (act: number) => {
      const w = createWorld({ seed: 2 });
      enterRoom(w, roomSpec(w, "combat", { act }));
      return spawnEnemy(w, "cone_rat", { x: 100, y: 100 }, 0).maxHp;
    };
    expect(hpAt(1)).toBeGreaterThan(hpAt(0));
    expect(hpAt(2)).toBeGreaterThan(hpAt(1));
    expect(hpAt(4)).toBeGreaterThan(hpAt(2));
    const hurtAt = (act: number) => {
      const w = createWorld({ seed: 2 });
      enterRoom(w, roomSpec(w, "rest", { act }));
      const p = w.players[0]!;
      p.hp = p.maxHp = 500;
      hurtPlayer(w, p, 10);
      return 500 - p.hp;
    };
    expect(hurtAt(2)).toBeGreaterThan(hurtAt(0));
  });

  it("respects role caps and stays near budget", () => {
    const w = createWorld({ seed: 13 });
    for (let i = 0; i < 300; i++) {
      const plan = planWave(w, 20);
      const all = [...plan.enemies, ...plan.props];
      const roles = all.map((id) => ENEMIES[id]!.role);
      expect(roles.filter((r) => r === "support").length).toBeLessThanOrEqual(1);
      expect(roles.filter((r) => r === "artillery").length).toBeLessThanOrEqual(3);
      const cost = all.reduce((s, id) => s + ENEMIES[id]!.threatCost, 0);
      expect(cost).toBeLessThanOrEqual(21);
      expect(cost).toBeGreaterThanOrEqual(12);
    }
  });

  it("can be played through every act to a win, or on into endless", () => {
    const play = (endless: boolean) => {
      const w = createWorld({ seed: 17 });
      const p = w.players[0]!;
      const rooms: string[] = [];
      let finale = false;
      for (let t = 0; t < 30 * 60 * 80 && !w.run.victory && w.run.bosses < FINAL_ACT + 3; t++) {
        p.hp = p.maxHp;
        // A god-mode bot: delete visible enemies, then hop through the first door (or home, if it's going home).
        for (const e of w.enemies) if (e.spawnT <= 0 && e.state !== "hidden") damageEnemy(w, e, 1e6, { dir: { x: 0, y: 1 }, knockback: 0, sourcePlayerId: p.id, element: "none" });
        const doors = w.run.room.doors;
        const door = (!endless && doors.find((d) => d.kind === "home")) || doors.find((d) => d.kind !== "home") || doors[0];
        if (w.run.room.cleared && door) p.pos = { x: door.x, y: 8 };
        step(w, [EMPTY_INPUT]);
        for (const ev of w.events) {
          if (ev.type === "roomEnter") rooms.push(ev.kind);
          if (ev.type === "finale") finale = true;
        }
      }
      return { w, rooms, finale };
    };
    const home = play(false);
    expect(home.finale).toBe(true);
    expect(home.w.run.victory).toBe(true);
    expect(home.w.run.bosses).toBe(FINAL_ACT + 1);
    expect(home.rooms.filter((k) => k === "boss").length).toBe(FINAL_ACT + 1);
    expect(home.rooms.length).toBe((ACT_ROOMS + 1) * (FINAL_ACT + 1) - 1);
    // Endless keeps going past the final boss.
    const more = play(true);
    expect(more.w.run.victory).toBe(false);
    expect(more.w.run.bosses).toBe(FINAL_ACT + 3);
    expect(more.w.run.plans.at(-1)!.act).toBeGreaterThan(FINAL_ACT);
  });
});

describe("run boosts", () => {
  it("each player gets their own three different offers, and taking one removes the rest", () => {
    const w = createWorld({ seed: 21, coop: true, players: [{ name: "A" }, { name: "B" }] });
    w.enemies = [];
    w.run.room.waves = [];
    w.run.room.waveIdx = 0;
    step(w, [EMPTY_INPUT, EMPTY_INPUT]);
    expect(w.run.room.cleared).toBe(true);
    const [a, b] = w.players;
    const mine = w.pickups.filter((k) => k.kind === "boost" && k.owner === a!.id);
    const theirs = w.pickups.filter((k) => k.kind === "boost" && k.owner === b!.id);
    expect(mine.length).toBe(3);
    expect(theirs.length).toBe(3);
    expect(new Set(mine.map((k) => k.boost)).size).toBe(3);
    // Standing on the same spot, B's button only ever takes B's own offer.
    b!.pos = { ...mine[0]!.pos };
    a!.pos = { ...mine[0]!.pos };
    step(w, [EMPTY_INPUT, input({ interact: true })]);
    expect(Object.keys(b!.boosts)).toEqual([theirs[0]!.boost]);
    expect(w.pickups.filter((k) => k.kind === "boost" && k.owner === a!.id).length).toBe(3);
    expect(w.pickups.filter((k) => k.kind === "boost" && k.owner === b!.id).length).toBe(0);
    step(w, [input({ interact: true }), EMPTY_INPUT]);
    expect(a!.boosts[mine[0]!.boost!]).toBe(1);
    expect(w.pickups.filter((k) => k.kind === "boost" && k.owner === a!.id).length).toBe(0);
  });

  it("offers lean into your build and keystones need their tag", () => {
    const w = createWorld({ seed: 4 });
    const p = w.players[0]!;
    // No fire anywhere: Wildfire never shows up.
    let roll = 0;
    const rng = () => ((roll = (roll * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 200; i++) expect(boostOffers(p, w.players, 2, rng)).not.toContain("wildfire");
    p.boosts = { hotSauce: 1 };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const id of boostOffers(p, w.players, 2, rng)) seen.add(id);
    expect(seen.has("wildfire")).toBe(true);
    // Maxed boosts aren't offered again.
    p.boosts = { heavy: BOOSTS.heavy!.max };
    for (let i = 0; i < 100; i++) expect(boostOffers(p, w.players, 0, rng)).not.toContain("heavy");
    expect(BOOST_IDS.length).toBeGreaterThanOrEqual(45);
  });

  it("souvenirs can make offers rarer and add a 4th", () => {
    const offers = (souvenirs: Record<string, number>) => {
      const w = quiet();
      const p = w.players[0]!;
      Object.assign(p.mods, { offerQuality: 0.25 * (souvenirs.loyalty ?? 0), extraOffer: 0.2 * (souvenirs.suitcase ?? 0) });
      const sizes: number[] = [];
      let rare = 0;
      for (let i = 0; i < 300; i++) {
        w.pickups = [];
        offerBoosts(w, { x: 360, y: 300 }, 0);
        const mine = w.pickups.filter((k) => k.kind === "boost");
        sizes.push(mine.length);
        rare += mine.filter((k) => BOOSTS[k.boost!]!.rarity !== "common").length / mine.length;
      }
      return { sizes, rare: rare / 300 };
    };
    const plain = offers({});
    expect(new Set(plain.sizes)).toEqual(new Set([3]));
    // A full Spare Suitcase always brings a 4th, and they're all different.
    expect(new Set(offers({ suitcase: 5 }).sizes)).toEqual(new Set([4]));
    const some = offers({ suitcase: 2 }).sizes;
    expect(some.filter((n) => n === 4).length / some.length).toBeGreaterThan(0.25);
    expect(some.filter((n) => n === 4).length / some.length).toBeLessThan(0.55);
    // A full Loyalty Card makes rares and epics clearly likelier.
    expect(offers({ loyalty: 5 }).rare).toBeGreaterThan(plain.rare * 1.8);
  });

  it("stat boosts apply right away, damage boosts make hits land harder", () => {
    const w = quiet();
    const p = w.players[0]!;
    const hp = p.maxHp;
    applyBoost(w, p, "vitamins");
    expect(p.maxHp).toBe(hp + 20);
    const e = spawnEnemy(w, "slag_golem", { x: p.pos.x + 30, y: p.pos.y }, 0);
    e.hp = e.maxHp = 1e6;
    hit(w, e, 100, "none");
    const plain = 1e6 - e.hp;
    applyBoost(w, p, "personal");
    e.hp = 1e6;
    hit(w, e, 100, "none");
    expect(1e6 - e.hp).toBeGreaterThan(plain * 1.2);
  });
});

describe("twists", () => {
  it("Hold the Line clears when the timer runs out, whatever is left", () => {
    const w = createWorld({ seed: 8 });
    enterRoom(w, roomSpec(w, "event", { twist: "hold" }));
    const p = w.players[0]!;
    for (let t = 0; t < 30 * 50 && !w.run.room.cleared; t++) {
      p.hp = p.maxHp;
      step(w, [EMPTY_INPUT]);
    }
    expect(w.run.room.cleared).toBe(true);
    expect(w.run.time).toBeGreaterThan(38);
  });

  it("Baggage Claim belts carry you along", () => {
    const w = createWorld({ seed: 8 });
    enterRoom(w, roomSpec(w, "event", { twist: "belts" }));
    w.enemies = [];
    w.arena.obstacles = [];
    w.arena.spikes = [];
    const p = w.players[0]!;
    const belt = w.arena.belts[0]!;
    p.pos = { x: 360, y: belt.y + belt.h / 2 };
    run(w, 15);
    expect(Math.sign(p.pos.x - 360)).toBe(Math.sign(belt.vx));
    expect(Math.abs(p.pos.x - 360)).toBeGreaterThan(20);
  });

  it("boss shockwaves hurt unless you dash over them", () => {
    const ring = (dash: boolean) => {
      const w = quiet();
      const p = w.players[0]!;
      p.pos = { x: 360, y: 300 };
      w.hazards.push({ id: 900, kind: "wave", owner: "enemy", pos: { x: 360, y: 100 }, radius: 800, t: 800 / 150, maxT: 800 / 150, damage: 20 });
      let hurt = false;
      for (let t = 0; t < 60; t++) {
        // Dash as the ring gets close.
        const r = 800 * (1 - w.hazards[0]!.t / w.hazards[0]!.maxT);
        step(w, [input({ dash: dash && Math.abs(200 - r) < 22 })]);
        if (w.events.some((ev) => ev.type === "playerHurt")) hurt = true;
        if (w.hazards.length === 0) break;
      }
      return hurt;
    };
    expect(ring(false)).toBe(true);
    expect(ring(true)).toBe(false);
  });
});

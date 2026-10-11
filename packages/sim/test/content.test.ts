import { describe, expect, it } from "vitest";
import {
  applyAction,
  BIOMES,
  BIOME_IDS,
  CRYPT,
  FINAL_ACT,
  roomDark,
  stepMovement,
  type Player,
  createWorld,
  decodeSnapshot,
  EMPTY_INPUT,
  encodeSnapshot,
  ENEMIES,
  enterRoom,
  HEROES,
  LAYOUTS,
  newProfile,
  PAD,
  planCombatWaves,
  planRoom,
  roomSpec,
  playerOptions,
  SIGNATURES,
  SKILL_TREES,
  skillPoints,
  step,
  validSkills,
  type Biome,
  type PlayerInput,
  type PlayerOptions,
  type World,
} from "../src";
import { damageEnemy, hurtPlayer, spawnEnemy, submerged } from "../src/combat";
import { beamLength } from "../src/enemies";
import { dist, distToSegment } from "../src/math";
import { linkPairs } from "../src/elites";
import { newGun } from "../src/loot";
import { lightCandles } from "../src/crypt";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });

function run(w: World, ticks: number, inputs: PlayerInput[] = []) {
  for (let i = 0; i < ticks; i++) step(w, inputs);
}

/** A world with no waves, vents, props or pickups, for testing one mechanic at a time. */
function quiet(players: PlayerOptions[] = [{}], seed = 1, biome: Biome = "foundry"): World {
  const w = createWorld({ seed, players, biome });
  w.run.room.waves = [];
  w.run.room.vents = [];
  w.run.room.cleared = true;
  w.run.victory = true; // keeps the exit shut
  w.enemies = [];
  w.pickups = [];
  return w;
}

/** An enemy that won't die or move unless the test wants it to. */
function dummy(w: World, defId: string, x: number, y: number, hp = 1e6) {
  const e = spawnEnemy(w, defId, { x, y }, 0);
  e.hp = e.maxHp = hp;
  return e;
}

const shoot = (w: World, e: { id: number }, by: number, dmg: number) =>
  damageEnemy(w, w.enemies.find((x) => x.id === e.id)!, dmg, { dir: { x: 1, y: 0 }, knockback: 0, sourcePlayerId: by, element: "none" });

describe("heroes", () => {
  it("every hero has a full skill tree that a maxed hero still can't finish", () => {
    for (const id of Object.keys(HEROES)) {
      const tree = SKILL_TREES[id]!;
      expect(tree.branches.length).toBe(3);
      expect(tree.nodes.length).toBe(15);
      const total = tree.nodes.reduce((s, n) => s + n.cost, 0);
      expect(total).toBeGreaterThan(skillPoints(30));
      expect(validSkills(id, 30, tree.nodes.map((n) => n.id)).length).toBeLessThan(15);
    }
  });

  it("each hero's action skill does its own thing", () => {
    for (const heroId of Object.keys(HEROES)) {
      const w = quiet([{ heroId }]);
      const p = w.players[0]!;
      dummy(w, "slag_golem", p.pos.x + 60, p.pos.y);
      p.skillCharge = 1;
      step(w, [input({ skill: true })]);
      expect(p.skillCharge).toBe(0);
      const kind = HEROES[heroId]!.skill.type;
      if (kind === "dome") expect(w.domes.length).toBe(1);
      if (kind === "mark") expect(w.enemies[0]!.markT).toBeGreaterThan(5);
      if (kind === "turret") expect(w.gadgets.filter((g) => g.kind === "turret").length).toBe(1);
      if (kind === "drone") expect(w.gadgets.filter((g) => g.kind === "drone").length).toBe(1);
    }
  });

  it("Gunslinger marks: your hits do 40% more, auto-aim prefers the mark, shots seek it", () => {
    const w = quiet([{ heroId: "gunslinger" }, { heroId: "vanguard" }]);
    const [gs, friend] = w.players;
    const near = dummy(w, "slag_golem", gs!.pos.x + 30, gs!.pos.y - 40);
    const far = dummy(w, "slag_golem", gs!.pos.x - 120, gs!.pos.y - 60);
    far.markT = 5;
    far.markBy = gs!.id;
    shoot(w, far, gs!.id, 10);
    shoot(w, far, friend!.id, 10);
    expect(far.maxHp - far.hp).toBeCloseTo(14 + 10);
    // Auto-aim goes for the marked one even though another enemy is closer.
    step(w, [input({ fire: true, autoAim: true }), EMPTY_INPUT]);
    const pr = w.projectiles.find((x) => x.ownerId === gs!.id)!;
    expect(pr.seekMarks).toBe(gs!.id);
    expect(pr.vel.x).toBeLessThan(0);
    expect(near.hp).toBe(near.maxHp);
  });

  it("Gunslinger nodes: Quick Draw marks four, Bullseye crits every fourth hit", () => {
    const w = quiet([{ heroId: "gunslinger", level: 30, skills: ["gs_quick", "gs_trick", "gs_bullseye"] }]);
    const p = w.players[0]!;
    const es = [0, 1, 2, 3, 4].map((i) => dummy(w, "slag_golem", p.pos.x - 100 + i * 50, p.pos.y - 80));
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    expect(es.filter((e) => e.markT > 0).length).toBe(4);
    const e = es.find((x) => x.markT > 0)!;
    const before = e.hp;
    for (let i = 0; i < 4; i++) shoot(w, e, p.id, 10);
    // Three marked hits of 14 and one crit of 28.
    expect(before - e.hp).toBeCloseTo(14 * 3 + 28);
  });

  it("Tinker turrets shoot the nearest enemy without charging the skill, and Self-Destruct blows up at the end", () => {
    const w = quiet([{ heroId: "tinker", level: 30, skills: ["tk_boom"] }]);
    const p = w.players[0]!;
    const e = dummy(w, "slag_golem", p.pos.x + 90, p.pos.y, 2000);
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    const t = w.gadgets[0]!;
    run(w, 60);
    expect(e.hp).toBeLessThan(2000);
    expect(p.skillCharge).toBe(0);
    t.t = 0.01;
    const hp = e.hp;
    e.pos = { ...t.pos, x: t.pos.x + 12 };
    run(w, 2);
    expect(w.gadgets.length).toBe(0);
    expect(hp - e.hp).toBeGreaterThan(20);
  });

  it("Look At Me: enemies near a taunting turret go after it and can break it", () => {
    const w = quiet([{ heroId: "tinker", level: 30, skills: ["tk_taunt"] }]);
    const p = w.players[0]!;
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    const t = w.gadgets[0]!;
    // A rat right next to the turret, far from the player.
    p.pos = { x: 600, y: 400 };
    t.pos = { x: 150, y: 150 };
    const rat = dummy(w, "cone_rat", 170, 150);
    run(w, 90);
    expect(rat.taunt).toBe(t.id);
    expect(t.hp).toBeLessThan(t.maxHp);
    expect(p.hp).toBe(p.maxHp);
  });

  it("Warden owl heals, Overheal turns the extra into a shield that soaks damage, Guardian Owl saves once", () => {
    const w = quiet([{ heroId: "warden", level: 30, skills: ["wd_hustle", "wd_ambulance", "wd_getup", "wd_opinion", "wd_guardian", "wd_overheal"] }]);
    const p = w.players[0]!;
    p.hp = p.maxHp - 3;
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    run(w, 70);
    expect(p.hp).toBe(p.maxHp);
    expect(p.shield).toBeGreaterThan(0);
    const shield = p.shield;
    p.iframes = 0;
    hurtPlayer(w, p, 5);
    expect(p.hp).toBe(p.maxHp);
    expect(p.shield).toBeCloseTo(shield - 5);
    // Guardian: a hit that would down you leaves you at 1 HP, once.
    p.iframes = 0;
    p.shield = 0;
    hurtPlayer(w, p, 9999);
    expect(p.downed).toBe(false);
    expect(p.hp).toBe(1);
    p.iframes = 0;
    hurtPlayer(w, p, 9999);
    expect(p.downed).toBe(true);
    // Second Opinion: two Second Winds.
    expect(p.selfRevives).toBe(2);
  });

  it("Owl Ambulance flies to a downed teammate and picks them up", () => {
    const w = quiet([{ heroId: "warden", level: 30, skills: ["wd_hustle", "wd_ambulance"] }, {}], 2);
    w.run.coop = true;
    const [wd, friend] = w.players;
    friend!.pos = { x: 200, y: 200 };
    wd!.pos = { x: 230, y: 214 };
    wd!.skillCharge = 1;
    step(w, [input({ skill: true }), EMPTY_INPUT]);
    friend!.iframes = 0;
    hurtPlayer(w, friend!, 9999);
    // The Warden keeps their distance; the owl goes on its own.
    wd!.pos = { x: 300, y: 260 };
    run(w, 30 * 3);
    expect(friend!.downed).toBe(false);
  });
});

describe("elite modifiers", () => {
  it("Shielded blocks shots to its face but not from behind", () => {
    const w = quiet();
    const p = w.players[0]!;
    const e = spawnEnemy(w, "slag_golem", { x: p.pos.x + 80, y: p.pos.y }, 0, "shielded");
    e.hp = e.maxHp = 1e6;
    e.facing = { x: -1, y: 0 };
    w.projectiles.push({ id: 900, owner: "player", ownerId: p.id, kind: "pistol", element: "none", pos: { x: e.pos.x - 20, y: e.pos.y }, vel: { x: 300, y: 0 }, radius: 2, damage: 50, pierce: 0, bounces: 0, knockback: 0, life: 1, hitIds: [], gunUid: -1 });
    step(w, [EMPTY_INPUT]);
    step(w, [EMPTY_INPUT]);
    expect(e.hp).toBe(1e6);
    e.facing = { x: -1, y: 0 };
    w.projectiles.push({ id: 901, owner: "player", ownerId: p.id, kind: "pistol", element: "none", pos: { x: e.pos.x + 20, y: e.pos.y }, vel: { x: -300, y: 0 }, radius: 2, damage: 50, pierce: 0, bounces: 0, knockback: 0, life: 1, hitIds: [], gunUid: -1 });
    step(w, [EMPTY_INPUT]);
    expect(e.hp).toBeLessThan(1e6);
  });

  it("Splitting leaves two smaller copies that drop nothing", () => {
    const w = quiet();
    const e = spawnEnemy(w, "jet_boar", { x: 200, y: 200 }, 0, "splitting");
    shoot(w, e, w.players[0]!.id, 1e5);
    const kids = w.enemies.filter((x) => x.hp > 0);
    expect(kids.length).toBe(2);
    expect(kids.every((k) => k.size < 1 && k.noLoot && !k.elite && k.defId === "jet_boar")).toBe(true);
  });

  it("Vengeful explodes where it died, after a telegraphed moment", () => {
    const w = quiet();
    const p = w.players[0]!;
    const e = spawnEnemy(w, "jet_boar", { x: p.pos.x + 20, y: p.pos.y }, 0, "vengeful");
    shoot(w, e, p.id, 1e5);
    expect(w.projectiles.some((pr) => pr.kind === "doom")).toBe(true);
    run(w, 10);
    expect(p.hp).toBe(p.maxHp);
    run(w, 30);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("Linked: kill one and the other brings it back unless it dies within 4 seconds", () => {
    const w = quiet();
    const p = w.players[0]!;
    const a = spawnEnemy(w, "slag_golem", { x: 100, y: 100 }, 0, "linked");
    const b = spawnEnemy(w, "slag_golem", { x: 500, y: 100 }, 0, "linked");
    linkPairs([a, b]);
    expect(a.link).toBe(b.id);
    b.hp = 1e6;
    shoot(w, a, p.id, 1e5);
    run(w, 30 * 4 + 5);
    expect(w.enemies.filter((e) => e.hp > 0 && e.defId === "slag_golem").length).toBe(2);
    // Now kill both in time.
    const back = w.enemies.find((e) => e.id !== b.id && e.hp > 0)!;
    run(w, 30);
    shoot(w, back, p.id, 1e7);
    b.hp = 10;
    shoot(w, b, p.id, 1e5);
    run(w, 30 * 5);
    expect(w.enemies.filter((e) => e.hp > 0).length).toBe(0);
  });

  it("Teleporting shimmers where it's going, then appears behind you", () => {
    const w = quiet();
    const p = w.players[0]!;
    p.facing = { x: 0, y: -1 };
    const e = spawnEnemy(w, "jet_boar", { x: p.pos.x, y: p.pos.y - 200 }, 0, "teleporting");
    e.hp = 1e6;
    e.blinkT = 0.1;
    run(w, 5);
    expect(e.blinkTo).toBeDefined();
    const to = { ...e.blinkTo! };
    // Behind the player: further down the screen than they are.
    expect(to.y).toBeGreaterThan(p.pos.y);
    run(w, 25);
    expect(e.blinkTo).toBeUndefined();
    expect(Math.hypot(e.pos.x - to.x, e.pos.y - to.y)).toBeLessThan(20);
  });

  it("Hasted winds up faster", () => {
    const windup = (elite?: "hasted") => {
      const w = quiet();
      const p = w.players[0]!;
      const e = spawnEnemy(w, "slag_golem", { x: p.pos.x + 25, y: p.pos.y }, 0, elite);
      e.cooldowns = e.cooldowns.map(() => 0);
      step(w, [EMPTY_INPUT]);
      return e.stateT;
    };
    expect(windup("hasted")).toBeLessThan(windup() * 0.8);
  });

  it("the director spends part of later rooms on elites, never on swarmers or bosses", () => {
    let elites = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const w = createWorld({ seed });
      for (const wave of planCombatWaves(w, roomSpec(w, "combat", { step: 3 }), 0, 1)) {
        for (const id of wave) {
          if (!id.includes("@")) continue;
          elites++;
          const def = ENEMIES[id.replace("!", "").split("@")[0]!]!;
          expect(def.role).not.toBe("swarmer");
          expect(def.boss).toBeUndefined();
        }
      }
    }
    expect(elites).toBeGreaterThan(20);
  });

  it("an Elite Convention fills every wave with elites, from the first room on", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = createWorld({ seed });
      for (const step of [1, 4]) {
        for (const wave of planCombatWaves(w, roomSpec(w, "combat", { step, twist: "convention" }), 0, 1)) {
          expect(wave.length).toBeGreaterThan(0);
          for (const id of wave) {
            expect(id.startsWith("!")).toBe(false);
            expect(id).toContain("@");
            expect(ENEMIES[id.split("@")[0]!]!.role).not.toBe("swarmer");
          }
        }
      }
    }
  });
});

describe("Frozen Caverns", () => {
  it("plans its own family, layouts and the dragon", () => {
    const w = createWorld({ seed: 3, biome: "caverns" });
    expect(w.run.biome).toBe("caverns");
    expect(w.arena.ice).toBe(true);
    expect(w.arena.spikes.length).toBeGreaterThan(0);
    expect(planRoom(w, roomSpec(w, "boss"), 0, 1).waves).toEqual([[BIOMES.caverns.boss]]);
    const rooms = [1, 2, 3, 4, 5].map((step) => planRoom(w, roomSpec(w, "combat", { step }), 0, 1));
    expect(rooms.every((r) => w.run.plans.length > 0 && [6, 7, 13, 14, 15].includes(r.layout))).toBe(true);
    const ids = [...w.run.plans, ...rooms].flatMap((p) => p.waves.flat()).map((id) => id.replace("!", "").split("@")[0]!);
    expect(ids.every((id) => ENEMIES[id]!.biomes.includes("caverns"))).toBe(true);
  });

  it("ice keeps you sliding and stretches your dash", () => {
    const slide = (biome: Biome) => {
      const w = quiet([{}], 1, biome);
      const p = w.players[0]!;
      p.pos = { x: 360, y: 300 };
      run(w, 15, [input({ move: { x: 1, y: 0 } })]);
      const x = p.pos.x;
      run(w, 10);
      return p.pos.x - x;
    };
    expect(slide("foundry")).toBeCloseTo(0, 1);
    expect(slide("caverns")).toBeGreaterThan(10);

    const dash = (biome: Biome) => {
      const w = quiet([{}], 1, biome);
      const p = w.players[0]!;
      p.pos = { x: 300, y: 300 };
      step(w, [input({ dash: true, move: { x: 1, y: 0 } })]);
      run(w, 6, [input({ move: { x: 1, y: 0 } })]);
      return p.pos.x - 300;
    };
    expect(dash("caverns")).toBeGreaterThan(dash("foundry"));
  });

  it("spike walls hurt and bounce you off; shoved enemies get hurt too", () => {
    const w = quiet([{}], 1, "caverns");
    const p = w.players[0]!;
    const spike = w.arena.spikes.find((s) => s.x === 0)!;
    p.pos = { x: spike.w + p.radius + 2, y: spike.y + spike.h / 2 };
    run(w, 3, [input({ move: { x: -1, y: 0 } })]);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(p.knock.x).toBeGreaterThan(0);

    const e = dummy(w, "yeti_bouncer", spike.w + 14, spike.y + spike.h / 2, 500);
    e.knock = { x: -300, y: 0 };
    run(w, 3);
    expect(e.hp).toBeLessThan(500);
  });

  it("the dragon's breath hits the wedge in front, shoves, and leaves slush that slows", () => {
    const w = quiet([{}], 1, "caverns");
    enterRoom(w, roomSpec(w, "boss"));
    w.enemies = [];
    w.run.room.waves = [];
    const p = w.players[0]!;
    p.pos = { x: 360, y: 300 };
    const d = dummy(w, "complaint_dragon", 360, 220);
    d.cooldowns = d.cooldowns.map((_, i) => (i === 0 ? 0 : 99));
    run(w, 40);
    expect(p.hp).toBeLessThan(p.maxHp);
    expect(w.hazards.some((h) => h.kind === "ice")).toBe(true);
  });
});

describe("Bilge Sewers", () => {
  it("plans its own family, layouts and the gator", () => {
    const w = createWorld({ seed: 3, biome: "sewers" });
    expect(w.arena.water.length).toBeGreaterThan(0);
    expect(w.run.room.vents.some((v) => v.kind === "pipe" && v.to)).toBe(true);
    expect(planRoom(w, roomSpec(w, "boss"), 0, 1).waves).toEqual([[BIOMES.sewers.boss]]);
    const rooms = [1, 2, 3, 4, 5].map((step) => planRoom(w, roomSpec(w, "combat", { step }), 0, 1));
    const ids = [...w.run.plans, ...rooms].flatMap((p) => p.waves.flat()).map((id) => id.replace("!", "").split("@")[0]!);
    expect(ids.every((id) => ENEMIES[id]!.biomes.includes("sewers"))).toBe(true);
  });

  it("deep water slows you down and carries you, but the sewer family swims", () => {
    const walk = (inWater: boolean) => {
      const w = quiet([{}], 1, "sewers");
      const p = w.players[0]!;
      const c = w.arena.water[0]!;
      p.pos = inWater ? { x: 200, y: c.y + c.h / 2 } : { x: 200, y: c.y - 40 };
      const y = p.pos.y;
      run(w, 10, [input({ move: { x: 0, y: -1 } })]);
      return { up: y - p.pos.y, drift: p.pos.x - 200 };
    };
    expect(walk(true).up).toBeLessThan(walk(false).up * 0.7);
    expect(walk(true).drift).toBeGreaterThan(5);
    expect(walk(false).drift).toBeCloseTo(0, 1);

    const swim = (defId: string) => {
      const w = quiet([{}], 1, "sewers");
      const c = w.arena.water[0]!;
      // Upstream of it, so the current works against the wader.
      w.players[0]!.pos = { x: 40, y: 400 };
      const e = dummy(w, defId, 200, c.y + c.h / 2);
      e.cooldowns = e.cooldowns.map(() => 99);
      const x = e.pos.x;
      run(w, 10);
      return dist(e.pos, { x, y: c.y + c.h / 2 });
    };
    expect(swim("sewer_roach")).toBeGreaterThan(swim("cone_rat"));
  });

  it("no crate sits in a sludge pipe's lane", () => {
    LAYOUTS.forEach((l, i) => {
      for (const [a, b] of l.pipes ?? []) {
        for (const o of l.obstacles) {
          const corners = [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x, y: o.y + o.h }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x + o.w / 2, y: o.y + o.h / 2 }];
          const edges = [0, 0.25, 0.5, 0.75, 1].flatMap((k) => [{ x: o.x + o.w * k, y: o.y }, { x: o.x + o.w * k, y: o.y + o.h }, { x: o.x, y: o.y + o.h * k }, { x: o.x + o.w, y: o.y + o.h * k }]);
          const hit = [...corners, ...edges].some((p) => distToSegment(p, a, b) < 14);
          expect(hit, `layout ${i}: crate at ${o.x},${o.y}`).toBe(false);
        }
      }
    });
  });

  it("sludge pipes warn, then blast whoever is in the lane down it", () => {
    const w = quiet([{}], 1, "sewers");
    enterRoom(w, roomSpec(w, "combat", { step: 1 }));
    w.enemies = [];
    w.run.room.waves = [];
    const pipe = w.run.room.vents.find((v) => v.kind === "pipe")!;
    w.run.room.vents = [pipe];
    const p = w.players[0]!;
    const mid = { x: (pipe.pos.x + pipe.to!.x) / 2, y: (pipe.pos.y + pipe.to!.y) / 2 };
    p.pos = { ...mid };
    pipe.t = pipe.periodS - pipe.eruptS - 0.05;
    run(w, 4);
    expect(p.hp).toBeLessThan(p.maxHp);
    const along = Math.sign(pipe.to!.x - pipe.pos.x);
    expect(Math.sign(p.knock.x) === along || Math.sign(p.pos.x - mid.x) === along).toBe(true);
  });

  it("the gator dives out of reach, then surfaces under you", () => {
    const w = quiet([{}], 1, "sewers");
    const p = w.players[0]!;
    p.pos = { x: 400, y: 250 };
    const g = dummy(w, "lost_found_gator", 200, 150, 5000);
    g.cooldowns = g.cooldowns.map((_, i) => (i === 4 ? 0 : 99));
    let under = false;
    let surfaced = false;
    for (let t = 0; t < 30 * 5 && !surfaced; t++) {
      step(w, [EMPTY_INPUT]);
      if (submerged(g)) {
        under = true;
        const hp = g.hp;
        shoot(w, g, p.id, 100);
        expect(g.hp).toBe(hp);
      }
      surfaced = w.events.some((ev) => ev.type === "surface");
    }
    expect(under).toBe(true);
    expect(surfaced).toBe(true);
    expect(dist(g.pos, p.pos)).toBeLessThan(40);
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});

describe("Orbital Deck", () => {
  it("plans its own family, layouts and the autopilot", () => {
    const w = createWorld({ seed: 3, biome: "orbital" });
    expect(w.arena.pads.length).toBeGreaterThan(0);
    expect(w.run.room.vents.some((v) => v.kind === "laser" && v.to)).toBe(true);
    expect(planRoom(w, roomSpec(w, "boss"), 0, 1).waves).toEqual([[BIOMES.orbital.boss]]);
    const rooms = [1, 2, 3, 4, 5].map((step) => planRoom(w, roomSpec(w, "combat", { step }), 0, 1));
    const ids = [...w.run.plans, ...rooms].flatMap((p) => p.waves.flat()).map((id) => id.replace("!", "").split("@")[0]!);
    expect(ids.every((id) => ENEMIES[id]!.biomes.includes("orbital"))).toBe(true);
  });

  it("stepping onto a pad puts you on the other one, and you don't bounce straight back", () => {
    const w = quiet([{}], 1, "orbital");
    const p = w.players[0]!;
    const pad = w.arena.pads[0]!;
    p.pos = { x: pad.a.x - PAD.radius - 4, y: pad.a.y };
    let warps = 0;
    for (let t = 0; t < 8; t++) {
      step(w, [input({ move: { x: 1, y: 0 } })]);
      warps += w.events.filter((ev) => ev.type === "warp").length;
    }
    expect(warps).toBe(1);
    expect(dist(p.pos, pad.b)).toBeLessThan(PAD.radius + 30);
    // The client predicts the same jump with the same movement code.
    const snap = decodeSnapshot(encodeSnapshot(w, [], new Map())).world;
    expect(snap.arena.pads).toEqual(w.arena.pads);
  });

  it("pads need a few seconds to recharge before they take you again", () => {
    const w = quiet([{}], 1, "orbital");
    const p = w.players[0]!;
    const pad = w.arena.pads[0]!;
    const warpsStepping = (ticks: number) => {
      let warps = 0;
      for (let t = 0; t < ticks; t++) {
        // Step off whichever pad you're on, then straight back onto it.
        const on = dist(p.pos, pad.a) < dist(p.pos, pad.b) ? pad.a : pad.b;
        p.pos = { x: on.x - PAD.radius - 4, y: on.y };
        step(w, [input({ move: { x: 1, y: 0 } })]);
        step(w, [input({ move: { x: 1, y: 0 } })]);
        warps += w.events.filter((ev) => ev.type === "warp").length;
      }
      return warps;
    };
    expect(warpsStepping(1)).toBe(1);
    expect(p.padCd).toBeGreaterThan(0);
    expect(warpsStepping(5)).toBe(0);
    p.padCd = 0;
    expect(warpsStepping(1)).toBe(1);
    expect(decodeSnapshot(encodeSnapshot(w, [], new Map())).world.players[0]!.padCd).toBeCloseTo(p.padCd, 2);
  });

  it("laser fences hurt while they're on, and a dash goes through", () => {
    const fence = (dash: boolean) => {
      const w = quiet([{}], 1, "orbital");
      enterRoom(w, roomSpec(w, "combat", { step: 1 }));
      w.enemies = [];
      w.run.room.waves = [];
      const l = w.run.room.vents.find((v) => v.kind === "laser")!;
      w.run.room.vents = [l];
      l.t = l.periodS - l.eruptS + 0.1;
      const p = w.players[0]!;
      const mid = { x: (l.pos.x + l.to!.x) / 2, y: (l.pos.y + l.to!.y) / 2 };
      const across = { x: -(l.to!.y - l.pos.y), y: l.to!.x - l.pos.x };
      const n = Math.hypot(across.x, across.y);
      p.pos = { x: mid.x - (across.x / n) * 24, y: mid.y - (across.y / n) * 24 };
      const move = { x: across.x / n, y: across.y / n };
      step(w, [input({ move, dash })]);
      run(w, 15, [input({ move })]);
      return p.hp < p.maxHp;
    };
    expect(fence(false)).toBe(true);
    expect(fence(true)).toBe(false);
  });

  it("the autopilot's beams sweep across the room and crates block them", () => {
    const w = quiet([{}], 1, "orbital");
    const p = w.players[0]!;
    const b = dummy(w, "autopilot", 360, 220, 5000);
    b.cooldowns = b.cooldowns.map((_, i) => (i === 4 ? 0 : 99));
    p.pos = { x: 360, y: 330 };
    let swept = false;
    for (let t = 0; t < 30 * 5; t++) {
      run(w, 1, [EMPTY_INPUT]);
      if (b.state === "attack") swept = true;
    }
    expect(swept).toBe(true);
    expect(p.hp).toBeLessThan(p.maxHp);
    // A crate between the core and you stops a beam short.
    w.arena.obstacles = [{ x: 390, y: 200, w: 32, h: 40 }];
    expect(beamLength(w.arena, { x: 360, y: 220 }, { x: 1, y: 0 })).toBeLessThan(40);
  });
});

describe("Drowned Crypt", () => {
  /** A crypt fight with nothing in it yet. */
  const crypt = (players: PlayerOptions[] = [{}]) => {
    const w = quiet(players);
    enterRoom(w, roomSpec(w, "combat", { act: FINAL_ACT, biome: "crypt", step: 1 }));
    w.enemies = [];
    w.run.room.waves = [];
    w.run.room.cleared = true;
    return w;
  };

  it("plans its own family, dark rooms with candles, and the Night Auditor", () => {
    const w = createWorld({ seed: 3 });
    const rooms = [1, 2, 3, 4, 5].map((step) => planRoom(w, roomSpec(w, "combat", { act: FINAL_ACT, biome: "crypt", step }), 0, 1));
    const ids = rooms.flatMap((p) => p.waves.flat()).map((id) => id.replace("!", "").split("@")[0]!);
    expect(ids.every((id) => ENEMIES[id]!.biomes.includes("crypt"))).toBe(true);
    expect(planRoom(w, roomSpec(w, "boss", { act: FINAL_ACT, biome: "crypt" }), 0, 1).waves).toEqual([["night_auditor"]]);
    const c = crypt();
    expect(roomDark(c.run.room)).toBe(true);
    // Half the candles are already burning when you walk in.
    const lit = c.run.room.candles.filter((k) => k.litT > 0).length;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(c.run.room.candles.length);
    // Candles reach co-op clients.
    const snap = decodeSnapshot(encodeSnapshot(c, [], new Map())).world;
    expect(snap.run.room.candles.map((k) => k.litT > 0)).toEqual(c.run.room.candles.map((k) => k.litT > 0));
  });

  it("a shot lights a candle, and candlelight exposes whatever stands in it", () => {
    const w = crypt();
    for (const k of w.run.room.candles) k.litT = 0;
    const candle = w.run.room.candles[0]!;
    const p = w.players[0]!;
    w.projectiles.push({
      id: 9999, owner: "player", ownerId: p.id, kind: "pistol", element: "none", pos: { x: candle.pos.x - 12, y: candle.pos.y }, vel: { x: 300, y: 0 },
      radius: 2, damage: 1, pierce: 0, bounces: 0, knockback: 0, life: 1, hitIds: [], gunUid: -1,
    });
    run(w, 3);
    expect(candle.litT).toBeGreaterThan(0);
    // The same hit does more in the light than out of it.
    const lit = dummy(w, "zombie_porter", candle.pos.x + 10, candle.pos.y, 1000);
    const far = dummy(w, "zombie_porter", 40, 60, 1000);
    for (const k of w.run.room.candles.slice(1)) k.litT = 0;
    shoot(w, lit, p.id, 100);
    shoot(w, far, p.id, 100);
    expect((1000 - lit.hp) / (1000 - far.hp)).toBeCloseTo(CRYPT.exposed, 2);
  });

  it("gargoyles are stone in the dark, and take full damage once lit", () => {
    const w = crypt();
    for (const k of w.run.room.candles) k.litT = 0;
    const p = w.players[0]!;
    const g = dummy(w, "gargoyle_bellhop", 40, 60, 1000);
    shoot(w, g, p.id, 100);
    expect(1000 - g.hp).toBeCloseTo(100 * CRYPT.stone, 1);
    // Bring your glow over to it.
    p.pos = { x: 70, y: 70 };
    shoot(w, g, p.id, 100);
    expect(1000 - g.hp).toBeCloseTo(100 * CRYPT.stone + 100, 1);
  });

  it("the Night Auditor's blackout puts every light out while pages rain down", () => {
    const w = crypt();
    for (const k of w.run.room.candles) k.litT = 10;
    const b = dummy(w, "night_auditor", 360, 200, 5000);
    b.cooldowns = b.cooldowns.map((_, i) => (i === 4 ? 0 : 99));
    for (let t = 0; t < 30 * 3 && w.run.room.blackoutT <= 0; t++) run(w, 1);
    expect(w.run.room.blackoutT).toBeGreaterThan(0);
    expect(w.run.room.candles.every((k) => k.litT === 0)).toBe(true);
    expect(w.projectiles.filter((pr) => pr.kind === "page").length).toBeGreaterThanOrEqual(14);
    // Nothing lights during a blackout.
    lightCandles(w, w.run.room.candles[0]!.pos, 10);
    expect(w.run.room.candles[0]!.litT).toBe(0);
  });

  it("a Bell Ringer's toll blows out the candles around it", () => {
    const w = crypt();
    const candle = w.run.room.candles[0]!;
    candle.litT = 10;
    const r = dummy(w, "bell_ringer", candle.pos.x + 30, candle.pos.y);
    r.cooldowns = [0, 99];
    run(w, 30 * 2);
    expect(candle.litT).toBe(0);
  });

  it("the Banshee goes after whoever strayed from the group", () => {
    const w = crypt([{}, {}, {}]);
    const [a, b, c] = w.players as [Player, Player, Player];
    a.pos = { x: 360, y: 300 };
    b.pos = { x: 380, y: 300 };
    c.pos = { x: 640, y: 80 };
    const e = dummy(w, "banshee_guide", 360, 200);
    let aimed = false;
    for (let t = 0; t < 30 * 4 && !aimed; t++) {
      run(w, 1);
      const to = { x: c.pos.x - e.pos.x, y: c.pos.y - e.pos.y };
      const n = Math.hypot(to.x, to.y);
      if (e.state === "windup" && (e.attackDir.x * to.x + e.attackDir.y * to.y) / n > 0.8) aimed = true;
    }
    expect(aimed).toBe(true);
  });
});

describe("grabbers", () => {
  /** A Claw Machine right next to you, about to grab. */
  const grabbed = (players: PlayerOptions[] = [{}]) => {
    const w = quiet(players);
    const p = w.players[0]!;
    p.pos = { x: 330, y: 300 };
    w.players.slice(1).forEach((o, i) => (o.pos = { x: 500 + i * 30, y: 100 }));
    const g = dummy(w, "claw_machine", 300, 300, 1000);
    g.cooldowns = [0];
    for (let t = 0; t < 60 && !p.pinnedBy; t++) run(w, 1);
    expect(p.pinnedBy).toBe(g.id);
    return { w, p, g };
  };
  const freedBy = (w: World) => (w.events.find((ev) => ev.type === "freed") as { by: number } | undefined)?.by;

  it("every biome has one, and they turn up from act 2 on", () => {
    for (const b of BIOME_IDS) expect(Object.values(ENEMIES).some((d) => d.role === "grabber" && d.threatCost > 0 && d.biomes.includes(b))).toBe(true);
    const w = createWorld({ seed: 4 });
    const grabbers = (act: number) =>
      [1, 2, 3, 4, 5, 6]
        .flatMap((step) => planCombatWaves(w, roomSpec(w, "combat", { act, step, biome: "sewers" }), 0, 1).flat())
        .filter((id) => ENEMIES[id.replace("!", "").split("@")[0]!]!.role === "grabber").length;
    expect(grabbers(0)).toBe(0);
    expect(grabbers(1)).toBeGreaterThan(0);
    expect(grabbers(4)).toBeGreaterThan(0);
  });

  it("pins you: no moving or shooting, it squeezes, and nobody helping gets you thrown", () => {
    const { w, p, g } = grabbed();
    const hp = p.hp;
    let shots = 0;
    let thrown = false;
    for (let t = 0; t < 30 * 5 && !thrown; t++) {
      step(w, [input({ move: { x: 0, y: 1 }, fire: true, autoAim: true })]);
      shots += w.events.filter((ev) => ev.type === "shot").length;
      // Held right in front of it, however hard you push the stick.
      if (p.pinnedBy) expect(dist(p.pos, g.pos)).toBeLessThan(g.radius + p.radius + 1);
      thrown = freedBy(w) === -2;
    }
    expect(shots).toBe(0);
    expect(thrown).toBe(true);
    expect(p.hp).toBeLessThan(hp);
    expect(p.pinnedBy).toBe(0);
  });

  it("a teammate standing next to you pulls you free, and the grabber is left dazed", () => {
    const { w, p, g } = grabbed([{}, {}]);
    const friend = w.players[1]!;
    friend.pos = { x: p.pos.x, y: p.pos.y + 14 };
    let by: number | undefined;
    for (let t = 0; t < 30 && by === undefined; t++) {
      run(w, 1);
      by = freedBy(w);
    }
    expect(by).toBe(friend.id);
    expect(p.pinnedBy).toBe(0);
    expect(g.stunT).toBeGreaterThan(0);
  });

  it("on your own, mashing dash breaks you free before the throw", () => {
    const { w, p } = grabbed();
    let by: number | undefined;
    for (let t = 0; t < 30 * 3 && by === undefined; t++) {
      step(w, [input({ dash: t % 3 === 0 })]);
      by = freedBy(w);
    }
    expect(by).toBe(-1);
    expect(p.pinnedBy).toBe(0);
  });

  it("enough damage to the grabber breaks its grip", () => {
    const { w, p, g } = grabbed([{}, {}]);
    shoot(w, g, w.players[1]!.id, 0.35 * g.maxHp);
    run(w, 2);
    expect(p.pinnedBy).toBe(0);
    expect(g.stunT).toBeGreaterThan(0);
  });

  it("a Claims Agent hooks you from across the room and reels you in for the hold", () => {
    const w = quiet([{}]);
    const p = w.players[0]!;
    p.pos = { x: 440, y: 300 };
    const g = dummy(w, "claims_agent", 300, 300, 1000);
    g.cooldowns = [0];
    for (let t = 0; t < 60 && !p.pinnedBy; t++) run(w, 1);
    expect(p.pinnedBy).toBe(g.id);
    expect(dist(p.pos, g.pos)).toBeGreaterThan(60);
    for (let t = 0; t < 60 && g.attackPoints.length > 0; t++) run(w, 1);
    expect(p.pinnedBy).toBe(g.id);
    expect(dist(p.pos, g.pos)).toBeLessThan(g.radius + p.radius + 1);
  });

  it("dashing through a hook dodges it", () => {
    const w = quiet([{}]);
    const p = w.players[0]!;
    p.pos = { x: 440, y: 300 };
    const g = dummy(w, "claims_agent", 300, 300, 1000);
    g.cooldowns = [0];
    let thrown = false;
    for (let t = 0; t < 60; t++) {
      p.iframes = 0.5;
      run(w, 1);
      thrown ||= g.state === "attack";
    }
    expect(thrown).toBe(true);
    expect(p.pinnedBy).toBe(0);
  });

  it("co-op clients know who's pinned, and don't predict them moving", () => {
    const { w, p } = grabbed();
    const snap = decodeSnapshot(encodeSnapshot(w, [], new Map())).world;
    const me = snap.players.find((x) => x.id === p.id)!;
    expect(me.pinnedBy).toBe(p.pinnedBy);
    const before = { ...me.pos };
    expect(stepMovement(snap, me, input({ move: { x: 1, y: 0 }, dash: true }))).toBe(false);
    expect(me.pos).toEqual(before);
  });
});

describe("boss signatures", () => {
  it("every boss has an attack no other boss has", () => {
    const bosses = Object.values(ENEMIES).filter((d) => d.role === "boss");
    expect(bosses.length).toBe(BIOME_IDS.length);
    const sig = (d: (typeof bosses)[number]) => d.attacks.map((a) => (a.type === "lobbedProjectile" && a.cross ? "cross" : a.type));
    for (const d of bosses) {
      const others = new Set(bosses.filter((o) => o !== d).flatMap(sig));
      expect(sig(d).some((t) => !others.has(t))).toBe(true);
    }
  });

  it("the Foreman's Slag Cross marches out in lines and leaves burning slag", () => {
    const w = quiet([{}], 1, "foundry");
    const p = w.players[0]!;
    p.pos = { x: 360, y: 360 };
    const f = dummy(w, "furnace_foreman", 360, 200, 5000);
    f.cooldowns = f.cooldowns.map((_, i) => (i === 7 ? 0 : 99));
    run(w, 3);
    expect(f.attackPoints.length).toBeGreaterThan(12);
    // One arm aims at you.
    expect(f.attackPoints.some((pt) => Math.abs(pt.x - 360) < 2 && pt.y > 300)).toBe(true);
    run(w, 30 * 3);
    expect(w.hazards.some((h) => h.kind === "fire" && h.owner === "enemy")).toBe(true);
  });
});

describe("signature powers", () => {
  it("only work on their own hero", () => {
    const w = createWorld({ seed: 1, players: [{ heroId: "vanguard", signature: "sig_sixshooter" }, { heroId: "gunslinger", signature: "sig_sixshooter" }] });
    expect(w.players[0]!.signature).toBe("");
    expect(w.players[1]!.signature).toBe("sig_sixshooter");
  });

  it("Six Shooter fires six seeking shots and marks nobody", () => {
    const w = quiet([{ heroId: "gunslinger", signature: "sig_sixshooter" }]);
    const p = w.players[0]!;
    dummy(w, "slag_golem", p.pos.x + 60, p.pos.y - 30);
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    expect(w.projectiles.filter((pr) => pr.ownerId === p.id).length).toBe(6);
    expect(w.enemies[0]!.markT).toBe(0);
  });

  it("Black Hole Dome pulls enemies in instead of keeping them out", () => {
    const w = quiet([{ heroId: "vanguard", signature: "sig_blackhole" }]);
    const p = w.players[0]!;
    const e = dummy(w, "slag_golem", p.pos.x + 50, p.pos.y);
    e.cooldowns = e.cooldowns.map(() => 99);
    p.skillCharge = 1;
    step(w, [input({ skill: true })]);
    run(w, 30);
    expect(Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y)).toBeLessThan(w.domes[0]!.radius);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it("come only from co-op, and can be equipped only on their hero once owned", () => {
    const base = { mode: "solo" as const, heroId: "gunslinger", tier: 0, victory: true, rooms: 5, kills: 40, guns: [], hand: [], day: "", signature: "sig_sixshooter" };
    let p = newProfile("A");
    p = applyAction(p, { type: "hero", id: "h", heroId: "gunslinger" }).profile;
    expect(p.heroId).toBe("gunslinger");
    expect(p.heroes.gunslinger!.level).toBe(1);
    p = applyAction(p, { type: "run", id: "r1", result: base }).profile;
    expect(p.signatures).toEqual([]);
    const r = applyAction(p, { type: "run", id: "r2", result: { ...base, mode: "coop" } });
    p = r.profile;
    expect(r.reward!.signature).toBe("sig_sixshooter");
    expect(p.signatures).toEqual(["sig_sixshooter"]);
    p = applyAction(p, { type: "signature", id: "s1", heroId: "vanguard", signature: "sig_sixshooter" }).profile;
    expect(p.heroes.vanguard!.signature).toBeUndefined();
    p = applyAction(p, { type: "signature", id: "s2", heroId: "gunslinger", signature: "sig_sixshooter" }).profile;
    expect(playerOptions(p).signature).toBe("sig_sixshooter");
    p = applyAction(p, { type: "signature", id: "s3", heroId: "gunslinger", signature: "" }).profile;
    expect(playerOptions(p).signature).toBeUndefined();
    expect(Object.keys(SIGNATURES).length).toBe(8);
  });
});

describe("net codec for phase 5", () => {
  it("round-trips gadgets, marks, elites, slush and the biome", () => {
    const w = quiet([{ heroId: "tinker" }, { heroId: "warden", signature: "sig_flock" }], 5, "caverns");
    w.run.coop = true;
    const [tk, wd] = w.players;
    tk!.guns[0] = newGun(w, "pistol", "rare", "acid");
    tk!.skillCharge = 1;
    wd!.skillCharge = 1;
    wd!.shield = 12.5;
    const e = spawnEnemy(w, "curling_golem", { x: 200, y: 200 }, 0, "teleporting");
    e.markT = 3;
    e.markBy = tk!.id;
    e.blinkTo = { x: 210, y: 220 };
    const s = spawnEnemy(w, "jet_boar", { x: 300, y: 200 }, 0, "splitting");
    s.size = 0.75;
    w.hazards.push({ id: 77, kind: "ice", owner: "enemy", pos: { x: 50, y: 50 }, radius: 16, t: 3, maxT: 5, damage: 0 });
    step(w, [input({ skill: true }), input({ skill: true })]);
    const { world: d } = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w, [], new Map()))));
    expect(d.run.biome).toBe("caverns");
    expect(d.arena.ice).toBe(true);
    expect(d.arena.spikes).toEqual(w.arena.spikes);
    expect(d.gadgets.map((g) => [g.id, g.kind, g.ownerId, g.element])).toEqual(w.gadgets.map((g) => [g.id, g.kind, g.ownerId, g.element]));
    expect(d.gadgets.filter((g) => g.kind === "drone").length).toBe(3);
    expect(d.players[1]!.signature).toBe("sig_flock");
    expect(d.players[1]!.shield).toBeCloseTo(12.5, 0);
    const de = d.enemies.find((x) => x.id === e.id)!;
    expect([de.elite, de.markBy]).toEqual(["teleporting", tk!.id]);
    expect(de.markT).toBeCloseTo(e.markT, 1);
    expect(de.blinkTo!.x).toBeCloseTo(e.blinkTo!.x, 0);
    const ds = d.enemies.find((x) => x.id === s.id)!;
    expect(ds.size).toBeCloseTo(0.75);
    expect(ds.radius).toBeLessThan(ENEMIES.jet_boar!.radius);
    expect(d.hazards.find((h) => h.id === 77)!.kind).toBe("ice");
  });
});

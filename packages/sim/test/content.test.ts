import { describe, expect, it } from "vitest";
import {
  applyAction,
  BIOMES,
  createWorld,
  decodeSnapshot,
  EMPTY_INPUT,
  encodeSnapshot,
  ENEMIES,
  enterRoom,
  HEROES,
  newProfile,
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
import { damageEnemy, hurtPlayer, spawnEnemy } from "../src/combat";
import { linkPairs } from "../src/elites";
import { newGun } from "../src/loot";

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

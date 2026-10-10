import { describe, expect, it } from "vitest";
import {
  addPlayer,
  createWorld,
  decodeInput,
  decodeSnapshot,
  EMPTY_INPUT,
  encodeInput,
  encodeSnapshot,
  enterRoom,
  ENEMIES,
  EXIT_WAIT_S,
  levelMultiplier,
  removePlayer,
  step,
  stepMovement,
  decodeEvent,
  encodeEvent,
  type PlayerInput,
  type SimEvent,
  type World,
} from "../src";
import { spawnEnemy } from "../src/combat";
import { newGun } from "../src/loot";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });

function run(w: World, ticks: number, inputs: PlayerInput[] = []) {
  for (let i = 0; i < ticks; i++) step(w, inputs);
}

/** A co-op world with no waves, vents or pickups. */
function quietCoop(n: number, seed = 1, coop = true): World {
  const w = createWorld({ seed, coop, players: Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` })) });
  w.run.room.waves = [];
  w.run.room.vents = [];
  w.run.room.cleared = true;
  w.run.victory = true; // keeps the exit shut
  w.enemies = [];
  w.pickups = [];
  return w;
}

/** A rat that never dies, parked on top of a player. */
function biter(w: World, x: number, y: number) {
  const rat = spawnEnemy(w, "cone_rat", { x: x + 8, y }, 0);
  rat.hp = 1e9;
  return rat;
}

describe("co-op", () => {
  it("spawns the party side by side, each driven by their own input", () => {
    const w = quietCoop(3);
    const [a, b, c] = w.players;
    expect(new Set(w.players.map((p) => p.pos.x)).size).toBe(3);
    expect(w.players.map((p) => p.slot)).toEqual([0, 1, 2]);
    const before = w.players.map((p) => ({ ...p.pos }));
    run(w, 10, [input({ move: { x: 1, y: 0 } }), EMPTY_INPUT, input({ move: { x: -1, y: 0 } })]);
    expect(a!.pos.x).toBeGreaterThan(before[0]!.x);
    expect(b!.pos.x).toBe(before[1]!.x);
    expect(c!.pos.x).toBeLessThan(before[2]!.x);
  });

  it("a downed player waits for a teammate, who revives them by standing close", () => {
    const w = quietCoop(2);
    const [a, b] = w.players;
    a!.hp = 1;
    const rat = biter(w, a!.pos.x, a!.pos.y);
    run(w, 60);
    expect(a!.downed).toBe(true);
    expect(a!.reviveT).toBe(Infinity); // no Second Wind spent while a friend is up
    expect(a!.selfRevives).toBe(1);
    w.enemies = w.enemies.filter((e) => e !== rat);

    b!.pos = { x: a!.pos.x + 10, y: a!.pos.y };
    run(w, 30);
    expect(a!.downed).toBe(true);
    expect(a!.reviveProgress).toBeGreaterThan(0.3);
    run(w, 60);
    expect(a!.downed).toBe(false);
    expect(a!.hp).toBe(Math.round(a!.maxHp * 0.4));
  });

  it("revive progress drains when the helper walks away", () => {
    const w = quietCoop(2);
    const [a, b] = w.players;
    a!.downed = true;
    a!.reviveT = Infinity;
    b!.pos = { x: a!.pos.x + 10, y: a!.pos.y };
    run(w, 30);
    const p = a!.reviveProgress;
    b!.pos = { x: a!.pos.x + 200, y: a!.pos.y };
    run(w, 30);
    expect(a!.reviveProgress).toBeLessThan(p);
    expect(a!.reviveProgress).toBeGreaterThan(0);
  });

  it("when the whole party is down, Second Wind goes to someone who still has it, then the run ends", () => {
    const w = quietCoop(2);
    const [a, b] = w.players;
    a!.selfRevives = 0;
    // Far apart, so the one who gets back up can't just pick the other up.
    a!.pos = { x: 100, y: 300 };
    b!.pos = { x: 600, y: 300 };
    for (const p of [a!, b!]) {
      p.hp = 1;
      biter(w, p.pos.x, p.pos.y);
    }
    const seen: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      step(w, []);
      seen.push(...w.events);
    }
    expect(seen.some((e) => e.type === "secondWind" && e.id === b!.id)).toBe(true);
    expect(w.gameOver).toBe(false);
    run(w, 100);
    expect(b!.downed).toBe(false);
    b!.hp = 1;
    run(w, 200);
    expect(w.gameOver).toBe(true);
  });

  it("players who are away are ignored by enemies and don't keep a wiped run alive", () => {
    const w = quietCoop(2);
    const [a, b] = w.players;
    b!.away = true;
    biter(w, b!.pos.x, b!.pos.y);
    run(w, 60);
    expect(b!.hp).toBe(b!.maxHp);

    a!.selfRevives = 0;
    a!.hp = 1;
    biter(w, a!.pos.x, a!.pos.y);
    run(w, 60);
    expect(w.gameOver).toBe(true);
  });

  it("level sync puts every co-op player at the tier's level, while solo uses your own", () => {
    const coop = createWorld({ seed: 1, coop: true, tier: 0, players: [{ level: 3 }, { level: 30 }] });
    expect(coop.players[0]!.syncLevel).toBe(10);
    expect(coop.players[1]!.syncLevel).toBe(10);
    expect(coop.players[0]!.maxHp).toBe(coop.players[1]!.maxHp);

    const low = createWorld({ seed: 1, players: [{ level: 1 }] });
    const high = createWorld({ seed: 1, players: [{ level: 30 }] });
    expect(high.players[0]!.maxHp).toBeGreaterThan(low.players[0]!.maxHp);
    // The golden rule: a maxed hero is at most ~20% stronger in raw numbers.
    expect(levelMultiplier(30)).toBeLessThanOrEqual(1.2);
  });

  it("level sync scales shot damage", () => {
    const shot = (level: number) => {
      const w = quietCoop(1, 1, false);
      w.players[0]!.level = w.players[0]!.syncLevel = level;
      step(w, [input({ fire: true, aim: { x: 50, y: 0 } })]);
      return w.projectiles[0]!.damage;
    };
    expect(shot(30) / shot(1)).toBeCloseTo(levelMultiplier(30), 5);
  });

  it("enemy health and room budgets scale with the party", () => {
    const solo = quietCoop(1);
    const duo = quietCoop(4);
    const rat1 = spawnEnemy(solo, "cone_rat", { x: 100, y: 100 }, 0);
    const rat4 = spawnEnemy(duo, "cone_rat", { x: 100, y: 100 }, 0);
    expect(rat4.maxHp).toBeGreaterThan(rat1.maxHp);
    const boss1 = spawnEnemy(solo, "furnace_foreman", { x: 100, y: 100 }, 0);
    const boss4 = spawnEnemy(duo, "furnace_foreman", { x: 100, y: 100 }, 0);
    expect(boss4.maxHp / boss1.maxHp).toBeGreaterThan(rat4.maxHp / rat1.maxHp);

    const count = (w: World, room: number) => w.run.plans[room]!.waves.flat().filter((id) => ENEMIES[id.replace("!", "")]).length;
    const a = createWorld({ seed: 9, players: [{}] });
    const b = createWorld({ seed: 9, players: [{}, {}, {}, {}] });
    expect(count(b, 1)).toBeGreaterThan(count(a, 1));
    expect(count(b, 0)).toBeGreaterThan(count(a, 0));
  });

  it("re-plans a combat room for whoever is actually there when the party changed", () => {
    const w = createWorld({ seed: 4, coop: true, players: [{}] });
    const before = w.run.plans[1]!.waves.flat().length;
    addPlayer(w, { name: "late" });
    addPlayer(w, { name: "later" });
    enterRoom(w, 1);
    expect(w.run.plans[1]!.party).toBe(3);
    expect(w.run.plans[1]!.waves.flat().length).toBeGreaterThan(before);
  });

  it("the exit waits a few seconds for stragglers, or goes right away when everyone is there", () => {
    const w = quietCoop(2);
    w.run.victory = false;
    const [a, b] = w.players;
    const door = { x: w.run.room.exit.x + w.run.room.exit.w / 2, y: 4 };
    a!.pos = { ...door };
    step(w, []);
    expect(w.run.room.index).toBe(0);
    expect(w.run.room.exitT).toBeGreaterThan(0);
    run(w, Math.ceil(EXIT_WAIT_S * 30) + 2, [input({ move: { x: 0, y: -1 } })]);
    expect(w.run.room.index).toBe(1);

    const v = quietCoop(2);
    v.run.victory = false;
    v.players[0]!.pos = { ...door };
    v.players[1]!.pos = { x: door.x + 4, y: 4 };
    step(v, []);
    expect(v.run.room.index).toBe(1);
    void b;
  });

  it("drop-in players join next to a teammate, and leaving removes them", () => {
    const w = quietCoop(1);
    w.run.room.index = 2;
    const host = w.players[0]!;
    const p = addPlayer(w, { name: "Late" })!;
    expect(p.slot).toBe(1);
    expect(Math.hypot(p.pos.x - host.pos.x, p.pos.y - host.pos.y)).toBeLessThan(30);
    expect(p.guns[1]!.rarity).not.toBe("common");
    expect(w.events.some((e) => e.type === "playerJoined")).toBe(true);
    for (let i = 0; i < 3; i++) addPlayer(w, {});
    expect(w.players.length).toBe(4);
    expect(addPlayer(w, {})).toBeUndefined();
    removePlayer(w, p.id);
    expect(w.players.length).toBe(3);
    expect(addPlayer(w, {})!.slot).toBe(1);
  });
});

describe("net codec", () => {
  it("round-trips a busy world closely enough to render", () => {
    const w = createWorld({ seed: 77, coop: true, players: [{ name: "Ana", level: 4 }, { name: "Bo", level: 12 }] });
    enterRoom(w, 4); // the boss room has everything going on
    w.players[0]!.guns[0] = newGun(w, "smg", "epic", "shock", ["bounce", "extraPip"], "megamart");
    w.players[1]!.guns[1] = { ...newGun(w, "pistol", "legendary", "none", ["pierce"], "wizard"), legendary: "show_off" };
    w.players[0]!.boosts = { vampire: 2 };
    const inputs = [input({ fire: true, autoAim: true, move: { x: 0.5, y: -1 } }), input({ fire: true, autoAim: true, move: { x: -1, y: -0.4 } })];
    run(w, 200, inputs);
    const snap = encodeSnapshot(w, [], new Map([[w.players[0]!.id, 41]]));
    const { world: d, acks } = decodeSnapshot(JSON.parse(JSON.stringify(snap)));

    expect(acks.get(w.players[0]!.id)).toBe(41);
    expect(d.tick).toBe(w.tick);
    expect(d.run.room.index).toBe(4);
    expect(d.run.plans.map((p) => p.kind)).toEqual(w.run.plans.map((p) => p.kind));
    expect(d.arena.obstacles).toEqual(w.arena.obstacles);
    expect(d.players.length).toBe(2);
    w.players.forEach((p, i) => {
      const q = d.players[i]!;
      expect(q.id).toBe(p.id);
      expect(q.name).toBe(p.name);
      expect(q.pos.x).toBeCloseTo(p.pos.x, 0);
      expect(q.pos.y).toBeCloseTo(p.pos.y, 0);
      expect(q.hp).toBeCloseTo(p.hp, 0);
      expect(q.guns.map((g) => [g.uid, g.defId, g.element, g.rarity, g.perks, g.maker, g.legendary])).toEqual(p.guns.map((g) => [g.uid, g.defId, g.element, g.rarity, g.perks, g.maker, g.legendary]));
      expect(q.boosts).toEqual(p.boosts);
      expect(q.facing.x).toBeCloseTo(p.facing.x, 2);
    });
    expect(d.enemies.length).toBe(w.enemies.length);
    w.enemies.forEach((e, i) => {
      const q = d.enemies[i]!;
      expect([q.id, q.defId, q.state, q.attackIdx, q.phase]).toEqual([e.id, e.defId, e.state, e.attackIdx, e.phase]);
      expect(q.pos.x).toBeCloseTo(e.pos.x, 0);
      expect(q.hp).toBeCloseTo(Math.max(0, e.hp), 0);
      expect(q.attackPoints.length).toBe(e.attackPoints.length);
    });
    expect(d.projectiles.map((p) => [p.id, p.owner, p.kind, !!p.lob, !!p.special])).toEqual(w.projectiles.map((p) => [p.id, p.owner, p.kind, !!p.lob, !!p.special]));
    expect(d.pickups.map((p) => [p.id, p.kind, p.used])).toEqual(w.pickups.map((p) => [p.id, p.kind, p.used]));
    expect(d.run.room.vents.map((v) => v.id)).toEqual(w.run.room.vents.map((v) => v.id));
  });

  it("round-trips every event type", () => {
    const w = createWorld({ seed: 1 });
    const gun = { ...newGun(w, "sniper", "legendary", "fire", ["pierce"], "dwarfcorp"), legendary: "hot_take" };
    const events: SimEvent[] = [
      { type: "shot", playerId: 1, x: 10, y: 20, angle: 1.234, archetype: "smg", element: "shock" },
      { type: "charge", playerId: 1 },
      { type: "hit", x: 1, y: 2, targetId: 3, damage: 12, kill: true, element: "fire", weak: true, shield: false },
      { type: "enemyDied", x: 1, y: 2, id: 3, defId: "cone_rat" },
      { type: "explosion", x: 1, y: 2, radius: 30, owner: "enemy", element: "none" },
      { type: "chain", x1: 1, y1: 2, x2: 3, y2: 4 },
      { type: "frozen", id: 5 },
      { type: "shieldUp", id: 5 },
      { type: "shieldBroken", id: 5, x: 1, y: 2 },
      { type: "blocked", x: 1, y: 2 },
      { type: "domePulse", id: 5, x: 1, y: 2, radius: 56 },
      { type: "reflect", x: 1, y: 2 },
      { type: "spark", x: 1, y: 2 },
      { type: "enemyWindup", id: 5, attack: "dash" },
      { type: "enemyAttack", id: 5, attack: "slam" },
      { type: "reveal", id: 5 },
      { type: "split", id: 5, x: 1, y: 2 },
      { type: "bossPhase", id: 5, phase: 2 },
      { type: "bonk", id: 5, x: 1, y: 2 },
      { type: "ventWarn", id: 5 },
      { type: "ventErupt", id: 5, x: 1, y: 2 },
      { type: "playerHurt", id: 1, damage: 15 },
      { type: "spiked", x: 1, y: 2 },
      { type: "mark", id: 5, by: 1 },
      { type: "crit", x: 1, y: 2 },
      { type: "gadget", id: 9, kind: "drone", x: 1, y: 2, gone: true },
      { type: "gadgetHit", id: 9 },
      { type: "saved", id: 1 },
      { type: "blink", id: 5, x: 1, y: 2, done: false },
      { type: "relink", id: 5 },
      { type: "deflect", x: 1, y: 2 },
      { type: "playerDowned", id: 1, canRevive: true },
      { type: "secondWind", id: 1 },
      { type: "playerRevived", id: 1, by: 2 },
      { type: "playerJoined", id: 1 },
      { type: "playerLeft", id: 1 },
      { type: "dash", id: 1 },
      { type: "skill", id: 1, x: 1, y: 2 },
      { type: "grenade", id: 1 },
      { type: "swap", id: 1 },
      { type: "pickup", id: 1, gun },
      { type: "loot", x: 1, y: 2, rarity: "epic" },
      { type: "heal", id: 1, amount: 15 },
      { type: "shrine", id: 1, boost: "vampire" },
      { type: "chestOpened", x: 1, y: 2 },
      { type: "enemySpawn", id: 5 },
      { type: "waveStart", wave: 1, waves: 3 },
      { type: "roomCleared", index: 1 },
      { type: "roomEnter", index: 2, kind: "breather", rooms: 5 },
      { type: "victory" },
      { type: "gameOver" },
    ];
    for (const ev of events) expect(decodeEvent(JSON.parse(JSON.stringify(encodeEvent(ev))))).toEqual(ev);
  });

  it("round-trips input and rejects garbage", () => {
    const inp = input({ move: { x: 0.6, y: -0.8 }, aim: { x: 120, y: -40 }, fire: true, dash: true, interact: true, grenadeAim: { x: 5, y: 9 } });
    const back = decodeInput(encodeInput(7, inp))!;
    expect(back.seq).toBe(7);
    expect(back.input).toEqual(inp);
    expect(decodeInput("nope")).toBeUndefined();
    expect(decodeInput([1, "x", null, 1e9, NaN, 999, 0, 0])!.input.move).toEqual({ x: 0, y: 0 });
    expect(decodeInput([1, 1e9, 0, 0, 0, 0, 0, 0])!.input.move.x).toBe(1);
  });

  it("client prediction from a snapshot matches the server's own movement", () => {
    const w = quietCoop(1);
    const p = w.players[0]!;
    const moves = [input({ move: { x: 1, y: 0.3 } }), input({ move: { x: 1, y: 0.3 }, dash: true }), input({ move: { x: -0.2, y: -1 } })];
    run(w, 5, [moves[0]!]);
    const predicted = decodeSnapshot(encodeSnapshot(w, [], new Map())).world.players[0]!;
    for (let i = 0; i < 30; i++) {
      const inp = moves[Math.min(2, Math.floor(i / 10))]!;
      step(w, [inp]);
      stepMovement(w, predicted, inp);
    }
    // Only the quarter-pixel rounding of the starting snapshot separates them.
    expect(Math.abs(predicted.pos.x - p.pos.x)).toBeLessThan(0.2);
    expect(Math.abs(predicted.pos.y - p.pos.y)).toBeLessThan(0.2);
    expect(predicted.dashCd).toBeCloseTo(p.dashCd, 5);
  });
});

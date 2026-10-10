import { describe, expect, it } from "vitest";
import { createWorld, EMPTY_INPUT, GUNS, step, type PlayerInput, type World } from "../src";
import { makeEnemy } from "../src/enemies";

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...EMPTY_INPUT, ...over });

function run(w: World, ticks: number, inp: PlayerInput = EMPTY_INPUT) {
  for (let i = 0; i < ticks; i++) step(w, [inp]);
}

describe("sim", () => {
  it("is deterministic for the same seed and inputs", () => {
    const a = createWorld({ seed: 42 });
    const b = createWorld({ seed: 42 });
    const inp = input({ move: { x: 1, y: 0.3 }, fire: true, autoAim: true });
    run(a, 600, inp);
    run(b, 600, inp);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("spends one pip per trigger pull and reloads over time", () => {
    const w = createWorld({ seed: 1 });
    const p = w.players[0]!;
    step(w, [input({ fire: true, aim: { x: 50, y: 0 } })]);
    expect(p.guns[0]!.pips).toBeCloseTo(2, 0);
    run(w, 60);
    expect(p.guns[0]!.pips).toBe(GUNS.pistol!.pips);
  });

  it("dash grants i-frames against a lobbed hit", () => {
    const w = createWorld({ seed: 3 });
    const p = w.players[0]!;
    w.director.timer = 999; // no waves
    w.projectiles.push({
      id: 999, owner: "enemy", ownerId: 0, kind: "mortar", pos: { ...p.pos }, vel: { x: 0, y: 0 },
      radius: 4, damage: 15, pierce: 0, knockback: 0, life: 99, hitIds: [],
      lob: { from: { ...p.pos }, to: { ...p.pos }, t: 0, dur: 2 / 30, radius: 20 },
    });
    step(w, [input({ dash: true, move: { x: 1, y: 0 } })]);
    step(w, [EMPTY_INPUT]);
    expect(p.hp).toBe(p.maxHp);
  });

  it("downs the player once, self-revives, then ends the run", () => {
    const w = createWorld({ seed: 5 });
    const p = w.players[0]!;
    w.director.timer = 999;
    const rat = makeEnemy(w, "cone_rat", { x: p.pos.x + 8, y: p.pos.y }, 0);
    rat.hp = 1e9;
    w.enemies.push(rat);
    p.hp = 1;
    run(w, 40);
    expect(p.downed).toBe(true);
    run(w, 100);
    expect(p.downed).toBe(false);
    p.hp = 1;
    run(w, 200);
    expect(w.gameOver).toBe(true);
  });

  it("sniper pierces through a line of enemies", () => {
    const w = createWorld({ seed: 7 });
    const p = w.players[0]!;
    w.director.timer = 999;
    p.guns[0] = { defId: "sniper", element: "none", rarity: "common", pips: 3 };
    for (let i = 0; i < 3; i++) w.enemies.push(makeEnemy(w, "jet_boar", { x: p.pos.x + 40 + i * 30, y: p.pos.y }, 0));
    step(w, [input({ fire: true, aim: { x: 200, y: 0 } })]);
    run(w, 20);
    expect(w.enemies.every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it("starts waves and spawns enemies", () => {
    const w = createWorld({ seed: 9 });
    run(w, 30 * 4);
    expect(w.director.wave).toBe(1);
    expect(w.enemies.length).toBeGreaterThan(0);
  });
});

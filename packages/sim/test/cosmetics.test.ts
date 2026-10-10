import { describe, expect, it } from "vitest";
import {
  applyAction,
  cleanProfile,
  COSMETIC_IDS,
  COSMETICS,
  createWorld,
  DEFAULT_OUTFIT,
  newProfile,
  ownsCosmetic,
  runResult,
  type Action,
  type Profile,
  type RunResult,
} from "../src";

const result = (over: Partial<RunResult> = {}): RunResult => ({ mode: "solo", heroId: "vanguard", tier: 0, victory: true, rooms: 6, kills: 100, guns: [], hand: [], day: "2026-10-10", biome: "foundry", ...over });
const act = (p: Profile, a: Action) => applyAction(p, a);

describe("cosmetics", () => {
  it("everyone starts with the starters and a plain outfit", () => {
    const p = newProfile();
    expect(p.outfit).toEqual(DEFAULT_OUTFIT);
    expect(p.cosmetics).toEqual([]);
    expect(ownsCosmetic(p, "hat_party")).toBe(true);
    expect(ownsCosmetic(p, "hat_cone")).toBe(false);
    expect(ownsCosmetic(p, "not_a_thing")).toBe(false);
  });

  it("the first win of each adventure and tier gives its cosmetic, once", () => {
    let p = newProfile();
    const loss = act(p, { type: "run", id: "l", result: result({ victory: false }) });
    expect(loss.reward!.cosmetics).toBeUndefined();
    const win = act(p, { type: "run", id: "w1", result: result() });
    expect(win.reward!.cosmetics).toContain("hat_cone");
    p = win.profile;
    expect(p.clears).toEqual(["foundry:0"]);
    expect(p.newCosmetics).toContain("hat_cone");
    expect(act(p, { type: "run", id: "w2", result: result() }).reward!.cosmetics ?? []).not.toContain("hat_cone");
    p = act(p, { type: "run", id: "w3", result: result({ biome: "caverns", tier: 2 }) }).profile;
    expect(p.cosmetics).toContain("hat_iceberg");
  });

  it("wins sometimes drop one, the same way on every device", () => {
    const drops = COSMETIC_IDS.filter((id) => COSMETICS[id]!.unlock.kind === "drop");
    let got = 0;
    let p = newProfile();
    p.clears = ["foundry:0"];
    for (let i = 0; i < 200; i++) {
      const a: Action = { type: "run", id: `d${i}`, result: result() };
      const r = act(p, a);
      // Same action, same answer: the server and the phone agree.
      expect(act(p, a).reward!.cosmetics).toEqual(r.reward!.cosmetics);
      got += r.reward!.cosmetics?.length ?? 0;
      p = r.profile;
    }
    // About 12% of solo wins until the pool runs out.
    expect(got).toBeGreaterThan(5);
    expect(drops.every((id) => p.cosmetics.includes(id))).toBe(true);
    expect(new Set(p.cosmetics).size).toBe(p.cosmetics.length);
  });

  it("milestones unlock from stats and levels", () => {
    let p = newProfile();
    p.stats.wins = 9;
    p = act(p, { type: "run", id: "m1", result: result({ kills: 0 }) }).profile;
    expect(p.cosmetics).toContain("emote_floss");
    p.heroes.vanguard = { level: 30, xp: 0, skills: [] };
    p = act(p, { type: "scrap", id: "s", gunIds: [] }).profile;
    expect(p.cosmetics).toContain("hat_crown");
  });

  it("only owned items can be worn, emotes can't be taken off, and the wardrobe clears its badges", () => {
    let p = newProfile();
    p = act(p, { type: "outfit", id: "o1", slot: "hat", cosmetic: "hat_cone" }).profile;
    expect(p.outfit.hat).toBe("");
    p = act(p, { type: "outfit", id: "o2", slot: "hat", cosmetic: "trail_confetti" }).profile;
    expect(p.outfit.hat).toBe("");
    p = act(p, { type: "outfit", id: "o3", slot: "hat", cosmetic: "hat_party" }).profile;
    expect(p.outfit.hat).toBe("hat_party");
    p = act(p, { type: "outfit", id: "o4", slot: "hat", cosmetic: "" }).profile;
    expect(p.outfit.hat).toBe("");
    p = act(p, { type: "outfit", id: "o5", slot: "emote", cosmetic: "" }).profile;
    expect(p.outfit.emote).toBe("emote_wave");
    p = act(p, { type: "run", id: "w", result: result() }).profile;
    expect(p.newCosmetics.length).toBeGreaterThan(0);
    expect(act(p, { type: "seenWardrobe", id: "s" }).profile.newCosmetics).toEqual([]);
  });

  it("cleans hostile saves and old profiles without cosmetics", () => {
    const old = cleanProfile({ name: "OLD", heroes: { vanguard: { level: 3, xp: 0, skills: [] } } });
    expect(old.outfit).toEqual(DEFAULT_OUTFIT);
    expect(old.clears).toEqual([]);
    const bad = cleanProfile({ cosmetics: ["hat_cone", "hat_party", "hat_fake", 7], newCosmetics: ["hat_crown"], outfit: { hat: "hat_crown", trail: "trail_confetti", skin: 3, emote: "" }, clears: ["foundry:0", "x", "caverns:9"] });
    // Starters aren't stored, unknown ids are dropped, and you can't wear what you don't own.
    expect(bad.cosmetics).toEqual(["hat_cone"]);
    expect(bad.newCosmetics).toEqual([]);
    expect(bad.outfit).toEqual({ hat: "", trail: "trail_confetti", skin: "", emote: "emote_wave" });
    expect(bad.clears).toEqual(["foundry:0"]);
  });

  it("a run's result says which adventure it was", () => {
    const w = createWorld({ seed: 1, players: [{}], biome: "caverns" });
    expect(runResult(w, w.players[0]!, { mode: "solo", day: "2026-10-10" }).biome).toBe("caverns");
  });
});

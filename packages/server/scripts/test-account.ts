// A maxed-out account for trying things: every hero at the level cap (skill points unspent), every souvenir
// at full rank, an armory with every legendary and mythic, every grenade and relic, and the whole wardrobe.
// Run with `npm run test-account` (optionally `-- NAME PASSWORD`). Running it again resets the profile.
// Defaults: name TESTER, password tester123. Writes to DB_PATH or data/lostluggage.db, like the server.
import {
  ADVENTURE_IDS,
  COSMETIC_IDS,
  ELEMENT_INFO,
  GRENADE_IDS,
  GUNS,
  HERO_IDS,
  LEGENDARY_IDS,
  MAX_LEVEL,
  MYTHIC_GRENADE_IDS,
  MYTHIC_GUN_IDS,
  MYTHIC_RELIC_IDS,
  RELIC_IDS,
  SIGNATURE_IDS,
  SOUVENIRS,
  SOUVENIR_IDS,
  cleanProfile,
  createWorld,
  gunData,
  isStarter,
  mythicItem,
  newProfile,
  randomId,
  rollGun,
  type Element,
  type GunData,
  type StashGrenade,
  type StashGun,
  type StashRelic,
} from "@lostluggage/sim";
import { cleanUsername, getDb } from "../src/db";

const username = cleanUsername(process.argv[2] ?? "TESTER");
const password = process.argv[3] ?? "tester123";
if (!username) throw new Error("Names are 3-10 letters or digits");

const db = getDb();
const account = db.register(username, password) ?? db.login(username, password);
if (!account) throw new Error(`${username} exists with a different password`);

const w = createWorld({ seed: 7 });
const stash = (g: GunData): StashGun => ({ ...gunData(g), id: randomId(), new: true });

// An epic of every gun in every element, with perks that suit it.
const elements = Object.keys(ELEMENT_INFO) as Element[];
const epics: StashGun[] = [];
for (const defId of Object.keys(GUNS)) {
  for (const element of elements) {
    let g = rollGun(w, 0, "epic");
    while (g.defId !== defId || g.rarity !== "epic") g = rollGun(w, 0, "epic");
    epics.push(stash({ ...gunData(g), element }));
  }
}
// Every legendary once.
const legendaries = new Map<string, StashGun>();
while (legendaries.size < LEGENDARY_IDS.length) {
  const g = rollGun(w, 0, "legendary");
  if (g.legendary && !legendaries.has(g.legendary)) legendaries.set(g.legendary, stash(g));
}
const mythicGuns = MYTHIC_GUN_IDS.map((id) => {
  const m = mythicItem(w, id);
  if (!("gun" in m)) throw new Error(`${id} isn't a gun`);
  return stash(m.gun);
});
const grenades: StashGrenade[] = [
  ...GRENADE_IDS.map((defId) => ({ id: randomId(), defId, rarity: "legendary" as const, new: true })),
  ...MYTHIC_GRENADE_IDS.map((defId) => ({ id: randomId(), defId, rarity: "mythic" as const, new: true })),
];
const relics: StashRelic[] = [
  ...RELIC_IDS.map((defId) => ({ id: randomId(), defId, rarity: "legendary" as const, new: true })),
  ...MYTHIC_RELIC_IDS.map((defId) => ({ id: randomId(), defId, rarity: "mythic" as const, new: true })),
];

const p = newProfile(username);
for (const id of HERO_IDS) p.heroes[id] = { level: MAX_LEVEL, xp: 0, skills: [] };
p.stash = [...mythicGuns, ...legendaries.values(), ...epics];
p.loadout = [mythicGuns[0]!.id, [...legendaries.values()][0]!.id];
p.grenades = grenades;
p.grenade = grenades[grenades.length - 1]!.id;
p.relics = relics;
p.relic = relics[relics.length - 1]!.id;
for (const id of SOUVENIR_IDS) p.souvenirs[id] = SOUVENIRS[id].maxRanks;
p.signatures = [...SIGNATURE_IDS];
p.cosmetics = COSMETIC_IDS.filter((id) => !isStarter(id));
p.newCosmetics = [...p.cosmetics];
p.clears = ADVENTURE_IDS.flatMap((b) => [0, 1, 2].map((t) => `${b}:${t}`));
p.stats = { runs: 500, wins: 200, kills: 100_000, legendaries: 100, mythics: 25 };

// Through the same repair the server does on every read, so nothing here is something the game wouldn't accept.
const clean = cleanProfile(p, username);
db.saveProfile(account.id, clean);
console.log(
  `${username}: ${HERO_IDS.length} heroes at level ${MAX_LEVEL}, ${clean.stash.length} guns, ${clean.grenades.length} grenades, ${clean.relics.length} relics, ` +
    `${Object.keys(clean.souvenirs).length} souvenirs maxed, ${clean.signatures.length} signatures, ${clean.cosmetics.length} cosmetics`,
);
db.close();

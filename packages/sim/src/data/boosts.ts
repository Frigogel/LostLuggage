import type { BoostId, Element, Player } from "../types";

// Run boosts: picked one of three after most rooms, gone when the run ends (design doc: Run boosts).
// Each player gets their own offers, leaning toward what they already have, so builds snowball into combos and
// no two heroes in a party end up the same. Tags drive that lean; a few epics need a tag before they're offered.

export type BoostTag = "fire" | "frost" | "shock" | "acid" | "shot" | "crit" | "kill" | "dash" | "tank" | "skill" | "grenade" | "coop";
export type BoostRarity = "common" | "rare" | "epic";

export interface BoostDef {
  id: BoostId;
  name: string;
  /** What it does, plainly, per stack. */
  text: string;
  rarity: BoostRarity;
  tags: BoostTag[];
  /** Most stack; this is how far. */
  max: number;
  /** Only offered once you have a boost (or gun element) with this tag. */
  needs?: BoostTag;
}

const b = (id: string, name: string, text: string, rarity: BoostRarity, tags: BoostTag[], max = 3, needs?: BoostTag): BoostDef => ({ id, name, text, rarity, tags, max, needs });

const LIST: BoostDef[] = [
  // ---------------------------------------------------------------- shots
  b("bounce", "Shrine of Ricochet", "+1 bounce on every shot", "common", ["shot"], 3),
  b("pierce", "Overbooked Bullets", "Shots pass through +1 enemy", "common", ["shot"], 3),
  b("bigShots", "Oversized Baggage", "Bigger shots, +10% damage", "common", ["shot"], 3),
  b("fastShots", "Express Shipping", "Shots fly 25% faster and further", "common", ["shot"], 2),
  b("twin", "Buy One Get One", "20% chance a shot fires twice", "rare", ["shot"], 3),
  b("gps", "GPS Tracker", "Your shots curve toward enemies", "rare", ["shot"], 1),
  b("quickPips", "Shrine of Haste", "All pips reload 15% faster", "common", ["shot"], 5),
  b("heavy", "Heavy Carry-On", "+12% damage", "common", ["shot"], 5),
  // ---------------------------------------------------------------- crits and situational damage
  b("firstClass", "First Class Upgrade", "10% chance to crit for double damage", "common", ["crit"], 5),
  b("lastCall", "Final Boarding Call", "+50% damage to enemies under 30% health", "rare", ["crit"], 2),
  b("priority", "Priority Boarding", "+25% damage to elites and bosses", "common", ["crit"], 3),
  b("personal", "Personal Space", "+30% damage to enemies close to you", "common", ["crit"], 3),
  b("window", "Window Seat", "+30% damage to enemies far away", "common", ["crit"], 3),
  b("emergency", "Emergency Exit", "+40% damage while under 30% health", "rare", ["crit", "tank"], 2),
  b("fragile", "Fragile Sticker", "+35% damage, -25% max health", "epic", ["crit"], 1),
  b("upgrade", "Lounge Access", "Crits deal triple instead of double", "epic", ["crit"], 1, "crit"),
  // ---------------------------------------------------------------- elements
  b("burnSpread", "Shrine of Arson", "Burning enemies spread fire when they die", "common", ["fire", "kill"], 3),
  b("hotSauce", "Hot Sauce Packet", "15% chance shots set enemies on fire", "common", ["fire"], 3),
  b("extraIce", "Extra Ice", "15% chance shots chill enemies", "common", ["frost"], 3),
  b("staticSocks", "Static Socks", "15% chance shots zap a nearby enemy", "common", ["shock"], 3),
  b("shampoo", "Leaky Shampoo", "15% chance shots melt armor with acid", "common", ["acid"], 3),
  b("adapter", "Universal Adapter", "Weak-point hits deal 25% more", "rare", ["fire", "frost", "shock", "acid"], 2),
  b("wildfire", "Wildfire", "Burning enemies take 40% more damage from everything", "epic", ["fire"], 1, "fire"),
  b("shatter", "Shatter", "Frozen enemies take triple damage, then burst", "epic", ["frost"], 1, "frost"),
  b("overload", "Overload", "Shock chains jump to 2 more enemies", "epic", ["shock"], 1, "shock"),
  b("meltdown", "Meltdown", "Acid lasts twice as long and armor takes 60% more", "epic", ["acid"], 1, "acid"),
  // ---------------------------------------------------------------- kills
  b("vampire", "Shrine of Snacks", "Kills heal 1 health, at most 2 a second", "common", ["kill", "tank"], 3),
  b("souvenirs", "Exploding Souvenirs", "Kills explode for 15 damage", "rare", ["kill"], 3),
  b("refill", "Duty Free Refill", "Kills refill half a pip", "common", ["kill", "shot"], 2),
  b("miles", "Frequent Flyer Miles", "Kills charge your action skill 3%", "common", ["kill", "skill"], 3),
  b("rush", "Layover Rush", "Kills take 0.5s off your dash cooldown", "common", ["kill", "dash"], 2),
  // ---------------------------------------------------------------- dashes
  b("dashBurst", "Shrine of Zoom", "Dashing releases a shock burst", "common", ["dash", "shock"], 3),
  b("jetLag", "Jet Lag", "Dashing leaves a line of fire", "rare", ["dash", "fire"], 2),
  b("quickDraw", "Quick Draw", "Dashing refills a pip", "common", ["dash", "shot"], 1),
  b("seatbelt", "Seatbelt", "Dashing gives a 10 health shield", "common", ["dash", "tank"], 3),
  b("sneakers", "Running Shoes", "Dash cooldown 20% shorter", "common", ["dash"], 3),
  b("express", "Express Lane", "Dashes go 30% further", "common", ["dash"], 2),
  // ---------------------------------------------------------------- survival
  b("vitamins", "Airline Vitamins", "+20 max health (and heal 20)", "common", ["tank"], 5),
  b("bubbleWrap", "Bubble Wrap", "Take 10% less damage", "common", ["tank"], 4),
  b("meal", "In-Flight Meal", "Regenerate 1 health a second until the room is cleared", "rare", ["tank"], 2),
  b("mint", "Hotel Mint", "Heal 15% when a room is cleared", "common", ["tank"], 3),
  b("dnd", "Do Not Disturb", "Getting hit releases a shock burst", "rare", ["tank", "shock"], 2),
  b("insurance", "Travel Insurance", "+1 Second Wind", "epic", ["tank"], 2),
  b("espresso", "Double Espresso", "Move 8% faster", "common", ["dash"], 3),
  // ---------------------------------------------------------------- skills and grenades
  b("powerBank", "Power Bank", "Action skill charges 25% faster", "common", ["skill"], 3),
  b("grandOpening", "Grand Opening", "Your action skill releases a 30 damage blast", "rare", ["skill"], 2),
  b("spa", "Spa Day", "Your action skill heals 15", "common", ["skill", "tank"], 2),
  b("explosives", "Checked Explosives", "Grenades come back 30% faster and blow up bigger", "common", ["grenade"], 2),
  b("partyPack", "Party Pack", "Grenades burst into 3 bomblets", "rare", ["grenade"], 1),
  b("luckyTag", "Lucky Luggage Tag", "Better loot from everything", "common", ["kill"], 3),
  // ---------------------------------------------------------------- co-op
  b("buddy", "Travel Buddy", "+15% damage while a friend is close", "common", ["coop"], 3),
  b("firstAid", "First Aid Kit", "Pick friends up twice as fast, and they get up with more health", "common", ["coop", "tank"], 1),
];

export const BOOSTS: Record<BoostId, BoostDef> = Object.fromEntries(LIST.map((d) => [d.id, d]));
export const BOOST_IDS: BoostId[] = LIST.map((d) => d.id);

const RARITY_WEIGHT: Record<BoostRarity, number> = { common: 10, rare: 4, epic: 1.2 };
/** Gun elements count as a tag, so a fire gun can open up Wildfire. */
const ELEMENT_TAG: Record<Element, BoostTag | undefined> = { none: undefined, fire: "fire", frost: "frost", shock: "shock", acid: "acid" };

/** Stacks of a boost the player has. */
export const stacks = (p: Pick<Player, "boosts">, id: BoostId): number => p.boosts[id] ?? 0;

/** Tags a player's build leans into: their boosts, and their guns' elements. */
export function playerTags(p: Player): Set<BoostTag> {
  const tags = new Set<BoostTag>();
  for (const id of Object.keys(p.boosts)) for (const t of BOOSTS[id]?.tags ?? []) tags.add(t);
  for (const g of p.guns) {
    const t = ELEMENT_TAG[g.element];
    if (t) tags.add(t);
  }
  return tags;
}

/**
 * `count` different boosts for one player (three, or four with a Spare Suitcase). `quality` above 0 makes rares and
 * epics likelier (shrines, elite rooms, bosses). Boosts a teammate already took are less likely, so a party spreads
 * out. `roll` is the world's RNG.
 */
export function boostOffers(p: Player, party: readonly Player[], quality: number, roll: () => number, count = 3): BoostId[] {
  const tags = playerTags(p);
  const coop = party.length > 1;
  const taken = new Set(party.filter((o) => o !== p).flatMap((o) => Object.keys(o.boosts)));
  const pool = LIST.filter((d) => stacks(p, d.id) < d.max && (!d.needs || tags.has(d.needs)) && (coop || !d.tags.includes("coop")));
  const weight = (d: BoostDef): number => {
    let wgt = RARITY_WEIGHT[d.rarity] * (d.rarity === "common" ? 1 : 1 + quality * 0.8);
    // Lean into the build: anything sharing a tag with what you have is likelier, and a keystone you qualify for more so.
    if (d.tags.some((t) => tags.has(t))) wgt *= 2.2;
    if (d.needs) wgt *= 1.5;
    if (taken.has(d.id)) wgt *= 0.5;
    return wgt;
  };
  const out: BoostId[] = [];
  const left = [...pool];
  while (out.length < count && left.length > 0) {
    const total = left.reduce((s, d) => s + weight(d), 0);
    let r = roll() * total;
    let i = 0;
    for (; i < left.length - 1; i++) {
      r -= weight(left[i]!);
      if (r <= 0) break;
    }
    out.push(left[i]!.id);
    left.splice(i, 1);
  }
  return out;
}

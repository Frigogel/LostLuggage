// Signature powers: rare co-op dungeon drops that change a hero's action skill. They're sidegrades, different
// rather than stronger (design doc: Heroes and powers). Each one gives something up for what it adds.

export interface SignatureDef {
  id: string;
  heroId: string;
  name: string;
  /** What changes, plainly, including the catch. */
  text: string;
  flavor: string;
}

export const SIGNATURES: Record<string, SignatureDef> = {
  sig_blackhole: {
    id: "sig_blackhole",
    heroId: "vanguard",
    name: "Black Hole Dome",
    text: "Smaller dome that pulls enemies in and grinds them, instead of keeping them out",
    flavor: "The door was installed backwards. Engineering says it's a feature.",
  },
  sig_revolving: {
    id: "sig_revolving",
    heroId: "vanguard",
    name: "Revolving Door",
    text: "Every shot that hits your dome goes back, but the dome lasts half as long",
    flavor: "In, out, in, out. Mostly out.",
  },
  sig_sixshooter: {
    id: "sig_sixshooter",
    heroId: "gunslinger",
    name: "Six Shooter",
    text: "No marks: fire six seeking shots at the nearest enemies at once",
    flavor: "Counts to six. Out loud. Every time.",
  },
  sig_deadoralive: {
    id: "sig_deadoralive",
    heroId: "gunslinger",
    name: "Dead or Alive",
    text: "Marks only the toughest enemy, for 10 seconds, and it takes double damage from you",
    flavor: "Preferably dead. Alive is a lot of paperwork.",
  },
  sig_walker: {
    id: "sig_walker",
    heroId: "tinker",
    name: "Turret With Legs",
    text: "Your turret walks toward enemies and is tougher, but fires a bit slower",
    flavor: "Nobody asked for legs. It grew them anyway.",
  },
  sig_heater: {
    id: "sig_heater",
    heroId: "tinker",
    name: "Patio Heater",
    text: "Your turret sprays short bursts of fire instead of shooting far",
    flavor: "Outdoor seating, year-round. Indoor seating, briefly.",
  },
  sig_flock: {
    id: "sig_flock",
    heroId: "warden",
    name: "Owl Parliament",
    text: "Three smaller owls circle you, each with less healing and a smaller reach",
    flavor: "They vote on everything. Healing passed 2 to 1.",
  },
  sig_rescue: {
    id: "sig_rescue",
    heroId: "warden",
    name: "Rescue Owl",
    text: "Summoning picks up everyone downed nearby and heals the rest, but the owl doesn't heal after that",
    flavor: "Certified in owl-first aid. The certificate is a napkin.",
  },
};

export const SIGNATURE_IDS = Object.keys(SIGNATURES);

export const signaturesFor = (heroId: string): string[] => SIGNATURE_IDS.filter((id) => SIGNATURES[id]!.heroId === heroId);

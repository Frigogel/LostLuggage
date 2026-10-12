// Skill trees: each hero has three branches of nodes that add behavior, not +X% (design doc: Horizontal skill points).
// A level grants one point. Nodes in a branch are learned in order. Respec is free, so the client just sends the
// whole set of nodes it wants and `validSkills` keeps the part that's affordable and in order.

export interface SkillNode {
  id: string;
  branch: number;
  cost: number;
  name: string;
  text: string;
}

export interface SkillBranch {
  name: string;
  text: string;
}

export interface SkillTree {
  branches: SkillBranch[];
  /** Ordered: within a branch, each node needs the one before it. */
  nodes: SkillNode[];
}

export const SKILL_TREES: Record<string, SkillTree> = {
  vanguard: {
    branches: [
      { name: "Bulkhead", text: "The dome, but more of it" },
      { name: "Static", text: "The dome bites back" },
      { name: "Return to Sender", text: "Thank you for your feedback" },
    ],
    nodes: [
      { id: "vg_wide", branch: 0, cost: 1, name: "Wide Load", text: "Your dome is 30% wider" },
      { id: "vg_overtime", branch: 0, cost: 2, name: "Overtime", text: "Your dome lasts 2 seconds longer" },
      { id: "vg_moving", branch: 0, cost: 2, name: "Moving Day", text: "Your dome follows you around" },
      { id: "vg_patch", branch: 0, cost: 3, name: "Hull Patch", text: "Allies inside your dome heal 5 HP every second" },
      { id: "vg_panic", branch: 0, cost: 4, name: "Panic Room", text: "Dropping below 30% health pops a free dome, once per room" },

      { id: "vg_cling", branch: 1, cost: 1, name: "Static Cling", text: "Your dome zaps enemies near its edge every second" },
      { id: "vg_zapper", branch: 1, cost: 2, name: "Bug Zapper", text: "Dome zaps chain to another enemy" },
      { id: "vg_capacitor", branch: 1, cost: 2, name: "Capacitor", text: "Every shot your dome blocks makes its zaps stronger" },
      { id: "vg_overload", branch: 1, cost: 3, name: "Overload", text: "Your dome explodes when it ends" },
      { id: "vg_thunder", branch: 1, cost: 4, name: "Thunderdome", text: "Zaps twice a second and reach further" },

      { id: "vg_rebound", branch: 2, cost: 1, name: "Rebound", text: "Your dome sends enemy bolts back where they came from" },
      { id: "vg_potato", branch: 2, cost: 2, name: "Hot Potato", text: "Mortar shells that hit your dome get thrown back" },
      { id: "vg_bouncer", branch: 2, cost: 2, name: "Bouncer", text: "Enemies touching your dome get shoved away, hard" },
      { id: "vg_service", branch: 2, cost: 3, name: "Customer Service", text: "Returned shots home in on enemies" },
      { id: "vg_doorslam", branch: 2, cost: 4, name: "Door Slam", text: "Your dash sends enemy bolts back too" },
    ],
  },
  gunslinger: {
    branches: [
      { name: "Showboat", text: "Trick shots and crit chains" },
      { name: "Fast Hands", text: "Reload? Never heard of her" },
      { name: "Bounty Hunter", text: "Marks spread like gossip" },
    ],
    nodes: [
      { id: "gs_quick", branch: 0, cost: 1, name: "Quick Draw", text: "Mark one more enemy" },
      { id: "gs_trick", branch: 0, cost: 2, name: "Trick Shot", text: "Hitting a marked enemy bounces the shot to another marked enemy" },
      { id: "gs_bullseye", branch: 0, cost: 2, name: "Bullseye", text: "Every fourth hit on a marked enemy is a crit for double damage" },
      { id: "gs_encore", branch: 0, cost: 3, name: "Encore", text: "Crits refill a pip" },
      { id: "gs_finale", branch: 0, cost: 4, name: "Grand Finale", text: "Marks that run out go off with a bang" },

      { id: "gs_holster", branch: 1, cost: 1, name: "Hot Holster", text: "Swapping guns refills a pip on the new one" },
      { id: "gs_fan", branch: 1, cost: 2, name: "Fan the Hammer", text: "While your marks are up, you fire twice as often" },
      { id: "gs_spin", branch: 1, cost: 2, name: "Spin Reload", text: "Dashing refills a pip" },
      { id: "gs_steady", branch: 1, cost: 3, name: "Steady Hands", text: "While your marks are up, pips reload 50% faster" },
      { id: "gs_lucky", branch: 1, cost: 4, name: "Lucky Streak", text: "Killing a marked enemy gives back a quarter of your skill" },

      { id: "gs_wanted", branch: 2, cost: 1, name: "Wanted Poster", text: "Marked enemies move 30% slower" },
      { id: "gs_bounty", branch: 2, cost: 2, name: "Bounty", text: "Marked enemies often drop a health snack" },
      { id: "gs_handsup", branch: 2, cost: 2, name: "Hands Up", text: "Marking stuns enemies for a second" },
      { id: "gs_outlaw", branch: 2, cost: 3, name: "Most Wanted", text: "Hitting a marked enemy keeps its mark fresh" },
      { id: "gs_gossip", branch: 2, cost: 4, name: "Word Gets Around", text: "Killing a marked enemy marks the nearest one" },
    ],
  },
  tinker: {
    branches: [
      { name: "Mass Production", text: "More turret, more problems" },
      { name: "Customer Attention", text: "Look at the turret. Not me." },
      { name: "Planned Obsolescence", text: "It was always going to explode" },
    ],
    nodes: [
      { id: "tk_tape", branch: 0, cost: 1, name: "More Tape", text: "Turrets last 4 seconds longer" },
      { id: "tk_twin", branch: 0, cost: 2, name: "Buy One Get One", text: "Drop two turrets" },
      { id: "tk_overclock", branch: 0, cost: 2, name: "Overclock", text: "Turrets fire 50% faster" },
      { id: "tk_recycle", branch: 0, cost: 3, name: "Recycling", text: "A turret that ends gives back a fifth of your skill" },
      { id: "tk_army", branch: 0, cost: 4, name: "Turret Army", text: "Turret kills can build a tiny turret" },

      { id: "tk_taunt", branch: 1, cost: 1, name: "Look At Me", text: "Enemies near your turret go after it instead of you" },
      { id: "tk_armor", branch: 1, cost: 2, name: "Reinforced", text: "Turrets have twice the health" },
      { id: "tk_spite", branch: 1, cost: 2, name: "Spite", text: "Turrets zap whoever hits them" },
      { id: "tk_magnet", branch: 1, cost: 3, name: "Bullet Magnet", text: "Enemy bolts near your turret curve into it" },
      { id: "tk_doorstop", branch: 1, cost: 4, name: "Doorstop", text: "Enemies going after your turret move 40% slower" },

      { id: "tk_boom", branch: 2, cost: 1, name: "Self-Destruct", text: "Turrets explode when they end or break" },
      { id: "tk_bomblets", branch: 2, cost: 2, name: "Leftovers", text: "The blast throws three bomblets" },
      { id: "tk_early", branch: 2, cost: 2, name: "Early Retirement", text: "Pressing the skill without charge blows up your turrets now" },
      { id: "tk_hazard", branch: 2, cost: 3, name: "Hazard Pay", text: "The blast leaves burning ground" },
      { id: "tk_nuke", branch: 2, cost: 4, name: "Warranty Void", text: "The blast is much bigger and pulls enemies in first" },
    ],
  },
  warden: {
    branches: [
      { name: "First Aid", text: "Nobody stays down on your watch" },
      { name: "Owl Tactics", text: "The owl has opinions, and talons" },
      { name: "Extra Padding", text: "Too much healing is just armor" },
    ],
    nodes: [
      { id: "wd_hustle", branch: 0, cost: 1, name: "Bedside Manner", text: "You pick teammates up twice as fast, and your Second Wind comes sooner" },
      { id: "wd_ambulance", branch: 0, cost: 2, name: "Owl Ambulance", text: "Your owl helps pick up downed teammates" },
      { id: "wd_getup", branch: 0, cost: 2, name: "Get Up", text: "Teammates you pick up come back with 70% health" },
      { id: "wd_opinion", branch: 0, cost: 3, name: "Second Opinion", text: "One more Second Wind per run" },
      { id: "wd_guardian", branch: 0, cost: 4, name: "Guardian Owl", text: "Once per owl, an ally near it who would go down stays up" },

      { id: "wd_hoot", branch: 1, cost: 1, name: "Hoot", text: "Your owl zaps the nearest enemy every second" },
      { id: "wd_night", branch: 1, cost: 2, name: "Night Shift", text: "Owl zaps chain to another enemy" },
      { id: "wd_hunt", branch: 1, cost: 2, name: "Hunting Season", text: "Your owl flies at the nearest enemy instead of following you" },
      { id: "wd_talons", branch: 1, cost: 3, name: "Talon Storm", text: "Owl zaps twice a second" },
      { id: "wd_raptor", branch: 1, cost: 4, name: "Raptor Mode", text: "Your owl dives into an enemy when it leaves" },

      { id: "wd_overheal", branch: 2, cost: 1, name: "Overheal", text: "Healing past full health becomes a shield, up to 30" },
      { id: "wd_padding", branch: 2, cost: 2, name: "Bubble Wrap", text: "Overheal shields hold up to 60" },
      { id: "wd_cold", branch: 2, cost: 2, name: "Cold Comfort", text: "Your owl slows enemies twice as much" },
      { id: "wd_nightowl", branch: 2, cost: 3, name: "Night Owl", text: "Your owl stays 4 seconds longer" },
      { id: "wd_hug", branch: 2, cost: 4, name: "Group Hug", text: "Summoning the owl heals everyone near you 25 HP" },
    ],
  },
};

/** One point per level after the first: 29 at the cap, against 36 for every node, so even a maxed hero makes choices. */
export function skillPoints(level: number): number {
  return Math.max(0, Math.floor(level) - 1);
}

/** The affordable, in-order part of a wished-for set of nodes. Unknown ids are dropped. */
export function validSkills(heroId: string, level: number, wanted: readonly string[]): string[] {
  const tree = SKILL_TREES[heroId];
  if (!tree) return [];
  const want = new Set(wanted);
  let left = skillPoints(level);
  const out: string[] = [];
  tree.branches.forEach((_, b) => {
    for (const node of tree.nodes.filter((n) => n.branch === b)) {
      if (!want.has(node.id) || node.cost > left) break;
      left -= node.cost;
      out.push(node.id);
    }
  });
  return out;
}

export function spentPoints(heroId: string, skills: readonly string[]): number {
  const nodes = SKILL_TREES[heroId]?.nodes ?? [];
  return skills.reduce((sum, id) => sum + (nodes.find((n) => n.id === id)?.cost ?? 0), 0);
}

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

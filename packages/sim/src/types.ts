import type { Rect, Vec } from "./math";

export type Archetype = "pistol" | "shotgun" | "smg" | "sniper" | "launcher";
export type Element = "none" | "fire" | "shock" | "frost" | "acid";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Defense = "flesh" | "armor" | "shield";
export type Role =
  | "swarmer"
  | "bruiser"
  | "artillery"
  | "charger"
  | "zoner"
  | "support"
  | "summoner"
  | "ambusher"
  | "splitter"
  | "boss";

// ---------------------------------------------------------------- guns

export interface GunDef {
  id: string;
  archetype: Archetype;
  name: string;
  flavor: string;
  pips: number;
  /** Time to refill one pip. */
  reloadMs: number;
  /** Minimum time between spending pips, so a held trigger doesn't dump the bar. */
  fireDelayMs: number;
  shotsPerPip: number;
  shotIntervalMs: number;
  pellets: number;
  spreadDeg: number;
  /** Projectile speed in px/s. */
  speed: number;
  range: number;
  damage: number;
  /** Extra enemies a projectile passes through. */
  pierce: number;
  projRadius: number;
  /** Sniper-style windup before the shot leaves. */
  chargeMs: number;
  /** Lobbed shots fly over walls and explode where they land. */
  lob?: { radius: number };
  knockback: number;
}

/** A gun's effective stats once manufacturer, rarity and perks are applied. */
export interface GunStats extends GunDef {
  /** Wall ricochets per shot. Lobbed shots bounce along the ground instead. */
  bounces: number;
  /** Homing turn rate in radians per second (Wizard Labs). */
  homing: number;
}

export type PerkId = "pierce" | "bounce" | "extraPip" | "quickReload" | "bigShots" | "killReload" | "hotStreak" | "volatile";

export type MakerId = "cruise" | "dwarfcorp" | "arcane" | "goblin" | "wizard" | "megamart";

/** What makes a gun that gun: everything a stash saves. */
export interface GunData {
  defId: string;
  element: Element;
  rarity: Rarity;
  perks: PerkId[];
  maker: MakerId;
  /** Named legendary id: one rule-breaking effect. */
  legendary?: string;
}

export interface Gun extends GunData {
  /** Unique per drop, so the UI can tell two identical rolls apart. */
  uid: number;
  pips: number;
  /** Stash id when the gun came from the player's saved loadout. Never sent over the wire. */
  sid?: string;
  /** Shots fired, for legendaries that count (every 10th bullet, cycling elements). */
  count?: number;
  /** The intro room's try-before-you-buy guns: property of the cruise line, they don't come home. */
  loaner?: boolean;
}

// ---------------------------------------------------------------- heroes

export interface HeroDef {
  id: string;
  name: string;
  maxHp: number;
  speed: number;
  radius: number;
  skill: { type: "dome"; radius: number; durationMs: number };
  /** Damage dealt to fully charge the action skill. */
  skillChargeDamage: number;
}

// ---------------------------------------------------------------- enemies

export type Movement =
  | { type: "chase" }
  | { type: "keepDistance"; min: number; max: number }
  | { type: "stationary" }
  /** Hides as a prop until a player walks within `trigger`, then reveals and chases. */
  | { type: "ambush"; trigger: number; revealMs: number };

interface AttackBase {
  windupMs: number;
  /** Distance to the target at which the enemy starts the windup. */
  range: number;
  cooldownMs: number;
  recoverMs: number;
}

export type AttackDef =
  | (AttackBase & {
      type: "melee";
      telegraph: "redFlash";
      /** Extra reach beyond touching when the bite lands. */
      reach: number;
      damage: number;
    })
  | (AttackBase & {
      type: "dash";
      telegraph: "line";
      dashSpeed: number;
      dashMs: number;
      damage: number;
      /** Recovery when the dash ends against a wall. */
      stunMs: number;
    })
  | (AttackBase & {
      type: "lobbedProjectile";
      telegraph: "groundCircle";
      radius: number;
      damage: number;
      flightMs: number;
      /** Extra shells land around the target. */
      count?: number;
      scatter?: number;
      /** Leaves a damaging puddle where it lands. */
      puddle?: { radius: number; durationMs: number; damage: number };
    })
  | (AttackBase & {
      /** Ground pound around the enemy itself. */
      type: "slam";
      telegraph: "groundCircle";
      radius: number;
      damage: number;
    })
  | (AttackBase & {
      type: "projectile";
      telegraph: "redFlash";
      speed: number;
      damage: number;
      radius: number;
      count: number;
      spreadDeg: number;
    })
  | (AttackBase & {
      /** Grants a blue shield bar to nearby allies. */
      type: "shieldAllies";
      telegraph: "channel";
      radius: number;
      amount: number;
    })
  | (AttackBase & {
      type: "summon";
      telegraph: "channel";
      enemyId: string;
      count: number;
      /** Stops summoning while this many of its children are alive. */
      maxAlive: number;
    });

export type AttackType = AttackDef["type"];

export interface BossPhase {
  /** Phase starts when hp falls to this fraction. */
  hpFrac: number;
  /** Indices into `attacks` usable in this phase. */
  attacks: number[];
  /** Windups and cooldowns shrink by this factor. */
  haste: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** One-line gag shown when it first appears. */
  flavor: string;
  role: Role;
  defense: Defense;
  hp: number;
  speed: number;
  radius: number;
  movement: Movement;
  attacks: AttackDef[];
  biomes: string[];
  /** Cost against the director's room budget. 0 = never picked by the director. */
  threatCost: number;
  fireImmune?: boolean;
  /** Leaves a damaging trail while moving. */
  trail?: { intervalMs: number; radius: number; durationMs: number; damage: number };
  onDeath?: { split?: { enemyId: string; count: number } };
  boss?: { phases: BossPhase[] };
  /** Chance to drop a gun, before luck. */
  dropChance: number;
}

// ---------------------------------------------------------------- runtime state

export interface PlayerInput {
  /** Movement, magnitude 0..1. */
  move: Vec;
  /** World-space offset from the player to the aim point, in px. Zero = no manual aim. */
  aim: Vec;
  fire: boolean;
  /** Fire at the nearest enemy instead of `aim`. */
  autoAim: boolean;
  dash: boolean;
  skill: boolean;
  grenade: boolean;
  /** World-space offset for the grenade. Zero = throw at the nearest enemy. */
  grenadeAim: Vec;
  swap: boolean;
  /** Pick up / use the item in reach: swap a gun, pray at a shrine, open a suitcase. */
  interact: boolean;
}

export type BoostId = "bounce" | "burnSpread" | "vampire" | "quickPips" | "dashBurst";

/** Permanent multipliers from souvenirs (small and hard-capped). 1 = no change. */
export interface PlayerMods {
  damage: number;
  speed: number;
  /** Dash cooldown multiplier: below 1 is faster. */
  dashCd: number;
  /** Action skill charge rate. */
  charge: number;
  /** Extra loot luck. 0 = none. */
  luck: number;
}

export interface Player {
  id: number;
  heroId: string;
  name: string;
  /** Party slot 0-3: picks the player's color. */
  slot: number;
  /** The hero's own level. */
  level: number;
  /** The level the player's stats are set to: their own in solo, the dungeon tier's in co-op (level sync). */
  syncLevel: number;
  /** Disconnected or app in the background: enemies ignore them and they can't act. */
  away: boolean;
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  facing: Vec;
  guns: Gun[];
  active: number;
  shotCd: number;
  burstLeft: number;
  burstT: number;
  shotAim: Vec;
  charging: boolean;
  chargeT: number;
  dashT: number;
  dashCd: number;
  dashDir: Vec;
  iframes: number;
  hurtT: number;
  skillCharge: number;
  grenadeCd: number;
  downed: boolean;
  /** Second Wind countdown while downed. Infinity = waiting for a teammate. */
  reviveT: number;
  /** 0..1 while teammates stand next to a downed player. */
  reviveProgress: number;
  selfRevives: number;
  /** Run boosts from shrines: id → stacks. Reset every run. */
  boosts: Partial<Record<BoostId, number>>;
  /** hotStreak perk: kills in a row speed up reload for a moment. */
  streakT: number;
  /** Learned skill node ids (see data/skills). */
  skills: string[];
  mods: PlayerMods;
  /** Every gun that passed through this player's hands this run: it all comes home at the end. */
  haul: Gun[];
  /** Panic Room skill: the free dome is used up until the next room. */
  panicUsed: boolean;
}

export type EnemyState = "move" | "windup" | "attack" | "recover" | "hidden" | "reveal";

export interface Status {
  burnT: number;
  burnDps: number;
  burnSource: number;
  /** Burn deals its damage in chunks so damage numbers stay readable. */
  burnTick: number;
  /** Frost stacks (0..5): each slows 10%, five freeze. */
  frost: number;
  frozenT: number;
  /** Acid breaks armor: armored enemies take extra damage from everything. */
  acidT: number;
}

export interface Enemy {
  id: number;
  defId: string;
  pos: Vec;
  vel: Vec;
  knock: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  /** Blue shield bar granted by supports. Absorbs damage first; Shock strips it fast. */
  shield: number;
  state: EnemyState;
  stateT: number;
  attackIdx: number;
  cooldowns: number[];
  /** Locked direction for melee/dash windups. */
  attackDir: Vec;
  /** Locked landing points for lobbed windups. */
  attackPoints: Vec[];
  hitPlayers: number[];
  hitFlash: number;
  spawnT: number;
  /** Per-enemy steering so packs fan out instead of stacking. */
  steer: number;
  strafe: number;
  status: Status;
  trailT: number;
  /** Who summoned this enemy, for summon caps. */
  parentId: number;
  phase: number;
}

export interface Lob {
  from: Vec;
  to: Vec;
  t: number;
  dur: number;
  radius: number;
  puddle?: { radius: number; durationMs: number; damage: number };
}

export interface Projectile {
  id: number;
  owner: "player" | "enemy";
  ownerId: number;
  kind: string;
  element: Element;
  pos: Vec;
  vel: Vec;
  radius: number;
  damage: number;
  pierce: number;
  bounces: number;
  knockback: number;
  life: number;
  hitIds: number[];
  /** The gun that fired it, for on-kill perks. */
  gunUid: number;
  lob?: Lob;
  /** Turn rate toward the nearest enemy, radians per second. */
  homing?: number;
  /** Boomerang: seconds until it turns around. */
  turnT?: number;
  /** Hits that jump to another enemy instead of stopping. */
  ricochet?: number;
  /** Explodes on impact with this radius (rockets). */
  explode?: number;
  /** Lobbed shots that burst into this many bomblets. */
  cluster?: number;
  /** Leaves burning ground along its path. */
  fireLine?: boolean;
  /** Flies in a way co-op clients don't predict (curves, returns, reflections), so it's always drawn from the server. */
  special?: boolean;
}

export interface Dome {
  id: number;
  ownerId: number;
  pos: Vec;
  radius: number;
  t: number;
  maxT: number;
  /** Counts down to the dome's next once-a-second skill effects (zaps, shoves, healing). */
  tickT: number;
  /** Capacitor skill: extra zap damage from blocked shots. */
  bonus: number;
}

/** Ground effects that hurt whoever stands in them. */
export interface Hazard {
  id: number;
  kind: "acid" | "fire";
  owner: "player" | "enemy";
  pos: Vec;
  radius: number;
  t: number;
  maxT: number;
  damage: number;
  /** Player hazards: who gets the credit, and when what's standing in it burns next. */
  ownerId?: number;
  tickT?: number;
}

/** Burning Foundry terrain rule: vents erupt on a timer, hurting players and enemies alike. */
export interface Vent {
  id: number;
  pos: Vec;
  radius: number;
  periodS: number;
  warnS: number;
  eruptS: number;
  /** Seconds into the current cycle. */
  t: number;
  damage: number;
}

export type PickupKind = "gun" | "heal" | "shrine" | "chest";

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec;
  gun?: Gun;
  boost?: BoostId;
  heal?: number;
  /** Spent shrines and opened chests stay as scenery. */
  used: boolean;
}

export type RoomKind = "intro" | "combat" | "breather" | "boss";

export interface RoomPlan {
  kind: RoomKind;
  layout: number;
  /** Enemy ids per wave. */
  waves: string[][];
  /** Party size the waves were planned for. Combat rooms are re-planned on entry if it changed. */
  party: number;
}

export interface Room {
  index: number;
  kind: RoomKind;
  waves: string[][];
  waveIdx: number;
  /** Delay before the next wave arrives. */
  waveTimer: number;
  cleared: boolean;
  exit: Rect;
  /** Co-op: counts down while someone waits at the exit, so nobody gets yanked out mid-loot. -1 = idle. */
  exitT: number;
  vents: Vent[];
}

export interface Run {
  plans: RoomPlan[];
  room: Room;
  /** Higher = bigger budgets and better loot. Normal = 0. */
  tier: number;
  /** Co-op runs use level sync and wait for the party at the exit. */
  coop: boolean;
  kills: number;
  gunsFound: number;
  time: number;
  victory: boolean;
}

export interface World {
  tick: number;
  time: number;
  seed: number;
  nextId: number;
  arena: { w: number; h: number; obstacles: Rect[] };
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  domes: Dome[];
  hazards: Hazard[];
  pickups: Pickup[];
  run: Run;
  events: SimEvent[];
  gameOver: boolean;
}

export type SimEvent =
  | { type: "shot"; playerId: number; x: number; y: number; angle: number; archetype: Archetype; element: Element }
  | { type: "charge"; playerId: number }
  | { type: "hit"; x: number; y: number; targetId: number; damage: number; kill: boolean; element: Element; weak: boolean; shield: boolean }
  | { type: "enemyDied"; x: number; y: number; id: number; defId: string }
  | { type: "explosion"; x: number; y: number; radius: number; owner: "player" | "enemy"; element: Element }
  | { type: "chain"; x1: number; y1: number; x2: number; y2: number }
  | { type: "frozen"; id: number }
  | { type: "shieldUp"; id: number }
  | { type: "shieldBroken"; id: number; x: number; y: number }
  | { type: "blocked"; x: number; y: number }
  /** A dome skill went off around the dome: zap, shove or heal. */
  | { type: "domePulse"; id: number; x: number; y: number; radius: number }
  /** An enemy shot got sent back. */
  | { type: "reflect"; x: number; y: number }
  | { type: "spark"; x: number; y: number }
  | { type: "enemyWindup"; id: number; attack: AttackType }
  | { type: "enemyAttack"; id: number; attack: AttackType }
  | { type: "reveal"; id: number }
  | { type: "split"; id: number; x: number; y: number }
  | { type: "bossPhase"; id: number; phase: number }
  | { type: "bonk"; id: number; x: number; y: number }
  | { type: "ventWarn"; id: number }
  | { type: "ventErupt"; id: number; x: number; y: number }
  | { type: "playerHurt"; id: number; damage: number }
  | { type: "playerDowned"; id: number; canRevive: boolean }
  /** The last player standing went down and Second Wind kicks in. */
  | { type: "secondWind"; id: number }
  /** `by` is the teammate who did it, or -1 for Second Wind and room changes. */
  | { type: "playerRevived"; id: number; by: number }
  | { type: "playerJoined"; id: number }
  | { type: "playerLeft"; id: number }
  | { type: "dash"; id: number }
  | { type: "skill"; id: number; x: number; y: number }
  | { type: "grenade"; id: number }
  | { type: "swap"; id: number }
  | { type: "pickup"; id: number; gun: Gun }
  | { type: "loot"; x: number; y: number; rarity: Rarity }
  | { type: "heal"; id: number; amount: number }
  | { type: "shrine"; id: number; boost: BoostId }
  | { type: "chestOpened"; x: number; y: number }
  | { type: "enemySpawn"; id: number }
  | { type: "waveStart"; wave: number; waves: number }
  | { type: "roomCleared"; index: number }
  | { type: "roomEnter"; index: number; kind: RoomKind; rooms: number }
  | { type: "victory" }
  | { type: "gameOver" };

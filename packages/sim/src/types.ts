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

// ---------------------------------------------------------------- grenades

export interface GrenadeDef {
  id: string;
  name: string;
  flavor: string;
  /** What it does, plainly. */
  text: string;
  element: Element;
  /** Multipliers on the base grenade (see GRENADE). */
  damage: number;
  radius: number;
  cooldown: number;
  /** Shove from the blast, px/s. Negative pulls enemies toward the middle. */
  knockback: number;
  /** Ground it leaves behind: burning, frosty or acid. Damage is per tick (twice a second, frost four times), as a fraction of the blast. */
  hazard?: { kind: "fire" | "acid" | "ice"; seconds: number; damage: number };
  /** Bursts into this many bomblets. */
  cluster?: number;
}

/** What makes a grenade that grenade: everything a stash saves. */
export interface Grenade {
  defId: string;
  rarity: Rarity;
  /** Stash id when the grenade came from the player's saved loadout. Never sent over the wire. */
  sid?: string;
}

// ---------------------------------------------------------------- heroes

export type HeroSkill =
  /** Vanguard: a dome that keeps enemies and their shots out. */
  | { type: "dome"; radius: number; durationMs: number }
  /** Gunslinger: marks the nearest enemies; your shots seek them and hit harder. */
  | { type: "mark"; count: number; range: number; durationMs: number; bonus: number }
  /** Tinker: a turret that shoots the nearest enemy with your gun's element. */
  | { type: "turret"; durationMs: number; hp: number; range: number; fireMs: number; damage: number }
  /** Warden: a drone that follows you, healing allies and slowing enemies around it. */
  | { type: "drone"; durationMs: number; radius: number; heal: number; slow: number };

export interface HeroDef {
  id: string;
  name: string;
  /** Tank, damage, area control, support. */
  role: string;
  flavor: string;
  maxHp: number;
  speed: number;
  radius: number;
  skill: HeroSkill;
  /** Action skill name, short enough for the HUD button. */
  skillName: string;
  /** What the action skill does, plainly. */
  skillText: string;
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
      /** Shoves the players it hits sideways, px/s. */
      push?: number;
      /** Bosses: charges this many times in a row, re-aiming between them. */
      chain?: number;
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
      /** Boss rain: the extra shells land all over the arena (one always on each player) instead of around the target. */
      rain?: boolean;
      /** Leaves a damaging puddle where it lands (or slippery slush, with `ice`). */
      puddle?: Puddle;
      /**
       * Boss: the shells land in lines marching out from the boss instead of on the target, `arms` lines (one aimed at
       * the target) of `spacing` px steps, out to `range`.
       */
      cross?: { arms: number; spacing: number };
    })
  | (AttackBase & {
      /** Ground pound around the enemy itself. */
      type: "slam";
      telegraph: "groundCircle";
      radius: number;
      damage: number;
      /** Shoves players out of the circle, px/s. On ice they keep sliding. */
      push?: number;
    })
  | (AttackBase & {
      /** Breath in a wedge in front of the enemy. Can leave icy ground behind. */
      type: "cone";
      telegraph: "cone";
      length: number;
      angleDeg: number;
      damage: number;
      push?: number;
      /** Patches of ice left along the wedge. */
      ice?: { radius: number; durationMs: number };
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
      /** Boss: rings of bolts in every direction, a few volleys, each turned half a step so the gaps move. */
      type: "nova";
      telegraph: "channel";
      count: number;
      volleys: number;
      gapMs: number;
      speed: number;
      damage: number;
      radius: number;
    })
  | (AttackBase & {
      /** Boss: shockwave rings that sweep the whole arena. Dash through them (or hide in a dome). */
      type: "shockwave";
      telegraph: "groundCircle";
      rings: number;
      gapMs: number;
      /** px/s */
      speed: number;
      damage: number;
      push?: number;
    })
  | (AttackBase & {
      /**
       * Boss: dives under the water and swims after its target, out of reach, then stops and bursts up under them:
       * a hit around it, and a ring of bolts. The circle shows for `surfaceMs` before it comes up.
       */
      type: "submerge";
      telegraph: "groundCircle";
      swimMs: number;
      surfaceMs: number;
      /** px/s while under. */
      swimSpeed: number;
      radius: number;
      damage: number;
      push?: number;
      /** Bolts thrown out when it comes up. */
      bolts: number;
      boltSpeed: number;
      boltDamage: number;
    })
  | (AttackBase & {
      /**
       * Boss: `beams` laser beams out of the boss, turning `turnDeg` over `sweepMs`. Step over the beam as it comes,
       * or dash through it.
       */
      type: "sweep";
      telegraph: "beam";
      beams: number;
      sweepMs: number;
      turnDeg: number;
      /** Half the beam's width. */
      width: number;
      damage: number;
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

export interface Puddle {
  radius: number;
  durationMs: number;
  damage: number;
  /** Slush that slows instead of acid that hurts. */
  ice?: boolean;
  /** Burning slag instead of acid. */
  fire?: boolean;
}

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
  /** Frost still slows it a little, but never freezes it. */
  frostImmune?: boolean;
  /** Sewer family: swims through deep water at full speed, and the current doesn't carry it. */
  swimmer?: boolean;
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

/** Run boosts (see data/boosts): picked from three offers after most rooms, kept until the run ends. */
export type BoostId = string;

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
  /** Added to the quality of this player's boost offers: rarer picks. */
  offerQuality: number;
  /** Chance that a set of boost offers has a 4th one. */
  extraOffer: number;
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
  /** The grenade on the player's belt. */
  grenade: Grenade;
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
  /** Panic Room skill: the free dome is used up until the next room. */
  panicUsed: boolean;
  /** Equipped signature power (co-op drop that changes the action skill), or "". */
  signature: string;
  /** Overheal turned into a shield (Warden): soaks damage before health. */
  shield: number;
  /** Shoves from enemy attacks, px/s. Fades fast on deck plating, slowly on ice. */
  knock: Vec;
  /** Standing in icy slush: moving slower for a moment. */
  slowT: number;
  /** Hot Holster skill: the swap refill is cooling down. */
  holsterCd: number;
  /** Bullseye skill: hits on marked enemies, every fourth is a crit. */
  markHits: number;
}

export type EnemyState = "move" | "windup" | "attack" | "recover" | "hidden" | "reveal";

/** Elite modifiers change behavior, not just stats (design doc: Elite modifiers). */
export type EliteId = "shielded" | "splitting" | "teleporting" | "vengeful" | "linked" | "hasted";

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
  /** Size relative to its kind: Splitting elites leave smaller copies behind. */
  size: number;
  /** Copies and relinked twins don't drop loot a second time. */
  noLoot: boolean;
  /** Stunned: can't move or attack (Gunslinger's Hands Up). */
  stunT: number;
  /** Slowed by a Warden's drone: the fraction of speed taken away, refreshed while it's close. */
  slowT: number;
  slow: number;
  /** Gunslinger mark: seconds left, and who marked it. */
  markT: number;
  markBy: number;
  /** A Tinker's turret has its attention (taunt): the gadget id, or 0. */
  taunt: number;
  elite?: EliteId;
  /** Shielded elites: what the front shield can still soak before it shatters. */
  guard: number;
  /** Where it looks. Shielded elites turn slowly, so you can get around the shield. */
  facing: Vec;
  /** Linked elites: the partner's id, or 0. */
  link: number;
  /** Linked: the partner died and comes back unless this one dies within `linkT` seconds. */
  linkT: number;
  linkGhost?: { defId: string; pos: Vec; maxHp: number; elite: EliteId };
  /** Teleporting: seconds to the next blink, then where it's about to appear. */
  blinkT: number;
  blinkTo?: Vec;
  /** Multi-part attacks (nova volleys, chained charges, shockwave rings): how many are left. Server only. */
  burst: number;
  /** Ranged enemies: time until they think about dodging again. Server only. */
  dodgeT: number;
}

/** Something a hero put on the field: a Tinker's turret or a Warden's drone. */
export interface Gadget {
  id: number;
  kind: "turret" | "drone";
  ownerId: number;
  pos: Vec;
  t: number;
  maxT: number;
  hp: number;
  maxHp: number;
  /** Turrets shoot with the element their owner's gun had when they were dropped. */
  element: Element;
  /** Time to the next shot (turret) or zap (drone). */
  fireCd: number;
  /** Time to the next heal (drone). */
  tickT: number;
  /** Turret Army's small turrets: short-lived and never taunt. */
  mini: boolean;
  /** Guardian Owl already caught someone this time. */
  saved: boolean;
}

export interface Lob {
  from: Vec;
  to: Vec;
  t: number;
  dur: number;
  radius: number;
  puddle?: Puddle;
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
  /** Thrown grenades: the grenade kind, for what it leaves behind when it lands. */
  grenade?: string;
  /** Lobbed shots that burst into this many bomblets. */
  cluster?: number;
  /** Leaves burning ground along its path. */
  fireLine?: boolean;
  /** Flies in a way co-op clients don't predict (curves, returns, reflections), so it's always drawn from the server. */
  special?: boolean;
  /** Gunslinger shots home in on enemies this player marked. */
  seekMarks?: number;
  /** Damage from gadgets doesn't charge the action skill, or turrets would pay for themselves. */
  noCharge?: boolean;
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
  /** Acid and fire hurt; ice slush slows players down; a wave is a boss shockwave ring growing out to `radius`. */
  kind: "acid" | "fire" | "ice" | "wave";
  owner: "player" | "enemy";
  pos: Vec;
  radius: number;
  t: number;
  maxT: number;
  damage: number;
  /** Player hazards: who gets the credit, and when what's standing in it burns (or chills, or melts) next. */
  ownerId?: number;
  tickT?: number;
  /** Waves: the shove they give. */
  push?: number;
}

/**
 * Timed traps: they warn, then go off, on a loop. Foundry vents erupt in a circle; sewer pipes blast a jet of sludge
 * from the wall along a lane, shoving whoever is in it; orbital laser fences switch on between their two posts.
 */
export type TrapKind = "vent" | "pipe" | "laser";

export interface Vent {
  id: number;
  kind: TrapKind;
  pos: Vec;
  /** Pipes and lasers: the far end of the lane. `radius` is then half its width. */
  to?: Vec;
  radius: number;
  periodS: number;
  warnS: number;
  eruptS: number;
  /** Seconds into the current cycle. */
  t: number;
  damage: number;
}

export type PickupKind = "gun" | "heal" | "shrine" | "chest" | "boost" | "grenade";

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec;
  gun?: Gun;
  grenade?: Grenade;
  boost?: BoostId;
  heal?: number;
  /** Boost offers belong to one player: nobody else sees or takes them. */
  owner?: number;
  /** Boost offers come in threes: taking one removes the rest of its group. */
  group?: number;
  /** Spent shrines and opened chests stay as scenery. */
  used: boolean;
}

/**
 * intro: the hand-made first room. combat: a director fight. elite: a harder fight with better rewards.
 * event: a fight with a twist. shrine: no fight, two boost picks. rest: heal up and open a suitcase. boss: end of an act.
 */
export type RoomKind = "intro" | "combat" | "elite" | "event" | "shrine" | "rest" | "boss";
/** What a door can lead to: a room, or home (after the final boss). */
export type DoorKind = RoomKind | "home";

/** Room twists (see director TWISTS): one rule that changes how a fight plays. "" = none. */
export type TwistId = "" | "rush" | "dark" | "hold" | "belts" | "overbooked" | "convention" | "luggage" | "surrounded";

/** Each biome brings an enemy family and a terrain rule (design doc: Biomes). */
export type Biome = "foundry" | "caverns" | "sewers" | "orbital";

/** Where a door leads, decided when the doors appear. */
export interface RoomSpec {
  kind: RoomKind;
  biome: Biome;
  twist: TwistId;
  /** Mixed rooms draw enemies from every biome's family. */
  mix: boolean;
  /** 0 to FINAL_ACT is the adventure; after that is endless. */
  act: number;
  /** Room number within the act: 0 is the arrival, the boss comes last. */
  step: number;
}

export interface Door extends Omit<RoomSpec, "kind"> {
  kind: DoorKind;
  /** Center of the door along the top wall. */
  x: number;
}

export interface RoomPlan extends RoomSpec {
  layout: number;
  /** Enemy ids per wave. */
  waves: string[][];
  /** Party size the waves were planned for. Combat rooms are re-planned on entry if it changed. */
  party: number;
}

export interface Room {
  index: number;
  kind: RoomKind;
  biome: Biome;
  twist: TwistId;
  /** Where you can go next. Open once the room is clear; stand in one to vote for it. */
  doors: Door[];
  /** Hold the Line: seconds left to survive. 0 otherwise. */
  holdT: number;
  /** Falling Luggage drops and Hold the Line spawns: time to the next one. Server only. */
  twistT: number;
  waves: string[][];
  waveIdx: number;
  /** Delay before the next wave arrives. */
  waveTimer: number;
  cleared: boolean;
  /** Co-op: counts down while someone waits at a door, so nobody gets yanked out mid-loot. -1 = idle. */
  exitT: number;
  vents: Vent[];
}

export interface Run {
  /** The adventure picked in the lobby: where the run starts, and what first clears count for. */
  biome: Biome;
  /** The biome of each act of the adventure, in order (see director actOrder). Server only. */
  order: Biome[];
  /** Every room entered so far, in order. The next one is planned when the party walks through a door. */
  plans: RoomPlan[];
  room: Room;
  /** Higher = bigger budgets and better loot. Normal = 0. */
  tier: number;
  /** Co-op runs use level sync and wait for the party at the exit. */
  coop: boolean;
  kills: number;
  gunsFound: number;
  time: number;
  /** The run ended well: the party beat the final boss and flew home. */
  victory: boolean;
  /** The final boss is beaten. Going down in endless after this still counts as a win. */
  finale: boolean;
  /** Bosses beaten this run. */
  bosses: number;
}

export interface Arena {
  w: number;
  h: number;
  obstacles: Rect[];
  /** Frozen Caverns: icy floor. You slide, and your dash goes further. */
  ice: boolean;
  /** Frozen Caverns: spiky walls that hurt whoever gets shoved into them. */
  spikes: Rect[];
  /** Baggage Claim twist: conveyor belts that carry whoever stands on them sideways. */
  belts: Belt[];
  /** Sewers: deep water. Wading is slow, and the current carries you along. */
  water: Current[];
  /** Orbital Deck: teleporter pads in linked pairs. Step onto one and you come out of the other. */
  pads: Pad[];
}

export interface Current extends Rect {
  /** Which way the water flows, px/s. */
  vx: number;
  vy: number;
}

export interface Pad {
  a: Vec;
  b: Vec;
}

export interface Belt extends Rect {
  /** px/s, positive to the right. */
  vx: number;
}

export interface World {
  tick: number;
  time: number;
  seed: number;
  nextId: number;
  arena: Arena;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  domes: Dome[];
  gadgets: Gadget[];
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
  /** Someone (player or enemy) got shoved into a spike wall. */
  | { type: "spiked"; x: number; y: number }
  /** A player stepped onto a teleporter pad and came out of the other one. */
  | { type: "warp"; id: number; x1: number; y1: number; x2: number; y2: number }
  /** A submerged boss burst up out of the water. */
  | { type: "surface"; id: number; x: number; y: number }
  /** Gunslinger marked an enemy. */
  | { type: "mark"; id: number; by: number }
  /** A critical hit on a marked enemy (Bullseye), or a mark going off (Grand Finale). */
  | { type: "crit"; x: number; y: number }
  /** A turret or drone appeared, or ended (`gone`). */
  | { type: "gadget"; id: number; kind: Gadget["kind"]; x: number; y: number; gone: boolean }
  /** A turret took a hit. */
  | { type: "gadgetHit"; id: number }
  /** Guardian Owl caught a player who would have gone down. */
  | { type: "saved"; id: number }
  /** A teleporting elite is about to appear at x, y; `done` once it has. */
  | { type: "blink"; id: number; x: number; y: number; done: boolean }
  /** A linked elite's partner came back because it wasn't killed in time. */
  | { type: "relink"; id: number }
  /** A shielded elite's front shield stopped a shot. */
  | { type: "deflect"; x: number; y: number }
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
  | { type: "grenadePickup"; id: number; grenade: Grenade }
  | { type: "loot"; x: number; y: number; rarity: Rarity }
  | { type: "heal"; id: number; amount: number }
  /** A player took a run boost. */
  | { type: "shrine"; id: number; boost: BoostId }
  | { type: "chestOpened"; x: number; y: number }
  | { type: "enemySpawn"; id: number }
  | { type: "waveStart"; wave: number; waves: number }
  | { type: "roomCleared"; index: number }
  | { type: "roomEnter"; index: number; kind: RoomKind; act: number }
  /** The final boss is down: fly home, or keep going in endless. */
  | { type: "finale" }
  /** A boss is winding up something that wants a dash (shockwaves) or a dodge (bolt rings, rain). */
  | { type: "bossCall"; id: number; attack: AttackType }
  | { type: "victory" }
  | { type: "gameOver" };

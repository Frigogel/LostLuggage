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
  | "splitter";

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

export interface Gun {
  defId: string;
  element: Element;
  rarity: Rarity;
  pips: number;
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
  | { type: "keepDistance"; min: number; max: number };

export type AttackDef =
  | {
      type: "melee";
      telegraph: "redFlash";
      windupMs: number;
      /** Distance at which the enemy starts the windup. */
      range: number;
      /** Extra reach beyond touching when the bite lands. */
      reach: number;
      damage: number;
      cooldownMs: number;
      recoverMs: number;
    }
  | {
      type: "dash";
      telegraph: "line";
      windupMs: number;
      range: number;
      dashSpeed: number;
      dashMs: number;
      damage: number;
      cooldownMs: number;
      recoverMs: number;
      /** Recovery when the dash ends against a wall. */
      stunMs: number;
    }
  | {
      type: "lobbedProjectile";
      telegraph: "groundCircle";
      windupMs: number;
      range: number;
      radius: number;
      damage: number;
      flightMs: number;
      cooldownMs: number;
      recoverMs: number;
    };

export interface EnemyDef {
  id: string;
  name: string;
  role: Role;
  defense: Defense;
  hp: number;
  speed: number;
  radius: number;
  movement: Movement;
  attacks: AttackDef[];
  biomes: string[];
  threatCost: number;
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
}

export interface Player {
  id: number;
  heroId: string;
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
  reviveT: number;
  selfRevives: number;
}

export type EnemyState = "move" | "windup" | "attack" | "recover";

export interface Enemy {
  id: number;
  defId: string;
  pos: Vec;
  vel: Vec;
  knock: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
  stateT: number;
  attackIdx: number;
  cooldowns: number[];
  /** Locked direction for melee/dash windups. */
  attackDir: Vec;
  /** Locked landing point for lobbed windups. */
  attackPoint: Vec;
  hitPlayers: number[];
  hitFlash: number;
  spawnT: number;
  /** Per-enemy steering so packs fan out instead of stacking. */
  steer: number;
  strafe: number;
}

export interface Lob {
  from: Vec;
  to: Vec;
  t: number;
  dur: number;
  radius: number;
}

export interface Projectile {
  id: number;
  owner: "player" | "enemy";
  ownerId: number;
  kind: string;
  pos: Vec;
  vel: Vec;
  radius: number;
  damage: number;
  pierce: number;
  knockback: number;
  life: number;
  hitIds: number[];
  lob?: Lob;
}

export interface Dome {
  id: number;
  ownerId: number;
  pos: Vec;
  radius: number;
  t: number;
  maxT: number;
}

export interface Pickup {
  id: number;
  pos: Vec;
  gun: Gun;
  standT: number;
  armed: boolean;
}

export interface Director {
  wave: number;
  state: "breather" | "fighting";
  timer: number;
  kills: number;
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
  pickups: Pickup[];
  director: Director;
  events: SimEvent[];
  gameOver: boolean;
}

export type SimEvent =
  | { type: "shot"; playerId: number; x: number; y: number; angle: number; archetype: Archetype }
  | { type: "charge"; playerId: number }
  | { type: "hit"; x: number; y: number; targetId: number; damage: number; kill: boolean }
  | { type: "enemyDied"; x: number; y: number; id: number; defId: string }
  | { type: "explosion"; x: number; y: number; radius: number; owner: "player" | "enemy" }
  | { type: "blocked"; x: number; y: number }
  | { type: "spark"; x: number; y: number }
  | { type: "enemyWindup"; id: number; attack: AttackDef["type"] }
  | { type: "enemyAttack"; id: number; attack: AttackDef["type"] }
  | { type: "bonk"; id: number; x: number; y: number }
  | { type: "playerHurt"; id: number; damage: number }
  | { type: "playerDowned"; id: number; canRevive: boolean }
  | { type: "playerRevived"; id: number }
  | { type: "dash"; id: number }
  | { type: "skill"; id: number; x: number; y: number }
  | { type: "grenade"; id: number }
  | { type: "swap"; id: number }
  | { type: "pickup"; id: number; defId: string }
  | { type: "enemySpawn"; id: number }
  | { type: "waveStart"; wave: number }
  | { type: "waveCleared"; wave: number }
  | { type: "gameOver" };

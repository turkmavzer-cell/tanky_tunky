import type { RngState } from './rng';
import type { AbilityId, ShellKind, TankClassId } from './config';
import type { GameMap } from '../world/map';

/**
 * Parameter modifier — the building block for ability trees / upgrades (next round).
 * An upgrade is just a list of modifiers applied on top of the data-file values.
 */
export interface Modifier {
  /** Parameter name, e.g. "duration", "cooldown", "maxSpeed". */
  key: string;
  op: 'add' | 'mul' | 'set';
  value: number;
}

export interface AbilityState {
  id: AbilityId;
  /** Remaining effect time (s). > 0 while the ability is active. */
  active: number;
  /** Remaining cooldown (s). Starts when the effect ends. */
  cooldown: number;
  /** Seconds since activation (for multi-step abilities). */
  elapsed: number;
  /** Barrage: shots already fired; Mine: pending placement timer. */
  counter: number;
  /** Barrage: target point. */
  tx: number;
  ty: number;
  /** Modifiers from upgrades (empty this round). */
  mods: Modifier[];
}

export interface Tank {
  id: number;
  team: number;
  cls: TankClassId;
  name: string;
  /** Position in tile units. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Knockback velocity (decays). */
  kx: number;
  ky: number;
  /** Hull heading and turret angle (world, radians). */
  hull: number;
  turret: number;
  hp: number;
  alive: boolean;
  respawn: number;
  /** Remaining spawn protection (s): no damage taken; ends early when the tank fires. */
  protect: number;
  /** Index of the spawn point used last (to avoid repeats). */
  lastSpawn: number;
  // --- charged fire state (brief §4)
  charging: boolean;
  chargeT: number;
  fullT: number;
  cooldown: number;
  overheat: number;
  needRelease: boolean;
  prevButtons: number;
  // --- auto targeting (round-01 job 1)
  /** Locked target tank id or -1. */
  target: number;
  // --- ability (round-01 job 5)
  ability: AbilityState;
  /** Seconds left of the "hit while invisible" shimmer cue. */
  shimmer: number;
  /** Seconds until the next "bumped into an impassable edge" event may fire. */
  bumpCd: number;
  lastHitBy: number;
  kills: number;
  deaths: number;
}

export interface Shell {
  id: number;
  owner: number;
  team: number;
  kind: ShellKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  damage: number;
  radius: number;
  bounces: number;
  level: number;
  charge: number;
  perfect: boolean;
  ignore: number;
  // artillery arc
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  flight: number;
  arc: number;
  /** Landing point is announced to everyone (barrage warning circles). */
  warn: boolean;
  /** What caused this shell (kill attribution). */
  cause: DamageCause;
}

export interface Mine {
  id: number;
  owner: number;
  team: number;
  x: number;
  y: number;
  /** Seconds until armed. */
  arm: number;
}

export type DamageCause = 'shell' | 'rumble' | 'barrage' | 'mine' | 'environment';

export interface KillRecord {
  /** Match time (s). */
  t: number;
  /** Killer tank id, -1 for environment. */
  killer: number;
  victim: number;
  cause: DamageCause;
}

export type MatchPhase = 'countdown' | 'playing' | 'ended';

export interface MatchState {
  phase: MatchPhase;
  /** Seconds elapsed in the current phase. */
  t: number;
  /** Seconds left of play time. */
  timeLeft: number;
  kills: KillRecord[];
}

export interface TeamVision {
  /** 1 = tile visible to the team (everything when rules.fullVisibility, else = los). */
  visible: Uint8Array;
  /** 1 = tile in real line of sight of any team member (spawn safety uses this in every mode). */
  los: Uint8Array;
  /** 1 = tile was seen at least once (memory / "explored"). */
  explored: Uint8Array;
}

export interface MatchRules {
  /** Dev setting: multiplies every ability cooldown (0.1x–3x). */
  cooldownMul: number;
  /** Match length override (s); defaults to data/match.json. */
  duration: number;
  /** Play without countdown / timer (sandbox tests). */
  endless: boolean;
  /** Whole map + every enemy visible (no fog); forest/Hide rules still apply. Default from vision.json. */
  fullVisibility: boolean;
}

export type SimEvent =
  | { type: 'fire'; tank: number; x: number; y: number; angle: number; charge: number; perfect: boolean; kind: ShellKind }
  | { type: 'chargeFull'; tank: number }
  | { type: 'overheat'; tank: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'explode'; x: number; y: number; radius: number; charge: number; kind: ShellKind | 'mine' | 'rumble'; owner: number }
  | { type: 'hit'; target: number; by: number; damage: number; x: number; y: number }
  | { type: 'graze'; target: number; x: number; y: number }
  | { type: 'destroyed'; tank: number; by: number; x: number; y: number; cause: DamageCause }
  | { type: 'respawn'; tank: number }
  | { type: 'terrain'; x: number; y: number; destroyed: boolean }
  | { type: 'bump'; tank: number; x: number; y: number; dir: number }
  | { type: 'ability'; tank: number; id: AbilityId; phase: 'start' | 'end' }
  | { type: 'mineArmed'; mine: number }
  | { type: 'matchStart' }
  | { type: 'matchTick'; secondsLeft: number }
  | { type: 'matchEnd' };

/** Complete, plain-data simulation state. Cloneable and hashable; contains no functions. */
export interface SimState {
  tick: number;
  seed: number;
  rng: RngState;
  /** Terrain (mutable at runtime: destructibles). */
  map: GameMap;
  tanks: Tank[];
  shells: Shell[];
  mines: Mine[];
  nextId: number;
  /** Per-team fog of war, recomputed at vision.hz. Index = team. */
  vision: TeamVision[];
  match: MatchState;
  rules: MatchRules;
  /** Events produced during the last step (consumed by render/audio/haptics; not part of game logic). */
  events: SimEvent[];
}

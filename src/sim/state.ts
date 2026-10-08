import type { RngState } from './rng';
import type { ShellKind, TankClassId } from './config';
import type { GameMap } from '../world/map';

export interface Tank {
  id: number;
  team: number;
  cls: TankClassId;
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
  // --- charged fire state (brief §4)
  charging: boolean;
  /** Seconds the fire button has been charging. */
  chargeT: number;
  /** Seconds spent at 100 % charge (perfect window, then overheat). */
  fullT: number;
  cooldown: number;
  overheat: number;
  /** Must release fire before charging again (after overheat). */
  needRelease: boolean;
  prevButtons: number;
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
  /** Remaining travel distance (direct shells). */
  dist: number;
  damage: number;
  /** Explosion radius (tiles). */
  radius: number;
  bounces: number;
  /** Elevation level the shell flies at. */
  level: number;
  charge: number;
  perfect: boolean;
  /** Tank id that this shell already grazed (uphill miss) — not hittable again. */
  ignore: number;
  // artillery arc
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  flight: number;
  arc: number;
}

export type SimEvent =
  | { type: 'fire'; tank: number; x: number; y: number; angle: number; charge: number; perfect: boolean; kind: ShellKind }
  | { type: 'chargeFull'; tank: number }
  | { type: 'overheat'; tank: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'explode'; x: number; y: number; radius: number; charge: number; kind: ShellKind }
  | { type: 'hit'; target: number; by: number; damage: number; x: number; y: number }
  | { type: 'graze'; target: number; x: number; y: number }
  | { type: 'destroyed'; tank: number; by: number; x: number; y: number }
  | { type: 'respawn'; tank: number }
  | { type: 'terrain'; x: number; y: number; destroyed: boolean };

/** Complete, plain-data simulation state. Cloneable and hashable; contains no functions. */
export interface SimState {
  tick: number;
  seed: number;
  rng: RngState;
  /** Terrain (mutable at runtime: destructibles). */
  map: GameMap;
  tanks: Tank[];
  shells: Shell[];
  nextShellId: number;
  /** Events produced during the last step (consumed by render/audio/haptics; not part of game logic). */
  events: SimEvent[];
}

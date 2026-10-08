import type { RngState } from './rng';
import type { TankClassId } from './config';

export interface Tank {
  id: number;
  team: number;
  cls: TankClassId;
  /** Position in tile units. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Hull heading and turret angle (world, radians). */
  hull: number;
  turret: number;
  hp: number;
}

/** Complete, plain-data simulation state. Cloneable and hashable; contains no functions. */
export interface SimState {
  tick: number;
  seed: number;
  rng: RngState;
  width: number;
  height: number;
  tanks: Tank[];
}

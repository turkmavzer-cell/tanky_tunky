import tanksJson from '../data/tanks.json';

export type TankClassId = 'scout' | 'heavy' | 'standard' | 'artillery' | 'trapper';
export const TANK_CLASSES: readonly TankClassId[] = ['scout', 'heavy', 'standard', 'artillery', 'trapper'];

export interface TankClassDef {
  maxSpeed: number;
  accel: number;
  hullTurn: number;
  turretTurn: number;
  radius: number;
  hp: number;
  armor: number;
  vision: number;
  fireCooldown: number;
  chargeTime: number;
  chargeSlow: number;
  damage: number;
  shellSpeed: number;
  range: number;
}

export const TANKS: Readonly<Record<TankClassId, TankClassDef>> = tanksJson.classes;

/** Fixed simulation rate (brief §11). */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

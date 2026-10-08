import tanksJson from '../data/tanks.json';
import combatJson from '../data/combat.json';
import abilitiesJson from '../data/abilities.json';
import visionJson from '../data/vision.json';
import matchJson from '../data/match.json';

export type TankClassId = 'scout' | 'heavy' | 'standard' | 'artillery' | 'trapper';
export const TANK_CLASSES: readonly TankClassId[] = ['scout', 'heavy', 'standard', 'artillery', 'trapper'];
export type ShellKind = 'standard' | 'heavy' | 'artillery';
export type AbilityId = 'hide' | 'rumble' | 'swift' | 'barrage' | 'mine';
export const ABILITY_IDS: readonly AbilityId[] = ['hide', 'rumble', 'swift', 'barrage', 'mine'];

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
  shell: ShellKind;
  splash: number;
  bounces: number;
  minRange: number;
  arcHeight: number;
  ability: AbilityId;
}

export const TANKS = tanksJson.classes as Readonly<Record<TankClassId, TankClassDef>>;

export type Curve = readonly (readonly number[])[];
export interface CombatDef {
  charge: { tapThreshold: number; perfectWindow: number; perfectBonus: number; overheatAfter: number; overheatLock: number };
  scaling: { damage: Curve; speed: Curve; range: Curve; radius: Curve; knockback: Curve };
  shell: { hitRadius: number; knockback: number; splashFalloff: number; uphillMissChance: number; selfDamage: boolean; terrainDamageMul: number };
  tankCollision: { push: number };
  respawnTime: number;
  targeting: { switchRatio: number; leadIterations: number };
}
export const COMBAT = combatJson as CombatDef;

/** Piecewise-linear curve lookup (deterministic; no Math.pow). */
export function evalCurve(c: Curve, x: number): number {
  if (x <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (x <= c[i][0]) {
      const [x0, y0] = c[i - 1];
      const [x1, y1] = c[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return c[c.length - 1][1];
}

/** Fixed simulation rate (brief §11). */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** Ability parameters (data/abilities.json). All numbers are base values before modifiers. */
export interface AbilityDef {
  name: string;
  class: TankClassId;
  duration: number;
  cooldown: number;
  [key: string]: number | string | Curve;
}
export const ABILITIES = abilitiesJson as unknown as Readonly<Record<AbilityId, AbilityDef>>;

export interface VisionDef {
  hz: number;
  forestConcealRange: number;
  invisibleNoticeRange: number;
  elevationBonusPerLevel: number;
  memoryAlpha: number;
  unexploredAlpha: number;
}
export const VISION = visionJson as VisionDef;

export interface MatchDef {
  duration: number;
  countdown: number;
  finalWarning: number;
  respawnDelay: number;
  spawnProtection: number;
  spawn: { minDistanceFromDeath: number; minDistanceFromEnemies: number; avoidRepeat: boolean };
}
export const MATCH = matchJson as MatchDef;

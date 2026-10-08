/** Terrain ids + properties loaded from data/terrain.json (no gameplay constants in code). */
import terrain from '../data/terrain.json';

export const Ground = { Grass: 0, Dirt: 1, Sand: 2, Mud: 3, Shallow: 4, Deep: 5 } as const;
export type GroundId = (typeof Ground)[keyof typeof Ground];
export const Feature = { None: 0, Forest: 1, Rock: 2, Wall: 3, Crate: 4, Ruins: 5, Gate: 6, Bridge: 7 } as const;
export type FeatureId = (typeof Feature)[keyof typeof Feature];

export interface GroundDef {
  id: number;
  speedMul: number;
  moveCost: number;
  passable: boolean;
}
export interface FeatureDef {
  id: number;
  blocksMove: boolean;
  blocksLOS: boolean;
  blocksShots: boolean;
  speedMul: number;
  concealment: number;
  hp: number;
}

function byId<T extends { id: number }>(rec: Record<string, T>): T[] {
  const out: T[] = [];
  for (const v of Object.values(rec)) out[v.id] = v;
  return out;
}

export const GROUND: readonly GroundDef[] = byId(terrain.ground);
export const FEATURE: readonly FeatureDef[] = byId(terrain.feature);
export const GROUND_NAMES = Object.keys(terrain.ground);
export const FEATURE_NAMES = Object.keys(terrain.feature);
export const ELEVATION = terrain.elevation;
export const MAX_HEIGHT = terrain.elevation.levels - 1;

/**
 * Tile map data model (structure of arrays, cheap to clone/hash, DOM-free — shared by sim and render).
 * Tile (x, y) occupies world [x, x+1) × [y, y+1).
 */
import { ELEVATION, FEATURE, Feature, GROUND, Ground } from './terrain';
import { isPassable, isTileOpen } from './passability';

/** flags bits */
export const FLAG_RAMP = 1; // tile connects its height level with neighbours one level lower
export const FLAG_BASE = 2; // part of a team base area
export const FLAG_NO_BUILD = 4; // procedural generator must keep it clear
/** Bits 3-4: direction from a ramp tile down to the lower tile it connects: 0 +x, 1 -x, 2 +y, 3 -y. */
export const RAMP_DIR_SHIFT = 3;
export const RAMP_DIR_MASK = 3 << RAMP_DIR_SHIFT;
export const DIR4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Opposite of a DIR4 index. */
export const OPPOSITE_DIR = [1, 0, 3, 2] as const;

export function rampDir(m: GameMap, i: number): number {
  return (m.flags[i] & RAMP_DIR_MASK) >> RAMP_DIR_SHIFT;
}

export function setRamp(m: GameMap, i: number, dir: number): void {
  m.flags[i] = (m.flags[i] & ~RAMP_DIR_MASK) | FLAG_RAMP | (dir << RAMP_DIR_SHIFT);
}

/** Radius (tiles) of objective/capture zones. */
export const OBJECTIVE_RADIUS = 1.5;

export interface MapPoint {
  x: number;
  y: number;
}

export interface TeamBase {
  team: number;
  /** Base centre (tile coords). */
  x: number;
  y: number;
  /** Spawn tiles for the team's tanks (tile centres are x+0.5, y+0.5). */
  spawns: MapPoint[];
}

export interface GameMap {
  width: number;
  height: number;
  seed: number;
  ground: Uint8Array;
  feature: Uint8Array;
  /** Elevation level 0..MAX_HEIGHT. */
  elev: Uint8Array;
  flags: Uint8Array;
  /** Remaining hit points of destructible features (0 for indestructible/none). */
  hp: Uint16Array;
  bases: TeamBase[];
  /** Neutral objective zones (capture/flag) in WORLD coordinates (may be fractional), radius OBJECTIVE_RADIUS. */
  objectives: MapPoint[];
  /** Torches / light sources (night lighting). */
  lights: MapPoint[];
  /** Respawn candidates spread over the map (tile coords), all walkable and connected to the main region. */
  spawnPoints: MapPoint[];
  /** Incremented whenever terrain changes at runtime (destruction) so caches (LOS, paths, render) can refresh. */
  version: number;
}

export function createMap(width: number, height: number, seed = 0): GameMap {
  const n = width * height;
  return {
    width,
    height,
    seed,
    ground: new Uint8Array(n),
    feature: new Uint8Array(n),
    elev: new Uint8Array(n),
    flags: new Uint8Array(n),
    hp: new Uint16Array(n),
    bases: [],
    objectives: [],
    lights: [],
    spawnPoints: [],
    version: 0,
  };
}

export const idx = (m: GameMap, x: number, y: number): number => y * m.width + x;
export const inBounds = (m: GameMap, x: number, y: number): boolean => x >= 0 && y >= 0 && x < m.width && y < m.height;

/** Can a tank stand on this tile (ignoring elevation transitions)? Delegates to passability.ts. */
export function isWalkable(m: GameMap, x: number, y: number): boolean {
  return isTileOpen(m, x, y);
}

/** Tile-to-tile movement rule. Delegates to the single source of truth in passability.ts. */
export function canStep(m: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  return isPassable(m, ax, ay, bx, by);
}

export function blocksLOS(m: GameMap, x: number, y: number): boolean {
  return FEATURE[m.feature[y * m.width + x]].blocksLOS;
}

export function speedMulAt(m: GameMap, x: number, y: number): number {
  if (!inBounds(m, x, y)) return 0;
  const i = y * m.width + x;
  const f = m.feature[i];
  if (f === Feature.Bridge) return FEATURE[f].speedMul;
  return GROUND[m.ground[i]].speedMul * FEATURE[f].speedMul;
}

/** Applies damage to a destructible feature; returns true if it was destroyed (terrain changed). */
export function damageFeature(m: GameMap, x: number, y: number, dmg: number): boolean {
  const i = y * m.width + x;
  const def = FEATURE[m.feature[i]];
  if (def.hp <= 0 || m.hp[i] === 0) return false;
  m.hp[i] = Math.max(0, m.hp[i] - Math.ceil(dmg));
  if (m.hp[i] > 0) return false;
  m.feature[i] = m.feature[i] === Feature.Gate || m.feature[i] === Feature.Wall ? Feature.Ruins : Feature.None;
  m.version++;
  return true;
}

export function setFeature(m: GameMap, x: number, y: number, f: number): void {
  const i = y * m.width + x;
  m.feature[i] = f;
  m.hp[i] = FEATURE[f].hp;
}

export function visionBonusAt(m: GameMap, x: number, y: number): number {
  return inBounds(m, x, y) ? m.elev[y * m.width + x] * ELEVATION.visionBonusPerLevel : 0;
}

export { Ground, Feature };

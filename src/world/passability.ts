/**
 * THE single source of truth for "can a tank move from tile A to tile B?" (round-01 job 2).
 * Movement collision, pathfinding/reachability, map validation, AI and the cliff/edge visuals
 * all call these functions, so what the player sees and what the simulation allows can never diverge.
 */
import type { TankClassId } from '../sim/config';
import { DIR4, FLAG_RAMP, RAMP_DIR_MASK, RAMP_DIR_SHIFT, type GameMap } from './map';
import { ELEVATION, FEATURE, Feature, GROUND } from './terrain';

/** Largest level difference a ramp can connect (data/terrain.json). */
export const MAX_CLIMB: number = ELEVATION.maxClimb;
/** Largest level difference drivable without a ramp (data/terrain.json; 0 = ramps required). */
export const FREE_STEP: number = ELEVATION.freeStep;

/** Can a tank occupy this tile at all (terrain + features, ignoring neighbours)? */
export function isTileOpen(m: GameMap, x: number, y: number, _cls?: TankClassId): boolean {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
  const i = y * m.width + x;
  const f = m.feature[i];
  if (FEATURE[f].blocksMove) return false;
  if (f === Feature.Bridge) return true;
  return GROUND[m.ground[i]].passable;
}

/** Is the elevation change between two orthogonally adjacent tiles traversable? */
export function elevationStepOk(m: GameMap, ia: number, ib: number): boolean {
  const dh = Math.abs(m.elev[ia] - m.elev[ib]);
  if (dh === 0 || dh <= FREE_STEP) return true;
  if (dh > MAX_CLIMB) return false;
  // a ramp on the higher tile pointing at the lower one
  const hi = m.elev[ia] > m.elev[ib] ? ia : ib;
  const lo = hi === ia ? ib : ia;
  if (!(m.flags[hi] & FLAG_RAMP)) return false;
  const d = DIR4[(m.flags[hi] & RAMP_DIR_MASK) >> RAMP_DIR_SHIFT];
  return lo === hi + d[0] + d[1] * m.width;
}

/**
 * Can a tank step from tile (ax, ay) to the 8-neighbour (or same) tile (bx, by)?
 * Diagonal steps need both orthogonal corner tiles open and no elevation change on any side
 * (no corner cutting, ramps only orthogonally).
 */
export function isPassable(m: GameMap, ax: number, ay: number, bx: number, by: number, cls?: TankClassId): boolean {
  if (!isTileOpen(m, bx, by, cls)) return false;
  if (ax === bx && ay === by) return true;
  const W = m.width;
  const ia = ay * W + ax;
  const ib = by * W + bx;
  if (ax !== bx && ay !== by) {
    if (!isTileOpen(m, ax, by, cls) || !isTileOpen(m, bx, ay, cls)) return false;
    const e = m.elev[ia];
    return m.elev[ib] === e && m.elev[ay * W + bx] === e && m.elev[by * W + ax] === e;
  }
  return elevationStepOk(m, ia, ib);
}

/** What separates tile (x, y) from its neighbour in DIR4 direction `dir` — drives the edge visuals. */
export type EdgeKind = 'open' | 'ramp' | 'cliffUp' | 'cliffDown' | 'blocked' | 'mapEdge';

export function edgeKind(m: GameMap, x: number, y: number, dir: number): EdgeKind {
  const [dx, dy] = DIR4[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) return 'mapEdge';
  const i = y * m.width + x;
  const j = ny * m.width + nx;
  if (m.elev[i] !== m.elev[j]) {
    if (elevationStepOk(m, i, j)) return 'ramp';
    return m.elev[i] > m.elev[j] ? 'cliffDown' : 'cliffUp';
  }
  if (!isTileOpen(m, x, y) || !isTileOpen(m, nx, ny)) return 'blocked';
  return 'open';
}

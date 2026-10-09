/**
 * VisibilitySystem — the single source of truth for "who can see what" (brief §5).
 * Render (fog, hidden enemies), auto-targeting, AI perception and audio muffling all read it.
 *
 * - Line of sight: symmetric shadowcasting (A. Ford) on the tile grid, radius = class vision
 *   + elevation bonus. Opaque: features with blocksLOS (rock, wall, gate) and tiles higher than
 *   the viewer (cliff edges are seen, what lies beyond is not).
 * - Full visibility (rules.fullVisibility, the default since D-037): every tile and every enemy is
 *   visible; line of sight is still computed into `los` (spawn safety, LOS mode for tests/modes).
 * - Forest concealment: a tank standing in forest is only visible from ≤ forestConcealRange.
 * - Invisibility (Scout "Hide"): never visible / targetable; AI may *notice* it within noticeRange.
 * Recomputed at VISION.hz from simulation ticks only (deterministic).
 */
import { TANKS, VISION, ABILITIES } from './config';
import type { SimState, Tank, TeamVision } from './state';
import { FEATURE, Feature } from '../world/terrain';
import type { GameMap } from '../world/map';

export const TEAMS = 2;

export function createVision(map: GameMap): TeamVision[] {
  const n = map.width * map.height;
  const out: TeamVision[] = [];
  for (let t = 0; t < TEAMS; t++) out.push({ visible: new Uint8Array(n), los: new Uint8Array(n), explored: new Uint8Array(n) });
  return out;
}

/** Ticks between vision updates (60 Hz sim / 15 Hz vision = 4). */
export const VISION_INTERVAL = Math.max(1, Math.round(60 / VISION.hz));

/** Vision radius (tiles) of a tank, including the elevation bonus. */
export function visionRadius(m: GameMap, t: Tank): number {
  const e = m.elev[Math.floor(t.y) * m.width + Math.floor(t.x)];
  return TANKS[t.cls].vision + e * VISION.elevationBonusPerLevel;
}

/** Recompute every team's visible set (and accumulate explored memory). */
export function updateVision(s: SimState): void {
  const m = s.map;
  for (let team = 0; team < s.vision.length; team++) {
    const v = s.vision[team];
    v.los.fill(0);
    for (const t of s.tanks) {
      if (!t.alive || t.team !== team) continue;
      castFov(m, Math.floor(t.x), Math.floor(t.y), visionRadius(m, t), v.los);
    }
    if (s.rules.fullVisibility) v.visible.fill(1);
    else v.visible.set(v.los);
    const vis = v.visible;
    const exp = v.explored;
    for (let i = 0; i < vis.length; i++) if (vis[i]) exp[i] = 1;
  }
}

/** Is tank `t` standing in forest (concealed: enemies see it only up close, translucent)? */
export function inForest(s: SimState, t: Tank): boolean {
  const m = s.map;
  return m.feature[Math.floor(t.y) * m.width + Math.floor(t.x)] === Feature.Forest;
}

/** Is tank `t` invisible (Hide active)? */
export function isInvisible(t: Tank): boolean {
  return t.ability.id === 'hide' && t.ability.active > 0;
}

function nearestObserverDist2(s: SimState, team: number, x: number, y: number): number {
  let best = Infinity;
  for (const o of s.tanks) {
    if (!o.alive || o.team !== team) continue;
    const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Can `team` see tank `t` right now? Used for rendering, targeting and AI "sight".
 * Own team always sees its own tanks.
 */
export function canSeeTank(s: SimState, team: number, t: Tank): boolean {
  if (!t.alive) return false;
  if (t.team === team) return true;
  if (isInvisible(t)) return false;
  const m = s.map;
  const tx = Math.floor(t.x);
  const ty = Math.floor(t.y);
  const i = ty * m.width + tx;
  if (!s.vision[team].visible[i]) return false;
  if (m.feature[i] === Feature.Forest) {
    const r = VISION.forestConcealRange;
    return nearestObserverDist2(s, team, t.x, t.y) <= r * r;
  }
  return true;
}

/**
 * AI-only weaker perception: an invisible tank is *noticed* (position known) when an observer of
 * `team` is within the ability's noticeRange. Never used for rendering or auto-targeting.
 */
export function canNoticeTank(s: SimState, team: number, t: Tank): boolean {
  if (canSeeTank(s, team, t)) return true;
  if (!t.alive || t.team === team || !isInvisible(t)) return false;
  const r = Number(ABILITIES.hide.noticeRange);
  return nearestObserverDist2(s, team, t.x, t.y) <= r * r;
}

/** Is world tile (x, y) currently visible to `team`? */
export function tileVisible(s: SimState, team: number, x: number, y: number): boolean {
  const m = s.map;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return false;
  return s.vision[team].visible[ty * m.width + tx] === 1;
}

// ---------------------------------------------------------------------------------------------
// Symmetric shadowcasting (Albert Ford, 2021) — exact rational slopes kept as plain numbers;
// only + - * / and floor/ceil are used, so results are identical on every device.

function isOpaque(m: GameMap, x: number, y: number, viewerElev: number): boolean {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return true;
  const i = y * m.width + x;
  if (m.elev[i] > viewerElev) return true;
  return FEATURE[m.feature[i]].blocksLOS;
}

/** Marks every tile within `radius` of (ox, oy) that has line of sight into `out`. */
export function castFov(m: GameMap, ox: number, oy: number, radius: number, out: Uint8Array): void {
  if (ox < 0 || oy < 0 || ox >= m.width || oy >= m.height) return;
  const W = m.width;
  out[oy * W + ox] = 1;
  const viewerElev = m.elev[oy * W + ox];
  const r2 = radius * radius;
  const maxDepth = Math.ceil(radius);
  for (let q = 0; q < 4; q++) {
    // transform (depth, col) of quadrant q to map coordinates
    const tx = (depth: number, col: number): number => (q === 0 ? ox + col : q === 1 ? ox + col : q === 2 ? ox + depth : ox - depth);
    const ty = (depth: number, col: number): number => (q === 0 ? oy - depth : q === 1 ? oy + depth : q === 2 ? oy + col : oy + col);
    const reveal = (depth: number, col: number): void => {
      const x = tx(depth, col);
      const y = ty(depth, col);
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) return;
      if (depth * depth + col * col > r2) return;
      out[y * W + x] = 1;
    };
    const wall = (depth: number, col: number): boolean => isOpaque(m, tx(depth, col), ty(depth, col), viewerElev);
    const scan = (depth: number, start: number, end: number): void => {
      if (depth > maxDepth) return;
      const minCol = Math.floor(depth * start + 0.5);
      const maxCol = Math.ceil(depth * end - 0.5);
      let prevWall = -1; // -1 none, 0 floor, 1 wall
      for (let col = minCol; col <= maxCol; col++) {
        const isWall = wall(depth, col);
        const symmetric = col >= depth * start && col <= depth * end;
        if (isWall || symmetric) reveal(depth, col);
        if (prevWall === 1 && !isWall) start = (2 * col - 1) / (2 * depth);
        if (prevWall === 0 && isWall) scan(depth + 1, start, (2 * col - 1) / (2 * depth));
        prevWall = isWall ? 1 : 0;
      }
      if (prevWall === 0) scan(depth + 1, start, end);
    };
    scan(1, -1, 1);
  }
}

/**
 * Seeded procedural map generator (brief §7).
 *
 * Pipeline: simplex height/moisture fields → elevation plateaus → river with bridges and fords →
 * lakes/mud/sand → forests/rocks/ruins → bases with cover, torches and spawns → objectives →
 * ramps for every plateau → connectivity repair (carving) → validation.
 *
 * Fairness by construction: the map is point-symmetric around its centre (team 1's half is the
 * 180° rotation of team 0's half), so distances, cover and resources are identical for both teams.
 * `validateMap` re-checks reachability and fairness explicitly (used by tests and fuzzing).
 */
import { Rng, hashString } from '../sim/rng';
import { Simplex2 } from './noise';
import { DIR4, FLAG_BASE, FLAG_NO_BUILD, FLAG_RAMP, OBJECTIVE_RADIUS, OPPOSITE_DIR, RAMP_DIR_MASK, createMap, rampDir, setRamp, isWalkable, setFeature, type GameMap, type MapPoint } from './map';
import { Feature, Ground, MAX_HEIGHT } from './terrain';
import { components, distanceField, floodFill } from './reach';

export type MapSize = 40 | 64 | 96;
export const MAP_SIZES: readonly MapSize[] = [40, 64, 96];

export interface GenOptions {
  seed: number;
  size: MapSize;
  /** Tanks per team (spawn slots). */
  teamSize?: number;
  /** Amount of water 0..1 (default 0.5). */
  water?: number;
  /** Amount of forest 0..1 (default 0.5). */
  forest?: number;
}

export function dailySeed(date: Date): number {
  const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return hashString(`tanky-daily-${iso}`);
}

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

class Builder {
  readonly m: GameMap;
  readonly n: number;
  constructor(size: number, seed: number) {
    this.m = createMap(size, size, seed);
    this.n = size;
  }
  mirror(x: number, y: number): [number, number] {
    return [this.n - 1 - x, this.n - 1 - y];
  }
  /** True for the canonical half (including the centre line) of a point-symmetric pair. */
  canonical(x: number, y: number): boolean {
    const i = y * this.n + x;
    const j = (this.n - 1 - y) * this.n + (this.n - 1 - x);
    return i <= j;
  }
  i(x: number, y: number): number {
    return y * this.n + x;
  }
  /** Sets a tile and its mirror (`mirrored` = true for the rotated copy, e.g. to flip directions). */
  set(x: number, y: number, f: (i: number, x: number, y: number, mirrored: boolean) => void): void {
    f(this.i(x, y), x, y, false);
    const [mx, my] = this.mirror(x, y);
    if (mx !== x || my !== y) f(this.i(mx, my), mx, my, true);
  }
  inside(x: number, y: number, margin = 0): boolean {
    return x >= margin && y >= margin && x < this.n - margin && y < this.n - margin;
  }
}

export function generateMap(opts: GenOptions): GameMap {
  const N = opts.size;
  const seed = opts.seed >>> 0;
  const rng = new Rng(seed ^ 0x5eed);
  const b = new Builder(N, seed);
  const m = b.m;
  const water = opts.water ?? 0.5;
  const forest = opts.forest ?? 0.5;
  const teamSize = opts.teamSize ?? 5;
  const hNoise = new Simplex2(seed);
  const mNoise = new Simplex2(seed ^ 0x9e3779b9);
  const dNoise = new Simplex2(seed ^ 0x7f4a7c15);
  const scale = 1 / 14;

  // Base locations (team 0 near the (0,0) corner, team 1 mirrored).
  const margin = Math.max(4, Math.round(N * 0.1));
  const base0: MapPoint = { x: margin, y: margin };
  const baseR = N >= 64 ? 4 : 3;
  const distToBase = (x: number, y: number): number => {
    const [mx, my] = b.mirror(x, y);
    const d0 = Math.max(Math.abs(x - base0.x), Math.abs(y - base0.y));
    const d1 = Math.max(Math.abs(mx - base0.x), Math.abs(my - base0.y));
    return Math.min(d0, d1);
  };

  // 1. Elevation + moisture fields on the canonical half, mirrored.
  const heightF = new Float64Array(N * N);
  const moistF = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!b.canonical(x, y)) continue;
      const h = hNoise.fbm(x * scale, y * scale, 4);
      const mo = mNoise.fbm(x * scale * 1.3 + 31.7, y * scale * 1.3 - 12.1, 3);
      b.set(x, y, (i) => {
        heightF[i] = h;
        moistF[i] = mo;
      });
    }
  }
  // Elevation by quantile so every seed gets a comparable amount of high ground.
  const sorted = Array.from(heightF).sort((a, c) => a - c);
  const t1 = sorted[Math.floor(sorted.length * 0.72)];
  const t2 = sorted[Math.floor(sorted.length * 0.9)];
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const y = (i - x) / N;
    let e = heightF[i] > t2 ? 2 : heightF[i] > t1 ? 1 : 0;
    if (distToBase(x, y) <= baseR + 2) e = 0; // bases are on flat low ground
    m.elev[i] = Math.min(e, MAX_HEIGHT);
  }
  // Remove single-tile spikes/pits (ugly and unfair).
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        if (!b.canonical(x, y)) continue;
        const i = b.i(x, y);
        let same = 0;
        for (const [dx, dy] of ORTHO) if (m.elev[b.i(x + dx, y + dy)] === m.elev[i]) same++;
        if (same <= 1) {
          const v = m.elev[b.i(x + 1, y)];
          b.set(x, y, (k) => (m.elev[k] = v));
        }
      }
    }
  }

  // 2. River along the anti-diagonal (x + y ≈ N - 1), meandering; self-symmetric under 180° rotation.
  const riverHalfWidth = N >= 64 ? 1.6 : 1.1;
  const riverOn = water > 0.15;
  const riverDist = new Float64Array(N * N).fill(99);
  if (riverOn) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!b.canonical(x, y)) continue;
        // coordinate along the river and offset across it
        const along = (x - y) / Math.SQRT2;
        const across = (x + y - (N - 1)) / Math.SQRT2;
        // meander must be odd in `along` so that the mirrored point lies on the mirrored meander
        const meander = 2.2 * (dNoise.noise(along * 0.09, 3.3) - dNoise.noise(-along * 0.09, 3.3));
        const d = Math.abs(across - meander);
        b.set(x, y, (i) => (riverDist[i] = d));
      }
    }
  }

  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const y = (i - x) / N;
    const mo = moistF[i];
    const rd = riverDist[i];
    let g: number = Ground.Grass;
    if (rd < riverHalfWidth) {
      g = Ground.Deep;
      m.elev[i] = 0;
    } else if (rd < riverHalfWidth + 0.9) {
      g = Ground.Shallow;
      m.elev[i] = 0;
    } else if (m.elev[i] === 0 && mo < -0.45 + (0.5 - water) * 0.3) g = mo < -0.6 ? Ground.Deep : Ground.Shallow; // lakes (before banks: no sand strips inside water)
    else if (rd < riverHalfWidth + 1.8 && m.elev[i] === 0) g = Ground.Sand;
    else if (m.elev[i] === 0 && mo < -0.32 + (0.5 - water) * 0.3) g = Ground.Mud;
    else if (mo > 0.55) g = Ground.Dirt;
    if (distToBase(x, y) <= baseR + 1 && g !== Ground.Grass) g = Ground.Grass;
    m.ground[i] = g;
  }
  // Water must sit at elevation 0 and lake edges become shallow so deep water never touches cliffs.
  for (let i = 0; i < N * N; i++) if (m.ground[i] === Ground.Deep || m.ground[i] === Ground.Shallow) m.elev[i] = 0;

  // 3. Bridges and fords across the river (symmetric).
  if (riverOn) {
    const crossings = N >= 96 ? 3 : N >= 64 ? 2 : 1;
    // positions along the river measured from the centre: 0 (centre) and ± offsets
    const offsets = crossings === 1 ? [0] : crossings === 2 ? [0.3] : [0, 0.33];
    for (const off of offsets) {
      const t = Math.round(off * N * 0.5);
      // walk across the river at along-offset t: tiles with x - y ≈ 2t
      const isBridge = off !== 0 || crossings === 1;
      for (let k = -Math.ceil(riverHalfWidth + 2); k <= Math.ceil(riverHalfWidth + 2); k++) {
        // centre line x + y = N-1; along direction (1,-1)
        const cx = Math.round((N - 1) / 2 + t + k / 2);
        const cy = Math.round((N - 1) / 2 - t + k / 2);
        for (const [x, y] of [
          [cx, cy],
          [cx + 1, cy],
        ]) {
          if (!b.inside(x, y)) continue;
          b.set(x, y, (i) => {
            if (m.ground[i] === Ground.Deep) {
              if (isBridge) {
                m.feature[i] = Feature.Bridge;
              } else m.ground[i] = Ground.Shallow; // ford
            }
          });
        }
      }
    }
  }

  // 4. Features: forests, rocks, ruins clusters.
  const forestT = 0.35 - forest * 0.35;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!b.canonical(x, y)) continue;
      const i = b.i(x, y);
      if (m.feature[i] !== Feature.None) continue;
      const g = m.ground[i];
      if (g === Ground.Deep || g === Ground.Shallow) continue;
      if (distToBase(x, y) <= baseR + 1) continue;
      const fN = dNoise.fbm(x * 0.11 + 100, y * 0.11, 2);
      let f: number = Feature.None;
      if (g === Ground.Grass && fN > forestT && moistF[i] > -0.2) f = Feature.Forest;
      else if (rng.next() < 0.025 && g !== Ground.Mud) f = Feature.Rock;
      else if (rng.next() < 0.012) f = Feature.Crate;
      if (f !== Feature.None) b.set(x, y, (_k, xx, yy) => setFeature(m, xx, yy, f));
    }
  }
  // Ruins clusters with destructible walls, a torch and occasionally a gate.
  const ruinCount = Math.max(1, Math.round((N * N) / 1400));
  for (let r = 0; r < ruinCount; r++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const cx = rng.int(3, N - 4);
      const cy = rng.int(3, N - 4);
      if (!b.canonical(cx, cy) || distToBase(cx, cy) < baseR + 5) continue;
      if (Math.abs(cx + cy - (N - 1)) < riverHalfWidth + 4) continue;
      const e = m.elev[b.i(cx, cy)];
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const i = b.i(cx + dx, cy + dy);
          if (m.elev[i] !== e || m.ground[i] === Ground.Deep || m.ground[i] === Ground.Shallow) ok = false;
        }
      if (!ok) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
          const x = cx + dx;
          const y = cy + dy;
          // roll once per symmetric pair so both halves get the same feature
          let f: number;
          if (edge) {
            const gap = (dx === 0 || dy === 0) && rng.next() < 0.75;
            f = gap ? Feature.Ruins : rng.next() < 0.75 ? Feature.Wall : Feature.Ruins;
          } else f = rng.next() < 0.12 ? Feature.Crate : Feature.None;
          b.set(x, y, (i, xx, yy) => {
            m.ground[i] = Ground.Dirt;
            setFeature(m, xx, yy, f);
          });
        }
      // a gate on one side, opposite side open
      if (rng.next() < 0.5) b.set(cx + 2, cy, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Gate));
      b.set(cx - 2, cy, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Ruins));
      b.set(cx, cy, (_i, xx, yy) => m.lights.push({ x: xx, y: yy }));
      break;
    }
  }

  // 5. Bases: flat dirt square, partial walls for cover, torches and spawn slots.
  const placeBase = (team: number, bx: number, by: number, sign: number): void => {
    const spawns: MapPoint[] = [];
    for (let dy = -baseR; dy <= baseR; dy++) {
      for (let dx = -baseR; dx <= baseR; dx++) {
        const x = bx + dx;
        const y = by + dy;
        if (!b.inside(x, y)) continue;
        const i = b.i(x, y);
        m.ground[i] = Ground.Dirt;
        m.elev[i] = 0;
        m.flags[i] |= FLAG_BASE | FLAG_NO_BUILD;
        setFeature(m, x, y, Feature.None);
      }
    }
    // L-shaped cover walls in front of the base (toward the map centre)
    for (let k = -1; k <= 1; k++) {
      const wx = bx + sign * (baseR - 1);
      const wy = by + k * 2;
      if (b.inside(wx, wy)) setFeature(m, wx, wy, k === 0 ? Feature.Crate : Feature.Wall);
      const vx = bx + k * 2;
      const vy = by + sign * (baseR - 1);
      if (b.inside(vx, vy)) setFeature(m, vx, vy, k === 0 ? Feature.Crate : Feature.Wall);
    }
    m.lights.push({ x: bx - sign * baseR, y: by - sign * baseR }, { x: bx + sign * baseR, y: by - sign * baseR }, { x: bx - sign * baseR, y: by + sign * baseR });
    // spawn ring around the centre
    const ring: [number, number][] = [
      [0, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [2, 0],
      [0, 2],
      [-2, 0],
      [0, -2],
    ];
    for (let s = 0; s < Math.min(teamSize, ring.length); s++) spawns.push({ x: bx + ring[s][0] * sign, y: by + ring[s][1] * sign });
    m.bases.push({ team, x: bx, y: by, spawns });
  };
  const [b1x, b1y] = b.mirror(base0.x, base0.y);
  placeBase(0, base0.x, base0.y, 1);
  placeBase(1, b1x, b1y, -1);

  // 6. Objectives (world coordinates): exact map centre + a symmetric pair. Zones are cleared/bridged.
  const half = N / 2;
  const o = Math.round(N * 0.22);
  m.objectives.push({ x: half, y: half }, { x: half - o, y: half + o }, { x: half + o, y: half - o });
  for (const p of m.objectives) {
    forZone(N, p, (x, y) => {
      if (!b.canonical(x, y)) return;
      b.set(x, y, (i, xx, yy) => {
        if (m.ground[i] === Ground.Deep) m.ground[i] = Ground.Shallow;
        if (m.feature[i] !== Feature.Bridge) setFeature(m, xx, yy, Feature.None);
        m.flags[i] |= FLAG_NO_BUILD;
      });
    });
  }

  // 7. Ramps: every plateau component gets ramps on its border toward walkable lower ground.
  addRamps(b, rng);

  // 8. Connectivity repair: carve until every sizeable walkable component joins team 0's base.
  repairConnectivity(b);

  // Sanity: keep the map edges free of features so nothing is unreachable along borders.
  m.version = 1;
  return m;
}

function addRamps(b: Builder, rng: Rng): void {
  const m = b.m;
  const N = b.n;
  // Label connected plateau regions per elevation level (4-neighbour, same elevation, walkable or not).
  const label = new Int32Array(N * N).fill(-1);
  let next = 0;
  const regions: number[][] = [];
  for (let i = 0; i < N * N; i++) {
    if (label[i] >= 0 || m.elev[i] === 0) continue;
    const e = m.elev[i];
    const stack = [i];
    label[i] = next;
    const tiles: number[] = [];
    while (stack.length) {
      const k = stack.pop()!;
      tiles.push(k);
      const x = k % N;
      const y = (k - x) / N;
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (label[j] >= 0 || m.elev[j] !== e) continue;
        label[j] = next;
        stack.push(j);
      }
    }
    regions.push(tiles);
    next++;
  }
  for (const tiles of regions) {
    // candidate ramp tiles: walkable, exactly one orthogonal lower neighbour (elev-1, walkable),
    // and the opposite neighbour is same-level walkable (so the ramp leads somewhere).
    const cands: number[] = [];
    const candDir = new Map<number, number>();
    for (const k of tiles) {
      const x = k % N;
      const y = (k - x) / N;
      if (!b.canonical(x, y)) continue;
      if (!isWalkable(m, x, y)) continue;
      for (const [dx, dy] of ORTHO) {
        const lx = x + dx;
        const ly = y + dy;
        const ox = x - dx;
        const oy = y - dy;
        if (lx < 1 || ly < 1 || lx >= N - 1 || ly >= N - 1 || ox < 0 || oy < 0 || ox >= N || oy >= N) continue;
        const li = ly * N + lx;
        const oi = oy * N + ox;
        if (m.elev[li] === m.elev[k] - 1 && isWalkable(m, lx, ly) && m.elev[oi] === m.elev[k] && isWalkable(m, ox, oy)) {
          cands.push(k);
          candDir.set(k, DIR4.findIndex(([ax, ay]) => ax === dx && ay === dy));
          break;
        }
      }
    }
    if (!cands.length) continue;
    const want = Math.max(1, Math.min(3, Math.round(tiles.length / 40)));
    // pick spread-out candidates
    const chosen: number[] = [];
    for (let a = 0; a < want * 6 && chosen.length < want; a++) {
      const k = cands[rng.int(0, cands.length - 1)];
      const x = k % N;
      const y = (k - x) / N;
      if (chosen.some((c) => Math.abs((c % N) - x) + Math.abs(Math.floor(c / N) - y) < 6)) continue;
      chosen.push(k);
    }
    for (const k of chosen) {
      const x = k % N;
      const y = (k - x) / N;
      const dir = candDir.get(k)!;
      b.set(x, y, (i, xx, yy, mirrored) => {
        setRamp(m, i, mirrored ? OPPOSITE_DIR[dir] : dir);
        setFeature(m, xx, yy, Feature.None);
      });
    }
  }
}

/** Carve symmetric corridors so every walkable component of size >= 8 is reachable from base 0; tiny ones are filled with rock. */
function repairConnectivity(b: Builder): void {
  const m = b.m;
  const N = b.n;
  const base = m.bases[0];
  // objectives and spawns must be connected no matter how small their region is
  const mustConnect = new Uint8Array(N * N);
  for (const o of m.objectives) forZone(N, o, (x, y) => (mustConnect[y * N + x] = 1));
  for (const bs of m.bases) for (const s of bs.spawns) mustConnect[s.y * N + s.x] = 1;
  for (let iter = 0; iter < 400; iter++) {
    const reach = floodFill(m, base.x, base.y);
    const { labels, sizes } = components(m);
    let target = -1;
    for (let i = 0; i < N * N; i++) {
      if (labels[i] && !reach[i]) {
        if (sizes[labels[i]] < 8 && !mustConnect[i]) {
          const x = i % N;
          const y = (i - x) / N;
          if (!(m.flags[i] & FLAG_NO_BUILD)) b.set(x, y, (_k, xx, yy) => setFeature(m, xx, yy, Feature.Rock));
          continue;
        }
        target = i;
        break;
      }
    }
    if (target < 0) return;
    // BFS from target (ignoring blockers) to the nearest reachable tile, then carve along the path.
    const prev = new Int32Array(N * N).fill(-1);
    const q = [target];
    prev[target] = target;
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) {
      const k = q[h];
      const x = k % N;
      const y = (k - x) / N;
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (prev[j] >= 0) continue;
        prev[j] = k;
        if (reach[j]) {
          hit = j;
          break;
        }
        q.push(j);
      }
    }
    if (hit < 0) return;
    // walk back from hit to target and make the whole path traversable
    const path: number[] = [hit];
    for (let cur = hit; cur !== target; ) {
      cur = prev[cur];
      path.push(cur);
    }
    carvePath(b, path);
  }
}

/**
 * Makes a 4-connected tile path traversable: clears blockers, turns deep water into shallow,
 * and resolves elevation steps with directed ramps. A tile that would need to ramp in two
 * directions is flattened instead. Heights only ever decrease, so the loop terminates.
 */
function carvePath(b: Builder, path: number[]): void {
  const m = b.m;
  const N = b.n;
  for (const k of path) {
    const x = k % N;
    const y = (k - x) / N;
    b.set(x, y, (i, xx, yy) => {
      if (m.feature[i] !== Feature.None && m.feature[i] !== Feature.Bridge && m.feature[i] !== Feature.Forest) setFeature(m, xx, yy, Feature.None);
      if (m.ground[i] === Ground.Deep && m.feature[i] !== Feature.Bridge) m.ground[i] = Ground.Shallow;
    });
  }
  const setElev = (k: number, e: number): void => {
    const x = k % N;
    const y = (k - x) / N;
    b.set(x, y, (i) => {
      m.elev[i] = e;
      m.flags[i] &= ~(FLAG_RAMP | RAMP_DIR_MASK);
    });
  };
  for (let guard = 0; guard < 64; guard++) {
    let changed = false;
    for (let s = 0; s + 1 < path.length; s++) {
      const a = path[s];
      const c = path[s + 1];
      const dh = m.elev[a] - m.elev[c];
      if (dh === 0) continue;
      const hi = dh > 0 ? a : c;
      const lo = dh > 0 ? c : a;
      if (Math.abs(dh) >= 2) {
        setElev(hi, m.elev[lo] + 1);
        changed = true;
        continue;
      }
      const hx = hi % N;
      const hy = (hi - hx) / N;
      const lx = lo % N;
      const ly = (lo - lx) / N;
      const dir = DIR4.findIndex(([ax, ay]) => ax === lx - hx && ay === ly - hy);
      if (m.flags[hi] & FLAG_RAMP) {
        if (rampDir(m, hi) === dir) continue;
        // never re-point an existing ramp (that would cut whatever it connected): flatten instead.
        setElev(hi, m.elev[lo]);
        changed = true;
        continue;
      }
      b.set(hx, hy, (i, xx, yy, mirrored) => {
        setRamp(m, i, mirrored ? OPPOSITE_DIR[dir] : dir);
        setFeature(m, xx, yy, Feature.None);
      });
      changed = true;
    }
    if (!changed) return;
  }
}

export interface MapReport {
  ok: boolean;
  errors: string[];
  /** Weighted path distance between the two bases. */
  baseDistance: number;
  /** Per-team distances to each objective. */
  objectiveDistances: number[][];
  reachableFraction: number;
}

/** Validates reachability and fairness (brief §7 / §10.6). */
export function validateMap(m: GameMap): MapReport {
  const errors: string[] = [];
  const fields = m.bases.map((bs) => distanceField(m, bs.x, bs.y));
  const reach0 = floodFill(m, m.bases[0].x, m.bases[0].y);
  for (const bs of m.bases) {
    for (const s of bs.spawns) {
      if (!isWalkable(m, s.x, s.y)) errors.push(`team ${bs.team} spawn ${s.x},${s.y} not walkable`);
      else if (!reach0[s.y * m.width + s.x]) errors.push(`team ${bs.team} spawn ${s.x},${s.y} unreachable`);
      // spawn must not be boxed in: at least 3 walkable neighbours
      let free = 0;
      for (const [dx, dy] of ORTHO) if (isWalkable(m, s.x + dx, s.y + dy)) free++;
      if (free < 2) errors.push(`team ${bs.team} spawn ${s.x},${s.y} boxed in`);
    }
  }
  const baseDistance = fields[0][m.bases[1].y * m.width + m.bases[1].x];
  if (!isFinite(baseDistance)) errors.push('bases not connected');
  // distance to an objective = best distance to any tile of its zone
  const objectiveDistances = fields.map((f) =>
    m.objectives.map((o) => {
      let best = Infinity;
      forZone(m.width, o, (x, y) => (best = Math.min(best, f[y * m.width + x])));
      return best;
    }),
  );
  for (let k = 0; k < m.objectives.length; k++) {
    if (!isFinite(objectiveDistances[0][k]) || !isFinite(objectiveDistances[1][k])) errors.push(`objective ${k} unreachable`);
  }
  // fairness: the multiset of objective distances must match within 10 % for both teams
  const s0 = [...objectiveDistances[0]].sort((a, c) => a - c);
  const s1 = [...objectiveDistances[1]].sort((a, c) => a - c);
  for (let k = 0; k < s0.length; k++) {
    if (Math.abs(s0[k] - s1[k]) > 0.1 * Math.max(s0[k], s1[k]) + 1e-9) errors.push(`objective distance unfair: ${s0[k].toFixed(1)} vs ${s1[k].toFixed(1)}`);
  }
  // every walkable tile in a component of size >= 8 must be reachable
  const { labels, sizes } = components(m);
  let walk = 0;
  let reached = 0;
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) continue;
    walk++;
    if (reach0[i]) reached++;
    else if (sizes[labels[i]] >= 8) {
      errors.push(`isolated region of ${sizes[labels[i]]} tiles at ${i % m.width},${Math.floor(i / m.width)}`);
      break;
    }
  }
  // cover parity near bases
  const coverNear = (bx: number, by: number): number => {
    let c = 0;
    for (let y = by - 10; y <= by + 10; y++)
      for (let x = bx - 10; x <= bx + 10; x++) {
        if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
        const f = m.feature[y * m.width + x];
        if (f === Feature.Forest || f === Feature.Rock || f === Feature.Wall || f === Feature.Crate) c++;
      }
    return c;
  };
  const c0 = coverNear(m.bases[0].x, m.bases[0].y);
  const c1 = coverNear(m.bases[1].x, m.bases[1].y);
  if (Math.abs(c0 - c1) > Math.max(2, 0.1 * Math.max(c0, c1))) errors.push(`cover unfair: ${c0} vs ${c1}`);
  return { ok: errors.length === 0, errors, baseDistance, objectiveDistances, reachableFraction: walk ? reached / walk : 0 };
}

/** Calls fn for every tile whose centre lies inside the objective zone around world point p. */
export function forZone(size: number, p: MapPoint, fn: (x: number, y: number) => void): void {
  const r = OBJECTIVE_RADIUS;
  for (let y = Math.floor(p.y - r); y <= Math.ceil(p.y + r); y++)
    for (let x = Math.floor(p.x - r); x <= Math.ceil(p.x + r); x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const dx = x + 0.5 - p.x;
      const dy = y + 0.5 - p.y;
      if (dx * dx + dy * dy <= r * r) fn(x, y);
    }
}

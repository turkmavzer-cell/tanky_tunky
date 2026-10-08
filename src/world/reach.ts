/** Reachability and distance fields over the tile graph (8-neighbour, respects elevation/ramps). */
import { canStep, type GameMap } from './map';
import { GROUND, FEATURE, Feature } from './terrain';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Flood fill from a tile; returns Uint8Array mask of reachable tiles. */
export function floodFill(m: GameMap, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(m.width * m.height);
  const stack: number[] = [sy * m.width + sx];
  seen[sy * m.width + sx] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % m.width;
    const y = (i - x) / m.width;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      const j = ny * m.width + nx;
      if (seen[j] || !canStep(m, x, y, nx, ny)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/** Terrain move cost of entering tile i. */
export function tileCost(m: GameMap, i: number): number {
  if (m.feature[i] === Feature.Bridge) return 1;
  return GROUND[m.ground[i]].moveCost / Math.max(0.2, FEATURE[m.feature[i]].speedMul || 1);
}

/** Dijkstra distance field (terrain-weighted) from a source tile. Unreachable = Infinity. */
export function distanceField(m: GameMap, sx: number, sy: number): Float64Array {
  const n = m.width * m.height;
  const dist = new Float64Array(n).fill(Infinity);
  // binary heap of [dist, index]
  const hd: number[] = [];
  const hi: number[] = [];
  const push = (d: number, i: number): void => {
    let k = hd.length;
    hd.push(d);
    hi.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p] <= hd[k]) break;
      [hd[p], hd[k]] = [hd[k], hd[p]];
      [hi[p], hi[k]] = [hi[k], hi[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [hd[0], hi[0]];
    const ld = hd.pop()!;
    const li = hi.pop()!;
    if (hd.length) {
      hd[0] = ld;
      hi[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let s = k;
        if (l < hd.length && hd[l] < hd[s]) s = l;
        if (r < hd.length && hd[r] < hd[s]) s = r;
        if (s === k) break;
        [hd[s], hd[k]] = [hd[k], hd[s]];
        [hi[s], hi[k]] = [hi[k], hi[s]];
        k = s;
      }
    }
    return top;
  };
  const s = sy * m.width + sx;
  dist[s] = 0;
  push(0, s);
  while (hd.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = i % m.width;
    const y = (i - x) / m.width;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      if (!canStep(m, x, y, nx, ny)) continue;
      const j = ny * m.width + nx;
      const nd = d + (k < 4 ? 1 : Math.SQRT2) * tileCost(m, j);
      if (nd < dist[j]) {
        dist[j] = nd;
        push(nd, j);
      }
    }
  }
  return dist;
}

/** Connected components of walkable tiles. Returns labels (0 = not walkable) and component sizes (index = label). */
export function components(m: GameMap): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(m.width * m.height);
  const sizes = [0];
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = y * m.width + x;
      if (labels[i] || !canStep(m, x, y, x, y)) continue;
      const mask = floodFill(m, x, y);
      const label = sizes.length;
      let size = 0;
      for (let j = 0; j < mask.length; j++) {
        if (mask[j] && !labels[j]) {
          labels[j] = label;
          size++;
        }
      }
      sizes.push(size);
    }
  }
  return { labels, sizes };
}

/**
 * A* path finding on the tile grid (8-neighbour) using the single passability rule
 * (`isPassable`) and terrain move costs, plus greedy path smoothing.
 */
import type { GameMap } from '../../world/map';
import { isPassable } from '../../world/passability';
import { tileCost } from '../../world/reach';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export interface PathPoint {
  x: number;
  y: number;
}

/** Tile path from (sx,sy) to (gx,gy) (inclusive), or null. Expands at most `budget` nodes. */
export function findPath(m: GameMap, sx: number, sy: number, gx: number, gy: number, budget = 6000): PathPoint[] | null {
  const W = m.width;
  const H = m.height;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || gx < 0 || gy < 0 || gx >= W || gy >= H) return null;
  const start = sy * W + sx;
  const goal = gy * W + gx;
  if (start === goal) return [{ x: gx, y: gy }];
  const g = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const hf: number[] = [];
  const hi: number[] = [];
  const h = (i: number): number => {
    const x = i % W;
    const y = (i - x) / W;
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy);
  };
  const push = (f: number, i: number): void => {
    let k = hf.length;
    hf.push(f);
    hi.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= hf[k]) break;
      [hf[p], hf[k]] = [hf[k], hf[p]];
      [hi[p], hi[k]] = [hi[k], hi[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = hi[0];
    const lf = hf.pop()!;
    const li = hi.pop()!;
    if (hf.length) {
      hf[0] = lf;
      hi[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let sm = k;
        if (l < hf.length && hf[l] < hf[sm]) sm = l;
        if (r < hf.length && hf[r] < hf[sm]) sm = r;
        if (sm === k) break;
        [hf[sm], hf[k]] = [hf[k], hf[sm]];
        [hi[sm], hi[k]] = [hi[k], hi[sm]];
        k = sm;
      }
    }
    return top;
  };
  g[start] = 0;
  push(h(start), start);
  let expanded = 0;
  while (hf.length && expanded < budget) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    expanded++;
    if (i === goal) break;
    const x = i % W;
    const y = (i - x) / W;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (closed[j] || !isPassable(m, x, y, nx, ny)) continue;
      const ng = g[i] + (d < 4 ? 1 : 1.41421356) * tileCost(m, j);
      if (ng < g[j]) {
        g[j] = ng;
        prev[j] = i;
        push(ng + h(j), j);
      }
    }
  }
  if (prev[goal] < 0) return null;
  const out: PathPoint[] = [];
  for (let c = goal; c !== start; c = prev[c]) out.push({ x: c % W, y: Math.floor(c / W) });
  out.reverse();
  return smooth(m, sx, sy, out);
}

/** True if a straight drive between two tile centres only crosses passable tile steps. */
export function straightClear(m: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 3));
  let px = ax;
  let py = ay;
  for (let k = 1; k <= n; k++) {
    const x = Math.floor(ax + 0.5 + (dx * k) / n);
    const y = Math.floor(ay + 0.5 + (dy * k) / n);
    if (x !== px || y !== py) {
      // diagonal moves must also be legal as two orthogonal moves (tanks have width)
      if (!isPassable(m, px, py, x, y)) return false;
      if (x !== px && y !== py && (!isPassable(m, px, py, x, py) || !isPassable(m, px, py, px, y))) return false;
      px = x;
      py = y;
    }
  }
  return true;
}

function smooth(m: GameMap, sx: number, sy: number, path: PathPoint[]): PathPoint[] {
  const out: PathPoint[] = [];
  let cx = sx;
  let cy = sy;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !straightClear(m, cx, cy, path[j].x, path[j].y)) j--;
    out.push(path[j]);
    cx = path[j].x;
    cy = path[j].y;
    i = j + 1;
  }
  return out;
}

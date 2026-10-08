/**
 * Tank vs terrain collision: circle against solid tiles, resolved by pushing out along the
 * contact normal (gives natural sliding along walls). A tile is solid for a tank if it is not
 * walkable or if the elevation change from the tank's current tile is not a legal ramp step.
 */
import { canStep, isWalkable, type GameMap } from '../world/map';

export function isSolidFor(m: GameMap, curX: number, curY: number, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return true;
  if (!isWalkable(m, tx, ty)) return true;
  if (tx === curX && ty === curY) return false;
  const ci = curY * m.width + curX;
  const ti = ty * m.width + tx;
  if (m.elev[ci] === m.elev[ti]) return false;
  // elevation differs: only an orthogonal, legal ramp step is open
  if (tx !== curX && ty !== curY) return true;
  return !canStep(m, curX, curY, tx, ty);
}

const out = { x: 0, y: 0 };

/**
 * Resolves overlap of circle (x, y, r) with solid tiles. Returns the corrected position in `out`
 * (shared object — copy the values immediately).
 */
export function resolveTerrain(m: GameMap, x: number, y: number, r: number, curX: number, curY: number): { x: number; y: number } {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r);
    const y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!isSolidFor(m, curX, curY, tx, ty)) continue;
        // closest point on the tile box to the circle centre
        const cx = x < tx ? tx : x > tx + 1 ? tx + 1 : x;
        const cy = y < ty ? ty : y > ty + 1 ? ty + 1 : y;
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const push = r - d + 1e-6;
          x += (dx / d) * push;
          y += (dy / d) * push;
        } else {
          // centre inside the box: push out along the shallowest axis
          const left = x - tx;
          const right = tx + 1 - x;
          const top = y - ty;
          const bottom = ty + 1 - y;
          const mn = Math.min(left, right, top, bottom);
          if (mn === left) x = tx - r - 1e-6;
          else if (mn === right) x = tx + 1 + r + 1e-6;
          else if (mn === top) y = ty - r - 1e-6;
          else y = ty + 1 + r + 1e-6;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  out.x = x;
  out.y = y;
  return out;
}

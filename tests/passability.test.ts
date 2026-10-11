import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/world/generator';
import { cliffDrop, edgeKind, isPassable, isTileOpen } from '../src/world/passability';
import { DIR4, type GameMap } from '../src/world/map';
import { loadAsciiMap, type AsciiMap } from '../src/world/mapLoader';
import debugHeights from '../maps/debug_heights.json';

function checkEdges(m: GameMap): number {
  let n = 0;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIR4[d];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
        const k = edgeKind(m, x, y, d);
        const both = isTileOpen(m, x, y) && isTileOpen(m, nx, ny);
        const pass = isPassable(m, x, y, nx, ny);
        if (both) {
          // drawn as a barrier (cliff / blocked) ⇔ the simulation forbids the step
          expect(k === 'cliffUp' || k === 'cliffDown' || k === 'blocked').toBe(!pass);
          // a drawn rock face below this tile ⇔ an impassable drop
          if (cliffDrop(m, x, y, d) > 0) expect(pass).toBe(false);
          if (k === 'ramp') expect(pass).toBe(true);
          n++;
        }
        // movement is symmetric
        expect(isPassable(m, nx, ny, x, y)).toBe(pass);
      }
  return n;
}

describe('passability ⇔ visuals (round-01 job 2)', () => {
  it('property: on random maps every visually impassable edge is impassable and vice versa', () => {
    let edges = 0;
    for (let seed = 1; seed <= 25; seed++) edges += checkEdges(generateMap({ seed: seed * 7919, size: 40 }));
    edges += checkEdges(generateMap({ seed: 5, size: 96 }));
    expect(edges).toBeGreaterThan(50000);
  });

  it('debug_heights map: every case behaves as documented', () => {
    const m = loadAsciiMap(debugHeights as AsciiMap);
    checkEdges(m);
    const P = (ax: number, ay: number, bx: number, by: number) => isPassable(m, ax, ay, bx, by);
    expect(P(6, 2, 6, 1)).toBe(true); // ramp 1→0 north
    expect(P(4, 4, 4, 3)).toBe(true); // ramp 2→1
    expect(P(9, 5, 10, 5)).toBe(true); // ramp 1→0 east
    expect(P(7, 6, 8, 6)).toBe(true); // ramp 2→1 east
    expect(P(2, 8, 1, 8)).toBe(true); // ramp 1→0 west
    expect(P(5, 8, 5, 9)).toBe(true); // ramp 1→0 south
    expect(P(11, 12, 10, 12)).toBe(true); // ramp 1→0 west
    expect(P(14, 14, 14, 15)).toBe(false); // ramp blocked by a rock
    expect(P(14, 5, 15, 5)).toBe(false); // 2-level cliff
    expect(P(3, 12, 4, 12)).toBe(false); // 1-level cliff without ramp
    expect(P(4, 4, 3, 4)).toBe(false); // leaving a ramp tile sideways (2→1) is a cliff
    expect(P(5, 2, 5, 1)).toBe(false); // edge next to a ramp is still a cliff
    expect(isTileOpen(m, 4, 18)).toBe(false); // deep water
    expect(isTileOpen(m, 2, 16)).toBe(true); // shallow water
    expect(isTileOpen(m, 4, 17)).toBe(true); // bridge over deep water
    expect(isTileOpen(m, 14, 17)).toBe(true); // mud
    expect(isTileOpen(m, 11, 20)).toBe(false); // rock
  });
});

/**
 * Hand-authored maze maps for the missions (round 08). A map file (maps/maze_*.json) is a coarse character grid;
 * every character becomes a `unit` × `unit` block of tiles. Walls are solid rock (block movement AND shots), so a
 * tank has to follow the corridors: no cutting across the map.
 *
 *   #  wall      .  open floor      f  forest (cover)      =  bridge over a river
 *   S  player start (3×3 block)     H  enemy headquarters block
 */
import { createMap, setFeature, type GameMap } from './map';
import { Feature, Ground } from './terrain';

export interface MazeSrc {
  name: string;
  /** Tiles per character. */
  unit: number;
  /** Map width/height in tiles (≥ layout size × unit; the rest becomes wall). */
  size: number;
  layout: string[];
}

export function loadMazeMap(src: MazeSrc, seed = 1): GameMap {
  const u = src.unit;
  const m = createMap(src.size, src.size, seed);
  m.theme = 'forest';
  // everything outside the layout is wall
  m.feature.fill(Feature.Rock);
  let start = null as { x: number; y: number } | null;
  let hq = null as { x: number; y: number } | null;
  for (let cy = 0; cy < src.layout.length; cy++) {
    const row = src.layout[cy];
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      for (let dy = 0; dy < u; dy++) {
        for (let dx = 0; dx < u; dx++) {
          const x = cx * u + dx;
          const y = cy * u + dy;
          if (x >= m.width || y >= m.height) continue;
          const i = y * m.width + x;
          if (ch === '#') {
            setFeature(m, x, y, Feature.Rock);
            continue;
          }
          setFeature(m, x, y, Feature.None);
          m.ground[i] = ch === '=' ? Ground.Deep : Ground.Grass;
          if (ch === '=') setFeature(m, x, y, Feature.Bridge);
          else if (ch === 'f') setFeature(m, x, y, Feature.Forest);
        }
      }
      const cxy = { x: cx * u + (u >> 1), y: cy * u + (u >> 1) };
      if (ch === 'S') start = cxy;
      if (ch === 'H') hq = cxy;
    }
  }
  if (!start || !hq) throw new Error(`maze ${src.name}: needs one S and one H`);
  const around = (b: { x: number; y: number }): { x: number; y: number }[] =>
    [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ x: b.x + dx, y: b.y + dy }));
  m.bases.push({ team: 0, x: start.x, y: start.y, spawns: around(start) });
  m.bases.push({ team: 1, x: hq.x, y: hq.y, spawns: around(hq) });
  // respawn candidates (unused by the campaign rules, kept for completeness): open floor every 4th tile
  for (let y = 1; y < m.height - 1; y += 4)
    for (let x = 1; x < m.width - 1; x += 4) {
      const i = y * m.width + x;
      if (m.feature[i] === Feature.None && m.ground[i] !== Ground.Deep) m.spawnPoints.push({ x, y });
    }
  m.version = 1;
  return m;
}

/**
 * Hand-authored maze maps for the missions (round 08). A map file (maps/maze_*.json) is a coarse character grid;
 * every character becomes a `unit` × `unit` block of tiles. Walls are solid rock (block movement AND shots), so a
 * tank has to follow the corridors: no cutting across the map.
 *
 *   #  rock wall   T  dense wood (impassable, blocks shots)   .  grass   p  stone path (lane)   d  dirt
 *   f  bush/forest (passable cover)   ~  shallow water (slow)   w  deep water   =  bridge
 *   S  player start     H  enemy headquarters
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
  /** Character for tiles outside the layout (default '#'). */
  fill?: string;
}

const GROUND_OF: Record<string, number> = { p: Ground.Pavement, d: Ground.Dirt, '~': Ground.Shallow, w: Ground.Deep, '=': Ground.Deep };
const FEATURE_OF: Record<string, number> = { '#': Feature.Rock, T: Feature.Thicket, f: Feature.Forest, '=': Feature.Bridge };

function paint(m: GameMap, x: number, y: number, ch: string): void {
  m.ground[y * m.width + x] = GROUND_OF[ch] ?? Ground.Grass;
  setFeature(m, x, y, FEATURE_OF[ch] ?? Feature.None);
}

export function loadMazeMap(src: MazeSrc, seed = 1): GameMap {
  const u = src.unit;
  const m = createMap(src.size, src.size, seed);
  m.theme = 'forest';
  // everything outside the layout is the fill character (default wall)
  const fill = src.fill ?? '#';
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) paint(m, x, y, fill);
  let start = null as { x: number; y: number } | null;
  let hq = null as { x: number; y: number } | null;
  for (let cy = 0; cy < src.layout.length; cy++) {
    const row = src.layout[cy];
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      for (let dy = 0; dy < u; dy++) for (let dx = 0; dx < u; dx++) if (cx * u + dx < m.width && cy * u + dy < m.height) paint(m, cx * u + dx, cy * u + dy, ch);
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

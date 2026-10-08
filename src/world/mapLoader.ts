/**
 * Loader for hand-made ASCII maps (maps/*.json): debug maps and, later, campaign maps.
 * See maps/debug_heights.json for the format.
 */
import { DIR4, createMap, setFeature, setRamp, type GameMap } from './map';
import { Feature, Ground } from './terrain';

export interface AsciiMap {
  name: string;
  width: number;
  height: number;
  elev: string[];
  ground: string[];
  feature: string[];
  ramps: string[];
  bases: { team: number; x: number; y: number }[];
}

const GROUND_CH: Record<string, number> = { '.': Ground.Grass, ':': Ground.Dirt, s: Ground.Sand, m: Ground.Mud, '~': Ground.Shallow, '#': Ground.Deep };
const FEATURE_CH: Record<string, number> = { '.': Feature.None, R: Feature.Rock, W: Feature.Wall, c: Feature.Crate, T: Feature.Forest, '=': Feature.Bridge, r: Feature.Ruins, G: Feature.Gate };
const RAMP_CH: Record<string, [number, number]> = { '>': [1, 0], '<': [-1, 0], v: [0, 1], '^': [0, -1] };

export function loadAsciiMap(src: AsciiMap, seed = 1): GameMap {
  const m = createMap(src.width, src.height, seed);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = y * src.width + x;
      m.elev[i] = Number(src.elev[y]?.[x] ?? '0');
      m.ground[i] = GROUND_CH[src.ground[y]?.[x] ?? '.'] ?? Ground.Grass;
      if (m.ground[i] === Ground.Deep && src.feature[y]?.[x] === '=') m.ground[i] = Ground.Deep;
      const f = FEATURE_CH[src.feature[y]?.[x] ?? '.'] ?? Feature.None;
      if (f) setFeature(m, x, y, f);
      const r = RAMP_CH[src.ramps[y]?.[x] ?? '.'];
      if (r) setRamp(m, i, DIR4.findIndex(([dx, dy]) => dx === r[0] && dy === r[1]));
    }
  }
  for (const b of src.bases) {
    const spawns = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]
      .map(([dx, dy]) => ({ x: b.x + dx, y: b.y + dy }))
      .filter((p) => p.x >= 0 && p.y >= 0 && p.x < src.width && p.y < src.height);
    m.bases.push({ team: b.team, x: b.x, y: b.y, spawns });
  }
  // respawn points: every 4th open flat tile
  for (let y = 1; y < src.height - 1; y += 4)
    for (let x = 1; x < src.width - 1; x += 4) {
      const i = y * src.width + x;
      if (m.ground[i] !== Ground.Deep && m.feature[i] === Feature.None) m.spawnPoints.push({ x, y });
    }
  m.version = 1;
  return m;
}

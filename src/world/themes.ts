/**
 * Themed map generators (round 03, D-040): desert ruins and a modern city.
 *
 * Both are built on the canonical half and mirrored (180° point symmetry) like the original
 * generator, so both teams get identical streets, cover and crates; `validateMap` checks it.
 *  - Desert: sand, a grid of packed-earth streets with 1-tile alleys, half-collapsed mud-brick
 *    houses (adobe walls → rubble when destroyed, many already fallen), crates inside, a palm
 *    square in the middle, bases in opposite corners.
 *  - City: asphalt roads (3 wide, 4 at the centre crossing), pavement blocks with tall buildings
 *    split by alleys, parking lots with cars, small parks, street lamps, a central plaza.
 * Everything stays on elevation 0 (streets read best flat).
 */
import { Rng } from '../sim/rng';
import { FLAG_BASE, FLAG_NO_BUILD, setFeature, type GameMap, type MapPoint, type MapTheme } from './map';
import { Feature, Ground } from './terrain';
import { Builder, generateMap, placeSpawnPoints, repairConnectivity, type MapSize } from './generator';

export const MAP_THEMES: readonly MapTheme[] = ['desert', 'city', 'forest'];

export function generateThemed(theme: MapTheme, seed: number, size: MapSize): GameMap {
  if (theme === 'desert') return generateDesert(seed, size);
  if (theme === 'city') return generateCity(seed, size);
  return generateMap({ seed, size });
}

/** Lines (tile indices) of a symmetric street grid: every `pitch` tiles, `width` wide, centred. */
function streetLines(N: number, pitch: number, width: number, centreWidth: number): Set<number> {
  const out = new Set<number>();
  const c = (N - 1) / 2;
  // centre street
  for (let k = 0; k < centreWidth; k++) {
    const t = Math.round(c - centreWidth / 2 + 0.5 + k);
    out.add(t);
    out.add(N - 1 - t);
  }
  for (let d = pitch; c - d > 2; d += pitch) {
    for (let k = 0; k < width; k++) {
      const t = Math.round(c - d - width / 2 + 0.5 + k);
      if (t < 0) continue;
      out.add(t);
      out.add(N - 1 - t);
    }
  }
  return out;
}

/** Runs of consecutive non-street indices [a, b] (blocks between streets). */
function blocks(N: number, streets: Set<number>): [number, number][] {
  const out: [number, number][] = [];
  let a = -1;
  for (let t = 0; t <= N; t++) {
    const free = t < N && !streets.has(t);
    if (free && a < 0) a = t;
    if (!free && a >= 0) {
      out.push([a, t - 1]);
      a = -1;
    }
  }
  return out;
}

interface BaseOpts {
  ground: number;
  cover: number;
  r: number;
}

/** Flat base square in a corner with cover in front, torches/lamps and the spawn ring (mirrored). */
function placeBases(b: Builder, margin: number, o: BaseOpts): void {
  const m = b.m;
  const make = (team: number, bx: number, by: number, sign: number): void => {
    for (let dy = -o.r; dy <= o.r; dy++)
      for (let dx = -o.r; dx <= o.r; dx++) {
        const x = bx + dx;
        const y = by + dy;
        if (!b.inside(x, y)) continue;
        const i = b.i(x, y);
        m.ground[i] = o.ground;
        m.elev[i] = 0;
        m.flags[i] |= FLAG_BASE | FLAG_NO_BUILD;
        setFeature(m, x, y, Feature.None);
      }
    for (let k = -1; k <= 1; k++) {
      const wx = bx + sign * (o.r - 1);
      const wy = by + k * 2;
      if (b.inside(wx, wy)) setFeature(m, wx, wy, k === 0 ? Feature.Crate : o.cover);
      const vx = bx + k * 2;
      const vy = by + sign * (o.r - 1);
      if (b.inside(vx, vy)) setFeature(m, vx, vy, k === 0 ? Feature.Crate : o.cover);
    }
    m.lights.push({ x: bx - sign * o.r, y: by - sign * o.r }, { x: bx + sign * o.r, y: by + sign * o.r });
    const ring: [number, number][] = [
      [0, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    const spawns: MapPoint[] = ring.map(([dx, dy]) => ({ x: bx + dx * sign, y: by + dy * sign }));
    m.bases.push({ team, x: bx, y: by, spawns });
  };
  const [mx, my] = b.mirror(margin, margin);
  make(0, margin, margin, 1);
  make(1, mx, my, -1);
}

function finish(b: Builder, theme: MapTheme): GameMap {
  const m = b.m;
  const N = b.n;
  const half = N / 2;
  const o = Math.round(N * 0.22);
  m.objectives.push({ x: half, y: half }, { x: half - o, y: half + o }, { x: half + o, y: half - o });
  repairConnectivity(b);
  placeSpawnPoints(b);
  m.theme = theme;
  m.version = 1;
  return m;
}

// ---------------------------------------------------------------------------------------------

export function generateDesert(seed: number, size: MapSize): GameMap {
  const N = size;
  const rng = new Rng((seed ^ 0xde5e47) >>> 0);
  const b = new Builder(N, seed);
  const m = b.m;
  const streets = streetLines(N, 7, 2, 2);
  const isStreet = (x: number, y: number): boolean => streets.has(x) || streets.has(y);
  // 1. ground: sand dunes with packed-earth streets
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!b.canonical(x, y)) continue;
      const g = isStreet(x, y) ? Ground.Dirt : Ground.Sand;
      b.set(x, y, (i) => (m.ground[i] = g));
    }
  // 2. one half-collapsed house per block (some blocks: open yards with palms)
  const bl = blocks(N, streets);
  const centre = (N - 1) / 2;
  for (const [x0, x1] of bl)
    for (const [y0, y1] of bl) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (!b.canonical(Math.floor(cx), Math.floor(cy))) continue;
      if (Math.abs(cx - centre) < 4 && Math.abs(cy - centre) < 4) continue; // central square stays open
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (w < 3 || h < 3) continue;
      const roll = rng.next();
      if (roll < 0.18) {
        // open yard: a palm and a crate
        const px = x0 + rng.int(0, w - 1);
        const py = y0 + rng.int(0, h - 1);
        b.set(px, py, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Palm));
        const qx = x0 + rng.int(0, w - 1);
        const qy = y0 + rng.int(0, h - 1);
        if (qx !== px || qy !== py) b.set(qx, qy, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Crate));
        continue;
      }
      // house walls on the block border with a doorway on two sides; many wall tiles already fell
      const ruin = 0.35 + rng.next() * 0.3;
      const doorX = x0 + rng.int(1, w - 2);
      const doorY = y0 + rng.int(1, h - 2);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const edge = x === x0 || x === x1 || y === y0 || y === y1;
          let f: number = Feature.None;
          if (edge) {
            const door = (y === y0 && x === doorX) || (y === y1 && x === doorX) || (x === x0 && y === doorY);
            if (door) f = Feature.None;
            else {
              const r = rng.next();
              f = r < ruin * 0.6 ? Feature.Ruins : r < ruin ? Feature.None : Feature.Adobe;
            }
          } else if (rng.next() < 0.06) f = Feature.Crate;
          else if (rng.next() < 0.1) f = Feature.Ruins;
          b.set(x, y, (i, xx, yy) => {
            if (f === Feature.Ruins) m.ground[i] = Ground.Dirt;
            setFeature(m, xx, yy, f);
          });
        }
    }
  // 3. central square: palms on the corners, crates around a dry well (rock)
  const c0 = Math.floor(centre);
  for (const [dx, dy] of [
    [-3, -3],
    [3, -3],
  ])
    b.set(c0 + dx, c0 + dy, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Palm));
  b.set(c0, c0, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Rock));
  b.set(c0 - 2, c0 + 1, (_i, xx, yy) => setFeature(m, xx, yy, Feature.Crate));
  // a few loose crates and boulders in the streets (never blocking a 2-wide street fully)
  for (let k = 0; k < Math.round(N / 5); k++) {
    const x = rng.int(1, N - 2);
    const y = rng.int(1, N - 2);
    if (!b.canonical(x, y) || !isStreet(x, y) || m.feature[b.i(x, y)] !== Feature.None) continue;
    const f = rng.next() < 0.7 ? Feature.Crate : Feature.Rock; // rolled once per mirrored pair
    b.set(x, y, (_i, xx, yy) => setFeature(m, xx, yy, f));
  }
  placeBases(b, Math.max(4, Math.round(N * 0.1)), { ground: Ground.Dirt, cover: Feature.Adobe, r: 3 });
  return finish(b, 'desert');
}

// ---------------------------------------------------------------------------------------------

export function generateCity(seed: number, size: MapSize): GameMap {
  const N = size;
  const rng = new Rng((seed ^ 0xc17c17) >>> 0);
  const b = new Builder(N, seed);
  const m = b.m;
  const roads = streetLines(N, 10, 3, 4);
  const isRoad = (x: number, y: number): boolean => roads.has(x) || roads.has(y);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!b.canonical(x, y)) continue;
      const g = isRoad(x, y) ? Ground.Asphalt : Ground.Pavement;
      b.set(x, y, (i) => (m.ground[i] = g));
    }
  const bl = blocks(N, roads);
  const centre = (N - 1) / 2;
  for (const [x0, x1] of bl)
    for (const [y0, y1] of bl) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (!b.canonical(Math.floor(cx), Math.floor(cy))) continue;
      // 1-tile pavement around every block; lots inside
      const ix0 = x0 + 1;
      const ix1 = x1 - 1;
      const iy0 = y0 + 1;
      const iy1 = y1 - 1;
      if (ix1 < ix0 || iy1 < iy0) continue;
      // street lamps on the block corner (and its mirror)
      m.lights.push({ x: x0, y: y0 });
      const [lx, ly] = b.mirror(x0, y0);
      m.lights.push({ x: lx, y: ly });
      const roll = rng.next();
      const nearCentre = Math.abs(cx - centre) < 6 && Math.abs(cy - centre) < 6;
      if (nearCentre || roll < 0.15) {
        // plaza / park: grass, a couple of trees (forest concealment) and crates
        for (let y = iy0; y <= iy1; y++)
          for (let x = ix0; x <= ix1; x++) {
            const r = rng.next();
            const f = r < 0.12 ? Feature.Forest : r < 0.2 ? Feature.Crate : Feature.None;
            b.set(x, y, (i, xx, yy) => {
              m.ground[i] = Ground.Grass;
              setFeature(m, xx, yy, f);
            });
          }
        continue;
      }
      if (roll < 0.32) {
        // parking lot: asphalt with rows of cars and a crate
        for (let y = iy0; y <= iy1; y++)
          for (let x = ix0; x <= ix1; x++) {
            const r = rng.next();
            const f = (x - ix0) % 2 === 0 && r < 0.55 ? Feature.Car : r < 0.06 ? Feature.Crate : Feature.None;
            b.set(x, y, (i, xx, yy) => {
              m.ground[i] = Ground.Asphalt;
              setFeature(m, xx, yy, f);
            });
          }
        continue;
      }
      // buildings split by a cross of 1-tile alleys (small streets between towers)
      const ax = ix0 + Math.floor((ix1 - ix0) / 2) + (rng.next() < 0.5 ? 0 : 1);
      const ay = iy0 + Math.floor((iy1 - iy0) / 2) + (rng.next() < 0.5 ? 0 : 1);
      for (let y = iy0; y <= iy1; y++)
        for (let x = ix0; x <= ix1; x++) {
          const alley = x === ax || y === ay;
          const f = alley ? (rng.next() < 0.12 ? Feature.Crate : Feature.None) : Feature.Building;
          b.set(x, y, (_i, xx, yy) => setFeature(m, xx, yy, f));
        }
    }
  // parked cars along the kerb lanes of roads (outer lane only, never at crossings)
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      if (!b.canonical(x, y) || !isRoad(x, y) || (roads.has(x) && roads.has(y))) continue;
      const i = b.i(x, y);
      const kerb = (roads.has(x) && (!roads.has(x - 1) || !roads.has(x + 1))) || (roads.has(y) && (!roads.has(y - 1) || !roads.has(y + 1)));
      if (!kerb || m.feature[i] !== Feature.None || rng.next() > 0.1) continue;
      b.set(x, y, (_k, xx, yy) => setFeature(m, xx, yy, Feature.Car));
    }
  placeBases(b, Math.max(4, Math.round(N * 0.1)), { ground: Ground.Asphalt, cover: Feature.Car, r: 3 });
  for (let i = 0; i < N * N; i++) if (m.flags[i] & FLAG_NO_BUILD && m.feature[i] === Feature.Building) setFeature(m, i % N, Math.floor(i / N), Feature.None);
  return finish(b, 'city');
}

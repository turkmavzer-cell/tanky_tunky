/**
 * Visual test bench for src/render/terrainArt.ts (plain Canvas2D, no Pixi).
 * Build: npx vite build -c tools/vite.preview.config.ts ; serve: npx vite preview -c tools/vite.preview.config.ts
 */
import { buildTerrainArt, EDGE_PRIORITY, LEVEL_PX, type ArtSprite, type TerrainArt } from '../src/render/terrainArt';

const TW = 128;
const TH = 64;
const MAP = 14;

// ground: g grass, d dirt, s sand, m mud, w shallow, D deep
const GROUND_ROWS = [
  'ggggggggwDDwgg',
  'ggdddgggwwwwsg',
  'ggdddgggswwwsg',
  'gddggggggwDDwg',
  'ggggdgggwDDwgg',
  'ggggdgggwDDwgg',
  'ddddddddwDDwdd',
  'ggggggggwDDwsg',
  'ggggggggwDDwsg',
  'ggggggggwDDwss',
  'ggmmmgggwDDwsg',
  'gmmmmggswDDwsg',
  'ggmmgggswDDwgg',
  'ggggggggwDDwgg',
];
const GCODE: Record<string, number> = { g: 0, d: 1, s: 2, m: 3, w: 4, D: 5 };

type FeatKey = keyof TerrainArt['features'];
interface Placed {
  x: number;
  y: number;
  key: FeatKey | 'dmg-wall' | 'dmg-crate' | 'dmg-gate';
  v: number;
}

const ground: number[][] = GROUND_ROWS.map((r) => [...r].map((ch) => GCODE[ch]));
const elev: number[][] = Array.from({ length: MAP }, () => new Array<number>(MAP).fill(0));
for (let y = 1; y <= 4; y++) for (let x = 1; x <= 5; x++) elev[y][x] = 1;
for (let y = 1; y <= 2; y++) for (let x = 2; x <= 3; x++) elev[y][x] = 2;
/** ramp[y][x] = dir or -1 */
const ramps: number[][] = Array.from({ length: MAP }, () => new Array<number>(MAP).fill(-1));
ramps[2][3] = 1; // elev 2 -> 1 towards SE (4,2)
ramps[4][4] = 2; // elev 1 -> 0 towards SW (4,5)
ramps[1][5] = 0; // elev 1 -> 0 towards NE (5,0)
ramps[3][1] = 3; // elev 1 -> 0 towards NW (0,3)
ground[1][5] = 1;
ground[3][1] = 1;

const placed: Placed[] = [
  { x: 6, y: 9, key: 'forest', v: 0 },
  { x: 7, y: 10, key: 'forest', v: 1 },
  { x: 6, y: 11, key: 'forest', v: 2 },
  { x: 7, y: 12, key: 'forest', v: 3 },
  { x: 13, y: 0, key: 'forest', v: 1 },
  { x: 13, y: 2, key: 'forest', v: 2 },
  { x: 0, y: 12, key: 'forest', v: 0 },
  { x: 1, y: 13, key: 'forest', v: 3 },
  { x: 12, y: 13, key: 'forest', v: 0 },
  { x: 2, y: 4, key: 'forest', v: 1 },
  { x: 0, y: 9, key: 'rock', v: 0 },
  { x: 7, y: 0, key: 'rock', v: 1 },
  { x: 5, y: 3, key: 'rock', v: 2 },
  { x: 13, y: 10, key: 'rock', v: 1 },
  { x: 0, y: 8, key: 'wall', v: 0 },
  { x: 1, y: 8, key: 'wall', v: 0 },
  { x: 2, y: 8, key: 'wall', v: 1 },
  { x: 3, y: 8, key: 'gate', v: 0 },
  { x: 4, y: 8, key: 'dmg-wall', v: 0 },
  { x: 5, y: 8, key: 'wall', v: 1 },
  { x: 7, y: 3, key: 'wall', v: 0 },
  { x: 7, y: 4, key: 'gate', v: 1 },
  { x: 7, y: 5, key: 'wall', v: 1 },
  { x: 12, y: 7, key: 'crate', v: 0 },
  { x: 13, y: 8, key: 'crate', v: 1 },
  { x: 13, y: 7, key: 'dmg-crate', v: 0 },
  { x: 3, y: 13, key: 'ruins', v: 0 },
  { x: 5, y: 12, key: 'ruins', v: 1 },
  { x: 13, y: 12, key: 'ruins', v: 2 },
  { x: 8, y: 6, key: 'bridge', v: 0 },
  { x: 9, y: 6, key: 'bridge', v: 0 },
  { x: 10, y: 6, key: 'bridge', v: 0 },
  { x: 11, y: 6, key: 'bridge', v: 0 },
  { x: 2, y: 7, key: 'torch', v: 0 },
  { x: 5, y: 7, key: 'torch', v: 0 },
  { x: 12, y: 5, key: 'torch', v: 0 },
  { x: 6, y: 5, key: 'torch', v: 0 },
];

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + s * 2246822519, 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2654435761);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const el = (x: number, y: number): number => (x < 0 || y < 0 || x >= MAP || y >= MAP ? 0 : elev[y][x]);
const DIRS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function sprite(art: TerrainArt, p: Placed): ArtSprite {
  if (p.key === 'dmg-wall') return art.damaged.wall;
  if (p.key === 'dmg-crate') return art.damaged.crate;
  if (p.key === 'dmg-gate') return art.damaged.gate;
  const list = art.features[p.key];
  return list[p.v % list.length];
}

function drawScene(g: CanvasRenderingContext2D, art: TerrainArt, ox: number, oy: number): void {
  const order: [number, number][] = [];
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) order.push([x, y]);
  order.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
  const featAt = new Map<number, Placed>();
  for (const p of placed) featAt.set(p.y * MAP + p.x, p);
  // pass 1: ground, cliffs, transitions, water, ramps, decals
  for (const [x, y] of order) {
    const e = elev[y][x];
    const left = ox + (x - y) * (TW / 2) - TW / 2;
    const top = oy + (x + y) * (TH / 2) - e * LEVEL_PX;
    const gid = ground[y][x];
    const v = Math.floor(hash(x, y, 1) * art.ground[gid].length);
    // cliffs under the SW and SE edges
    const cv = Math.floor(hash(x, y, 2) * art.cliffLeft.length);
    for (let k = 0; k < e - el(x, y + 1); k++) g.drawImage(art.cliffLeft[cv], left, top + TH / 2 + k * LEVEL_PX);
    for (let k = 0; k < e - el(x + 1, y); k++) g.drawImage(art.cliffRight[cv], left + TW / 2, top + TH / 2 + k * LEVEL_PX);
    g.drawImage(art.ground[gid][v], left, top);
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
      if (elev[ny][nx] !== e) continue;
      const ng = ground[ny][nx];
      if (EDGE_PRIORITY[ng] > EDGE_PRIORITY[gid]) g.drawImage(art.edge[ng][d], left, top);
    }
    if (gid >= 4) g.drawImage(art.waterFrames[gid - 4][(x + y) % 4 === 0 ? 1 : 0], left, top);
    if (ramps[y][x] >= 0) g.drawImage(art.ramp[ramps[y][x]], left, top);
    if (!featAt.has(y * MAP + x) && gid <= 1 && hash(x, y, 3) < 0.6) {
      const dsp = art.decals[Math.floor(hash(x, y, 4) * art.decals.length)];
      const dx = (hash(x, y, 5) - 0.5) * 40;
      const dy = (hash(x, y, 6) - 0.5) * 14;
      g.drawImage(dsp.canvas, left + TW / 2 + dx - dsp.anchorX, top + TH / 2 + dy - dsp.anchorY);
    }
  }
  // pass 2: features in painter's order
  for (const [x, y] of order) {
    const p = featAt.get(y * MAP + x);
    if (!p) continue;
    const s = sprite(art, p);
    const cx = ox + (x - y) * (TW / 2);
    const cy = oy + (x + y) * (TH / 2) + TH / 2 - elev[y][x] * LEVEL_PX;
    g.drawImage(s.canvas, Math.round(cx - s.anchorX), Math.round(cy - s.anchorY));
  }
}

function cross(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.strokeStyle = '#ff2050';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - 5, y + 0.5);
  g.lineTo(x + 6, y + 0.5);
  g.moveTo(x + 0.5, y - 5);
  g.lineTo(x + 0.5, y + 6);
  g.stroke();
}

function diamond(g: CanvasRenderingContext2D, left: number, top: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(left + 64, top);
  g.lineTo(left + 128, top + 32);
  g.lineTo(left + 64, top + 64);
  g.lineTo(left, top + 32);
  g.closePath();
  g.fill();
}

function drawStrip(g: CanvasRenderingContext2D, art: TerrainArt, y0: number, width: number): number {
  let x = 16;
  let y = y0;
  let rowH = 0;
  const place = (w: number, h: number, label: string, fn: (px: number, py: number) => void): void => {
    if (x + w > width - 16) {
      x = 16;
      y += rowH + 22;
      rowH = 0;
    }
    g.fillStyle = '#aab';
    g.font = '11px sans-serif';
    g.fillText(label, x, y + 10);
    fn(x, y + 14);
    x += w + 10;
    rowH = Math.max(rowH, h + 14);
  };
  const names = ['grass', 'dirt', 'sand', 'mud', 'shallow', 'deep'];
  art.ground.forEach((row, gid) => row.forEach((c, v) => place(128, 64, `${names[gid]} ${v}`, (px, py) => g.drawImage(c, px, py))));
  // a 3x3 patch per ground type with mixed variants (seam check)
  art.ground.forEach((row, gid) =>
    place(3 * 128, 3 * 64, `${names[gid]} 3x3 mixed`, (px, py) => {
      for (let ty = 0; ty < 3; ty++)
        for (let tx = 0; tx < 3; tx++) g.drawImage(row[(tx * 7 + ty * 3) % row.length], px + 128 + (tx - ty) * 64, py + (tx + ty) * 32);
    }),
  );
  x = 16;
  y += rowH + 22;
  rowH = 0;
  art.edge.forEach((row, gid) =>
    row.forEach((c, d) =>
      place(128, 64, `edge ${names[gid]} d${d}`, (px, py) => {
        diamond(g, px, py, '#555a66');
        g.drawImage(c, px, py);
      }),
    ),
  );
  art.waterFrames.forEach((fr, k) =>
    fr.forEach((c, f) =>
      place(128, 64, `water${k} f${f}`, (px, py) => {
        g.drawImage(art.ground[4 + k][0], px, py);
        g.drawImage(c, px, py);
      }),
    ),
  );
  for (let v = 0; v < art.cliffLeft.length; v++)
    place(128, 64 + 2 * LEVEL_PX, `cliff v${v} x2`, (px, py) => {
      for (let k = 0; k < 2; k++) {
        g.drawImage(art.cliffLeft[v], px, py + 32 + k * LEVEL_PX);
        g.drawImage(art.cliffRight[v], px + 64, py + 32 + k * LEVEL_PX);
      }
      g.drawImage(art.ground[0][v], px, py);
    });
  art.ramp.forEach((c, d) =>
    place(128, 64 + LEVEL_PX, `ramp d${d}`, (px, py) => {
      diamond(g, px, py + LEVEL_PX, '#3a3d44');
      g.drawImage(art.ground[1][0], px, py);
      g.drawImage(c, px, py);
    }),
  );
  x = 16;
  y += rowH + 22;
  rowH = 0;
  const showSprite = (s: ArtSprite, label: string): void =>
    place(s.canvas.width, s.canvas.height, label, (px, py) => {
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.strokeRect(px + 0.5, py + 0.5, s.canvas.width - 1, s.canvas.height - 1);
      if (s.canvas.width >= 64) diamond(g, px + s.anchorX - 64, py + s.anchorY - 32, 'rgba(90,140,70,0.35)');
      g.drawImage(s.canvas, px, py);
      cross(g, px + s.anchorX, py + s.anchorY);
    });
  for (const [k, list] of Object.entries(art.features)) list.forEach((s, v) => showSprite(s, `${k} ${v}`));
  for (const [k, s] of Object.entries(art.damaged)) showSprite(s, `damaged ${k}`);
  art.decals.forEach((s, v) => showSprite(s, `decal ${v}`));
  return y + rowH + 16;
}

function canvasPixels(art: TerrainArt): number {
  let px = 0;
  const add = (c: HTMLCanvasElement): void => {
    px += c.width * c.height;
  };
  art.ground.flat().forEach(add);
  art.waterFrames.flat().forEach(add);
  art.edge.flat().forEach(add);
  art.cliffLeft.forEach(add);
  art.cliffRight.forEach(add);
  art.ramp.forEach(add);
  Object.values(art.features)
    .flat()
    .forEach((s) => add(s.canvas));
  Object.values(art.damaged).forEach((s) => add(s.canvas));
  art.decals.forEach((s) => add(s.canvas));
  return px;
}

function main(): void {
  if (location.search.includes('coldonly')) {
    // profiling aid: a single cold build, nothing else
    const t = performance.now();
    buildTerrainArt();
    document.getElementById('info')!.textContent = `cold ${(performance.now() - t).toFixed(1)} ms`;
    document.body.dataset.ready = '1';
    return;
  }
  const t0 = performance.now();
  const art = buildTerrainArt();
  const cold = performance.now() - t0;
  const warm: number[] = [];
  for (let k = 0; k < 3; k++) {
    const t = performance.now();
    buildTerrainArt();
    warm.push(performance.now() - t);
  }
  warm.sort((a, b) => a - b);
  const mp = canvasPixels(art) / 1e6;

  const width = 1840;
  const view = document.getElementById('view') as HTMLCanvasElement;
  view.width = width;
  view.height = 3000;
  const g = view.getContext('2d')!;
  g.fillStyle = '#1b1d22';
  g.fillRect(0, 0, width, view.height);
  drawScene(g, art, width / 2, 100);
  const end = drawStrip(g, art, 1030, width);
  // crop the canvas to its content
  const img = g.getImageData(0, 0, width, end);
  view.height = end;
  g.putImageData(img, 0, 0);

  const stats = { coldMs: +cold.toFixed(1), warmMedianMs: +warm[1].toFixed(1), megapixels: +mp.toFixed(3), height: end };
  (window as unknown as { __terrainStats: typeof stats }).__terrainStats = stats;
  const info = document.getElementById('info')!;
  info.textContent = `buildTerrainArt(): cold ${stats.coldMs} ms, warm median ${stats.warmMedianMs} ms, canvases ${stats.megapixels} MP`;
  document.body.dataset.ready = '1';
}

setTimeout(main, 300);

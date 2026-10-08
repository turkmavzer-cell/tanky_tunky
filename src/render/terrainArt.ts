/**
 * Procedural, hand-painted-looking terrain art (brief §12): ground tiles, transition fringes, water
 * ripples, cliff faces, ramps, map features and decals, all painted with Canvas2D at start-up.
 *
 * Style: rich but not neon colours, layered noise blotches, light from the top-left (screen), thin
 * dark outlines and soft contact shadows on objects. No external assets; fully deterministic (own
 * seeded PRNG, no Math.random).
 *
 * Seamless ground: every ground texture is a function of the tile-local world coordinates (u, v)
 * that is periodic with period 1, so identical "base" layers line up across tile borders. Variants
 * only differ in the interior (variation is faded out towards the diamond edges), which keeps
 * neighbouring variants seamless too. Transition fringes reuse the same periodic base, so a fringe
 * blends invisibly into the tile it bleeds from.
 *
 * Placement conventions (screen pixels at zoom 1, tile top vertex = tile canvas (64, 0)):
 * - ground / waterFrames / edge: draw the 128x64 canvas with its top-left at the tile's top-left
 *   (tile top vertex - (64, 0)), after lifting the tile by elevation * LEVEL_PX.
 * - cliffLeft: top-left at the elevated tile's left vertex (tile canvas (0, 32)); cliffRight:
 *   top-left at tile canvas (64, 32) (x of the bottom vertex, y of the right vertex). Stack one
 *   face per level of difference, each LEVEL_PX lower. Light comes from the top-left, so the left
 *   (SW) face is lit and the right (SE) face is in shade.
 * - ramp: canvas top-left = tile top-left at the HIGHER level (top vertex at (64, 0)); draw it over
 *   the ramp tile's ground. For dirs 0/3 (descending away from the viewer) the strip beyond the low
 *   edge keeps the tile's own ground.
 * - features/damaged/decals: canvas top-left = tile centre - (anchorX, anchorY).
 * - edges: draw edge[g][dir] on a tile whose neighbour in `dir` has ground g and higher
 *   EDGE_PRIORITY (same elevation only).
 */
import { TILE_H, TILE_W } from '../world/iso';

export const LEVEL_PX = 24;

export interface ArtSprite {
  canvas: HTMLCanvasElement;
  /** pixel inside canvas that must be placed on the tile centre point on screen */
  anchorX: number;
  anchorY: number;
}

export type FeatureArtKey = 'forest' | 'rock' | 'wall' | 'crate' | 'ruins' | 'gate' | 'bridge' | 'torch';
export type DamagedArtKey = 'wall' | 'crate' | 'gate';

export interface TerrainArt {
  /** ground[groundId][variant]: 128x64 diamond tiles (>= 4 variants). Ids: 0 grass, 1 dirt, 2 sand, 3 mud, 4 shallow, 5 deep. */
  ground: HTMLCanvasElement[][];
  /** waterFrames[0] shallow, [1] deep: 4 looping 128x64 ripple/glint overlays drawn over the water tile. */
  waterFrames: HTMLCanvasElement[][];
  /** edge[groundId][dir]: fringe of groundId bleeding over a neighbour's diamond along edge dir (0 NE, 1 SE, 2 SW, 3 NW). */
  edge: HTMLCanvasElement[][];
  /** Cliff faces (64 x (32 + LEVEL_PX)) under the SW edge (left) / SE edge (right), one level each, 3 variants. */
  cliffLeft: HTMLCanvasElement[];
  cliffRight: HTMLCanvasElement[];
  /** ramp[dir]: 128 x (64 + LEVEL_PX) overlay at the higher tile, descending towards dir (0 NE, 1 SE, 2 SW, 3 NW). */
  ramp: HTMLCanvasElement[];
  features: Record<FeatureArtKey, ArtSprite[]>;
  damaged: Record<DamagedArtKey, ArtSprite>;
  /** Small ground decals (<= 40x24), anchor at centre. */
  decals: ArtSprite[];
}

/**
 * Recommended bleed priority per ground id (higher bleeds over lower): sand over grass, grass over
 * mud/dirt, any land over water, shallow over deep.
 */
export const EDGE_PRIORITY: readonly number[] = [4, 2, 5, 3, 1, 0];

const W = TILE_W;
const H = TILE_H;
const HW = W / 2;
const HH = H / 2;
const N = W * H;
const TAU = Math.PI * 2;
const OUTLINE = 'rgba(26,18,12,0.9)';

// ---------------------------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------------------------

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  r(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  i(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
}

/** Value noise on an nx x ny lattice, periodic with period 1 in u and v (nx, ny powers of two). */
class PNoise {
  private readonly g: Float32Array;
  private readonly mx: number;
  private readonly my: number;
  constructor(
    private readonly nx: number,
    private readonly ny: number,
    seed: number,
  ) {
    const r = new Rng(seed);
    this.g = new Float32Array(nx * ny);
    for (let i = 0; i < this.g.length; i++) this.g[i] = r.next();
    this.mx = nx - 1;
    this.my = ny - 1;
  }
  at(u: number, v: number): number {
    const x = u * this.nx;
    const y = v * this.ny;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = xi & this.mx;
    const x1 = (xi + 1) & this.mx;
    const y0 = (yi & this.my) * this.nx;
    const y1 = ((yi + 1) & this.my) * this.nx;
    const g = this.g;
    const a = g[y0 + x0];
    const b = g[y0 + x1];
    const c = g[y1 + x0];
    const d = g[y1 + x1];
    return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
  }
}

/** Periodic fractal noise in [0, 1] (clusters around 0.5). aniso scales the v lattice. */
class Fbm {
  private readonly oct: PNoise[] = [];
  private readonly norm: number;
  constructor(n0: number, octaves: number, seed: number, aniso = 1) {
    let sum = 0;
    for (let k = 0; k < octaves; k++) {
      const n = n0 << k;
      this.oct.push(new PNoise(n, Math.max(1, n * aniso), seed * 31 + k * 7919));
      sum += 1 / (1 << k);
    }
    this.norm = 1 / sum;
  }
  at(u: number, v: number): number {
    const o = this.oct;
    let s = 0;
    let a = 1;
    for (let k = 0; k < o.length; k++) {
      s += o[k].at(u, v) * a;
      a *= 0.5;
    }
    return s * this.norm;
  }
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
function ss(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

type RGB = readonly [number, number, number];
type Stops = readonly (readonly [number, number, number, number])[];

function css(c: RGB, f = 1, a = 1): string {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * f)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * f)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * f)));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

function mixc(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function ramp(stops: Stops, t: number, out: Float32Array): void {
  if (t <= stops[0][0]) {
    out[0] = stops[0][1];
    out[1] = stops[0][2];
    out[2] = stops[0][3];
    return;
  }
  for (let k = 1; k < stops.length; k++) {
    const b = stops[k];
    if (t <= b[0]) {
      const a = stops[k - 1];
      const f = (t - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * f;
      out[1] = a[2] + (b[2] - a[2]) * f;
      out[2] = a[3] + (b[3] - a[3]) * f;
      return;
    }
  }
  const l = stops[stops.length - 1];
  out[0] = l[1];
  out[1] = l[2];
  out[2] = l[3];
}

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: false })!;
  return [c, g];
}

type Pt = readonly [number, number];
function poly(g: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
}

/** Soft contact shadow / ambient occlusion blob. */
function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.38): void {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(12,10,6,${a})`);
  gr.addColorStop(0.6, `rgba(12,10,6,${a * 0.55})`);
  gr.addColorStop(1, 'rgba(12,10,6,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}

/**
 * Paints an organic shape: base colour, painterly blotches, top-left light, bottom-right shade and
 * a dark outline. `path` must build the path (it is called twice).
 */
function paintBlob(
  g: CanvasRenderingContext2D,
  path: () => void,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  base: RGB,
  rng: Rng,
  blotches = 14,
  outline = 1.5,
): void {
  g.save();
  path();
  g.clip();
  g.fillStyle = css(base);
  g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  for (let k = 0; k < blotches; k++) {
    g.fillStyle = css(base, rng.r(0.78, 1.2), rng.r(0.25, 0.5));
    ellipse(g, bx + rng.r(0, bw), by + rng.r(0, bh), rng.r(bw * 0.08, bw * 0.28), rng.r(bh * 0.06, bh * 0.2));
    g.fill();
  }
  const lg = g.createRadialGradient(bx + bw * 0.28, by + bh * 0.22, 0, bx + bw * 0.28, by + bh * 0.22, Math.max(bw, bh) * 0.75);
  lg.addColorStop(0, 'rgba(255,244,214,0.38)');
  lg.addColorStop(1, 'rgba(255,244,214,0)');
  g.fillStyle = lg;
  g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  const dg = g.createLinearGradient(bx + bw * 0.35, by + bh * 0.35, bx + bw, by + bh);
  dg.addColorStop(0, 'rgba(18,12,30,0)');
  dg.addColorStop(1, 'rgba(18,12,30,0.5)');
  g.fillStyle = dg;
  g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  g.restore();
  if (outline > 0) {
    path();
    g.lineWidth = outline;
    g.lineJoin = 'round';
    g.strokeStyle = OUTLINE;
    g.stroke();
  }
}

// ---------------------------------------------------------------------------------------------
// Tile geometry (pixel -> tile-local world coords)
// ---------------------------------------------------------------------------------------------

interface TileGeom {
  u: Float32Array;
  v: Float32Array;
  /** coverage incl. ~1px overpaint */
  a: Float32Array;
  /** distance to nearest edge in uv units */
  e: Float32Array;
}

let geomCache: TileGeom | null = null;
function tileGeom(): TileGeom {
  if (geomCache) return geomCache;
  const u = new Float32Array(N);
  const v = new Float32Array(N);
  const a = new Float32Array(N);
  const e = new Float32Array(N);
  const k = Math.sqrt(1 / (HW * HW) + 1 / (HH * HH));
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const sx = px + 0.5 - HW;
      const sy = py + 0.5;
      const uu = (sx / HW + sy / HH) / 2;
      const vv = (sy / HH - sx / HW) / 2;
      u[i] = uu;
      v[i] = vv;
      const f = Math.abs(sx) / HW + Math.abs(sy - HH) / HH;
      a[i] = clamp01((1 - f) / k + 1);
      e[i] = Math.min(uu, 1 - uu, vv, 1 - vv);
    }
  }
  geomCache = { u, v, a, e };
  return geomCache;
}

const uvx = (u: number, v: number): number => (u - v) * HW + HW;
const uvy = (u: number, v: number): number => (u + v) * HH;

function clipDiamond(g: CanvasRenderingContext2D, grow = 1): void {
  g.beginPath();
  g.moveTo(HW, -grow * 0.5);
  g.lineTo(W + grow, HH);
  g.lineTo(HW, H + grow * 0.5);
  g.lineTo(-grow, HH);
  g.closePath();
  g.clip();
}

// ---------------------------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------------------------

const PAL: readonly Stops[] = [
  // grass
  [
    [0, 30, 66, 30],
    [0.3, 48, 98, 36],
    [0.58, 76, 132, 44],
    [0.82, 112, 158, 54],
    [1, 152, 182, 72],
  ],
  // dirt
  [
    [0, 82, 56, 36],
    [0.35, 114, 80, 50],
    [0.7, 142, 104, 66],
    [1, 172, 134, 90],
  ],
  // sand
  [
    [0, 164, 134, 88],
    [0.4, 196, 168, 114],
    [0.8, 220, 198, 144],
    [1, 236, 220, 170],
  ],
  // mud
  [
    [0, 50, 42, 26],
    [0.4, 74, 63, 38],
    [0.8, 98, 86, 52],
    [1, 118, 104, 64],
  ],
  // shallow
  [
    [0, 28, 106, 118],
    [0.45, 44, 142, 146],
    [0.8, 78, 174, 164],
    [1, 120, 200, 178],
  ],
  // deep
  [
    [0, 10, 28, 66],
    [0.45, 18, 48, 96],
    [0.85, 30, 72, 124],
    [1, 46, 96, 146],
  ],
];

const VARIANTS = 4;

interface GroundField {
  t: Float32Array;
  e1: Float32Array;
  e2: Float32Array;
}

function groundField(type: number): GroundField {
  const G = tileGeom();
  const s = 7919 * (type + 1);
  const A = new Fbm(4, 3, s);
  const Wu = new Fbm(2, 2, s + 1);
  const Wv = new Fbm(2, 2, s + 2);
  const F = new Fbm(16, 2, s + 3);
  const X1 = new Fbm(4, 2, s + 4);
  const X2 = new Fbm(8, 2, s + 5);
  const S = new Fbm(4, 2, s + 6, 4);
  const t = new Float32Array(N);
  const e1 = new Float32Array(N);
  const e2 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (G.a[i] <= 0) continue;
    const u = G.u[i];
    const v = G.v[i];
    const wu = u + (Wu.at(u, v) - 0.5) * 0.5;
    const wv = v + (Wv.at(u, v) - 0.5) * 0.5;
    const a = A.at(wu, wv);
    const f = F.at(u, v);
    let tt = 0.5 + (a - 0.5) * 2.6 + (f - 0.5) * 0.55;
    switch (type) {
      case 0:
        e1[i] = ss(0.52, 0.68, X1.at(wu, wv)) * 0.5;
        e2[i] = ss(0.5, 0.66, X2.at(u, v)) * 0.8;
        break;
      case 1:
        e1[i] = (S.at(u, v) - 0.5) * 0.45;
        e2[i] = ss(0.6, 0.72, X2.at(u, v));
        break;
      case 2: {
        const r = Math.sin(TAU * (3 * u + 5 * v) + (a - 0.5) * 12);
        e1[i] = r * 0.07;
        e2[i] = ss(0.7, 1, r) * ss(0.45, 0.6, X1.at(u, v));
        tt = 0.5 + (a - 0.5) * 1.8 + (f - 0.5) * 0.4;
        break;
      }
      case 3: {
        const wet = ss(0.57, 0.62, X1.at(wu, wv));
        e1[i] = wet;
        e2[i] = ss(0.6, 0.72, X2.at(u * 1, v)) * wet;
        break;
      }
      case 4: {
        const k = Math.abs(Math.sin(TAU * (3 * wu + wv)) + Math.sin(TAU * (-wu + 3 * wv)));
        e1[i] = (1 - ss(0, 0.4, k)) * 0.42;
        e2[i] = ss(0.53, 0.68, X1.at(wu, wv));
        tt = 0.5 + (a - 0.5) * 1.8 + (f - 0.5) * 0.3;
        break;
      }
      default:
        e1[i] = ss(0.58, 0.78, X2.at(wu, wv)) * 0.6;
        tt = 0.5 + (a - 0.5) * 1.8 + (f - 0.5) * 0.25;
        break;
    }
    t[i] = tt;
  }
  return { t, e1, e2 };
}

function colourise(type: number, t: number, e1: number, e2: number, out: Float32Array): void {
  const p = PAL[type];
  switch (type) {
    case 0: {
      ramp(p, t, out);
      out[0] += (182 - out[0]) * e1;
      out[1] += (196 - out[1]) * e1;
      out[2] += (82 - out[2]) * e1;
      const d = 1 - 0.3 * e2;
      out[0] *= d;
      out[1] *= d;
      out[2] *= d * 1.05;
      break;
    }
    case 1: {
      ramp(p, t + e1, out);
      const d = 1 - 0.22 * e2;
      out[0] *= d;
      out[1] *= d;
      out[2] *= d;
      break;
    }
    case 2:
      ramp(p, t + e1, out);
      out[0] += e2 * 14;
      out[1] += e2 * 12;
      out[2] += e2 * 8;
      break;
    case 3:
      ramp(p, t, out);
      out[0] += (30 - out[0]) * e1 * 0.75;
      out[1] += (36 - out[1]) * e1 * 0.75;
      out[2] += (30 - out[2]) * e1 * 0.75;
      out[0] += e2 * 70;
      out[1] += e2 * 76;
      out[2] += e2 * 72;
      break;
    case 4:
      ramp(p, t + e2 * 0.28, out);
      out[0] += e1 * 46;
      out[1] += e1 * 50;
      out[2] += e1 * 40;
      break;
    default:
      ramp(p, t, out);
      out[0] += e1 * 16;
      out[1] += e1 * 22;
      out[2] += e1 * 28;
      break;
  }
}

/** Small painted detail (blade tuft, pebble...) for a ground type, deterministic from (k, s). */
interface Detail {
  u: number;
  v: number;
  k: number;
  s: number;
}

interface DetailAt {
  x: number;
  y: number;
  k: number;
  s: number;
}

/** Draws many small details of one ground type, batched into a few paths (one per colour). */
function drawDetailBatch(g: CanvasRenderingContext2D, type: number, items: readonly DetailAt[]): void {
  if (items.length === 0) return;
  const pass = (fill: boolean, style: string, lw: number, add: (it: DetailAt) => void): void => {
    g.beginPath();
    for (const it of items) add(it);
    if (fill) {
      g.fillStyle = style;
      g.fill();
    } else {
      g.strokeStyle = style;
      g.lineWidth = lw;
      g.stroke();
    }
  };
  const oval = (x: number, y: number, rx: number, ry: number): void => {
    g.moveTo(x + rx, y);
    g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  };
  switch (type) {
    case 0: {
      const blades = (it: DetailAt, light: boolean): void => {
        const n = 2 + Math.floor(it.k * 3);
        const len = 3 + it.s * 5;
        for (let j = 0; j < n; j++) {
          const lean = Math.sin((j - (n - 1) / 2) * 0.45 + (it.k - 0.5) * 0.6);
          const bx = it.x + (j - (n - 1) / 2) * 1.3;
          if (!light) {
            g.moveTo(bx, it.y + 0.5);
            g.quadraticCurveTo(bx + lean * len * 0.3, it.y - len * 0.6, bx + lean * len, it.y - len);
          } else {
            g.moveTo(bx - 0.5, it.y);
            g.lineTo(bx - 0.5 + lean * len * 0.7, it.y - len * 0.75);
          }
        }
      };
      pass(false, 'rgba(26,56,22,0.55)', 1.3, (it) => blades(it, false));
      pass(false, 'rgba(178,204,92,0.5)', 0.8, (it) => it.k > 0.5 && blades(it, true));
      pass(false, 'rgba(120,166,62,0.55)', 0.8, (it) => it.k <= 0.5 && blades(it, true));
      break;
    }
    case 1:
    case 2: {
      const peb = items.filter((it) => type === 1 || it.k >= 0.55);
      const r = (it: DetailAt): number => 0.9 + it.s * (type === 1 ? 1.9 : 1.4);
      if (type === 2) pass(true, 'rgba(120,96,62,0.35)', 0, (it) => it.k < 0.55 && g.rect(it.x, it.y, 1, 1));
      const saved = items;
      items = peb;
      pass(true, 'rgba(40,28,18,0.4)', 0, (it) => oval(it.x + 0.7, it.y + 0.6, r(it), r(it) * 0.65));
      const body: RGB = type === 1 ? [150, 132, 110] : [226, 214, 190];
      pass(true, css(body, 0.9), 0, (it) => it.k < 0.5 && oval(it.x, it.y, r(it), r(it) * 0.62));
      pass(true, css(body, 1.08), 0, (it) => it.k >= 0.5 && oval(it.x, it.y, r(it), r(it) * 0.62));
      pass(true, 'rgba(255,248,226,0.5)', 0, (it) => oval(it.x - r(it) * 0.35, it.y - r(it) * 0.25, r(it) * 0.4, r(it) * 0.25));
      items = saved;
      break;
    }
    case 3:
      pass(true, 'rgba(24,20,12,0.5)', 0, (it) => it.k > 0.5 && oval(it.x, it.y, 0.8 + it.s * 1.5, 0.5 + it.s * 0.8));
      pass(true, 'rgba(196,204,180,0.35)', 0, (it) => it.k <= 0.5 && oval(it.x, it.y, 0.8 + it.s * 1.5, 0.5 + it.s * 0.8));
      break;
    case 4:
      pass(true, 'rgba(20,60,64,0.24)', 0, (it) => oval(it.x, it.y, 1 + it.s * 2, 0.7 + it.s * 1.2));
      break;
    default:
      break;
  }
}

function drawDetail(g: CanvasRenderingContext2D, type: number, x: number, y: number, k: number, s: number): void {
  drawDetailBatch(g, type, [{ x, y, k, s }]);
}

const DETAIL_COUNT = [190, 26, 50, 60, 40, 0];
const EDGE_BAND = 0.12;

function sharedDetails(type: number): Detail[] {
  const r = new Rng(424242 + type * 131);
  const out: Detail[] = [];
  for (let k = 0; k < DETAIL_COUNT[type]; k++) out.push({ u: r.next(), v: r.next(), k: r.next(), s: r.next() });
  return out;
}

function drawDetailsWrapped(g: CanvasRenderingContext2D, type: number, list: readonly Detail[], filter: (d: Detail) => boolean): void {
  const batch: DetailAt[] = [];
  for (const d of list) {
    if (!filter(d)) continue;
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        const x = uvx(d.u + du, d.v + dv);
        const y = uvy(d.u + du, d.v + dv);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        batch.push({ x, y, k: d.k, s: d.s });
      }
    }
  }
  drawDetailBatch(g, type, batch);
}

const edgeDist = (u: number, v: number): number => Math.min(u, 1 - u, v, 1 - v);

interface GroundBuild {
  tiles: HTMLCanvasElement[][];
  base: Float32Array[];
  details: Detail[][];
}

function buildGround(): GroundBuild {
  const G = tileGeom();
  const tiles: HTMLCanvasElement[][] = [];
  const base: Float32Array[] = [];
  const details: Detail[][] = [];
  const c = new Float32Array(3);
  for (let type = 0; type < 6; type++) {
    const f = groundField(type);
    const b = new Float32Array(N * 3);
    const dc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      if (G.a[i] <= 0) continue;
      colourise(type, f.t[i], f.e1[i], f.e2[i], c);
      b[i * 3] = c[0];
      b[i * 3 + 1] = c[1];
      b[i * 3 + 2] = c[2];
      // colour gradient d(colour)/dt, used to shift variants cheaply
      colourise(type, f.t[i] + 0.1, f.e1[i], f.e2[i], c);
      dc[i * 3] = (c[0] - b[i * 3]) * 10;
      dc[i * 3 + 1] = (c[1] - b[i * 3 + 1]) * 10;
      dc[i * 3 + 2] = (c[2] - b[i * 3 + 2]) * 10;
    }
    base.push(b);
    const shared = sharedDetails(type);
    details.push(shared);
    const row: HTMLCanvasElement[] = [];
    for (let vi = 0; vi < VARIANTS; vi++) {
      const Vn = new Fbm(4, 2, 9001 + type * 17 + vi * 101);
      const [cv, g] = mk(W, H);
      const img = g.createImageData(W, H);
      const d = img.data;
      const varK = type >= 4 ? 0.8 : 1.3;
      for (let i = 0; i < N; i++) {
        const j = i * 4;
        const ga = G.a[i];
        if (ga <= 0) continue;
        const e = G.e[i];
        const i3 = i * 3;
        if (e < 0.05) {
          d[j] = b[i3];
          d[j + 1] = b[i3 + 1];
          d[j + 2] = b[i3 + 2];
        } else {
          const dt = ss(0.05, 0.28, e) * (Vn.at(G.u[i], G.v[i]) - 0.5) * varK;
          d[j] = b[i3] + dc[i3] * dt;
          d[j + 1] = b[i3 + 1] + dc[i3 + 1] * dt;
          d[j + 2] = b[i3 + 2] + dc[i3 + 2] * dt;
        }
        d[j + 3] = ga * 255;
      }
      g.putImageData(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      drawDetailsWrapped(g, type, shared, (dd) => edgeDist(dd.u, dd.v) < EDGE_BAND);
      const vr = new Rng(77 + type * 1000 + vi * 37);
      const own: Detail[] = [];
      for (let k = 0; k < DETAIL_COUNT[type] * 0.6; k++) {
        const dd = { u: vr.next(), v: vr.next(), k: vr.next(), s: vr.next() };
        if (edgeDist(dd.u, dd.v) >= EDGE_BAND) own.push(dd);
      }
      drawDetailsWrapped(g, type, own, () => true);
      if (type === 0 && vi % 2 === 1) {
        // a few wildflowers in the interior
        for (let k = 0; k < 7; k++) {
          const u = vr.r(0.25, 0.75);
          const v = vr.r(0.25, 0.75);
          g.fillStyle = vi === 1 ? 'rgba(250,244,210,0.9)' : 'rgba(236,206,90,0.9)';
          g.fillRect(uvx(u, v), uvy(u, v), 1.6, 1.6);
        }
      }
      if (type === 1 && vi >= 2) {
        // faint tyre-ish streaks
        g.strokeStyle = 'rgba(60,40,24,0.16)';
        g.lineWidth = 2.2;
        const off = vr.r(0.35, 0.55);
        for (const o of [off, off + 0.14]) {
          g.beginPath();
          g.moveTo(uvx(0.22, o), uvy(0.22, o));
          g.lineTo(uvx(0.78, o + vr.r(-0.04, 0.04)), uvy(0.78, o));
          g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
      row.push(cv);
    }
    tiles.push(row);
  }
  return { tiles, base, details };
}

// ---------------------------------------------------------------------------------------------
// Transition fringes
// ---------------------------------------------------------------------------------------------

const EDGE_WIDTH = [0.24, 0.2, 0.26, 0.22, 0.3, 0.26];
const EDGE_RIM = [0.32, 0.18, 0.14, 0.2, 0.0, 0.0];

function dirDist(dir: number, u: number, v: number): number {
  return dir === 0 ? v : dir === 1 ? 1 - u : dir === 2 ? 1 - v : u;
}
function dirAlong(dir: number, u: number, v: number): number {
  return dir === 0 || dir === 2 ? u : v;
}
function dirUV(dir: number, along: number, dist: number): [number, number] {
  return dir === 0 ? [along, dist] : dir === 1 ? [1 - dist, along] : dir === 2 ? [along, 1 - dist] : [dist, along];
}

function buildEdges(gb: GroundBuild): HTMLCanvasElement[][] {
  const G = tileGeom();
  const out: HTMLCanvasElement[][] = [];
  for (let type = 0; type < 6; type++) {
    const EN = new PNoise(8, 4, 3131 + type);
    const J = new Fbm(8, 2, 5151 + type);
    const b = gb.base[type];
    const row: HTMLCanvasElement[] = [];
    const wBase = EDGE_WIDTH[type];
    const width = (dir: number, along: number): number => wBase * (0.45 + 1.1 * EN.at(along, dir * 0.25 + 0.1));
    for (let dir = 0; dir < 4; dir++) {
      const [cv, g] = mk(W, H);
      const img = g.createImageData(W, H);
      const d = img.data;
      for (let i = 0; i < N; i++) {
        if (G.a[i] <= 0) continue;
        const u = G.u[i];
        const v = G.v[i];
        if (dirDist(dir, u, v) > wBase * 1.6 + 0.1) continue;
        const w = width(dir, dirAlong(dir, u, v));
        const x = dirDist(dir, u, v) + (J.at(u, v) - 0.5) * 0.18;
        const a = 1 - ss(w * 0.45, w, x);
        if (a <= 0.003) continue;
        const rim = ss(w * 0.5, w * 0.82, x) * (1 - ss(w * 0.85, w * 1.02, x));
        const sh = 1 - EDGE_RIM[type] * rim;
        const j = i * 4;
        d[j] = b[i * 3] * sh;
        d[j + 1] = b[i * 3 + 1] * sh;
        d[j + 2] = b[i * 3 + 2] * sh;
        d[j + 3] = a * G.a[i] * 255;
      }
      g.putImageData(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      drawDetailsWrapped(g, type, gb.details[type], () => true);
      g.globalCompositeOperation = 'source-over';
      if (type === 0 || type === 2) {
        g.save();
        clipDiamond(g);
        const r = new Rng(6060 + type * 10 + dir);
        const tufts: DetailAt[] = [];
        for (let al = 0.03; al < 1; al += r.r(0.035, 0.07)) {
          const w = width(dir, al);
          const [u, v] = dirUV(dir, al, w * r.r(0.55, 0.8));
          if (type === 0) tufts.push({ x: uvx(u, v), y: uvy(u, v) + 1, k: r.next(), s: 0.4 + r.next() * 0.6 });
          else if (r.next() < 0.5) tufts.push({ x: uvx(u, v), y: uvy(u, v), k: r.next(), s: r.next() * 0.6 });
        }
        drawDetailBatch(g, type === 0 ? 0 : 1, tufts);
        g.restore();
      }
      row.push(cv);
    }
    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Water animation overlays
// ---------------------------------------------------------------------------------------------

function buildWaterFrames(): HTMLCanvasElement[][] {
  const G = tileGeom();
  const out: HTMLCanvasElement[][] = [];
  for (let kind = 0; kind < 2; kind++) {
    const Wu = new Fbm(2, 2, 808 + kind);
    const Wv = new Fbm(2, 2, 809 + kind);
    const M = new Fbm(4, 2, 810 + kind);
    const frames: HTMLCanvasElement[] = [];
    const WU = new Float32Array(N);
    const WV = new Float32Array(N);
    const WM = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (G.a[i] <= 0) continue;
      const u = G.u[i];
      const v = G.v[i];
      WU[i] = u + (Wu.at(u, v) - 0.5) * 0.35;
      WV[i] = v + (Wv.at(u, v) - 0.5) * 0.35;
      WM[i] = (M.at(u, v) - 0.5) * 1.6;
    }
    for (let f = 0; f < 4; f++) {
      const ph = (f / 4) * TAU;
      const [cv, g] = mk(W, H);
      const img = g.createImageData(W, H);
      const d = img.data;
      for (let i = 0; i < N; i++) {
        if (G.a[i] <= 0) continue;
        const uu = WU[i];
        const vv = WV[i];
        const w =
          Math.sin(TAU * (2 * uu + vv) + ph) +
          Math.sin(TAU * (-uu + 2 * vv) - ph) +
          0.7 * Math.sin(TAU * (3 * uu - 2 * vv) + 2 * ph) +
          WM[i];
        const glint = ss(1.55, 2.0, w);
        const crest = ss(0.8, 1.35, w) * 0.5;
        const a = kind === 0 ? glint * 0.6 + crest * 0.14 : glint * 0.42 + crest * 0.1;
        if (a <= 0.004) continue;
        const j = i * 4;
        d[j] = kind === 0 ? 236 : 150;
        d[j + 1] = kind === 0 ? 255 : 196;
        d[j + 2] = kind === 0 ? 246 : 236;
        d[j + 3] = clamp01(a) * G.a[i] * 255;
      }
      g.putImageData(img, 0, 0);
      frames.push(cv);
    }
    out.push(frames);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cliffs
// ---------------------------------------------------------------------------------------------

const STRATA: readonly RGB[] = [
  [128, 110, 90],
  [146, 124, 96],
  [112, 100, 88],
  [138, 112, 84],
  [120, 106, 94],
  [150, 130, 102],
];

interface CliffNoise {
  s: PNoise;
  g: Fbm;
  c: Fbm;
}
const cliffNoise = (seed: number): CliffNoise => ({ s: new PNoise(8, 4, seed), g: new Fbm(8, 2, seed + 1), c: new Fbm(16, 2, seed + 2, 0.25) });

/** Rock/earth colour at along-face coordinate u (period 1) and depth d (px below the top edge). */
function cliffColour(cn: CliffNoise, left: boolean, u: number, d: number, out: Float32Array): void {
  const dn = d / LEVEL_PX;
  const gr = cn.g.at(u, dn);
  const soil = 3.5 + 2.5 * cn.s.at(u, 0.1);
  let r: number;
  let gg: number;
  let b: number;
  if (d < soil) {
    const f = 0.85 + 0.3 * gr;
    r = 84 * f;
    gg = 60 * f;
    b = 38 * f;
  } else {
    const db = d - soil + (cn.s.at(u, 0.6) - 0.5) * 6;
    const bf = db / 6;
    const band = Math.floor(bf);
    const fr = bf - band;
    const c = STRATA[(band + 60) % STRATA.length];
    const f = (1.14 - 0.32 * fr) * (0.82 + 0.36 * gr);
    r = c[0] * f;
    gg = c[1] * f;
    b = c[2] * f;
    const cr = cn.c.at(u, dn);
    const crack = ss(0.36, 0.26, cr) * 0.55;
    r *= 1 - crack;
    gg *= 1 - crack;
    b *= 1 - crack * 0.9;
    if (d < soil + 1.6) {
      r *= 1.25;
      gg *= 1.22;
      b *= 1.18;
    }
  }
  const ao = 1 - 0.45 * ss(LEVEL_PX - 7, LEVEL_PX, d);
  const lf = left ? 1.0 : 0.68;
  out[0] = r * ao * lf;
  out[1] = gg * ao * lf;
  out[2] = b * ao * (left ? 1 : 0.78);
}

function buildCliffs(): [HTMLCanvasElement[], HTMLCanvasElement[]] {
  const cw = HW;
  const ch = HH + LEVEL_PX;
  const baseN = cliffNoise(500);
  const left: HTMLCanvasElement[] = [];
  const right: HTMLCanvasElement[] = [];
  const c0 = new Float32Array(3);
  const c1 = new Float32Array(3);
  for (let vi = 0; vi < 3; vi++) {
    const vn = cliffNoise(600 + vi * 13);
    for (let side = 0; side < 2; side++) {
      const isLeft = side === 0;
      const [cv, g] = mk(cw, ch);
      const img = g.createImageData(cw, ch);
      const d = img.data;
      for (let py = 0; py < ch; py++) {
        for (let px = 0; px < cw; px++) {
          const x = px + 0.5;
          const yTop = isLeft ? x / 2 : HH - x / 2;
          const dd = py + 0.5 - yTop;
          const a = clamp01(dd + 1) * clamp01(LEVEL_PX - dd + 0.5);
          if (a <= 0) continue;
          const u = x / cw;
          const dc = Math.max(0, dd);
          cliffColour(baseN, isLeft, u, dc, c0);
          const m = ss(0.06, 0.3, Math.min(u, 1 - u));
          if (m > 0) {
            cliffColour(vn, isLeft, u, dc, c1);
            c0[0] += (c1[0] - c0[0]) * m;
            c0[1] += (c1[1] - c0[1]) * m;
            c0[2] += (c1[2] - c0[2]) * m;
          }
          if (dd > LEVEL_PX - 1.2) {
            c0[0] *= 0.55;
            c0[1] *= 0.55;
            c0[2] *= 0.55;
          }
          const j = (py * cw + px) * 4;
          d[j] = c0[0];
          d[j + 1] = c0[1];
          d[j + 2] = c0[2];
          d[j + 3] = a * 255;
        }
      }
      g.putImageData(img, 0, 0);
      // a few embedded stones / roots for the hand-painted feel
      const r = new Rng(700 + vi * 7 + side);
      g.save();
      g.globalCompositeOperation = 'source-atop';
      for (let k = 0; k < 4; k++) {
        const x = r.r(10, cw - 10);
        const yTop = isLeft ? x / 2 : HH - x / 2;
        const y = yTop + r.r(8, LEVEL_PX - 5);
        const rx = r.r(2, 4.5);
        g.fillStyle = 'rgba(20,14,10,0.35)';
        ellipse(g, x + 0.8, y + 0.8, rx, rx * 0.7);
        g.fill();
        g.fillStyle = css([150, 140, 124], isLeft ? 1 : 0.72);
        ellipse(g, x, y, rx, rx * 0.7);
        g.fill();
        g.fillStyle = `rgba(255,240,210,${isLeft ? 0.35 : 0.15})`;
        ellipse(g, x - rx * 0.3, y - rx * 0.25, rx * 0.45, rx * 0.3);
        g.fill();
      }
      g.strokeStyle = 'rgba(40,26,16,0.5)';
      g.lineWidth = 0.9;
      for (let k = 0; k < 3; k++) {
        const x = r.r(8, cw - 8);
        const yTop = isLeft ? x / 2 : HH - x / 2;
        g.beginPath();
        g.moveTo(x, yTop + 2);
        g.quadraticCurveTo(x + r.r(-3, 3), yTop + 5, x + r.r(-4, 4), yTop + r.r(6, 9));
        g.stroke();
      }
      g.restore();
      (isLeft ? left : right).push(cv);
    }
  }
  return [left, right];
}

// ---------------------------------------------------------------------------------------------
// Ramps
// ---------------------------------------------------------------------------------------------

const CORNERS: readonly Pt[] = [
  [HW, 0],
  [W, HH],
  [HW, H],
  [0, HH],
];

function triCover(x: number, y: number, a: Pt, b: Pt, c: Pt): number {
  if (x < Math.min(a[0], b[0], c[0]) - 1 || x > Math.max(a[0], b[0], c[0]) + 1) return 0;
  if (y < Math.min(a[1], b[1], c[1]) - 1 || y > Math.max(a[1], b[1], c[1]) + 1) return 0;
  // min signed distance to the three edges (positive inside), as coverage
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const sgn = area > 0 ? 1 : -1;
  const m = Math.min(edgeSd(x, y, a, b, sgn), edgeSd(x, y, b, c, sgn), edgeSd(x, y, c, a, sgn));
  return clamp01(m + 0.5);
}

function edgeSd(x: number, y: number, p: Pt, q: Pt, sgn: number): number {
  const ex = q[0] - p[0];
  const ey = q[1] - p[1];
  const len = Math.sqrt(ex * ex + ey * ey) || 1;
  return (sgn * (ex * (y - p[1]) - ey * (x - p[0]))) / len;
}

function lineY(p: Pt, q: Pt, x: number): number {
  if (Math.abs(q[0] - p[0]) < 1e-6) return p[1];
  return p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0]);
}

function buildRamps(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const rh = H + LEVEL_PX;
  const cn = cliffNoise(900);
  const T = new Fbm(4, 2, 910);
  const Fd = new Fbm(16, 2, 911);
  const cc = new Float32Array(3);
  const low = (p: Pt): Pt => [p[0], p[1] + LEVEL_PX];
  const SHADE = [1.0, 0.84, 1.02, 1.12];
  for (let dir = 0; dir < 4; dir++) {
    const [cv, g] = mk(W, rh);
    const img = g.createImageData(W, rh);
    const d = img.data;
    const H0 = CORNERS[(dir + 3) % 4];
    const H1 = CORNERS[(dir + 2) % 4];
    const L0 = low(CORNERS[dir]);
    const E1: Pt = [H1[0] - H0[0], H1[1] - H0[1]];
    const E2: Pt = [L0[0] - H0[0], L0[1] - H0[1]];
    const det = E1[0] * E2[1] - E1[1] * E2[0];
    const cr = Math.abs(det);
    const l1 = Math.hypot(E1[0], E1[1]);
    const l2 = Math.hypot(E2[0], E2[1]);
    // side triangles
    interface Tri {
      p: [Pt, Pt, Pt];
      top: [Pt, Pt];
      left: boolean;
    }
    const tris: Tri[] = [];
    for (const e of [(dir + 1) % 4, (dir + 3) % 4]) {
      const ca = e;
      const cb = (e + 1) % 4;
      const isLow = (c: number): boolean => c === dir || c === (dir + 1) % 4;
      const lowC = isLow(ca) ? ca : cb;
      const highC = lowC === ca ? cb : ca;
      const hp = CORNERS[highC];
      const lp = CORNERS[lowC];
      if (e === 1 || e === 2) tris.push({ p: [hp, low(lp), low(hp)], top: [hp, low(lp)], left: e === 2 });
      else tris.push({ p: [hp, lp, low(lp)], top: [hp, lp], left: e === 0 });
    }
    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < W; px++) {
        const x = px + 0.5;
        const y = py + 0.5;
        const rx = x - H0[0];
        const ry = y - H0[1];
        const a = (rx * E2[1] - ry * E2[0]) / det;
        const s = (E1[0] * ry - E1[1] * rx) / det;
        const cov = clamp01(Math.min(a, 1 - a) * (cr / l2) + 0.5) * clamp01(Math.min(s, 1 - s) * (cr / l1) + 0.5);
        const j = (py * W + px) * 4;
        let r = 0;
        let gg = 0;
        let b = 0;
        let al = 0;
        for (const t of tris) {
          const tc = triCover(x, y, t.p[0], t.p[1], t.p[2]);
          if (tc <= 0) continue;
          const dd = Math.max(0, Math.min(LEVEL_PX, y - lineY(t.top[0], t.top[1], x)));
          cliffColour(cn, t.left, x / HW, dd, cc);
          r = cc[0];
          gg = cc[1];
          b = cc[2];
          al = Math.max(al, tc);
        }
        if (cov > 0) {
          const tex = T.at(a, s * 0.5);
          const fine = Fd.at(a, s);
          ramp(PAL[1], 0.45 + (tex - 0.5) * 2.2 + (fine - 0.5) * 0.5, cc);
          const rid = (s * 5 + (tex - 0.5) * 1.5 + 10) % 1;
          let f = SHADE[dir] * (1 - 0.13 * ss(0.14, 0, rid) + 0.07 * ss(0.14, 0.24, rid) * ss(0.5, 0.24, rid));
          f *= 1 - 0.28 * (ss(0.1, 0, a) + ss(0.9, 1, a));
          const rut = Math.min(Math.abs(a - 0.32), Math.abs(a - 0.68));
          f *= 1 - 0.18 * ss(0.05, 0.0, rut);
          const rr = cc[0] * f;
          const rg = cc[1] * f;
          const rb = cc[2] * f;
          r = al > 0 ? r + (rr - r) * cov : rr;
          gg = al > 0 ? gg + (rg - gg) * cov : rg;
          b = al > 0 ? b + (rb - b) * cov : rb;
          al = Math.max(al, cov);
        }
        if (al <= 0) continue;
        d[j] = r;
        d[j + 1] = gg;
        d[j + 2] = b;
        d[j + 3] = al * 255;
      }
    }
    g.putImageData(img, 0, 0);
    // stone curbs along the two sloped side edges
    const rng = new Rng(950 + dir);
    const H1L = low(CORNERS[(dir + 1) % 4]);
    for (const [p, q] of [
      [H0, L0],
      [H1, H1L],
    ] as const) {
      for (let k = 0; k <= 6; k++) {
        const t = (k + rng.r(-0.2, 0.2)) / 6;
        const sx = p[0] + (q[0] - p[0]) * t + (H1[0] - H0[0]) * (p === H0 ? 0.05 : -0.05);
        const sy = p[1] + (q[1] - p[1]) * t + (H1[1] - H0[1]) * (p === H0 ? 0.05 : -0.05);
        const r0 = rng.r(2.2, 3.6);
        g.fillStyle = 'rgba(20,14,10,0.45)';
        ellipse(g, sx + 0.8, sy + 0.9, r0, r0 * 0.7);
        g.fill();
        g.fillStyle = css([150, 142, 128], rng.r(0.85, 1.05));
        ellipse(g, sx, sy, r0, r0 * 0.7);
        g.fill();
        g.fillStyle = 'rgba(255,244,220,0.4)';
        ellipse(g, sx - r0 * 0.3, sy - r0 * 0.3, r0 * 0.45, r0 * 0.3);
        g.fill();
      }
    }
    out.push(cv);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Iso boxes (walls, crates, towers)
// ---------------------------------------------------------------------------------------------

type Proj = (wx: number, wy: number, z: number) => Pt;
const projAt =
  (ox: number, oy: number): Proj =>
  (wx, wy, z) => [ox + (wx - wy) * HW, oy + (wx + wy) * HH - z];

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
type Painter = (g: CanvasRenderingContext2D, len: number, ht: number) => void;

function brickPainter(seed: number, stone: RGB, rowH = 7, bw = 14, mossy = 0): Painter {
  return (g, L, Ht) => {
    const r = new Rng(seed);
    g.fillStyle = css(stone, 0.5);
    g.fillRect(-2, -2, L + 4, Ht + 4);
    let row = 0;
    for (let y = Ht; y > -rowH; y -= rowH, row++) {
      let x = (row % 2 ? -bw / 2 : 0) - r.r(0, 3);
      while (x < L) {
        const w = bw * r.r(0.7, 1.25);
        const f = r.r(0.84, 1.12);
        const c = mossy > 0 && r.next() < mossy ? mixc(stone, [86, 112, 54], r.r(0.3, 0.6)) : stone;
        g.fillStyle = css(c, f);
        g.fillRect(x + 0.8, y - rowH + 0.8, w - 1.6, rowH - 1.6);
        g.fillStyle = css(c, f * 1.28, 0.85);
        g.fillRect(x + 0.8, y - rowH + 0.8, w - 1.6, 1);
        g.fillStyle = css(c, f * 0.7, 0.7);
        g.fillRect(x + 0.8, y - 1.8, w - 1.6, 1);
        x += w;
      }
    }
  };
}

function flatPainter(seed: number, c: RGB, blotch = 8): Painter {
  return (g, L, Ht) => {
    const r = new Rng(seed);
    g.fillStyle = css(c);
    g.fillRect(-2, -2, L + 4, Ht + 4);
    for (let k = 0; k < blotch; k++) {
      g.fillStyle = css(c, r.r(0.82, 1.16), 0.45);
      ellipse(g, r.r(0, L), r.r(0, Ht), r.r(2, 6), r.r(1.5, 4));
      g.fill();
    }
  };
}

function plankPainter(seed: number, wood: RGB, vertical = false, frame = true): Painter {
  return (g, L, Ht) => {
    const r = new Rng(seed);
    g.fillStyle = css(wood, 0.55);
    g.fillRect(-2, -2, L + 4, Ht + 4);
    const step = 5.5;
    if (!vertical) {
      for (let y = 0; y < Ht; y += step) {
        const f = r.r(0.86, 1.12);
        g.fillStyle = css(wood, f);
        g.fillRect(0, y + 0.6, L, step - 1.2);
        g.fillStyle = css(wood, f * 1.2, 0.7);
        g.fillRect(0, y + 0.6, L, 0.9);
        g.strokeStyle = css(wood, 0.6, 0.5);
        g.lineWidth = 0.6;
        g.beginPath();
        const gx = r.r(2, L - 2);
        g.moveTo(gx, y + step * 0.5);
        g.lineTo(gx + r.r(3, 8), y + step * 0.5);
        g.stroke();
      }
    } else {
      for (let x = 0; x < L; x += step) {
        const f = r.r(0.86, 1.12);
        g.fillStyle = css(wood, f);
        g.fillRect(x + 0.6, 0, step - 1.2, Ht);
        g.fillStyle = css(wood, f * 1.2, 0.7);
        g.fillRect(x + 0.6, 0, 0.9, Ht);
      }
    }
    if (frame) {
      g.strokeStyle = css(wood, 0.62);
      g.lineWidth = 2.6;
      g.strokeRect(1.3, 1.3, L - 2.6, Ht - 2.6);
      g.strokeStyle = css(wood, 1.15, 0.7);
      g.lineWidth = 0.8;
      g.strokeRect(0.6, 0.6, L - 1.2, Ht - 1.2);
    }
  };
}

function drawBox(
  g: CanvasRenderingContext2D,
  P: Proj,
  b: Box,
  left: Painter,
  right: Painter,
  top: Painter,
  outline = 1.3,
): void {
  const { x0, x1, y0, y1, z0, z1 } = b;
  const ht = z1 - z0;
  // left (SW) face
  g.save();
  poly(g, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]);
  g.clip();
  let o = P(x0, y1, z1);
  g.transform(1, 0.5, 0, 1, o[0], o[1]);
  left(g, (x1 - x0) * HW, ht);
  const lgL = g.createLinearGradient(0, ht - 9, 0, ht);
  lgL.addColorStop(0, 'rgba(10,6,4,0)');
  lgL.addColorStop(1, 'rgba(10,6,4,0.35)');
  g.fillStyle = lgL;
  g.fillRect(-2, ht - 9, (x1 - x0) * HW + 4, 11);
  g.restore();
  // right (SE) face
  g.save();
  poly(g, [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)]);
  g.clip();
  o = P(x1, y1, z1);
  g.transform(1, -0.5, 0, 1, o[0], o[1]);
  right(g, (y1 - y0) * HW, ht);
  g.fillStyle = 'rgba(14,10,30,0.34)';
  g.fillRect(-2, -2, (y1 - y0) * HW + 4, ht + 4);
  const lgR = g.createLinearGradient(0, ht - 9, 0, ht);
  lgR.addColorStop(0, 'rgba(10,6,4,0)');
  lgR.addColorStop(1, 'rgba(10,6,4,0.3)');
  g.fillStyle = lgR;
  g.fillRect(-2, ht - 9, (y1 - y0) * HW + 4, 11);
  g.restore();
  // top face
  g.save();
  poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]);
  g.clip();
  o = P(x0, y0, z1);
  g.transform(1, 0.5, -1, 0.5, o[0], o[1]);
  top(g, (x1 - x0) * HW, (y1 - y0) * HW);
  g.fillStyle = 'rgba(255,240,206,0.16)';
  g.fillRect(-2, -2, (x1 - x0) * HW + 4, (y1 - y0) * HW + 4);
  g.restore();
  // edges
  g.strokeStyle = 'rgba(255,240,210,0.35)';
  g.lineWidth = 0.9;
  g.beginPath();
  const a = P(x0, y1, z1);
  const c = P(x1, y1, z1);
  const e = P(x1, y0, z1);
  g.moveTo(a[0], a[1] + 0.5);
  g.lineTo(c[0], c[1] + 0.5);
  g.lineTo(e[0], e[1] + 0.5);
  g.stroke();
  if (outline > 0) {
    poly(g, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), P(x0, y1, z1)]);
    g.strokeStyle = OUTLINE;
    g.lineWidth = outline;
    g.lineJoin = 'round';
    g.stroke();
    g.strokeStyle = 'rgba(26,18,12,0.45)';
    g.lineWidth = 0.8;
    g.beginPath();
    const f0 = P(x1, y1, z0);
    g.moveTo(f0[0], f0[1]);
    g.lineTo(c[0], c[1]);
    g.stroke();
  }
}

/** Box whose top is broken into a jagged outline (ruins, damaged walls). */
function drawBrokenBox(
  g: CanvasRenderingContext2D,
  P: Proj,
  b: Box,
  rng: Rng,
  hMin: number,
  hMax: number,
  stone: RGB,
  seed: number,
): void {
  const { x0, x1, y0, y1, z0 } = b;
  const nL = Math.max(2, Math.round((x1 - x0) * 14));
  const nR = Math.max(2, Math.round((y1 - y0) * 14));
  const hl: number[] = [];
  for (let k = 0; k <= nL; k++) hl.push(rng.r(hMin, hMax));
  const hr: number[] = [hl[nL]];
  for (let k = 1; k <= nR; k++) hr.push(rng.r(hMin, hMax));
  const lx = (k: number): number => x0 + ((x1 - x0) * k) / nL;
  const ry = (k: number): number => y1 - ((y1 - y0) * k) / nR;
  const leftPts: Pt[] = [P(x0, y1, z0), P(x1, y1, z0)];
  for (let k = nL; k >= 0; k--) leftPts.push(P(lx(k), y1, z0 + hl[k]));
  const rightPts: Pt[] = [P(x1, y0, z0), P(x1, y1, z0)];
  for (let k = 0; k <= nR; k++) rightPts.push(P(x1, ry(k), z0 + hr[k]));
  const hb = (hMin + hMax) / 2;
  const topPts: Pt[] = [P(x0, y0, z0 + hb)];
  for (let k = nR; k >= 0; k--) topPts.push(P(x1, ry(k), z0 + hr[k]));
  for (let k = nL; k >= 0; k--) topPts.push(P(lx(k), y1, z0 + hl[k]));
  // top (rough broken surface)
  g.save();
  poly(g, topPts);
  g.fillStyle = css(stone, 1.08);
  g.fill();
  g.clip();
  for (let k = 0; k < 10; k++) {
    const p = P(rng.r(x0, x1), rng.r(y0, y1), z0 + hb);
    g.fillStyle = css(stone, rng.r(0.7, 1.25), 0.6);
    ellipse(g, p[0], p[1], rng.r(1.5, 4), rng.r(1, 2.5));
    g.fill();
  }
  g.restore();
  const tall = hMax + 4;
  // left face
  g.save();
  poly(g, leftPts);
  g.clip();
  let o = P(x0, y1, z0 + tall);
  g.transform(1, 0.5, 0, 1, o[0], o[1]);
  brickPainter(seed, stone)(g, (x1 - x0) * HW, tall);
  g.restore();
  // right face
  g.save();
  poly(g, rightPts);
  g.clip();
  o = P(x1, y1, z0 + tall);
  g.transform(1, -0.5, 0, 1, o[0], o[1]);
  brickPainter(seed + 1, stone)(g, (y1 - y0) * HW, tall);
  g.fillStyle = 'rgba(14,10,30,0.34)';
  g.fillRect(-2, -2, (y1 - y0) * HW + 4, tall + 4);
  g.restore();
  g.strokeStyle = OUTLINE;
  g.lineWidth = 1.2;
  g.lineJoin = 'round';
  poly(g, leftPts);
  g.stroke();
  poly(g, rightPts);
  g.stroke();
  poly(g, topPts);
  g.stroke();
}

function rubble(g: CanvasRenderingContext2D, rng: Rng, cx: number, cy: number, n: number, sx: number, sy: number, stone: RGB): void {
  const pts: [number, number, number][] = [];
  for (let k = 0; k < n; k++) pts.push([cx + rng.r(-sx, sx), cy + rng.r(-sy, sy), rng.r(1.8, 4.2)]);
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of pts) {
    shadow(g, x + 0.5, y + r * 0.4, r * 1.3, r * 0.6, 0.35);
    const pts2: Pt[] = [];
    const m = 6;
    for (let k = 0; k < m; k++) {
      const an = (k / m) * TAU + rng.r(-0.3, 0.3);
      const rr = r * rng.r(0.75, 1.1);
      pts2.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.72 - r * 0.3]);
    }
    paintBlob(g, () => poly(g, pts2), x - r, y - r * 1.1, r * 2, r * 1.6, stone, rng, 2, 0.9);
  }
}

function merlons(g: CanvasRenderingContext2D, P: Proj, b: Box, stone: RGB, seed: number, skip = -1): void {
  const list: [number, number][] = [];
  const m = 0.07;
  const step = 0.2;
  for (let t = b.x0 + m; t <= b.x1 - m + 1e-6; t += step) {
    list.push([t, b.y0 + m]);
    list.push([t, b.y1 - m]);
  }
  for (let t = b.y0 + m + step; t <= b.y1 - m - step + 1e-6; t += step) {
    list.push([b.x0 + m, t]);
    list.push([b.x1 - m, t]);
  }
  list.sort((a, c) => a[0] + a[1] - (c[0] + c[1]));
  list.forEach(([x, y], k) => {
    if (k === skip) return;
    drawBox(
      g,
      P,
      { x0: x - m, x1: x + m, y0: y - m, y1: y + m, z0: b.z1, z1: b.z1 + 7 },
      flatPainter(seed + k, stone, 3),
      flatPainter(seed + k + 50, stone, 3),
      flatPainter(seed + k + 90, stone, 2),
      1,
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------------------------

function conifer(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, h: number, tint: number): void {
  shadow(g, x + 3, y, h * 0.26, h * 0.1, 0.45);
  // trunk
  g.fillStyle = '#4a3020';
  g.strokeStyle = OUTLINE;
  g.lineWidth = 1.2;
  poly(g, [
    [x - 3.2, y + 1],
    [x + 3.2, y + 1],
    [x + 2.2, y - h * 0.22],
    [x - 2.2, y - h * 0.22],
  ]);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(160,110,70,0.5)';
  g.fillRect(x - 2.4, y - h * 0.2, 1.2, h * 0.2);
  const tiers = h > 115 ? 5 : 4;
  const yb = y - h * 0.12;
  const yt = y - h;
  const dark: RGB = [22 * tint, 58, 38];
  const mid: RGB = [36 * tint, 92, 48];
  const light: RGB = [92 * tint, 150, 70];
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const bot = yb - (yb - yt) * f * 0.82;
    const top = k === tiers - 1 ? yt : bot - (yb - yt) * 0.42;
    const hw = h * 0.3 * (1 - f * 0.78) + 3;
    const lean = rng.r(-1.5, 1.5);
    const pts: Pt[] = [[x + lean, top]];
    const n = 7;
    pts.push([x + hw * 0.55, bot - (bot - top) * 0.35]);
    for (let j = 0; j <= n; j++) {
      const tx = x + hw - (2 * hw * j) / n;
      const droop = j % 2 === 0 ? rng.r(2, 5) : rng.r(-1.5, 0.5);
      pts.push([tx, bot + droop]);
    }
    pts.push([x - hw * 0.55, bot - (bot - top) * 0.35]);
    const path = (): void => poly(g, pts);
    path();
    g.lineWidth = 2.4;
    g.lineJoin = 'round';
    g.strokeStyle = OUTLINE;
    g.stroke();
    const gr = g.createLinearGradient(x - hw, top, x + hw, bot);
    gr.addColorStop(0, css(light));
    gr.addColorStop(0.42, css(mid));
    gr.addColorStop(1, css(dark));
    g.fillStyle = gr;
    g.fill();
    // needle strokes
    g.save();
    path();
    g.clip();
    for (let j = 0; j < 9; j++) {
      const sx = x + rng.r(-hw * 0.9, hw * 0.4);
      const sy = rng.r(top + (bot - top) * 0.3, bot);
      g.strokeStyle = sx < x ? 'rgba(170,210,110,0.45)' : 'rgba(10,30,20,0.4)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(sx, sy - 4);
      g.lineTo(sx + (sx < x ? -2 : 2), sy + 1);
      g.stroke();
    }
    g.restore();
  }
}

function deciduous(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, h: number, hue: number): void {
  shadow(g, x + 4, y, h * 0.32, h * 0.12, 0.45);
  const cy = y - h * 0.62;
  const R = h * 0.24;
  // trunk with two branches
  g.fillStyle = '#563924';
  g.strokeStyle = OUTLINE;
  g.lineWidth = 1.2;
  poly(g, [
    [x - 4.5, y + 1],
    [x + 4.5, y + 1],
    [x + 2.5, cy + R * 0.2],
    [x + 6, cy - R * 0.2],
    [x + 4, cy - R * 0.25],
    [x + 0.5, cy + R * 0.05],
    [x - 3, cy - R * 0.3],
    [x - 5, cy - R * 0.25],
    [x - 2.5, cy + R * 0.25],
  ]);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(170,120,80,0.45)';
  g.fillRect(x - 3.5, cy + R * 0.3, 1.5, y - cy - R * 0.3);
  const cl: [number, number, number][] = [];
  const n = 8;
  for (let k = 0; k < n; k++) {
    const an = (k / n) * TAU + rng.r(-0.3, 0.3);
    const d = k === 0 ? 0 : rng.r(0.4, 0.75);
    cl.push([x + Math.cos(an) * R * d, cy + Math.sin(an) * R * d * 0.8, R * rng.r(0.48, 0.66)]);
  }
  cl.push([x, cy - R * 0.55, R * 0.55]);
  cl.sort((a, b) => a[1] - b[1]);
  const dark: RGB = [34 + hue * 30, 72 + hue * 6, 30];
  const mid: RGB = [62 + hue * 50, 118 + hue * 4, 42];
  const light: RGB = [132 + hue * 50, 176, 72];
  g.fillStyle = OUTLINE;
  for (const [cx, cyy, r] of cl) {
    g.beginPath();
    g.arc(cx, cyy, r + 1.6, 0, TAU);
    g.fill();
  }
  for (const [cx, cyy, r] of cl) {
    g.fillStyle = css(dark);
    g.beginPath();
    g.arc(cx, cyy, r, 0, TAU);
    g.fill();
    g.fillStyle = css(mid);
    g.beginPath();
    g.arc(cx - r * 0.14, cyy - r * 0.16, r * 0.8, 0, TAU);
    g.fill();
    g.fillStyle = css(light, 1, 0.9);
    g.beginPath();
    g.arc(cx - r * 0.32, cyy - r * 0.36, r * 0.42, 0, TAU);
    g.fill();
    for (let j = 0; j < 5; j++) {
      g.fillStyle = j % 2 ? css(light, 1.1, 0.7) : css(dark, 0.9, 0.5);
      g.beginPath();
      g.arc(cx + rng.r(-r * 0.6, r * 0.6), cyy + rng.r(-r * 0.6, r * 0.6), rng.r(1.2, 2.4), 0, TAU);
      g.fill();
    }
  }
}

function bush(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, r: number): void {
  shadow(g, x + 2, y + 1, r * 1.4, r * 0.55, 0.4);
  const cl: [number, number, number][] = [];
  for (let k = 0; k < 4; k++) cl.push([x + rng.r(-r * 0.7, r * 0.7), y - r * 0.55 + rng.r(-r * 0.3, r * 0.2), r * rng.r(0.5, 0.75)]);
  cl.sort((a, b) => a[1] - b[1]);
  g.fillStyle = OUTLINE;
  for (const [cx, cy, rr] of cl) {
    g.beginPath();
    g.arc(cx, cy, rr + 1.3, 0, TAU);
    g.fill();
  }
  for (const [cx, cy, rr] of cl) {
    g.fillStyle = '#2c5a26';
    g.beginPath();
    g.arc(cx, cy, rr, 0, TAU);
    g.fill();
    g.fillStyle = '#4f8a36';
    g.beginPath();
    g.arc(cx - rr * 0.18, cy - rr * 0.2, rr * 0.72, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(150,196,84,0.85)';
    g.beginPath();
    g.arc(cx - rr * 0.35, cy - rr * 0.38, rr * 0.35, 0, TAU);
    g.fill();
  }
}

const sx = (wx: number, wy: number): number => (wx - wy) * HW;
const sy = (wx: number, wy: number): number => (wx + wy) * HH;

function forest(v: number): ArtSprite {
  const cw = 150;
  const ch = 178;
  const ax = 75;
  const ay = 156;
  const [c, g] = mk(cw, ch);
  const rng = new Rng(1100 + v * 31);
  shadow(g, ax + 4, ay + 2, 62, 26, 0.32);
  type Tree = { wx: number; wy: number; h: number; kind: 0 | 1 | 2 };
  const layouts: Tree[][] = [
    [
      { wx: -0.2, wy: -0.18, h: 140, kind: 0 },
      { wx: 0.22, wy: -0.05, h: 118, kind: 0 },
      { wx: -0.02, wy: 0.22, h: 104, kind: 0 },
    ],
    [
      { wx: -0.18, wy: -0.2, h: 120, kind: 1 },
      { wx: 0.2, wy: 0.02, h: 132, kind: 0 },
      { wx: -0.1, wy: 0.24, h: 96, kind: 1 },
    ],
    [
      { wx: 0.05, wy: -0.22, h: 142, kind: 0 },
      { wx: -0.22, wy: 0.12, h: 112, kind: 0 },
      { wx: 0.24, wy: 0.2, h: 30, kind: 2 },
    ],
    [
      { wx: -0.05, wy: -0.12, h: 126, kind: 1 },
      { wx: 0.24, wy: 0.16, h: 106, kind: 0 },
      { wx: -0.24, wy: 0.2, h: 28, kind: 2 },
    ],
  ];
  const trees = layouts[v % layouts.length].slice().sort((a, b) => a.wx + a.wy - (b.wx + b.wy));
  for (const t of trees) {
    const x = ax + sx(t.wx, t.wy);
    const y = ay + sy(t.wx, t.wy);
    const h = Math.min(t.h, y - 4);
    if (t.kind === 0) conifer(g, rng, x, y, h, v === 2 ? 1.25 : 1);
    else if (t.kind === 1) deciduous(g, rng, x, y, Math.min(h, 124), v === 3 ? 0.6 : 0);
    else bush(g, rng, x, y, 13);
  }
  bush(g, rng, ax + sx(0.3, -0.3) * 0.6, ay + sy(0.3, 0.3) * 0.9, 8);
  return { canvas: c, anchorX: ax, anchorY: ay };
}

// ---------------------------------------------------------------------------------------------
// Rocks
// ---------------------------------------------------------------------------------------------

function boulder(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, h: number, base: RGB, moss: number): void {
  shadow(g, x + w * 0.1, y, w * 0.62, w * 0.22, 0.45);
  const n = 10;
  const pts: Pt[] = [];
  const cy = y - h / 2;
  for (let k = 0; k < n; k++) {
    const an = -Math.PI / 2 + (k / n) * TAU + rng.r(-0.12, 0.12);
    const rr = rng.r(0.86, 1.06);
    let py = cy + Math.sin(an) * (h / 2) * rr;
    if (py > y) py = y + rng.r(0, 1.5);
    pts.push([x + Math.cos(an) * (w / 2) * rr, py]);
  }
  const path = (): void => poly(g, pts);
  paintBlob(g, path, x - w / 2, y - h, w, h, base, rng, 12, 0);
  g.save();
  path();
  g.clip();
  // facets: lit top-left plane, shaded right plane
  const ridge: Pt = [x + w * rng.r(-0.05, 0.1), cy - h * 0.05];
  g.fillStyle = 'rgba(255,240,214,0.22)';
  poly(g, [pts[7], pts[8], pts[9], pts[0], pts[1], ridge]);
  g.fill();
  g.fillStyle = 'rgba(16,12,26,0.25)';
  poly(g, [pts[1], pts[2], pts[3], pts[4], ridge]);
  g.fill();
  g.strokeStyle = 'rgba(30,22,16,0.55)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  g.lineTo(ridge[0], ridge[1]);
  g.lineTo(pts[4][0], pts[4][1]);
  g.moveTo(ridge[0], ridge[1]);
  g.lineTo(pts[6][0] + 4, pts[6][1] - 2);
  g.stroke();
  // cracks
  for (let k = 0; k < 2; k++) {
    let cx = x + rng.r(-w * 0.25, w * 0.25);
    let cyy = y - h * rng.r(0.4, 0.75);
    g.beginPath();
    g.moveTo(cx, cyy);
    for (let j = 0; j < 3; j++) {
      cx += rng.r(-3, 3);
      cyy += rng.r(2, 5);
      g.lineTo(cx, cyy);
    }
    g.strokeStyle = 'rgba(24,16,12,0.6)';
    g.stroke();
  }
  // moss on top
  for (let k = 0; k < moss; k++) {
    g.fillStyle = k % 2 ? 'rgba(96,130,52,0.75)' : 'rgba(134,166,70,0.7)';
    ellipse(g, x + rng.r(-w * 0.35, w * 0.15), y - h + rng.r(2, h * 0.3), rng.r(2.5, 6), rng.r(1.5, 3));
    g.fill();
  }
  g.restore();
  path();
  g.lineWidth = 1.6;
  g.lineJoin = 'round';
  g.strokeStyle = OUTLINE;
  g.stroke();
}

function rock(v: number): ArtSprite {
  const cw = 130;
  const ch = 104;
  const ax = 65;
  const ay = 86;
  const [c, g] = mk(cw, ch);
  const rng = new Rng(1300 + v * 17);
  const grey: RGB = [126, 120, 110];
  const warm: RGB = [140, 124, 104];
  shadow(g, ax + 4, ay + 2, 52, 20, 0.3);
  if (v === 0) {
    boulder(g, rng, ax - 6, ay - 4, 76, 68, grey, 6);
    boulder(g, rng, ax + 26, ay + 8, 30, 24, warm, 2);
  } else if (v === 1) {
    boulder(g, rng, ax + 12, ay - 10, 52, 50, warm, 3);
    boulder(g, rng, ax - 18, ay + 2, 60, 58, grey, 4);
    boulder(g, rng, ax + 20, ay + 12, 20, 15, grey, 0);
  } else {
    boulder(g, rng, ax, ay, 84, 54, [118, 116, 112], 7);
    boulder(g, rng, ax - 30, ay + 10, 18, 14, warm, 0);
  }
  rubble(g, rng, ax + 4, ay + 14, 4, 30, 5, grey);
  return { canvas: c, anchorX: ax, anchorY: ay };
}

// ---------------------------------------------------------------------------------------------
// Walls, gates, crates, ruins, bridge, torch
// ---------------------------------------------------------------------------------------------

const STONE: RGB = [150, 140, 122];
const STONE_WARM: RGB = [160, 138, 112];
const WOOD: RGB = [150, 102, 56];
const WALL_H = 40;

function wall(v: number, damaged: boolean): ArtSprite {
  const cw = 132;
  const ch = HH * 2 + WALL_H + 12;
  const ax = 66;
  const ay = HH + WALL_H + 10;
  const [c, g] = mk(cw, ch);
  const P = projAt(ax, ay);
  const rng = new Rng(1500 + v * 7 + (damaged ? 99 : 0));
  const stone = v === 1 ? STONE_WARM : STONE;
  const b: Box = { x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5, z0: 0, z1: WALL_H };
  if (!damaged) {
    drawBox(g, P, b, brickPainter(1501 + v, stone, 7, 14, v === 1 ? 0.18 : 0.04), brickPainter(1502 + v, stone, 7, 14, v === 1 ? 0.18 : 0.04), flatPainter(1503, mixc(stone, [120, 110, 96], 0.4), 14));
    merlons(g, P, b, stone, 1510 + v, v === 1 ? 7 : -1);
    if (v === 1) {
      // ivy
      g.save();
      poly(g, [P(-0.5, 0.5, 0), P(0.5, 0.5, 0), P(0.5, 0.5, WALL_H), P(-0.5, 0.5, WALL_H)]);
      g.clip();
      for (let k = 0; k < 3; k++) {
        const base = P(rng.r(-0.45, 0.1), 0.5, WALL_H);
        let x = base[0];
        let y = base[1];
        for (let j = 0; j < 14; j++) {
          x += rng.r(-2.5, 2.5);
          y += rng.r(1.5, 3);
          g.fillStyle = j % 3 ? 'rgba(62,108,40,0.95)' : 'rgba(126,170,70,0.95)';
          ellipse(g, x, y, rng.r(2, 3.4), rng.r(1.4, 2.4));
          g.fill();
        }
      }
      g.restore();
    }
  } else {
    drawBrokenBox(g, P, b, rng, 14, 34, stone, 1520);
    // cracks and holes on the front faces
    g.strokeStyle = 'rgba(20,12,8,0.75)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      let p = P(rng.r(-0.3, 0.4), 0.5, rng.r(14, 24));
      g.beginPath();
      g.moveTo(p[0], p[1]);
      for (let j = 0; j < 4; j++) {
        p = [p[0] + rng.r(-4, 4), p[1] + rng.r(2, 5)];
        g.lineTo(p[0], p[1]);
      }
      g.stroke();
    }
    const hp = P(0.1, 0.5, 18);
    g.fillStyle = 'rgba(18,12,10,0.85)';
    ellipse(g, hp[0], hp[1], 7, 5);
    g.fill();
    g.fillStyle = 'rgba(40,30,20,0.35)';
    ellipse(g, P(0.2, 0.2, 0)[0], P(0.2, 0.2, 0)[1] + 4, 28, 10);
    g.fill();
    rubble(g, rng, ax + 4, ay + 22, 9, 40, 6, stone);
    rubble(g, rng, ax - 2, ay - 22, 5, 26, 6, stone);
  }
  return { canvas: c, anchorX: ax, anchorY: ay };
}

function crateBox(g: CanvasRenderingContext2D, P: Proj, b: Box, seed: number, mark: boolean): void {
  const wood: RGB = [WOOD[0] + (seed % 3) * 8, WOOD[1] + (seed % 2) * 6, WOOD[2]];
  const left: Painter = (gg, L, Ht) => {
    plankPainter(seed, wood)(gg, L, Ht);
    gg.strokeStyle = css(wood, 0.62);
    gg.lineWidth = 2.2;
    gg.beginPath();
    gg.moveTo(2, Ht - 2);
    gg.lineTo(L - 2, 2);
    gg.stroke();
    gg.fillStyle = '#3a3a3e';
    for (const [x, y] of [
      [0, 0],
      [L - 4, 0],
      [0, Ht - 4],
      [L - 4, Ht - 4],
    ]) gg.fillRect(x, y, 4, 4);
  };
  const right: Painter = (gg, L, Ht) => {
    plankPainter(seed + 1, wood)(gg, L, Ht);
    gg.fillStyle = '#3a3a3e';
    for (const [x, y] of [
      [0, 0],
      [L - 4, 0],
      [0, Ht - 4],
      [L - 4, Ht - 4],
    ]) gg.fillRect(x, y, 4, 4);
    if (mark) {
      gg.strokeStyle = 'rgba(236,226,190,0.75)';
      gg.lineWidth = 1.6;
      gg.beginPath();
      gg.arc(L / 2, Ht / 2, Math.min(L, Ht) * 0.2, 0, TAU);
      gg.moveTo(L / 2, Ht / 2 - Math.min(L, Ht) * 0.3);
      gg.lineTo(L / 2, Ht / 2 + Math.min(L, Ht) * 0.3);
      gg.stroke();
    }
  };
  drawBox(g, P, b, left, right, plankPainter(seed + 2, mixc(wood, [200, 160, 110], 0.15)));
}

function crate(v: number, damaged: boolean): ArtSprite {
  const cw = 104;
  const ch = 96;
  const ax = 52;
  const ay = 66;
  const [c, g] = mk(cw, ch);
  const P = projAt(ax, ay);
  const rng = new Rng(1700 + v + (damaged ? 50 : 0));
  shadow(g, ax + 3, ay + 4, 44, 18, 0.35);
  if (damaged) {
    // broken crate: jagged walls, dark inside, loose planks
    const b: Box = { x0: -0.2, x1: 0.2, y0: -0.2, y1: 0.2, z0: 0, z1: 30 };
    const inner = [P(b.x0, b.y0, 4), P(b.x1, b.y0, 4), P(b.x1, b.y1, 4), P(b.x0, b.y1, 4)];
    g.fillStyle = '#24170e';
    poly(g, inner);
    g.fill();
    const nL = 6;
    const left: Pt[] = [P(b.x0, b.y1, 0), P(b.x1, b.y1, 0)];
    for (let k = nL; k >= 0; k--) left.push(P(b.x0 + ((b.x1 - b.x0) * k) / nL, b.y1, rng.r(8, 28)));
    const right: Pt[] = [P(b.x1, b.y0, 0), P(b.x1, b.y1, 0), left[2]];
    for (let k = 1; k <= nL; k++) right.push(P(b.x1, b.y1 - ((b.y1 - b.y0) * k) / nL, rng.r(10, 30)));
    for (const [pts, isLeft] of [
      [left, true],
      [right, false],
    ] as const) {
      g.save();
      poly(g, pts);
      g.clip();
      const o = isLeft ? P(b.x0, b.y1, 30) : P(b.x1, b.y1, 30);
      g.transform(1, isLeft ? 0.5 : -0.5, 0, 1, o[0], o[1]);
      plankPainter(1750 + (isLeft ? 0 : 1), [130, 88, 50], false, false)(g, 26, 30);
      if (!isLeft) {
        g.fillStyle = 'rgba(14,10,30,0.34)';
        g.fillRect(-2, -2, 30, 34);
      }
      g.fillStyle = 'rgba(20,14,8,0.35)';
      g.fillRect(-2, -2, 30, 8);
      g.restore();
      poly(g, pts);
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1.2;
      g.stroke();
    }
    // loose planks
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(ax + rng.r(-36, 34), ay + rng.r(6, 20));
      g.rotate(rng.r(-0.6, 0.6));
      g.fillStyle = css([140, 94, 52], rng.r(0.85, 1.1));
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1;
      g.fillRect(-9, -2, 18, 4);
      g.strokeRect(-9, -2, 18, 4);
      g.restore();
    }
    g.fillStyle = 'rgba(30,20,12,0.4)';
    ellipse(g, ax - 8, ay + 10, 16, 5);
    g.fill();
  } else if (v === 0) {
    crateBox(g, P, { x0: -0.22, x1: 0.18, y0: -0.24, y1: 0.16, z0: 0, z1: 34 }, 1701, true);
    crateBox(g, P, { x0: -0.08, x1: 0.18, y0: 0.2, y1: 0.42, z0: 0, z1: 22 }, 1702, false);
  } else {
    crateBox(g, P, { x0: -0.34, x1: -0.04, y0: -0.2, y1: 0.1, z0: 0, z1: 26 }, 1711, false);
    crateBox(g, P, { x0: 0.04, x1: 0.34, y0: -0.12, y1: 0.18, z0: 0, z1: 26 }, 1712, true);
    crateBox(g, P, { x0: -0.24, x1: 0.02, y0: -0.18, y1: 0.08, z0: 26, z1: 48 }, 1713, false);
  }
  return { canvas: c, anchorX: ax, anchorY: ay };
}

function ruins(v: number): ArtSprite {
  const cw = 132;
  const ch = 96;
  const ax = 66;
  const ay = 60;
  const [c, g] = mk(cw, ch);
  const P = projAt(ax, ay);
  const rng = new Rng(1900 + v * 13);
  const stone: RGB = v === 1 ? [146, 136, 120] : [138, 130, 116];
  // cracked floor slabs
  for (let k = 0; k < 5; k++) {
    const x = rng.r(-0.35, 0.25);
    const y = rng.r(-0.35, 0.25);
    const s = rng.r(0.1, 0.16);
    poly(g, [P(x, y, 0), P(x + s, y, 0), P(x + s, y + s, 0), P(x, y + s, 0)]);
    g.fillStyle = css(stone, rng.r(0.8, 0.95), 0.75);
    g.fill();
    g.strokeStyle = 'rgba(30,22,16,0.45)';
    g.lineWidth = 1;
    g.stroke();
  }
  shadow(g, ax, ay + 2, 50, 20, 0.22);
  if (v === 0) {
    drawBrokenBox(g, P, { x0: -0.42, x1: 0.3, y0: -0.4, y1: -0.26, z0: 0, z1: 0 }, rng, 6, 24, stone, 1901);
    drawBrokenBox(g, P, { x0: -0.42, x1: -0.28, y0: -0.26, y1: 0.32, z0: 0, z1: 0 }, rng, 4, 20, stone, 1902);
    rubble(g, rng, ax + 14, ay + 10, 9, 30, 8, stone);
  } else if (v === 1) {
    // column stubs
    for (const [wx, wy, hh] of [
      [-0.25, -0.2, 26],
      [0.2, -0.25, 12],
      [-0.2, 0.25, 8],
    ] as const) {
      const [x, y] = P(wx, wy, 0);
      const r = 8;
      shadow(g, x + 2, y + 1, 12, 5, 0.4);
      const gr = g.createLinearGradient(x - r, 0, x + r, 0);
      gr.addColorStop(0, css(stone, 1.2));
      gr.addColorStop(0.5, css(stone, 1));
      gr.addColorStop(1, css(stone, 0.62));
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI);
      g.lineTo(x - r, y - hh);
      g.ellipse(x, y - hh, r, r * 0.5, 0, Math.PI, 0, true);
      g.closePath();
      g.fill();
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1.2;
      g.stroke();
      g.fillStyle = css(stone, 1.15);
      ellipse(g, x, y - hh, r, r * 0.5);
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(30,20,14,0.5)';
      g.beginPath();
      g.moveTo(x - 2, y - hh + 1);
      g.lineTo(x + 1, y - hh + 4);
      g.lineTo(x - 1, y - hh + 8);
      g.stroke();
    }
    // fallen drum
    rubble(g, rng, ax + 18, ay + 8, 7, 22, 7, stone);
    rubble(g, rng, ax - 24, ay - 2, 4, 12, 5, stone);
  } else {
    drawBrokenBox(g, P, { x0: 0.0, x1: 0.42, y0: -0.42, y1: -0.28, z0: 0, z1: 0 }, rng, 6, 22, stone, 1903);
    drawBrokenBox(g, P, { x0: -0.3, x1: -0.14, y0: 0.0, y1: 0.16, z0: 0, z1: 0 }, rng, 6, 12, stone, 1904);
    rubble(g, rng, ax - 6, ay + 12, 10, 34, 8, stone);
    bush(g, rng, ax + 30, ay + 4, 7);
  }
  // grass tufts growing through
  for (let k = 0; k < 6; k++) drawDetail(g, 0, ax + rng.r(-44, 44), ay + rng.r(-10, 22), rng.next(), 0.8);
  return { canvas: c, anchorX: ax, anchorY: ay };
}

function roof(g: CanvasRenderingContext2D, P: Proj, b: Box, rh: number, col: RGB, rng: Rng): void {
  const o = 0.035;
  const x0 = b.x0 - o;
  const x1 = b.x1 + o;
  const y0 = b.y0 - o;
  const y1 = b.y1 + o;
  const z = b.z1 - 2;
  const apex = P((x0 + x1) / 2, (y0 + y1) / 2, z + rh);
  const A = P(x0, y1, z);
  const B = P(x1, y1, z);
  const C = P(x1, y0, z);
  for (const [p, q, f] of [
    [A, B, 1],
    [B, C, 0.66],
  ] as const) {
    poly(g, [p, q, apex]);
    g.fillStyle = css(col, f);
    g.fill();
    g.save();
    poly(g, [p, q, apex]);
    g.clip();
    g.strokeStyle = css(col, f * 0.65);
    g.lineWidth = 1;
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      g.beginPath();
      g.moveTo(p[0] + (apex[0] - p[0]) * t, p[1] + (apex[1] - p[1]) * t);
      g.lineTo(q[0] + (apex[0] - q[0]) * t, q[1] + (apex[1] - q[1]) * t);
      g.stroke();
    }
    for (let k = 0; k < 6; k++) {
      g.fillStyle = css(col, f * rng.r(0.8, 1.25), 0.5);
      ellipse(g, rng.r(Math.min(p[0], q[0]), Math.max(p[0], q[0])), rng.r(apex[1], Math.max(p[1], q[1])), 3, 1.5);
      g.fill();
    }
    g.restore();
  }
  g.strokeStyle = 'rgba(255,220,190,0.45)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(apex[0], apex[1]);
  g.lineTo(B[0], B[1]);
  g.stroke();
  poly(g, [A, B, C, apex]);
  g.strokeStyle = OUTLINE;
  g.lineWidth = 1.4;
  g.stroke();
  // finial
  g.fillStyle = '#d8b04a';
  g.beginPath();
  g.arc(apex[0], apex[1] - 1.5, 2, 0, TAU);
  g.fill();
}

function archPainter(seed: number, stone: RGB, damaged: boolean): Painter {
  return (g, L, Ht) => {
    brickPainter(seed, stone)(g, L, Ht);
    const aw = L * 0.56;
    const ah = Ht * 0.66;
    const x0 = (L - aw) / 2;
    const yTop = Ht - ah;
    const arch = (inset: number): void => {
      g.beginPath();
      g.moveTo(x0 + inset, Ht + 1);
      g.lineTo(x0 + inset, yTop + aw / 2);
      g.arc(L / 2, yTop + aw / 2, aw / 2 - inset, Math.PI, 0);
      g.lineTo(x0 + aw - inset, Ht + 1);
      g.closePath();
    };
    // voussoirs
    arch(-3);
    g.fillStyle = css(stone, 1.15);
    g.fill();
    g.strokeStyle = OUTLINE;
    g.lineWidth = 1;
    g.stroke();
    arch(0);
    g.fillStyle = '#140d09';
    g.fill();
    g.save();
    arch(0.8);
    g.clip();
    const leaf = (lx: number, lw: number, ox = 0, rot = 0): void => {
      g.save();
      g.translate(lx + ox, Ht);
      g.rotate(rot);
      g.fillStyle = '#6a4424';
      g.fillRect(0, -ah - 2, lw, ah + 2);
      for (let x = 0; x < lw; x += 3.2) {
        g.fillStyle = css([118, 78, 42], 0.85 + ((x * 7) % 3) * 0.1);
        g.fillRect(x + 0.4, -ah - 2, 2.4, ah + 2);
      }
      g.fillStyle = '#2c2c30';
      for (const yy of [ah * 0.25, ah * 0.65]) g.fillRect(0, -yy - 1.5, lw, 2.2);
      g.fillStyle = '#c9b27a';
      for (const yy of [ah * 0.25, ah * 0.65]) for (let x = 1.5; x < lw; x += 4) g.fillRect(x, -yy - 1, 1, 1);
      g.restore();
    };
    if (!damaged) {
      leaf(x0, aw / 2 - 0.4);
      leaf(L / 2 + 0.4, aw / 2 - 0.4);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(L / 2 - 0.5, yTop, 1, ah);
    } else {
      leaf(x0 + aw / 2 + 0.4, aw / 2 - 0.4, 2, 0.12);
      g.fillStyle = 'rgba(255,140,40,0.12)';
      g.fillRect(x0, yTop, aw / 2, ah);
    }
    g.restore();
    // banner above arch
    if (!damaged) {
      g.fillStyle = '#7a2a24';
      g.beginPath();
      g.moveTo(L / 2 - 4, 3);
      g.lineTo(L / 2 + 4, 3);
      g.lineTo(L / 2 + 4, yTop - 4);
      g.lineTo(L / 2, yTop - 7);
      g.lineTo(L / 2 - 4, yTop - 4);
      g.closePath();
      g.fill();
      g.strokeStyle = OUTLINE;
      g.lineWidth = 0.8;
      g.stroke();
      g.fillStyle = '#d8b04a';
      g.fillRect(L / 2 - 1.2, 6, 2.4, 2.4);
    }
  };
}

function gate(v: number, damaged: boolean): ArtSprite {
  const cw = 124;
  const ch = 148;
  const ax = 62;
  const ay = 120;
  const [c, g] = mk(cw, ch);
  const P = projAt(ax, ay);
  const rng = new Rng(2100 + v + (damaged ? 40 : 0));
  const alongX = v === 0;
  const W2 = (a: number, b: number): [number, number] => (alongX ? [a, b] : [b, a]);
  const boxAt = (a0: number, a1: number, b0: number, b1: number, z1: number): Box => {
    const [xa, ya] = W2(a0, b0);
    const [xb, yb] = W2(a1, b1);
    return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: Math.min(ya, yb), y1: Math.max(ya, yb), z0: 0, z1 };
  };
  shadow(g, ax + 4, ay + 4, 60, 26, 0.35);
  const stone = STONE;
  const towerH = 68;
  const t0 = boxAt(-0.5, -0.18, -0.16, 0.16, towerH);
  const t1 = boxAt(0.18, 0.5, -0.16, 0.16, damaged ? 46 : towerH);
  const gh = boxAt(-0.3, 0.3, -0.2, 0.2, 50);
  const plain = brickPainter(2110 + v, stone);
  const slit = (seed: number): Painter => (gg, L, Ht) => {
    brickPainter(seed, stone)(gg, L, Ht);
    gg.fillStyle = '#120c08';
    gg.fillRect(L / 2 - 1.5, Ht * 0.25, 3, 10);
    gg.fillStyle = css(stone, 1.25);
    gg.fillRect(L / 2 - 2.5, Ht * 0.25 + 10, 5, 1.5);
  };
  const top = flatPainter(2120, mixc(stone, [110, 100, 90], 0.4), 10);
  const roofCol: RGB = [154, 58, 42];
  // back tower
  drawBox(g, P, t0, alongX ? plain : slit(2111), alongX ? slit(2112) : plain, top);
  roof(g, P, t0, 30, roofCol, rng);
  // gatehouse
  const arch = archPainter(2130 + v, stone, damaged);
  drawBox(g, P, gh, alongX ? arch : plain, alongX ? plain : arch, top);
  merlons(g, P, gh, stone, 2140 + v);
  // front tower
  if (!damaged) {
    drawBox(g, P, t1, alongX ? slit(2113) : plain, alongX ? plain : slit(2114), top);
    roof(g, P, t1, 30, roofCol, rng);
  } else {
    drawBrokenBox(g, P, { ...t1, z1: 0 }, rng, 30, 52, stone, 2150);
    // scorch and rubble
    const p = P(0.25, 0.25, 0);
    g.fillStyle = 'rgba(20,14,10,0.35)';
    ellipse(g, p[0], p[1], 26, 9);
    g.fill();
    rubble(g, rng, ax + (alongX ? 18 : -18), ay + 18, 12, 30, 7, stone);
  }
  return { canvas: c, anchorX: ax, anchorY: ay };
}

function bridge(v: number): ArtSprite {
  const cw = 132;
  const ch = 100;
  const ax = 66;
  const ay = 52;
  const [c, g] = mk(cw, ch);
  const P = projAt(ax, ay);
  const rng = new Rng(2300 + v);
  const alongX = v === 0;
  const Q = (a: number, b: number, z: number): Pt => (alongX ? P(a, b, z) : P(b, a, z));
  const z = 3;
  const wood: RGB = [146, 100, 58];
  // supports (piles) under the front side
  for (const a of [-0.3, 0.2]) {
    const top = Q(a, 0.46, z - 5);
    const bot = Q(a, 0.46, z - 20);
    g.fillStyle = '#3e2816';
    g.fillRect(top[0] - 3, top[1], 6, bot[1] - top[1]);
    g.fillStyle = 'rgba(190,140,90,0.45)';
    g.fillRect(top[0] - 3, top[1], 2, bot[1] - top[1]);
    g.strokeStyle = OUTLINE;
    g.lineWidth = 1;
    g.strokeRect(top[0] - 3, top[1], 6, bot[1] - top[1]);
    g.fillStyle = 'rgba(200,240,240,0.5)';
    g.fillRect(top[0] - 4, bot[1] - 3, 8, 1.2);
  }
  // deck thickness on the two front edges
  for (const pts of [
    [P(-0.5, 0.5, z), P(0.5, 0.5, z), P(0.5, 0.5, z - 6), P(-0.5, 0.5, z - 6)],
    [P(0.5, 0.5, z), P(0.5, -0.5, z), P(0.5, -0.5, z - 6), P(0.5, 0.5, z - 6)],
  ]) {
    poly(g, pts);
    g.fillStyle = pts[1][1] < pts[0][1] ? '#4a301a' : '#5e3e22';
    g.fill();
    g.strokeStyle = OUTLINE;
    g.lineWidth = 1;
    g.stroke();
  }
  // planks across the bridge direction
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a0 = -0.5 + k / n;
    const a1 = -0.5 + (k + 1) / n;
    const pts = [Q(a0, -0.5, z), Q(a1, -0.5, z), Q(a1, 0.5, z), Q(a0, 0.5, z)];
    poly(g, pts);
    const f = rng.r(0.84, 1.12);
    g.fillStyle = css(wood, f);
    g.fill();
    g.save();
    poly(g, pts);
    g.clip();
    for (let j = 0; j < 4; j++) {
      const p = Q(rng.r(a0, a1), rng.r(-0.45, 0.45), z);
      g.fillStyle = css(wood, f * rng.r(0.75, 1.2), 0.5);
      ellipse(g, p[0], p[1], rng.r(3, 7), rng.r(1, 2.5));
      g.fill();
    }
    g.restore();
    const e0 = Q(a1, -0.5, z);
    const e1 = Q(a1, 0.5, z);
    g.strokeStyle = 'rgba(40,24,12,0.8)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(e0[0], e0[1]);
    g.lineTo(e1[0], e1[1]);
    g.stroke();
    const s0 = Q(a0 + 0.01, -0.5, z);
    const s1 = Q(a0 + 0.01, 0.5, z);
    g.strokeStyle = 'rgba(255,220,170,0.25)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(s0[0], s0[1]);
    g.lineTo(s1[0], s1[1]);
    g.stroke();
    g.fillStyle = '#2a2420';
    for (const b of [-0.32, 0.32]) {
      const nl = Q((a0 + a1) / 2, b, z);
      g.fillRect(nl[0] - 0.6, nl[1] - 0.6, 1.3, 1.3);
    }
  }
  // rails: back first, then front
  const rail = (b: number): void => {
    for (const a of [-0.44, 0.06]) {
      const p0 = Q(a, b, z);
      const p1 = Q(a, b, z + 14);
      g.fillStyle = '#4a2f18';
      g.fillRect(p0[0] - 2, p1[1], 4, p0[1] - p1[1]);
      g.fillStyle = 'rgba(200,150,100,0.5)';
      g.fillRect(p0[0] - 2, p1[1], 1.3, p0[1] - p1[1]);
      g.strokeStyle = OUTLINE;
      g.lineWidth = 0.9;
      g.strokeRect(p0[0] - 2, p1[1], 4, p0[1] - p1[1]);
    }
    for (const [zz, lw] of [
      [12, 3.2],
      [6, 2.2],
    ] as const) {
      const p = Q(-0.5, b, z + zz);
      const q = Q(0.5, b, z + zz);
      g.lineCap = 'butt';
      g.strokeStyle = OUTLINE;
      g.lineWidth = lw + 1.6;
      g.beginPath();
      g.moveTo(p[0], p[1]);
      g.lineTo(q[0], q[1]);
      g.stroke();
      g.strokeStyle = '#6e4826';
      g.lineWidth = lw;
      g.stroke();
      g.strokeStyle = 'rgba(230,180,120,0.55)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(p[0], p[1] - lw * 0.3);
      g.lineTo(q[0], q[1] - lw * 0.3);
      g.stroke();
    }
  };
  rail(-0.46);
  rail(0.46);
  return { canvas: c, anchorX: ax, anchorY: ay };
}

function torch(): ArtSprite {
  const cw = 48;
  const ch = 80;
  const ax = 24;
  const ay = 70;
  const [c, g] = mk(cw, ch);
  const rng = new Rng(2500);
  // glow
  const gl = g.createRadialGradient(ax, 22, 0, ax, 22, 24);
  gl.addColorStop(0, 'rgba(255,200,90,0.55)');
  gl.addColorStop(0.5, 'rgba(255,150,50,0.2)');
  gl.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, cw, 48);
  shadow(g, ax + 2, ay + 1, 12, 5, 0.45);
  rubble(g, rng, ax, ay - 1, 4, 6, 2, [130, 124, 116]);
  // post
  g.fillStyle = '#4a2f1a';
  g.strokeStyle = OUTLINE;
  g.lineWidth = 1.1;
  poly(g, [
    [ax - 2.5, ay],
    [ax + 2.5, ay],
    [ax + 2, 34],
    [ax - 2, 34],
  ]);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(190,140,90,0.55)';
  g.fillRect(ax - 2, 35, 1.2, ay - 36);
  // brazier bowl
  g.fillStyle = '#2e2b2a';
  g.beginPath();
  g.moveTo(ax - 9, 28);
  g.lineTo(ax + 9, 28);
  g.lineTo(ax + 5, 36);
  g.lineTo(ax - 5, 36);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#5a5552';
  ellipse(g, ax, 28, 9, 2.6);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,200,120,0.6)';
  g.fillRect(ax - 7, 30, 4, 1.2);
  // flame (bright so it reads at night)
  const flame = (w: number, hh: number, col: string): void => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(ax - w, 28);
    g.bezierCurveTo(ax - w * 1.1, 28 - hh * 0.5, ax - w * 0.2, 28 - hh * 0.6, ax + 1, 28 - hh);
    g.bezierCurveTo(ax + w * 0.3, 28 - hh * 0.6, ax + w * 1.2, 28 - hh * 0.45, ax + w, 28);
    g.closePath();
    g.fill();
  };
  flame(8, 24, '#e2541c');
  flame(6, 19, '#ff9a2a');
  flame(4, 13, '#ffd860');
  flame(2.2, 8, '#fff8d8');
  for (let k = 0; k < 4; k++) {
    g.fillStyle = 'rgba(255,220,120,0.9)';
    g.fillRect(ax + rng.r(-7, 7), rng.r(2, 10), 1.3, 1.3);
  }
  return { canvas: c, anchorX: ax, anchorY: ay };
}

// ---------------------------------------------------------------------------------------------
// Decals
// ---------------------------------------------------------------------------------------------

function decal(v: number): ArtSprite {
  const cw = 40;
  const ch = 24;
  const [c, g] = mk(cw, ch);
  const rng = new Rng(2700 + v * 11);
  const cx = 20;
  const cy = 14;
  const flowers = (cols: readonly string[]): void => {
    for (let k = 0; k < 6; k++) drawDetail(g, 0, cx + rng.r(-12, 12), cy + rng.r(-3, 6), rng.next(), 0.5);
    for (let k = 0; k < 7; k++) {
      const x = cx + rng.r(-13, 13);
      const y = cy + rng.r(-6, 5);
      g.strokeStyle = 'rgba(40,80,30,0.8)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(x, y + 4);
      g.lineTo(x, y);
      g.stroke();
      g.fillStyle = cols[k % cols.length];
      for (let p = 0; p < 4; p++) {
        g.beginPath();
        g.arc(x + Math.cos((p * TAU) / 4) * 1.3, y + Math.sin((p * TAU) / 4) * 0.9, 1.1, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#f2d24a';
      g.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  };
  switch (v) {
    case 0:
      flowers(['#f6f2e4', '#f8f0c8']);
      break;
    case 1:
      flowers(['#9a6ad0', '#b88ae6']);
      break;
    case 2:
      flowers(['#e0503a', '#f07a4a']);
      break;
    case 3:
      for (let k = 0; k < 7; k++) drawDetail(g, 1, cx + rng.r(-13, 13), cy + rng.r(-5, 6), rng.next(), rng.next());
      break;
    case 4:
      for (let k = 0; k < 9; k++) drawDetail(g, 0, cx + rng.r(-10, 10), cy + 4 + rng.r(-3, 3), rng.next(), 0.6 + rng.next() * 0.4);
      break;
    case 5: {
      g.fillStyle = 'rgba(40,30,20,0.4)';
      ellipse(g, cx, cy + 1, 15, 6.5);
      g.fill();
      const gr = g.createLinearGradient(cx - 12, cy - 4, cx + 12, cy + 5);
      gr.addColorStop(0, '#7fa8b4');
      gr.addColorStop(1, '#3c5a64');
      g.fillStyle = gr;
      ellipse(g, cx, cy, 13, 5.2);
      g.fill();
      g.fillStyle = 'rgba(240,250,255,0.6)';
      ellipse(g, cx - 5, cy - 1.5, 4, 1);
      g.fill();
      break;
    }
    case 6:
      for (let k = 0; k < 4; k++) {
        const x = cx + rng.r(-10, 10);
        const y = cy + rng.r(-2, 6);
        const r = rng.r(2.2, 3.6);
        shadow(g, x + 1, y + 1, r + 1, 2, 0.35);
        g.fillStyle = '#e8dcc0';
        g.fillRect(x - 0.8, y - r * 0.6, 1.6, r * 0.9);
        g.fillStyle = k % 2 ? '#b8452e' : '#c89a5a';
        g.beginPath();
        g.ellipse(x, y - r * 0.6, r, r * 0.6, 0, Math.PI, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = OUTLINE;
        g.lineWidth = 0.6;
        g.stroke();
        g.fillStyle = 'rgba(255,255,230,0.8)';
        g.fillRect(x - r * 0.4, y - r * 0.9, 1, 1);
      }
      break;
    case 7:
      g.strokeStyle = 'rgba(40,26,16,0.55)';
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        let x = cx + rng.r(-6, 6);
        let y = cy + rng.r(-3, 3);
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += rng.r(-5, 5);
          y += rng.r(-2, 2);
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    case 8:
      for (let k = 0; k < 10; k++) {
        g.save();
        g.translate(cx + rng.r(-13, 13), cy + rng.r(-5, 6));
        g.rotate(rng.r(0, TAU));
        g.fillStyle = k % 3 === 0 ? '#c0782e' : k % 3 === 1 ? '#a4502a' : '#d8a040';
        g.beginPath();
        g.ellipse(0, 0, 2.6, 1.2, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      break;
    default:
      rubble(g, rng, cx, cy + 2, 5, 11, 4, [138, 130, 118]);
      g.strokeStyle = '#5a3a20';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - 12, cy + 6);
      g.lineTo(cx + 2, cy + 3);
      g.lineTo(cx + 6, cy + 1);
      g.stroke();
      break;
  }
  return { canvas: c, anchorX: cx, anchorY: cy - 2 };
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export function buildTerrainArt(): TerrainArt {
  const gb = buildGround();
  const edge = buildEdges(gb);
  const waterFrames = buildWaterFrames();
  const [cliffLeft, cliffRight] = buildCliffs();
  const rampArt = buildRamps();
  const features: Record<FeatureArtKey, ArtSprite[]> = {
    forest: [0, 1, 2, 3].map(forest),
    rock: [0, 1, 2].map(rock),
    wall: [0, 1].map((v) => wall(v, false)),
    crate: [0, 1].map((v) => crate(v, false)),
    ruins: [0, 1, 2].map(ruins),
    gate: [0, 1].map((v) => gate(v, false)),
    bridge: [0, 1].map(bridge),
    torch: [torch()],
  };
  const damaged: Record<DamagedArtKey, ArtSprite> = {
    wall: wall(0, true),
    crate: crate(0, true),
    gate: gate(0, true),
  };
  const decals: ArtSprite[] = [];
  for (let v = 0; v < 10; v++) decals.push(decal(v));
  return { ground: gb.tiles, waterFrames, edge, cliffLeft, cliffRight, ramp: rampArt, features, damaged, decals };
}

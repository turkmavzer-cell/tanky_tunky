// Shared, engine-agnostic parts of the engine benchmark spike.
// Both engine implementations render exactly the same scene:
//   - 96x96 isometric map, 128x64 tiles, viewport-culled with a sprite pool
//   - ~12% of tiles carry a tall tree that is depth-sorted against moving objects
//   - 200 moving objects (bullets + particles), additive blend for half of them
//   - fog of war: 192x192 alpha mask, recomputed at 15 Hz on a CPU canvas,
//     uploaded as a texture and drawn through an isometric transform (bilinear blur)
//   - camera continuously orbiting over the map

export const MAP = 96;
export const TW = 128;
export const TH = 64;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const OBJECTS = 200;
export const FOG_RES = 2; // fog cells per tile edge
export const FOG_HZ = 15;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchMap {
  terrain: Uint8Array; // 0..5
  tree: Uint8Array; // 0/1
}

export function makeMap(seed = 1): BenchMap {
  const r = mulberry32(seed);
  const terrain = new Uint8Array(MAP * MAP);
  const tree = new Uint8Array(MAP * MAP);
  for (let i = 0; i < terrain.length; i++) {
    terrain[i] = Math.floor(r() * 6);
    tree[i] = r() < 0.12 ? 1 : 0;
  }
  return { terrain, tree };
}

export const isoX = (tx: number, ty: number): number => (tx - ty) * (TW / 2);
export const isoY = (tx: number, ty: number): number => (tx + ty) * (TH / 2);

/** Atlas: 6 tile diamonds (128x64) in row 0, a tree (96x128) and two small object sprites. */
export function makeAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  const cols = ['#5b8c3a', '#6e9c45', '#8a7a4a', '#c9b37a', '#3f6fa0', '#7a7a7a'];
  cols.forEach((col, i) => {
    const x = i * TW;
    g.beginPath();
    g.moveTo(x + TW / 2, 0);
    g.lineTo(x + TW, TH / 2);
    g.lineTo(x + TW / 2, TH);
    g.lineTo(x, TH / 2);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.stroke();
  });
  // tree at (0,64) 96x128
  g.fillStyle = '#4a3020';
  g.fillRect(42, 64 + 90, 12, 38);
  g.beginPath();
  g.arc(48, 64 + 60, 40, 0, Math.PI * 2);
  g.fillStyle = '#2d5a27';
  g.fill();
  // bullet at (96,64) 16x16, particle at (112,64) 16x16
  g.beginPath();
  g.arc(104, 72, 6, 0, Math.PI * 2);
  g.fillStyle = '#ffd36b';
  g.fill();
  const grd = g.createRadialGradient(120, 72, 0, 120, 72, 8);
  grd.addColorStop(0, 'rgba(255,160,60,1)');
  grd.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grd;
  g.fillRect(112, 64, 16, 16);
  return c;
}

export const FRAMES = {
  tile: (i: number) => ({ x: i * TW, y: 0, w: TW, h: TH }),
  tree: { x: 0, y: 64, w: 96, h: 128 },
  bullet: { x: 96, y: 64, w: 16, h: 16 },
  particle: { x: 112, y: 64, w: 16, h: 16 },
};

/** Fog mask canvas. Alpha 1 = darkness, 0 = visible. Includes memory (explored) state. */
export class FogMask {
  readonly size = MAP * FOG_RES;
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly explored: Uint8Array;
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.img = this.ctx.createImageData(this.size, this.size);
    this.explored = new Uint8Array(this.size * this.size);
  }
  /** Recompute visibility around (tileX, tileY) with a radius in tiles; simple occluder test. */
  update(map: BenchMap, cx: number, cy: number, radius: number): void {
    const s = this.size;
    const d = this.img.data;
    const r = radius * FOG_RES;
    const ex = this.explored;
    const pcx = cx * FOG_RES;
    const pcy = cy * FOG_RES;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const dx = x - pcx;
        const dy = y - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let a = 255;
        if (dist < r) {
          // cheap LOS stand-in: march 8 samples toward the center, stop on trees
          let blocked = false;
          for (let k = 1; k < 8 && !blocked; k++) {
            const sx = Math.floor((pcx + (dx * k) / 8) / FOG_RES);
            const sy = Math.floor((pcy + (dy * k) / 8) / FOG_RES);
            if (map.tree[sy * MAP + sx] && k < 7) blocked = true;
          }
          if (!blocked) {
            ex[i] = 1;
            a = Math.max(0, Math.min(255, ((dist - r * 0.7) / (r * 0.3)) * 255));
          }
        }
        if (a > 170 && ex[i]) a = 170;
        const o = i * 4;
        d[o] = 4;
        d[o + 1] = 6;
        d[o + 2] = 12;
        d[o + 3] = a;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

export interface Mover {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: 0 | 1;
}

export function makeMovers(seed = 7): Mover[] {
  const r = mulberry32(seed);
  const out: Mover[] = [];
  for (let i = 0; i < OBJECTS; i++) out.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: i % 2 === 0 ? 0 : 1 });
  out.forEach((m) => respawn(m, r, 48, 48));
  (out as unknown as { rng: () => number }).rng = r;
  return out;
}

export function respawn(m: Mover, r: () => number, cx: number, cy: number): void {
  m.x = cx + (r() - 0.5) * 16;
  m.y = cy + (r() - 0.5) * 16;
  const a = r() * Math.PI * 2;
  const sp = m.kind === 0 ? 8 + r() * 6 : 1 + r() * 2;
  m.vx = Math.cos(a) * sp;
  m.vy = Math.sin(a) * sp;
  m.life = 0.5 + r() * 1.5;
}

/** Camera center in tile coordinates for time t (seconds). */
export function cameraAt(t: number): { tx: number; ty: number } {
  return { tx: 48 + Math.cos(t * 0.25) * 30, ty: 48 + Math.sin(t * 0.25) * 30 };
}

/** Visible tile candidates for a camera centered at screen (sx, sy). Calls fn(tx, ty). */
export function forEachVisibleTile(sx: number, sy: number, fn: (tx: number, ty: number) => void): void {
  const left = sx - VIEW_W / 2 - TW;
  const right = sx + VIEW_W / 2 + TW;
  const top = sy - VIEW_H / 2 - 160;
  const bottom = sy + VIEW_H / 2 + TH;
  const toT = (x: number, y: number) => ({ tx: (x / (TW / 2) + y / (TH / 2)) / 2, ty: (y / (TH / 2) - x / (TW / 2)) / 2 });
  const a = toT(left, top), b = toT(right, top), c = toT(left, bottom), d = toT(right, bottom);
  const x0 = Math.max(0, Math.floor(Math.min(a.tx, b.tx, c.tx, d.tx)));
  const x1 = Math.min(MAP - 1, Math.ceil(Math.max(a.tx, b.tx, c.tx, d.tx)));
  const y0 = Math.max(0, Math.floor(Math.min(a.ty, b.ty, c.ty, d.ty)));
  const y1 = Math.min(MAP - 1, Math.ceil(Math.max(a.ty, b.ty, c.ty, d.ty)));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const px = isoX(tx, ty);
      const py = isoY(tx, ty);
      if (px + TW / 2 < left || px - TW / 2 > right || py + TH < top || py - 128 > bottom) continue;
      fn(tx, ty);
    }
  }
}

/** Frame-time recorder; exposes results on window.__bench for Playwright. */
export class Recorder {
  private deltas: number[] = [];
  private work: number[] = [];
  private last = 0;
  private start = performance.now();
  constructor(private readonly warmupMs = 3000, private readonly measureMs = 10000) {
    (window as unknown as { __bench: unknown }).__bench = { done: false };
  }
  frame(workMs: number): void {
    const now = performance.now();
    const el = now - this.start;
    if (el > this.warmupMs && this.last > 0) {
      this.deltas.push(now - this.last);
      this.work.push(workMs);
    }
    this.last = now;
    if (el > this.warmupMs + this.measureMs) this.finish();
  }
  private finished = false;
  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const pct = (arr: number[], p: number) => {
      const s = [...arr].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    const mean = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / arr.length;
    (window as unknown as { __bench: unknown }).__bench = {
      done: true,
      frames: this.deltas.length,
      fps: 1000 / mean(this.deltas),
      frameMean: mean(this.deltas),
      frameP50: pct(this.deltas, 50),
      frameP95: pct(this.deltas, 95),
      frameP99: pct(this.deltas, 99),
      workMean: mean(this.work),
      workP95: pct(this.work, 95),
    };
  }
}

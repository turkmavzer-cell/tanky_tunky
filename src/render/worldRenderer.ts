/**
 * Isometric world renderer (brief §7): culled, painter-ordered ground with elevation, cliff faces,
 * ramps, terrain-transition fringes, animated water, decals, and depth-sorted feature sprites.
 *
 * Layout is rebuilt only when the visible tile window or the map version changes; camera motion
 * is a container transform, so steady-state cost per frame is near zero.
 */
import { Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { DIR4, FLAG_RAMP, rampDir, type GameMap } from '../world/map';
import { cliffDrop, edgeKind, isTileOpen } from '../world/passability';
import { FEATURE, Feature, Ground } from '../world/terrain';
import { TILE_H, TILE_W, screenToWorld } from '../world/iso';
import { EDGE_PRIORITY, LEVEL_PX, buildTerrainArt, type ArtSprite, type TerrainArt } from './terrainArt';

/** DIR4 (+x,-x,+y,-y) → art edge/ramp direction (0 NE, 1 SE, 2 SW, 3 NW). */
const DIR4_TO_ART = [1, 3, 2, 0];
/** Neighbour offsets per art edge dir: NE (x, y-1), SE (x+1, y), SW (x, y+1), NW (x-1, y). */
const ART_NEIGHBOUR: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const FEATURE_KEY: Record<number, keyof TerrainArt['features'] | null> = {
  [Feature.None]: null,
  [Feature.Forest]: 'forest',
  [Feature.Rock]: 'rock',
  [Feature.Wall]: 'wall',
  [Feature.Crate]: 'crate',
  [Feature.Ruins]: 'ruins',
  [Feature.Gate]: 'gate',
  [Feature.Bridge]: 'bridge',
  [Feature.Building]: 'building',
  [Feature.Adobe]: 'adobe',
  [Feature.Car]: 'car',
  [Feature.Palm]: 'palm',
};

/** Elevation colour language (job 2): low ground cooler/darker, high ground lighter/warmer. */
const ELEV_TINT = [0xaab4c4, 0xe4ddd2, 0xffffff];
/** Screen-space corners (relative to the tile's top vertex) of each DIR4 edge: +x = SE, -x = NW, +y = SW, -y = NE. */
const EDGE_PTS: readonly [number, number, number, number][] = [
  [TILE_W / 2, TILE_H / 2, 0, TILE_H], // +x: right vertex → bottom vertex
  [-TILE_W / 2, TILE_H / 2, 0, 0], // -x: left vertex → top vertex
  [0, TILE_H, -TILE_W / 2, TILE_H / 2], // +y: bottom vertex → left vertex
  [0, 0, TILE_W / 2, TILE_H / 2], // -y: top vertex → right vertex
];

interface TexSprite {
  tex: Texture;
  ax: number;
  ay: number;
}

function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

class Pool {
  private items: Sprite[] = [];
  private n = 0;
  constructor(
    readonly container: Container,
    private readonly cull = false,
  ) {}
  begin(): void {
    this.n = 0;
  }
  next(tex: Texture, x: number, y: number, ax = 0, ay = 0): Sprite {
    let s = this.items[this.n];
    if (!s) {
      s = new Sprite(tex);
      // off-screen sprites are skipped by Pixi's CullerPlugin (registered in GameScene)
      s.cullable = this.cull;
      this.container.addChild(s);
      this.items.push(s);
    }
    this.n++;
    s.texture = tex;
    s.anchor.set(ax, ay);
    s.position.set(x, y);
    s.visible = true;
    s.alpha = 1;
    s.zIndex = 0;
    return s;
  }
  get used(): number {
    return this.n;
  }
  end(): void {
    for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false;
  }
}

export class WorldRenderer {
  /**
   * Displayed ground: one baked RenderTexture sprite (static tiles, fringes, cliffs, ramps, decals,
   * edge lines) + a live layer for animated water. Baking happens only on relayout, so the
   * per-frame cost of the ground is a single sprite instead of ~800 (perf gate, D-026).
   */
  readonly ground = new Container();
  /** Off-screen root that is baked into `baked`; rendered directly when no renderer is attached. */
  private readonly bakeRoot = new Container();
  private readonly bakeTiles = new Container();
  private readonly waterLive = new Container();
  private readonly baked = new Sprite();
  private rt: RenderTexture | null = null;
  private renderer: Renderer | null = null;
  /** Texture resolution of the baked ground (≤ device resolution × camera zoom). */
  bakeResolution = 1;
  /** Cliff lips, base shadows and (strong mode) striped hazard edges — baked with the ground. */
  readonly edges = new Graphics();
  /** Transient highlight of an impassable edge the player bumped into. */
  readonly bumpLayer = new Graphics();
  /** 'normal' | 'strong' (settings → "Engel vurgusu"). */
  edgeMode: 'normal' | 'strong' = 'normal';
  /** Active bump highlights (public for tests). */
  readonly bumps: { x: number; y: number; dir: number; t: number }[] = [];
  /** Depth-sorted layer: features + dynamic objects (tanks, shells…) — add those with zIndex = x + y. */
  readonly objects = new Container();
  private readonly groundPool: Pool;
  private readonly waterPool: Pool;
  private readonly objectPool: Pool;
  private readonly art: TerrainArt;
  private readonly groundTex: Texture[][];
  private readonly waterTex: Texture[][];
  private readonly edgeTex: Texture[][];
  private readonly cliffL: Texture[];
  private readonly cliffR: Texture[];
  private readonly rampTex: Texture[];
  private readonly featureTex: Record<string, TexSprite[]>;
  private readonly damagedTex: Record<string, TexSprite>;
  private readonly decalTex: TexSprite[];
  private readonly waterSprites: { s: Sprite; kind: number }[] = [];
  private waterFrame = 0;
  private waterClock = 0;
  private lastVersion = -1;
  private lastCx = 0;
  private lastCy = 0;
  private lastW = 0;
  /** Sprites placed by the last layout (perf diagnostics). */
  spriteCount = 0;
  private readonly lightSet = new Set<number>();

  constructor(private readonly map: GameMap) {
    this.art = buildTerrainArt();
    const T = (c: HTMLCanvasElement): Texture => Texture.from(c);
    const TS = (a: ArtSprite): TexSprite => ({ tex: T(a.canvas), ax: a.anchorX / a.canvas.width, ay: a.anchorY / a.canvas.height });
    this.groundTex = this.art.ground.map((vs) => vs.map(T));
    this.waterTex = this.art.waterFrames.map((fs) => fs.map(T));
    this.edgeTex = this.art.edge.map((ds) => ds.map(T));
    this.cliffL = this.art.cliffLeft.map(T);
    this.cliffR = this.art.cliffRight.map(T);
    this.rampTex = this.art.ramp.map(T);
    this.featureTex = Object.fromEntries(Object.entries(this.art.features).map(([k, v]) => [k, v.map(TS)]));
    this.damagedTex = Object.fromEntries(Object.entries(this.art.damaged).map(([k, v]) => [k, TS(v)]));
    this.decalTex = this.art.decals.map(TS);
    this.bakeRoot.addChild(this.bakeTiles, this.edges);
    this.ground.addChild(this.baked, this.waterLive);
    this.groundPool = new Pool(this.bakeTiles);
    this.waterPool = new Pool(this.waterLive);
    this.objectPool = new Pool(this.objects, true);
    this.objects.sortableChildren = true;
    for (const l of map.lights) this.lightSet.add(l.y * map.width + l.x);
  }

  /** Screen-space height offset (px, positive = up) of world point (x, y), following ramps smoothly. */
  heightPx(x: number, y: number): number {
    const m = this.map;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return 0;
    const i = ty * m.width + tx;
    const e = m.elev[i];
    if (!(m.flags[i] & FLAG_RAMP)) return e * LEVEL_PX;
    // ramp: descends one level toward its direction; 0 at the far (high) edge → 1 at the low edge
    const [dx, dy] = DIR4[rampDir(m, i)];
    const fx = x - tx;
    const fy = y - ty;
    const t = dx > 0 ? fx : dx < 0 ? 1 - fx : dy > 0 ? fy : 1 - fy;
    return (e - Math.min(1, Math.max(0, t))) * LEVEL_PX;
  }

  /** Call every frame with the camera's visible world-screen rectangle (zoom-1 px) and frame dt. */
  update(viewLeft: number, viewTop: number, viewRight: number, viewBottom: number, dtSec: number): void {
    // water animation (cheap: only texture swaps)
    this.waterClock += dtSec;
    if (this.waterClock > 0.22) {
      this.waterClock = 0;
      this.waterFrame = (this.waterFrame + 1) % 4;
      for (const w of this.waterSprites) w.s.texture = this.waterTex[w.kind][this.waterFrame];
    }
    const MARGIN = 300; // ground is baked, so a wide margin is cheap and relayouts are rare (D-026)
    const pad = 1;
    const a = screenToWorld(viewLeft - MARGIN, viewTop - MARGIN);
    const b = screenToWorld(viewRight + MARGIN, viewTop - MARGIN);
    const c = screenToWorld(viewLeft - MARGIN, viewBottom + MARGIN + LEVEL_PX * 3);
    const d = screenToWorld(viewRight + MARGIN, viewBottom + MARGIN + LEVEL_PX * 3);
    const m = this.map;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x, d.x)) - pad);
    const x1 = Math.min(m.width - 1, Math.ceil(Math.max(a.x, b.x, c.x, d.x)) + pad);
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y, d.y)) - pad);
    const y1 = Math.min(m.height - 1, Math.ceil(Math.max(a.y, b.y, c.y, d.y)) + pad);
    // Relayout only when the camera has moved more than half a margin since the last layout.
    // The laid-out area is the view plus MARGIN px on each side (kept small: every extra sprite costs batching time).
    const cx = (viewLeft + viewRight) / 2;
    const cy = (viewTop + viewBottom) / 2;
    if (m.version === this.lastVersion && Math.abs(cx - this.lastCx) < MARGIN / 2 && Math.abs(cy - this.lastCy) < MARGIN / 2 && viewRight - viewLeft <= this.lastW) return;
    this.lastVersion = m.version;
    this.lastCx = cx;
    this.lastCy = cy;
    this.lastW = viewRight - viewLeft;
    this.layout(x0, x1, y0, y1, viewLeft - MARGIN, viewRight + MARGIN, viewTop - MARGIN, viewBottom + MARGIN);
    this.spriteCount = this.groundPool.used + this.objectPool.used;
  }

  /** Attach the renderer to enable ground baking (without it the ground is drawn live). */
  attach(renderer: Renderer): void {
    this.renderer = renderer;
  }

  private bake(l: number, r: number, t: number, btm: number): void {
    if (!this.renderer) {
      if (this.bakeRoot.parent !== this.ground) this.ground.addChildAt(this.bakeRoot, 0);
      return;
    }
    const L = Math.floor(l - TILE_W);
    const T = Math.floor(t - TILE_H * 2 - LEVEL_PX * 2);
    const w = Math.ceil(r - l + TILE_W * 2);
    const h = Math.ceil(btm - t + TILE_H * 4 + LEVEL_PX * 4);
    // quantised so small zoom changes (charge zoom-out) do not recreate the texture
    const res = Math.max(0.25, Math.min(2, Math.round(this.bakeResolution * 4) / 4));
    if (!this.rt || this.rt.width < w || this.rt.height < h || Math.abs(this.rt.source.resolution - res) > 0.05) {
      this.rt?.destroy(true);
      this.rt = RenderTexture.create({ width: w, height: h, resolution: res });
    }
    this.renderer.render({ container: this.bakeRoot, target: this.rt, clear: true, transform: new Matrix(1, 0, 0, 1, -L, -T) });
    this.baked.texture = this.rt;
    this.baked.position.set(L, T);
  }

  /** Forces a relayout next frame (after terrain destruction etc.). */
  invalidate(): void {
    this.lastVersion = -1;
  }

  private layout(x0: number, x1: number, y0: number, y1: number, l: number, r: number, t: number, btm: number): void {
    const m = this.map;
    const W = m.width;
    const gp = this.groundPool;
    const op = this.objectPool;
    gp.begin();
    op.begin();
    this.waterPool.begin();
    this.waterSprites.length = 0;
    const seed = m.seed;
    // painter order: diagonals of increasing x + y
    for (let s = x0 + y0; s <= x1 + y1; s++) {
      const xa = Math.max(x0, s - y1);
      const xb = Math.min(x1, s - y0);
      for (let x = xa; x <= xb; x++) {
        const y = s - x;
        const sx = (x - y) * (TILE_W / 2);
        if (sx < l || sx > r) continue;
        const i = y * W + x;
        const e = m.elev[i];
        const top = (x + y) * (TILE_H / 2) - e * LEVEL_PX;
        if (top > btm || top + TILE_H + 3 * LEVEL_PX < t) continue;
        const g = m.ground[i];
        const h = hash(x, y, seed);
        const isRamp = (m.flags[i] & FLAG_RAMP) !== 0;
        // ground diamond
        const gv = this.groundTex[g];
        // flat themed maps (desert/city) keep true colours; the forest map tints by elevation (job 2)
        gp.next(gv[h % gv.length], sx, top, 0.5, 0).tint = m.theme === 'forest' ? ELEV_TINT[Math.min(e, ELEV_TINT.length - 1)] : 0xffffff;
        if (g === Ground.Shallow || g === Ground.Deep) {
          const ws = this.waterPool.next(this.waterTex[g === Ground.Shallow ? 0 : 1][this.waterFrame], sx, top, 0.5, 0);
          this.waterSprites.push({ s: ws, kind: g === Ground.Shallow ? 0 : 1 });
        }
        // transition fringes from higher-priority neighbours at the same elevation
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + ART_NEIGHBOUR[dir][0];
          const ny = y + ART_NEIGHBOUR[dir][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= m.height) continue;
          const j = ny * W + nx;
          if (m.elev[j] !== e) continue;
          const ng = m.ground[j];
          if (ng !== g && EDGE_PRIORITY[ng] > EDGE_PRIORITY[g]) gp.next(this.edgeTex[ng][dir], sx, top, 0.5, 0);
        }
        // decals on plain land
        if (m.feature[i] === Feature.None && !isRamp && g !== Ground.Deep && g !== Ground.Shallow && g !== Ground.Asphalt && g !== Ground.Pavement && h % 7 === 0) {
          const dcl = this.decalTex[(h >>> 8) % this.decalTex.length];
          const ox = (((h >>> 4) & 31) - 16) * 1.2;
          const oy = (((h >>> 12) & 15) - 8) * 1.2;
          gp.next(dcl.tex, sx + ox, top + TILE_H / 2 + oy, dcl.ax, dcl.ay);
        }
        // cliff faces under the two front edges (SW = left face toward +y, SE = right face toward +x)
        // Driven by passability.edgeKind: a ramp connection never gets a rock face (job 2).
        const dropSW = cliffDrop(m, x, y, 2);
        const dropSE = cliffDrop(m, x, y, 0);
        for (let k = 0; k < dropSW; k++) gp.next(this.cliffL[(h >>> (k + 3)) % this.cliffL.length], sx - TILE_W / 2, top + TILE_H / 2 + k * LEVEL_PX, 0, 0);
        for (let k = 0; k < dropSE; k++) gp.next(this.cliffR[(h >>> (k + 5)) % this.cliffR.length], sx, top + TILE_H / 2 + k * LEVEL_PX, 0, 0);
        if (isRamp) gp.next(this.rampTex[DIR4_TO_ART[rampDir(m, i)]], sx, top, 0.5, 0);
        this.edgeLines(x, y, sx, top);
        // features
        const f = m.feature[i];
        const key = FEATURE_KEY[f];
        const cy = top + TILE_H / 2;
        if (key === 'bridge') {
          const v = this.featureTex.bridge[this.alongY(x, y, (j) => m.feature[j] === Feature.Bridge || m.ground[j] !== Ground.Deep) ? 1 : 0];
          gp.next(v.tex, sx, cy, v.ax, v.ay);
        } else if (key) {
          const def = this.featureTex[key];
          const damaged = (key === 'wall' || key === 'crate' || key === 'gate' || key === 'adobe' || key === 'car') && m.hp[i] > 0 && this.isDamaged(i, f);
          const v = damaged
            ? this.damagedTex[key]
            : key === 'gate'
              ? def[this.alongY(x, y, (j) => m.feature[j] === Feature.Wall || m.feature[j] === Feature.Gate || m.feature[j] === Feature.Ruins) ? 1 : 0]
              : def[h % def.length];
          const sp = op.next(v.tex, sx, cy, v.ax, v.ay);
          sp.zIndex = x + y + 1;
        }
        if (this.lightSet.has(i) && f === Feature.None) {
          const v = this.featureTex[m.theme === 'city' ? 'lamp' : 'torch'][0];
          const sp = op.next(v.tex, sx + 26, cy + 6, v.ax, v.ay);
          sp.zIndex = x + y + 1;
        }
      }
    }
    gp.end();
    op.end();
    this.waterPool.end();
    this.finishEdges();
    this.bake(l, r, t, btm);
  }

  private edgeCmds: { kind: 'lip' | 'hazard' | 'shadow'; x0: number; y0: number; x1: number; y1: number; dx?: number; dy?: number }[] = [];

  /** Collects edge decorations for tile (x, y) from the single passability rule. */
  private edgeLines(x: number, y: number, sx: number, top: number): void {
    const m = this.map;
    const open = isTileOpen(m, x, y);
    for (let d = 0; d < 4; d++) {
      const k = edgeKind(m, x, y, d);
      const [ax, ay, bx, by] = EDGE_PTS[d];
      if (k === 'cliffDown') {
        // light lip along the top edge of a drop
        this.edgeCmds.push({ kind: 'lip', x0: sx + ax, y0: top + ay, x1: sx + bx, y1: top + by });
        if (this.edgeMode === 'strong') this.edgeCmds.push({ kind: 'hazard', x0: sx + ax, y0: top + ay, x1: sx + bx, y1: top + by });
      } else if (k === 'cliffUp' && (d === 1 || d === 3)) {
        // dark contact shadow on low ground at the foot of a cliff that rises behind it
        this.edgeCmds.push({ kind: 'shadow', x0: sx + ax, y0: top + ay, x1: sx + bx, y1: top + by, dx: d === 1 ? 10 : -10, dy: 6 });
      } else if (k === 'blocked' && this.edgeMode === 'strong' && open) {
        this.edgeCmds.push({ kind: 'hazard', x0: sx + ax, y0: top + ay, x1: sx + bx, y1: top + by });
      }
    }
  }

  private finishEdges(): void {
    const g = this.edges;
    g.clear();
    for (const c of this.edgeCmds) {
      if (c.kind === 'shadow') {
        g.poly([c.x0, c.y0, c.x1, c.y1, c.x1 + (c.dx ?? 0), c.y1 + (c.dy ?? 0), c.x0 + (c.dx ?? 0), c.y0 + (c.dy ?? 0)]).fill({ color: 0x000000, alpha: 0.28 });
      }
    }
    for (const c of this.edgeCmds) {
      if (c.kind === 'lip') g.moveTo(c.x0, c.y0).lineTo(c.x1, c.y1).stroke({ width: 3, color: 0xfff1c8, alpha: 0.75 });
    }
    for (const c of this.edgeCmds) {
      if (c.kind !== 'hazard') continue;
      // striped yellow/black hazard dashes
      const n = 6;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        g.moveTo(c.x0 + (c.x1 - c.x0) * t0, c.y0 + (c.y1 - c.y0) * t0)
          .lineTo(c.x0 + (c.x1 - c.x0) * t1, c.y0 + (c.y1 - c.y0) * t1)
          .stroke({ width: 4, color: k % 2 ? 0x1a1a1a : 0xffc400, alpha: 0.95 });
      }
    }
    this.edgeCmds.length = 0;
  }

  /** Flash an impassable edge the local tank pushed against (0.3 s, orange). */
  bump(x: number, y: number, dir: number): void {
    this.bumps.push({ x, y, dir, t: 0.3 });
    this.bumpCount++;
  }

  /** Total bump highlights shown (diagnostics/tests). */
  bumpCount = 0;

  /** Per-frame transient overlays (bump highlights). */
  updateOverlays(dt: number): void {
    const g = this.bumpLayer;
    g.clear();
    const m = this.map;
    // cap the fade step so the flash stays visible for several frames even at very low FPS
    const step = Math.min(dt, 0.1);
    for (let i = this.bumps.length - 1; i >= 0; i--) {
      const b = this.bumps[i];
      b.t -= step;
      if (b.t <= 0) {
        this.bumps.splice(i, 1);
        continue;
      }
      const e = m.elev[b.y * m.width + b.x];
      const sx = (b.x - b.y) * (TILE_W / 2);
      const top = (b.x + b.y) * (TILE_H / 2) - e * LEVEL_PX;
      const [ax, ay, bx, by] = EDGE_PTS[b.dir];
      const a = b.t / 0.3;
      g.moveTo(sx + ax, top + ay).lineTo(sx + bx, top + by).stroke({ width: 16, color: 0xff6a20, alpha: 0.45 * a });
      g.moveTo(sx + ax, top + ay).lineTo(sx + bx, top + by).stroke({ width: 6, color: 0xffc070, alpha: 1 * a });
    }
  }

  /** Orientation of linear structures (gate/bridge): true if `connects` holds along y but not along x. Art variant 0 runs along x, 1 along y. */
  private alongY(x: number, y: number, connects: (i: number) => boolean): boolean {
    const m = this.map;
    const at = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < m.width && yy < m.height && connects(yy * m.width + xx);
    const ax = (at(x - 1, y) ? 1 : 0) + (at(x + 1, y) ? 1 : 0);
    const ay = (at(x, y - 1) ? 1 : 0) + (at(x, y + 1) ? 1 : 0);
    return ay > ax;
  }

  private isDamaged(i: number, f: number): boolean {
    return this.map.hp[i] < FEATURE[f].hp * 0.5;
  }
}

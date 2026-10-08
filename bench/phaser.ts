import Phaser from 'phaser';
import {
  FRAMES, FOG_HZ, FogMask, MAP, Recorder, TH, TW, VIEW_H, VIEW_W, cameraAt, forEachVisibleTile,
  isoX, isoY, makeAtlas, makeMap, makeMovers, respawn,
} from './common';

class BenchScene extends Phaser.Scene {
  private map = makeMap();
  
  private groundPool: Phaser.GameObjects.Image[] = [];
  private treePool: Phaser.GameObjects.Image[] = [];
  private movers = makeMovers();
  private moverImgs: Phaser.GameObjects.Image[] = [];
  private fog = new FogMask();
  private fogTex!: Phaser.Textures.CanvasTexture;
  private fogAcc = 1;
  private t0 = 0;

  create(): void {
    const atlas = this.textures.addCanvas('atlas', makeAtlas())!;
    for (let i = 0; i < 6; i++) {
      const f = FRAMES.tile(i);
      atlas.add(`tile${i}`, 0, f.x, f.y, f.w, f.h);
    }
    for (const k of ['tree', 'bullet', 'particle'] as const) {
      const f = FRAMES[k];
      atlas.add(k, 0, f.x, f.y, f.w, f.h);
    }
    for (const m of this.movers) {
      const img = new Phaser.GameObjects.Image(this, 0, 0, 'atlas', m.kind === 0 ? 'bullet' : 'particle');
      if (m.kind === 1) img.setBlendMode(Phaser.BlendModes.ADD);
      this.add.existing(img);
      this.moverImgs.push(img);
    }
    this.fogTex = this.textures.addCanvas('fog', this.fog.canvas)!;
    const fogImg = new Phaser.GameObjects.Image(this, 0, 0, 'fog').setOrigin(0, 0);
    fogImg.setDisplaySize((MAP * TW) / Math.SQRT2, (MAP * TW) / Math.SQRT2);
    const inner = this.add.container(0, 0, [fogImg]).setRotation(Math.PI / 4);
    const outer = this.add.container(0, -TH / 2, [inner]).setScale(1, 0.5).setDepth(1e6);
    void outer;
    this.t0 = performance.now();
  }

  private pooled(pool: Phaser.GameObjects.Image[], i: number, depthBase: number, frame: string, ox: number, oy: number): Phaser.GameObjects.Image {
    let s = pool[i];
    if (!s) {
      s = new Phaser.GameObjects.Image(this, 0, 0, 'atlas', frame).setOrigin(ox, oy);
      this.add.existing(s);
      s.setDepth(depthBase);
      pool.push(s);
    }
    s.setVisible(true);
    return s;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    const t = (performance.now() - this.t0) / 1000;
    const cam = cameraAt(t);
    const sx = isoX(cam.tx, cam.ty);
    const sy = isoY(cam.tx, cam.ty);
    this.cameras.main.setZoom(RES).centerOn(Math.round(sx), Math.round(sy));

    let gi = 0, ti = 0;
    const map = this.map;
    forEachVisibleTile(sx, sy, (tx, ty) => {
      const idx = ty * MAP + tx;
      const g = this.pooled(this.groundPool, gi++, -1, 'tile0', 0.5, 0);
      g.setFrame(`tile${map.terrain[idx]}`, false, false);
      g.setPosition(isoX(tx, ty), isoY(tx, ty) - TH / 2);
      if (map.tree[idx]) {
        const tr = this.pooled(this.treePool, ti++, 0, 'tree', 0.5, 1);
        tr.setPosition(isoX(tx, ty), isoY(tx, ty));
        tr.setDepth(tx + ty);
      }
    });
    for (let i = gi; i < this.groundPool.length; i++) this.groundPool[i].setVisible(false);
    for (let i = ti; i < this.treePool.length; i++) this.treePool[i].setVisible(false);

    const rng = (this.movers as unknown as { rng: () => number }).rng;
    for (let i = 0; i < this.movers.length; i++) {
      const m = this.movers[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (m.life <= 0 || m.x < 0 || m.y < 0 || m.x >= MAP || m.y >= MAP) respawn(m, rng, cam.tx, cam.ty);
      this.moverImgs[i].setPosition(isoX(m.x, m.y), isoY(m.x, m.y) - 12).setDepth(m.x + m.y);
    }

    this.fogAcc += dt;
    if (this.fogAcc >= 1 / FOG_HZ) {
      this.fogAcc = 0;
      this.fog.update(map, cam.tx, cam.ty, 9);
      this.fogTex.refresh();
    }
  }
}

// ?res=0.25 renders the same world view into a smaller backbuffer (GPU fill-rate probe)
const RES = Number(new URLSearchParams(location.search).get('res') ?? 1);
const rec = new Recorder();
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  width: VIEW_W * RES,
  height: VIEW_H * RES,
  backgroundColor: '#000000',
  scene: BenchScene,
  antialias: true,
  banner: false,
  fps: { target: 60 },
});
let stepStart = 0;
game.events.on('prestep', () => { stepStart = performance.now(); });
game.events.on('postrender', () => { rec.frame(performance.now() - stepStart); });

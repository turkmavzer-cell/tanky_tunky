import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  FRAMES, FOG_HZ, FogMask, MAP, Recorder, TH, TW, VIEW_H, VIEW_W, cameraAt, forEachVisibleTile,
  isoX, isoY, makeAtlas, makeMap, makeMovers, respawn,
} from './common';

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ width: VIEW_W, height: VIEW_H, background: '#000', antialias: false, autoStart: false, preference: 'webgl', resolution: Number(new URLSearchParams(location.search).get('res') ?? 1) });
  document.body.appendChild(app.canvas);

  const atlas = Texture.from(makeAtlas());
  const sub = (f: { x: number; y: number; w: number; h: number }) =>
    new Texture({ source: atlas.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
  const tileTex = [0, 1, 2, 3, 4, 5].map((i) => sub(FRAMES.tile(i)));
  const treeTex = sub(FRAMES.tree);
  const bulletTex = sub(FRAMES.bullet);
  const partTex = sub(FRAMES.particle);

  const map = makeMap();
  const world = new Container();
  const ground = new Container();
  const objects = new Container();
  objects.sortableChildren = true;
  world.addChild(ground, objects);
  app.stage.addChild(world);

  const groundPool: Sprite[] = [];
  const treePool: Sprite[] = [];
  const getPooled = (pool: Sprite[], i: number, parent: Container, tex: Texture, ax: number, ay: number): Sprite => {
    let s = pool[i];
    if (!s) {
      s = new Sprite(tex);
      s.anchor.set(ax, ay);
      parent.addChild(s);
      pool.push(s);
    }
    s.visible = true;
    return s;
  };

  const movers = makeMovers();
  const rng = (movers as unknown as { rng: () => number }).rng;
  const moverSprites = movers.map((m) => {
    const s = new Sprite(m.kind === 0 ? bulletTex : partTex);
    s.anchor.set(0.5);
    if (m.kind === 1) s.blendMode = 'add';
    objects.addChild(s);
    return s;
  });

  // Fog: square mask -> rotate 45deg -> squash Y by 0.5 = isometric diamond.
  const fog = new FogMask();
  const fogTex = Texture.from(fog.canvas);
  fogTex.source.scaleMode = 'linear';
  const fogOuter = new Container();
  const fogInner = new Container();
  const fogSprite = new Sprite(fogTex);
  fogInner.addChild(fogSprite);
  fogInner.rotation = Math.PI / 4;
  fogOuter.addChild(fogInner);
  fogOuter.scale.set(1, 0.5);
  // Rotated square side s: width becomes s*sqrt2. Map diamond width = MAP*TW -> s = MAP*TW/sqrt2.
  fogSprite.width = fogSprite.height = (MAP * TW) / Math.SQRT2;
  fogOuter.position.set(0, -TH / 2);
  world.addChild(fogOuter);

  const rec = new Recorder();
  let fogAcc = 1;
  let last = performance.now();
  const t0 = last;
  const loop = (): void => {
    const start = performance.now();
    const dt = Math.min(0.05, (start - last) / 1000);
    last = start;
    const t = (start - t0) / 1000;
    const cam = cameraAt(t);
    const sx = isoX(cam.tx, cam.ty);
    const sy = isoY(cam.tx, cam.ty);
    world.position.set(Math.round(VIEW_W / 2 - sx), Math.round(VIEW_H / 2 - sy));

    let gi = 0, ti = 0;
    forEachVisibleTile(sx, sy, (tx, ty) => {
      const idx = ty * MAP + tx;
      const g = getPooled(groundPool, gi++, ground, tileTex[0], 0.5, 0);
      g.texture = tileTex[map.terrain[idx]];
      g.position.set(isoX(tx, ty), isoY(tx, ty) - TH / 2);
      if (map.tree[idx]) {
        const tr = getPooled(treePool, ti++, objects, treeTex, 0.5, 1);
        tr.position.set(isoX(tx, ty), isoY(tx, ty));
        tr.zIndex = tx + ty;
      }
    });
    for (let i = gi; i < groundPool.length; i++) groundPool[i].visible = false;
    for (let i = ti; i < treePool.length; i++) treePool[i].visible = false;

    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (m.life <= 0 || m.x < 0 || m.y < 0 || m.x >= MAP || m.y >= MAP) respawn(m, rng, cam.tx, cam.ty);
      const s = moverSprites[i];
      s.position.set(isoX(m.x, m.y), isoY(m.x, m.y) - 12);
      s.zIndex = m.x + m.y;
    }

    fogAcc += dt;
    if (fogAcc >= 1 / FOG_HZ) {
      fogAcc = 0;
      fog.update(map, cam.tx, cam.ty, 9);
      fogTex.source.update();
    }
    app.render();
    rec.frame(performance.now() - start);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void main();

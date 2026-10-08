import { Container, Sprite, type Texture } from 'pixi.js';
import { TILE_H, TILE_W, screenToWorld } from '../world/iso';

/**
 * Viewport-culled isometric ground layer. Only tiles intersecting the view get a pooled sprite,
 * so cost is independent of map size (validated by the engine benchmark: 96x96 map).
 */
export class GroundLayer {
  readonly container = new Container();
  private readonly pool: Sprite[] = [];

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly textureAt: (tx: number, ty: number) => Texture | null,
  ) {}

  /** `viewLeft..viewBottom` are screen-space pixel bounds at zoom 1. */
  update(viewLeft: number, viewTop: number, viewRight: number, viewBottom: number): void {
    const left = viewLeft - TILE_W;
    const right = viewRight + TILE_W;
    const top = viewTop - TILE_H;
    const bottom = viewBottom + TILE_H * 2;
    const a = screenToWorld(left, top);
    const b = screenToWorld(right, top);
    const c = screenToWorld(left, bottom);
    const d = screenToWorld(right, bottom);
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x, d.x)));
    const x1 = Math.min(this.width - 1, Math.ceil(Math.max(a.x, b.x, c.x, d.x)));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y, d.y)));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(a.y, b.y, c.y, d.y)));
    let n = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        // tile diamond: top corner at screen ((tx-ty)*W/2, (tx+ty)*H/2)
        const sx = (tx - ty) * (TILE_W / 2);
        const sy = (tx + ty) * (TILE_H / 2);
        if (sx + TILE_W / 2 < left || sx - TILE_W / 2 > right || sy + TILE_H < top || sy > bottom) continue;
        const tex = this.textureAt(tx, ty);
        if (!tex) continue;
        let s = this.pool[n];
        if (!s) {
          s = new Sprite(tex);
          s.anchor.set(0.5, 0);
          this.container.addChild(s);
          this.pool.push(s);
        }
        s.texture = tex;
        s.visible = true;
        s.position.set(sx, sy);
        n++;
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}

/**
 * Fog of war overlay (brief §5). One texel per tile from the local team's VisibilitySystem data:
 * visible = clear, explored = dark "memory", never seen = almost black. The texture is drawn
 * through the isometric transform (rotate 45°, squash Y) and bilinear filtering softens edges.
 * Updated only when the vision changes (15 Hz).
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { VISION } from '../sim/config';
import type { TeamVision } from '../sim/state';
import { TILE_H, TILE_W } from '../world/iso';

export class FogLayer {
  readonly container = new Container();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly tex: Texture;
  private lastTick = -1;
  highContrast = false;

  constructor(private readonly w: number, private readonly h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(w, h);
    this.tex = Texture.from(this.canvas);
    this.tex.source.scaleMode = 'linear';
    const sprite = new Sprite(this.tex);
    // square map → rotated diamond: side length so that one texel spans one tile diagonal
    sprite.width = (w * TILE_W) / Math.SQRT2;
    sprite.height = (h * TILE_W) / Math.SQRT2;
    const inner = new Container();
    inner.rotation = Math.PI / 4;
    inner.addChild(sprite);
    this.container.addChild(inner);
    this.container.scale.set(1, TILE_H / (TILE_W / 2) / 2);
  }

  update(v: TeamVision, tick: number): void {
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    const d = this.img.data;
    const mem = Math.round(VISION.memoryAlpha * 255);
    const unseen = Math.round(VISION.unexploredAlpha * 255);
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      d[o] = 6;
      d[o + 1] = 9;
      d[o + 2] = 18;
      d[o + 3] = v.visible[i] ? 0 : v.explored[i] ? mem : unseen;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.source.update();
  }
}

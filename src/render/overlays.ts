/**
 * World-space gameplay overlays drawn with one Graphics per layer:
 *  - lock-on reticle under the auto-target (job 1)
 *  - barrage landing warnings (red circles, visible to everyone, also through fog) (job 5)
 *  - mines: own team clearly (orange), enemy mines only as a faint glimmer up close (job 5)
 *  - rumble shockwave rings (job 5)
 * Positions are world tile coords projected with the iso helpers; `lift` gives elevation in px.
 */
import { Graphics } from 'pixi.js';
import { worldToScreenX, worldToScreenY } from '../world/iso';

const ISO_Y = 0.5;

export class Overlays {
  /** Under objects: reticle, warnings, mines. */
  readonly ground = new Graphics();
  /** Above objects: shock rings. */
  readonly air = new Graphics();
  private rings: { x: number; y: number; lift: number; r: number; t: number; max: number }[] = [];
  private time = 0;

  constructor(private readonly lift: (x: number, y: number) => number) {}

  begin(dt: number): void {
    this.time += dt;
    this.ground.clear();
    this.air.clear();
  }

  private px(x: number, y: number): [number, number] {
    return [worldToScreenX(x, y), worldToScreenY(x, y) - this.lift(x, y)];
  }

  /** Ellipse of world radius r (tiles) centred at world (x, y). */
  private ellipse(g: Graphics, x: number, y: number, r: number): Graphics {
    const [sx, sy] = this.px(x, y);
    const rx = r * 90.5; // one world tile along an axis ≈ TILE_W / sqrt2 px
    return g.ellipse(sx, sy, rx, rx * ISO_Y);
  }

  reticle(x: number, y: number): void {
    const [sx, sy] = this.px(x, y);
    const pulse = 1 + 0.08 * Math.sin(this.time * 8);
    // drawn ABOVE tanks so the lock is always readable
    const g = this.air;
    g.ellipse(sx, sy - 8, 44 * pulse, 22 * pulse).stroke({ width: 5, color: 0x000000, alpha: 0.35 });
    g.ellipse(sx, sy - 8, 44 * pulse, 22 * pulse).stroke({ width: 3, color: 0xff4a3a, alpha: 0.95 });
    // four ticks
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + this.time * 1.5;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.moveTo(sx + c * 34, sy - 8 + s * 17).lineTo(sx + c * 56, sy - 8 + s * 28).stroke({ width: 4, color: 0xff4a3a, alpha: 0.95 });
    }
  }

  warning(x: number, y: number, r: number, progress: number): void {
    const g = this.ground;
    this.ellipse(g, x, y, r).fill({ color: 0xff2a1a, alpha: 0.12 + 0.18 * progress });
    this.ellipse(g, x, y, r).stroke({ width: 3, color: 0xff3a2a, alpha: 0.9 });
    this.ellipse(g, x, y, r * (1 - progress)).stroke({ width: 2, color: 0xffd0c0, alpha: 0.8 });
  }

  mine(x: number, y: number, own: boolean, armed: boolean, glimmer = 1): void {
    const [sx, sy] = this.px(x, y);
    const g = this.ground;
    if (own) {
      g.ellipse(sx, sy, 13, 7).fill({ color: 0x2a2018, alpha: 0.9 });
      g.ellipse(sx, sy - 2, 10, 5).fill({ color: armed ? 0xff8a1a : 0x9a6a3a, alpha: 1 });
      if (armed && Math.sin(this.time * 6) > 0) g.circle(sx, sy - 4, 2.5).fill({ color: 0xfff0a0 });
    } else {
      // enemy: faint glimmer only
      const a = (0.25 + 0.25 * Math.sin(this.time * 5)) * glimmer;
      g.ellipse(sx, sy - 2, 9, 4.5).fill({ color: 0xfff6d0, alpha: a });
    }
  }

  /** Crate upgrade on the ground: bobbing green box with a gold up-chevron (round 03). */
  pickup(x: number, y: number): void {
    const [sx, sy] = this.px(x, y);
    const g = this.ground;
    const bob = Math.sin(this.time * 4 + x * 3) * 4;
    g.ellipse(sx, sy + 2, 18, 9).fill({ color: 0x000000, alpha: 0.25 });
    g.ellipse(sx, sy, 22 + Math.sin(this.time * 6) * 3, 11).stroke({ width: 2, color: 0x9dff8a, alpha: 0.6 });
    const y0 = sy - 16 + bob;
    g.roundRect(sx - 10, y0 - 10, 20, 20, 4).fill({ color: 0x2f8a3a }).stroke({ width: 2, color: 0x0f2a12 });
    g.poly([sx - 6, y0 + 3, sx, y0 - 4, sx + 6, y0 + 3, sx + 6, y0 + 7, sx, y0, sx - 6, y0 + 7]).fill(0xffd84a);
  }

  ring(x: number, y: number, r: number): void {
    this.rings.push({ x, y, lift: this.lift(x, y), r, t: 0, max: 0.45 });
  }

  /** Swift speed lines behind a tank (screen-space streaks opposite to motion). */
  speedLines(x: number, y: number, vx: number, vy: number): void {
    const [sx, sy] = this.px(x, y);
    const svx = worldToScreenX(vx, vy);
    const svy = worldToScreenY(vx, vy);
    const m = Math.hypot(svx, svy);
    if (m < 1) return;
    const ux = svx / m;
    const uy = svy / m;
    for (let k = -1; k <= 1; k++) {
      const ox = -uy * k * 14;
      const oy = ux * k * 7;
      const len = 30 + 12 * Math.abs(Math.sin(this.time * 20 + k));
      this.air.moveTo(sx - ux * 30 + ox, sy - 18 - uy * 30 + oy).lineTo(sx - ux * (30 + len) + ox, sy - 18 - uy * (30 + len) + oy).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
    }
  }

  end(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const q = this.rings[i];
      q.t += dt;
      const k = q.t / q.max;
      if (k >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const sx = worldToScreenX(q.x, q.y);
      const sy = worldToScreenY(q.x, q.y) - q.lift;
      const rx = q.r * 90.5 * (0.2 + 0.8 * k);
      this.air.ellipse(sx, sy, rx, rx * ISO_Y).fill({ color: 0xffd080, alpha: 0.12 * (1 - k) });
      this.air.ellipse(sx, sy, rx, rx * ISO_Y).stroke({ width: 14 * (1 - k) + 3, color: 0xffe6b0, alpha: 0.95 * (1 - k) });
      this.air.ellipse(sx, sy, rx * 0.85, rx * 0.85 * ISO_Y).stroke({ width: 4, color: 0x8a6a40, alpha: 0.5 * (1 - k) });
    }
  }
}

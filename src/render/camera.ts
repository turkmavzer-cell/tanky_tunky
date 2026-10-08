/** Smooth-follow camera with look-ahead, zoom and trauma-based shake (brief §7). Screen-space pixels. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  targetZoom = 1;
  private trauma = 0;
  shakeX = 0;
  shakeY = 0;
  reduceShake = false;
  private t = 0;

  /** Follow target (screen px) with exponential smoothing; `lookX/Y` = look-ahead offset. */
  update(dtSec: number, tx: number, ty: number, lookX = 0, lookY = 0): void {
    const k = 1 - Math.exp(-dtSec * 6);
    this.x += (tx + lookX - this.x) * k;
    this.y += (ty + lookY - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dtSec * 4));
    this.t += dtSec;
    this.trauma = Math.max(0, this.trauma - dtSec * 1.6);
    const amp = (this.reduceShake ? 4 : 14) * this.trauma * this.trauma;
    this.shakeX = amp * Math.sin(this.t * 61.3);
    this.shakeY = amp * Math.sin(this.t * 47.9 + 1.7);
  }

  snap(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }
}

/** Procedurally drawn particle textures (soft dot, smoke puff, spark streak, ring, debris, flash, track mark, shell). */
import { Texture } from 'pixi.js';

function cv(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}

export interface FxTextures {
  dot: Texture;
  smoke: Texture;
  spark: Texture;
  ring: Texture;
  debris: Texture;
  flash: Texture;
  track: Texture;
  shell: Texture;
  shellHeavy: Texture;
  shadow: Texture;
}

let cache: FxTextures | null = null;

export function fxTextures(): FxTextures {
  if (cache) return cache;
  const radial = (g: CanvasRenderingContext2D, r: number, stops: [number, string][]): void => {
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, r * 2, r * 2);
  };
  cache = {
    dot: cv(32, 32, (g) => radial(g, 16, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']])),
    smoke: cv(64, 64, (g) => {
      // lumpy puff from a few overlapping blobs (deterministic layout)
      const blobs = [
        [32, 34, 20],
        [22, 28, 14],
        [42, 26, 15],
        [30, 22, 13],
        [40, 40, 12],
        [22, 40, 12],
      ];
      for (const [x, y, r] of blobs) {
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }),
    spark: cv(32, 8, (g) => {
      const grd = g.createLinearGradient(0, 0, 32, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(16, 4, 16, 2.5, 0, 0, Math.PI * 2);
      g.fill();
    }),
    ring: cv(64, 64, (g) => {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(32, 32, 28, 0, Math.PI * 2);
      g.stroke();
    }),
    debris: cv(8, 8, (g) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(1, 2);
      g.lineTo(7, 0);
      g.lineTo(6, 7);
      g.lineTo(0, 6);
      g.closePath();
      g.fill();
    }),
    flash: cv(64, 64, (g) => {
      radial(g, 32, [[0, 'rgba(255,255,240,1)'], [0.25, 'rgba(255,230,150,0.9)'], [0.6, 'rgba(255,150,40,0.35)'], [1, 'rgba(255,100,0,0)']]);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,255,220,0.8)';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
        g.lineTo(32 + Math.cos(a + 0.18) * 6, 32 + Math.sin(a + 0.18) * 6);
        g.lineTo(32 + Math.cos(a - 0.18) * 6, 32 + Math.sin(a - 0.18) * 6);
        g.fill();
      }
    }),
    track: cv(16, 10, (g) => {
      g.fillStyle = 'rgba(40,28,18,0.5)';
      g.fillRect(0, 0, 16, 3);
      g.fillRect(0, 7, 16, 3);
    }),
    shell: cv(14, 8, (g) => {
      g.fillStyle = '#ffe9a8';
      g.beginPath();
      g.ellipse(7, 4, 7, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(8, 3, 5, 2);
    }),
    shellHeavy: cv(20, 10, (g) => {
      g.fillStyle = '#ffbf6a';
      g.beginPath();
      g.ellipse(10, 5, 10, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff6d8';
      g.fillRect(11, 3.5, 7, 3);
    }),
    shadow: cv(32, 16, (g) => {
      const grd = g.createRadialGradient(16, 8, 0, 16, 8, 16);
      grd.addColorStop(0, 'rgba(0,0,0,0.45)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.setTransform(1, 0, 0, 0.5, 0, 4);
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
    }),
  };
  return cache;
}

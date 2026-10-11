/**
 * Trapper minimap (brief §5, top-left). The Trapper sees the WHOLE map here: enemies are red dots
 * with a heading notch, invisible (Hide) enemies a faint flickering red dot, allies blue, own
 * mines orange. Plain 2D canvas, redrawn at ~10 Hz. Shown only when the local tank is a Trapper.
 */
import type { SimState } from '../sim/state';
import { isInvisible } from '../sim/visibility';
import { Ground, Feature } from '../world/terrain';

export class Minimap {
  readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private t = 0;

  constructor(private readonly size = 168) {
    this.canvas.width = size;
    this.canvas.height = size / 2;
    this.canvas.className = 'minimap';
    this.canvas.dataset.testid = 'minimap';
    this.g = this.canvas.getContext('2d')!;
  }

  /** Iso-diamond projection of world (x, y) into the minimap. */
  private p(s: SimState, x: number, y: number): [number, number] {
    const W = s.map.width;
    const k = this.size / (2 * W);
    return [this.size / 2 + (x - y) * k, ((x + y) * k) / 2];
  }

  private drawBase(s: SimState): void {
    const c = document.createElement('canvas');
    c.width = this.size;
    c.height = this.size / 2;
    const g = c.getContext('2d')!;
    const m = s.map;
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        const gr = m.ground[i];
        const f = m.feature[i];
        let col = ['#4f7a34', '#7a5e3a', '#b8a06a', '#5a4a30', '#3f8fa8', '#1f4a8a'][gr];
        if (f === Feature.Forest) col = '#2f5a2a';
        if (f === Feature.Rock || f === Feature.Wall || f === Feature.Gate) col = '#77736c';
        if (gr !== Ground.Deep && m.elev[i] > 0) col = m.elev[i] > 1 ? '#8aa86a' : '#6a9050';
        const [px, py] = this.p(s, x + 0.5, y + 0.5);
        g.fillStyle = col;
        const k = this.size / (2 * m.width);
        g.fillRect(px - k, py - k * 0.5, k * 2 + 0.6, k + 0.6);
      }
    this.base = c;
  }

  draw(s: SimState, me: number, dt: number): void {
    this.t += dt;
    if (!this.base) this.drawBase(s);
    const g = this.g;
    g.clearRect(0, 0, this.size, this.size / 2);
    g.globalAlpha = 0.92;
    g.drawImage(this.base!, 0, 0);
    g.globalAlpha = 1;
    const myTeam = s.tanks[me].team;
    for (const mn of s.mines) {
      if (mn.team !== myTeam) continue;
      const [x, y] = this.p(s, mn.x, mn.y);
      g.fillStyle = '#ff9a1a';
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const t of s.tanks) {
      if (!t.alive) continue;
      const [x, y] = this.p(s, t.x, t.y);
      const enemy = t.team !== myTeam;
      let alpha = 1;
      if (enemy && isInvisible(t)) alpha = 0.25 + 0.2 * Math.sin(this.t * 13 + t.id); // faint, flickering
      g.globalAlpha = alpha;
      g.fillStyle = enemy ? '#ff3b30' : t.id === me ? '#ffffff' : '#4aa3ff';
      g.beginPath();
      g.arc(x, y, t.id === me ? 3.6 : 3, 0, Math.PI * 2);
      g.fill();
      // heading notch
      const hx = Math.cos(t.hull) - Math.sin(t.hull);
      const hy = (Math.cos(t.hull) + Math.sin(t.hull)) * 0.5;
      const m = Math.hypot(hx, hy) || 1;
      g.strokeStyle = g.fillStyle;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (hx / m) * 6, y + (hy / m) * 6);
      g.stroke();
      g.globalAlpha = 1;
    }
  }
}

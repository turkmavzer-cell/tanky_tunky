/**
 * Minimap (top-left, round 08; first written for the Trapper in round 01). Shows the WHOLE map in the same
 * isometric projection as the game view, so "up-right on the minimap" is "up-right on screen". Terrain is baked
 * once; markers are redrawn at ~10 Hz: you = white arrow, allies blue, enemy tanks red, towers red squares,
 * the enemy headquarters a big red star. Hiding (Hide) enemies are not drawn. Tap = big full map, tap again = close.
 * Plain 2D canvas, no per-frame allocation.
 */
import type { SimState } from '../sim/state';
import { isInvisible } from '../sim/visibility';
import { Ground, Feature } from '../world/terrain';

/** Colours per Ground id (grass, dirt, sand, mud, shallow, deep, asphalt, pavement). */
const GROUND_COL = ['#4f7a34', '#8a6a40', '#c2ae74', '#5a4a30', '#5fb0c8', '#1f4a8a', '#5a5d62', '#c9c4b8'];
const SMALL = 200;
const BIG = 440;

export class Minimap {
  readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private acc = 1;
  private size = SMALL;
  private t = 0;
  expanded = false;

  constructor() {
    this.canvas.className = 'minimap';
    this.canvas.dataset.testid = 'minimap';
    this.g = this.canvas.getContext('2d')!;
    this.resize(SMALL);
  }

  private resize(size: number): void {
    this.size = size;
    this.canvas.width = size;
    this.canvas.height = size / 2;
    this.base = null;
    this.acc = 1; // redraw at once
  }

  toggle(): void {
    this.expanded = !this.expanded;
    this.canvas.classList.toggle('big', this.expanded);
    this.resize(this.expanded ? BIG : SMALL);
  }

  /** Iso-diamond projection of world (x, y) into the minimap. */
  private p(s: SimState, x: number, y: number): [number, number] {
    const k = this.size / (2 * s.map.width);
    return [this.size / 2 + (x - y) * k, ((x + y) * k) / 2];
  }

  private drawBase(s: SimState): void {
    const c = document.createElement('canvas');
    c.width = this.size;
    c.height = this.size / 2;
    const g = c.getContext('2d')!;
    const m = s.map;
    const k = this.size / (2 * m.width);
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        const gr = m.ground[i];
        const f = m.feature[i];
        let col = GROUND_COL[gr] ?? '#4f7a34';
        if (f === Feature.Forest) col = '#3f7a3a';
        else if (f === Feature.Thicket) col = '#16331a';
        else if (f === Feature.Rock || f === Feature.Wall || f === Feature.Gate || f === Feature.Building || f === Feature.Adobe) col = '#77736c';
        else if (f === Feature.Bridge) col = '#8a6a40';
        else if (gr !== Ground.Deep && m.elev[i] > 0) col = m.elev[i] > 1 ? '#8aa86a' : '#6a9050';
        const [px, py] = this.p(s, x + 0.5, y + 0.5);
        g.fillStyle = col;
        g.fillRect(px - k, py - k * 0.5, k * 2 + 0.6, k + 0.6);
      }
    this.base = c;
  }

  private star(x: number, y: number, r: number): void {
    const g = this.g;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (Math.PI / 5) * k - Math.PI / 2;
      const rr = k % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  draw(s: SimState, me: number, dt: number): void {
    this.t += dt;
    this.acc += dt;
    if (this.acc < 0.1) return; // ~10 Hz is plenty for a map
    this.acc = 0;
    if (!this.base) this.drawBase(s);
    const g = this.g;
    g.clearRect(0, 0, this.size, this.size / 2);
    g.globalAlpha = 0.95;
    g.drawImage(this.base!, 0, 0);
    g.globalAlpha = 1;
    const myTeam = s.tanks[me].team;
    const u = this.expanded ? 1.7 : 1;
    g.lineWidth = 1;
    g.strokeStyle = '#000000aa';
    for (const mn of s.mines) {
      if (mn.team !== myTeam) continue;
      const [x, y] = this.p(s, mn.x, mn.y);
      g.fillStyle = '#ff9a1a';
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const t of s.tanks) {
      if (!t.alive || t.id === me) continue;
      const enemy = t.team !== myTeam;
      if (enemy && isInvisible(t)) continue; // Hide stays hidden
      const [x, y] = this.p(s, t.x, t.y);
      g.fillStyle = enemy ? '#ff3b30' : '#4aa3ff';
      if (t.cls === 'hq') {
        g.fillStyle = '#ff2a1a';
        this.star(x, y, 7 * u);
      } else if (t.cls === 'tower') {
        g.fillRect(x - 2.4 * u, y - 2.4 * u, 4.8 * u, 4.8 * u);
        g.strokeRect(x - 2.4 * u, y - 2.4 * u, 4.8 * u, 4.8 * u);
      } else {
        g.beginPath();
        g.arc(x, y, 2.6 * u, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    // the local tank: white arrow along its hull heading (iso-projected)
    const mt = s.tanks[me];
    if (mt.alive) {
      const [x, y] = this.p(s, mt.x, mt.y);
      const hx = Math.cos(mt.hull) - Math.sin(mt.hull);
      const hy = (Math.cos(mt.hull) + Math.sin(mt.hull)) * 0.5;
      const a = Math.atan2(hy, hx);
      const r = 5 * u;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.lineTo(x + Math.cos(a + 2.5) * r * 0.8, y + Math.sin(a + 2.5) * r * 0.8);
      g.lineTo(x + Math.cos(a - 2.5) * r * 0.8, y + Math.sin(a - 2.5) * r * 0.8);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
}

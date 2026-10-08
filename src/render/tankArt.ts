/**
 * Procedural tank art (brief §12) rendered with "sprite stacking": every tank is a stack of
 * top-down slices that are rotated by the world heading and squashed into the isometric plane,
 * each slice lifted a few pixels. This gives a convincing pseudo-3D tank at any rotation without
 * pre-rendered 8-direction sheets.
 */
import type { TankClassId } from '../sim/config';

/** Texture pixels per world tile for slice textures. */
export const SLICE_PX_PER_TILE = 64;
export const SLICE_SIZE = 96;

export interface TeamPalette {
  body: string;
  bodyDark: string;
  bodyLight: string;
  /** Shape marker drawn on the turret for colour-blind players. */
  marker: 'circle' | 'triangle' | 'square' | 'diamond';
}

export const TEAM_PALETTES: readonly TeamPalette[] = [
  { body: '#3d6fb6', bodyDark: '#24467a', bodyLight: '#7fa9e6', marker: 'circle' },
  { body: '#b8423a', bodyDark: '#7a2620', bodyLight: '#ec8a7c', marker: 'triangle' },
  { body: '#4f9a4a', bodyDark: '#2e6230', bodyLight: '#94d08a', marker: 'square' },
  { body: '#c49a2c', bodyDark: '#7f6114', bodyLight: '#f0d27a', marker: 'diamond' },
];

export interface ClassShape {
  hullL: number; // length in tiles
  hullW: number;
  trackW: number;
  turretR: number;
  barrelL: number;
  barrelW: number;
  hullSlices: number;
  turretSlices: number;
}

export const CLASS_SHAPES: Readonly<Record<TankClassId, ClassShape>> = {
  scout: { hullL: 0.72, hullW: 0.5, trackW: 0.1, turretR: 0.15, barrelL: 0.42, barrelW: 0.06, hullSlices: 3, turretSlices: 2 },
  heavy: { hullL: 1.08, hullW: 0.86, trackW: 0.2, turretR: 0.3, barrelL: 0.66, barrelW: 0.13, hullSlices: 5, turretSlices: 4 },
  standard: { hullL: 0.9, hullW: 0.68, trackW: 0.15, turretR: 0.22, barrelL: 0.55, barrelW: 0.08, hullSlices: 4, turretSlices: 3 },
  artillery: { hullL: 0.96, hullW: 0.7, trackW: 0.15, turretR: 0.2, barrelL: 0.74, barrelW: 0.1, hullSlices: 4, turretSlices: 3 },
  trapper: { hullL: 0.88, hullW: 0.72, trackW: 0.17, turretR: 0.2, barrelL: 0.38, barrelW: 0.07, hullSlices: 4, turretSlices: 3 },
};

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = SLICE_SIZE;
  const g = c.getContext('2d')!;
  g.translate(SLICE_SIZE / 2, SLICE_SIZE / 2);
  g.scale(SLICE_PX_PER_TILE, SLICE_PX_PER_TILE);
  return [c, g];
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function marker(g: CanvasRenderingContext2D, kind: TeamPalette['marker'], r: number): void {
  g.beginPath();
  if (kind === 'circle') g.arc(0, 0, r, 0, Math.PI * 2);
  else if (kind === 'square') g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  else if (kind === 'triangle') {
    g.moveTo(r * 1.1, 0);
    g.lineTo(-r * 0.7, r * 0.95);
    g.lineTo(-r * 0.7, -r * 0.95);
    g.closePath();
  } else {
    g.moveTo(r * 1.1, 0);
    g.lineTo(0, r * 1.1);
    g.lineTo(-r * 1.1, 0);
    g.lineTo(0, -r * 1.1);
    g.closePath();
  }
  g.fillStyle = '#f4f1e6';
  g.fill();
  g.lineWidth = 0.025;
  g.strokeStyle = '#1b1b1b';
  g.stroke();
}

export interface TankSlices {
  shadow: HTMLCanvasElement;
  /** Hull slices bottom→top. */
  hull: HTMLCanvasElement[];
  /** Turret slices bottom→top (facing +x). */
  turret: HTMLCanvasElement[];
}

/** Draws all slice canvases for a class/team. Facing direction is +x. */
export function drawTankSlices(cls: TankClassId, pal: TeamPalette): TankSlices {
  const s = CLASS_SHAPES[cls];
  const L = s.hullL;
  const W = s.hullW;

  const [shadow, gs] = canvas();
  gs.fillStyle = 'rgba(0,0,0,0.38)';
  roundRect(gs, -L / 2 - 0.04, -W / 2 - 0.04, L + 0.08, W + 0.08, 0.14);
  gs.fill();

  const hull: HTMLCanvasElement[] = [];
  for (let i = 0; i < s.hullSlices; i++) {
    const [c, g] = canvas();
    const top = i === s.hullSlices - 1;
    const trackLevel = i < Math.ceil(s.hullSlices / 2);
    // tracks
    g.fillStyle = trackLevel ? '#262421' : '#34312c';
    roundRect(g, -L / 2, -W / 2, L, s.trackW, 0.04);
    g.fill();
    roundRect(g, -L / 2, W / 2 - s.trackW, L, s.trackW, 0.04);
    g.fill();
    if (top || i === 0) {
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 0.02;
      for (let k = -L / 2 + 0.06; k < L / 2; k += 0.09) {
        g.beginPath();
        g.moveTo(k, -W / 2);
        g.lineTo(k, -W / 2 + s.trackW);
        g.moveTo(k, W / 2 - s.trackW);
        g.lineTo(k, W / 2);
        g.stroke();
      }
    }
    // body
    const inset = trackLevel ? s.trackW * 0.6 : s.trackW * 0.3;
    roundRect(g, -L / 2 + 0.04, -W / 2 + inset, L - 0.08, W - inset * 2, 0.08);
    g.fillStyle = top ? pal.body : pal.bodyDark;
    g.fill();
    if (top) {
      // glacis highlight + engine deck grille
      g.fillStyle = pal.bodyLight;
      roundRect(g, L / 2 - 0.2, -W / 2 + inset + 0.04, 0.12, W - inset * 2 - 0.08, 0.04);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.02;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(-L / 2 + 0.1 + k * 0.06, -W / 4);
        g.lineTo(-L / 2 + 0.1 + k * 0.06, W / 4);
        g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 0.025;
      roundRect(g, -L / 2 + 0.04, -W / 2 + inset, L - 0.08, W - inset * 2, 0.08);
      g.stroke();
    }
    hull.push(c);
  }

  const turret: HTMLCanvasElement[] = [];
  for (let i = 0; i < s.turretSlices; i++) {
    const [c, g] = canvas();
    const top = i === s.turretSlices - 1;
    // barrel (only on the middle/top slice so it reads as a raised gun)
    if (i >= s.turretSlices - 2) {
      g.fillStyle = top ? '#4a4a46' : '#2f2f2c';
      g.fillRect(0, -s.barrelW / 2, s.turretR + s.barrelL, s.barrelW);
      g.fillStyle = '#1d1d1b';
      g.fillRect(s.turretR + s.barrelL - 0.07, -s.barrelW / 2 - 0.015, 0.07, s.barrelW + 0.03);
    }
    g.beginPath();
    if (cls === 'trapper') {
      roundRect(g, -s.turretR * 1.2, -s.turretR, s.turretR * 2.2, s.turretR * 2, 0.05);
    } else if (cls === 'artillery') {
      g.moveTo(s.turretR * 1.2, 0);
      g.lineTo(-s.turretR * 0.8, s.turretR * 1.1);
      g.lineTo(-s.turretR * 1.1, 0);
      g.lineTo(-s.turretR * 0.8, -s.turretR * 1.1);
      g.closePath();
    } else {
      g.arc(0, 0, s.turretR, 0, Math.PI * 2);
    }
    g.fillStyle = top ? pal.body : pal.bodyDark;
    g.fill();
    if (top) {
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 0.025;
      g.stroke();
      marker(g, pal.marker, s.turretR * 0.45);
    }
    turret.push(c);
  }
  return { shadow, hull, turret };
}

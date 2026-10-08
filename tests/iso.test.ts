import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W, screenAngleToWorld, screenDirToWorld, screenToWorld, worldAngleToScreen, worldToScreen } from '../src/world/iso';

describe('isometric projection', () => {
  it('is 2:1 dimetric', () => {
    expect(TILE_W / TILE_H).toBe(2);
    expect(worldToScreen(1, 0)).toEqual({ x: 64, y: 32 });
    expect(worldToScreen(0, 1)).toEqual({ x: -64, y: 32 });
    expect(worldToScreen(1, 1)).toEqual({ x: 0, y: 64 });
  });

  it('screenToWorld inverts worldToScreen', () => {
    for (let i = 0; i < 200; i++) {
      const wx = (i * 7.31) % 96;
      const wy = (i * 3.17) % 96;
      const s = worldToScreen(wx, wy);
      const w = screenToWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(wx, 9);
      expect(w.y).toBeCloseTo(wy, 9);
    }
  });

  it('joystick up maps to the world diagonal (-1,-1) and keeps magnitude', () => {
    const d = screenDirToWorld(0, -1);
    expect(d.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(d.y).toBeCloseTo(-Math.SQRT1_2, 9);
    const r = screenDirToWorld(0.5, 0);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(0.5, 9);
    expect(r.x).toBeCloseTo(-r.y, 9);
  });

  it('a world move along screenDirToWorld projects onto the joystick direction', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const d = screenDirToWorld(Math.cos(a), Math.sin(a));
      const s = worldToScreen(d.x, d.y);
      const sa = Math.atan2(s.y, s.x);
      expect(Math.abs(Math.atan2(Math.sin(sa - a), Math.cos(sa - a)))).toBeLessThan(1e-9);
    }
  });

  it('screen/world angle helpers are inverses', () => {
    for (let a = -3; a < 3; a += 0.25) {
      const back = worldAngleToScreen(screenAngleToWorld(a));
      expect(Math.abs(Math.atan2(Math.sin(back - a), Math.cos(back - a)))).toBeLessThan(1e-9);
    }
  });
});

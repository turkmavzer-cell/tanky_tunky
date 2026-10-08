import { describe, expect, it } from 'vitest';
import { datan2, dcos, dsin, lerpAngle, rotateToward, wrapAngle } from '../src/sim/dmath';

describe('deterministic math', () => {
  it('dsin/dcos match Math within 1e-9 over many turns', () => {
    for (let a = -20; a <= 20; a += 0.001) {
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-9);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-9);
    }
  });

  it('datan2 matches Math.atan2 within 1e-9 in all quadrants', () => {
    for (let i = 0; i < 20000; i++) {
      const y = Math.sin(i * 1.37) * (1 + (i % 7));
      const x = Math.cos(i * 0.91) * (1 + (i % 5));
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-9);
    }
    expect(datan2(0, 0)).toBe(0);
    expect(datan2(0, -1)).toBeCloseTo(Math.PI, 12);
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(datan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('wrapAngle keeps values in (-PI, PI]', () => {
    for (let a = -50; a < 50; a += 0.37) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-12);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-12);
      expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-9);
    }
  });

  it('rotateToward takes the short way and never overshoots', () => {
    expect(rotateToward(3, -3, 0.1)).toBeCloseTo(3.1, 10);
    expect(rotateToward(0, 0.05, 0.1)).toBeCloseTo(0.05, 12);
    expect(rotateToward(0, -1, 0.1)).toBeCloseTo(-0.1, 12);
  });

  it('lerpAngle interpolates across the seam', () => {
    expect(Math.abs(lerpAngle(3.1, -3.1, 0.5))).toBeCloseTo(Math.PI, 2);
  });
});

import { describe, expect, it } from 'vitest';
import { AIM_NONE, aimToRad, packInput, quantizeAim, quantizeMove, unpackInput } from '../src/sim/input';

describe('input quantization', () => {
  it('pack/unpack round-trips every field', () => {
    const cases = [
      { moveX: 0, moveY: 0, aim: AIM_NONE, buttons: 0 },
      { moveX: -127, moveY: 127, aim: 0, buttons: 3 },
      { moveX: 55, moveY: -12, aim: 4095, buttons: 1 },
    ];
    for (const c of cases) expect(unpackInput(packInput(c))).toEqual(c);
  });

  it('quantizeMove clamps to [-127,127]', () => {
    expect(quantizeMove(2)).toBe(127);
    expect(quantizeMove(-2)).toBe(-127);
    expect(quantizeMove(0.5)).toBe(64);
  });

  it('aim quantization error is below half a step', () => {
    for (let a = -Math.PI + 0.001; a < Math.PI; a += 0.01) {
      const back = aimToRad(quantizeAim(a));
      const d = Math.atan2(Math.sin(back - a), Math.cos(back - a));
      expect(Math.abs(d)).toBeLessThan((Math.PI * 2) / 4096);
    }
  });
});

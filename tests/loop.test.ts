import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';

describe('FixedStepLoop', () => {
  it('runs exactly one tick per step interval regardless of frame jitter', () => {
    let ticks = 0;
    const alphas: number[] = [];
    const loop = new FixedStepLoop(1000 / 60, { tick: () => ticks++, render: (a) => alphas.push(a) });
    let t = 0;
    loop.frame(t);
    for (let i = 0; i < 600; i++) {
      t += i % 3 === 0 ? 25 : 12.5; // uneven frames, avg 16.67 ms
      loop.frame(t);
    }
    expect(Math.abs(ticks - Math.floor(t / (1000 / 60)))).toBeLessThanOrEqual(1);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('caps catch-up steps and counts dropped ticks', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(10, { tick: () => ticks++, render: () => undefined }, 5);
    loop.frame(0);
    loop.frame(1000);
    expect(ticks).toBe(5);
    expect(loop.dropped).toBeGreaterThan(90);
  });

  it('does not tick while paused and does not burst after resetClock', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(10, { tick: () => ticks++, render: () => undefined });
    loop.frame(0);
    loop.paused = true;
    loop.frame(500);
    expect(ticks).toBe(0);
    loop.paused = false;
    loop.resetClock();
    loop.frame(10000);
    loop.frame(10010);
    expect(ticks).toBe(1);
  });
});

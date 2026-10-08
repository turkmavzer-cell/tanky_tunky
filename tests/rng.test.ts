import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/sim/rng';

describe('Rng', () => {
  it('is reproducible from a seed and from a saved state', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
    const snap = a.state();
    const c = new Rng(snap);
    for (let i = 0; i < 1000; i++) expect(c.next()).toBe(a.next());
  });

  it('different seeds diverge and output is roughly uniform', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
    const r = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[Math.floor(r.next() * 10)]++;
    for (const b of buckets) expect(Math.abs(b - 10000)).toBeLessThan(500);
  });

  it('int() is inclusive and in range', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });

  it('hashString is stable (daily challenge seeds)', () => {
    expect(hashString('2026-10-08')).toBe(hashString('2026-10-08'));
    expect(hashString('2026-10-08')).not.toBe(hashString('2026-10-09'));
  });
});

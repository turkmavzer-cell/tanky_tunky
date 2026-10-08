import { describe, expect, it } from 'vitest';
import { MAP_SIZES, dailySeed, generateMap, validateMap } from '../src/world/generator';
import { hashState } from '../src/sim/hash';
import { DIR4, FLAG_RAMP, canStep, isWalkable, rampDir } from '../src/world/map';
import { Feature, Ground } from '../src/world/terrain';

const mapHash = (m: ReturnType<typeof generateMap>): string =>
  hashState({ g: Array.from(m.ground), f: Array.from(m.feature), e: Array.from(m.elev), fl: Array.from(m.flags), b: m.bases, o: m.objectives });

describe('procedural generator', () => {
  it('is deterministic: same seed → identical map', () => {
    for (const size of MAP_SIZES) expect(mapHash(generateMap({ seed: 77, size }))).toBe(mapHash(generateMap({ seed: 77, size })));
    expect(mapHash(generateMap({ seed: 77, size: 40 }))).not.toBe(mapHash(generateMap({ seed: 78, size: 40 })));
  });

  it('is point-symmetric (fair by construction)', () => {
    const m = generateMap({ seed: 4242, size: 64 });
    const N = m.width;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const j = (N - 1 - y) * N + (N - 1 - x);
        expect(m.ground[j]).toBe(m.ground[i]);
        expect(m.elev[j]).toBe(m.elev[i]);
        expect(m.feature[j]).toBe(m.feature[i]);
        expect(m.flags[j] & FLAG_RAMP).toBe(m.flags[i] & FLAG_RAMP);
        if (m.flags[i] & FLAG_RAMP) expect(rampDir(m, j)).toBe([1, 0, 3, 2][rampDir(m, i)]);
      }
  });

  it('daily seed is stable per UTC date', () => {
    expect(dailySeed(new Date('2026-10-08T01:00:00Z'))).toBe(dailySeed(new Date('2026-10-08T23:00:00Z')));
    expect(dailySeed(new Date('2026-10-08T01:00:00Z'))).not.toBe(dailySeed(new Date('2026-10-09T01:00:00Z')));
  });

  it('produces varied terrain (water, forest, elevation, ramps, bridges, destructibles)', () => {
    const m = generateMap({ seed: 9, size: 96 });
    const count = (pred: (i: number) => boolean): number => {
      let c = 0;
      for (let i = 0; i < m.ground.length; i++) if (pred(i)) c++;
      return c;
    };
    expect(count((i) => m.ground[i] === Ground.Deep)).toBeGreaterThan(50);
    expect(count((i) => m.feature[i] === Feature.Forest)).toBeGreaterThan(200);
    expect(count((i) => m.elev[i] > 0)).toBeGreaterThan(300);
    expect(count((i) => (m.flags[i] & FLAG_RAMP) !== 0)).toBeGreaterThan(4);
    expect(count((i) => m.feature[i] === Feature.Bridge)).toBeGreaterThan(4);
    expect(count((i) => m.feature[i] === Feature.Wall || m.feature[i] === Feature.Crate)).toBeGreaterThan(10);
  });

  it('cliffs block movement unless a ramp connects the levels', () => {
    const m = generateMap({ seed: 9, size: 64 });
    let checked = 0;
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width - 1; x++) {
        const i = y * m.width + x;
        const j = i + 1;
        if (!isWalkable(m, x, y) || !isWalkable(m, x + 1, y)) continue;
        const dh = Math.abs(m.elev[i] - m.elev[j]);
        const hi = m.elev[i] > m.elev[j] ? i : j;
        const lo = hi === i ? j : i;
        const ramp = (m.flags[hi] & FLAG_RAMP) !== 0 && hi + DIR4[rampDir(m, hi)][0] + DIR4[rampDir(m, hi)][1] * m.width === lo;
        expect(canStep(m, x, y, x + 1, y)).toBe(dh === 0 || (dh === 1 && ramp));
        expect(canStep(m, x + 1, y, x, y)).toBe(canStep(m, x, y, x + 1, y));
        checked++;
      }
    expect(checked).toBeGreaterThan(1000);
  });

  it('96x96 generates within the time budget', () => {
    const t = performance.now();
    generateMap({ seed: 1, size: 96 });
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe('generator fuzz (property test)', () => {
  // Brief §10.6: hundreds of random seeds — no unreachable base, no trapped spawn, no hang.
  const seeds = Array.from({ length: 300 }, (_, k) => (Math.imul(k + 1, 2654435761) >>> 0) ^ 0xa5a5);
  it('every generated map is valid and fair (300 seeds × sizes 40/64, 30 seeds × 96)', () => {
    const failures: string[] = [];
    seeds.forEach((seed, k) => {
      const sizes = k < 30 ? MAP_SIZES : ([40, 64] as const);
      for (const size of sizes) {
        const m = generateMap({ seed, size });
        const r = validateMap(m);
        if (!r.ok) failures.push(`seed ${seed} size ${size}: ${r.errors.join('; ')}`);
        if (r.reachableFraction < 0.97) failures.push(`seed ${seed} size ${size}: reachable ${r.reachableFraction}`);
      }
    });
    expect(failures).toEqual([]);
  }, 300_000);
});

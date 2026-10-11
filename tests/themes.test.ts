import { describe, expect, it } from 'vitest';
import { generateThemed } from '../src/world/themes';
import { validateMap } from '../src/world/generator';
import { Feature, Ground } from '../src/world/terrain';
import { runHeadless } from '../src/game/matchSetup';

const count = (a: Uint8Array, v: number): number => a.reduce((n, x) => n + (x === v ? 1 : 0), 0);

describe('themed maps (round 03, D-040)', () => {
  for (const theme of ['desert', 'city'] as const) {
    it(`${theme}: 30 seeds are valid, point-symmetric, flat, and have crates for upgrades`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const m = generateThemed(theme, seed, 40);
        const r = validateMap(m);
        expect(r.errors, `${theme} seed ${seed}`).toEqual([]);
        expect(m.theme).toBe(theme);
        const N = m.width;
        for (let i = 0; i < N * N; i++) {
          const j = N * N - 1 - i; // 180° rotation
          expect(m.feature[i]).toBe(m.feature[j]);
          expect(m.ground[i]).toBe(m.ground[j]);
          expect(m.elev[i]).toBe(0);
        }
        expect(count(m.feature, Feature.Crate)).toBeGreaterThanOrEqual(6);
        expect(count(m.ground, Ground.Deep) + count(m.ground, Ground.Shallow)).toBe(0);
      }
    });
  }

  it('desert = sand + streets + mud-brick houses (partly ruined), no forest', () => {
    const m = generateThemed('desert', 3, 40);
    expect(count(m.ground, Ground.Sand)).toBeGreaterThan(400);
    expect(count(m.feature, Feature.Adobe)).toBeGreaterThan(40);
    expect(count(m.feature, Feature.Ruins)).toBeGreaterThan(20);
    expect(count(m.feature, Feature.Forest)).toBe(0);
  });

  it('city = asphalt roads, pavement, buildings, cars', () => {
    const m = generateThemed('city', 3, 40);
    expect(count(m.ground, Ground.Asphalt)).toBeGreaterThan(400);
    expect(count(m.ground, Ground.Pavement)).toBeGreaterThan(200);
    expect(count(m.feature, Feature.Building)).toBeGreaterThan(60);
    expect(count(m.feature, Feature.Car)).toBeGreaterThan(8);
  });

  it('a full bot match runs on both themes', () => {
    for (const theme of ['desert', 'city'] as const) {
      const m = runHeadless({ seed: 9, theme, mapSize: 40, rules: { duration: 40 } });
      expect(m.state.match.phase).toBe('ended');
      expect(m.state.match.kills.length).toBeGreaterThan(0);
    }
  });
});

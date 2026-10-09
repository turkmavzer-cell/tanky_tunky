import { describe, expect, it } from 'vitest';
import { arena, flatMap, run, idle, wall } from './helpers';
import { canNoticeTank, canSeeTank, castFov, inForest, updateVision } from '../src/sim/visibility';
import { VISION } from '../src/sim/config';
import { Rng } from '../src/sim/rng';
import { setFeature } from '../src/world/map';
import { Feature } from '../src/world/terrain';
import { generateMap } from '../src/world/generator';
import { createState } from '../src/sim/sim';

describe('VisibilitySystem — line of sight', () => {
  it('a rock wall blocks sight; the wall itself is seen', () => {
    const m = flatMap(30);
    wall(m, 10, 0, 29);
    const out = new Uint8Array(900);
    castFov(m, 5, 15, 8, out);
    expect(out[15 * 30 + 9]).toBe(1);
    expect(out[15 * 30 + 10]).toBe(1); // wall face visible
    expect(out[15 * 30 + 11]).toBe(0); // behind the wall hidden
    expect(out[15 * 30 + 5 + 8]).toBe(0);
  });

  it('radius is respected on open ground', () => {
    const m = flatMap(40);
    const out = new Uint8Array(1600);
    castFov(m, 20, 20, 6, out);
    expect(out[20 * 40 + 26]).toBe(1);
    expect(out[20 * 40 + 27]).toBe(0);
    expect(out[(20 + 4) * 40 + 24]).toBe(1); // dist sqrt(32) < 6
    expect(out[(20 + 5) * 40 + 25]).toBe(0); // dist sqrt(50) > 6
  });

  it('is symmetric on flat maps with random obstacles (A sees B ⇔ B sees A)', () => {
    const r = new Rng(5);
    for (let k = 0; k < 20; k++) {
      const m = flatMap(24);
      for (let i = 0; i < 70; i++) setFeature(m, r.int(0, 23), r.int(0, 23), Feature.Rock);
      const pts: [number, number][] = [];
      while (pts.length < 6) {
        const x = r.int(0, 23);
        const y = r.int(0, 23);
        if (m.feature[y * 24 + x] === 0) pts.push([x, y]);
      }
      for (const [ax, ay] of pts)
        for (const [bx, by] of pts) {
          const fa = new Uint8Array(576);
          const fb = new Uint8Array(576);
          castFov(m, ax, ay, 9, fa);
          castFov(m, bx, by, 9, fb);
          expect(fa[by * 24 + bx]).toBe(fb[ay * 24 + ax]);
        }
    }
  });

  it('higher ground hides what lies beyond its edge; the high viewer sees down', () => {
    const m = flatMap(30);
    for (let y = 0; y < 30; y++) for (let x = 12; x < 30; x++) m.elev[y * 30 + x] = 1;
    const low = new Uint8Array(900);
    castFov(m, 8, 15, 8, low);
    expect(low[15 * 30 + 12]).toBe(1); // plateau edge
    expect(low[15 * 30 + 14]).toBe(0); // beyond the edge
    const high = new Uint8Array(900);
    castFov(m, 14, 15, 8, high);
    expect(high[15 * 30 + 8]).toBe(1);
  });
});

describe('VisibilitySystem — tanks', () => {
  it('enemy behind a wall is not visible; in the open it is', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 10.5, y: 15.5 },
    ]);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(true);
    wall(s.map, 8, 10, 20);
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(false);
  });

  it('forest conceals a tank except from very close', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
    ]);
    setFeature(s.map, 9, 15, Feature.Forest);
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(false);
    s.tanks[0].x = 8.2;
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(true);
  });

  it('invisible (Hide) tanks are never seen, only noticed within noticeRange by AI perception', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'scout', x: 9.5, y: 15.5 },
    ]);
    s.tanks[1].ability.active = 3;
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(false);
    expect(canNoticeTank(s, 0, s.tanks[1])).toBe(false);
    s.tanks[0].x = 7.8;
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(false);
    expect(canNoticeTank(s, 0, s.tanks[1])).toBe(true);
  });

  it('explored memory accumulates while moving', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 3.5, y: 15.5 }]);
    run(s, 180, [{ ...idle, moveX: 127 }]);
    const v = s.vision[0];
    expect(v.explored[15 * 30 + 2]).toBe(1);
    expect(v.explored.reduce((a, b) => a + b, 0)).toBeGreaterThan(v.visible.reduce((a, b) => a + b, 0));
  });

  it('performance budget: 10 tanks on 96x96 update in < 2 ms on average', () => {
    const map = generateMap({ seed: 3, size: 96 });
    const players = map.spawnPoints.slice(0, 10).map((p, i) => ({ team: i % 2, cls: 'heavy' as const, x: p.x + 0.5, y: p.y + 0.5 }));
    const s = createState({ seed: 3, map, players, rules: { endless: true } });
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) updateVision(s);
    expect((performance.now() - t0) / 100).toBeLessThan(2);
  });
});

describe('full visibility (game default since round 03, D-037)', () => {
  const full = { rules: { fullVisibility: true } };

  it('an enemy behind a wall and far away is visible and targetable', () => {
    const s = arena(
      [
        { team: 0, cls: 'standard', x: 3.5, y: 3.5 },
        { team: 1, cls: 'standard', x: 25.5, y: 25.5 },
      ],
      full,
    );
    wall(s.map, 10, 0, 29);
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(true);
    expect(s.vision[0].visible.every((v) => v === 1)).toBe(true);
    expect(s.vision[0].los[25 * 30 + 25]).toBe(0); // real line of sight is still blocked
  });

  it('a tank in forest is hidden beyond forestConcealRange and visible inside it', () => {
    const s = arena(
      [
        { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
        { team: 1, cls: 'standard', x: 15.5, y: 15.5 },
      ],
      full,
    );
    for (let y = 13; y < 18; y++) for (let x = 13; x < 18; x++) setFeature(s.map, x, y, Feature.Forest);
    updateVision(s);
    expect(inForest(s, s.tanks[1])).toBe(true);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(false);
    s.tanks[0].x = 15.5 - VISION.forestConcealRange + 0.2;
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(true);
  });

  it('Hide still makes a tank invisible', () => {
    const s = arena(
      [
        { team: 0, cls: 'standard', x: 5.5, y: 5.5 },
        { team: 1, cls: 'scout', x: 7.5, y: 5.5 },
      ],
      full,
    );
    s.tanks[1].ability.active = 3;
    updateVision(s);
    expect(canSeeTank(s, 0, s.tanks[1])).toBe(false);
  });
});

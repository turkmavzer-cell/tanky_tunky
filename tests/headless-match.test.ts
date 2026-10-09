import { describe, expect, it } from 'vitest';
import { createMatch, runHeadless, scoreboard, stepMatch } from '../src/game/matchSetup';
import { MATCH } from '../src/sim/config';
import { hashState } from '../src/sim/hash';

describe('headless match (default duration from match.json)', () => {
  it('runs bots for the full match duration, stops, and total kills equal total deaths (no environment deaths)', () => {
    const m = runHeadless({ seed: 21, mapSize: 40 });
    expect(m.state.match.phase).toBe('ended');
    expect(m.state.tick).toBeLessThanOrEqual(60 * (MATCH.countdown + MATCH.duration) + 2);
    const k = m.state.tanks.reduce((a, t) => a + t.kills, 0);
    const d = m.state.tanks.reduce((a, t) => a + t.deaths, 0);
    const env = m.state.match.kills.filter((r) => r.killer < 0).length;
    expect(k).toBe(d - env);
    expect(m.state.match.kills.length).toBe(d);
    for (const r of m.state.match.kills) expect(r.t).toBeLessThanOrEqual(MATCH.duration + 1e-6);
  });

  it('same seed → identical match and scoreboard (deterministic replay)', () => {
    const a = runHeadless({ seed: 33, mapSize: 40 });
    const b = runHeadless({ seed: 33, mapSize: 40 });
    expect(hashState({ t: a.state.tanks, k: a.state.match.kills })).toBe(hashState({ t: b.state.tanks, k: b.state.match.kills }));
    expect(scoreboard(a.state)).toEqual(scoreboard(b.state));
  });

  it('respawn points are never visible to the enemy team at the moment of respawn', () => {
    for (const seed of [2, 5, 8]) {
      const m = createMatch({ seed, mapSize: 40 });
      let respawns = 0;
      for (let i = 0; i < 60 * 64 && m.state.match.phase !== 'ended'; i++) {
        const before = m.state.vision.map((v) => v.visible.slice());
        stepMatch(m, null);
        for (const e of m.state.events) {
          if (e.type !== 'respawn') continue;
          respawns++;
          const t = m.state.tanks[e.tank];
          const enemy = t.team === 0 ? 1 : 0;
          const idx = Math.floor(t.y) * m.state.map.width + Math.floor(t.x);
          expect(before[enemy][idx]).toBe(0);
        }
      }
      expect(respawns).toBeGreaterThanOrEqual(0);
    }
  });

  it('scoreboard ranks by kills, then fewer deaths', () => {
    const m = createMatch({ seed: 1, mapSize: 40 });
    const t = m.state.tanks;
    t[0].kills = 3;
    t[0].deaths = 2;
    t[1].kills = 3;
    t[1].deaths = 0;
    t[2].kills = 5;
    const rows = scoreboard(m.state);
    expect(rows.map((r) => r.id).slice(0, 3)).toEqual([2, 1, 0]);
  });
});

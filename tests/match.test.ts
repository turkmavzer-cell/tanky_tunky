import { describe, expect, it } from 'vitest';
import { idle, run, secs } from './helpers';
import { createState } from '../src/sim/sim';
import { MATCH, TANKS } from '../src/sim/config';
import { generateMap } from '../src/world/generator';
import { chooseSpawn } from '../src/sim/match';
import { applyDamage, killTank } from '../src/sim/combat';
import { isPassable } from '../src/world/passability';
import { floodFill } from '../src/world/reach';

function match(seed = 4) {
  const map = generateMap({ seed, size: 40 });
  const b0 = map.bases[0].spawns;
  const b1 = map.bases[1].spawns;
  return createState({
    seed,
    map,
    players: [
      { team: 0, cls: 'standard', x: b0[0].x + 0.5, y: b0[0].y + 0.5 },
      { team: 1, cls: 'standard', x: b1[0].x + 0.5, y: b1[0].y + 0.5 },
      { team: 1, cls: 'scout', x: b1[1].x + 0.5, y: b1[1].y + 0.5 },
    ],
  });
}

describe('match flow (round-01 job 4)', () => {
  it('3-2-1 countdown freezes tanks, then 60 s of play, then the match stops', () => {
    const s = match();
    const x0 = s.tanks[0].x;
    run(s, secs(MATCH.countdown) - 2, [{ ...idle, moveX: 127 }, idle, idle]);
    expect(s.match.phase).toBe('countdown');
    expect(s.tanks[0].x).toBe(x0);
    const ev = run(s, secs(MATCH.duration) + 10, [{ ...idle, moveX: 60 }, idle, idle]);
    expect(ev.some((e) => e.type === 'matchStart')).toBe(true);
    expect(ev.filter((e) => e.type === 'matchTick')).toHaveLength(MATCH.finalWarning);
    expect(ev.some((e) => e.type === 'matchEnd')).toBe(true);
    expect(s.match.phase).toBe('ended');
    const frozen = JSON.stringify(s.tanks.map((t) => [t.x, t.y, t.hp]));
    run(s, 120, [{ ...idle, moveX: 127 }, idle, idle]);
    expect(JSON.stringify(s.tanks.map((t) => [t.x, t.y, t.hp]))).toBe(frozen);
  });

  it('respawn after the delay with full HP, protection, reset cooldowns, same class', () => {
    const s = match();
    run(s, secs(MATCH.countdown) + 2, [idle, idle, idle]);
    const t = s.tanks[2];
    t.ability.cooldown = 4;
    t.hp = 5;
    killTank(s, t, 0, 'shell');
    expect(s.tanks[0].kills).toBe(1);
    run(s, secs(MATCH.respawnDelay) - 5, [idle, idle, idle]);
    expect(t.alive).toBe(false);
    run(s, 10, [idle, idle, idle]);
    expect(t.alive).toBe(true);
    expect(t.hp).toBe(TANKS.scout.hp);
    expect(t.cls).toBe('scout');
    expect(t.protect).toBeGreaterThan(MATCH.spawnProtection - 0.2);
    expect(t.ability.cooldown).toBe(0);
  });

  it('spawn protection blocks damage and ends when the tank fires', () => {
    const s = match();
    run(s, secs(MATCH.countdown) + 1, [idle, idle, idle]);
    const t = s.tanks[0];
    t.protect = 2;
    const hp = t.hp;
    applyDamage(s, t, 50, 1, t.x, t.y, 'shell');
    expect(t.hp).toBe(hp);
    run(s, 1, [{ ...idle, buttons: 1 }, idle, idle]);
    run(s, 1, [idle, idle, idle]);
    expect(t.protect).toBe(0);
    applyDamage(s, t, 50, 1, t.x, t.y, 'shell');
    expect(t.hp).toBeLessThan(hp);
  });

  it('chosen spawn points are passable, connected, never visible to the enemy, and not repeated', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = match(seed);
      run(s, secs(MATCH.countdown) + 30, [idle, idle, idle]);
      const reach = floodFill(s.map, s.map.bases[0].x, s.map.bases[0].y);
      const t = s.tanks[1];
      let last = -1;
      for (let k = 0; k < 6; k++) {
        const { point, index } = chooseSpawn(s, t, t.x, t.y);
        expect(isPassable(s.map, point.x, point.y, point.x, point.y)).toBe(true);
        expect(reach[point.y * s.map.width + point.x]).toBe(1);
        expect(s.vision[0].visible[point.y * s.map.width + point.x]).toBe(0);
        expect(index).not.toBe(last);
        last = index;
        t.lastSpawn = index;
      }
    }
  });

  it('every generated map has spread-out spawn points', () => {
    for (const size of [40, 64, 96] as const) {
      const m = generateMap({ seed: 9, size });
      expect(m.spawnPoints.length).toBeGreaterThan(size / 4);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { arena, run, idle, wall } from './helpers';
import { AIM_AUTO } from '../src/sim/input';
import { updateVision } from '../src/sim/visibility';
import { updateTarget, leadPoint } from '../src/sim/targeting';
import { angleDiff } from '../src/sim/dmath';

const auto = { ...idle, aim: AIM_AUTO };

describe('auto targeting (round-01 job 1)', () => {
  it('locks only the VISIBLE enemy even when a hidden one is closer', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 13.5, y: 10.5 }, // closer, behind a wall
      { team: 1, cls: 'standard', x: 10.5, y: 15.5 }, // farther, visible
    ]);
    wall(s.map, 12, 8, 12);
    updateVision(s);
    run(s, 90, [auto, idle, idle]);
    expect(s.tanks[0].target).toBe(2);
    // turret points toward +y (angle ~ +PI/2)
    expect(Math.abs(angleDiff(s.tanks[0].turret, Math.PI / 2))).toBeLessThan(0.1);
  });

  it('never locks an invisible (Hide) enemy', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 10.5, y: 10.5 },
      { team: 1, cls: 'scout', x: 13.5, y: 10.5 },
    ]);
    s.tanks[1].ability.active = 4;
    run(s, 10, [auto, idle]);
    expect(s.tanks[0].target).toBe(-1);
  });

  it('hysteresis: keeps the lock unless a candidate is ≥15 % closer', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 15.5, y: 10.5 }, // d = 5
      { team: 1, cls: 'standard', x: 10.5, y: 16.5 }, // d = 6
    ]);
    updateTarget(s, s.tanks[0]);
    expect(s.tanks[0].target).toBe(1);
    s.tanks[2].y = 15.0; // d = 4.5 → only 10 % closer: keep
    updateVision(s);
    updateTarget(s, s.tanks[0]);
    expect(s.tanks[0].target).toBe(1);
    s.tanks[2].y = 14.4; // d = 3.9 → 22 % closer: switch
    updateVision(s);
    updateTarget(s, s.tanks[0]);
    expect(s.tanks[0].target).toBe(2);
  });

  it('keeps the lock until the target leaves sight', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 14.5, y: 10.5 },
    ]);
    updateTarget(s, s.tanks[0]);
    expect(s.tanks[0].target).toBe(1);
    wall(s.map, 12, 5, 15);
    updateVision(s);
    updateTarget(s, s.tanks[0]);
    expect(s.tanks[0].target).toBe(-1);
  });

  it('without a target the turret settles back toward the hull', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 10.5, y: 10.5 }]);
    s.tanks[0].turret = 2.5;
    run(s, 180, [auto]);
    expect(Math.abs(angleDiff(s.tanks[0].turret, s.tanks[0].hull))).toBeLessThan(0.05);
  });

  it('turns toward visible enemies beyond weapon range too', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 5.5 },
      { team: 1, cls: 'standard', x: 5.5, y: 11.0 }, // 5.5 tiles: inside vision 6, inside range 7
    ]);
    s.tanks[1].x = 5.5;
    s.tanks[1].y = 11.4;
    updateVision(s);
    run(s, 5, [auto, idle]);
    expect(s.tanks[0].target).toBe(1);
  });

  it('leads a moving target in its direction of travel', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 10.5, y: 10.5 },
    ]);
    s.tanks[1].vy = 2;
    const p = leadPoint(s, s.tanks[0], s.tanks[1], 0);
    expect(p.y).toBeGreaterThan(10.5 + 0.5);
    expect(p.x).toBeCloseTo(10.5, 6);
  });

  it('turret turn speed comes from tanks.json (heavy slower than scout)', () => {
    const mk = (cls: 'heavy' | 'scout') => {
      const s = arena([
        { team: 0, cls, x: 10.5, y: 10.5 },
        { team: 1, cls: 'standard', x: 10.5, y: 5.5 },
      ]);
      s.tanks[0].turret = 0;
      run(s, 20, [auto, idle]);
      return Math.abs(angleDiff(0, s.tanks[0].turret));
    };
    expect(mk('scout')).toBeGreaterThan(mk('heavy'));
  });
});

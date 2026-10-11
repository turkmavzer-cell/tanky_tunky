import { describe, expect, it } from 'vitest';
import { arena, run, idle } from './helpers';
import { TANKS } from '../src/sim/config';
import { AIM_AUTO, BTN_FIRE, quantizeAim, type PlayerInput } from '../src/sim/input';
import type { SimEvent, SimState } from '../src/sim/state';

const aimX = quantizeAim(0);
const hold: PlayerInput = { ...idle, aim: aimX, buttons: BTN_FIRE };
const free: PlayerInput = { ...idle, aim: aimX };

/** Holds fire for `frames` ticks (others idle), releases, then runs `after` ticks. Returns all events. */
function chargedShot(s: SimState, frames: number, after: number, aim = aimX): SimEvent[] {
  const n = s.tanks.length;
  const others = Array.from({ length: n - 1 }, () => idle);
  const ev = run(s, frames, [{ ...hold, aim }, ...others]);
  ev.push(...run(s, after, [{ ...free, aim }, ...others]));
  return ev;
}
const fullFrames = (cls: 'heavy' | 'standard' | 'artillery'): number => Math.ceil(TANKS[cls].chargeTime * 60) + 3;
const hitsOn = (ev: SimEvent[], id: number): number[] => ev.filter((e) => e.type === 'hit' && e.target === id).map((e) => (e as { damage: number }).damage);

describe('round 07 — Scout spray 6/s', () => {
  it('fires 6 bullets per second', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 5.5, y: 15.5 }]);
    const ev = run(s, 120, [hold]);
    const shots = ev.filter((e) => e.type === 'fire').length;
    expect(shots).toBeGreaterThanOrEqual(11);
    expect(shots).toBeLessThanOrEqual(13);
  });
});

describe('round 07 — Heavy charged shot', () => {
  it('flies like a laser at full charge, normal speed on a tap', () => {
    const s = arena([{ team: 0, cls: 'heavy', x: 5.5, y: 15.5 }]);
    run(s, fullFrames('heavy'), [hold]);
    run(s, 1, [free]);
    const sh = s.shells[0];
    expect(Math.hypot(sh.vx, sh.vy)).toBeCloseTo(TANKS.heavy.charged!.speedAtFull!, 0);
    expect(sh.special).toBe('shock');
    const t = arena([{ team: 0, cls: 'heavy', x: 5.5, y: 15.5 }]);
    run(t, 2, [hold]);
    run(t, 1, [free]);
    expect(Math.hypot(t.shells[0].vx, t.shells[0].vy)).toBeCloseTo(TANKS.heavy.shellSpeed, 0);
    expect(t.shells[0].special).toBe('none');
  });

  it('shock wave hits nearby enemies for 30 %, not the hit tank and not allies', () => {
    const s = arena([
      { team: 0, cls: 'heavy', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 10.5, y: 15.5 }, // hit
      { team: 1, cls: 'standard', x: 10.5, y: 17.7 }, // 2.2 away: outside the blast splash, inside the shock
      { team: 0, cls: 'standard', x: 11.5, y: 13.6 }, // ally next to the target
    ]);
    const ev = chargedShot(s, fullFrames('heavy'), 30);
    expect(ev.some((e) => e.type === 'explode' && e.kind === 'shock')).toBe(true);
    const direct = hitsOn(ev, 1);
    expect(direct.length).toBe(1); // only the shell itself
    const near = hitsOn(ev, 2);
    expect(near.length).toBe(1);
    expect(near[0] / direct[0]).toBeCloseTo(TANKS.heavy.charged!.shock!.ratio, 2); // same armor → 30 % of the hit
    expect(hitsOn(ev, 3).length).toBe(0);
  });

  it('destroying the hit tank adds a 15 % wreck explosion', () => {
    const s = arena([
      { team: 0, cls: 'heavy', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 10.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 10.5, y: 16.9 },
    ]);
    s.tanks[1].hp = 10;
    const ev = chargedShot(s, fullFrames('heavy'), 30);
    expect(s.tanks[1].alive).toBe(false);
    expect(ev.some((e) => e.type === 'explode' && e.kind === 'wreck')).toBe(true);
    const shell = TANKS.heavy.damage * 3; // full charge (perfect bonus possible)
    const lost = TANKS.standard.hp - s.tanks[2].hp;
    expect(lost).toBeGreaterThanOrEqual(shell * (0.3 + 0.15) * (1 - TANKS.standard.armor) - 1);
  });
});

describe('round 07 — Standard pierce', () => {
  it('a charged shot passes through the first tank and hits the second for half', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 4.5, y: 15.5 },
      { team: 1, cls: 'scout', x: 7.5, y: 15.5 },
      { team: 1, cls: 'scout', x: 10.5, y: 15.5 },
    ]);
    const ev = chargedShot(s, fullFrames('standard'), 40);
    const a = hitsOn(ev, 1);
    const b = hitsOn(ev, 2);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(b.length).toBeGreaterThanOrEqual(1);
    expect(b[b.length - 1] / a[0]).toBeCloseTo(TANKS.standard.charged!.pierce!.ratio, 1);
  });

  it('a tap does not pierce', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 4.5, y: 15.5 },
      { team: 1, cls: 'scout', x: 7.5, y: 15.5 },
      { team: 1, cls: 'scout', x: 10.5, y: 15.5 },
    ]);
    const ev = chargedShot(s, 2, 40);
    expect(hitsOn(ev, 2).length).toBe(0);
  });
});

describe('round 07 — Artillery fire patch', () => {
  it('burns enemies inside for 2 s, never allies, then goes out; fixed size', () => {
    const s = arena(
      [
        { team: 0, cls: 'artillery', x: 4.5, y: 15.5 },
        { team: 1, cls: 'heavy', x: 12.5, y: 15.5 },
        { team: 0, cls: 'heavy', x: 12.5, y: 16.2 },
      ],
      { rules: { fullVisibility: true } },
    );
    const ev = chargedShot(s, fullFrames('artillery'), 80, AIM_AUTO); // flight ≈ 1.06 s
    expect(s.fires.length).toBe(1);
    const r0 = s.fires[0].r;
    const ev2 = run(s, 150, [idle, idle, idle]);
    const burn = hitsOn(ev2, 1);
    expect(burn.length).toBeGreaterThanOrEqual(6); // ≈ 8 chunks in 2 s
    expect(hitsOn([...ev, ...ev2], 2).length).toBe(0); // ally untouched
    expect(s.fires.length).toBe(0);
    expect(r0).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { arena, run, idle, wall, secs } from './helpers';
import { ABILITIES, TANKS } from '../src/sim/config';
import { AIM_AUTO, BTN_ABILITY, BTN_FIRE, BTN_ULT, quantizeAim } from '../src/sim/input';
import { canSeeTank, updateVision } from '../src/sim/visibility';
import { abilityParam } from '../src/sim/abilities/params';
import type { SimEvent } from '../src/sim/state';
import { Ground } from '../src/world/terrain';

const press = { ...idle, buttons: BTN_ABILITY };
const pressUlt = { ...idle, buttons: BTN_ULT };
const num = (v: unknown): number => Number(v);

describe('ability framework', () => {
  it('cooldown starts only after the effect ends, and respects the dev cooldown multiplier', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 10.5, y: 10.5 }]);
    run(s, 1, [press]);
    const a = s.tanks[0].ability;
    expect(a.active).toBeGreaterThan(num(ABILITIES.swift.duration) - 0.1);
    expect(a.cooldown).toBe(0);
    run(s, secs(num(ABILITIES.swift.duration)) + 1, [idle]);
    expect(a.active).toBe(0);
    expect(a.cooldown).toBeCloseTo(num(ABILITIES.swift.cooldown), 1);
    const s2 = arena([{ team: 0, cls: 'standard', x: 10.5, y: 10.5 }], { rules: { cooldownMul: 0.5 } });
    run(s2, 1, [press]);
    run(s2, secs(num(ABILITIES.swift.duration)) + 1, [idle]);
    expect(s2.tanks[0].ability.cooldown).toBeCloseTo(num(ABILITIES.swift.cooldown) * 0.5, 1);
  });

  it('upgrades are parameter modifiers (ability-tree ready)', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 10.5, y: 10.5 }]);
    const t = s.tanks[0];
    expect(abilityParam(t, 'duration')).toBe(5);
    t.ability.mods.push({ key: 'duration', op: 'add', value: 2 }, { key: 'duration', op: 'mul', value: 1.5 });
    expect(abilityParam(t, 'duration')).toBeCloseTo(10.5, 6);
  });
});

describe('Scout — Hide', () => {
  it('invisible for its duration, then visible; then the cooldown runs', () => {
    const s = arena([
      { team: 0, cls: 'scout', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 13.5, y: 10.5 },
    ]);
    run(s, 1, [press, idle]);
    updateVision(s);
    expect(canSeeTank(s, 1, s.tanks[0])).toBe(false);
    run(s, secs(num(ABILITIES.hide.duration)) + 2, [idle, idle]);
    expect(canSeeTank(s, 1, s.tanks[0])).toBe(true);
    expect(s.tanks[0].ability.cooldown).toBeGreaterThan(num(ABILITIES.hide.cooldown) - 0.1);
  });

  it('firing ends invisibility immediately and starts the cooldown', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 10.5, y: 10.5 }]);
    run(s, 1, [press]);
    run(s, 2, [{ ...idle, buttons: BTN_FIRE }]);
    run(s, 1, [idle]);
    expect(s.tanks[0].ability.active).toBe(0);
    expect(s.tanks[0].ability.cooldown).toBeGreaterThan(num(ABILITIES.hide.cooldown) - 0.1);
  });

  it('getting hit while invisible shimmers but stays invisible', () => {
    const s = arena([
      { team: 0, cls: 'scout', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 7.5, y: 10.5 },
    ]);
    run(s, 90, [idle, { ...idle, aim: quantizeAim(0) }]); // enemy turns its turret first
    run(s, 1, [press, idle]);
    run(s, 2, [idle, { ...idle, aim: quantizeAim(0), buttons: BTN_FIRE }]);
    run(s, 40, [idle, { ...idle, aim: quantizeAim(0) }]);
    expect(s.tanks[0].hp).toBeLessThan(TANKS.scout.hp);
    expect(s.tanks[0].ability.active).toBeGreaterThan(0);
    updateVision(s);
    expect(canSeeTank(s, 1, s.tanks[0])).toBe(false);
  });
});

describe('Heavy — Rumble', () => {
  it('damages and knocks back nearby enemies with the same damage centre to edge, not through walls', () => {
    const s = arena([
      { team: 0, cls: 'heavy', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 11.6, y: 10.5 }, // close
      { team: 1, cls: 'standard', x: 10.5, y: 12.4 }, // farther
      { team: 1, cls: 'standard', x: 8.6, y: 10.5 }, // behind a wall
    ]);
    s.map.feature[10 * 30 + 9] = 3; // wall between heavy and tank 3
    s.map.hp[10 * 30 + 9] = 120;
    run(s, 1, [press, idle, idle, idle]);
    const dmg = (i: number) => TANKS.standard.hp - s.tanks[i].hp;
    expect(dmg(1)).toBeCloseTo(dmg(2), 3); // flat damage across the whole radius (owner 2026-10-11)
    expect(dmg(2)).toBeGreaterThan(0);
    expect(dmg(3)).toBe(0);
    expect(s.tanks[1].kx).toBeGreaterThan(1);
    expect(s.tanks[0].ability.cooldown).toBeCloseTo(num(ABILITIES.rumble.cooldown), 1);
  });

  it('knockback never pushes a tank into deep water', () => {
    const s = arena([
      { team: 0, cls: 'heavy', x: 10.5, y: 10.5 },
      { team: 1, cls: 'scout', x: 11.5, y: 10.5 },
    ]);
    for (let y = 0; y < 30; y++) s.map.ground[y * 30 + 12] = Ground.Deep;
    run(s, 1, [press, idle]);
    run(s, 60, [idle, idle]);
    expect(Math.floor(s.tanks[1].x)).toBeLessThan(12);
  });
});

describe('Standard — Swift', () => {
  it('doubles speed and fire rate, halves charge time, without passing through walls', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 5.5, y: 10.5 }]);
    wall(s.map, 12, 0, 29);
    run(s, 1, [press]);
    run(s, 60, [{ ...idle, moveX: 127 }]);
    const v = Math.hypot(s.tanks[0].vx, s.tanks[0].vy);
    expect(v).toBeCloseTo(TANKS.standard.maxSpeed * 2, 0);
    run(s, 120, [{ ...idle, moveX: 127 }]);
    expect(s.tanks[0].x).toBeLessThan(12 - TANKS.standard.radius + 0.01);
    // fire cooldown halved
    run(s, 2, [{ ...idle, buttons: BTN_FIRE }]);
    run(s, 1, [idle]);
    expect(s.tanks[0].cooldown).toBeCloseTo(TANKS.standard.fireCooldown / 2, 1);
  });
});

describe('Artillery — Barrage', () => {
  it('fires all its warned shells within its short duration, slows the tank and blocks normal fire meanwhile', () => {
    const def = ABILITIES.barrage;
    const s = arena([
      { team: 0, cls: 'artillery', x: 5.5, y: 10.5 },
      { team: 1, cls: 'heavy', x: 10.5, y: 10.5 },
    ]);
    run(s, 5, [{ ...idle, aim: AIM_AUTO }, idle]);
    const ev: SimEvent[] = run(s, 1, [{ ...idle, aim: AIM_AUTO, buttons: BTN_ULT }, idle]);
    const fireTicks: number[] = []; // callback sees the previous step's events → tick k = shot of step k-1
    let tick = 0;
    let speedDuring = 0;
    const evs = ev.concat(
      run(s, secs(Number(def.duration) + 0.5), (st) => {
        tick++;
        if (tick === secs(Number(def.duration) / 2)) speedDuring = Math.hypot(st.tanks[0].vx, st.tanks[0].vy);
        if (st.events.some((e) => e.type === 'fire')) fireTicks.push(tick);
        // holds fire the whole time: no normal shot may leave while the barrage lasts
        return [{ ...idle, aim: AIM_AUTO, moveX: 127, buttons: tick < secs(Number(def.duration)) ? BTN_FIRE : 0 }, idle];
      }),
    );
    const warned = s.shells.filter((x) => x.warn).length + evs.filter((e) => e.type === 'explode' && e.kind === 'artillery').length;
    expect(warned).toBe(def.shots);
    expect(evs.filter((e) => e.type === 'fire').length).toBe(def.shots);
    expect(fireTicks[fireTicks.length - 1] - 1).toBeLessThanOrEqual(secs(1));
    expect(speedDuring).toBeGreaterThan(0);
    expect(speedDuring).toBeLessThan(TANKS.artillery.maxSpeed * 0.45);
    run(s, 120, [idle, idle]);
  });

  it('scatter uses the seeded RNG: same seed → same landing points', () => {
    const land = () => {
      const s = arena([
        { team: 0, cls: 'artillery', x: 5.5, y: 10.5 },
        { team: 1, cls: 'heavy', x: 10.5, y: 10.5 },
      ]);
      run(s, 1, [{ ...idle, aim: AIM_AUTO, buttons: BTN_ULT }, idle]);
      const pts: string[] = [];
      run(s, secs(5), (st) => {
        for (const sh of st.shells) if (!pts.includes(`${sh.id}`)) pts.push(`${sh.id}`, `${sh.tx.toFixed(6)},${sh.ty.toFixed(6)}`);
        return [{ ...idle, aim: AIM_AUTO }, idle];
      });
      return pts.join('|');
    };
    expect(land()).toBe(land());
  });
});

describe('Trapper — Mine', () => {
  it('max 3 active mines (4th removes the oldest), 2 s cooldown', () => {
    const s = arena([{ team: 0, cls: 'trapper', x: 5.5, y: 10.5 }]);
    const ids: number[] = [];
    for (let k = 0; k < 4; k++) {
      run(s, 1, [{ ...idle, moveX: 127, buttons: BTN_ABILITY }]);
      run(s, secs(0.3) + 2, [{ ...idle, moveX: 127 }]);
      ids.push(...s.mines.map((m) => m.id).filter((id) => !ids.includes(id)));
      expect(s.tanks[0].ability.cooldown).toBeGreaterThan(1.8);
      run(s, secs(2.1), [{ ...idle, moveX: 127 }]);
    }
    expect(s.mines).toHaveLength(3);
    expect(s.mines.map((m) => m.id)).not.toContain(ids[0]);
  });

  it('enemies trigger it (damage + knockback, kill credited to the trapper); allies do not', () => {
    const s = arena([
      { team: 0, cls: 'trapper', x: 10.5, y: 10.5 },
      { team: 0, cls: 'standard', x: 3.5, y: 3.5 },
      { team: 1, cls: 'scout', x: 20.5, y: 10.5 },
    ]);
    run(s, 1, [press, idle, idle]);
    run(s, secs(1), [idle, idle, idle]);
    expect(s.mines).toHaveLength(1);
    const m = s.mines[0];
    // ally drives over it
    s.tanks[1].x = m.x;
    s.tanks[1].y = m.y;
    run(s, 5, [idle, idle, idle]);
    expect(s.mines).toHaveLength(1);
    s.tanks[1].x = 3.5;
    s.tanks[1].y = 3.5;
    s.tanks[2].hp = 10;
    s.tanks[2].x = m.x + 0.3;
    s.tanks[2].y = m.y;
    run(s, 3, [idle, idle, idle]);
    expect(s.mines).toHaveLength(0);
    expect(s.tanks[2].alive).toBe(false);
    expect(s.tanks[0].kills).toBe(1);
    expect(s.match.kills.at(-1)).toMatchObject({ killer: 0, victim: 2, cause: 'mine' });
  });
});

describe('ultimate slot and the new abilities (round 04)', () => {
  it('every class has a skill, three of four have the expected ultimate; skills use BTN_ABILITY, ultimates BTN_ULT', () => {
    expect(TANKS.scout.ult).toBe('overdrive');
    expect(TANKS.heavy.ult).toBe('repair');
    expect(TANKS.standard.ult).toBe('emp');
    expect(TANKS.artillery.ult).toBe('barrage');
    expect(TANKS.artillery.ability).toBe('readyshot');
    const s = arena([{ team: 0, cls: 'standard', x: 10.5, y: 10.5 }]);
    run(s, 1, [press]);
    expect(s.tanks[0].ability.active).toBeGreaterThan(0);
    expect(s.tanks[0].ult?.active).toBe(0);
    run(s, 1, [pressUlt]);
    expect(s.tanks[0].ult?.cooldown).toBeCloseTo(num(ABILITIES.emp.cooldown), 1);
  });

  it('Scout Aşırı Yük triples the spray rate for its duration, then the cooldown runs', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 10.5, y: 10.5 }]);
    const rate = TANKS.scout.spray!.rate;
    const shots = (n: number, input: typeof idle): number => run(s, n, [input]).filter((e) => e.type === 'fire').length;
    const hold = { ...idle, buttons: BTN_FIRE };
    const normal = shots(secs(1), hold);
    expect(normal).toBeGreaterThanOrEqual(rate - 1);
    expect(normal).toBeLessThanOrEqual(rate + 1);
    run(s, 1, [pressUlt]);
    const boosted = shots(secs(1), hold);
    expect(boosted).toBeGreaterThanOrEqual(rate * 3 - 3);
    expect(boosted).toBeLessThanOrEqual(rate * 3 + 3);
    run(s, secs(num(ABILITIES.overdrive.duration)), [idle]);
    expect(s.tanks[0].ult?.active).toBe(0);
    expect(s.tanks[0].ult?.cooldown).toBeGreaterThan(num(ABILITIES.overdrive.cooldown) - 6);
  });

  it('Heavy Onarım fully heals at once; refused (no cooldown) at full health', () => {
    const s = arena([{ team: 0, cls: 'heavy', x: 10.5, y: 10.5 }]);
    run(s, 1, [pressUlt]);
    expect(s.tanks[0].ult?.cooldown).toBe(0); // refused: already full
    run(s, 1, [idle]); // release: the ultimate needs a fresh press
    s.tanks[0].hp = 1000;
    run(s, 1, [pressUlt]);
    expect(s.tanks[0].hp).toBeCloseTo(TANKS.heavy.hp, 3);
    expect(s.tanks[0].ult?.cooldown).toBeCloseTo(num(ABILITIES.repair.cooldown), 1);
  });

  it('Standard EMP stuns enemies in its radius (no move, no fire) for the stun time, not far ones', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 12.5, y: 10.5 }, // inside
      { team: 1, cls: 'standard', x: 20.5, y: 10.5 }, // outside
    ]);
    s.tanks[0].protect = s.tanks[1].protect = s.tanks[2].protect = 0;
    run(s, 1, [pressUlt, idle, idle]);
    expect(s.tanks[1].stun).toBeGreaterThan(num(ABILITIES.emp.stun) - 0.1);
    expect(s.tanks[2].stun).toBe(0);
    const x0 = s.tanks[1].x;
    const ev = run(s, secs(1), [idle, { ...idle, moveX: 127, buttons: BTN_FIRE }, idle]);
    expect(Math.abs(s.tanks[1].x - x0)).toBeLessThan(0.05);
    expect(ev.filter((e) => e.type === 'fire')).toHaveLength(0);
    run(s, secs(num(ABILITIES.emp.stun)), [idle, idle, idle]);
    expect(s.tanks[1].stun).toBe(0);
    run(s, 30, [idle, { ...idle, moveX: 127 }, idle]);
    expect(s.tanks[1].x).toBeGreaterThan(x0 + 0.2);
  });

  it('Artillery Hazır Atış fires at once at full reach, then ends and starts its cooldown', () => {
    const s = arena([{ team: 0, cls: 'artillery', x: 5.5, y: 10.5 }]);
    run(s, 5, [{ ...idle, aim: quantizeAim(0) }]);
    run(s, 1, [{ ...press, aim: quantizeAim(0) }]);
    expect(s.tanks[0].ability.active).toBeGreaterThan(0);
    const ev = run(s, 1, [{ ...idle, aim: quantizeAim(0), buttons: BTN_FIRE }]);
    const fired = ev.find((e) => e.type === 'fire');
    expect(fired).toBeDefined();
    const sh = s.shells[0];
    expect(sh.tx - 5.5).toBeGreaterThan(TANKS.artillery.range - 0.5); // full reach, no charge-up
    expect(s.tanks[0].ability.active).toBe(0);
    expect(s.tanks[0].ability.cooldown).toBeGreaterThan(0);
  });

  it('Scout spray: no charging, small bullets, ~rate per second, bounded sideways error', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 5.5, y: 10.5 }]);
    const ev = run(s, secs(1), [{ ...idle, aim: quantizeAim(0), buttons: BTN_FIRE }]);
    const fires = ev.filter((e) => e.type === 'fire');
    expect(fires.length).toBeGreaterThanOrEqual(TANKS.scout.spray!.rate - 1);
    expect(s.tanks[0].charging).toBe(false);
    for (const sh of s.shells) {
      expect(sh.damage).toBe(TANKS.scout.spray!.damage);
      expect(Math.abs(Math.atan2(sh.vy, sh.vx))).toBeLessThanOrEqual(TANKS.scout.spray!.spread + 0.02);
    }
  });
});

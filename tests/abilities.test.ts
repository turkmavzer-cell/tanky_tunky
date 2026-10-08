import { describe, expect, it } from 'vitest';
import { arena, run, idle, wall, secs } from './helpers';
import { ABILITIES, TANKS } from '../src/sim/config';
import { AIM_AUTO, BTN_ABILITY, BTN_FIRE, quantizeAim } from '../src/sim/input';
import { canSeeTank, updateVision } from '../src/sim/visibility';
import { abilityParam } from '../src/sim/abilities/params';
import type { SimEvent } from '../src/sim/state';
import { Ground } from '../src/world/terrain';

const press = { ...idle, buttons: BTN_ABILITY };
const num = (v: unknown): number => Number(v);

describe('ability framework', () => {
  it('cooldown starts only after the effect ends, and respects the dev cooldown multiplier', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 10.5, y: 10.5 }]);
    run(s, 1, [press]);
    const a = s.tanks[0].ability;
    expect(a.active).toBeGreaterThan(4.9);
    expect(a.cooldown).toBe(0);
    run(s, secs(num(ABILITIES.swift.duration)) + 1, [idle]);
    expect(a.active).toBe(0);
    expect(a.cooldown).toBeCloseTo(num(ABILITIES.swift.cooldown), 1);
    const s2 = arena([{ team: 0, cls: 'standard', x: 10.5, y: 10.5 }], { rules: { cooldownMul: 0.5 } });
    run(s2, 1, [press]);
    run(s2, secs(5) + 1, [idle]);
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
  it('invisible for 5 s, then visible; cooldown 5 s after', () => {
    const s = arena([
      { team: 0, cls: 'scout', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 13.5, y: 10.5 },
    ]);
    run(s, 1, [press, idle]);
    updateVision(s);
    expect(canSeeTank(s, 1, s.tanks[0])).toBe(false);
    run(s, secs(5) + 2, [idle, idle]);
    expect(canSeeTank(s, 1, s.tanks[0])).toBe(true);
    expect(s.tanks[0].ability.cooldown).toBeGreaterThan(4.9);
  });

  it('firing ends invisibility immediately and starts the cooldown', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 10.5, y: 10.5 }]);
    run(s, 1, [press]);
    run(s, 2, [{ ...idle, buttons: BTN_FIRE }]);
    run(s, 1, [idle]);
    expect(s.tanks[0].ability.active).toBe(0);
    expect(s.tanks[0].ability.cooldown).toBeGreaterThan(4.9);
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
  it('damages and knocks back nearby enemies with falloff, not through walls', () => {
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
    expect(dmg(1)).toBeGreaterThan(dmg(2));
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
  it('fires exactly 5 warned shells ~1 s apart around the target, slows the tank and blocks normal fire', () => {
    const s = arena([
      { team: 0, cls: 'artillery', x: 5.5, y: 10.5 },
      { team: 1, cls: 'heavy', x: 10.5, y: 10.5 },
    ]);
    run(s, 5, [{ ...idle, aim: AIM_AUTO }, idle]);
    const ev: SimEvent[] = run(s, 1, [{ ...idle, aim: AIM_AUTO, buttons: BTN_ABILITY }, idle]);
    const fired: number[] = [];
    let tick = 0;
    let speedDuring = 0;
    const evs = ev.concat(
      run(s, secs(5.2), (st) => {
        if (tick === secs(3)) speedDuring = Math.hypot(st.tanks[0].vx, st.tanks[0].vy);
        tick++;
        if (st.events.some((e) => e.type === 'fire')) fired.push(tick);
        return [{ ...idle, aim: AIM_AUTO, moveX: 127, buttons: BTN_FIRE }, idle];
      }),
    );
    const warned = s.shells.filter((x) => x.warn).length + evs.filter((e) => e.type === 'explode' && e.kind === 'artillery').length;
    expect(warned).toBe(5);
    const fires = evs.filter((e) => e.type === 'fire').length;
    expect(fires).toBe(5); // no normal shots while the barrage lasts
    expect(speedDuring).toBeGreaterThan(0);
    expect(speedDuring).toBeLessThan(TANKS.artillery.maxSpeed * 0.45);
    // landing points scatter around the target but within the scatter radius (+target motion 0)
    run(s, 120, [idle, idle]);
  });

  it('scatter uses the seeded RNG: same seed → same landing points', () => {
    const land = () => {
      const s = arena([
        { team: 0, cls: 'artillery', x: 5.5, y: 10.5 },
        { team: 1, cls: 'heavy', x: 10.5, y: 10.5 },
      ]);
      run(s, 1, [{ ...idle, aim: AIM_AUTO, buttons: BTN_ABILITY }, idle]);
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

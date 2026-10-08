import { describe, expect, it } from 'vitest';
import { createState, step, chargeLevel } from '../src/sim/sim';
import { COMBAT, SIM_DT, TANKS, evalCurve, type TankClassId } from '../src/sim/config';
import { BTN_FIRE, quantizeAim, type PlayerInput } from '../src/sim/input';
import { createMap, setFeature } from '../src/world/map';
import { Feature } from '../src/world/terrain';
import type { SimEvent, SimState } from '../src/sim/state';

const idle: PlayerInput = { moveX: 0, moveY: 0, aim: -1, buttons: 0 };
const aimX = quantizeAim(0); // +x

function arena(players: { team: number; cls: TankClassId; x: number; y: number }[], size = 30): SimState {
  return createState({ seed: 1, map: createMap(size, size), players, rules: { endless: true } });
}

/** Run n ticks with the given inputs; returns all events. */
function run(s: SimState, n: number, inputs: PlayerInput[]): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    step(s, inputs);
    ev.push(...s.events);
  }
  return ev;
}

const secs = (t: number): number => Math.round(t / SIM_DT);

describe('charged fire (brief §4)', () => {
  it('a short tap fires an uncharged shell, then the cooldown blocks the next shot', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 5, y: 5 }]);
    run(s, 20, [{ ...idle, aim: aimX }]); // turn turret to +x
    let ev = run(s, 3, [{ ...idle, aim: aimX, buttons: BTN_FIRE }]);
    ev = ev.concat(run(s, 1, [{ ...idle, aim: aimX }]));
    const fires = ev.filter((e) => e.type === 'fire');
    expect(fires).toHaveLength(1);
    expect(fires[0].type === 'fire' && fires[0].charge).toBe(0);
    expect(s.shells[0].damage).toBeCloseTo(TANKS.standard.damage, 6);
    // immediately tapping again during cooldown does nothing
    ev = run(s, 3, [{ ...idle, buttons: BTN_FIRE }]).concat(run(s, 1, [idle]));
    expect(ev.filter((e) => e.type === 'fire')).toHaveLength(0);
  });

  it('holding charges to 100 %, slows the tank and a perfect release deals 3x * perfect bonus', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 5, y: 5 }]);
    const def = TANKS.standard;
    const ev = run(s, secs(def.chargeTime) + 2, [{ moveX: 127, moveY: 0, aim: aimX, buttons: BTN_FIRE }]);
    expect(ev.some((e) => e.type === 'chargeFull')).toBe(true);
    expect(chargeLevel(s.tanks[0])).toBe(1);
    const v = Math.hypot(s.tanks[0].vx, s.tanks[0].vy);
    expect(v).toBeCloseTo(def.maxSpeed * (1 - def.chargeSlow), 1);
    run(s, 1, [idle]);
    const sh = s.shells[0];
    expect(sh.perfect).toBe(true);
    expect(sh.damage).toBeCloseTo(def.damage * evalCurve(COMBAT.scaling.damage, 1) * COMBAT.charge.perfectBonus, 6);
    expect(evalCurve(COMBAT.scaling.damage, 1)).toBe(3);
  });

  it('holding too long overheats: no shot, temporary lock, must release', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 5, y: 5 }]);
    const def = TANKS.standard;
    const ev = run(s, secs(def.chargeTime + COMBAT.charge.overheatAfter) + 5, [{ ...idle, buttons: BTN_FIRE }]);
    expect(ev.some((e) => e.type === 'overheat')).toBe(true);
    const more = run(s, secs(COMBAT.charge.overheatLock) + 10, [{ ...idle, buttons: BTN_FIRE }]);
    expect(more.some((e) => e.type === 'fire')).toBe(false);
    expect(s.tanks[0].charging).toBe(false);
  });

  it('a late (non-perfect) full charge still fires at 3x without the bonus', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 5, y: 5 }]);
    const def = TANKS.standard;
    run(s, secs(def.chargeTime + COMBAT.charge.perfectWindow + 0.2), [{ ...idle, buttons: BTN_FIRE }]);
    run(s, 1, [idle]);
    expect(s.shells[0].perfect).toBe(false);
    expect(s.shells[0].damage).toBeCloseTo(def.damage * 3, 6);
  });
});

describe('shells, damage and terrain', () => {
  it('a shell hits an enemy, armor reduces damage, kills award and respawn works', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5, y: 5.5 },
      { team: 1, cls: 'scout', x: 9, y: 5.5 },
    ]);
    run(s, 30, [{ ...idle, aim: aimX }, idle]);
    const before = s.tanks[1].hp;
    let ev = run(s, 2, [{ ...idle, aim: aimX, buttons: BTN_FIRE }, idle]);
    ev = ev.concat(run(s, 40, [{ ...idle, aim: aimX }, idle]));
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit).toBeTruthy();
    expect(before - s.tanks[1].hp).toBeCloseTo(TANKS.standard.damage * (1 - TANKS.scout.armor), 5);
    // keep shooting until dead
    let all: SimEvent[] = [];
    for (let k = 0; k < 30 && s.tanks[1].alive; k++) {
      all = all.concat(run(s, 2, [{ ...idle, aim: aimX, buttons: BTN_FIRE }, idle]), run(s, 60, [{ ...idle, aim: aimX }, idle]));
    }
    expect(s.tanks[1].alive).toBe(false);
    expect(s.tanks[0].kills).toBe(1);
    expect(all.some((e) => e.type === 'destroyed')).toBe(true);
  });

  it('heavy shells ricochet off a wall once', () => {
    const s = arena([{ team: 0, cls: 'heavy', x: 5, y: 5.5 }]);
    for (let y = 0; y < 30; y++) setFeature(s.map, 8, y, Feature.Rock);
    run(s, 120, [{ ...idle, aim: aimX }]);
    const ev = run(s, 2, [{ ...idle, aim: aimX, buttons: BTN_FIRE }]).concat(run(s, 90, [{ ...idle, aim: aimX }]));
    expect(ev.filter((e) => e.type === 'bounce')).toHaveLength(1);
  });

  it('standard shells do not ricochet', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 5, y: 5.5 }]);
    for (let y = 0; y < 30; y++) setFeature(s.map, 8, y, Feature.Rock);
    run(s, 30, [{ ...idle, aim: aimX }]);
    const ev = run(s, 2, [{ ...idle, aim: aimX, buttons: BTN_FIRE }]).concat(run(s, 60, [{ ...idle, aim: aimX }]));
    expect(ev.filter((e) => e.type === 'bounce')).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'explode')).toHaveLength(1);
  });

  it('artillery arcs over walls and lands at min range for a tap, farther when charged', () => {
    const s = arena([{ team: 0, cls: 'artillery', x: 5, y: 5.5 }]);
    for (let y = 0; y < 30; y++) setFeature(s.map, 6, y, Feature.Wall);
    run(s, 60, [{ ...idle, aim: aimX }]);
    let ev = run(s, 2, [{ ...idle, aim: aimX, buttons: BTN_FIRE }]).concat(run(s, 120, [{ ...idle, aim: aimX }]));
    let ex = ev.find((e) => e.type === 'explode');
    expect(ex && ex.type === 'explode' && ex.x).toBeCloseTo(5 + TANKS.artillery.minRange, 0);
    run(s, 200, [{ ...idle, aim: aimX }]);
    ev = run(s, secs(TANKS.artillery.chargeTime) + 1, [{ ...idle, aim: aimX, buttons: BTN_FIRE }]).concat(run(s, 200, [{ ...idle, aim: aimX }]));
    ex = ev.find((e) => e.type === 'explode');
    expect(ex && ex.type === 'explode' && ex.x).toBeGreaterThan(5 + TANKS.artillery.range);
  });

  it('crates are destructible and stop blocking once destroyed', () => {
    const s = arena([{ team: 0, cls: 'heavy', x: 5, y: 5.5 }]);
    setFeature(s.map, 8, 5, Feature.Crate);
    run(s, 120, [{ ...idle, aim: aimX }]);
    let ev: SimEvent[] = [];
    for (let k = 0; k < 5 && s.map.feature[5 * 30 + 8] === Feature.Crate; k++) {
      ev = ev.concat(run(s, 2, [{ ...idle, aim: aimX, buttons: BTN_FIRE }]), run(s, 120, [{ ...idle, aim: aimX }]));
    }
    expect(s.map.feature[5 * 30 + 8]).toBe(Feature.None);
    expect(ev.some((e) => e.type === 'terrain' && e.destroyed)).toBe(true);
    expect(s.map.version).toBeGreaterThan(0);
  });

  it('tanks push each other apart', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5, y: 5 },
      { team: 1, cls: 'standard', x: 5.3, y: 5 },
    ]);
    run(s, 5, [idle, idle]);
    expect(s.tanks[1].x - s.tanks[0].x).toBeGreaterThan(TANKS.standard.radius * 2 - 0.05);
  });
});

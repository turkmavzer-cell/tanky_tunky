import { describe, expect, it } from 'vitest';
import { arena, run, idle, secs } from './helpers';
import { COMBAT, TANKS } from '../src/sim/config';
import { applyDamage, damageTerrainDisc, killTank } from '../src/sim/combat';
import { maxHp } from '../src/sim/upgrades';
import { setFeature } from '../src/world/map';
import { Feature } from '../src/world/terrain';
import { BTN_FIRE } from '../src/sim/input';
import type { SimState } from '../src/sim/state';

const UP = COMBAT.upgrades;
const RG = COMBAT.regen;

/** Puts a crate on tile (x, y) and destroys it; returns the spawned pickup. */
function breakCrate(s: SimState, x: number, y: number) {
  setFeature(s.map, x, y, Feature.Crate);
  damageTerrainDisc(s, x + 0.5, y + 0.5, 0.3, 9999);
  return s.pickups[s.pickups.length - 1];
}

describe('crate upgrades (round 03, D-038)', () => {
  it('a destroyed crate drops a pickup; driving over it adds +5 % max hp and +5 % damage', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 10.5 },
      { team: 1, cls: 'heavy', x: 20.5, y: 10.5 },
    ]);
    const p = breakCrate(s, 7, 10);
    expect(p).toBeDefined();
    expect(s.map.feature[10 * s.map.width + 7]).toBe(Feature.None);
    const t = s.tanks[0];
    const hp0 = t.hp;
    run(s, secs(1.5), [{ ...idle, moveX: 127 }, idle]); // drive east over it
    expect(t.upgrades).toBe(1);
    expect(s.pickups.length).toBe(0);
    expect(maxHp(t)).toBeCloseTo(TANKS.standard.hp * (1 + UP.perPickup), 6);
    expect(t.hp).toBeCloseTo(hp0 + TANKS.standard.hp * UP.perPickup, 6);
    // damage dealt is scaled too
    const e = s.tanks[1];
    const before = e.hp;
    applyDamage(s, e, 1000, t.id, e.x, e.y, 'shell');
    expect(before - e.hp).toBeCloseTo(1000 * (1 + UP.perPickup) * (1 - TANKS.heavy.armor), 6);
  });

  it('caps at max pickups (60 %), and every upgrade is lost on death', () => {
    const s = arena([{ team: 0, cls: 'scout', x: 5.5, y: 5.5 }]);
    const t = s.tanks[0];
    for (let k = 0; k < UP.max + 3; k++) {
      breakCrate(s, 5, 7);
      t.x = 5.5;
      t.y = 7.5;
      run(s, 1, [idle]);
      s.crateRespawns.length = 0;
      t.x = 5.5;
      t.y = 5.5;
    }
    expect(t.upgrades).toBe(UP.max);
    expect(UP.max * UP.perPickup).toBeCloseTo(0.6, 6);
    expect(s.pickups.length).toBe(3); // the extra pickups stay on the ground
    killTank(s, t, -1, 'environment');
    s.match.phase = 'playing';
    run(s, secs(3), [idle]);
    expect(t.alive).toBe(true);
    expect(t.upgrades).toBe(0);
    expect(t.hp).toBe(TANKS.scout.hp);
  });

  it('the crate rebuilds itself after crateRespawn seconds (once its pickup is gone)', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 3.5, y: 3.5 }]);
    breakCrate(s, 10, 10);
    s.pickups.length = 0; // someone took it
    run(s, secs(UP.crateRespawn - 1), [idle]);
    expect(s.map.feature[10 * s.map.width + 10]).toBe(Feature.None);
    run(s, secs(1.2), [idle]);
    expect(s.map.feature[10 * s.map.width + 10]).toBe(Feature.Crate);
  });
});

describe('out-of-combat regeneration (round 03, D-039)', () => {
  it(`heals ${RG.amount * 100} % of max hp after ${RG.outOfCombat} s out of combat, then every ${RG.interval} s`, () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 5.5 },
      { team: 1, cls: 'standard', x: 20.5, y: 20.5 },
    ]);
    const t = s.tanks[0];
    applyDamage(s, t, 1500, 1, t.x, t.y, 'shell');
    const hurt = t.hp;
    run(s, secs(RG.outOfCombat) - 3, [idle, idle]);
    expect(t.hp).toBe(hurt);
    run(s, 4, [idle, idle]);
    expect(t.hp).toBeCloseTo(hurt + maxHp(t) * RG.amount, 6);
    run(s, secs(RG.interval), [idle, idle]);
    expect(t.hp).toBeCloseTo(hurt + 2 * maxHp(t) * RG.amount, 6);
  });

  it('taking damage or firing restarts the wait; never heals above max hp', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 5.5 },
      { team: 1, cls: 'standard', x: 20.5, y: 20.5 },
    ]);
    const t = s.tanks[0];
    applyDamage(s, t, 1000, 1, t.x, t.y, 'shell');
    run(s, secs(RG.outOfCombat - 1), [idle, idle]);
    applyDamage(s, t, 10, 1, t.x, t.y, 'shell'); // hit again
    const hp1 = t.hp;
    run(s, secs(RG.outOfCombat - 1), [idle, idle]);
    expect(t.hp).toBe(hp1);
    run(s, 2, [{ ...idle, buttons: BTN_FIRE }, idle]); // fires a tap shot
    run(s, 2, [idle, idle]);
    run(s, secs(RG.outOfCombat - 1), [idle, idle]);
    expect(t.hp).toBe(hp1);
    run(s, secs(60), [idle, idle]);
    expect(t.hp).toBeCloseTo(maxHp(t), 6);
  });
});

describe('bots and upgrades', () => {
  it('a patrolling bot drives to a nearby upgrade and collects it', async () => {
    const { AiBot } = await import('../src/systems/ai/bot');
    const { step } = await import('../src/sim/sim');
    const s = arena([
      { team: 0, cls: 'standard', x: 2.5, y: 27.5 }, // far away player
      { team: 1, cls: 'standard', x: 10.5, y: 10.5 },
    ]);
    breakCrate(s, 15, 12);
    const bot = new AiBot(1, 3, 'normal');
    for (let i = 0; i < secs(8) && s.tanks[1].upgrades === 0; i++) step(s, [idle, bot.input(s)]);
    expect(s.tanks[1].upgrades).toBe(1);
  });
});

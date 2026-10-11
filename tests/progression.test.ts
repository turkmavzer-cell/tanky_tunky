import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { LEVELS } from '../src/game/campaign';
import { PROGRESSION, applyMission, boostFor, buyUpgrade, isUnlocked, missionCredits, quickMatchCredits, upgradeCost } from '../src/game/progression';
import { createMatch } from '../src/game/matchSetup';
import { generateThemed } from '../src/world/themes';
import { TANKS } from '../src/sim/config';
import { maxHp } from '../src/sim/upgrades';

const win = (stars: number, time = 200) => ({ won: true, stars, time, deaths: 0, kills: 3 });

describe('progression (round 05, E)', () => {
  it('unlocks levels in order', () => {
    let s = defaultSave();
    expect(isUnlocked(s, 0)).toBe(true);
    expect(isUnlocked(s, 1)).toBe(false);
    s = applyMission(s, LEVELS[0], win(1)).save;
    expect(isUnlocked(s, 1)).toBe(true);
    expect(isUnlocked(s, 2)).toBe(false);
  });

  it('pays base + stars on the first clear and only new stars on replays; losses pay nothing', () => {
    const lv = LEVELS[0];
    expect(missionCredits(lv, 0, win(2))).toBe(lv.reward.base + 2 * lv.reward.perStar);
    expect(missionCredits(lv, 2, win(3))).toBe(lv.reward.perStar);
    expect(missionCredits(lv, 3, win(3))).toBe(0);
    expect(missionCredits(lv, 0, { won: false, stars: 0, time: 0, deaths: 5, kills: 0 })).toBe(0);
    let s = applyMission(defaultSave(), lv, win(2, 250)).save;
    s = applyMission(s, lv, win(1, 180)).save;
    expect(s.campaign.stars[lv.id]).toBe(2); // best kept
    expect(s.campaign.bestTime[lv.id]).toBe(180);
    expect(s.credits).toBe(lv.reward.base + 2 * lv.reward.perStar);
  });

  it('garage: costs rise per level, max level, not enough credits', () => {
    let s = { ...defaultSave(), credits: 10_000 };
    for (let i = 0; i < PROGRESSION.garage.maxLevel; i++) {
      expect(upgradeCost(s, 'heavy', 'armor')).toBe(PROGRESSION.garage.cost[i]);
      s = buyUpgrade(s, 'heavy', 'armor')!;
    }
    expect(upgradeCost(s, 'heavy', 'armor')).toBeNull();
    expect(buyUpgrade(s, 'heavy', 'armor')).toBeNull();
    expect(buyUpgrade({ ...defaultSave(), credits: 1 }, 'scout', 'gun')).toBeNull();
    const b = boostFor(s, 'heavy');
    expect(b.hp).toBeCloseTo(1 + 3 * PROGRESSION.garage.branches.armor.perLevel);
    expect(b.speed).toBe(1);
    expect(boostFor(s, 'scout')).toEqual({ hp: 1, speed: 1, damage: 1 });
  });

  it('the boost reaches the player tank only', () => {
    const map = generateThemed('desert', 3, 40);
    const m = createMatch({ seed: 3, map, teams: [['heavy', 'heavy'], ['heavy']], humanPlayer: true, playerBoost: { hp: 1.12, speed: 1, damage: 1.08 } });
    expect(maxHp(m.state.tanks[0])).toBeCloseTo(TANKS.heavy.hp * 1.12);
    expect(m.state.tanks[0].hp).toBeCloseTo(TANKS.heavy.hp * 1.12);
    expect(maxHp(m.state.tanks[1])).toBe(TANKS.heavy.hp);
  });

  it('quick match credits', () => {
    expect(quickMatchCredits(4, true)).toBe(4 * PROGRESSION.quickMatch.perKill + PROGRESSION.quickMatch.win);
    expect(quickMatchCredits(0, false)).toBe(0);
  });
});

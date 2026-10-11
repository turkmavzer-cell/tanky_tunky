/**
 * Progression (round 05, stream E): credits, campaign stars/unlocks and garage upgrades.
 * Pure functions over SaveData (data/progression.json, data/levels.json) so the UI, tests and tools share them.
 */
import progJson from '../data/progression.json';
import type { CombatClassId } from '../sim/config';
import type { TankBoost } from '../sim/state';
import type { GarageBranch, GarageLevels, SaveData } from '../core/save';
import { LEVELS, type CampaignLevel, type MissionResult } from './campaign';

export type PerkStat = 'hp' | 'fireRate' | 'chargeTime' | 'splash';
export const PROGRESSION = progJson as unknown as {
  garage: { maxLevel: number; cost: number[]; branches: Record<GarageBranch, { stat: 'hp' | 'speed' | 'damage'; perLevel: number }> };
  quickMatch: { perKill: number; win: number };
  parts: { perWin: number; threeStarBonus: number };
  perks: { maxLevel: number; cost: number; classes: Record<CombatClassId, { stat: PerkStat; perLevel: number } | undefined> };
};
export const GARAGE_BRANCHES: readonly GarageBranch[] = ['armor', 'engine', 'gun'];

export function garageOf(save: SaveData, cls: CombatClassId): GarageLevels {
  return { armor: 0, engine: 0, gun: 0, ...(save.garage[cls] ?? {}) };
}

/** Multipliers the garage gives the player's tank of this class. */
export function boostFor(save: SaveData, cls: CombatClassId): TankBoost {
  const g = garageOf(save, cls);
  const b: TankBoost = { hp: 1, speed: 1, damage: 1, fireRate: 1, chargeTime: 1, splash: 1 };
  for (const br of GARAGE_BRANCHES) {
    const def = PROGRESSION.garage.branches[br];
    b[def.stat] += def.perLevel * g[br];
  }
  const perk = PROGRESSION.perks.classes[cls];
  if (perk) b[perk.stat] += perk.perLevel * perkLevel(save, cls);
  return b;
}

/** Round 06 perk level (0..maxLevel) of a class. */
export function perkLevel(save: SaveData, cls: CombatClassId): number {
  return save.perks[cls] ?? 0;
}

/** Can one upgrade part be spent on this class now? */
export function canUsePart(save: SaveData, cls: CombatClassId): boolean {
  return PROGRESSION.perks.classes[cls] !== undefined && save.parts >= PROGRESSION.perks.cost && perkLevel(save, cls) < PROGRESSION.perks.maxLevel;
}

/** Spends parts for one perk level on `cls`; null when not possible. */
export function spendPart(save: SaveData, cls: CombatClassId): SaveData | null {
  if (!canUsePart(save, cls)) return null;
  return { ...save, parts: save.parts - PROGRESSION.perks.cost, perks: { ...save.perks, [cls]: perkLevel(save, cls) + 1 } };
}

/** Parts a mission pays: perWin for every win, + threeStarBonus the first time the level is won with 3 stars. */
export function missionParts(oldStars: number, r: MissionResult): number {
  if (!r.won) return 0;
  return PROGRESSION.parts.perWin + (r.stars === 3 && oldStars < 3 ? PROGRESSION.parts.threeStarBonus : 0);
}

/** Credits for the next level of a branch, or null when it is maxed. */
export function upgradeCost(save: SaveData, cls: CombatClassId, br: GarageBranch): number | null {
  const lvl = garageOf(save, cls)[br];
  return lvl >= PROGRESSION.garage.maxLevel ? null : PROGRESSION.garage.cost[lvl];
}

/** Buys one level; returns the new save or null (maxed / not enough credits). */
export function buyUpgrade(save: SaveData, cls: CombatClassId, br: GarageBranch): SaveData | null {
  const cost = upgradeCost(save, cls, br);
  if (cost === null || save.credits < cost) return null;
  const g = garageOf(save, cls);
  return { ...save, credits: save.credits - cost, garage: { ...save.garage, [cls]: { ...g, [br]: g[br] + 1 } } };
}

/** Level i is playable when it is the first one or the previous level has at least one star. */
export function isUnlocked(save: SaveData, index: number): boolean {
  if (index <= 0) return true;
  const prev = LEVELS[index - 1];
  return (save.campaign.stars[prev.id] ?? 0) > 0;
}

/** Credits a mission pays: first clear = base + perStar × stars; replays only pay for stars above the old best. */
export function missionCredits(level: CampaignLevel, oldStars: number, r: MissionResult): number {
  if (!r.won) return 0;
  const newStars = Math.max(0, r.stars - oldStars);
  return (oldStars === 0 ? level.reward.base : 0) + newStars * level.reward.perStar;
}

export function applyMission(save: SaveData, level: CampaignLevel, r: MissionResult): { save: SaveData; credits: number; parts: number } {
  const old = save.campaign.stars[level.id] ?? 0;
  const credits = missionCredits(level, old, r);
  const parts = missionParts(old, r);
  if (!r.won) return { save, credits: 0, parts: 0 };
  const best = save.campaign.bestTime[level.id];
  return {
    credits,
    parts,
    save: {
      ...save,
      credits: save.credits + credits,
      parts: save.parts + parts,
      campaign: {
        stars: { ...save.campaign.stars, [level.id]: Math.max(old, r.stars) },
        bestTime: { ...save.campaign.bestTime, [level.id]: best === undefined ? Math.round(r.time) : Math.min(best, Math.round(r.time)) },
      },
    },
  };
}

/** Quick Match pay: perKill × kills, plus `win` when the player's team scored more kills. */
export function quickMatchCredits(kills: number, teamWon: boolean): number {
  return kills * PROGRESSION.quickMatch.perKill + (teamWon ? PROGRESSION.quickMatch.win : 0);
}

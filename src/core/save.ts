/**
 * Versioned save data (brief §11). Settings, progress, upgrades and records live in one document
 * with a `schemaVersion`; `migrate` upgrades data written by any previous version.
 */
import type { Lang } from '../i18n';
import type { CombatClassId } from '../sim/config';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  quality: Quality;
  sound: number; // 0..1
  music: number; // 0..1
  haptics: boolean;
  fpsCap: 30 | 60;
  reduceShake: boolean;
  highContrastFog: boolean;
  leftHanded: boolean;
  aimAssist: boolean;
  slowOnMap: boolean;
  joystickSensitivity: number; // 0.5..1.5
  /** Obstacle highlight (round-01 job 2). */
  edgeHighlight: 'normal' | 'strong';
  /** Developer: ability cooldown multiplier 0.1x–3x (round-01 job 5). */
  cooldownMul: number;
  /** Bot difficulty for Quick Match, allies and enemies (round-02). */
  difficulty: Difficulty;
  /** Quick Match map theme (round-03). */
  mapTheme: MapThemeId;
}

export type MapThemeId = 'desert' | 'city' | 'forest';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';

export interface Records {
  bestKills: number;
  /** Best kills/deaths ratio (deaths counted as max(1, deaths)). */
  bestKD: number;
  matches: number;
}

/** Garage levels per branch (round 05, stream E; data/progression.json). */
export interface GarageLevels {
  armor: number;
  engine: number;
  gun: number;
}
export type GarageBranch = keyof GarageLevels;

export interface CampaignProgress {
  /** Best stars per level id (0–3); a level with ≥ 1 star is cleared and unlocks the next one. */
  stars: Record<string, number>;
  /** Fastest win per level id (s). */
  bestTime: Record<string, number>;
}

export interface SaveData {
  schemaVersion: number;
  settings: Settings;
  credits: number;
  tutorialDone: boolean;
  records: Records;
  campaign: CampaignProgress;
  garage: Partial<Record<CombatClassId, GarageLevels>>;
}

export const SCHEMA_VERSION = 5;

export function defaultSave(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      lang: 'tr',
      quality: 'medium',
      sound: 0.8,
      music: 0.5,
      haptics: true,
      fpsCap: 60,
      reduceShake: false,
      highContrastFog: false,
      leftHanded: false,
      aimAssist: true,
      slowOnMap: false,
      joystickSensitivity: 1,
      edgeHighlight: 'normal',
      cooldownMul: 1,
      difficulty: 'normal',
      mapTheme: 'desert',
    },
    credits: 0,
    tutorialDone: false,
    records: { bestKills: 0, bestKD: 0, matches: 0 },
    campaign: { stars: {}, bestTime: {} },
    garage: {},
  };
}

/** Upgrade any previously written save to the current schema; unknown/corrupt input → defaults. */
export function migrate(raw: unknown): SaveData {
  const def = defaultSave();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<SaveData> & { schemaVersion?: number };
  const version = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return { ...def, ...r, schemaVersion: version } as SaveData; // newer build wrote it; keep as-is
  // v0 → v1: no structural changes. v1 → v2: settings.edgeHighlight, settings.cooldownMul, records.
  // v2 → v3: settings.difficulty. v3 → v4: settings.mapTheme (defaults filled in from defaultSave).
  // v4 → v5: campaign progress + garage levels (empty for old saves; credits already existed).
  return {
    ...def,
    ...r,
    settings: { ...def.settings, ...(r.settings ?? {}) },
    records: { ...def.records, ...(r.records ?? {}) },
    campaign: { stars: { ...(r.campaign?.stars ?? {}) }, bestTime: { ...(r.campaign?.bestTime ?? {}) } },
    garage: { ...(r.garage ?? {}) },
    credits: typeof r.credits === 'number' && r.credits >= 0 ? r.credits : 0,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Updates personal records after a match; returns the new save (pure). */
export function recordMatch(save: SaveData, kills: number, deaths: number): SaveData {
  const kd = kills / Math.max(1, deaths);
  const r = save.records;
  return { ...save, records: { bestKills: Math.max(r.bestKills, kills), bestKD: Math.max(r.bestKD, Math.round(kd * 100) / 100), matches: r.matches + 1 } };
}

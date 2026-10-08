/**
 * Versioned save data (brief §11). Settings, progress, upgrades and records live in one document
 * with a `schemaVersion`; `migrate` upgrades data written by any previous version.
 */
import type { Lang } from '../i18n';

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
}

export interface SaveData {
  schemaVersion: number;
  settings: Settings;
  credits: number;
  tutorialDone: boolean;
}

export const SCHEMA_VERSION = 1;

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
    },
    credits: 0,
    tutorialDone: false,
  };
}

/** Upgrade any previously written save to the current schema; unknown/corrupt input → defaults. */
export function migrate(raw: unknown): SaveData {
  const def = defaultSave();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<SaveData> & { schemaVersion?: number };
  const version = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return { ...def, ...r, schemaVersion: version } as SaveData; // newer build wrote it; keep as-is
  // v0 → v1: no structural changes yet, fill missing fields with defaults.
  return {
    ...def,
    ...r,
    settings: { ...def.settings, ...(r.settings ?? {}) },
    schemaVersion: SCHEMA_VERSION,
  };
}

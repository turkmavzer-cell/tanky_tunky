import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, defaultSave, migrate } from '../src/core/save';
import { LANGS, missingKeys } from '../src/i18n';

describe('save schema', () => {
  it('migrates empty/corrupt input to defaults', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('garbage')).toEqual(defaultSave());
  });

  it('upgrades a v0 save and keeps user values', () => {
    const v0 = { credits: 250, settings: { lang: 'en', sound: 0.2 } };
    const m = migrate(v0);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.credits).toBe(250);
    expect(m.settings.lang).toBe('en');
    expect(m.settings.sound).toBe(0.2);
    expect(m.settings.fpsCap).toBe(60);
  });
});

describe('i18n', () => {
  it('every language has every key', () => {
    for (const l of LANGS) expect(missingKeys(l)).toEqual([]);
  });
});

describe('save schema v2 (round 01)', () => {
  it('migrates a v1 save: adds edgeHighlight, cooldownMul and records, keeps user values', async () => {
    const { migrate, recordMatch } = await import('../src/core/save');
    const v1 = { schemaVersion: 1, credits: 5, settings: { lang: 'en', aimAssist: false } };
    const m = migrate(v1);
    expect(m.schemaVersion).toBe(2);
    expect(m.settings.edgeHighlight).toBe('normal');
    expect(m.settings.cooldownMul).toBe(1);
    expect(m.settings.aimAssist).toBe(false);
    expect(m.records).toEqual({ bestKills: 0, bestKD: 0, matches: 0 });
    const r1 = recordMatch(m, 4, 2);
    expect(r1.records).toEqual({ bestKills: 4, bestKD: 2, matches: 1 });
    const r2 = recordMatch(r1, 3, 0);
    expect(r2.records).toEqual({ bestKills: 4, bestKD: 3, matches: 2 });
  });
});

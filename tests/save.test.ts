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

import type { SaveData, Settings, Quality } from '../core/save';
import { LANGS, t, type Lang } from '../i18n';

const LANG_NAMES: Record<Lang, string> = { tr: 'Türkçe', en: 'English', ar: 'العربية' };

export function SettingsScreen({ save, onChange, onBack }: { save: SaveData; onChange: (s: SaveData) => void; onBack: () => void }) {
  const s = save.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => onChange({ ...save, settings: { ...s, [k]: v } });
  return (
    <div className="screen settings">
      <h2>{t('menu.settings')}</h2>
      <div className="settings-grid">
        <label>{t('settings.language')}</label>
        <div className="seg">
          {LANGS.map((l) => (
            <button key={l} className={l === s.lang ? 'on' : ''} onClick={() => set('lang', l)}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
        <label>{t('settings.quality')}</label>
        <div className="seg">
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <button key={q} className={q === s.quality ? 'on' : ''} onClick={() => set('quality', q)}>
              {t(`settings.quality.${q}`)}
            </button>
          ))}
        </div>
        <label>{t('settings.fpsCap')}</label>
        <div className="seg">
          {([30, 60] as const).map((f) => (
            <button key={f} className={f === s.fpsCap ? 'on' : ''} onClick={() => set('fpsCap', f)}>
              {f}
            </button>
          ))}
        </div>
        <label>{t('settings.handedness')}</label>
        <div className="seg">
          <button className={!s.leftHanded ? 'on' : ''} onClick={() => set('leftHanded', false)}>
            {t('settings.handedness.right')}
          </button>
          <button className={s.leftHanded ? 'on' : ''} onClick={() => set('leftHanded', true)}>
            {t('settings.handedness.left')}
          </button>
        </div>
        <label>{t('settings.sound')}</label>
        <input type="range" min={0} max={1} step={0.05} value={s.sound} onChange={(e) => set('sound', Number(e.target.value))} />
        <label>{t('settings.haptics')}</label>
        <input type="checkbox" checked={s.haptics} onChange={(e) => set('haptics', e.target.checked)} />
        <label>{t('settings.reduceShake')}</label>
        <input type="checkbox" checked={s.reduceShake} onChange={(e) => set('reduceShake', e.target.checked)} />
        <label>{t('settings.autoAim')}</label>
        <input type="checkbox" data-testid="autoaim" checked={s.aimAssist} onChange={(e) => set('aimAssist', e.target.checked)} />
        <label>{t('settings.edgeHighlight')}</label>
        <div className="seg">
          {(['normal', 'strong'] as const).map((m) => (
            <button key={m} className={m === s.edgeHighlight ? 'on' : ''} data-testid={`edge-${m}`} onClick={() => set('edgeHighlight', m)}>
              {t(`settings.edgeHighlight.${m}`)}
            </button>
          ))}
        </div>
        <label className="dev">
          {t('settings.dev')} · {t('settings.cooldownMul')} ({s.cooldownMul.toFixed(1)}x)
        </label>
        <input type="range" min={0.1} max={3} step={0.1} data-testid="cooldown-mul" value={s.cooldownMul} onChange={(e) => set('cooldownMul', Number(e.target.value))} />
      </div>
      <button className="btn" data-testid="back" onClick={onBack}>
        {t('menu.back')}
      </button>
    </div>
  );
}

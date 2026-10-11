import { t } from '../i18n';
import type { SaveData } from '../core/save';
import { TANK_CLASSES, type CombatClassId } from '../sim/config';
import { PROGRESSION, canUsePart, perkLevel, spendPart } from '../game/progression';

/** "+6 % fire rate" style label for a class perk at `level` levels. */
export function perkEffect(cls: CombatClassId, level: number): string {
  const def = PROGRESSION.perks.classes[cls];
  if (!def) return '';
  return t(`perk.${def.stat}`, { p: Math.round(Math.abs(def.perLevel) * level * 100) });
}

/** One tank's perk row: pips, current effect, button that spends one part (round 06). */
export function PerkRow({ save, cls, onChange }: { save: SaveData; cls: CombatClassId; onChange: (s: SaveData) => void }) {
  const lvl = perkLevel(save, cls);
  const max = PROGRESSION.perks.maxLevel;
  const full = lvl >= max;
  return (
    <div className="garage-row perk-row">
      <span className="gr-name">{t('perk.title')}</span>
      <span className="gr-meta">
        <span className="pips perk">
          {Array.from({ length: max }, (_, i) => (
            <i key={i} className={i < lvl ? 'on' : ''} />
          ))}
        </span>
        <span className="gr-eff">{perkEffect(cls, Math.max(1, lvl))}</span>
      </span>
      <button
        className="btn btn-small"
        data-testid={`perk-${cls}`}
        disabled={!canUsePart(save, cls)}
        onClick={() => {
          const next = spendPart(save, cls);
          if (next) onChange(next);
        }}
      >
        {full ? t('perk.max') : t('perk.use')}
      </button>
    </div>
  );
}

/** After a won mission: spend the new parts on a tank right away (or later in the garage). */
export function PerkPicker({ save, onChange }: { save: SaveData; onChange: (s: SaveData) => void }) {
  if (save.parts <= 0) return null;
  return (
    <div className="perk-picker" data-testid="perk-picker">
      <div className="pp-head">
        <b>{t('perk.pick')}</b> <span className="credits">{t('perk.parts', { n: save.parts })}</span>
      </div>
      <div className="pp-list">
        {TANK_CLASSES.map((cls) => {
          const lvl = perkLevel(save, cls);
          return (
            <button key={cls} className="btn pp-btn" data-testid={`pick-${cls}`} disabled={!canUsePart(save, cls)} onClick={() => {
              const next = spendPart(save, cls);
              if (next) onChange(next);
            }}>
              <b>{t(`class.${cls}`)}</b>
              <small>{perkEffect(cls, lvl + 1)}</small>
              <small className="pp-lvl">{lvl}/{PROGRESSION.perks.maxLevel}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

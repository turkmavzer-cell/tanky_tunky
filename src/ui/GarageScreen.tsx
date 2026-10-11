import { t } from '../i18n';
import type { SaveData } from '../core/save';
import { TANK_CLASSES } from '../sim/config';
import { GARAGE_BRANCHES, PROGRESSION, buyUpgrade, garageOf, upgradeCost } from '../game/progression';

/** Garage (round 05, stream E): three upgrade branches per tank, bought with credits. */
export function GarageScreen({ save, onChange, onBack }: { save: SaveData; onChange: (s: SaveData) => void; onBack: () => void }) {
  return (
    <div className="screen garage">
      <div className="screen-head">
        <h2 className="menu-title">{t('garage.title')}</h2>
        <span className="credits" data-testid="credits">
          {t('menu.credits', { n: save.credits })}
        </span>
      </div>
      <p className="menu-note">{t('garage.note')}</p>
      <div className="garage-grid">
        {TANK_CLASSES.map((cls) => {
          const g = garageOf(save, cls);
          return (
            <div key={cls} className="garage-card" data-testid={`garage-${cls}`}>
              <b>{t(`class.${cls}`)}</b>
              {GARAGE_BRANCHES.map((br) => {
                const def = PROGRESSION.garage.branches[br];
                const cost = upgradeCost(save, cls, br);
                const pct = Math.round(def.perLevel * g[br] * 100);
                return (
                  <div key={br} className="garage-row">
                    <span className="gr-name">{t(`garage.${br}`)}</span>
                    <span className="gr-meta">
                      <span className="pips">
                        {Array.from({ length: PROGRESSION.garage.maxLevel }, (_, i) => (
                          <i key={i} className={i < g[br] ? 'on' : ''} />
                        ))}
                      </span>
                      <span className="gr-eff">{t(`garage.${def.stat}`, { p: pct })}</span>
                    </span>
                    <button
                      className="btn btn-small"
                      data-testid={`buy-${cls}-${br}`}
                      disabled={cost === null || save.credits < cost}
                      onClick={() => {
                        const next = buyUpgrade(save, cls, br);
                        if (next) onChange(next);
                      }}
                    >
                      {cost === null ? t('garage.max') : t('garage.buy', { c: cost })}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <button className="btn" data-testid="back" onClick={onBack}>
        {t('menu.back')}
      </button>
    </div>
  );
}

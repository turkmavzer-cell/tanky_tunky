import { useState } from 'react';
import { TANKS, TANK_CLASSES, type TankClassId } from '../sim/config';
import { t } from '../i18n';

/** Normalised 0..1 stat bars derived from tanks.json (no hard-coded numbers). */
function stats(cls: TankClassId): { speed: number; armor: number; power: number; vision: number } {
  const all = TANK_CLASSES.map((c) => TANKS[c]);
  const max = (f: (d: (typeof all)[number]) => number): number => Math.max(...all.map(f));
  const d = TANKS[cls];
  const dps = (x: typeof d): number => (x.damage * 2) / (x.fireCooldown + x.chargeTime * 0.5);
  const ehp = (x: typeof d): number => x.hp / (1 - x.armor);
  return {
    speed: d.maxSpeed / max((x) => x.maxSpeed),
    armor: ehp(d) / max(ehp),
    power: dps(d) / max(dps),
    vision: cls === 'trapper' ? 1 : d.vision / max((x) => x.vision) * 0.8,
  };
}

export function ClassSelect({ initial, onStart, onBack }: { initial: TankClassId; onStart: (c: TankClassId) => void; onBack: () => void }) {
  const [sel, setSel] = useState<TankClassId>(initial);
  return (
    <div className="screen class-select">
      <h2>{t('menu.chooseClass')}</h2>
      <div className="class-cards">
        {TANK_CLASSES.map((c) => {
          const s = stats(c);
          return (
            <button key={c} className={'class-card' + (c === sel ? ' on' : '')} data-testid={`class-${c}`} onClick={() => setSel(c)}>
              <div className="class-name">{t(`class.${c}`)}</div>
              <div className="class-desc">{t(`class.${c}.desc`)}</div>
              {(['speed', 'armor', 'power', 'vision'] as const).map((k) => (
                <div key={k} className="stat">
                  <span>{t(`stat.${k}`)}</span>
                  <i>
                    <b style={{ width: `${Math.round(s[k] * 100)}%` }} />
                  </i>
                </div>
              ))}
            </button>
          );
        })}
      </div>
      <div className="row">
        <button className="btn" onClick={onBack}>
          {t('menu.back')}
        </button>
        <button className="btn btn-primary" data-testid="start" onClick={() => onStart(sel)}>
          {t('menu.start')}
        </button>
      </div>
    </div>
  );
}

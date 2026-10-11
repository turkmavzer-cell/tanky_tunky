import { t } from '../i18n';
import type { SaveData } from '../core/save';
import { LEVELS } from '../game/campaign';
import { isUnlocked } from '../game/progression';

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`${n}/3`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? 'on' : ''}>
          ★
        </i>
      ))}
    </span>
  );
}

/** Campaign level list (round 05, stream D): stars, best time, unlock chain. */
export function CampaignScreen({ save, onPlay, onBack }: { save: SaveData; onPlay: (levelId: string) => void; onBack: () => void }) {
  return (
    <div className="screen campaign">
      <div className="screen-head">
        <h2 className="menu-title">{t('campaign.title')}</h2>
        <span className="credits" data-testid="credits">
          {t('menu.credits', { n: save.credits })}
        </span>
        <span className="credits">{t('perk.parts', { n: save.parts })}</span>
      </div>
      <div className="level-list">
        {LEVELS.map((lv, i) => {
          const open = isUnlocked(save, i);
          const stars = save.campaign.stars[lv.id] ?? 0;
          const best = save.campaign.bestTime[lv.id];
          return (
            <div key={lv.id} className={'level-card' + (open ? '' : ' locked')} data-testid={`level-${lv.id}`}>
              <div className="lc-head">
                <small>{t('campaign.level', { n: i + 1 })}</small>
                <b>{t(`level.${lv.id}` as 'level.c1')}</b>
                <Stars n={stars} />
              </div>
              <div className="lc-meta">
                <span>{t(`map.${lv.theme}`)}</span>
                <span>{fmtTime(lv.duration)}</span>
              </div>
              <div className="lc-rules">{t('campaign.rules', { d: lv.stars.maxDeaths, t: fmtTime(lv.stars.time) })}</div>
              {best !== undefined && <div className="lc-best">{t('campaign.best', { t: fmtTime(best) })}</div>}
              {stars === 0 && <div className="lc-best">{t('campaign.reward', { n: lv.reward.base + 3 * lv.reward.perStar })}</div>}
              <button className="btn btn-primary" disabled={!open} data-testid={`play-${lv.id}`} onClick={() => onPlay(lv.id)}>
                {open ? t('campaign.play') : t('campaign.locked')}
              </button>
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

export { Stars };

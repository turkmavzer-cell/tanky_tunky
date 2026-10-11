import type { ScoreRow } from '../game/matchSetup';
import { t } from '../i18n';
import type { MissionResult } from '../game/campaign';
import { Stars, fmtTime } from './CampaignScreen';

/** Full-screen scoreboard (round-01 job 4): most kills first, ties → fewer deaths; player row highlighted. */
export function ResultsScreen({ rows, localId, record, credits = 0, onAgain, onMenu }: { rows: ScoreRow[]; localId: number; record: { bestKills: number; bestKD: number }; credits?: number; onAgain: () => void; onMenu: () => void }) {
  const me = rows.find((r) => r.id === localId);
  const myKD = me ? me.kills / Math.max(1, me.deaths) : 0;
  const isRecord = me !== undefined && (me.kills >= record.bestKills && me.kills > 0 || myKD >= record.bestKD && myKD > 0);
  return (
    <div className="results" data-testid="results">
      <div className="results-panel">
        <h2>{t('results.title')}</h2>
        <div className="winner">
          {t('results.winner')}: <b>{rows[0].id === localId ? t('results.you') : rows[0].name}</b>
        </div>
        <table className="score-table">
          <thead>
            <tr>
              <th>{t('results.rank')}</th>
              <th>{t('results.name')}</th>
              <th>{t('results.class')}</th>
              <th>{t('results.kills')}</th>
              <th>{t('results.deaths')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={(r.id === localId ? 'me ' : '') + (r.team === rows.find((x) => x.id === localId)?.team ? 'ally' : 'enemy')} data-testid={r.id === localId ? 'my-row' : undefined}>
                <td>{r.rank}</td>
                <td>
                  <span className={'team-dot ' + (r.team === 0 ? 'blue' : 'red')} />
                  {r.name}
                </td>
                <td>{t(`class.${r.cls}`)}</td>
                <td>{r.kills}</td>
                <td>{r.deaths}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {credits > 0 && (
          <div className="credit-gain" data-testid="credit-gain">
            {t('results.credits', { n: credits })}
          </div>
        )}
        <div className="record">{isRecord ? t('results.newRecord') : t('results.record', { k: record.bestKills, kd: record.bestKD.toFixed(2) })}</div>
        <div className="row">
          <button className="btn btn-primary" data-testid="again" onClick={onAgain}>
            {t('results.again')}
          </button>
          <button className="btn" data-testid="menu" onClick={onMenu}>
            {t('results.menu')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Campaign mission result (round 05): win/loss, stars, time, deaths, credits earned. */
export function MissionResults({
  result,
  credits,
  hasNext,
  onNext,
  onRetry,
  onMenu,
}: {
  result: MissionResult;
  credits: number;
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="results" data-testid="mission-results">
      <div className="results-panel mission">
        <h2 data-testid="mission-outcome">{result.won ? t('mission.won') : t('mission.lost')}</h2>
        <div className="big-stars">
          <Stars n={result.stars} />
        </div>
        <table className="score-table mission-table">
          <tbody>
            <tr>
              <td>{t('mission.time')}</td>
              <td>{fmtTime(result.time)}</td>
            </tr>
            <tr>
              <td>{t('mission.kills')}</td>
              <td>{result.kills}</td>
            </tr>
            <tr>
              <td>{t('mission.deaths')}</td>
              <td>{result.deaths}</td>
            </tr>
          </tbody>
        </table>
        {credits > 0 && (
          <div className="credit-gain" data-testid="credit-gain">
            {t('mission.credits', { n: credits })}
          </div>
        )}
        <div className="row">
          {result.won && hasNext && (
            <button className="btn btn-primary" data-testid="next-level" onClick={onNext}>
              {t('mission.next')}
            </button>
          )}
          <button className={'btn' + (result.won && hasNext ? '' : ' btn-primary')} data-testid="again" onClick={onRetry}>
            {t('mission.retry')}
          </button>
          <button className="btn" data-testid="menu" onClick={onMenu}>
            {t('results.menu')}
          </button>
        </div>
      </div>
    </div>
  );
}

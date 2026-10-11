import { useCallback, useEffect, useState } from 'react';
import { loadSave, writeSave } from '../core/storage';
import { defaultSave, recordMatch, type SaveData } from '../core/save';
import { setLang, t } from '../i18n';
import { setHapticsEnabled } from '../core/platform';
import { ErrorBoundary } from './ErrorBoundary';
import { MainMenu, MultiMenu, SoloMenu } from './MainMenu';
import { SettingsScreen } from './SettingsScreen';
import { GameView } from './GameView';
import { ClassSelect } from './ClassSelect';
import type { CombatClassId, TankClassId } from '../sim/config';
import { CampaignScreen } from './CampaignScreen';
import { GarageScreen } from './GarageScreen';
import { LEVELS, levelById } from '../game/campaign';
import { applyMission, boostFor, quickMatchCredits } from '../game/progression';

export type Screen = 'loading' | 'menu' | 'solo' | 'multi' | 'classSelect' | 'settings' | 'game' | 'campaign' | 'garage';

/** Fresh match seed (URL ?seed= overrides inside GameView for tests). */
function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function nextLevel(id: string | null): string | null {
  if (!id) return null;
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1].id : null;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [cls, setCls] = useState<TankClassId>('standard');
  const [seed, setSeed] = useState(() => newSeed());
  /** Campaign level being set up / played; null = Quick Match. */
  const [level, setLevel] = useState<string | null>(null);

  useEffect(() => {
    void loadSave().then((s) => {
      setLang(s.settings.lang);
      setHapticsEnabled(s.settings.haptics);
      setSave(s);
      setScreen('menu');
    });
  }, []);

  const updateSave = useCallback((next: SaveData) => {
    setLang(next.settings.lang);
    setHapticsEnabled(next.settings.haptics);
    setSave(next);
    void writeSave(next);
  }, []);

  return (
    <ErrorBoundary>
      <div className="app">
        {screen === 'loading' && <div className="loading">{t('app.loading')}</div>}
        {screen === 'menu' && <MainMenu onSolo={() => setScreen('solo')} onMulti={() => setScreen('multi')} onSettings={() => setScreen('settings')} />}
        {screen === 'solo' && (
          <SoloMenu
            credits={save.credits}
            onQuick={() => {
              setLevel(null);
              setScreen('classSelect');
            }}
            onCampaign={() => setScreen('campaign')}
            onGarage={() => setScreen('garage')}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'campaign' && (
          <CampaignScreen
            save={save}
            onBack={() => setScreen('solo')}
            onPlay={(id) => {
              setLevel(id);
              setScreen('classSelect');
            }}
          />
        )}
        {screen === 'garage' && <GarageScreen save={save} onChange={updateSave} onBack={() => setScreen('solo')} />}
        {screen === 'multi' && <MultiMenu onBack={() => setScreen('menu')} />}
        {screen === 'classSelect' && (
          <ClassSelect
            initial={cls}
            difficulty={save.settings.difficulty}
            theme={save.settings.mapTheme}
            campaign={level !== null}
            onBack={() => setScreen(level !== null ? 'campaign' : 'solo')}
            onStart={(c, d, m) => {
              setCls(c);
              if (d !== save.settings.difficulty || m !== save.settings.mapTheme) updateSave({ ...save, settings: { ...save.settings, difficulty: d, mapTheme: m } });
              setSeed(newSeed());
              setScreen('game');
            }}
          />
        )}
        {screen === 'settings' && <SettingsScreen save={save} onChange={updateSave} onBack={() => setScreen('menu')} />}
        {screen === 'game' && <GameView
            key={seed}
            settings={save.settings}
            playerClass={cls}
            seed={seed}
            record={save.records}
            campaignLevel={level ?? undefined}
            playerBoost={boostFor(save, cls as CombatClassId)}
            hasNext={nextLevel(level) !== null}
            onNext={() => {
              setLevel(nextLevel(level));
              setSeed(newSeed());
            }}
            onQuit={() => setScreen(level !== null ? 'campaign' : 'menu')}
            onAgain={() => setSeed(newSeed())}
            onMatchEnd={(sum) => {
              let next = recordMatch(save, sum.kills, sum.deaths);
              let credits = 0;
              const lv = level ? levelById(level) : undefined;
              if (lv && sum.mission) {
                const r = applyMission(next, lv, sum.mission);
                next = r.save;
                credits = r.credits;
              } else if (!lv) {
                credits = quickMatchCredits(sum.kills, sum.teamWon);
                next = { ...next, credits: next.credits + credits };
              }
              updateSave(next);
              return credits;
            }}
          />}
        <div className="rotate-hint">{t('menu.rotate')}</div>
      </div>
    </ErrorBoundary>
  );
}

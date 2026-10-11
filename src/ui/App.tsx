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
import type { TankClassId } from '../sim/config';

export type Screen = 'loading' | 'menu' | 'solo' | 'multi' | 'classSelect' | 'settings' | 'game';

/** Fresh match seed (URL ?seed= overrides inside GameView for tests). */
function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [cls, setCls] = useState<TankClassId>('standard');
  const [seed, setSeed] = useState(() => newSeed());

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
        {screen === 'solo' && <SoloMenu onQuick={() => setScreen('classSelect')} onBack={() => setScreen('menu')} />}
        {screen === 'multi' && <MultiMenu onBack={() => setScreen('menu')} />}
        {screen === 'classSelect' && (
          <ClassSelect
            initial={cls}
            difficulty={save.settings.difficulty}
            theme={save.settings.mapTheme}
            onBack={() => setScreen('solo')}
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
            onQuit={() => setScreen('menu')}
            onAgain={() => setSeed(newSeed())}
            onMatchEnd={(k, d) => updateSave(recordMatch(save, k, d))}
          />}
        <div className="rotate-hint">{t('menu.rotate')}</div>
      </div>
    </ErrorBoundary>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { loadSave, writeSave } from '../core/storage';
import { defaultSave, type SaveData } from '../core/save';
import { setLang, t } from '../i18n';
import { setHapticsEnabled } from '../core/platform';
import { ErrorBoundary } from './ErrorBoundary';
import { MainMenu } from './MainMenu';
import { SettingsScreen } from './SettingsScreen';
import { GameView } from './GameView';
import { ClassSelect } from './ClassSelect';
import type { TankClassId } from '../sim/config';

export type Screen = 'loading' | 'menu' | 'classSelect' | 'settings' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [cls, setCls] = useState<TankClassId>('standard');

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
        {screen === 'menu' && <MainMenu onPlay={() => setScreen('classSelect')} onSettings={() => setScreen('settings')} />}
        {screen === 'classSelect' && (
          <ClassSelect
            initial={cls}
            onBack={() => setScreen('menu')}
            onStart={(c) => {
              setCls(c);
              setScreen('game');
            }}
          />
        )}
        {screen === 'settings' && <SettingsScreen save={save} onChange={updateSave} onBack={() => setScreen('menu')} />}
        {screen === 'game' && <GameView settings={save.settings} playerClass={cls} onQuit={() => setScreen('menu')} />}
        <div className="rotate-hint">{t('menu.rotate')}</div>
      </div>
    </ErrorBoundary>
  );
}

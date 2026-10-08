import { useCallback, useEffect, useState } from 'react';
import { loadSave, writeSave } from '../core/storage';
import { defaultSave, type SaveData } from '../core/save';
import { setLang, t } from '../i18n';
import { setHapticsEnabled } from '../core/platform';
import { ErrorBoundary } from './ErrorBoundary';
import { MainMenu } from './MainMenu';
import { SettingsScreen } from './SettingsScreen';
import { GameView } from './GameView';

export type Screen = 'loading' | 'menu' | 'settings' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [save, setSave] = useState<SaveData>(defaultSave);

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
        {screen === 'menu' && <MainMenu onPlay={() => setScreen('game')} onSettings={() => setScreen('settings')} />}
        {screen === 'settings' && <SettingsScreen save={save} onChange={updateSave} onBack={() => setScreen('menu')} />}
        {screen === 'game' && <GameView settings={save.settings} onQuit={() => setScreen('menu')} />}
        <div className="rotate-hint">{t('menu.rotate')}</div>
      </div>
    </ErrorBoundary>
  );
}

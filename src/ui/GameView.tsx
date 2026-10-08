import { useEffect, useRef, useState } from 'react';
import { GameScene } from '../scenes/GameScene';
import type { Settings } from '../core/save';
import { onAppPause } from '../core/platform';
import { t } from '../i18n';

declare global {
  interface Window {
    __tanky?: { scene: GameScene };
  }
}

export function GameView({ settings, onQuit }: { settings: Settings; onQuit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const scene = new GameScene({ quality: settings.quality, fpsCap: settings.fpsCap, reduceShake: settings.reduceShake });
    sceneRef.current = scene;
    let cancelled = false;
    void scene.init(host.current!).then(() => {
      if (cancelled) return;
      window.__tanky = { scene };
    });
    const off = onAppPause(
      () => {
        scene.setPaused(true);
        setPaused(true);
      },
      () => undefined,
    );
    const fpsTimer = window.setInterval(() => setFps(Math.round(scene.stats.summary().fps)), 1000);
    return () => {
      cancelled = true;
      off();
      clearInterval(fpsTimer);
      scene.dispose();
      sceneRef.current = null;
      delete window.__tanky;
    };
  }, [settings.quality, settings.fpsCap, settings.reduceShake]);

  const togglePause = (p: boolean): void => {
    sceneRef.current?.setPaused(p);
    setPaused(p);
  };

  return (
    <div className="game-root">
      <div className="game-host" ref={host} />
      <div className="hud">
        <div className="fps" data-testid="fps">
          {fps} FPS
        </div>
        <button className="pause-btn" data-testid="pause" aria-label={t('game.paused')} onClick={() => togglePause(true)}>
          ❚❚
        </button>
      </div>
      {paused && (
        <div className="overlay">
          <div className="panel">
            <h2>{t('game.paused')}</h2>
            <button className="btn btn-primary" data-testid="resume" onClick={() => togglePause(false)}>
              {t('game.resume')}
            </button>
            <button className="btn" data-testid="quit" onClick={onQuit}>
              {t('game.quit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { GameScene, type HudSnapshot } from '../scenes/GameScene';
import type { Settings } from '../core/save';
import { onAppPause } from '../core/platform';
import { t } from '../i18n';
import { TouchControls } from './touchControls';
import { TANK_CLASSES, type TankClassId } from '../sim/config';

declare global {
  interface Window {
    __tanky?: { scene: GameScene };
  }
}

/** Dev/test URL overrides: ?silent&map=96&seed=5&renderScale=0.25&cls=heavy */
function debugParams(): { silent: boolean; mapSize?: 40 | 64 | 96; seed?: number; renderScale?: number; playerClass?: TankClassId } {
  const q = new URLSearchParams(location.search);
  const map = Number(q.get('map'));
  const cls = q.get('cls') as TankClassId | null;
  const out: ReturnType<typeof debugParams> = { silent: q.has('silent') };
  if (map === 40 || map === 64 || map === 96) out.mapSize = map;
  if (q.has('seed')) out.seed = Number(q.get('seed'));
  if (q.has('renderScale')) out.renderScale = Number(q.get('renderScale'));
  if (cls && TANK_CLASSES.includes(cls)) out.playerClass = cls;
  return out;
}

export function GameView({ settings, playerClass, onQuit }: { settings: Settings; playerClass: TankClassId; onQuit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const controlsHost = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const scene = new GameScene({
      quality: settings.quality,
      fpsCap: settings.fpsCap,
      reduceShake: settings.reduceShake,
      aimAssist: settings.aimAssist,
      volume: { master: settings.sound, sfx: 1, music: settings.music },
      playerClass,
      ...debugParams(),
    });
    sceneRef.current = scene;
    let cancelled = false;
    const touch = new TouchControls(controlsHost.current!, {
      leftHanded: settings.leftHanded,
      sensitivity: settings.joystickSensitivity,
      labels: { fire: t('hud.fire'), ability: t('hud.ability') },
    });
    scene.touch = touch;
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
    const hudTimer = window.setInterval(() => {
      if (scene.state) setHud(scene.hud());
    }, 100);
    const fpsTimer = window.setInterval(() => setFps(Math.round(scene.stats.summary().fps)), 1000);
    return () => {
      cancelled = true;
      off();
      clearInterval(fpsTimer);
      clearInterval(hudTimer);
      touch.dispose();
      scene.dispose();
      sceneRef.current = null;
      delete window.__tanky;
    };
  }, [settings.quality, settings.fpsCap, settings.reduceShake, settings.aimAssist, settings.sound, settings.music, settings.leftHanded, settings.joystickSensitivity, playerClass]);

  const togglePause = (p: boolean): void => {
    sceneRef.current?.setPaused(p);
    setPaused(p);
  };

  return (
    <div className="game-root">
      <div className="game-host" ref={host} />
      <div className="controls-host" ref={controlsHost} />
      <div className="hud">
        {hud && (
          <div className={'hud-status' + (settings.leftHanded ? ' right' : '')} data-testid="hud-status">
            <div className="hp-bar">
              <i style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }} />
              <span>
                {hud.hp} / {hud.maxHp}
              </span>
            </div>
            <div className="score">
              <span className="blue">{hud.teamScore[0]}</span> : <span className="red">{hud.teamScore[1]}</span>
            </div>
          </div>
        )}
        <div className="fps" data-testid="fps">
          {fps} FPS
        </div>
        <button className="pause-btn" data-testid="pause" aria-label={t('game.paused')} onClick={() => togglePause(true)}>
          ❚❚
        </button>
        {hud && !hud.alive && (
          <div className="respawn" data-testid="respawn">
            {t('game.respawn', { s: Math.ceil(hud.respawn) })}
          </div>
        )}
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

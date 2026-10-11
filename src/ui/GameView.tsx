import { useEffect, useRef, useState } from 'react';
import { GameScene, type HudSnapshot } from '../scenes/GameScene';
import type { Settings } from '../core/save';
import { onAppPause } from '../core/platform';
import { t } from '../i18n';
import { TouchControls } from './touchControls';
import { ALL_TANK_CLASSES, COMBAT, type TankClassId } from '../sim/config';
import type { ScoreRow } from '../game/matchSetup';
import { ResultsScreen } from './ResultsScreen';
import { MATCH } from '../sim/config';

declare global {
  interface Window {
    __tanky?: { scene: GameScene };
  }
}

type DebugParams = Partial<{
  silent: boolean;
  mapSize: 40 | 64 | 96;
  mapName: string;
  seed: number;
  renderScale: number;
  playerClass: TankClassId;
  idleBots: boolean | 'allies';
  endless: boolean;
  noFog: boolean;
  duration: number;
  edgeHighlight: 'normal' | 'strong';
  aiLevel: 'easy' | 'normal' | 'hard' | 'extreme';
  mapTheme: 'desert' | 'city' | 'forest';
  debugView: { x: number; y: number; zoom: number };
}>;

/** Dev/test URL overrides: ?silent&map=96|debug_heights&seed=5&renderScale=0.25&cls=heavy&view=32,32&zoom=0.4&bots=idle&endless&nofog&dur=10&diff=hard */
function debugParams(): DebugParams {
  const q = new URLSearchParams(location.search);
  const out: DebugParams = { silent: q.has('silent') };
  const map = q.get('map');
  if (map === '40' || map === '64' || map === '96') out.mapSize = Number(map) as 40 | 64 | 96;
  else if (map) out.mapName = map;
  if (q.has('seed')) out.seed = Number(q.get('seed'));
  if (q.has('renderScale')) out.renderScale = Number(q.get('renderScale'));
  const cls = q.get('cls') as TankClassId | null;
  if (cls && ALL_TANK_CLASSES.includes(cls)) out.playerClass = cls;
  if (q.get('bots') === 'idle') out.idleBots = true;
  if (q.get('bots') === 'enemies') out.idleBots = 'allies';
  if (q.has('endless')) out.endless = true;
  if (q.has('nofog')) out.noFog = true;
  if (q.has('dur')) out.duration = Number(q.get('dur'));
  const theme = q.get('theme');
  if (theme === 'desert' || theme === 'city' || theme === 'forest') out.mapTheme = theme;
  const diff = q.get('diff');
  if (diff === 'easy' || diff === 'normal' || diff === 'hard' || diff === 'extreme') out.aiLevel = diff;
  if (q.get('edges') === 'strong') out.edgeHighlight = 'strong';
  const view = q.get('view')?.split(',').map(Number);
  if (view && view.length >= 2) out.debugView = { x: view[0], y: view[1], zoom: Number(q.get('zoom') ?? 0.5) };
  return out;
}

export interface GameViewProps {
  settings: Settings;
  playerClass: TankClassId;
  seed: number;
  record: { bestKills: number; bestKD: number };
  onQuit: () => void;
  onAgain: () => void;
  onMatchEnd: (kills: number, deaths: number) => void;
}

export function GameView({ settings, playerClass, seed, record, onQuit, onAgain, onMatchEnd }: GameViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const controlsHost = useRef<HTMLDivElement>(null);
  const minimapHost = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [results, setResults] = useState<ScoreRow[] | null>(null);
  const endRef = useRef(onMatchEnd);
  useEffect(() => {
    endRef.current = onMatchEnd;
  }, [onMatchEnd]);

  useEffect(() => {
    const dbg = debugParams();
    const scene = new GameScene({
      quality: settings.quality,
      fpsCap: settings.fpsCap,
      reduceShake: settings.reduceShake,
      autoAim: settings.aimAssist,
      edgeHighlight: settings.edgeHighlight,
      aiLevel: settings.difficulty,
      mapTheme: settings.mapTheme,
      cooldownMul: settings.cooldownMul,
      volume: { master: settings.sound, sfx: 1, music: settings.music },
      playerClass,
      seed,
      ...dbg,
    });
    sceneRef.current = scene;
    let cancelled = false;
    const touch = new TouchControls(controlsHost.current!, {
      leftHanded: settings.leftHanded,
      sensitivity: settings.joystickSensitivity,
      labels: { fire: t('hud.fire'), ability: t('hud.ability') },
    });
    scene.touch = touch;
    scene.onMatchEnd = (rows) => {
      setResults(rows);
      const me = rows.find((r) => r.id === scene.localId);
      if (me) endRef.current(me.kills, me.deaths);
    };
    void scene.init(host.current!).then(() => {
      if (cancelled) return;
      window.__tanky = { scene };
      const label = touch.root.querySelector('.ability-btn .act-label');
      if (label) label.textContent = scene.hud().abilityName.toUpperCase();
      if (scene.minimap && minimapHost.current) minimapHost.current.appendChild(scene.minimap.canvas);
    });
    const off = onAppPause(
      () => {
        scene.setPaused(true);
        setPaused(true);
      },
      () => undefined,
    );
    const hudTimer = window.setInterval(() => {
      if (scene.match) setHud(scene.hud());
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
  }, [settings.quality, settings.fpsCap, settings.reduceShake, settings.aimAssist, settings.edgeHighlight, settings.cooldownMul, settings.difficulty, settings.mapTheme, settings.sound, settings.music, settings.leftHanded, settings.joystickSensitivity, playerClass, seed]);

  const togglePause = (p: boolean): void => {
    sceneRef.current?.setPaused(p);
    setPaused(p);
  };

  const secs = hud ? Math.ceil(hud.timeLeft) : MATCH.duration;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  const finalWarn = hud?.phase === 'playing' && secs <= MATCH.finalWarning;

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
            {hud.upgrades > 0 && (
              <div className="up-chip" data-testid="upgrades">
                ▲ +%{Math.round(hud.upgrades * COMBAT.upgrades.perPickup * 100)}
              </div>
            )}
            <div
              className={'ab-chip ' + (hud.abilityActive > 0 ? 'active' : hud.abilityCooldown > 0 ? 'cooling' : 'ready')}
              data-testid="ability-chip"
            >
              {hud.abilityName}{' '}
              <b>{hud.abilityActive > 0 ? `${Math.ceil(hud.abilityActive)} ${t('hud.sec')}` : hud.abilityCooldown > 0 ? `${Math.ceil(hud.abilityCooldown)} ${t('hud.sec')}` : t('hud.ready')}</b>
            </div>
            <div className="kd" data-testid="kd">
              {t('hud.kd')} <b>{hud.kills}</b>/<b>{hud.deaths}</b>
            </div>
          </div>
        )}
        <div ref={minimapHost} className={'minimap-host' + (settings.leftHanded ? ' right' : '')} />
        {hud && hud.phase !== 'ended' && !hud.endless && (
          <div className={'match-timer' + (finalWarn ? ' warn' : '')} data-testid="timer">
            {mm}:{ss}
          </div>
        )}
        {hud?.phase === 'countdown' && (
          <div className="countdown" data-testid="countdown" key={hud.countdown}>
            {hud.countdown > 0 ? hud.countdown : t('game.go')}
          </div>
        )}
        <div className="fps" data-testid="fps">
          {fps} FPS
        </div>
        <button className="pause-btn" data-testid="pause" aria-label={t('game.paused')} onClick={() => togglePause(true)}>
          ❚❚
        </button>
        {hud && !hud.alive && hud.phase === 'playing' && (
          <div className="respawn" data-testid="respawn">
            {t('game.respawn', { s: Math.ceil(hud.respawn) })}
          </div>
        )}
      </div>
      {paused && !results && (
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
      {results && <ResultsScreen rows={results} localId={0} record={record} onAgain={onAgain} onMenu={onQuit} />}
    </div>
  );
}

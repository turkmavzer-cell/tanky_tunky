import { useEffect, useRef, useState } from 'react';
import { GameScene, type HudSnapshot } from '../scenes/GameScene';
import type { Settings } from '../core/save';
import { onAppPause } from '../core/platform';
import { t } from '../i18n';
import { TouchControls } from './touchControls';
import { ALL_TANK_CLASSES, COMBAT, type CombatClassId, type TankClassId } from '../sim/config';
import type { ScoreRow } from '../game/matchSetup';
import { MissionResults, ResultsScreen } from './ResultsScreen';
import type { MissionResult } from '../game/campaign';
import type { TankBoost } from '../sim/state';
import type { SaveData } from '../core/save';
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
  campaignLevel: string;
  roster: TankClassId;
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
  if (cls && ALL_TANK_CLASSES.includes(cls as CombatClassId)) out.playerClass = cls;
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
  const roster = q.get('roster') as TankClassId | null;
  if (roster && ALL_TANK_CLASSES.includes(roster as CombatClassId)) out.roster = roster;
  const camp = q.get('campaign');
  if (camp) out.campaignLevel = camp;
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
  /** Returns the credits (and upgrade parts) the match paid (saved by the App, shown on the results screen). */
  onMatchEnd: (summary: MatchSummary) => { credits: number; parts: number };
  /** Current save + setter: the mission results screen spends upgrade parts on a tank (round 06). */
  save: SaveData;
  onSave: (s: SaveData) => void;
  /** Campaign level id (round 05); undefined = Quick Match. */
  campaignLevel?: string;
  /** Garage multipliers for the player's tank. */
  playerBoost?: Partial<TankBoost>;
  /** Campaign: a next level exists and can be started from the results screen. */
  hasNext?: boolean;
  onNext?: () => void;
}

export interface MatchSummary {
  kills: number;
  deaths: number;
  /** Quick Match: the player's team scored more kills. Campaign: the HQ was destroyed. */
  teamWon: boolean;
  mission: MissionResult | null;
}

export function GameView({ settings, playerClass, seed, record, onQuit, onAgain, onMatchEnd, campaignLevel, playerBoost, hasNext = false, onNext, save, onSave }: GameViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const controlsHost = useRef<HTMLDivElement>(null);
  const minimapHost = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [results, setResults] = useState<ScoreRow[] | null>(null);
  const [mission, setMission] = useState<MissionResult | null>(null);
  const [earned, setEarned] = useState(0);
  const [earnedParts, setEarnedParts] = useState(0);
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
      campaignLevel,
      playerBoost,
      ...dbg,
    });
    sceneRef.current = scene;
    let cancelled = false;
    const touch = new TouchControls(controlsHost.current!, {
      leftHanded: settings.leftHanded,
      sensitivity: settings.joystickSensitivity,
      labels: { fire: t('hud.fire'), ability: t('hud.ability'), ult: t('hud.ult') },
      buildName: campaignLevel ? t('hud.build') : undefined,
    });
    scene.touch = touch;
    scene.onMatchEnd = (rows) => {
      const me = rows.find((r) => r.id === scene.localId);
      const m = scene.missionResult();
      const team = (k: number): number => rows.filter((r) => r.team === k).reduce((a, r) => a + r.kills, 0);
      const myTeam = me?.team ?? 0;
      const teamWon = m ? m.won : team(myTeam) > team(1 - myTeam);
      const pay = endRef.current({ kills: me?.kills ?? 0, deaths: me?.deaths ?? 0, teamWon, mission: m });
      setEarned(pay.credits);
      setEarnedParts(pay.parts);
      setMission(m);
      setResults(rows);
    };
    void scene.init(host.current!).then(() => {
      if (cancelled) return;
      window.__tanky = { scene };
      const label = touch.root.querySelector('.ability-btn .act-label');
      if (label) label.textContent = scene.hud().abilityName.toUpperCase();
      const ultLabel = touch.root.querySelector('.ult-btn .act-label');
      const h0 = scene.hud();
      if (ultLabel) ultLabel.textContent = h0.ultName.toUpperCase();
      const ultBtn = touch.root.querySelector<HTMLElement>('.ult-btn');
      if (ultBtn) ultBtn.style.display = h0.hasUlt ? '' : 'none';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playerBoost is read once per match (seed changes per match)
  }, [settings.quality, settings.fpsCap, settings.reduceShake, settings.aimAssist, settings.edgeHighlight, settings.cooldownMul, settings.difficulty, settings.mapTheme, settings.sound, settings.music, settings.leftHanded, settings.joystickSensitivity, playerClass, seed, campaignLevel]);

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
            {hud.hasUlt && (
              <div
                className={'ab-chip ult ' + (hud.ultActive > 0 ? 'active' : hud.ultCooldown > 0 ? 'cooling' : 'ready')}
                data-testid="ult-chip"
              >
                {hud.ultName}{' '}
                <b>{hud.ultActive > 0 ? `${Math.ceil(hud.ultActive)} ${t('hud.sec')}` : hud.ultCooldown > 0 ? `${Math.ceil(hud.ultCooldown)} ${t('hud.sec')}` : t('hud.ready')}</b>
              </div>
            )}
            <div className="kd" data-testid="kd">
              {t('hud.kd')} <b>{hud.kills}</b>/<b>{hud.deaths}</b>
            </div>
          </div>
        )}
        {hud?.mode === 'campaign' && (
          <div className="objective-chip" data-testid="objective">
            <span>{t('campaign.objective')}</span>
            <div className="hq-bar">
              <i style={{ width: `${hud.hqMax > 0 ? (hud.hqHp / hud.hqMax) * 100 : 0}%` }} />
            </div>
            <small>{t('campaign.enemiesLeft', { n: hud.enemiesLeft })}</small>
          </div>
        )}
        {hud && hud.hqAngle !== null && hud.phase === 'playing' && hud.hqDist > 6 && (
          <div className="hq-arrow" data-testid="hq-arrow" style={{ transform: `translate(-50%, -50%) rotate(${hud.hqAngle}rad) translateX(min(30vw, 38vh))` }}>
            <span style={{ transform: `rotate(${-hud.hqAngle}rad)` }}>{hud.hqDist}</span>
          </div>
        )}
        <div ref={minimapHost} className={'minimap-host' + (settings.leftHanded ? ' right' : '')} data-testid="minimap-host" onPointerDown={(e) => { e.stopPropagation(); sceneRef.current?.minimap?.toggle(); }} />
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
      {hud?.buildMsg && (
        <div className="build-msg" data-testid="build-msg">
          {t(`build.${hud.buildMsg}` as Parameters<typeof t>[0])}
        </div>
      )}
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
      {results && mission && <MissionResults result={mission} credits={earned} parts={earnedParts} save={save} onSave={onSave} hasNext={hasNext} onNext={() => onNext?.()} onRetry={onAgain} onMenu={onQuit} />}
      {results && !mission && <ResultsScreen rows={results} localId={0} record={record} credits={earned} onAgain={onAgain} onMenu={onQuit} />}
    </div>
  );
}

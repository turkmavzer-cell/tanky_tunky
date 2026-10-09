import { Application, Container, CullerPlugin, Graphics, Sprite, extensions } from 'pixi.js';

// skip rendering of off-screen sprites flagged `cullable` (world features)
extensions.add(CullerPlugin);
import { FixedStepLoop } from '../core/loop';
import { FrameStats } from '../core/frameStats';
import { KeyboardMouse } from '../core/keyboard';
import { haptic } from '../core/platform';
import { ABILITIES, COMBAT, MATCH, SIM_DT, TANKS, VISION, type AbilityId, type TankClassId } from '../sim/config';
import { AIM_AUTO, BTN_ABILITY, BTN_FIRE, EMPTY_INPUT, quantizeAim, quantizeMove, type PlayerInput } from '../sim/input';
import { chargeLevel } from '../sim/sim';
import type { SimEvent, SimState } from '../sim/state';
import { lerp, lerpAngle } from '../sim/dmath';
import { maxHp } from '../sim/upgrades';
import { canSeeTank, inForest, isInvisible, tileVisible } from '../sim/visibility';
import { Camera } from '../render/camera';
import { WorldRenderer } from '../render/worldRenderer';
import { TankView } from '../render/tankView';
import { Fx } from '../render/fx';
import { FogLayer } from '../render/fogLayer';
import { Overlays } from '../render/overlays';
import { LEVEL_PX } from '../render/terrainArt';
import type { MapSize } from '../world/generator';
import { loadAsciiMap, type AsciiMap } from '../world/mapLoader';
import { Ground } from '../world/terrain';
import { screenAngleToWorld, screenDirToWorld, screenToWorld, worldAngleToScreen, worldToScreenX, worldToScreenY } from '../world/iso';
import type { Quality } from '../core/save';
import type { TouchControls } from '../ui/touchControls';
import { Minimap } from '../ui/minimap';
import type { AiLevel } from '../systems/ai/bot';
import { generateThemed } from '../world/themes';
import type { MapTheme } from '../world/map';
import { createMatch, defaultTeams, scoreboard, stepMatch, type MatchHandle, type ScoreRow } from '../game/matchSetup';
import { createAudioSystem, createSilentAudio, type AudioSystem, type EngineHandle, type SfxName } from '../audio';
import debugHeights from '../../maps/debug_heights.json';

export interface GameSceneOptions {
  quality: Quality;
  fpsCap: 30 | 60;
  reduceShake: boolean;
  /** Auto turret targeting (settings, default on). */
  autoAim: boolean;
  /** Obstacle highlight (settings): normal | strong. */
  edgeHighlight: 'normal' | 'strong';
  /** Map theme (round 03): desert ruins, modern city or the original forest/river map. */
  mapTheme?: MapTheme;
  /** Bot difficulty for all bots (allies and enemies). */
  aiLevel?: AiLevel;
  /** Dev: ability cooldown multiplier 0.1x–3x. */
  cooldownMul: number;
  volume: { master: number; sfx: number; music: number };
  seed?: number;
  mapSize?: MapSize;
  /** Hand-made map name (e.g. "debug_heights"). */
  mapName?: string;
  playerClass?: TankClassId;
  silent?: boolean;
  renderScale?: number;
  debugView?: { x: number; y: number; zoom: number };
  /** Debug: 'all' = every bot idle, 'allies' = only the player's team idle (staged tests). */
  idleBots?: boolean | 'allies';
  /** No timer (sandbox / visual tests). */
  endless?: boolean;
  /** Disable fog rendering (debug screenshots of whole maps). */
  noFog?: boolean;
  /** Override match length (s) — tests. */
  duration?: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  /** Crate upgrades collected this life. */
  upgrades: number;
  alive: boolean;
  respawn: number;
  kills: number;
  deaths: number;
  charge: number;
  overheat: number;
  phase: 'countdown' | 'playing' | 'ended';
  countdown: number;
  timeLeft: number;
  abilityId: AbilityId;
  abilityName: string;
  abilityActive: number;
  abilityCooldown: number;
  abilityCooldownMax: number;
  protect: number;
  cls: TankClassId;
  endless: boolean;
}

const RES_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const ARC_PX = 46;

interface ShellView {
  s: Sprite;
  shadow: Sprite;
  seen: number;
}

/** The in-match scene: Pixi app + fixed-step loop + match (sim + bots) + fx/audio/haptics. */
export class GameScene {
  readonly app = new Application();
  readonly stats = new FrameStats();
  match!: MatchHandle;
  get state(): SimState {
    return this.match.state;
  }
  private prev: { x: number; y: number; hull: number; turret: number }[] = [];
  private loop!: FixedStepLoop;
  private kb!: KeyboardMouse;
  private readonly camera = new Camera();
  private world = new Container();
  worldView!: WorldRenderer;
  private fx!: Fx;
  private fog: FogLayer | null = null;
  private overlays!: Overlays;
  private bars = new Graphics();
  private chargeG = new Graphics();
  private tankViews: TankView[] = [];
  private shellViews = new Map<number, ShellView>();
  private lastRender = 0;
  private raf = 0;
  private disposed = false;
  private frameEvents: SimEvent[] = [];
  private lastTrack: { x: number; y: number }[] = [];
  private wreckSmoke: number[] = [];
  private audio: AudioSystem;
  private engines: EngineHandle[] = [];
  private chargeSoundOn = false;
  private baseZoom = 1;
  private mouseMovedAt = -1e9;
  private lastMouse = { x: 0, y: 0 };
  private localInput: PlayerInput = { ...EMPTY_INPUT };
  private abPrevActive = 0;
  private abPrevCooldown = 0;
  private abActiveMax = 1;
  private readonly inputs: PlayerInput[] = [];
  touch: TouchControls | null = null;
  minimap: Minimap | null = null;
  onMatchEnd: ((rows: ScoreRow[]) => void) | null = null;
  readonly localId = 0;

  constructor(private readonly opts: GameSceneOptions) {
    this.audio = opts.silent ? createSilentAudio() : createAudioSystem();
  }

  async init(host: HTMLElement): Promise<void> {
    const resolution = this.opts.renderScale ?? Math.min(window.devicePixelRatio || 1, RES_CAP[this.opts.quality]);
    await this.app.init({
      resizeTo: host,
      background: '#06080d',
      antialias: false,
      autoStart: false,
      autoDensity: true,
      resolution,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.app.canvas.classList.add('game-canvas');
    host.appendChild(this.app.canvas);
    this.camera.reduceShake = this.opts.reduceShake;
    this.audio.setVolumes(this.opts.volume);

    const seed = this.opts.seed ?? ((Date.now() / 1000) | 0);
    const size = this.opts.mapSize ?? (MATCH as { mapSize?: MapSize }).mapSize ?? 40;
    const map = this.opts.mapName === 'debug_heights' ? loadAsciiMap(debugHeights as AsciiMap, seed) : generateThemed(this.opts.mapTheme ?? 'desert', seed, size);
    this.match = createMatch({
      seed,
      map,
      teams: defaultTeams(seed, this.opts.playerClass ?? 'standard'),
      humanPlayer: true,
      aiLevel: this.opts.aiLevel,
      rules: { cooldownMul: this.opts.cooldownMul, endless: this.opts.endless ?? false, ...(this.opts.duration ? { duration: this.opts.duration } : {}) },
    });
    if (this.opts.idleBots === 'allies') this.match.bots = this.match.bots.map((b, i) => (this.state.tanks[i].team === 0 ? null : b));
    else if (this.opts.idleBots) this.match.bots = this.match.bots.map(() => null);
    this.snapshotPrev();

    this.worldView = new WorldRenderer(map);
    this.worldView.edgeMode = this.opts.edgeHighlight;
    this.fx = new Fx(this.opts.quality === 'low' ? 350 : 700);
    this.fx.quality = this.opts.quality === 'low' ? 0.5 : 1;
    this.overlays = new Overlays((x, y) => this.worldView.heightPx(x, y));
    // darkening overlay only in line-of-sight mode; the default is full visibility (D-037)
    if (!this.opts.noFog && !this.state.rules.fullVisibility) this.fog = new FogLayer(map.width, map.height);
    this.worldView.attach(this.app.renderer);
    this.world.addChild(this.worldView.ground, this.fx.under, this.overlays.ground, this.worldView.objects, this.fx.over, this.overlays.air, this.worldView.bumpLayer);
    if (this.fog) this.world.addChild(this.fog.container);
    this.world.addChild(this.chargeG, this.bars);
    this.app.stage.addChild(this.world);
    for (const t of this.state.tanks) {
      const v = new TankView(t.cls, t.team);
      this.worldView.objects.addChild(v.root);
      this.tankViews.push(v);
      this.lastTrack.push({ x: t.x, y: t.y });
      this.wreckSmoke.push(0);
      this.engines.push(this.audio.createEngine(t.cls));
    }
    if (this.state.tanks[this.localId].cls === 'trapper') this.minimap = new Minimap();
    const p = this.state.tanks[this.localId];
    this.camera.snap(this.sx(p.x, p.y), this.sy(p.x, p.y));
    this.updateBaseZoom();
    this.camera.zoom = this.baseZoom;

    this.kb = new KeyboardMouse(this.app.canvas);
    const unlock = (): void => void this.audio.unlock().then(() => this.audio.setAmbience(true));
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    this.loop = new FixedStepLoop(SIM_DT * 1000, { tick: () => this.tick(), render: (a, dt) => this.render(a, dt) });
    const frame = (now: number): void => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(frame);
      if (this.opts.fpsCap === 30 && now - this.lastRender < 1000 / 30 - 2) return;
      const start = performance.now();
      const dt = this.lastRender ? now - this.lastRender : 16.7;
      this.lastRender = now;
      this.loop.frame(now);
      this.stats.push(dt, performance.now() - start);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private updateBaseZoom(): void {
    const h = this.app.screen.height;
    this.baseZoom = Math.max(0.42, Math.min(1.15, h / 700));
  }

  private snapshotPrev(): void {
    const ts = this.state.tanks;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const p = this.prev[i] ?? (this.prev[i] = { x: 0, y: 0, hull: 0, turret: 0 });
      p.x = t.x;
      p.y = t.y;
      p.hull = t.hull;
      p.turret = t.turret;
    }
  }

  private sampleInput(): PlayerInput {
    const me = this.state.tanks[this.localId];
    const touch = this.touch?.state;
    if (touch?.active) {
      const w = screenDirToWorld(touch.moveX, touch.moveY);
      let aim: number;
      if (touch.aimAngle !== null) aim = quantizeAim(screenAngleToWorld(touch.aimAngle));
      else if (this.opts.autoAim) aim = AIM_AUTO;
      else aim = Math.abs(w.x) + Math.abs(w.y) > 0.1 ? quantizeAim(Math.atan2(w.y, w.x)) : quantizeAim(me.turret);
      return { moveX: quantizeMove(w.x), moveY: quantizeMove(w.y), aim, buttons: (touch.fire ? BTN_FIRE : 0) | (touch.ability ? BTN_ABILITY : 0) };
    }
    const mv = this.kb.moveVector();
    const w = screenDirToWorld(mv.x, mv.y);
    if (this.kb.mouseX !== this.lastMouse.x || this.kb.mouseY !== this.lastMouse.y) {
      this.lastMouse = { x: this.kb.mouseX, y: this.kb.mouseY };
      this.mouseMovedAt = performance.now();
    }
    let aim: number;
    const mouseActive = this.kb.hasMouse && (!this.opts.autoAim || performance.now() - this.mouseMovedAt < 1200);
    if (mouseActive) {
      const sx = this.kb.mouseX / this.camera.zoom + this.viewLeft();
      const sy = this.kb.mouseY / this.camera.zoom + this.viewTop() + this.worldView.heightPx(me.x, me.y);
      const m = screenToWorld(sx, sy);
      aim = quantizeAim(Math.atan2(m.y - me.y, m.x - me.x));
    } else if (this.opts.autoAim) aim = AIM_AUTO;
    else aim = mv.x || mv.y ? quantizeAim(Math.atan2(w.y, w.x)) : quantizeAim(me.turret);
    return { moveX: quantizeMove(w.x), moveY: quantizeMove(w.y), aim, buttons: (this.kb.fireHeld() ? BTN_FIRE : 0) | (this.kb.abilityHeld() ? BTN_ABILITY : 0) };
  }

  private tick(): void {
    this.localInput = this.sampleInput();
    this.snapshotPrev();
    stepMatch(this.match, this.localInput, this.inputs);
    for (const e of this.state.events) this.frameEvents.push(e);
  }

  private viewLeft(): number {
    return this.camera.x - this.app.screen.width / 2 / this.camera.zoom;
  }

  private viewTop(): number {
    return this.camera.y - this.app.screen.height / 2 / this.camera.zoom;
  }

  private sx(x: number, y: number): number {
    return worldToScreenX(x, y);
  }

  private sy(x: number, y: number): number {
    return worldToScreenY(x, y) - this.worldView.heightPx(x, y);
  }

  private get myTeam(): number {
    return this.state.tanks[this.localId].team;
  }

  /** May the local player perceive an effect at world (x, y)? (fog rule for fx/sfx) */
  private seenAt(x: number, y: number): boolean {
    return !this.fog || tileVisible(this.state, this.myTeam, x, y);
  }

  private play(name: SfxName, x?: number, y?: number, intensity?: number): void {
    if (x === undefined || y === undefined) this.audio.play(name);
    else this.audio.play(name, { x, y, intensity, muffled: !this.seenAt(x, y) });
  }

  private handleEvents(): void {
    const s = this.state;
    const me = s.tanks[this.localId];
    for (const e of this.frameEvents) {
      switch (e.type) {
        case 'fire': {
          const t = s.tanks[e.tank];
          const visible = t.team === this.myTeam || this.seenAt(e.x, e.y);
          if (visible) {
            this.tankViews[e.tank].kick(6 + e.charge * 10);
            this.fx.muzzle(this.sx(e.x, e.y), this.sy(e.x, e.y) - 14, worldAngleToScreen(e.angle), e.charge, e.kind === 'heavy');
          }
          const snd: SfxName = e.charge >= 0.95 ? 'fire_charged' : e.kind === 'artillery' ? 'fire_artillery' : t.cls === 'heavy' ? 'fire_heavy' : t.cls === 'scout' ? 'fire_light' : 'fire_medium';
          this.play(snd, e.x, e.y, e.charge);
          if (e.tank === this.localId) {
            this.camera.addTrauma(0.12 + e.charge * 0.35);
            haptic(e.charge >= 0.9 ? 'heavy' : e.charge >= 0.4 ? 'medium' : 'light');
          }
          break;
        }
        case 'chargeFull':
          if (e.tank === this.localId) {
            this.play('perfect_charge');
            haptic('light');
          }
          break;
        case 'overheat':
          if (e.tank === this.localId) {
            this.play('overheat');
            haptic('medium');
          }
          break;
        case 'bounce':
          if (this.seenAt(e.x, e.y)) this.fx.sparks(this.sx(e.x, e.y), this.sy(e.x, e.y) - 10, 10);
          this.play('ricochet', e.x, e.y);
          break;
        case 'explode': {
          const seen = this.seenAt(e.x, e.y) || s.tanks[e.owner]?.team === this.myTeam;
          const px = this.sx(e.x, e.y);
          const py = this.sy(e.x, e.y);
          if (e.kind === 'rumble') {
            this.overlays.ring(e.x, e.y, e.radius);
            if (seen) for (let k = 0; k < 14; k++) this.fx.dust(px + (Math.random() - 0.5) * e.radius * 120, py + (Math.random() - 0.5) * e.radius * 60, 0xb8a080);
            this.play('siege_on', e.x, e.y);
            this.play('explosion_big', e.x, e.y, 0.6);
            if (e.owner === this.localId) haptic('heavy');
          } else {
            if (seen) this.fx.explosion(px, py - 6, e.radius * 90, e.charge);
            this.play(e.kind === 'mine' ? 'mine_explode' : e.radius > 0.8 || e.charge > 0.6 ? 'explosion_big' : 'explosion_small', e.x, e.y, e.charge);
          }
          const d = Math.hypot(e.x - me.x, e.y - me.y);
          if (d < 9) this.camera.addTrauma((0.1 + e.charge * 0.25 + (e.kind === 'rumble' ? 0.3 : 0)) * (1 - d / 9));
          break;
        }
        case 'hit': {
          const t = s.tanks[e.target];
          const visible = canSeeTank(s, this.myTeam, t) || t.team === this.myTeam;
          if (visible) {
            this.tankViews[e.target].hitFlash();
            this.fx.damageNumber(this.sx(t.x, t.y), this.sy(t.x, t.y) - 50, e.damage, e.damage >= TANKS[t.cls].hp * 0.25); // big hit = a quarter of the max hp
            this.fx.sparks(this.sx(t.x, t.y), this.sy(t.x, t.y) - 16, 8);
          }
          this.play('hit_metal', t.x, t.y);
          if (e.target === this.localId) {
            this.camera.addTrauma(0.3);
            haptic('heavy');
          }
          break;
        }
        case 'graze':
          if (this.seenAt(e.x, e.y)) this.fx.sparks(this.sx(e.x, e.y), this.sy(e.x, e.y) - 12, 5);
          this.play('ricochet', e.x, e.y);
          break;
        case 'destroyed': {
          if (this.seenAt(e.x, e.y) || s.tanks[e.tank].team === this.myTeam) {
            const px = this.sx(e.x, e.y);
            const py = this.sy(e.x, e.y);
            this.fx.explosion(px, py - 10, 140, 1);
            this.fx.sparks(px, py - 20, 24, 0xffb060);
            this.wreckSmoke[e.tank] = 2.5;
          }
          this.play('destroy_tank', e.x, e.y);
          if (e.tank === this.localId || e.by === this.localId) haptic('heavy');
          if (Math.hypot(e.x - me.x, e.y - me.y) < 10) this.camera.addTrauma(0.45);
          break;
        }
        case 'terrain':
          if (e.destroyed) {
            if (this.seenAt(e.x + 0.5, e.y + 0.5)) this.fx.explosion(this.sx(e.x + 0.5, e.y + 0.5), this.sy(e.x + 0.5, e.y + 0.5) - 10, 70, 0.3);
            this.play('wall_break', e.x + 0.5, e.y + 0.5);
          } else {
            if (this.seenAt(e.x + 0.5, e.y + 0.5)) this.fx.sparks(this.sx(e.x + 0.5, e.y + 0.5), this.sy(e.x + 0.5, e.y + 0.5) - 14, 6, 0xd8c8a8);
            this.play('hit_wall', e.x + 0.5, e.y + 0.5);
          }
          break;
        case 'pickup': {
          const t = s.tanks[e.tank];
          this.fx.sparks(this.sx(e.x, e.y), this.sy(e.x, e.y) - 16, 14, 0xffd84a);
          this.fx.floatText(this.sx(t.x, t.y), this.sy(t.x, t.y) - 70, `+%${Math.round(e.level * COMBAT.upgrades.perPickup * 100)}`, '#ffd84a', 1.2);
          this.play('perfect_charge', e.x, e.y);
          if (e.tank === this.localId) haptic('light');
          break;
        }
        case 'regen': {
          const t = s.tanks[e.tank];
          if (canSeeTank(s, this.myTeam, t)) {
            this.fx.sparks(this.sx(t.x, t.y), this.sy(t.x, t.y) - 20, 8, 0x8aff8a);
            this.fx.floatText(this.sx(t.x, t.y), this.sy(t.x, t.y) - 56, `+${Math.round(e.amount)}`, '#8aff8a');
          }
          break;
        }
        case 'crateRespawn':
          break;
        case 'respawn':
          this.prev[e.tank].x = s.tanks[e.tank].x;
          this.prev[e.tank].y = s.tanks[e.tank].y;
          this.lastTrack[e.tank] = { x: s.tanks[e.tank].x, y: s.tanks[e.tank].y };
          if (e.tank === this.localId) this.camera.snap(this.sx(me.x, me.y), this.sy(me.x, me.y));
          break;
        case 'bump':
          if (e.tank === this.localId) {
            this.worldView.bump(e.x, e.y, e.dir);
            haptic('light');
            this.play('ui_click');
          }
          break;
        case 'ability': {
          const t = s.tanks[e.tank];
          const mine = t.team === this.myTeam;
          if (e.phase === 'start') {
            if (e.id === 'hide') this.play('hologram', t.x, t.y);
            if (e.id === 'swift') this.play('dash', t.x, t.y);
            if (e.id === 'barrage' && mine) this.play('alarm');
          } else {
            if (e.id === 'hide') this.play('shield_hit', t.x, t.y);
            if (e.id === 'mine' && mine) this.play('trap_place', t.x, t.y);
          }
          if (e.tank === this.localId && e.phase === 'start') haptic(e.id === 'rumble' ? 'heavy' : 'medium');
          break;
        }
        case 'matchStart':
          this.play('ui_confirm');
          break;
        case 'matchTick':
          this.play('notify');
          break;
        case 'matchEnd': {
          const rows = scoreboard(s);
          const myKills = s.tanks.filter((t) => t.team === this.myTeam).reduce((a, t) => a + t.kills, 0);
          const theirKills = s.tanks.filter((t) => t.team !== this.myTeam).reduce((a, t) => a + t.kills, 0);
          this.play(myKills >= theirKills ? 'victory' : 'defeat');
          this.onMatchEnd?.(rows);
          break;
        }
        default:
          break;
      }
    }
    this.frameEvents.length = 0;
  }

  private render(alpha: number, dtMs: number): void {
    const dt = dtMs / 1000;
    const s = this.state;
    this.handleEvents();
    const tanks = s.tanks;
    const me = tanks[this.localId];
    this.audio.setListener(me.x, me.y);
    this.bars.clear();
    this.overlays.begin(dt);
    const time = performance.now() / 1000;
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      const p = this.prev[i];
      const v = this.tankViews[i];
      const own = t.team === this.myTeam;
      const seen = canSeeTank(s, this.myTeam, t);
      const invisible = isInvisible(t);
      // enemy hit while invisible: brief shimmer cue in visible tiles
      const shimmer = !own && invisible && t.shimmer > 0 && tileVisible(s, this.myTeam, t.x, t.y);
      v.root.visible = t.alive && (seen || shimmer);
      let a = 1;
      if (own && invisible) a = 0.42;
      else if (inForest(s, t)) a = own ? 0.75 : VISION.forestAlpha; // concealed in the trees
      if (shimmer) a = 0.12 + 0.18 * Math.abs(Math.sin(time * 40));
      if (t.protect > 0) a *= 0.55 + 0.45 * Math.abs(Math.sin(time * 14));
      v.root.alpha = a;
      v.setGlow(t.ability.id === 'swift' && t.ability.active > 0 ? 0xfff0d6 : null);
      const x = lerp(p.x, t.x, alpha);
      const y = lerp(p.y, t.y, alpha);
      const sx = this.sx(x, y);
      const sy = this.sy(x, y);
      v.root.position.set(sx, sy);
      v.root.zIndex = x + y;
      v.setAngles(lerpAngle(p.hull, t.hull, alpha), lerpAngle(p.turret, t.turret, alpha));
      v.update(dt);
      const def = TANKS[t.cls];
      const speed = Math.hypot(t.vx, t.vy);
      const audible = t.alive && !(invisible && !own);
      this.audio.updateEngine(this.engines[i], { x, y, speed: audible ? Math.min(1, speed / def.maxSpeed) : 0, load: t.charging ? 0.6 + 0.4 * chargeLevel(t) : Math.min(1, speed / def.maxSpeed) * 0.5, muffled: !seen || invisible });
      if (this.wreckSmoke[i] > 0) {
        this.wreckSmoke[i] -= dt;
        if (Math.random() < 0.5) this.fx.emit(this.fx.tex.smoke, sx + (Math.random() - 0.5) * 20, sy - 10, { vy: -40, g: -10, drag: 0.8, life: 1.4, s0: 0.4, s1: 1.4, a0: 0.5, a1: 0, tint: 0x302c28, rot: Math.random() * 6 });
      }
      if (!t.alive || !v.root.visible || (invisible && !own)) continue;
      // Swift: exhaust flames + speed lines
      if (t.ability.id === 'swift' && t.ability.active > 0) {
        const back = worldAngleToScreen(t.hull) + Math.PI;
        this.fx.emit(this.fx.tex.dot, sx + Math.cos(back) * 30, sy - 8 + Math.sin(back) * 15, { vx: Math.cos(back) * 60, vy: Math.sin(back) * 30, life: 0.22, s0: 0.9, s1: 0.2, a0: 1, a1: 0, add: true, tint: Math.random() < 0.5 ? 0xffa030 : 0xff5a20 });
        if (speed > 0.5) this.overlays.speedLines(x, y, t.vx, t.vy);
      }
      // track marks + dust
      const lt = this.lastTrack[i];
      if (Math.hypot(t.x - lt.x, t.y - lt.y) > 0.28) {
        this.fx.trackMark(sx, sy + 2, worldAngleToScreen(t.hull));
        const g = s.map.ground[Math.floor(t.y) * s.map.width + Math.floor(t.x)];
        if (g === Ground.Sand || g === Ground.Dirt || g === Ground.Mud) this.fx.dust(sx, sy + 4, g === Ground.Mud ? 0x4a3a28 : 0xc8b088);
        lt.x = t.x;
        lt.y = t.y;
      }
      // health bar
      const w = 44;
      const hpF = t.hp / maxHp(t);
      const by = sy - 62;
      this.bars.rect(sx - w / 2 - 1, by - 1, w + 2, 7).fill({ color: 0x000000, alpha: 0.6 });
      this.bars.rect(sx - w / 2, by, w * Math.min(1, hpF), 5).fill(own ? (i === this.localId ? 0x7ee07e : 0x6aa9ff) : 0xff5a4a);
      // crate upgrades: one gold pip each under the bar (round 03)
      for (let k = 0; k < t.upgrades; k++) this.bars.rect(sx - w / 2 + k * 3.7, by + 7, 3, 3).fill(0xffd84a);
      if (!own) {
        // enemy marker: red triangle above the bar (colour-blind friendly shape + colour)
        this.bars.poly([sx - 6, by - 12, sx + 6, by - 12, sx, by - 4]).fill(0xff3b30);
      }
    }
    // lock-on reticle (job 1)
    if (me.alive && me.target >= 0) {
      const tg = tanks[me.target];
      if (tg.alive) this.overlays.reticle(tg.x, tg.y);
    }
    for (const p of s.pickups) this.overlays.pickup(p.x, p.y);
    // mines (job 5): own team clearly, enemy mines only as a faint glimmer up close & in sight
    const glimmer = Number(ABILITIES.mine.glimmerRange);
    for (const m of s.mines) {
      if (m.team === this.myTeam) this.overlays.mine(m.x, m.y, true, m.arm <= 0);
      else if (me.alive && Math.hypot(m.x - me.x, m.y - me.y) <= glimmer && this.seenAt(m.x, m.y)) this.overlays.mine(m.x, m.y, false, true);
    }
    this.renderShells(alpha);
    this.renderCharge(me);
    this.touch?.update(dt);
    const ab = me.ability;
    const cdMax = Number(ABILITIES[ab.id].cooldown) * Math.max(0.1, s.rules.cooldownMul);
    this.touch?.setFeedback(me.charging ? chargeLevel(me) : 0, me.fullT > 0 && me.fullT <= COMBAT.charge.perfectWindow, me.overheat / COMBAT.charge.overheatLock);
    // the effect length is whatever the sim set when it started (includes upgrades)
    if (ab.active > 0 && this.abPrevActive <= 0) this.abActiveMax = ab.active;
    this.touch?.setAbility(ab.active, this.abActiveMax, ab.cooldown, cdMax);
    if (me.alive && ab.active <= 0 && ab.cooldown <= 0 && this.abPrevCooldown > 0) {
      // ability ready again: click + light buzz (the button flashes in setAbility)
      this.play('ui_click');
      haptic('light');
    }
    this.abPrevActive = ab.active;
    this.abPrevCooldown = ab.cooldown;
    this.fx.update(dt);
    this.overlays.end(dt);
    this.worldView.updateOverlays(dt);
    if (this.fog) this.fog.update(s.vision[this.myTeam], Math.floor(s.tick / 4));
    if (this.minimap) this.minimap.draw(s, this.localId, dt);

    // camera
    this.updateBaseZoom();
    const c = chargeLevel(me);
    this.camera.targetZoom = this.baseZoom * (1 - 0.12 * (me.charging ? c : 0));
    const px = lerp(this.prev[this.localId].x, me.x, alpha);
    const py = lerp(this.prev[this.localId].y, me.y, alpha);
    const look = 0.35;
    const dv = this.opts.debugView;
    if (dv) {
      this.camera.snap(this.sx(dv.x, dv.y), this.sy(dv.x, dv.y));
      this.camera.zoom = dv.zoom;
    } else this.camera.update(dt, this.sx(px, py), this.sy(px, py), worldToScreenX(me.vx, me.vy) * look, worldToScreenY(me.vx, me.vy) * look);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(Math.round(w / 2 - (this.camera.x + this.camera.shakeX) * z), Math.round(h / 2 - (this.camera.y + this.camera.shakeY) * z));
    const l = this.viewLeft();
    const tp = this.viewTop();
    this.worldView.bakeResolution = Math.min(this.app.renderer.resolution, (this.app.renderer.resolution * z) / 0.8);
    this.worldView.update(l, tp, l + w / z, tp + h / z, dt);
    this.app.render();
  }

  private renderShells(alpha: number): void {
    const s = this.state;
    for (const v of this.shellViews.values()) v.seen = 0;
    for (const sh of s.shells) {
      // barrage warning circles are shown to everyone, even through fog (job 5)
      if (sh.warn) this.overlays.warning(sh.tx, sh.ty, sh.radius, Math.min(1, sh.t / sh.flight));
      const ownShell = s.tanks[sh.owner]?.team === this.myTeam;
      if (!ownShell && !this.seenAt(sh.x, sh.y)) continue;
      let v = this.shellViews.get(sh.id);
      if (!v) {
        const sp = new Sprite(sh.kind === 'heavy' || sh.kind === 'artillery' ? this.fx.tex.shellHeavy : this.fx.tex.shell);
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        const shd = new Sprite(this.fx.tex.shadow);
        shd.anchor.set(0.5);
        this.worldView.objects.addChild(shd, sp);
        v = { s: sp, shadow: shd, seen: 1 };
        this.shellViews.set(sh.id, v);
      }
      v.seen = 1;
      let x: number;
      let y: number;
      let lift = 0;
      if (sh.kind === 'artillery') {
        const k = Math.min(1, (sh.t + alpha * SIM_DT) / sh.flight);
        x = sh.sx + (sh.tx - sh.sx) * k;
        y = sh.sy + (sh.ty - sh.sy) * k;
        lift = 4 * sh.arc * k * (1 - k) * ARC_PX;
      } else {
        x = sh.x + sh.vx * SIM_DT * alpha;
        y = sh.y + sh.vy * SIM_DT * alpha;
      }
      const gx = this.sx(x, y);
      const gy = worldToScreenY(x, y) - sh.level * LEVEL_PX;
      v.s.position.set(gx, gy - 16 - lift);
      v.s.rotation = worldAngleToScreen(Math.atan2(sh.vy, sh.vx));
      v.s.scale.set(1 + sh.charge * 0.6);
      v.s.zIndex = x + y + 0.2;
      v.shadow.position.set(gx, gy);
      v.shadow.zIndex = x + y - 0.3;
      v.shadow.scale.set(0.5 + sh.charge * 0.3);
      if (sh.charge > 0.5 && Math.random() < 0.6) this.fx.emit(this.fx.tex.dot, gx, gy - 16 - lift, { life: 0.25, s0: 0.5 + sh.charge * 0.5, s1: 0.1, a0: 0.7, a1: 0, add: true, tint: 0xffb050 });
    }
    for (const [id, v] of this.shellViews) {
      if (!v.seen) {
        v.s.destroy();
        v.shadow.destroy();
        this.shellViews.delete(id);
      }
    }
  }

  private renderCharge(me: SimState['tanks'][number]): void {
    this.chargeG.clear();
    const c = chargeLevel(me);
    const perfect = me.fullT > 0 && me.fullT <= COMBAT.charge.perfectWindow;
    if (me.alive && me.charging && c > 0) {
      const mx = this.sx(me.x, me.y);
      const my = this.sy(me.x, me.y) - 6;
      this.chargeG.ellipse(mx, my, 46, 23).stroke({ width: 3, color: 0x000000, alpha: 0.35 });
      const segs = Math.max(2, Math.round(40 * c));
      const pts: number[] = [];
      for (let k = 0; k <= segs; k++) {
        const a = -Math.PI / 2 + (k / 40) * Math.PI * 2;
        pts.push(mx + Math.cos(a) * 46, my + Math.sin(a) * 23);
      }
      this.chargeG.poly(pts, false).stroke({ width: perfect ? 5 : 3, color: perfect ? 0xfff2a0 : me.fullT > 0 ? 0xff7a3a : 0xe0a63a });
      if (!this.chargeSoundOn) {
        this.audio.chargeStart();
        this.chargeSoundOn = true;
      }
      this.audio.chargeUpdate(c, me.fullT > COMBAT.charge.perfectWindow);
    } else if (this.chargeSoundOn) {
      this.audio.chargeStop();
      this.chargeSoundOn = false;
    }
  }

  hud(): HudSnapshot {
    const s = this.state;
    const me = s.tanks[this.localId];
    const ab = me.ability;
    return {
      hp: Math.ceil(me.hp),
      maxHp: Math.round(maxHp(me)),
      upgrades: me.upgrades,
      alive: me.alive,
      respawn: Math.max(0, me.respawn),
      kills: me.kills,
      deaths: me.deaths,
      charge: chargeLevel(me),
      overheat: me.overheat,
      phase: s.match.phase,
      countdown: Math.max(0, Math.ceil(MATCH.countdown - s.match.t)),
      timeLeft: s.match.timeLeft,
      abilityId: ab.id,
      abilityName: String(ABILITIES[ab.id].name),
      abilityActive: ab.active,
      abilityCooldown: ab.cooldown,
      abilityCooldownMax: Number(ABILITIES[ab.id].cooldown) * Math.max(0.1, s.rules.cooldownMul),
      protect: me.protect,
      cls: me.cls,
      endless: s.rules.endless,
    };
  }

  setPaused(p: boolean): void {
    if (!this.loop) return;
    this.loop.paused = p;
    if (p) {
      this.audio.suspend();
      this.kb?.reset();
    } else {
      this.loop.resetClock();
      this.audio.resume();
    }
  }

  get paused(): boolean {
    return this.loop?.paused ?? false;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.kb?.dispose();
    this.audio.dispose();
    this.tankViews.forEach((v) => v.destroy());
    this.app.destroy({ removeView: true }, { children: true, texture: false });
  }
}

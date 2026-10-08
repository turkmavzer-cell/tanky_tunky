import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { FixedStepLoop } from '../core/loop';
import { FrameStats } from '../core/frameStats';
import { KeyboardMouse } from '../core/keyboard';
import { haptic } from '../core/platform';
import { COMBAT, SIM_DT, TANKS, type TankClassId } from '../sim/config';
import { BTN_ABILITY, BTN_FIRE, EMPTY_INPUT, quantizeAim, quantizeMove, type PlayerInput } from '../sim/input';
import { chargeLevel, createState, step } from '../sim/sim';
import type { SimEvent, SimState } from '../sim/state';
import { lerp, lerpAngle } from '../sim/dmath';
import { Camera } from '../render/camera';
import { WorldRenderer } from '../render/worldRenderer';
import { TankView } from '../render/tankView';
import { Fx } from '../render/fx';
import { generateMap, type MapSize } from '../world/generator';
import { Ground } from '../world/terrain';
import { screenAngleToWorld, screenDirToWorld, screenToWorld, worldAngleToScreen, worldToScreenX, worldToScreenY } from '../world/iso';
import type { Quality } from '../core/save';
import type { TouchControls } from '../ui/touchControls';
import { DummyBot } from '../ai/dummyBot';
import { createAudioSystem, createSilentAudio, type AudioSystem, type EngineHandle, type SfxName } from '../audio';

export interface GameSceneOptions {
  quality: Quality;
  fpsCap: 30 | 60;
  reduceShake: boolean;
  aimAssist: boolean;
  volume: { master: number; sfx: number; music: number };
  seed?: number;
  mapSize?: MapSize;
  playerClass?: TankClassId;
  /** Disable audio (tests/headless). */
  silent?: boolean;
  /** Override backbuffer resolution (perf gate: fill-rate normalisation). */
  renderScale?: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  alive: boolean;
  respawn: number;
  kills: number;
  deaths: number;
  charge: number;
  overheat: number;
  teamScore: [number, number];
}

const RES_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
/** World px per artillery arc unit (screen lift). */
const ARC_PX = 46;

interface ShellView {
  s: Sprite;
  shadow: Sprite;
  seen: number;
}

/** The in-match scene: owns the Pixi app, the fixed-step loop, input, bots, fx/audio and the simulation. */
export class GameScene {
  readonly app = new Application();
  readonly stats = new FrameStats();
  state!: SimState;
  private prev: { x: number; y: number; hull: number; turret: number }[] = [];
  private loop!: FixedStepLoop;
  private kb!: KeyboardMouse;
  private readonly camera = new Camera();
  private world = new Container();
  worldView!: WorldRenderer;
  private fx!: Fx;
  private bars = new Graphics();
  private chargeG = new Graphics();
  private tankViews: TankView[] = [];
  private shellViews = new Map<number, ShellView>();
  private bots: DummyBot[] = [];
  private lastRender = 0;
  private raf = 0;
  private disposed = false;
  private frameEvents: SimEvent[] = [];
  private trackAcc: number[] = [];
  private lastTrack: { x: number; y: number }[] = [];
  private wreckSmoke: number[] = [];
  private audio: AudioSystem;
  private engines: EngineHandle[] = [];
  private chargeSoundOn = false;
  private baseZoom = 1;
  /** Latest sampled input for the local player (tank 0). */
  private localInput: PlayerInput = { ...EMPTY_INPUT };
  touch: TouchControls | null = null;
  readonly localId = 0;

  constructor(private readonly opts: GameSceneOptions) {
    this.audio = opts.silent ? createSilentAudio() : createAudioSystem();
  }

  async init(host: HTMLElement): Promise<void> {
    const resolution = this.opts.renderScale ?? Math.min(window.devicePixelRatio || 1, RES_CAP[this.opts.quality]);
    await this.app.init({
      resizeTo: host,
      background: '#0b0d12',
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

    const seed = this.opts.seed ?? 1;
    const map = generateMap({ seed, size: this.opts.mapSize ?? 64 });
    const b0 = map.bases[0];
    const b1 = map.bases[1];
    const players: { team: number; cls: TankClassId; x: number; y: number }[] = [
      { team: 0, cls: this.opts.playerClass ?? 'standard', x: b0.spawns[0].x + 0.5, y: b0.spawns[0].y + 0.5 },
      { team: 0, cls: 'scout', x: b0.spawns[1].x + 0.5, y: b0.spawns[1].y + 0.5 },
      { team: 1, cls: 'standard', x: b1.spawns[0].x + 0.5, y: b1.spawns[0].y + 0.5 },
      { team: 1, cls: 'heavy', x: b1.spawns[1].x + 0.5, y: b1.spawns[1].y + 0.5 },
      { team: 1, cls: 'artillery', x: b1.spawns[2].x + 0.5, y: b1.spawns[2].y + 0.5 },
    ];
    this.state = createState({ seed, map, players });
    for (let i = 1; i < players.length; i++) this.bots[i] = new DummyBot(i, seed, 1);
    this.snapshotPrev();

    this.worldView = new WorldRenderer(map);
    this.fx = new Fx(this.opts.quality === 'low' ? 350 : 700);
    this.fx.quality = this.opts.quality === 'low' ? 0.5 : 1;
    this.world.addChild(this.worldView.ground, this.fx.under, this.worldView.objects, this.fx.over, this.chargeG, this.bars);
    this.app.stage.addChild(this.world);
    for (const t of this.state.tanks) {
      const v = new TankView(t.cls, t.team);
      this.worldView.objects.addChild(v.root);
      this.tankViews.push(v);
      this.trackAcc.push(0);
      this.lastTrack.push({ x: t.x, y: t.y });
      this.wreckSmoke.push(0);
      this.engines.push(this.audio.createEngine(t.cls));
    }
    const p = this.state.tanks[this.localId];
    this.camera.snap(worldToScreenX(p.x, p.y), worldToScreenY(p.x, p.y) - this.worldView.heightPx(p.x, p.y));
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

  /** Show roughly 11 tile rows vertically regardless of device (phone landscape ≈ 0.55). */
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

  /** Nearest living enemy within `range` tiles of the local tank (aim assist). Phase 4 restricts this to visible tanks. */
  private assistTarget(range: number): { x: number; y: number } | null {
    const me = this.state.tanks[this.localId];
    let best: { x: number; y: number } | null = null;
    let bd = range * range;
    for (const e of this.state.tanks) {
      if (!e.alive || e.team === me.team) continue;
      const d = (e.x - me.x) * (e.x - me.x) + (e.y - me.y) * (e.y - me.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private sampleInput(): PlayerInput {
    const me = this.state.tanks[this.localId];
    const def = TANKS[me.cls];
    let aim = this.localInput.aim;
    const touch = this.touch?.state;
    if (touch?.active) {
      const w = screenDirToWorld(touch.moveX, touch.moveY);
      if (touch.aimAngle !== null) aim = quantizeAim(screenAngleToWorld(touch.aimAngle));
      else {
        const tgt = this.opts.aimAssist ? this.assistTarget(def.range * 1.15) : null;
        if (tgt) aim = quantizeAim(Math.atan2(tgt.y - me.y, tgt.x - me.x));
        else if (Math.abs(w.x) + Math.abs(w.y) > 0.1) aim = quantizeAim(Math.atan2(w.y, w.x));
      }
      return { moveX: quantizeMove(w.x), moveY: quantizeMove(w.y), aim, buttons: (touch.fire ? BTN_FIRE : 0) | (touch.ability ? BTN_ABILITY : 0) };
    }
    const mv = this.kb.moveVector();
    const w = screenDirToWorld(mv.x, mv.y);
    if (this.kb.hasMouse) {
      const sx = this.kb.mouseX / this.camera.zoom + this.viewLeft();
      const sy = this.kb.mouseY / this.camera.zoom + this.viewTop() + this.worldView.heightPx(me.x, me.y);
      const m = screenToWorld(sx, sy);
      aim = quantizeAim(Math.atan2(m.y - me.y, m.x - me.x));
    } else if (mv.x || mv.y) {
      aim = quantizeAim(Math.atan2(w.y, w.x));
    }
    return {
      moveX: quantizeMove(w.x),
      moveY: quantizeMove(w.y),
      aim,
      buttons: (this.kb.fireHeld() ? BTN_FIRE : 0) | (this.kb.abilityHeld() ? BTN_ABILITY : 0),
    };
  }

  private readonly inputs: PlayerInput[] = [];

  private tick(): void {
    this.localInput = this.sampleInput();
    this.inputs[this.localId] = this.localInput;
    for (let i = 0; i < this.state.tanks.length; i++) if (this.bots[i]) this.inputs[i] = this.bots[i].input(this.state);
    this.snapshotPrev();
    step(this.state, this.inputs);
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

  private play(name: SfxName, x?: number, y?: number, intensity?: number): void {
    this.audio.play(name, x === undefined ? undefined : { x, y, intensity });
  }

  private handleEvents(): void {
    const me = this.state.tanks[this.localId];
    for (const e of this.frameEvents) {
      switch (e.type) {
        case 'fire': {
          const t = this.state.tanks[e.tank];
          const v = this.tankViews[e.tank];
          v.kick(6 + e.charge * 10);
          const a = worldAngleToScreen(e.angle);
          this.fx.muzzle(this.sx(e.x, e.y), this.sy(e.x, e.y) - 14, a, e.charge, e.kind === 'heavy');
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
          this.fx.sparks(this.sx(e.x, e.y), this.sy(e.x, e.y) - 10, 10);
          this.play('ricochet', e.x, e.y);
          break;
        case 'explode': {
          const px = this.sx(e.x, e.y);
          const py = this.sy(e.x, e.y);
          this.fx.explosion(px, py - 6, e.radius * 90, e.charge);
          this.play(e.radius > 0.8 || e.charge > 0.6 ? 'explosion_big' : 'explosion_small', e.x, e.y, e.charge);
          const d = Math.hypot(e.x - me.x, e.y - me.y);
          if (d < 9) this.camera.addTrauma((0.1 + e.charge * 0.25) * (1 - d / 9));
          break;
        }
        case 'hit': {
          const v = this.tankViews[e.target];
          v.hitFlash();
          const t = this.state.tanks[e.target];
          this.fx.damageNumber(this.sx(t.x, t.y), this.sy(t.x, t.y) - 50, e.damage, e.damage >= 30);
          this.fx.sparks(this.sx(t.x, t.y), this.sy(t.x, t.y) - 16, 8);
          this.play('hit_metal', t.x, t.y);
          if (e.target === this.localId) {
            this.camera.addTrauma(0.3);
            haptic('heavy');
          }
          break;
        }
        case 'graze':
          this.fx.sparks(this.sx(e.x, e.y), this.sy(e.x, e.y) - 12, 5);
          this.play('ricochet', e.x, e.y);
          break;
        case 'destroyed': {
          const px = this.sx(e.x, e.y);
          const py = this.sy(e.x, e.y);
          this.fx.explosion(px, py - 10, 140, 1);
          this.fx.sparks(px, py - 20, 24, 0xffb060);
          this.wreckSmoke[e.tank] = 2.5;
          this.play('destroy_tank', e.x, e.y);
          if (e.tank === this.localId || e.by === this.localId) haptic('heavy');
          if (Math.hypot(e.x - me.x, e.y - me.y) < 10) this.camera.addTrauma(0.45);
          break;
        }
        case 'terrain':
          if (e.destroyed) {
            this.fx.explosion(this.sx(e.x + 0.5, e.y + 0.5), this.sy(e.x + 0.5, e.y + 0.5) - 10, 70, 0.3);
            this.play('wall_break', e.x + 0.5, e.y + 0.5);
          } else {
            this.fx.sparks(this.sx(e.x + 0.5, e.y + 0.5), this.sy(e.x + 0.5, e.y + 0.5) - 14, 6, 0xd8c8a8);
            this.play('hit_wall', e.x + 0.5, e.y + 0.5);
          }
          break;
        case 'respawn':
          this.prev[e.tank].x = this.state.tanks[e.tank].x;
          this.prev[e.tank].y = this.state.tanks[e.tank].y;
          break;
      }
    }
    this.frameEvents.length = 0;
  }

  private render(alpha: number, dtMs: number): void {
    const dt = dtMs / 1000;
    this.handleEvents();
    const tanks = this.state.tanks;
    const me = tanks[this.localId];
    this.audio.setListener(me.x, me.y);
    this.bars.clear();
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      const p = this.prev[i];
      const v = this.tankViews[i];
      v.root.visible = t.alive;
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
      this.audio.updateEngine(this.engines[i], { x, y, speed: t.alive ? Math.min(1, speed / def.maxSpeed) : 0, load: t.charging ? 0.6 + 0.4 * chargeLevel(t) : Math.min(1, speed / def.maxSpeed) * 0.5, muffled: false });
      if (this.wreckSmoke[i] > 0) {
        this.wreckSmoke[i] -= dt;
        if (Math.random() < 0.5) this.fx.emit(this.fx.tex.smoke, sx + (Math.random() - 0.5) * 20, sy - 10, { vy: -40, g: -10, drag: 0.8, life: 1.4, s0: 0.4, s1: 1.4, a0: 0.5, a1: 0, tint: 0x302c28, rot: Math.random() * 6 });
      }
      if (!t.alive) continue;
      // track marks + dust
      const lt = this.lastTrack[i];
      const moved = Math.hypot(t.x - lt.x, t.y - lt.y);
      if (moved > 0.28) {
        this.fx.trackMark(sx, sy + 2, worldAngleToScreen(t.hull));
        const g = this.state.map.ground[Math.floor(t.y) * this.state.map.width + Math.floor(t.x)];
        if (g === Ground.Sand || g === Ground.Dirt || g === Ground.Mud) this.fx.dust(sx, sy + 4, g === Ground.Mud ? 0x4a3a28 : 0xc8b088);
        lt.x = t.x;
        lt.y = t.y;
      }
      // health bar
      const w = 44;
      const hpF = t.hp / def.hp;
      const by = sy - 62;
      this.bars.rect(sx - w / 2 - 1, by - 1, w + 2, 7).fill({ color: 0x000000, alpha: 0.6 });
      this.bars.rect(sx - w / 2, by, w * hpF, 5).fill(t.team === me.team ? (i === this.localId ? 0x7ee07e : 0x6aa9ff) : 0xff5a4a);
    }
    // shells
    for (const v of this.shellViews.values()) v.seen = 0;
    for (const s of this.state.shells) {
      let v = this.shellViews.get(s.id);
      if (!v) {
        const sp = new Sprite(s.kind === 'heavy' || s.kind === 'artillery' ? this.fx.tex.shellHeavy : this.fx.tex.shell);
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        const sh = new Sprite(this.fx.tex.shadow);
        sh.anchor.set(0.5);
        this.worldView.objects.addChild(sh, sp);
        v = { s: sp, shadow: sh, seen: 1 };
        this.shellViews.set(s.id, v);
      }
      v.seen = 1;
      let x: number;
      let y: number;
      let lift = 0;
      if (s.kind === 'artillery') {
        const k = Math.min(1, (s.t + alpha * SIM_DT) / s.flight);
        x = s.sx + (s.tx - s.sx) * k;
        y = s.sy + (s.ty - s.sy) * k;
        lift = 4 * s.arc * k * (1 - k) * ARC_PX;
      } else {
        x = s.x + s.vx * SIM_DT * alpha;
        y = s.y + s.vy * SIM_DT * alpha;
      }
      const gx = this.sx(x, y);
      const gy = worldToScreenY(x, y) - s.level * 24;
      v.s.position.set(gx, gy - 16 - lift);
      v.s.rotation = worldAngleToScreen(Math.atan2(s.vy, s.vx));
      v.s.scale.set(1 + s.charge * 0.6);
      v.s.zIndex = x + y + 0.2;
      v.shadow.position.set(gx, gy);
      v.shadow.zIndex = x + y - 0.3;
      v.shadow.scale.set(0.5 + s.charge * 0.3);
      if (s.charge > 0.5 && Math.random() < 0.6) this.fx.emit(this.fx.tex.dot, gx, gy - 16 - lift, { life: 0.25, s0: 0.5 + s.charge * 0.5, s1: 0.1, a0: 0.7, a1: 0, add: true, tint: 0xffb050 });
    }
    for (const [id, v] of this.shellViews) {
      if (!v.seen) {
        v.s.destroy();
        v.shadow.destroy();
        this.shellViews.delete(id);
      }
    }
    // local charge ring around the tank + audio/touch feedback
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
    this.touch?.update(dt);
    this.touch?.setFeedback(me.charging ? c : 0, perfect, me.overheat / COMBAT.charge.overheatLock, 0);
    this.fx.update(dt);

    // camera: follow with look-ahead, zoom out while charging
    this.updateBaseZoom();
    this.camera.targetZoom = this.baseZoom * (1 - 0.12 * (me.charging ? c : 0));
    const lx = this.sx(lerp(this.prev[this.localId].x, me.x, alpha), lerp(this.prev[this.localId].y, me.y, alpha));
    const ly = this.sy(lerp(this.prev[this.localId].x, me.x, alpha), lerp(this.prev[this.localId].y, me.y, alpha));
    const look = 0.35;
    this.camera.update(dt, lx, ly, worldToScreenX(me.vx, me.vy) * look, worldToScreenY(me.vx, me.vy) * look);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(Math.round(w / 2 - (this.camera.x + this.camera.shakeX) * z), Math.round(h / 2 - (this.camera.y + this.camera.shakeY) * z));
    const l = this.viewLeft();
    const tp = this.viewTop();
    this.worldView.update(l, tp, l + w / z, tp + h / z, dt);
    this.app.render();
  }

  hud(): HudSnapshot {
    const me = this.state.tanks[this.localId];
    const score: [number, number] = [0, 0];
    for (const t of this.state.tanks) score[t.team === 0 ? 0 : 1] += t.kills;
    return {
      hp: Math.ceil(me.hp),
      maxHp: TANKS[me.cls].hp,
      alive: me.alive,
      respawn: Math.max(0, me.respawn),
      kills: me.kills,
      deaths: me.deaths,
      charge: chargeLevel(me),
      overheat: me.overheat,
      teamScore: score,
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

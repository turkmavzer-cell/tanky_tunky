import { Application, Container, Texture } from 'pixi.js';
import { FixedStepLoop } from '../core/loop';
import { FrameStats } from '../core/frameStats';
import { KeyboardMouse } from '../core/keyboard';
import { SIM_DT } from '../sim/config';
import { BTN_ABILITY, BTN_FIRE, EMPTY_INPUT, quantizeAim, quantizeMove, type PlayerInput } from '../sim/input';
import { createState, step } from '../sim/sim';
import type { SimState } from '../sim/state';
import { lerp, lerpAngle } from '../sim/dmath';
import { Camera } from '../render/camera';
import { GroundLayer } from '../render/groundLayer';
import { TankView } from '../render/tankView';
import { screenDirToWorld, screenToWorld, worldToScreenX, worldToScreenY, TILE_H, TILE_W } from '../world/iso';
import type { Quality } from '../core/save';

export interface GameSceneOptions {
  quality: Quality;
  fpsCap: 30 | 60;
  reduceShake: boolean;
  seed?: number;
}

const RES_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

function makeGrassTile(variant: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_W;
  c.height = TILE_H;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.moveTo(TILE_W / 2, 0);
  g.lineTo(TILE_W, TILE_H / 2);
  g.lineTo(TILE_W / 2, TILE_H);
  g.lineTo(0, TILE_H / 2);
  g.closePath();
  g.fillStyle = variant ? '#5f8f3e' : '#679845';
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.stroke();
  return c;
}

/** The in-match scene: owns the Pixi app, the fixed-step loop, input and the simulation state. */
export class GameScene {
  readonly app = new Application();
  readonly stats = new FrameStats();
  state!: SimState;
  private prev: { x: number; y: number; hull: number; turret: number }[] = [];
  private loop!: FixedStepLoop;
  private kb!: KeyboardMouse;
  private readonly camera = new Camera();
  private world = new Container();
  private ground!: GroundLayer;
  private objects = new Container();
  private tankViews: TankView[] = [];
  private lastRender = 0;
  private raf = 0;
  private disposed = false;
  /** Latest sampled input for the local player (tank 0). */
  private localInput: PlayerInput = { ...EMPTY_INPUT };
  /** Optional external input source (touch controls); overrides keyboard when active. */
  touchInput: (() => PlayerInput | null) | null = null;

  constructor(private readonly opts: GameSceneOptions) {}

  async init(host: HTMLElement): Promise<void> {
    const resolution = Math.min(window.devicePixelRatio || 1, RES_CAP[this.opts.quality]);
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

    this.state = createState({
      seed: this.opts.seed ?? 1,
      width: 24,
      height: 24,
      players: [{ team: 0, cls: 'standard', x: 12, y: 12 }],
    });
    this.snapshotPrev();

    const grass = [Texture.from(makeGrassTile(0)), Texture.from(makeGrassTile(1))];
    this.ground = new GroundLayer(this.state.width, this.state.height, (tx, ty) => grass[(tx + ty) & 1]);
    this.objects.sortableChildren = true;
    this.world.addChild(this.ground.container, this.objects);
    this.app.stage.addChild(this.world);
    for (const t of this.state.tanks) {
      const v = new TankView(t.cls, t.team);
      this.objects.addChild(v.root);
      this.tankViews.push(v);
    }
    const p = this.state.tanks[0];
    this.camera.snap(worldToScreenX(p.x, p.y), worldToScreenY(p.x, p.y));

    this.kb = new KeyboardMouse(this.app.canvas);
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

  private snapshotPrev(): void {
    this.prev = this.state.tanks.map((t) => ({ x: t.x, y: t.y, hull: t.hull, turret: t.turret }));
  }

  private sampleInput(): PlayerInput {
    const touch = this.touchInput?.();
    if (touch) return touch;
    const mv = this.kb.moveVector();
    const w = screenDirToWorld(mv.x, mv.y);
    let aim = this.localInput.aim;
    const me = this.state.tanks[0];
    if (this.kb.hasMouse) {
      // mouse position → world, aim turret from tank toward it
      const sx = this.kb.mouseX / this.camera.zoom + this.viewLeft();
      const sy = this.kb.mouseY / this.camera.zoom + this.viewTop();
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

  private tick(): void {
    this.localInput = this.sampleInput();
    this.snapshotPrev();
    step(this.state, [this.localInput]);
  }

  private viewLeft(): number {
    return this.camera.x - this.app.screen.width / 2 / this.camera.zoom;
  }

  private viewTop(): number {
    return this.camera.y - this.app.screen.height / 2 / this.camera.zoom;
  }

  private render(alpha: number, dtMs: number): void {
    const tanks = this.state.tanks;
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      const p = this.prev[i];
      const x = lerp(p.x, t.x, alpha);
      const y = lerp(p.y, t.y, alpha);
      const v = this.tankViews[i];
      v.root.position.set(worldToScreenX(x, y), worldToScreenY(x, y));
      v.root.zIndex = x + y;
      v.setAngles(lerpAngle(p.hull, t.hull, alpha), lerpAngle(p.turret, t.turret, alpha));
      if (i === 0) {
        const look = 0.35;
        this.camera.update(dtMs / 1000, v.root.x, v.root.y, worldToScreenX(t.vx, t.vy) * look, worldToScreenY(t.vx, t.vy) * look);
      }
    }
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(Math.round(w / 2 - (this.camera.x + this.camera.shakeX) * z), Math.round(h / 2 - (this.camera.y + this.camera.shakeY) * z));
    const l = this.viewLeft();
    const tp = this.viewTop();
    this.ground.update(l, tp, l + w / z, tp + h / z);
    this.app.render();
  }

  setPaused(p: boolean): void {
    if (!this.loop) return;
    this.loop.paused = p;
    if (!p) this.loop.resetClock();
  }

  get paused(): boolean {
    return this.loop?.paused ?? false;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.kb?.dispose();
    this.tankViews.forEach((v) => v.destroy());
    this.app.destroy({ removeView: true }, { children: true, texture: false });
  }
}

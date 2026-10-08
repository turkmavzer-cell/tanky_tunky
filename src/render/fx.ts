/**
 * Pooled particle effects + damage numbers (brief §4, §12). Screen-space pixels (world layer).
 * Zero allocations in steady state: particles live in fixed pools and are recycled.
 */
import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { fxTextures, type FxTextures } from './fxTextures';

interface Particle {
  s: Sprite;
  live: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity (px/s²) — positive pulls down (screen). */
  g: number;
  drag: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  vr: number;
}

interface Num {
  t: Text;
  live: boolean;
  x: number;
  y: number;
  life: number;
}

export class Fx {
  /** Below objects: track marks / scorch decals. */
  readonly under = new Container();
  /** Above objects: smoke, fire, sparks, numbers. */
  readonly over = new Container();
  readonly tex: FxTextures;
  private readonly parts: Particle[] = [];
  private readonly under_: Particle[] = [];
  private readonly nums: Num[] = [];
  private seed = 1;
  quality = 1; // 0.5 low, 1 medium/high

  constructor(maxParticles = 700) {
    this.tex = fxTextures();
    for (let i = 0; i < maxParticles; i++) this.parts.push(this.mk(this.over));
    for (let i = 0; i < 260; i++) this.under_.push(this.mk(this.under));
    for (let i = 0; i < 24; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: 22, fontWeight: '900', fill: '#ffffff', stroke: { color: '#000000', width: 4 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.over.addChild(t);
      this.nums.push({ t, live: false, x: 0, y: 0, life: 0 });
    }
  }

  private mk(parent: Container): Particle {
    const s = new Sprite(this.tex.dot);
    s.anchor.set(0.5);
    s.visible = false;
    parent.addChild(s);
    return { s, live: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, a1: 0, vr: 0 };
  }

  /** Cheap local PRNG for visual variety (render only, not part of the deterministic sim). */
  rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private grab(pool: Particle[]): Particle {
    for (let i = 0; i < pool.length; i++) if (!pool[i].live) return pool[i];
    // steal the oldest (least remaining life)
    let best = pool[0];
    for (const p of pool) if (p.life < best.life) best = p;
    return best;
  }

  emit(
    tex: Texture,
    x: number,
    y: number,
    o: { vx?: number; vy?: number; g?: number; drag?: number; life: number; s0: number; s1: number; a0?: number; a1?: number; tint?: number; add?: boolean; rot?: number; vr?: number; under?: boolean },
  ): void {
    const p = this.grab(o.under ? this.under_ : this.parts);
    p.live = true;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.g = o.g ?? 0;
    p.drag = o.drag ?? 0;
    p.life = p.max = o.life;
    p.s0 = o.s0;
    p.s1 = o.s1;
    p.a0 = o.a0 ?? 1;
    p.a1 = o.a1 ?? 0;
    p.vr = o.vr ?? 0;
    const s = p.s;
    s.texture = tex;
    s.tint = o.tint ?? 0xffffff;
    s.blendMode = o.add ? 'add' : 'normal';
    s.rotation = o.rot ?? 0;
    s.visible = true;
    s.position.set(x, y);
    s.scale.set(o.s0);
    s.alpha = p.a0;
  }

  // ---------- composite effects ----------

  muzzle(x: number, y: number, angle: number, charge: number, heavy: boolean): void {
    const T = this.tex;
    const size = (heavy ? 1.3 : 0.9) * (1 + charge * 0.8);
    this.emit(T.flash, x, y, { life: 0.09, s0: 0.9 * size, s1: 1.3 * size, a0: 1, a1: 0, add: true, rot: angle });
    const n = Math.round((5 + charge * 8) * this.quality);
    for (let i = 0; i < n; i++) {
      const a = angle + (this.rand() - 0.5) * 0.9;
      const sp = 30 + this.rand() * 90 * (1 + charge);
      this.emit(T.smoke, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 10, drag: 3, life: 0.6 + this.rand() * 0.6, s0: 0.25 * size, s1: 0.9 * size, a0: 0.55, a1: 0, tint: 0xb9b2a6, rot: this.rand() * 6 });
    }
  }

  explosion(x: number, y: number, radiusPx: number, charge: number): void {
    const T = this.tex;
    const k = Math.max(0.6, radiusPx / 50);
    this.emit(T.flash, x, y, { life: 0.16, s0: 0.8 * k, s1: 2.0 * k, a0: 1, a1: 0, add: true });
    this.emit(T.ring, x, y, { life: 0.35, s0: 0.2 * k, s1: 1.6 * k, a0: 0.8, a1: 0, add: true, tint: 0xffd890 });
    const fire = Math.round((8 + charge * 14) * this.quality);
    for (let i = 0; i < fire; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (40 + this.rand() * 120) * k;
      this.emit(T.dot, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55 - 30, drag: 4, life: 0.25 + this.rand() * 0.3, s0: 1.2 * k, s1: 0.2, a0: 1, a1: 0, add: true, tint: this.rand() < 0.5 ? 0xffb347 : 0xff6a2a });
    }
    const smoke = Math.round((6 + charge * 10) * this.quality);
    for (let i = 0; i < smoke; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (15 + this.rand() * 60) * k;
      this.emit(T.smoke, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 25, g: -12, drag: 1.5, life: 1.0 + this.rand() * 1.2, s0: 0.5 * k, s1: 1.8 * k, a0: 0.42, a1: 0, tint: 0x7a7066, rot: this.rand() * 6, vr: (this.rand() - 0.5) * 1.5 });
    }
    const debris = Math.round((6 + charge * 10) * this.quality);
    for (let i = 0; i < debris; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (80 + this.rand() * 160) * k;
      this.emit(T.debris, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 140, g: 520, drag: 0.6, life: 0.6 + this.rand() * 0.4, s0: 0.9 + this.rand(), s1: 0.6, a0: 1, a1: 0.6, tint: 0x3b2f25, rot: this.rand() * 6, vr: (this.rand() - 0.5) * 18 });
    }
    // scorch decal
    this.emit(T.dot, x, y, { under: true, life: 12, s0: 1.6 * k, s1: 1.6 * k, a0: 0.45, a1: 0, tint: 0x14100c });
  }

  sparks(x: number, y: number, n: number, tint = 0xffe0a0): void {
    for (let i = 0; i < Math.round(n * this.quality); i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = 120 + this.rand() * 220;
      this.emit(this.tex.spark, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 60, g: 600, drag: 1.5, life: 0.2 + this.rand() * 0.25, s0: 0.8, s1: 0.3, a0: 1, a1: 0, add: true, tint, rot: a });
    }
  }

  dust(x: number, y: number, tint: number): void {
    this.emit(this.tex.smoke, x + (this.rand() - 0.5) * 10, y + (this.rand() - 0.5) * 6, { vy: -12, drag: 1, life: 0.7, s0: 0.15, s1: 0.5, a0: 0.35, a1: 0, tint, rot: this.rand() * 6 });
  }

  trackMark(x: number, y: number, screenAngle: number): void {
    this.emit(this.tex.track, x, y, { under: true, life: 7, s0: 1, s1: 1, a0: 0.5, a1: 0, rot: screenAngle });
  }

  damageNumber(x: number, y: number, value: number, crit: boolean): void {
    let n = this.nums.find((q) => !q.live);
    if (!n) n = this.nums.reduce((a, b) => (a.life < b.life ? a : b));
    n.live = true;
    n.x = x + (this.rand() - 0.5) * 16;
    n.y = y;
    n.life = 0.9;
    n.t.text = String(Math.round(value));
    n.t.style.fill = crit ? '#ffe066' : '#ffffff';
    n.t.scale.set(crit ? 1.35 : 1);
    n.t.visible = true;
  }

  update(dt: number): void {
    for (const pool of [this.parts, this.under_]) {
      for (const p of pool) {
        if (!p.live) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.live = false;
          p.s.visible = false;
          continue;
        }
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy = p.vy * d + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const t = 1 - p.life / p.max;
        p.s.position.set(p.x, p.y);
        p.s.scale.set(p.s0 + (p.s1 - p.s0) * t);
        p.s.alpha = p.a0 + (p.a1 - p.a0) * t;
        p.s.rotation += p.vr * dt;
      }
    }
    for (const n of this.nums) {
      if (!n.live) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.live = false;
        n.t.visible = false;
        continue;
      }
      n.y -= 40 * dt;
      n.t.position.set(n.x, n.y);
      n.t.alpha = Math.min(1, n.life * 2.5);
    }
  }
}

/**
 * Ambient layers: wind (always), rain (0..1), birds (day) or crickets (night), and an occasional
 * distant battle. Continuous layers are built once; sporadic events are placed by scheduleUntil(),
 * which the system calls from its lookahead timer (or once, up-front, for offline rendering).
 */
import { SynthKit, biquad, env, gain, noise, rand, sweep, tone } from './kit';
import { clamp01 } from './math';

export class Ambience {
  private readonly out: GainNode;
  private readonly windG: GainNode;
  private readonly rainG: GainNode;
  private readonly cricketG: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private on = false;
  private night = false;
  private nextBird = 0;
  private nextBattle = 0;
  private disposed = false;

  constructor(private readonly k: SynthKit, dest: AudioNode) {
    const ctx = k.ctx;
    const t = ctx.currentTime;
    this.out = gain(ctx, 0, dest);

    // Wind: brown noise through a slowly wandering band-pass, with slow gusts.
    const wind = this.loop('brown', 0.5);
    this.windG = gain(ctx, 0.5, this.out);
    const windBp = biquad(ctx, 'bandpass', 420, 0.9, this.windG);
    wind.connect(windBp);
    this.lfo(0.071, 260, windBp.frequency);
    this.lfo(0.13, 0.28, this.windG.gain);
    const hiss = this.loop('pink', 1);
    const hissG = gain(ctx, 0.05, this.windG);
    hiss.connect(biquad(ctx, 'highpass', 1800, 0.7, hissG));

    // Rain: white noise, band-limited, plus a soft low bed.
    this.rainG = gain(ctx, 0, this.out);
    const rain = this.loop('white', 1);
    rain.connect(biquad(ctx, 'highpass', 1100, 0.7, biquad(ctx, 'lowpass', 7500, 0.7, gain(ctx, 0.5, this.rainG))));
    const rainLow = this.loop('pink', 0.8);
    rainLow.connect(biquad(ctx, 'lowpass', 500, 0.7, gain(ctx, 0.35, this.rainG)));

    // Crickets: 4.4 kHz carrier, fast AM pulses gated by a slower chirp rhythm.
    this.cricketG = gain(ctx, 0, this.out);
    const gate = gain(ctx, 0.5, this.cricketG);
    const pulse = gain(ctx, 0.5, gate);
    const carrier = ctx.createOscillator();
    carrier.frequency.value = 4400;
    carrier.connect(gain(ctx, 0.12, pulse));
    this.sources.push(carrier);
    this.lfo(28, 0.5, pulse.gain);
    this.lfo(1.4, 0.5, gate.gain, 'square');

    for (const s of this.sources) {
      if (s instanceof AudioBufferSourceNode) s.start(t, rand(0, 1.5));
      else s.start(t);
    }
  }

  private loop(kind: 'white' | 'pink' | 'brown', rate: number): AudioBufferSourceNode {
    const src = this.k.ctx.createBufferSource();
    src.buffer = this.k.noise(kind);
    src.loop = true;
    src.playbackRate.value = rate;
    this.sources.push(src);
    return src;
  }

  private lfo(freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine'): OscillatorNode {
    const ctx = this.k.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(gain(ctx, depth)).connect(target);
    this.sources.push(o);
    return o;
  }

  set(on: boolean, rain: number, night: boolean, at?: number): void {
    if (this.disposed) return;
    const now = at ?? this.k.ctx.currentTime;
    if (on && !this.on) {
      this.nextBird = now + rand(0.4, 1.5);
      this.nextBattle = now + rand(1.0, 2.5);
    }
    this.on = on;
    this.night = night;
    this.out.gain.setTargetAtTime(on ? 1 : 0, now, 0.6);
    this.rainG.gain.setTargetAtTime(clamp01(rain) * 0.55, now, 0.8);
    this.cricketG.gain.setTargetAtTime(night ? 0.35 : 0, now, 1.0);
    this.windG.gain.setTargetAtTime(night ? 0.35 : 0.5, now, 1.0);
  }

  /** Places sporadic events (birds, distant battle) up to time `until`. */
  scheduleUntil(until: number): void {
    if (!this.on || this.disposed) return;
    while (this.nextBird < until) {
      if (!this.night) this.bird(this.nextBird);
      this.nextBird += rand(1.5, 5);
    }
    while (this.nextBattle < until) {
      this.distantBattle(this.nextBattle);
      this.nextBattle += rand(5, 14);
    }
  }

  private panned(pan: number): AudioNode {
    const ctx = this.k.ctx;
    if (typeof ctx.createStereoPanner !== 'function') return this.out;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.out);
    return p;
  }

  private bird(t: number): void {
    const ctx = this.k.ctx;
    const out = this.panned(rand(-0.8, 0.8));
    const base = rand(2400, 3600);
    const chirps = 2 + Math.floor(rand(0, 4));
    for (let n = 0; n < chirps; n++) {
      const st = t + n * rand(0.09, 0.14);
      const o = ctx.createOscillator();
      o.type = 'sine';
      sweep(o.frequency, st, base * rand(0.9, 1.1), base * rand(1.2, 1.5), 0.06);
      const g = gain(ctx, 0, out);
      o.connect(g);
      const end = env(g.gain, st, 0.01, rand(0.05, 0.09), 0.07);
      o.start(st);
      o.stop(end + 0.02);
    }
  }

  private distantBattle(t: number): void {
    const out = this.panned(rand(-0.9, 0.9));
    const lp = biquad(this.k.ctx, 'lowpass', 380, 0.7, out);
    const shots = 1 + Math.floor(rand(0, 3));
    for (let n = 0; n < shots; n++) {
      const st = t + n * rand(0.25, 0.6);
      const g = rand(0.2, 0.35);
      noise(this.k, lp, st, { color: 'brown', a: 0.01, d: rand(0.8, 1.4), gain: g, rate: 0.6 });
      tone(this.k, lp, st, { f0: 70, f1: 32, glide: 0.4, a: 0.005, d: 0.6, gain: g * 0.9 });
    }
  }

  dispose(at?: number): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = at ?? this.k.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, 0.1);
      for (const s of this.sources) s.stop(now + 0.6);
    } catch {
      /* context closed */
    }
  }
}

/**
 * Shared synthesis building blocks. Everything takes a BaseAudioContext (works with both the
 * realtime AudioContext and an OfflineAudioContext used by tools/audio-check) and a destination node.
 */
import { fillNoise, makeDriveCurve, type NoiseKind } from './math';

const FLOOR = 0.0001;

/** Per-context cache of pre-generated noise buffers and shaper curves (generated once). */
export class SynthKit {
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  readonly crunch: Float32Array<ArrayBuffer>;
  readonly soft: Float32Array<ArrayBuffer>;

  constructor(readonly ctx: BaseAudioContext) {
    const len = Math.floor(ctx.sampleRate * 2);
    this.white = makeNoiseBuffer(ctx, 'white', len, 11);
    this.pink = makeNoiseBuffer(ctx, 'pink', len, 23);
    this.brown = makeNoiseBuffer(ctx, 'brown', len, 37);
    this.crunch = makeDriveCurve(4);
    this.soft = makeDriveCurve(1.6);
  }

  noise(kind: NoiseKind): AudioBuffer {
    return kind === 'white' ? this.white : kind === 'pink' ? this.pink : this.brown;
  }
}

function makeNoiseBuffer(ctx: BaseAudioContext, kind: NoiseKind, len: number, seed: number): AudioBuffer {
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  fillNoise(kind, buf.getChannelData(0), seed);
  return buf;
}

export function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

export function gain(ctx: BaseAudioContext, value: number, dest?: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  if (dest) g.connect(dest);
  return g;
}

export function biquad(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number, dest?: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (dest) f.connect(dest);
  return f;
}

export function shaper(ctx: BaseAudioContext, curve: Float32Array<ArrayBuffer>, dest?: AudioNode): WaveShaperNode {
  const s = ctx.createWaveShaper();
  s.curve = curve;
  s.oversample = '2x';
  if (dest) s.connect(dest);
  return s;
}

/**
 * Attack/decay envelope on a gain param: 0 → peak (linear, `a` s) → exponential decay over `d` s,
 * then a short linear fade to exact zero (no click). Returns the time the envelope reaches zero.
 */
export function env(p: AudioParam, t: number, a: number, peak: number, d: number): number {
  const ta = t + Math.max(0.001, a);
  const td = ta + Math.max(0.005, d);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, ta);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, peak * 0.001), td);
  p.linearRampToValueAtTime(0, td + 0.008);
  return td + 0.008;
}

/** Attack / sustain / release envelope (linear ramps), for pads and sustained tones. */
export function envASR(p: AudioParam, t: number, a: number, peak: number, hold: number, r: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setValueAtTime(peak, t + a + hold);
  p.linearRampToValueAtTime(0, t + a + hold + r);
  return t + a + hold + r;
}

export function sweep(p: AudioParam, t: number, from: number, to: number, dur: number): void {
  p.setValueAtTime(Math.max(FLOOR, from), t);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, to), t + Math.max(0.002, dur));
}

export interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  /** End frequency of an exponential glide (default: no glide). */
  f1?: number;
  glide?: number;
  a?: number;
  d: number;
  gain: number;
  detune?: number;
}

/** Enveloped oscillator. Returns end time. */
export function tone(k: SynthKit, out: AudioNode, t: number, o: ToneOpts): number {
  const { ctx } = k;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  if (o.f1 !== undefined) sweep(osc.frequency, t, o.f0, o.f1, o.glide ?? o.d);
  else osc.frequency.setValueAtTime(o.f0, t);
  if (o.detune) osc.detune.value = o.detune;
  const g = gain(ctx, 0, out);
  osc.connect(g);
  const end = env(g.gain, t, o.a ?? 0.003, o.gain, o.d);
  osc.start(t);
  osc.stop(end + 0.02);
  return end;
}

export interface NoiseOpts {
  color?: NoiseKind;
  a?: number;
  d: number;
  gain: number;
  filter?: BiquadFilterType;
  f0?: number;
  f1?: number;
  sweepDur?: number;
  q?: number;
  rate?: number;
  /** Optional drive curve inserted after the filter. */
  drive?: Float32Array<ArrayBuffer>;
}

/** Enveloped (optionally filtered / swept / driven) noise burst. Returns end time. */
export function noise(k: SynthKit, out: AudioNode, t: number, o: NoiseOpts): number {
  const { ctx } = k;
  const src = ctx.createBufferSource();
  src.buffer = k.noise(o.color ?? 'white');
  src.loop = true;
  src.playbackRate.value = o.rate ?? 1;
  const g = gain(ctx, 0, out);
  let head: AudioNode = g;
  if (o.drive) {
    const s = shaper(ctx, o.drive, head);
    head = s;
  }
  if (o.filter) {
    const f = biquad(ctx, o.filter, o.f0 ?? 1000, o.q ?? 0.7, head);
    if (o.f1 !== undefined) sweep(f.frequency, t, o.f0 ?? 1000, o.f1, o.sweepDur ?? o.d);
    head = f;
  }
  src.connect(head);
  const end = env(g.gain, t, o.a ?? 0.002, o.gain, o.d);
  src.start(t, rand(0, 1.5));
  src.stop(end + 0.02);
  return end;
}

/** Inharmonic struck-metal partials (free bar modes) with staggered decays. Returns end time. */
export function metal(k: SynthKit, out: AudioNode, t: number, base: number, d: number, g: number): number {
  const ratios = [1, 2.756, 5.404, 8.933];
  let end = t;
  for (let i = 0; i < ratios.length; i++) {
    end = Math.max(
      end,
      tone(k, out, t, { type: i === 0 ? 'triangle' : 'sine', f0: base * ratios[i] * rand(0.99, 1.01), a: 0.001, d: d / (1 + i * 0.6), gain: g / (1 + i * 0.5) }),
    );
  }
  // Strike transient.
  end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.015, gain: g * 0.8, filter: 'highpass', f0: 2500, q: 0.7 }));
  return end;
}

/** Plain bell / chime: fundamental + a couple of soft overtones. Returns end time. */
export function bell(k: SynthKit, out: AudioNode, t: number, f: number, d: number, g: number): number {
  let end = tone(k, out, t, { f0: f, a: 0.004, d, gain: g });
  end = Math.max(end, tone(k, out, t, { f0: f * 2, a: 0.002, d: d * 0.6, gain: g * 0.35 }));
  end = Math.max(end, tone(k, out, t, { f0: f * 3.01, a: 0.002, d: d * 0.35, gain: g * 0.15 }));
  return end;
}

/**
 * Continuous tank engine voice. All nodes are created once in the constructor; per-frame updates
 * only move AudioParams with setTargetAtTime (and skip negligible changes).
 */
import { AUDIO_CONFIG } from './config';
import { SynthKit, biquad, gain } from './kit';
import { clamp01 } from './math';
import type { EngineVoice } from './types';

interface EngineCharacter {
  /** Fundamental (Hz) at idle and at full revs. */
  idleHz: number;
  topHz: number;
  wave: OscillatorType;
  mainGain: number;
  subGain: number;
  /** Low-pass cutoff range (Hz). */
  cutIdle: number;
  cutTop: number;
  cutQ: number;
  /** Piston/firing pulse rate as a multiple of the fundamental, and AM depth 0..1. */
  pulseRatio: number;
  amDepth: number;
  /** Track/tread rattle noise. */
  treadGain: number;
  treadHz: number;
  /** Optional gear/electric whine (Hz range) and its gain. */
  whineIdle: number;
  whineTop: number;
  whineGain: number;
  /** Loudness at idle relative to full load. */
  idleLevel: number;
}

export const ENGINE_CHARACTERS: Record<EngineVoice, EngineCharacter> = {
  // Light, buzzy two-stroke: high pitch, fast pulses, light treads.
  scout: { idleHz: 52, topHz: 150, wave: 'square', mainGain: 0.2, subGain: 0.35, cutIdle: 500, cutTop: 2400, cutQ: 2, pulseRatio: 0.5, amDepth: 0.35, treadGain: 0.18, treadHz: 1400, whineIdle: 0, whineTop: 0, whineGain: 0, idleLevel: 0.45 },
  // Big diesel: low, lumpy, heavy track rumble, strong sub.
  heavy: { idleHz: 30, topHz: 68, wave: 'sawtooth', mainGain: 0.32, subGain: 0.6, cutIdle: 260, cutTop: 900, cutQ: 3, pulseRatio: 0.25, amDepth: 0.6, treadGain: 0.42, treadHz: 520, whineIdle: 0, whineTop: 0, whineGain: 0, idleLevel: 0.5 },
  // Balanced mid-range V8 feel.
  standard: { idleHz: 40, topHz: 100, wave: 'sawtooth', mainGain: 0.28, subGain: 0.45, cutIdle: 380, cutTop: 1500, cutQ: 2.5, pulseRatio: 0.5, amDepth: 0.45, treadGain: 0.3, treadHz: 850, whineIdle: 0, whineTop: 0, whineGain: 0, idleLevel: 0.45 },
  // Slow, grinding turbine with a gearbox whine.
  artillery: { idleHz: 28, topHz: 58, wave: 'sawtooth', mainGain: 0.26, subGain: 0.55, cutIdle: 240, cutTop: 750, cutQ: 4, pulseRatio: 0.125, amDepth: 0.4, treadGain: 0.34, treadHz: 420, whineIdle: 380, whineTop: 900, whineGain: 0.05, idleLevel: 0.5 },
  // Hybrid-electric: soft triangle body with a rising electric whine, quieter treads.
  trapper: { idleHz: 46, topHz: 110, wave: 'triangle', mainGain: 0.4, subGain: 0.3, cutIdle: 700, cutTop: 2600, cutQ: 1, pulseRatio: 1, amDepth: 0.15, treadGain: 0.2, treadHz: 1100, whineIdle: 620, whineTop: 1700, whineGain: 0.07, idleLevel: 0.4 },
};

export interface EngineState {
  speed: number;
  load: number;
  pan: number;
  /** Positional gain (distance/muffle) 0..1. */
  gain: number;
  muffled: boolean;
}

export class EngineSynth {
  private readonly c: EngineCharacter;
  private readonly main: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly whine: OscillatorNode | null;
  private readonly lfo: OscillatorNode;
  private readonly tread: AudioBufferSourceNode;
  private readonly lp: BiquadFilterNode;
  private readonly am: GainNode;
  private readonly lfoDepth: GainNode;
  private readonly treadBp: BiquadFilterNode;
  private readonly treadG: GainNode;
  private readonly whineG: GainNode | null;
  private readonly muffle: BiquadFilterNode;
  private readonly panner: StereoPannerNode | null;
  private readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private last = { rpm: -1, load: -1, speed: -1, pan: 9, gain: -1, muffled: false };
  private disposed = false;

  constructor(private readonly k: SynthKit, dest: AudioNode, voice: EngineVoice) {
    const ctx = k.ctx;
    const c = (this.c = ENGINE_CHARACTERS[voice]);
    this.out = gain(ctx, 0, dest);
    let tail: AudioNode = this.out;
    this.panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (this.panner) {
      this.panner.connect(tail);
      tail = this.panner;
    }
    this.muffle = biquad(ctx, 'lowpass', AUDIO_CONFIG.openCutoffHz, 0.7, tail);
    // DC blocker: AM of the sub by a correlated pulse LFO produces a small DC/infrasonic component.
    const mix = gain(ctx, 1, biquad(ctx, 'highpass', 28, 0.7, this.muffle));

    // Body: main + sub oscillators → resonant low-pass → amplitude modulation (piston pulses).
    this.am = gain(ctx, 1 - c.amDepth * 0.5, mix);
    this.lp = biquad(ctx, 'lowpass', c.cutIdle, c.cutQ, this.am);
    this.main = ctx.createOscillator();
    this.main.type = c.wave;
    this.main.frequency.value = c.idleHz;
    this.main.connect(gain(ctx, c.mainGain, this.lp));
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';
    this.sub.frequency.value = c.idleHz / 2;
    this.sub.connect(gain(ctx, c.subGain, this.lp));
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = c.idleHz * c.pulseRatio;
    this.lfoDepth = gain(ctx, c.amDepth * 0.5);
    this.lfo.connect(this.lfoDepth).connect(this.am.gain);

    // Treads: looped brown noise through a band-pass, level follows speed.
    this.tread = ctx.createBufferSource();
    this.tread.buffer = k.brown;
    this.tread.loop = true;
    this.treadG = gain(ctx, 0, mix);
    this.treadBp = biquad(ctx, 'bandpass', c.treadHz, 1.2, this.treadG);
    this.tread.connect(this.treadBp);

    if (c.whineGain > 0) {
      this.whine = ctx.createOscillator();
      this.whine.type = 'sine';
      this.whine.frequency.value = c.whineIdle;
      this.whineG = gain(ctx, 0, mix);
      this.whine.connect(this.whineG);
    } else {
      this.whine = null;
      this.whineG = null;
    }

    const t = ctx.currentTime;
    this.sources.push(this.main, this.sub, this.lfo, this.tread);
    if (this.whine) this.sources.push(this.whine);
    for (const s of this.sources) {
      if (s === this.tread) this.tread.start(t, Math.random() * 1.5);
      else s.start(t);
    }
  }

  /** `at` overrides the automation time (used by offline rendering); defaults to now. */
  update(s: EngineState, at?: number): void {
    if (this.disposed) return;
    const now = at ?? this.k.ctx.currentTime;
    const tc = AUDIO_CONFIG.paramSmoothing;
    const c = this.c;
    const speed = clamp01(s.speed);
    const load = clamp01(s.load);
    const rpm = clamp01(speed * 0.75 + load * 0.35);
    const L = this.last;
    if (Math.abs(rpm - L.rpm) > 0.004 || Math.abs(load - L.load) > 0.01 || Math.abs(speed - L.speed) > 0.01) {
      const f = c.idleHz * Math.pow(c.topHz / c.idleHz, rpm);
      this.main.frequency.setTargetAtTime(f, now, tc);
      this.sub.frequency.setTargetAtTime(f / 2, now, tc);
      this.lfo.frequency.setTargetAtTime(f * c.pulseRatio, now, tc);
      const brightness = clamp01(rpm * 0.6 + load * 0.4);
      this.lp.frequency.setTargetAtTime(c.cutIdle * Math.pow(c.cutTop / c.cutIdle, brightness), now, tc);
      this.treadG.gain.setTargetAtTime(c.treadGain * speed, now, tc);
      this.tread.playbackRate.setTargetAtTime(0.6 + 0.8 * speed, now, tc);
      if (this.whine && this.whineG) {
        this.whine.frequency.setTargetAtTime(c.whineIdle * Math.pow(c.whineTop / c.whineIdle, rpm), now, tc);
        this.whineG.gain.setTargetAtTime(c.whineGain * (0.3 + 0.7 * rpm), now, tc);
      }
      L.rpm = rpm;
      L.load = load;
      L.speed = speed;
    }
    const level = (c.idleLevel + (1 - c.idleLevel) * clamp01(0.6 * rpm + 0.4 * load)) * clamp01(s.gain);
    if (Math.abs(level - L.gain) > 0.002) {
      this.out.gain.setTargetAtTime(level, now, tc);
      L.gain = level;
    }
    if (this.panner && Math.abs(s.pan - L.pan) > 0.005) {
      this.panner.pan.setTargetAtTime(s.pan, now, tc);
      L.pan = s.pan;
    }
    if (s.muffled !== L.muffled) {
      this.muffle.frequency.setTargetAtTime(s.muffled ? AUDIO_CONFIG.muffledCutoffHz : AUDIO_CONFIG.openCutoffHz, now, 0.12);
      L.muffled = s.muffled;
    }
  }

  dispose(at?: number): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = at ?? this.k.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, 0.04);
      for (const s of this.sources) s.stop(now + 0.3);
      this.main.onended = () => {
        try {
          this.out.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    } catch {
      /* context closed */
    }
  }
}

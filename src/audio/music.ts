/**
 * Procedural music: an 8-bar D-minor martial ostinato. Three layers:
 *  - bed (always): soft pad chords,
 *  - calm: sparse plucked arpeggio + soft bass pulse,
 *  - combat: kick/snare march, hats and a driving saw-bass ostinato.
 * intensity 0..1 equal-power crossfades calm ↔ combat. Notes are placed by a lookahead scheduler
 * (scheduleUntil), called from the system timer or once up-front for offline rendering.
 */
import { AUDIO_CONFIG } from './config';
import { SynthKit, biquad, envASR, gain, noise, tone } from './kit';
import { clamp01, midiToFreq } from './math';

const STEPS_PER_BAR = 16;
const BARS = 8;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

/** Chord per bar (MIDI): Dm Dm Bb C | Dm Gm A Dm. */
const CHORDS: readonly (readonly number[])[] = [
  [50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55],
  [50, 53, 57], [43, 46, 50], [45, 49, 52], [50, 53, 57],
];
/** Bass ostinato offsets (semitones from the chord root) on eighth notes. */
const OSTINATO = [0, 0, 12, 0, 7, 0, 12, 10];
const KICK = new Set([0, 3, 8, 10]);
const SNARE = new Set([4, 12]);
const PLUCK_STEPS = new Map<number, number>([[0, 0], [6, 1], [10, 2], [14, 1]]);

export class Music {
  private readonly out: GainNode;
  private readonly bed: GainNode;
  private readonly calm: GainNode;
  private readonly combat: GainNode;
  private readonly padLp: BiquadFilterNode;
  private readonly bassLp: BiquadFilterNode;
  private readonly stepDur: number;
  private step = 0;
  private nextTime = 0;
  private running = false;
  private intensity = 0;
  private stopAt = Infinity;

  constructor(private readonly k: SynthKit, dest: AudioNode) {
    const ctx = k.ctx;
    this.out = gain(ctx, 0, dest);
    this.bed = gain(ctx, 0.8, this.out);
    this.calm = gain(ctx, 1, this.out);
    this.combat = gain(ctx, 0, this.out);
    this.padLp = biquad(ctx, 'lowpass', 1100, 0.6, this.bed);
    this.bassLp = biquad(ctx, 'lowpass', 520, 2, this.combat);
    this.stepDur = 60 / AUDIO_CONFIG.music.bpm / 4;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(at?: number): void {
    const now = at ?? this.k.ctx.currentTime;
    this.stopAt = Infinity;
    if (!this.running) {
      this.running = true;
      this.step = 0;
      this.nextTime = now + 0.05;
    }
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(1, now, AUDIO_CONFIG.music.fadeSec / 3);
  }

  /** Fades out; the scheduler keeps running until `isFadedOut(now)` so tails are not cut. */
  stop(at?: number): void {
    const now = at ?? this.k.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, AUDIO_CONFIG.music.fadeSec / 4);
    this.stopAt = now + AUDIO_CONFIG.music.fadeSec * 1.5;
  }

  setIntensity(i: number, at?: number, immediate = false): void {
    const now = at ?? this.k.ctx.currentTime;
    this.intensity = clamp01(i);
    const calm = Math.cos((this.intensity * Math.PI) / 2);
    const combat = Math.sin((this.intensity * Math.PI) / 2);
    const tc = immediate ? 0.005 : AUDIO_CONFIG.music.crossfadeSec / 3;
    this.calm.gain.setTargetAtTime(calm, now, tc);
    this.combat.gain.setTargetAtTime(combat, now, tc);
    this.bed.gain.setTargetAtTime(0.55 + 0.25 * calm, now, tc);
  }

  scheduleUntil(until: number): void {
    if (!this.running) return;
    while (this.nextTime < until) {
      if (this.nextTime >= this.stopAt) {
        this.running = false;
        this.stopAt = Infinity;
        return;
      }
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const k = this.k;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const root = chord[0];
    const barDur = this.stepDur * STEPS_PER_BAR;
    const calmOn = this.intensity < 0.97;
    const combatOn = this.intensity > 0.03;

    // Bed: pad chord at each bar start (two detuned triangles per chord tone).
    if (s === 0) {
      for (const m of chord) {
        for (const det of [-7, 7]) {
          const o = k.ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midiToFreq(m + 12);
          o.detune.value = det;
          const g = gain(k.ctx, 0, this.padLp);
          o.connect(g);
          const end = envASR(g.gain, t, 0.5, 0.035, barDur - 0.7, 0.6);
          o.start(t);
          o.stop(end + 0.02);
        }
      }
    }

    if (calmOn) {
      const pl = PLUCK_STEPS.get(s);
      if (pl !== undefined) {
        tone(k, this.calm, t, { type: 'triangle', f0: midiToFreq(chord[pl] + 24), a: 0.004, d: 0.5, gain: 0.07 });
      }
      if (s === 0 || s === 8) tone(k, this.calm, t, { f0: midiToFreq(root - 12), a: 0.01, d: 0.6, gain: 0.22 });
    }

    if (combatOn) {
      if (KICK.has(s)) tone(k, this.combat, t, { f0: 130, f1: 45, glide: 0.09, a: 0.002, d: 0.22, gain: 0.42 });
      if (SNARE.has(s) || (bar % 2 === 1 && s >= 14)) {
        const g = SNARE.has(s) ? 0.2 : 0.1;
        noise(k, this.combat, t, { color: 'white', d: 0.12, gain: g, filter: 'bandpass', f0: 1900, q: 0.9 });
        tone(k, this.combat, t, { type: 'triangle', f0: 210, f1: 150, glide: 0.05, a: 0.001, d: 0.06, gain: g * 0.5 });
      }
      if (s % 2 === 0) noise(k, this.combat, t, { color: 'white', d: 0.025, gain: s % 4 === 2 ? 0.045 : 0.025, filter: 'highpass', f0: 7000, q: 0.7 });
      if (s % 2 === 0) {
        const off = OSTINATO[s / 2];
        tone(k, this.bassLp, t, { type: 'sawtooth', f0: midiToFreq(root - 12 + off), a: 0.004, d: 0.16, gain: 0.16 });
      }
    }
  }

  dispose(at?: number): void {
    const now = at ?? this.k.ctx.currentTime;
    this.running = false;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, 0.05);
    } catch {
      /* context closed */
    }
  }
}

/**
 * Rising charge tone for the local player's shot. Nodes are created on start, updated with
 * setTargetAtTime every frame and released on stop.
 */
import { SynthKit, biquad, gain } from './kit';
import { clamp01 } from './math';

export class ChargeTone {
  private readonly out: GainNode;
  private readonly saw: OscillatorNode;
  private readonly fifth: OscillatorNode;
  private readonly harsh: OscillatorNode;
  private readonly harshG: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly vib: OscillatorNode;
  private readonly vibDepth: GainNode;
  private readonly trem: GainNode;
  private readonly tremLfo: OscillatorNode;
  private readonly tremDepth: GainNode;
  private lastLevel = -1;
  private lastHot = false;
  private stopped = false;

  constructor(private readonly k: SynthKit, dest: AudioNode) {
    const ctx = k.ctx;
    const t = ctx.currentTime;
    this.out = gain(ctx, 0, dest);
    this.trem = gain(ctx, 1, this.out);
    this.lp = biquad(ctx, 'lowpass', 600, 3, this.trem);

    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.saw.frequency.value = 180;
    this.saw.connect(gain(ctx, 0.35, this.lp));
    this.fifth = ctx.createOscillator();
    this.fifth.type = 'sine';
    this.fifth.frequency.value = 270;
    this.fifth.connect(gain(ctx, 0.3, this.lp));
    this.harsh = ctx.createOscillator();
    this.harsh.type = 'square';
    this.harsh.frequency.value = 190;
    this.harshG = gain(ctx, 0, this.lp);
    this.harsh.connect(this.harshG);

    // Vibrato grows with the charge level.
    this.vib = ctx.createOscillator();
    this.vib.frequency.value = 5;
    this.vibDepth = gain(ctx, 0);
    this.vib.connect(this.vibDepth);
    this.vibDepth.connect(this.saw.detune);
    this.vibDepth.connect(this.fifth.detune);

    // Tremolo (only when overheating).
    this.tremLfo = ctx.createOscillator();
    this.tremLfo.frequency.value = 17;
    this.tremDepth = gain(ctx, 0);
    this.tremLfo.connect(this.tremDepth).connect(this.trem.gain);

    for (const o of [this.saw, this.fifth, this.harsh, this.vib, this.tremLfo]) o.start(t);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(0.35, t + 0.04);
  }

  /** `at` overrides the automation time (used by offline rendering); defaults to now. */
  update(level: number, overheating: boolean, at?: number): void {
    if (this.stopped) return;
    const lv = clamp01(level);
    if (Math.abs(lv - this.lastLevel) < 0.003 && overheating === this.lastHot) return;
    const now = at ?? this.k.ctx.currentTime;
    const tc = 0.03;
    const f = 180 * Math.pow(4, lv); // 180 Hz → 720 Hz (two octaves)
    this.saw.frequency.setTargetAtTime(f, now, tc);
    this.fifth.frequency.setTargetAtTime(f * 1.5, now, tc);
    this.harsh.frequency.setTargetAtTime(f * 1.06, now, tc);
    this.lp.frequency.setTargetAtTime(600 * Math.pow(8, lv), now, tc);
    this.vib.frequency.setTargetAtTime(5 + 9 * lv, now, tc);
    this.vibDepth.gain.setTargetAtTime(6 + 24 * lv, now, tc);
    this.harshG.gain.setTargetAtTime(overheating ? 0.25 : 0, now, tc);
    this.tremDepth.gain.setTargetAtTime(overheating ? 0.45 : 0, now, tc);
    this.trem.gain.setTargetAtTime(overheating ? 0.55 : 1, now, tc);
    this.out.gain.setTargetAtTime(0.35 + 0.65 * lv, now, tc);
    this.lastLevel = lv;
    this.lastHot = overheating;
  }

  stop(at?: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = at ?? this.k.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, 0.025);
      for (const o of [this.saw, this.fifth, this.harsh, this.vib, this.tremLfo]) o.stop(now + 0.2);
      this.saw.onended = () => {
        try {
          this.out.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* context closed */
    }
  }
}

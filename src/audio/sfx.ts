/**
 * One-shot sound effect recipes. Each recipe schedules nodes on `k.ctx` starting at time `t`,
 * writes into `out` and returns the absolute time at which it has fully decayed to silence.
 * `i` is the 0..1 intensity (size/pitch where meaningful; loudness is scaled by the caller).
 */
import type { SfxName } from './types';
import { SynthKit, bell, biquad, envASR, gain, metal, noise, rand, shaper, sweep, tone } from './kit';
import { midiToFreq } from './math';

export type SfxFn = (k: SynthKit, out: AudioNode, t: number, i: number) => number;

interface CannonSpec {
  sub0: number; sub1: number; subD: number; subG: number;
  crackF: number; crackD: number; crackG: number;
  bodyCut: number; bodyD: number; bodyG: number;
  tailD: number; tailG: number;
  clankF: number; clankG: number;
}

const CANNONS: Record<'light' | 'medium' | 'heavy' | 'artillery', CannonSpec> = {
  light: { sub0: 170, sub1: 62, subD: 0.18, subG: 0.42, crackF: 3200, crackD: 0.05, crackG: 0.3, bodyCut: 2600, bodyD: 0.16, bodyG: 0.32, tailD: 0.3, tailG: 0.1, clankF: 950, clankG: 0.05 },
  medium: { sub0: 135, sub1: 48, subD: 0.3, subG: 0.5, crackF: 2300, crackD: 0.07, crackG: 0.3, bodyCut: 1900, bodyD: 0.26, bodyG: 0.36, tailD: 0.6, tailG: 0.15, clankF: 640, clankG: 0.06 },
  heavy: { sub0: 112, sub1: 36, subD: 0.48, subG: 0.56, crackF: 1700, crackD: 0.09, crackG: 0.3, bodyCut: 1400, bodyD: 0.42, bodyG: 0.4, tailD: 1.0, tailG: 0.2, clankF: 420, clankG: 0.07 },
  artillery: { sub0: 92, sub1: 30, subD: 0.7, subG: 0.56, crackF: 1250, crackD: 0.12, crackG: 0.26, bodyCut: 950, bodyD: 0.6, bodyG: 0.4, tailD: 1.6, tailG: 0.22, clankF: 300, clankG: 0.05 },
};

/** Weighty cannon: sub-bass thump + audible punch harmonic + noise crack + blast body + rumble tail. */
function cannon(k: SynthKit, dest: AudioNode, t: number, s: CannonSpec, pitch = 1): number {
  const { ctx } = k;
  const out = gain(ctx, 0.52, dest); // headroom trim: layers sum constructively on the attack
  const p = pitch * rand(0.97, 1.03);
  const sat = shaper(ctx, k.soft, out);
  let end = tone(k, sat, t, { f0: s.sub0 * p, f1: s.sub1 * p, glide: s.subD * 0.5, a: 0.002, d: s.subD, gain: s.subG });
  // Phone speakers cannot reproduce <100 Hz: an octave-up punch keeps the weight audible.
  end = Math.max(end, tone(k, sat, t, { type: 'triangle', f0: s.sub0 * 2.2 * p, f1: s.sub1 * 2.5 * p, glide: s.subD * 0.3, a: 0.001, d: s.subD * 0.45, gain: s.subG * 0.45 }));
  end = Math.max(end, noise(k, out, t, { color: 'white', d: s.crackD, gain: s.crackG, filter: 'highpass', f0: s.crackF * p, q: 0.8, drive: k.crunch }));
  end = Math.max(end, noise(k, out, t, { color: 'brown', a: 0.004, d: s.bodyD, gain: s.bodyG, filter: 'lowpass', f0: s.bodyCut * p, f1: s.bodyCut * 0.25 * p, q: 1.2, drive: k.crunch }));
  end = Math.max(end, noise(k, out, t + 0.01, { color: 'brown', a: 0.03, d: s.tailD, gain: s.tailG, filter: 'lowpass', f0: 320, f1: 110, q: 0.9, rate: 0.7 }));
  end = Math.max(end, metal(k, out, t + 0.015, s.clankF * p, 0.14, s.clankG));
  return end;
}

/** Crunchy explosion with low rumble tail; size 0..1. */
function explosion(k: SynthKit, dest: AudioNode, t: number, size: number): number {
  const { ctx } = k;
  const out = gain(ctx, 0.58, dest); // headroom trim
  const s = Math.max(0, Math.min(1, size));
  const sat = shaper(ctx, k.soft, out);
  let end = noise(k, out, t, { color: 'white', d: 0.05 + 0.05 * s, gain: 0.3, filter: 'highpass', f0: 1800, q: 0.7, drive: k.crunch });
  end = Math.max(end, noise(k, out, t, { color: 'white', a: 0.003, d: 0.3 + 0.7 * s, gain: 0.3, filter: 'lowpass', f0: 5000, f1: 280, sweepDur: 0.35 + 0.5 * s, q: 1, drive: k.crunch }));
  end = Math.max(end, noise(k, out, t + 0.01, { color: 'brown', a: 0.03, d: 0.8 + 1.6 * s, gain: 0.3 + 0.12 * s, filter: 'lowpass', f0: 260, f1: 120, q: 0.8, rate: 0.7 }));
  end = Math.max(end, tone(k, sat, t, { f0: 75, f1: 28, glide: 0.4 + 0.3 * s, a: 0.003, d: 0.5 + 0.6 * s, gain: 0.42 + 0.1 * s }));
  end = Math.max(end, tone(k, sat, t, { type: 'triangle', f0: 190, f1: 60, glide: 0.2, a: 0.002, d: 0.22 + 0.15 * s, gain: 0.24 }));
  const debris = 3 + Math.round(8 * s);
  for (let n = 0; n < debris; n++) {
    const dt = rand(0.07, 0.45 + 0.6 * s);
    end = Math.max(end, noise(k, out, t + dt, { color: 'white', d: rand(0.015, 0.04), gain: rand(0.04, 0.1) * (1 - dt / 1.6), filter: 'bandpass', f0: rand(1200, 4200), q: 3 }));
  }
  return end;
}

function chime(k: SynthKit, out: AudioNode, t: number, notes: number[], step: number, d: number, g: number, type: OscillatorType = 'triangle'): number {
  let end = t;
  notes.forEach((m, idx) => {
    end = Math.max(end, tone(k, out, t + idx * step, { type, f0: midiToFreq(m), a: 0.004, d, gain: g }));
  });
  return end;
}

export const SFX: Record<SfxName, SfxFn> = {
  fire_light: (k, out, t) => cannon(k, out, t, CANNONS.light),
  fire_medium: (k, out, t) => cannon(k, out, t, CANNONS.medium),
  fire_heavy: (k, out, t) => cannon(k, out, t, CANNONS.heavy),
  fire_artillery: (k, out, t) => {
    let end = cannon(k, out, t, CANNONS.artillery);
    // Distant valley echo of the blast.
    end = Math.max(end, noise(k, out, t + 0.32, { color: 'brown', a: 0.03, d: 0.7, gain: 0.12, filter: 'lowpass', f0: 600, f1: 200, q: 0.8 }));
    return end;
  },
  fire_charged: (k, out, t, i) => {
    const s = CANNONS.heavy;
    const spec: CannonSpec = { ...s, subG: s.subG * (0.8 + 0.2 * i), bodyD: s.bodyD * (0.7 + 0.5 * i), tailD: s.tailD * (0.6 + 0.6 * i), crackG: 0.26 + 0.08 * i };
    let end = cannon(k, out, t, spec, 1.25 - 0.3 * i);
    // Energy discharge "zap" sweeping down.
    const { ctx } = k;
    const bp = biquad(ctx, 'bandpass', 1800, 2.5, out);
    sweep(bp.frequency, t, 2600, 400, 0.18);
    end = Math.max(end, tone(k, bp, t, { type: 'sawtooth', f0: 1500 + 500 * i, f1: 140, glide: 0.18, a: 0.002, d: 0.22, gain: 0.16 + 0.12 * i }));
    return end;
  },
  perfect_charge: (k, out, t) => {
    let end = bell(k, out, t, 1318.5, 0.6, 0.22);
    end = Math.max(end, bell(k, out, t + 0.07, 1975.5, 0.7, 0.18));
    end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.25, gain: 0.07, filter: 'highpass', f0: 7000, q: 0.7 }));
    return end;
  },
  overheat: (k, out, t) => {
    let end = noise(k, out, t, { color: 'white', a: 0.02, d: 0.9, gain: 0.22, filter: 'highpass', f0: 2800, f1: 1500, q: 0.7 });
    const lp = biquad(k.ctx, 'lowpass', 900, 1, out);
    for (let n = 0; n < 3; n++) end = Math.max(end, tone(k, lp, t + n * 0.16, { type: 'square', f0: 110, a: 0.005, d: 0.12, gain: 0.3 }));
    return end;
  },
  reload_ready: (k, out, t) => {
    let end = metal(k, out, t, 900, 0.08, 0.16);
    end = Math.max(end, metal(k, out, t + 0.09, 1300, 0.1, 0.16));
    end = Math.max(end, tone(k, out, t + 0.1, { f0: 1760, a: 0.003, d: 0.14, gain: 0.08 }));
    return end;
  },
  explosion_small: (k, out, t, i) => explosion(k, out, t, 0.25 * (0.6 + 0.4 * i)),
  explosion_big: (k, out, t, i) => explosion(k, out, t, 0.7 + 0.3 * i),
  hit_metal: (k, out, t) => {
    let end = metal(k, out, t, rand(380, 520), 0.35, 0.26);
    end = Math.max(end, tone(k, out, t, { f0: 210, f1: 90, glide: 0.06, a: 0.001, d: 0.09, gain: 0.32 }));
    end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.05, gain: 0.18, filter: 'bandpass', f0: 2100, q: 1.5 }));
    return end;
  },
  hit_wall: (k, out, t) => {
    let end = tone(k, out, t, { f0: 160, f1: 60, glide: 0.1, a: 0.001, d: 0.12, gain: 0.45 });
    end = Math.max(end, noise(k, out, t, { color: 'brown', d: 0.18, gain: 0.38, filter: 'lowpass', f0: 900, q: 1, drive: k.crunch }));
    end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.08, gain: 0.12, filter: 'bandpass', f0: 2500, q: 1 }));
    for (let n = 0; n < 3; n++) end = Math.max(end, noise(k, out, t + rand(0.04, 0.2), { color: 'white', d: 0.02, gain: 0.06, filter: 'bandpass', f0: rand(1500, 3500), q: 3 }));
    return end;
  },
  ricochet: (k, out, t) => {
    const f = rand(2800, 3600);
    let end = tone(k, out, t, { f0: f, f1: f * 0.4, glide: 0.4, a: 0.004, d: 0.45, gain: 0.16 });
    end = Math.max(end, tone(k, out, t, { type: 'triangle', f0: f * 0.51, f1: f * 0.2, glide: 0.4, a: 0.004, d: 0.3, gain: 0.06 }));
    end = Math.max(end, metal(k, out, t, 1800, 0.1, 0.1));
    return end;
  },
  shell_whistle: (k, out, t) => {
    const { ctx } = k;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    sweep(osc.frequency, t, 1500, 650, 0.9);
    const g = gain(ctx, 0, out);
    osc.connect(g);
    const end = envASR(g.gain, t, 0.35, 0.13, 0.35, 0.25);
    osc.start(t);
    osc.stop(end + 0.02);
    const end2 = noise(k, out, t + 0.1, { color: 'pink', a: 0.3, d: 0.6, gain: 0.1, filter: 'bandpass', f0: 1500, f1: 650, sweepDur: 0.8, q: 5 });
    return Math.max(end, end2);
  },
  destroy_tank: (k, out, t) => {
    const o = gain(k.ctx, 0.8, out);
    let end = explosion(k, o, t, 1);
    end = Math.max(end, metal(k, o, t + 0.03, 210, 0.7, 0.14));
    end = Math.max(end, explosion(k, o, t + 0.35, 0.2));
    end = Math.max(end, metal(k, o, t + 0.55, 330, 0.4, 0.08));
    end = Math.max(end, metal(k, o, t + 0.8, 520, 0.25, 0.05));
    return end;
  },
  wall_break: (k, out, t) => {
    let end = tone(k, shaper(k.ctx, k.soft, out), t, { f0: 120, f1: 45, glide: 0.25, a: 0.002, d: 0.3, gain: 0.4 });
    end = Math.max(end, noise(k, out, t, { color: 'brown', a: 0.005, d: 0.6, gain: 0.32, filter: 'lowpass', f0: 1300, f1: 300, q: 1, drive: k.crunch }));
    for (let n = 0; n < 6; n++) end = Math.max(end, noise(k, out, t + rand(0.03, 0.45), { color: 'brown', d: rand(0.06, 0.14), gain: 0.14, filter: 'bandpass', f0: rand(300, 1200), q: 2 }));
    end = Math.max(end, noise(k, out, t + 0.05, { color: 'white', a: 0.05, d: 0.5, gain: 0.07, filter: 'bandpass', f0: 3000, q: 1 }));
    return end;
  },
  crate_break: (k, out, t) => {
    let end = noise(k, out, t, { color: 'white', d: 0.045, gain: 0.42, filter: 'bandpass', f0: 1800, q: 2, drive: k.crunch });
    [0, 0.05, 0.11, 0.18].forEach((dt) => {
      end = Math.max(end, tone(k, out, t + dt, { type: 'triangle', f0: rand(240, 460), f1: rand(150, 220), glide: 0.05, a: 0.001, d: 0.07, gain: 0.26 }));
    });
    end = Math.max(end, noise(k, out, t + 0.02, { color: 'white', d: 0.16, gain: 0.1, filter: 'highpass', f0: 3500, q: 0.7 }));
    return end;
  },
  dash: (k, out, t) => {
    let end = noise(k, out, t, { color: 'pink', a: 0.06, d: 0.32, gain: 0.45, filter: 'bandpass', f0: 300, f1: 2600, sweepDur: 0.25, q: 1.2 });
    end = Math.max(end, tone(k, out, t, { f0: 95, f1: 50, glide: 0.15, a: 0.004, d: 0.16, gain: 0.3 }));
    return end;
  },
  shield_up: (k, out, t) => {
    const { ctx } = k;
    const lp = biquad(ctx, 'lowpass', 400, 4, out);
    sweep(lp.frequency, t, 400, 4500, 0.4);
    let end = t;
    [220, 277.2, 330].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      sweep(osc.frequency, t, f, f * 2, 0.4);
      const g = gain(ctx, 0, lp);
      osc.connect(g);
      end = envASR(g.gain, t, 0.05, 0.1, 0.22, 0.3);
      osc.start(t);
      osc.stop(end + 0.02);
    });
    end = Math.max(end, bell(k, out, t + 0.35, 1320, 0.5, 0.1));
    return end;
  },
  shield_hit: (k, out, t) => {
    let end = tone(k, out, t, { type: 'square', f0: 1400, f1: 600, glide: 0.08, a: 0.001, d: 0.14, gain: 0.1 });
    end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.1, gain: 0.28, filter: 'bandpass', f0: 3000, q: 2 }));
    end = Math.max(end, tone(k, out, t, { f0: 2200, a: 0.002, d: 0.28, gain: 0.1 }));
    end = Math.max(end, tone(k, out, t, { f0: 2310, a: 0.002, d: 0.24, gain: 0.07 }));
    return end;
  },
  siege_on: (k, out, t) => siege(k, out, t, true),
  siege_off: (k, out, t) => siege(k, out, t, false),
  trap_place: (k, out, t) => {
    let end = noise(k, out, t, { color: 'white', d: 0.012, gain: 0.3, filter: 'highpass', f0: 3000, q: 0.7 });
    end = Math.max(end, tone(k, out, t, { f0: 140, f1: 80, glide: 0.06, a: 0.001, d: 0.08, gain: 0.28 }));
    end = Math.max(end, tone(k, out, t + 0.03, { type: 'triangle', f0: 880, a: 0.003, d: 0.06, gain: 0.2 }));
    end = Math.max(end, noise(k, out, t + 0.12, { color: 'white', d: 0.012, gain: 0.25, filter: 'highpass', f0: 3500, q: 0.7 }));
    end = Math.max(end, tone(k, out, t + 0.13, { type: 'triangle', f0: 1320, a: 0.003, d: 0.08, gain: 0.14 }));
    return end;
  },
  trap_trigger: (k, out, t) => {
    let end = noise(k, out, t, { color: 'white', d: 0.03, gain: 0.34, filter: 'highpass', f0: 3000, q: 0.7, drive: k.crunch });
    end = Math.max(end, metal(k, out, t, 600, 0.3, 0.2));
    end = Math.max(end, tone(k, out, t + 0.02, { type: 'square', f0: 300, f1: 1200, glide: 0.12, a: 0.002, d: 0.14, gain: 0.08 }));
    return end;
  },
  mine_explode: (k, out, t) => {
    let end = tone(k, out, t, { type: 'square', f0: 1800, a: 0.002, d: 0.05, gain: 0.08 });
    end = Math.max(end, tone(k, out, t + 0.08, { type: 'square', f0: 1800, a: 0.002, d: 0.05, gain: 0.08 }));
    end = Math.max(end, explosion(k, out, t + 0.16, 0.6));
    return end;
  },
  alarm: (k, out, t) => {
    const { ctx } = k;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    for (let n = 0; n < 6; n++) osc.frequency.setValueAtTime(n % 2 ? 990 : 740, t + n * 0.16);
    const lp = biquad(ctx, 'lowpass', 1800, 0.7, out);
    const g = gain(ctx, 0, lp);
    osc.connect(g);
    const end = envASR(g.gain, t, 0.01, 0.16, 0.86, 0.08);
    osc.start(t);
    osc.stop(end + 0.02);
    return end;
  },
  hologram: (k, out, t) => {
    const { ctx } = k;
    const trem = gain(ctx, 0.6, out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const depth = gain(ctx, 0.4);
    lfo.connect(depth).connect(trem.gain);
    let end = t;
    [520, 781, 1043].forEach((f, idx) => {
      end = Math.max(end, tone(k, trem, t + idx * 0.03, { f0: f, f1: f * 0.8, glide: 0.7, a: 0.08, d: 0.7, gain: 0.12 }));
    });
    end = Math.max(end, noise(k, out, t, { color: 'white', a: 0.05, d: 0.5, gain: 0.05, filter: 'highpass', f0: 6000, q: 0.7 }));
    lfo.start(t);
    lfo.stop(end + 0.02);
    return end;
  },
  smoke_bomb: (k, out, t) => {
    let end = tone(k, out, t, { f0: 420, f1: 110, glide: 0.08, a: 0.001, d: 0.09, gain: 0.4 });
    end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.04, gain: 0.3, filter: 'bandpass', f0: 1200, q: 1 }));
    end = Math.max(end, noise(k, out, t + 0.03, { color: 'white', a: 0.08, d: 1.4, gain: 0.18, filter: 'highpass', f0: 3000, f1: 1400, q: 0.7 }));
    return end;
  },
  mud_splash: (k, out, t) => {
    let end = noise(k, out, t, { color: 'pink', a: 0.004, d: 0.35, gain: 0.45, filter: 'lowpass', f0: 1600, f1: 350, q: 2 });
    end = Math.max(end, tone(k, out, t, { f0: 120, f1: 60, glide: 0.08, a: 0.002, d: 0.12, gain: 0.3 }));
    for (let n = 0; n < 4; n++) {
      const f = rand(260, 420);
      end = Math.max(end, tone(k, out, t + rand(0.05, 0.3), { f0: f, f1: f * 2.2, glide: 0.05, a: 0.002, d: 0.06, gain: 0.12 }));
    }
    return end;
  },
  ui_click: (k, out, t) => {
    let end = tone(k, out, t, { f0: 1250, f1: 900, glide: 0.03, a: 0.001, d: 0.035, gain: 0.25 });
    end = Math.max(end, noise(k, out, t, { color: 'white', d: 0.006, gain: 0.1, filter: 'highpass', f0: 4000, q: 0.7 }));
    return end;
  },
  ui_back: (k, out, t) => chime(k, out, t, [76, 69], 0.07, 0.12, 0.24),
  ui_confirm: (k, out, t) => {
    let end = chime(k, out, t, [72, 79], 0.07, 0.16, 0.24);
    end = Math.max(end, tone(k, out, t + 0.07, { f0: midiToFreq(91), a: 0.003, d: 0.2, gain: 0.06 }));
    return end;
  },
  notify: (k, out, t) => {
    let end = bell(k, out, t, 880, 0.5, 0.2);
    end = Math.max(end, bell(k, out, t + 0.12, 1318.5, 0.7, 0.18));
    return end;
  },
  victory: (k, out, t) => {
    const { ctx } = k;
    const lp = biquad(ctx, 'lowpass', 2600, 0.7, out);
    let end = chime(k, lp, t, [60, 64, 67], 0.13, 0.22, 0.16, 'square');
    [72, 76, 79].forEach((m, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'square' : 'triangle';
      osc.frequency.value = midiToFreq(m);
      const g = gain(ctx, 0, lp);
      osc.connect(g);
      const e = envASR(g.gain, t + 0.39, 0.02, idx === 0 ? 0.14 : 0.1, 0.9, 0.7);
      osc.start(t + 0.39);
      osc.stop(e + 0.02);
      end = Math.max(end, e);
    });
    [0, 0.39].forEach((dt) => {
      end = Math.max(end, tone(k, out, t + dt, { f0: 130, f1: 50, glide: 0.1, a: 0.002, d: 0.22, gain: 0.35 }));
    });
    end = Math.max(end, noise(k, out, t + 0.39, { color: 'white', a: 0.01, d: 0.9, gain: 0.06, filter: 'highpass', f0: 6000, q: 0.7 }));
    return end;
  },
  defeat: (k, out, t) => {
    const { ctx } = k;
    const lp = biquad(ctx, 'lowpass', 1100, 0.7, out);
    let end = t;
    [69, 65, 62].forEach((m, idx) => {
      const st = t + idx * 0.45;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(m - 12);
      const g = gain(ctx, 0, lp);
      osc.connect(g);
      const last = idx === 2;
      if (last) {
        const vib = ctx.createOscillator();
        vib.frequency.value = 5;
        const vd = gain(ctx, 4);
        vib.connect(vd).connect(osc.detune);
        vib.start(st);
        vib.stop(st + 1.6);
      }
      const e = envASR(g.gain, st, 0.03, 0.2, last ? 0.8 : 0.32, last ? 0.7 : 0.1);
      osc.start(st);
      osc.stop(e + 0.02);
      end = Math.max(end, e);
    });
    end = Math.max(end, tone(k, out, t + 0.9, { f0: 90, f1: 40, glide: 0.3, a: 0.003, d: 0.6, gain: 0.4 }));
    return end;
  },
};

function siege(k: SynthKit, out: AudioNode, t: number, on: boolean): number {
  const { ctx } = k;
  const lp = biquad(ctx, 'lowpass', 520, 1.5, out);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const mt = on ? t : t + 0.12;
  sweep(osc.frequency, mt, on ? 72 : 44, on ? 44 : 78, 0.45);
  const g = gain(ctx, 0, lp);
  osc.connect(g);
  let end = envASR(g.gain, mt, 0.05, 0.4, 0.3, 0.12);
  osc.start(mt);
  osc.stop(end + 0.02);
  end = Math.max(end, noise(k, out, mt, { color: 'pink', a: 0.08, d: 0.4, gain: 0.12, filter: 'bandpass', f0: on ? 900 : 400, f1: on ? 400 : 900, q: 2 }));
  const ct = on ? t + 0.5 : t;
  end = Math.max(end, metal(k, out, ct, 180, 0.25, 0.22));
  end = Math.max(end, tone(k, out, ct, { f0: 130, f1: 50, glide: 0.15, a: 0.001, d: 0.2, gain: 0.45 }));
  return end;
}


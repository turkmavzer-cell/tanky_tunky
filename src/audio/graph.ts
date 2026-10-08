/**
 * Bus / mastering graph and per-voice spatial chain. Context-agnostic (BaseAudioContext) so the
 * offline checker in tools/ builds exactly what the game builds.
 */
import { AUDIO_CONFIG } from './config';
import { biquad, gain } from './kit';
import { makeCeilingCurve } from './math';

export interface Buses {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  ambience: GainNode;
  engine: GainNode;
  charge: GainNode;
  /** Final node feeding the destination (safety ceiling after the limiter). */
  output: AudioNode;
}

/**
 * sfx/ambience/engine/charge → sfx bus ┐
 *                         music bus ───┴→ master → DC block → glue compressor → limiter → ceiling → dest
 */
export function createBuses(ctx: BaseAudioContext, dest: AudioNode): Buses {
  // DynamicsCompressor overshoots slightly on hard transients; a static soft-clip ceiling
  // guarantees the output never exceeds 0.98.
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = makeCeilingCurve(0.8, 0.98);
  ceiling.oversample = '2x';
  ceiling.connect(dest);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(ceiling);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(limiter);
  const master = gain(ctx, 1, biquad(ctx, 'highpass', 20, 0.7, comp));
  const sfx = gain(ctx, AUDIO_CONFIG.mix.sfx, master);
  const music = gain(ctx, AUDIO_CONFIG.mix.music, master);
  const ambience = gain(ctx, AUDIO_CONFIG.mix.ambience, sfx);
  const engine = gain(ctx, AUDIO_CONFIG.mix.engine, sfx);
  const charge = gain(ctx, AUDIO_CONFIG.mix.charge, sfx);
  return { master, sfx, music, ambience, engine, charge, output: ceiling };
}

export interface VoiceChain {
  /** Synth recipes write here. */
  input: GainNode;
  /** Last node of the chain (disconnect to release). */
  output: AudioNode;
}

/** voice gain → [low-pass when muffled] → stereo panner → dest. */
export function createVoiceChain(ctx: BaseAudioContext, dest: AudioNode, pan: number, level: number, muffled: boolean): VoiceChain {
  let output: AudioNode = dest;
  let head: AudioNode = dest;
  let first = true;
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(head);
    head = p;
    output = p;
    first = false;
  }
  if (muffled) {
    const lp = biquad(ctx, 'lowpass', AUDIO_CONFIG.muffledCutoffHz, 0.7, head);
    head = lp;
    if (first) output = lp;
    first = false;
  }
  const input = gain(ctx, level, head);
  if (first) output = input;
  return { input, output };
}

import { describe, expect, it } from 'vitest';
import { AUDIO_CONFIG } from '../src/audio/config';
import {
  RateLimiter,
  VoiceTracker,
  computePan,
  distanceGain,
  fillNoise,
  makeDriveCurve,
  spatialize,
} from '../src/audio/math';
import { ENGINE_VOICES, SFX_NAMES, createAudioSystem, createSilentAudio, type AudioSystem } from '../src/audio/index';

describe('audio pan', () => {
  it('is centred for sounds on the listener or straight "down/up" the screen', () => {
    expect(computePan(0, 0)).toBe(0);
    // (dx, dy) = (1, 1) projects straight down on screen: screenDX = 0.
    expect(computePan(1, 1)).toBe(0);
    expect(computePan(-5, -5)).toBe(0);
  });

  it('follows the iso projection: +x is screen right, +y is screen left', () => {
    expect(computePan(1, 0)).toBeCloseTo(64 / 700, 6);
    expect(computePan(0, 1)).toBeCloseTo(-64 / 700, 6);
    expect(computePan(3, -2)).toBeCloseTo((5 * 64) / 700, 6);
  });

  it('clamps to [-1, 1]', () => {
    expect(computePan(100, 0)).toBe(1);
    expect(computePan(0, 100)).toBe(-1);
    expect(computePan(Number.NaN, 0)).toBe(0);
  });
});

describe('audio distance attenuation', () => {
  it('is full volume up to fullVolumeDist and silent at maxDist and beyond', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(AUDIO_CONFIG.fullVolumeDist)).toBe(1);
    expect(distanceGain(AUDIO_CONFIG.maxDist)).toBe(0);
    expect(distanceGain(1000)).toBe(0);
    expect(distanceGain(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('decreases monotonically and smoothly in between', () => {
    let prev = 1;
    for (let d = AUDIO_CONFIG.fullVolumeDist; d <= AUDIO_CONFIG.maxDist; d += 0.25) {
      const g = distanceGain(d);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - g).toBeLessThan(0.08); // no jumps
      prev = g;
    }
    const mid = distanceGain((AUDIO_CONFIG.fullVolumeDist + AUDIO_CONFIG.maxDist) / 2);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.6);
    expect(distanceGain(AUDIO_CONFIG.maxDist - 0.5)).toBeLessThan(0.01);
  });

  it('spatialize combines pan, distance and the muffle drop without allocating', () => {
    const out = { pan: 0, gain: 0 };
    const r = spatialize(12, 10, 10, 10, false, out);
    expect(r).toBe(out);
    expect(out.pan).toBeCloseTo(128 / 700, 6);
    expect(out.gain).toBe(1);
    spatialize(12, 10, 10, 10, true, out);
    expect(out.gain).toBeCloseTo(AUDIO_CONFIG.muffledGain, 6);
    spatialize(10 + 30, 10, 10, 10, false, out);
    expect(out.gain).toBe(0);
    expect(out.pan).toBe(1);
  });
});

describe('VoiceTracker (voice stealing)', () => {
  it('steals the oldest voice when the cap is reached', () => {
    const vt = new VoiceTracker(3);
    const stolen: number[] = [];
    vt.add(1, 0.0, 10, [], stolen);
    vt.add(2, 0.1, 10, [], stolen);
    vt.add(3, 0.2, 10, [], stolen);
    expect(stolen).toEqual([]);
    vt.add(4, 0.3, 10, [], stolen);
    expect(stolen).toEqual([1]);
    vt.add(5, 0.4, 10, [], stolen);
    expect(stolen).toEqual([1, 2]);
    expect(vt.size).toBe(3);
    expect(vt.has(3) && vt.has(4) && vt.has(5)).toBe(true);
  });

  it('releases expired voices before stealing', () => {
    const vt = new VoiceTracker(2);
    const released: number[] = [];
    const stolen: number[] = [];
    vt.add(1, 0, 0.5, released, stolen);
    vt.add(2, 0.1, 5, released, stolen);
    vt.add(3, 1.0, 5, released, stolen); // voice 1 ended at 0.5
    expect(released).toEqual([1]);
    expect(stolen).toEqual([]);
    expect(vt.size).toBe(2);
  });

  it('never exceeds the configured cap under a burst', () => {
    const vt = new VoiceTracker(AUDIO_CONFIG.maxVoices);
    const stolen: number[] = [];
    for (let i = 0; i < 200; i++) vt.add(i, i * 0.001, 100, [], stolen);
    expect(vt.size).toBe(AUDIO_CONFIG.maxVoices);
    expect(stolen.length).toBe(200 - AUDIO_CONFIG.maxVoices);
    expect(stolen.slice(0, 3)).toEqual([0, 1, 2]);
    expect(vt.clear().length).toBe(AUDIO_CONFIG.maxVoices);
    expect(vt.size).toBe(0);
  });
});

describe('RateLimiter', () => {
  it('allows at most one identical sfx per interval', () => {
    const rl = new RateLimiter(30, { ricochet: 60 });
    expect(rl.allow('hit_metal', 1000)).toBe(true);
    expect(rl.allow('hit_metal', 1010)).toBe(false);
    expect(rl.allow('hit_metal', 1029)).toBe(false);
    expect(rl.allow('hit_metal', 1030)).toBe(true);
    // Rejected calls do not extend the window.
    expect(rl.allow('hit_metal', 1059)).toBe(false);
    expect(rl.allow('hit_metal', 1060)).toBe(true);
  });

  it('keys are independent and overrides apply', () => {
    const rl = new RateLimiter(30, { ricochet: 60 });
    expect(rl.allow('hit_metal', 0)).toBe(true);
    expect(rl.allow('hit_wall', 1)).toBe(true);
    expect(rl.allow('ricochet', 0)).toBe(true);
    expect(rl.allow('ricochet', 40)).toBe(false);
    expect(rl.allow('ricochet', 60)).toBe(true);
    expect(rl.intervalFor('alarm')).toBe(30);
  });

  it('recovers if the clock goes backwards', () => {
    const rl = new RateLimiter(30);
    expect(rl.allow('x', 5000)).toBe(true);
    expect(rl.allow('x', 10)).toBe(true);
  });
});

describe('noise + curves', () => {
  it.each(['white', 'pink', 'brown'] as const)('%s noise is normalised, zero-mean and finite', (kind) => {
    const d = fillNoise(kind, new Float32Array(48000), 7);
    let peak = 0;
    let sum = 0;
    for (const v of d) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
      sum += v;
    }
    expect(peak).toBeLessThanOrEqual(0.9001);
    expect(peak).toBeGreaterThan(0.5);
    expect(Math.abs(sum / d.length)).toBeLessThan(0.02);
  });

  it('drive curve is odd-symmetric and bounded', () => {
    const c = makeDriveCurve(4, 257);
    expect(c[0]).toBeCloseTo(-1, 5);
    expect(c[256]).toBeCloseTo(1, 5);
    expect(c[128]).toBeCloseTo(0, 5);
  });
});

function exercise(a: AudioSystem): void {
  a.setVolumes({ master: 0.8, sfx: 1, music: 0.5 });
  a.setListener(10, 10);
  for (const n of SFX_NAMES) a.play(n, { x: 12, y: 9, intensity: 0.5, muffled: true });
  a.play('ui_click');
  const handles = ENGINE_VOICES.map((v) => a.createEngine(v));
  for (const h of handles) a.updateEngine(h, { x: 1, y: 2, speed: 0.5, load: 1, muffled: false });
  for (const h of handles) a.destroyEngine(h);
  a.destroyEngine({ id: 999 });
  a.chargeStart();
  a.chargeUpdate(0.7, true);
  a.chargeStop();
  a.setAmbience(true, { rain: 0.5, night: true });
  a.setMusic(true, 1);
  a.setMusic(false);
  a.suspend();
  a.resume();
  a.dispose();
  a.dispose();
}

describe('createSilentAudio', () => {
  it('implements the full interface and never throws', async () => {
    const a = createSilentAudio();
    await expect(a.unlock()).resolves.toBeUndefined();
    expect(a.unlocked).toBe(false);
    const h1 = a.createEngine('heavy');
    const h2 = a.createEngine('scout');
    expect(h1.id).not.toBe(h2.id);
    expect(() => exercise(a)).not.toThrow();
  });

  it('has exactly the 35 contract sfx names and 5 engine voices', () => {
    expect(SFX_NAMES.length).toBe(35);
    expect(new Set(SFX_NAMES).size).toBe(35);
    expect(ENGINE_VOICES).toEqual(['scout', 'heavy', 'standard', 'artillery', 'trapper']);
  });
});

describe('createAudioSystem without Web Audio (Node)', () => {
  it('no-ops gracefully and never throws', async () => {
    const a = createAudioSystem();
    await expect(a.unlock()).resolves.toBeUndefined();
    expect(a.unlocked).toBe(false);
    expect(() => exercise(a)).not.toThrow();
  });
});

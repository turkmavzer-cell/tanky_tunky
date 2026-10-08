/**
 * Pure helpers for the audio system (no Web Audio). Unit-tested in Node (tests/audio.test.ts).
 */
import { AUDIO_CONFIG } from './config';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Stereo pan for a world offset (dx, dy) from the listener, using the 2:1 isometric projection. */
export function computePan(dx: number, dy: number, cfg = AUDIO_CONFIG): number {
  const screenDX = (dx - dy) * cfg.isoHalfW;
  const p = clamp(screenDX / cfg.panWidthPx, -1, 1);
  return Number.isFinite(p) ? p : 0;
}

/** Distance attenuation (linear gain 0..1) for a world distance in tiles. */
export function distanceGain(dist: number, cfg = AUDIO_CONFIG): number {
  if (!Number.isFinite(dist)) return 0;
  if (dist <= cfg.fullVolumeDist) return 1;
  if (dist >= cfg.maxDist) return 0;
  const t = (dist - cfg.fullVolumeDist) / (cfg.maxDist - cfg.fullVolumeDist);
  return Math.pow(1 - smoothstep(t), cfg.rolloffExponent);
}

export interface Spatial {
  pan: number;
  gain: number;
}

/**
 * Pan + gain for a sound at world (x, y) heard from listener (lx, ly). Writes into `out` to avoid
 * allocations in per-frame engine updates.
 */
export function spatialize(
  x: number,
  y: number,
  lx: number,
  ly: number,
  muffled: boolean,
  out: Spatial = { pan: 0, gain: 1 },
  cfg = AUDIO_CONFIG,
): Spatial {
  const dx = x - lx;
  const dy = y - ly;
  out.pan = computePan(dx, dy, cfg);
  out.gain = distanceGain(Math.sqrt(dx * dx + dy * dy), cfg) * (muffled ? cfg.muffledGain : 1);
  return out;
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Bookkeeping for the one-shot voice cap. Tracks (id, start, end) and decides which voice to steal.
 * Pure: the caller performs the actual node fade/disconnect for ids it gets back.
 */
export class VoiceTracker {
  private ids: number[] = [];
  private starts: number[] = [];
  private ends: number[] = [];

  constructor(readonly cap: number) {}

  get size(): number {
    return this.ids.length;
  }

  /** Removes voices whose end time has passed; returns their ids (to be released). */
  prune(now: number, released: number[] = []): number[] {
    let w = 0;
    for (let r = 0; r < this.ids.length; r++) {
      if (this.ends[r] <= now) {
        released.push(this.ids[r]);
      } else {
        this.ids[w] = this.ids[r];
        this.starts[w] = this.starts[r];
        this.ends[w] = this.ends[r];
        w++;
      }
    }
    this.ids.length = this.starts.length = this.ends.length = w;
    return released;
  }

  /**
   * Registers a new voice. Expired voices are pruned first (pushed to `released`); if the cap is
   * still reached, the oldest-started voices are stolen (also pushed to `stolen`).
   */
  add(id: number, start: number, end: number, released: number[] = [], stolen: number[] = []): void {
    this.prune(start, released);
    while (this.ids.length >= this.cap && this.ids.length > 0) {
      let oldest = 0;
      for (let i = 1; i < this.starts.length; i++) if (this.starts[i] < this.starts[oldest]) oldest = i;
      stolen.push(this.ids[oldest]);
      this.ids.splice(oldest, 1);
      this.starts.splice(oldest, 1);
      this.ends.splice(oldest, 1);
    }
    this.ids.push(id);
    this.starts.push(start);
    this.ends.push(end);
  }

  has(id: number): boolean {
    return this.ids.includes(id);
  }

  clear(released: number[] = []): number[] {
    for (const id of this.ids) released.push(id);
    this.ids.length = this.starts.length = this.ends.length = 0;
    return released;
  }
}

/** Per-key minimum interval limiter (e.g. at most one 'hit_metal' every 30 ms). */
export class RateLimiter {
  private last = new Map<string, number>();

  constructor(
    private readonly defaultMs: number,
    private readonly overrides: Readonly<Record<string, number>> = {},
  ) {}

  intervalFor(key: string): number {
    return this.overrides[key] ?? this.defaultMs;
  }

  /** Returns true (and records the time) if `key` may play at `nowMs`. */
  allow(key: string, nowMs: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && nowMs - prev < this.intervalFor(key) && nowMs >= prev) return false;
    this.last.set(key, nowMs);
    return true;
  }

  reset(): void {
    this.last.clear();
  }
}

/** Small seeded PRNG (mulberry32) for noise generation; audio is not part of the deterministic sim. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NoiseKind = 'white' | 'pink' | 'brown';

/**
 * Fills `data` with normalised noise (peak ~0.9, zero mean) of the given colour. The buffer is
 * meant to be looped, so the ends are cross-faded to avoid a click at the loop point.
 */
export function fillNoise(kind: NoiseKind, data: Float32Array, seed = 1): Float32Array {
  const rnd = mulberry32(seed);
  const n = data.length;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    if (kind === 'white') {
      data[i] = w;
    } else if (kind === 'pink') {
      // Paul Kellet's refined pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      data[i] = brown;
    }
  }
  // Remove DC, normalise.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += data[i];
  mean /= n || 1;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    data[i] -= mean;
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  const k = peak > 0 ? 0.9 / peak : 0;
  for (let i = 0; i < n; i++) data[i] *= k;
  // Loop-point crossfade (short, equal-gain).
  const xf = Math.min(256, Math.floor(n / 8));
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    const head = data[i];
    const tail = data[n - xf + i];
    data[n - xf + i] = tail * (1 - t) + head * t;
  }
  return data;
}

/** Soft-clip (tanh-like) transfer curve for WaveShaper "crunch". */
export function makeDriveCurve(amount: number, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const k = Math.max(0.01, amount);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/**
 * Output ceiling curve: linear below `knee`, smoothly saturating to `ceiling` (WaveShaper clamps
 * inputs outside [-1, 1] to the curve ends, so the output can never exceed `ceiling`).
 */
export function makeCeilingCurve(knee = 0.8, ceiling = 0.98, size = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const room = ceiling - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * Math.min(ceiling, y);
  }
  return curve;
}

/**
 * Offline render check for src/audio. Renders every SfxName, engine sweeps, the charge sweep,
 * music (calm + combat), ambience and a stress mix through OfflineAudioContext using the exact
 * synthesis code of the game, then measures peak / RMS / DC / tail and draws a waveform +
 * spectrogram per sound. Results land on window.__audioCheck for tools/audio-check.mjs.
 */
import { Ambience } from '../src/audio/ambience';
import { ChargeTone } from '../src/audio/charge';
import { AUDIO_CONFIG } from '../src/audio/config';
import { EngineSynth } from '../src/audio/engine';
import { createBuses, createVoiceChain } from '../src/audio/graph';
import { SynthKit, gain } from '../src/audio/kit';
import { spatialize } from '../src/audio/math';
import { Music } from '../src/audio/music';
import { SFX } from '../src/audio/sfx';
import { ENGINE_VOICES, SFX_NAMES, type SfxName } from '../src/audio/types';

const SR = 44100;

interface Job {
  label: string;
  /** Rendered buffer length (s); must exceed the sound so the tail can be checked. */
  len: number;
  build(k: SynthKit, dest: AudioNode): void;
  wav?: boolean;
}

export interface Result {
  label: string;
  duration: number;
  peak: number;
  rms: number;
  dc: number;
  tail: number;
  clip: boolean;
  silent: boolean;
  ok: boolean;
}

declare global {
  interface Window {
    __audioCheck?: { done: boolean; error?: string; results: Result[]; wavs: Record<string, string> };
  }
}

const WAV_LABELS = new Set(['fire_heavy', 'fire_charged', 'explosion_big', 'destroy_tank']);

function sfxJob(name: SfxName, intensity = 1): Job {
  return {
    label: name,
    len: 3.6,
    wav: WAV_LABELS.has(name),
    build(k, dest) {
      const chain = createVoiceChain(k.ctx, dest, 0, 1, false);
      SFX[name](k, chain.input, 0.01, intensity);
    },
  };
}

const jobs: Job[] = SFX_NAMES.map((n) => sfxJob(n));

jobs.push({
  label: 'explosion_big muffled @(16,6)',
  len: 3.6,
  build(k, dest) {
    const s = spatialize(16, 6, 10, 10, true);
    const chain = createVoiceChain(k.ctx, dest, s.pan, s.gain, true);
    SFX.explosion_big(k, chain.input, 0.01, 1);
  },
});
jobs.push({ ...sfxJob('fire_charged', 0.1), label: 'fire_charged i=0.1', wav: false });

for (const voice of ENGINE_VOICES) {
  jobs.push({
    label: `engine_${voice} sweep`,
    len: 2.3,
    wav: true,
    build(k, dest) {
      const bus = gain(k.ctx, AUDIO_CONFIG.mix.engine, dest);
      const e = new EngineSynth(k, bus, voice);
      for (let t = 0; t <= 1.85; t += 1 / 60) {
        // Idle → full throttle → coast down.
        const speed = t < 1.2 ? t / 1.2 : Math.max(0, 1 - (t - 1.2) / 0.65);
        const load = t < 1.0 ? 1 : 0.2;
        e.update({ speed, load, pan: 0, gain: 1, muffled: false }, t);
      }
      e.dispose(1.85);
    },
  });
}

jobs.push({
  label: 'charge sweep (+overheat)',
  len: 2.3,
  wav: true,
  build(k, dest) {
    const bus = gain(k.ctx, AUDIO_CONFIG.mix.charge, dest);
    const c = new ChargeTone(k, bus);
    for (let t = 0; t <= 1.9; t += 1 / 60) c.update(Math.min(1, t / 1.4), t > 1.5, t);
    c.stop(1.9);
  },
});

for (const intensity of [0, 1]) {
  jobs.push({
    label: `music i=${intensity}`,
    len: 4.3,
    wav: true,
    build(k, dest) {
      const bus = gain(k.ctx, AUDIO_CONFIG.mix.music, dest);
      const m = new Music(k, bus);
      m.setIntensity(intensity, 0, true);
      m.start(0);
      m.scheduleUntil(4.0);
      m.dispose(3.85);
    },
  });
}

jobs.push({
  label: 'ambience day rain=0.4',
  len: 3.5,
  wav: true,
  build(k, dest) {
    const bus = gain(k.ctx, AUDIO_CONFIG.mix.ambience, dest);
    const a = new Ambience(k, bus);
    a.set(true, 0.4, false, 0);
    a.scheduleUntil(3);
    a.dispose(2.9);
  },
});
jobs.push({
  label: 'ambience night',
  len: 3.5,
  build(k, dest) {
    const bus = gain(k.ctx, AUDIO_CONFIG.mix.ambience, dest);
    const a = new Ambience(k, bus);
    a.set(true, 0, true, 0);
    a.scheduleUntil(3);
    a.dispose(2.9);
  },
});

// Worst case through the real master chain: 12 big explosions + heavy shots at once, full volume.
jobs.push({
  label: 'stress mix (master chain)',
  len: 3.6,
  build(k, dest) {
    const buses = createBuses(k.ctx, dest);
    for (let n = 0; n < 12; n++) {
      const chain = createVoiceChain(k.ctx, buses.sfx, (n % 5) / 5 - 0.4, 1, false);
      (n % 2 ? SFX.explosion_big : SFX.fire_heavy)(k, chain.input, 0.01 + n * 0.01, 1);
    }
  },
});

function analyse(label: string, buf: AudioBuffer): Result {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const n = buf.length;
  let peak = 0;
  let lastActive = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (const ch of chans) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      if (a > 0.001) lastActive = i;
      sum += ch[i];
    }
  }
  const end = Math.max(1, lastActive + 1);
  let sq = 0;
  for (let i = 0; i < end; i++) for (const ch of chans) sq += ch[i] * ch[i];
  const rms = Math.sqrt(sq / (end * chans.length));
  const dc = sum / (n * chans.length);
  let tail = 0;
  for (let i = Math.max(0, n - Math.floor(0.05 * SR)); i < n; i++) for (const ch of chans) tail = Math.max(tail, Math.abs(ch[i]));
  const clip = peak > 0.99;
  const silent = rms < 0.005;
  return { label, duration: end / SR, peak, rms, dc, tail, clip, silent, ok: !clip && !silent && tail < 0.003 && Math.abs(dc) < 0.01 };
}

function encodeWav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const bytes = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  const u8 = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** In-place radix-2 FFT magnitude (re/im arrays of length N, power of two). */
function fftMag(re: Float32Array, im: Float32Array, out: Float32Array): void {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2];
        const ai = im[i + k + len / 2];
        const xr = ar * wr - ai * wi;
        const xi = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(re[i], im[i]);
}

function heat(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  return [Math.round(255 * Math.min(1, x * 1.6)), Math.round(255 * Math.max(0, Math.min(1, x * 1.6 - 0.5))), Math.round(255 * Math.max(0, x * 2 - 1.2) + 60 * (1 - x) * x)];
}

function draw(r: Result, buf: AudioBuffer): HTMLCanvasElement {
  const W = 364;
  const H = 168;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#0a0c0f';
  g.fillRect(0, 0, W, H);
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = buf.length;
  const waveTop = 18;
  const waveH = 62;
  const mid = waveTop + waveH / 2;
  // ±1.0 guides and centre line.
  g.strokeStyle = '#3a2020';
  g.strokeRect(0.5, waveTop + 0.5, W - 1, waveH - 1);
  g.strokeStyle = '#26303a';
  g.beginPath();
  g.moveTo(0, mid + 0.5);
  g.lineTo(W, mid + 0.5);
  g.stroke();
  g.fillStyle = r.ok ? '#6fc3ff' : '#ff6f6f';
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x / W) * n);
    const b = Math.max(a + 1, Math.floor(((x + 1) / W) * n));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      const s = (L[i] + R[i]) / 2;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    g.fillRect(x, mid - (hi * waveH) / 2, 1, Math.max(1, ((hi - lo) * waveH) / 2));
  }
  // Spectrogram (0..11 kHz, linear), dB colour map.
  const specTop = waveTop + waveH + 4;
  const specH = H - specTop - 2;
  const N = 1024;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const mag = new Float32Array(N / 2);
  const img = g.createImageData(W, specH);
  const maxBin = Math.floor((11000 / (SR / 2)) * (N / 2));
  for (let x = 0; x < W; x++) {
    const c = Math.floor((x / W) * n);
    for (let i = 0; i < N; i++) {
      const idx = c - N / 2 + i;
      const s = idx >= 0 && idx < n ? (L[idx] + R[idx]) / 2 : 0;
      re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fftMag(re, im, mag);
    for (let y = 0; y < specH; y++) {
      const bin = Math.floor(((specH - 1 - y) / specH) * maxBin);
      const db = 20 * Math.log10(mag[bin] / (N / 4) + 1e-9);
      const [cr, cg, cb] = heat((db + 90) / 80);
      const p = (y * W + x) * 4;
      img.data[p] = cr;
      img.data[p + 1] = cg;
      img.data[p + 2] = cb;
      img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, specTop);
  g.fillStyle = r.ok ? '#d8dee6' : '#ff8080';
  g.font = '11px system-ui, sans-serif';
  g.fillText(`${r.label}`, 4, 12);
  g.fillStyle = '#9aa6b2';
  g.fillText(`pk ${r.peak.toFixed(2)}  rms ${r.rms.toFixed(3)}  ${r.duration.toFixed(2)}s`, 190, 12);
  return cv;
}

async function run(): Promise<void> {
  const state: NonNullable<Window['__audioCheck']> = { done: false, results: [], wavs: {} };
  window.__audioCheck = state;
  const out = document.getElementById('out') as HTMLElement;
  let grp: HTMLElement | null = null;
  try {
    for (let j = 0; j < jobs.length; j++) {
      const job = jobs[j];
      const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(job.len * SR), sampleRate: SR });
      const kit = new SynthKit(ctx);
      job.build(kit, ctx.destination);
      const buf = await ctx.startRendering();
      const r = analyse(job.label, buf);
      state.results.push(r);
      if (job.wav) state.wavs[job.label] = encodeWav(buf);
      if (j % 12 === 0) {
        grp = document.createElement('div');
        grp.className = 'grp';
        grp.id = `grp-${j / 12}`;
        out.appendChild(grp);
      }
      grp?.appendChild(draw(r, buf));
    }
    (document.getElementById('status') as HTMLElement).textContent = `${state.results.length} renders, ${state.results.filter((r) => !r.ok).length} failing`;
  } catch (e) {
    state.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  }
  state.done = true;
}

void run();

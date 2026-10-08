/**
 * Realtime AudioSystem on top of Web Audio. Every public method is wrapped so it never throws and
 * silently no-ops while the AudioContext is missing, locked or closed.
 */
import { Ambience } from './ambience';
import { ChargeTone } from './charge';
import { AUDIO_CONFIG } from './config';
import { EngineSynth } from './engine';
import { createBuses, createVoiceChain, type Buses } from './graph';
import { SynthKit } from './kit';
import { RateLimiter, VoiceTracker, clamp01, spatialize, type Spatial } from './math';
import { Music } from './music';
import { SFX } from './sfx';
import type { AudioSystem, EngineHandle, EngineParams, EngineVoice, PlayOptions, SfxName } from './types';

type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;

function getAudioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

interface Voice {
  input: GainNode;
  output: AudioNode;
}

interface EngineSlot {
  voice: EngineVoice;
  synth: EngineSynth | null;
}

class WebAudioSystem implements AudioSystem {
  private ctx: AudioContext | null = null;
  private kit: SynthKit | null = null;
  private buses: Buses | null = null;
  private wasUnlocked = false;
  private disposed = false;
  private volumes = { master: 1, sfx: 1, music: 1 };
  private lx = 0;
  private ly = 0;
  private readonly tracker = new VoiceTracker(AUDIO_CONFIG.maxVoices);
  private readonly limiter = new RateLimiter(AUDIO_CONFIG.rateLimitMs, AUDIO_CONFIG.rateLimitOverridesMs);
  private readonly voices = new Map<number, Voice>();
  private nextVoiceId = 1;
  private readonly engines = new Map<number, EngineSlot>();
  private nextEngineId = 1;
  private charge: ChargeTone | null = null;
  private ambience: Ambience | null = null;
  private ambienceWanted: { on: boolean; rain: number; night: boolean } = { on: false, rain: 0, night: false };
  private music: Music | null = null;
  private musicWanted = { on: false, intensity: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly released: number[] = [];
  private readonly stolen: number[] = [];
  private readonly sp: Spatial = { pan: 0, gain: 1 };

  get unlocked(): boolean {
    return this.wasUnlocked && !this.disposed;
  }

  private get live(): boolean {
    return !this.disposed && this.ctx !== null && this.ctx.state === 'running';
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    try {
      if (!this.ctx) {
        const Ctor = getAudioCtor();
        if (!Ctor) return;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.kit = new SynthKit(this.ctx);
        this.buses = createBuses(this.ctx, this.ctx.destination);
        this.applyVolumes();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      // Some WebViews only really start output after a buffer is played inside the gesture.
      const b = this.ctx.createBufferSource();
      b.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      b.connect(this.ctx.destination);
      b.start();
      if (this.ctx.state === 'running') {
        this.wasUnlocked = true;
        this.applyAmbience();
        this.applyMusic();
        this.syncTimer();
      }
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  setVolumes(v: { master: number; sfx: number; music: number }): void {
    this.volumes = { master: clamp01(v.master), sfx: clamp01(v.sfx), music: clamp01(v.music) };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const { ctx, buses } = this;
    if (!ctx || !buses) return;
    try {
      const t = ctx.currentTime;
      const curve = (x: number) => x * x; // perceptual-ish taper
      buses.master.gain.setTargetAtTime(curve(this.volumes.master), t, 0.03);
      buses.sfx.gain.setTargetAtTime(curve(this.volumes.sfx) * AUDIO_CONFIG.mix.sfx, t, 0.03);
      buses.music.gain.setTargetAtTime(curve(this.volumes.music) * AUDIO_CONFIG.mix.music, t, 0.03);
    } catch {
      /* ignore */
    }
  }

  setListener(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      this.lx = x;
      this.ly = y;
    }
  }

  play(name: SfxName, opts?: PlayOptions): void {
    if (!this.live) return;
    try {
      const recipe = SFX[name];
      if (!recipe) return;
      const ctx = this.ctx as AudioContext;
      const kit = this.kit as SynthKit;
      const buses = this.buses as Buses;
      const muffled = opts?.muffled === true;
      let pan = 0;
      let level = muffled ? AUDIO_CONFIG.muffledGain : 1;
      if (opts && opts.x !== undefined && opts.y !== undefined) {
        spatialize(opts.x, opts.y, this.lx, this.ly, muffled, this.sp);
        pan = this.sp.pan;
        level = this.sp.gain;
      }
      if (level < AUDIO_CONFIG.minAudibleGain) return;
      if (!this.limiter.allow(name, nowMs())) return;
      const intensity = opts?.intensity === undefined ? 1 : clamp01(opts.intensity);
      level *= 0.55 + 0.45 * intensity;

      const t = ctx.currentTime + 0.005;
      const chain = createVoiceChain(ctx, buses.sfx, pan, level, muffled);
      const end = recipe(kit, chain.input, t, intensity);
      const id = this.nextVoiceId++;
      this.voices.set(id, chain);
      this.released.length = 0;
      this.stolen.length = 0;
      this.tracker.add(id, t, end + 0.05, this.released, this.stolen);
      this.releaseVoices(t);
    } catch {
      /* never throw from audio */
    }
  }

  private releaseVoices(now: number): void {
    for (const id of this.released) {
      const v = this.voices.get(id);
      this.voices.delete(id);
      if (v) safeDisconnect(v.output);
    }
    for (const id of this.stolen) {
      const v = this.voices.get(id);
      this.voices.delete(id);
      if (!v) continue;
      try {
        const g = v.input.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + AUDIO_CONFIG.stealFadeSec);
      } catch {
        /* ignore */
      }
      setTimeout(() => safeDisconnect(v.output), AUDIO_CONFIG.stealFadeSec * 1000 + 40);
    }
    this.released.length = 0;
    this.stolen.length = 0;
  }

  createEngine(voice: EngineVoice): EngineHandle {
    const id = this.nextEngineId++;
    this.engines.set(id, { voice, synth: null });
    return Object.freeze({ id });
  }

  updateEngine(h: EngineHandle, p: EngineParams): void {
    const slot = this.engines.get(h?.id);
    if (!slot || !this.live) return;
    try {
      if (!slot.synth) slot.synth = new EngineSynth(this.kit as SynthKit, (this.buses as Buses).engine, slot.voice);
      spatialize(p.x, p.y, this.lx, this.ly, p.muffled, this.sp);
      slot.synth.update({ speed: p.speed, load: p.load, pan: this.sp.pan, gain: this.sp.gain, muffled: p.muffled });
    } catch {
      /* ignore */
    }
  }

  destroyEngine(h: EngineHandle): void {
    const slot = this.engines.get(h?.id);
    if (!slot) return;
    this.engines.delete(h.id);
    try {
      slot.synth?.dispose();
    } catch {
      /* ignore */
    }
  }

  chargeStart(): void {
    if (!this.live) return;
    try {
      this.charge?.stop();
      this.charge = new ChargeTone(this.kit as SynthKit, (this.buses as Buses).charge);
    } catch {
      this.charge = null;
    }
  }

  chargeUpdate(level: number, overheating: boolean): void {
    if (!this.charge || !this.live) return;
    try {
      this.charge.update(level, overheating);
    } catch {
      /* ignore */
    }
  }

  chargeStop(): void {
    try {
      this.charge?.stop();
    } catch {
      /* ignore */
    }
    this.charge = null;
  }

  setAmbience(on: boolean, opts?: { rain?: number; night?: boolean }): void {
    this.ambienceWanted = { on, rain: clamp01(opts?.rain ?? 0), night: opts?.night === true };
    this.applyAmbience();
  }

  private applyAmbience(): void {
    if (!this.live) return;
    try {
      const w = this.ambienceWanted;
      if (w.on) {
        if (!this.ambience) this.ambience = new Ambience(this.kit as SynthKit, (this.buses as Buses).ambience);
        this.ambience.set(true, w.rain, w.night);
      } else if (this.ambience) {
        this.ambience.dispose();
        this.ambience = null;
      }
      this.syncTimer();
    } catch {
      /* ignore */
    }
  }

  setMusic(on: boolean, intensity?: number): void {
    this.musicWanted = { on, intensity: intensity === undefined ? this.musicWanted.intensity : clamp01(intensity) };
    this.applyMusic();
  }

  private applyMusic(): void {
    if (!this.live) return;
    try {
      const w = this.musicWanted;
      if (w.on) {
        const fresh = !this.music;
        if (!this.music) this.music = new Music(this.kit as SynthKit, (this.buses as Buses).music);
        this.music.setIntensity(w.intensity, undefined, fresh);
        this.music.start();
      } else if (this.music) {
        this.music.stop();
      }
      this.syncTimer();
    } catch {
      /* ignore */
    }
  }

  /** Runs the lookahead scheduler only while music or ambience need it. */
  private syncTimer(): void {
    const needed = !this.disposed && this.live && (this.ambience !== null || (this.music?.isRunning ?? false));
    if (needed && this.timer === null) {
      this.timer = setInterval(() => this.tick(), AUDIO_CONFIG.schedulerIntervalMs);
      this.tick();
    } else if (!needed && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.live) return;
    try {
      const ctx = this.ctx as AudioContext;
      const until = ctx.currentTime + AUDIO_CONFIG.schedulerLookaheadSec;
      this.music?.scheduleUntil(until);
      if (this.music && !this.music.isRunning) {
        this.music.dispose();
        this.music = null;
      }
      this.ambience?.scheduleUntil(until);
      this.tracker.prune(ctx.currentTime, this.released);
      this.releaseVoices(ctx.currentTime);
      if (!this.ambience && !this.music) this.syncTimer();
    } catch {
      /* ignore */
    }
  }

  suspend(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      void this.ctx?.suspend().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    if (this.disposed || !this.ctx) return;
    try {
      void this.ctx
        .resume()
        .then(() => this.syncTimer())
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    try {
      this.chargeStop();
      for (const [, slot] of this.engines) slot.synth?.dispose();
      this.engines.clear();
      this.ambience?.dispose();
      this.music?.dispose();
      this.tracker.clear();
      this.voices.clear();
      void this.ctx?.close().catch(() => undefined);
    } catch {
      /* ignore */
    }
    this.disposed = true;
    this.ambience = null;
    this.music = null;
    this.ctx = null;
    this.kit = null;
    this.buses = null;
  }
}

function safeDisconnect(n: AudioNode): void {
  try {
    n.disconnect();
  } catch {
    /* already disconnected */
  }
}

export function createWebAudioSystem(): AudioSystem {
  return new WebAudioSystem();
}

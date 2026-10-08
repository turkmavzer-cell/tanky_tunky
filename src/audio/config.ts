/**
 * Tuning constants for the procedural audio system. Pure data; no Web Audio access here so the
 * module can be imported by Node unit tests.
 */
export const AUDIO_CONFIG = {
  /** Isometric half tile width / height in pixels (matches src/world/iso.ts TILE_W/2, TILE_H/2). */
  isoHalfW: 64,
  isoHalfH: 32,
  /** Screen-space horizontal offset (px) that maps to a full left/right pan. */
  panWidthPx: 700,
  /** World distance (tiles) up to which a positional sound plays at full volume. */
  fullVolumeDist: 3,
  /** World distance (tiles) at which a positional sound reaches silence. */
  maxDist: 22,
  /** Shape of the rolloff between fullVolumeDist and maxDist (>1 = falls off faster early). */
  rolloffExponent: 1.6,
  /** Below this computed gain a positional one-shot is skipped entirely (saves a voice). */
  minAudibleGain: 0.004,
  /** Low-pass cutoff (Hz) for "heard through fog" sounds and the volume multiplier applied. */
  muffledCutoffHz: 600,
  muffledGain: 0.7,
  /** Cutoff used by always-present filters when not muffled (effectively open). */
  openCutoffHz: 18000,
  /** Maximum simultaneous one-shot voices; the oldest is stolen beyond that. */
  maxVoices: 24,
  /** Fade applied to a stolen voice (seconds). */
  stealFadeSec: 0.02,
  /** Default minimum interval between two identical sfx (ms) and per-sound overrides. */
  rateLimitMs: 30,
  rateLimitOverridesMs: {
    hit_metal: 30,
    hit_wall: 35,
    ricochet: 60,
    shell_whistle: 120,
    ui_click: 25,
    alarm: 400,
    notify: 150,
    victory: 1500,
    defeat: 1500,
    reload_ready: 80,
    shield_hit: 40,
  } as Readonly<Record<string, number>>,
  /** Smoothing time constant (s) for engine/charge parameter updates (setTargetAtTime). */
  paramSmoothing: 0.06,
  /** Background scheduler (music + ambience lookahead). */
  schedulerIntervalMs: 50,
  schedulerLookaheadSec: 0.3,
  /** Mix levels (linear gain). */
  mix: {
    sfx: 0.9,
    music: 0.32,
    ambience: 0.55,
    engine: 0.42,
    charge: 0.26,
  },
  music: {
    bpm: 96,
    /** Equal-power crossfade time when intensity changes (s). */
    crossfadeSec: 1.2,
    fadeSec: 1.5,
  },
} as const;

export type AudioConfig = typeof AUDIO_CONFIG;

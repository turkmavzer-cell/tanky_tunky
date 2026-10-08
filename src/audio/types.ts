/** Public audio types (re-exported from src/audio/index.ts). */
export type SfxName =
  | 'fire_light' | 'fire_medium' | 'fire_heavy' | 'fire_artillery' | 'fire_charged'
  | 'perfect_charge' | 'overheat' | 'reload_ready'
  | 'explosion_small' | 'explosion_big' | 'hit_metal' | 'hit_wall' | 'ricochet' | 'shell_whistle'
  | 'destroy_tank' | 'wall_break' | 'crate_break'
  | 'dash' | 'shield_up' | 'shield_hit' | 'siege_on' | 'siege_off'
  | 'trap_place' | 'trap_trigger' | 'mine_explode' | 'alarm' | 'hologram' | 'smoke_bomb' | 'mud_splash'
  | 'ui_click' | 'ui_back' | 'ui_confirm' | 'notify' | 'victory' | 'defeat';

export type EngineVoice = 'scout' | 'heavy' | 'standard' | 'artillery' | 'trapper';

export interface PlayOptions {
  /** world position in tile units; omit for non-positional (UI) */
  x?: number;
  y?: number;
  /** 0..1 scales loudness/pitch/size where meaningful (e.g. charge level) */
  intensity?: number;
  /** low-pass "heard through fog" */
  muffled?: boolean;
}

export interface EngineHandle {
  readonly id: number;
}

export interface EngineParams {
  x: number;
  y: number;
  /** 0..1 */
  speed: number;
  /** 0..1 throttle/load (accelerating, charging) */
  load: number;
  muffled: boolean;
}

export interface AudioSystem {
  /** Must be called from a user gesture (first tap) to start the AudioContext; safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  setVolumes(v: { master: number; sfx: number; music: number }): void; // each 0..1
  /** Listener position in world tile units (usually the camera target / player tank). */
  setListener(x: number, y: number): void;
  play(name: SfxName, opts?: PlayOptions): void;
  createEngine(voice: EngineVoice): EngineHandle;
  updateEngine(h: EngineHandle, p: EngineParams): void;
  destroyEngine(h: EngineHandle): void;
  /** Charge tone for the local player: call start once, update every frame with level 0..1, stop on release. */
  chargeStart(): void;
  chargeUpdate(level: number, overheating: boolean): void;
  chargeStop(): void;
  setAmbience(on: boolean, opts?: { rain?: number; night?: boolean }): void;
  setMusic(on: boolean, intensity?: number /* 0 calm .. 1 combat */): void;
  /** Suspend/resume on app pause (Capacitor). */
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export const SFX_NAMES: readonly SfxName[] = [
  'fire_light', 'fire_medium', 'fire_heavy', 'fire_artillery', 'fire_charged',
  'perfect_charge', 'overheat', 'reload_ready',
  'explosion_small', 'explosion_big', 'hit_metal', 'hit_wall', 'ricochet', 'shell_whistle',
  'destroy_tank', 'wall_break', 'crate_break',
  'dash', 'shield_up', 'shield_hit', 'siege_on', 'siege_off',
  'trap_place', 'trap_trigger', 'mine_explode', 'alarm', 'hologram', 'smoke_bomb', 'mud_splash',
  'ui_click', 'ui_back', 'ui_confirm', 'notify', 'victory', 'defeat',
];

export const ENGINE_VOICES: readonly EngineVoice[] = ['scout', 'heavy', 'standard', 'artillery', 'trapper'];

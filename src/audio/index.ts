/**
 * Procedural audio (Web Audio API only: no files, no network, no libraries).
 *
 * Public contract used by the game integrator. Positional model: world tile offset from the
 * listener → isometric screen offset → stereo pan; world distance → attenuation (see config.ts).
 */
import { createWebAudioSystem } from './system';
import { createSilentAudio as createSilent } from './silent';
import type { AudioSystem } from './types';

export type { SfxName, EngineVoice, PlayOptions, EngineHandle, EngineParams, AudioSystem } from './types';
export { SFX_NAMES, ENGINE_VOICES } from './types';

export function createAudioSystem(): AudioSystem {
  return createWebAudioSystem();
}

/** Null implementation with the same interface (for headless/tests). */
export function createSilentAudio(): AudioSystem {
  return createSilent();
}

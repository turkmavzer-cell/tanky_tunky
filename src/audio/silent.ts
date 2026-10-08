/** Null AudioSystem: same interface, does nothing, never throws (headless runs, tests, no Web Audio). */
import type { AudioSystem, EngineHandle } from './types';

export function createSilentAudio(): AudioSystem {
  let nextId = 1;
  const noop = (): void => undefined;
  return {
    unlock: () => Promise.resolve(),
    get unlocked() {
      return false;
    },
    setVolumes: noop,
    setListener: noop,
    play: noop,
    createEngine: (): EngineHandle => Object.freeze({ id: nextId++ }),
    updateEngine: noop,
    destroyEngine: noop,
    chargeStart: noop,
    chargeUpdate: noop,
    chargeStop: noop,
    setAmbience: noop,
    setMusic: noop,
    suspend: noop,
    resume: noop,
    dispose: noop,
  };
}

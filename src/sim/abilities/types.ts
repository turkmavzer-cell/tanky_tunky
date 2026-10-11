import type { Rng } from '../rng';
import type { SimState, Tank } from '../state';

export interface AbilityContext {
  s: SimState;
  t: Tank;
  rng: Rng;
  dt: number;
}

/** Behaviour module of one ability. Data lives in data/abilities.json. */
export interface AbilityModule {
  /** How long the effect lasts once activated (default: param "duration"). 0 = instant. */
  effectDuration?(t: Tank): number;
  /** Called on activation; return false to refuse (nothing happens, no cooldown). */
  activate(c: AbilityContext): boolean;
  /** Called every tick while active. */
  update?(c: AbilityContext): void;
  /** Called when the effect ends (timer ran out or ended early). */
  end?(c: AbilityContext): void;
  /** Called when the owner fires a normal shot. */
  onFire?(c: AbilityContext): void;
  /** Movement speed multiplier while active. */
  speedMul?(t: Tank): number;
  /** Fire-rate multiplier while active (cooldown is divided by it). */
  fireRateMul?(t: Tank): number;
  /** Charge-time multiplier while active. */
  chargeTimeMul?(t: Tank): number;
  /** False while normal firing is blocked. */
  canFire?(t: Tank): boolean;
}

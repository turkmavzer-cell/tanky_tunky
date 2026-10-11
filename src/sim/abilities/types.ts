import type { Rng } from '../rng';
import type { AbilityState, SimState, Tank } from '../state';

export interface AbilityContext {
  s: SimState;
  t: Tank;
  /** The slot being run (skill = t.ability, ultimate = t.ult). */
  a: AbilityState;
  rng: Rng;
  dt: number;
}

/** Shot requested by an ability that fires instantly (Artillery Hazır Atış). */
export interface InstantShot {
  /** Charge level used for damage / blast radius (0..1). */
  power: number;
  /** Charge level used for the landing distance (artillery) / range. */
  reach: number;
}

/** Behaviour module of one ability. Data lives in data/abilities.json. */
export interface AbilityModule {
  /** How long the effect lasts once activated (default: param "duration"). 0 = instant. */
  effectDuration?(a: AbilityState): number;
  /** Called on activation; return false to refuse (nothing happens, no cooldown). */
  activate(c: AbilityContext): boolean;
  /** Called every tick while active. */
  update?(c: AbilityContext): void;
  /** Called when the effect ends (timer ran out or ended early). */
  end?(c: AbilityContext): void;
  /** Called when the owner fires a normal shot. */
  onFire?(c: AbilityContext): void;
  /** Movement speed multiplier while active. */
  speedMul?(a: AbilityState): number;
  /** Fire-rate multiplier while active (cooldown is divided by it). */
  fireRateMul?(a: AbilityState): number;
  /** Charge-time multiplier while active. */
  chargeTimeMul?(a: AbilityState): number;
  /** False while normal firing is blocked. */
  canFire?(a: AbilityState): boolean;
  /** While active, a fire press shoots at once with this power/reach and ends the ability. */
  instantShot?(a: AbilityState): InstantShot | null;
}

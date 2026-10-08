/**
 * Ability/stat parameter resolution. Base values come from data files; upgrades (the ability
 * trees of the next round) are `Modifier`s applied in order: set → add → mul.
 */
import { ABILITIES, evalCurve, type AbilityId, type Curve } from '../config';
import type { Modifier, SimState, Tank } from '../state';

export function applyMods(base: number, key: string, mods: readonly Modifier[]): number {
  let v = base;
  for (const m of mods) if (m.key === key && m.op === 'set') v = m.value;
  for (const m of mods) if (m.key === key && m.op === 'add') v += m.value;
  for (const m of mods) if (m.key === key && m.op === 'mul') v *= m.value;
  return v;
}

/** Numeric ability parameter of the tank's ability, with its upgrade modifiers. */
export function abilityParam(t: Tank, key: string): number {
  const raw = ABILITIES[t.ability.id][key];
  return applyMods(typeof raw === 'number' ? raw : 0, key, t.ability.mods);
}

export function abilityCurve(id: AbilityId, key: string): Curve {
  return ABILITIES[id][key] as Curve;
}

export function curveAt(id: AbilityId, key: string, x: number): number {
  return evalCurve(abilityCurve(id, key), x);
}

/** Cooldown after the effect ends, including the dev "cooldown multiplier" (0.1x–3x). */
export function cooldownOf(s: SimState, t: Tank): number {
  const mul = Math.min(3, Math.max(0.1, s.rules.cooldownMul));
  return abilityParam(t, 'cooldown') * mul;
}

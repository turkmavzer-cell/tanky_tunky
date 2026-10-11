/** Ability dispatcher: activation, timers, cooldowns and stat hooks. */
import type { AbilityId } from '../config';
import type { Rng } from '../rng';
import type { AbilityState, SimState, Tank } from '../state';
import { abilityParam, cooldownOf } from './params';
import type { AbilityModule } from './types';
import { hide } from './hide';
import { rumble } from './rumble';
import { swift } from './swift';
import { barrage } from './barrage';
import { mine } from './mine';

export const ABILITY_MODULES: Readonly<Record<AbilityId, AbilityModule>> = { hide, rumble, swift, barrage, mine };

export function newAbilityState(id: AbilityId): AbilityState {
  return { id, active: 0, cooldown: 0, elapsed: 0, counter: 0, tx: 0, ty: 0, mods: [] };
}

function mod(t: Tank): AbilityModule {
  return ABILITY_MODULES[t.ability.id];
}

export function isAbilityActive(t: Tank): boolean {
  return t.ability.active > 0;
}

export function endAbility(s: SimState, t: Tank, rng: Rng): void {
  const a = t.ability;
  a.active = 0;
  mod(t).end?.({ s, t, rng, dt: 0 });
  a.cooldown = cooldownOf(s, t);
  s.events.push({ type: 'ability', tank: t.id, id: a.id, phase: 'end' });
}

/** Per tick: advance timers, handle a press (rising edge) of the ability button. */
export function tickAbility(s: SimState, t: Tank, pressed: boolean, rng: Rng, dt: number): void {
  const a = t.ability;
  const m = mod(t);
  if (a.active > 0) {
    a.elapsed += dt;
    m.update?.({ s, t, rng, dt });
    a.active -= dt;
    if (a.active <= 0) endAbility(s, t, rng);
    return;
  }
  if (a.cooldown > 0) a.cooldown = Math.max(0, a.cooldown - dt);
  if (!pressed || a.cooldown > 0 || !t.alive) return;
  a.elapsed = 0;
  a.counter = 0;
  if (!m.activate({ s, t, rng, dt })) return;
  const dur = m.effectDuration ? m.effectDuration(t) : abilityParam(t, 'duration');
  s.events.push({ type: 'ability', tank: t.id, id: a.id, phase: 'start' });
  if (dur <= 0) {
    endAbility(s, t, rng);
  } else {
    a.active = dur;
    m.update?.({ s, t, rng, dt: 0 });
  }
}

/** Notifies the ability that its owner fired; ends Hide immediately. */
export function abilityOnFire(s: SimState, t: Tank, rng: Rng): void {
  if (t.ability.active <= 0) return;
  const m = mod(t);
  if (!m.onFire) return;
  m.onFire({ s, t, rng, dt: 0 });
  if (t.ability.active <= 0) endAbility(s, t, rng);
}

export function abilitySpeedMul(t: Tank): number {
  return t.ability.active > 0 ? (mod(t).speedMul?.(t) ?? 1) : 1;
}
export function abilityFireRateMul(t: Tank): number {
  return t.ability.active > 0 ? (mod(t).fireRateMul?.(t) ?? 1) : 1;
}
export function abilityChargeTimeMul(t: Tank): number {
  return t.ability.active > 0 ? (mod(t).chargeTimeMul?.(t) ?? 1) : 1;
}
export function abilityAllowsFire(t: Tank): boolean {
  return t.ability.active > 0 ? (mod(t).canFire?.(t) ?? true) : true;
}

/** Reset on respawn: all cooldowns cleared (round-01 job 4). */
export function resetAbility(t: Tank): void {
  const a = t.ability;
  a.active = 0;
  a.cooldown = 0;
  a.elapsed = 0;
  a.counter = 0;
}

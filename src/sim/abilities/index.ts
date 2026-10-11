/** Ability dispatcher: two slots per tank (skill + ultimate): activation, timers, cooldowns and stat hooks. */
import type { AbilityId } from '../config';
import type { Rng } from '../rng';
import type { AbilityState, SimState, Tank } from '../state';
import { abilityParam, cooldownOf } from './params';
import type { AbilityModule, InstantShot } from './types';
import { hide } from './hide';
import { rumble } from './rumble';
import { swift } from './swift';
import { barrage } from './barrage';
import { mine } from './mine';
import { overdrive } from './overdrive';
import { repair } from './repair';
import { emp } from './emp';
import { readyshot } from './readyshot';

export const ABILITY_MODULES: Readonly<Record<AbilityId, AbilityModule>> = { hide, rumble, swift, barrage, mine, overdrive, repair, emp, readyshot };

export function newAbilityState(id: AbilityId): AbilityState {
  return { id, active: 0, cooldown: 0, elapsed: 0, counter: 0, tx: 0, ty: 0, mods: [] };
}

function mod(a: AbilityState): AbilityModule {
  return ABILITY_MODULES[a.id];
}

/** The tank's ability slots: [skill, ultimate?]. */
export function slotsOf(t: Tank): AbilityState[] {
  return t.ult ? [t.ability, t.ult] : [t.ability];
}

export function isAbilityActive(t: Tank): boolean {
  return t.ability.active > 0 || (t.ult !== null && t.ult.active > 0);
}

export function endAbility(s: SimState, t: Tank, a: AbilityState, rng: Rng): void {
  a.active = 0;
  mod(a).end?.({ s, t, a, rng, dt: 0 });
  a.cooldown = cooldownOf(s, a);
  s.events.push({ type: 'ability', tank: t.id, id: a.id, phase: 'end' });
}

function tickSlot(s: SimState, t: Tank, a: AbilityState, pressed: boolean, rng: Rng, dt: number): void {
  const m = mod(a);
  if (a.active > 0) {
    a.elapsed += dt;
    m.update?.({ s, t, a, rng, dt });
    a.active -= dt;
    if (a.active <= 0) endAbility(s, t, a, rng);
    return;
  }
  if (a.cooldown > 0) a.cooldown = Math.max(0, a.cooldown - dt);
  if (!pressed || a.cooldown > 0 || !t.alive || t.stun > 0) return;
  a.elapsed = 0;
  a.counter = 0;
  if (!m.activate({ s, t, a, rng, dt })) return;
  const dur = m.effectDuration ? m.effectDuration(a) : abilityParam(a, 'duration');
  s.events.push({ type: 'ability', tank: t.id, id: a.id, phase: 'start' });
  if (dur <= 0) {
    endAbility(s, t, a, rng);
  } else {
    a.active = dur;
    m.update?.({ s, t, a, rng, dt: 0 });
  }
}

/** Per tick: advance timers of both slots, handle presses (rising edge) of the skill and ultimate buttons. */
export function tickAbility(s: SimState, t: Tank, skillPressed: boolean, ultPressed: boolean, rng: Rng, dt: number): void {
  tickSlot(s, t, t.ability, skillPressed, rng, dt);
  if (t.ult) tickSlot(s, t, t.ult, ultPressed, rng, dt);
}

/** Notifies active abilities that their owner fired a normal shot (Hide ends). */
export function abilityOnFire(s: SimState, t: Tank, rng: Rng): void {
  for (const a of slotsOf(t)) {
    if (a.active <= 0) continue;
    const m = mod(a);
    if (!m.onFire) continue;
    m.onFire({ s, t, a, rng, dt: 0 });
    if (a.active <= 0) endAbility(s, t, a, rng);
  }
}

export function abilitySpeedMul(t: Tank): number {
  let v = 1;
  for (const a of slotsOf(t)) if (a.active > 0) v *= mod(a).speedMul?.(a) ?? 1;
  return v;
}
export function abilityFireRateMul(t: Tank): number {
  let v = 1;
  for (const a of slotsOf(t)) if (a.active > 0) v *= mod(a).fireRateMul?.(a) ?? 1;
  return v;
}
export function abilityChargeTimeMul(t: Tank): number {
  let v = 1;
  for (const a of slotsOf(t)) if (a.active > 0) v *= mod(a).chargeTimeMul?.(a) ?? 1;
  return v;
}
export function abilityAllowsFire(t: Tank): boolean {
  for (const a of slotsOf(t)) if (a.active > 0 && mod(a).canFire?.(a) === false) return false;
  return true;
}

/** An active ability that wants the next fire press to shoot at once (Hazır Atış). */
export function abilityInstantShot(t: Tank): { slot: AbilityState; shot: InstantShot } | null {
  for (const a of slotsOf(t)) {
    if (a.active <= 0) continue;
    const shot = mod(a).instantShot?.(a);
    if (shot) return { slot: a, shot };
  }
  return null;
}

/** Reset on respawn: all cooldowns cleared (round-01 job 4). */
export function resetAbility(t: Tank): void {
  for (const a of slotsOf(t)) {
    a.active = 0;
    a.cooldown = 0;
    a.elapsed = 0;
    a.counter = 0;
  }
  t.stun = 0;
}

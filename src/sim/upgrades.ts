/**
 * Round 03: crate upgrades and out-of-combat regeneration (data: combat.json → upgrades / regen).
 *
 * - A destroyed crate drops a pickup on its tile and rebuilds itself after `crateRespawn` s.
 * - Driving over a pickup adds one upgrade: +perPickup max hp (current hp grows by the same amount)
 *   and +perPickup damage dealt, up to `max` upgrades. Upgrades are lost on death.
 * - A tank that has neither taken nor dealt damage nor fired for `outOfCombat` s heals
 *   `amount` × max hp, then again every `interval` s.
 */
import { COMBAT, TANKS } from './config';
import type { SimState, Tank } from './state';
import { Feature } from '../world/terrain';
import { setFeature } from '../world/map';

const UP = COMBAT.upgrades;
const REGEN = COMBAT.regen;

/** Max hp including collected upgrades. */
export function maxHp(t: Tank): number {
  return TANKS[t.cls].hp * (1 + t.upgrades * UP.perPickup);
}

/** Multiplier on all damage this tank deals (shells, abilities, mines). */
export function damageMul(t: Tank): number {
  return 1 + t.upgrades * UP.perPickup;
}

/** Combat activity (took/dealt damage or fired): regeneration waits again. */
export function markCombat(t: Tank): void {
  t.combatT = 0;
  t.regenNext = REGEN.outOfCombat;
}

/** Fresh life: no upgrades, full base hp, regeneration timer reset. */
export function resetUpgrades(t: Tank): void {
  t.upgrades = 0;
  t.hp = TANKS[t.cls].hp;
  markCombat(t);
}

/** Called when a destructible feature at (x, y) was destroyed; `was` is its feature id before. */
export function onFeatureDestroyed(s: SimState, x: number, y: number, was: number): void {
  if (was !== Feature.Crate) return;
  const id = s.nextId++;
  s.pickups.push({ id, x: x + 0.5, y: y + 0.5 });
  s.crateRespawns.push({ x, y, t: UP.crateRespawn });
  s.events.push({ type: 'pickupSpawn', id, x: x + 0.5, y: y + 0.5 });
}

/** Pickup collection + crate rebuilding (once per tick, after movement). */
export function updatePickups(s: SimState, dt: number): void {
  const r = UP.pickupRadius;
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const p = s.pickups[i];
    for (const t of s.tanks) {
      if (!t.alive || t.upgrades >= UP.max) continue;
      const rr = r + TANKS[t.cls].radius;
      if ((t.x - p.x) * (t.x - p.x) + (t.y - p.y) * (t.y - p.y) > rr * rr) continue;
      t.upgrades++;
      t.hp += TANKS[t.cls].hp * UP.perPickup;
      s.pickups.splice(i, 1);
      s.events.push({ type: 'pickup', tank: t.id, x: p.x, y: p.y, level: t.upgrades });
      break;
    }
  }
  const m = s.map;
  for (let i = s.crateRespawns.length - 1; i >= 0; i--) {
    const c = s.crateRespawns[i];
    c.t -= dt;
    if (c.t > 0) continue;
    const blocked =
      m.feature[c.y * m.width + c.x] !== Feature.None ||
      s.tanks.some((t) => t.alive && Math.abs(t.x - (c.x + 0.5)) < 1 && Math.abs(t.y - (c.y + 0.5)) < 1) ||
      s.pickups.some((p) => Math.floor(p.x) === c.x && Math.floor(p.y) === c.y);
    if (blocked) continue; // try again next tick
    setFeature(m, c.x, c.y, Feature.Crate);
    m.version++;
    s.crateRespawns.splice(i, 1);
    s.events.push({ type: 'crateRespawn', x: c.x, y: c.y });
  }
}

/** Out-of-combat regeneration for one tank (alive, during play). */
export function updateRegen(s: SimState, t: Tank, dt: number): void {
  t.combatT += dt;
  if (t.combatT < t.regenNext) return;
  t.regenNext += REGEN.interval;
  const max = maxHp(t);
  if (t.hp >= max) return;
  const amount = Math.min(max - t.hp, max * REGEN.amount);
  t.hp += amount;
  s.events.push({ type: 'regen', tank: t.id, amount });
}

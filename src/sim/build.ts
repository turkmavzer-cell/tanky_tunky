/**
 * Tower building (round 09). A human tank presses BTN_BUILD: the nearest free dormant tower slot of its team
 * is raised a few tiles ahead of the hull, if that spot is inside the team's own zone, free of other tanks
 * and every tile around it is open. A cooldown limits the pace; the number of slots limits the total.
 */
import buildJson from '../data/build.json';
import { isTileOpen } from '../world/passability';
import { TANKS, isPve } from './config';
import { BTN_BUILD, type PlayerInput } from './input';
import type { SimState, Tank } from './state';
import { dcos, dsin } from './dmath';

export const BUILD = buildJson;

/** Is (x, y) in the team's own half: clearly closer to its base than to the enemy base? */
export function inOwnZone(s: SimState, team: number, x: number, y: number): boolean {
  const own = s.map.bases[team];
  const foe = s.map.bases[1 - team];
  if (!own || !foe) return false;
  const dOwn = Math.sqrt((x - own.x) * (x - own.x) + (y - own.y) * (y - own.y));
  const dFoe = Math.sqrt((x - foe.x) * (x - foe.x) + (y - foe.y) * (y - foe.y));
  return dOwn + BUILD.zoneMargin < dFoe;
}

function fail(s: SimState, t: Tank, reason: 'cooldown' | 'zone' | 'blocked' | 'limit'): void {
  s.events.push({ type: 'buildFail', tank: t.id, reason });
}

/** Handles BTN_BUILD presses (rising edge) and ticks the build cooldowns. */
export function updateBuild(s: SimState, inputs: readonly PlayerInput[], dt: number): void {
  if (s.rules.mode !== 'campaign') return;
  for (const t of s.tanks) {
    t.buildCd = Math.max(0, t.buildCd - dt);
    const held = !!inputs[t.id] && (inputs[t.id].buttons & BTN_BUILD) !== 0;
    const press = held && !t.buildHeld;
    t.buildHeld = held;
    if (!press || !t.alive || isPve(t.cls) || t.team !== 0) continue;
    tryBuild(s, t);
  }
}

export function tryBuild(s: SimState, b: Tank): boolean {
  if (b.buildCd > 0) {
    fail(s, b, 'cooldown');
    return false;
  }
  const slot = s.tanks.find((o) => o.team === b.team && o.cls === 'tower' && o.reserve && !o.alive);
  if (!slot) {
    fail(s, b, 'limit');
    return false;
  }
  const x = Math.floor(b.x + dcos(b.hull) * BUILD.ahead) + 0.5;
  const y = Math.floor(b.y + dsin(b.hull) * BUILD.ahead) + 0.5;
  if (!inOwnZone(s, b.team, x, y)) {
    fail(s, b, 'zone');
    return false;
  }
  const c = BUILD.clearance;
  for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) if (!isTileOpen(s.map, Math.floor(x) + dx, Math.floor(y) + dy)) {
    fail(s, b, 'blocked');
    return false;
  }
  for (const o of s.tanks) {
    if (!o.alive) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    if (dx * dx + dy * dy < BUILD.minGap * BUILD.minGap) {
      fail(s, b, 'blocked');
      return false;
    }
  }
  slot.alive = true;
  slot.x = x;
  slot.y = y;
  slot.hp = TANKS.tower.hp * slot.boost.hp;
  slot.protect = BUILD.buildTime;
  slot.target = -1;
  slot.cooldown = 1;
  slot.lastHitBy = -1;
  slot.combatT = 0;
  b.buildCd = BUILD.cooldown;
  s.events.push({ type: 'build', tank: slot.id, builder: b.id, x, y });
  return true;
}

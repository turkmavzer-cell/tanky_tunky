/**
 * Trapper — MAYIN / Mine: after a short `placeTime` (can move meanwhile) drops a mine behind the
 * tank. At most `maxActive` per owner (placing more removes the oldest). Arms after `armTime`;
 * an enemy tank touching it triggers a big explosion with knockback, credited to the owner.
 * Invisible to enemies except a faint glimmer within `glimmerRange` (render-side, fog rules apply).
 */
import { ABILITIES, TANKS } from '../config';
import { clamp, dcos, dsin } from '../dmath';
import { explode, nextId } from '../combat';
import { abilityParam } from './params';
import type { AbilityModule } from './types';
import type { SimState } from '../state';
import { isTileOpen } from '../../world/passability';

export const mine: AbilityModule = {
  effectDuration: (t) => abilityParam(t, 'placeTime'),
  activate: () => true,
  end: ({ s, t }) => {
    if (!t.alive) return;
    const back = TANKS[t.cls].radius + 0.35;
    let x = clamp(t.x - dcos(t.hull) * back, 0.3, s.map.width - 0.3);
    let y = clamp(t.y - dsin(t.hull) * back, 0.3, s.map.height - 0.3);
    if (!isTileOpen(s.map, Math.floor(x), Math.floor(y))) {
      x = t.x;
      y = t.y;
    }
    const own = s.mines.filter((m) => m.owner === t.id);
    const max = abilityParam(t, 'maxActive');
    if (own.length >= max) {
      // remove the oldest of this owner's mines (lowest id)
      let oldest = own[0];
      for (const m of own) if (m.id < oldest.id) oldest = m;
      s.mines.splice(s.mines.indexOf(oldest), 1);
    }
    s.mines.push({ id: nextId(s), owner: t.id, team: t.team, x, y, arm: abilityParam(t, 'armTime') });
  },
};

/** Arms and triggers mines. Called once per tick from sim.step. */
export function updateMines(s: SimState, dt: number): void {
  const def = ABILITIES.mine;
  for (let i = s.mines.length - 1; i >= 0; i--) {
    const m = s.mines[i];
    if (m.arm > 0) {
      m.arm -= dt;
      if (m.arm <= 0) s.events.push({ type: 'mineArmed', mine: m.id });
      continue;
    }
    const owner = s.tanks[m.owner];
    const trigger = Number(def.triggerRadius);
    for (const t of s.tanks) {
      if (!t.alive || t.team === m.team) continue;
      const r = trigger + TANKS[t.cls].radius;
      if ((t.x - m.x) * (t.x - m.x) + (t.y - m.y) * (t.y - m.y) > r * r) continue;
      s.mines.splice(i, 1);
      explode(s, {
        x: m.x,
        y: m.y,
        radius: owner ? abilityParam(owner, 'radius') : Number(def.radius),
        damage: owner ? abilityParam(owner, 'damage') : Number(def.damage),
        splash: 0.6,
        knockback: owner ? abilityParam(owner, 'knockback') : Number(def.knockback),
        owner: m.owner,
        team: m.team,
        direct: t.id,
        charge: 1,
        kind: 'mine',
        cause: 'mine',
        terrainDamage: 0,
      });
      break;
    }
  }
}

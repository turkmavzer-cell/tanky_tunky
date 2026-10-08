/**
 * Heavy — GÜMBÜRTÜ / Rumble: instant ground shockwave around the tank. Damage falls off with
 * distance (curve), knocks tanks back, damages destructibles. Does not pass walls or elevation
 * changes (clearGroundPath). Knockback goes through normal movement collision, so it can never
 * push a tank into deep water or off a cliff (DECISIONS D-018).
 */
import { TANKS } from '../config';
import { applyDamage, clearGroundPath, damageTerrainDisc } from '../combat';
import { abilityParam, curveAt } from './params';
import type { AbilityModule } from './types';

export const rumble: AbilityModule = {
  activate: ({ s, t }) => {
    const radius = abilityParam(t, 'radius');
    const damage = abilityParam(t, 'damage');
    const kb = abilityParam(t, 'knockback');
    s.events.push({ type: 'explode', x: t.x, y: t.y, radius, charge: 0.5, kind: 'rumble', owner: t.id });
    for (const e of s.tanks) {
      if (!e.alive || e.team === t.team) continue;
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = radius + TANKS[e.cls].radius;
      if (d > reach || !clearGroundPath(s, t.x, t.y, e.x, e.y)) continue;
      const f = curveAt('rumble', 'falloff', Math.min(1, d / reach));
      applyDamage(s, e, damage * f, t.id, e.x, e.y, 'rumble');
      if (d > 1e-6 && e.protect <= 0) {
        e.kx += (dx / d) * kb * f;
        e.ky += (dy / d) * kb * f;
      }
    }
    damageTerrainDisc(s, t.x, t.y, radius, abilityParam(t, 'terrainDamage'));
    return true;
  },
};

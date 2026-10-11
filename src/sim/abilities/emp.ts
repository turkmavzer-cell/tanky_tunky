/**
 * Standard ULT — EMP: electromagnetic pulse. Every enemy within `radius` (line of ground, like Rumble's wave
 * is NOT required: it is a field) is stunned for `stun` seconds: it cannot move, fire or use abilities.
 * Spawn-protected and invisible (Hide) tanks are still stunned if inside the radius.
 */
import { TANKS } from '../config';
import type { AbilityModule } from './types';
import { abilityParam } from './params';

export const emp: AbilityModule = {
  activate: ({ s, t, a }) => {
    const radius = abilityParam(a, 'radius');
    const stun = abilityParam(a, 'stun');
    s.events.push({ type: 'explode', x: t.x, y: t.y, radius, charge: 0.5, kind: 'emp', owner: t.id });
    for (const e of s.tanks) {
      if (!e.alive || e.team === t.team) continue;
      const d = Math.sqrt((e.x - t.x) * (e.x - t.x) + (e.y - t.y) * (e.y - t.y));
      if (d > radius + TANKS[e.cls].radius) continue;
      if (e.protect > 0) continue;
      e.stun = Math.max(e.stun, stun);
      e.charging = false;
      e.chargeT = e.fullT = 0;
    }
    return true;
  },
};

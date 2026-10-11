/**
 * Artillery — YAYLIM ATEŞİ / Barrage: `shots` shells, one every `interval` s, at the locked
 * visible target (or a point ahead). Each lands within `scatter` tiles (seeded RNG) and its
 * landing spot is announced to everyone (warning circle). The tank moves at (1 - moveSlow)
 * speed and cannot fire normally while it lasts.
 */
import { clamp, dcos, dsin } from '../dmath';
import { nextId } from '../combat';
import { canSeeTank } from '../visibility';
import { selectTarget } from '../targeting';
import { abilityParam } from './params';
import type { AbilityModule } from './types';
import type { Shell } from '../state';

export const barrage: AbilityModule = {
  activate: ({ s, t }) => {
    const a = t.ability;
    // same selection as auto-aim (works for bots and manual-aim players too)
    const id = selectTarget(s, t, t.target);
    const tgt = id >= 0 ? s.tanks[id] : null;
    a.counter = 0;
    if (tgt) {
      a.tx = tgt.x;
      a.ty = tgt.y;
    } else {
      const d = abilityParam(t, 'fallbackDistance');
      a.tx = clamp(t.x + dcos(t.turret) * d, 0.5, s.map.width - 0.5);
      a.ty = clamp(t.y + dsin(t.turret) * d, 0.5, s.map.height - 0.5);
    }
    return true;
  },
  update: ({ s, t, rng }) => {
    const a = t.ability;
    const shots = abilityParam(t, 'shots');
    const interval = abilityParam(t, 'interval');
    // follow the target while it stays visible
    const tid = selectTarget(s, t, t.target);
    const tgt = tid >= 0 ? s.tanks[tid] : null;
    if (tgt && canSeeTank(s, t.team, tgt)) {
      a.tx = tgt.x;
      a.ty = tgt.y;
    }
    while (a.counter < shots && a.elapsed >= a.counter * interval) {
      a.counter++;
      // uniform point in a disc of radius `scatter`
      const ang = rng.range(-3.141592653589793, 3.141592653589793);
      const r = abilityParam(t, 'scatter') * Math.sqrt(rng.next());
      const tx = clamp(a.tx + dcos(ang) * r, 0.2, s.map.width - 0.2);
      const ty = clamp(a.ty + dsin(ang) * r, 0.2, s.map.height - 0.2);
      const flight = abilityParam(t, 'flightTime');
      const shell: Shell = {
        id: nextId(s),
        owner: t.id,
        team: t.team,
        kind: 'artillery',
        x: t.x,
        y: t.y,
        vx: 0,
        vy: 0,
        dist: 0,
        damage: abilityParam(t, 'damage'),
        radius: abilityParam(t, 'radius'),
        bounces: 0,
        level: 0,
        charge: 0.5,
        perfect: false,
        ignore: -1,
        sx: t.x,
        sy: t.y,
        tx,
        ty,
        t: 0,
        flight,
        arc: 2.6,
        warn: true,
        cause: 'barrage',
      };
      s.shells.push(shell);
      s.events.push({ type: 'fire', tank: t.id, x: t.x, y: t.y, angle: t.turret, charge: 0.5, perfect: false, kind: 'artillery' });
    }
  },
  speedMul: (t) => 1 - abilityParam(t, 'moveSlow'),
  canFire: () => false,
};

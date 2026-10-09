/**
 * Auto turret targeting (round-01 job 1) — used identically by the player and by bots.
 * Candidates come ONLY from the VisibilitySystem (`canSeeTank`): hidden, fogged or invisible
 * (Hide) enemies are never locked. Hysteresis: a new candidate must be `switchRatio` times
 * closer than the current lock; the lock is kept while the target stays visible.
 */
import { COMBAT, TANKS, evalCurve } from './config';
import { datan2 } from './dmath';
import type { SimState, Tank } from './state';
import { canSeeTank } from './visibility';

/** Target selection shared by the player's auto-aim and bots: returns the tank id to lock or -1. */
export function selectTarget(s: SimState, t: Tank, currentId: number): number {
  let cur: Tank | null = currentId >= 0 ? s.tanks[currentId] : null;
  if (cur && !canSeeTank(s, t.team, cur)) cur = null;
  const curD = cur ? dist2(t, cur) : Infinity;
  let best: Tank | null = null;
  let bestD = Infinity;
  for (const e of s.tanks) {
    if (e.team === t.team || !canSeeTank(s, t.team, e)) continue;
    const d = dist2(t, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  const r = COMBAT.targeting.switchRatio;
  if (cur && best && best !== cur && Math.sqrt(bestD) < r * Math.sqrt(curD)) return best.id;
  if (cur) return cur.id;
  return best ? best.id : -1;
}

export function updateTarget(s: SimState, t: Tank): void {
  t.target = selectTarget(s, t, t.target);
}

function dist2(a: Tank, b: Tank): number {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

/** Effective ground velocity of a tank (for lead). */
function velocity(t: Tank): { vx: number; vy: number } {
  return { vx: t.vx + t.kx, vy: t.vy + t.ky };
}

/**
 * Predicted impact point for shooting at `target` from `t` with the current charge `c`.
 * Direct shells: iterate time-to-hit = distance / shell speed. Artillery: flight time of the arc.
 */
export function leadPoint(_s: SimState, t: Tank, target: Tank, c: number): { x: number; y: number } {
  const def = TANKS[t.cls];
  const speed = def.shellSpeed * evalCurve(COMBAT.scaling.speed, c);
  const { vx, vy } = velocity(target);
  let px = target.x;
  let py = target.y;
  for (let k = 0; k < COMBAT.targeting.leadIterations; k++) {
    const d = Math.sqrt((px - t.x) * (px - t.x) + (py - t.y) * (py - t.y));
    const time = def.shell === 'artillery' ? artilleryFlight(d, speed) : d / speed;
    px = target.x + vx * time;
    py = target.y + vy * time;
  }
  return { x: px, y: py };
}

/** Artillery flight time for a landing distance (shared with fire()). */
export function artilleryFlight(d: number, speed: number): number {
  return d / speed + 0.35;
}

/** Aim angle for the locked target (with lead), or null if there is no lock. */
export function autoAimAngle(s: SimState, t: Tank, c: number): number | null {
  if (t.target < 0) return null;
  const e = s.tanks[t.target];
  const p = leadPoint(s, t, e, c);
  return datan2(p.y - t.y, p.x - t.x);
}

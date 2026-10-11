/**
 * Match flow (round-01 job 4): 3-2-1 countdown → `duration` s of play → ended.
 * Respawns happen anywhere on the map at a safe spawn point. All timers use simulation time.
 */
import { MATCH, TANKS } from './config';
import type { SimState, Tank } from './state';
import { resetAbility } from './abilities';
import type { MapPoint } from '../world/map';

/** Advances the match phase; returns false when the game is over (no further simulation). */
export function updateMatch(s: SimState, dt: number): boolean {
  const m = s.match;
  if (m.phase === 'ended') return false;
  if (s.rules.endless) {
    m.phase = 'playing';
    return true;
  }
  m.t += dt;
  if (m.phase === 'countdown') {
    if (m.t >= MATCH.countdown) {
      m.phase = 'playing';
      m.t = 0;
      s.events.push({ type: 'matchStart' });
    }
    return true;
  }
  const before = Math.ceil(m.timeLeft);
  m.timeLeft = Math.max(0, m.timeLeft - dt);
  const after = Math.ceil(m.timeLeft);
  if (after !== before && after <= MATCH.finalWarning && after > 0) s.events.push({ type: 'matchTick', secondsLeft: after });
  if (m.timeLeft <= 0) {
    m.phase = 'ended';
    m.t = 0;
    for (const t of s.tanks) t.charging = false;
    s.events.push({ type: 'matchEnd' });
    return false;
  }
  return true;
}

/**
 * Picks a respawn point: walkable + connected (generator guarantees), not visible to any enemy,
 * ≥ minDistanceFromDeath from the death spot and ≥ minDistanceFromEnemies from living enemies,
 * not the same point as last time. If none qualifies, the least dangerous point (farthest from
 * the nearest enemy) is used. Deterministic: ties broken by index.
 */
export function chooseSpawn(s: SimState, t: Tank, deathX: number, deathY: number): { point: MapPoint; index: number } {
  const pts = s.map.spawnPoints;
  const W = s.map.width;
  const enemyTeam = t.team === 0 ? 1 : 0;
  const enemies = s.tanks.filter((e) => e.alive && e.team !== t.team);
  const occupied = (p: MapPoint): boolean => s.tanks.some((o) => o.alive && o.id !== t.id && Math.abs(o.x - (p.x + 0.5)) < 0.9 && Math.abs(o.y - (p.y + 0.5)) < 0.9);
  let best = -1;
  let bestScore = -Infinity;
  let fallback = -1;
  let fallbackScore = -Infinity;
  const minDeath = MATCH.spawn.minDistanceFromDeath;
  const minEnemy = MATCH.spawn.minDistanceFromEnemies;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (occupied(p)) continue;
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    let nearest = Infinity;
    for (const e of enemies) nearest = Math.min(nearest, Math.sqrt((e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy)));
    const seen = s.vision[enemyTeam].visible[p.y * W + p.x] === 1;
    const dDeath = Math.sqrt((deathX - cx) * (deathX - cx) + (deathY - cy) * (deathY - cy));
    const repeat = MATCH.spawn.avoidRepeat && i === t.lastSpawn;
    const safety = (seen ? -1000 : 0) + Math.min(nearest, 30);
    if (!repeat && safety > fallbackScore) {
      fallbackScore = safety;
      fallback = i;
    }
    if (seen || repeat || dDeath < minDeath || nearest < minEnemy) continue;
    // prefer safe but not absurdly far from the action: score by enemy distance, capped
    const score = Math.min(nearest, 16) + Math.min(dDeath, 20) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const idx = best >= 0 ? best : fallback >= 0 ? fallback : 0;
  return { point: pts[idx] ?? { x: 1, y: 1 }, index: idx };
}

export function respawnTank(s: SimState, t: Tank, deathX: number, deathY: number): void {
  const { point, index } = chooseSpawn(s, t, deathX, deathY);
  t.lastSpawn = index;
  t.x = point.x + 0.5;
  t.y = point.y + 0.5;
  t.vx = t.vy = t.kx = t.ky = 0;
  t.hp = TANKS[t.cls].hp;
  t.alive = true;
  t.charging = false;
  t.chargeT = t.fullT = t.cooldown = t.overheat = 0;
  t.needRelease = true;
  t.target = -1;
  t.shimmer = 0;
  t.protect = MATCH.spawnProtection;
  resetAbility(t);
  s.events.push({ type: 'respawn', tank: t.id });
}

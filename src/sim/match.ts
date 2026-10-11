/**
 * Match flow (round-01 job 4): 3-2-1 countdown → `duration` s of play → ended.
 * Respawns happen anywhere on the map at a safe spawn point. All timers use simulation time.
 */
import { resetUpgrades } from './upgrades';
import { MATCH, isPve } from './config';
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
    endMatch(s, s.rules.mode === 'campaign' ? 1 : -1); // campaign: time out = mission failed
    return false;
  }
  return true;
}

/** Campaign structures never come back; in a campaign the enemy team (1) does not respawn either. */
export function canRespawn(s: SimState, t: Tank): boolean {
  if (isPve(t.cls)) return false;
  return !(s.rules.mode === 'campaign' && t.team === 1);
}

/**
 * Campaign objective (round 05): the mission is won the moment every enemy HQ is destroyed.
 * Running out of time is a loss (handled in updateMatch).
 */
export function checkObjective(s: SimState): void {
  if (s.rules.mode !== 'campaign' || s.match.phase !== 'playing') return;
  let hq = 0;
  let alive = 0;
  for (const t of s.tanks) {
    if (t.cls !== 'hq' || t.team === 0) continue;
    hq++;
    if (t.alive) alive++;
  }
  if (hq > 0 && alive === 0) endMatch(s, 0);
}

function endMatch(s: SimState, winner: number): void {
  const m = s.match;
  m.phase = 'ended';
  m.t = 0;
  m.winner = winner;
  for (const t of s.tanks) t.charging = false;
  s.events.push({ type: 'matchEnd' });
}

/**
 * Picks a respawn point: walkable + connected (generator guarantees), not visible to any enemy,
 * ≥ minDistanceFromDeath from the death spot and ≥ minDistanceFromEnemies from living enemies,
 * not the same point as last time. If none qualifies, the least dangerous point (farthest from
 * the nearest enemy) is used. Deterministic: ties broken by index.
 */
export function chooseSpawn(s: SimState, t: Tank, deathX: number, deathY: number): { point: MapPoint; index: number } {
  // campaign: the player's team always comes back at its own base (never behind enemy outposts)
  const pts = s.rules.mode === 'campaign' && s.map.bases[t.team] ? s.map.bases[t.team].spawns : s.map.spawnPoints;
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
    const seen = s.vision[enemyTeam].los[p.y * W + p.x] === 1; // real line of sight, also in full-visibility mode
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
  resetUpgrades(t); // upgrades are lost on death; full base hp
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

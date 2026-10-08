/** Shells, explosions, damage and kill attribution. */
import { COMBAT, MATCH, TANKS, evalCurve, type ShellKind } from './config';
import type { Rng } from './rng';
import type { DamageCause, Shell, SimState, Tank } from './state';
import { damageFeature } from '../world/map';
import { FEATURE } from '../world/terrain';

export function nextId(state: SimState): number {
  return state.nextId++;
}

/** Applies damage (armor, spawn protection), records kills with their cause. */
export function applyDamage(state: SimState, t: Tank, raw: number, by: number, x: number, y: number, cause: DamageCause): void {
  if (!t.alive || t.protect > 0 || state.match.phase !== 'playing') return;
  const dmg = raw * (1 - TANKS[t.cls].armor);
  if (dmg <= 0) return;
  t.hp -= dmg;
  t.lastHitBy = by;
  if (t.ability.id === 'hide' && t.ability.active > 0) t.shimmer = 0.5;
  state.events.push({ type: 'hit', target: t.id, by, damage: dmg, x, y });
  if (t.hp <= 0) killTank(state, t, cause === 'environment' ? -1 : by, cause);
}

export function killTank(state: SimState, t: Tank, killer: number, cause: DamageCause): void {
  t.hp = 0;
  t.alive = false;
  t.charging = false;
  t.target = -1;
  t.ability.active = 0;
  t.deaths++;
  const k = killer >= 0 ? state.tanks[killer] : undefined;
  const validKiller = k && k.team !== t.team ? killer : -1;
  if (k && validKiller >= 0) k.kills++;
  state.match.kills.push({ t: matchTime(state), killer: validKiller, victim: t.id, cause });
  state.events.push({ type: 'destroyed', tank: t.id, by: validKiller, x: t.x, y: t.y, cause });
  t.respawn = MATCH.respawnDelay;
}

export function matchTime(s: SimState): number {
  return s.match.phase === 'playing' ? s.rules.duration - s.match.timeLeft : 0;
}

export interface ExplosionSpec {
  x: number;
  y: number;
  radius: number;
  damage: number;
  /** Fraction of damage for splash victims at the centre (falls to 0 at the edge). */
  splash: number;
  knockback: number;
  owner: number;
  team: number;
  /** Tank directly hit (full damage) or -1. */
  direct: number;
  charge: number;
  kind: ShellKind | 'mine' | 'rumble';
  cause: DamageCause;
  terrainDamage: number;
}

export function explode(state: SimState, e: ExplosionSpec): void {
  state.events.push({ type: 'explode', x: e.x, y: e.y, radius: e.radius, charge: e.charge, kind: e.kind, owner: e.owner });
  for (const t of state.tanks) {
    if (!t.alive) continue;
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const reach = e.radius + TANKS[t.cls].radius;
    const isDirect = t.id === e.direct;
    if (!isDirect && d > reach) continue;
    const enemy = t.team !== e.team;
    if (enemy || (COMBAT.shell.selfDamage && t.id === e.owner)) {
      const f = isDirect ? 1 : e.splash * (1 - Math.min(1, d / reach));
      applyDamage(state, t, e.damage * f, e.owner, e.x, e.y, e.cause);
    }
    if (enemy && d > 1e-6 && t.protect <= 0) {
      const k = e.knockback * (isDirect ? 1 : 1 - Math.min(1, d / reach));
      t.kx += (dx / d) * k;
      t.ky += (dy / d) * k;
    }
  }
  if (e.terrainDamage > 0) damageTerrainDisc(state, e.x, e.y, e.radius, e.terrainDamage);
}

export function damageTerrainDisc(state: SimState, x: number, y: number, r: number, dmg: number): void {
  const map = state.map;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const i = ty * map.width + tx;
      if (FEATURE[map.feature[i]].hp <= 0) continue;
      const dx = tx + 0.5 - x;
      const dy = ty + 0.5 - y;
      if (dx * dx + dy * dy > (r + 0.5) * (r + 0.5)) continue;
      const destroyed = damageFeature(map, tx, ty, dmg);
      state.events.push({ type: 'terrain', x: tx, y: ty, destroyed });
    }
  }
}

function shellExplosion(state: SimState, s: Shell, x: number, y: number, direct: number): void {
  explode(state, {
    x,
    y,
    radius: s.radius,
    damage: s.damage,
    splash: COMBAT.shell.splashFalloff,
    knockback: COMBAT.shell.knockback * evalCurve(COMBAT.scaling.knockback, s.charge),
    owner: s.owner,
    team: s.team,
    direct,
    charge: s.charge,
    kind: s.kind,
    cause: s.cause,
    terrainDamage: s.damage * COMBAT.shell.splashFalloff * COMBAT.shell.terrainDamageMul,
  });
}

export function updateShells(state: SimState, rng: Rng, dt: number): void {
  const shells = state.shells;
  const map = state.map;
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    let done = false;
    if (s.kind === 'artillery') {
      s.t += dt;
      const k = Math.min(1, s.t / s.flight);
      s.x = s.sx + (s.tx - s.sx) * k;
      s.y = s.sy + (s.ty - s.sy) * k;
      if (k >= 1) {
        shellExplosion(state, s, s.tx, s.ty, -1);
        done = true;
      }
    } else {
      const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const steps = Math.max(1, Math.ceil((sp * dt) / 0.2));
      const sub = dt / steps;
      for (let k = 0; k < steps && !done; k++) {
        const px = s.x;
        const py = s.y;
        s.x += s.vx * sub;
        s.y += s.vy * sub;
        s.dist -= sp * sub;
        const tx = Math.floor(s.x);
        const ty = Math.floor(s.y);
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
          done = true;
          break;
        }
        const ti = ty * map.width + tx;
        const f = FEATURE[map.feature[ti]];
        const e = map.elev[ti];
        if ((f.blocksShots && e >= s.level) || e > s.level) {
          let destroyed = false;
          if (f.hp > 0) {
            destroyed = damageFeature(map, tx, ty, s.damage * COMBAT.shell.terrainDamageMul);
            state.events.push({ type: 'terrain', x: tx, y: ty, destroyed });
          }
          if (s.bounces > 0 && !destroyed) {
            const ptx = Math.floor(px);
            const pty = Math.floor(py);
            if (ptx !== tx) s.vx = -s.vx;
            if (pty !== ty) s.vy = -s.vy;
            if (ptx === tx && pty === ty) {
              s.vx = -s.vx;
              s.vy = -s.vy;
            }
            s.x = px;
            s.y = py;
            s.bounces--;
            state.events.push({ type: 'bounce', x: px, y: py });
            continue;
          }
          shellExplosion(state, s, px, py, -1);
          done = true;
          break;
        }
        const hitR = COMBAT.shell.hitRadius;
        for (const t of state.tanks) {
          if (!t.alive || t.team === s.team || t.id === s.ignore) continue;
          const r = TANKS[t.cls].radius + hitR;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          if (dx * dx + dy * dy > r * r) continue;
          const te = map.elev[Math.floor(t.y) * map.width + Math.floor(t.x)];
          if (te > s.level && rng.next() < COMBAT.shell.uphillMissChance) {
            s.ignore = t.id;
            state.events.push({ type: 'graze', target: t.id, x: s.x, y: s.y });
            continue;
          }
          shellExplosion(state, s, s.x, s.y, t.id);
          done = true;
          break;
        }
        if (!done && s.dist <= 0) {
          shellExplosion(state, s, s.x, s.y, -1);
          done = true;
        }
      }
    }
    if (done) {
      shells[i] = shells[shells.length - 1];
      shells.pop();
    }
  }
}

/** True if a straight path between two points crosses no shot-blocking tile and stays on one elevation (shockwaves). */
export function clearGroundPath(state: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = state.map;
  const e0 = m.elev[Math.floor(y0) * m.width + Math.floor(x0)];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.max(1, Math.ceil(len / 0.25));
  for (let k = 1; k < n; k++) {
    const x = x0 + (dx * k) / n;
    const y = y0 + (dy * k) / n;
    const i = Math.floor(y) * m.width + Math.floor(x);
    if (m.elev[i] !== e0) return false;
    if (FEATURE[m.feature[i]].blocksShots) return false;
  }
  return true;
}

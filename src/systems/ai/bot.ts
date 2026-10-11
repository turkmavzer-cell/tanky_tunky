/**
 * Bot AI (round-01 job 3): a finite-state machine
 *   patrol → suspicion → chase → attack → retreat (to cover) → …
 * driven ONLY by fair perception:
 *   - sight: `canSeeTank` from the VisibilitySystem (fog, forest, invisibility rules)
 *   - "noticing" an invisible tank within noticeRange (`canNoticeTank`)
 *   - hearing: enemy shots within hearingRadius (position becomes a suspicion point)
 *   - pain: being hit reveals roughly where the shooter was
 * It never reads hidden enemy positions. Targeting uses the same `selectTarget` as the player's
 * auto-aim; aim error / reaction time / charge habits come from data/ai.json.
 * Deterministic: own seeded Rng, inputs derived from state only → replays reproduce matches.
 */
import aiJson from '../../data/ai.json';
import { ABILITIES, COMBAT, TANKS } from '../../sim/config';
import { clamp, datan2, dcos, dhypot, dsin } from '../../sim/dmath';
import { BTN_ABILITY, BTN_FIRE, EMPTY_INPUT, quantizeAim, quantizeMove, type PlayerInput } from '../../sim/input';
import { Rng } from '../../sim/rng';
import type { SimState, Tank } from '../../sim/state';
import { leadPoint, selectTarget } from '../../sim/targeting';
import { canNoticeTank, canSeeTank, isInvisible } from '../../sim/visibility';
import { chargeTimeOf } from '../../sim/tank';
import { clearGroundPath } from '../../sim/combat';
import { findPath, type PathPoint } from './nav';
import { isTileOpen } from '../../world/passability';

export type AiState = 'patrol' | 'suspicion' | 'chase' | 'attack' | 'retreat';

type Level = (typeof aiJson.levels)['normal'];
export const AI = aiJson;

interface Known {
  id: number;
  x: number;
  y: number;
  /** Sim time (s) when last perceived. */
  t: number;
}

export class AiBot {
  state: AiState = 'patrol';
  private readonly rng: Rng;
  private readonly lv: Level;
  private path: PathPoint[] = [];
  private pathGoal = -1;
  private repath = 0;
  private stateT = 0;
  private reaction = 0;
  private holding = 0;
  private lastPos = { x: 0, y: 0 };
  private stuckT = 0;
  /** Last known enemy contact (sight / sound / pain). */
  known: Known | null = null;
  private lockId = -1;
  private strafe = 1;
  private retreatGoal: PathPoint | null = null;

  constructor(
    readonly id: number,
    seed: number,
    level: keyof typeof aiJson.levels = (aiJson.difficulty as keyof typeof aiJson.levels) ?? 'normal',
  ) {
    this.rng = new Rng((seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0);
    this.lv = aiJson.levels[level];
  }

  private now(s: SimState): number {
    return s.tick / 60;
  }

  /** Everything this bot is allowed to know this tick. */
  private perceive(s: SimState, me: Tank): Tank | null {
    const now = this.now(s);
    this.lockId = selectTarget(s, me, this.lockId);
    let seen: Tank | null = this.lockId >= 0 ? s.tanks[this.lockId] : null;
    if (!seen) {
      // an invisible enemy that came very close is "noticed"
      for (const e of s.tanks) if (e.team !== me.team && e.alive && isInvisible(e) && canNoticeTank(s, me.team, e)) seen = e;
    }
    if (seen) this.known = { id: seen.id, x: seen.x, y: seen.y, t: now };
    for (const ev of s.events) {
      if (ev.type === 'fire') {
        const src = s.tanks[ev.tank];
        if (src.team === me.team) continue;
        const d = dhypot(ev.x - me.x, ev.y - me.y);
        if (d <= aiJson.hearingRadius && (!this.known || this.known.t < now - 0.5))
          this.known = { id: src.id, x: clamp(ev.x + this.rng.range(-1.5, 1.5), 0.5, s.map.width - 0.5), y: clamp(ev.y + this.rng.range(-1.5, 1.5), 0.5, s.map.height - 0.5), t: now };
      } else if (ev.type === 'hit' && ev.target === me.id && ev.by >= 0) {
        const src = s.tanks[ev.by];
        if (src && src.team !== me.team && !seen) {
          // pain: rough direction toward where the shot came from (no exact hidden position)
          const a = datan2(src.y - me.y, src.x - me.x) + this.rng.range(-0.35, 0.35);
          this.known = { id: src.id, x: clamp(me.x + dcos(a) * 5, 0.5, s.map.width - 0.5), y: clamp(me.y + dsin(a) * 5, 0.5, s.map.height - 0.5), t: now };
        }
      }
    }
    return seen;
  }

  private setState(st: AiState): void {
    if (st !== this.state) {
      this.state = st;
      this.stateT = 0;
      this.path = [];
      this.pathGoal = -1;
    }
  }

  input(s: SimState): PlayerInput {
    const me = s.tanks[this.id];
    if (!me || !me.alive || s.match.phase !== 'playing') {
      this.holding = 0;
      this.setState('patrol');
      return EMPTY_INPUT;
    }
    const dt = 1 / 60;
    this.stateT += dt;
    const def = TANKS[me.cls];
    const now = this.now(s);
    const seen = this.perceive(s, me);
    const fresh = this.known && now - this.known.t < aiJson.suspicionTime ? this.known : null;

    // ---- transitions
    const hpFrac = me.hp / def.hp;
    if (hpFrac < aiJson.retreatHp && fresh && this.state !== 'retreat') {
      this.setState('retreat');
      this.retreatGoal = this.findCover(s, me, fresh.x, fresh.y);
    }
    if (this.state === 'retreat') {
      if (this.stateT > aiJson.retreatTime) this.setState(seen ? 'attack' : 'patrol');
    } else if (seen) {
      const d = dhypot(seen.x - me.x, seen.y - me.y);
      if (this.state !== 'attack' && this.state !== 'chase') this.reaction = this.lv.reactionTime;
      this.setState(d <= def.range ? 'attack' : 'chase');
    } else if (fresh) {
      if (this.state === 'attack' || this.state === 'chase') {
        // lost sight: chase the last known position for a while, then investigate
        if (now - fresh.t > aiJson.loseSightGrace) this.setState('suspicion');
        else this.setState('chase');
      } else if (this.state === 'patrol') this.setState('suspicion');
    } else if (this.state !== 'patrol') {
      if (this.stateT > aiJson.searchTime || this.state !== 'suspicion') this.setState('patrol');
    }
    if (this.reaction > 0) this.reaction -= dt;

    // ---- movement goal per state
    let goal: PathPoint | null = null;
    let face: { x: number; y: number } | null = null;
    let moveScale = 1;
    switch (this.state) {
      case 'patrol':
        goal = this.patrolGoal(s, me);
        moveScale = 0.7;
        break;
      case 'suspicion':
      case 'chase':
        if (fresh) goal = { x: Math.floor(fresh.x), y: Math.floor(fresh.y) };
        break;
      case 'attack':
        if (seen) {
          const d = dhypot(seen.x - me.x, seen.y - me.y);
          const pref = def.range * aiJson.preferredRangeFactor;
          if (d > pref + 0.8 || !clearGroundPath(s, me.x, me.y, seen.x, seen.y)) goal = { x: Math.floor(seen.x), y: Math.floor(seen.y) };
          else {
            // strafe around the target at the preferred range
            if (this.rng.next() < 0.01) this.strafe = -this.strafe;
            const a = datan2(me.y - seen.y, me.x - seen.x) + 0.6 * this.strafe;
            const r = clamp(d, 2, pref);
            const gx = Math.floor(seen.x + dcos(a) * r);
            const gy = Math.floor(seen.y + dsin(a) * r);
            if (isTileOpen(s.map, gx, gy)) goal = { x: gx, y: gy };
            moveScale = 0.6;
          }
          face = seen;
        }
        break;
      case 'retreat':
        goal = this.retreatGoal;
        break;
    }
    const mv = this.steer(s, me, goal);

    // ---- aim
    let aim = quantizeAim(me.turret);
    let wantFire = false;
    if (seen) {
      const p = canSeeTank(s, me.team, seen) ? leadPoint(s, me, seen, 0) : { x: seen.x, y: seen.y };
      const err = this.rng.range(-this.lv.aimError, this.lv.aimError);
      const ang = datan2(p.y - me.y, p.x - me.x) + err;
      aim = quantizeAim(ang);
      const d = dhypot(seen.x - me.x, seen.y - me.y);
      const aligned = Math.abs(((me.turret - ang + 9.42477796) % 6.28318531) - 3.14159265) < aiJson.fireAlignment;
      wantFire = this.reaction <= 0 && aligned && d <= def.range * 1.05 && (def.shell === 'artillery' || clearGroundPath(s, me.x, me.y, seen.x, seen.y) || d < 2);
      if (def.shell === 'artillery' && d < def.minRange) wantFire = false;
    } else if (face) aim = quantizeAim(datan2(face.y - me.y, face.x - me.x));
    else if (Math.abs(mv.x) + Math.abs(mv.y) > 0.1) aim = quantizeAim(datan2(mv.y, mv.x));

    // ---- charged-fire habits
    let buttons = 0;
    if (this.holding > 0) {
      this.holding--;
      if (this.holding > 0) buttons |= BTN_FIRE;
    } else if (wantFire && me.cooldown <= 0 && !me.charging && me.overheat <= 0) {
      const d = seen ? dhypot(seen.x - me.x, seen.y - me.y) : 99;
      const ct = chargeTimeOf(me) * 60;
      const roll = this.rng.next();
      if (def.shell === 'artillery') {
        // artillery: charge sets the landing distance — solve for the charge that reaches the target
        const c = artilleryChargeFor(me, d) * (1 + this.rng.range(-this.lv.aimError, this.lv.aimError));
        this.holding = Math.max(2, Math.round(Math.min(1, Math.max(0, c)) * ct) + 1);
      } else if (d < aiJson.closeRange) this.holding = 2;
      else if (roll < this.lv.fullChargeChance) this.holding = Math.round(ct + 4);
      else if (roll < this.lv.fullChargeChance + this.lv.shortChargeChance) this.holding = Math.round(ct * this.rng.range(0.3, 0.6));
      else this.holding = 2;
      buttons |= BTN_FIRE;
    }

    // ---- ability
    if (this.wantsAbility(s, me, seen, fresh)) buttons |= BTN_ABILITY;

    return { moveX: quantizeMove(mv.x * moveScale), moveY: quantizeMove(mv.y * moveScale), aim, buttons };
  }

  /** Class-specific ability habits (data/ai.json → ability). */
  private wantsAbility(s: SimState, me: Tank, seen: Tank | null, fresh: Known | null): boolean {
    const a = me.ability;
    if (a.active > 0 || a.cooldown > 0) return false;
    if (this.rng.next() > this.lv.abilityUse * 0.2) return false; // spread decisions over time
    const cfg = aiJson.ability;
    const dSeen = seen ? dhypot(seen.x - me.x, seen.y - me.y) : Infinity;
    switch (a.id) {
      case 'hide':
        // ambush: vanish when an enemy is around but has not engaged yet, or when hurt
        return dSeen < cfg.hide.enemyWithin || me.hp < TANKS[me.cls].hp * 0.5;
      case 'rumble': {
        let n = 0;
        for (const e of s.tanks) if (e.alive && e.team !== me.team && canNoticeTank(s, me.team, e) && dhypot(e.x - me.x, e.y - me.y) < cfg.rumble.enemiesWithin) n++;
        return n >= cfg.rumble.minEnemies;
      }
      case 'swift':
        return dSeen < cfg.swift.enemyWithin && this.state === 'attack';
      case 'barrage':
        return seen !== null && dSeen >= cfg.barrage.minDistance;
      case 'mine': {
        const moving = dhypot(me.vx, me.vy) > 0.5;
        const corridor = this.isCorridor(s, Math.floor(me.x), Math.floor(me.y));
        const threat = fresh !== null && dhypot(fresh.x - me.x, fresh.y - me.y) < cfg.mine.enemyWithin;
        return moving && (corridor || threat || this.state === 'retreat');
      }
    }
    return false;
  }

  /** A tile with ≤ 2 open orthogonal neighbours is a corridor/choke point (good mine spot). */
  private isCorridor(s: SimState, x: number, y: number): boolean {
    let open = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (isTileOpen(s.map, x + dx, y + dy)) open++;
    return open <= 2;
  }

  private patrolGoal(s: SimState, me: Tank): PathPoint {
    if (this.pathGoal >= 0 && this.path.length) {
      const W = s.map.width;
      return { x: this.pathGoal % W, y: Math.floor(this.pathGoal / W) };
    }
    // Short matches need contact: patrol between objective zones and spawn points biased toward the
    // map centre / enemy half (never toward a hidden enemy — no position knowledge is used).
    const pts = s.map.spawnPoints;
    const objs = s.map.objectives;
    if (objs.length && this.rng.next() < aiJson.patrolObjectiveChance) {
      const o = objs[this.rng.int(0, objs.length - 1)];
      return { x: Math.floor(o.x), y: Math.floor(o.y) };
    }
    if (!pts.length) return { x: Math.floor(me.x), y: Math.floor(me.y) };
    const cx = s.map.width / 2;
    const cy = s.map.height / 2;
    let best = pts[0];
    let bestScore = Infinity;
    for (let k = 0; k < 4; k++) {
      const p = pts[this.rng.int(0, pts.length - 1)];
      const score = dhypot(p.x - cx, p.y - cy) + this.rng.range(0, aiJson.patrolRadius);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  /** A nearby tile with the line to the threat blocked by terrain (cover), else away from the threat. */
  private findCover(s: SimState, me: Tank, tx: number, ty: number): PathPoint {
    let best: PathPoint | null = null;
    let bestScore = -Infinity;
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        const x = Math.floor(me.x) + dx;
        const y = Math.floor(me.y) + dy;
        if (!isTileOpen(s.map, x, y)) continue;
        const covered = !clearGroundPath(s, tx, ty, x + 0.5, y + 0.5);
        const away = dhypot(x - tx, y - ty);
        const score = (covered ? 10 : 0) + away - dhypot(dx, dy) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    return best ?? { x: Math.floor(me.x), y: Math.floor(me.y) };
  }

  /** Follow an A* path toward the goal tile; returns a unit-ish world move vector. */
  private steer(s: SimState, me: Tank, goal: PathPoint | null): { x: number; y: number } {
    if (!goal) return { x: 0, y: 0 };
    const W = s.map.width;
    const gi = goal.y * W + goal.x;
    this.repath -= 1 / 60;
    // stuck detection
    if (dhypot(me.x - this.lastPos.x, me.y - this.lastPos.y) < 0.01) this.stuckT += 1 / 60;
    else this.stuckT = 0;
    this.lastPos = { x: me.x, y: me.y };
    if (gi !== this.pathGoal || this.repath <= 0 || this.stuckT > aiJson.stuckTime) {
      const p = findPath(s.map, Math.floor(me.x), Math.floor(me.y), goal.x, goal.y);
      this.path = p ?? [];
      this.pathGoal = p ? gi : -1;
      this.repath = aiJson.repathInterval + this.rng.range(0, 0.3);
      if (this.stuckT > aiJson.stuckTime) this.stuckT = 0;
    }
    while (this.path.length && dhypot(this.path[0].x + 0.5 - me.x, this.path[0].y + 0.5 - me.y) < 0.45) this.path.shift();
    if (!this.path.length) {
      this.pathGoal = -1;
      return { x: 0, y: 0 };
    }
    const n = this.path[0];
    const dx = n.x + 0.5 - me.x;
    const dy = n.y + 0.5 - me.y;
    const d = dhypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
}

/**
 * Charge level (0..1) at which an artillery shell lands at distance `d`:
 * d = minRange + (range·rangeMul(c) − minRange)·c, with rangeMul linear between its curve ends.
 */
export function artilleryChargeFor(t: Tank, d: number): number {
  const def = TANKS[t.cls];
  const r0 = COMBAT.scaling.range[0][1];
  const r1 = COMBAT.scaling.range[COMBAT.scaling.range.length - 1][1];
  const R = def.range;
  const m = def.minRange;
  // (R·(r1−r0))·c² + (R·r0 − m)·c + (m − d) = 0
  const a = R * (r1 - r0);
  const b = R * r0 - m;
  const k = m - d;
  if (Math.abs(a) < 1e-9) return b > 0 ? clamp(-k / b, 0, 1) : 0;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return 1;
  return clamp((-b + Math.sqrt(disc)) / (2 * a), 0, 1);
}

/** Ability duration helper for UI/tests. */
export function abilityDuration(id: keyof typeof ABILITIES): number {
  return Number(ABILITIES[id].duration);
}

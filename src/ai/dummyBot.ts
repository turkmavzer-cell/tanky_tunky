/**
 * Placeholder bot for phase 3 feel-testing (real behaviour-tree AI arrives in phase 7).
 * Produces quantized PlayerInput from the simulation state only (no hidden info beyond what the
 * sim exposes; the fog-of-war-aware perception layer replaces `nearestEnemy` in phase 4/7).
 * Deterministic: uses its own seeded Rng, so recorded matches replay identically.
 */
import { Rng } from '../sim/rng';
import { TANKS } from '../sim/config';
import { datan2 } from '../sim/dmath';
import { BTN_FIRE, EMPTY_INPUT, quantizeAim, quantizeMove, type PlayerInput } from '../sim/input';
import type { SimState, Tank } from '../sim/state';
import { isWalkable } from '../world/map';

export class DummyBot {
  private readonly rng: Rng;
  private goalX: number;
  private goalY: number;
  private holdFor = 0;
  private holding = 0;
  private think = 0;
  private stuck = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly id: number,
    seed: number,
    /** 0 = passive target dummy, 1 = full placeholder aggression. */
    private readonly aggression = 1,
  ) {
    this.rng = new Rng(seed ^ (id * 7919));
    this.goalX = 0;
    this.goalY = 0;
  }

  private pickGoal(s: SimState, t: Tank): void {
    const m = s.map;
    for (let k = 0; k < 20; k++) {
      const gx = Math.floor(t.x + this.rng.range(-9, 9));
      const gy = Math.floor(t.y + this.rng.range(-9, 9));
      if (isWalkable(m, gx, gy)) {
        this.goalX = gx + 0.5;
        this.goalY = gy + 0.5;
        return;
      }
    }
  }

  input(s: SimState): PlayerInput {
    const t = s.tanks[this.id];
    if (!t || !t.alive) {
      this.holding = 0;
      return EMPTY_INPUT;
    }
    const def = TANKS[t.cls];
    if (this.goalX === 0 || (Math.abs(t.x - this.goalX) < 0.6 && Math.abs(t.y - this.goalY) < 0.6)) this.pickGoal(s, t);
    // stuck detection → new goal
    if (--this.think <= 0) {
      this.think = 30;
      const moved = Math.abs(t.x - this.lastX) + Math.abs(t.y - this.lastY);
      this.stuck = moved < 0.15 ? this.stuck + 1 : 0;
      if (this.stuck >= 2) {
        this.pickGoal(s, t);
        this.stuck = 0;
      }
      this.lastX = t.x;
      this.lastY = t.y;
    }
    let mx = this.goalX - t.x;
    let my = this.goalY - t.y;
    const d = Math.sqrt(mx * mx + my * my) || 1;
    mx /= d;
    my /= d;
    const speed = 0.55 + 0.45 * this.aggression;

    // target: nearest living enemy
    let best: Tank | null = null;
    let bd = Infinity;
    for (const e of s.tanks) {
      if (!e.alive || e.team === t.team) continue;
      const dd = (e.x - t.x) * (e.x - t.x) + (e.y - t.y) * (e.y - t.y);
      if (dd < bd) {
        bd = dd;
        best = e;
      }
    }
    let aim = quantizeAim(t.turret);
    let buttons = 0;
    const range = def.range * 1.1;
    if (best && bd < range * range && this.aggression > 0) {
      // inaccurate aim (placeholder skill)
      aim = quantizeAim(datan2(best.y - t.y, best.x - t.x) + this.rng.range(-0.12, 0.12));
      if (this.holding > 0) {
        this.holding--;
        buttons = this.holding > 0 ? BTN_FIRE : 0;
      } else if (t.cooldown <= 0 && this.rng.next() < 0.03 * this.aggression) {
        this.holdFor = this.rng.next() < 0.4 ? Math.round(def.chargeTime * 60 * this.rng.range(0.4, 1.05)) : 3;
        this.holding = this.holdFor;
        buttons = BTN_FIRE;
      }
    }
    return { moveX: quantizeMove(mx * speed), moveY: quantizeMove(my * speed), aim, buttons };
  }
}

/**
 * Campaign gun tower controller (round 05, stream D). A tower never moves: it locks the nearest visible
 * enemy inside its gun range with the shared auto-aim (lead included) and fires uncharged taps once the
 * turret is aligned and the shot is not blocked by terrain. The difficulty's `fireDelay` applies to the first
 * shot after an enemy enters range, exactly like tank bots (fair reaction time). Deterministic: state only.
 */
import aiJson from '../../data/ai.json';
import { TANKS } from '../../sim/config';
import { datan2, dhypot } from '../../sim/dmath';
import { AIM_AUTO, BTN_FIRE, EMPTY_INPUT, type PlayerInput } from '../../sim/input';
import type { SimState } from '../../sim/state';
import { clearGroundPath } from '../../sim/combat';
import type { AiLevel } from './bot';

/** Anything that produces one tank's input each tick (AiBot, TowerBot). */
export interface Controller {
  input(s: SimState): PlayerInput;
}

export class TowerBot implements Controller {
  private engageT = 0;
  private pressed = false;
  private readonly fireDelay: number;

  constructor(
    readonly id: number,
    level: AiLevel = 'normal',
  ) {
    this.fireDelay = aiJson.levels[level].fireDelay;
  }

  input(s: SimState): PlayerInput {
    const me = s.tanks[this.id];
    if (!me || !me.alive || me.protect > 0 || s.match.phase !== 'playing') {
      this.engageT = 0;
      return EMPTY_INPUT;
    }
    const def = TANKS[me.cls];
    const tgt = me.target >= 0 ? s.tanks[me.target] : null;
    let buttons = 0;
    if (tgt && tgt.alive && dhypot(tgt.x - me.x, tgt.y - me.y) <= def.range) {
      this.engageT += 1 / 60;
      const ang = datan2(tgt.y - me.y, tgt.x - me.x);
      const aligned = Math.abs(((me.turret - ang + 9.42477796) % 6.28318531) - 3.14159265) < aiJson.fireAlignment;
      // a tap = press for one tick, release on the next (the charge state machine fires on release)
      if (this.pressed) this.pressed = false;
      else if (this.engageT >= this.fireDelay && aligned && me.cooldown <= 0 && (def.shell === 'artillery' || clearGroundPath(s, me.x, me.y, tgt.x, tgt.y))) {
        this.pressed = true;
        buttons = BTN_FIRE;
      }
    } else {
      this.engageT = 0;
      this.pressed = false;
    }
    return { moveX: 0, moveY: 0, aim: AIM_AUTO, buttons };
  }
}

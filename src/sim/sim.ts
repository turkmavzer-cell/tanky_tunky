import { SIM_DT, TANKS, type TankClassId } from './config';
import { clamp, datan2, rotateToward } from './dmath';
import { AIM_NONE, aimToRad, type PlayerInput } from './input';
import { Rng } from './rng';
import type { SimState, Tank } from './state';

export interface SimOptions {
  seed: number;
  width: number;
  height: number;
  players: { team: number; cls: TankClassId; x: number; y: number }[];
}

export function createState(opts: SimOptions): SimState {
  const rng = new Rng(opts.seed);
  const tanks: Tank[] = opts.players.map((p, i) => ({
    id: i,
    team: p.team,
    cls: p.cls,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    hull: 0,
    turret: 0,
    hp: TANKS[p.cls].hp,
  }));
  return { tick: 0, seed: opts.seed, rng: rng.state(), width: opts.width, height: opts.height, tanks };
}

/**
 * Advances the simulation by exactly one fixed tick (SIM_DT). Pure with respect to its inputs:
 * the same state + inputs always produce the same next state (deterministic replay, lockstep).
 * `inputs[i]` belongs to tank i.
 */
export function step(state: SimState, inputs: readonly PlayerInput[]): void {
  const dt = SIM_DT;
  for (let i = 0; i < state.tanks.length; i++) {
    const t = state.tanks[i];
    const inp = inputs[i];
    if (!inp || t.hp <= 0) continue;
    const def = TANKS[t.cls];
    let mx = inp.moveX / 127;
    let my = inp.moveY / 127;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const tvx = mx * def.maxSpeed;
    const tvy = my * def.maxSpeed;
    // approach target velocity with bounded acceleration
    const dvx = tvx - t.vx;
    const dvy = tvy - t.vy;
    const dv = Math.sqrt(dvx * dvx + dvy * dvy);
    const maxDv = def.accel * dt;
    if (dv <= maxDv) {
      t.vx = tvx;
      t.vy = tvy;
    } else {
      t.vx += (dvx / dv) * maxDv;
      t.vy += (dvy / dv) * maxDv;
    }
    t.x = clamp(t.x + t.vx * dt, def.radius, state.width - def.radius);
    t.y = clamp(t.y + t.vy * dt, def.radius, state.height - def.radius);
    if (mag > 0.05) t.hull = rotateToward(t.hull, datan2(my, mx), def.hullTurn * dt);
    if (inp.aim !== AIM_NONE) t.turret = rotateToward(t.turret, aimToRad(inp.aim), def.turretTurn * dt);
  }
  state.tick++;
}

export function cloneState(s: SimState): SimState {
  return structuredClone(s);
}

import { createState, step } from '../src/sim/sim';
import type { TankClassId } from '../src/sim/config';
import type { PlayerInput } from '../src/sim/input';
import { createMap, setFeature, type GameMap } from '../src/world/map';
import type { SimEvent, SimState } from '../src/sim/state';
import type { MatchRules } from '../src/sim/state';

export const idle: PlayerInput = { moveX: 0, moveY: 0, aim: -1, buttons: 0 };

export function flatMap(size = 30): GameMap {
  return createMap(size, size, 1);
}

export function arena(
  players: { team: number; cls: TankClassId; x: number; y: number }[],
  opts: { size?: number; map?: GameMap; rules?: Partial<MatchRules> } = {},
): SimState {
  return createState({ seed: 1, map: opts.map ?? flatMap(opts.size ?? 30), players, rules: { endless: true, ...opts.rules } });
}

/** Run n ticks with fixed inputs; returns all events. */
export function run(s: SimState, n: number, inputs: PlayerInput[] | ((s: SimState) => PlayerInput[])): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    step(s, typeof inputs === 'function' ? inputs(s) : inputs);
    ev.push(...s.events);
  }
  return ev;
}

export function wall(m: GameMap, x: number, y0: number, y1: number, f = 2): void {
  for (let y = y0; y <= y1; y++) setFeature(m, x, y, f);
}

export const secs = (t: number): number => Math.round(t * 60);

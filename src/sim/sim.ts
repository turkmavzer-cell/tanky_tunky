/**
 * Simulation entry point. `step()` advances exactly one fixed tick (SIM_DT) and is deterministic:
 * the same state + inputs always produce the same next state (replays, lockstep, headless tests).
 */
import { COMBAT, MATCH, SIM_DT, TANKS, VISION, type TankClassId } from './config';
import { updatePickups } from './upgrades';
import type { PlayerInput } from './input';
import { Rng } from './rng';
import type { MatchRules, SimState, Tank } from './state';
import type { GameMap } from '../world/map';
import { collideTanks } from './collision';
import { updateShells } from './combat';
import { updateMines } from './abilities/mine';
import { newAbilityState } from './abilities';
import { createVision, updateVision, VISION_INTERVAL } from './visibility';
import { respawnTank, updateMatch } from './match';
import { updateTank } from './tank';

export { chargeLevel, chargeTimeOf } from './tank';

export interface PlayerSpec {
  team: number;
  cls: TankClassId;
  x: number;
  y: number;
  name?: string;
}

export interface SimOptions {
  seed: number;
  map: GameMap;
  players: PlayerSpec[];
  rules?: Partial<MatchRules>;
}

export function createState(opts: SimOptions): SimState {
  const rng = new Rng(opts.seed);
  const rules: MatchRules = { cooldownMul: 1, duration: MATCH.duration, endless: false, fullVisibility: VISION.fullVisibility, ...opts.rules };
  const tanks: Tank[] = opts.players.map((p, i) => ({
    id: i,
    team: p.team,
    cls: p.cls,
    name: p.name ?? `${p.cls}-${i}`,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    hull: p.team === 0 ? 0.785398163397448 : -2.356194490192345,
    turret: p.team === 0 ? 0.785398163397448 : -2.356194490192345,
    hp: TANKS[p.cls].hp,
    alive: true,
    respawn: 0,
    protect: 0,
    lastSpawn: -1,
    charging: false,
    chargeT: 0,
    fullT: 0,
    cooldown: 0,
    overheat: 0,
    needRelease: false,
    prevButtons: 0,
    target: -1,
    ability: newAbilityState(TANKS[p.cls].ability),
    shimmer: 0,
    bumpCd: 0,
    lastHitBy: -1,
    kills: 0,
    deaths: 0,
    upgrades: 0,
    combatT: 0,
    regenNext: COMBAT.regen.outOfCombat,
  }));
  const s: SimState = {
    tick: 0,
    seed: opts.seed,
    rng: rng.state(),
    map: opts.map,
    tanks,
    shells: [],
    mines: [],
    pickups: [],
    crateRespawns: [],
    nextId: 1,
    vision: createVision(opts.map),
    match: { phase: rules.endless ? 'playing' : 'countdown', t: 0, timeLeft: rules.duration, kills: [] },
    rules,
    events: [],
  };
  updateVision(s);
  return s;
}

export function step(state: SimState, inputs: readonly PlayerInput[]): void {
  const dt = SIM_DT;
  const rng = new Rng(state.rng);
  state.events.length = 0;
  const running = updateMatch(state, dt);
  if (running) {
    const playing = state.match.phase === 'playing';
    for (let i = 0; i < state.tanks.length; i++) {
      const t = state.tanks[i];
      if (!t.alive) {
        if (!playing) continue;
        t.respawn -= dt;
        if (t.respawn <= 0) respawnTank(state, t, t.x, t.y);
        continue;
      }
      // during the 3-2-1 countdown tanks can aim but not move/fire
      updateTank(state, t, playing ? inputs[i] : undefined, rng, dt);
    }
    collideTanks(state);
    updateShells(state, rng, dt);
    updateMines(state, dt);
    if (playing) updatePickups(state, dt);
  }
  if (state.tick % VISION_INTERVAL === 0) updateVision(state);
  state.rng = rng.state();
  state.tick++;
}

export function cloneState(s: SimState): SimState {
  return structuredClone(s);
}

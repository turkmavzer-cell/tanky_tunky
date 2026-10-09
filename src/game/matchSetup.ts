/**
 * Match setup + headless runner shared by the game scene, tests and the balance simulation.
 * No DOM, deterministic: same seed + same player inputs → same match and scoreboard.
 */
import { TANK_CLASSES, type TankClassId } from '../sim/config';
import { EMPTY_INPUT, type PlayerInput } from '../sim/input';
import { Rng } from '../sim/rng';
import { createState, step, type PlayerSpec } from '../sim/sim';
import type { MatchRules, SimState } from '../sim/state';
import { generateMap, type MapSize } from '../world/generator';
import type { GameMap, MapTheme } from '../world/map';
import { generateThemed } from '../world/themes';
import { AiBot, type AiLevel } from '../systems/ai/bot';

export interface MatchOptions {
  seed: number;
  mapSize?: MapSize;
  map?: GameMap;
  /** Classes per team; index 0 of team 0 is the local player when `humanPlayer` is true. */
  teams?: [TankClassId[], TankClassId[]];
  /** Tank 0 is controlled by a human (no bot created for it). */
  humanPlayer?: boolean;
  playerName?: string;
  rules?: Partial<MatchRules>;
  /** Map theme when no `map` is given (default: the original forest generator). */
  theme?: MapTheme;
  /** Bot difficulty for every bot in the match, allies included (owner decision). */
  aiLevel?: AiLevel;
}

export interface MatchHandle {
  state: SimState;
  bots: (AiBot | null)[];
}

/** Default 3v3 roster: player's class + two deterministic bot classes per side. */
export function defaultTeams(seed: number, playerClass: TankClassId): [TankClassId[], TankClassId[]] {
  const r = new Rng(seed ^ 0xc1a55);
  const pick = (): TankClassId => TANK_CLASSES[r.int(0, TANK_CLASSES.length - 1)];
  return [
    [playerClass, pick(), pick()],
    [pick(), pick(), pick()],
  ];
}

const BOT_NAMES = ['Kurt', 'Şahin', 'Kaplan', 'Atmaca', 'Bozkurt', 'Pars', 'Karakuş', 'Doğan', 'Aslan', 'Toros'];

export function createMatch(o: MatchOptions): MatchHandle {
  const map = o.map ?? (o.theme ? generateThemed(o.theme, o.seed, o.mapSize ?? 40) : generateMap({ seed: o.seed, size: o.mapSize ?? 64 }));
  const teams = o.teams ?? defaultTeams(o.seed, 'standard');
  const players: PlayerSpec[] = [];
  let nameIdx = o.seed % BOT_NAMES.length;
  for (let team = 0; team < 2; team++) {
    const base = map.bases[team];
    teams[team].forEach((cls, k) => {
      const sp = base.spawns[k % base.spawns.length];
      const isHuman = o.humanPlayer && team === 0 && k === 0;
      players.push({ team, cls, x: sp.x + 0.5, y: sp.y + 0.5, name: isHuman ? (o.playerName ?? 'Sen') : BOT_NAMES[nameIdx++ % BOT_NAMES.length] });
    });
  }
  const state = createState({ seed: o.seed, map, players, rules: o.rules });
  const bots = players.map((_, i) => (o.humanPlayer && i === 0 ? null : new AiBot(i, o.seed, o.aiLevel)));
  return { state, bots };
}

/** One simulation tick: bots decide, then the sim steps. `human` is tank 0's input (if any). */
export function stepMatch(m: MatchHandle, human: PlayerInput | null, inputs: PlayerInput[] = []): void {
  for (let i = 0; i < m.state.tanks.length; i++) {
    const b = m.bots[i];
    inputs[i] = b ? b.input(m.state) : i === 0 && human ? human : EMPTY_INPUT;
  }
  step(m.state, inputs);
}

export interface ScoreRow {
  id: number;
  name: string;
  cls: TankClassId;
  team: number;
  kills: number;
  deaths: number;
  rank: number;
}

/** Ranking: most kills, ties → fewest deaths, then id (stable). */
export function scoreboard(s: SimState): ScoreRow[] {
  const rows = s.tanks.map((t) => ({ id: t.id, name: t.name, cls: t.cls, team: t.team, kills: t.kills, deaths: t.deaths, rank: 0 }));
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** Runs a full match headlessly (all bots) until it ends; returns the final state. */
export function runHeadless(o: MatchOptions, onTick?: (m: MatchHandle) => void): MatchHandle {
  const m = createMatch({ ...o, humanPlayer: false });
  const inputs: PlayerInput[] = [];
  const maxTicks = 60 * (m.state.rules.duration + 10);
  for (let k = 0; k < maxTicks && m.state.match.phase !== 'ended'; k++) {
    stepMatch(m, null, inputs);
    onTick?.(m);
  }
  return m;
}

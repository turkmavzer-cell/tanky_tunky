/**
 * Single-player campaign (round 05, stream D). Levels come from data/levels.json, enemy rules from
 * data/enemies.json. A level is played on a generated themed map: the player (+ allies) start at base 0,
 * the enemy headquarters stands at base 1, and every outpost on the way is filled by a seeded solver that
 * spends the outpost's threat budget on units from its pool (towers + guarding tanks). Win = HQ destroyed,
 * loss = time out. Deterministic: same level + class + difficulty → same placement and match.
 */
import levelsJson from '../data/levels.json';
import enemiesJson from '../data/enemies.json';
import type { CombatClassId, TankClassId } from '../sim/config';
import { Rng } from '../sim/rng';
import { createState, type PlayerSpec } from '../sim/sim';
import type { SimState, TankBoost } from '../sim/state';
import type { MapSize } from '../world/generator';
import type { GameMap, MapPoint, MapTheme } from '../world/map';
import { generateThemed } from '../world/themes';
import { isTileOpen } from '../world/passability';
import { floodFill } from '../world/reach';
import { AiBot, type AiLevel } from '../systems/ai/bot';
import { TowerBot, type Controller } from '../systems/ai/tower';
import type { MatchHandle } from './matchSetup';

export type UnitType = 'tower' | CombatClassId;

export interface OutpostDef {
  at: number;
  side: number;
  budget: number;
  pool: UnitType[];
}

export interface CampaignLevel {
  id: string;
  theme: MapTheme;
  size: MapSize;
  seed: number;
  duration: number;
  allies: CombatClassId[];
  outposts: OutpostDef[];
  stars: { maxDeaths: number; time: number };
  reward: { base: number; perStar: number };
}

export const LEVELS = levelsJson.levels as unknown as readonly CampaignLevel[];
export const ENEMIES = enemiesJson as unknown as {
  threatCost: Record<UnitType, number>;
  guard: { radius: number; leash: number };
  hqClearance: number;
  minSpacing: number;
};

export function levelById(id: string): CampaignLevel | undefined {
  return LEVELS.find((l) => l.id === id);
}

export interface PlacedUnit {
  type: UnitType | 'hq';
  x: number;
  y: number;
  /** Outpost index (-1 = HQ). */
  outpost: number;
}

/** Every tile in the (2c+1)² square around (x, y) can hold a tank. */
function clearAround(m: GameMap, x: number, y: number, c: number): boolean {
  for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) if (!isTileOpen(m, x + dx, y + dy)) return false;
  return true;
}

/**
 * Nearest tile to (ax, ay) (square spiral, deterministic order) that is reachable from the player's base,
 * has `clear` free tiles around it and keeps `spacing` tiles from every point in `taken`.
 */
function findSpot(m: GameMap, reach: Uint8Array, ax: number, ay: number, clear: number, taken: MapPoint[], spacing: number): MapPoint | null {
  const cx = Math.round(ax);
  const cy = Math.round(ay);
  for (let r = 0; r < 24; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= m.width - 1 || y >= m.height - 1) continue;
        if (!reach[y * m.width + x] || !clearAround(m, x, y, clear)) continue;
        if (taken.some((p) => Math.abs(p.x - x) < spacing && Math.abs(p.y - y) < spacing)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

/** Spends an outpost's budget on units from its pool (seeded). Always at least one unit. */
export function fillOutpost(o: OutpostDef, rng: Rng): UnitType[] {
  const out: UnitType[] = [];
  let budget = o.budget;
  for (let guard = 0; guard < 20; guard++) {
    const afford = o.pool.filter((u) => ENEMIES.threatCost[u] <= budget);
    if (!afford.length) break;
    const u = afford[rng.int(0, afford.length - 1)];
    out.push(u);
    budget -= ENEMIES.threatCost[u];
  }
  if (!out.length) out.push(o.pool[0]);
  return out;
}

/** Places the HQ and all outpost units of a level on its map (pure; used by the match and by tests). */
export function placeEnemies(level: CampaignLevel, map: GameMap): PlacedUnit[] {
  const rng = new Rng((level.seed ^ 0x0e7e5) >>> 0);
  const b0 = map.bases[0];
  const b1 = map.bases[1];
  const start = b0.spawns[0];
  const reach = floodFill(map, start.x, start.y);
  const taken: MapPoint[] = [...b0.spawns];
  const units: PlacedUnit[] = [];
  const hq = findSpot(map, reach, b1.x, b1.y, ENEMIES.hqClearance, taken, ENEMIES.minSpacing + 1) ?? { x: b1.x, y: b1.y };
  taken.push(hq);
  units.push({ type: 'hq', x: hq.x, y: hq.y, outpost: -1 });
  // direction base0 → base1 and its perpendicular (outposts sit along / beside that line)
  const dx = b1.x - b0.x;
  const dy = b1.y - b0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  level.outposts.forEach((o, oi) => {
    const ax = b0.x + dx * o.at + px * o.side;
    const ay = b0.y + dy * o.at + py * o.side;
    for (const type of fillOutpost(o, rng)) {
      const spot = findSpot(map, reach, ax + rng.range(-1.5, 1.5), ay + rng.range(-1.5, 1.5), type === 'tower' ? 1 : 0, taken, ENEMIES.minSpacing);
      if (!spot) continue;
      taken.push(spot);
      units.push({ type, x: spot.x, y: spot.y, outpost: oi });
    }
  });
  return units;
}

export interface CampaignOptions {
  level: CampaignLevel;
  playerClass: CombatClassId;
  aiLevel?: AiLevel;
  playerBoost?: TankBoost;
  playerName?: string;
  /** Debug/tests: shorter mission. */
  duration?: number;
  cooldownMul?: number;
}

export interface CampaignHandle extends MatchHandle {
  units: PlacedUnit[];
  /** Tank id of the enemy HQ. */
  hqId: number;
}

const ALLY_NAMES = ['Kurt', 'Şahin', 'Pars'];

export function createCampaignMatch(o: CampaignOptions): CampaignHandle {
  const lv = o.level;
  const map = generateThemed(lv.theme, lv.seed, lv.size);
  const units = placeEnemies(lv, map);
  const b0 = map.bases[0];
  const players: PlayerSpec[] = [];
  const team0: CombatClassId[] = [o.playerClass, ...lv.allies];
  team0.forEach((cls, k) => {
    const sp = b0.spawns[k % b0.spawns.length];
    players.push({ team: 0, cls, x: sp.x + 0.5, y: sp.y + 0.5, name: k === 0 ? (o.playerName ?? 'Sen') : ALLY_NAMES[(k - 1) % ALLY_NAMES.length], boost: k === 0 ? o.playerBoost : undefined });
  });
  let hqId = -1;
  for (const u of units) {
    if (u.type === 'hq') hqId = players.length;
    const cls: TankClassId = u.type;
    players.push({ team: 1, cls, x: u.x + 0.5, y: u.y + 0.5, name: u.type === 'hq' ? 'HQ' : `${u.type}-${u.outpost + 1}` });
  }
  const state: SimState = createState({
    seed: lv.seed,
    map,
    players,
    rules: { mode: 'campaign', duration: o.duration ?? lv.duration, cooldownMul: o.cooldownMul ?? 1 },
  });
  const bots: (Controller | null)[] = players.map((p, i) => {
    if (i === 0) return null;
    if (p.cls === 'hq') return null;
    if (p.cls === 'tower') return new TowerBot(i, o.aiLevel);
    const bot = new AiBot(i, lv.seed, o.aiLevel);
    if (p.team === 1) {
      const u = units[i - team0.length];
      bot.guard = { x: u.x + 0.5, y: u.y + 0.5, r: ENEMIES.guard.radius, leash: ENEMIES.guard.leash };
    }
    return bot;
  });
  return { state, bots, units, hqId };
}

export interface MissionResult {
  won: boolean;
  stars: number;
  /** Seconds of play used. */
  time: number;
  deaths: number;
  kills: number;
}

/** Stars: 1 = HQ destroyed, 2 = and deaths ≤ maxDeaths, 3 = and finished within stars.time seconds. */
export function missionResult(level: CampaignLevel, s: SimState, localId = 0): MissionResult {
  const me = s.tanks[localId];
  const won = s.match.winner === 0;
  const time = s.rules.duration - s.match.timeLeft;
  let stars = 0;
  if (won) {
    stars = 1;
    if (me.deaths <= level.stars.maxDeaths) {
      stars = 2;
      if (time <= level.stars.time) stars = 3;
    }
  }
  return { won, stars, time, deaths: me.deaths, kills: me.kills };
}

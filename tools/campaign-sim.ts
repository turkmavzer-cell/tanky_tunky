/**
 * Headless campaign check (round 05): plays every level with bots on both sides (tank 0 driven by a bot)
 * and prints placement, result and time. Usage: npx tsx tools/campaign-sim.ts [playerClass] [difficulty]
 */
import { LEVELS, createCampaignMatch, missionResult } from '../src/game/campaign';
import { stepMatch } from '../src/game/matchSetup';
import { AiBot, type AiLevel } from '../src/systems/ai/bot';
import type { CombatClassId } from '../src/sim/config';
import type { PlayerInput } from '../src/sim/input';

const cls = (process.argv[2] ?? 'standard') as CombatClassId;
const diff = (process.argv[3] ?? 'normal') as AiLevel;
for (const lv of LEVELS) {
  const t0 = Date.now();
  const m = createCampaignMatch({ level: lv, playerClass: cls, aiLevel: diff });
  const counts: Record<string, number> = {};
  for (const u of m.units) counts[u.type] = (counts[u.type] ?? 0) + 1;
  m.bots[0] = new AiBot(0, 1, diff);
  const inputs: PlayerInput[] = [];
  for (let k = 0; k < 60 * (lv.duration + 5) && m.state.match.phase !== 'ended'; k++) stepMatch(m, null, inputs);
  const dead = m.state.tanks.filter((t) => t.team === 1 && !t.alive).length;
  const r = missionResult(lv, m.state);
  console.log(`${lv.id} ${lv.theme} units=${JSON.stringify(counts)} won=${r.won} stars=${r.stars} t=${Math.round(r.time)}s deaths=${r.deaths} enemyDead=${dead}/${m.units.length} hqHp=${Math.round(m.state.tanks[m.hqId].hp)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

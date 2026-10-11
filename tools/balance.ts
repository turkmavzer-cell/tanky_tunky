/**
 * Bot-vs-bot balance simulation (brief §10.2). Runs headless full-length matches (match.json) with random
 * 3v3 rosters and reports per-class win rate (team with more kills wins; draws excluded), K/D,
 * kills per match, ability uses and charge usage.
 * Usage: npx tsx tools/balance.ts [matches] [mapSize] [easy|normal|hard|extreme] (default 200 40 hard)
 * Output: markdown table on stdout (copied into docs/BALANCE_REPORT.md).
 */
import { MATCH, TANK_CLASSES, type TankClassId } from '../src/sim/config';
import type { AiLevel } from '../src/systems/ai/bot';
import { Rng } from '../src/sim/rng';
import { runHeadless } from '../src/game/matchSetup';

const N = Number(process.argv[2] ?? 200);
const size = Number(process.argv[3] ?? 40) as 40 | 64 | 96;
const level = (process.argv[4] ?? 'hard') as AiLevel;
type Agg = { games: number; wins: number; losses: number; kills: number; deaths: number; abilities: number; shots: number; charged: number };
const agg = Object.fromEntries(TANK_CLASSES.map((c) => [c, { games: 0, wins: 0, losses: 0, kills: 0, deaths: 0, abilities: 0, shots: 0, charged: 0 } as Agg])) as Record<TankClassId, Agg>;
let draws = 0;
let totalKills = 0;
const r = new Rng(20261008);
const t0 = performance.now();
for (let g = 0; g < N; g++) {
  const pick = (): TankClassId => TANK_CLASSES[r.int(0, TANK_CLASSES.length - 1)];
  const teams: [TankClassId[], TankClassId[]] = [
    [pick(), pick(), pick()],
    [pick(), pick(), pick()],
  ];
  const seed = r.nextU32();
  const abil = new Map<number, number>();
  const shots = new Map<number, number>();
  const charged = new Map<number, number>();
  const m = runHeadless({ seed, mapSize: size, teams, aiLevel: level }, (h) => {
    for (const e of h.state.events) {
      if (e.type === 'ability' && e.phase === 'start') abil.set(e.tank, (abil.get(e.tank) ?? 0) + 1);
      if (e.type === 'fire') {
        shots.set(e.tank, (shots.get(e.tank) ?? 0) + 1);
        if (e.charge >= 0.3) charged.set(e.tank, (charged.get(e.tank) ?? 0) + 1);
      }
    }
  });
  const k0 = m.state.tanks.filter((t) => t.team === 0).reduce((a, t) => a + t.kills, 0);
  const k1 = m.state.tanks.filter((t) => t.team === 1).reduce((a, t) => a + t.kills, 0);
  totalKills += k0 + k1;
  const winner = k0 > k1 ? 0 : k1 > k0 ? 1 : -1;
  if (winner < 0) draws++;
  for (const t of m.state.tanks) {
    const a = agg[t.cls];
    a.games++;
    if (winner === t.team) a.wins++;
    else if (winner >= 0) a.losses++;
    a.kills += t.kills;
    a.deaths += t.deaths;
    a.abilities += abil.get(t.id) ?? 0;
    a.shots += shots.get(t.id) ?? 0;
    a.charged += charged.get(t.id) ?? 0;
  }
}
const secs = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`Matches: ${N} (3v3, ${size}x${size}, ${MATCH.duration} s, random rosters, ${level} bots) — draws ${draws} (${((draws / N) * 100).toFixed(0)} %), avg kills/match ${(totalKills / N).toFixed(1)}, runtime ${secs} s\n`);
console.log('| Class | Appearances | Win rate (decisive) | K/D | Kills / match | Ability uses / match | Shots / match | Charged shots (≥30 %) | Band 45–55 % |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const c of TANK_CLASSES) {
  const a = agg[c];
  const dec = a.wins + a.losses;
  const wr = dec ? (a.wins / dec) * 100 : 0;
  const ok = wr >= 45 && wr <= 55 ? '✅' : '❌';
  console.log(`| ${c} | ${a.games} | ${wr.toFixed(1)} % | ${(a.kills / Math.max(1, a.deaths)).toFixed(2)} | ${(a.kills / a.games).toFixed(2)} | ${(a.abilities / a.games).toFixed(2)} | ${(a.shots / a.games).toFixed(1)} | ${a.shots ? ((a.charged / a.shots) * 100).toFixed(0) : 0} % | ${ok} |`);
}

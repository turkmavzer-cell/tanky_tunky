import { describe, expect, it } from 'vitest';
import { LEVELS, ENEMIES, buildLevelMap, createCampaignMatch, fillOutpost, missionResult, placeEnemies } from '../src/game/campaign';
import { stepMatch } from '../src/game/matchSetup';
import { Rng } from '../src/sim/rng';
import { step } from '../src/sim/sim';
import { EMPTY_INPUT, type PlayerInput } from '../src/sim/input';
import { isTileOpen } from '../src/world/passability';
import { distanceField, floodFill } from '../src/world/reach';
import { hashState } from '../src/sim/hash';
import { AiBot } from '../src/systems/ai/bot';
import { TowerBot } from '../src/systems/ai/tower';
import { TANKS } from '../src/sim/config';

describe('campaign levels (round 05, D)', () => {
  it('has the maze level: 64x64 hand-made map with valid outposts', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(1);
    for (const lv of LEVELS) {
      expect(lv.map).toBeTruthy();
      expect(lv.size).toBe(64);
      for (const o of lv.outposts) {
        expect(o.cell).toBeTruthy();
        for (const u of o.pool) expect(ENEMIES.threatCost[u]).toBeGreaterThan(0);
      }
    }
  });

  it('is a real maze: the way to the HQ is far longer than the straight line and has no shortcut', () => {
    for (const lv of LEVELS) {
      const map = buildLevelMap(lv);
      const s0 = map.bases[0];
      const hq = map.bases[1];
      const dist = distanceField(map, s0.x, s0.y);
      const way = dist[hq.y * map.width + hq.x];
      const straight = Math.hypot(hq.x - s0.x, hq.y - s0.y);
      expect(Number.isFinite(way)).toBe(true);
      expect(way).toBeGreaterThan(straight * 2.2);
      // most of the map is wall: the open area is a network of corridors, not a field
      let open = 0;
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isTileOpen(map, x, y)) open++;
      expect(open / (map.width * map.height)).toBeLessThan(0.6);
      // every open tile is connected to the start (no sealed pockets)
      const reach = floodFill(map, s0.x, s0.y);
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isTileOpen(map, x, y)) expect(reach[y * map.width + x]).toBe(1);
    }
  });

  it('outpost solver never overspends its budget and is deterministic', () => {
    const o = { cell: [3, 3] as [number, number], budget: 7, pool: ['tower', 'heavy', 'scout'] as const };
    const a = fillOutpost({ ...o, pool: [...o.pool] }, new Rng(9));
    const b = fillOutpost({ ...o, pool: [...o.pool] }, new Rng(9));
    expect(a).toEqual(b);
    expect(a.reduce((s, u) => s + ENEMIES.threatCost[u], 0)).toBeLessThanOrEqual(7);
    expect(a.length).toBeGreaterThan(0);
  });

  it('places one HQ and every unit on an open tile reachable from the player base', () => {
    for (const lv of LEVELS) {
      const map = buildLevelMap(lv);
      const units = placeEnemies(lv, map);
      expect(units.filter((u) => u.type === 'hq').length).toBe(1);
      expect(units.length).toBeGreaterThan(lv.outposts.length);
      const s0 = map.bases[0].spawns[0];
      const reach = floodFill(map, s0.x, s0.y);
      for (const u of units) {
        expect(isTileOpen(map, u.x, u.y)).toBe(true);
        expect(reach[u.y * map.width + u.x]).toBe(1);
      }
      // units keep their spacing
      for (let i = 0; i < units.length; i++)
        for (let j = i + 1; j < units.length; j++) expect(Math.max(Math.abs(units[i].x - units[j].x), Math.abs(units[i].y - units[j].y))).toBeGreaterThanOrEqual(ENEMIES.minSpacing);
    }
  });

  it('builds the match: towers get TowerBots, enemy tanks guard their outpost, HQ has no controller', () => {
    const m = createCampaignMatch({ level: LEVELS[0], playerClass: 'heavy' });
    expect(m.state.rules.mode).toBe('campaign');
    expect(m.bots[0]).toBeNull();
    expect(m.bots[m.hqId]).toBeNull();
    m.state.tanks.forEach((t, i) => {
      if (t.cls === 'tower') expect(m.bots[i]).toBeInstanceOf(TowerBot);
      if (t.team === 1 && t.cls !== 'tower' && t.cls !== 'hq') expect((m.bots[i] as AiBot).guard).not.toBeNull();
    });
  });

  it('is deterministic: same level + class → identical state after 20 s', () => {
    const run = (): string => {
      const m = createCampaignMatch({ level: LEVELS[0], playerClass: 'standard', aiLevel: 'hard' });
      m.bots[0] = new AiBot(0, 3, 'hard');
      const inputs: PlayerInput[] = [];
      for (let k = 0; k < 60 * 23; k++) stepMatch(m, null, inputs);
      return hashState({ t: m.state.tanks, k: m.state.match.kills });
    };
    expect(run()).toBe(run());
  });
});

describe('campaign rules', () => {
  it('structures never move, never respawn and do not regenerate', () => {
    const m = createCampaignMatch({ level: LEVELS[0], playerClass: 'scout', duration: 60 });
    const s = m.state;
    const tower = s.tanks.find((t) => t.cls === 'tower')!;
    const x0 = tower.x;
    const y0 = tower.y;
    for (let k = 0; k < 60 * 4; k++) step(s, s.tanks.map(() => ({ ...EMPTY_INPUT, moveX: 127 })));
    expect(tower.x).toBe(x0);
    expect(tower.y).toBe(y0);
    tower.hp = 100;
    for (let k = 0; k < 60 * 12; k++) step(s, s.tanks.map(() => EMPTY_INPUT));
    expect(tower.hp).toBe(100);
    tower.alive = false;
    tower.respawn = 0;
    for (let k = 0; k < 60 * 3; k++) step(s, s.tanks.map(() => EMPTY_INPUT));
    expect(tower.alive).toBe(false);
  });

  it('destroying the HQ wins the mission; stars follow deaths and time', () => {
    const lv = LEVELS[0];
    const m = createCampaignMatch({ level: lv, playerClass: 'heavy' });
    const s = m.state;
    for (let k = 0; k < 60 * 4; k++) step(s, s.tanks.map(() => EMPTY_INPUT)); // countdown + 1 s
    s.tanks[m.hqId].alive = false;
    step(s, s.tanks.map(() => EMPTY_INPUT));
    expect(s.match.phase).toBe('ended');
    expect(s.match.winner).toBe(0);
    expect(missionResult(lv, s).stars).toBe(3);
    s.tanks[0].deaths = lv.stars.maxDeaths + 1;
    expect(missionResult(lv, s).stars).toBe(1);
  });

  it('running out of time loses the mission (no stars)', () => {
    const lv = LEVELS[0];
    const m = createCampaignMatch({ level: lv, playerClass: 'standard', duration: 2 });
    const s = m.state;
    for (let k = 0; k < 60 * 6 && s.match.phase !== 'ended'; k++) step(s, s.tanks.map(() => EMPTY_INPUT));
    expect(s.match.phase).toBe('ended');
    expect(s.match.winner).toBe(1);
    const r = missionResult(lv, s);
    expect(r.won).toBe(false);
    expect(r.stars).toBe(0);
  });

  it('a tower shoots an enemy that comes into range', () => {
    const m = createCampaignMatch({ level: LEVELS[0], playerClass: 'heavy', aiLevel: 'extreme' });
    const s = m.state;
    const ti = s.tanks.findIndex((t) => t.cls === 'tower');
    const tower = s.tanks[ti];
    const me = s.tanks[0];
    // put the player right next to the tower on an open tile
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (isTileOpen(s.map, Math.floor(tower.x) + dx, Math.floor(tower.y) + dy)) {
        me.x = tower.x + dx;
        me.y = tower.y + dy;
        break;
      }
    }
    const hp0 = me.hp;
    const inputs: PlayerInput[] = [];
    m.bots = m.bots.map((b, i) => (i === ti ? b : null));
    for (let k = 0; k < 60 * 7; k++) stepMatch(m, EMPTY_INPUT, inputs);
    expect(me.hp + me.deaths * TANKS.heavy.hp).toBeLessThan(hp0);
  });
});

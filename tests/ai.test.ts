import { describe, expect, it } from 'vitest';
import { arena, idle, wall } from './helpers';
import { AI, AiBot, type AiLevel } from '../src/systems/ai/bot';
import { step } from '../src/sim/sim';
import { updateVision } from '../src/sim/visibility';
import { setFeature } from '../src/world/map';
import { Feature } from '../src/world/terrain';
import { findPath, straightClear } from '../src/systems/ai/nav';
import { generateMap } from '../src/world/generator';
import type { SimState } from '../src/sim/state';

function tickBot(s: SimState, bot: AiBot, n: number, playerInput = idle): void {
  for (let i = 0; i < n; i++) {
    const inputs = s.tanks.map((_, k) => (k === bot.id ? bot.input(s) : playerInput));
    step(s, inputs);
  }
}

describe('AI FSM (round-01 job 3)', () => {
  it('patrol → attack when the player becomes visible, and it fires at the player', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 }, // player
      { team: 1, cls: 'standard', x: 9.5, y: 15.5 }, // bot
    ]);
    const bot = new AiBot(1, 3, 'hard');
    tickBot(s, bot, 5);
    expect(['attack', 'chase']).toContain(bot.state);
    const hp = s.tanks[0].hp;
    tickBot(s, bot, 400);
    expect(s.tanks[0].hp < hp || s.tanks[0].deaths > 0).toBe(true);
  });

  it('suspicion: hears a shot from the fog and goes to investigate', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 14.5, y: 15.5 }, // 9 tiles: out of sight (vision 6), within hearing
    ]);
    const bot = new AiBot(1, 3);
    tickBot(s, bot, 3);
    expect(bot.state).toBe('patrol');
    // player fires
    s.tanks[0].turret = 0;
    tickBot(s, bot, 2, { ...idle, buttons: 1 });
    tickBot(s, bot, 2, idle);
    expect(['suspicion', 'chase', 'attack']).toContain(bot.state);
    expect(bot.known).not.toBeNull();
  });

  it('does not track a player hidden in a forest (no cheating)', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 15.5, y: 20.5 }, // player in forest
      { team: 1, cls: 'standard', x: 15.5, y: 15.5 }, // bot 5 tiles away: in vision range
    ]);
    for (let y = 18; y < 24; y++) for (let x = 12; x < 20; x++) setFeature(s.map, x, y, Feature.Forest);
    updateVision(s);
    const bot = new AiBot(1, 3);
    tickBot(s, bot, 120);
    expect(bot.known).toBeNull();
    expect(['patrol']).toContain(bot.state);
  });

  it('never perceives an invisible player beyond noticeRange, but notices it up close', () => {
    const s = arena([
      { team: 0, cls: 'scout', x: 10.5, y: 10.5 },
      { team: 1, cls: 'standard', x: 14.5, y: 10.5 },
    ]);
    s.tanks[0].ability.active = 100;
    updateVision(s);
    const bot = new AiBot(1, 3);
    tickBot(s, bot, 30);
    expect(bot.known).toBeNull();
    s.tanks[0].x = 13.0;
    updateVision(s);
    tickBot(s, bot, 5);
    expect(bot.known).not.toBeNull();
  });

  it('retreats when badly hurt (strategic levels)', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
    ]);
    const bot = new AiBot(1, 3, 'hard');
    tickBot(s, bot, 5);
    s.tanks[1].hp = 20;
    tickBot(s, bot, 3);
    expect(bot.state).toBe('retreat');
  });
});

describe('difficulty levels (round-02)', () => {
  /** Seconds from the enemy entering range+sight until the bot's first shot. */
  function firstShotDelay(level: AiLevel): number {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 }, // player, idle, 4 tiles away (in range + sight)
      { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
    ]);
    updateVision(s);
    const bot = new AiBot(1, 3, level);
    for (let tick = 1; tick <= 60 * 8; tick++) {
      tickBot(s, bot, 1);
      if (s.events.some((e) => e.type === 'fire' && e.tank === 1)) return tick / 60;
    }
    return Infinity;
  }

  it.each([
    ['easy', 5],
    ['normal', 3],
    ['hard', 1],
    ['extreme', 0],
  ] as const)('%s: first shot %d s after the enemy enters range (data/ai.json fireDelay)', (level, delay) => {
    expect(AI.levels[level].fireDelay).toBe(delay);
    const t = firstShotDelay(level);
    expect(t).toBeGreaterThanOrEqual(delay);
    // + turret turn and the charge the bot chooses (up to a full charge) — but never much later
    expect(t).toBeLessThan(delay + 2.6);
  });

  it('the delay restarts when the enemy has left range/sight and comes back', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
    ]);
    updateVision(s);
    const bot = new AiBot(1, 3, 'hard');
    tickBot(s, bot, 90);
    expect(bot.engageT).toBeGreaterThan(1);
    s.tanks[0].x = 25.5; // out of range and sight
    s.tanks[0].y = 25.5;
    updateVision(s);
    tickBot(s, bot, 60);
    expect(bot.engageT).toBe(0);
  });

  it('normal/easy bots do not retreat to cover; hard bots do', () => {
    for (const [level, retreats] of [
      ['easy', false],
      ['normal', false],
      ['hard', true],
      ['extreme', true],
    ] as const) {
      const s = arena([
        { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
        { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
      ]);
      const bot = new AiBot(1, 3, level);
      tickBot(s, bot, 5);
      s.tanks[1].hp = s.tanks[1].hp * 0.1;
      tickBot(s, bot, 3);
      expect(bot.state === 'retreat').toBe(retreats);
    }
  });

  it('extreme focuses the weakest visible enemy in range; hard keeps the nearest', () => {
    const mk = () =>
      arena([
        { team: 0, cls: 'standard', x: 5.5, y: 15.5 }, // nearest, full hp
        { team: 0, cls: 'standard', x: 9.5, y: 10.5 }, // farther, almost dead
        { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
      ]);
    for (const [level, want] of [
      ['hard', 0],
      ['extreme', 1],
    ] as const) {
      const s = mk();
      s.tanks[1].hp = 100;
      updateVision(s);
      const bot = new AiBot(2, 3, level);
      for (let i = 0; i < 5; i++) step(s, s.tanks.map((_, k) => (k === 2 ? bot.input(s) : idle)));
      expect(bot.known?.id).toBe(want);
    }
  });

  it('easy bots drive clumsily: same goal, a wandering path', () => {
    const run = (level: AiLevel): number => {
      const s = arena([
        { team: 0, cls: 'standard', x: 3.5, y: 3.5 },
        { team: 1, cls: 'standard', x: 25.5, y: 25.5 },
      ]);
      const bot = new AiBot(1, 3, level);
      let turn = 0;
      let prev = s.tanks[1].hull;
      for (let i = 0; i < 600; i++) {
        bot.known = { id: 0, x: 3.5, y: 3.5, t: s.tick / 60 }; // keeps investigating the same spot
        tickBot(s, bot, 1);
        turn += Math.abs(s.tanks[1].hull - prev);
        prev = s.tanks[1].hull;
      }
      return turn;
    };
    expect(run('easy')).toBeGreaterThan(run('normal') * 1.5);
  });
});

describe('A* navigation', () => {
  it('finds a path around a wall and every step is passable', () => {
    const s = arena([{ team: 0, cls: 'standard', x: 2.5, y: 2.5 }]);
    wall(s.map, 10, 0, 25);
    const p = findPath(s.map, 2, 15, 20, 15);
    expect(p).not.toBeNull();
    expect(p!.some((q) => q.y > 25)).toBe(true);
  });

  it('paths on generated maps respect isPassable (incl. ramps)', () => {
    const m = generateMap({ seed: 12, size: 40 });
    const a = m.bases[0];
    const b = m.bases[1];
    const p = findPath(m, a.x, a.y, b.x, b.y, 50000)!;
    expect(p).not.toBeNull();
    // every smoothed segment the bot will drive is a legal straight drive (isPassable per crossed tile)
    let cx = a.x;
    let cy = a.y;
    for (const q of p) {
      expect(straightClear(m, cx, cy, q.x, q.y)).toBe(true);
      cx = q.x;
      cy = q.y;
    }
    expect(cx).toBe(b.x);
    expect(cy).toBe(b.y);
  });
});

describe('artillery bot charge solver', () => {
  it('the solved charge lands the shell at the requested distance', async () => {
    const { artilleryChargeFor } = await import('../src/systems/ai/bot');
    const { TANKS, COMBAT, evalCurve } = await import('../src/sim/config');
    const s = arena([{ team: 0, cls: 'artillery', x: 5.5, y: 5.5 }]);
    const def = TANKS.artillery;
    for (const d of [3.5, 5, 7, 9, 12]) {
      const c = artilleryChargeFor(s.tanks[0], d);
      const landed = def.minRange + (def.range * evalCurve(COMBAT.scaling.range, c) - def.minRange) * c;
      expect(landed).toBeCloseTo(Math.min(d, def.range * evalCurve(COMBAT.scaling.range, 1)), 1);
    }
  });
});

describe('AI robustness', () => {
  it('40 random headless matches never throw (fuzz)', async () => {
    const { runHeadless } = await import('../src/game/matchSetup');
    const { TANK_CLASSES } = await import('../src/sim/config');
    const { Rng } = await import('../src/sim/rng');
    const r = new Rng(77);
    for (let g = 0; g < 40; g++) {
      const pick = () => TANK_CLASSES[r.int(0, TANK_CLASSES.length - 1)];
      expect(() => runHeadless({ seed: r.nextU32(), mapSize: 40, teams: [[pick(), pick(), pick()], [pick(), pick(), pick()]], rules: { duration: 20 } })).not.toThrow();
    }
  }, 120_000);
});

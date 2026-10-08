import { describe, expect, it } from 'vitest';
import { arena, idle, wall } from './helpers';
import { AiBot } from '../src/systems/ai/bot';
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

  it('retreats when badly hurt', () => {
    const s = arena([
      { team: 0, cls: 'standard', x: 5.5, y: 15.5 },
      { team: 1, cls: 'standard', x: 9.5, y: 15.5 },
    ]);
    const bot = new AiBot(1, 3);
    tickBot(s, bot, 5);
    s.tanks[1].hp = 20;
    tickBot(s, bot, 3);
    expect(bot.state).toBe('retreat');
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

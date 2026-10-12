import { describe, expect, it } from 'vitest';
import { maxHp } from '../src/sim/upgrades';
import { LEVELS, buildLevelMap, createCampaignMatch } from '../src/game/campaign';
import { stepMatch } from '../src/game/matchSetup';
import { step } from '../src/sim/sim';
import { EMPTY_INPUT, BTN_BUILD, type PlayerInput } from '../src/sim/input';
import { TANKS } from '../src/sim/config';
import { BUILD, inOwnZone } from '../src/sim/build';
import { isTileOpen } from '../src/world/passability';
import { TowerBot } from '../src/systems/ai/tower';

const lv = LEVELS[0];
const press: PlayerInput = { ...EMPTY_INPUT, buttons: BTN_BUILD };

function playing(playerClass: 'scout' | 'standard' | 'heavy' = 'scout') {
  const m = createCampaignMatch({ level: lv, playerClass, duration: 600 });
  m.bots.fill(null); // freeze every controller; tests drive inputs by hand
  const s = m.state;
  s.match.phase = 'playing';
  return { m, s };
}

describe('towers (round 09)', () => {
  it('tower stats: 10 000 hp, a 500 lob every 5 s, 250 fragments', () => {
    const t = TANKS.tower;
    expect(t.hp).toBe(10000);
    expect(t.fireCooldown).toBe(5);
    expect(t.damage * 1.25).toBe(500);
    expect(t.frag!.damage).toBe(250);
  });

  it('has 3 towers per zone for both teams, on open 3x3 ground, plus 3 dormant build slots', () => {
    const map = buildLevelMap(lv);
    for (const team of [0, 1]) {
      for (const zone of ['top', 'mid', 'bottom']) {
        const list = lv.towers!.filter((x) => x.team === team && x.zone === zone);
        expect(list.length).toBe(3);
      }
    }
    for (const tw of lv.towers!) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(isTileOpen(map, tw.x + dx, tw.y + dy)).toBe(true);
    const { s } = playing();
    expect(s.tanks.filter((t) => t.cls === 'tower' && !t.reserve).length).toBe(18);
    expect(s.tanks.filter((t) => t.reserve && !t.alive).length).toBe(3);
  });

  it('our own towers are controlled by TowerBots', () => {
    const m = createCampaignMatch({ level: lv, playerClass: 'scout' });
    m.state.tanks.forEach((t, i) => { if (t.cls === 'tower') expect(m.bots[i]).toBeInstanceOf(TowerBot); });
  });

  it('lobbed shell: 500 at the centre, 250 fragments only in the outer ring', () => {
    const { s } = playing();
    const tower = s.tanks.find((t) => t.cls === 'tower' && t.team === 1)!;
    const a = s.tanks[0];
    const b = s.tanks[1];
    a.x = tower.x - 6; a.y = tower.y; 
    b.x = a.x - 2.5; b.y = a.y;  // inside the fragment ring (1.3 .. 3.6) of a shell landing on a
    for (const o of s.tanks) if (o !== tower && o !== a && o !== b && o.cls !== 'hq') o.alive = false;
    const ha = maxHp(a); const hb = maxHp(b); a.hp = ha; b.hp = hb;
    const bot = new TowerBot(tower.id, 'normal');
    let first = 0;
    for (let k = 0; k < 60 * 12 && first === 0; k++) {
      const input = s.tanks.map((t) => (t === tower ? bot.input(s) : EMPTY_INPUT));
      step(s, input);
      for (const e of s.events) if (e.type === 'hit') { if (e.target === a.id) first = e.damage; }
    }
    expect(first).toBeCloseTo(500 * (1 - TANKS[a.cls].armor), 0);
    expect(ha - a.hp).toBeCloseTo(first, 5); // fragments never hit the unit under the centre twice
    expect(hb - b.hp).toBeCloseTo(250 * (1 - TANKS[b.cls].armor), 5);
    expect(tower.hp).toBe(TANKS.tower.hp);
  });

  describe('building', () => {
    it('builds a tower ahead of the player inside the own zone, then needs the cooldown', () => {
      const { s } = playing();
      const p = s.tanks[0];
      const sp = s.map.bases[0];
      p.x = sp.x + 0.5; p.y = sp.y - 6 + 0.5; p.hull = -Math.PI / 2; // lane south of the base, facing along it
      expect(inOwnZone(s, 0, p.x, p.y)).toBe(true);
      const inputs = s.tanks.map((_, i) => (i === 0 ? press : EMPTY_INPUT));
      step(s, inputs);
      const built = s.events.find((e) => e.type === 'build');
      const fail = s.events.find((e) => e.type === 'buildFail');
      expect(built || fail).toBeTruthy();
      if (built) {
        expect(s.tanks.filter((t) => t.reserve && t.alive).length).toBe(1);
        expect(p.buildCd).toBeCloseTo(BUILD.cooldown, 1);
        step(s, s.tanks.map(() => EMPTY_INPUT));
        step(s, inputs);
        expect(s.events.find((e) => e.type === 'buildFail')).toMatchObject({ reason: 'cooldown' });
      }
    });

    it('refuses to build in the enemy half', () => {
      const { s } = playing();
      const p = s.tanks[0];
      const foe = s.map.bases[1];
      p.x = foe.x - 3 + 0.5; p.y = foe.y + 3 + 0.5; p.hull = 0;
      step(s, s.tanks.map((_, i) => (i === 0 ? press : EMPTY_INPUT)));
      expect(s.events.find((e) => e.type === 'buildFail')).toMatchObject({ reason: 'zone' });
    });

    it('is capped by the number of slots', () => {
      const { s } = playing();
      const p = s.tanks[0];
      const sp = s.map.bases[0];
      p.x = sp.x + 0.5; p.y = sp.y - 6 + 0.5; p.hull = -Math.PI / 2;
      let built = 0;
      for (let k = 0; k < 6; k++) {
        p.buildCd = 0;
        p.x = sp.x + 0.5; p.y = sp.y - 6 + 0.5 - k * 2.5; // move on so the new tower does not block
        step(s, s.tanks.map(() => EMPTY_INPUT));
        step(s, s.tanks.map((_, i) => (i === 0 ? press : EMPTY_INPUT)));
        if (s.events.some((e) => e.type === 'build')) built++;
      }
      expect(built).toBeLessThanOrEqual(lv.build!.slots);
      expect(s.tanks.filter((t) => t.reserve && t.alive).length).toBe(built);
    });
  });

  it('stays deterministic with towers firing', () => {
    const run = (): number => {
      const m = createCampaignMatch({ level: lv, playerClass: 'standard' });
      const inputs: PlayerInput[] = [];
      for (let k = 0; k < 60 * 15; k++) stepMatch(m, null, inputs);
      return m.state.tanks.reduce((a, t) => a + t.hp, 0);
    };
    expect(run()).toBe(run());
  });
});

import { describe, expect, it } from 'vitest';
import { createState, step, cloneState } from '../src/sim/sim';
import { hashState } from '../src/sim/hash';
import { Rng } from '../src/sim/rng';
import { packInput, unpackInput, type PlayerInput } from '../src/sim/input';

function scriptedInputs(seed: number, ticks: number, players: number): number[][] {
  const r = new Rng(seed);
  const out: number[][] = [];
  for (let t = 0; t < ticks; t++) {
    const row: number[] = [];
    for (let p = 0; p < players; p++) {
      const inp: PlayerInput = { moveX: r.int(-127, 127), moveY: r.int(-127, 127), aim: r.int(0, 4095), buttons: r.int(0, 3) };
      row.push(packInput(inp));
    }
    out.push(row);
  }
  return out;
}

function run(seed: number, inputs: number[][]): string {
  const s = createState({
    seed,
    width: 40,
    height: 40,
    players: [
      { team: 0, cls: 'standard', x: 5, y: 5 },
      { team: 1, cls: 'heavy', x: 30, y: 30 },
      { team: 1, cls: 'scout', x: 20, y: 8 },
    ],
  });
  for (const row of inputs) step(s, row.map(unpackInput));
  return hashState(s);
}

describe('deterministic simulation', () => {
  it('same seed + same input stream = identical state hash', () => {
    const inputs = scriptedInputs(99, 3600, 3);
    expect(run(1234, inputs)).toBe(run(1234, inputs));
  });

  it('a single changed input changes the outcome', () => {
    const inputs = scriptedInputs(99, 600, 3);
    const changed = inputs.map((r) => [...r]);
    changed[300][0] = packInput({ moveX: 127, moveY: 127, aim: 0, buttons: 0 });
    expect(run(1234, inputs)).not.toBe(run(1234, changed));
  });

  it('snapshot + resume equals uninterrupted run (replay/rollback foundation)', () => {
    const inputs = scriptedInputs(5, 1200, 1).map((r) => r.map(unpackInput));
    const mk = () => createState({ seed: 8, width: 24, height: 24, players: [{ team: 0, cls: 'standard', x: 12, y: 12 }] });
    const a = mk();
    for (const row of inputs) step(a, row);
    const b = mk();
    for (let i = 0; i < 600; i++) step(b, inputs[i]);
    const snap = cloneState(b);
    for (let i = 600; i < 1200; i++) step(snap, inputs[i]);
    expect(hashState(snap)).toBe(hashState(a));
  });

  it('tanks stay inside the map bounds', () => {
    const s = createState({ seed: 1, width: 10, height: 10, players: [{ team: 0, cls: 'scout', x: 5, y: 5 }] });
    for (let i = 0; i < 2000; i++) step(s, [{ moveX: 127, moveY: -127, aim: -1, buttons: 0 }]);
    expect(s.tanks[0].x).toBeLessThanOrEqual(10);
    expect(s.tanks[0].y).toBeGreaterThanOrEqual(0);
  });
});

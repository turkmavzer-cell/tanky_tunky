/**
 * Deterministic, serializable PRNG (sfc32). The full state is four uint32 values so it can be
 * stored in snapshots and replays. Never use Math.random() inside the simulation.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export class Rng {
  a: number;
  b: number;
  c: number;
  d: number;

  constructor(seed: number | RngState) {
    if (typeof seed === 'number') {
      this.a = 0x9e3779b9;
      this.b = 0x243f6a88;
      this.c = 0xb7e15162;
      this.d = seed >>> 0;
      for (let i = 0; i < 12; i++) this.nextU32();
    } else {
      this.a = seed.a >>> 0;
      this.b = seed.b >>> 0;
      this.c = seed.c >>> 0;
      this.d = seed.d >>> 0;
    }
  }

  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  state(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }
}

/** Stable 32-bit string hash (FNV-1a), e.g. for date-based daily seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

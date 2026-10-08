/** FNV-1a over the canonical JSON of a value; used to compare simulation states bit-exactly. */
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

export function hashState(value: unknown): string {
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    h ^= n;
    h = Math.imul(h, 0x01000193);
  };
  const walk = (v: unknown): void => {
    if (typeof v === 'number') {
      f64[0] = v;
      mix(u32[0]);
      mix(u32[1]);
    } else if (typeof v === 'string') {
      for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i));
    } else if (typeof v === 'boolean') {
      mix(v ? 1 : 2);
    } else if (ArrayBuffer.isView(v)) {
      const b = v as unknown as ArrayLike<number>;
      mix(0xa2);
      for (let i = 0; i < b.length; i++) mix(b[i] | 0);
    } else if (Array.isArray(v)) {
      mix(0xa1);
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object') {
      mix(0x0b);
      for (const k of Object.keys(v).sort()) {
        walk(k);
        walk((v as Record<string, unknown>)[k]);
      }
    } else {
      mix(0);
    }
  };
  walk(value);
  return (h >>> 0).toString(16).padStart(8, '0');
}

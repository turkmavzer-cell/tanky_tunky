/**
 * Deterministic math for the simulation (see DECISIONS D-004).
 * Only IEEE-754 basic operations and sqrt are used, which are bit-exact across JS engines.
 * Angles are radians in (-PI, PI].
 */
export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  if (a > PI || a <= -PI) {
    a = a - TAU * Math.floor((a + PI) / TAU);
    if (a <= -PI) a += TAU;
  }
  return a;
}

/** sin on (-PI, PI] using range reduction to [-PI/2, PI/2] and an odd Taylor/minimax polynomial. */
export function dsin(x: number): number {
  x = wrapAngle(x);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  // Taylor series up to x^15 (Horner form) — max error < 1e-12 on [-PI/2, PI/2]
  let p = -1 / 1307674368000;
  p = 1 / 6227020800 + x2 * p;
  p = -1 / 39916800 + x2 * p;
  p = 1 / 362880 + x2 * p;
  p = -1 / 5040 + x2 * p;
  p = 1 / 120 + x2 * p;
  p = -1 / 6 + x2 * p;
  p = 1 + x2 * p;
  return x * p;
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** atan on [-1, 1] — minimax-style polynomial via argument halving, error < 1e-9. */
function datanUnit(x: number): number {
  // reduce: atan(x) = 2*atan(x / (1 + sqrt(1 + x^2)))  -> |x| <= 0.4142
  const r = x / (1 + Math.sqrt(1 + x * x));
  const r2 = r * r;
  // Taylor series for atan on |r| <= 0.4142 up to r^21
  let s = 1 / 21;
  s = 1 / 19 - r2 * s;
  s = 1 / 17 - r2 * s;
  s = 1 / 15 - r2 * s;
  s = 1 / 13 - r2 * s;
  s = 1 / 11 - r2 * s;
  s = 1 / 9 - r2 * s;
  s = 1 / 7 - r2 * s;
  s = 1 / 5 - r2 * s;
  s = 1 / 3 - r2 * s;
  s = 1 - r2 * s;
  return 2 * r * s;
}

export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a: number;
  if (ax >= ay) a = datanUnit(ay / ax);
  else a = HALF_PI - datanUnit(ax / ay);
  if (x < 0) a = PI - a;
  if (y < 0) a = -a;
  return a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed difference b - a between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Rotate angle `from` toward `to` by at most `maxStep` radians. */
export function rotateToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + (d > 0 ? maxStep : -maxStep));
}

/** Lerp between angles along the shortest path (render interpolation). */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDiff(a, b) * t);
}

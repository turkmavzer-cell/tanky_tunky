/**
 * 2:1 dimetric isometric projection (brief §7). World coordinates are tile units (x, y);
 * screen coordinates are pixels at zoom 1. Tile (0,0)'s top corner sits at screen (0,0)
 * and the centre of tile (tx, ty) is at world (tx + 0.5, ty + 0.5).
 */
export const TILE_W = 128;
export const TILE_H = 64;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

export interface Vec2 {
  x: number;
  y: number;
}

export function worldToScreenX(wx: number, wy: number): number {
  return (wx - wy) * HW;
}

export function worldToScreenY(wx: number, wy: number): number {
  return (wx + wy) * HH;
}

export function worldToScreen(wx: number, wy: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  out.x = (wx - wy) * HW;
  out.y = (wx + wy) * HH;
  return out;
}

export function screenToWorld(sx: number, sy: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  out.x = (sx / HW + sy / HH) / 2;
  out.y = (sy / HH - sx / HW) / 2;
  return out;
}

/**
 * Converts a screen-space direction (e.g. joystick, y down) into a world-space direction with the
 * same magnitude, such that moving along the result appears on screen in the joystick direction.
 * Screen "up" maps to world (-1, -1)/sqrt2, i.e. the diagonal (brief §4).
 */
export function screenDirToWorld(dx: number, dy: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const wx = dx / HW + dy / HH;
  const wy = dy / HH - dx / HW;
  const wm = Math.sqrt(wx * wx + wy * wy);
  out.x = (wx / wm) * mag;
  out.y = (wy / wm) * mag;
  return out;
}

/** World angle (radians) whose projection points along screen angle `screenAngle`. */
export function screenAngleToWorld(screenAngle: number): number {
  const d = screenDirToWorld(Math.cos(screenAngle), Math.sin(screenAngle));
  return Math.atan2(d.y, d.x);
}

/** Screen angle of a world-space heading (used to pick sprite rotation). */
export function worldAngleToScreen(worldAngle: number): number {
  const c = Math.cos(worldAngle);
  const s = Math.sin(worldAngle);
  return Math.atan2((c + s) * HH, (c - s) * HW);
}

/** Painter's-order depth key for an object standing at world (wx, wy). */
export function depthOf(wx: number, wy: number): number {
  return wx + wy;
}

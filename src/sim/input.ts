/**
 * Per-tick player input. Everything is quantized to integers so that replays are compact and
 * the simulation never sees platform-dependent floats from the input layer.
 */
export const BTN_FIRE = 1;
export const BTN_ABILITY = 2;

/** Angle quantization: 4096 steps per turn. */
export const AIM_STEPS = 4096;
export const AIM_NONE = -1;
/** Auto-aim: the simulation turns the turret toward the nearest visible enemy (round-01 job 1). */
export const AIM_AUTO = -2;

export interface PlayerInput {
  /** World-space (tile axes) move vector, each component in [-127, 127]. */
  moveX: number;
  moveY: number;
  /** Turret aim angle in AIM_STEPS units [0, 4095], AIM_NONE to keep current, or AIM_AUTO. */
  aim: number;
  /** Bitmask of BTN_* flags currently held. */
  buttons: number;
}

export const EMPTY_INPUT: Readonly<PlayerInput> = Object.freeze({ moveX: 0, moveY: 0, aim: AIM_NONE, buttons: 0 });

export function quantizeMove(v: number): number {
  const q = Math.round(v * 127);
  return q < -127 ? -127 : q > 127 ? 127 : q;
}

export function quantizeAim(rad: number): number {
  const t = rad / (Math.PI * 2);
  return ((Math.round(t * AIM_STEPS) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;
}

export function aimToRad(aim: number): number {
  const a = (aim / AIM_STEPS) * 6.283185307179586;
  return a > 3.141592653589793 ? a - 6.283185307179586 : a;
}

/** Packs an input into a single 32-bit integer (8 bits x, 8 bits y, 13 bits aim, 3 bits buttons). */
export function packInput(i: PlayerInput): number {
  const aim = i.aim === AIM_NONE ? 0x1fff : i.aim === AIM_AUTO ? 0x1ffe : i.aim & 0x1fff;
  return ((i.moveX & 0xff) | ((i.moveY & 0xff) << 8) | (aim << 16) | ((i.buttons & 0x7) << 29)) >>> 0;
}

export function unpackInput(p: number): PlayerInput {
  const sx = p & 0xff;
  const sy = (p >>> 8) & 0xff;
  const aim = (p >>> 16) & 0x1fff;
  return {
    moveX: sx > 127 ? sx - 256 : sx,
    moveY: sy > 127 ? sy - 256 : sy,
    aim: aim === 0x1fff ? AIM_NONE : aim === 0x1ffe ? AIM_AUTO : aim,
    buttons: (p >>> 29) & 0x7,
  };
}

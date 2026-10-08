/**
 * Fixed-timestep driver (brief §11): the simulation advances in exact SIM_DT ticks while rendering
 * happens once per display frame with an interpolation factor `alpha` in [0, 1).
 * Pure logic: time is injected, so it is unit-testable without a browser.
 */
export interface FixedStepCallbacks {
  /** Called once per simulation tick. */
  tick(): void;
  /** Called once per display frame after ticking; alpha = fraction of the next tick elapsed. */
  render(alpha: number, frameDtMs: number): void;
}

export class FixedStepLoop {
  private acc = 0;
  private last = -1;
  /** Ticks dropped because the frame took too long (spiral-of-death guard). */
  dropped = 0;
  paused = false;

  constructor(
    private readonly stepMs: number,
    private readonly cb: FixedStepCallbacks,
    private readonly maxStepsPerFrame = 5,
  ) {}

  /** Advance to wall-clock time `nowMs`. Returns the number of ticks executed. */
  frame(nowMs: number): number {
    if (this.last < 0) this.last = nowMs;
    let dt = nowMs - this.last;
    this.last = nowMs;
    if (dt < 0) dt = 0;
    let steps = 0;
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= this.stepMs && steps < this.maxStepsPerFrame) {
        this.cb.tick();
        this.acc -= this.stepMs;
        steps++;
      }
      if (this.acc >= this.stepMs) {
        this.dropped += Math.floor(this.acc / this.stepMs);
        this.acc %= this.stepMs;
      }
    }
    this.cb.render(this.paused ? 0 : this.acc / this.stepMs, dt);
    return steps;
  }

  /** Forget elapsed time (e.g. after resuming from background) so no catch-up burst happens. */
  resetClock(): void {
    this.last = -1;
    this.acc = 0;
  }
}

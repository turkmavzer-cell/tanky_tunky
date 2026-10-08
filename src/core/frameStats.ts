/** Rolling frame statistics (for the in-game FPS overlay and the Playwright performance gate). */
export class FrameStats {
  private readonly frames: Float32Array;
  private readonly work: Float32Array;
  private n = 0;
  private i = 0;

  constructor(private readonly capacity = 600) {
    this.frames = new Float32Array(capacity);
    this.work = new Float32Array(capacity);
  }

  push(frameMs: number, workMs: number): void {
    this.frames[this.i] = frameMs;
    this.work[this.i] = workMs;
    this.i = (this.i + 1) % this.capacity;
    if (this.n < this.capacity) this.n++;
  }

  reset(): void {
    this.n = 0;
    this.i = 0;
  }

  summary(): { frames: number; fps: number; frameP50: number; frameP95: number; workMean: number; workP95: number } {
    const f = Array.from(this.frames.subarray(0, this.n)).sort((a, b) => a - b);
    const w = Array.from(this.work.subarray(0, this.n));
    const pct = (arr: number[], p: number): number => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
    const mean = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const fm = mean(f);
    const ws = [...w].sort((a, b) => a - b);
    return { frames: this.n, fps: fm ? 1000 / fm : 0, frameP50: pct(f, 0.5), frameP95: pct(f, 0.95), workMean: mean(w), workP95: pct(ws, 0.95) };
  }
}

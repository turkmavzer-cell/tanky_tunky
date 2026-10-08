/** Development keyboard/mouse controls (brief §4): WASD/arrows move, mouse aims, Space/LMB charges+fires, E/Shift = ability. */
export class KeyboardMouse {
  private keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  /** True once the mouse has moved over the canvas (so aim can follow it). */
  hasMouse = false;
  private readonly offs: (() => void)[] = [];

  constructor(target: HTMLElement) {
    const kd = (e: KeyboardEvent): void => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent): void => {
      this.keys.delete(e.code);
    };
    const blur = (): void => this.keys.clear();
    const mm = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      const r = target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.hasMouse = true;
    };
    const md = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouseDown = true;
    };
    const mu = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouseDown = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    target.addEventListener('pointermove', mm);
    target.addEventListener('pointerdown', md);
    window.addEventListener('pointerup', mu);
    this.offs.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', blur),
      () => target.removeEventListener('pointermove', mm),
      () => target.removeEventListener('pointerdown', md),
      () => window.removeEventListener('pointerup', mu),
    );
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** Screen-space move vector (y down), magnitude <= 1. */
  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    const m = Math.hypot(x, y);
    return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }

  fireHeld(): boolean {
    return this.down('Space') || this.mouseDown;
  }

  abilityHeld(): boolean {
    return this.down('KeyE') || this.down('ShiftLeft');
  }

  dispose(): void {
    this.offs.forEach((f) => f());
  }
}

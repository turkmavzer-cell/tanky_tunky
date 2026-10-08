/**
 * Multi-touch controls (brief §4), plain DOM for zero React re-renders per frame.
 *
 *  - Floating joystick: appears where the thumb lands in the movement half of the screen;
 *    dead zone, analog magnitude, exponential smoothing, sensitivity.
 *  - FIRE button: hold = charge (ring fills, driven by sim charge level), drag away from the
 *    button = manual turret aim (twin-stick style), release = shoot.
 *  - ABILITY button.
 * Each control tracks its own pointerId, so joystick + fire + ability work simultaneously.
 */
export interface TouchState {
  /** Screen-space move vector (y down), magnitude 0..1 after dead zone + smoothing. */
  moveX: number;
  moveY: number;
  fire: boolean;
  ability: boolean;
  /** Screen-space aim angle while dragging the fire button, else null. */
  aimAngle: number | null;
  /** True once any touch happened (switches the scene from keyboard to touch input). */
  active: boolean;
}

export interface TouchOptions {
  leftHanded: boolean;
  sensitivity: number;
  labels: { fire: string; ability: string };
}

const JOY_RADIUS = 64;
const DEAD_ZONE = 0.14;
const AIM_DRAG_MIN = 22;

export class TouchControls {
  readonly root: HTMLDivElement;
  readonly state: TouchState = { moveX: 0, moveY: 0, fire: false, ability: false, aimAngle: null, active: false };
  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;
  private readonly fireBtn: HTMLDivElement;
  private readonly fireRing: HTMLDivElement;
  private readonly abilityBtn: HTMLDivElement;
  private readonly abilityRing: HTMLDivElement;
  private joyId = -1;
  private joyCx = 0;
  private joyCy = 0;
  private rawX = 0;
  private rawY = 0;
  private fireId = -1;
  private fireCx = 0;
  private fireCy = 0;
  private abilityId = -1;
  private readonly offs: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    private readonly opts: TouchOptions,
  ) {
    this.root = el('div', 'touch-layer' + (opts.leftHanded ? ' left-handed' : ''));
    this.root.dataset.testid = 'touch-layer';
    this.joyBase = el('div', 'joy-base');
    this.joyKnob = el('div', 'joy-knob');
    this.joyBase.appendChild(this.joyKnob);
    this.fireBtn = el('div', 'act-btn fire-btn');
    this.fireBtn.dataset.testid = 'fire';
    this.fireRing = el('div', 'charge-ring');
    const fl = el('span', 'act-label');
    fl.textContent = opts.labels.fire;
    this.fireBtn.append(this.fireRing, fl);
    this.abilityBtn = el('div', 'act-btn ability-btn');
    this.abilityBtn.dataset.testid = 'ability';
    this.abilityRing = el('div', 'cooldown-ring');
    const al = el('span', 'act-label');
    al.textContent = opts.labels.ability;
    this.abilityBtn.append(this.abilityRing, al);
    this.root.append(this.joyBase, this.fireBtn, this.abilityBtn);
    host.appendChild(this.root);

    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
      t.addEventListener(type, fn as EventListener, { passive: false });
      this.offs.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(this.root, 'pointerdown', (e) => this.down(e));
    on(window, 'pointermove', (e) => this.move(e));
    on(window, 'pointerup', (e) => this.up(e));
    on(window, 'pointercancel', (e) => this.up(e));
    on(this.root, 'contextmenu', (e) => e.preventDefault());
  }

  private isMoveZone(x: number): boolean {
    const w = this.root.clientWidth;
    return this.opts.leftHanded ? x > w * 0.55 : x < w * 0.45;
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return; // desktop uses keyboard/mouse
    this.state.active = true;
    const target = e.target as HTMLElement;
    if (this.fireId < 0 && this.fireBtn.contains(target)) {
      e.preventDefault();
      this.fireId = e.pointerId;
      const r = this.fireBtn.getBoundingClientRect();
      this.fireCx = r.left + r.width / 2;
      this.fireCy = r.top + r.height / 2;
      this.state.fire = true;
      this.state.aimAngle = null;
      this.fireBtn.classList.add('pressed');
      return;
    }
    if (this.abilityId < 0 && this.abilityBtn.contains(target)) {
      e.preventDefault();
      this.abilityId = e.pointerId;
      this.state.ability = true;
      this.abilityBtn.classList.add('pressed');
      return;
    }
    const rr = this.root.getBoundingClientRect();
    const lx = e.clientX - rr.left;
    if (this.joyId < 0 && this.isMoveZone(lx)) {
      e.preventDefault();
      this.joyId = e.pointerId;
      this.joyCx = e.clientX;
      this.joyCy = e.clientY;
      this.rawX = this.rawY = 0;
      this.joyBase.style.transform = `translate(${lx - JOY_RADIUS}px, ${e.clientY - rr.top - JOY_RADIUS}px)`;
      this.joyBase.classList.add('visible');
      this.joyKnob.style.transform = 'translate(0px, 0px)';
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.joyCx;
      let dy = e.clientY - this.joyCy;
      const d = Math.hypot(dx, dy);
      // floating: if the thumb drifts far beyond the ring, drag the base along
      if (d > JOY_RADIUS * 1.6) {
        const k = (d - JOY_RADIUS * 1.6) / d;
        this.joyCx += dx * k;
        this.joyCy += dy * k;
        const rr = this.root.getBoundingClientRect();
        this.joyBase.style.transform = `translate(${this.joyCx - rr.left - JOY_RADIUS}px, ${this.joyCy - rr.top - JOY_RADIUS}px)`;
        dx = e.clientX - this.joyCx;
        dy = e.clientY - this.joyCy;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / JOY_RADIUS);
      const a = Math.atan2(dy, dx);
      const kx = Math.cos(a) * m * JOY_RADIUS;
      const ky = Math.sin(a) * m * JOY_RADIUS;
      this.joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
      // dead zone + rescale to keep analog range, then sensitivity
      const mm = m < DEAD_ZONE ? 0 : Math.min(1, ((m - DEAD_ZONE) / (1 - DEAD_ZONE)) * this.opts.sensitivity);
      this.rawX = Math.cos(a) * mm;
      this.rawY = Math.sin(a) * mm;
    } else if (e.pointerId === this.fireId) {
      const dx = e.clientX - this.fireCx;
      const dy = e.clientY - this.fireCy;
      this.state.aimAngle = Math.hypot(dx, dy) > AIM_DRAG_MIN ? Math.atan2(dy, dx) : this.state.aimAngle;
      this.fireBtn.classList.toggle('aiming', this.state.aimAngle !== null);
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      this.joyId = -1;
      this.rawX = this.rawY = 0;
      this.joyBase.classList.remove('visible');
    } else if (e.pointerId === this.fireId) {
      this.fireId = -1;
      this.state.fire = false;
      this.fireBtn.classList.remove('pressed', 'aiming');
    } else if (e.pointerId === this.abilityId) {
      this.abilityId = -1;
      this.state.ability = false;
      this.abilityBtn.classList.remove('pressed');
    }
  }

  /** Per-frame smoothing of the joystick output. */
  update(dtSec: number): void {
    const k = 1 - Math.exp(-dtSec / 0.045);
    this.state.moveX += (this.rawX - this.state.moveX) * k;
    this.state.moveY += (this.rawY - this.state.moveY) * k;
    if (this.joyId < 0 && Math.abs(this.state.moveX) + Math.abs(this.state.moveY) < 0.01) this.state.moveX = this.state.moveY = 0;
  }

  /** Visual feedback from the simulation: charge 0..1, flags for perfect window / overheat, ability cooldown 0..1. */
  private lastFeedback = '';

  setFeedback(charge: number, perfect: boolean, overheat: number, abilityCooldown: number): void {
    const key = `${Math.round(charge * 90)}|${perfect}|${Math.round(overheat * 60)}|${Math.round(abilityCooldown * 60)}`;
    if (key === this.lastFeedback) return;
    this.lastFeedback = key;
    const deg = Math.round(charge * 360);
    this.fireRing.style.background = overheat > 0 ? `conic-gradient(var(--danger) ${Math.round(overheat * 360)}deg, transparent 0)` : `conic-gradient(${perfect ? '#fff4b0' : 'var(--accent)'} ${deg}deg, transparent 0)`;
    this.fireBtn.classList.toggle('perfect', perfect);
    this.fireBtn.classList.toggle('overheat', overheat > 0);
    this.abilityRing.style.background = abilityCooldown > 0 ? `conic-gradient(#0009 ${Math.round(abilityCooldown * 360)}deg, transparent 0)` : 'none';
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.root.remove();
  }
}

function el(tag: 'div' | 'span', cls: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  e.className = cls;
  return e;
}

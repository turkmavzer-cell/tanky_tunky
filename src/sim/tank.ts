/** Per-tank update: targeting, ability, charged fire state machine and movement. */
import { COMBAT, TANKS, evalCurve } from './config';
import { clamp, datan2, dcos, dsin, rotateToward } from './dmath';
import { AIM_AUTO, AIM_NONE, BTN_ABILITY, BTN_FIRE, aimToRad, type PlayerInput } from './input';
import type { Rng } from './rng';
import type { Shell, SimState, Tank } from './state';
import { resolveTerrain } from './collision';
import { nextId } from './combat';
import { autoAimAngle, artilleryFlight, leadPoint, updateTarget } from './targeting';
import { canSeeTank } from './visibility';
import { abilityAllowsFire, abilityChargeTimeMul, abilityFireRateMul, abilityOnFire, abilitySpeedMul, tickAbility } from './abilities';
import { speedMulAt } from '../world/map';
import { isPassable } from '../world/passability';

/** Effective charge time of a tank right now (Swift halves it). */
export function chargeTimeOf(t: Tank): number {
  return TANKS[t.cls].chargeTime * abilityChargeTimeMul(t);
}

/** Current charge level 0..1 (0 for a tap). */
export function chargeLevel(t: Tank): number {
  if (!t.charging || t.chargeT < COMBAT.charge.tapThreshold) return 0;
  return Math.min(1, t.chargeT / chargeTimeOf(t));
}

export function updateTank(s: SimState, t: Tank, inp: PlayerInput | undefined, rng: Rng, dt: number): void {
  const def = TANKS[t.cls];
  const buttons = inp ? inp.buttons : 0;
  if (t.protect > 0) t.protect = Math.max(0, t.protect - dt);
  if (t.shimmer > 0) t.shimmer = Math.max(0, t.shimmer - dt);
  if (t.bumpCd > 0) t.bumpCd = Math.max(0, t.bumpCd - dt);

  // --- ability (rising edge of the button)
  const abilityPressed = (buttons & BTN_ABILITY) !== 0 && (t.prevButtons & BTN_ABILITY) === 0;
  tickAbility(s, t, abilityPressed, rng, dt);

  // --- targeting
  const auto = inp?.aim === AIM_AUTO;
  if (auto) updateTarget(s, t);
  else t.target = -1;

  // --- charge / fire state machine
  t.cooldown = Math.max(0, t.cooldown - dt);
  t.overheat = Math.max(0, t.overheat - dt);
  const held = (buttons & BTN_FIRE) !== 0;
  const canFire = abilityAllowsFire(t);
  if (!held) t.needRelease = false;
  if (t.overheat > 0 || !canFire) {
    t.charging = false;
  } else if (held) {
    if (!t.charging && t.cooldown <= 0 && !t.needRelease) {
      t.charging = true;
      t.chargeT = 0;
      t.fullT = 0;
    }
    if (t.charging) {
      t.chargeT += dt;
      if (t.chargeT >= chargeTimeOf(t)) {
        if (t.fullT === 0) s.events.push({ type: 'chargeFull', tank: t.id });
        t.fullT += dt;
        if (t.fullT > COMBAT.charge.overheatAfter) {
          t.charging = false;
          t.chargeT = t.fullT = 0;
          t.overheat = COMBAT.charge.overheatLock;
          t.needRelease = true;
          s.events.push({ type: 'overheat', tank: t.id });
        }
      }
    }
  } else if (t.charging) {
    const c = chargeLevel(t);
    const perfect = t.fullT > 0 && t.fullT <= COMBAT.charge.perfectWindow;
    fire(s, t, c, perfect, rng);
    t.charging = false;
    t.chargeT = t.fullT = 0;
    t.cooldown = def.fireCooldown / abilityFireRateMul(t);
  }
  t.prevButtons = buttons;

  // --- movement
  let mx = inp ? inp.moveX / 127 : 0;
  let my = inp ? inp.moveY / 127 : 0;
  const mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  const slow = 1 - def.chargeSlow * chargeLevel(t);
  const maxSpeed = def.maxSpeed * slow * abilitySpeedMul(t);
  const tvx = mx * maxSpeed;
  const tvy = my * maxSpeed;
  const dvx = tvx - t.vx;
  const dvy = tvy - t.vy;
  const dv = Math.sqrt(dvx * dvx + dvy * dvy);
  const maxDv = def.accel * abilitySpeedMul(t) * dt;
  if (dv <= maxDv) {
    t.vx = tvx;
    t.vy = tvy;
  } else {
    t.vx += (dvx / dv) * maxDv;
    t.vy += (dvy / dv) * maxDv;
  }
  moveTank(s, t, dt, mx, my);
  t.kx *= 0.86;
  t.ky *= 0.86;
  if (mag > 0.05) t.hull = rotateToward(t.hull, datan2(my, mx), def.hullTurn * abilitySpeedMul(t) * dt);

  // --- turret: manual angle, auto lock (with lead), or settle back toward the hull
  const turnStep = def.turretTurn * dt;
  if (inp && inp.aim !== AIM_NONE && inp.aim !== AIM_AUTO) t.turret = rotateToward(t.turret, aimToRad(inp.aim), turnStep);
  else if (auto) {
    const a = autoAimAngle(s, t, chargeLevel(t));
    t.turret = rotateToward(t.turret, a ?? t.hull, a === null ? turnStep * 0.5 : turnStep);
  }
}

/**
 * Integrates position with terrain collision. Sub-steps keep every step below 0.12 tiles so fast
 * tanks (Swift, knockback) can never tunnel through a wall corner.
 */
function moveTank(s: SimState, t: Tank, dt: number, inX: number, inY: number): void {
  const map = s.map;
  const def = TANKS[t.cls];
  const cx0 = Math.floor(t.x);
  const cy0 = Math.floor(t.y);
  const terrainMul = speedMulAt(map, cx0, cy0);
  const dx = (t.vx * terrainMul + t.kx) * dt;
  const dy = (t.vy * terrainMul + t.ky) * dt;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 0.12));
  let pushX = 0;
  let pushY = 0;
  for (let k = 0; k < steps; k++) {
    const cx = Math.floor(t.x);
    const cy = Math.floor(t.y);
    const nx = clamp(t.x + dx / steps, def.radius, map.width - def.radius);
    const ny = clamp(t.y + dy / steps, def.radius, map.height - def.radius);
    const r = resolveTerrain(map, nx, ny, def.radius, cx, cy);
    pushX += r.x - nx;
    pushY += r.y - ny;
    t.x = r.x;
    t.y = r.y;
  }
  // velocity loses the component blocked by terrain (no "pressing" into walls)
  const inv = 1 / (dt * Math.max(terrainMul, 0.05));
  t.vx += pushX * inv;
  t.vy += pushY * inv;
  // bump feedback: pushed back while steering into an impassable edge
  const inMag = Math.sqrt(inX * inX + inY * inY);
  const pushMag = Math.sqrt(pushX * pushX + pushY * pushY);
  if (inMag > 0.3 && pushMag > 1e-4 && (pushX * inX + pushY * inY) < 0 && t.bumpCd <= 0) {
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    const ax = Math.abs(inX) >= Math.abs(inY);
    const dir = ax ? (inX > 0 ? 0 : 1) : inY > 0 ? 2 : 3;
    const ox = dir === 0 ? 1 : dir === 1 ? -1 : 0;
    const oy = dir === 2 ? 1 : dir === 3 ? -1 : 0;
    if (!isPassable(map, tx, ty, tx + ox, ty + oy, t.cls)) {
      s.events.push({ type: 'bump', tank: t.id, x: tx, y: ty, dir });
      t.bumpCd = 0.45;
    }
  }
}

function fire(s: SimState, t: Tank, c: number, perfect: boolean, rng: Rng): void {
  const def = TANKS[t.cls];
  const sc = COMBAT.scaling;
  const ca = dcos(t.turret);
  const sa = dsin(t.turret);
  const muzzle = def.radius + 0.25;
  const x = t.x + ca * muzzle;
  const y = t.y + sa * muzzle;
  const speed = def.shellSpeed * evalCurve(sc.speed, c);
  const range = def.range * evalCurve(sc.range, c);
  const map = s.map;
  const sh: Shell = {
    id: nextId(s),
    owner: t.id,
    team: t.team,
    kind: def.shell,
    x,
    y,
    vx: ca * speed,
    vy: sa * speed,
    dist: range,
    damage: def.damage * evalCurve(sc.damage, c) * (perfect ? COMBAT.charge.perfectBonus : 1),
    radius: def.splash * evalCurve(sc.radius, c),
    bounces: def.bounces,
    level: map.elev[Math.floor(t.y) * map.width + Math.floor(t.x)],
    charge: c,
    perfect,
    ignore: -1,
    sx: x,
    sy: y,
    tx: 0,
    ty: 0,
    t: 0,
    flight: 0,
    arc: 0,
    warn: false,
    cause: 'shell',
  };
  if (def.shell === 'artillery') {
    // Auto-lock: land on the predicted target position if reachable at this charge; otherwise
    // the charge sets the distance between min and max range (DECISIONS D-019).
    let d = def.minRange + (range - def.minRange) * c;
    const tgt = t.target >= 0 ? s.tanks[t.target] : null;
    if (tgt && canSeeTank(s, t.team, tgt)) {
      const p = leadPoint(s, t, tgt, c);
      const dl = Math.sqrt((p.x - t.x) * (p.x - t.x) + (p.y - t.y) * (p.y - t.y));
      if (dl >= def.minRange && dl <= range) d = dl;
    }
    sh.tx = clamp(t.x + ca * d, 0.01, map.width - 0.01);
    sh.ty = clamp(t.y + sa * d, 0.01, map.height - 0.01);
    sh.flight = artilleryFlight(d, speed);
    sh.arc = def.arcHeight * (0.6 + 0.4 * c);
  }
  s.shells.push(sh);
  t.protect = 0; // firing ends spawn protection
  s.events.push({ type: 'fire', tank: t.id, x, y, angle: t.turret, charge: c, perfect, kind: def.shell });
  abilityOnFire(s, t, rng); // firing ends Hide
}

/** Per-tank update: targeting, ability, charged fire state machine and movement. */
import { COMBAT, TANKS, evalCurve, type SprayDef } from './config';
import { clamp, datan2, dcos, dsin, rotateToward } from './dmath';
import { AIM_AUTO, AIM_NONE, BTN_ABILITY, BTN_FIRE, BTN_ULT, aimToRad, type PlayerInput } from './input';
import type { Rng } from './rng';
import type { Shell, SimState, Tank } from './state';
import { resolveTerrain } from './collision';
import { nextId } from './combat';
import { autoAimAngle, artilleryFlight, leadPoint, updateTarget } from './targeting';
import { canSeeTank } from './visibility';
import { abilityAllowsFire, abilityChargeTimeMul, abilityFireRateMul, abilityInstantShot, abilityOnFire, abilitySpeedMul, endAbility, tickAbility } from './abilities';
import { speedMulAt } from '../world/map';
import { isPassable } from '../world/passability';
import { markCombat, updateRegen } from './upgrades';

/** Effective charge time of a tank right now (Swift halves it). */
export function chargeTimeOf(t: Tank): number {
  return TANKS[t.cls].chargeTime * abilityChargeTimeMul(t) * t.boost.chargeTime;
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
  if (inp) updateRegen(s, t, dt); // only while playing (no input during the countdown)

  // --- ability (rising edge of the button)
  const abilityPressed = (buttons & BTN_ABILITY) !== 0 && (t.prevButtons & BTN_ABILITY) === 0;
  const ultPressed = (buttons & BTN_ULT) !== 0 && (t.prevButtons & BTN_ULT) === 0;
  tickAbility(s, t, abilityPressed, ultPressed, rng, dt);
  if (t.stun > 0) t.stun = Math.max(0, t.stun - dt);

  // --- targeting
  const auto = inp?.aim === AIM_AUTO;
  if (auto) updateTarget(s, t);
  else t.target = -1;

  // --- charge / fire state machine
  // spray keeps up to one tick of overshoot so non-integer intervals (e.g. 18 shots/s = 3.33 ticks) average exactly
  t.cooldown = Math.max(def.spray ? -dt : 0, t.cooldown - dt);
  t.overheat = Math.max(0, t.overheat - dt);
  const stunned = t.stun > 0;
  const pressed = (buttons & BTN_FIRE) !== 0;
  const held = pressed && !stunned;
  const canFire = abilityAllowsFire(t) && !stunned && !def.noFire;
  if (!pressed) t.needRelease = false;
  const instant = held && canFire && t.overheat <= 0 && t.cooldown <= 0 && (t.prevButtons & BTN_FIRE) === 0 ? abilityInstantShot(t) : null;
  if (instant) {
    // Hazır Atış: no charge-up, fires at once and ends the ability (its cooldown starts)
    fire(s, t, instant.shot.power, false, rng, instant.shot.reach);
    t.charging = false;
    t.chargeT = t.fullT = 0;
    t.needRelease = true;
    t.cooldown = def.fireCooldown / (abilityFireRateMul(t) * t.boost.fireRate);
    endAbility(s, t, instant.slot, rng);
  } else if (def.spray) {
    // machine-gun fire: hold = stream, no charging (Scout)
    t.charging = false;
    if (held && canFire && !t.needRelease && t.overheat <= 0 && t.cooldown <= 0) {
      fire(s, t, 0, false, rng, 0, def.spray);
      t.cooldown += 1 / (def.spray.rate * abilityFireRateMul(t) * t.boost.fireRate);
    }
  } else if (t.overheat > 0 || !canFire) {
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
    t.cooldown = def.fireCooldown / (abilityFireRateMul(t) * t.boost.fireRate);
  }
  t.prevButtons = buttons;

  // --- movement
  let mx = inp && !stunned ? inp.moveX / 127 : 0;
  let my = inp && !stunned ? inp.moveY / 127 : 0;
  const mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  const slow = 1 - def.chargeSlow * chargeLevel(t);
  const maxSpeed = def.maxSpeed * slow * abilitySpeedMul(t) * t.boost.speed;
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
  if (def.pve) {
    // structures never move (no knockback either)
    t.vx = t.vy = t.kx = t.ky = 0;
  } else moveTank(s, t, dt, mx, my);
  t.kx *= 0.86;
  t.ky *= 0.86;
  if (mag > 0.05) t.hull = rotateToward(t.hull, datan2(my, mx), def.hullTurn * abilitySpeedMul(t) * dt);

  // --- turret: manual angle, auto lock (with lead), or settle back toward the hull
  const turnStep = def.turretTurn * dt;
  if (stunned) {
    // EMP: turret frozen
  } else if (inp && inp.aim !== AIM_NONE && inp.aim !== AIM_AUTO) t.turret = rotateToward(t.turret, aimToRad(inp.aim), turnStep);
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

/**
 * Spawns a shell. `c` = charge level for damage / blast radius; `reach` = charge level for speed, range and the
 * artillery landing distance (defaults to `c`; Hazır Atış uses full reach with partial power). `spray` = machine-gun bullet.
 */
function fire(s: SimState, t: Tank, c: number, perfect: boolean, rng: Rng, reach: number = c, spray?: SprayDef): void {
  const def = TANKS[t.cls];
  markCombat(t); // firing interrupts regeneration
  const sc = COMBAT.scaling;
  const aimErr = spray ? rng.range(-spray.spread, spray.spread) : 0;
  const ca = dcos(t.turret + aimErr);
  const sa = dsin(t.turret + aimErr);
  const muzzle = def.radius + 0.25;
  const x = t.x + ca * muzzle;
  const y = t.y + sa * muzzle;
  // round 07: shots charged to >= minCharge get the class special (Heavy also flies like a laser)
  const ch = !spray && def.charged && c >= def.charged.minCharge ? def.charged : undefined;
  let speed = def.shellSpeed * evalCurve(sc.speed, reach);
  if (ch?.speedAtFull) speed += (ch.speedAtFull - speed) * ((c - ch.minCharge) / (1 - ch.minCharge));
  const range = def.range * evalCurve(sc.range, reach);
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
    damage: spray ? spray.damage : def.damage * evalCurve(sc.damage, c) * (perfect ? COMBAT.charge.perfectBonus : 1),
    radius: def.splash * evalCurve(sc.radius, c) * t.boost.splash,
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
    special: ch ? (ch.shock ? 'shock' : ch.pierce ? 'pierce' : ch.fire ? 'fire' : 'none') : 'none',
    pierced: false,
  };
  if (def.shell === 'artillery') {
    // Auto-lock: land on the predicted target position if reachable at this charge; otherwise
    // the charge sets the distance between min and max range (DECISIONS D-019).
    let d = def.minRange + (range - def.minRange) * reach;
    const tgt = t.target >= 0 ? s.tanks[t.target] : null;
    if (tgt && canSeeTank(s, t.team, tgt)) {
      const p = leadPoint(s, t, tgt, reach);
      const dl = Math.sqrt((p.x - t.x) * (p.x - t.x) + (p.y - t.y) * (p.y - t.y));
      if (dl >= def.minRange && dl <= range) d = dl;
    }
    sh.tx = clamp(t.x + ca * d, 0.01, map.width - 0.01);
    sh.ty = clamp(t.y + sa * d, 0.01, map.height - 0.01);
    sh.flight = artilleryFlight(d, speed);
    sh.arc = def.arcHeight * (0.6 + 0.4 * reach);
  }
  s.shells.push(sh);
  t.protect = 0; // firing ends spawn protection
  s.events.push({ type: 'fire', tank: t.id, x, y, angle: t.turret, charge: c, perfect, kind: def.shell });
  abilityOnFire(s, t, rng); // firing ends Hide
}

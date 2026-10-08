import { COMBAT, SIM_DT, TANKS, evalCurve, type TankClassId } from './config';
import { clamp, datan2, dcos, dsin, rotateToward } from './dmath';
import { AIM_NONE, BTN_FIRE, aimToRad, type PlayerInput } from './input';
import { Rng } from './rng';
import type { Shell, SimState, Tank } from './state';
import { damageFeature, speedMulAt, type GameMap } from '../world/map';
import { FEATURE } from '../world/terrain';
import { resolveTerrain } from './collision';

export interface SimOptions {
  seed: number;
  map: GameMap;
  players: { team: number; cls: TankClassId; x: number; y: number }[];
}

export function createState(opts: SimOptions): SimState {
  const rng = new Rng(opts.seed);
  const tanks: Tank[] = opts.players.map((p, i) => ({
    id: i,
    team: p.team,
    cls: p.cls,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    hull: p.team === 0 ? 0.785398163397448 : -2.356194490192345,
    turret: p.team === 0 ? 0.785398163397448 : -2.356194490192345,
    hp: TANKS[p.cls].hp,
    alive: true,
    respawn: 0,
    charging: false,
    chargeT: 0,
    fullT: 0,
    cooldown: 0,
    overheat: 0,
    needRelease: false,
    prevButtons: 0,
    lastHitBy: -1,
    kills: 0,
    deaths: 0,
  }));
  return { tick: 0, seed: opts.seed, rng: rng.state(), map: opts.map, tanks, shells: [], nextShellId: 1, events: [] };
}

/** Current charge level 0..1 of a tank (0 for a tap). */
export function chargeLevel(t: Tank): number {
  if (!t.charging || t.chargeT < COMBAT.charge.tapThreshold) return 0;
  return Math.min(1, t.chargeT / TANKS[t.cls].chargeTime);
}

/**
 * Advances the simulation by exactly one fixed tick (SIM_DT). Deterministic: the same state +
 * inputs always produce the same next state (replays, lockstep). `inputs[i]` belongs to tank i.
 */
export function step(state: SimState, inputs: readonly PlayerInput[]): void {
  const dt = SIM_DT;
  const rng = new Rng(state.rng);
  state.events.length = 0;
  for (let i = 0; i < state.tanks.length; i++) {
    const t = state.tanks[i];
    if (!t.alive) {
      t.respawn -= dt;
      if (t.respawn <= 0) respawnTank(state, t);
      continue;
    }
    updateTank(state, t, inputs[i], dt);
  }
  collideTanks(state);
  updateShells(state, rng, dt);
  state.rng = rng.state();
  state.tick++;
}

function respawnTank(state: SimState, t: Tank): void {
  const base = state.map.bases.find((b) => b.team === t.team);
  const sp = base ? base.spawns[t.id % base.spawns.length] : { x: 1, y: 1 };
  t.x = sp.x + 0.5;
  t.y = sp.y + 0.5;
  t.vx = t.vy = t.kx = t.ky = 0;
  t.hp = TANKS[t.cls].hp;
  t.alive = true;
  t.charging = false;
  t.chargeT = t.fullT = t.cooldown = t.overheat = 0;
  state.events.push({ type: 'respawn', tank: t.id });
}

function updateTank(state: SimState, t: Tank, inp: PlayerInput | undefined, dt: number): void {
  const def = TANKS[t.cls];
  const buttons = inp ? inp.buttons : 0;
  // --- charge / fire state machine
  t.cooldown = Math.max(0, t.cooldown - dt);
  t.overheat = Math.max(0, t.overheat - dt);
  const held = (buttons & BTN_FIRE) !== 0;
  if (!held) t.needRelease = false;
  if (t.overheat > 0) {
    t.charging = false;
  } else if (held) {
    if (!t.charging && t.cooldown <= 0 && !t.needRelease) {
      t.charging = true;
      t.chargeT = 0;
      t.fullT = 0;
    }
    if (t.charging) {
      t.chargeT += dt;
      if (t.chargeT >= def.chargeTime) {
        if (t.fullT === 0) state.events.push({ type: 'chargeFull', tank: t.id });
        t.fullT += dt;
        if (t.fullT > COMBAT.charge.overheatAfter) {
          t.charging = false;
          t.chargeT = t.fullT = 0;
          t.overheat = COMBAT.charge.overheatLock;
          t.needRelease = true;
          state.events.push({ type: 'overheat', tank: t.id });
        }
      }
    }
  } else if (t.charging) {
    const c = chargeLevel(t);
    const perfect = t.fullT > 0 && t.fullT <= COMBAT.charge.perfectWindow;
    fire(state, t, c, perfect);
    t.charging = false;
    t.chargeT = t.fullT = 0;
    t.cooldown = def.fireCooldown;
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
  const tvx = mx * def.maxSpeed * slow;
  const tvy = my * def.maxSpeed * slow;
  const dvx = tvx - t.vx;
  const dvy = tvy - t.vy;
  const dv = Math.sqrt(dvx * dvx + dvy * dvy);
  const maxDv = def.accel * dt;
  if (dv <= maxDv) {
    t.vx = tvx;
    t.vy = tvy;
  } else {
    t.vx += (dvx / dv) * maxDv;
    t.vy += (dvy / dv) * maxDv;
  }
  const map = state.map;
  const cx = Math.floor(t.x);
  const cy = Math.floor(t.y);
  const terrainMul = speedMulAt(map, cx, cy);
  const nx = clamp(t.x + (t.vx * terrainMul + t.kx) * dt, def.radius, map.width - def.radius);
  const ny = clamp(t.y + (t.vy * terrainMul + t.ky) * dt, def.radius, map.height - def.radius);
  const r = resolveTerrain(map, nx, ny, def.radius, cx, cy);
  // velocity loses the component blocked by terrain (no "pressing" into walls)
  const inv = 1 / (dt * Math.max(terrainMul, 0.05));
  const bx = (r.x - nx) * inv;
  const by = (r.y - ny) * inv;
  t.vx += bx;
  t.vy += by;
  t.x = r.x;
  t.y = r.y;
  t.kx *= 0.86;
  t.ky *= 0.86;
  if (mag > 0.05) t.hull = rotateToward(t.hull, datan2(my, mx), def.hullTurn * dt);
  if (inp && inp.aim !== AIM_NONE) t.turret = rotateToward(t.turret, aimToRad(inp.aim), def.turretTurn * dt);
}

function fire(state: SimState, t: Tank, c: number, perfect: boolean): void {
  const def = TANKS[t.cls];
  const sc = COMBAT.scaling;
  const ca = dcos(t.turret);
  const sa = dsin(t.turret);
  const muzzle = def.radius + 0.25;
  const x = t.x + ca * muzzle;
  const y = t.y + sa * muzzle;
  const speed = def.shellSpeed * evalCurve(sc.speed, c);
  const range = def.range * evalCurve(sc.range, c);
  const damage = def.damage * evalCurve(sc.damage, c) * (perfect ? COMBAT.charge.perfectBonus : 1);
  const radius = def.splash * evalCurve(sc.radius, c);
  const map = state.map;
  const level = map.elev[Math.floor(t.y) * map.width + Math.floor(t.x)];
  const s: Shell = {
    id: state.nextShellId++,
    owner: t.id,
    team: t.team,
    kind: def.shell,
    x,
    y,
    vx: ca * speed,
    vy: sa * speed,
    dist: range,
    damage,
    radius,
    bounces: def.bounces,
    level,
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
  };
  if (def.shell === 'artillery') {
    // charge sets the landing distance between min range and max range
    const d = def.minRange + (range - def.minRange) * c;
    s.tx = clamp(t.x + ca * d, 0.01, map.width - 0.01);
    s.ty = clamp(t.y + sa * d, 0.01, map.height - 0.01);
    s.flight = d / speed + 0.35;
    s.arc = def.arcHeight * (0.6 + 0.4 * c);
  }
  state.shells.push(s);
  state.events.push({ type: 'fire', tank: t.id, x, y, angle: t.turret, charge: c, perfect, kind: def.shell });
}

function collideTanks(state: SimState): void {
  const ts = state.tanks;
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < ts.length; j++) {
      const b = ts[j];
      if (!b.alive) continue;
      const ra = TANKS[a.cls].radius;
      const rb = TANKS[b.cls].radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const rr = ra + rb;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const push = (rr - d) * COMBAT.tankCollision.push;
      const nx = d2 > 0 ? dx / d : 1;
      const ny = d2 > 0 ? dy / d : 0;
      // heavier (bigger) tanks get pushed less
      const wa = rb / rr;
      const wb = ra / rr;
      a.x -= nx * push * wa * 2;
      a.y -= ny * push * wa * 2;
      b.x += nx * push * wb * 2;
      b.y += ny * push * wb * 2;
      for (const t of [a, b]) {
        const r = resolveTerrain(state.map, t.x, t.y, TANKS[t.cls].radius, Math.floor(t.x), Math.floor(t.y));
        t.x = r.x;
        t.y = r.y;
      }
    }
  }
}

function updateShells(state: SimState, rng: Rng, dt: number): void {
  const shells = state.shells;
  const map = state.map;
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    let done = false;
    if (s.kind === 'artillery') {
      s.t += dt;
      const k = Math.min(1, s.t / s.flight);
      s.x = s.sx + (s.tx - s.sx) * k;
      s.y = s.sy + (s.ty - s.sy) * k;
      if (k >= 1) {
        explode(state, rng, s, s.tx, s.ty, -1);
        done = true;
      }
    } else {
      const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const travel = sp * dt;
      const steps = Math.max(1, Math.ceil(travel / 0.2));
      const sub = dt / steps;
      for (let k = 0; k < steps && !done; k++) {
        const px = s.x;
        const py = s.y;
        s.x += s.vx * sub;
        s.y += s.vy * sub;
        s.dist -= sp * sub;
        const tx = Math.floor(s.x);
        const ty = Math.floor(s.y);
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
          done = true;
          break;
        }
        const ti = ty * map.width + tx;
        const f = FEATURE[map.feature[ti]];
        const e = map.elev[ti];
        if ((f.blocksShots && e >= s.level) || e > s.level) {
          // hit terrain
          if (f.hp > 0) {
            const destroyed = damageFeature(map, tx, ty, s.damage * COMBAT.shell.terrainDamageMul);
            state.events.push({ type: 'terrain', x: tx, y: ty, destroyed });
          }
          if (s.bounces > 0 && !(f.hp > 0 && map.feature[ti] !== f.id)) {
            const ptx = Math.floor(px);
            const pty = Math.floor(py);
            if (ptx !== tx) s.vx = -s.vx;
            if (pty !== ty) s.vy = -s.vy;
            if (ptx === tx && pty === ty) {
              s.vx = -s.vx;
              s.vy = -s.vy;
            }
            s.x = px;
            s.y = py;
            s.bounces--;
            state.events.push({ type: 'bounce', x: px, y: py });
            continue;
          }
          explode(state, rng, s, px, py, -1);
          done = true;
          break;
        }
        // shells fly at their level; dropping to lower ground keeps the higher level
        // tank hit
        const hitR = COMBAT.shell.hitRadius;
        for (const t of state.tanks) {
          if (!t.alive || t.team === s.team || t.id === s.ignore) continue;
          const r = TANKS[t.cls].radius + hitR;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          if (dx * dx + dy * dy > r * r) continue;
          const te = map.elev[Math.floor(t.y) * map.width + Math.floor(t.x)];
          if (te > s.level && rng.next() < COMBAT.shell.uphillMissChance) {
            s.ignore = t.id;
            state.events.push({ type: 'graze', target: t.id, x: s.x, y: s.y });
            continue;
          }
          explode(state, rng, s, s.x, s.y, t.id);
          done = true;
          break;
        }
        if (!done && s.dist <= 0) {
          explode(state, rng, s, s.x, s.y, -1);
          done = true;
        }
      }
    }
    if (done) {
      shells[i] = shells[shells.length - 1];
      shells.pop();
    }
  }
}

function explode(state: SimState, _rng: Rng, s: Shell, x: number, y: number, direct: number): void {
  const map = state.map;
  state.events.push({ type: 'explode', x, y, radius: s.radius, charge: s.charge, kind: s.kind });
  const kb = COMBAT.shell.knockback * evalCurve(COMBAT.scaling.knockback, s.charge);
  for (const t of state.tanks) {
    if (!t.alive) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const reach = s.radius + TANKS[t.cls].radius;
    const isDirect = t.id === direct;
    if (!isDirect && d > reach) continue;
    const enemy = t.team !== s.team;
    if (enemy || (COMBAT.shell.selfDamage && t.id === s.owner)) {
      const f = isDirect ? 1 : COMBAT.shell.splashFalloff * (1 - Math.min(1, d / reach));
      applyDamage(state, t, s.damage * f, s.owner, x, y);
    }
    if (enemy && d > 1e-6) {
      const k = kb * (isDirect ? 1 : 1 - Math.min(1, d / reach));
      t.kx += (dx / d) * k;
      t.ky += (dy / d) * k;
    }
  }
  // destructible terrain within the blast
  const r = s.radius;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const i = ty * map.width + tx;
      if (FEATURE[map.feature[i]].hp <= 0) continue;
      const dx = tx + 0.5 - x;
      const dy = ty + 0.5 - y;
      if (dx * dx + dy * dy > (r + 0.5) * (r + 0.5)) continue;
      const destroyed = damageFeature(map, tx, ty, s.damage * COMBAT.shell.splashFalloff * COMBAT.shell.terrainDamageMul);
      state.events.push({ type: 'terrain', x: tx, y: ty, destroyed });
    }
  }
}

function applyDamage(state: SimState, t: Tank, raw: number, by: number, x: number, y: number): void {
  const dmg = raw * (1 - TANKS[t.cls].armor);
  t.hp -= dmg;
  t.lastHitBy = by;
  state.events.push({ type: 'hit', target: t.id, by, damage: dmg, x, y });
  if (t.hp <= 0) {
    t.hp = 0;
    t.alive = false;
    t.respawn = COMBAT.respawnTime;
    t.charging = false;
    t.deaths++;
    const killer = state.tanks[by];
    if (killer && killer.team !== t.team) killer.kills++;
    state.events.push({ type: 'destroyed', tank: t.id, by, x: t.x, y: t.y });
  }
}

export function cloneState(s: SimState): SimState {
  return structuredClone(s);
}

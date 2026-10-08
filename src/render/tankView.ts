import { Container, Sprite, Texture } from 'pixi.js';
import type { TankClassId } from '../sim/config';
import { TILE_W } from '../world/iso';
import { SLICE_PX_PER_TILE, TEAM_PALETTES, drawTankSlices } from './tankArt';

/** Screen px per world tile along a world axis before the isometric squash (= TILE_W / sqrt2). */
const WORLD_PX = TILE_W / Math.SQRT2;
/** Tanks are drawn ~15 % larger than their collision footprint so they read well next to 1-tile walls. */
const SLICE_SCALE = (WORLD_PX / SLICE_PX_PER_TILE) * 1.15;
const LIFT_PX = 2.6;

interface Slice {
  holder: Container;
  sprite: Sprite;
}

const textureCache = new Map<string, { shadow: Texture; hull: Texture[]; turret: Texture[] }>();

function texturesFor(cls: TankClassId, team: number): { shadow: Texture; hull: Texture[]; turret: Texture[] } {
  const key = `${cls}:${team}`;
  let t = textureCache.get(key);
  if (!t) {
    const s = drawTankSlices(cls, TEAM_PALETTES[team % TEAM_PALETTES.length]);
    t = { shadow: Texture.from(s.shadow), hull: s.hull.map((c) => Texture.from(c)), turret: s.turret.map((c) => Texture.from(c)) };
    textureCache.set(key, t);
  }
  return t;
}

/** Pseudo-3D stacked-slice tank. Position it at the tank's screen position; set angles in world radians. */
export class TankView {
  readonly root = new Container();
  private readonly hull: Slice[] = [];
  private readonly turret: Slice[] = [];
  private readonly shadow: Slice;

  constructor(cls: TankClassId, team: number) {
    const tex = texturesFor(cls, team);
    const make = (texture: Texture, z: number): Slice => {
      const holder = new Container();
      holder.scale.set(1, 0.5);
      holder.y = -z * LIFT_PX;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(SLICE_SCALE);
      holder.addChild(sprite);
      this.root.addChild(holder);
      return { holder, sprite };
    };
    this.shadow = make(tex.shadow, -0.3);
    this.shadow.holder.x = 3;
    tex.hull.forEach((t, i) => this.hull.push(make(t, i)));
    const base = tex.hull.length;
    tex.turret.forEach((t, i) => this.turret.push(make(t, base + i)));
  }

  /** Recoil kick in px (decays in update), flash = white hit flash 0..1. */
  private recoil = 0;
  private flashT = 0;

  setAngles(hull: number, turret: number): void {
    const h = Math.PI / 4 + hull;
    const tr = Math.PI / 4 + turret;
    this.shadow.sprite.rotation = h;
    for (const s of this.hull) s.sprite.rotation = h;
    const ox = -Math.cos(tr) * this.recoil;
    const oy = -Math.sin(tr) * this.recoil;
    for (const s of this.turret) {
      s.sprite.rotation = tr;
      s.sprite.position.set(ox, oy);
    }
  }

  kick(px: number): void {
    this.recoil = Math.max(this.recoil, px);
  }

  hitFlash(): void {
    this.flashT = 1;
  }

  /** Per-frame visual decay (recoil spring, hit flash). */
  update(dt: number): void {
    this.recoil *= Math.exp(-dt * 14);
    if (this.recoil < 0.05) this.recoil = 0;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      const c = Math.round(255 * (1 - this.flashT) + 255 * this.flashT);
      const g = Math.round(255 - 120 * this.flashT);
      const tint = (c << 16) | (g << 8) | g;
      for (const s of this.hull) s.sprite.tint = tint;
      for (const s of this.turret) s.sprite.tint = tint;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

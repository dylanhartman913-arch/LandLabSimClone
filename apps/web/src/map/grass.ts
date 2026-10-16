import { Texture } from 'pixi.js';
import type { Season } from '@homestead/engine';

/** Seeded value noise for textures (cosmetic; the engine never sees it). */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

let grass: Texture | null = null;
let snow: Texture | null = null;
const baked = new Map<string, Texture>();

/**
 * Bake a tile pattern into one large texture drawn on a plain sprite. A tiling
 * shader costs a lot per pixel on software renderers; one textured quad does not.
 */
export function bakeTiled(tile: Texture, key: string, repeats: number): Texture {
  const hit = baked.get(key);
  if (hit) return hit;
  const src = tile.source.resource as HTMLCanvasElement;
  const size = Math.min(4096, src.width * repeats);
  const [c, g] = canvas(size);
  for (let y = 0; y < size; y += src.height) for (let x = 0; x < size; x += src.width) g.drawImage(src, x, y);
  const t = Texture.from(c);
  baked.set(key, t);
  return t;
}

/** A tileable grass texture: a green field with blades and clover speckles. */
export function grassTexture(): Texture {
  if (grass) return grass;
  const size = 256;
  const [c, g] = canvas(size);
  const r = rand(42);
  g.fillStyle = '#6f9a4a';
  g.fillRect(0, 0, size, size);
  for (let k = 0; k < 90; k++) {
    // soft patches
    const x = r() * size;
    const y = r() * size;
    const rad = 10 + r() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() > 0.5;
    grd.addColorStop(0, light ? 'rgba(150,190,90,0.35)' : 'rgba(60,100,40,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    for (const [ox, oy] of [
      [0, 0],
      [size, 0],
      [-size, 0],
      [0, size],
      [0, -size],
    ]) {
      g.save();
      g.translate(ox!, oy!);
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      g.restore();
    }
  }
  for (let k = 0; k < 1800; k++) {
    const x = r() * size;
    const y = r() * size;
    const shade = 70 + Math.floor(r() * 70);
    g.strokeStyle = `rgba(${shade - 30},${shade + 50},${shade - 40},0.55)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 3);
    g.stroke();
  }
  for (let k = 0; k < 60; k++) {
    g.fillStyle = r() > 0.7 ? 'rgba(245,235,180,0.8)' : 'rgba(40,80,30,0.5)';
    g.beginPath();
    g.arc(r() * size, r() * size, 0.8 + r(), 0, Math.PI * 2);
    g.fill();
  }
  grass = Texture.from(c);
  grass.source.style.addressMode = 'repeat';
  return grass;
}

/** Snow dusting overlay for winter. */
export function snowTexture(): Texture {
  if (snow) return snow;
  const size = 256;
  const [c, g] = canvas(size);
  const r = rand(7);
  for (let k = 0; k < 140; k++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 6 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(250,252,255,0.85)');
    grd.addColorStop(1, 'rgba(250,252,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  snow = Texture.from(c);
  snow.source.style.addressMode = 'repeat';
  return snow;
}

/** Multiplied over the grass: fresh spring, full summer, gold fall, pale winter. */
export const SEASON_TINT: Record<Season, number> = {
  spring: 0xdcf5c8,
  summer: 0xffffff,
  fall: 0xf0c878,
  winter: 0xc8d0c8,
};

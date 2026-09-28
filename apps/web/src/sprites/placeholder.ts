import { Graphics, type Renderer, type Texture } from 'pixi.js';
import type { System } from '@homestead/catalog';
import manifest from './manifest.json';
import { categoryColor, glyphFor, type GlyphKind } from './palette.ts';

const INK = 0x2b2418;
const CREAM = 0xfbf5e6;

/** Draw a category glyph centered at (0, 0) within a box of `s` pixels. Original vector art. */
export function drawGlyph(g: Graphics, kind: GlyphKind, s: number, color = CREAM): void {
  const u = s / 16; // a 16-unit grid
  const fill = { color };
  const line = { width: 1.6 * u, color, cap: 'round' as const, join: 'round' as const };
  switch (kind) {
    case 'house':
      g.poly([-6 * u, 0, 0, -6 * u, 6 * u, 0]).fill(fill);
      g.rect(-4.5 * u, 0, 9 * u, 6 * u).fill(fill);
      g.rect(-1.2 * u, 2 * u, 2.4 * u, 4 * u).fill({ color: INK, alpha: 0.35 });
      break;
    case 'tent':
      g.poly([-7 * u, 6 * u, 0, -6 * u, 7 * u, 6 * u]).fill(fill);
      g.poly([-1.5 * u, 6 * u, 0, 1 * u, 1.5 * u, 6 * u]).fill({ color: INK, alpha: 0.35 });
      break;
    case 'sun':
      g.circle(0, 0, 3.2 * u).fill(fill);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        g.moveTo(Math.cos(a) * 4.8 * u, Math.sin(a) * 4.8 * u)
          .lineTo(Math.cos(a) * 6.8 * u, Math.sin(a) * 6.8 * u)
          .stroke(line);
      }
      break;
    case 'bolt':
      g.poly([
        1.5 * u,
        -7 * u,
        -4 * u,
        1 * u,
        -0.5 * u,
        1 * u,
        -1.5 * u,
        7 * u,
        4 * u,
        -1 * u,
        0.5 * u,
        -1 * u,
      ]).fill(fill);
      break;
    case 'drop':
      g.moveTo(0, -7 * u)
        .bezierCurveTo(4 * u, -2 * u, 5 * u, 1 * u, 5 * u, 2.5 * u)
        .arc(0, 2.5 * u, 5 * u, 0, Math.PI)
        .bezierCurveTo(-5 * u, 1 * u, -4 * u, -2 * u, 0, -7 * u)
        .fill(fill);
      break;
    case 'filter':
      g.poly([
        -6 * u,
        -5 * u,
        6 * u,
        -5 * u,
        1.2 * u,
        1 * u,
        1.2 * u,
        6 * u,
        -1.2 * u,
        6 * u,
        -1.2 * u,
        1 * u,
      ]).fill(fill);
      break;
    case 'leaf':
      g.moveTo(-5 * u, 5 * u)
        .quadraticCurveTo(-5 * u, -6 * u, 6 * u, -6 * u)
        .quadraticCurveTo(6 * u, 5 * u, -5 * u, 5 * u)
        .fill(fill);
      g.moveTo(-5 * u, 5 * u)
        .lineTo(2 * u, -2 * u)
        .stroke({ ...line, color: INK, alpha: 0.4 });
      break;
    case 'tree':
      g.rect(-1 * u, 1 * u, 2 * u, 6 * u).fill({ color: INK, alpha: 0.5 });
      g.circle(0, -2 * u, 5 * u).fill(fill);
      break;
    case 'sprout':
      g.moveTo(0, 6 * u)
        .lineTo(0, -1 * u)
        .stroke(line);
      g.ellipse(-3 * u, -2 * u, 3 * u, 1.6 * u).fill(fill);
      g.ellipse(3 * u, -3.5 * u, 3 * u, 1.6 * u).fill(fill);
      g.rect(-6 * u, 5.5 * u, 12 * u, 1.5 * u).fill({ color: INK, alpha: 0.35 });
      break;
    case 'egg':
      g.ellipse(0, 0.5 * u, 4.5 * u, 6 * u).fill(fill);
      break;
    case 'hoof':
      g.ellipse(0, -1 * u, 5 * u, 3.5 * u).fill(fill);
      for (const x of [-3.5, -1.2, 1.2, 3.5]) g.rect(x * u - 0.6 * u, 1.5 * u, 1.2 * u, 4.5 * u).fill(fill);
      g.circle(5 * u, -3.5 * u, 1.8 * u).fill(fill);
      break;
    case 'bee':
      g.ellipse(0, 1 * u, 3.5 * u, 5 * u).fill(fill);
      for (const y of [-0.5, 2.5]) g.rect(-3.5 * u, y * u, 7 * u, 1.2 * u).fill({ color: INK, alpha: 0.6 });
      g.ellipse(-4 * u, -3.5 * u, 3 * u, 2 * u).fill({ color, alpha: 0.7 });
      g.ellipse(4 * u, -3.5 * u, 3 * u, 2 * u).fill({ color, alpha: 0.7 });
      break;
    case 'wheel':
      g.circle(0, 0, 6 * u).stroke(line);
      g.circle(0, 0, 1.5 * u).fill(fill);
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        g.moveTo(0, 0)
          .lineTo(Math.cos(a) * 6 * u, Math.sin(a) * 6 * u)
          .stroke({ ...line, width: 1 * u });
      }
      break;
    case 'flame':
      g.moveTo(0, -7 * u)
        .quadraticCurveTo(6 * u, 0, 3.5 * u, 5 * u)
        .quadraticCurveTo(0, 7.5 * u, -3.5 * u, 5 * u)
        .quadraticCurveTo(-6 * u, 0, 0, -7 * u)
        .fill(fill);
      g.ellipse(0, 3 * u, 1.8 * u, 2.8 * u).fill({ color: INK, alpha: 0.3 });
      break;
    case 'snow':
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        g.moveTo(-Math.cos(a) * 6.5 * u, -Math.sin(a) * 6.5 * u)
          .lineTo(Math.cos(a) * 6.5 * u, Math.sin(a) * 6.5 * u)
          .stroke(line);
      }
      g.circle(0, 0, 1.6 * u).fill(fill);
      break;
    case 'pot':
      g.roundRect(-5.5 * u, -2 * u, 11 * u, 7 * u, 2 * u).fill(fill);
      g.rect(-7 * u, -3 * u, 14 * u, 1.5 * u).fill(fill);
      for (const x of [-2.5, 0.5, 3.5])
        g.moveTo(x * u - u, -5 * u)
          .quadraticCurveTo(x * u, -6.5 * u, x * u - u, -8 * u)
          .stroke({ ...line, width: u });
      break;
    case 'box':
      g.rect(-5.5 * u, -4 * u, 11 * u, 9 * u).fill(fill);
      g.rect(-5.5 * u, -4 * u, 11 * u, 2.2 * u).fill({ color: INK, alpha: 0.3 });
      break;
    case 'swirl':
      g.moveTo(0, 0);
      for (let k = 0; k <= 40; k++) {
        const a = k * 0.4;
        const r = 0.18 * u * k;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke(line);
      break;
    case 'wrench':
      g.moveTo(-5 * u, 5 * u)
        .lineTo(2 * u, -2 * u)
        .stroke({ ...line, width: 2.4 * u });
      g.circle(3.5 * u, -3.5 * u, 3 * u).fill(fill);
      g.circle(4.5 * u, -4.5 * u, 1.3 * u).fill({ color: INK, alpha: 0.5 });
      break;
    case 'flower':
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI) / 5;
        g.circle(Math.cos(a) * 3.5 * u, Math.sin(a) * 3.5 * u - u, 2.4 * u).fill(fill);
      }
      g.circle(0, -u, 1.8 * u).fill({ color: 0xf2c641 });
      break;
    case 'coin':
      g.circle(0, 0, 6 * u).fill(fill);
      g.rect(-0.8 * u, -4 * u, 1.6 * u, 8 * u).fill({ color: INK, alpha: 0.4 });
      break;
    case 'field':
      for (let k = -2; k <= 2; k++) g.rect(-6 * u, k * 2.6 * u - 0.6 * u, 12 * u, 1.2 * u).fill(fill);
      break;
    case 'person':
      g.circle(0, -4 * u, 2.5 * u).fill(fill);
      g.roundRect(-3.5 * u, -1 * u, 7 * u, 8 * u, 2.5 * u).fill(fill);
      break;
  }
}

const TILE = 64;
const cache = new Map<string, Texture>();

/** Placeholder art for a system: a rounded tile in its first category's color with a glyph. */
export function systemTexture(renderer: Renderer, system: System): Texture {
  const key = system.spriteKey;
  const hit = cache.get(key);
  if (hit) return hit;
  const color = categoryColor(system.categories[0]);
  const g = new Graphics();
  if (system.layer === 'ground') {
    // Large plantings: a soft field with rows, so objects on top stay readable.
    g.roundRect(0, 0, TILE, TILE, 6).fill({ color, alpha: 0.55 });
    for (let k = 4; k < TILE; k += 8) g.rect(4, k, TILE - 8, 2).fill({ color: 0xffffff, alpha: 0.12 });
    g.roundRect(0, 0, TILE, TILE, 6).stroke({ width: 2, color, alpha: 0.9 });
    const glyph = new Graphics();
    drawGlyph(glyph, glyphFor(system.categories), 18, 0xffffff);
    glyph.position.set(TILE / 2, TILE / 2);
    glyph.alpha = 0.7;
    g.addChild(glyph);
  } else {
    g.roundRect(2, 4, TILE - 4, TILE - 4, 12).fill({ color: 0x000000, alpha: 0.18 }); // shadow
    g.roundRect(1, 1, TILE - 4, TILE - 4, 12).fill({ color });
    g.roundRect(1, 1, TILE - 4, TILE - 4, 12).stroke({ width: 2, color: INK, alpha: 0.35 });
    g.roundRect(5, 4, TILE - 12, 10, 5).fill({ color: 0xffffff, alpha: 0.18 }); // highlight
    const glyph = new Graphics();
    drawGlyph(glyph, glyphFor(system.categories), 34);
    glyph.position.set(TILE / 2 - 1, TILE / 2 - 1);
    g.addChild(glyph);
  }
  const tex = renderer.generateTexture({ target: g, resolution: 2, antialias: true });
  g.destroy({ children: true });
  cache.set(key, tex);
  return tex;
}

const SHIRTS = [0xc0483a, 0x3a7ec0, 0xe0b040, 0x5aa05a, 0x8a5ab0, 0xe07a3a];

/** A small top-down person (original): head, shoulders, shirt color by variant. */
export function personTexture(renderer: Renderer, variant: number): Texture {
  const key = `person:${variant % SHIRTS.length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Graphics();
  g.ellipse(16, 27, 9, 4).fill({ color: 0x000000, alpha: 0.2 });
  g.roundRect(7, 10, 18, 15, 7).fill({ color: SHIRTS[variant % SHIRTS.length]! });
  g.circle(16, 10, 6).fill({ color: 0xe8c4a0 });
  g.arc(16, 9, 6, Math.PI, 0).fill({ color: 0x4a3322 });
  const tex = renderer.generateTexture({ target: g, resolution: 2, antialias: true });
  g.destroy();
  cache.set(key, tex);
  return tex;
}

/** Real art from the manifest, if any exists for this key (none yet). */
export function manifestEntry(spriteKey: string): unknown {
  return (manifest.sprites as Record<string, unknown>)[spriteKey];
}

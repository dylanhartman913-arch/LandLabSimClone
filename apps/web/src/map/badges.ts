import { Container, Graphics, Text } from 'pixi.js';

/** Original vector glyphs for a resource, centred at (0, 0) within radius r (screen pixels). */
export function drawResourceGlyph(resource: string, r: number): Container {
  const c = new Container();
  const g = new Graphics();
  const ink = 0x1b1f16;
  const name = resource.toLowerCase();
  if (name === 'electricity') {
    g.poly([0.15 * r, -0.85 * r, -0.5 * r, 0.1 * r, -0.05 * r, 0.1 * r, -0.2 * r, 0.85 * r, 0.5 * r, -0.15 * r, 0.05 * r, -0.15 * r]).fill(ink);
  } else if (name.includes('water')) {
    g.poly([0, -0.8 * r, 0.45 * r, 0.05 * r, -0.45 * r, 0.05 * r]).fill(ink);
    g.circle(0, 0.2 * r, 0.47 * r).fill(ink);
  } else if (name.includes('wood') || name === 'waste lumber') {
    g.roundRect(-0.7 * r, -0.3 * r, 1.4 * r, 0.6 * r, 0.2 * r).fill(ink);
    g.circle(0.55 * r, 0, 0.18 * r).fill(0xf3eedf);
  } else if (name === 'heat' || name === 'cooking fuel') {
    g.poly([0, -0.85 * r, 0.5 * r, 0.1 * r, 0.3 * r, 0.7 * r, -0.3 * r, 0.7 * r, -0.5 * r, 0.1 * r]).fill(ink);
  } else if (name === 'cooling') {
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      g.moveTo(Math.cos(a) * -0.75 * r, Math.sin(a) * -0.75 * r).lineTo(Math.cos(a) * 0.75 * r, Math.sin(a) * 0.75 * r);
    }
    g.stroke({ width: 0.2 * r, color: ink });
  } else if (name === 'labor') {
    g.circle(0, 0, 0.7 * r).stroke({ width: 0.18 * r, color: ink });
    g.moveTo(0, 0).lineTo(0, -0.45 * r).moveTo(0, 0).lineTo(0.35 * r, 0).stroke({ width: 0.16 * r, color: ink });
  } else if (name === 'shelter') {
    g.poly([0, -0.75 * r, 0.7 * r, -0.05 * r, 0.45 * r, -0.05 * r, 0.45 * r, 0.65 * r, -0.45 * r, 0.65 * r, -0.45 * r, -0.05 * r, -0.7 * r, -0.05 * r]).fill(ink);
  } else if (['seeds', 'seedlings', 'compost', 'soil', 'green biomass', 'chicken feed', 'hay'].includes(name)) {
    g.ellipse(0, 0, 0.35 * r, 0.75 * r).fill(ink);
  } else {
    const t = new Text({ text: resource.slice(0, 1).toUpperCase(), style: { fontSize: r * 1.3, fontWeight: '700', fill: ink } });
    t.anchor.set(0.5);
    c.addChild(t);
  }
  c.addChildAt(g, 0);
  return c;
}

export const BADGE_RADIUS_PX = 9;

/** A status bubble: yellow when partial, red when blocked, with the missing input's glyph. */
export function makeBadge(level: 'partial' | 'blocked', resource: string | null, colorblind: boolean): Container {
  const root = new Container();
  const r = BADGE_RADIUS_PX;
  const fill = level === 'blocked' ? (colorblind ? 0xff9f40 : 0xe0523d) : colorblind ? 0x8fd3ff : 0xf2c641;
  const bg = new Graphics();
  bg.circle(1, 1.5, r).fill({ color: 0x000000, alpha: 0.35 });
  bg.circle(0, 0, r).fill(fill).stroke({ width: 1.5, color: 0x1b1f16 });
  if (level === 'blocked') {
    // A second cue besides colour: a slash across the bubble.
    bg.moveTo(-r * 0.7, r * 0.7).lineTo(r * 0.7, -r * 0.7).stroke({ width: 1.5, color: 0x1b1f16, alpha: 0.55 });
  }
  root.addChild(bg);
  if (resource) root.addChild(drawResourceGlyph(resource, r * 0.62));
  return root;
}

import { Container, Graphics } from 'pixi.js';
import type { ResourceNode } from '@homestead/catalog';

/** Original vector art for a natural node (G14), sized in feet, drawn fuller as `fill` (0-1) rises. */
export function drawNode(n: ResourceNode, fill: number): Container {
  const c = new Container();
  const g = new Graphics();
  const f = Math.max(0, Math.min(1, fill));
  switch (n.type) {
    case 'deadfall': {
      const logs = Math.max(1, Math.round(1 + f * 5));
      for (let k = 0; k < logs; k++) {
        const a = (k * 1.3) % Math.PI;
        const x = Math.cos(a * 3) * 4;
        const y = Math.sin(a * 2) * 3;
        g.roundRect(x - 6, y - 1.2, 12, 2.4, 1.2).fill({ color: k % 2 ? 0x7a5432 : 0x8b6440 });
        g.circle(x + 6, y, 1.2).fill(0xc79a63);
      }
      break;
    }
    case 'creek':
    case 'spring':
      g.ellipse(0, 0, n.type === 'creek' ? 9 : 6, n.type === 'creek' ? 5 : 4).fill({ color: 0x4f93c9, alpha: 0.9 });
      g.ellipse(-1.5, -1, 2.5, 1.2).fill({ color: 0xbfe3ff, alpha: 0.7 });
      break;
    case 'rain-pools':
      for (const [x, y, r] of [
        [-4, 1, 3],
        [3, -2, 2.4],
        [4, 3, 1.8],
      ] as const)
        g.ellipse(x, y, r, r * 0.6).fill({ color: 0x6aa8d8, alpha: 0.25 + 0.65 * f });
      break;
    case 'wild-greens':
      for (let k = 0; k < 3 + Math.round(f * 6); k++) {
        const a = k * 2.4;
        g.ellipse(Math.cos(a) * 5, Math.sin(a) * 4, 2.2, 1.1).fill(k % 2 ? 0x5fa64a : 0x7cc05f);
      }
      break;
    case 'berry-thicket':
      g.circle(0, 0, 6).fill(0x3e6f34);
      for (let k = 0; k < Math.round(f * 10); k++) {
        const a = k * 1.9;
        g.circle(Math.cos(a) * 4, Math.sin(a) * 4, 0.9).fill(0xb2324b);
      }
      break;
    case 'clay-bank':
      g.ellipse(0, 0, 8, 4.5).fill(0xb9764a);
      g.ellipse(1, -1, 4, 2).fill({ color: 0xd59466, alpha: 0.8 });
      break;
    case 'leaf-litter':
      for (let k = 0; k < Math.round(4 + f * 14); k++) {
        const a = k * 2.2;
        const r = 2 + ((k * 7) % 6);
        g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.7, 1.3, 0.8).fill(k % 3 ? 0xc9852f : 0x9c5a24);
      }
      break;
  }
  c.addChild(g);
  return c;
}

/** Radius (ft) to hover a node. */
export const NODE_HOVER_FT = 9;

import { useEffect, useRef } from 'react';
import { footprintSideFt, getSystem, parcelSideFt } from '@homestead/engine';
import { categoryColor, cssColor } from '../sprites/palette.ts';
import { screenToWorld, useGame } from '../store/game.ts';

const SIZE = 150;

/** Parcel overview with the current viewport; click or drag to jump there. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const s = useGame.getState();
      const side = parcelSideFt(s.game.settings);
      const k = (SIZE - 8) / side;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#5d8540';
      ctx.fillRect(4, 4, side * k, side * k);
      for (const inst of s.game.instances) {
        const sys = getSystem(s.catalog, inst.systemId);
        if (sys.layer === 'none') continue;
        const w = Math.max(2, footprintSideFt(sys.footprintSqft) * k);
        ctx.globalAlpha = sys.layer === 'ground' ? 0.5 : 1;
        ctx.fillStyle = cssColor(categoryColor(sys.categories[0]));
        ctx.fillRect(4 + inst.x * k - w / 2, 4 + inst.y * k - w / 2, w, w);
      }
      ctx.globalAlpha = 1;
      const a = screenToWorld(s.camera, s.viewport, 0, 0);
      const b = screenToWorld(s.camera, s.viewport, s.viewport.width, s.viewport.height);
      ctx.strokeStyle = '#fff4d6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(4 + a.x * k, 4 + a.y * k, (b.x - a.x) * k, (b.y - a.y) * k);
    };
    draw();
    return useGame.subscribe(draw);
  }, []);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const r = e.currentTarget.getBoundingClientRect();
    const s = useGame.getState();
    const k = (SIZE - 8) / parcelSideFt(s.game.settings);
    s.setCamera({ cx: (e.clientX - r.left - 4) / k, cy: (e.clientY - r.top - 4) / k });
  };

  return (
    <canvas
      ref={ref}
      className="minimap"
      width={SIZE}
      height={SIZE}
      aria-label="Minimap: click to move the view"
      onPointerDown={jump}
      onPointerMove={jump}
    />
  );
}

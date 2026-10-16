import { FLOW_GROUPS, type FlowGroup } from '@homestead/engine';
import { FLOW_COLORS, FLOW_SHORT } from '../map/scene.ts';
import { cssColor } from '../sprites/palette.ts';
import { useGame } from '../store/game.ts';

const ORDER: FlowGroup[] = ['water', 'power', 'food', 'heat', 'waste', 'labor'];

/** Flow overlay legend and toggles (F). */
export function FlowLegend() {
  const overlay = useGame((s) => s.overlay);
  const selection = useGame((s) => s.selection);
  const set = useGame((s) => s.setOverlay);
  if (!overlay.on) return null;
  const toggle = (g: FlowGroup) =>
    set({
      groups: overlay.groups.includes(g) ? overlay.groups.filter((x) => x !== g) : [...overlay.groups, g],
    });
  return (
    <div className="legend" role="group" aria-label="Flow overlay" data-testid="flow-legend">
      <strong>Flows</strong>
      <span className="muted small">
        {selection.length === 1 ? 'for the selected system' : 'across the design'}
      </span>
      {ORDER.map((g) => (
        <label key={g} className="legend-item">
          <input
            type="checkbox"
            checked={overlay.groups.includes(g)}
            onChange={() => toggle(g)}
            data-testid={`flow-${g}`}
          />
          <span className="swatch" style={{ background: cssColor(FLOW_COLORS[g] ?? 0) }} aria-hidden="true" />
          {FLOW_GROUPS[g].label}
        </label>
      ))}
      <span className="legend-item">
        <span className="swatch dashed" style={{ borderColor: cssColor(FLOW_SHORT) }} aria-hidden="true" />{' '}
        Short
      </span>
      <button className="btn ghost" onClick={() => set({ on: false })} aria-label="Hide flows">
        ✕
      </button>
    </div>
  );
}

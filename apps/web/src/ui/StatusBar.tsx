import { getSystem } from '@homestead/engine';
import { useGame } from '../store/game.ts';

/** What the pointer will do right now, and the selection's actions. */
export function StatusBar() {
  const tool = useGame((s) => s.tool);
  const selection = useGame((s) => s.selection);
  const catalog = useGame((s) => s.catalog);
  const game = useGame((s) => s.game);
  const s = useGame.getState();
  if (tool.kind === 'place') {
    const sys = getSystem(catalog, tool.systemId);
    return (
      <div className="status" data-testid="status">
        <span>
          Placing <strong>{sys.name}</strong> ({tool.mode === 'diy' ? 'build it yourself' : 'buy'}). Click to
          place, Shift-click to keep placing, Esc to cancel.
        </span>
        <button className="btn ghost" onClick={() => s.cancelTool()}>
          Cancel
        </button>
      </div>
    );
  }
  if (selection.length) {
    const names = selection
      .map((id) => game.instances.find((i) => i.id === id))
      .filter((i) => i !== undefined)
      .map((i) => getSystem(catalog, i.systemId).name);
    return (
      <div className="status" data-testid="status">
        <span>
          Selected: <strong>{names.length === 1 ? names[0] : `${names.length} systems`}</strong>. Drag to
          move, Delete to remove, Ctrl-C / Ctrl-V to duplicate.
        </span>
        {names.length === 1 && (
          <button
            className="btn ghost"
            onClick={() => s.openCard(game.instances.find((i) => i.id === selection[0])!.systemId)}
          >
            Details
          </button>
        )}
        <button
          className="btn ghost danger"
          onClick={() => s.deleteSelection()}
          data-testid="delete-selection"
        >
          Remove
        </button>
      </div>
    );
  }
  return (
    <div className="status muted" data-testid="status">
      Pick a system in the drawer to place it. Drag the map to pan, scroll to zoom, Shift-drag to select.
    </div>
  );
}

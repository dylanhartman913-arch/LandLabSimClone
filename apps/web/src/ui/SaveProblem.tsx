import { useEffect, useState } from 'react';
import type { SaveFile } from '@homestead/engine';
import { lastGoodAutosave, tryLoadSave } from '../lib/saves.ts';
import { useGame } from '../store/game.ts';

/** A save that couldn't be loaded: what failed, and the last good autosave to go back to. */
export function SaveProblem() {
  const p = useGame((s) => s.saveProblem);
  const [fallback, setFallback] = useState<{ key: string; save: SaveFile } | null | undefined>(undefined);
  useEffect(() => {
    if (!p) return;
    setFallback(undefined);
    void lastGoodAutosave(p.file).then(setFallback);
  }, [p]);
  if (!p) return null;
  const st = useGame.getState();
  const close = () => st.setSaveProblem(null);
  return (
    <div className="modal-back">
      <section className="modal" role="alertdialog" aria-label="Save couldn't be loaded" data-testid="save-problem">
        <h2>{p.source} couldn’t be loaded</h2>
        <p>Your current game is unchanged. Here is what was wrong:</p>
        <ul data-testid="save-problems">
          {p.problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {fallback === undefined && <p className="muted">Looking for your last good autosave…</p>}
        {fallback === null && <p className="muted">There is no earlier autosave to go back to.</p>}
        {fallback && (
          <p>
            Your last good autosave is from day {fallback.save.absDay}
            {fallback.save.savedAt ? ` (saved ${new Date(fallback.save.savedAt).toLocaleString()})` : ''}.
          </p>
        )}
        <div className="row-actions">
          {fallback && (
            <button
              className="btn primary"
              autoFocus
              onClick={() => {
                close();
                if (tryLoadSave(fallback.save, 'The last good autosave', { verify: false }))
                  st.toast(`Loaded your last good autosave (day ${fallback.save.absDay}).`);
              }}
              data-testid="load-last-good"
            >
              Load the last good autosave
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              close();
              st.setWizard(true);
            }}
          >
            Start a new game
          </button>
          <button className="btn ghost" onClick={close} autoFocus={!fallback} data-testid="save-problem-close">
            Keep playing this game
          </button>
        </div>
      </section>
    </div>
  );
}

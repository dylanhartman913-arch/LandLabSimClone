import { useEffect } from 'react';
import { AUTOSAVE, writeSave } from '../lib/saves.ts';
import { useGame } from '../store/game.ts';

/** Autosave every in-game week (IndexedDB; a warning shows if it isn't available). */
export function useAutosave() {
  const days = useGame((s) => s.daysSinceAutosave);
  const readOnly = useGame((s) => s.readOnly);
  useEffect(() => {
    if (days < 7 || readOnly) return;
    useGame.setState({ daysSinceAutosave: 0 });
    void writeSave(AUTOSAVE, 'Autosave');
  }, [days, readOnly]);
}

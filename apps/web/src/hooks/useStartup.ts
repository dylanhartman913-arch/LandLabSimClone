import { useEffect } from 'react';
import { AUTOSAVE, openSharedDesign, readSave, tryLoadSave } from '../lib/saves.ts';
import { useGame } from '../store/game.ts';
import { loadPref } from '../store/persist.ts';

/**
 * On load: `?design=` opens a shared design read-only; `?new` starts fresh;
 * otherwise the last autosave is restored if there is one.
 */
export function useStartup() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const st = useGame.getState();
    const design = params.get('design');
    if (design) {
      try {
        const name = openSharedDesign(design);
        st.toast(`Viewing “${name}”, read only. Open Saves to make your own copy.`);
      } catch (e) {
        st.toast(
          `That design link couldn't be opened: ${e instanceof Error ? e.message : String(e)}`,
          'warn',
        );
      }
      return;
    }
    if (params.has('new')) return;
    void readSave(AUTOSAVE).then((save) => {
      if (!save) {
        // First visit: offer the new-game wizard.
        if (!loadPref('seenWizard', false)) st.setWizard(true);
        return;
      }
      if (tryLoadSave(save, 'Your autosave', { verify: false }))
        st.toast(`Welcome back: continued from your autosave (day ${save.absDay}).`);
    });
  }, []);
}

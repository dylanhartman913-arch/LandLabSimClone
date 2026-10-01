import { useEffect } from 'react';
import { useGame } from '../store/game.ts';
import { usePlan } from '../store/plan.ts';

const DIRS: Record<string, [number, number]> = {
  w: [0, -1],
  W: [0, -1],
  ArrowUp: [0, -1],
  s: [0, 1],
  S: [0, 1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  A: [-1, 0],
  ArrowLeft: [-1, 0],
  d: [1, 0],
  D: [1, 0],
  ArrowRight: [1, 0],
};

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file']);

/** True while the player is typing in a text field (shortcuts stay out of the way). */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((t as HTMLInputElement).type);
  return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Global keyboard shortcuts (ignored while typing in a field). */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const s = useGame.getState();
      const mod = e.ctrlKey || e.metaKey;
      const pan = 60 / s.camera.zoom;
      const k = e.key;
      if (mod && (k === 'z' || k === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && (k === 'y' || k === 'Y')) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && (k === 'c' || k === 'C')) {
        s.copySelection();
        return;
      }
      if (mod && (k === 'v' || k === 'V')) {
        const p = window.__homestead?.scene?.pointerWorld() ?? { x: s.camera.cx, y: s.camera.cy };
        s.paste(p.x, p.y);
        return;
      }
      if (mod) return;
      switch (k) {
        case 'Escape':
          if (s.why) s.showWhy(null);
          else if (s.resourcePage) s.closeResource();
          else if (s.tool.kind !== 'select') {
            s.cancelTool();
            s.setKbCursor(null);
          }
          else if (s.checklistOpen) s.setChecklist(false);
          else if (usePlan.getState().open) usePlan.getState().setOpen(false);
          else if (s.panel) s.setPanel(null);
          else if (s.cardSystemId) s.openCard(null);
          else s.select([]);
          break;
        case '/': {
          // Jump to the drawer's search.
          e.preventDefault();
          if (!s.drawerOpen) s.setDrawer(true);
          s.setDrawerTab('systems');
          setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>('[data-testid="system-search"]');
            el?.focus();
            el?.select(); // typing replaces the last search
          }, 0);
          break;
        }
        case 'n':
        case 'N':
          s.setChecklist(!s.checklistOpen);
          break;
        case 'm':
        case 'M':
          s.setPanel(s.panel === 'market' ? null : 'market');
          break;
        case 'b':
        case 'B':
          s.setPrefs({ badges: !s.prefs.badges });
          s.toast(s.prefs.badges ? 'Status bubbles hidden (B to show).' : 'Status bubbles on: yellow is partial, red is blocked.');
          break;
        case 'p':
        case 'P':
          usePlan.getState().setOpen(!usePlan.getState().open);
          break;
        case 'l':
        case 'L':
          s.setPanel(s.panel === 'almanac' ? null : 'almanac');
          break;
        case 'f':
        case 'F':
          s.setOverlay({ on: !s.overlay.on });
          break;
        case 'Backspace':
          // Back through resource pages and cards first (G13); otherwise delete like Delete.
          if ((s.resourcePage || s.cardSystemId) && s.navigateBack()) {
            e.preventDefault();
            break;
          }
          s.deleteSelection();
          break;
        case 'Delete':
          s.deleteSelection();
          break;
        case ' ':
          e.preventDefault();
          s.togglePause();
          break;
        case '1':
          s.setSpeed(1);
          break;
        case '2':
          s.setSpeed(3);
          break;
        case '3':
          s.setSpeed(10);
          break;
        case 'w':
        case 'W':
        case 'ArrowUp':
        case 's':
        case 'S':
        case 'ArrowDown':
        case 'a':
        case 'A':
        case 'ArrowLeft':
        case 'd':
        case 'D':
        case 'ArrowRight': {
          e.preventDefault();
          const dir = DIRS[k]!;
          if (s.tool.kind === 'place' && k.startsWith('Arrow')) {
            // Keyboard placement: arrows move the placement cursor, Enter places.
            const step = (e.shiftKey ? 10 : 1) * Math.max(5, s.prefs.snap);
            const c = s.kbCursor ?? { x: s.camera.cx, y: s.camera.cy };
            s.setKbCursor({ x: c.x + dir[0] * step, y: c.y + dir[1] * step });
          } else if (s.selection.length && k.startsWith('Arrow')) {
            // Arrow keys nudge the selection (Shift for 10×).
            const step = (e.shiftKey ? 10 : 1) * Math.max(1, s.prefs.snap);
            s.moveSelection(dir[0] * step, dir[1] * step);
          } else {
            s.setCamera({ cx: s.camera.cx + dir[0] * pan, cy: s.camera.cy + dir[1] * pan });
          }
          break;
        }
        case 'Enter':
          if (s.tool.kind === 'place') {
            e.preventDefault();
            const c = s.kbCursor ?? { x: s.camera.cx, y: s.camera.cy };
            const r = s.placeAt(c.x, c.y, e.shiftKey);
            if (!r.ok) s.toast(r.reason ?? 'Can’t place that here', 'warn');
            else s.toast('Placed.');
          }
          break;
        case '+':
        case '=':
          s.setCamera({ zoom: s.camera.zoom * 1.25 });
          break;
        case '-':
        case '_':
          s.setCamera({ zoom: s.camera.zoom / 1.25 });
          break;
        case '0':
        case 'Home':
          s.zoomToFit();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

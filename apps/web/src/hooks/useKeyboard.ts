import { useEffect } from 'react';
import { useGame } from '../store/game.ts';

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  );
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
          if (s.tool.kind !== 'select') s.cancelTool();
          else if (s.cardSystemId) s.openCard(null);
          else s.select([]);
          break;
        case 'Delete':
        case 'Backspace':
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
          e.preventDefault();
          s.setCamera({ cy: s.camera.cy - pan });
          break;
        case 's':
        case 'S':
        case 'ArrowDown':
          e.preventDefault();
          s.setCamera({ cy: s.camera.cy + pan });
          break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
          e.preventDefault();
          s.setCamera({ cx: s.camera.cx - pan });
          break;
        case 'd':
        case 'D':
        case 'ArrowRight':
          e.preventDefault();
          s.setCamera({ cx: s.camera.cx + pan });
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

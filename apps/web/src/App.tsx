import { useGameLoop } from './hooks/useGameLoop.ts';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { Minimap } from './map/Minimap.tsx';
import { MapView } from './map/MapView.tsx';
import { screenToWorld, useGame } from './store/game.ts';
import { Drawer } from './ui/Drawer.tsx';
import { Hud } from './ui/Hud.tsx';
import { StatusBar } from './ui/StatusBar.tsx';
import { SystemCard } from './ui/SystemCard.tsx';
import { Toasts } from './ui/Toasts.tsx';

export function App() {
  useKeyboard();
  useGameLoop();
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData('application/x-homestead-system');
    if (!id) return;
    e.preventDefault();
    const s = useGame.getState();
    const r = e.currentTarget.getBoundingClientRect();
    const w = screenToWorld(s.camera, s.viewport, e.clientX - r.left, e.clientY - r.top);
    s.startPlacing(id, 'buy');
    const res = useGame.getState().placeAt(w.x, w.y);
    if (!res.ok) {
      s.toast(res.reason ?? 'Can’t place that here', 'warn');
      s.cancelTool();
    }
  };
  return (
    <div className="app">
      <Hud />
      <div className="main">
        <Drawer />
        <div
          className="stage"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-homestead-system')) e.preventDefault();
          }}
          onDrop={onDrop}
        >
          <MapView />
          <Minimap />
          <StatusBar />
          <SystemCard />
          <Toasts />
        </div>
      </div>
    </div>
  );
}

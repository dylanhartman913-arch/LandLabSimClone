import { useAutosave } from './hooks/useAutosave.ts';
import { useGameLoop } from './hooks/useGameLoop.ts';
import { useStartup } from './hooks/useStartup.ts';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { Minimap } from './map/Minimap.tsx';
import { MapView } from './map/MapView.tsx';
import { screenToWorld, useGame } from './store/game.ts';
import { Almanac } from './ui/Almanac.tsx';
import { Checklist } from './ui/Checklist.tsx';
import { Drawer } from './ui/Drawer.tsx';
import { FlowLegend } from './ui/FlowLegend.tsx';
import { NewGame } from './ui/NewGame.tsx';
import { HintCard, QuestCard } from './ui/Quests.tsx';
import { Reports } from './ui/Reports.tsx';
import { Saves } from './ui/Saves.tsx';
import { Settings } from './ui/Settings.tsx';
import { Hud } from './ui/Hud.tsx';
import { StatusBar } from './ui/StatusBar.tsx';
import { SystemCard } from './ui/SystemCard.tsx';
import { Toasts } from './ui/Toasts.tsx';
import { WhyPopover } from './ui/Why.tsx';

export function App() {
  useKeyboard();
  useGameLoop();
  useAutosave();
  useStartup();
  const prefs = useGame((s) => s.prefs);
  const panel = useGame((s) => s.panel);
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
    <div
      className={`app ${prefs.colorblind ? 'cb' : ''} ${prefs.reducedMotion ? 'reduced-motion' : ''}`}
      style={{ '--ui-scale': prefs.uiScale } as React.CSSProperties}
    >
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
          <div className="side-stack">
            <QuestCard />
            <HintCard />
          </div>
          <FlowLegend />
          <SystemCard />
          <Checklist />
          {panel === 'almanac' && <Almanac />}
          {panel === 'report' && <Reports />}
          {panel === 'saves' && <Saves />}
          {panel === 'settings' && <Settings />}
          <Toasts />
        </div>
      </div>
      <WhyPopover />
      <NewGame />
    </div>
  );
}

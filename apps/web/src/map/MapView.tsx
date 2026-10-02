import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { designBalance, gameDigest, getSystem, NODE_LABEL, nodeStockOf, type GameState } from '@homestead/engine';
import { fmtNum } from '../lib/format.ts';
import { useGame, worldToScreen } from '../store/game.ts';
import { MapScene } from './scene.ts';

declare global {
  interface Window {
    __homestead?: {
      store: typeof useGame;
      scene: MapScene | null;
      /** Client (page) coordinates of a world point. */
      worldToClient(x: number, y: number): { x: number; y: number };
      /** Digest of the current game (the replay test compares it with a save's). */
      digest(): string;
      /** Balance mode for the current layout (tests compare the checklist against it). */
      balance(): { need: string; provided: number; needed: number; pct: number }[];
      /** performance.now() when the map first became ready (the load-time test reads it). */
      readyAt: number;
    };
  }
}

/** The playfield: a PixiJS canvas driven by the store. */
/** Tooltip text for every natural node on the land (G14). */
function nodeOptionsAll(g: GameState): { id: string; label: string; text: string }[] {
  return g.site.nodes.map((n) => {
    const stock = nodeStockOf(g, n);
    const unit = useGame.getState().catalog.resources.find((r) => r.name === n.resource)?.unit ?? '';
    const amount = Number.isFinite(stock) ? `${fmtNum(stock)} ${unit} left` : 'plenty';
    return {
      id: n.id,
      label: NODE_LABEL[n.type],
      text: `${n.resource}: ${amount} · ${fmtNum(n.yieldPerHour)} ${unit} per hour of work${n.untreated ? ' · untreated: filter or boil it' : ''}`,
    };
  });
}

export function MapView() {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const catalog = useGame((s) => s.catalog);

  useEffect(() => {
    const el = host.current!;
    const app = new Application();
    let scene: MapScene | null = null;
    let alive = true;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      useGame.getState().setViewport(r.width, r.height);
      if (app.renderer) app.renderer.resize(r.width, r.height);
    });
    void app
      .init({
        resizeTo: el,
        background: 0x2a3a20,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      .then(() => {
        if (!alive) {
          app.destroy(true);
          return;
        }
        el.appendChild(app.canvas);
        app.canvas.setAttribute('aria-label', 'Homestead map');
        app.canvas.setAttribute('role', 'application');
        app.canvas.dataset.testid = 'map-canvas';
        app.canvas.tabIndex = 0; // keyboard players can Tab to the map (arrows pan, or place with arrows + Enter)
        const r = el.getBoundingClientRect();
        useGame.getState().setViewport(r.width, r.height);
        useGame.getState().zoomToFit();
        scene = new MapScene(app, catalog);
        scene.onHover = (id, x, y) => setHover(id ? { id, x, y } : null);
        sceneRef.current = scene;
        ro.observe(el);
        window.__homestead = {
          readyAt: performance.now(),
          store: useGame,
          scene,
          worldToClient(x, y) {
            const s = useGame.getState();
            const p = worldToScreen(s.camera, s.viewport, x, y);
            const cr = app.canvas.getBoundingClientRect();
            return { x: cr.left + p.x, y: cr.top + p.y };
          },
          digest() {
            return gameDigest(useGame.getState().game);
          },
          balance() {
            const s = useGame.getState();
            return designBalance(s.game, s.catalog).checklist.map((r) => ({
              need: r.need,
              provided: r.provided.value,
              needed: r.needed.value,
              pct: r.pct.value,
            }));
          },
        };
        el.dataset.ready = 'true';
      });
    return () => {
      alive = false;
      ro.disconnect();
      scene?.destroy();
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [catalog]);

  const nodeId = hover?.id.startsWith('node:') ? hover.id.slice(5) : null;
  const node = nodeId ? nodeOptionsAll(useGame.getState().game).find((n) => n.id === nodeId) : null;
  const inst = hover && !nodeId ? useGame.getState().game.instances.find((i) => i.id === hover.id) : null;
  const sys = inst ? getSystem(catalog, inst.systemId) : null;
  return (
    <div className="map-host" ref={host} data-testid="map">
      {hover && node && (
        <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 10 }} role="tooltip" data-testid="node-tip">
          <strong>{node.label}</strong>
          <span className="tip-sub">{node.text}</span>
        </div>
      )}
      {hover && sys && inst && (
        <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 10 }} role="tooltip">
          <strong>{sys.name}</strong>
          {inst.status === 'building' && <span className="tip-sub">Under construction</span>}
          {sceneRef.current?.badgeInfo.get(inst.id) && (
            <span className="tip-sub">{sceneRef.current.badgeInfo.get(inst.id)!.text}</span>
          )}
        </div>
      )}
    </div>
  );
}

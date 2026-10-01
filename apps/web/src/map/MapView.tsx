import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { designBalance, gameDigest, getSystem } from '@homestead/engine';
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

  const inst = hover ? useGame.getState().game.instances.find((i) => i.id === hover.id) : null;
  const sys = inst ? getSystem(catalog, inst.systemId) : null;
  return (
    <div className="map-host" ref={host} data-testid="map">
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

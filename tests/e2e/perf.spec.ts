import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('pans and zooms at 60 fps with 500 instances', async ({ page }) => {
  await openApp(page);
  // Lay out 500 small systems on a 5-acre parcel through the store.
  await page.evaluate(() => {
    const h = window.__homestead!;
    const s = h.store.getState();
    const g0 = s.game;
    const ids = ['S002', 'S018', 'S078', 'S045', 'S130', 'S021', 'S022', 'S147', 'S137', 'S072'];
    let game = { ...g0, settings: { ...g0.settings, parcelAcres: 5 } };
    const cat = s.catalog;
    let n = 0;
    for (let row = 0; row < 25 && n < 500; row++) {
      for (let col = 0; col < 20 && n < 500; col++) {
        const id = ids[(row * 20 + col) % ids.length]!;
        const inst = {
          id: `p${n}`,
          systemId: id,
          x: 14 + col * 22,
          y: 14 + row * 18,
          status: 'active' as const,
          buildMode: 'prebuilt' as const,
          paid: 0,
          setupHoursNeeded: 0,
          setupHoursDone: 0,
          materialsDrawn: true,
          activeSince: 0,
          priority: 2,
        };
        game = { ...game, instances: [...game.instances, inst] };
        n++;
      }
    }
    void cat;
    h.store.setState({ game });
    h.store.getState().zoomToFit();
  });
  await page.waitForTimeout(500);
  const count = await page.evaluate(() => window.__homestead!.store.getState().game.instances.length);
  expect(count).toBeGreaterThanOrEqual(500);
  await shot(page, 'g10', '01-five-hundred');

  // Time Pixi's render submission separately from the frame interval.
  await page.evaluate(() => {
    const app = window.__homestead!.scene!.app as unknown as {
      renderer: { render: (...a: unknown[]) => unknown };
      __renderMs?: number[];
    };
    const orig = app.renderer.render.bind(app.renderer);
    app.__renderMs = [];
    app.renderer.render = (...a: unknown[]) => {
      const t = performance.now();
      const r = orig(...a);
      app.__renderMs!.push(performance.now() - t);
      return r;
    };
  });

  // Scripted pan and zoom for ~2 s while recording frames.
  const stats = await page.evaluate(async () => {
    const h = window.__homestead!;
    const scene = h.scene!;
    const app = scene.app as unknown as { __renderMs: number[] };
    scene.frameTimes.length = 0;
    scene.frameWork.length = 0;
    app.__renderMs.length = 0;
    const s = h.store.getState();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const t = (performance.now() - start) / 1000;
        h.store.getState().setCamera({
          cx: 250 + Math.sin(t * 2) * 120,
          cy: 250 + Math.cos(t * 1.5) * 80,
          zoom: s.camera.zoom * (1.4 + Math.sin(t * 3) * 0.6),
        });
        if (t < 2) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const ft = scene.frameTimes;
    const gl = (scene.app.renderer as unknown as { gl: WebGLRenderingContext }).gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: ft.length - 1,
      interval: avg(ft.slice(1).map((v, i) => v - ft[i]!)),
      sceneWork: avg(scene.frameWork),
      render: avg(app.__renderMs),
      gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    };
  });
  console.log(
    `500 instances on ${stats.gpu}: ${stats.frames} frames, interval ${stats.interval.toFixed(1)} ms, ` +
      `scene work ${stats.sceneWork.toFixed(2)} ms, render submit ${stats.render.toFixed(1)} ms`,
  );
  // The CPU side of a frame (our scene update) must fit easily in a 60 fps budget. On a software
  // rasterizer (SwiftShader: headless Chromium in CI and the cloud sandbox) the frame interval is
  // bound by fill rate, so it is logged, and only asserted when a hardware GPU is present.
  expect(stats.sceneWork + stats.render).toBeLessThan(1000 / 60);
  if (!/SwiftShader|llvmpipe|Software/i.test(stats.gpu)) expect(stats.interval).toBeLessThan(1000 / 55);
});

test('first load is quick and a year at 10× costs well under a second of wall time', async ({ page }) => {
  await page.goto('/?new');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  const load = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { dcl: nav.domContentLoadedEventEnd, ready: window.__homestead!.readyAt };
  });
  console.log(`first load: DOMContentLoaded ${load.dcl.toFixed(0)} ms, map ready ${load.ready.toFixed(0)} ms`);
  // Budget on a mid laptop is 2.5 s (Lighthouse in CI checks it too); software WebGL here is slower to start.
  expect(load.ready).toBeLessThan(2500);

  // A whole year of the default game stepped through the store (what 10× does, 10 days per tick).
  const ms = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.setPrefs({
      autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false },
    });
    const t = performance.now();
    for (let i = 0; i < 37; i++) window.__homestead!.store.getState().tick(10);
    return performance.now() - t;
  });
  console.log(`a simulated year through the store: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(1000);
});

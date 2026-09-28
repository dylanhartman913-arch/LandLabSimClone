import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

/** Read or write a key in the app's IndexedDB save store from the page. */
function idb(page: Page, op: 'get' | 'put', key: string, value?: unknown) {
  return page.evaluate(
    ([o, k, v]) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('terra-homestead', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('saves');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('saves', o === 'get' ? 'readonly' : 'readwrite');
          const store = tx.objectStore('saves');
          const r = o === 'get' ? store.get(k as string) : store.put(v, k as string);
          r.onsuccess = () => resolve(o === 'get' ? r.result : true);
          r.onerror = () => reject(r.error);
        };
      }),
    [op, key, value] as const,
  );
}

const quiet = {
  autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false },
};

test('on a tablet the drawer is a bottom sheet and the game still plays', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openApp(page);
  const drawer = await page.getByTestId('drawer').boundingBox();
  const map = await page.getByTestId('map').boundingBox();
  expect(drawer!.width).toBeGreaterThan(800);
  expect(drawer!.y).toBeGreaterThan(map!.y + map!.height - 2);
  // Pick a system from the sheet and place it on the map.
  await page.getByTestId('system-search').fill('yurt');
  const yurt = await page.evaluate(() => window.__homestead!.store.getState().catalog.systems.find((x) => x.name === 'Yurt')!.id);
  await page.getByTestId(`tile-${yurt}`).click();
  await expect(page.getByTestId('system-card')).toBeVisible();
  await shot(page, 'g10', '02-tablet-card');
  await page.getByTestId('add-buy').click();
  const box = (await page.getByTestId('map').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await expect
    .poll(() => page.evaluate((id) => window.__homestead!.store.getState().game.instances.some((i) => i.systemId === id), yurt))
    .toBe(true);
  // Collapse the sheet: the map gets the room back.
  await page.getByTestId('drawer-toggle').click();
  const closed = await page.getByTestId('drawer').boundingBox();
  expect(closed!.height).toBeLessThan(40);
  await shot(page, 'g10', '03-tablet-sheet-closed');
});

test('a broken panel shows what failed while the rest of the game keeps running', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await openApp(page);
  // A damaged report (as if from a bad save) makes the report panel throw when it renders.
  await page.evaluate(() => {
    const st = window.__homestead!.store;
    st.setState({ reports: [{ title: 'Broken', shortages: null } as never] });
    st.getState().setPanel('report');
  });
  await expect(page.getByTestId('error-the-report')).toBeVisible();
  await expect(page.getByTestId('error-the-report')).toContainText('ran into a problem');
  // The clock and the map still work.
  const before = await page.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay);
  await page.evaluate(() => window.__homestead!.store.getState().tick(3));
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(before + 3);
  await expect(page.getByTestId('hud')).toBeVisible();
  await shot(page, 'g10', '04-panel-error');
  await page.getByTestId('error-the-report').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('error-the-report')).toHaveCount(0);
  expect(errors.some((e) => e.includes('[The report]'))).toBe(true);
});

test('a corrupted save says what failed and offers the last good autosave', async ({ page }) => {
  await openApp(page);
  await page.evaluate((q) => window.__homestead!.store.getState().setPrefs(q), quiet);
  // Play two weeks so an autosave exists.
  await page.evaluate(() => window.__homestead!.store.getState().tick(8));
  await expect.poll(async () => ((await idb(page, 'get', 'autosave')) as { absDay?: number } | undefined)?.absDay ?? 0).toBeGreaterThan(0);
  const good = (await idb(page, 'get', 'autosave')) as { absDay: number };

  // Import a damaged file.
  const bad = { schema: 'homestead.save.v1', init: { siteId: 'front-range', seed: 1 }, actions: [], absDay: 3, digest: 'x', state: { schema: 'homestead.game.v1', instances: [{ systemId: 'S999' }] } };
  const dir = mkdtempSync(join(tmpdir(), 'bad-save-'));
  const file = join(dir, 'damaged.homestead.json');
  writeFileSync(file, JSON.stringify(bad));
  await page.getByTestId('open-saves').click();
  await page.getByTestId('import-file').setInputFiles(file);
  const dlg = page.getByTestId('save-problem');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('damaged.homestead.json couldn’t be loaded');
  await expect(page.getByTestId('save-problems')).toContainText('no daily ledgers');
  await expect(page.getByTestId('save-problems')).toContainText("catalog doesn't have: S999");
  await expect(dlg).toContainText(`last good autosave is from day ${good.absDay}`);
  await shot(page, 'g10', '05-corrupt-save');
  // Keep playing leaves the game as it was; loading the autosave goes back to it.
  await page.evaluate(() => window.__homestead!.store.getState().tick(5));
  await page.getByTestId('load-last-good').click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(good.absDay);
});

test('a corrupted autosave on start-up falls back to the one before it', async ({ page }) => {
  await openApp(page);
  await page.evaluate((q) => window.__homestead!.store.getState().setPrefs(q), quiet);
  await page.evaluate(() => window.__homestead!.store.getState().tick(8));
  await expect.poll(async () => ((await idb(page, 'get', 'autosave')) as { absDay?: number } | undefined)?.absDay ?? 0).toBeGreaterThan(0);
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  await expect.poll(async () => ((await idb(page, 'get', 'autosave-prev')) as { absDay?: number } | undefined)?.absDay ?? 0).toBeGreaterThan(0);
  const prev = (await idb(page, 'get', 'autosave-prev')) as { absDay: number };
  // Damage the newest autosave, then reload without ?new so the game restores it.
  await idb(page, 'put', 'autosave', { schema: 'homestead.save.v1', state: 'garbage' });
  await page.goto('/');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  const dlg = page.getByTestId('save-problem');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Your autosave couldn’t be loaded');
  await expect(dlg).toContainText(`from day ${prev.absDay}`);
  await page.getByTestId('load-last-good').click();
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(prev.absDay);
});

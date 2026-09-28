import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

/** Place a system through the store (the same path the pointer uses). */
async function place(page: Page, systemId: string, x: number, y: number, mode: 'buy' | 'diy' = 'buy') {
  const ok = await page.evaluate(
    ([id, px, py, m]) => {
      const s = window.__homestead!.store.getState();
      s.startPlacing(id as string, m as 'buy' | 'diy');
      return window.__homestead!.store.getState().placeAt(px as number, py as number).ok;
    },
    [systemId, x, y, mode] as const,
  );
  expect(ok).toBe(true);
}

async function tick(page: Page, days: number) {
  await page.evaluate((n) => {
    const s = window.__homestead!.store.getState();
    for (let k = 0; k < n; k += 30) s.tick(Math.min(30, n - k));
  }, days);
}

async function noAutoPause(page: Page) {
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.setPrefs({
      autoPause: {
        shortage: false,
        hardship: false,
        built: false,
        harvest: false,
        frost: false,
        cash: false,
        season: false,
      },
    });
  });
}

test('export after two years of play, import into a fresh app, and the replay matches', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await page.goto('/?new');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await noAutoPause(page);
  await place(page, 'S056', 60, 60, 'diy'); // yurt
  await place(page, 'S079', 150, 40); // well
  await place(page, 'S099', 40, 160); // rooftop solar
  await tick(page, 40);
  await place(page, 'S092', 80, 160); // battery
  await place(page, 'S078', 150, 150, 'diy'); // raised beds
  await page.evaluate(() => window.__homestead!.store.getState().setInstancePriority('i8', 0)); // the well first
  await tick(page, 200);
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.select(['i11']);
    s.moveSelection(10, 12);
    s.undo();
    s.redo();
  });
  await place(page, 'S075', 30, 100); // chicken coop
  await tick(page, 490);
  const absDay = await page.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay);
  expect(absDay).toBe(730);
  const digest = await page.evaluate(() => window.__homestead!.digest());

  await page.getByTestId('open-saves').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-save').click(),
  ]);
  const path = await download.path();
  const file = JSON.parse(readFileSync(path!, 'utf8'));
  expect(file.schema).toBe('homestead.save.v1');
  expect(file.digest).toBe(digest);
  expect(file.actions.length).toBeGreaterThan(8);
  await shot(page, 'g6', '01-saves-panel');

  // A fresh app in a new browser context (no autosave there).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await ctx.newPage();
  await fresh.goto('/?new');
  await fresh.waitForSelector('[data-testid="map"][data-ready="true"]');
  expect(await fresh.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(0);
  await fresh.getByTestId('open-saves').click();
  await fresh.getByTestId('import-file').setInputFiles(path!);
  await expect(fresh.locator('.toast').filter({ hasText: 'Replay verified' })).toBeVisible();
  expect(await fresh.evaluate(() => window.__homestead!.digest())).toBe(digest);
  expect(await fresh.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(730);
  await ctx.close();
});

test('autosave survives a page reload', async ({ page }) => {
  await page.goto('/?new');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await noAutoPause(page);
  await place(page, 'S056', 60, 60);
  await tick(page, 9);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number | null>((resolve) => {
            const req = indexedDB.open('terra-homestead', 1);
            req.onsuccess = () => {
              const g = req.result.transaction('saves').objectStore('saves').get('autosave');
              g.onsuccess = () => resolve(g.result ? g.result.absDay : null);
              g.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
          }),
      ),
    )
    .toBeGreaterThanOrEqual(7);
  await page.goto('/');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await expect(page.locator('.toast').filter({ hasText: 'Welcome back' })).toBeVisible();
  const restored = await page.evaluate(() => window.__homestead!.store.getState().game);
  expect(restored.calendar.absDay).toBeGreaterThanOrEqual(7);
  expect(restored.instances.some((i) => i.systemId === 'S056')).toBe(true);
});

test('a visible warning when the browser blocks storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('IndexedDB is disabled');
      },
    });
  });
  await openApp(page);
  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-slot-1').click();
  await expect(page.getByTestId('storage-warning')).toContainText(/n't available in this browser/);
  await shot(page, 'g6', '02-storage-warning');
});

test('the year report explains the starter design with a root-cause chain', async ({ page }) => {
  test.setTimeout(180_000);
  const starter = JSON.parse(readFileSync('designs/starter.json', 'utf8'));
  const param = Buffer.from(
    JSON.stringify({ name: starter.name, site: 'front-range', acres: 5, counts: starter.counts }),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  await page.goto(`/?design=${param}`);
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await expect(page.getByTestId('hud')).toContainText('read only');
  await noAutoPause(page);
  // Read only: edits are refused.
  await page.evaluate(() => window.__homestead!.store.getState().startPlacing('S056'));
  await expect(page.locator('.toast').filter({ hasText: 'Make a copy to edit it' })).toBeVisible();
  await shot(page, 'g6', '03-shared-design');
  await tick(page, 280); // Apr 1 → early January: one full year report needs Dec 31
  await expect(page.getByTestId('report')).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose a report' }).selectOption({ label: 'Year 1 report' });
  const chains = page.getByTestId('cause-chain');
  await expect(chains.first()).toContainText('because');
  await shot(page, 'g6', '04-year-report');
});

test('almanac, auto-pause, and settings', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?new');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  // Hardship auto-pause is on by default: run at 10× until the household pauses the game.
  await page.evaluate(() =>
    window.__homestead!.store.getState().setPrefs({
      autoPause: {
        shortage: true,
        hardship: true,
        built: true,
        harvest: false,
        frost: true,
        cash: true,
        season: true,
      },
    }),
  );
  await place(page, 'S056', 60, 60, 'diy');
  await page.keyboard.press('3');
  await expect(page.locator('.toast').filter({ hasText: 'Paused:' }).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('speed-0')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hud-date')).toContainText(/Spring \d+, year 1/);
  await shot(page, 'g6', '05-auto-paused');

  await page.keyboard.press('l');
  await expect(page.getByTestId('almanac')).toBeVisible();
  await expect(page.locator('.alm').first()).toBeVisible();
  await page.getByTestId('almanac-shortages').uncheck();
  await shot(page, 'g6', '06-almanac');
  const link = page.getByTestId('almanac').getByRole('button', { name: 'Show on map' }).first();
  if (await link.count()) {
    await link.click();
    expect(await page.evaluate(() => window.__homestead!.store.getState().selection.length)).toBe(1);
  } else await page.keyboard.press('Escape');

  await page.getByTestId('open-settings').click();
  await page.getByTestId('units').selectOption('metric');
  await page.getByTestId('reduced-motion').check();
  await shot(page, 'g6', '07-settings');
  await page.getByTestId('construction-share').fill('0.3');
  expect(
    await page.evaluate(() => window.__homestead!.store.getState().game.settings.constructionShare),
  ).toBeCloseTo(0.3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  expect(
    await page.evaluate(() => window.__homestead!.store.getState().game.settings.constructionShare),
  ).toBeCloseTo(0.6);
  await page.keyboard.press('n');
  await expect(page.getByTestId('checklist-table')).toContainText(' L');
});

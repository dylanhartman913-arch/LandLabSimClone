import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

const idOf = (page: Page, name: string) =>
  page.evaluate((n) => window.__homestead!.store.getState().catalog.systems.find((s) => s.name === n)!.id, name);

async function place(page: Page, name: string, x: number, y: number) {
  const id = await idOf(page, name);
  const ok = await page.evaluate(
    ([sid, px, py]) => {
      const s = window.__homestead!.store.getState();
      s.startPlacing(sid as string, 'buy');
      const r = window.__homestead!.store.getState().placeAt(px as number, py as number);
      window.__homestead!.store.getState().cancelTool();
      return r.ok;
    },
    [id, x, y] as const,
  );
  expect(ok).toBe(true);
  return id;
}

test('a fan with no power cools nobody: actual 0, potential shown, and the checklist says why', async ({ page }) => {
  await openApp(page);
  await place(page, 'GoSun Fan', 104, 120);
  await page.keyboard.press('n');
  const row = page.getByTestId('row-Cooled shelter');
  await expect(row).toBeVisible();
  expect(Number(await page.getByTestId('provided-Cooled shelter').getAttribute('data-value'))).toBe(0);
  expect(Number(await page.getByTestId('potential-Cooled shelter').getAttribute('data-value'))).toBeGreaterThan(0);
  await page.getByTestId('blocked-toggle-Cooled shelter').click();
  await expect(page.getByTestId('blocked-Cooled shelter')).toContainText('GoSun Fan');
  await expect(page.getByTestId('blocked-Cooled shelter')).toContainText('blocked: no Electricity');
  await expect(page.getByTestId('potential-score')).toBeVisible();
  await shot(page, 'g11', '01-blocked-drilldown');
  // "Find a source" opens the missing input's page (G13): systems that make it, and where to buy it.
  await page.getByTestId('blocked-Cooled shelter').getByTestId('find-Electricity').click();
  await expect(page.getByTestId('checklist')).toHaveCount(0);
  const res = page.getByTestId('resource-page');
  await expect(res).toContainText('Electricity');
  const panel = await idOf(page, '500W Photovoltaic Panels');
  await expect(res.getByTestId(`build-option-${panel}`)).toBeVisible();
});

test('blocked and partial systems wear a status bubble on the map; B hides them', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() =>
    window.__homestead!.store.getState().setPrefs({
      autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false },
    }),
  );
  const well = await place(page, 'Well', 150, 150);
  await place(page, 'Raised Beds (24 sq ft)', 60, 160);
  await page.evaluate(() => window.__homestead!.store.getState().tick(12)); // let the well get built
  const badges = () =>
    page.evaluate(() => [...window.__homestead!.scene!.badgeInfo.entries()].map(([id, b]) => ({ id, ...b })));
  const wellId = await page.evaluate(
    (sid) => window.__homestead!.store.getState().game.instances.find((i) => i.systemId === sid)!.id,
    well,
  );
  await expect.poll(async () => (await badges()).find((b) => b.id === wellId)?.level).toBe('blocked');
  expect((await badges()).find((b) => b.id === wellId)!.limitedBy).toBe('Electricity');
  // Zoom in on the well so the bubbles are easy to see.
  await page.evaluate(() => window.__homestead!.store.getState().setCamera({ cx: 120, cy: 150, zoom: 4 }));
  await page.waitForTimeout(300);
  await shot(page, 'g11', '02-map-badges');
  await page.mouse.move(5, 300);
  await page.keyboard.press('b');
  expect(await page.evaluate(() => window.__homestead!.store.getState().prefs.badges)).toBe(false);
  await page.keyboard.press('b');
  expect(await page.evaluate(() => window.__homestead!.store.getState().prefs.badges)).toBe(true);
});

test('the top bar shows the potential score beside the actual one', async ({ page }) => {
  await openApp(page);
  await place(page, 'GoSun Fan', 104, 120);
  await expect(page.getByTestId('hud-potential')).toContainText(/\d+% if supplied/);
});

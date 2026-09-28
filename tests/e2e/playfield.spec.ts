import { expect, test } from '@playwright/test';
import { cash, choose, clickWorld, dragWorld, instances, ofSystem, openApp, shot } from './helpers.ts';

const YURT = 'S056';
const WELL = 'S079';
const PANEL = 'S002';

test('place a yurt, a well, and three panels; move, undo, redo, delete', async ({ page }) => {
  await openApp(page);
  await shot(page, 'g4', '01-new-game');
  const startCash = await cash(page);

  // Yurt, bought.
  await choose(page, 'yurt', YURT, 'buy');
  await clickWorld(page, 60, 60);
  await expect.poll(async () => (await ofSystem(page, YURT)).length).toBe(1);
  expect(await cash(page)).toBe(startCash - 18000);
  await shot(page, 'g4', '02-yurt');

  // Well.
  await choose(page, 'well', WELL, 'buy');
  await clickWorld(page, 150, 50);
  await expect.poll(async () => (await ofSystem(page, WELL)).length).toBe(1);

  // Three panels with Shift-click, then Esc.
  await choose(page, 'photovoltaic', PANEL, 'buy');
  await clickWorld(page, 150, 150, { shift: true });
  await clickWorld(page, 160, 150, { shift: true });
  await clickWorld(page, 170, 150, { shift: true });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('status')).not.toContainText('Placing');
  expect(await ofSystem(page, PANEL)).toHaveLength(3);
  await shot(page, 'g4', '03-yurt-well-panels');

  // A spot that overlaps is rejected, and nothing is placed.
  await choose(page, 'photovoltaic', PANEL, 'buy');
  await clickWorld(page, 151, 151);
  await expect(page.locator('.toast.warn').first()).toContainText('overlaps');
  await page.keyboard.press('Escape');
  expect(await ofSystem(page, PANEL)).toHaveLength(3);

  // Move one panel by dragging it.
  const [first] = await ofSystem(page, PANEL);
  await dragWorld(page, [first!.x, first!.y], [first!.x, first!.y + 30]);
  await expect
    .poll(async () => (await instances(page)).find((i) => i.id === first!.id)!.y)
    .toBeCloseTo(first!.y + 30, 0);
  await shot(page, 'g4', '04-moved');

  // Undo puts it back; redo moves it again.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await instances(page)).find((i) => i.id === first!.id)!.y).toBe(first!.y);
  await shot(page, 'g4', '05-undo');
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await instances(page)).find((i) => i.id === first!.id)!.y)
    .toBeCloseTo(first!.y + 30, 0);
  await shot(page, 'g4', '06-redo');

  // Delete a panel that was never built: a full refund.
  const before = await cash(page);
  await clickWorld(page, first!.x, first!.y + 30);
  await expect(page.getByTestId('status')).toContainText('Selected');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await ofSystem(page, PANEL)).length).toBe(2);
  expect(await cash(page)).toBe(before + 500);
  await shot(page, 'g4', '07-deleted');

  // Undo the delete brings it back with its money.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await ofSystem(page, PANEL)).length).toBe(3);
  expect(await cash(page)).toBe(before);
});

test('drag a system from the drawer onto the map', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('system-search').fill('chicken coop');
  const target = await page.evaluate(() => window.__homestead!.worldToClient(60, 150));
  await page.getByTestId('tile-S075').dragTo(page.getByTestId('map'), {
    targetPosition: await page.getByTestId('map').evaluate((el, t) => {
      const r = el.getBoundingClientRect();
      return { x: t.x - r.left, y: t.y - r.top };
    }, target),
  });
  await expect.poll(async () => (await ofSystem(page, 'S075')).length).toBe(1);
});

test('box select, copy and paste, and keyboard camera', async ({ page }) => {
  await openApp(page);
  await choose(page, 'photovoltaic', PANEL, 'buy');
  for (const x of [40, 50, 60]) await clickWorld(page, x, 170, { shift: true });
  await page.keyboard.press('Escape');

  await dragWorld(page, [30, 160], [70, 180], { shift: true });
  await expect.poll(() => page.evaluate(() => window.__homestead!.store.getState().selection.length)).toBe(3);
  await shot(page, 'g4', '08-box-select');

  await page.keyboard.press('Control+c');
  const p = await page.evaluate(() => window.__homestead!.worldToClient(150, 185));
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await ofSystem(page, PANEL)).length).toBe(6);

  const cam0 = await page.evaluate(() => window.__homestead!.store.getState().camera);
  await page.keyboard.press('d');
  await page.keyboard.press('=');
  const cam1 = await page.evaluate(() => window.__homestead!.store.getState().camera);
  expect(cam1.cx).toBeGreaterThan(cam0.cx);
  expect(cam1.zoom).toBeGreaterThan(cam0.zoom);
  await page.keyboard.press('0');
  const cam2 = await page.evaluate(() => window.__homestead!.store.getState().camera);
  expect(cam2.zoom).toBeCloseTo(cam0.zoom, 5);
});

test('time runs at the chosen speed and construction shows progress', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await choose(page, 'yurt', YURT, 'diy');
  await clickWorld(page, 60, 60);
  await page.keyboard.press('3'); // 10×
  await expect(page.getByTestId('speed-10')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(700);
  await shot(page, 'g4', '09-under-construction');
  await expect.poll(async () => (await ofSystem(page, YURT))[0]!.status, { timeout: 10_000 }).toBe('active');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('speed-0')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hud-date')).not.toContainText('Apr 1,');
  await page.getByTestId('tab-inputs').click();
  await expect(page.locator('.res-row').first()).toBeVisible();
  await shot(page, 'g4', '10-inputs-tab');
  await page.getByTestId('tab-outputs').click();
  await shot(page, 'g4', '11-outputs-tab');
});

test('the drawer filters by category, remembers being collapsed, and shows My systems', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('category-filter').selectOption('Fowl');
  const names = await page
    .locator('[data-testid="tile-grid"] .tile')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
  expect(names).toContain('Chicken');
  expect(names).not.toContain('Yurt');
  await page.getByTestId('seg-my').click();
  await page.getByTestId('category-filter').selectOption('');
  await expect(page.getByTestId('tile-S008')).toBeVisible(); // the starting bell tent
  await page.getByTestId('drawer-toggle').click();
  await page.reload();
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await expect(page.getByTestId('drawer-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('drawer-toggle').click();
});

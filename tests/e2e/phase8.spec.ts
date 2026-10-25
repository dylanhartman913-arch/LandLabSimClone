import { expect, test } from '@playwright/test';
import { choose, clickWorld, openApp, shot } from './helpers.ts';

test('employment placement warns about competing work and its separate cap controls wages', async ({ page }) => {
  await openApp(page);
  await choose(page, 'remote job', 'S172', 'buy');
  const p = await page.evaluate(() => window.__homestead!.worldToClient(60, 60));
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('placement-preview')).toContainText('Upkeep runs first');
  await clickWorld(page, 60, 60);
  await page.keyboard.press('Escape');
  await page.getByTestId('open-work').click();
  await expect(page.getByTestId('job-employment')).toBeVisible();
  await shot(page, 'phase-8', 'employment-priority');
  await page.getByTestId('cap-employment').fill('1');
  await page.getByTestId('cap-employment').press('Tab');
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  const income = await page.evaluate(() => window.__homestead!.store.getState().game.ledgers.slice(-7).reduce((a, l) => a + l.cash.in, 0));
  expect(income).toBeGreaterThan(0);
  expect(income).toBeLessThanOrEqual(25.000001);
});

test('tables state their measurement windows at the table', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.marketBuy('Carbon', 10);
    window.__homestead!.store.getState().tick(8);
  });
  await page.getByTestId('open-checklist').click();
  await expect(page.getByTestId('checklist-table').locator('caption')).toContainText('Measured days');
  await page.getByTestId('mode-average').click();
  await expect(page.getByTestId('checklist-table').locator('caption')).toContainText('Average-year forecast');
  await page.getByTestId('checklist-close').click();
  await page.getByTestId('open-market').click();
  await expect(page.getByTestId('market-table').locator('caption')).toContainText('last 7 measured days');
  await expect(page.getByTestId('bills-lines').locator('caption')).toContainText('last 7 measured days');
});

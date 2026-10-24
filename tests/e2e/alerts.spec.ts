import { expect, test } from '@playwright/test';
import { choose, openApp, shot } from './helpers.ts';

test('needs and bottlenecks: simultaneous cliffs are all visible, ranked, and fold away while placing', async ({ page }) => {
  await openApp(page);
  // Two days in, then a pantry and safe-water reserve a few days from empty (the Oct 22 pattern).
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.tick(2);
    const s = window.__homestead!.store.getState();
    s.loadGame(s.init, s.actions, { ...s.game, stocks: { ...s.game.stocks, Food: 8000, 'Drinking water': 4 } });
  });
  const now = page.getByTestId('alerts-now');
  await expect(now.getByTestId('alert-food-runway')).toBeVisible();
  await expect(now.getByTestId('alert-water-runway')).toBeVisible();
  await expect(page.getByTestId('hint')).toContainText('Needs and bottlenecks');
  // The soonest deadline is first and open; the other is a row the player can open.
  const items = now.locator('details');
  await expect(items.first()).toHaveAttribute('open', '');
  await expect(now.getByTestId('alert-food-runway').locator('button', { hasText: 'Open Market' })).toBeAttached();
  // Ranked by deadline: the open first row is due no later than the next one.
  const days = await page.evaluate(() => [...document.querySelectorAll('[data-testid="alerts-now"] summary .chip')].map((c) => (c.textContent === 'now' ? 0 : Number(c.textContent!.replace(/\D+/g, '')))));
  expect(days).toEqual([...days].sort((a, b) => a - b));
  await shot(page, 'll-14', 'needs-and-bottlenecks');
  // Picking a system to place folds the list to its most urgent line.
  await choose(page, 'Rain Barrel', 'S169');
  await expect(page.getByTestId('alerts-collapsed')).toBeVisible();
  await expect(page.getByTestId('alerts-now')).toHaveCount(0);
});

test('a season report waits behind Reports while something needs attention now', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.loadGame(st.init, st.actions, { ...st.game, stocks: { ...st.game.stocks, Food: 0 } });
    // Run past the end of spring with the pantry empty.
    for (let k = 0; k < 120 && window.__homestead!.store.getState().reports.length === 0; k++) window.__homestead!.store.getState().tick(1);
    const s = window.__homestead!.store.getState();
    return { reports: s.reports.length, panel: s.panel, unread: s.unreadReports };
  });
  expect(r.reports).toBeGreaterThan(0);
  expect(r.panel).not.toBe('report');
  expect(r.unread).toBeGreaterThan(0);
  await expect(page.getByTestId('reports-new')).toBeVisible();
  await page.getByTestId('open-reports').click();
  await expect(page.getByTestId('reports-new')).toHaveCount(0);
});

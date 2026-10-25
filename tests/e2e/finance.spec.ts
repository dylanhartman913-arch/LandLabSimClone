import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('finance is opt-in: draw and repay credit, buy insurance, and see tax and reserve against cash runway', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Credit, tax and insurance', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.getByTestId('open-market').click();
  const box = page.getByTestId('finance-controls');
  const before = await page.evaluate(() => window.__homestead!.store.getState().game.cash);
  await page.getByLabel('Credit amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Borrow', exact: true }).click();
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.cash)).toBe(before + 1000);
  await expect(box).toContainText('Credit owed: $1,000');
  await page.getByLabel('Credit amount', { exact: true }).fill('10000');
  await page.getByRole('button', { name: 'Borrow', exact: true }).click();
  await expect(box.getByRole('alert')).toContainText('limit');
  await page.getByLabel('Credit amount', { exact: true }).fill('400');
  await page.getByRole('button', { name: 'Repay', exact: true }).click();
  await expect(box).toContainText('Credit owed: $600');
  await page.getByLabel('Equipment failure insurance', { exact: true }).check();
  await page.getByLabel('Emergency reserve days', { exact: true }).fill('60');
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  await expect(box).toContainText('Covered on the last measured day');
  await expect(page.getByTestId('bills-lines')).toContainText('Property tax');
  await expect(page.getByTestId('bills-lines')).toContainText('Credit interest');
  await expect(page.getByTestId('bills-lines')).toContainText('Failure insurance');
  const state = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return { finance: s.game.finance, logged: s.actions.filter((a) => a.kind === 'finance').length };
  });
  expect(state.finance).toMatchObject({ debt: 600, emergencyDays: 60, insured: true });
  expect(state.logged).toBeGreaterThanOrEqual(4);
  await shot(page, 'll-37', 'finance');
});

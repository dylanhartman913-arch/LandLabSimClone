import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('Phase 9 mechanics opt in, queue a sale and expose repair costs', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Wear, repair and replacement', { exact: true }).check();
  await page.getByLabel('Selling and trade', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.getByTestId('open-market').click();
  await expect(page.getByTestId('trade-controls')).toBeVisible();
  await expect(page.getByTestId('market')).toContainText('Expected replacement allowance');
  await page.getByLabel('Give', { exact: true }).selectOption('Food');
  await page.getByLabel('Amount', { exact: true }).fill('100');
  await page.getByLabel('Keep at least', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Queue trade', exact: true }).click();
  await expect(page.getByTestId('trade-controls')).toContainText('100 Food for cash; keep 1,000');
  await expect(page.getByLabel('Receive', { exact: true }).locator('option')).toHaveCount(1);
  await page.getByLabel('Close market').click();
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    const i = s.game.instances.find(
      (i) => s.catalog.systems.find((x) => x.id === i.systemId)?.name === 'Bell Tent',
    )!;
    s.openCard(i.systemId, i.id);
  });
  await expect(page.getByTestId('maintenance')).toContainText('Condition:');
  await page.getByTestId('maintenance').getByRole('button', { name: 'Repair', exact: true }).click();
  const result = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return {
      action: s.actions.at(-1)?.kind,
      servicing: s.game.instances.some((i) => i.servicing && i.status === 'building'),
    };
  });
  expect(result).toEqual({ action: 'service', servicing: true });
  await shot(page, 'phase-9', 'repair');
});

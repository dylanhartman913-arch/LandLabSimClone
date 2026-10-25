import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('transportation access replaces the idle travel need and explains a real paid errand in the checklist and Market', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Transportation as access', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  await page.keyboard.press('n');
  const row = page.getByTestId('row-Transportation');
  await expect(row).toContainText('Transportation access');
  await expect(row).toContainText('No trips attempted');
  await expect(page.getByTestId('needed-Transportation')).toContainText('0');
  await expect(page.getByTestId('access-explanation')).toContainText('outside the household coverage score');
  await page.getByTestId('checklist-close').click();
  await page.getByTestId('open-market').click();
  await page.getByTestId('buy-amount-Woody-biomass').fill('10');
  await page.getByTestId('buy-Woody-biomass').click();
  await page.getByTestId('buy-amount-Propane').fill('1');
  await page.getByTestId('buy-Propane').click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  const measured = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return {
      access: s.game.ledgers.at(-1)!.access,
      fees: s.game.ledgers.at(-1)!.spend.delivery,
      logged: s.actions.some((a) => a.kind === 'settings' && a.settings.transportAccess === true),
    };
  });
  expect(measured.access!.trips).toHaveLength(1);
  expect(measured.access!.trips[0]).toMatchObject({
    purpose: 'market',
    miles: 10,
    fare: 25,
    completed: true,
  });
  expect(measured.fees).toBe(25);
  expect(measured.logged).toBe(true);
  await expect(page.getByTestId('transport-access')).toContainText('1 completed');
  await page.getByLabel('Close market', { exact: true }).click();
  await page.keyboard.press('n');
  await expect(row).toContainText('✓ Covered');
  await expect(page.getByTestId('provided-Transportation')).toContainText('10');
  await expect(page.getByTestId('needed-Transportation')).toContainText('10');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-39', 'transport-access');
});

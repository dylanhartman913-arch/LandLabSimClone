import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';

test('LL-53/54: a farm family has role-correct food use and no false imminent-hunger warning', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId('start-farm').click();
  await page.getByTestId('start-children').fill('2');
  await page.getByTestId('start-begin').click();
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Shelter occupancy', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(30));
  await expect(page.getByTestId('alert-food-runway')).toHaveCount(0);
  const meals = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const n = st.game.ledgers.at(-1)!.needs;
    return { needed: n.Food.needed, delivered: n.Food.delivered, shelterNeed: n.Shelter.needed, shelterDelivered: n.Shelter.delivered };
  });
  expect(meals.needed).toBeCloseTo(6800);
  expect(meals.delivered).toBeCloseTo(6800);
  expect(meals.shelterNeed).toBeCloseTo(680);
  expect(meals.shelterDelivered).toBeCloseTo(680);
});

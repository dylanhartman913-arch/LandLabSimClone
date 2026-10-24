import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('the coop preview prices its feed, and the card remembers build-it-yourself', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('system-search').fill('chicken coop');
  await page.getByTestId('tile-S075').click();
  await expect(page.getByTestId('system-card')).toBeVisible();
  await page.getByTestId('choose-diy').click();
  await expect(page.getByTestId('project-running')).toContainText('of supplies at market prices');
  await expect(page.getByTestId('project-supplies')).toContainText('Chicken feed');
  await expect(page.getByTestId('project-supplies')).toContainText('if bought');
  await shot(page, 'll-19', 'coop-supplies');
  await page.getByTestId('card-close').click();
  // The next card opens on the mode chosen last.
  await page.getByTestId('system-search').fill('bokashi');
  await page.getByTestId('tile-S147').click();
  await expect(page.getByTestId('add-diy')).toBeVisible();
});

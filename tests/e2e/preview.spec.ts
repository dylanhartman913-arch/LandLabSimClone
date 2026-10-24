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

test('a resource page sets the standing order its low-reserve alert asks for', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().openResource('Chicken feed'));
  const form = page.getByTestId('res-standing');
  await expect(form).toContainText('No standing order');
  await form.getByRole('spinbutton').fill('20');
  await page.getByTestId('res-standing-set').click();
  await expect(form).toContainText('Standing order: keep above 20');
  const standing = await page.evaluate(() => window.__homestead!.store.getState().game.market?.standing);
  expect(standing).toEqual([{ resource: 'Chicken feed', keepAbove: 20, orderUpTo: 30 }]);
  // Capital on a store reads as weekly cash, which the household has.
  await expect(page.getByTestId('res-could-build')).toContainText('weekly cash');
  await expect(page.getByTestId('res-could-build')).not.toContainText('(you have none)Capital');
});

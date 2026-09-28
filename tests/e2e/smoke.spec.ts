import { expect, test } from '@playwright/test';

test('the app loads and shows the engine version', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TERRA Homestead Plugin' })).toBeVisible();
  await expect(page.getByTestId('engine-version')).toContainText(/Engine \d+\.\d+\.\d+/);
  await page.screenshot({ path: 'docs/screenshots/g0/smoke.png' });
});

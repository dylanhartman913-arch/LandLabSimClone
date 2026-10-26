import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';

for (const id of ['farm', 'cabin', 'greenfield']) test(`LL-55 ${id}: available barter fulfills and survives a save`, async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId(`start-${id}`).click();
  await page.getByTestId('start-begin').click();
  if (id === 'greenfield') await page.evaluate(() => window.__homestead!.store.getState().skipTutorial());
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Selling and trade', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.getByTestId('open-market').click();
  await page.getByLabel('Give', { exact: true }).selectOption('Labor');
  await page.getByLabel('Receive', { exact: true }).selectOption('Carbon');
  await page.getByLabel('Amount', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Queue trade', exact: true }).click();
  await expect(page.getByTestId('trade-controls')).toContainText('1 Labor for Carbon');
  const fulfilled = await page.evaluate(() => {
    const st = window.__homestead!.store;
    st.getState().tick(7);
    return st.getState().game.ledgers.flatMap((l) => l.trades ?? []).some((t) => t.resource === 'Labor' && t.receivedAmount! > 0);
  });
  expect(fulfilled).toBe(true);
  await page.getByLabel('Close market').click();
  await page.getByTestId('open-saves').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()]);
  await page.getByTestId('import-file').setInputFiles((await download.path())!);
  await expect(page.locator('.toast').filter({ hasText: 'Replay verified' })).toBeVisible();
  await page.getByTestId('open-market').click();
  await expect(page.getByLabel('Give', { exact: true }).locator('option[value="Labor"]')).toHaveCount(1);
});

test('LL-56/57 live cards separate catalog estimates and reports list shelter', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.setWizard(true);
  });
  await page.getByTestId('start-greenfield').click();
  await page.getByTestId('start-begin').click();
  await page.evaluate(() => {
    const st = window.__homestead!.store;
    for (let n = 0; n < 100 && !st.getState().reports.length; n++) st.getState().tick(1);
    const s = st.getState();
    const solar = s.game.instances.find((i) => s.catalog.systems.find((sys) => sys.id === i.systemId)?.name.includes('Photovoltaic'))!;
    s.openCard(solar.systemId, solar.id);
  });
  await expect(page.getByTestId('card-basis')).toContainText('actual input use and output');
  await expect(page.getByTestId('card-outputs')).toContainText('equivalent of yesterday');
  await expect(page.getByTestId('card-outputs')).toContainText('Catalog estimate');
  await page.getByLabel('Close card').click();
  await page.getByTestId('open-reports').click();
  await expect(page.getByTestId('report-causes')).toContainText('Shelter');
  await expect(page.getByTestId('report-causes')).toContainText('available shelter capacity');
});

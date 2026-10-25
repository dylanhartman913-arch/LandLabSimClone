import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a raised bed without compost keeps cropping while its soil fertility falls, shown on its card', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Soil fertility', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const ids = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const bed = st.catalog.systems.find((s) => s.name === 'Raised Beds (24 sq ft)')!;
    st.startPlacing(bed.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(40, 40);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place raised bed');
    return { bed: placed.instanceId, system: bed.id };
  });
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.system, ids.bed), ids);
  const box = page.getByTestId('soil-fertility');
  await expect(box).toContainText('Fertility 1');
  await expect(box).toContainText('100%');
  // Water and seed as a player would provide them; no compost on hand.
  await page.evaluate(() => window.__homestead!.store.getState().setGameSettings({ autoGather: { waterDays: 3 } }));
  expect(await page.evaluate(() => window.__homestead!.store.getState().marketBuy('Seeds', 2))).toBe(true);
  // Into the growing season, with no compost on hand.
  await page.evaluate(() => {
    const st = window.__homestead!.store;
    for (let k = 0; k < 120 && st.getState().game.calendar.day < 200; k++) st.getState().tick(1);
  });
  const f = await page.evaluate((ids) => window.__homestead!.store.getState().game.instances.find((i) => i.id === ids.bed)!.fertility!, ids);
  expect(f).toBeLessThan(1);
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.system, ids.bed), ids);
  await expect(box).toContainText('drawn by cropping');
  await shot(page, 'll-35', 'raised-bed-fertility');
});

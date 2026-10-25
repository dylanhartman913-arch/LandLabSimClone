import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('an outdoor barrel freezes in winter and can be insulated; drinking water has its own containers', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Separate storage and winter water', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const ids = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const barrel = st.catalog.systems.find((s) => s.name === 'Rain Barrel (55 gal)')!;
    st.startPlacing(barrel.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place rain barrel');
    st.openCard(barrel.id, placed.instanceId);
    return { barrel: placed.instanceId, system: barrel.id };
  });
  const box = page.getByTestId('winter-water');
  await expect(box).toContainText('Liquid');
  await expect(box).toContainText('Protection: none');
  // Run the clock to mid-January (the default game starts in spring).
  await page.evaluate(() => {
    const st = window.__homestead!.store;
    for (let k = 0; k < 400 && st.getState().game.calendar.day !== 15; k++) st.getState().tick(1);
  });
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.system, ids.barrel), ids);
  await expect(box).toContainText('Frozen');
  await expect(box).toContainText('locked in ice');
  await shot(page, 'll-33', 'frozen-barrel');
  const cash = await page.evaluate(() => window.__homestead!.store.getState().game.cash);
  await page.getByRole('button', { name: 'Insulate', exact: true }).click();
  await expect(box).toContainText('Protection: Insulated');
  const after = await page.evaluate(() => window.__homestead!.store.getState().game.cash);
  expect(cash - after).toBeCloseTo(40 + 0.25 * 55);
  const actions = await page.evaluate(() => window.__homestead!.store.getState().actions);
  expect(actions.some((a) => a.kind === 'winterize' && a.id === ids.barrel && a.protection === 'insulated')).toBe(true);
  await page.evaluate(() => window.__homestead!.store.getState().openResource('Drinking water'));
  await expect(page.getByText('Room in Drinking water storage')).toBeVisible();
  await expect(page.getByText('Kept in Drinking water storage; anything beyond the room there spills.')).toBeVisible();
});

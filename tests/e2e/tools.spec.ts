import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('with a wood stove to feed, a fueled chainsaw speeds up firewood gathering at the deadfall and its card reports the haul', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Tools multiply gathering', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const ids = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const stove = st.catalog.systems.find((s) => s.name === 'Tiny Wood Stove')!;
    st.startPlacing(stove.id, 'prebuilt');
    if (!window.__homestead!.store.getState().placeAt(60, 30).ok) throw new Error('Cannot place stove');
    const saw = st.catalog.systems.find((s) => s.name === 'Chainsaw')!;
    st.startPlacing(saw.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place chainsaw');
    return { saw: placed.instanceId, system: saw.id };
  });
  expect(await page.evaluate(() => window.__homestead!.store.getState().marketBuy('Gasoline', 2))).toBe(true);
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.system, ids.saw), ids);
  const box = page.getByTestId('tool-gathering');
  await expect(box).toContainText('Multiplies Woody biomass');
  await expect(box).toContainText('1.7');
  await expect(box).toContainText('Gasoline per working hour');
  const used = await page.evaluate((ids) => {
    const g = window.__homestead!.store.getState().game;
    const hauls = g.ledgers.slice(-7).flatMap((l) => (l.gathered ?? []).filter((x) => x.toolIds?.includes(ids.saw)));
    return { hours: hauls.reduce((a, x) => a + (x.toolHours ?? 0), 0), fuel: hauls.reduce((a, x) => a + (x.fuel ?? 0), 0) };
  }, ids);
  expect(used.hours).toBeGreaterThan(0);
  expect(used.fuel).toBeGreaterThan(0);
  await shot(page, 'll-34', 'chainsaw-card');
});

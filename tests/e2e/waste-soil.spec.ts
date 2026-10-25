import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a cover crop seeding kit shows the beds it sows and sawdust feeds a composting toilet', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Soil fertility', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const result = await page.evaluate(() => {
    const store = window.__homestead!.store;
    const systems = store.getState().catalog.systems;
    const place = (name: string, x: number, y: number) => {
      const sys = systems.find((s) => s.name === name)!;
      store.getState().startPlacing(sys.id, 'prebuilt');
      const r = store.getState().placeAt(x, y);
      if (!r.ok || !r.instanceId) throw new Error(`Cannot place ${name}: ${r.reason}`);
      return { systemId: sys.id, id: r.instanceId };
    };
    place('Raised Beds (24 sq ft)', 40, 40);
    const kit = place('Cover Crop Seeding', 50, 40);
    place('Composting Outhouse', 80, 40);
    place('Sawmill Sawdust Pickup', 90, 40);
    const game = store.getState().game;
    store.setState({ game: { ...game, settings: { ...game.settings, wellbeingMult: 0 }, stocks: { ...game.stocks, Carbon: 0 } } });
    store.getState().tick(3);
    store.getState().openCard(kit.systemId, kit.id);
    return store.getState().game.ledgers.at(-1)!.resources.Carbon!.produced;
  });
  expect(result).toBeCloseTo(100 / 7, 6);
  const card = page.getByTestId('seeding-controls');
  await expect(card).toContainText('Sows 200 sq ft of gardens within 30 ft');
  await expect(card).toContainText('Gardens in range: 1. Area covered: 100%. Seed sown this year: 0%');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-44', 'cover-crop-seeding');
});

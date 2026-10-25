import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('an incubator sets eggs from the flock and counts down to a hatch', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Livestock lifecycle', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const id = await page.evaluate(() => {
    const store = window.__homestead!.store;
    const systems = store.getState().catalog.systems;
    const place = (name: string, x: number, y: number) => {
      store.getState().startPlacing(systems.find((s) => s.name === name)!.id, 'prebuilt');
      const r = store.getState().placeAt(x, y);
      if (!r.ok || !r.instanceId) throw new Error(`Cannot place ${name}`);
      return r.instanceId;
    };
    place('Chicken', 40, 40);
    place('Rooftop Solar Array (6 kW)', 90, 40);
    const incubator = place('Egg Incubator (24 eggs)', 60, 40);
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        settings: { ...game.settings, wellbeingMult: 0, unlimitedSupply: true },
        stocks: { ...game.stocks, Eggs: 30 },
      },
    });
    store.getState().openCard(systems.find((s) => s.name === 'Egg Incubator (24 eggs)')!.id, incubator);
    return incubator;
  });
  const card = page.getByTestId('husbandry-controls');
  await expect(card).toContainText('Sets 24 eggs from stock');
  await card.getByRole('button', { name: 'Set eggs' }).click();
  const after = await page.evaluate((instanceId) => {
    const store = window.__homestead!.store;
    store.getState().tick(1);
    const l = store.getState().game.ledgers.at(-1)!;
    return { set: l.hatching?.find((h) => h.instanceId === instanceId), eggs: l.resources.Eggs!.processed };
  }, id);
  expect(after.set).toMatchObject({ eggsSet: 24, counted: true });
  expect(after.eggs).toBe(24);
  await expect(card).toContainText('20 days to hatch');
  await expect(card.getByRole('button', { name: 'Cancel clutch (eggs are lost)' })).toBeVisible();
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-43', 'incubator');
});

test('a paddock kit on a pasture shows its measured yield factor', async ({ page }) => {
  await openApp(page);
  const ok = await page.evaluate(() => {
    const store = window.__homestead!.store;
    const systems = store.getState().catalog.systems;
    const game = store.getState().game;
    store.setState({ game: { ...game, settings: { ...game.settings, parcelAcres: 2, wellbeingMult: 0 } } });
    const field = systems.find((s) => s.name === 'Pasture (1 acre)')!;
    store.getState().startPlacing(field.id, 'prebuilt');
    const pasture = store.getState().placeAt(110, 110);
    if (!pasture.ok) throw new Error(pasture.reason ?? 'Cannot place pasture');
    const kit = systems.find((s) => s.name === 'Rotational Paddock Kit')!;
    store.getState().startPlacing(kit.id, 'prebuilt');
    const placed = store.getState().placeAt(110, 110);
    if (!placed.ok || !placed.instanceId) throw new Error(placed.reason ?? 'Cannot place kit');
    store.getState().tick(2);
    store.getState().openCard(kit.id, placed.instanceId);
    return true;
  });
  expect(ok).toBe(true);
  await expect(page.getByTestId('husbandry-controls')).toContainText('Pasture yield: × 1.15');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-43', 'paddock');
});

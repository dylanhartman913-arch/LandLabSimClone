import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a meadow produces hay and a scythe saves cutting hours without raising the land yield', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Tools multiply gathering', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const ids = await page.evaluate(() => {
    const store = window.__homestead!.store;
    const st = store.getState();
    const meadow = st.catalog.systems.find((s) => s.name === 'Hay Meadow (1/10 acre)')!;
    st.startPlacing(meadow.id, 'prebuilt');
    const placed = store.getState().placeAt(65, 65);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place meadow');
    const game = store.getState().game;
    store.setState({ game: { ...game, settings: { ...game.settings, wellbeingMult: 0 } } });
    // The default start is in spring, before the local growing season. Advance to June.
    while (store.getState().game.calendar.day < 172) store.getState().tick(1);
    store.getState().tick(1);
    const hand = store.getState().game.ledgers.at(-1)!.resources.Hay!.produced;
    const scythe = st.catalog.systems.find((s) => s.name === 'Scythe')!;
    store.getState().startPlacing(scythe.id, 'prebuilt');
    const tool = store.getState().placeAt(130, 30);
    if (!tool.ok) throw new Error('Cannot place scythe');
    store.getState().tick(1);
    store.getState().openCard(meadow.id, placed.instanceId);
    const l = store.getState().game.ledgers.at(-1)!;
    return { hand, hay: l.resources.Hay!.produced, record: l.fodder![0] };
  });
  expect(ids.hand).toBeGreaterThan(0);
  expect(ids.hay).toBeCloseTo(ids.hand, 8);
  expect(ids.record!.savedHours).toBeGreaterThan(0);
  await expect(page.getByTestId('fodder-controls')).toContainText('h saved with scythes');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-42', 'scythe-meadow');
});

test('feed mixing needs every ingredient and the hay barn exposes the shared feed pool', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Separate storage and winter water', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const result = await page.evaluate(() => {
    const store = window.__homestead!.store;
    const systems = store.getState().catalog.systems;
    const mix = systems.find((s) => s.name === 'Poultry Feed Mix')!;
    store.getState().startPlacing(mix.id, 'prebuilt');
    const placed = store.getState().placeAt(30, 30);
    if (!placed.ok) throw new Error('Cannot place feed mix');
    store.getState().tick(1);
    const missing = store.getState().game.ledgers.at(-1)!.resources['Chicken feed']!.produced;
    const game = store.getState().game;
    store.setState({
      game: { ...game, stocks: { ...game.stocks, Grain: 14, 'Green biomass': 4, Grubs: 2 } },
    });
    store.getState().tick(1);
    const made = store.getState().game.ledgers.at(-1)!.resources['Chicken feed']!.produced;
    const barn = systems.find((s) => s.name === 'Hay Barn')!;
    store.getState().startPlacing(barn.id, 'prebuilt');
    const built = store.getState().placeAt(60, 30);
    if (!built.ok || !built.instanceId) throw new Error('Cannot place hay barn');
    store.getState().openCard(barn.id, built.instanceId);
    return { missing, made };
  });
  expect(result.missing).toBe(0);
  expect(result.made).toBeCloseTo(9 / 7, 8);
  await expect(page.getByTestId('fodder-controls')).toContainText('Shared feed pool: 210');
  await page.evaluate(() => window.__homestead!.store.getState().openResource('Hay'));
  await expect(page.getByText('Room in Feed storage')).toBeVisible();
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-42', 'feed-storage');
});

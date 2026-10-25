import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('preservation is opt-in, consumes a harvest, and keeps an editable standing rule', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Food preservation chain', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const id = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const system = st.catalog.systems.find((s) => s.name === 'Solar Dehydrator')!;
    st.startPlacing(system.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place the test dehydrator');
    st.startPlacing(st.catalog.systems.find((s) => s.name === 'Root Cellar')!.id, 'prebuilt');
    const cellar = window.__homestead!.store.getState().placeAt(60, 30);
    if (!cellar.ok) throw new Error('Cannot place the test root cellar');
    const game = window.__homestead!.store.getState().game;
    window.__homestead!.store.setState({
      game: { ...game, stocks: { ...game.stocks, 'Vegetables fruit fiber herbs': 500 } },
    });
    window.__homestead!.store.getState().openCard(system.id, placed.instanceId);
    return placed.instanceId;
  });
  await expect(page.getByTestId('preservation-controls')).toBeVisible();
  await page.getByLabel('Fresh food to preserve').selectOption('Vegetables fruit fiber herbs');
  await page.getByLabel('Fresh food reserve').fill('100');
  await page.getByRole('button', { name: 'Start preservation', exact: true }).click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  await expect(page.getByTestId('preservation-result')).toContainText(
    '5400 preserved kcal from 6000 fresh kcal',
  );
  const result = await page.evaluate((id) => {
    const s = window.__homestead!.store.getState();
    return {
      fresh: s.game.stocks['Vegetables fruit fiber herbs'],
      preserved: s.game.stocks['Preserved food'],
      action: s.actions.some((a) => a.kind === 'preserve' && a.id === id),
    };
  }, id);
  expect(result.fresh).toBeGreaterThanOrEqual(100);
  expect(result.preserved).toBeGreaterThan(5300);
  expect(result.action).toBe(true);
  await shot(page, 'phase-9b', 'preserved-harvest');
  await page.getByRole('button', { name: 'Stop preservation', exact: true }).click();
  await expect(page.getByTestId('preservation-controls')).toContainText('No processing rule set.');
  await page.evaluate(() => window.__homestead!.store.getState().findSource('Preserved food'));
  await expect(page.getByTestId('res-in-design')).toContainText('Solar Dehydrator');
  await expect(page.getByTestId('resource-page')).toContainText('Pressure Canner');
});

test('livestock controls queue real work, warn before predators, and show events in the almanac', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Livestock lifecycle', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const id = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const system = st.catalog.systems.find((s) => s.name === 'Chicken')!;
    st.startPlacing(system.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place the test hen');
    const current = window.__homestead!.store.getState();
    const game = current.game;
    window.__homestead!.store.setState({
      game: {
        ...game,
        instances: game.instances.map((i) =>
          i.id === placed.instanceId
            ? {
                ...i,
                animal: { ageDays: 140, growthDays: 140, predatorWarning: { daysLeft: 3 } },
              }
            : i,
        ),
      },
    });
    window.__homestead!.store.getState().openCard(system.id, placed.instanceId);
    return placed.instanceId;
  });
  await expect(page.getByTestId('predator-warning')).toContainText('3 days');
  await page.getByRole('button', { name: /Breed \/ hatch/ }).click();
  await expect(page.getByTestId('livestock-controls')).toContainText('Breeding queued');
  await page.getByRole('button', { name: 'Cancel animal work', exact: true }).click();
  await expect(page.getByRole('button', { name: /Queue culling/ })).toBeVisible();
  await shot(page, 'phase-9b', 'predator-warning');
  await page.getByRole('button', { name: /Queue culling/ }).click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  const removed = await page.evaluate(
    (id) => !window.__homestead!.store.getState().game.instances.some((i) => i.id === id),
    id,
  );
  expect(removed).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  await expect(page.getByTestId('almanac')).toContainText('Culling yielded 4 lbs meat');
});

test('an open chick card follows maturation into a twelve-hen cohort', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.setGameSettings({ livestockLifecycle: true, unlimitedSupply: true });
    const chicks = st.catalog.systems.find((s) => s.name === 'Baby Chicks')!;
    st.startPlacing(chicks.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place the test chicks');
    const game = window.__homestead!.store.getState().game;
    window.__homestead!.store.setState({
      game: {
        ...game,
        instances: game.instances.map((i) =>
          i.id === placed.instanceId
            ? {
                ...i,
                animal: { ageDays: 54, growthDays: 54 },
              }
            : i,
        ),
      },
    });
    window.__homestead!.store.getState().openCard(chicks.id, placed.instanceId);
  });
  await expect(page.getByRole('heading', { name: 'Baby Chicks', exact: true })).toBeVisible();
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  await expect(page.getByRole('heading', { name: 'Chicken', exact: true })).toBeVisible();
  await expect(page.getByTestId('livestock-controls')).toContainText(/12(?:\.0)? animals/);
  await shot(page, 'phase-9b', 'mature-hens');
});

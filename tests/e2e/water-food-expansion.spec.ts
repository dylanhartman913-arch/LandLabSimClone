import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('water test kit shows a measured warning on its card and in the checklist', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Warned risk events', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const kit = st.catalog.systems.find((s) => s.name === 'Water Test Kit')!;
    st.startPlacing(kit.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place kit');
    window.__homestead!.store.getState().tick(1);
    window.__homestead!.store.getState().openCard(kit.id, placed.instanceId);
  });
  await expect(page.getByTestId('water-infrastructure')).toContainText('Contamination warning');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await expect(page.getByTestId('water-test-warning')).toContainText('Filter or boil');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-40', 'water-test-warning');
});

test('electric dehydrator exposes its electricity recipe and preserves a real batch', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Food preservation chain', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => {
    const store = window.__homestead!.store;
    const sys = store.getState().catalog.systems.find((s) => s.name === 'Electric Dehydrator')!;
    store.getState().startPlacing(sys.id, 'prebuilt');
    const placed = store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place dehydrator');
    const game = store.getState().game;
    store.setState({ game: { ...game, stocks: { ...game.stocks, Meat: 100, Electricity: 100 } } });
    store.getState().openCard(sys.id, placed.instanceId);
  });
  await expect(page.getByTestId('preservation-controls')).toContainText('Electricity');
  await page.getByLabel('Fresh food to preserve').selectOption('Meat');
  await page.getByRole('button', { name: 'Start preservation', exact: true }).click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  await expect(page.getByTestId('preservation-result')).toContainText(
    '5400 preserved kcal from 6000 fresh kcal',
  );
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-41', 'electric-dehydrator');
});

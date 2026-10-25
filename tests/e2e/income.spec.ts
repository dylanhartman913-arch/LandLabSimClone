import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a CSA reports packed boxes and Ruth takes spare work for goods after the tutorial', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Selling and trade', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => {
    const store = window.__homestead!.store;
    const systems = store.getState().catalog.systems;
    const place = (name: string, x: number, y: number) => {
      const sys = systems.find((s) => s.name === name)!;
      store.getState().startPlacing(sys.id, 'prebuilt');
      const r = store.getState().placeAt(x, y);
      if (!r.ok || !r.instanceId) throw new Error(`Cannot place ${name}: ${r.reason}`);
      return { systemId: sys.id, id: r.instanceId };
    };
    place('Root Cellar', 40, 40);
    const csa = place('CSA Share Program (4 half shares)', 60, 40);
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        settings: { ...game.settings, wellbeingMult: 0 },
        stocks: { ...game.stocks, 'Vegetables fruit fiber herbs': 0 },
      },
    });
    // The default start is early April, before the local season: advance into June.
    while (store.getState().game.calendar.day < 165) store.getState().tick(1);
    store.getState().openCard(csa.systemId, csa.id);
  });
  const card = page.getByTestId('csa-controls');
  await expect(card).toContainText('Members prepay for a weekly box through the growing season');
  await expect(card).toContainText('0% of boxes packed');
  await expect(card).toContainText('make-good');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-46', 'csa-make-good');
  await page.getByLabel('Close card').click();
  await page.evaluate(() => {
    const store = window.__homestead!.store;
    const game = store.getState().game;
    // A finished greenfield tutorial unlocks Ruth's barter (the default test game has none).
    const tutorial = { line: 'greenfield', current: 999, since: 0, done: {}, ui: [], skipped: false };
    store.setState({ game: { ...game, tutorial } });
  });
  await page.getByTestId('open-market').click();
  const trade = page.getByTestId('trade-controls');
  await expect(trade).toContainText('each hour buys $12 of goods');
  await page.getByLabel('Give', { exact: true }).selectOption('Labor');
  await page.getByLabel('Amount', { exact: true }).fill('2');
  await page.getByLabel('Receive', { exact: true }).selectOption('Chicken feed');
  await page.getByRole('button', { name: 'Queue trade', exact: true }).click();
  await expect(trade).toContainText('2 Labor for Chicken feed');
});

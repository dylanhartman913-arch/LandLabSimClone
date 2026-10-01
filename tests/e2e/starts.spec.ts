import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

async function openStartScreen(page: Page) {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await expect(page.getByTestId('new-game')).toBeVisible();
}

test('start from the ground up: the camp, the stockpile bar, and wellbeing with its why', async ({ page }) => {
  test.setTimeout(90_000);
  await openStartScreen(page);
  await expect(page.getByTestId('start-adapt')).toContainText('Adapt your home');
  await expect(page.getByTestId('start-greenfield')).toContainText('Start from the ground up');
  await page.getByTestId('start-greenfield').click();
  await page.getByTestId('site-front-range').click();
  await page.getByTestId('difficulty-standard').click();
  await shot(page, 'g15', '01-start-screen');
  await page.getByTestId('start-begin').click();
  await expect(page.getByTestId('new-game')).toHaveCount(0);

  const g = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return { start: s.game.start, people: s.game.instances.filter((i) => i.person).length, cash: s.game.cash };
  });
  expect(g.start?.id).toBe('greenfield');
  expect(g.people).toBe(2);
  expect(g.cash).toBe(8000);
  await expect(page.getByTestId('stockpile')).toBeVisible();
  for (const k of ['food', 'drinking-water', 'firewood', 'battery']) await expect(page.getByTestId(`stock-${k}`)).toBeVisible();
  await expect(page.getByTestId('people').locator('.person')).toHaveCount(2);
  await page.evaluate(() => window.__homestead!.store.getState().zoomToFit());
  await shot(page, 'g15', '02-greenfield-day-1');

  // Three weeks idle: the stockpile falls, arrows point down, and the why explains wellbeing.
  await page.evaluate(() => window.__homestead!.store.getState().tick(21));
  await expect(page.getByTestId('stock-food')).toContainText('▼');
  const person = page.getByTestId('people').locator('.person').first();
  await expect(person.locator('.person-why')).not.toBeEmpty();
  await person.locator('button.why').click();
  const why = page.getByTestId('why-popover');
  await expect(why).toContainText('wellbeing');
  await shot(page, 'g15', '03-wellbeing-why');
  await page.keyboard.press('Escape');
  await page.getByTestId('stock-days-food').click();
  await expect(page.getByTestId('why-popover')).toContainText('daily use');
  await shot(page, 'g15', '04-stockpile-why');
});

test('adapt your home: every row covered on day 1, self-reliance and weekly bills lead the HUD', async ({ page }) => {
  await openStartScreen(page);
  await page.getByTestId('start-adapt').click();
  await page.getByTestId('site-asheville-nc').click();
  await page.getByTestId('start-begin').click();
  await expect(page.getByTestId('hud-self-reliance')).toBeVisible();
  await expect(page.getByTestId('hud-bills')).toBeVisible();
  await page.evaluate(() => window.__homestead!.store.getState().tick(14));
  const rows = await page.evaluate(() => {
    const l = window.__homestead!.store.getState().game.ledgers.at(-1)!;
    return Object.entries(l.needs)
      .filter(([, n]) => n.needed > 0)
      .map(([k, n]) => [k, n.delivered / n.needed] as const);
  });
  for (const [row, pct] of rows) expect(pct, row).toBeGreaterThan(0.999);
  await expect(page.getByTestId('hud-bills')).toContainText('$');
  await page.evaluate(() => window.__homestead!.store.getState().zoomToFit());
  await shot(page, 'g15', '05-adapt-two-weeks');
});

test('pellet stove → wood pellets → the market and the pellet mill → its wood-chip input → a planned branch', async ({ page }) => {
  await openApp(page);
  const stove = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.startPlacing(s.catalog.systems.find((x) => x.name === 'Pellet Stove')!.id, 'buy');
    const r = window.__homestead!.store.getState().placeAt(120, 60);
    window.__homestead!.store.getState().cancelTool();
    return r.instanceId!;
  });
  await page.evaluate(() => window.__homestead!.store.getState().tick(20));
  await page.evaluate((id) => window.__homestead!.store.getState().focusInstance(id), stove);
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.openCard(s.catalog.systems.find((x) => x.name === 'Pellet Stove')!.id);
  });
  const card = page.getByTestId('system-card');
  await expect(card).toContainText('Pellet Stove');
  await shot(page, 'g15', '06-pellet-stove-card');
  await card.getByTestId('card-inputs').getByTestId('res-link-Wood pellets').click();
  const res = page.getByTestId('resource-page');
  await expect(res).toContainText('Wood pellets');
  await expect(res.getByTestId('res-buy')).toBeVisible();
  await expect(res.getByTestId('res-could-build')).toContainText('Pellet Mill (small)');
  await shot(page, 'g15', '07-wood-pellets-market-and-mill');
  await res.getByTestId('res-could-build').getByRole('button', { name: 'Pellet Mill (small)' }).click();
  await expect(card).toContainText('Pellet Mill (small)');
  await expect(card.getByTestId('card-inputs')).toContainText('Wood chips');
  await shot(page, 'g15', '08-pellet-mill-card');
  await card.getByTestId('show-chain').click();
  const chain = page.getByTestId('supply-chain');
  await expect(chain).toContainText('Wood chips');
  await chain.getByTestId('plan-branch').click();
  await expect(page.getByTestId('build-plan')).toBeVisible();
  await page.keyboard.press('Escape');
  await shot(page, 'g15', '09-pellet-branch-planned');
});

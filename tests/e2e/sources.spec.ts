import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

const quiet = {
  autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false },
};

async function placeByName(page: Page, name: string, x: number, y: number): Promise<string> {
  const id = await page.evaluate(
    ([n, px, py]) => {
      const s = window.__homestead!.store.getState();
      const sid = s.catalog.systems.find((x) => x.name === n)!.id;
      s.startPlacing(sid, 'buy');
      const r = window.__homestead!.store.getState().placeAt(px as number, py as number);
      window.__homestead!.store.getState().cancelTool();
      return r.ok ? r.instanceId! : '';
    },
    [name, x, y] as const,
  );
  expect(id).not.toBe('');
  return id;
}

async function dblclickInstance(page: Page, id: string) {
  const p = await page.evaluate((iid) => {
    const g = window.__homestead!.store.getState().game;
    const i = g.instances.find((x) => x.id === iid)!;
    return window.__homestead!.worldToClient(i.x, i.y);
  }, id);
  await page.mouse.dblclick(p.x, p.y);
}

test('from five blocked systems, a buildable or buyable source is three clicks away', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.evaluate((q) => window.__homestead!.store.getState().setPrefs(q), quiet);
  const systems: [string, number, number, string][] = [
    ['Well', 40, 40, 'Electricity'],
    ['Tiny Wood Stove', 80, 40, 'Woody biomass'],
    ['Pellet Stove', 120, 40, 'Wood pellets'],
    ['Chicken Coop (12 hens)', 160, 40, 'Water'],
    ['Composting Outhouse', 40, 170, 'Carbon'],
  ];
  const ids: string[] = [];
  for (const [n, x, y] of systems) ids.push(await placeByName(page, n, x, y));
  await page.evaluate(() => window.__homestead!.store.getState().tick(30)); // let them get built
  await page.evaluate(() => window.__homestead!.store.getState().setCamera({ cx: 100, cy: 100, zoom: 3 }));
  for (let k = 0; k < systems.length; k++) {
    const [name] = systems[k]!;
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Click 1: open the blocked system's card from the map.
    await dblclickInstance(page, ids[k]!);
    const card = page.getByTestId('system-card');
    await expect(card).toContainText(name);
    const status = card.getByTestId('card-status');
    await expect(status).toBeVisible();
    // Click 2: the missing input in its status line opens that resource's page.
    const missing = (await status.locator('.res-link').textContent())!.trim();
    await status.locator('.res-link').click();
    const res = page.getByTestId('resource-page');
    await expect(res).toContainText(missing);
    // There, something to build or to buy.
    const options = await res.getByTestId('res-could-build').locator('li button.link').count();
    const canBuy = await res.getByTestId('res-buy').count();
    expect(options + canBuy, `${name} → ${missing}`).toBeGreaterThan(0);
    if (k === 0) await shot(page, 'g13', '01-well-electricity-page');
    // Click 3: open a source's card, ready to add.
    if (options > 0) {
      await res.getByTestId('res-could-build').locator('li button.link').first().click();
      await expect(page.getByTestId('system-card').getByRole('button', { name: /^Add/ })).toBeVisible();
    }
  }
});

test('walk a supply chain and back: card → resource → card, Backspace returns', async ({ page }) => {
  await openApp(page);
  await placeByName(page, 'Well', 60, 60);
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.openCard(s.catalog.systems.find((x) => x.name === 'Well')!.id);
  });
  const card = page.getByTestId('system-card');
  await card.getByTestId('card-inputs').getByTestId('res-link-Electricity').click();
  await expect(page.getByTestId('resource-page')).toContainText('Electricity');
  expect(await page.evaluate(() => window.location.hash)).toBe('#/resource/Electricity');
  await page.getByTestId('res-could-build').locator('li button.link').first().click();
  await expect(page.getByTestId('system-card')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('resource-page')).toContainText('Electricity');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('system-card')).toContainText('Well');
});

test('the supply chain of a well with no power plans a branch onto the map', async ({ page }) => {
  await openApp(page);
  await placeByName(page, 'Well', 60, 60);
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.openCard(s.catalog.systems.find((x) => x.name === 'Well')!.id);
  });
  await page.getByTestId('show-chain').click();
  const chain = page.getByTestId('supply-chain');
  await expect(chain).toContainText('Electricity');
  await shot(page, 'g13', '02-supply-chain');
  await chain.getByTestId('plan-branch').click();
  const plan = page.getByTestId('build-plan');
  await expect(plan).toBeVisible();
  const before = await page.evaluate(() => window.__homestead!.store.getState().game.instances.length);
  await page.keyboard.press('Escape');
  await shot(page, 'g13', '03-build-plan-ghosts');
  await plan.getByTestId('plan-build-all').click();
  await expect(plan).toHaveCount(0);
  const after = await page.evaluate(() => window.__homestead!.store.getState().game.instances.length);
  expect(after).toBeGreaterThan(before);
});

test('a resource page has its own address, and the drawer can search what systems make or use', async ({ page }) => {
  await page.goto('/?new#/resource/Wood%20pellets');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  const res = page.getByTestId('resource-page');
  await expect(res).toContainText('Wood pellets');
  await expect(res.getByTestId('res-buy')).toContainText('0.30');
  await shot(page, 'g13', '04-wood-pellets-page');
  await page.keyboard.press('Escape');
  await page.getByTestId('system-search').fill('wood pellets');
  await page.getByTestId('search-uses').click();
  await expect(page.getByTestId('tile-grid')).toContainText('Pellet Stove');
  await expect(page.getByTestId('tile-grid')).not.toContainText('Farm & Feed Store');
  await page.getByTestId('search-makes').click();
  await expect(page.getByTestId('tile-grid')).toContainText('Farm & Feed Store');
  await expect(page.getByTestId('tile-grid')).not.toContainText('Pellet Stove');
});

import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

async function openStartScreen(page: Page) {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await expect(page.getByTestId('new-game')).toBeVisible();
}

test('LL-51: a farm family on Lake Superior: two children, a mortgage paid daily from the job', async ({ page }) => {
  test.setTimeout(90_000);
  await openStartScreen(page);
  for (const id of ['adapt', 'greenfield', 'cabin', 'farm']) await expect(page.getByTestId(`start-${id}`)).toBeVisible();
  for (const id of ['tucson-az', 'olympia-wa', 'marquette-mi']) await expect(page.getByTestId(`site-${id}`)).toBeVisible();
  await page.getByTestId('start-farm').click();
  await expect(page.getByTestId('mortgage-note')).toContainText('$280,000 mortgage');
  await page.getByTestId('site-marquette-mi').click();
  await page.getByTestId('start-children').fill('2');
  await expect(page.getByTestId('children-note')).toContainText('70% of an adult');
  await shot(page, 'll-51', 'farm-start');
  await page.getByTestId('start-begin').click();
  await expect(page.getByTestId('new-game')).toHaveCount(0);

  const g = await page.evaluate(() => {
    const s = window.__homestead!.store.getState().game;
    return { start: s.start, roles: s.instances.filter((i) => i.person).map((i) => i.person!.role ?? 'adult'), finance: s.settings.finance, balance: s.finance?.mortgage?.balance };
  });
  expect(g.start).toMatchObject({ id: 'farm', household: 2, children: 2 });
  expect(g.roles).toEqual(['adult', 'adult', 'child', 'child']);
  expect(g.finance).toBe(true);
  expect(g.balance).toBe(280000);

  await page.evaluate(() => window.__homestead!.store.getState().tick(30));
  await page.getByTestId('open-market').click();
  const mortgage = page.getByTestId('mortgage');
  await expect(mortgage).toContainText('at 6.5% a year');
  await expect(mortgage).toContainText('$1,770 a month');
  await expect(page.getByTestId('quest')).toHaveCount(0);
  await expect(mortgage).toContainText('Behind on payments: $0');
  await mortgage.scrollIntoViewIfNeeded();
  await shot(page, 'll-51', 'mortgage');
});

test('LL-51: the off-grid cabin in the Sonoran desert starts paid off, with the seep and rain pools on the land', async ({ page }) => {
  await openStartScreen(page);
  await page.getByTestId('start-cabin').click();
  await expect(page.getByTestId('mortgage-note')).toHaveCount(0);
  await page.getByTestId('site-tucson-az').click();
  await page.getByTestId('start-begin').click();
  const g = await page.evaluate(() => {
    const s = window.__homestead!.store.getState().game;
    return { start: s.start?.id, site: s.site.id, cash: s.cash, debt: s.finance, water: s.site.nodes.filter((n) => n.resource === 'Water').map((n) => n.id) };
  });
  expect(g).toMatchObject({ start: 'cabin', site: 'tucson-az', cash: 6000 });
  expect(g.debt).toBeUndefined();
  expect(g.water).toEqual(['seep-1', 'pools-1', 'pools-2']);
});

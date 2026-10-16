import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

async function placeByName(page: Page, name: string, x: number, y: number) {
  const ok = await page.evaluate(
    ([n, px, py]) => {
      const s = window.__homestead!.store.getState();
      const id = s.catalog.systems.find((x) => x.name === n)!.id;
      s.startPlacing(id, 'buy');
      const r = window.__homestead!.store.getState().placeAt(px as number, py as number);
      window.__homestead!.store.getState().cancelTool();
      return r.ok;
    },
    [name, x, y] as const,
  );
  expect(ok).toBe(true);
}

test('buy firewood now, set a standing order, and read the weekly bills', async ({ page }) => {
  await openApp(page);
  // The grid as a backstop: it bills per kWh delivered plus a small connection fee.
  await placeByName(page, 'Central Power Plant (Coal / NatGas / Nuclear)', 100, 120);
  await page.keyboard.press('m');
  await expect(page.getByTestId('market')).toBeVisible();
  const row = page.getByTestId('market-Woody-biomass');
  await row.getByTestId('buy-amount-Woody-biomass').fill('200');
  await row.getByTestId('buy-Woody-biomass').click();
  await expect(row).toContainText('+200 ordered');
  await row.getByTestId('keep-Woody-biomass').fill('150');
  await row.getByTestId('keep-save-Woody-biomass').click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(10));
  const stock = await page.evaluate(() => window.__homestead!.store.getState().game.stocks['Woody biomass'] ?? 0);
  expect(stock).toBeGreaterThanOrEqual(150);
  const lines = page.getByTestId('bills-lines');
  await expect(lines).toContainText('Woody biomass');
  await expect(lines).toContainText('Electricity');
  await expect(lines).toContainText('Connection fees');
  expect(Number(await page.getByTestId('bills-week').getByRole('button').getAttribute('data-value'))).toBeGreaterThan(0);
  await shot(page, 'g12', '01-market-and-bills');
  // The purchase is in the action log, so it replays.
  const kinds = await page.evaluate(() => window.__homestead!.store.getState().actions.map((a) => a.kind));
  expect(kinds).toContain('buy');
  expect(kinds).toContain('standing');
});

test('the checklist shows how much of each need is made at home', async ({ page }) => {
  await openApp(page);
  await placeByName(page, 'Central Power Plant (Coal / NatGas / Nuclear)', 100, 120);
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  await page.keyboard.press('n');
  await page.getByTestId('mode-season').click();
  await expect(page.getByTestId('self-reliance')).toBeVisible();
  await expect(page.getByTestId('row-Electricity')).toContainText('0%');
  await shot(page, 'g12', '02-self-reliance');
});

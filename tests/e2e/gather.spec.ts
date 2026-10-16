import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

const quiet = {
  autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false },
};

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

test('the land provides: work priorities, auto-gather, nodes that deplete, and a "why" that says so', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.evaluate((q) => window.__homestead!.store.getState().setPrefs(q), quiet);
  await placeByName(page, 'Firepit', 140, 140); // cooking fire to boil spring water
  await page.evaluate(() => window.__homestead!.store.getState().zoomToFit());
  await page.waitForTimeout(300);
  await shot(page, 'g14', '01-nodes-full');
  // Work panel: turn on the auto-gather rules.
  await page.keyboard.press('j');
  const work = page.getByTestId('work');
  await expect(work).toBeVisible();
  await work.getByTestId('auto-water').fill('3');
  await work.getByTestId('auto-water').blur();
  await work.getByTestId('auto-wood').fill('2');
  await work.getByTestId('auto-wood').blur();
  await work.getByTestId('prio-gather-wood-2').click();
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.settings.work?.priorities?.['gather-wood'])).toBe(2);
  // A season of play.
  await page.evaluate(() => window.__homestead!.store.getState().tick(60));
  await expect(work.getByTestId('job-gather-water')).toContainText('h');
  await shot(page, 'g14', '02-work-panel');
  await page.keyboard.press('Escape');
  const fills = await page.evaluate(() => {
    const g = window.__homestead!.store.getState().game;
    return Object.keys(g.nodeStock ?? {});
  });
  expect(fills.some((id) => id.startsWith('deadfall'))).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'g14', '03-nodes-after-a-season');
  // Hovering a node says what is there.
  const p = await page.evaluate(() => {
    const g = window.__homestead!.store.getState().game;
    const n = g.site.nodes.find((x) => x.type === 'deadfall')!;
    const side = Math.sqrt(g.settings.parcelAcres * 43_560);
    return window.__homestead!.worldToClient(n.x * side, n.y * side);
  });
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('node-tip')).toContainText('Deadfall');
  await expect(page.getByTestId('node-tip')).toContainText('lbs left');
  // The checklist's "why" names the spring and the boiling.
  await page.keyboard.press('n');
  await page.getByTestId('mode-season').click();
  await page.getByTestId('provided-Drinking water').click();
  await expect(page.getByTestId('why-popover')).toContainText(/gal from the spring via boiling, [\d.]+ h labor/);
  await shot(page, 'g14', '04-why-gathered');
});

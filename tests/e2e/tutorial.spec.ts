import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

const title = (page: Page) => page.getByTestId('quest-title');

/** Run the clock a day at a time until the quest card moves on (or give up). */
async function untilQuestChanges(page: Page, from: string, maxDays = 30) {
  for (let d = 0; d < maxDays; d++) {
    if ((await title(page).textContent()) !== from) return;
    await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  }
  await expect(title(page)).not.toHaveText(from);
}

async function placeNearTent(page: Page, name: string, dx: number, dy: number) {
  const ok = await page.evaluate(
    ([n, ox, oy]) => {
      const s = window.__homestead!.store.getState();
      const tent = s.game.instances.find((i) => s.catalog.systems.find((x) => x.id === i.systemId)!.name.startsWith('Canvas Wall Tent'))!;
      s.startPlacing(s.catalog.systems.find((x) => x.name === n)!.id, 'diy');
      const r = window.__homestead!.store.getState().placeAt(tent.x + (ox as number), tent.y + (oy as number));
      window.__homestead!.store.getState().cancelTool();
      return r.ok;
    },
    [name, dx, dy] as const,
  );
  expect(ok, name).toBe(true);
}

test('the first five greenfield quests, with show me and the neighbor’s rewards', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId('start-greenfield').click();
  await page.getByTestId('site-front-range').click();
  await page.getByTestId('start-begin').click();
  await page.evaluate(() => window.__homestead!.store.getState().zoomToFit());

  // 1. Water: the barrel and the filter are in the kit; show me points at the barrel.
  await expect(title(page)).toHaveText("Fill the rain barrel and filter a day's water");
  await page.getByTestId('quest-show-me').click();
  await expect(page.getByTestId('system-card')).toContainText('Rain Barrel');
  await shot(page, 'g16', '01-quest-water-show-me');
  await page.keyboard.press('Escape');
  await untilQuestChanges(page, "Fill the rain barrel and filter a day's water");

  // 2. Firewood: show me focuses the deadfall; a weekly cap in the Work panel sends someone out.
  await expect(title(page)).toHaveText('Gather a week of firewood from the deadfall');
  await page.getByTestId('quest-show-me').click();
  await shot(page, 'g16', '02-quest-firewood-deadfall');
  await page.getByTestId('open-work').click();
  await page.getByTestId('cap-gather-wood').fill('6');
  await page.getByTestId('cap-gather-wood').blur();
  await page.getByTestId('open-work').click();
  await untilQuestChanges(page, 'Gather a week of firewood from the deadfall');
  const reward = await page.evaluate(() => window.__homestead!.store.getState().game.stocks['Root crops'] ?? 0);
  expect(reward).toBeGreaterThan(0); // Ruth's seed potatoes

  // 3. Both crop systems must finish; construction imports missing soil free.
  await expect(title(page)).toHaveText('Build a raised bed and a potato patch');
  await page.getByTestId('quest-show-me').click();
  await shot(page, 'g16', '03-quest-bed-show-me');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.marketBuy('Compost', 250);
  });
  await placeNearTent(page, 'Raised Beds (24 sq ft)', 0, 30);
  await placeNearTent(page, 'Potato Patch (400 sq ft)', 35, 35);
  await untilQuestChanges(page, 'Build a raised bed and a potato patch');

  // 4. Compost from kitchen scraps.
  await expect(title(page)).toHaveText('Start a compost pile with leaf litter and kitchen scraps');
  await placeNearTent(page, 'Bokashi Bucket', -20, 0);
  await page.evaluate(() => window.__homestead!.store.getState().marketStanding('Carbon', 40, 120));
  await untilQuestChanges(page, 'Start a compost pile with leaf litter and kitchen scraps');
  await shot(page, 'g16', '04-quest-compost-done');

  // 5. Auto-gather: configure a seven-day target; this does not prove a stored reserve.
  await expect(title(page)).toHaveText('Configure a seven-day water gathering target');
  await expect(page.getByTestId('quest-detail')).toContainText('does not prove a reserve exists');
  await expect(page.getByTestId('quest-assistance')).toContainText('80,000 kcal Food');
  await page.getByTestId('quest-show-me').click();
  await expect(page.getByTestId('work')).toBeVisible();
  await page.evaluate(() => window.__homestead!.store.getState().marketStanding('Food', 14000, 42000));
  await page.getByTestId('auto-water').fill('7');
  await page.getByTestId('auto-water').blur();
  await shot(page, 'g16', '05-quest-autowater-work-panel');
  await page.getByTestId('open-work').click();
  await untilQuestChanges(page, 'Configure a seven-day water gathering target', 3);
  await expect(title(page)).toHaveText('Add a chicken coop and keep the hens fed');
  const done = await page.evaluate(() => Object.keys(window.__homestead!.store.getState().game.tutorial!.done));
  expect(done).toHaveLength(5);
  await shot(page, 'g16', '06-quest-six-hens-next');
});

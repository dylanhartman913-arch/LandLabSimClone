import { expect, test, type Page } from '@playwright/test';
import { shot } from './helpers.ts';

/** Find a system and add it, keyboard only: "/", type, Tab to the first tile, Enter, Enter on Add. */
async function addByKeyboard(page: Page, query: string, moves: string[]) {
  await page.keyboard.press('/');
  await expect(page.getByTestId('system-search')).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('system-card')).toBeVisible();
  await expect(page.getByTestId('add-buy')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status')).toContainText('Placing');
  for (const m of moves) await page.keyboard.press(m);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status')).not.toContainText('Placing');
}

test('first 15 minutes, keyboard only: the first three quests', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?new');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await expect(page.getByTestId('quest-title')).toHaveText('Shelter two people');
  await shot(page, 'g8', '01-first-quest');

  await addByKeyboard(page, 'yurt', []); // map center, below the tent
  await addByKeyboard(page, 'municipal water', ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']);
  await addByKeyboard(page, 'concentrated sunlight', ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']);
  await shot(page, 'g8', '02-placed-by-keyboard');

  // Run the clock at 10×; if auto-pause stops it, start it again (still keyboard).
  await page.keyboard.press('3');
  const done = () => page.evaluate(() => Object.keys(window.__homestead!.store.getState().progress.quests));
  await expect
    .poll(
      async () => {
        if (await page.getByTestId('speed-0').getAttribute('aria-pressed') === 'true') await page.keyboard.press('3');
        return (await done()).length;
      },
      { timeout: 180_000, intervals: [1000] },
    )
    .toBeGreaterThanOrEqual(3);
  await page.keyboard.press(' ');
  expect(await done()).toEqual(expect.arrayContaining(['shelter-two', 'water-week', 'cook-free']));
  await expect(page.getByTestId('quest-title')).toHaveText('Make it through January warm');
  await shot(page, 'g8', '03-three-quests-done');
});

test('arrow keys move a selected system; focus is always visible', async ({ page }) => {
  await page.goto('/?new');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  const tent = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    const t = s.game.instances.find((i) => i.systemId === 'S008')!;
    s.select([t.id]);
    return t;
  });
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.evaluate((id) => window.__homestead!.store.getState().select([id]), tent.id);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const moved = await page.evaluate((id) => window.__homestead!.store.getState().game.instances.find((i) => i.id === id)!, tent.id);
  expect(moved.x).toBeGreaterThan(tent.x);
  expect(moved.y).toBeGreaterThan(tent.y);
  // Tab reaches a control and it shows a focus ring.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

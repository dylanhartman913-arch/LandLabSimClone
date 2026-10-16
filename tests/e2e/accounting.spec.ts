import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { GameState, Action, GameInit } from '@homestead/engine';
import { choose, clickWorld, openApp, shot } from './helpers.ts';

async function loadFixture(page: Page, name: 'spring' | 'winter', until?: number) {
  const path = `packages/engine/test/fixtures/playtest/${name}.json`;
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as { init: GameInit; actions: Action[]; absDay: number };
  const day = until ?? fixture.absDay;
  const game = JSON.parse(execFileSync(process.execPath,
    ['--import', 'tsx', 'scripts/replay-playtest.ts', path, String(day)],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) as GameState;
  const init = fixture.init;
  const actions = fixture.actions.filter((a) => a.at <= day);
  await page.evaluate(({ init, actions, game }) => {
    window.__homestead!.store.getState().loadGame(init, actions, game);
  }, { init, actions, game });
}

const value = async (page: Page, id: string) => Number(await page.getByTestId(id).getAttribute('data-value'));

test('a 0%-built yurt changes the planned forecast, never measured coverage', async ({ page }) => {
  await openApp(page);
  await loadFixture(page, 'spring');
  await page.getByTestId('open-checklist').click();
  await expect(page.getByTestId('mode-current')).toHaveAttribute('aria-checked', 'true');
  const liveShelter = await value(page, 'provided-Shelter');
  await expect(page.getByTestId('checklist-summary')).toContainText('last 7 measured days');
  await page.getByTestId('checklist-close').click();
  await choose(page, 'yurt', 'S056', 'diy');
  await clickWorld(page, 144, 129);
  await page.getByTestId('selection-details').click();
  await expect(page.getByTestId('inst-progress')).toHaveAttribute('data-value', '0');
  await expect(page.getByTestId('card-basis')).toContainText('no operating output');
  await expect(page.getByTestId('card-outputs')).toContainText('0 sq ft');
  await page.getByTestId('card-close').click();
  await page.getByTestId('open-checklist').click();
  expect(await value(page, 'provided-Shelter')).toBe(liveShelter);
  await page.getByTestId('mode-completed').click();
  expect(await value(page, 'provided-Shelter')).toBe(224);
  await page.getByTestId('mode-average').click();
  expect(await value(page, 'provided-Shelter')).toBe(538);
  await expect(page.getByTestId('design-strip')).toContainText('includes construction');
  await shot(page, 'phase-1', 'planned-yurt');
});

test('hunger runway excludes seed potatoes, explains them, and warns about impossible water storage', async ({ page }) => {
  await openApp(page);
  await loadFixture(page, 'winter', 114);
  expect(await value(page, 'stock-days-food')).toBeLessThan(0.3);
  await page.getByTestId('stock-days-food').click();
  await expect(page.getByTestId('why-popover')).toContainText('25.00 lbs reserved for planting');
  await shot(page, 'phase-1', 'usable-food');
  await page.keyboard.press('Escape');
  await loadFixture(page, 'spring');
  await page.getByTestId('open-work').click();
  await expect(page.getByTestId('water-reserve-warning')).toContainText('105 gal');
  await expect(page.getByTestId('work')).toContainText('available;');
  await expect(page.getByTestId('work')).toContainText('idle.');
  await shot(page, 'phase-1', 'work-reserves');
});

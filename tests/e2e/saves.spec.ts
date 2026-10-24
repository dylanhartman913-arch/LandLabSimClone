import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Action, GameInit, GameState } from '@homestead/engine';
import { openApp } from './helpers.ts';

test('report history comes back when a save is imported in a fresh browser (LL-11)', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await openApp(page);
  const before = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.setPrefs({ autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false } });
    for (let k = 0; k < 200 && window.__homestead!.store.getState().reports.length < 2; k++) window.__homestead!.store.getState().tick(1);
    const s = window.__homestead!.store.getState();
    return { titles: s.reports.map((r) => r.title), absDay: s.game.calendar.absDay };
  });
  expect(before.titles.length).toBeGreaterThanOrEqual(2);

  await page.getByTestId('open-saves').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()]);
  const path = await download.path();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await ctx.newPage();
  await fresh.goto('/?new');
  await fresh.waitForSelector('[data-testid="map"][data-ready="true"]');
  await fresh.getByTestId('open-saves').click();
  await fresh.getByTestId('import-file').setInputFiles(path!);
  await expect(fresh.locator('.toast').filter({ hasText: 'Replay verified' })).toBeVisible();
  const after = await fresh.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return { titles: s.reports.map((r) => r.title), absDay: s.game.calendar.absDay };
  });
  expect(after.absDay).toBe(before.absDay);
  expect(after.titles).toEqual(before.titles);
  await expect(fresh.getByTestId('open-reports')).toContainText(`Reports (${before.titles.length})`);
  await ctx.close();
});

test('the June playtest checkpoint loads with its spring report (Oct 16 playtest)', async ({ page }) => {
  await openApp(page);
  const path = 'packages/engine/test/fixtures/playtest/spring.json';
  const f = JSON.parse(readFileSync(path, 'utf8')) as { init: GameInit; actions: Action[] };
  const game = JSON.parse(
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-playtest.ts', path], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
  ) as GameState;
  await page.evaluate(({ f, game }) => window.__homestead!.store.getState().loadGame(f.init, f.actions, game), { f, game });
  const titles = await page.evaluate(() => window.__homestead!.store.getState().reports.map((r) => r.title));
  expect(titles).toContain('Spring report, year 1');
  await expect(page.getByTestId('open-reports')).toContainText('Reports (1)');
});

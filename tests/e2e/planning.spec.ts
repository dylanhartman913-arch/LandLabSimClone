import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Action, GameInit, GameState } from '@homestead/engine';
import { client, clickWorld, openApp, shot } from './helpers.ts';

async function loadSpring(page: Page) {
  const path = 'packages/engine/test/fixtures/playtest/spring.json';
  const f = JSON.parse(readFileSync(path, 'utf8')) as { init: GameInit; actions: Action[] };
  const game = JSON.parse(
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-playtest.ts', path], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  ) as GameState;
  await page.evaluate(
    ({ f, game }) => window.__homestead!.store.getState().loadGame(f.init, f.actions, game),
    { f, game },
  );
}

async function card(page: Page, name: string) {
  await page.evaluate((name) => {
    const st = window.__homestead!.store.getState();
    st.openCard(st.catalog.systems.find((s) => s.name === name)!.id);
  }, name);
}

test('a yurt and food projects disclose budget, heat, calories and inputs before cash changes', async ({
  page,
}) => {
  await openApp(page);
  await loadSpring(page);
  const before = await page.evaluate(() => structuredClone(window.__homestead!.store.getState().game));
  await card(page, 'Yurt');
  await page.getByTestId('choose-diy').click();
  await expect(page.getByTestId('project-preview')).toContainText('$6,000');
  await expect(page.getByTestId('project-cash-after')).toHaveAttribute('data-value', '1784');
  await expect(page.getByTestId('project-heat')).toContainText('Every shelter draws heat even when unused');
  await expect(page.getByTestId('project-demand')).toContainText('Heat');
  await shot(page, 'phase-3', 'yurt-budget-heat');
  await card(page, 'Raised Beds (24 sq ft)');
  await expect(page.getByTestId('project-food')).toContainText('3.71 kcal/person/day');
  await expect(page.getByTestId('project-preview')).toContainText('Soil');
  await expect(page.getByTestId('project-food')).toContainText('0.19%');
  await card(page, 'Chicken Coop (12 hens)');
  await expect(page.getByRole('heading', { name: 'Chicken Coop (12 hens)', exact: true })).toBeInViewport();
  await expect(page.getByTestId('project-food')).toContainText('275');
  await expect(page.getByTestId('project-food')).toContainText('13.75%');
  await expect(page.getByTestId('project-demand')).toContainText('Chicken feed');
  expect(await page.evaluate(() => window.__homestead!.store.getState().game)).toEqual(before);
  await page.getByTestId('project-food').scrollIntoViewIfNeeded();
  await shot(page, 'phase-3', 'coop-contribution');
});

test('heater placement shows reach and overlap independently, and dragging updates connections before release', async ({
  page,
}) => {
  await openApp(page);
  await loadSpring(page);
  const before = await page.evaluate(() => window.__homestead!.store.getState().game.cash);
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.startPlacing(st.catalog.systems.find((s) => s.name === 'Rocket Mass Heater')!.id, 'diy');
    st.setPrefs({ snap: 0 });
    st.setKbCursor({ x: 124, y: 104 });
  });
  await expect(page.getByTestId('placement-preview')).toContainText('Footprint fits');
  await expect(page.getByTestId('placement-connection').filter({ hasText: 'Heat:' }).first()).toContainText(
    'in range',
  );
  await page.evaluate(() => window.__homestead!.store.getState().setKbCursor({ x: 190, y: 190 }));
  await expect(page.getByTestId('placement-preview')).toContainText('No delivered Heat');
  await page.evaluate(() => window.__homestead!.store.getState().setKbCursor({ x: 104, y: 104 }));
  await expect(page.getByTestId('placement-preview')).toContainText('overlaps');
  await expect(page.getByTestId('placement-preview')).toContainText('in range');
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.cash)).toBe(before);
  await shot(page, 'phase-3', 'placement-reach-overlap');
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.setKbCursor(null);
    st.cancelTool();
    st.startPlacing(st.catalog.systems.find((s) => s.name === 'Rocket Mass Heater')!.id, 'buy');
    const placed = window.__homestead!.store.getState().placeAt(124, 104);
    if (!placed.ok) throw new Error(placed.reason);
  });
  const from = await client(page, 124, 104);
  const to = await client(page, 190, 180);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.getByTestId('placement-preview')).toContainText('No delivered Heat');
  await page.mouse.up();
});

test('Plan shares its annual baseline, labels weather assumptions and projects the actual save without spending stocks', async ({
  page,
}) => {
  await openApp(page);
  await loadSpring(page);
  const before = await page.evaluate(() => structuredClone(window.__homestead!.store.getState().game));
  await page.keyboard.press('p');
  const baseline = await page.getByTestId('planning-score').getAttribute('data-value');
  await page.getByTestId('duplicate-scenario').click();
  await expect(page.getByTestId('compare')).toContainText('Setup labor');
  await page.getByTestId('plan-tab-sensitivity').click();
  await expect(page.getByTestId('sensitivity')).toContainText(`${(Number(baseline) * 100).toFixed(4)}%`);
  await expect(page.getByTestId('sensitivity')).toContainText('pp');
  await expect(page.getByTestId('sensitivity')).toContainText('No modeled flow changes');
  await page.getByTestId('plan-tab-montecarlo').click();
  await expect(page.getByTestId('weather-policy')).toContainText('28,000 kcal Food');
  await expect(page.getByTestId('weather-policy')).toContainText('no auto-gather');
  await page.getByTestId('plan-tab-transition').click();
  await expect(page.getByTestId('transition-forecast')).toContainText('Preserves stocks, cash, construction');
  expect(await page.evaluate(() => window.__homestead!.store.getState().game)).toEqual(before);
  await shot(page, 'phase-3', 'live-transition');
});

test('a player can fund and schedule a connected heater using the displayed purchase and crew quote', async ({
  page,
}) => {
  await openApp(page);
  await loadSpring(page);
  await card(page, 'Rocket Mass Heater');
  await page.getByTestId('choose-diy').click();
  await expect(page.getByTestId('project-crew')).toContainText('$2,100');
  await expect(page.getByTestId('project-crew')).toContainText('8 days');
  await expect(page.getByTestId('project-crew')).toContainText('$5,084');
  await page.getByTestId('add-diy').click();
  const point = await client(page, 124, 104);
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId('placement-preview')).toContainText('in range');
  await expect(page.getByTestId('placement-preview')).toContainText('Footprint fits');
  await clickWorld(page, 124, 104);
  const id = await page.evaluate(() => window.__homestead!.store.getState().game.instances.at(-1)!.id);
  await page.getByTestId('open-work').click();
  await expect(page.getByTestId(`project-${id}`)).toContainText('$2,100');
  await page.getByTestId(`hire-${id}`).click();
  await expect(page.getByTestId(`project-${id}`)).toContainText('forecast 8 days');
  expect(await page.evaluate(() => window.__homestead!.store.getState().game.cash)).toBe(5084);
  await shot(page, 'phase-3', 'funded-heater-schedule');
  await page.evaluate(() => window.__homestead!.store.getState().tick(8));
  expect(
    await page.evaluate(
      (id) => window.__homestead!.store.getState().game.instances.find((i) => i.id === id)!.status,
      id,
    ),
  ).toBe('active');
});

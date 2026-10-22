import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Action, GameInit, GameState } from '@homestead/engine';
import { openApp, shot } from './helpers.ts';

async function loadWinter(page: Page) {
  const path = 'packages/engine/test/fixtures/playtest/winter.json';
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

test('winter recovery is visible, priced, finite and works with employment retained', async ({ page }) => {
  await openApp(page);
  await loadWinter(page);
  await expect(page.getByTestId('hint')).toContainText('Household recovery comes first');
  await expect(page.getByTestId('hint')).toContainText('Heat');
  await page.getByRole('button', { name: 'Recovery and construction', exact: true }).click();
  await expect(page.getByTestId('town-recovery')).toContainText('Person 1 (i3), Person 2 (i4)');
  await expect(page.getByTestId('project-i21')).toContainText('$2,100');
  await expect(page.getByTestId('project-i21')).toContainText('8 days');
  await page.getByTestId('hire-i20').click();
  await page.getByTestId('hire-i21').click();
  await expect(page.getByTestId('project-i21')).toContainText('forecast 8 days');
  await page.getByTestId('prio-upkeep-1').click();
  await page.getByTestId('prio-gather-water-2').click();
  await page.getByTestId('prio-gather-wood-2').click();
  await page.getByTestId('prio-gather-food-2').click();
  await shot(page, 'phase-2', 'winter-recovery');
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    st.marketStanding('Woody biomass', 500, 1500);
    st.marketStanding('Food', 28000, 84000);
    st.marketStanding('Carbon', 40, 120);
    st.tick(30);
  });
  const result = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    return {
      people: st.game.instances
        .filter((i) => i.person)
        .map((i) => ({ away: !!i.person!.away, wellbeing: i.person!.wellbeing })),
      actions: st.actions,
      employed: st.game.instances.some(
        (i) => st.catalog.systems.find((s) => s.id === i.systemId)?.name === 'Remote Job (40 hrs)',
      ),
    };
  });
  expect(result.people.every((p) => !p.away && p.wellbeing > 50)).toBe(true);
  expect(result.employed).toBe(true);
  expect(result.actions.filter((a) => a.kind === 'hireConstruction')).toHaveLength(2);
  expect(result.actions.some((a) => a.kind === 'settings' && a.settings.safeRecovery)).toBe(true);
  await shot(page, 'phase-2', 'winter-returned');
});

test('one priced recovery route books crews, upkeep and orders and brings the household home', async ({ page }) => {
  await openApp(page);
  await loadWinter(page);
  await page.getByRole('button', { name: 'Recovery and construction', exact: true }).click();
  const route = page.getByTestId('recovery-route');
  await expect(route).toContainText('Works with zero resident labor');
  await expect(route).toContainText('Book a crew for Rocket Mass Heater (i20)');
  await expect(route).toContainText('Standing order: keep Woody biomass above');
  await expect(page.getByTestId('route-outcome')).toContainText('Forecast: home on day');
  await expect(page.getByTestId('route-outcome')).toContainText('still home 30 days later');
  await expect(page.getByTestId('book-route')).toContainText('$2,347');
  await shot(page, 'phase-4', 'recovery-route');
  await page.getByTestId('book-route').click();
  await expect(page.getByTestId('project-i21')).toContainText('Prepaid crew booked');
  await page.evaluate(() => window.__homestead!.store.getState().tick(30));
  const result = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    return {
      people: st.game.instances.filter((i) => i.person).map((i) => ({ away: !!i.person!.away, wellbeing: i.person!.wellbeing })),
      kinds: st.actions.map((a) => a.kind),
    };
  });
  expect(result.people.every((p) => !p.away && p.wellbeing > 50)).toBe(true);
  expect(result.kinds.filter((k) => k === 'hireConstruction')).toHaveLength(2);
  expect(result.kinds).toContain('standing');
});

test('insufficient cash explains the exact shortfall without booking a crew', async ({ page }) => {
  await openApp(page);
  await loadWinter(page);
  await page.evaluate(() => {
    const st = window.__homestead!.store;
    st.setState({ game: { ...st.getState().game, cash: 100 } });
  });
  await page.getByTestId('open-work').click();
  await expect(page.getByTestId('hire-i21')).toBeDisabled();
  await expect(page.getByTestId('project-i21')).toContainText('missing $2000.00');
  await expect(page.getByTestId('project-i20')).toContainText('missing $147.05');
});

test('Show me opens an owned operating system and states assistance explicitly', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId('start-greenfield').click();
  await page.getByTestId('start-begin').click();
  await expect(page.getByTestId('quest-assistance')).toContainText('$200');
  await expect(page.getByTestId('quest-assistance')).toContainText('assistance');
  await shot(page, 'phase-2', 'tutorial-assistance');
  await page.getByTestId('quest-show-me').click();
  const ids = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    return {
      card: st.cardInstanceId,
      selected: st.selection,
      active: st.game.instances.find((i) => i.id === st.cardInstanceId)?.status,
    };
  });
  expect(ids.card).toBeTruthy();
  expect(ids.selected).toContain(ids.card);
  expect(ids.active).toBe('active');
  await shot(page, 'phase-2', 'owned-system-assistance');
});

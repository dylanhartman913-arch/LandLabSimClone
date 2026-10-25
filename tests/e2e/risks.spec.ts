import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a blizzard warning names reserve mitigations, suspends an ordered delivery and records the reopening', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Warned risk events', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const now = st.game.calendar.absDay;
    st.loadGame(st.init, st.actions, {
      ...st.game,
      risks: {
        readiness: {},
        threats: [
          { id: 'blizzard:browser', kind: 'blizzard', warnedAt: now, startsAt: now + 3, endsAt: now + 6 },
        ],
      },
    });
  });
  const alert = page.getByTestId('alert-risk:blizzard:browser');
  await expect(alert).toContainText('Blizzard warning');
  if ((await alert.getAttribute('open')) === null) await alert.locator('summary').click();
  await expect(alert.locator('p')).toBeVisible();
  await expect(alert).toContainText('Stock food, drinking water, animal feed and fuel');
  await shot(page, 'll-38', 'blizzard-warning');
  await page.evaluate(() => window.__homestead!.store.getState().tick(3));
  await expect(alert).toContainText('Blizzard — active');
  await page.getByTestId('open-market').click();
  await page.getByTestId('buy-amount-Woody-biomass').fill('10');
  await page.getByTestId('buy-Woody-biomass').click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(3));
  const delayed = await page.evaluate(() => {
    const g = window.__homestead!.store.getState().game;
    return {
      orders: g.market!.orders,
      delivery: g.ledgers.slice(-3).map((l) => l.spend.delivery),
      purchases: g.ledgers.slice(-3).map((l) => l.resources['Woody biomass']?.purchased ?? 0),
    };
  });
  expect(delayed.orders).toEqual([{ resource: 'Woody biomass', amount: 10 }]);
  expect(delayed.delivery).toEqual([0, 0, 0]);
  expect(delayed.purchases).toEqual([0, 0, 0]);
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  const resumed = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return {
      orders: s.game.market!.orders,
      bought: s.game.ledgers.at(-1)!.resources['Woody biomass']!.purchased,
      events: s.events.filter((e) => e.kind === 'risk'),
    };
  });
  expect(resumed.orders).toEqual([]);
  expect(resumed.bought).toBe(10);
  expect(resumed.events.some((e) => e.phase === 'started')).toBe(true);
  expect(resumed.events.some((e) => e.phase === 'ended')).toBe(true);
  await page.getByLabel('Close market', { exact: true }).click();
  await page.getByRole('button', { name: 'Almanac', exact: true }).click();
  await expect(page.getByTestId('almanac')).toContainText('Blizzard: event ended');
});

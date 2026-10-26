import { test, expect, type Browser, type Page } from '@playwright/test';

test('two browsers create and join; full and invalid invitations explain failures', async ({
  browser,
}, testInfo) => {
  const creator = await browser.newContext();
  const teammate = await browser.newContext();
  const visitor = await browser.newContext();
  try {
    const a = await creator.newPage();
    await a.goto('/');
    await a.getByRole('link', { name: 'Multiplayer preview', exact: true }).click();
    await a.getByRole('textbox', { name: 'Guest name' }).fill('River');
    await a.getByRole('button', { name: 'Create homestead' }).click();
    const invite = await a.getByRole('textbox', { name: 'Invite link' }).inputValue();
    expect(invite).toMatch(/\?room=[A-Za-z0-9_-]{32}$/);
    const b = await teammate.newPage();
    await b.goto(invite);
    await expect(b.getByRole('status')).toContainText('1/2 seats claimed');
    await b.getByRole('textbox', { name: 'Guest name' }).fill('Sky');
    await b.getByRole('button', { name: 'Join homestead' }).click();
    await expect(b.getByRole('status')).toContainText('2/2 seats claimed');
    await expect(a.getByRole('status')).toContainText('2/2 seats claimed');
    await expect(a.getByRole('listitem').filter({ hasText: 'Sky' })).toBeVisible();
    await b.screenshot({ path: testInfo.outputPath('lobby.png') });
    const c = await visitor.newPage();
    await c.goto(invite);
    await expect(c.getByText('Room full. This homestead already has two players.')).toBeVisible();
    await expect(c.getByRole('button', { name: 'Join homestead' })).toHaveCount(0);
    await c.goto('/?room=unknown');
    await expect(c.getByRole('alert')).toContainText('unknown or has expired');
    await expect(c.getByRole('button', { name: 'Join homestead' })).toBeDisabled();
  } finally {
    await creator.close();
    await teammate.close();
    await visitor.close();
  }
});

async function withSharedHomestead(browser: Browser, play: (a: Page, b: Page) => Promise<void>) {
  const creator = await browser.newContext();
  const teammate = await browser.newContext();
  try {
    const a = await creator.newPage();
    const b = await teammate.newPage();
    await a.goto('/?multiplayer');
    await a.getByRole('textbox', { name: 'Guest name' }).fill('River');
    await a.getByRole('button', { name: 'Create homestead' }).click();
    const invite = await a.getByRole('textbox', { name: 'Invite link' }).inputValue();
    await b.goto(invite);
    await b.getByRole('textbox', { name: 'Guest name' }).fill('Sky');
    await b.getByRole('button', { name: 'Join homestead' }).click();
    await a.getByRole('button', { name: 'Enter shared homestead' }).click();
    await b.getByRole('button', { name: 'Enter shared homestead' }).click();
    for (const page of [a, b]) {
      await expect(page.getByTestId('hud')).toBeVisible();
      await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByTestId('shared-status')).toContainText('Connected');
      await expect(page.getByTestId('open-saves')).toBeDisabled();
      await expect(page.getByTestId('speed-3')).toBeDisabled();
    }
    await play(a, b);
  } finally {
    await creator.close();
    await teammate.close();
  }
}

async function pauseTogether(a: Page, b: Page) {
  const committed = a.waitForResponse((response) => response.url().endsWith('/control') && response.request().method() === 'POST' && response.request().postDataJSON().ready === false);
  await a.getByRole('button', { name: 'Pause together', exact: true }).click();
  const response = await committed;
  expect(response.ok()).toBe(true);
  const paused = await response.json() as { revision: number };
  for (const page of [a, b]) {
    await expect(page.getByTestId('shared-status')).toContainText(`Revision ${paused.revision} · Paused`);
    await expect(page.getByTestId('shared-pause')).toContainText('River paused');
  }
}

const state = (page: Page) => page.evaluate(() => JSON.stringify(window.__homestead!.store.getState().game));

test('both players build, buy and change work while their camera and selection stay local', async ({ browser }, testInfo) => {
  await withSharedHomestead(browser, async (a, b) => {
    // Use the same public store operations as map placement; market and work use their UI controls.
    const build = (page: Page, x: number) => page.evaluate((px) => {
      const s = window.__homestead!.store.getState();
      const id = s.catalog.systems.find((sys) => sys.name === 'Rain Barrel (55 gal)')!.id;
      s.startPlacing(id, 'buy');
      s.placeAt(px, 25);
    }, x);
    const count = (page: Page) => page.evaluate(() => window.__homestead!.store.getState().game.instances.length);
    const initial = await count(a);
    await build(a, 25);
    await expect.poll(() => count(b)).toBe(initial + 1);
    await build(b, 50);
    await expect.poll(() => count(a)).toBe(initial + 2);
    await a.getByTestId('open-market').click();
    await a.getByTestId('buy-amount-Food').fill('1000');
    await a.getByTestId('buy-Food').click();
    await expect.poll(() => b.evaluate(() => window.__homestead!.store.getState().game.market?.orders.find((o) => o.resource === 'Food')?.amount)).toBe(1000);
    expect(await a.getByTestId('hud-cash').textContent()).toBe(await b.getByTestId('hud-cash').textContent());
    await b.getByTestId('open-work').click();
    await b.getByTestId('prio-construction-5').click();
    await expect(b.getByTestId('prio-construction-5')).toHaveAttribute('aria-checked', 'true');
    await b.getByRole('button', { name: 'Close work', exact: true }).click();
    await a.getByTestId('open-work').click();
    await expect(a.getByTestId('prio-construction-5')).toHaveAttribute('aria-checked', 'true');
    await a.getByRole('button', { name: 'Close work', exact: true }).click();
    const cameraB = await b.evaluate(() => window.__homestead!.store.getState().camera);
    await a.evaluate(() => {
      const s = window.__homestead!.store.getState();
      s.setCamera({ cx: 25, zoom: 3 });
      s.select([s.game.instances.at(-1)!.id]);
      s.tick(100); // A browser cannot advance multiplayer time.
    });
    expect(await b.evaluate(() => window.__homestead!.store.getState().camera)).toEqual(cameraB);
    expect(await b.evaluate(() => window.__homestead!.store.getState().selection)).toEqual([]);
    expect(await a.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(0);
    await a.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await b.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await expect.poll(() => b.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBeGreaterThan(0);
    await pauseTogether(a, b);
    expect(await b.evaluate(() => window.__homestead!.store.getState().game.market?.orders)).toEqual([]);
    const gameA = await state(a);
    await expect.poll(() => state(b)).toBe(gameA);
    await a.screenshot({ path: testInfo.outputPath('shared-game.png') });
  });
});

test('only the server advances time after both agree; pause, history and disconnects converge', async ({ browser }, testInfo) => {
  await withSharedHomestead(browser, async (a, b) => {
    await a.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await expect(a.getByText('River: Ready', { exact: true })).toBeVisible();
    expect(await b.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBe(0);
    await b.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await expect.poll(() => b.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBeGreaterThan(0);
    await pauseTogether(a, b);
    const day = await a.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay);
    await a.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await b.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await expect.poll(() => b.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBeGreaterThan(day);
    await pauseTogether(a, b);
    expect(await b.evaluate(() => window.__homestead!.store.getState().game.ledgers.length)).toBeGreaterThan(1);
    const gameA = await state(a);
    await expect.poll(() => state(b)).toBe(gameA);
    await a.screenshot({ path: testInfo.outputPath('shared-clock.png') });
    await b.close();
    await expect(a.getByText('Sky: Disconnected', { exact: true })).toBeVisible();
    await expect(a.getByTestId('shared-pause')).toContainText('disconnected');
  });
});

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

async function withSharedHomestead(browser: Browser, play: (a: Page, b: Page) => Promise<void>, tablet = false) {
  const creator = await browser.newContext();
  const teammate = await browser.newContext(tablet ? { hasTouch: true, viewport: { width: 768, height: 1024 } } : {});
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

test('refresh reclaims the same seat and a network loss automatically recovers current state paused', async ({
  browser,
}) => {
  await withSharedHomestead(browser, async (a, b) => {
    const initial = await a.evaluate(() => window.__homestead!.store.getState().game.instances.length);
    await a.reload();
    await expect(a.getByTestId('map')).toHaveAttribute('data-ready', 'true');
    await expect(a.getByTestId('shared-status')).toContainText('Connected');
    await expect(a.getByText('River: Planning', { exact: true })).toBeVisible();
    await expect(a.getByText('Sky: Planning', { exact: true })).toBeVisible();
    await a.context().setOffline(true);
    await expect(a.getByTestId('shared-status')).toContainText('Disconnected');
    await expect(b.getByText('River: Disconnected', { exact: true })).toBeVisible();
    await expect(b.getByTestId('shared-status')).toContainText('Paused');
    await b.evaluate(() => {
      const s = window.__homestead!.store.getState();
      const id = s.catalog.systems.find((sys) => sys.name === 'Rain Barrel (55 gal)')!.id;
      s.startPlacing(id, 'buy');
      s.placeAt(25, 25);
    });
    await expect
      .poll(() => b.evaluate(() => window.__homestead!.store.getState().game.instances.length))
      .toBe(initial + 1);
    await a.context().setOffline(false);
    await expect(a.getByTestId('shared-status')).toContainText('Connected', { timeout: 20_000 });
    await expect(a.getByTestId('shared-status')).toContainText('Paused');
    await expect(a.getByText('River: Planning', { exact: true })).toBeVisible();
    const current = await state(b);
    await expect.poll(() => state(a)).toBe(current);
    await expect(a.getByTestId('shared-save')).toBeVisible();
  });
});

test('an accepted purchase with a dropped response survives refresh without a second charge', async ({
  browser,
}) => {
  await withSharedHomestead(browser, async (a, b) => {
    let purchasePosts = 0;
    let committed: { revision: number; game: { cash: number } } | undefined;
    await a.route('**/commands', async (route) => {
      purchasePosts++;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committed = await response.json();
      await route.abort('failed'); // Commit reached the server; its HTTP acknowledgement never reached the browser.
    });
    await a.evaluate(() => window.__homestead!.store.getState().marketBuy('Food', 1000));
    await expect.poll(() => committed?.revision).toBeGreaterThan(0);
    await expect(a.getByRole('alert')).toContainText('Connection lost');
    await a.reload();
    await expect(a.getByTestId('map')).toHaveAttribute('data-ready', 'true');
    await expect(a.getByTestId('shared-status')).toContainText('Connected');
    await expect(a.getByRole('status').filter({ hasText: 'awaiting confirmation' })).toHaveCount(0);
    expect(purchasePosts).toBe(1);
    expect(await a.evaluate(() => window.__homestead!.store.getState().game.cash)).toBe(committed!.game.cash);
    expect(await b.evaluate(() => window.__homestead!.store.getState().game.cash)).toBe(committed!.game.cash);
    expect(await a.evaluate(() => window.__homestead!.store.getState().game.market?.orders)).toEqual([
      expect.objectContaining({ resource: 'Food', amount: 1000 }),
    ]);
    expect(
      await a.evaluate(() => {
        const key = Object.keys(sessionStorage).find((k) => k.startsWith('terra-room-v1:'))!;
        return JSON.parse(sessionStorage.getItem(key)!).pending;
      }),
    ).toEqual([]);
  });
});

test('failed save responses stay visible and never display a successful save', async ({ browser }) => {
  await withSharedHomestead(browser, async (a) => {
    await a.route('**/commands', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Room storage failed (ENOSPC). No save was acknowledged. Contact the host owner.',
        }),
      }),
    );
    // Keep retry failures visible rather than letting the succeeding real stream clear the injected error.
    await a.route('**/stream', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Room storage failed (ENOSPC). No save was acknowledged. Contact the host owner.',
        }),
      }),
    );
    const cash = await a.evaluate(() => window.__homestead!.store.getState().game.cash);
    await a.evaluate(() => window.__homestead!.store.getState().marketBuy('Food', 1000));
    await expect(a.getByRole('alert')).toContainText('No save was acknowledged');
    await expect(a.getByTestId('shared-save')).toHaveCount(0);
    expect(await a.evaluate(() => window.__homestead!.store.getState().game.cash)).toBe(cash);
    await expect(a.getByRole('status').filter({ hasText: 'awaiting confirmation' })).toContainText('1 edit');
  });
});

test('browser storage failures stop edits before transmission and explain the recovery risk', async ({
  browser,
}) => {
  await withSharedHomestead(browser, async (a) => {
    let posts = 0;
    a.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/commands')) posts++;
    });
    const before = await state(a);
    await a.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
      window.__homestead!.store.getState().marketBuy('Food', 1000);
    });
    await expect(a.getByRole('alert')).toContainText('Browser session storage is unavailable');
    await expect(a.getByTestId('shared-save')).toHaveCount(0);
    expect(posts).toBe(0);
    expect(await state(a)).toBe(before);
  });
});


test('shared instructions and primary controls work on laptop and touch tablet layouts', async ({ browser }, testInfo) => {
  await withSharedHomestead(browser, async (a, b) => {
    await a.setViewportSize({ width: 1366, height: 768 });
    for (const page of [a, b]) {
      await expect(page.getByTestId('shared-objective')).toContainText('0/11 quests complete');
      await expect(page.getByTestId('skip-tutorial')).toHaveCount(0);
      await page.getByText('Invite & room rules', { exact: true }).click();
      await expect(page.getByText('Both can manage everything.', { exact: false })).toBeVisible();
      await page.getByText('Your first 10–15 minutes', { exact: true }).click();
      await expect(page.getByText('The full tutorial includes crop growth', { exact: false })).toBeVisible();
      await page.getByText('Invite & room rules', { exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await b.getByTestId('open-market').tap();
    await b.getByTestId('buy-amount-Food').fill('1000');
    await b.getByTestId('buy-Food').tap();
    await expect.poll(() => a.evaluate(() => window.__homestead!.store.getState().game.market?.orders.length)).toBe(1);
    await b.getByRole('button', { name: 'Close market', exact: true }).tap();
    await b.getByTestId('open-work').tap();
    await b.getByTestId('prio-construction-5').tap();
    await b.getByRole('button', { name: 'Close work', exact: true }).tap();
    await b.getByTestId('system-search').fill('Rain Barrel');
    await b.getByRole('button').filter({ hasText: 'Rain Barrel (55 gal)' }).tap();
    await b.getByTestId('choose-buy').tap();
    await b.getByTestId('add-buy').tap();
    await b.getByTestId('drawer-toggle').tap();
    // Finish the drawer animation and its ResizeObserver update before converting map coordinates.
    await expect(b.getByTestId('drawer')).toHaveCSS('height', '44px');
    await expect.poll(() => b.evaluate(() => Math.abs(window.__homestead!.store.getState().viewport.height - document.querySelector('[data-testid=map]')!.getBoundingClientRect().height))).toBeLessThan(1);
    const before = await b.evaluate(() => window.__homestead!.store.getState().game.instances.length);
    const point = await b.evaluate(() => window.__homestead!.worldToClient(25, 25));
    await b.touchscreen.tap(point.x, point.y);
    await expect.poll(() => a.evaluate(() => window.__homestead!.store.getState().game.instances.length)).toBe(before + 1);
    await a.getByRole('button', { name: 'Ready to run', exact: true }).click();
    await b.getByRole('button', { name: 'Ready to run', exact: true }).tap();
    await expect.poll(() => b.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay)).toBeGreaterThan(0);
    await pauseTogether(a, b);
    for (const page of [a, b]) {
      await expect(page.getByTestId('shared-objective')).toContainText('1/11 quests complete');
      await expect(page.getByTestId('quest-title')).toHaveText('Gather a week of firewood from the deadfall');
    }
    await b.screenshot({ path: testInfo.outputPath('mp04-tablet.png') });
    await a.screenshot({ path: testInfo.outputPath('mp04-laptop.png') });
  }, true);
});

test('both browsers display tutorial completion and keep sandbox controls available', async ({ browser }) => {
  await withSharedHomestead(browser, async (a, b) => {
    for (const page of [a, b]) {
      // A completed-room response fixture checks presentation without waiting through a season.
      // Server tests separately verify authoritative progress with retained history.
      await page.route('**/control', async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        const update = await response.json();
        update.revision += 1000;
        update.game.tutorial.current = update.tutorial.total;
        update.tutorial.completed = update.tutorial.total;
        update.tutorial.quest = null;
        await route.fulfill({ response, json: update });
      });
      await page.getByRole('button', { name: 'Pause together', exact: true }).click();
      await expect(page.getByTestId('shared-objective')).toContainText('Tutorial complete together!');
      await expect(page.getByTestId('quest')).toHaveCount(0);
      await page.getByTestId('open-market').click();
      await page.getByTestId('buy-amount-Food').fill('1000');
      await expect(page.getByTestId('buy-Food')).toBeEnabled();
      await page.getByRole('button', { name: 'Close market', exact: true }).click();
    }
  });
});

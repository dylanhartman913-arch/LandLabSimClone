import { expect, test } from '@playwright/test';
import { choose, clickWorld, ofSystem, openApp, shot } from './helpers.ts';

test('card, checklist, why popovers, and flow overlay', async ({ page }) => {
  test.setTimeout(240_000);
  await openApp(page);

  // A small working homestead: a well with its own solar and battery, raised beds, a stove.
  await choose(page, 'rooftop solar', 'S099', 'buy');
  await clickWorld(page, 40, 150);
  await choose(page, 'lifepo4', 'S092', 'buy');
  await clickWorld(page, 70, 140);
  await choose(page, 'well', 'S079', 'buy');
  await clickWorld(page, 150, 60);
  await choose(page, 'raised beds', 'S078', 'buy');
  await clickWorld(page, 140, 150, { shift: true });
  await clickWorld(page, 150, 150, { shift: true });
  await page.keyboard.press('Escape');

  // Open a card from the drawer and switch between Buy and Build it yourself.
  await page.getByTestId('system-search').fill('yurt');
  await page.getByTestId('tile-S056').click();
  const card = page.getByTestId('system-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('choose-buy')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('add-buy')).toBeVisible();
  await shot(page, 'g5', '01-card-buy');
  await page.getByTestId('choose-diy').click();
  await expect(page.getByTestId('choose-diy')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('add-diy')).toContainText('build it yourself');
  await expect(card.getByTestId('card-inputs')).toContainText('Heat');
  await expect(card.getByTestId('card-inputs')).toContainText('need');
  await card.getByRole('button', { name: /Details/ }).click();
  await expect(card.getByTestId('card-details')).toContainText('S056');
  await shot(page, 'g5', '02-card-diy-details');

  // A "why" on a card number shows the formula and the site value it uses.
  await card.getByRole('button', { name: /Heat needed/ }).click();
  const pop = page.getByTestId('why-popover');
  await expect(pop).toBeVisible();
  await expect(page.getByTestId('why-formula')).toContainText('heating degree-days');
  await expect(page.getByTestId('why-assumption-hdd')).toContainText('6,000');
  await shot(page, 'g5', '03-why-card');
  await page.keyboard.press('Escape');
  await page.getByTestId('card-close').click();

  // Run a few weeks so time-mode views have history.
  await page.keyboard.press('3');
  await expect
    .poll(() => page.evaluate(() => window.__homestead!.store.getState().game.ledgers.length), {
      timeout: 20_000,
    })
    .toBeGreaterThan(25);
  await page.keyboard.press(' ');

  // The checklist (N). Average year equals balance mode exactly.
  await page.keyboard.press('n');
  const sheet = page.getByTestId('checklist');
  await expect(sheet).toBeVisible();
  const bal = await page.evaluate(() => window.__homestead!.balance());
  for (const r of bal) {
    expect(Number(await page.getByTestId(`provided-${r.need}`).getAttribute('data-value'))).toBe(r.provided);
    expect(Number(await page.getByTestId(`needed-${r.need}`).getAttribute('data-value'))).toBe(r.needed);
    expect(Number(await page.getByTestId(`pct-${r.need}`).getAttribute('data-value'))).toBe(r.pct);
  }
  await shot(page, 'g5', '04-checklist-average');

  // Every checklist number has a working "why".
  for (const r of bal) {
    for (const col of ['provided', 'needed', 'pct']) {
      await page.getByTestId(`${col}-${r.need}`).click();
      await expect(page.getByTestId('why-formula')).not.toBeEmpty();
      await page.keyboard.press('Escape');
    }
  }
  await page.getByTestId('provided-Food').click();
  await expect(page.getByTestId('why-popover')).toContainText('Raised Beds');
  await shot(page, 'g5', '05-why-food');
  await page.keyboard.press('Escape');

  // Time-mode views.
  await page.getByTestId('mode-season').click();
  await expect(page.getByTestId('checklist-summary')).toContainText('This season');
  await page.getByTestId('pct-Water').click();
  await expect(page.getByTestId('why-formula')).toContainText('delivered');
  await page.keyboard.press('Escape');
  await shot(page, 'g5', '06-checklist-season');
  await page.getByTestId('mode-worst').click();
  await expect(page.getByTestId('checklist-summary')).toContainText('worst week');
  await shot(page, 'g5', '07-checklist-worst-week');
  await expect(page.getByTestId('design-strip')).toContainText('Systems');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // A placed instance's card shows its live satisfaction and what limits it.
  const [bed] = await ofSystem(page, 'S078');
  await clickWorld(page, bed!.x, bed!.y);
  await page.getByTestId('selection-details').click();
  await expect(page.getByTestId('instance-box')).toBeVisible();
  await shot(page, 'g5', '08-instance-card');
  await page.getByTestId('card-close').click();

  // Flow overlay (F) with the legend, then only the selected system's flows.
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await expect(page.getByTestId('flow-legend')).toBeVisible();
  await shot(page, 'g5', '09-flow-overlay');
  await page.getByTestId('flow-labor').check();
  await page.getByTestId('flow-food').uncheck();
  const [well] = await ofSystem(page, 'S079');
  await clickWorld(page, well!.x, well!.y);
  await expect(page.getByTestId('flow-legend')).toContainText('selected system');
  await shot(page, 'g5', '10-flow-overlay-well');
  await page.keyboard.press('f');
  await expect(page.getByTestId('flow-legend')).toBeHidden();
});

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clickWorld, dragWorld, openApp, shot } from './helpers.ts';

async function place(page: Page, systemId: string, x: number, y: number) {
  return page.evaluate(
    ([id, px, py]) => {
      const s = window.__homestead!.store.getState();
      s.startPlacing(id as string, 'prebuilt'); // already standing: unbuilt systems give no shade or roof
      return window.__homestead!.store.getState().placeAt(px as number, py as number).instanceId!;
    },
    [systemId, x, y] as const,
  );
}

const coolingNeeded = (page: Page) => page.getByTestId('needed-Cooled shelter').getAttribute('data-value').then(Number);

test('moving a tree next to a cabin lowers its cooling load, and the why says so', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await place(page, 'S084', 100, 150); // log cabin, on open ground
  const oak = await place(page, 'S065', 175, 195); // oak tree, far away
  await page.keyboard.press('n');
  const far = await coolingNeeded(page);
  await page.keyboard.press('Escape');
  // Drag the oak beside the cabin.
  await dragWorld(page, [175, 195], [100, 185]);
  await expect.poll(() => page.evaluate((id) => window.__homestead!.store.getState().game.instances.find((i) => i.id === id)!.y, oak)).toBeCloseTo(185, 0);
  await clickWorld(page, 100, 185);
  await shot(page, 'g7', '01-tree-by-cabin');
  await page.keyboard.press('n');
  const near = await coolingNeeded(page);
  expect(near).toBeLessThan(far); // the cabin's share drops 10% (the default tent is also a shelter)
  await page.getByTestId('needed-Cooled shelter').click();
  await expect(page.getByTestId('why-popover')).toContainText('Shade trees within 30 ft');
  await expect(page.getByTestId('why-popover')).toContainText('Oak Tree');
  await shot(page, 'g7', '02-why-shade');
});

test('a rain collector links to a roof within 50 ft, and the card lets you choose', async ({ page }) => {
  await openApp(page);
  await place(page, 'S084', 100, 150); // cabin
  await place(page, 'S056', 150, 150); // yurt
  const yurt = await page.evaluate(() => window.__homestead!.store.getState().game.instances.at(-1)!.id);
  const tank = await place(page, 'S024', 100, 115); // rainwater collection
  await page.evaluate((id) => {
    const s = window.__homestead!.store.getState();
    s.openCard('S024', id);
  }, tank);
  const where = page.getByTestId('card-where');
  await expect(where).toContainText('Linked to Log Cabin Kit');
  await page.getByTestId('link-Roofing area').selectOption(yurt);
  await expect(where).toContainText('Linked to Yurt');
  await shot(page, 'g7', '03-roof-link');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => page.evaluate((id) => window.__homestead!.store.getState().game.instances.find((i) => i.id === id)!.links?.['Roofing area'] ?? null, tank))
    .toBeNull();
});

test('the new-game wizard sets up site, parcel, household, and kit', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-saves').click();
  await page.getByTestId('open-wizard').click();
  await expect(page.getByTestId('new-game')).toBeVisible();
  await page.getByTestId('custom-game').click();
  await page.getByTestId('site-asheville-nc').click();
  await page.getByTestId('wizard-acres').selectOption('0.25');
  await page.getByTestId('wizard-children').fill('2');
  await page.getByTestId('kit-suburban').click();
  await shot(page, 'g7', '04-wizard');
  await page.getByTestId('wizard-start').click();
  await expect(page.getByTestId('new-game')).toBeHidden();
  await expect(page.getByTestId('hud')).toContainText('Blue Ridge valley');
  const g = await page.evaluate(() => window.__homestead!.store.getState().game);
  expect(g.settings.parcelAcres).toBe(0.25);
  expect(g.instances.filter((i) => i.scale === 0.6)).toHaveLength(2);
  expect(g.instances.some((i) => i.systemId === 'S007')).toBe(true); // suburban home
  await page.waitForTimeout(300);
  await shot(page, 'g7', '05-asheville-suburban');
});

test('the same design on Laramie and Asheville: heat traced to each site’s degree-days', async ({ page }) => {
  const d = JSON.parse(readFileSync('designs/offgrid-cabin-family.json', 'utf8'));
  const open = async (site: string) => {
    const param = Buffer.from(JSON.stringify({ name: d.name, site, acres: 5, counts: d.counts }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await page.goto(`/?design=${param}`);
    await page.waitForSelector('[data-testid="map"][data-ready="true"]');
    await page.keyboard.press('n');
    const heat = Number(await page.getByTestId('needed-Heated shelter').getAttribute('data-value'));
    await page.getByTestId('needed-Heated shelter').click();
    const hdd = await page.getByTestId('why-assumption-hdd').textContent();
    return { heat, hdd };
  };
  const lar = await open('laramie-wy');
  await shot(page, 'g7', '06-laramie-heat-why');
  const ash = await open('asheville-nc');
  await shot(page, 'g7', '07-asheville-heat-why');
  expect(lar.hdd).toContain('9,140');
  expect(ash.hdd).toContain('3,760');
  expect(lar.heat / ash.heat).toBeGreaterThan(2);
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

const byName = (page: Page, name: string) =>
  page.evaluate((n) => window.__homestead!.store.getState().catalog.systems.find((s) => s.name === n)!.id, name);

/** Place a system prebuilt-equivalent (bought) at a spot through the store, like a click would. */
async function place(page: Page, name: string, x: number, y: number) {
  const id = await byName(page, name);
  const ok = await page.evaluate(
    ([sid, px, py]) => {
      const s = window.__homestead!.store.getState();
      s.startPlacing(sid as string, 'buy');
      const r = window.__homestead!.store.getState().placeAt(px as number, py as number);
      window.__homestead!.store.getState().cancelTool();
      return r.ok;
    },
    [id, x, y] as const,
  );
  expect(ok).toBe(true);
}

async function rainFedLayout(page: Page) {
  await place(page, 'Yurt', 40, 40);
  await place(page, 'Rainwater Collection System + Cistern (550 Gallons)', 40, 70);
  await place(page, 'Raised Beds (24 sq ft)', 160, 160);
}

function cli(args: string[]): string {
  return execFileSync(process.execPath, ['--import', 'tsx', 'packages/cli/src/main.ts', ...args], {
    encoding: 'utf8',
  });
}

test('weather risk in the app and the command line agree to the digit for the same seeds', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await rainFedLayout(page);
  await page.keyboard.press('p');
  await expect(page.getByTestId('plan')).toBeVisible();
  await page.getByTestId('plan-tab-montecarlo').click();
  await page.getByTestId('mc-years').fill('2');
  await page.getByTestId('mc-seeds').fill('6');
  await page.getByTestId('mc-base-seed').fill('11');
  await page.getByTestId('mc-run').click();
  await expect(page.getByTestId('mc-digest')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('mc-progress')).toHaveAttribute('aria-valuenow', '6');
  await shot(page, 'g9', '01-weather-risk');

  // Download the design file the app ran and run the CLI command it shows.
  const dir = mkdtempSync(join(tmpdir(), 'mc-e2e-'));
  const dl = page.waitForEvent('download');
  await page.getByTestId('mc-download-design').click();
  const file = join(dir, (await dl).suggestedFilename());
  await (await dl).saveAs(file);
  const cmd = (await page.getByTestId('mc-cli').textContent())!.trim();
  const args = cmd.replace(/^npm run sim -- /, '').split(/\s+/);
  args[1] = file;
  const out = cli(args);

  const appDigest = (await page.getByTestId('mc-digest').textContent())!.trim();
  expect(out).toContain(appDigest);
  const rows = await page.getByTestId('mc-table').locator('tbody tr').all();
  expect(rows.length).toBeGreaterThan(3);
  for (const r of rows) {
    const cells = (await r.locator('th, td').allTextContents()).slice(0, 6).map((c) => c.trim());
    const line = out.split('\n').find((l) => l.startsWith(`${cells[0]} `))!;
    expect(line.trim().split(/\s{2,}/)).toEqual(cells);
  }
});

test('a long run shows progress and can be cancelled', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('p');
  await page.getByTestId('plan-tab-montecarlo').click();
  await page.getByTestId('mc-years').fill('10');
  await page.getByTestId('mc-seeds').fill('400');
  await page.getByTestId('mc-run').click();
  await expect.poll(async () => Number(await page.getByTestId('mc-progress').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await page.getByTestId('mc-cancel').click();
  await expect(page.getByTestId('mc-run')).toBeVisible();
  const stopped = Number(await page.getByTestId('mc-progress').getAttribute('aria-valuenow'));
  await page.waitForTimeout(1500);
  expect(Number(await page.getByTestId('mc-progress').getAttribute('aria-valuenow'))).toBe(stopped);
  expect(stopped).toBeLessThan(400);
  await expect(page.getByTestId('mc-table')).toHaveCount(0);
});

test('scenarios compare side by side, with the average year and a bad week together', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await rainFedLayout(page);
  await page.keyboard.press('p');
  await page.getByTestId('duplicate-scenario').click();
  await place(page, '500W Photovoltaic Panels', 60, 160);
  await place(page, '500W Photovoltaic Panels', 70, 160);
  await page.getByTestId('duplicate-scenario').click();
  const compare = page.getByTestId('compare');
  await expect(compare.locator('thead th')).toHaveCount(3);
  // Second scenario moves to Asheville.
  await compare.locator('thead th').nth(2).getByLabel('Site').selectOption('asheville-nc');
  const runs = page.getByTestId('scenario-mc');
  await runs.nth(0).click();
  await runs.nth(1).click();
  await expect(page.getByTestId('scenario-mc')).toHaveCount(2, { timeout: 150_000 });
  const water0 = page.getByTestId('cmp-0-Water');
  await expect(water0).toContainText('avg year');
  await expect(water0).toContainText(/\d+% bad week/);
  await expect(page.getByTestId('cmp-1-Water')).toContainText(/\d+% bad week/);
  await expect(compare).toContainText('Days of battery');
  await expect(compare).toContainText('Cash per year');
  // Numbers are explained like everywhere else.
  await page.getByTestId('cmp-0-Water').getByRole('button').first().click();
  await expect(page.getByTestId('why-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await shot(page, 'g9', '02-scenarios');
  // Pinned scenarios survive a reload.
  await page.reload();
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
  await page.keyboard.press('p');
  await expect(page.getByTestId('compare').locator('thead th')).toHaveCount(3);
});

test('sensitivity ranks site numbers and names the flows behind the weakest need', async ({ page }) => {
  await openApp(page);
  await place(page, '500W Photovoltaic Panels', 60, 160);
  await place(page, 'Well', 100, 160);
  await page.keyboard.press('p');
  await page.getByTestId('plan-tab-sensitivity').click();
  await expect(page.getByTestId('tornado').locator('tr')).toHaveCount(9);
  await expect(page.getByTestId('sensitive-flows').locator('tbody tr').first()).toBeVisible();
  await shot(page, 'g9', '03-sensitivity');
});

test('exports: design, flow record, daily CSV, and a picture of the map', async ({ page }) => {
  await openApp(page);
  await rainFedLayout(page);
  await page.evaluate(() => window.__homestead!.store.getState().tick(40));
  await page.keyboard.press('p');
  await page.getByTestId('plan-tab-export').click();
  const grab = async (id: string) => {
    const dl = page.waitForEvent('download');
    await page.getByTestId(id).click();
    const d = await dl;
    const p = join(mkdtempSync(join(tmpdir(), 'exp-')), d.suggestedFilename());
    await d.saveAs(p);
    return { name: d.suggestedFilename(), path: p };
  };
  const design = await grab('export-design');
  const df = JSON.parse(readFileSync(design.path, 'utf8'));
  expect(df.schema).toBe('homestead.design.v1');
  expect(df.layout.length).toBeGreaterThanOrEqual(5);

  const fr = await grab('export-flow-record');
  const records = JSON.parse(readFileSync(fr.path, 'utf8'));
  expect(records[0].schema).toBe('homestead.flow_record.v1');
  expect(records[0].electricity.monthly).toHaveLength(12);

  const csv = await grab('export-csv');
  const lines = readFileSync(csv.path, 'utf8').trim().split('\n');
  expect(lines.length).toBe(41);
  expect(lines[0]).toContain('Water needed');

  const png = await grab('export-png');
  const bytes = readFileSync(png.path);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(5000);
  await shot(page, 'g9', '04-export');

  // The exported design runs in the CLI as-is.
  expect(cli(['run', design.path, '--years', '1'])).toMatch(/Final year: overall/);
});

test('a real-weather game shows the year’s weather and records the draws', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-saves').click();
  await page.getByTestId('open-wizard').click();
  await page.getByTestId('custom-game').click();
  await page.getByTestId('site-laramie-wy').click();
  await page.getByTestId('wizard-weather').selectOption('real');
  await page.getByTestId('kit-tent').click();
  await page.getByTestId('wizard-start').click();
  await expect(page.getByTestId('hud')).toContainText('real weather');
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.setPrefs({ autoPause: { shortage: false, hardship: false, built: false, harvest: false, frost: false, cash: false, season: false } });
    s.tick(400);
  });
  const log = await page.evaluate(() => window.__homestead!.store.getState().game.weatherLog ?? []);
  expect(log.length).toBe(2);
  expect(log[0]!.precipMult).not.toBe(log[1]!.precipMult);
});

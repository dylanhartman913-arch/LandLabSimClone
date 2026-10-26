import { expect, test, type Page } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

async function greenfield(page: Page) {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId('start-greenfield').click();
  await page.getByTestId('start-begin').click();
}

test('LL-58 both crops and exact supplies/work are visible and Show me reaches each build', async ({ page }) => {
  await greenfield(page);
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.loadGame(s.init, s.actions, { ...s.game, tutorial: { ...s.game.tutorial!, current: 2 } });
  });
  await expect(page.getByTestId('quest-title')).toHaveText('Build a raised bed and a potato patch');
  await expect(page.getByTestId('quest')).toContainText('imported free');
  await expect(page.getByTestId('quest-steps')).toContainText('250 lbs Compost');
  await shot(page, 'batch-c', 'planting-instructions');
  for (const name of ['Raised Beds (24 sq ft)', 'Potato Patch (400 sq ft)']) {
    await page.getByRole('button', { name: `Show ${name}`, exact: true }).click();
    await expect(page.getByTestId('system-card')).toContainText(name);
    await page.getByLabel('Close card').click();
  }
  await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    s.loadGame(s.init, s.actions, { ...s.game, tutorial: { ...s.game.tutorial!, current: 5 } });
  });
  await expect(page.getByTestId('quest-steps')).toContainText('Forage greens & berries to 20.0 h/week');
  await expect(page.getByTestId('quest-steps')).toContainText('above 20.0 lbs, top up to 60.0 lbs');
  await expect(page.getByTestId('quest-detail')).toContainText('weekly cap: unset');
});

test('LL-59 forecast headline and deadline age together within the cached week', async ({ page }) => {
  await greenfield(page);
  const alert = page.getByTestId('alert-forecast');
  const summary = alert.locator('summary');
  const title = await summary.locator('strong').textContent();
  const days = Number(title!.match(/about (\d+) days?/)![1]);
  await expect(summary.locator('.chip')).toHaveText(`in about ${days} d`);
  await alert.evaluate((el) => (el as HTMLDetailsElement).open = true);
  await expect(alert).toContainText('(0 days old; refreshes weekly or after an action)');
  const day = await page.evaluate(() => window.__homestead!.store.getState().game.calendar.absDay);
  // Advance inside a weekly bucket: the forecast is cached, not recalculated.
  expect(day % 7).toBeLessThan(6);
  await page.evaluate(() => window.__homestead!.store.getState().tick(1));
  await expect(alert.locator('summary .chip')).toHaveText(`in about ${days - 1} d`);
  await expect(alert.locator('summary strong')).toContainText(`about ${days - 1} days`);
  await alert.evaluate((el) => (el as HTMLDetailsElement).open = true);
  await expect(alert).toContainText(`as of day ${day} (1 day old`);
  await shot(page, 'batch-c', 'cached-forecast');
});

test('fresh Standard greenfield follows the visible action list through winter and verifies its save', async ({ page }) => {
  test.setTimeout(180_000);
  await greenfield(page);
  const seen = new Set<string>();
  for (let day = 0; day < 365; day++) {
    const title = await page.getByTestId('quest-title').count() ? await page.getByTestId('quest-title').textContent() : null;
    if (title && !seen.has(title)) {
      seen.add(title);
      // Read exactly what a player sees; do not import the bot or inspect hidden quest steps.
      const instructions = await page.getByTestId('quest-steps').locator('li').allTextContents();
      for (const instruction of instructions) {
        const text = instruction.replaceAll(',', '').trim();
        const applied = await page.evaluate((text) => {
          const store = window.__homestead!.store;
          const st = store.getState();
          const build = text.match(/^Build (\d+) × (.+) \((DIY|buy)\)/);
          if (build) {
            const system = st.catalog.systems.find((s) => s.name === build[2])!;
            const home = st.game.instances.find((i) => st.catalog.systems.find((s) => s.id === i.systemId)?.name.startsWith('Canvas Wall Tent'))!;
            for (let k = 0; k < Number(build[1]); k++) {
              st.startPlacing(system.id, build[3] === 'DIY' ? 'diy' : 'buy');
              let placed = false;
              for (const radius of [12, 24, 36, 48, 60, 84]) {
                for (const [dx, dy] of [[radius, 0], [0, radius], [-radius, 0], [0, -radius], [radius, radius], [-radius, -radius]]) {
                  if (store.getState().placeAt(home.x + dx!, home.y + dy!).ok) { placed = true; break; }
                }
                if (placed) break;
              }
              store.getState().cancelTool();
              if (!placed) return false;
            }
            return true;
          }
          const buy = text.match(/^Market: buy ([\d.]+) \S+ (.+)\.$/);
          if (buy) return st.marketBuy(buy[2]!, Number(buy[1]));
          const standing = text.match(/^Market: keep (.+) above ([\d.]+) \S+ top up to ([\d.]+)/);
          if (standing) return st.marketStanding(standing[1]!, Number(standing[2]), Number(standing[3]));
          const cap = text.match(/^Work: set (Gather firewood|Forage greens & berries) to ([\d.]+) h\/week/);
          if (cap) {
            st.setGameSettings({ work: { ...st.game.settings.work, caps: { ...st.game.settings.work?.caps, [cap[1] === 'Gather firewood' ? 'gather-wood' : 'gather-food']: Number(cap[2]) } } });
            return true;
          }
          const water = text.match(/(\d+) days of water/), wood = text.match(/(\d+) weeks of firewood/);
          if (text.startsWith('Work: set auto-gather') && (water || wood)) {
            st.setGameSettings({ autoGather: { ...st.game.settings.autoGather, ...(water ? { waterDays: Number(water[1]) } : {}), ...(wood ? { woodWeeks: Number(wood[1]) } : {}) } });
            return true;
          }
          return false;
        }, text);
        expect(applied, instruction).toBe(true);
      }
    }
    await page.evaluate(() => window.__homestead!.store.getState().tick(1));
    const finished = await page.evaluate(() => window.__homestead!.store.getState().game.tutorial!.current === 11);
    if (finished) {
      await page.evaluate((remaining) => window.__homestead!.store.getState().tick(remaining), 364 - day);
      break;
    }
  }
  const result = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    return { done: Object.keys(s.game.tutorial!.done), away: s.game.instances.filter((i) => i.person?.away).length, cash: s.game.cash };
  });
  expect(result.done).toHaveLength(11);
  expect(result.away).toBe(0);
  expect(result.cash).toBeGreaterThan(0);
  if (await page.getByTestId('report').isVisible()) await page.getByLabel('Close report', { exact: true }).click();
  await shot(page, 'batch-c', 'greenfield-after-winter');
  await page.getByTestId('open-saves').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()]);
  await page.getByTestId('import-file').setInputFiles((await download.path())!);
  await expect(page.locator('.toast').filter({ hasText: 'Replay verified' })).toBeVisible();
});

test('mixed-age farm with occupancy stays fed through winter, shows measured use and reloads', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId('start-farm').click();
  await page.getByTestId('start-household').fill('4');
  await page.getByTestId('start-children').fill('3');
  await page.getByTestId('start-begin').click();
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Shelter occupancy', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  await page.evaluate(() => window.__homestead!.store.getState().tick(365));
  if (await page.getByTestId('report').isVisible()) await page.getByLabel('Close report', { exact: true }).click();
  await expect(page.getByTestId('alert-food-runway')).toHaveCount(0);
  const result = await page.evaluate(() => {
    const s = window.__homestead!.store.getState();
    const p = s.game.instances.find((i) => i.person)!;
    s.openCard(p.systemId, p.id);
    return { home: s.game.instances.filter((i) => i.person && !i.person.away).length,
      meals: s.game.ledgers.every((l) => Math.abs(l.needs.Food.needed - l.needs.Food.delivered) < 1e-6),
      shelter: s.game.ledgers.at(-1)!.needs.Shelter.delivered };
  });
  expect(result).toEqual({ home: 7, meals: true, shelter: 1200 });
  await expect(page.getByTestId('card-inputs')).toContainText('yesterday');
  await shot(page, 'batch-c', 'farm-after-winter');
  await page.getByLabel('Close card').click();
  await page.getByTestId('open-saves').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()]);
  await page.getByTestId('import-file').setInputFiles((await download.path())!);
  await expect(page.locator('.toast').filter({ hasText: 'Replay verified' })).toBeVisible();
});

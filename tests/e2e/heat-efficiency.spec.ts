import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a liner on the camp’s canvas tent cuts its heat need and the checklist reports hot water as comfort', async ({
  page,
}) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const store = window.__homestead!.store;
    const systems = store.getState().catalog.systems;
    const tentSys = systems.find((s) => s.name === 'Bell Tent')!;
    const tent = store.getState().game.instances.find((i) => i.systemId === tentSys.id);
    if (!tent) throw new Error('The default camp has no bell tent');
    const game = store.getState().game;
    store.setState({ game: { ...game, settings: { ...game.settings, wellbeingMult: 0 } } });
    store.getState().tick(1);
    const before = store.getState().game.lastDay;
    const key = Object.keys(before).find((k) => k.startsWith(`${tentSys.id}|`))!;
    const need = before[key]!.inputs.Heat?.requested ?? 0;
    const liner = systems.find((s) => s.name === 'Canvas Tent Winter Liner')!;
    store.getState().startPlacing(liner.id, 'prebuilt');
    const placed = store.getState().placeAt(tent.x, tent.y);
    if (!placed.ok) throw new Error(placed.reason ?? 'Cannot place liner');
    store.getState().tick(1);
    const after = store.getState().game.lastDay;
    const key2 = Object.keys(after).find((k) => k.startsWith(`${tentSys.id}|`))!;
    return { need, lined: after[key2]!.inputs.Heat?.requested ?? 0 };
  });
  // Early-April nights still need heat; the liner scales whatever the tent needs.
  expect(result.need).toBeGreaterThan(0);
  expect(result.lined / result.need).toBeLessThan(0.8);
  await page.getByTestId('open-checklist').click();
  await expect(page.getByTestId('comfort-hot-water')).toContainText('Hot water (comfort, not scored)');
  await expect(page.getByTestId('checklist-table')).not.toContainText('Hot water');
  await page.evaluate(() => window.__homestead!.store.setState({ toasts: [] }));
  await shot(page, 'll-45', 'hot-water-comfort');
});

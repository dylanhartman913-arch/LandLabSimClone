import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('assign residents, close an empty shelter, and reopen it without moving the household automatically', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  await expect(page.getByLabel('Shelter occupancy', { exact: true })).not.toBeChecked();
  await page.getByLabel('Shelter occupancy', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const ids = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const tent = st.catalog.systems.find((s) => s.name === 'Bell Tent')!;
    st.startPlacing(tent.id, 'prebuilt');
    const placed = window.__homestead!.store.getState().placeAt(30, 30);
    if (!placed.ok || !placed.instanceId) throw new Error('Cannot place spare tent');
    const game = window.__homestead!.store.getState().game;
    const person = game.instances.find((i) => i.person)!;
    const original = game.instances.find((i) => i.systemId === tent.id && i.id !== placed.instanceId)!;
    st.openCard(tent.id, placed.instanceId);
    return { spare: placed.instanceId, original: original.id, person: person.id, personSystem: person.systemId, tentSystem: tent.id };
  });
  await expect(page.getByTestId('shelter-occupancy')).toContainText('No residents assigned.');
  await page.getByRole('button', { name: 'Close empty shelter', exact: true }).click();
  await expect(page.getByTestId('shelter-occupancy')).toContainText('Closed');
  await expect(page.getByTestId('shelter-occupancy')).toContainText('10%');
  await shot(page, 'll-32', 'closed-spare-shelter');
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.personSystem, ids.person), ids);
  await expect(page.getByLabel('Resident shelter')).toHaveValue(ids.original);
  await expect(page.getByLabel('Resident shelter').locator(`option[value="${ids.spare}"]`)).toHaveCount(0);
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.tentSystem, ids.spare), ids);
  await page.getByRole('button', { name: 'Reopen shelter', exact: true }).click();
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.personSystem, ids.person), ids);
  await page.getByLabel('Resident shelter').selectOption(ids.spare);
  await expect(page.getByLabel('Resident shelter')).toHaveValue(ids.spare);
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.tentSystem, ids.spare), ids);
  await expect(page.getByRole('button', { name: 'Close empty shelter', exact: true })).toBeDisabled();
  await expect(page.getByTestId('shelter-occupancy')).toContainText(ids.person);
  await page.evaluate(() => window.__homestead!.store.getState().tick(2));
  await expect(page.getByTestId('shelter-occupancy')).toContainText('Yesterday’s heat:');
  await shot(page, 'll-32', 'occupied-shelter');
  const actions = await page.evaluate(() => window.__homestead!.store.getState().actions);
  expect(actions.some((a) => a.kind === 'assignShelter' && a.id === ids.person && a.shelterId === ids.spare)).toBe(true);
  expect(actions.filter((a) => a.kind === 'closeShelter')).toHaveLength(2);
});

test('LL-52: enabling occupancy uses both four-adult starter tents and survives a save reload', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__homestead!.store.getState().setWizard(true));
  await page.getByTestId('start-greenfield').click();
  await page.getByTestId('start-household').fill('4');
  await page.getByTestId('start-begin').click();
  await page.getByTestId('open-settings').click();
  await page.getByLabel('Shelter occupancy', { exact: true }).check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const assignments = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const homes = st.game.instances.filter((i) => i.person).map((i) => i.shelterId);
    st.loadGame(st.init, st.actions, JSON.parse(JSON.stringify(st.game)));
    return { homes, loaded: window.__homestead!.store.getState().game.instances.filter((i) => i.person).map((i) => i.shelterId) };
  });
  expect(assignments.homes.every(Boolean)).toBe(true);
  expect(new Set(assignments.homes).size).toBe(2);
  expect(assignments.loaded).toEqual(assignments.homes);
});

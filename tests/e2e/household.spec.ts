import { expect, test } from '@playwright/test';
import { openApp, shot } from './helpers.ts';

test('a person can be made a child: needs and work follow the role, and skills grow with practice', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-settings').click();
  const toggle = page.getByLabel('Household roles, skills and health', { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel('Close settings', { exact: true }).click();
  const ids = await page.evaluate(() => {
    const st = window.__homestead!.store.getState();
    const people = st.game.instances.filter((i) => i.person);
    st.openCard(people[1]!.systemId, people[1]!.id);
    return { child: people[1]!.id, adult: people[0]!.id, system: people[0]!.systemId };
  });
  const box = page.getByTestId('household-role');
  await expect(page.getByLabel('Household role')).toHaveValue('adult');
  await page.getByLabel('Household role').selectOption('child');
  await expect(page.getByLabel('Household role')).toHaveValue('child');
  await expect(box).toContainText('Needs 70%');
  await expect(box).toContainText('25%');
  const actions = await page.evaluate(() => window.__homestead!.store.getState().actions);
  expect(actions.some((a) => a.kind === 'role' && a.id === ids.child && a.role === 'child')).toBe(true);
  // A week of fetching water builds gathering practice for the adult.
  await page.evaluate(() => window.__homestead!.store.getState().setGameSettings({ autoGather: { waterDays: 3 } }));
  await page.evaluate(() => window.__homestead!.store.getState().tick(7));
  await page.evaluate((ids) => window.__homestead!.store.getState().openCard(ids.system, ids.adult), ids);
  await expect(page.getByLabel('Household role')).toHaveValue('adult');
  const practiced = await page.evaluate((ids) => {
    const p = window.__homestead!.store.getState().game.instances.find((i) => i.id === ids.adult)!.person!;
    return (p.skills?.building ?? 0) + (p.skills?.growing ?? 0) + (p.skills?.gathering ?? 0);
  }, ids);
  expect(practiced).toBeGreaterThan(0);
  await expect(box).toContainText('Gathering (more per hour)');
  await shot(page, 'll-36', 'person-card');
});

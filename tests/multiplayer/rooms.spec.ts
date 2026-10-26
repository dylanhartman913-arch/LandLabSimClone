import { test, expect } from '@playwright/test';

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

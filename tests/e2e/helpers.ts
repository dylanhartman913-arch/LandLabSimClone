import { expect, type Page } from '@playwright/test';

export interface InstanceLite {
  id: string;
  systemId: string;
  x: number;
  y: number;
  status: string;
}

export async function openApp(page: Page) {
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await page.waitForSelector('[data-testid="map"][data-ready="true"]');
}

export async function instances(page: Page): Promise<InstanceLite[]> {
  return page.evaluate(() =>
    window.__homestead!.store.getState().game.instances.map((i) => ({
      id: i.id,
      systemId: i.systemId,
      x: i.x,
      y: i.y,
      status: i.status,
    })),
  );
}

export async function ofSystem(page: Page, systemId: string) {
  return (await instances(page)).filter((i) => i.systemId === systemId);
}

export async function client(page: Page, x: number, y: number) {
  return page.evaluate(([wx, wy]) => window.__homestead!.worldToClient(wx!, wy!), [x, y]);
}

export async function clickWorld(page: Page, x: number, y: number, opts: { shift?: boolean } = {}) {
  const p = await client(page, x, y);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (opts.shift) await page.keyboard.up('Shift');
}

export async function dragWorld(
  page: Page,
  from: [number, number],
  to: [number, number],
  opts: { shift?: boolean } = {},
) {
  const a = await client(page, ...from);
  const b = await client(page, ...to);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++)
    await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
}

/** Search the drawer, open the system's card, and choose Buy or Build it yourself. */
export async function choose(page: Page, query: string, systemId: string, mode: 'buy' | 'diy' = 'buy') {
  await page.getByTestId('system-search').fill(query);
  await page.getByTestId(`tile-${systemId}`).click();
  await expect(page.getByTestId('system-card')).toBeVisible();
  await page.getByTestId(mode === 'buy' ? 'add-buy' : 'add-diy').click();
  await expect(page.getByTestId('status')).toContainText('Placing');
}

export async function cash(page: Page): Promise<number> {
  return page.evaluate(() => window.__homestead!.store.getState().game.cash);
}

export async function shot(page: Page, session: string, name: string) {
  await page.mouse.move(5, 300); // keep tooltips out of the way
  await page.waitForTimeout(150);
  await page.screenshot({ path: `docs/screenshots/${session}/${name}.png` });
}

import { expect, test } from '@playwright/test';

type TankyWindow = Window & {
  __tanky?: { scene: { state: { tick: number; tanks: { x: number; y: number }[] }; stats: { summary(): { fps: number } } } };
};

test('menu → match → move with keyboard → pause/resume', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible();
  await page.screenshot({ path: 'e2e/out/01-menu.png' });
  await page.getByTestId('play').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => ((window as TankyWindow).__tanky?.scene.state.tick ?? 0) > 30);
  const before = await page.evaluate(() => ({ ...(window as TankyWindow).__tanky!.scene.state.tanks[0] }));
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  const after = await page.evaluate(() => ({ ...(window as TankyWindow).__tanky!.scene.state.tanks[0] }));
  // screen-right = world (+x, -y)
  expect(after.x).toBeGreaterThan(before.x + 0.3);
  expect(after.y).toBeLessThan(before.y - 0.3);
  await page.screenshot({ path: 'e2e/out/02-game.png' });

  await page.getByTestId('pause').click();
  await expect(page.getByTestId('resume')).toBeVisible();
  const t1 = await page.evaluate(() => (window as TankyWindow).__tanky!.scene.state.tick);
  await page.waitForTimeout(400);
  const t2 = await page.evaluate(() => (window as TankyWindow).__tanky!.scene.state.tick);
  expect(t2).toBe(t1);
  await page.getByTestId('resume').click();
  await page.waitForFunction((t) => (window as TankyWindow).__tanky!.scene.state.tick > t + 10, t2);
  await page.getByTestId('pause').click();
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('play')).toBeVisible();
  expect(errors).toEqual([]);
});

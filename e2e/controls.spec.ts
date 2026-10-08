import { expect, test, type CDPSession, type Page } from '@playwright/test';

type Tank = { x: number; y: number; charging: boolean; chargeT: number; cooldown: number; alive: boolean; hp: number };
type TankyWindow = Window & { __tanky?: { scene: { state: { tick: number; tanks: Tank[]; shells: unknown[] }; touch: { state: { fire: boolean; ability: boolean; moveX: number; moveY: number } } } } };

interface Pt {
  x: number;
  y: number;
  id: number;
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
  });
}

const tank0 = (page: Page): Promise<Tank> => page.evaluate(() => ({ ...(window as TankyWindow).__tanky!.scene.state.tanks[0] }));

test('multi-touch: joystick + charged fire + ability at the same time', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?silent');
  await page.getByTestId('play').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => ((window as TankyWindow).__tanky?.scene.state.tick ?? 0) > 30);
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const fireBox = (await page.getByTestId('fire').boundingBox())!;
  const abilityBox = (await page.getByTestId('ability').boundingBox())!;
  const fire = { x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 2 };
  const ability = { x: abilityBox.x + abilityBox.width / 2, y: abilityBox.y + abilityBox.height / 2, id: 3 };
  const joy = { x: vp.width * 0.18, y: vp.height * 0.65, id: 1 };

  const before = await tank0(page);
  // 1) thumb down on the left, drag to the right (screen right = world +x,-y)
  await touch(cdp, 'touchStart', [joy]);
  for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', [{ ...joy, x: joy.x + k * 12 }]);
  // 2) second finger holds FIRE while still driving
  await touch(cdp, 'touchStart', [{ ...joy, x: joy.x + 72 }, fire]);
  // 3) third finger presses ABILITY at the same time
  await touch(cdp, 'touchStart', [{ ...joy, x: joy.x + 72 }, fire, ability]);
  const flags = await page.evaluate(() => ({ ...(window as TankyWindow).__tanky!.scene.touch.state }));
  expect(flags.fire).toBe(true);
  expect(flags.ability).toBe(true);
  // charge while moving; wait on simulation time (the GPU-less runner renders slowly, so wall time is meaningless)
  await page.waitForFunction(() => (window as TankyWindow).__tanky!.scene.state.tanks[0].chargeT > 0.9, null, { timeout: 30_000 });
  const mid = await tank0(page);
  expect(mid.charging).toBe(true);
  expect(mid.chargeT).toBeGreaterThan(0.6);
  expect(mid.x - before.x).toBeGreaterThan(0.4);
  expect(before.y - mid.y).toBeGreaterThan(0.4);
  await page.screenshot({ path: 'e2e/out/03-charging.png' });
  // release ability then fire (joystick still held)
  await touch(cdp, 'touchEnd', [{ ...joy, x: joy.x + 72 }, fire]);
  await touch(cdp, 'touchEnd', [{ ...joy, x: joy.x + 72 }]);
  await page.waitForFunction(() => !(window as TankyWindow).__tanky!.scene.state.tanks[0].charging, null, { timeout: 10_000 });
  const after = await tank0(page);
  expect(after.charging).toBe(false);
  expect(after.cooldown).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'e2e/out/04-fired.png' });
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(1500);
  const stopped = await page.evaluate(() => ({ ...(window as TankyWindow).__tanky!.scene.touch.state }));
  expect(Math.abs(stopped.moveX) + Math.abs(stopped.moveY)).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

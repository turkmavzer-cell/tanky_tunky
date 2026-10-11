import { startMatch } from './helpers';
import { expect, test, type CDPSession, type Page } from '@playwright/test';

type Tank = { x: number; y: number; charging: boolean; chargeT: number; cooldown: number; overheat: number; alive: boolean; hp: number; ability: { active: number } };
type TankyWindow = Window & { __tanky?: { scene: { state: { tick: number; nextId: number; tanks: Tank[]; shells: unknown[] }; touch: { state: { fire: boolean; ability: boolean; moveX: number; moveY: number } } } } };

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
  await startMatch(page, 'silent');
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
  // (the ability is Swift → charge time halves; release before the overheat window, screenshots take sim time)
  await page.waitForFunction(() => (window as TankyWindow).__tanky!.scene.state.tanks[0].chargeT > 0.45, null, { timeout: 30_000, polling: 'raf' });
  const mid = await tank0(page);
  const idBefore = await page.evaluate(() => (window as TankyWindow).__tanky!.scene.state.nextId);
  // release ability then fire (joystick still held)
  await touch(cdp, 'touchEnd', [{ ...joy, x: joy.x + 72 }, fire]);
  await touch(cdp, 'touchEnd', [{ ...joy, x: joy.x + 72 }]);
  expect(mid.charging).toBe(true);
  expect(mid.chargeT).toBeGreaterThan(0.45);
  await page.screenshot({ path: 'e2e/out/03-charging.png' });
  await page.waitForFunction(() => !(window as TankyWindow).__tanky!.scene.state.tanks[0].charging, null, { timeout: 10_000 });
  const after = await tank0(page);
  expect(after.charging).toBe(false);
  expect(after.overheat).toBe(0);
  // a shell was created on release (sim ids are allocated per shell/mine)
  expect(await page.evaluate(() => (window as TankyWindow).__tanky!.scene.state.nextId)).toBeGreaterThan(idBefore);
  // the ability (Swift for the default class) was triggered by the third finger
  expect(mid.ability.active).toBeGreaterThan(0);
  await page.screenshot({ path: 'e2e/out/04-fired.png' });
  const moved = await tank0(page);
  expect(moved.x - before.x).toBeGreaterThan(0.4);
  expect(before.y - moved.y).toBeGreaterThan(0.4);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(1500);
  const stopped = await page.evaluate(() => ({ ...(window as TankyWindow).__tanky!.scene.touch.state }));
  expect(Math.abs(stopped.moveX) + Math.abs(stopped.moveY)).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

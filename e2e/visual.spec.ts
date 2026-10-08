import { expect, test } from '@playwright/test';

type TankyWindow = Window & { __tanky?: { scene: { state: { tick: number; map: { width: number; bases: { x: number; y: number }[] } } } } };

/** Visual QA: fixed camera shots of map landmarks (river/bridge centre, base, plateau). Inspect e2e/out/visual-*.png. */
for (const [name, query] of [
  ['center', 'map=64&seed=3&view=32,32&zoom=0.45'],
  ['base', 'map=64&seed=3&view=7,7&zoom=0.6'],
  ['wide', 'map=40&seed=11&view=20,20&zoom=0.3'],
] as const) {
  test(`visual: ${name}`, async ({ page }) => {
    await page.goto(`/?silent&${query}`);
    await page.getByTestId('play').click();
    await page.getByTestId('start').click();
    await page.waitForFunction(() => ((window as TankyWindow).__tanky?.scene.state.tick ?? 0) > 20);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `e2e/out/visual-${name}.png` });
    expect(true).toBe(true);
  });
}

test('visual: combat (charged shot hits an enemy)', async ({ page }) => {
  await page.goto('/?silent&map=40&seed=11&cls=heavy&bots=idle');
  await page.getByTestId('play').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => ((window as TankyWindow).__tanky?.scene.state.tick ?? 0) > 20);
  // place enemy 2 just in front of the player on open ground and aim at it
  await page.evaluate(() => {
    type M = { width: number; feature: Uint8Array; elev: Uint8Array; flags: Uint8Array; version: number };
    const sc = (window as unknown as { __tanky: { scene: { worldView: { invalidate(): void }; state: { map: M; tanks: { x: number; y: number }[] } } } }).__tanky.scene;
    const st = sc.state;
    const me = st.tanks[0];
    const e = st.tanks[2];
    // clear a firing lane: no features/elevation within 4 tiles of the player
    for (let y = Math.floor(me.y) - 4; y <= Math.floor(me.y) + 4; y++)
      for (let x = Math.floor(me.x) - 4; x <= Math.floor(me.x) + 4; x++) {
        if (x < 0 || y < 0 || x >= st.map.width || y >= st.map.width) continue;
        const i = y * st.map.width + x;
        st.map.feature[i] = 0;
        st.map.elev[i] = 0;
        st.map.flags[i] = 0;
      }
    st.map.version++;
    sc.worldView.invalidate();
    // screen-right of the player = world (+x, -y)
    e.x = me.x + 2.1;
    e.y = me.y - 2.1;
  });
  await page.mouse.move(780, 190);
  await page.keyboard.down('Space');
  type T = { __tanky: { scene: { state: { tanks: { chargeT: number; fullT: number; hp: number }[] } } } };
  await page.waitForFunction(() => (window as unknown as T).__tanky.scene.state.tanks[0].chargeT > 1.4, null, { timeout: 30_000 });
  await page.screenshot({ path: 'e2e/out/visual-charging.png' });
  // release inside the perfect window (screenshots take sim time, so release first)
  await page.waitForFunction(() => (window as unknown as T).__tanky.scene.state.tanks[0].fullT > 0, null, { timeout: 30_000, polling: 'raf' });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => (window as unknown as T).__tanky.scene.state.tanks[2].hp < 120, null, { timeout: 30_000, polling: 'raf' });
  await page.screenshot({ path: 'e2e/out/visual-combat-hit.png' });
});

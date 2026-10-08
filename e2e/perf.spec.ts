import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

type TankyWindow = Window & { __tanky?: { scene: { state: { tick: number }; stats: { reset(): void; summary(): Record<string, number> } } } };

/**
 * Performance gate (brief §10.4): 96×96 map, CPU throttled 4x, bots fighting, player driving.
 * The cloud runner has no GPU (SwiftShader), so the backbuffer is reduced to 0.25 resolution to
 * normalise fill rate (same world view) — see docs/PERF.md. Gate: p95 frame < 22 ms.
 */
test('perf gate: 96x96 map at CPU 4x throttle', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?silent&map=96&seed=7&renderScale=0.25');
  await page.getByTestId('play').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => ((window as TankyWindow).__tanky?.scene.state.tick ?? 0) > 30);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // drive around and fire
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  let k = 0;
  const driver = setInterval(() => {
    void page.keyboard.up(keys[k % 4]);
    k++;
    void page.keyboard.down(keys[k % 4]);
    void page.keyboard.press('Space');
  }, 700);
  await page.waitForTimeout(3000);
  await page.evaluate(() => (window as TankyWindow).__tanky!.scene.stats.reset());
  await page.waitForTimeout(10_000);
  clearInterval(driver);
  const s = await page.evaluate(() => (window as TankyWindow).__tanky!.scene.stats.summary());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  mkdirSync('e2e/out', { recursive: true });
  writeFileSync('e2e/out/perf.json', JSON.stringify(s, null, 2));
  await page.screenshot({ path: 'e2e/out/05-perf-96.png' });
  console.log('PERF', JSON.stringify(s));
  expect(s.frames).toBeGreaterThan(200);
  expect(s.frameP95).toBeLessThan(22);
});

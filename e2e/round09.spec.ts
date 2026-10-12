import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Round-09 screenshots → docs/screens/round-09/: tall towers, build button + built tower, minimap hides enemies. */
const OUT = 'docs/screens/round-09';
mkdirSync(OUT, { recursive: true });

type T = { x: number; y: number; hp: number; alive: boolean; cls: string; team: number; protect: number; hull: number; buildCd: number; reserve: boolean };
type W = Window & { __tanky: { scene: { state: { tanks: T[]; match: { phase: string } } } } };
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const playing = (page: Page): Promise<unknown> => page.waitForFunction(() => (window as unknown as W).__tanky?.scene.state.match.phase === 'playing', null, { timeout: 60_000 });

const startMission = async (page: Page, qs: string, cls: string): Promise<void> => {
  await page.goto(`/?silent${qs}`);
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await page.getByTestId('play-m1').click();
  await page.getByTestId(`class-${cls}`).click();
  await page.getByTestId('start').click();
  await playing(page);
};

test.describe.configure({ mode: 'serial' });

test('01 tall towers next to the player (top lane) + build button visible', async ({ page }) => {
  await startMission(page, '&bots=idle', 'standard');
  await expect(page.getByTestId('build')).toBeVisible();
  await page.evaluate(() => {
    const s = (window as unknown as W).__tanky.scene.state;
    const tw = s.tanks.find((t) => t.cls === 'tower' && t.team === 0 && !t.reserve)!;
    const me = s.tanks[0];
    me.x = tw.x + 4;
    me.y = tw.y + 2;
    me.protect = 99;
  });
  await page.waitForTimeout(1500);
  await shot(page, '01-tower-and-button');
});

test('02 build a tower with the button; a second press shows the cooldown message', async ({ page }) => {
  await startMission(page, '&bots=idle', 'standard');
  await page.evaluate(() => {
    const s = (window as unknown as W).__tanky.scene.state;
    const me = s.tanks[0];
    me.x = 14.5;
    me.y = 70.5; // lane south of the base, own zone
    me.hull = -Math.PI / 2;
    me.protect = 99;
  });
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks.filter((t) => t.reserve && t.alive).length);
  await page.getByTestId('build').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 5, bubbles: true });
  const count = (): Promise<number> => page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks.filter((t) => t.reserve && t.alive).length);
  await expect.poll(count, { timeout: 20_000 }).toBe(before + 1); // slow CI frame rates: hold until the sim has sampled the press
  await page.dispatchEvent('body', 'pointerup', { pointerType: 'touch', pointerId: 5, bubbles: true });
  await page.waitForTimeout(800);
  await shot(page, '02-built');
  await page.getByTestId('build').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 6, bubbles: true });
  await expect(page.getByTestId('build-msg')).toBeVisible({ timeout: 15_000 }); // headless runs ~5 fps: the press is sampled a few frames later
  await shot(page, '03-cooldown-msg');
  await page.dispatchEvent('body', 'pointerup', { pointerType: 'touch', pointerId: 6, bubbles: true });
});

test('03 minimap hides enemies until they come near one of our towers', async ({ page }) => {
  await startMission(page, '&bots=idle', 'standard');
  await page.waitForTimeout(800);
  await shot(page, '04-minimap-hidden');
  await page.evaluate(() => {
    const s = (window as unknown as W).__tanky.scene.state;
    const tw = s.tanks.find((t) => t.cls === 'tower' && t.team === 0 && !t.reserve)!;
    const foe = s.tanks.find((t) => t.team === 1 && t.cls !== 'tower' && t.cls !== 'hq')!;
    foe.x = tw.x + 5;
    foe.y = tw.y + 1;
  });
  await page.waitForTimeout(600);
  await shot(page, '05-minimap-enemy-near-tower');
});

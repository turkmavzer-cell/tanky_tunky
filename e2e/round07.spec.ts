import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startMatch } from './helpers';

/** Round-07 screenshots → docs/screens/round-07/: charged-shot specials (Heavy laser + shock, Standard pierce, Artillery fire). */
const OUT = 'docs/screens/round-07';
mkdirSync(OUT, { recursive: true });

type T = { x: number; y: number; hp: number; team: number; protect: number; alive: boolean };
type W = Window & { __tanky: { scene: { state: { tick: number; tanks: T[]; fires: unknown[]; shells: { special: string }[] } } } };
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const ticks = async (page: Page, n: number): Promise<void> => {
  const t0 = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tick);
  await page.waitForFunction((t) => (window as unknown as W).__tanky.scene.state.tick > t, t0 + n, { timeout: 60_000 });
};
/** Puts the enemies in a cluster `dx` tiles to the +x/+y diagonal of the player, protection off. */
const stage = (page: Page, dx: number): Promise<void> =>
  page.evaluate((d) => {
    const st = (window as unknown as W).__tanky.scene.state;
    const me = st.tanks[0];
    let k = 0;
    for (const t of st.tanks) {
      t.protect = 0;
      if (t.team === 0 && t !== me) {
        t.x = me.x - 3;
        t.y = me.y - 3 - k;
      }
      if (t.team === 1) {
        t.x = me.x + d + (k % 2) * 0.9;
        t.y = me.y + d + Math.floor(k / 2) * 0.9;
        k++;
      }
    }
    // clear any crate/wall on the diagonal so the shot has a free line (staged screenshot)
    const m = (st as unknown as { map: { width: number; feature: Uint8Array; version: number } }).map;
    for (let i = 1; i < d + 1; i++) for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) m.feature[Math.floor(me.y + i + oy) * m.width + Math.floor(me.x + i + ox)] = 0;
    m.version++;
  }, dx);

test.describe.configure({ mode: 'serial' });

test('01 tank cards show the charged special', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('play').click();
  await page.getByTestId('class-heavy').click();
  await expect(page.locator('.tank-card.on [data-testid="card-charged"]')).toContainText('şok dalgası');
  await page.waitForTimeout(400);
  await shot(page, '01-card-heavy');
  await page.getByTestId('class-artillery').click();
  await expect(page.locator('.tank-card.on [data-testid="card-charged"]')).toContainText('ateş alanı');
  await page.getByTestId('class-standard').click();
  await expect(page.locator('.tank-card.on [data-testid="card-charged"]')).toContainText('delici');
});

test('02 Heavy: laser shot + shock wave', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&map=40&seed=21&bots=idle', 'heavy');
  await stage(page, 3.2);
  await ticks(page, 10);
  await page.keyboard.down('Space');
  await ticks(page, 140);
  await page.keyboard.up('Space');
  await ticks(page, 1);
  await shot(page, '02-heavy-laser');
  await ticks(page, 8);
  await shot(page, '03-heavy-shock');
  const hurt = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks.filter((t) => t.team === 1 && t.hp < 3000).length);
  expect(hurt).toBeGreaterThanOrEqual(2); // hit tank + at least one shock victim
});

test('03 Artillery: burning patch', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&map=40&seed=21&bots=idle', 'artillery');
  await stage(page, 5);
  await ticks(page, 10);
  await page.keyboard.down('Space');
  await ticks(page, 112);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => (window as unknown as W).__tanky.scene.state.fires.length > 0, null, { timeout: 20_000 });
  await ticks(page, 30);
  await shot(page, '04-artillery-fire');
});

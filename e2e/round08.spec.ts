import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Round-08 screenshots → docs/screens/round-08/: lane mission map (owner reference), route arrow, upgrades only in missions. */
const OUT = 'docs/screens/round-08';
mkdirSync(OUT, { recursive: true });

type W = Window & { __tanky: { scene: { hqId: number; state: { map: { feature: Uint8Array; width: number }; tanks: { x: number; y: number; hp: number; boost: { hp: number }; protect: number }[]; match: { phase: string } } } } };
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const SAVE = { schemaVersion: 6, parts: 0, perks: { heavy: 3 }, garage: { heavy: { armor: 2, engine: 0, gun: 0 } } };
const seedSave = (page: Page): Promise<void> =>
  page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tanky.save', JSON.stringify(s));
      sessionStorage.setItem('seeded', '1');
    }
  }, SAVE);
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

test('01 lane mission: start base + overview of the map', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await expect(page.getByTestId('level-m1')).toContainText('Üç Yol');
  await page.getByTestId('play-m1').click();
  await page.getByTestId('class-standard').click();
  await page.getByTestId('start').click();
  await playing(page);
  await expect(page.getByTestId('hq-arrow')).toBeVisible();
  await shot(page, '01-start');
  // the whole maze from above (camera override through the debug hook is not exposed: use a wide zoom page load)
  await startMission(page, '&view=48,48&zoom=0.2&bots=idle', 'standard');
  await page.waitForTimeout(1200);
  await shot(page, '02-mid-river');
});

test('02 top lane view: wood walls with jungle openings', async ({ page }) => {
  await startMission(page, '&bots=idle', 'heavy');
  await page.evaluate(() => {
    const me = (window as unknown as W).__tanky.scene.state.tanks[0];
    me.x = 8.5; // top lane, then the jungle entrance
    me.y = 50.5;
    me.protect = 99;
  });
  await page.waitForTimeout(1200);
  await shot(page, '03-lane');
});

test('03 upgrades apply in missions only; Quick Match tanks are equal', async ({ page }) => {
  await seedSave(page);
  // mission: boost active
  await startMission(page, '', 'heavy');
  const mission = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].boost.hp);
  expect(mission).toBeGreaterThan(1);
  // Quick Match: neutral
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('play').click();
  await page.getByTestId('class-heavy').click();
  await page.getByTestId('start').click();
  await playing(page);
  const quick = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].boost.hp);
  expect(quick).toBe(1);
});

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Round-05 deliverable screenshots → docs/screens/round-05/ (campaign + garage; inspected by hand, see PROGRESS.md). */
const OUT = 'docs/screens/round-05';
mkdirSync(OUT, { recursive: true });

type T = { x: number; y: number; hp: number; team: number; cls: string; alive: boolean; protect: number };
type W = Window & { __tanky: { scene: { hqId: number; state: { tick: number; tanks: T[]; match: { phase: string }; map: { feature: Uint8Array; width: number } } } } };

const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const seedSave = (page: Page, save: object): Promise<void> =>
  page.addInitScript((s) => localStorage.setItem('tanky.save', JSON.stringify(s)), { schemaVersion: 5, ...save });

test.describe.configure({ mode: 'serial' });

test('01 solo menu: campaign + garage enabled, credits shown', async ({ page }) => {
  await seedSave(page, { credits: 340 });
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await expect(page.getByTestId('campaign')).toBeEnabled();
  await expect(page.getByTestId('garage')).toBeEnabled();
  await expect(page.getByTestId('credits')).toContainText('340');
  await shot(page, '01-solo-menu');
});

test('02 campaign list: the maze mission is open', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await expect(page.getByTestId('play-m1')).toBeEnabled();
  await expect(page.locator('.level-card')).toHaveCount(1);
  await shot(page, '02-campaign-new');
});

test('03 campaign list with progress', async ({ page }) => {
  await seedSave(page, { credits: 420, campaign: { stars: { m1: 3 }, bestTime: { m1: 241 } } });
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await expect(page.getByTestId('level-m1').locator('.stars i.on')).toHaveCount(3);
  await shot(page, '03-campaign-progress');
});

test('04 garage: buy an upgrade, credits go down, pips fill', async ({ page }) => {
  await seedSave(page, { credits: 500 });
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('garage').click();
  await page.getByTestId('buy-heavy-armor').click();
  await expect(page.getByTestId('credits')).toContainText('350');
  await expect(page.getByTestId('garage-heavy').locator('.pips i.on')).toHaveCount(1);
  await page.getByTestId('buy-heavy-armor').click(); // 300 > 350? no: 350 - 300 = 50
  await expect(page.getByTestId('credits')).toContainText('50');
  await expect(page.getByTestId('buy-scout-gun')).toBeDisabled();
  await shot(page, '04-garage');
  // persisted
  await page.reload();
  await page.getByTestId('solo').click();
  await expect(page.getByTestId('credits')).toContainText('50');
});

test('05 mission 1: objective HUD, HQ arrow, structures on the map', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await page.getByTestId('play-m1').click();
  await expect(page.getByTestId('map-theme')).toHaveCount(0); // level fixes the map
  await page.getByTestId('class-heavy').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as unknown as W).__tanky?.scene.state.match.phase === 'playing', null, { timeout: 60_000 });
  await expect(page.getByTestId('objective')).toBeVisible();
  await expect(page.getByTestId('hq-arrow')).toBeVisible();
  const kinds = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks.map((t) => t.cls));
  expect(kinds).toContain('hq');
  expect(kinds).toContain('tower');
  await shot(page, '05-mission-hud');
  // look at a tower outpost
  await page.evaluate(() => {
    const st = (window as unknown as W).__tanky.scene.state;
    const tw = st.tanks.find((t) => t.cls === 'tower')!;
    const me = st.tanks[0];
    const open = (x: number, y: number): boolean => st.map.feature[Math.floor(y) * st.map.width + Math.floor(x)] !== 2;
    const spot = [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [3, 3]].find(([dx, dy]) => open(tw.x + dx, tw.y + dy) && open(tw.x + dx / 2, tw.y + dy / 2)) ?? [0, 1];
    me.x = tw.x + spot[0];
    me.y = tw.y + spot[1];
    me.protect = 99;
  });
  await page.waitForTimeout(1500);
  await shot(page, '06-tower-outpost');
  // and at the HQ
  await page.evaluate(() => {
    const sc = (window as unknown as W).__tanky.scene;
    const hq = sc.state.tanks[sc.hqId];
    const me = sc.state.tanks[0];
    const open = (x: number, y: number): boolean => sc.state.map.feature[Math.floor(y) * sc.state.map.width + Math.floor(x)] !== 2;
    const spot = [[-3, 0], [3, 0], [0, -3], [0, 3]].find(([dx, dy]) => open(hq.x + dx, hq.y + dy)) ?? [0, 2];
    me.x = hq.x + spot[0];
    me.y = hq.y + spot[1];
  });
  await page.waitForTimeout(1500);
  await shot(page, '07-hq');
  // destroy the HQ → mission complete, credits, next level
  await page.evaluate(() => {
    const sc = (window as unknown as W).__tanky.scene;
    sc.state.tanks[sc.hqId].alive = false;
  });
  await expect(page.getByTestId('mission-results')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('mission-outcome')).toContainText('başarılı');
  await expect(page.getByTestId('credit-gain')).toBeVisible();
  await expect(page.getByTestId('next-level')).toHaveCount(0); // only one mission so far
  await shot(page, '08-mission-won');
});

test('06 time out = mission failed', async ({ page }) => {
  await page.goto('/?silent&dur=3');
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await page.getByTestId('play-m1').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('mission-results')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('mission-outcome')).toContainText('başarısız');
  await expect(page.getByTestId('next-level')).toHaveCount(0);
  await shot(page, '09-mission-lost');
});

test('07 quick match pays credits', async ({ page }) => {
  await page.goto('/?silent&dur=3&bots=idle');
  await page.getByTestId('solo').click();
  await page.getByTestId('play').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as unknown as W).__tanky?.scene.state.match.phase === 'playing', null, { timeout: 60_000 });
  await page.evaluate(() => {
    // give the player two kills so the match pays
    const st = (window as unknown as W).__tanky.scene.state as unknown as { tanks: { kills: number }[] };
    st.tanks[0].kills = 2;
  });
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('credit-gain')).toContainText('35');
  await page.getByTestId('menu').click();
  await page.getByTestId('solo').click();
  await expect(page.getByTestId('credits')).toContainText('35');
});

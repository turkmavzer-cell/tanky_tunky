import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Round-06 screenshots → docs/screens/round-06/: "Görevler" naming, upgrade parts + perks, spray fire feel. */
const OUT = 'docs/screens/round-06';
mkdirSync(OUT, { recursive: true });

type W = Window & { __tanky: { scene: { hqId: number; state: { tick: number; tanks: { alive: boolean }[]; match: { phase: string } } } } };
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const seedSave = (page: Page, save: object): Promise<void> =>
  page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tanky.save', JSON.stringify(s));
      sessionStorage.setItem('seeded', '1');
    }
  }, { schemaVersion: 6, ...save });

test.describe.configure({ mode: 'serial' });

test('01 menu says Görevler', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await expect(page.getByTestId('campaign')).toHaveText('Görevler');
  await page.getByTestId('campaign').click();
  await expect(page.locator('.menu-title')).toHaveText('Görevler');
  await expect(page.getByTestId('level-m1')).toContainText('Görev 1');
  await shot(page, '01-missions');
});

test('02 won mission pays a part; pick a tank to power up', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('campaign').click();
  await page.getByTestId('play-m1').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as unknown as W).__tanky?.scene.state.match.phase === 'playing', null, { timeout: 60_000 });
  await page.evaluate(() => {
    const sc = (window as unknown as W).__tanky.scene;
    sc.state.tanks[sc.hqId].alive = false;
  });
  await expect(page.getByTestId('mission-results')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('parts-gain')).toBeVisible(); // 3 stars on the first win → 2 parts
  await expect(page.getByTestId('perk-picker')).toBeVisible();
  await shot(page, '02-mission-parts');
  await page.getByTestId('pick-heavy').click();
  await page.getByTestId('pick-scout').click();
  await expect(page.getByTestId('perk-picker')).toHaveCount(0); // both parts spent
  await page.getByTestId('menu').click();
  await page.getByTestId('back').click();
  await page.getByTestId('garage').click();
  await expect(page.getByTestId('garage-heavy').locator('.pips.perk i.on')).toHaveCount(1);
  await expect(page.getByTestId('garage-scout').locator('.pips.perk i.on')).toHaveCount(1);
  await shot(page, '03-garage-perks');
});

test('03 garage: spend a stored part', async ({ page }) => {
  await seedSave(page, { parts: 3, perks: { artillery: 2 } });
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('garage').click();
  await expect(page.getByTestId('parts')).toContainText('3');
  await page.getByTestId('perk-standard').click();
  await expect(page.getByTestId('parts')).toContainText('2');
  await expect(page.getByTestId('garage-standard').locator('.pips.perk i.on')).toHaveCount(1);
  await expect(page.getByTestId('garage-artillery').locator('.pips.perk i.on')).toHaveCount(2);
});

test('04 spray fire: light effects, summed damage numbers', async ({ page }) => {
  await page.goto('/?silent&endless&map=40&seed=11&roster=scout&cls=scout');
  await page.getByTestId('solo').click();
  await page.getByTestId('play').click();
  await page.getByTestId('class-scout').click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as unknown as W).__tanky?.scene.state.match.phase === 'playing', null, { timeout: 60_000 });
  await page.keyboard.down('Space');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(2500);
  await shot(page, '04-spray');
  await page.keyboard.up('Space');
});

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startMatch } from './helpers';

/**
 * Round-02 deliverable screenshots → docs/screens/round-02/ (inspected by hand, see PROGRESS.md).
 */
const OUT = 'docs/screens/round-02';
mkdirSync(OUT, { recursive: true });

type T = { ability: { active: number; cooldown: number } };
type W = Window & { __tanky: { scene: { state: { tick: number; tanks: T[] } } } };

const ticks = async (page: Page, n: number): Promise<void> => {
  const t0 = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tick);
  await page.waitForFunction((t) => (window as unknown as W).__tanky.scene.state.tick > t, t0 + n, { timeout: 60_000 });
};
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const btn = (page: Page) => page.getByTestId('ability');

test.describe.configure({ mode: 'serial' });

test('ability button: active → cooling → ready (Swift)', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle', 'standard');
  await expect(btn(page)).toHaveClass(/ready/);
  await page.keyboard.down('KeyE');
  await ticks(page, 4);
  await page.keyboard.up('KeyE');
  await ticks(page, 60);
  await expect(btn(page)).toHaveClass(/active/);
  await expect(page.getByTestId('ability-count')).toHaveText(/^[1-5]$/);
  await expect(page.getByTestId('ability-chip')).toContainText('sn');
  await shot(page, '01-ability-active');
  // jump to the cooldown: end the effect early (sim state), then look at the cooling button
  await page.evaluate(() => {
    (window as unknown as W).__tanky.scene.state.tanks[0].ability.active = 0.02;
  });
  await ticks(page, 60);
  await expect(btn(page)).toHaveClass(/cooling/);
  await expect(page.getByTestId('ability-count')).toHaveText(/^[1-8]$/);
  await shot(page, '02-ability-cooling');
  await page.evaluate(() => {
    (window as unknown as W).__tanky.scene.state.tanks[0].ability.cooldown = 0.05;
  });
  await ticks(page, 6);
  await expect(btn(page)).toHaveClass(/ready/);
  await expect(btn(page)).toHaveClass(/flash/);
  await expect(page.getByTestId('ability-count')).toHaveText('');
  await expect(page.getByTestId('ability-chip')).toContainText('HAZIR');
  await shot(page, '03-ability-ready');
});

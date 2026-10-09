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

test('tank select: swipeable cards with stats + ability, difficulty selector (remembered)', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('play').click();
  const strip = page.getByTestId('tank-strip');
  await expect(page.locator('.tank-card.on')).toHaveAttribute('data-cls', 'standard');
  await expect(page.locator('.tank-card.on')).toContainText('3.000');
  await expect(page.locator('.tank-card.on')).toContainText('Swift');
  await expect(page.locator('.tank-card.on')).toContainText('Yakında');
  await page.waitForTimeout(400); // let the preview draw a few frames
  await shot(page, '04-tank-cards');
  // swipe one card to the right → the next class becomes selected
  await strip.evaluate((el) => el.scrollBy({ left: el.querySelector<HTMLElement>('.tank-card')!.clientWidth + 14 }));
  await expect(page.locator('.tank-card.on')).toHaveAttribute('data-cls', 'artillery');
  await expect(page.locator('.tank-card.on')).toContainText('Yaylım Ateşi');
  await shot(page, '05-tank-cards-swiped');
  // every card is reachable and shows its own numbers
  for (const [cls, hp] of [
    ['scout', '1.750'],
    ['heavy', '5.500'],
    ['trapper', '2.375'],
  ] as const) {
    await page.getByTestId(`class-${cls}`).click();
    await expect(page.locator('.tank-card.on')).toHaveAttribute('data-cls', cls);
    await expect(page.locator('.tank-card.on')).toContainText(hp);
  }
  await expect(page.getByTestId('diff-normal')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('diff-extreme').click();
  await expect(page.getByTestId('diff-extreme')).toHaveAttribute('aria-checked', 'true');
  await shot(page, '06-difficulty');
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as unknown as { __tanky?: { scene: { state: unknown } } }).__tanky?.scene.state !== undefined, null, { timeout: 60_000 });
  await page.getByTestId('pause').click();
  await page.getByTestId('quit').click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('diff-extreme')).toHaveAttribute('aria-checked', 'true');
});

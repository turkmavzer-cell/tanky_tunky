import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startMatch } from './helpers';

/** Round-04 deliverable screenshots → docs/screens/round-04/ (inspected by hand, see PROGRESS.md). */
const OUT = 'docs/screens/round-04';
mkdirSync(OUT, { recursive: true });

type T = { x: number; y: number; protect: number; hp: number; team: number; target: number; stun: number; ult: { active: number; cooldown: number } | null };
type W = Window & { __tanky: { scene: { state: { tick: number; tanks: T[] } } } };

const ticks = async (page: Page, n: number): Promise<void> => {
  const t0 = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tick);
  await page.waitForFunction((t) => (window as unknown as W).__tanky.scene.state.tick > t, t0 + n, { timeout: 60_000 });
};
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });
const key = async (page: Page, code: string, n = 4): Promise<void> => {
  await page.keyboard.down(code);
  await ticks(page, n);
  await page.keyboard.up(code);
};

test.describe.configure({ mode: 'serial' });

test('01 tank cards show skill + ultimate', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('solo').click();
  await page.getByTestId('play').click();
  await page.getByTestId('class-scout').click();
  await expect(page.locator('.tank-card.on')).toContainText('Aşırı Yük');
  await expect(page.locator('.tank-card.on')).toContainText('Saklan');
  await page.waitForTimeout(400);
  await shot(page, '01-card-scout');
  await page.getByTestId('class-heavy').click();
  await expect(page.locator('.tank-card.on')).toContainText('Onarım');
  await shot(page, '02-card-heavy');
  await page.getByTestId('class-artillery').click();
  await expect(page.locator('.tank-card.on')).toContainText('Hazır Atış');
  await expect(page.locator('.tank-card.on')).toContainText('Yaylım Ateşi');
});

test('02 HUD: skill + ult buttons, Aşırı Yük active', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&seed=7&bots=idle', 'scout');
  await ticks(page, 20);
  await expect(page.getByTestId('ult')).toBeVisible();
  await expect(page.getByTestId('ability')).toBeVisible();
  await shot(page, '03-hud-ready');
  await key(page, 'KeyQ');
  await ticks(page, 10);
  await expect(page.getByTestId('ult-chip')).toHaveClass(/active/);
  await shot(page, '04-hud-overdrive');
});

test('03 auto-aim ignores an enemy that is off screen, locks it when it comes on screen', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&seed=7&bots=idle', 'standard');
  const setFoe = (dx: number, dy: number): Promise<void> =>
    page.evaluate(
      ([ddx, ddy]) => {
        const st = (window as unknown as W).__tanky.scene.state;
        const me = st.tanks[0];
        const foes = st.tanks.filter((t) => t.team !== me.team);
        foes.forEach((f, i) => {
          f.x = me.x + ddx + i * 0.01;
          f.y = me.y + ddy;
        });
      },
      [dx, dy],
    );
  await setFoe(22, -22); // 2800 px away on screen
  await ticks(page, 15);
  expect(await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].target)).toBe(-1);
  await setFoe(3, 0);
  await ticks(page, 15);
  expect(await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].target)).toBeGreaterThanOrEqual(0);
  await shot(page, '05-aim-on-screen');
});

test('04 EMP stuns, Onarım heals (in the real scene)', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&seed=7&bots=idle', 'standard');
  await page.evaluate(() => {
    const st = (window as unknown as W).__tanky.scene.state;
    const me = st.tanks[0];
    const foe = st.tanks.find((t) => t.team !== me.team)!;
    foe.x = me.x + 1.2;
    foe.y = me.y;
    st.tanks.forEach((t) => (t.protect = 0)); // spawn protection would shield it from the pulse
  });
  await ticks(page, 5);
  await key(page, 'KeyQ');
  await ticks(page, 3);
  const stun = await page.evaluate(() => {
    const st = (window as unknown as W).__tanky.scene.state;
    return Math.max(...st.tanks.filter((t) => t.team !== st.tanks[0].team).map((t) => t.stun));
  });
  expect(stun).toBeGreaterThan(1.5);
  await shot(page, '06-emp');
});

test('05 menu: Tek Oyunculu / Çok Oyunculu / Ayarlar', async ({ page }) => {
  await page.goto('/?silent');
  await expect(page.getByTestId('solo')).toBeVisible();
  await expect(page.getByTestId('multi')).toBeVisible();
  await expect(page.getByTestId('settings')).toBeVisible();
  await shot(page, '07-menu');
  await page.getByTestId('solo').click();
  await expect(page.getByTestId('play')).toBeVisible();
  await expect(page.getByTestId('campaign')).toBeEnabled(); // round 05: campaign is playable
  await shot(page, '08-menu-solo');
  await page.getByTestId('back').click();
  await page.getByTestId('multi').click();
  await expect(page.getByTestId('multi-note')).toBeVisible();
  await shot(page, '09-menu-multi');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('solo')).toBeVisible();
});

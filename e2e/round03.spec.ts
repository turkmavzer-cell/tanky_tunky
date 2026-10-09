import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startMatch } from './helpers';

/** Round-03 deliverable screenshots → docs/screens/round-03/ (inspected by hand, see PROGRESS.md). */
const OUT = 'docs/screens/round-03';
mkdirSync(OUT, { recursive: true });

type T = { x: number; y: number; hp: number; alive: boolean; upgrades: number; team: number };
type M = { width: number; feature: Uint8Array; hp: Uint16Array; version: number };
type W = Window & {
  __tanky: { scene: { worldView: { invalidate(): void }; state: { tick: number; tanks: T[]; pickups: unknown[]; map: M } } };
};

const ticks = async (page: Page, n: number): Promise<void> => {
  const t0 = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tick);
  await page.waitForFunction((t) => (window as unknown as W).__tanky.scene.state.tick > t, t0 + n, { timeout: 60_000 });
};
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });

test.describe.configure({ mode: 'serial' });

for (const [k, theme] of [
  ['01', 'desert'],
  ['02', 'city'],
] as const) {
  test(`${k} ${theme} map: overview and in play`, async ({ page }) => {
    await startMatch(page, `silent&endless&theme=${theme}&seed=7&bots=idle&view=20,20&zoom=0.32`);
    await ticks(page, 20);
    await shot(page, `${k}-${theme}-overview`);
    await startMatch(page, `silent&endless&theme=${theme}&seed=7&bots=idle`);
    await ticks(page, 20);
    await shot(page, `${k}-${theme}-play`);
  });
}

test('03 forest: an enemy in trees shows translucent up close, hidden farther away', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&seed=7&bots=idle');
  await page.evaluate(() => {
    const sc = (window as unknown as W).__tanky.scene;
    const st = sc.state;
    const me = st.tanks[0];
    const foes = st.tanks.filter((t) => t.team !== me.team);
    const place = (t: T, dx: number, dy: number): void => {
      t.x = me.x + dx;
      t.y = me.y + dy;
      for (let y = Math.floor(t.y) - 1; y <= Math.floor(t.y) + 1; y++)
        for (let x = Math.floor(t.x) - 1; x <= Math.floor(t.x) + 1; x++) {
          st.map.feature[y * st.map.width + x] = 1; // forest
          st.map.hp[y * st.map.width + x] = 0;
        }
    };
    place(foes[0], 2.2, -1.2); // ~2.5 tiles: visible, translucent
    place(foes[1], 5.5, -4.5); // ~7 tiles: hidden
    st.map.version++;
    sc.worldView.invalidate();
  });
  await ticks(page, 10);
  await shot(page, '03-forest-concealment');
});

test('04 crate upgrades: pickups on the ground, collected → pips + HUD +%15', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=city&seed=7&bots=idle');
  await page.evaluate(() => {
    const st = (window as unknown as W).__tanky.scene.state;
    const me = st.tanks[0];
    const ps = st.pickups as { id: number; x: number; y: number }[];
    // three on the player's path (screen-right = world +x, -y), one further away to show the art
    for (let k = 1; k <= 3; k++) ps.push({ id: 9000 + k, x: me.x + k * 0.6, y: me.y - k * 0.6 });
    ps.push({ id: 9010, x: me.x + 1.5, y: me.y + 1.5 });
  });
  await ticks(page, 4);
  await shot(page, '04a-upgrade-pickups');
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => (window as unknown as W).__tanky.scene.state.tanks[0].upgrades >= 3, null, { timeout: 60_000 });
  await page.keyboard.up('KeyD');
  await expect(page.getByTestId('upgrades')).toContainText('+%15');
  await shot(page, '04b-upgrades-collected');
});

test('05 out-of-combat regeneration: +hp after 5 s', async ({ page }) => {
  await startMatch(page, 'silent&endless&theme=desert&seed=7&bots=idle');
  const hp0 = await page.evaluate(() => {
    const me = (window as unknown as W).__tanky.scene.state.tanks[0];
    me.hp = Math.round(me.hp * 0.4);
    return me.hp;
  });
  await page.waitForFunction((h) => (window as unknown as W).__tanky.scene.state.tanks[0].hp > h, hp0, { timeout: 60_000, polling: 'raf' });
  await ticks(page, 8);
  await shot(page, '05-regen');
});

test('06 tank select with map + difficulty selectors', async ({ page }) => {
  await page.goto('/?silent');
  await page.getByTestId('play').click();
  await expect(page.getByTestId('map-desert')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('map-city').click();
  await expect(page.locator('.tank-card')).toHaveCount(4); // Trapper removed for now
  await page.waitForTimeout(300);
  await shot(page, '06-select-map');
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as unknown as { __tanky?: { scene: { state: { map: { theme: string } } } } }).__tanky?.scene.state.map.theme === 'city', null, { timeout: 60_000 });
});

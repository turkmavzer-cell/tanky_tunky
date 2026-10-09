import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startMatch } from './helpers';

/**
 * Round-01 deliverable screenshots → docs/screens/round-01/ (inspected by hand, see PROGRESS.md).
 * Scenes are staged by moving tanks in the live simulation (dev-only access via window.__tanky).
 */
const OUT = 'docs/screens/round-01';
mkdirSync(OUT, { recursive: true });

type T = { x: number; y: number; hp: number; alive: boolean; target: number; ability: { active: number; cooldown: number }; charging: boolean };
type W = Window & { __tanky: { scene: { worldView: { invalidate(): void }; state: { tick: number; tanks: T[]; mines: unknown[]; shells: { warn: boolean }[]; map: { width: number; feature: Uint8Array; elev: Uint8Array; flags: Uint8Array; ground: Uint8Array; version: number } } } } };

/** Clears a 9x9 flat open area around the player and places tank `enemy` at offset (dx, dy) world tiles. */
async function stage(page: Page, enemy: number, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ([enemy, dx, dy]) => {
      const sc = (window as unknown as W).__tanky.scene;
      const st = sc.state;
      const me = st.tanks[0];
      const W_ = st.map.width;
      for (let y = Math.floor(me.y) - 4; y <= Math.floor(me.y) + 4; y++)
        for (let x = Math.floor(me.x) - 4; x <= Math.floor(me.x) + 4; x++) {
          if (x < 0 || y < 0 || x >= W_ || y >= W_) continue;
          const i = y * W_ + x;
          st.map.feature[i] = 0;
          st.map.elev[i] = 0;
          st.map.flags[i] = 0;
          if (st.map.ground[i] >= 4) st.map.ground[i] = 1;
        }
      st.map.version++;
      sc.worldView.invalidate();
      if (enemy >= 0) {
        st.tanks[enemy].x = me.x + dx;
        st.tanks[enemy].y = me.y + dy;
      }
    },
    [enemy, dx, dy] as const,
  );
}

const ticks = async (page: Page, n: number): Promise<void> => {
  const t0 = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tick);
  await page.waitForFunction((t) => (window as unknown as W).__tanky.scene.state.tick > t, t0 + n, { timeout: 60_000 });
};

/** Holds the ability key for a few simulation ticks (a bare key press can fall between two ticks). */
async function ability(page: Page): Promise<void> {
  await page.keyboard.down('KeyE');
  await ticks(page, 4);
  await page.keyboard.up('KeyE');
}

const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${OUT}/${name}.png` });

test.describe.configure({ mode: 'serial' });

test('01 auto-target lock-on marker', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle');
  await stage(page, 3, 2.4, -2.4);
  await ticks(page, 40);
  expect(await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].target)).toBe(3);
  await shot(page, '01-target-lock');
});

test('02-03 heights: normal and strong obstacle highlight (debug_heights)', async ({ page }) => {
  await startMatch(page, 'silent&endless&nofog&map=debug_heights&bots=idle&view=10,10&zoom=0.62');
  await ticks(page, 10);
  await shot(page, '02-heights-normal');
  await startMatch(page, 'silent&endless&nofog&map=debug_heights&bots=idle&view=10,10&zoom=0.62&edges=strong');
  await ticks(page, 10);
  await shot(page, '03-heights-strong');
});

test('04 bump into a cliff edge flashes it', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=debug_heights&bots=idle');
  // place the player in front of the west face of the 1-level cliff block (4..6, 11..13) and drive into
  // the middle of that face with a single key (screen-right = world (+x, -y)): deterministic on any frame rate
  await page.evaluate(() => {
    const me = (window as unknown as W).__tanky.scene.state.tanks[0];
    me.x = 3.3;
    me.y = 12.9;
  });
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => (window as unknown as { __tanky: { scene: { worldView: { bumps: unknown[] } } } }).__tanky.scene.worldView.bumps.length > 0, null, { timeout: 60_000, polling: 'raf' });
  await shot(page, '04-bump-cliff');
  await page.keyboard.up('KeyD');
});

test('05 enemy bot attacks the player', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=enemies');
  await stage(page, 3, 3, -1);
  const hp0 = await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].hp);
  await page.waitForFunction((h) => (window as unknown as W).__tanky.scene.state.tanks[0].hp < h, hp0, { timeout: 60_000, polling: 'raf' });
  await shot(page, '05-enemy-attack');
});

test('06 Scout — Hide (own tank translucent)', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle', 'scout');
  await stage(page, 3, 3, -3);
  await ability(page);
  await ticks(page, 20);
  expect(await page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[0].ability.active)).toBeGreaterThan(0);
  await shot(page, '06-ability-hide');
});

test('07 Heavy — Rumble shockwave', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle', 'heavy');
  await stage(page, 3, 1.3, -1.0);
  await ticks(page, 5);
  const hp3 = () => page.evaluate(() => (window as unknown as W).__tanky.scene.state.tanks[3].hp);
  const before = await hp3();
  await ability(page);
  await ticks(page, 8);
  await shot(page, '07-ability-rumble');
  expect(await hp3()).toBeLessThan(before);
});

test('08 Standard — Swift', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle', 'standard');
  await stage(page, -1, 0, 0);
  await ability(page);
  await page.keyboard.down('KeyD');
  await ticks(page, 25);
  await shot(page, '08-ability-swift');
  await page.keyboard.up('KeyD');
});

test('09 Artillery — Barrage warnings', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle', 'artillery');
  await stage(page, 3, 3.6, -3.6);
  await ticks(page, 30);
  await ability(page);
  await page.waitForFunction(() => (window as unknown as W).__tanky.scene.state.shells.filter((s) => s.warn).length >= 2, null, { timeout: 30_000 });
  await shot(page, '09-ability-barrage');
});

test('10 Trapper — mines + minimap with red dots', async ({ page }) => {
  await startMatch(page, 'silent&endless&map=40&seed=11&bots=idle', 'trapper');
  await stage(page, -1, 0, 0);
  await page.keyboard.down('KeyA');
  for (let k = 0; k < 3; k++) {
    await ability(page);
    await page.waitForFunction((n) => (window as unknown as W).__tanky.scene.state.mines.length >= n, k + 1, { timeout: 30_000 });
    await page.waitForFunction(() => (window as unknown as W).__tanky.scene.state.tanks[0].ability.cooldown <= 0, null, { timeout: 30_000 });
  }
  await page.keyboard.up('KeyA');
  await expect(page.getByTestId('minimap')).toBeVisible();
  await shot(page, '10-ability-mines-minimap');
});

test('11 results table after the match', async ({ page }) => {
  await startMatch(page, 'silent&map=40&seed=11&dur=8');
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('my-row')).toBeVisible();
  await expect(page.getByTestId('again')).toBeInViewport();
  await shot(page, '11-results');
});

import type { Page } from '@playwright/test';

export type TankyWin = Window & { __tanky?: { scene: { state: { tick: number; match: { phase: string } } } } };

/** Menu → class select → match; waits until the 3-2-1 countdown is over (phase 'playing'). */
export async function startMatch(page: Page, query = 'silent', cls?: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.getByTestId('play').click();
  if (cls) await page.getByTestId(`class-${cls}`).click();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as TankyWin).__tanky?.scene.state.match.phase === 'playing', null, { timeout: 60_000 });
}

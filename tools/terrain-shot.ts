/**
 * Screenshots the terrain preview (needs `npx vite build -c tools/vite.preview.config.ts` and a running
 * `npx vite preview -c tools/vite.preview.config.ts`). Usage: npx tsx tools/terrain-shot.ts [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.env.PREVIEW_URL ?? 'http://localhost:4199/terrain-preview.html';
const out = process.argv[2] ?? 'docs/img';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1840, height: 1000 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(url);
await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 30000 });
const stats = await page.evaluate(() => (window as unknown as { __terrainStats: unknown }).__terrainStats);
console.log('stats', JSON.stringify(stats));
await page.screenshot({ path: `${out}/terrain-preview.png`, fullPage: true });

// cold buildTerrainArt() timing: median over fresh page loads (one cold build each)
const cold: number[] = [];
for (let k = 0; k < 7; k++) {
  const p = await browser.newPage();
  await p.goto(`${url}?coldonly`);
  await p.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 30000 });
  cold.push(parseFloat((await p.textContent('#info'))!.replace('cold ', '')));
  await p.close();
}
cold.sort((a, b) => a - b);
console.log(`cold build ms: ${cold.join(', ')} (median ${cold[3]})`);

const zoom = await browser.newPage({ viewport: { width: 1840, height: 1000 }, deviceScaleFactor: 2 });
await zoom.goto(url);
await zoom.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 30000 });
await zoom.screenshot({ path: `${out}/terrain-preview-zoom.png`, clip: { x: 560, y: 90, width: 800, height: 460 } });
await browser.close();

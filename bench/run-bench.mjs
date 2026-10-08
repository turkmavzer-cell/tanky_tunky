// Engine benchmark runner: serves the built spike, runs each engine page in headless
// Chromium with CDP CPU throttling and collects frame-time stats + a screenshot.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve('.bench-dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const rates = (process.env.BENCH_RATES ?? '1,4').split(',').map(Number);
const engines = (process.env.BENCH_ENGINES ?? 'pixi,phaser').split(',');
const runs = Number(process.env.BENCH_RUNS ?? 2);
const res = Number(process.env.BENCH_RES ?? 1);
const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
await mkdir('bench/out', { recursive: true });
for (const rate of rates) {
  for (const engine of engines) {
    for (let run = 0; run < runs; run++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => console.error(`[${engine}] pageerror`, e.message));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.goto(`http://127.0.0.1:${port}/${engine}.html?res=${res}`);
      await page.waitForFunction(() => window.__bench?.done === true, null, { timeout: 120000 });
      const r = await page.evaluate(() => window.__bench);
      if (run === 0) await page.screenshot({ path: `bench/out/${engine}-x${rate}-r${res}.png` });
      results.push({ engine, rate, run, res, ...r });
      console.log(engine, `x${rate}`, `run${run}`, JSON.stringify(r));
      await page.close();
    }
  }
}
await browser.close();
server.close();
await writeFile(`bench/out/results-r${res}.json`, JSON.stringify(results, null, 2));

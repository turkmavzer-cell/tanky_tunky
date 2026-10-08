// Runs tools/audio-check.html (built into .audio-dist/ by tools/vite.audio.config.ts) in headless
// Chromium, prints the per-sound table, writes WAVs + visualisation PNGs to tools/audio-out/ and
// exits non-zero if any render clips, is silent, has DC offset or does not decay to silence.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve('.audio-dist');
const outDir = resolve('tools/audio-out');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  await page.goto(`http://127.0.0.1:${port}/audio-check.html`);
  await page.waitForFunction(() => window.__audioCheck?.done === true, null, { timeout: 180_000 });
  const res = await page.evaluate(() => window.__audioCheck);
  if (res.error) throw new Error(res.error);
  await mkdir(outDir, { recursive: true });
  for (const [label, b64] of Object.entries(res.wavs)) {
    const file = join(outDir, `${label.replace(/[^a-z0-9_=.-]+/gi, '_')}.wav`);
    await writeFile(file, Buffer.from(b64, 'base64'));
  }
  const groups = await page.locator('.grp').count();
  for (let i = 0; i < groups; i++) await page.locator(`#grp-${i}`).screenshot({ path: join(outDir, `viz-${i}.png`) });

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('sound', 30)}${pad('dur(s)', 8)}${pad('peak', 8)}${pad('rms', 8)}${pad('dc', 9)}${pad('tail', 8)}status`);
  for (const r of res.results) {
    const status = r.ok ? 'ok' : [r.clip && 'CLIP', r.silent && 'SILENT', r.tail >= 0.003 && 'NO-DECAY', Math.abs(r.dc) >= 0.01 && 'DC'].filter(Boolean).join(',') || 'FAIL';
    if (!r.ok) failed++;
    console.log(`${pad(r.label, 30)}${pad(r.duration.toFixed(2), 8)}${pad(r.peak.toFixed(3), 8)}${pad(r.rms.toFixed(4), 8)}${pad(r.dc.toFixed(5), 9)}${pad(r.tail.toFixed(4), 8)}${status}`);
  }
  console.log(`\n${res.results.length} renders, ${failed} failing. WAVs + viz-*.png in ${outDir}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

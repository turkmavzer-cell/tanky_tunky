// CPU profile of a live match (96x96, CPU 4x): `npm run build && node tools/profile.mjs` → top self-time functions.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort', '--host', '127.0.0.1'], { cwd: '/home/user/tanky_tunky' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 851, height: 393 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4174/?silent&endless&map=96&seed=7&renderScale=0.25');
await page.getByTestId('play').click();
await page.getByTestId('start').click();
await page.waitForFunction(() => window.__tanky?.scene.state.match.phase === 'playing');
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.keyboard.down('KeyD');
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.waitForTimeout(6000);
const { profile } = await cdp.send('Profiler.stop');
// self time per function
const self = new Map();
const dt = profile.timeDeltas; const samples = profile.samples;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
for (let i = 0; i < samples.length; i++) { const n = byId.get(samples[i]); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); }
const total = [...self.values()].reduce((a, c) => a + c, 0);
for (const [k, v] of [...self.entries()].sort((a, c) => c[1] - a[1]).slice(0, 25)) console.log((v / total * 100).toFixed(1) + '%', k);
await b.close(); srv.kill();

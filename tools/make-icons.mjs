/**
 * App icon generator (round-02): builds the isometric tank icon as SVG (source of truth in
 * assets/icon/) and rasterises every Android size with the preinstalled Chromium (Playwright).
 *
 *   node tools/make-icons.mjs
 *
 * Outputs
 *  - assets/icon/{background,foreground,monochrome}.svg   editable sources
 *  - android/.../mipmap-<dpi>/ic_launcher_{foreground,background,monochrome}.png   adaptive layers (108 dp)
 *  - android/.../mipmap-<dpi>/ic_launcher.png, ic_launcher_round.png   legacy icons (48 dp)
 *  - assets/icon/icon-512.png (store listing), public/favicon.png (web build)
 *  - docs/screens/round-02/07-icon-shapes.png   preview in circle / squircle / rounded square / teardrop masks
 * To use a hand-made / AI-generated icon instead, replace the SVGs (same 108×108 viewBox) and re-run.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const RES = 'android/app/src/main/res';
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// ---------- geometry: a small isometric renderer for boxes / prisms (world units, z up)
const HEADING = -1.12; // barrel points to the upper right of the screen
const S = 17; // screen units per world unit before fitting
const iso = ([x, y, z]) => [(x - y) * S * 0.866, (x + y) * S * 0.5 - z * S * 0.92];
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** Prism from a 2D footprint (local coords), placed at (ox, oy), heading a, z0..z1. Returns faces. */
function prism(foot, ox, oy, a, z0, z1, col) {
  const pts = foot.map(([x, y]) => {
    const [rx, ry] = rot(x, y, a);
    return [rx + ox, ry + oy];
  });
  const faces = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    // outward normal of an edge of a clockwise footprint (rect/ngon below are clockwise)
    const nx = -(q[1] - p[1]);
    const ny = q[0] - p[0];
    const l = Math.hypot(nx, ny) || 1;
    if ((nx + ny) / l <= 0.02) continue; // faces away from the viewer
    const shade = 0.62 + 0.22 * ((nx - ny) / l / Math.SQRT2);
    faces.push({ d: (p[0] + q[0] + p[1] + q[1]) / 2, z: (z0 + z1) / 2, poly: [[...p, z0], [...q, z0], [...q, z1], [...p, z1]], fill: shadeHex(col, shade), kind: 'side' });
  }
  faces.push({ d: Infinity, z: z1, poly: pts.map(([x, y]) => [x, y, z1]), fill: col, kind: 'top' });
  return faces;
}
const rect = (l, w) => [
  [-l / 2, -w / 2],
  [l / 2, -w / 2],
  [l / 2, w / 2],
  [-l / 2, w / 2],
].reverse();
const ngon = (r, n) => Array.from({ length: n }, (_, i) => [r * Math.cos((-i * 2 * Math.PI) / n + Math.PI / n), r * Math.sin((-i * 2 * Math.PI) / n + Math.PI / n)]);
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const BODY = '#3d6fb6';
const LIGHT = '#7fa9e6';
const TRACK = '#2e3238';
const a = HEADING;
const [fx, fy] = rot(1, 0, a); // forward
const [sx, sy] = rot(0, 1, a); // side
// explicit painter order for this fixed view: the barrel points away from the viewer, so it goes
// behind the turret; the near track overlaps the hull's lower edge
const near = sx + sy > 0 ? 1 : -1; // which side track is closer to the viewer
const parts = [
  { faces: prism(rect(1.9, 0.36), sx * -0.62 * near, sy * -0.62 * near, a, 0, 0.42, TRACK) },
  { faces: prism(rect(1.62, 0.98), 0, 0, a, 0.14, 0.62, BODY) },
  { faces: prism(rect(1.9, 0.36), sx * 0.62 * near, sy * 0.62 * near, a, 0, 0.42, TRACK) },
  { faces: prism(rect(1.25, 0.2), fx * 0.72, fy * 0.72, a, 0.76, 0.94, '#56616c') },
  { faces: prism(ngon(0.5, 8), fx * -0.1, fy * -0.1, a, 0.62, 1.04, LIGHT) },
  { faces: prism(ngon(0.17, 8), fx * -0.22, fy * -0.22, a, 1.04, 1.1, '#24467a') },
];
const muzzle = iso([fx * 1.38, fy * 1.38, 0.85]);

function tankSvg(mono) {
  let out = '';
  for (const o of parts) {
    const fs = [...o.faces].sort((f, g) => (f.kind === 'top') - (g.kind === 'top') || f.d - g.d);
    for (const f of fs) {
      const pts = f.poly.map((p) => iso(p).map((v) => v.toFixed(2)).join(',')).join(' ');
      out += mono
        ? `<polygon points="${pts}" fill="#fff" fill-opacity="${f.kind === 'top' ? 1 : 0.62}" stroke="#000" stroke-opacity="0" />`
        : `<polygon points="${pts}" fill="${f.fill}" stroke="#0d1218" stroke-width="0.9" stroke-linejoin="round" />`;
    }
  }
  // muzzle flash
  const [mx, my] = muzzle;
  const star = (r1, r2, n) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const r = i % 2 ? r2 : r1;
      const t = (i * Math.PI) / n - 0.25;
      return `${(mx + Math.cos(t) * r).toFixed(2)},${(my + Math.sin(t) * r * 0.8).toFixed(2)}`;
    }).join(' ');
  out += mono ? `<polygon points="${star(7, 3, 6)}" fill="#fff" />` : `<polygon points="${star(8, 3.4, 6)}" fill="#ff9a2e" /><polygon points="${star(4.6, 2, 6)}" fill="#fff1a8" />`;
  return out;
}

// fit the tank (bounding box of all projected points) into the 66 dp safe zone
const all = parts.flatMap((o) => o.faces.flatMap((f) => f.poly.map(iso))).concat([[muzzle[0] + 8, muzzle[1] - 8]]);
const minX = Math.min(...all.map((p) => p[0]));
const maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1]));
const maxY = Math.max(...all.map((p) => p[1]));
const fit = 66 / Math.max(maxX - minX, maxY - minY);
const tx = 54 - ((minX + maxX) / 2) * fit;
const ty = 56 - ((minY + maxY) / 2) * fit;
const group = (mono) =>
  `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${fit.toFixed(4)})">` +
  // ground shadow under the tank
  (mono ? '' : `<ellipse cx="0" cy="${(S * 0.55).toFixed(2)}" rx="${(S * 1.45).toFixed(2)}" ry="${(S * 0.62).toFixed(2)}" fill="#000" fill-opacity="0.32" />`) +
  tankSvg(mono) +
  '</g>';

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">${body}</svg>`;
const BG = svg(
  `<defs><radialGradient id="g" cx="0.42" cy="0.35" r="0.85"><stop offset="0" stop-color="#5a9a4c"/><stop offset="0.6" stop-color="#2f6331"/><stop offset="1" stop-color="#17351c"/></radialGradient></defs>` +
    `<rect width="108" height="108" fill="url(#g)"/>` +
    // faint isometric tile grid
    Array.from({ length: 14 }, (_, i) => {
      const o = i * 16 - 56;
      return `<path d="M${o} 0 L${o + 216} 108 M${o + 108} 0 L${o - 108} 108" stroke="#ffffff" stroke-opacity="0.06" stroke-width="0.8"/>`;
    }).join(''),
);
const FG = svg(group(false));
const MONO = svg(group(true));

mkdirSync('assets/icon', { recursive: true });
mkdirSync('public', { recursive: true });
mkdirSync('docs/screens/round-02', { recursive: true });
writeFileSync('assets/icon/background.svg', BG);
writeFileSync('assets/icon/foreground.svg', FG);
writeFileSync('assets/icon/monochrome.svg', MONO);

const inner = (s) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
/** Legacy icon: background + foreground cropped to the central 72 dp, clipped to a shape. */
const legacy = (shape) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72" width="72" height="72"><defs><clipPath id="c">${
    shape === 'round' ? '<circle cx="54" cy="54" r="34"/>' : '<rect x="20" y="20" width="68" height="68" rx="14"/>'
  }</clipPath></defs><g clip-path="url(#c)">${inner(BG)}${inner(FG)}</g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svgText, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`);
  writeFileSync(file, await page.locator('svg').screenshot({ omitBackground: true }));
}
for (const [dpi, k] of Object.entries(DPI)) {
  const dir = `${RES}/mipmap-${dpi}`;
  await png(FG, 108 * k, `${dir}/ic_launcher_foreground.png`);
  await png(BG, 108 * k, `${dir}/ic_launcher_background.png`);
  await png(MONO, 108 * k, `${dir}/ic_launcher_monochrome.png`);
  await png(legacy('square'), 48 * k, `${dir}/ic_launcher.png`);
  await png(legacy('round'), 48 * k, `${dir}/ic_launcher_round.png`);
}
await png(legacy('square'), 512, 'assets/icon/icon-512.png');
await png(legacy('round'), 64, 'public/favicon.png');

// preview sheet: how launchers mask the adaptive icon
const masks = [
  ['Daire', '<circle cx="54" cy="54" r="40"/>'],
  ['Squircle', '<path d="M54 14 C84 14 94 24 94 54 C94 84 84 94 54 94 C24 94 14 84 14 54 C14 24 24 14 54 14Z"/>'],
  ['Yuvarlak kare', '<rect x="14" y="14" width="80" height="80" rx="18"/>'],
  ['Damla', '<path d="M54 14 H94 V54 A40 40 0 0 1 54 94 A40 40 0 0 1 14 54 A40 40 0 0 1 54 14Z"/>'],
  ['Tek renk (Android 13+)', '<circle cx="54" cy="54" r="40"/>'],
];
const cells = masks
  .map(([name, m], i) => {
    const mono = i === 4;
    const body = mono ? `<rect width="108" height="108" fill="#d9e3ef"/><g style="filter:brightness(0) saturate(100%)" opacity="0.8">${inner(MONO)}</g>` : `${inner(BG)}${inner(FG)}`;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;font:600 15px system-ui;color:#ddd"><svg viewBox="0 0 108 108" width="150" height="150"><defs><clipPath id="m${i}">${m}</clipPath></defs><g clip-path="url(#m${i})">${body}</g></svg>${name}</div>`;
  })
  .join('');
await page.setViewportSize({ width: 960, height: 300 });
await page.setContent(`<html><body style="margin:0;background:#20242c;display:flex;gap:30px;justify-content:center;align-items:center;height:300px">${cells}</body></html>`);
await page.screenshot({ path: 'docs/screens/round-02/07-icon-shapes.png' });
await browser.close();
console.log('icons written');

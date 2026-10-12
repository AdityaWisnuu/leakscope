// Screenshots of every page (desktop + mobile) with real interactions, against the static export.
// usage: npm run build && node scripts/screenshots.mjs [baseUrl]
// Without a baseUrl it serves ./out itself on a free port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.resolve('out');
const SHOTS = path.resolve('screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(OUT, p);
    if (!f.startsWith(OUT)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end(fs.readFileSync(path.join(OUT, '404.html')));
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

const base = process.argv[2] ?? `http://localhost:${(await serve()).address().port}`;
const browser = await chromium.launch();
const errors = [];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2, hasTouch: true } };

async function shot(vp, name, fn) {
  const v = VIEWPORTS[vp];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.deviceScaleFactor ?? 1, isMobile: v.isMobile, hasTouch: v.hasTouch, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}/${vp}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}/${vp}: ${e.message}`));
  await fn(page);
  // A sticky header would be painted mid-page in a full-page capture.
  await page.addStyleTag({ content: '.site-header{position:relative!important}' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}-${vp}.png`), fullPage: true });
  console.log(`✓ ${name}-${vp}.png`);
  await ctx.close();
}

const FLAGSHIP = 'c6b771a76de69246007c1879e3378f2627664c41244ee650ef1d4ab8845157fd';

for (const vp of Object.keys(VIEWPORTS)) {
  await shot(vp, 'observatory', async (p) => {
    await p.goto(`${base}/`);
    await p.waitForSelector('.inspector', { timeout: 20000 });
  });
  await shot(vp, 'check', async (p) => {
    await p.goto(`${base}/check/#${FLAGSHIP}`);
    await p.waitForSelector('.finding', { timeout: 20000 });
  });
  await shot(vp, 'check-none', async (p) => {
    await p.goto(`${base}/check/#${'ab'.repeat(32)}`);
    await p.waitForSelector('.empty h2', { timeout: 20000 });
  });
  await shot(vp, 'plan', async (p) => {
    await p.goto(`${base}/plan/`);
    await p.waitForSelector('button[type=submit]:not([disabled])', { timeout: 20000 });
    await p.getByRole('button', { name: 'Migrate my Orchard balance' }).click();
    await p.getByRole('button', { name: 'Run pre-flight' }).click();
    await p.waitForSelector('.timeline', { timeout: 20000 });
  });
  await shot(vp, 'scan', async (p) => {
    await p.goto(`${base}/scan/`);
    await p.getByRole('button', { name: 'Use testnet demo key' }).click();
    await p.getByRole('button', { name: 'Scan locally' }).click();
    await p.waitForSelector('.verdict', { timeout: 180000 });
  });
  await shot(vp, 'method', async (p) => {
    await p.goto(`${base}/method/`);
  });
}

await browser.close();
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exitCode = 1;
}
process.exit();

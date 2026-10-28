// Renders slides.html -> out/leakscope-deck.pdf + out/slides-png/NN.png
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(root, 'web/node_modules/playwright')); }
(async () => {
  const out = path.join(__dirname, 'out');
  const pngDir = path.join(out, 'slides-png');
  fs.mkdirSync(pngDir, { recursive: true });
  for (const f of fs.readdirSync(pngDir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(pngDir, f));
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'slides.html'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const slides = await page.$$('section.slide');
  const overflow = await page.$$eval('section.slide', (els) => els.map((s, i) => {
    const r = s.getBoundingClientRect(); const bad = [];
    s.querySelectorAll('*').forEach((e) => { if (e.closest('.frame,.phone')) return; const b = e.getBoundingClientRect();
      if (b.width && (b.right > r.right + 1 || b.bottom > r.bottom + 1)) bad.push(e.className || e.tagName); });
    return bad.length ? `slide ${i + 1}: ${[...new Set(bad)].slice(0, 5).join(', ')}` : null; }).filter(Boolean));
  if (overflow.length) console.warn('Overflow:\n  ' + overflow.join('\n  '));
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: path.join(pngDir, String(i + 1).padStart(2, '0') + '.png') });
  }
  await page.pdf({ path: path.join(out, 'leakscope-deck.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`Rendered ${slides.length} slides -> ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });

// Records each scene with Playwright (CDP screencast, 1920x1080) against the live site (or BASE).
// Captions, a visible cursor and title cards are injected into the page.
// Output: build/scenes/<id>.webm and build/timeline.json (beat times relative to each video's start).
// usage: node record.mjs [sceneId ...]   (no args = all scenes)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SCENES } from './scenes.mjs';

const HERE = import.meta.dirname;
const require = createRequire(path.resolve(HERE, '../web/package.json'));
const { chromium } = require('playwright');

const BASE = (process.env.BASE ?? 'https://leakscope-cyan.vercel.app').replace(/\/$/, '');
const BUILD = path.resolve(HERE, 'build');
const RAW = path.join(BUILD, 'raw');
const SCN = path.join(BUILD, 'scenes');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(SCN, { recursive: true });
const tts = JSON.parse(fs.readFileSync(path.join(BUILD, 'tts.json'), 'utf8'));
const GAP = Number(process.env.GAP ?? 0.35); // pause after each narration line, seconds
const overlay = fs.readFileSync(path.join(HERE, 'overlay.js'), 'utf8');

const only = process.argv.slice(2);
const tlPath = path.join(BUILD, 'timeline.json');
const timeline = fs.existsSync(tlPath) ? JSON.parse(fs.readFileSync(tlPath, 'utf8')) : {};

const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CDP screencast at device pixels (recordVideo ignores deviceScaleFactor). Frames are saved as JPEGs with
// their capture timestamps, then encoded to a constant-30fps H.264 intermediate.
async function startScreencast(page, id) {
  const dir = path.join(RAW, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const f = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp ?? Date.now() / 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send('Page.stopScreencast');
      await sleep(200);
      return frames[0].t;
    },
    encode(out) {
      const list = path.join(dir, 'list.txt');
      let txt = '';
      frames.forEach((fr, i) => {
        const d = i + 1 < frames.length ? frames[i + 1].t - fr.t : 0.5;
        txt += `file '${fr.f}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`;
      });
      txt += `file '${frames.at(-1).f}'\n`;
      fs.writeFileSync(list, txt);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
        '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out]);
      if (!process.env.KEEP_FRAMES) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function helpers(page) {
  const box = async (sel) => {
    const l = page.locator(sel).first();
    await l.waitFor({ state: 'attached', timeout: 6000 });
    return l.boundingBox();
  };
  const h = {
    page,
    wait: (ms) => sleep(ms),
    caption: (t) => page.evaluate((t) => window.__vc.caption(t), t),
    card: (html) => page.evaluate((html) => window.__vc.card(html), html),
    cardStep: (n) => page.evaluate((n) => window.__vc.cardStep(n), n),
    highlight: (sel) => page.locator(sel).first().evaluate((el) => window.__vc.highlight(el)),
    cardHide: () => page.evaluate(() => window.__vc.cardHide()),
    // Smooth, eased scroll so `sel` ends up `top` px below the viewport top.
    scrollTo: async (sel, top = 100, ms = 1300) => {
      const l = page.locator(sel).first();
      await l.waitFor({ state: 'attached', timeout: 30000 });
      await l.evaluate((el, [top, ms]) => window.__vc.scrollTo(el.getBoundingClientRect().top + window.scrollY - top, ms), [top, ms]);
      await sleep(ms + 150);
    },
    scrollBy: async (dy, ms = 1100) => {
      await page.evaluate(([dy, ms]) => window.__vc.scrollTo(window.scrollY + dy, ms), [dy, ms]);
      await sleep(ms + 150);
    },
    // Glide the cursor to a point of the element: x/y are fractions of its box (may exceed 0..1).
    move: async (sel, { x = 0.5, y = 0.5 } = {}) => {
      const b = await box(sel);
      if (!b) return;
      const tx = b.x + b.width * x, ty = b.y + b.height * y;
      await page.mouse.move(Math.max(4, Math.min(1436, tx)), Math.max(4, Math.min(806, ty)), { steps: 28 });
    },
    click: async (sel) => {
      const l = page.locator(sel).first();
      await l.scrollIntoViewIfNeeded();
      await h.move(sel);
      await sleep(180);
      await page.evaluate(() => window.__vc.pulse());
      await l.click();
    },
    type: async (sel, text, delay = 40) => {
      await h.click(sel);
      await page.locator(sel).first().pressSequentially(text, { delay });
    },
  };
  return h;
}

for (const scene of SCENES) {
  if (only.length && !only.includes(scene.id)) continue;
  const t0 = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 4 / 3, // 1440x810 CSS px rendered at 1920x1080
    reducedMotion: 'no-preference',
  });
  await ctx.addInitScript(overlay);
  const page = await ctx.newPage();
  const shots = await startScreencast(page, scene.id);
  const now = () => Date.now() / 1000; // absolute; converted to video time after recording
  page.on('pageerror', (e) => console.warn(`  [${scene.id}] pageerror: ${e.message}`));
  await page.goto(BASE + scene.path, { waitUntil: 'load' });
  await page.waitForSelector(scene.ready, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const h = helpers(page);
  await page.mouse.move(1100, 620);
  if (scene.setup) await scene.setup(h);
  await sleep(900);

  const beats = [];
  const cuts = [];
  for (const [i, b] of scene.beats.entries()) {
    const key = `${scene.id}-${i}`;
    if (b.before) {
      const bs = now();
      await b.before(h);
      const be = now();
      // keep ~1.2s of a long silent wait (0.6 at each end), cut the middle
      if (be - bs > 2.5) cuts.push([bs + 0.6, be - 0.6]);
    }
    const start = now();
    if (process.env.DEBUG) console.log(`  ${key} start`);
    await h.caption(b.text);
    const act = b.act ? b.act(h).catch((e) => console.warn(`  [${key}] act failed: ${e.message.split('\n')[0]}`)) : null;
    await sleep((tts[key].dur + GAP) * 1000);
    if (act) await act;
    beats.push({ key, text: b.text, start, end: now(), audio: tts[key].wav, dur: tts[key].dur });
  }
  await h.caption('');
  await sleep((scene.tail ?? 0.8) * 1000);
  const end = now();
  const t0v = await shots.stop();
  await ctx.close();
  const file = path.join(SCN, `${scene.id}.mp4`);
  shots.encode(file);
  const rel = (t) => +(t - t0v).toFixed(3);
  for (const b of beats) { b.start = rel(b.start); b.end = rel(b.end); }
  for (const c of cuts) { c[0] = rel(c[0]); c[1] = rel(c[1]); }
  const lead = 0.25;
  timeline[scene.id] = { file, from: Math.max(0, beats[0].start - lead), to: rel(end), cuts, beats, fadeIn: scene.fadeIn, fadeOut: scene.fadeOut };
  console.log(`rec ${scene.id}: ${(rel(end) - beats[0].start).toFixed(1)}s used, cuts ${cuts.map((c) => (c[1] - c[0]).toFixed(1)).join(',') || 'none'} (${((Date.now() - t0) / 1000).toFixed(0)}s wall)`);
  fs.writeFileSync(tlPath, JSON.stringify(timeline, null, 2));
}
await browser.close();

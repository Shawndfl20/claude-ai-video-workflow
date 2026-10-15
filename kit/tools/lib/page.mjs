// Shared browser plumbing for render.mjs, contact.mjs and check.mjs: launch Chromium, open a kit page
// with its timeline injected, wait for the page contract (core/page.js definePage) and collect errors.
//
// Environment:
//   PLAYWRIGHT_MODULE  absolute path to a playwright or playwright-core entry file (else `import('playwright')`)
//   CHROMIUM           Chromium/Chrome executable (else Playwright's own browser)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Frame size (CSS px) the page is drawn at and the encoded video size, by KIT_META.format.
 * Portrait is the Shorts frame scaled down to 720p; landscape is encoded at full 1080p for long videos.
 */
export const FORMATS = {
  portrait: { frameW: 1080, frameH: 1920, outW: 720, outH: 1280 },
  landscape: { frameW: 1920, frameH: 1080, outW: 1920, outH: 1080 },
};
export const FPS = 30;

const READY_TIMEOUT_MS = 60_000;

async function loadChromium() {
  const entry = process.env.PLAYWRIGHT_MODULE;
  let mod;
  try {
    mod = await import(entry ? pathToFileURL(path.resolve(entry)).href : 'playwright');
  } catch (err) {
    throw new Error(`cannot load Playwright (${err.message}). Install playwright, or set PLAYWRIGHT_MODULE to its entry file, e.g. <dir>/node_modules/playwright-core/index.mjs`);
  }
  return mod.chromium ?? mod.default.chromium;
}

/** Launch Chromium. Pixel pages get a CPU 2D canvas, which draws the upscaled pixel layers faster than a software GPU. */
export async function launchBrowser({ pixel = false } = {}) {
  const chromium = await loadChromium();
  return chromium.launch({
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
    args: pixel ? ['--disable-gpu', '--disable-accelerated-2d-canvas'] : [],
  });
}

/** Read a timeline JSON and check the fields every tool relies on (check.mjs validates the rest). */
export function readTimeline(timelinePath) {
  const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  if (!(timeline.total > 0) || !Array.isArray(timeline.lines) || timeline.lines.length === 0) {
    throw new Error(`${timelinePath}: expected { total: <seconds>, lines: [...] } (build it with build-timeline.py or build-voice.py)`);
  }
  return timeline;
}

// Playwright prefixes evaluate errors with "page.evaluate: " and appends the page stack; keep the message.
const firstLine = (err) => String(err?.message ?? err).replace(/^page\.evaluate: /, '').split('\n')[0];

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Open `pagePath` with window.TIMELINE injected before any page script runs, wait for window.ready
 * (60 s limit), then explicitly load every KIT_META font with the timeline's own text so a missing
 * font file fails here instead of silently falling back.
 * The viewport is set to the frame of KIT_META.format (portrait by default).
 * Returns { page, meta, timeline, log, size }, `size` one of FORMATS. `log` keeps collecting while the page is used:
 *   pageErrors (uncaught exceptions), consoleErrors, failedRequests.
 */
export async function openPage(browser, pagePath, timelinePath) {
  const timeline = readTimeline(timelinePath);
  const page = await browser.newPage({ viewport: { width: FORMATS.portrait.frameW, height: FORMATS.portrait.frameH } });
  const log = { pageErrors: [], consoleErrors: [], failedRequests: [] };
  page.on('pageerror', (err) => log.pageErrors.push(firstLine(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') log.consoleErrors.push(msg.text()); });
  page.on('requestfailed', (req) => log.failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));

  const fail = (message) => new Error([message, ...log.pageErrors.map((e) => `  pageerror: ${e}`)].join('\n'));
  await page.addInitScript(`window.TIMELINE = ${JSON.stringify(timeline)};`);
  await page.goto(pathToFileURL(path.resolve(pagePath)).href);

  const contract = await page.evaluate(() => ({
    render: typeof window.render,
    ready: typeof window.ready?.then,
    meta: window.KIT_META ?? null,
  }));
  if (contract.render !== 'function' || contract.ready !== 'function' || !contract.meta) {
    throw fail(`${pagePath}: window.render / window.ready / window.KIT_META missing; the page must call definePage({ render, ready, meta }) from core/page.js`);
  }
  const meta = contract.meta;
  if (typeof meta.style !== 'string' || !Array.isArray(meta.fonts)) {
    throw fail(`${pagePath}: KIT_META must be { style, fonts: ["700 48px NotoSC", ...] }`);
  }
  const size = FORMATS[meta.format ?? 'portrait'];
  if (!size) throw fail(`${pagePath}: KIT_META.format must be portrait or landscape, got "${meta.format}"`);
  await page.setViewportSize({ width: size.frameW, height: size.frameH });

  try {
    await withTimeout(page.evaluate(() => window.ready.then(() => true)), READY_TIMEOUT_MS,
      `window.ready did not settle within ${READY_TIMEOUT_MS / 1000} s (an image or font never finished loading)`);
  } catch (err) {
    throw fail(`${pagePath}: window.ready failed: ${firstLine(err)}`);
  }

  const fontIssues = await page.evaluate(async ({ specs, text }) => {
    const issues = [];
    for (const spec of specs) {
      try {
        if ((await document.fonts.load(spec, text)).length === 0) issues.push(`${spec}: no @font-face rule matches this family`);
      } catch (err) {
        issues.push(`${spec}: ${err.message ?? err}`);
      }
    }
    return issues;
  }, { specs: meta.fonts, text: timeline.lines.map((line) => line.t).join('') });
  if (fontIssues.length) {
    throw fail(`${pagePath}: fonts failed to load (missing files? run python -X utf8 tools/fetch-fonts.py):\n  ${fontIssues.join('\n  ')}`);
  }
  if (log.pageErrors.length) throw fail(`${pagePath}: the page threw while loading`);
  return { page, meta, timeline, log, size };
}

/**
 * Launch the right browser for a page and open it. The style is only known once the page has run
 * (KIT_META.style), so a pixel page is reopened in a browser launched with the CPU-canvas flags.
 * Returns { browser, page, meta, timeline, log, size, pixel }; the caller closes `browser`.
 */
export async function openVideo(pagePath, timelinePath) {
  let browser = await launchBrowser();
  try {
    let opened = await openPage(browser, pagePath, timelinePath);
    const pixel = opened.meta.style === 'pixel';
    if (pixel) {
      await browser.close();
      browser = await launchBrowser({ pixel: true });
      opened = await openPage(browser, pagePath, timelinePath);
    }
    return { browser, ...opened, pixel };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

/** Draw the frame at time t (seconds); a throw inside render(t) is reported with the time. */
export async function renderAt(page, t) {
  try {
    await page.evaluate((time) => window.render(time), t);
  } catch (err) {
    throw new Error(`render(${t.toFixed(3)}) threw: ${firstLine(err)}`);
  }
}

/** Kit warnings recorded by kitWarn() so far: [{ code, detail }]. */
export function warnings(page) {
  return page.evaluate(() => window.__kitWarnings ?? []);
}

/**
 * A 2D canvas in a blank page of `browser`, used to scale screenshots and encode PNG/WebP without
 * Python or an ffmpeg WebP build. Methods return promises.
 *   drawImage(buffer, mime, x, y, w, h, { smooth })  smooth=false keeps hard pixel edges (nearest)
 *   drawText(text, x, y, { font, color })
 *   encode(mime, quality) -> Buffer
 */
export async function openCanvas(browser, width, height, background = '#000') {
  const page = await browser.newPage();
  await page.evaluate(({ w, h, bg }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    window.sheet = { canvas, g };
  }, { w: width, h: height, bg: background });
  return {
    drawImage: (buffer, mime, x, y, w, h, { smooth = true } = {}) => page.evaluate(async ({ src, x, y, w, h, smooth }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const { g } = window.sheet;
      g.imageSmoothingEnabled = smooth;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, x, y, w, h);
    }, { src: `data:${mime};base64,${buffer.toString('base64')}`, x, y, w, h, smooth }),
    drawText: (text, x, y, { font = '600 18px sans-serif', color = '#fff' } = {}) => page.evaluate(({ text, x, y, font, color }) => {
      const { g } = window.sheet;
      g.font = font;
      g.fillStyle = color;
      g.textBaseline = 'top';
      g.fillText(text, x, y);
    }, { text, x, y, font, color }),
    encode: async (mime, quality) => {
      const url = await page.evaluate(({ mime, quality }) => window.sheet.canvas.toDataURL(mime, quality), { mime, quality });
      // toDataURL silently falls back to PNG for a type it cannot encode.
      if (!url.startsWith(`data:${mime};`)) throw new Error(`this Chromium cannot encode ${mime}`);
      return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    },
    close: () => page.close(),
  };
}

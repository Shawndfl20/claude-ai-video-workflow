// Automatic checks for one kit video (docs/workflow.md): timeline, page contract, glyph
// coverage, caption fit, beat triggers and, when given, the MP4 and its poster. Needs no ffprobe.
// Soft warnings for the review (docs/workflow.md): long lines whose picture stops
// changing, and on-screen text outside the captions that is too small, too dense, overlapping or cut off.
//
// Usage (paths resolve against the current folder):
//   node check.mjs <page.html> <timeline.json> [--lines <lines.json>] [--video <out.mp4>] [--poster <poster.webp>] [--narrated] [--max-seconds 180]
//
// Prints a JSON report { ok, failures, warnings, info } and exits 1 when any hard check fails.
// A timeline with "voice" (from build-voice.py) is treated as narrated even without --narrated.
//
// Environment: CHROMIUM, PLAYWRIGHT_MODULE (see lib/page.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { FPS, FORMATS, openVideo, readTimeline, renderAt, warnings } from './lib/page.mjs';

let maxSeconds = 180;  // YouTube Shorts limit (3 min); --max-seconds 0 turns it off
// render(t) runs at every line start and every 3rd output frame (0.1 s). Each caption chunk stays on
// screen far longer than that, so every chunk is drawn (and fit-checked by the page) at least once.
const SAMPLE_EVERY = 3;
const HARD_WARNINGS = new Set(['trigger-overflow', 'caption-overflow']);
const LINE_TOLERANCE = 0.011;   // end - start vs d, allowing for 2-decimal rounding of both ends
const AUDIO_TOLERANCE = 0.25;   // seconds between the audio and video track lengths
// Review warnings (soft). A line this long needs a visible change in its second half; below STILL the
// picture (captions hidden) counts as unchanged (mean absolute difference per channel, 0..1).
const MOTION_MIN_LINE = 3;
const STILL = 0.0012;
// Text outside the caption boxes: keywords only, readable on a phone.
const TEXT_MIN_PX = 40;
const TEXT_MAX_CHARS = 10;
const CAPTION_IDS = ['sub', 'dlg'];
const SCAN_STEP = 0.1;          // seconds between frames of the reading-time and blank-frame scan
const READ_MIN = 1.5;           // on-screen text must stay at least this long each time it appears
const BLANK_MIN = 0.5;          // a picture with nothing above the captions for this long is a failure
const PICTURE_TOP = { portrait: 1430, landscape: 900 };   // captions start below this; the picture is judged above it
let FORMAT = 'portrait';        // KIT_META.format, set once the page has opened
let SIZE = FORMATS[FORMAT];

const USAGE = 'usage: node check.mjs <page.html> <timeline.json> [--lines <lines.json>] [--video <out.mp4>] [--poster <poster.webp>] [--narrated] [--max-seconds 180]';

const report = { ok: true, failures: [], warnings: [], info: {} };
const fail = (message) => { report.failures.push(message); };
const warn = (message) => { report.warnings.push(message); };
const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

function checkTimeline(timeline, linesPath) {
  if (maxSeconds && timeline.total > maxSeconds) fail(`timeline: total ${timeline.total} s is over the ${maxSeconds} s limit`);
  let prevEnd = 0;
  timeline.lines.forEach((line, i) => {
    const where = `timeline line ${i}`;
    if (!nonEmpty(line.s) || !nonEmpty(line.t)) fail(`${where}: needs non-empty "s" and "t"`);
    if (![line.d, line.start, line.end].every(Number.isFinite)) {
      fail(`${where}: needs numeric "d", "start" and "end"`);
      return;
    }
    if (line.start < prevEnd) fail(`${where}: starts at ${line.start}, before the previous line ends (${prevEnd})`);
    if (Math.abs(line.end - line.start - line.d) > LINE_TOLERANCE) fail(`${where}: end - start differs from d (edited by hand? rebuild the timeline)`);
    prevEnd = line.end;
  });
  if (prevEnd > timeline.total) fail(`timeline: the last line ends at ${prevEnd}, after total ${timeline.total}`);

  if (!linesPath) return;
  const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8'));
  if (lines.length !== timeline.lines.length) {
    fail(`timeline has ${timeline.lines.length} lines but ${path.basename(linesPath)} has ${lines.length}: rebuild the timeline`);
    return;
  }
  const differ = lines.findIndex((line, i) => line.s !== timeline.lines[i].s || line.t !== timeline.lines[i].t);
  if (differ >= 0) fail(`timeline line ${differ} differs from ${path.basename(linesPath)} (s or t): rebuild the timeline`);
}

/**
 * Runs inside the page. Renders every sample time, records which fonts draw which characters (from the
 * computed style of every DOM text node), then tests glyph coverage by drawing each character on a canvas
 * with the font stack followed by different generic families: a character the stack lacks falls through to
 * the generic family, so its pixels change with it. (document.fonts.check cannot do this: it reports true
 * for glyphs a font lacks and even for families that do not exist.)
 */
async function scanPage({ times, maxErrors }) {
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|emoji|math|fangsong|ui-[a-z-]+)$/i;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const used = new Map(); // font key -> { first, multi, chars }
  const notPreloaded = new Set();
  const systemOnly = new Set();
  const errors = [];
  for (const t of times) {
    try {
      window.render(t);
    } catch (err) {
      errors.push(`render(${t.toFixed(3)}) threw: ${err?.message ?? err}`);
      if (errors.length >= maxErrors) break;
      continue;
    }
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const text = node.data.replace(/\s+/g, '');
      const el = node.parentElement;
      if (!text || !el || SKIP.has(el.tagName.toUpperCase())) continue;
      const cs = getComputedStyle(el);
      const stack = cs.fontFamily.split(',').map((f) => f.trim()).filter((f) => f && !GENERIC.test(f.replace(/["']/g, '')));
      if (!stack.length) {
        for (const ch of text) systemOnly.add(ch);
        continue;
      }
      const prefix = `${cs.fontStyle} ${cs.fontWeight} 48px`;
      const key = `${prefix} ${stack.join(', ')}`;
      let font = used.get(key);
      if (!font) used.set(key, font = { first: `${prefix} ${stack[0]}`, multi: stack.length > 1, chars: new Set() });
      for (const ch of text) font.chars.add(ch);
      // False while a matching face is still unloaded: the video would show a fallback font here.
      if (!document.fonts.check(key, text)) notPreloaded.add(key);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const ink = (font, ch) => {
    g.clearRect(0, 0, 64, 64);
    g.font = font;
    g.textBaseline = 'top';
    g.fillText(ch, 4, 4);
    return g.getImageData(0, 0, 64, 64).data;
  };
  const sameInk = (a, b) => {
    for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false;
    return true;
  };
  const lacks = (font, ch) => {
    const base = ink(`${font}, serif`, ch);
    return !sameInk(base, ink(`${font}, sans-serif`, ch)) || !sameInk(base, ink(`${font}, monospace`, ch));
  };
  const missing = {};
  const fallback = {};
  const fonts = {};
  for (const [key, font] of used) {
    const chars = [...font.chars];
    fonts[key] = chars.length;
    const loadError = await document.fonts.load(key, chars.join('')).then(() => null, (err) => err.message ?? String(err));
    if (loadError) {
      missing[key] = `(font failed to load: ${loadError})`;
      continue;
    }
    const miss = chars.filter((ch) => lacks(key, ch));
    if (miss.length) missing[key] = miss.join('');
    if (font.multi) {
      const viaFallback = chars.filter((ch) => !miss.includes(ch) && lacks(font.first, ch));
      if (viaFallback.length) fallback[key] = viaFallback.join('');
    }
  }
  return { errors, missing, fallback, fonts, notPreloaded: [...notPreloaded], systemOnly: [...systemOnly].join('') };
}

async function checkPage(pagePath, timelinePath, timeline) {
  let opened;
  try {
    opened = await openVideo(pagePath, timelinePath);
  } catch (err) {
    fail(`page: ${err.message}`);
    return;
  }
  const { browser, page, meta, log } = opened;
  FORMAT = meta.format ?? 'portrait';
  SIZE = opened.size;
  try {
    const frames = Math.ceil(timeline.total * FPS);
    const times = new Set(timeline.lines.map((line) => line.start).filter(Number.isFinite));
    for (let i = 0; i < frames; i += SAMPLE_EVERY) times.add(i / FPS);
    const scan = await page.evaluate(scanPage, { times: [...times].sort((a, b) => a - b), maxErrors: 5 });
    Object.assign(report.info, { style: meta.style, format: FORMAT, metaFonts: meta.fonts, samples: times.size, textFonts: scan.fonts });

    scan.errors.forEach(fail);
    for (const [font, chars] of Object.entries(scan.missing)) fail(`fonts: "${font}" has no glyph for ${chars}`);
    for (const font of scan.notPreloaded) fail(`fonts: "${font}" was not loaded before its first use; add a matching spec to KIT_META.fonts`);
    for (const [font, chars] of Object.entries(scan.fallback)) warn(`fonts: "${font}" draws ${chars} with a fallback family`);
    if (scan.systemOnly) warn(`fonts: text drawn only in system fonts: ${scan.systemOnly}`);

    await reviewFrames(page, timeline);
    await scanTiming(page, timeline);
    for (const w of await warnings(page)) (HARD_WARNINGS.has(w.code) ? fail : warn)(`${w.code}: ${w.detail}`);
    for (const e of log.pageErrors) fail(`page error: ${e}`);
    for (const e of log.consoleErrors) fail(`console error: ${e}`);
    for (const r of log.failedRequests) fail(`failed request: ${r}`);
  } finally {
    await browser.close();
  }
}

/**
 * Text boxes outside the captions at the current frame: visible DOM text with its drawn size and box.
 * Runs in the page.
 */
function textBoxes(captionIds) {
  const skip = captionIds.map((id) => document.getElementById(id)).filter(Boolean);
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = node.data.replace(/\s+/g, '');
    const el = node.parentElement;
    if (!text || !el || skip.some((c) => c.contains(el)) || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    let visible = true;
    for (let q = el; q && visible; q = q.parentElement) {
      const cs = getComputedStyle(q);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) visible = false;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!visible || r.width < 1 || r.height < 1) continue;
    // Drawn size: the CSS font size times the scale of any transforms above it.
    const scale = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
    out.push({ text, px: parseFloat(getComputedStyle(el).fontSize) * scale, box: [r.left, r.top, r.right, r.bottom] });
  }
  return out;
}

/** Mean absolute difference (0..1) of two JPEG data URLs, compared at 108x192. Runs in the page. */
async function frameDiff([a, b]) {
  const pixels = async (src) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = new OffscreenCanvas(108, 192);
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0, 108, 192);
    return g.getImageData(0, 0, 108, 192).data;
  };
  const x = await pixels(a), y = await pixels(b);
  let sum = 0;
  for (let i = 0; i < x.length; i += 4) sum += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
  return sum / (x.length / 4) / 3 / 255;
}

/**
 * Review warnings from real frames. For every line: text outside the captions at its midpoint (too small,
 * too many characters, overlapping another text box, reaching past the frame). For lines of at least
 * MOTION_MIN_LINE seconds: whether the picture (captions hidden) still changes between the midpoint and
 * the end. These are review aids, not failures: a deliberate hold or an overlapping label can be right.
 */
async function reviewFrames(page, timeline) {
  const shot = async (t) => {
    await renderAt(page, t);
    await page.evaluate((ids) => ids.forEach((id) => { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }), CAPTION_IDS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: SIZE.frameW, height: SIZE.frameH } });
    await page.evaluate((ids) => ids.forEach((id) => { const e = document.getElementById(id); if (e) e.style.visibility = ''; }), CAPTION_IDS);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  };
  const still = [], small = [], dense = [], overlap = [], offFrame = [];
  for (const [i, line] of timeline.lines.entries()) {
    const mid = (line.start + line.end) / 2;
    await renderAt(page, mid);
    const boxes = await page.evaluate(textBoxes, CAPTION_IDS);
    const chars = boxes.reduce((n, b) => n + b.text.length, 0);
    if (chars > TEXT_MAX_CHARS) dense.push(`${i}(${chars})`);
    for (const b of boxes) {
      if (b.px < TEXT_MIN_PX) small.push(`${i}:"${b.text.slice(0, 12)}" ${Math.round(b.px)}px`);
      // Cut by the frame edge: partly inside, partly outside (text wholly outside, e.g. waiting in a pan, is fine).
      const [l, t, r, btm] = b.box;
      const inside = r > 0 && btm > 0 && l < SIZE.frameW && t < SIZE.frameH;
      if (inside && (l < -4 || t < -4 || r > SIZE.frameW + 4 || btm > SIZE.frameH + 4)) offFrame.push(`${i}:"${b.text.slice(0, 12)}"`);
    }
    for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++) {
      const [p, q] = [boxes[a].box, boxes[c].box];
      const w = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), h = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
      const smaller = Math.min((p[2] - p[0]) * (p[3] - p[1]), (q[2] - q[0]) * (q[3] - q[1]));
      if (w > 0 && h > 0 && w * h > 0.2 * smaller) overlap.push(`${i}:"${boxes[a].text.slice(0, 8)}"/"${boxes[c].text.slice(0, 8)}"`);
    }
    if (line.d >= MOTION_MIN_LINE) {
      const change = await page.evaluate(frameDiff, [await shot(mid), await shot(line.end - 0.15)]);
      if (change < STILL) still.push(i);
    }
  }
  const list = (items) => [...new Set(items)].join(', ');
  if (still.length) warn(`static-line: lines ${list(still)} (${MOTION_MIN_LINE} s or longer) show no visible change in their second half`);
  if (small.length) warn(`text-small: on-screen text under ${TEXT_MIN_PX}px at line midpoints: ${list(small)}`);
  if (dense.length) warn(`text-dense: more than ${TEXT_MAX_CHARS} characters of on-screen text besides the captions at lines ${list(dense)}`);
  if (overlap.length) warn(`text-overlap: text boxes overlapping at line midpoints: ${list(overlap)}`);
  if (offFrame.length) warn(`text-offframe: text cut by the frame edge at line midpoints: ${list(offFrame)}`);
}

/**
 * In the page: what is visible above the captions at this moment. Returns the on-screen texts (keyed by
 * element, so the same words in two places count separately) and the number of visible picture elements.
 * Visible = every ancestor displayed, product of opacities > 0.3, not scaled below 20 %, inside the frame.
 */
function visibleNow({ captionIds, top, frameW }) {
  const skip = captionIds.map((id) => document.getElementById(id)).filter(Boolean);
  const alpha = (e) => {
    let a = 1;
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      a *= +cs.opacity;
      const m = cs.transform.match(/matrix\(([^,]+),\s*([^,]+)/);
      if (m && Math.hypot(+m[1], +m[2]) < 0.2) return 0;
    }
    return a;
  };
  const shown = (e) => {
    if (skip.some((s) => s.contains(e))) return false;
    const r = e.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4 && r.bottom > 0 && r.top < top && r.right > 0 && r.left < frameW && alpha(e) > 0.3;
  };
  let n = 0;
  window.__scanIds ??= new WeakMap(); window.__scanNext ??= 0;
  const texts = [];
  for (const e of document.querySelectorAll('svg, img, canvas, div')) {
    const own = [...e.childNodes].some((c) => c.nodeType === 3 && c.data.trim());
    if (e.tagName === 'DIV' && !own) {
      // a plain wrapper div draws nothing itself; a box with a fill or a border does
      const cs = getComputedStyle(e);
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
      if (!filled && !bordered) continue;
    }
    // the shell's own layers (frame, background, vignette, grain, pixel stage canvas) are not picture content
    if (e.id === 'frame' || e.closest('#bg, #vig, #grain') || e.id === 'cv') continue;
    if (!shown(e)) continue;
    n++;
    if (own) {
      if (!window.__scanIds.has(e)) window.__scanIds.set(e, window.__scanNext++);
      texts.push(`${window.__scanIds.get(e)}\u0000${e.textContent.trim()}`);
    }
  }
  return { n, texts };
}

/**
 * Reading time and blank frames, scanned every SCAN_STEP seconds over the whole video:
 * - text-brief: a text that appears and is gone again within READ_MIN seconds cannot be read;
 * - blank-frame: nothing at all above the captions for BLANK_MIN seconds or longer.
 * Both are failures: fix the picture (hold the text longer, or do not show it; put a subject in the empty frame).
 */
async function scanTiming(page, timeline) {
  const runs = new Map(); // text key -> [[from, to], ...]
  const blanks = [];
  let blankFrom = null;
  const end = timeline.total;
  for (let k = 0; k * SCAN_STEP <= end + 1e-6; k++) {
    const t = Math.min(k * SCAN_STEP, end);
    await renderAt(page, t);
    const { n, texts } = await page.evaluate(visibleNow, { captionIds: CAPTION_IDS, top: PICTURE_TOP[FORMAT], frameW: SIZE.frameW });
    for (const entry of texts) {
      // keyed by the words with digits masked, not by element: a ticking price stays one text, and pooled
      // elements (pixel kw()) that hand the same word to another node do not break it
      const words = entry.split('\u0000')[1];
      const key = words.replace(/\d/g, '#');
      const r = runs.get(key) ?? [];
      const last = r[r.length - 1];
      if (last && t - last[1] < SCAN_STEP * 1.5) last[1] = t; else r.push([t, t, words]);
      runs.set(key, r);
    }
    if (n === 0 && blankFrom === null) blankFrom = t;
    if (n > 0 && blankFrom !== null) { blanks.push([blankFrom, t]); blankFrom = null; }
  }
  if (blankFrom !== null) blanks.push([blankFrom, end]);
  // the pixel style paints the whole picture into one canvas, so the DOM cannot tell an empty frame
  const domPicture = (await page.evaluate(() => window.KIT_META?.style)) !== 'pixel';
  const lineAt = (t) => Math.max(0, timeline.lines.findIndex((l) => t < l.end + 0.3));
  const brief = [];
  for (const r of runs.values()) for (const [a, b, words] of r) {
    const shownFor = b - a + SCAN_STEP;
    // text still on screen when the video ends has not left; it is judged by the end hold instead
    // a bare symbol flying off (+, −, ✓) is motion, not something to read
    if (!/[\p{L}\p{N}]/u.test(words)) continue;
    if (shownFor < READ_MIN && b < end - SCAN_STEP) brief.push(`line ${lineAt(a)} "${words.slice(0, 12)}" ${shownFor.toFixed(1)} s at ${a.toFixed(1)} s`);
  }
  if (brief.length) fail(`text-brief: on-screen text shown for less than ${READ_MIN} s (hold it longer or leave it out): ${brief.join('; ')}`);
  const empty = blanks.filter(([a, b]) => b - a >= BLANK_MIN).map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)} s (line ${lineAt(a)})`);
  if (domPicture && empty.length) fail(`blank-frame: nothing on screen above the captions for ${BLANK_MIN} s or longer: ${empty.join(', ')}`);
}

// --- MP4 (ISO BMFF) box parsing, enough to read track type, codec, size and sample count ---

function readBoxes(buf, start, end) {
  const boxes = [];
  for (let p = start; p + 8 <= end;) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let head = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8));
      head = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < head || p + size > end) throw new Error(`corrupt box "${type}" at byte ${p}`);
    boxes.push({ type, start: p + head, end: p + size });
    p += size;
  }
  return boxes;
}

function child(buf, box, ...types) {
  let found = box;
  for (const type of types) {
    found = readBoxes(buf, found.start, found.end).find((b) => b.type === type);
    if (!found) throw new Error(`box "${type}" missing`);
  }
  return found;
}

function trackInfo(buf, trak) {
  const mdia = child(buf, trak, 'mdia');
  const hdlr = child(buf, mdia, 'hdlr');
  const mdhd = child(buf, mdia, 'mdhd');
  const stbl = child(buf, mdia, 'minf', 'stbl');
  const stsd = child(buf, stbl, 'stsd');
  const stsz = child(buf, stbl, 'stsz');
  const v1 = buf[mdhd.start] === 1;
  const timescale = buf.readUInt32BE(mdhd.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(buf.readBigUInt64BE(mdhd.start + 24)) : buf.readUInt32BE(mdhd.start + 16);
  const entry = stsd.start + 8; // after version/flags and entry_count
  const info = {
    handler: buf.toString('latin1', hdlr.start + 8, hdlr.start + 12),
    codec: buf.toString('latin1', entry + 4, entry + 8),
    samples: buf.readUInt32BE(stsz.start + 8),
    seconds: Math.round((duration / timescale) * 1000) / 1000,
  };
  if (info.handler === 'vide') Object.assign(info, { width: buf.readUInt16BE(entry + 32), height: buf.readUInt16BE(entry + 34) });
  return info;
}

function checkVideo(videoPath, timeline, narrated) {
  const buf = fs.readFileSync(videoPath);
  const top = readBoxes(buf, 0, buf.length);
  const order = top.map((b) => b.type);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Error('no moov box');
  const tracks = readBoxes(buf, moov.start, moov.end).filter((b) => b.type === 'trak').map((trak) => trackInfo(buf, trak));
  report.info.video = { file: videoPath, bytes: buf.length, boxes: order, tracks };

  if (order[0] !== 'ftyp') fail('video: does not start with an ftyp box');
  if (!order.includes('mdat') || order.indexOf('moov') > order.indexOf('mdat')) fail('video: moov is not before mdat (encode with -movflags +faststart)');
  const videos = tracks.filter((t) => t.handler === 'vide');
  const audios = tracks.filter((t) => t.handler === 'soun');
  if (videos.length !== 1) {
    fail(`video: expected one video track, found ${videos.length}`);
    return;
  }
  const [v] = videos;
  const expected = Math.ceil(timeline.total * FPS);
  if (v.codec !== 'avc1') fail(`video: codec ${v.codec}, expected avc1 (H.264)`);
  if (v.width !== SIZE.outW || v.height !== SIZE.outH) fail(`video: ${v.width}x${v.height}, expected ${SIZE.outW}x${SIZE.outH}`);
  if (Math.abs(v.samples - expected) > 1) fail(`video: ${v.samples} frames, expected ${expected} (ceil(total x ${FPS}); a partial or stale render?)`);
  if (Math.abs(v.samples / v.seconds - FPS) > 0.5) fail(`video: ${(v.samples / v.seconds).toFixed(2)} fps, expected ${FPS}`);
  if (maxSeconds && v.seconds > maxSeconds) fail(`video: ${v.seconds} s is over the ${maxSeconds} s limit`);
  if (narrated && audios.length !== 1) fail(`video: narrated but has ${audios.length} audio tracks`);
  if (!narrated && audios.length) fail('video: silent timeline but the video has an audio track (pass --narrated if it should be voiced)');
  for (const a of audios) {
    if (a.codec !== 'mp4a') fail(`video: audio codec ${a.codec}, expected mp4a (AAC)`);
    if (Math.abs(a.seconds - v.seconds) > AUDIO_TOLERANCE) fail(`video: audio lasts ${a.seconds} s but video ${v.seconds} s`);
  }
}

function checkPoster(posterPath) {
  const buf = fs.readFileSync(posterPath);
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP file (no RIFF/WEBP header)');
  const chunk = buf.toString('latin1', 12, 16);
  let size;
  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, start code 9d 01 2a, then 14-bit width and height.
    if (buf.readUIntBE(23, 3) !== 0x9d012a) throw new Error('bad VP8 start code');
    size = { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  } else if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21); // after the 0x2f signature byte
    size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  } else if (chunk === 'VP8X') {
    size = { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  } else {
    throw new Error(`unknown WebP chunk "${chunk}"`);
  }
  report.info.poster = { file: posterPath, bytes: buf.length, format: chunk.trim(), ...size };
  if (size.width !== SIZE.outW || size.height !== SIZE.outH) fail(`poster: ${size.width}x${size.height}, expected ${SIZE.outW}x${SIZE.outH}`);
}

async function main() {
  const { values: opt, positionals } = parseArgs({
    allowPositionals: true,
    options: { lines: { type: 'string' }, video: { type: 'string' }, poster: { type: 'string' }, narrated: { type: 'boolean', default: false }, 'max-seconds': { type: 'string', default: '200' } },
  });
  if (positionals.length !== 2) throw new Error(USAGE);
  maxSeconds = Number(opt['max-seconds']);
  if (!(maxSeconds >= 0)) throw new Error(`--max-seconds must be a number >= 0, got ${opt['max-seconds']}`);
  const [pagePath, timelinePath] = positionals.map((p) => path.resolve(p));
  Object.assign(report.info, { page: pagePath, timeline: timelinePath });

  const timeline = readTimeline(timelinePath);
  const narrated = opt.narrated || Boolean(timeline.voice);
  Object.assign(report.info, { lines: timeline.lines.length, total: timeline.total, frames: Math.ceil(timeline.total * FPS), narrated });
  checkTimeline(timeline, opt.lines && path.resolve(opt.lines));
  await checkPage(pagePath, timelinePath, timeline);
  for (const [name, file, check] of [['video', opt.video, (f) => checkVideo(f, timeline, narrated)], ['poster', opt.poster, checkPoster]]) {
    if (!file) continue;
    try {
      check(path.resolve(file));
    } catch (err) {
      fail(`${name}: ${err.message}`);
    }
  }

  report.ok = report.failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`check: ${err.message}`);
  process.exit(1);
});

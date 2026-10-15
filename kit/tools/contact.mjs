// Contact sheet for reviewing a kit page without rendering the video: a grid of quarter-size thumbnails
// (270x480 portrait, 480x270 landscape),
// each with a strip naming the line, its scene key and the time.
//
// Usage (paths resolve against the current folder):
//   node contact.mjs <page.html> <timeline.json> <out.png> [--mode lines|beats] [--cols 6]
//
//   lines  one frame per line, at its midpoint
//   beats  start, middle and end of every line (the SOP's three frames per beat: they show jumps,
//          wrong positions, missing motion and broken transitions)
//
// Environment: CHROMIUM, PLAYWRIGHT_MODULE (see lib/page.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { openVideo, openCanvas, renderAt, warnings } from './lib/page.mjs';

const STRIP = 28;   // caption strip under each tile
const GAP = 8;
const HEAD = 40;    // title row

const USAGE = 'usage: node contact.mjs <page.html> <timeline.json> <out.png> [--mode lines|beats] [--cols 6]';

async function main() {
  const { values: opt, positionals } = parseArgs({
    allowPositionals: true,
    options: { mode: { type: 'string', default: 'lines' }, cols: { type: 'string', default: '6' } },
  });
  if (positionals.length !== 3) throw new Error(USAGE);
  if (!['lines', 'beats'].includes(opt.mode)) throw new Error(`--mode must be lines or beats, got "${opt.mode}"`);
  const cols = Number(opt.cols);
  if (!Number.isInteger(cols) || cols < 1) throw new Error(`--cols must be a positive integer, got "${opt.cols}"`);
  const [pagePath, timelinePath, outPath] = positionals.map((p) => path.resolve(p));

  const { browser, page, timeline, log, size } = await openVideo(pagePath, timelinePath);
  const TILE_W = size.frameW / 4, TILE_H = size.frameH / 4;
  try {
    const shots = timeline.lines.flatMap((line, i) => {
      const mid = (line.start + line.end) / 2;
      return opt.mode === 'lines'
        ? [{ i, s: line.s, t: mid, tag: '' }]
        : [['start', line.start], ['mid', mid], ['end', line.end]].map(([tag, t]) => ({ i, s: line.s, t, tag }));
    });
    const rows = Math.ceil(shots.length / cols);
    const width = GAP + cols * (TILE_W + GAP);
    const height = HEAD + rows * (TILE_H + STRIP + GAP) + GAP;
    const sheet = await openCanvas(browser, width, height, '#1b1b1f');
    await sheet.drawText(`${path.basename(pagePath)} · ${path.basename(timelinePath)} · ${opt.mode} · ${shots.length} frames · ${timeline.total} s`,
      GAP, 11, { font: '600 18px sans-serif', color: '#e8e8ea' });

    for (const [n, shot] of shots.entries()) {
      const x = GAP + (n % cols) * (TILE_W + GAP);
      const y = HEAD + Math.floor(n / cols) * (TILE_H + STRIP + GAP);
      await renderAt(page, shot.t);
      if (log.pageErrors.length) throw new Error(`page error at t=${shot.t.toFixed(3)}: ${log.pageErrors[0]}`);
      await sheet.drawImage(await page.screenshot({ type: 'jpeg', quality: 85 }), 'image/jpeg', x, y, TILE_W, TILE_H);
      await sheet.drawText(`#${shot.i} ${shot.s} ${shot.t.toFixed(2)}s ${shot.tag}`, x + 4, y + TILE_H + 6,
        { font: '600 15px sans-serif', color: '#c9c9cf' });
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, await sheet.encode('image/png'));
    console.log(`wrote ${outPath}: ${shots.length} frames, ${width}x${height}, ${fs.statSync(outPath).size} bytes`);
    for (const w of await warnings(page)) console.log(`warning ${w.code}: ${w.detail}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`contact: ${err.message}`);
  process.exit(1);
});

// Render a kit page to the site video: 720x1280 portrait or 1920x1080 landscape (KIT_META.format), 30 fps, H.264 (+ AAC when narrated), faststart,
// and optionally its WebP poster.
//
// Usage (paths resolve against the current folder):
//   node render.mjs <page.html> <timeline.json> <out.mp4> [--audio <voice.wav>] [--poster <seconds>] [--from <s>] [--to <s>] [--workers <n>]
//
// --audio defaults to the timeline's "voice" (written by build-voice.py, relative to the timeline file).
// --poster also writes <out>-poster.webp: the frame at that time, at the video size, encoded by Chromium.
// --from/--to render only that window (for quick looks; check.mjs expects full renders).
// --workers n draws frames in n browser pages at once (for heavy pages such as MVs); frames go through a temp folder.
// The video is encoded to <out>.tmp.mp4 and moved into place only when everything succeeded, so a failed
// render never replaces or truncates a shipped file. Any uncaught page error aborts the render.
//
// Environment: FFMPEG (an ffmpeg with libx264, else `ffmpeg` on PATH), CHROMIUM, PLAYWRIGHT_MODULE (see lib/page.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { FPS, openVideo, openPage, openCanvas, renderAt, warnings } from './lib/page.mjs';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const JPEG_QUALITY = 92;     // frame transport into ffmpeg; the final quality is set by crf
const POSTER_QUALITY = 0.8;
const LOG_EVERY = 300;       // frames between progress lines

const USAGE = 'usage: node render.mjs <page.html> <timeline.json> <out.mp4> [--audio <voice.wav>] [--poster <seconds>] [--from <s>] [--to <s>] [--workers <n>]';

/**
 * Spawn ffmpeg reading JPEG frames from stdin. write() applies pipe backpressure and throws as soon as
 * ffmpeg has stopped; finish() closes the pipe and throws unless ffmpeg exited cleanly.
 */
function startEncoder(args) {
  const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  let exit = null; // 'ok' or why ffmpeg stopped
  const exited = new Promise((resolve) => {
    proc.once('error', (err) => {
      exit ??= err.code === 'ENOENT' ? `ffmpeg not found ("${FFMPEG}"); set FFMPEG to an ffmpeg build with libx264` : `ffmpeg failed: ${err.message}`;
      resolve();
    });
    proc.once('close', (code, signal) => {
      exit ??= code === 0 ? 'ok' : `ffmpeg exited with ${code ?? signal}`;
      resolve();
    });
  });
  proc.stdin.on('error', () => {}); // EPIPE after ffmpeg died; the reason is reported through `exit`
  const stopped = () => new Error(exit === 'ok' ? 'ffmpeg exited before all frames were written' : exit);
  return {
    async write(buffer) {
      if (exit) throw stopped();
      if (!proc.stdin.write(buffer)) await Promise.race([once(proc.stdin, 'drain').catch(() => {}), exited]);
      if (exit) throw stopped();
    },
    async finish() {
      proc.stdin.end();
      await exited;
      if (exit !== 'ok') throw stopped();
    },
    async abort() {
      if (!exit) proc.kill();
      await exited;
    },
  };
}

function seconds(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a number of seconds, got "${value}"`);
  return n;
}

async function main() {
  const { values: opt, positionals } = parseArgs({
    allowPositionals: true,
    options: { audio: { type: 'string' }, poster: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, workers: { type: 'string', default: '1' } },
  });
  if (positionals.length !== 3) throw new Error(USAGE);
  const [pagePath, timelinePath, outPath] = positionals.map((p) => path.resolve(p));
  if (!outPath.endsWith('.mp4')) throw new Error(`output must be an .mp4 file: ${outPath}`);
  const stem = outPath.slice(0, -'.mp4'.length);
  const tmpVideo = `${stem}.tmp.mp4`;
  const posterPath = `${stem}-poster.webp`;
  const tmpPoster = `${stem}-poster.tmp.webp`;

  const { browser, page, timeline, log, size, pixel } = await openVideo(pagePath, timelinePath);
  const { outW, outH } = size;
  try {
    const total = timeline.total;
    const frames = Math.ceil(total * FPS);
    const from = opt.from === undefined ? 0 : seconds(opt.from, 'from');
    const to = opt.to === undefined ? total : seconds(opt.to, 'to');
    const posterT = opt.poster === undefined ? null : seconds(opt.poster, 'poster');
    if (from >= to || from >= total) throw new Error(`empty window: --from ${from} --to ${to} (timeline total ${total} s)`);
    if (posterT !== null && posterT > total) throw new Error(`--poster ${posterT} is after the end (${total} s)`);
    const first = Math.floor(from * FPS);
    const end = Math.min(frames, Math.ceil(to * FPS));

    const audio = opt.audio ? path.resolve(opt.audio)
      : timeline.voice ? path.resolve(path.dirname(timelinePath), timeline.voice) : null;
    if (audio && !fs.existsSync(audio)) throw new Error(`audio not found: ${audio}`);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const encoder = startEncoder([
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      ...(audio ? [...(first ? ['-ss', String(first / FPS)] : []), '-i', audio] : []),
      // Pixel art keeps hard edges (6 page px per art px -> 4 output px); drawn art gets a smooth scaler.
      // The JPEG frames are full range; convert to limited (tv) range and drop the colour tags, so the file
      // matches the site's other videos and opens in every player. The output is the final file: no re-encode.
      '-vf', `scale=${outW}:${outH}:flags=${pixel ? 'neighbor' : 'lanczos'}:in_range=pc:out_range=tv,`
        + 'setparams=range=unknown:color_primaries=unknown:color_trc=unknown:colorspace=unknown',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
      // apad + shortest: the video sets the length, so a voice track a few ms short never drops the last frame.
      ...(audio ? ['-c:a', 'aac', '-b:a', '96k', '-af', 'apad', '-shortest'] : ['-an']),
      '-movflags', '+faststart', tmpVideo,
    ]);

    const t0 = Date.now();
    const elapsed = () => `${Math.round((Date.now() - t0) / 1000)} s`;
    console.log(`render ${path.basename(pagePath)}: frames ${first}-${end - 1} of ${frames} (${pixel ? 'pixel' : 'smooth'} scaling)${audio ? `, audio ${path.basename(audio)}` : ', silent'}`);
    let encoded = false;
    const extraLogs = []; // logs of the extra worker pages; checked with the first page's log before shipping
    const allErrors = () => [log, ...extraLogs].flatMap((l) => l.pageErrors);
    const workers = Math.max(1, Math.floor(Number(opt.workers)) || 1);
    const frameDir = `${stem}.frames`;
    try {
      if (workers === 1) {
        for (let i = first; i < end; i++) {
          await renderAt(page, i / FPS);
          if (log.pageErrors.length) throw new Error(`page error at t=${(i / FPS).toFixed(3)}: ${log.pageErrors[0]}`);
          await encoder.write(await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY }));
          if ((i - first) % LOG_EVERY === 0) console.log(`  frame ${i}/${frames}  ${elapsed()}`);
        }
      } else {
        // Each extra page draws every n-th frame into frameDir; the encoder then reads them in order.
        fs.rmSync(frameDir, { recursive: true, force: true });
        fs.mkdirSync(frameDir, { recursive: true });
        const file = (i) => path.join(frameDir, `${String(i).padStart(6, '0')}.jpg`);
        // Every worker keeps its own page and log: an uncaught error in any page must fail the render.
        const pool = [{ page, log }];
        for (let w = 1; w < workers; w++) { const opened = await openPage(browser, pagePath, timelinePath); extraLogs.push(opened.log); pool.push(opened); }
        let done = 0;
        await Promise.all(pool.map(async ({ page: p, log: l }, w) => {
          for (let i = first + w; i < end; i += workers) {
            await renderAt(p, i / FPS);
            if (l.pageErrors.length) throw new Error(`page error at t=${(i / FPS).toFixed(3)} (worker ${w + 1}): ${l.pageErrors[0]}`);
            fs.writeFileSync(file(i), await p.screenshot({ type: 'jpeg', quality: JPEG_QUALITY }));
            if (++done % LOG_EVERY === 0) console.log(`  ${done}/${end - first} frames  ${elapsed()}`);
          }
        }));
        for (let i = first; i < end; i++) await encoder.write(fs.readFileSync(file(i)));
      }
      await encoder.finish();
      encoded = true;

      if (posterT !== null) {
        await renderAt(page, posterT);
        const png = await page.screenshot({ type: 'png' });
        const canvas = await openCanvas(browser, outW, outH);
        await canvas.drawImage(png, 'image/png', 0, 0, outW, outH, { smooth: !pixel });
        fs.writeFileSync(tmpPoster, await canvas.encode('image/webp', POSTER_QUALITY));
        await canvas.close();
      }
      if (allErrors().length) throw new Error(`page error: ${allErrors()[0]}`);

      fs.renameSync(tmpVideo, outPath);
      if (posterT !== null) fs.renameSync(tmpPoster, posterPath);
    } finally {
      if (!encoded) await encoder.abort();
      fs.rmSync(tmpVideo, { force: true });
      fs.rmSync(tmpPoster, { force: true });
      fs.rmSync(frameDir, { recursive: true, force: true });
    }

    console.log(`done ${outPath}: ${end - first} frames, ${((end - first) / FPS).toFixed(2)} s of video, rendered in ${elapsed()}, ${fs.statSync(outPath).size} bytes`);
    if (posterT !== null) console.log(`poster ${posterPath}: t=${posterT} s, ${fs.statSync(posterPath).size} bytes`);
    for (const w of await warnings(page)) console.log(`warning ${w.code}: ${w.detail}`);
    for (const l of [log, ...extraLogs]) {
      for (const e of l.consoleErrors) console.log(`console error: ${e}`);
      for (const r of l.failedRequests) console.log(`failed request: ${r}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`render: ${err.message}`);
  process.exit(1);
});

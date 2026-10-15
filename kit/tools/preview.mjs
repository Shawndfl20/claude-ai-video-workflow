/* Local preview of a video folder: a dependency-free static server that injects the timeline and a
   scrubber panel into every HTML page it serves.

     node kit/tools/preview.mjs <videoDir> [--port 4173]
     open http://127.0.0.1:4173/<page>.html?timeline=<timeline.json>

   - /kit/... is served from this kit, so a video's ../kit/ paths resolve.
   - Any other path is served from <videoDir>, then from its parent folder, so sibling folders
     references resolve as they do on disk.
   - An HTML page gets window.TIMELINE (from ?timeline=, a path relative to the page; default
     timeline-<page>.json next to it) at the top of <head>, and the scrubber panel at the end of <body>.
   The panel is the only code that uses requestAnimationFrame and wall-clock time; the page itself stays
   a pure function of t. Nothing is cached, so a reload shows every edit (the panel keeps t in #t=). */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const KIT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT_MOUNT = "/kit/";
const TEXT = "text/plain; charset=utf-8";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": TEXT, ".txt": TEXT,
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".otf": "font/otf", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
};

function usage(message) {
  if (message) console.error(message);
  console.error("usage: node preview.mjs <videoDir> [--port 4173]");
  process.exit(2);
}

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { port: { type: "string", default: "4173" } } });
} catch (err) {
  usage(err.message);
}
if (args.positionals.length !== 1) usage();
const videoDir = path.resolve(args.positionals[0]);
if (!fs.statSync(videoDir, { throwIfNoEntry: false })?.isDirectory()) usage(`not a folder: ${videoDir}`);
const parentDir = path.dirname(videoDir);
const port = Number(args.values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) usage(`bad --port: ${args.values.port}`);

/** Map a decoded URL path to a file: the kit mount, else the video folder, else its parent. */
function resolveFile(urlPath) {
  const clean = path.posix.normalize(urlPath);
  const tries = clean.startsWith(KIT_MOUNT) ? [[KIT_DIR, clean.slice(KIT_MOUNT.length)]] : [[videoDir, clean], [parentDir, clean]];
  for (const [root, rel] of tries) {
    const file = path.resolve(root, "." + path.posix.sep + rel);
    if (!file.startsWith(root + path.sep)) continue; // e.g. backslash "..\" segments on Windows
    if (fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return file;
  }
  return null;
}

/** JSON that is safe inside an inline <script>. */
const scriptJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** Default timeline of a page: timeline-<page>.json in the same folder. */
const defaultTimeline = (page) => `timeline-${path.basename(page, ".html")}.json`;

/** A video page with the timeline, an error collector and the scrubber panel injected. */
function previewPage(file, pagePath, timelineParam) {
  const tlPath = path.posix.resolve(path.posix.dirname(pagePath), timelineParam || defaultTimeline(file));
  const tlFile = resolveFile(tlPath);
  if (timelineParam && !tlFile) throw new Error(`timeline not found: ${tlPath}`);
  let timeline = null;
  if (tlFile) {
    try {
      timeline = JSON.parse(fs.readFileSync(tlFile, "utf8"));
    } catch (err) {
      throw new Error(`${tlPath} is not valid JSON: ${err.message}`);
    }
  }
  const head = (timeline ? `<script>window.TIMELINE = ${scriptJson(timeline)};</script>` : "") + `<script>(${collectErrors})();</script>`;
  const tail = `<script>(${previewPanel})(${scriptJson({ timeline: tlFile ? tlPath : null })});</script>`;
  const html = fs.readFileSync(file, "utf8");
  const headTag = /<head(\s[^>]*)?>/i;
  if (!headTag.test(html)) throw new Error(`${pagePath} has no <head> tag to inject the timeline into`);
  const withHead = html.replace(headTag, (tag) => tag + head);
  const end = withHead.toLowerCase().lastIndexOf("</body>");
  return end < 0 ? withHead + tail : withHead.slice(0, end) + tail + withHead.slice(end);
}

function indexPage() {
  const files = fs.readdirSync(videoDir);
  const items = files.filter((f) => f.endsWith(".html")).map((p) => {
    const href = files.includes(defaultTimeline(p)) ? `${p}?timeline=${defaultTimeline(p)}` : p;
    return `<li><a href="${esc(encodeURI(href))}">${esc(href)}</a></li>`;
  });
  const timelines = files.filter((f) => /^timeline.*\.json$/.test(f)).map(esc).join(", ") || "none";
  return `<!doctype html><meta charset="utf-8"><title>preview</title><body style="font:15px/1.6 system-ui,sans-serif;padding:24px">
<h3>${esc(videoDir)}</h3><ul>${items.join("") || "<li>no .html pages</li>"}</ul>
<p>Timelines here: ${timelines}. Use <code>?timeline=&lt;file&gt;</code> to pick another.</p>`;
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  let urlPath;
  try {
    urlPath = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, TEXT, "bad URL");
  }
  if (urlPath === "/") return send(res, 200, TYPES[".html"], indexPage());
  if (urlPath === "/favicon.ico") return send(res, 204, TEXT, "");
  const file = resolveFile(urlPath);
  if (!file) {
    console.log(`404 ${urlPath}`);
    return send(res, 404, TEXT, `not found: ${urlPath}`);
  }
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return send(res, 200, TYPES[".html"], previewPage(file, urlPath, url.searchParams.get("timeline")));
  send(res, 200, TYPES[ext] || "application/octet-stream", fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (err) {
    console.log(`500 ${req.url}: ${err.message}`);
    send(res, 500, TEXT, err.message);
  }
});
server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `port ${port} is in use; pass --port <n>` : err.message);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  const base = `http://127.0.0.1:${port}/`;
  console.log(`preview of ${videoDir}\n  ${base}`);
  for (const p of fs.readdirSync(videoDir).filter((f) => f.endsWith(".html"))) {
    if (fs.existsSync(path.join(videoDir, defaultTimeline(p)))) console.log(`  ${base}${p}?timeline=${defaultTimeline(p)}`);
  }
  console.log("Ctrl+C to stop");
});

/* ---------------- code serialised into the page (runs in the browser, never in Node) ---------------- */

/** Injected at the top of <head>: collects script errors, failed script/style loads and unhandled rejections. */
function collectErrors() {
  const errors = (window.__previewErrors = []);
  window.addEventListener("error", (e) => {
    const src = e.target && (e.target.src || e.target.href);
    errors.push(e.message ? `${e.message} (${e.filename}:${e.lineno})` : `failed to load ${src}`);
  }, true);
  window.addEventListener("unhandledrejection", (e) => errors.push(`unhandled rejection: ${(e.reason && e.reason.message) || e.reason}`));
}

/**
 * Injected at the end of <body>: a fixed panel with play/pause at 1x, a scrubber, frame stepping, the
 * line list, the current scene and line, page errors and kit warnings. The frame (the <body> size) is scaled
 * to fit beside the panel with a CSS transform on <body>; layout sizes, and so checkFit, are unchanged.
 */
function previewPanel({ timeline }) {
  const TLD = window.TIMELINE;
  const FPS = 30, PANEL = 380;
  const errors = window.__previewErrors;
  const report = (msg) => { if (!errors.includes(msg)) errors.push(msg); };

  const panel = document.createElement("div");
  panel.id = "__pv";
  panel.innerHTML = `<style>
#__pv { position: fixed; top: 0; right: 0; width: ${PANEL}px; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: #15161c; color: #e8e8ee; font: 13px/1.45 system-ui, sans-serif; z-index: 2147483647; }
#__pv * { box-sizing: border-box; }
#__pv button { font: inherit; padding: 3px 12px; background: #2c2e3a; color: inherit; border: 1px solid #454858; border-radius: 4px; cursor: pointer; }
#__pv input { width: 100%; margin: 0; }
#__pv .pv-row { display: flex; gap: 8px; align-items: center; }
#__pv .pv-time { margin-left: auto; font-variant-numeric: tabular-nums; }
#__pv .pv-now { min-height: 3.4em; padding: 6px 8px; background: #20222c; border-radius: 4px; white-space: pre-wrap; }
#__pv .pv-muted { color: #9a9cab; }
#__pv .pv-err { color: #ff8a8a; white-space: pre-wrap; }
#__pv .pv-warn { color: #ffc86b; white-space: pre-wrap; }
#__pv .pv-lines { position: relative; flex: 1; overflow: auto; border-top: 1px solid #333645; }
#__pv .pv-line { display: grid; grid-template-columns: 2.2em 3.8em 1fr; gap: 6px; padding: 3px 4px; border-radius: 3px; cursor: pointer; }
#__pv .pv-line:hover { background: #262836; }
#__pv .pv-line.pv-on { background: #33406b; }
</style>
<div class="pv-row"><button data-act="play">Play</button><button data-act="fit">1:1</button><span class="pv-time"></span></div>
<input type="range" min="0" step="any">
<div class="pv-now"></div>
<div class="pv-err"></div>
<div class="pv-warn"></div>
<div class="pv-muted">space play/pause · ←/→ one frame (shift: 1 s) · ↑/↓ previous/next line</div>
<div class="pv-lines"></div>`;
  // Outside <body>, so the fit scale applied to <body> does not shrink the panel.
  document.documentElement.appendChild(panel);
  const $ = (sel) => panel.querySelector(sel);
  const showErrors = () => { $(".pv-err").textContent = errors.join("\n"); };

  if (!TLD) {
    report("no timeline: add ?timeline=<timeline.json> to the URL");
    showErrors();
    return;
  }
  if (typeof window.render !== "function" || !window.ready) {
    report("the page did not set window.render / window.ready (call definePage)");
    showErrors();
    return;
  }

  const total = TLD.total;
  let t = 0, playing = false, clock0 = 0, lineOn = -1, warnCount = -1, errCount = -1, fit = true, audio = null, markTimer = 0;
  const range = $("input");
  range.max = total;
  const box = $(".pv-lines");
  const rows = TLD.lines.map((line, i) => {
    const row = document.createElement("div");
    row.className = "pv-line";
    row.innerHTML = `<span class="pv-muted">${i}</span><span class="pv-muted">${line.start.toFixed(2)}</span><span></span>`;
    row.lastChild.textContent = `[${line.s}] ${line.t}`;
    row.onclick = () => { stop(); show(line.start); };
    box.appendChild(row);
    return row;
  });

  // Voice track (narrated timelines): TIMELINE.voice is resolved relative to the timeline file.
  if (TLD.voice) {
    fetch(new URL(TLD.voice, new URL(timeline, window.location.href)))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => { audio = new Audio(URL.createObjectURL(blob)); })
      .catch((err) => report(`voice ${TLD.voice} not loaded (${err.message}); playing without sound`));
  }

  function layout() {
    const k = Math.min(window.innerHeight / document.body.offsetHeight, (window.innerWidth - PANEL) / document.body.offsetWidth);
    document.body.style.transformOrigin = "0 0";
    document.body.style.transform = fit ? `scale(${k})` : "";
    $('[data-act="fit"]').textContent = fit ? "1:1" : "Fit";
  }

  function update() {
    range.value = t;
    $(".pv-time").textContent = `${t.toFixed(2)} / ${total.toFixed(2)} s · frame ${Math.round(t * FPS)}`;
    let i = rows.length - 1;
    while (i > 0 && TLD.lines[i].start > t) i--;
    if (i !== lineOn) {
      if (rows[lineOn]) rows[lineOn].classList.remove("pv-on");
      rows[i].classList.add("pv-on");
      const top = rows[i].offsetTop;
      if (top < box.scrollTop || top + rows[i].offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 3;
      lineOn = i;
    }
    let scene = "";
    try {
      if (typeof window.sceneAt === "function") scene = `scene ${window.sceneAt(t).key} · `;
    } catch {
      // the page failed before its scenes existed; that error is already listed
    }
    const line = TLD.lines[i];
    $(".pv-now").textContent = `${scene}line ${i}${t > line.end ? " (pause after it)" : ""}\n${line.t}`;
    const warnings = window.__kitWarnings || [];
    if (warnings.length !== warnCount) {
      warnCount = warnings.length;
      $(".pv-warn").textContent = warnings.map((w) => `warning ${w.code}: ${w.detail}`).join("\n");
    }
    if (errors.length !== errCount) { errCount = errors.length; showErrors(); }
    if (!playing) {
      // Remember t for reloads; debounced because Chrome throttles rapid history updates while scrubbing.
      clearTimeout(markTimer);
      markTimer = setTimeout(() => window.history.replaceState(null, "", `#t=${t.toFixed(3)}`), 250);
    }
  }

  function show(nt) {
    t = Math.min(Math.max(nt, 0), total);
    try {
      window.render(t);
    } catch (err) {
      report(`render(${t.toFixed(3)}) threw: ${err.message}`);
      if (playing) stop();
    }
    update();
  }

  function tick(now) {
    if (!playing) return;
    const nt = (now - clock0) / 1000;
    if (nt >= total) { stop(); show(total); return; }
    show(nt);
    requestAnimationFrame(tick);
  }
  function play() {
    if (t >= total) t = 0;
    playing = true;
    clock0 = performance.now() - t * 1000;
    if (audio) {
      audio.currentTime = t;
      audio.play().catch((err) => report(`voice playback failed: ${err.message}`));
    }
    $('[data-act="play"]').textContent = "Pause";
    requestAnimationFrame(tick);
  }
  function stop() {
    playing = false;
    if (audio) audio.pause();
    $('[data-act="play"]').textContent = "Play";
    update();
  }
  const toggle = () => { if (playing) stop(); else play(); };

  $('[data-act="play"]').onclick = (e) => { e.currentTarget.blur(); toggle(); };
  $('[data-act="fit"]').onclick = (e) => { e.currentTarget.blur(); fit = !fit; layout(); };
  range.oninput = () => { if (playing) stop(); show(Number(range.value)); };
  window.addEventListener("resize", layout);
  window.addEventListener("keydown", (e) => {
    if (e.key === " ") toggle();
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (playing) stop();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      show(e.shiftKey ? t + dir : (Math.round(t * FPS) + dir) / FPS);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (playing) stop();
      const i = Math.min(Math.max(lineOn + (e.key === "ArrowUp" ? -1 : 1), 0), rows.length - 1);
      show(TLD.lines[i].start);
    } else return;
    e.preventDefault();
  });

  layout();
  const start = Number((window.location.hash.match(/t=([\d.]+)/) || [])[1]) || 0;
  Promise.resolve(window.ready)
    .catch((err) => report(`window.ready rejected: ${err.message}`))
    .then(() => show(start));
}

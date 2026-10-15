/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Page contract helpers: warnings, asset and font loading, definePage. Needs core/timeline.js.
   What the tools rely on: window.render(t) (seconds, synchronous, pure in t), window.ready (a Promise
   that rejects with a clear message when any image or font fails), window.KIT_META
   ({ style, fonts, format?, captionMaxLines? }) and window.__kitWarnings ([{ code, detail }]). */

window.__kitWarnings = [];

/**
 * Record a warning once per (code, detail) for check.mjs and the preview panel.
 * Codes: trigger-overflow, caption-overflow (hard failures in check.mjs), asset-missing, scene-map.
 */
function kitWarn(code, detail) {
  const list = window.__kitWarnings;
  if (list.some((w) => w.code === code && w.detail === detail)) return;
  list.push({ code, detail });
  console.warn(`[kit] ${code}: ${detail}`);
}

/** Loaded images by key, filled by loadImages. */
const IMG = {};

/**
 * Load images { key: path } (paths relative to the page) into IMG. Resolves { key: HTMLImageElement }
 * when all have loaded; rejects on the first failure, naming the path (and records 'asset-missing').
 */
function loadImages(map) {
  const entries = Object.entries(map);
  return Promise.all(entries.map(([key, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      kitWarn("asset-missing", src);
      reject(new Error(`image failed to load: ${src} (key "${key}")`));
    };
    img.src = src;
    IMG[key] = img;
  }))).then((imgs) => Object.fromEntries(entries.map(([key], i) => [key, imgs[i]])));
}

/**
 * Load fonts given as CSS font shorthands ("700 48px NotoSC") for `glyphs` (default: every line's
 * text). Rejects when a face fails to download or when a spec matches no @font-face rule, which
 * would otherwise fall back to a system font without any error.
 */
function waitFonts(specs, glyphs = TL.lines.map((row) => row.t).join("")) {
  return Promise.all(specs.map((spec) => document.fonts.load(spec, glyphs).then(
    (faces) => { if (!faces.length) throw new Error(`font "${spec}" matches no @font-face rule`); },
    (err) => { throw new Error(`font "${spec}" failed to load (${err.message}); run tools/fetch-fonts.py`); },
  )));
}

/**
 * Publish the page contract. `ready`: promises the page must wait for (images, extra fonts);
 * meta.fonts are loaded here too, then document.fonts.ready is awaited.
 * meta: { style: "handdrawn" | "pixel" | <new style>, fonts: [CSS font specs], format?, captionMaxLines? }.
 * format: "portrait" (default, 1080x1920 Shorts) or "landscape" (1920x1080); the tools size the frame from it.
 */
function definePage({ render, ready = [], meta }) {
  if (typeof render !== "function") throw new Error("definePage: render(t) is required");
  if (!meta || typeof meta.style !== "string" || !Array.isArray(meta.fonts)) {
    throw new Error('definePage: meta must be { style: "handdrawn" | "pixel", fonts: ["700 48px NotoSC", ...] }');
  }
  if (meta.format && !["portrait", "landscape"].includes(meta.format)) throw new Error(`definePage: meta.format must be "portrait" or "landscape", got "${meta.format}"`);
  window.render = render;
  window.KIT_META = meta;
  window.ready = Promise.all([...ready, waitFonts(meta.fonts)])
    .then(() => document.fonts.ready)
    .then(() => undefined);
}

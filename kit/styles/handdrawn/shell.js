/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Hand-drawn style: page shell, DOM helpers, camera and the per-frame scene / background / caption update.
   Load after core/*.js and
   before art.js, motion.js and the video script; call buildShell() from a script inside <body>.
   Nothing here prescribes a scene structure: scenes come from the timeline (defineScenes) and everything
   drawn inside them belongs to the video. */

/** Shell elements and settings, filled by buildShell() and makeSceneLayers(). */
const SHELL = { w: 1080, h: 1920, frame: null, bg: null, bgIn: null, vig: null, sub: null, subText: null, layers: {}, bgDefault: "", maxLines: 1, caption: "", meta: null };

/**
 * Build the page shell once. Elements the page already has (same ids) are reused, missing ones are
 * created: #frame > #bg (+ .bg-in), filter defs (#rough, #grainF), #vig, #grain, #sub > #subText (the pill).
 * Scene layers are added later by makeSceneLayers(), below the vignette, grain and caption.
 * Options:
 *   format   "portrait" (1080x1920, default) or "landscape" (1920x1080); sets SHELL.w / SHELL.h and the .landscape class
 *   bg       background for scenes missing from renderShell's bgMap
 *   rough    wobble filter behind <g class="rough">: { freq, octaves, seed, scale }
 *   caption  { maxLines }: caption lines allowed before the fit check reports 'caption-overflow' (default 1)
 *   glyphs   which Noto Sans CJK set the NotoSC family draws: "SC" (default, Simplified), "TC" (Traditional, Taiwan),
 *            or any other Noto subset ("HK", "JP", "KR") after `fetch-fonts.py <set>`. The family keeps its name, so
 *            pages and art that say "NotoSC" need no change.
 * Caption position, size and colours, grain and vignette are CSS custom properties (see shell.css).
 * Returns SHELL; pass SHELL.meta to definePage().
 */
function buildShell({ format = "portrait", bg = "#f5ecd8", rough = {}, caption = {}, glyphs = "SC" } = {}) {
  const { freq = .035, octaves = 2, seed = 3, scale = 7 } = rough;
  const landscape = format === "landscape";
  const { maxLines = 1, style = "pill" } = caption;
  document.documentElement.classList.toggle("landscape", landscape);
  if (glyphs.toUpperCase() !== "SC") useGlyphs(glyphs.toUpperCase());
  [SHELL.w, SHELL.h] = landscape ? [1920, 1080] : [1080, 1920];
  const ensure = (id, tag, parent, cls = "") => {
    let e = document.getElementById(id);
    if (!e) { e = document.createElement(tag); e.id = id; if (cls) e.className = cls; parent.appendChild(e); }
    return e;
  };
  const frame = ensure("frame", "div", document.body);
  SHELL.frame = frame; // el() below defaults to this parent
  const bgEl = ensure("bg", "div", frame);
  const bgIn = bgEl.querySelector(".bg-in") || el("div", "bg-in", bgEl);
  if (!document.getElementById("rough")) {
    frame.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute"><defs>
      <filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}"/></filter>
      <filter id="grainF"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 .22 0"/></filter>
    </defs></svg>`);
  }
  const vig = ensure("vig", "div", frame);
  if (!document.getElementById("grain")) frame.insertAdjacentHTML("beforeend", `<svg id="grain" width="${SHELL.w}" height="${SHELL.h}"><rect width="${SHELL.w}" height="${SHELL.h}" filter="url(#grainF)"/></svg>`);
  const sub = ensure("sub", "div", frame);
  const subText = ensure("subText", "span", sub);
  sub.classList.toggle("film", style === "film");
  Object.assign(SHELL, { bg: bgEl, bgIn, vig, sub, subText, bgDefault: bg, maxLines });
  // Fonts the tools preload and verify: NotoSC for captions, Kuai for keywords.
  SHELL.meta = { style: "handdrawn", format, fonts: ["700 52px NotoSC", "900 52px NotoSC", "100px Kuai"], captionMaxLines: maxLines };
  return SHELL;
}

/* Redeclare the NotoSC faces from another Noto Sans CJK set (kit/.fonts/NotoSans<set>-Bold/Black.otf): a later
   @font-face with the same family and weight wins. */
function useGlyphs(set) {
  if (document.getElementById("glyphs-set")) return;
  const css = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.endsWith("/shell.css"));
  const font = (f) => new URL(`../../.fonts/${f}`, css ? css.href : location.href).href;
  const style = document.createElement("style");
  style.id = "glyphs-set";
  style.textContent = `@font-face { font-family: "NotoSC"; src: url("${font(`NotoSans${set}-Bold.otf`)}"); font-weight: 700; }
@font-face { font-family: "NotoSC"; src: url("${font(`NotoSans${set}-Black.otf`)}"); font-weight: 900; }`;
  document.head.appendChild(style);
}

/* ---------------- DOM helpers (build once at load, then only set properties per frame) ---------------- */

/** Create an element; parent defaults to the frame. `html` is set as innerHTML (keywords may use <br>). */
const el = (tag, cls, parent, html = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  (parent || SHELL.frame).appendChild(e);
  return e;
};
/** Absolute position in px (left/top). Named `place` because `at` is the core beat helper. */
const place = (e, x, y) => { e.style.left = x + "px"; e.style.top = y + "px"; return e; };
/** Per-frame opacity and transform in one call. */
const tf = (e, opacity, transform) => { e.style.opacity = opacity; e.style.transform = transform; };
/**
 * Wrap an SVG art string (drawn in a w x h viewBox) in an absolutely placed div at (x, y).
 * Options: `size: [w2, h2]` draws it at another size (the viewBox is kept), `origin` is the pivot for
 * scale/rotate (characters standing on the ground usually want "50% 100%"), `cls` the div's class.
 * The div carries _w/_h (drawn size) and _home = [x, y] (rest position used by idle() and hop()).
 */
function put(parent, w, h, svg, x, y, { cls = "abs", origin = "50% 50%", size = null } = {}) {
  const [dw, dh] = size || [w, h];
  const d = el("div", cls, parent);
  d.innerHTML = `<svg width="${dw}" height="${dh}" viewBox="0 0 ${w} ${h}">${svg}</svg>`;
  place(d, x, y);
  d._w = dw; d._h = dh; d._home = [x, y];
  d.style.transformOrigin = origin;
  return d;
}

/**
 * Camera on a `.cam` container (the full frame, origin top-left): zoom `s` about the focus point (fx, fy) in
 * frame pixels (default: the frame centre), then pan by (dx, dy). Anything placed outside the container stays fixed like a HUD.
 */
function cam(e, { s = 1, fx = SHELL.w / 2, fy = SHELL.h / 2, dx = 0, dy = 0 } = {}) {
  e.style.transform = `translate(${dx + fx - fx * s}px, ${dy + fy - fy * s}px) scale(${s})`;
}

/* ---------------- scenes, background, caption ---------------- */

/** One div.scene per distinct visual scene key in SCENES (call defineScenes first when you use a map). */
function makeSceneLayers() {
  const layers = {};
  for (const s of SCENES) {
    if (layers[s.key]) continue; // a scene that is re-entered keeps its layer
    layers[s.key] = el("div", "scene");
    SHELL.frame.insertBefore(layers[s.key], SHELL.vig); // keep vignette, grain and caption on top
  }
  SHELL.layers = layers;
  return layers;
}

/**
 * Per-frame shell update. Call it first in render(t); it returns the current visual scene key.
 * - Scene layers crossfade: the incoming scene fades in over `fade` seconds while the previous one fades
 *   out. `fade` is a number or a { incomingSceneKey: seconds } map (0 = hard cut); default SCENE_FADE.
 * - Background: bgMap[key] (any CSS background, gradients too) crossfades with its scene.
 *   bgOverride(key, t) may return a background that replaces bgMap[key] at time t (e.g. day turning to dusk).
 * - Caption: the chunk at t from `chunks` (makeChunks; its hold / lead apply) is shown in the pill and
 *   fit-checked whenever its text changes. Omit `chunks` for no caption.
 */
function renderShell(t, { bgMap = {}, bgOverride = null, chunks = null, fade = SCENE_FADE } = {}) {
  const fadeOf = (key) => (typeof fade === "number" ? fade : fade[key] ?? SCENE_FADE);
  const sc = sceneAt(t, { fade: fadeOf(sceneAt(t).key) });
  const k = sc.alpha;
  const background = (key) => (bgOverride && bgOverride(key, t)) || bgMap[key] || SHELL.bgDefault;
  SHELL.bg.style.background = background(sc.prev ? sc.prev.key : sc.key);
  SHELL.bgIn.style.background = background(sc.key);
  SHELL.bgIn.style.opacity = k;
  for (const key in SHELL.layers) {
    const a = key === sc.key ? k : sc.prev && key === sc.prev.key ? 1 - k : 0;
    SHELL.layers[key].style.opacity = a;
    SHELL.layers[key].style.display = a > 0 ? "block" : "none";
  }
  if (chunks) showCaption(chunkAt(chunks, t));
  return sc.key;
}

/** Show a caption chunk in the pill, or hide the pill for null. Text is re-measured only when it changes. */
function showCaption(chunk) {
  const text = chunk ? chunk.text : "";
  if (text !== SHELL.caption) {
    SHELL.caption = text;
    SHELL.subText.textContent = text;
    if (text) checkFit(SHELL.subText, { maxLines: SHELL.maxLines });
  }
  SHELL.sub.style.opacity = chunk ? 1 : 0;
}

/**
 * Several shots inside one scene: [[shotEl, startTime], ...] in time order; the first shows from the scene
 * start, each later one crossfades in over `dur` seconds from its start (0 = hard cut). Put the starts in the
 * pause before a line, e.g. at(lineOf("shop", 3), -.3): cutting between shots costs no extra time, while a
 * new scene key adds the timeline's longer scene gap. Shots are full-frame elements inside the scene layer.
 */
function shots(t, list, dur = .4) {
  list.forEach(([e, t0], k) => {
    const tin = k ? (dur > 0 ? eio(prog(t, t0, dur)) : +(t >= t0)) : 1;
    const next = list[k + 1];
    const tout = next ? (dur > 0 ? eio(prog(t, next[1], dur)) : +(t >= next[1])) : 0;
    const a = tin * (1 - tout);
    e.style.opacity = a;
    e.style.display = a > 0 ? "block" : "none";
  });
}

/* ---------------- raster assets (generated illustrations) ---------------- */

/** Decode promises of every pic(); pass picsReady() to definePage's ready list. */
const PIC_LOADS = [];
/**
 * Place a raster image (a processed illustration from assets/img/) at (x, y); `size` = [w, h] in frame
 * pixels (default: the file's own size). Like put(), the element carries _home for idle() and hop().
 * A file that fails to load rejects picsReady() with its path instead of rendering a broken frame.
 */
function pic(parent, src, x, y, { size = null, origin = "50% 100%", cls = "abs" } = {}) {
  const img = el("img", cls, parent);
  img.src = src;
  img.draggable = false;
  if (size) { img.style.width = size[0] + "px"; img.style.height = size[1] + "px"; }
  place(img, x, y);
  img.style.transformOrigin = origin;
  img._home = [x, y];
  PIC_LOADS.push(img.decode().catch(() => {
    kitWarn("asset-missing", src);
    throw new Error(`image failed to load: ${src}`);
  }));
  return img;
}
/**
 * One character in several poses or moods: { mood: src } images stacked in one wrapper at (x, y), switched
 * with setMood() like moodStack(). Give every pose file the same canvas size and feet position (the asset
 * brief asks for it) so a switch does not jump.
 */
function picStack(parent, poses, x, y, { size, origin = "50% 100%" } = {}) {
  const c = el("div", "abs", parent);
  c.style.width = size[0] + "px"; c.style.height = size[1] + "px"; c.style.transformOrigin = origin;
  place(c, x, y);
  c._w = size[0]; c._h = size[1]; c._home = [x, y];
  c._moods = {};
  for (const [mood, src] of Object.entries(poses)) c._moods[mood] = pic(c, src, 0, 0, { size, origin });
  setMood(c, Object.keys(poses)[0]);
  return c;
}
const picsReady = () => Promise.all(PIC_LOADS);

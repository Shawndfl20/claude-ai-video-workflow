/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Timeline anchors and scene windows. Needs core/anim.js; kitWarn comes from core/page.js at call time.
   window.TIMELINE = { total, lines: [{ s, t, d, start, end }] } is injected by the tools before any
   page script runs. Every beat is anchored to a line: at(i, offset) with offset < d(i), so a beat
   stays inside the sentence it illustrates when the timing is rebuilt (reading speed or voice). */

if (!window.TIMELINE || !Array.isArray(window.TIMELINE.lines)) {
  throw new Error("window.TIMELINE is missing: open the page with tools/preview.mjs or another kit tool, which inject timeline-<node>.json");
}
const TL = window.TIMELINE;
/** Number of lines. */
const N = TL.lines.length;

/** Timeline row { s, t, d, start, end } of line i; throws a clear error when i is out of range. */
function lineRow(i) {
  const row = TL.lines[i];
  if (!row) throw new Error(`line index ${i} is out of range (the timeline has ${N} lines: 0..${N - 1})`);
  return row;
}
/** Start, end and duration (s) of line i. */
const L = (i) => lineRow(i).start;
const E = (i) => lineRow(i).end;
const D = (i) => lineRow(i).d;

/**
 * Beat time: `off` seconds after line i starts. Warns 'trigger-overflow' when the beat would fall
 * after the line ends (off >= d(i)); anchor it to the line it belongs to instead. Negative offsets
 * (a beat that anticipates its line inside the pause before it) are allowed.
 */
function at(i, off = 0) {
  const d = D(i);
  if (off >= d) kitWarn("trigger-overflow", `line ${i} offset ${off} >= ${d}`);
  return L(i) + off;
}

/* ---------------- scenes ---------------- */

/** A scene window opens this long before its first line (inside the pause the timeline puts there). */
const SCENE_LEAD = .5;
/** Default fade-in length of a scene change; styles and sceneAt(t, { fade }) may use another. */
const SCENE_FADE = .45;
/** [{ key, first, last, a, b }] in time order, rebuilt in place by defineScenes. */
const SCENES = [];

/**
 * Derive scene windows from runs of consecutive lines with the same visual key. A line's visual key
 * is map[line.s] when the map has it, else line.s itself: map two `s` keys to one visual scene when
 * the script needs a pause beat without a cut (the timeline adds the longer scene gap on every `s`
 * change). A key may come back later in the video; each run is its own entry.
 * Window: a = L(first) - SCENE_LEAD (the first scene starts at -1), b = the next scene's a
 * (Infinity for the last). Call it before anything reads SCENES (lineOf, scene layers); without a
 * call, scenes are the runs of the raw `s` keys.
 */
function defineScenes(map = {}) {
  for (const k of Object.keys(map)) {
    if (!TL.lines.some((row) => row.s === k)) kitWarn("scene-map", `map key "${k}" matches no line's s`);
  }
  SCENES.length = 0;
  TL.lines.forEach((row, i) => {
    const key = Object.hasOwn(map, row.s) ? map[row.s] : row.s;
    const cur = SCENES[SCENES.length - 1];
    if (cur && cur.key === key) { cur.last = i; return; }
    const a = cur ? L(i) - SCENE_LEAD : -1;
    if (cur) cur.b = a;
    SCENES.push({ key, first: i, last: i, a, b: Infinity });
  });
  return SCENES;
}
defineScenes();

/**
 * The scene at time t: its SCENES entry plus index, age (t - a), alpha (fade-in over `fade` s,
 * 1 for a hard cut) and prev (the previous entry, or null for the first scene).
 */
function sceneAt(t, { fade = SCENE_FADE } = {}) {
  let i = SCENES.length - 1;
  while (i > 0 && t < SCENES[i].a) i--;
  const s = SCENES[i], age = t - s.a;
  return { ...s, index: i, age, alpha: fade > 0 ? clamp(age / fade) : 1, prev: SCENES[i - 1] || null };
}

/**
 * Global index of the n-th line (0-based) of the first run of visual scene `key`, so beats read
 * at(lineOf("gate", 1), .3) instead of hard-coded line numbers. Throws when key or n does not exist.
 */
function lineOf(key, n = 0) {
  const s = SCENES.find((q) => q.key === key);
  if (!s) throw new Error(`lineOf: no scene "${key}" (scenes: ${[...new Set(SCENES.map((q) => q.key))].join(", ")})`);
  const count = s.last - s.first + 1;
  if (!Number.isInteger(n) || n < 0 || n >= count) throw new Error(`lineOf: scene "${key}" has ${count} lines (0..${count - 1}), got ${n}`);
  return s.first + n;
}

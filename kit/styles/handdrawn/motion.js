/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Hand-drawn style: keyword, character and effect motions.
   Load after shell.js and art.js. Every helper is a pure function of t: build the elements once at load,
   then call the helper from render(t) every frame. Timing arguments are absolute seconds, normally beats
   from at(lineOf(scene, n), offset). Every look value is an argument with a default. */

/* ---------------- keywords ---------------- */

/** Hand-lettered keyword (Kuai font) centred on x, top at y. Text is code-drawn; `<br>` makes two lines. */
function kw(parent, text, size, color, x, y) {
  const k = el("div", "kw", parent, text);
  k.style.fontSize = size + "px";
  if (color) k.style.color = color;
  return place(k, x, y);
}

/**
 * Keyword pop: scales in with overshoot at a0, fades out from a1 (omit a1 to keep it), rotated `rot` deg.
 * Options: s = scale at rest, dur = pop-in length, out = fade-out length.
 */
function popKw(k, t, a0, a1 = 1e9, rot = 0, { s = 1, dur = .5, out = .35 } = {}) {
  const p = pop(t, a0, dur);
  tf(k, clamp(p) * (1 - prog(t, a1, out)), `translateX(-50%) scale(${p * s}) rotate(${rot}deg)`);
}

/* ---------------- characters ---------------- */

/**
 * A character with several moods: one wrapper div at (x, y) holding one pre-drawn variant per mood, so a
 * mood change is an opacity switch instead of rewriting SVG every frame. art(mood) returns the SVG string
 * drawn in a w x h viewBox (e.g. guyArt). Place, scale, idle(), hop() and blink() the wrapper like any
 * put() element; setMood() picks the visible variant. `origin` defaults to the feet.
 */
function moodStack(parent, w, h, art, moods, x, y, { origin = "50% 100%", size = null } = {}) {
  const [dw, dh] = size || [w, h];
  const c = el("div", "abs", parent);
  c.style.width = dw + "px"; c.style.height = dh + "px"; c.style.transformOrigin = origin;
  place(c, x, y);
  c._w = dw; c._h = dh; c._home = [x, y];
  c._moods = {};
  for (const m of moods) c._moods[m] = put(c, w, h, art(m), 0, 0, { size });
  setMood(c, moods[0]);
  return c;
}
/** Show one mood of a moodStack and hide the others (call every frame; it only sets opacity). */
function setMood(c, mood) {
  for (const m in c._moods) c._moods[m].style.opacity = m === mood ? 1 : 0;
}

/** Deterministic blink: every ".eyes" element inside c dims to `closed` for .12 s every 3.3 s. */
function blink(c, t, seed, closed = .1) {
  const o = blinkOpen(t, seed) ? 1 : closed;
  c.querySelectorAll(".eyes").forEach((e) => (e.style.opacity = o));
}

/**
 * Idle at the rest position c._home (+dy): gentle bob (`amp` px, seed c._seed), blink, scale `s`.
 * Sets opacity, position and transform, so use it for the frames where c is not otherwise animated.
 */
function idle(c, t, { opacity = 1, dy = 0, amp = 4, s = 1 } = {}) {
  const seed = c._seed || 0;
  place(c, c._home[0], c._home[1] + dy);
  tf(c, opacity, `translateY(${bob(t, seed, amp)}px) scale(${s})`);
  blink(c, t, seed);
}

/**
 * Arc jump from `from` (default c._home) to `to` over `dur` s starting at t0, with squash-and-stretch and
 * a spin (e.g. goods jumping into a basket). Before t0 it holds at `from`. Returns progress k (0..1).
 * Opacity is left to the caller unless hide = true (then c disappears once it lands).
 * Options: s0/s1 = scale at start/end, h = arc height px, squash = stretch amount, spin = max rotation deg.
 */
function hop(c, t, t0, dur, { from = c._home, to, s0 = 1, s1 = .8, h = 230, hide = false, squash = .12, spin = 25 } = {}) {
  const k = eio(prog(t, t0, dur));
  const arc = Math.sin(k * Math.PI);
  const sq = k > 0 && k < 1 ? 1 + arc * squash : 1;
  const s = lerp(s0, s1, k);
  place(c, lerp(from[0], to[0], k), lerp(from[1], to[1], k) - arc * h);
  c.style.transform = `scale(${s / sq}, ${s * sq}) rotate(${arc * spin}deg)`;
  if (hide) c.style.opacity = k >= 1 ? 0 : 1;
  return k;
}

/* ---------------- effects ---------------- */

/**
 * Confetti burst for an "aha" beat: builds n paper bits once (hidden until renderConfetti starts them).
 * Options: x, y = burst centre; r + spread = throw distance range (px); size = [w, h] of a bit;
 * colors; seed varies the pseudo-random angles and distances; dur = flight time; gravity = fall (px);
 * fadeAt / fadeDur = when (s after the start) and how fast the bits fade.
 */
function confetti(parent, { x = 540, y = 760, n = 16, seed = 0, colors = [PAL.red, PAL.blue, PAL.green, PAL.gold, PAL.purple], r = 300, spread = 210, size = [26, 14], dur = 1.4, gravity = 180, fadeAt = 1.2, fadeDur = .5 } = {}) {
  const bits = [...Array(n)].map((_, i) => {
    const c = el("div", "abs", parent);
    c.style.width = size[0] + "px"; c.style.height = size[1] + "px"; c.style.borderRadius = "4px";
    c.style.background = colors[i % colors.length];
    c.style.opacity = 0;
    c._a = i / n * Math.PI * 2 + (hash(seed * 131 + i) - .5) * .4;
    c._r = r + hash(seed * 131 + i + 57) * spread;
    return c;
  });
  bits.opts = { x, y, dur, gravity, fadeAt, fadeDur };
  return bits;
}
/** Fly a confetti() burst that starts at t0 (call every frame). */
function renderConfetti(bits, t, t0) {
  const o = bits.opts;
  const k = eo(prog(t, t0, o.dur));
  const alpha = k > 0 ? 1 - prog(t, t0 + o.fadeAt, o.fadeDur) : 0;
  bits.forEach((c, i) => {
    place(c, o.x + Math.cos(c._a) * c._r * k, o.y + Math.sin(c._a) * c._r * k + k * k * o.gravity);
    tf(c, alpha, `rotate(${k * 540 + i * 30}deg)`);
  });
}

/**
 * Stroke-draw reveal of an SVG path (a ring around a word, a chart line, a brace): k = 0 hidden,
 * 1 fully drawn, e.g. drawStroke(path, eo(prog(t, beat, .8))). Draw the shape as ONE subpath (no second
 * "M"): Chromium restarts the dash on every subpath, so each would start drawing at once.
 */
function drawStroke(pathEl, k) {
  pathEl.setAttribute("pathLength", "1");
  pathEl.style.strokeDasharray = "1";
  pathEl.style.strokeDashoffset = String(1 - clamp(k));
}

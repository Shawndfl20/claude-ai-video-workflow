/* eslint-disable @typescript-eslint/no-unused-vars -- kit helpers are called by video pages */
/* Time math shared by every style. All functions are pure: a frame depends only on t (seconds).
   Never use Math.random / Date.now / performance.now in a page; hash(n) is the pseudo-random source.
   the trailing `d` parameters of
   popA / popS are additions whose defaults keep the old behaviour. */

/** Clamp x into [a, b]. */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Linear 0..1 progress of an animation that starts at `a` and lasts `d` seconds. */
const prog = (t, a, d = .6) => clamp((t - a) / d);
const lerp = (a, b, x) => a + (b - a) * x;
/** Cubic ease-out. */
const eo = (x) => 1 - Math.pow(1 - x, 3);
/** Cubic ease-in-out. */
const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Ease-out with overshoot (peaks at about 1.1 before settling at 1). */
const back = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
/** Scale-in with overshoot starting at `a`: use clamp(p) for opacity and p for scale. */
const pop = (t, a, d = .45) => clamp(back(prog(t, a, d)), 0, 1.25);
/** Opacity that fades in over `d` s at a0 and out over `d` s at a1. */
const popA = (t, a0, a1 = 1e9, d = .2) => prog(t, a0, d) * (1 - prog(t, a1, d));
/** Overshoot scale for a pop at a0 (0 before, about 1.1 peak, 1 after). */
const popS = (t, a0, d = .35) => clamp(back(prog(t, a0, d)), 0, 1.2);

/** Colour between two '#rrggbb' colours as 'rgb(r,g,b)'. */
const mix = (a, b, x) => {
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const p = rgb(a), q = rgb(b);
  return `rgb(${p.map((v, i) => Math.round(lerp(v, q[i], x))).join(",")})`;
};
/** Deterministic pseudo-random number in [0, 1) for an integer (or any number) n. */
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Idle float: a sine offset of `amp` px, `sp` rad/s; `seed` desynchronises objects. */
const bob = (t, seed, amp = 6, sp = 3) => Math.sin(t * sp + seed * 5) * amp;
/** False for .12 s every 3.3 s (eyes closed); `seed` desynchronises characters. */
const blinkOpen = (t, seed) => ((t + seed * 1.7) % 3.3) > .12;
/**
 * Damped spring kicked at t = 0 (pass time since the event, e.g. settle(t - at(3, .5), 8)):
 * 0 before the kick, then a sine at `freq` Hz whose amplitude `amp` decays as e^(-damp * t).
 * Starts at 0, so it can be added to a resting value without a jump (wobble, shake, landing).
 */
const settle = (t, amp, freq = 1.6, damp = 3.2) => (t <= 0 ? 0 : amp * Math.exp(-damp * t) * Math.sin(2 * Math.PI * freq * t));

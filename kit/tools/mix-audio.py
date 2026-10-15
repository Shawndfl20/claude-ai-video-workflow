"""Final soundtrack: narration + synthesized sound effects at the page's cues (no background music).
The effects are generated here, so there is no third-party audio to license.

  python -X utf8 mix-audio.py <timeline.json> <narration.wav> <sfx.json> <out.wav>

sfx.json is [[seconds, kind, gain], ...] (dump-sfx.mjs reads it from the page's window.SFX); kinds are the keys of
SFX below. Rewrites the timeline's "voice" to the mixed file (relative to the timeline) so render.mjs muxes it.
Needs numpy.
"""
import json, os, sys, wave
import numpy as np

SR = 24000
rng = np.random.default_rng(7)


def env(n, a=.005, d=.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)


def tone(f, dur, d=.2, partials=((1, 1),), a=.005):
    n = int(dur * SR); t = np.arange(n) / SR
    f = np.broadcast_to(f, (n,)) if np.ndim(f) else np.full(n, f)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return sum(g * np.sin(k * ph) for k, g in partials) * env(n, a, d)


def noise(dur, d=.1, lp=None, a=.003):
    n = int(dur * SR); x = rng.standard_normal(n)
    if lp:  # one-pole low-pass
        y = np.zeros(n); k = np.exp(-2 * np.pi * lp / SR); acc = 0.0
        for i in range(n):
            acc = (1 - k) * x[i] + k * acc; y[i] = acc
        x = y / (np.abs(y).max() + 1e-9)
    return x * env(n, a, d)


def sweep(f0, f1, dur):
    return np.linspace(f0, f1, int(dur * SR))


def cat(*parts):
    n = max(int(o * SR) + len(p) for o, p in parts); y = np.zeros(n)
    for o, p in parts:
        y[int(o * SR):int(o * SR) + len(p)] += p
    return y


SFX = {
    "pop": lambda: .5 * tone(sweep(420, 980, .12), .12, .05),
    "whoosh": lambda: .35 * noise(.45, .18, lp=1800, a=.15),
    "ding": lambda: .35 * tone(1318.5, .9, .35, ((1, 1), (1.5, .4), (2, .25))),
    "thud": lambda: cat((0, .8 * tone(sweep(120, 45, .35), .35, .12)), (0, .2 * noise(.08, .02, lp=900))),
    "tick": lambda: .4 * tone(1800, .05, .012),
    "wrong": lambda: .22 * (cat((0, tone(311, .16, .2, ((1, 1), (3, .3), (5, .15)))), (.17, tone(233, .25, .2, ((1, 1), (3, .3), (5, .15)))))),
    "magic": lambda: .28 * cat(*[(i * .06, tone(f, .5, .25, ((1, 1), (2, .3)))) for i, f in enumerate([1046.5, 1318.5, 1568, 2093])]),
    "splash": lambda: cat((0, .55 * noise(.9, .3, lp=1400, a=.01)), (0, .3 * tone(sweep(200, 60, .3), .3, .1))),
    "boing": lambda: .4 * tone(220 + 90 * np.sin(np.arange(int(.45 * SR)) / SR * 2 * np.pi * 9) * np.exp(-np.arange(int(.45 * SR)) / SR / .25), .45, .25),
    "cash": lambda: cat((0, .3 * tone(1568, .7, .3, ((1, 1), (2, .3)))), *[(.04 * i, .18 * tone(2500 + 300 * (i % 3), .05, .015)) for i in range(8)]),
    "rattle": lambda: cat(*[(.06 * i + .02 * rng.random(), .16 * noise(.04, .012, lp=4000)) for i in range(10)]),
    "snip": lambda: cat((0, .3 * noise(.04, .01, lp=6000)), (.08, .3 * noise(.04, .01, lp=6000))),
    "whistle": lambda: .3 * tone(2100 + 140 * np.sign(np.sin(np.arange(int(.5 * SR)) / SR * 2 * np.pi * 22)), .5, .4, a=.01),
    "drip": lambda: cat(*[(.12 * i, .35 * tone(sweep(900 - 120 * i, 1500 - 120 * i, .08), .08, .04)) for i in range(3)]),
    "boom": lambda: cat((0, .9 * tone(sweep(110, 35, .6), .6, .25)), (0, .45 * noise(.7, .25, lp=900, a=.005))),
    "hum": lambda: .25 * tone(110 + 4 * np.sin(np.arange(int(1.2 * SR)) / SR * 2 * np.pi * 6), 1.2, .8, ((1, 1), (2, .5), (3, .3)), a=.15),
    "pour": lambda: cat((0, .3 * noise(.8, .35, lp=2500, a=.1)), (.6, .3 * tone(1568, .8, .3, ((1, 1), (2, .3))))),
    "stamp": lambda: cat((0, .7 * tone(sweep(150, 50, .25), .25, .08)), (0, .3 * noise(.06, .02, lp=2500))),
}


def main():
    tl_path, vo_path, sfx_path, out_path = sys.argv[1:5]
    tl = json.load(open(tl_path, encoding="utf-8"))
    with wave.open(vo_path) as w:
        vo = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
    n = len(vo)
    mix = vo.copy()
    for at, kind, g in json.load(open(sfx_path)):
        if kind not in SFX:
            sys.exit(f"unknown sound effect {kind!r}; known: {', '.join(sorted(SFX))}")
        s = SFX[kind]() * g * .8
        o = int(at * SR)
        if o < n:
            mix[o:o + len(s)] += s[: n - o]
    peak = np.abs(mix).max()
    if peak > .97:
        mix *= .97 / peak
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    tl["voice"] = os.path.relpath(os.path.abspath(out_path), os.path.dirname(os.path.abspath(tl_path))).replace(os.sep, "/")
    json.dump(tl, open(tl_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"mixed {n / SR:.1f} s, {len(json.load(open(sfx_path)))} cues, peak {peak:.2f}")


main()

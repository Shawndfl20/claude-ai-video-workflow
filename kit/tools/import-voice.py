"""Narration made outside the kit (for example on a TTS website): decode the audio file(s), cut the narration into
the script's lines at its pauses, and write the timeline (with "voice") plus a 24 kHz mono 16-bit WAV, the same
outputs as build-voice.py, so make.mjs carries on from there.

Usage (from a video folder):
  python -X utf8 ../../kit/tools/import-voice.py lines-x.json narration.mp3 [part-2.mp3 ...]
      --timeline timeline-x.json --voice voice-x-vo.wav [--models DIR] [--lang zh|en|...]

How the lines are found: a pause (MIN_PAUSE or longer under the level of speech) is the only place a line can end,
so the narration needs an audible pause between lines (TTS pauses at a full stop). Dynamic programming then picks one
pause per line end:
  - with an offline recogniser for the language (lib/asr.py; scripts/fetch-models.sh): every stretch between two pauses is
    transcribed and the transcript is matched to the script, so each pause gets a place in the text; a line ends at
    the pause that sits where the line's text ends. This is the reliable mode.
  - without it: by length alone, the cuts whose line lengths best match the lines' text lengths, whose pauses inside
    a line match its punctuation, and that fall on longer pauses. Right when line-end pauses are clearly longer than
    comma pauses (about 0.4 s); with shorter ones a cut can land a phrase early or late. A warning says why.
Every line is printed with its start, its length and its length against its text's share; a line marked "!" is far
from its share and worth a listen. asr-check.py (run by make.mjs) then reads every line back.

Several files are joined in order with FILE_GAP of silence between them (a sure pause); the narration keeps its own
pauses, so the lines' "hold" does not apply. Decoding uses ffmpeg (env FFMPEG, else ffmpeg on PATH).
"""
import argparse
import difflib
import os
import re
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from timing import read_lines, write_timeline  # noqa: E402
import asr  # noqa: E402

RATE = 24000                 # Hz, as build-voice.py
ASR_RATE = 16000             # Hz the recognisers expect
HOP = 0.01                   # s per loudness frame
MIN_PAUSE = 0.12             # s under the speech level that counts as a pause
PAD = 0.04                   # s kept around speech at a cut
LEAD, TAIL = 0.8, 3.0        # s of silence before the first line and after the last, as build-voice.py
FILE_GAP = 0.5               # s of silence between two input files
TEXT_WEIGHT = 1.0            # recogniser mode: cost per text unit (character or word) between a pause's place and a line end
LENGTH_WEIGHT = 3.0          # cost of a line length off its text share (squared log ratio)
PAUSE_WEIGHT = 0.3           # how much a longer pause is preferred
EXTRA_PAUSE, MISSING_PAUSE = 0.3, 0.05  # cost per pause inside a line beyond its punctuation / per punctuation unpaused
COMMAS = re.compile(r"[，、；：？！。,;:?!.—]+(?=.)")   # punctuation inside a line where the voice may pause
FLAG_LOW, FLAG_HIGH = 0.6, 1.6  # line length / text share outside this range is marked "!"
CJK = re.compile(r"[㐀-鿿豈-﫿]")
LATIN = re.compile(r"[A-Za-z0-9]")
LATIN_WEIGHT = 0.3           # a Latin letter or digit takes about 0.3 of the time of a CJK character (18.5 vs 5.6 /s)


def decode(path):
    """Any audio file → 24 kHz mono int16 samples, through ffmpeg."""
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    try:
        r = subprocess.run([ffmpeg, "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"],
                           capture_output=True, check=False)
    except FileNotFoundError:
        sys.exit(f'ffmpeg not found ("{ffmpeg}"); set FFMPEG')
    if r.returncode != 0 or not r.stdout:
        sys.exit(f"{path}: ffmpeg could not decode it: {r.stderr.decode(errors='replace').strip()}")
    return np.frombuffer(r.stdout, dtype="<i2")


def weight(text):
    """Expected speaking time of a line, in CJK-character units."""
    return len(CJK.findall(text)) + LATIN_WEIGHT * len(LATIN.findall(text)) or 1.0


def pauses(x):
    """Speech span and the pauses inside it, in seconds: (start, end, [(pause start, pause end), ...])."""
    hop = int(RATE * HOP)
    n = len(x) // hop
    frames = x[:n * hop].astype(np.float32).reshape(n, hop) / 32768
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    level = min(max(np.percentile(db, 95) - 30, -55), -30)   # speech sits within ~30 dB of the loud frames
    speech = db > level
    if not speech.any():
        sys.exit("no speech found in the narration")
    first, last = int(np.argmax(speech)), int(n - 1 - np.argmax(speech[::-1]))
    found, run = [], None
    for i in range(first, last + 1):
        if not speech[i]:
            run = i if run is None else run
        elif run is not None:
            if (i - run) * HOP >= MIN_PAUSE:
                found.append((run * HOP, i * HOP))
            run = None
    return first * HOP, (last + 1) * HOP, found


def text_places(rec, lang, x, start, end, found, script):
    """For every pause, how many text units of the script (a list from asr.units) come before it, by transcribing the
    stretches between pauses and matching the transcript to the script. Unmatched stretches are interpolated."""
    edges = [start] + [p for pause in found for p in pause] + [end]
    heard, cuts = [], []
    for a, b in zip(edges[::2], edges[1::2]):
        clip = x[int(a * RATE):int(b * RATE)].astype(np.float32) / 32768
        clip = np.interp(np.arange(0, len(clip), RATE / ASR_RATE), np.arange(len(clip)), clip)  # the models run at 16 kHz
        st = rec.create_stream()
        st.accept_waveform(ASR_RATE, clip)
        rec.decode_stream(st)
        heard += asr.units(st.result.text, lang)
        cuts.append(len(heard))
    blocks = difflib.SequenceMatcher(None, heard, script, autojunk=False).get_matching_blocks()
    hx = [0.0] + [b.a + k for b in blocks for k in range(b.size)] + [float(len(heard))]
    sx = [0.0] + [b.b + k for b in blocks for k in range(b.size)] + [float(len(script))]
    return np.interp(cuts[:-1], hx, sx)


def cut(lines, start, end, found, places=None, ends=None):
    """Pick len(lines) - 1 pauses as line ends: by text place when `places` (per pause) and `ends` (text units up to
    each line's end) are given, else by length. Returns [(line start, line end), ...] in seconds."""
    n, k = len(lines), len(found)
    if n == 1:
        return [(start, end)]
    if k < n - 1:
        sys.exit(f"the narration has {k} pauses for {n} lines; generate it with a pause after every line "
                 "(a full stop at the end of each line usually does it), or in several files")
    weights = [weight(line["t"]) for line in lines]
    commas = [len(COMMAS.findall(line["t"])) for line in lines]
    p0 = np.array([p[0] for p in found])   # where a line ending at this pause stops
    p1 = np.array([p[1] for p in found])   # where the next line starts
    longest = sorted(b - a for a, b in found)[-(n - 1):]
    rate = (end - start - sum(longest)) / sum(weights)   # seconds per weight unit, with the likely cuts removed
    bonus = PAUSE_WEIGHT * np.log((p1 - p0) / MIN_PAUSE)

    def cost(i, d, inside):
        """Line i lasting d seconds with `inside` pauses in it (arrays over the choices of its first pause)."""
        if places is not None:
            return 0.1 * np.log(np.maximum(d, 1e-3) / (weights[i] * rate)) ** 2
        off = inside - commas[i]   # a voice may skip a comma, but an extra pause usually means a swallowed line end
        return (LENGTH_WEIGHT * np.log(np.maximum(d, 1e-3) / (weights[i] * rate)) ** 2
                + np.where(off > 0, EXTRA_PAUSE * off, -MISSING_PAUSE * off))

    def at(i):
        """Cost of line i ending at each pause (recogniser mode: distance in the text)."""
        return -bonus if places is None else TEXT_WEIGHT * np.abs(places - ends[i]) - bonus

    dp = np.full((n - 1, k), np.inf)
    back = np.zeros((n - 1, k), dtype=int)
    dp[0] = cost(0, p0 - start, np.arange(k)) + at(0)
    for i in range(1, n - 1):
        here = at(i)
        for b in range(i, k):
            prev = dp[i - 1, :b] + cost(i, p0[b] - p1[:b], b - np.arange(b) - 1)
            j = int(np.argmin(prev))
            dp[i, b], back[i, b] = prev[j] + here[b], j
    last = dp[n - 2] + cost(n - 1, end - p1, k - np.arange(k) - 1)
    b = int(np.argmin(last))
    chosen = [b]
    for i in range(n - 2, 0, -1):
        b = back[i, b]
        chosen.append(b)
    chosen.reverse()
    return list(zip([start] + [p1[e] for e in chosen], [p0[e] for e in chosen] + [end]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("lines")
    ap.add_argument("audio", nargs="+", help="narration file(s) in reading order (mp3, wav, m4a, ...)")
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--voice", required=True, help="WAV to write (24 kHz mono 16-bit)")
    ap.add_argument("--models", default=asr.MODELS_DIR)
    ap.add_argument("--lang", help="language of the narration (default: zh when the script has CJK characters, else en)")
    a = ap.parse_args()

    lines = read_lines(a.lines)
    gap = np.zeros(int(RATE * FILE_GAP), dtype="<i2")
    parts = []
    for f in a.audio:
        parts += [decode(f), gap]
    x = np.concatenate(parts[:-1])

    start, end, found = pauses(x)
    lang = a.lang or asr.detect(line["t"] for line in lines)
    rec, why = asr.load(lang, a.models) if len(lines) > 1 else (None, None)
    places = ends = None
    if rec is not None:
        script = [asr.units(line["t"], lang) for line in lines]
        places = text_places(rec, lang, x, start, end, found, [u for units in script for u in units])
        ends = np.cumsum([len(units) for units in script])
    elif why:
        print(f"warning: cutting by length only ({why}); with short line-end pauses a cut can miss, "
              "so listen to the lines marked !", file=sys.stderr)
    spans = cut(lines, start, end, found, places, ends)

    a0 = max(0.0, start - PAD)
    shift = LEAD - a0
    body = x[int(a0 * RATE):int(min(len(x) / RATE, end + PAD) * RATE)]
    track = np.concatenate([np.zeros(int(LEAD * RATE), dtype="<i2"), body, np.zeros(int(TAIL * RATE), dtype="<i2")])
    with wave.open(a.voice, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(track.tobytes())

    total_w = sum(weight(line["t"]) for line in lines)
    total_d = sum(e - s for s, e in spans)
    out, flagged = [], 0
    for i, (line, (s, e)) in enumerate(zip(lines, spans)):
        start_i, end_i = round(max(0.0, s - PAD) + shift, 3), round(e + PAD + shift, 3)
        out.append({"s": line["s"], "t": line["t"], "d": round(end_i - start_i, 3), "start": start_i, "end": end_i})
        share = (e - s) / (total_d * weight(line["t"]) / total_w)
        mark = "!" if not FLAG_LOW <= share <= FLAG_HIGH else " "
        flagged += mark == "!"
        print(f"{mark}{i:3d} {start_i:7.2f}s {end_i - start_i:5.2f}s x{share:4.2f}  {line['t'][:24]}")
    total = round(len(track) / RATE, 3)
    write_timeline(a.timeline, total, out, os.path.relpath(a.voice, os.path.dirname(os.path.abspath(a.timeline))))
    mode = "recogniser" if rec else "length only"
    print(f"{len(lines)} lines in {total} s from {len(a.audio)} file(s), cut by {mode}; {flagged} marked !")


main()

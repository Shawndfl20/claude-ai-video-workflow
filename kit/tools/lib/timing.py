"""Timeline maths shared by build-timeline.py (silent) and build-voice.py (narrated). Stdlib only.

lines-<node>.json:    [{"s": "<scene key>", "t": "<one sentence>", "hold"?: <s>, "speed"?: <0.5-2>}]
timeline-<node>.json: {"total": <s>, "lines": [{"s", "t", "d", "start", "end"}], "voice"?: "<wav, relative to the timeline>"}
"""
import json
import math
import re
import sys

MAX_SECONDS = 180  # YouTube Shorts limit; check.mjs enforces it (--max-seconds 0 for long-form)

# Reading speed for silent videos: visible characters per second,
# punctuation, quotes and whitespace do not count.
READ_CPS, READ_MIN, READ_EXTRA = 4.2, 1.6, 0.3
UNCOUNTED = re.compile(r"[，。：；？、！“”\s]")


def read_lines(path):
    """Load a lines file; stop with a clear message unless every entry has non-empty "s" and "t"."""
    with open(path, encoding="utf-8") as f:
        lines = json.load(f)
    if not isinstance(lines, list) or not lines:
        sys.exit(f'{path}: expected a non-empty JSON array of {{"s": <scene key>, "t": <sentence>}}')
    for i, line in enumerate(lines, start=1):
        if not isinstance(line, dict) or not all(isinstance(line.get(k), str) and line[k].strip() for k in ("s", "t")):
            sys.exit(f'{path}: line {i} needs non-empty string fields "s" (scene key) and "t" (text), got {line!r}')
        for field, low, high in (("hold", 0, None), ("speed", 0.5, 2)):
            if field not in line:
                continue
            value = line[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                sys.exit(f'{path}: line {i} field "{field}" must be a finite number, got {value!r}')
            if value < low or (high is not None and value > high):
                expected = f">= {low}" if high is None else f"between {low} and {high}"
                sys.exit(f'{path}: line {i} field "{field}" must be {expected}, got {value!r}')
    return lines


def reading_seconds(text):
    """Duration of one line in a silent video, rounded to 2 decimals."""
    chars = len(UNCOUNTED.sub("", text))
    return round(max(READ_MIN, chars / READ_CPS + READ_EXTRA), 2)


def lay_out(lines, durations, *, lead, gap, scene_gap, tail, digits):
    """Place lines back to back after `lead` seconds: `gap` between lines of the same scene key,
    `scene_gap` when the key changes, plus the previous line's optional `hold`; `tail` follows the
    last line. Sets d/start/end on each line (in that key order) and returns the total length."""
    t, prev, prev_hold = lead, None, 0
    for line, d in zip(lines, durations):
        line["d"] = d
        if prev is not None:
            t += (scene_gap if line["s"] != prev else gap) + prev_hold
        line["start"] = round(t, digits)
        t += d
        line["end"] = round(t, digits)
        prev = line["s"]
        prev_hold = line.get("hold", 0)
    return round(t + tail, digits)


def write_timeline(path, total, lines, voice=None):
    """Write the timeline JSON (UTF-8, indent 1); warn when it is too long."""
    data = {"total": total, "lines": lines}
    if voice:
        data["voice"] = voice
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    if total > MAX_SECONDS:
        print(f"warning: total {total} s is over the {MAX_SECONDS} s limit; shorten the script", file=sys.stderr)

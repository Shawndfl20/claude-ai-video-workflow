"""Silent timing: give every line a reading-speed duration and write the timeline.

Usage (from a video folder):
  python -X utf8 ../kit/tools/build-timeline.py lines-read.json timeline-read.json

Reading-speed timing: d = max(1.6, chars / 4.2 + 0.3) with
punctuation and spaces not counted, 0.8 s lead, 0.35 s between lines of one scene key, 1.0 s when the
key changes, 3.0 s tail, 2 decimals. Always rebuild the timeline after editing the lines; never edit it by hand.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from timing import lay_out, read_lines, reading_seconds, write_timeline  # noqa: E402

LEAD, GAP, SCENE_GAP, TAIL = 0.8, 0.35, 1.0, 3.0


def main():
    ap = argparse.ArgumentParser(description="Build a silent (reading-speed) timeline from a lines file.")
    ap.add_argument("lines", help="lines-<node>.json")
    ap.add_argument("timeline", help="timeline-<node>.json to write")
    args = ap.parse_args()

    lines = read_lines(args.lines)
    total = lay_out(lines, [reading_seconds(line["t"]) for line in lines],
                    lead=LEAD, gap=GAP, scene_gap=SCENE_GAP, tail=TAIL, digits=2)
    write_timeline(args.timeline, total, lines)
    print(f"{args.timeline}: {len(lines)} lines, total {total} s")


if __name__ == "__main__":
    main()

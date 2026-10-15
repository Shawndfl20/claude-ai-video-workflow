"""Narrated timeline with the offline Kokoro v1.1 voice (sherpa-onnx, Apache-2.0), for drafts or when AIML_API_KEY is not set.
Same layout constants and output format as the kit's build-voice.py, so every kit tool reads the result.
Check the readings afterwards with asr-check.py.

  python -X utf8 voice-kokoro.py lines.json --timeline timeline.json --voice voice-vo.wav [--models DIR] [--sid 3] [--speed 1.25]

--models defaults to $VIDEO_MODELS or ~/.cache/ai-video-workflow/models (scripts/fetch-models.sh fills it).
sid 3 is a Chinese female voice; for English pick a Kokoro English speaker id.
Needs: pip install sherpa-onnx numpy. Lines may carry "say" (text sent to the voice when it must differ from the caption)
and "speed".
"""
import argparse, array, hashlib, json, os, sys, wave
import numpy as np
import sherpa_onnx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from timing import lay_out, read_lines, write_timeline  # noqa: E402

RATE = 24000
LEAD, GAP, SCENE_GAP, TAIL = 0.8, 0.3, 0.9, 3.0
TRIM_LEVEL, TRIM_PAD = 600, 0.04


def kokoro(m, threads=4):
    k = os.path.join(m, "kokoro-multi-lang-v1_1") + "/"
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=k + "model.onnx", voices=k + "voices.bin", tokens=k + "tokens.txt", data_dir=k + "espeak-ng-data",
            dict_dir=k + "dict", lexicon=k + "lexicon-us-en.txt," + k + "lexicon-zh.txt"), num_threads=threads),
        rule_fsts=k + "phone-zh.fst," + k + "date-zh.fst," + k + "number-zh.fst", max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def to24k(x, sr):
    if sr == RATE:
        return x
    n = int(len(x) * RATE / sr)
    return np.interp(np.arange(n) * sr / RATE, np.arange(len(x)), x)


def trim(pcm):
    s = array.array("h", pcm)
    first = next(i for i, v in enumerate(s) if abs(v) > TRIM_LEVEL)
    last = next(i for i in range(len(s) - 1, -1, -1) if abs(s[i]) > TRIM_LEVEL)
    pad = int(RATE * TRIM_PAD)
    return s[max(0, first - pad): last + pad].tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lines"); ap.add_argument("--timeline", required=True); ap.add_argument("--voice", required=True)
    ap.add_argument("--models", default=os.environ.get("VIDEO_MODELS") or os.path.expanduser("~/.cache/ai-video-workflow/models")); ap.add_argument("--sid", type=int, default=3); ap.add_argument("--speed", type=float, default=1.25)
    ap.add_argument("--cache-dir", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "voice"))
    a = ap.parse_args()
    lines = read_lines(a.lines)
    os.makedirs(a.cache_dir, exist_ok=True)
    tts, clips = None, []
    for line in lines:
        say, speed = line.get("say", line["t"]), line.get("speed", a.speed)
        key = hashlib.sha1(json.dumps(["kokoro-v1.1-zh", a.sid, say, speed], ensure_ascii=False).encode()).hexdigest()
        cache = os.path.join(a.cache_dir, key + ".pcm")
        if not os.path.exists(cache):
            tts = tts or kokoro(a.models)
            g = tts.generate(say, sid=a.sid, speed=speed)
            x = np.clip(to24k(np.array(g.samples), g.sample_rate) * 32767, -32768, 32767).astype("<i2")
            with open(cache, "wb") as f:
                f.write(x.tobytes())
        with open(cache, "rb") as f:
            clips.append(trim(f.read()))
    durations = [round(len(c) / 2 / RATE, 3) for c in clips]
    total = lay_out(lines, durations, lead=LEAD, gap=GAP, scene_gap=SCENE_GAP, tail=TAIL, digits=3)
    track = bytearray(int(total * RATE) * 2)
    for line, c in zip(lines, clips):
        o = int(line["start"] * RATE) * 2
        track[o:o + len(c)] = c
    with wave.open(a.voice, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(track))
    for line in lines:
        line.pop("say", None)
    write_timeline(a.timeline, total, lines, voice=os.path.basename(a.voice))
    print(f"{len(lines)} lines, total {total} s")


main()

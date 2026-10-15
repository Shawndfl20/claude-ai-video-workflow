"""Read-back check of a narration: transcribe every line of a voiced timeline with an offline recogniser and print
the lines whose transcript differs from the script. Catches misread characters, numbers and names.

  python -X utf8 asr-check.py <timeline.json> [--wav <narration.wav>] [--lang zh|en|...] [--models DIR] [--min 0.97]

The recogniser per language is registered in lib/asr.py (zh: Paraformer, en: Whisper; models from
scripts/fetch-models.sh). A Traditional-Chinese script is compared in Simplified, as Paraformer writes Simplified.
Homophones (它/他) and spelling of names show up as differences too: read them, they are not all errors.
With no recogniser for the language the check says why and stops. The wav defaults to the timeline's "voice".
Exit code is 0 either way: this is a review aid.
"""
import argparse, difflib, json, os, sys, wave
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import asr  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("timeline"); ap.add_argument("--wav"); ap.add_argument("--lang")
    ap.add_argument("--models", default=asr.MODELS_DIR)
    ap.add_argument("--min", type=float, default=.97, help="similarity under which a line is printed")
    a = ap.parse_args()
    tl = json.load(open(a.timeline, encoding="utf-8"))
    lang = a.lang or asr.detect(l["t"] for l in tl["lines"])
    rec, why = asr.load(lang, a.models)
    if rec is None:
        print(f"read-back check skipped: {why}")
        return
    wav = a.wav or os.path.join(os.path.dirname(os.path.abspath(a.timeline)), tl["voice"])
    with wave.open(wav) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
    bad = 0
    for i, line in enumerate(tl["lines"]):
        st = rec.create_stream()
        st.accept_waveform(sr, x[int(line["start"] * sr):int(line["end"] * sr)])
        rec.decode_stream(st)
        heard = st.result.text.strip()
        r = difflib.SequenceMatcher(None, asr.units(line["t"], lang), asr.units(heard, lang), autojunk=False).ratio()
        if r < a.min:
            bad += 1
            print(f"{i:3d} {r:.2f}\n    script {line['t']}\n    heard  {heard}")
    print(f"{len(tl['lines'])} lines, {bad} differ ({lang})")


main()

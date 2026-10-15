"""Offline speech recognisers shared by asr-check.py and import-voice.py (sherpa-onnx; models fetched by
scripts/fetch-models.sh into $VIDEO_MODELS, default ~/.cache/ai-video-workflow/models).

Another language: add an entry to RECOGNISERS (a sherpa-onnx model folder and how to load it), its download line to
scripts/fetch-models.sh, and, if its text needs folding before comparison, a case in units(). Nothing else changes.
"""
import functools
import os
import re

MODELS_DIR = os.environ.get("VIDEO_MODELS") or os.path.expanduser("~/.cache/ai-video-workflow/models")
CJK = re.compile(r"[㐀-鿿豈-﫿]")

RECOGNISERS = {  # language -> (model folder under MODELS_DIR, loader(sherpa_onnx, folder path))
    "zh": ("sherpa-onnx-paraformer-zh-small-2024-03-09",
           lambda so, p: so.OfflineRecognizer.from_paraformer(paraformer=p + "/model.int8.onnx",
                                                              tokens=p + "/tokens.txt", num_threads=4)),
    "en": ("sherpa-onnx-whisper-base.en",
           lambda so, p: so.OfflineRecognizer.from_whisper(encoder=p + "/base.en-encoder.int8.onnx",
                                                           decoder=p + "/base.en-decoder.int8.onnx",
                                                           tokens=p + "/base.en-tokens.txt", num_threads=4)),
}


def detect(texts):
    """Language of a script when none is given: zh when it has CJK characters, else en."""
    return "zh" if any(CJK.search(t) for t in texts) else "en"


def load(lang, models=MODELS_DIR):
    """(recogniser, None), or (None, why not) when the language, sherpa-onnx or the model is missing."""
    if lang not in RECOGNISERS:
        return None, f'no recogniser registered for "{lang}" (add one to RECOGNISERS in kit/tools/lib/asr.py)'
    try:
        import sherpa_onnx
    except ImportError:
        return None, "sherpa-onnx is not installed (scripts/setup.sh)"
    folder, loader = RECOGNISERS[lang]
    path = os.path.join(models, folder)
    if not os.path.isdir(path):
        return None, f"model {folder} is missing (scripts/fetch-models.sh)"
    return loader(sherpa_onnx, path), None


def units(text, lang):
    """What a script and a transcript are compared on: characters for zh (Traditional folded to Simplified, which is
    what Paraformer writes), lower-case words otherwise. Sound tags like [MUSIC] or (laughs) are dropped."""
    text = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", text).lower()
    if lang == "zh":
        return list(re.sub(r"[^0-9a-z㐀-鿿豈-﫿]", "", _t2s()(text)))
    return re.sub(r"[^\w\s']", " ", text).split()


@functools.lru_cache(maxsize=None)
def _t2s():
    from opencc import OpenCC
    return OpenCC("t2s").convert

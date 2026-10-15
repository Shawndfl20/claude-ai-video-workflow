#!/usr/bin/env bash
# Offline models (not in git): read-back speech recognition for zh/en, and the Kokoro voice for drafts.
#   scripts/fetch-models.sh            # recognisers only (~260 MB)
#   scripts/fetch-models.sh --voice    # + Kokoro multi-lang voice (~400 MB)
# Into $VIDEO_MODELS, default ~/.cache/ai-video-workflow/models.
set -euo pipefail
DEST="${VIDEO_MODELS:-$HOME/.cache/ai-video-workflow/models}"
mkdir -p "$DEST"
BASE=https://github.com/k2-fsa/sherpa-onnx/releases/download
get() { # <dir name> <url>
  [ -d "$DEST/$1" ] && { echo "have $1"; return; }
  echo "fetch $1"; curl -fsSL "$2" | tar xj -C "$DEST"
}
get sherpa-onnx-paraformer-zh-small-2024-03-09 "$BASE/asr-models/sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2"
get sherpa-onnx-whisper-base.en "$BASE/asr-models/sherpa-onnx-whisper-base.en.tar.bz2"
[ "${1:-}" = "--voice" ] && get kokoro-multi-lang-v1_1 "$BASE/tts-models/kokoro-multi-lang-v1_1.tar.bz2"
echo "models in $DEST"

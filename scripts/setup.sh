#!/usr/bin/env bash
# Prepare this checkout to make videos: Playwright + Chromium, a Python venv (numpy, sherpa-onnx) and the fonts.
# Idempotent and quick on a second run. The offline voice / speech models are separate: scripts/fetch-models.sh.
# A machine that sets PLAYWRIGHT_MODULE / PYTHON manages those itself: they are used as they are, not installed into.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v "${FFMPEG:-ffmpeg}" >/dev/null || echo "warn: ffmpeg with libx264 not found on PATH; install it or set FFMPEG" >&2

# Node: Playwright drives Chromium for checks, contact sheets and rendering.
[ -n "${PLAYWRIGHT_MODULE:-}" ] || [ -d node_modules/playwright ] || npm install --no-audit --no-fund --loglevel=error
# Browser: use the environment's Chromium when it provides one (cloud sessions do), else Playwright's own.
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -z "${CHROMIUM:-}" ]; then npx --yes playwright install chromium; fi

# Python: numpy for the mix; sherpa-onnx for the offline voice and the read-back check.
if [ -n "${PYTHON:-}" ]; then
  PY=$PYTHON
  "$PY" -c "import sherpa_onnx" 2>/dev/null || echo "warn: sherpa-onnx missing in $PY; read-back check and Kokoro voice are skipped" >&2
else
  [ -x .venv/bin/python ] || python3 -m venv .venv
  PY=.venv/bin/python
  .venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
fi

# Fonts (git-ignored): Noto Sans SC and TC Bold/Black (Latin + CJK) and ZCOOL KuaiLe.
[ -f kit/.fonts/NotoSansSC-Black.otf ] && [ -f kit/.fonts/NotoSansTC-Black.otf ] || "$PY" -X utf8 kit/tools/fetch-fonts.py

echo "setup ok"

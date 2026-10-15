"""Audio decoding shared by build-voice.py and import-voice.py: anything ffmpeg reads -> 24 kHz mono 16-bit samples."""
import os
import subprocess
import sys

import numpy as np

RATE = 24000   # Hz of every narration track the kit writes


def decode(source):
    """A file path, or audio bytes in any format ffmpeg knows, -> int16 numpy array at RATE, mono."""
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    name = source if isinstance(source, str) else "audio"
    try:
        r = subprocess.run([ffmpeg, "-v", "error", "-i", source if isinstance(source, str) else "pipe:0",
                            "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"],
                           input=None if isinstance(source, str) else source, capture_output=True, check=False)
    except FileNotFoundError:
        sys.exit(f'ffmpeg not found ("{ffmpeg}"); set FFMPEG')
    if r.returncode != 0 or not r.stdout:
        sys.exit(f"{name}: ffmpeg could not decode it: {r.stderr.decode(errors='replace').strip()}")
    return np.frombuffer(r.stdout, dtype="<i2")

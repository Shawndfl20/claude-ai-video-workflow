"""Narrated timing through a TTS API: voice every line, trim the silence, lay the clips out on one track and write the
timeline (with "voice") plus a 24 kHz mono 16-bit WAV. This is the optional API path; narration made by the user
(for example on a TTS website) goes through import-voice.py instead.

Usage (from a video folder):
  python -X utf8 ../../kit/tools/build-voice.py lines-x.json --timeline timeline-x.json --voice voice-x-vo.wav
      --config video.json [--cache-dir DIR] [--dry-run]

Nothing about a voice is built in: the service, model and settings are the "voice" object of video.json, e.g.
  {"provider": "api", "url": "https://api.aimlapi.com/v1/tts", "keyEnv": "AIML_API_KEY",
   "model": "minimax/speech-2.8-hd", "params": {"voice_setting": {"voice_id": "...", "speed": 1.1}}}
One request per line: POST url with JSON {"model": model, "text": <line>, **params} and the header
"Authorization: Bearer <$keyEnv>". A line may carry "voice": {...} to override params for that line only.
The reply may be audio bytes, or JSON holding the audio as a URL, base64 or hex under "audio", "data", "url" or
"audio_file" (the shapes of the AIML gateway, MiniMax and similar services); any audio format ffmpeg reads is fine.
A service that works differently needs its own request in request_audio() below.

The key is read from the environment variable named by keyEnv; it is sent only in the header, never printed or
written. Clips are cached per (url, model, line text, params), so an unchanged line is never paid for twice.
--dry-run makes no request: durations are estimated from the text and the WAV is silent, for a draft timeline.
"""
import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import wave

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from audio import RATE, decode  # noqa: E402
from timing import UNCOUNTED, lay_out, read_lines, write_timeline  # noqa: E402

USER_AGENT = "ai-video-workflow/1.0"
LEAD, GAP, SCENE_GAP, TAIL = 0.8, 0.3, 0.9, 3.0
TRIM_LEVEL, TRIM_PAD = 600, 0.04   # |sample| counted as speech; padding kept around it (s)
ATTEMPTS, TIMEOUT = 4, 180
# --dry-run estimate: counted CJK characters / Latin characters (spaces included) per second of speech. Rough
# averages of narration voices; the real timeline replaces them once the lines are voiced.
CJK_CPS, LATIN_CPS = 4.7, 18.5
CJK = re.compile(r"[㐀-鿿豈-﫿]")
KIT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch(request, what):
    """urlopen with retries on network errors; an HTTP error stops with its status and body. -> (bytes, content type)"""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as reply:
                return reply.read(), reply.headers.get("Content-Type", "")
        except urllib.error.HTTPError as err:
            body = err.read()[:500].decode("utf-8", "replace")
            sys.exit(f"{what}: HTTP {err.code} {err.reason}: {body}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if attempt == ATTEMPTS:
                sys.exit(f"{what}: network error after {ATTEMPTS} attempts: {err}")
            print(f"  {what}: network error ({err}), retrying in {5 * attempt} s", file=sys.stderr)
            time.sleep(5 * attempt)


def find_audio(reply, depth=0):
    """Audio bytes from a JSON reply: a URL is downloaded, base64 or hex is decoded. None when nothing looks like audio."""
    if depth > 3:
        return None
    if isinstance(reply, dict):
        for key in ("audio", "data", "url", "audio_file", "audio_url"):
            if key in reply:
                found = find_audio(reply[key], depth + 1)
                if found:
                    return found
        return None
    if not isinstance(reply, str) or len(reply) < 16:
        return None
    if reply.startswith(("http://", "https://")):
        return fetch(urllib.request.Request(reply, headers={"User-Agent": USER_AGENT}), "audio download")[0]
    for convert in (bytes.fromhex, lambda s: base64.b64decode(s, validate=True)):
        try:
            return convert(reply)
        except (ValueError, binascii.Error):
            pass
    return None


def request_audio(cfg, text, params, key):
    """One line -> (audio bytes in any format, USD spent or None)."""
    body = {"model": cfg["model"], "text": text, **params}
    request = urllib.request.Request(cfg["url"], data=json.dumps(body).encode("utf-8"), headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "User-Agent": USER_AGENT})
    raw, ctype = fetch(request, "tts")
    if not ctype.startswith("application/json") and not raw.lstrip().startswith(b"{"):
        return raw, None
    reply = json.loads(raw)
    audio = find_audio(reply)
    if audio is None:
        sys.exit(f"tts: no audio found in the reply: {json.dumps(reply, ensure_ascii=False)[:300]}")
    usage = (reply.get("meta") or {}).get("usage") or {}
    return audio, usage.get("usd_spent")


def trim(pcm, index):
    """Cut leading/trailing silence, keeping TRIM_PAD around the first and last loud sample."""
    loud = np.flatnonzero(np.abs(pcm.astype(np.int32)) > TRIM_LEVEL)
    if not len(loud):
        sys.exit(f"line {index}: the voiced clip is silent; delete its cache file and try again")
    pad = int(RATE * TRIM_PAD)
    return pcm[max(0, loud[0] - pad): loud[-1] + pad]


def estimate_seconds(text):
    """--dry-run duration of one line."""
    if CJK.search(text):
        return round(max(1.0, len(UNCOUNTED.sub("", text)) / CJK_CPS), 3)
    return round(max(1.0, len(text) / LATIN_CPS), 3)


def main():
    ap = argparse.ArgumentParser(description="Voice a lines file through a TTS API and build the narrated timeline + WAV.")
    ap.add_argument("lines", help="lines-<name>.json")
    ap.add_argument("--timeline", required=True, help="timeline-<name>.json to write")
    ap.add_argument("--voice", required=True, help="WAV to write (24 kHz mono 16-bit)")
    ap.add_argument("--config", required=True, help='video.json, whose "voice" names url, keyEnv, model and params')
    ap.add_argument("--cache-dir", default=os.path.join(KIT_DIR, "build", "voice"))
    ap.add_argument("--dry-run", action="store_true", help="no API calls: timing estimated from the text and a silent WAV")
    args = ap.parse_args()

    with open(args.config, encoding="utf-8") as f:
        cfg = json.load(f).get("voice") or {}
    missing = [k for k in ("url", "model") if not cfg.get(k)]
    if missing and not args.dry_run:
        sys.exit(f'{args.config}: "voice" needs {" and ".join(missing)} for the API path (the user picks the service and model)')
    lines = read_lines(args.lines)

    key, spent, unknown, clips, sources = None, 0.0, 0, [], []
    for i, line in enumerate(lines, start=1):
        params = {**cfg.get("params", {}), **line.get("voice", {})}
        if args.dry_run:
            clips.append(None)
            sources.append("estimate")
            continue
        digest = hashlib.sha1(json.dumps([cfg["url"], cfg["model"], line["t"], params], ensure_ascii=False,
                                         sort_keys=True).encode("utf-8")).hexdigest()
        cache = os.path.join(args.cache_dir, digest + ".pcm")
        if os.path.exists(cache):
            sources.append("cached")
        else:
            env = cfg.get("keyEnv", "TTS_API_KEY")
            key = key or os.environ.get(env)
            if not key:
                sys.exit(f"set the environment variable {env} to voice new lines (or narrate yourself and use "
                         'provider "file"), or use --dry-run')
            audio, usd = request_audio(cfg, line["t"], params, key)
            if usd is None:
                unknown += 1
            else:
                spent += usd
            os.makedirs(args.cache_dir, exist_ok=True)
            with open(cache + ".part", "wb") as f:
                f.write(decode(audio).tobytes())
            os.replace(cache + ".part", cache)
            sources.append("new")
        with open(cache, "rb") as f:
            clips.append(trim(np.frombuffer(f.read(), dtype="<i2"), i))

    durations = [estimate_seconds(line["t"]) if clip is None else round(len(clip) / RATE, 3)
                 for line, clip in zip(lines, clips)]
    total = lay_out(lines, durations, lead=LEAD, gap=GAP, scene_gap=SCENE_GAP, tail=TAIL, digits=3)

    track = np.zeros(int(total * RATE), dtype="<i2")  # zeros = silence between clips
    for line, clip in zip(lines, clips):
        if clip is not None:
            offset = int(line["start"] * RATE)
            track[offset:offset + len(clip)] = clip
    with wave.open(args.voice, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(track.tobytes())

    voice_ref = os.path.relpath(os.path.abspath(args.voice), os.path.dirname(os.path.abspath(args.timeline))).replace(os.sep, "/")
    write_timeline(args.timeline, total, lines, voice=voice_ref)

    for i, (line, source) in enumerate(zip(lines, sources), start=1):
        print(f"{i:3d} {line['s']:<12} {line['d']:7.3f} s  hold {line.get('hold', 0):.1f} s  {source:<8} {line['t']}")
    new_chars = sum(len(line["t"]) for line, source in zip(lines, sources) if source == "new")
    cost = f"spent ${spent:.4f}" + (f" + {unknown} line(s) the service did not price (see its dashboard)" if unknown else "")
    print(f"{len(lines)} lines, {sum(len(line['t']) for line in lines)} chars ({new_chars} newly voiced), "
          f"total {total} s, {cost}{' (dry run: no API calls)' if args.dry_run else ''}")
    print(f"wrote {args.timeline} and {args.voice}")


if __name__ == "__main__":
    main()

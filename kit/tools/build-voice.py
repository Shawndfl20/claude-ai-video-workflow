"""Narrated timing: voice every line through the AIML API, trim the silence, lay the clips out on one
track and write the timeline (with "voice") plus a 24 kHz mono 16-bit WAV.

Usage (from a video folder):
  python -X utf8 ../kit/tools/build-voice.py lines-know.json --timeline timeline-know.json --voice voice-know.wav
      [--pron pronunciation.json] [--speed 1.2] [--provider minimax|hume] [--voice-name NAME] [--emotion happy]
      [--language-boost Chinese] [--cache-dir DIR] [--dry-run]

  --provider  minimax (default): MiniMax speech-2.8-hd; --voice-name is the MiniMax voice_id (default Wise_Woman),
              --emotion its emotion (default happy), --language-boost the language hint (default Chinese; MiniMax
              also takes e.g. English, Japanese, Korean, auto), --speed the speaking speed.
              hume: Hume Octave 2; --voice-name picks the Hume preset (default "Sitcom Girl").
              AIML passes Hume no speed or acting controls, so --speed, per-line "speed" and --pron do not apply.

  --pron      JSON array of MiniMax tone fixes for polyphonic words, e.g. ["差不多/(cha4)(bu4)(duo1)"]
  --cache-dir clips are cached per line text + voice settings, so an unchanged line is never paid for
              twice (default: the kit's build/voice/, which git ignores)
  --dry-run   no API call: durations estimated at the voice's speaking rate (VOICE_CPS) and a silent WAV,
              for a draft timeline and a silent review cut before paying for the voice

The key comes from env AIML_API_KEY (or AIML-API-KEY); it is sent only in the Authorization header and
never printed or written. The voice (Wise_Woman, happy, speed 1.2) is a default
choice. Stdlib only.
"""
import argparse
import array
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import wave

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from timing import UNCOUNTED, lay_out, read_lines, write_timeline  # noqa: E402

API_URL = "https://api.aimlapi.com/v1/tts"
MODEL = "minimax/speech-2.8-hd"
VOICE_ID, EMOTION, LANGUAGE = "Wise_Woman", "happy", "Chinese"   # MiniMax defaults
HUME_MODEL, HUME_VOICE = "hume/octave-2", "Sitcom Girl"
USER_AGENT = "ai-video-workflow/1.0"
RATE = 24000                       # Hz; the API returns 16-bit little-endian mono PCM at this rate
LEAD, GAP, SCENE_GAP, TAIL = 0.8, 0.3, 0.9, 3.0
TRIM_LEVEL, TRIM_PAD = 600, 0.04   # |sample| counted as speech; padding kept around it (s)
ATTEMPTS, TIMEOUT = 4, 180
# --dry-run estimate: counted characters per second of trimmed speech, measured on a
# re-dub with the product voice settings, speed 1.2 (451 characters in 80.7 s). The draft timeline then has about the
# rhythm and length of the narrated one, so a silent review cut can be made from it.
VOICE_CPS = 5.6
# The same estimate for an English line: characters (spaces included) per second, measured on Hume
# "Sitcom Girl" reading a sample hook (165 characters in 8.9 s).
LATIN_CPS = 18.5
CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
KIT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch(request, what):
    """urlopen with retries on network errors; an HTTP error stops with its status and body."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as reply:
                return reply.read()
        except urllib.error.HTTPError as err:
            body = err.read()[:500].decode("utf-8", "replace")
            sys.exit(f"{what}: HTTP {err.code} {err.reason}: {body}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if attempt == ATTEMPTS:
                sys.exit(f"{what}: network error after {ATTEMPTS} attempts: {err}")
            print(f"  {what}: network error ({err}), retrying in {5 * attempt} s", file=sys.stderr)
            time.sleep(5 * attempt)


def synthesize(text, voice_setting, tone, key, language=LANGUAGE):
    """One line -> (raw PCM bytes, USD spent)."""
    body = {"model": MODEL, "text": text, "language_boost": language, "voice_setting": voice_setting,
            "audio_setting": {"format": "pcm", "sample_rate": RATE, "channel": 1}}
    if tone:
        body["pronunciation_dict"] = {"tone": tone}
    request = urllib.request.Request(API_URL, data=json.dumps(body).encode("utf-8"), headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "User-Agent": USER_AGENT})
    raw = fetch(request, "tts")
    try:
        reply = json.loads(raw)
    except ValueError:
        sys.exit(f"tts: expected a JSON reply, got {len(raw)} bytes starting {raw[:60]!r}")
    audio = reply.get("audio")
    url = audio.get("url") if isinstance(audio, dict) else audio
    if not isinstance(url, str) or not url:
        sys.exit(f"tts: no audio url in the reply: {json.dumps(reply, ensure_ascii=False)[:300]}")
    pcm = fetch(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), "audio download")
    usd = ((reply.get("meta") or {}).get("usage") or {}).get("usd_spent", 0.0)
    return pcm, usd


def synthesize_hume(text, voice_name, key):
    """One line with Hume Octave 2 -> (24 kHz mono 16-bit PCM bytes, USD spent). AIML returns a WAV URL."""
    body = {"model": HUME_MODEL, "text": text, "voice": voice_name, "format": "wav"}
    request = urllib.request.Request(API_URL, data=json.dumps(body).encode("utf-8"), headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json", "User-Agent": USER_AGENT})
    raw = fetch(request, "tts")
    try:
        reply = json.loads(raw)
    except ValueError:
        sys.exit(f"tts: expected a JSON reply, got {len(raw)} bytes starting {raw[:60]!r}")
    audio = reply.get("audio")
    url = audio.get("url") if isinstance(audio, dict) else audio
    if not isinstance(url, str) or not url:
        sys.exit(f"tts: no audio url in the reply: {json.dumps(reply, ensure_ascii=False)[:300]}")
    data = fetch(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), "audio download")
    usage = (reply.get("meta") or {}).get("usage") or {}
    usd = usage.get("usd_spent")
    if usd is None:  # AIML documents only credits_used for Octave 2; replies seen so far also carry usd_spent
        print(f"  tts: reply has no usd_spent (credits_used {usage.get('credits_used')}); the spend total leaves this line out", file=sys.stderr)
        usd = 0.0
    return wav_to_pcm24k(data), usd


def wav_to_pcm24k(data):
    """A 16-bit WAV at any rate and channel count -> 24 kHz mono 16-bit PCM (channel mean, linear resampling)."""
    with wave.open(io.BytesIO(data)) as w:
        if w.getsampwidth() != 2:
            sys.exit(f"tts: expected 16-bit audio, got {8 * w.getsampwidth()}-bit")
        channels, rate = w.getnchannels(), w.getframerate()
        frames = array.array("h", w.readframes(w.getnframes()))
    mono = frames if channels == 1 else [sum(frames[i:i + channels]) / channels for i in range(0, len(frames), channels)]
    if rate == RATE:
        return array.array("h", (int(v) for v in mono)).tobytes()
    step, n = rate / RATE, int(len(mono) * RATE / rate)
    out = array.array("h", bytes(2 * n))
    last = len(mono) - 1
    for i in range(n):
        x = i * step
        j = int(x)
        k = min(j + 1, last)
        out[i] = int(mono[j] + (mono[k] - mono[j]) * (x - j))
    return out.tobytes()


def trim(pcm, index):
    """Cut leading/trailing silence, keeping TRIM_PAD around the first and last loud sample."""
    samples = array.array("h", pcm[: len(pcm) // 2 * 2])
    first = next((i for i, v in enumerate(samples) if abs(v) > TRIM_LEVEL), None)
    if first is None:
        sys.exit(f"line {index}: the voiced clip is silent; delete its cache file and try again")
    last = next(i for i in range(len(samples) - 1, -1, -1) if abs(samples[i]) > TRIM_LEVEL)
    pad = int(RATE * TRIM_PAD)
    return samples[max(0, first - pad): last + pad].tobytes()


def estimate_seconds(text, speed):
    """--dry-run duration of one line at VOICE_CPS (punctuation, quotes and spaces not counted), or of an
    English line at LATIN_CPS."""
    if not CJK.search(text):
        return round(max(1.0, len(text) / LATIN_CPS), 3)
    cps = VOICE_CPS * speed / 1.2
    return round(max(1.0, len(UNCOUNTED.sub("", text)) / cps), 3)


def read_pron(path):
    if not path:
        return []
    with open(path, encoding="utf-8") as f:
        tone = json.load(f)
    if not isinstance(tone, list) or not all(isinstance(x, str) and "/" in x for x in tone):
        sys.exit(f'{path}: expected a JSON array like ["差不多/(cha4)(bu4)(duo1)"]')
    return tone


def main():
    ap = argparse.ArgumentParser(description="Voice a lines file and build the narrated timeline + WAV.")
    ap.add_argument("lines", help="lines-<node>.json")
    ap.add_argument("--timeline", required=True, help="timeline-<node>.json to write")
    ap.add_argument("--voice", required=True, help="WAV to write (24 kHz mono 16-bit)")
    ap.add_argument("--cache-dir", default=os.path.join(KIT_DIR, "build", "voice"))
    ap.add_argument("--pron", help="JSON array of MiniMax tone entries")
    ap.add_argument("--speed", type=float, help="MiniMax speaking speed (default 1.2)")
    ap.add_argument("--provider", choices=["minimax", "hume"], default="minimax")
    ap.add_argument("--voice-name", help=f"MiniMax voice_id (default {VOICE_ID}) or Hume preset (default {HUME_VOICE})")
    ap.add_argument("--emotion", default=EMOTION, help="MiniMax emotion")
    ap.add_argument("--language-boost", default=LANGUAGE, help="MiniMax language hint, e.g. Chinese, English, Japanese, auto")
    ap.add_argument("--dry-run", action="store_true", help="no API calls: timing estimated at the voice's speaking rate and a silent WAV")
    args = ap.parse_args()

    lines = read_lines(args.lines)
    tone = read_pron(args.pron)
    hume = args.provider == "hume"
    args.voice_name = args.voice_name or (HUME_VOICE if hume else VOICE_ID)
    if not hume and args.language_boost == "Chinese" and not any(CJK.search(line["t"]) for line in lines):
        sys.exit("these lines have no Chinese: set --language-boost (e.g. English, auto) for MiniMax, or use --provider hume")
    if hume and (args.pron or args.speed is not None or any("speed" in line for line in lines)):
        sys.exit("--provider hume takes no --pron, --speed or per-line speed: AIML passes Hume no such controls")
    default_voice_setting = ({"voice": args.voice_name, "speed": 1.0} if hume
                             else {"voice_id": args.voice_name, "emotion": args.emotion, "speed": args.speed or 1.2})

    key, spent, clips, sources, voice_settings = None, 0.0, [], [], []
    for i, line in enumerate(lines):
        voice_setting = default_voice_setting if hume else {**default_voice_setting, "speed": line.get("speed", default_voice_setting["speed"])}
        voice_settings.append(voice_setting)
        if args.dry_run:
            clips.append(None)
            sources.append("estimate")
            continue
        # Only the entries whose word occurs in this line are sent and hashed, so adding a word to a
        # shared pronunciation file does not re-voice (and re-pay for) every other line.
        line_tone = [x for x in tone if x.split("/", 1)[0] in line["t"]]
        key_parts = [HUME_MODEL if hume else MODEL, line["t"], voice_setting, line_tone]
        if not hume and args.language_boost != LANGUAGE:   # only a non-default hint joins the key, so old caches stay valid
            key_parts.append(args.language_boost)
        digest = hashlib.sha1(json.dumps(key_parts, ensure_ascii=False).encode("utf-8")).hexdigest()
        cache = os.path.join(args.cache_dir, digest + ".pcm")
        if os.path.exists(cache):
            sources.append("cached")
        else:
            key = key or os.environ.get("AIML_API_KEY") or os.environ.get("AIML-API-KEY")
            if not key:
                sys.exit("set AIML_API_KEY (or AIML-API-KEY) to voice new lines, or use --dry-run")
            pcm, usd = synthesize_hume(line["t"], args.voice_name, key) if hume else synthesize(line["t"], voice_setting, line_tone, key, args.language_boost)
            spent += usd
            os.makedirs(args.cache_dir, exist_ok=True)
            with open(cache + ".part", "wb") as f:
                f.write(pcm)
            os.replace(cache + ".part", cache)
            sources.append("new")
        with open(cache, "rb") as f:
            clips.append(trim(f.read(), i))

    durations = [estimate_seconds(line["t"], voice_setting["speed"]) if clip is None else round(len(clip) / 2 / RATE, 3)
                 for line, clip, voice_setting in zip(lines, clips, voice_settings)]
    total = lay_out(lines, durations, lead=LEAD, gap=GAP, scene_gap=SCENE_GAP, tail=TAIL, digits=3)

    track = bytearray(int(total * RATE) * 2)  # zeros = silence between clips
    for line, clip in zip(lines, clips):
        if clip:
            offset = int(line["start"] * RATE) * 2
            track[offset:offset + len(clip)] = clip
    with wave.open(args.voice, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(track))

    voice_ref = os.path.relpath(os.path.abspath(args.voice), os.path.dirname(os.path.abspath(args.timeline))).replace(os.sep, "/")
    write_timeline(args.timeline, total, lines, voice=voice_ref)

    for i, (line, source, voice_setting) in enumerate(zip(lines, sources, voice_settings), start=1):
        print(f"{i:3d} {line['s']:<12} {line['d']:7.3f} s  speed {voice_setting['speed']:.2f}  "
              f"hold {line.get('hold', 0):.1f} s  {source:<8} {line['t']}")
    new_chars = sum(len(line["t"]) for line, source in zip(lines, sources) if source == "new")
    print(f"{len(lines)} lines, {sum(len(line['t']) for line in lines)} chars ({new_chars} newly voiced), "
          f"total {total} s, spent ${spent:.4f}{' (dry run: no API calls)' if args.dry_run else ''}")
    print(f"wrote {args.timeline} and {args.voice}")


if __name__ == "__main__":
    main()

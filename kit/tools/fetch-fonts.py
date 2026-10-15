"""Download the kit fonts into kit/.fonts/ (git-ignored; the style CSS loads them from there).

Usage (from anywhere):
  python -X utf8 kit/tools/fetch-fonts.py [HK JP KR ...]   # Noto Sans SC and TC always; other Noto CJK sets on request

Files that already exist with a valid font header are kept. Downloads go to a .part file first and are
checked (OpenType "OTTO" / TrueType 00 01 00 00) before they replace anything. urllib honours HTTPS_PROXY.
"""
import os
import sys
import urllib.request

NOTO = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/{0}/NotoSans{0}-{1}.otf"
OTF, TTF = b"OTTO", b"\x00\x01\x00\x00"
SETS = ["SC", "TC"]   # Noto Sans CJK sets fetched by default; more as arguments (HK, JP, KR), used by buildShell({ glyphs })


def fonts(sets):
    """(file name in .fonts/, source URL, expected magic) for the Noto sets plus the keyword font."""
    noto = [(f"NotoSans{s}-{w}.otf", NOTO.format(s, w), OTF) for s in sets for w in ("Bold", "Black")]
    return noto + [("ZCOOLKuaiLe.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf", TTF)]


DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".fonts")


def has_magic(path, magic):
    with open(path, "rb") as f:
        return f.read(4) == magic


def main():
    os.makedirs(DEST, exist_ok=True)
    for name, url, magic in fonts(SETS + [a.upper() for a in sys.argv[1:] if a.upper() not in SETS]):
        path = os.path.join(DEST, name)
        if os.path.exists(path) and has_magic(path, magic):
            print(f"ok     {name} ({os.path.getsize(path)} bytes, already present)")
            continue
        print(f"fetch  {name} <- {url}")
        part = path + ".part"
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ai-video-workflow/1.0"})
            with urllib.request.urlopen(request, timeout=120) as reply, open(part, "wb") as f:
                while chunk := reply.read(1 << 20):
                    f.write(chunk)
        except OSError as err:  # URLError, HTTPError and timeouts are all OSErrors
            if os.path.exists(part):
                os.remove(part)
            sys.exit(f"download failed for {name}: {err}")
        if not has_magic(part, magic):
            os.remove(part)
            sys.exit(f"{name}: the download is not a font file (proxy or error page?): {url}")
        os.replace(part, path)
        print(f"ok     {name} ({os.path.getsize(path)} bytes)")
    print(f"fonts in {DEST}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""music/ folder ကို scan ပြီး library.json (+ covers/) ထုတ်ပေးတယ်။

mutagen ရှိရင် tag (artist/album/title/ကြာချိန်/cover) ကို ဖတ်တယ်။
မရှိရင် folder/ဖိုင်နာမည်ကနေ ခန့်မှန်းတယ်:
    music/Artist/Album/01 - Title.mp3
"""
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

try:
    import mutagen
    from mutagen.id3 import ID3
    from mutagen.mp4 import MP4
    from mutagen.flac import FLAC
    HAVE_MUTAGEN = True
except ImportError:
    HAVE_MUTAGEN = False

ROOT = Path(__file__).resolve().parent.parent
MUSIC = ROOT / "music"
COVERS = ROOT / "covers"
EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"}
FOLDER_COVERS = ("cover", "folder", "front", "album")
IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def url_for(path: Path) -> str:
    return "/".join(quote(p) for p in path.relative_to(ROOT).parts)


def parse_filename(stem: str):
    m = re.match(r"^\s*(\d{1,3})\s*[-._)\s]+\s*(.+)$", stem)
    if m:
        return int(m.group(1)), m.group(2).strip()
    return 0, stem.strip()


def first(tags, key):
    v = tags.get(key) if tags else None
    if isinstance(v, list):
        v = v[0] if v else None
    return str(v).strip() if v else None


def read_tags(path: Path):
    """dict(title, artist, album, track, duration, year, genre) — တန်ဖိုး မရှိရင် None/0"""
    out = {"title": None, "artist": None, "album": None, "track": 0,
           "duration": 0, "year": None, "genre": None}
    if not HAVE_MUTAGEN:
        return out
    try:
        f = mutagen.File(path, easy=True)
        if f is None:
            return out
        out["duration"] = int(getattr(f.info, "length", 0) or 0)
        t = f.tags
        out["title"] = first(t, "title")
        out["artist"] = first(t, "artist") or first(t, "albumartist")
        out["album"] = first(t, "album")
        out["genre"] = first(t, "genre")
        tn = first(t, "tracknumber")
        if tn:
            m = re.match(r"\d+", tn)
            out["track"] = int(m.group()) if m else 0
        dt = first(t, "date")
        if dt:
            m = re.match(r"\d{4}", dt)
            out["year"] = int(m.group()) if m else None

        # WAV / AIFF ထဲက ID3 tag (easy key မရှိလို့ frame နာမည်နဲ့ ဖတ်)
        if t is not None and not (out["title"] or out["artist"] or out["album"]):
            def tx(k):
                fr = t.get(k)
                txt = getattr(fr, "text", None)
                return str(txt[0]).strip() if txt else None
            out["title"] = tx("TIT2")
            out["artist"] = tx("TPE1") or tx("TPE2")
            out["album"] = tx("TALB")
            out["genre"] = tx("TCON")
            trk = tx("TRCK")
            if trk:
                m = re.match(r"\d+", trk)
                out["track"] = int(m.group()) if m else 0
            yr = tx("TDRC") or tx("TYER")
            if yr:
                m = re.match(r"\d{4}", yr)
                out["year"] = int(m.group()) if m else None
    except Exception:
        pass
    return out


def extract_embedded_cover(path: Path):
    if not HAVE_MUTAGEN:
        return None
    try:
        ext = path.suffix.lower()
        if ext == ".mp3":
            for k, v in ID3(path).items():
                if k.startswith("APIC"):
                    return v.data
        elif ext in (".m4a", ".aac"):
            covr = MP4(path).tags.get("covr")
            if covr:
                return bytes(covr[0])
        elif ext == ".flac":
            pics = FLAC(path).pictures
            if pics:
                return pics[0].data
    except Exception:
        pass
    return None


def folder_cover(folder: Path):
    for name in FOLDER_COVERS:
        for ext in IMG_EXTS:
            p = folder / (name + ext)
            if p.exists():
                return url_for(p)
    return None


def main():
    MUSIC.mkdir(exist_ok=True)
    COVERS.mkdir(exist_ok=True)

    tracks = []
    cover_cache = {}  # (artist, album) -> url|None

    for path in sorted(MUSIC.rglob("*")):
        if ".incoming" in path.parts:
            continue
        if path.suffix.lower() not in EXTS or not path.is_file():
            continue

        rel = path.relative_to(MUSIC).parts
        n, stem_title = parse_filename(path.stem)
        tags = read_tags(path)
        st = path.stat()
        added = int(max(st.st_mtime, st.st_ctime))

        # folder structure ကနေ ခန့်မှန်း: Artist/Album/file
        guess_artist = rel[-3] if len(rel) >= 3 else None
        guess_album = rel[-2] if len(rel) >= 2 else None

        artist = tags["artist"] or guess_artist or "Unknown Artist"
        album = tags["album"] or guess_album or "Singles"
        title = tags["title"] or stem_title
        track_no = tags["track"] or n

        key = (artist, album)
        if key not in cover_cache:
            cover = folder_cover(path.parent)
            if not cover:
                data = extract_embedded_cover(path)
                if data:
                    h = hashlib.md5((artist + album).encode("utf-8")).hexdigest()[:12]
                    out = COVERS / f"{h}.jpg"
                    out.write_bytes(data)
                    cover = url_for(out)
            cover_cache[key] = cover

        tracks.append({
            "id": url_for(path),
            "title": title,
            "artist": artist,
            "album": album,
            "track": track_no,
            "duration": tags["duration"],
            "year": tags["year"],
            "genre": tags["genre"],
            "added": added,
            "url": url_for(path),
            "cover": cover_cache[key],
        })

    (ROOT / "library.json").write_text(
        json.dumps({"generated": int(time.time()), "tracks": tracks}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    return len(tracks)


if __name__ == "__main__":
    total = main()
    note = "" if HAVE_MUTAGEN else "  (tag ဖတ်ဖို့: pip install mutagen)"
    print(f"library.json ထုတ်ပြီးပါပြီ: သီချင်း {total} ပုဒ်{note}")
    sys.exit(0)

#!/usr/bin/env python3
"""My Music server

- Password login  (Owner = upload လုပ်လို့ရ / Friend = နားထောင်ရုံ)
- Upload API      (Owner ပဲ) — tag / folder အလိုက် Artist/Album ခွဲသိမ်းပေးတယ်
- Range support   (phone/Safari မှာ seek လုပ်ဖို့ လိုတယ်)

    python scripts/serve.py          # port 8000
    python scripts/serve.py 9000
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import socket
import sys
import time
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_library as BL  # noqa: E402

os.chdir(ROOT)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

MUSIC = BL.MUSIC
INCOMING = MUSIC / ".incoming"
CONFIG_PATH = ROOT / "config.json"
SESSION_DAYS = 30
MAX_UPLOAD = 500 * 1024 * 1024
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# login မလုပ်ဘဲ ဖွင့်လို့ရတဲ့ path တွေ (login page + PWA manifest/icon)
PUBLIC_EXACT = {"/login.html", "/api/login", "/api/logout", "/manifest.json",
                "/css/base.css", "/css/login.css", "/js/login.js"}
PUBLIC_PREFIX = ("/assets/icons/",)
# ဘယ်သူ့ကိုမှ မပေးတဲ့ path တွေ
BLOCKED = re.compile(r"(^/config\.json|^/scripts/|^/\.git|__pycache__|/\.incoming)", re.I)


# ---------------------------------------------------------------- config
def gen_pw():
    return "-".join(secrets.token_hex(2) for _ in range(3))


def load_config():
    cfg = {}
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            print("config.json ဖတ်မရပါ — အသစ် ပြန်ဖန်တီးပါမယ်")
    changed = False
    for key, make in (("admin_password", gen_pw), ("guest_password", gen_pw),
                      ("secret", lambda: secrets.token_hex(32))):
        if not cfg.get(key):
            cfg[key] = make()
            changed = True
    if changed:
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return cfg


CFG = load_config()
SECRET = CFG["secret"].encode()


# ---------------------------------------------------------------- session token
def _sign(role, exp):
    return hmac.new(SECRET, f"{role}.{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def make_token(role):
    exp = int(time.time()) + SESSION_DAYS * 86400
    return f"{role}.{exp}.{_sign(role, exp)}"


def read_token(tok):
    try:
        role, exp, sig = tok.split(".")
        if role not in ("admin", "guest") or int(exp) < time.time():
            return None
        return role if hmac.compare_digest(sig, _sign(role, exp)) else None
    except Exception:
        return None


# ---------------------------------------------------------------- login rate limit
FAILS = {}


def too_many(key, limit):
    now = time.time()
    FAILS[key] = [t for t in FAILS.get(key, []) if now - t < 300]
    return len(FAILS[key]) >= limit


def add_fail(key):
    FAILS.setdefault(key, []).append(time.time())


# ---------------------------------------------------------------- file name helpers
def safe_name(s, fallback=None):
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s or "")
    s = re.sub(r"\s+", " ", s).strip(" .")
    return s[:120] or fallback


def pick_dir(artist, album):
    d = MUSIC / safe_name(artist, "Unknown Artist") / safe_name(album, "Singles")
    d.resolve().relative_to(MUSIC.resolve())      # folder အပြင် မထွက်စေရန်
    return d


def unique_path(p: Path):
    if not p.exists():
        return p
    n = 2
    while True:
        q = p.with_name(f"{p.stem} ({n}){p.suffix}")
        if not q.exists():
            return q
        n += 1


class Handler(SimpleHTTPRequestHandler):
    _range = None

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    # ------------------------------------------------ helpers
    def send_json(self, code, obj, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, to):
        self.send_response(302)
        self.send_header("Location", to)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def role(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        try:
            c = SimpleCookie(raw).get("mm_session")
            return read_token(c.value) if c else None
        except Exception:
            return None

    def client_key(self):
        fwd = self.headers.get("CF-Connecting-IP") or self.headers.get("X-Forwarded-For", "")
        return (fwd.split(",")[0].strip() or self.client_address[0])

    def is_https(self):
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https"

    def cookie(self, value, max_age):
        c = f"mm_session={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax"
        return c + ("; Secure" if self.is_https() else "")

    def read_body(self, limit=8192):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("body too large")
        return self.rfile.read(n) if n else b""

    def drain(self, n):
        while n > 0:
            chunk = self.rfile.read(min(n, 65536))
            if not chunk:
                break
            n -= len(chunk)

    def gate(self, path):
        """True ဆိုရင် ဆက်လုပ်လို့ရ။ False ဆိုရင် response ပို့ပြီးသား။"""
        if BLOCKED.search(path):
            self.send_error(404)
            return None
        role = self.role()
        public = path in PUBLIC_EXACT or path.startswith(PUBLIC_PREFIX)
        if role or public:
            return role or "public"
        if path == "/" or path.endswith(".html"):
            self.redirect("/login.html")
        else:
            self.send_json(401, {"error": "login လိုအပ်ပါတယ်"})
        return None

    # ------------------------------------------------ GET / HEAD
    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        role = self.gate(path)
        if role is None:
            return
        if path == "/login.html" and role != "public":
            return self.redirect("/")
        if path == "/api/me":
            return self.send_json(200, {"role": role})
        if path == "/__rescan":
            if role != "admin":
                return self.send_json(403, {"error": "Owner သာ လုပ်ခွင့်ရှိပါတယ်"})
            return self.send_json(200, {"tracks": BL.main()})
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "not found"})
        super().do_GET()

    def do_HEAD(self):
        path = unquote(urlparse(self.path).path)
        if self.gate(path) is None:
            return
        super().do_HEAD()

    # ------------------------------------------------ POST
    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/login":
            return self.handle_login()
        if path == "/api/logout":
            return self.send_json(200, {"ok": True}, cookie=self.cookie("", 0))
        if path == "/api/upload":
            role = self.gate(path)
            if role is None:
                return
            if role != "admin":
                self.drain(min(int(self.headers.get("Content-Length") or 0), MAX_UPLOAD))
                return self.send_json(403, {"error": "Owner သာ upload လုပ်ခွင့်ရှိပါတယ်"})
            return self.handle_upload()
        self.send_json(404, {"error": "not found"})

    def handle_login(self):
        key = self.client_key()
        if too_many(key, 5) or too_many("*", 40):
            return self.send_json(429, {"error": "မှားလွန်းပါတယ်။ ၅ မိနစ်ခန့် စောင့်ပြီး ပြန်ကြိုးစားပါ"})
        try:
            pw = str(json.loads(self.read_body() or b"{}").get("password", ""))
        except Exception:
            return self.send_json(400, {"error": "request မမှန်ပါ"})

        def same(a, b):
            return hmac.compare_digest(a.encode(), b.encode())

        role = "admin" if same(pw, CFG["admin_password"]) else \
               "guest" if same(pw, CFG["guest_password"]) else None
        if not role:
            add_fail(key)
            add_fail("*")
            time.sleep(0.6)
            return self.send_json(401, {"error": "Password မှားနေပါတယ်"})
        self.send_json(200, {"role": role},
                       cookie=self.cookie(make_token(role), SESSION_DAYS * 86400))

    def handle_upload(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self.send_json(400, {"error": "ဖိုင် ဗလာဖြစ်နေပါတယ်"})
        if length > MAX_UPLOAD:
            self.close_connection = True
            return self.send_json(413, {"error": "ဖိုင်ကြီးလွန်းပါတယ် (500MB အထိ)"})

        name = Path(unquote(self.headers.get("X-Filename", "")).replace("\\", "/")).name
        ext = Path(name).suffix.lower()
        is_img = ext in IMG_EXTS
        if ext not in BL.EXTS and not is_img:
            self.drain(length)
            return self.send_json(415, {"error": f"{ext or 'ဒီ'} ဖိုင်အမျိုးအစား မထောက်ပံ့ပါ"})

        o_artist = unquote(self.headers.get("X-Artist", "")).strip()
        o_album = unquote(self.headers.get("X-Album", "")).strip()
        hint = [p for p in unquote(self.headers.get("X-Hint", "")).replace("\\", "/").split("/") if p]
        h_artist = hint[-3] if len(hint) >= 3 else None
        h_album = hint[-2] if len(hint) >= 2 else None

        INCOMING.mkdir(parents=True, exist_ok=True)
        tmp = INCOMING / f"{secrets.token_hex(6)}{ext}"
        try:
            left = length
            with open(tmp, "wb") as f:
                while left > 0:
                    chunk = self.rfile.read(min(left, 256 * 1024))
                    if not chunk:
                        raise ConnectionError("upload ကြားဖြတ်ပြတ်သွားပါတယ်")
                    f.write(chunk)
                    left -= len(chunk)

            if is_img:
                artist, album = o_artist or h_artist, o_album or h_album
                if not (artist and album):
                    tmp.unlink(missing_ok=True)
                    return self.send_json(400, {"error": "cover ပုံအတွက် Artist/Album လိုပါတယ်"})
                dest_dir = pick_dir(artist, album)
                dest_dir.mkdir(parents=True, exist_ok=True)
                for old in dest_dir.glob("cover.*"):
                    old.unlink(missing_ok=True)
                dest = dest_dir / f"cover{ext}"
            else:
                tags = BL.read_tags(tmp)
                artist = o_artist or tags["artist"] or h_artist or "Unknown Artist"
                album = o_album or tags["album"] or h_album or "Singles"
                dest_dir = pick_dir(artist, album)
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / (safe_name(Path(name).stem, "track") + ext)
                if dest.exists() and dest.stat().st_size == tmp.stat().st_size:
                    tmp.unlink(missing_ok=True)
                    return self.send_json(200, {"ok": True, "dup": True, "artist": artist, "album": album})
                dest = unique_path(dest)

            shutil.move(str(tmp), str(dest))
            os.utime(dest, None)          # "ထည့်သည့်အချိန်" အဖြစ် မှတ်
            self.send_json(200, {"ok": True, "artist": artist, "album": album,
                                 "path": str(dest.relative_to(ROOT)).replace("\\", "/")})
        except (ConnectionError, BrokenPipeError, ConnectionResetError):
            tmp.unlink(missing_ok=True)
            self.close_connection = True
        except Exception as e:  # noqa: BLE001
            tmp.unlink(missing_ok=True)
            self.send_json(500, {"error": f"သိမ်းမရပါ: {e}"})

    # ------------------------------------------------ Range support
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        m = re.match(r"bytes=(\d*)-(\d*)$", rng or "")
        if not m or not os.path.isfile(path):
            return super().send_head()

        size = os.path.getsize(path)
        s, e = m.groups()
        if s == "" and e == "":
            return super().send_head()
        if s == "":
            start, end = max(size - int(e), 0), size - 1
        else:
            start = int(s)
            end = min(int(e), size - 1) if e else size - 1
        if start > end or start >= size:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        f = open(path, "rb")
        f.seek(start)
        self._range = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        try:
            if not self._range:
                return super().copyfile(source, outputfile)
            left = self._range[1] - self._range[0] + 1
            while left > 0:
                chunk = source.read(min(64 * 1024, left))
                if not chunk:
                    break
                outputfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    total = BL.main()
    print(f"သီချင်း {total} ပုဒ် တွေ့ပါတယ်\n")
    print(f"  Computer : http://localhost:{port}")
    print(f"  Phone    : http://{lan_ip()}:{port}   (WiFi တူရမယ်)\n")
    print(f"  Owner password  (upload လုပ်လို့ရ) : {CFG['admin_password']}")
    print(f"  Friend password (နားထောင်ရုံ)      : {CFG['guest_password']}")
    print("  (config.json ထဲမှာ ပြင်လို့ရတယ်)\n")
    print("သူငယ်ချင်းတွေကို share ရန်: README ထဲက 'Share လုပ်နည်း' ကိုကြည့်ပါ")
    print("ရပ်ချင်ရင် Ctrl+C")
    try:
        ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nရပ်လိုက်ပါပြီ")

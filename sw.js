/* Service Worker — app shell ကို offline မှာလည်း ဖွင့်လို့ရအောင် cache လုပ်တယ်။
   သီချင်းဖိုင်တွေကို cache မလုပ်ပါ (ဖိုင်ကြီးတယ်၊ Range request ပြဿနာရှိတယ်)။
   Code ပြင်ပြီးရင် VERSION ကို တိုးပါ။ */
const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/base.css',
  'css/layout.css',
  'css/player.css',
  'css/home.css',
  'js/main.js',
  'js/library.js',
  'js/player.js',
  'js/ui.js',
  'js/storage.js',
  'js/icons.js',
  'js/auth.js',
  'js/upload.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.headers.has('range')) return;                       // audio seek → browser ကိုပဲ ပေးထား
  if (/\/music\//.test(url.pathname)) return;                 // သီချင်းဖိုင် → network သာ
  if (url.pathname.endsWith('/__rescan') || url.pathname.includes('/api/')) return;   // login / upload / rescan → network သာ
  if (url.pathname.endsWith('/login.html')) return;

  // library.json → network အရင်၊ မရရင် cache
  if (url.pathname.endsWith('/library.json')) {
    e.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }
  // cover ပုံ → cache ပြပြီး နောက်ကွယ်မှာ update
  if (/\/covers\//.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }
  // app shell
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await fresh) || Response.error();
}

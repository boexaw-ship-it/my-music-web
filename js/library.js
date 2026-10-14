// library.json ကို ဖတ်တယ်။ မရှိရင် music/ folder listing ကို scan လုပ်တယ် (python server မှာ)
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i;

export const lib = { tracks: [], byId: new Map() };

export async function loadLibrary() {
  let tracks = null;
  try {
    const r = await fetch('library.json?t=' + Date.now());
    if (r.ok) tracks = (await r.json()).tracks;
  } catch { /* offline / မရှိ */ }

  if (!tracks || !tracks.length) {
    try { tracks = await scanDirectory('music/'); } catch { tracks = []; }
  }
  setTracks(tracks);
  return tracks.length;
}

function setTracks(tracks) {
  tracks.sort((a, b) =>
    a.artist.localeCompare(b.artist) ||
    a.album.localeCompare(b.album) ||
    (a.track || 999) - (b.track || 999) ||
    a.title.localeCompare(b.title, undefined, { numeric: true }));
  lib.tracks = tracks;
  lib.byId = new Map(tracks.map((t) => [t.id, t]));
}

/* ---- library.json မရှိရင် သုံးမယ့် fallback ---- */
async function scanDirectory(path, depth = 0, out = []) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('no listing');
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  for (const a of doc.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href || /^([?#/.]|[a-z]+:)/i.test(href)) continue;
    if (href.endsWith('/')) {
      if (depth < 6) await scanDirectory(path + href, depth + 1, out);
    } else if (AUDIO_EXT.test(decodeURIComponent(href))) {
      const parts = decodeURIComponent(path + href).split('/').slice(1); // 'music' ဖြုတ်
      const file = parts.pop().replace(AUDIO_EXT, '');
      const m = file.match(/^\s*(\d{1,3})\s*[-._)\s]+\s*(.+)$/);
      out.push({
        id: path + href, url: path + href,
        title: m ? m[2] : file, track: m ? +m[1] : 0, duration: 0, cover: null, year: null, genre: null, added: 0,
        artist: parts.length >= 2 ? parts[parts.length - 2] : 'Unknown Artist',
        album: parts.length ? parts[parts.length - 1] : 'Singles',
      });
    }
  }
  return out;
}

/* ---- grouping ---- */
export function albums() {
  const map = new Map();
  for (const t of lib.tracks) {
    const key = t.artist + ' / ' + t.album;
    if (!map.has(key)) map.set(key, { key, title: t.album, artist: t.artist, cover: t.cover, year: null, genre: null, added: 0, tracks: [] });
    const a = map.get(key);
    a.tracks.push(t);
    a.year = a.year || t.year || null;
    a.genre = a.genre || t.genre || null;
    a.added = Math.max(a.added, t.added || 0);
  }
  return [...map.values()];
}

export function artists() {
  const map = new Map();
  for (const t of lib.tracks) {
    if (!map.has(t.artist)) map.set(t.artist, { name: t.artist, cover: null, tracks: [], albums: new Set(), added: 0 });
    const a = map.get(t.artist);
    a.tracks.push(t); a.albums.add(t.album);
    a.added = Math.max(a.added, t.added || 0);
    if (!a.cover && t.cover) a.cover = t.cover;
  }
  return [...map.values()];
}

// filter dropdown အတွက်
export const genres = () => [...new Set(lib.tracks.map((t) => t.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export const years = () => [...new Set(lib.tracks.map((t) => t.year).filter(Boolean))].sort((a, b) => b - a);

export function search(q) {
  q = q.trim().toLowerCase();
  return lib.tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
}

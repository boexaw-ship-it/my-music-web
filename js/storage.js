// localStorage — favorites, playlists, recent, နောက်ဆုံးဖွင့်တာ၊ volume စတာတွေ မှတ်ထားတယ်
const KEY = 'mymusic:v1';
const defaults = () => ({
  favorites: [], playlists: [], recent: [],
  last: null, pos: 0, volume: 1, shuffle: false, repeat: 'off',
});

let data;
try { data = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
catch { data = defaults(); }

function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ } }

export const store = {
  get: (k) => data[k],
  set(k, v) { data[k] = v; save(); },
};

/* Favorites */
export const isFav = (id) => data.favorites.includes(id);
export function toggleFav(id) {
  const i = data.favorites.indexOf(id);
  if (i >= 0) data.favorites.splice(i, 1); else data.favorites.unshift(id);
  save();
  return i < 0; // true = ယခု favorite ဖြစ်သွားပြီ
}
export const favorites = () => data.favorites;

/* Recent */
export function pushRecent(id) {
  data.recent = [id, ...data.recent.filter((x) => x !== id)].slice(0, 50);
  save();
}

/* Playlists */
export const playlists = () => data.playlists;
export const getPlaylist = (pid) => data.playlists.find((p) => p.id === pid);
export function createPlaylist(name) {
  const p = { id: 'pl' + Date.now().toString(36), name: name.trim(), tracks: [] };
  data.playlists.push(p); save(); return p;
}
export function addToPlaylist(pid, tid) {
  const p = getPlaylist(pid);
  if (!p || p.tracks.includes(tid)) return false;
  p.tracks.push(tid); save(); return true;
}
export function removeFromPlaylist(pid, tid) {
  const p = getPlaylist(pid);
  if (p) { p.tracks = p.tracks.filter((x) => x !== tid); save(); }
}
export function deletePlaylist(pid) {
  data.playlists = data.playlists.filter((p) => p.id !== pid); save();
}

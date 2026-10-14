// Audio engine: queue, shuffle, repeat, Media Session (phone lock screen)
import { store, pushRecent } from './storage.js';

export const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

const audio = document.getElementById('audio');
let queue = [];
let idx = -1;
let history = [];            // shuffle မှာ "ယခင်" အတွက်
let shuffle = !!store.get('shuffle');
let repeat = store.get('repeat') || 'off';   // off | all | one
let lastSave = 0;

audio.volume = store.get('volume') ?? 1;

/* ---------- getters ---------- */
export const current = () => queue[idx] || null;
export const isPlaying = () => !audio.paused;
export const modes = () => ({ shuffle, repeat });
export const volume = () => audio.volume;
export const progress = () => ({
  time: audio.currentTime || 0,
  duration: isFinite(audio.duration) ? audio.duration : (current()?.duration || 0),
});

/* ---------- core ---------- */
function load(n, autoplay) {
  idx = n;
  const t = queue[n];
  audio.src = t.url;
  if (autoplay) audio.play().catch(() => {});
  pushRecent(t.id);
  store.set('last', t.id);
  store.set('pos', 0);
  updateMediaSession(t);
  emit('track', t);
}

export function playQueue(list, id) {
  queue = list.slice();
  history = [];
  const n = Math.max(0, queue.findIndex((t) => t.id === id));
  load(n, true);
}

export function restore(list) {
  const id = store.get('last');
  const n = list.findIndex((t) => t.id === id);
  if (n < 0) return;
  queue = list.slice();
  idx = n;
  const pos = store.get('pos') || 0;
  audio.src = queue[n].url;
  audio.addEventListener('loadedmetadata', () => {
    if (pos > 0 && pos < audio.duration - 2) audio.currentTime = pos;
  }, { once: true });
  updateMediaSession(queue[n]);
  emit('track', queue[n]);
}

export function toggle() {
  if (idx < 0) return;
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

export function next(auto = false) {
  if (!queue.length) return;
  if (auto && repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  let n;
  if (shuffle && queue.length > 1) {
    do { n = Math.floor(Math.random() * queue.length); } while (n === idx);
  } else {
    n = idx + 1;
    if (n >= queue.length) {
      if (repeat === 'all' || !auto) n = 0;
      else { audio.pause(); audio.currentTime = 0; return; }  // list အဆုံး
    }
  }
  history.push(idx);
  load(n, true);
}

export function prev() {
  if (!queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (shuffle && history.length) { load(history.pop(), true); return; }
  load(idx - 1 < 0 ? queue.length - 1 : idx - 1, true);
}

export function seekFrac(f) {
  const { duration } = progress();
  if (duration) audio.currentTime = f * duration;
}

export function setVolume(v) {
  audio.volume = Math.min(1, Math.max(0, v));
  store.set('volume', audio.volume);
}

export function setShuffle(v) {
  shuffle = v; store.set('shuffle', v); emit('mode');
}
export const toggleShuffle = () => setShuffle(!shuffle);

export function cycleRepeat() {
  repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
  store.set('repeat', repeat);
  emit('mode');
}

/* ---------- audio events ---------- */
audio.addEventListener('play', () => { emit('play'); setSessionState('playing'); });
audio.addEventListener('pause', () => { emit('pause'); setSessionState('paused'); });
audio.addEventListener('ended', () => next(true));
audio.addEventListener('loadedmetadata', () => emit('time'));
audio.addEventListener('timeupdate', () => {
  emit('time');
  const now = Date.now();
  if (now - lastSave > 4000) { lastSave = now; store.set('pos', Math.floor(audio.currentTime)); }
  updatePosition();
});
audio.addEventListener('error', () => emit('error', current()));

/* ---------- Media Session (lock screen / headset buttons) ---------- */
function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  const artwork = t.cover ? [{ src: new URL(t.cover, location.href).href, sizes: '512x512' }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork });
}
function setSessionState(s) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = s;
}
function updatePosition() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const { time, duration } = progress();
  if (!duration) return;
  try { navigator.mediaSession.setPositionState({ duration, position: Math.min(time, duration), playbackRate: audio.playbackRate }); } catch { /* ignore */ }
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* မထောက်ပံ့ */ } };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', () => prev());
  set('nexttrack', () => next());
  set('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
  set('seekforward', () => { audio.currentTime += 10; });
  set('seekto', (d) => { audio.currentTime = d.seekTime; });
}

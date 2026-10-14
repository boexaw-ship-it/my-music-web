// UI: view render, player bar sync, bottom sheet, keyboard shortcuts
import { icon, hydrateIcons } from './icons.js';
import { lib, loadLibrary, albums, artists, genres, years, search } from './library.js';
import * as P from './player.js';
import * as S from './storage.js';
import { getRole, isAdmin, logout } from './auth.js';
import { mountUpload } from './upload.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => {
  if (!isFinite(s) || s <= 0) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
};
const hueOf = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; };

/* ---------- state ---------- */
let route = { name: 'home', id: null };
let query = '';
let shown = [];            // မျက်နှာပြင်ပေါ်က track list (play queue အဖြစ် သုံးမယ်)
let dragging = false;
let ignorePop = false;
let sheetTrack = null;
const cat = { tab: 'albums', genre: '', year: '', sort: 'recent' };

const DETAIL = ['album', 'artist', 'playlist'];
const PARENT = { album: 'catalog', artist: 'catalog', playlist: 'playlists' };
const TITLES = { home: 'Home', catalog: 'Catalog', favorites: 'Favorites', playlists: 'Playlists', upload: 'Upload', album: 'Album', artist: 'Artist', playlist: 'Playlist' };
const isDetail = (n) => DETAIL.includes(n);

/* ---------- small html helpers ---------- */
function coverHTML({ cover, seed, label }, extra = '') {
  const letter = esc(([...(label || '♪')][0] || '♪').toUpperCase());
  const img = cover ? `<img loading="lazy" src="${esc(cover)}" alt="" onerror="this.remove()">` : '';
  return `<div class="cover ${extra}" style="--h:${hueOf(seed || label || '')}"><span>${letter}</span>${img}</div>`;
}
const trackCover = (t, extra) => coverHTML({ cover: t.cover, seed: t.artist + t.album, label: t.album || t.title }, extra);
const empty = (title, text) => `<div class="empty"><b>${title}</b>${text}</div>`;

function trackList(list, removeMode = false) {
  return `<div class="tracks">${list.map((t) => {
    const fav = S.isFav(t.id);
    return `<div class="row" data-id="${esc(t.id)}" tabindex="0">
      ${trackCover(t)}
      <div class="r-main"><div class="r-title">${esc(t.title)}</div><div class="r-sub">${esc(t.artist)}</div></div>
      <div class="r-album">${esc(t.album)}</div>
      <div class="r-dur">${t.duration ? fmt(t.duration) : ''}</div>
      <button class="icon-btn${fav ? ' active' : ''}" data-fav aria-label="Favorite">${icon('heart', fav)}</button>
      <button class="icon-btn" data-more aria-label="${removeMode ? 'ဖယ်ရှားရန်' : 'Playlist ထဲထည့်ရန်'}">${icon(removeMode ? 'close' : 'plus')}</button>
    </div>`;
  }).join('')}</div>`;
}

function hero(coverHtml, title, lines, extraButtons = '') {
  return `<section class="hero">${coverHtml}<div class="hero-text">
    <h2>${esc(title)}</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    <div class="hero-actions">
      <button class="solid" data-do="play">ဖွင့်မယ်</button>
      <button class="ghost" data-do="shuffle">${icon('shuffle')}<span>Shuffle</span></button>
      ${extraButtons}
    </div></div></section>`;
}

/* ---------- render ---------- */
const recentTracks = () => (S.store.get('recent') || []).map((id) => lib.byId.get(id)).filter(Boolean);
const byAdded = (x, y) => (y.added || 0) - (x.added || 0);
const matches = (q, ...parts) => parts.join(' ').toLowerCase().includes(q);

function render(keepScroll = false) {
  const top = PARENT[route.name] || route.name;
  $$('[data-view]').forEach((b) => b.classList.toggle('active', !query && b.dataset.view === top));
  $('#back').hidden = !(isDetail(route.name) && !query);

  const main = $('#main');
  const view = $('#view');
  const y = main.scrollTop;
  let html = '';
  let title = TITLES[route.name];
  let mount = null;

  if (query && route.name !== 'catalog') {
    title = 'ရှာဖွေမှု';
    shown = search(query);
    html = shown.length ? trackList(shown) : empty('မတွေ့ပါ', 'စာလုံးပေါင်း ပြောင်းပြီး ထပ်ရှာကြည့်ပါ။');
  } else {
    switch (route.name) {
      case 'catalog': html = catalogView(); break;
      case 'favorites':
        shown = S.favorites().map((id) => lib.byId.get(id)).filter(Boolean);
        html = shown.length ? trackList(shown) : empty('Favorite မရှိသေးပါ', 'သီချင်းဘေးက နှလုံးသားပုံကို နှိပ်ပြီး ကြိုက်တာတွေ သိမ်းထားပါ။');
        break;
      case 'playlists': {
        shown = [];
        const pls = S.playlists();
        html = `<div class="hero-actions" style="margin-bottom:14px"><button class="solid" data-do="newpl">Playlist အသစ်</button></div>` +
          (pls.length ? `<div class="grid">${pls.map((p) => `
            <button class="card" data-go="playlist" data-id="${esc(p.id)}">
              ${coverHTML({ seed: p.name, label: p.name })}
              <b>${esc(p.name)}</b><span class="sub">${p.tracks.length} သီချင်း</span></button>`).join('')}</div>`
            : empty('Playlist မရှိသေးပါ', 'အပေါ်က "Playlist အသစ်" ကို နှိပ်ပြီး စတင်ပါ။'));
        break;
      }
      case 'upload':
        shown = [];
        if (!isAdmin()) { html = empty('Owner သာ upload လုပ်ခွင့်ရှိပါတယ်', ''); break; }
        mount = (root) => mountUpload(root, {
          onDone: async () => { await reloadLibrary(false); },
          goCatalog: () => { cat.sort = 'recent'; cat.tab = 'albums'; navigate('catalog'); },
        });
        break;
      case 'album': {
        const a = albums().find((x) => x.key === route.id);
        if (!a) { route = { name: 'catalog', id: null }; return render(); }
        shown = a.tracks;
        html = hero(coverHTML({ cover: a.cover, seed: a.artist + a.title, label: a.title }), a.title,
          [a.artist, [a.year, `${a.tracks.length} သီချင်း`].filter(Boolean).join('၊ ')]) + trackList(shown);
        break;
      }
      case 'artist': {
        const a = artists().find((x) => x.name === route.id);
        if (!a) { route = { name: 'catalog', id: null }; return render(); }
        shown = a.tracks;
        html = hero(coverHTML({ cover: a.cover, seed: a.name, label: a.name }, 'round'), a.name, [`${a.tracks.length} သီချင်း၊ ${a.albums.size} album`]) + trackList(shown);
        break;
      }
      case 'playlist': {
        const p = S.getPlaylist(route.id);
        if (!p) { route = { name: 'playlists', id: null }; return render(); }
        shown = p.tracks.map((id) => lib.byId.get(id)).filter(Boolean);
        html = hero(coverHTML({ seed: p.name, label: p.name }), p.name, [`${shown.length} သီချင်း`],
          `<button class="ghost" data-do="delpl">${icon('trash')}<span>ဖျက်မယ်</span></button>`) +
          (shown.length ? trackList(shown, true) : empty('ဒီ playlist ထဲ သီချင်း မရှိသေးပါ', 'သီချင်းဘေးက + ကို နှိပ်ပြီး ဒီ playlist ထဲ ထည့်ပါ။'));
        break;
      }
      default:
        route = { name: 'home', id: null };
        title = TITLES.home;
        html = homeView();
    }
  }
  $('#title').textContent = title;
  if (mount) { view.innerHTML = ''; mount(view); } else view.innerHTML = html;
  syncPlaying();
  main.scrollTop = keepScroll ? y : 0;
}

const emptyLibrary = () => empty('သီချင်း မရှိသေးပါ',
  isAdmin()
    ? 'Upload ကနေ သီချင်းတွေ ထည့်ပါ။<br><br><button class="solid" data-go="upload">Upload လုပ်မယ်</button>'
    : 'Owner က သီချင်း ထည့်ပြီးရင် ဒီမှာ ပေါ်လာပါမယ်။');

/* ---------- Home: hero + rows ---------- */
function secHead(title, withAll) {
  return `<div class="sec-head"><h3>${title}</h3>
    ${withAll ? '<button class="link" data-go="catalog">အားလုံးကြည့်မယ်</button>' : ''}
    <button class="icon-btn" data-scroll="-1" aria-label="ဘယ်">${icon('back')}</button>
    <button class="icon-btn" data-scroll="1" aria-label="ညာ">${icon('forward')}</button></div>`;
}
const albumCard = (a) => `
  <button class="card" data-go="album" data-id="${esc(a.key)}">
    ${coverHTML({ cover: a.cover, seed: a.artist + a.title, label: a.title })}
    <b>${esc(a.title)}</b><span class="sub">${esc(a.artist)}</span></button>`;
const artistCard = (a) => `
  <button class="card" data-go="artist" data-id="${esc(a.name)}">
    ${coverHTML({ cover: a.cover, seed: a.name, label: a.name }, 'round')}
    <b>${esc(a.name)}</b><span class="sub">${a.tracks.length} သီချင်း</span></button>`;

function homeView() {
  shown = [];
  if (!lib.tracks.length) return emptyLibrary();
  const al = albums().sort(byAdded);
  const featured = al.slice(0, 6);

  const slides = featured.map((a) => {
    const h = hueOf(a.artist + a.title);
    return `<article class="slide" data-go="album" data-id="${esc(a.key)}" style="--h:${h}">
      ${a.cover ? `<div class="slide-bg"><img src="${esc(a.cover)}" alt="" onerror="this.remove()"></div>` : ''}
      <div class="slide-body">
        <h3>${esc(a.title)}</h3><p>${esc(a.artist)}</p>
        <p class="small">${[a.year, `${a.tracks.length} သီချင်း`].filter(Boolean).join('၊ ')}</p>
        <div class="slide-actions"><button class="solid" data-do="playalbum" data-id="${esc(a.key)}">ဖွင့်မယ်</button></div>
      </div>
      ${coverHTML({ cover: a.cover, seed: a.artist + a.title, label: a.title }, 'slide-art')}
    </article>`;
  }).join('');

  const recent = recentTracks().slice(0, 6);
  shown = recent;
  const art = artists().sort((x, y) => y.tracks.length - x.tracks.length).slice(0, 14);

  return `
    <section class="hero-car">
      <button class="icon-btn car-btn l" data-scroll="-1" aria-label="ဘယ်">${icon('back')}</button>
      <div class="scroller">${slides}</div>
      <button class="icon-btn car-btn r" data-scroll="1" aria-label="ညာ">${icon('forward')}</button>
    </section>
    <section class="sec">${secHead('နောက်ဆုံး ထည့်ထားသော Albums', true)}
      <div class="scroller">${al.slice(0, 14).map(albumCard).join('')}</div></section>
    ${recent.length ? `<section class="sec"><div class="sec-head"><h3>မကြာသေးခင်က နားထောင်ခဲ့သည်</h3></div>${trackList(recent)}</section>` : ''}
    <section class="sec">${secHead('Artists')}
      <div class="scroller">${art.map(artistCard).join('')}</div></section>`;
}

/* ---------- Catalog: tabs + filters ---------- */
function catalogView() {
  const q = query.toLowerCase();
  const ok = (x) => (!cat.genre || x.genre === cat.genre) && (!cat.year || String(x.year) === cat.year);
  const cmp = {
    recent: byAdded,
    az: (x, y) => String(x.title ?? x.name).localeCompare(String(y.title ?? y.name)),
    artist: (x, y) => String(x.artist ?? x.name).localeCompare(String(y.artist ?? y.name)) || String(x.title ?? '').localeCompare(String(y.title ?? '')),
    year: (x, y) => (y.year || 0) - (x.year || 0),
  }[cat.sort];

  let items = '';
  let count = 0;
  shown = [];

  if (cat.tab === 'albums') {
    const list = albums().filter((a) => ok(a) && (!q || matches(q, a.title, a.artist))).sort(cmp);
    count = list.length;
    items = list.length ? `<div class="grid">${list.map(albumCard).join('')}</div>` : '';
  } else if (cat.tab === 'artists') {
    const list = artists().map((a) => ({ ...a, tracks: a.tracks.filter(ok) }))
      .filter((a) => a.tracks.length && (!q || matches(q, a.name)))
      .sort(cat.sort === 'recent' ? byAdded : (x, y) => x.name.localeCompare(y.name));
    count = list.length;
    items = list.length ? `<div class="grid">${list.map(artistCard).join('')}</div>` : '';
  } else {
    shown = (q ? search(q) : lib.tracks.slice()).filter(ok).sort(cmp);
    count = shown.length;
    items = shown.length ? trackList(shown) : '';
  }

  const g = genres(), yrs = years();
  const sel = (key, opts, all) => `<select class="sel" data-cat="${key}" aria-label="${all}">
    <option value="">${all}</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(cat[key]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const sorts = [['recent', 'နောက်ဆုံးထည့်သော'], ['az', 'A–Z'], ['artist', 'Artist အလိုက်'], ['year', 'နှစ်အလိုက်']];

  const toolbar = `<div class="toolbar">
    <div class="seg" role="tablist">${[['albums', 'Albums'], ['artists', 'Artists'], ['songs', 'Songs']]
      .map(([k, l]) => `<button role="tab" data-tab="${k}" class="${cat.tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    ${g.length ? sel('genre', g.map((x) => [x, x]), 'Genre အားလုံး') : ''}
    ${yrs.length ? sel('year', yrs.map((x) => [x, x]), 'နှစ်အားလုံး') : ''}
    <select class="sel" data-cat="sort" aria-label="စီရန်">${sorts.map(([v, l]) => `<option value="${v}"${cat.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <span class="count muted small">${count} ခု</span></div>`;

  if (!lib.tracks.length) return toolbar + emptyLibrary();
  return toolbar + (items || empty('မတွေ့ပါ', 'Filter သို့မဟုတ် ရှာဖွေစာလုံး ပြောင်းကြည့်ပါ။'));
}

/* ---------- navigation ---------- */
function navigate(name, id = null) {
  const wasDetail = isDetail(route.name);
  query = '';
  $('#search').value = '';
  route = { name, id };
  if (isDetail(name) && !wasDetail) history.pushState({ d: 1 }, '');
  if (!isDetail(name) && history.state?.d) { ignorePop = true; history.back(); }
  render();
}
function toParent() {
  const parent = PARENT[route.name] || 'home';
  if (route.name === 'album') cat.tab = 'albums';
  if (route.name === 'artist') cat.tab = 'artists';
  route = { name: parent, id: null };
  render();
}
function goBack() {
  if (history.state?.d) history.back();
  else toParent();
}

/* ---------- favorites / playlists ---------- */
function toggleFav(id) {
  const on = S.toggleFav(id);
  toast(on ? 'Favorites ထဲ ထည့်ပြီးပါပြီ' : 'Favorites ထဲက ဖယ်ပြီးပါပြီ');
  if (route.name === 'favorites' && !query) render(true); else syncFavs();
}
function syncFavs() {
  $$('.row').forEach((r) => {
    const on = S.isFav(r.dataset.id), b = $('[data-fav]', r);
    b.classList.toggle('active', on); b.innerHTML = icon('heart', on);
  });
  const cur = P.current();
  const on = !!cur && S.isFav(cur.id);
  $$('.p-fav').forEach((b) => { b.classList.toggle('active', on); b.innerHTML = icon('heart', on); });
}
function syncPlaying() {
  const cur = P.current();
  $$('.row').forEach((r) => r.classList.toggle('playing', !!cur && r.dataset.id === cur.id));
}

function openSheet(trackId) {
  sheetTrack = trackId;
  const pls = S.playlists();
  $('#sheet-title').textContent = trackId ? 'Playlist ထဲထည့်ရန်' : 'Playlist အသစ်';
  $('#sheet-list').innerHTML = !trackId ? '' : pls.length
    ? pls.map((p) => `<button class="sheet-item" data-pl="${esc(p.id)}">${icon('playlist')}<span>${esc(p.name)}</span><small>${p.tracks.length}</small></button>`).join('')
    : '<p class="muted small" style="padding:4px 8px 10px">Playlist မရှိသေးပါ။ အောက်မှာ အသစ်ဖန်တီးပါ။</p>';
  $('#sheet-form button').textContent = trackId ? 'ဖန်တီးပြီး ထည့်မယ်' : 'ဖန်တီးမယ်';
  $('#sheet-input').value = '';
  $('#sheet').hidden = false;
  if (!trackId) setTimeout(() => $('#sheet-input').focus(), 60);
}
const closeSheet = () => { $('#sheet').hidden = true; };

function bindSheet() {
  $('#sheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const b = e.target.closest('[data-pl]');
    if (b && sheetTrack) {
      toast(S.addToPlaylist(b.dataset.pl, sheetTrack) ? 'Playlist ထဲ ထည့်ပြီးပါပြီ' : 'ဒီ playlist ထဲမှာ ရှိပြီးသားပါ');
      closeSheet();
      if (route.name === 'playlists') render(true);
    }
  });
  $('#sheet-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#sheet-input').value.trim();
    if (!name) return;
    const p = S.createPlaylist(name);
    if (sheetTrack) { S.addToPlaylist(p.id, sheetTrack); toast(`"${name}" ထဲ ထည့်ပြီးပါပြီ`); } else toast('Playlist ဖန်တီးပြီးပါပြီ');
    closeSheet();
    if (route.name === 'playlists' && !query) render(true);
  });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- view clicks ---------- */
function playAll(shuffle) {
  if (!shown.length) return;
  if (shuffle) P.setShuffle(true);
  const start = shuffle ? shown[Math.floor(Math.random() * shown.length)] : shown[0];
  P.playQueue(shown, start.id);
}

function playAlbumKey(key) {
  const a = albums().find((x) => x.key === key);
  if (a?.tracks.length) P.playQueue(a.tracks, a.tracks[0].id);
}

function bindView() {
  const view = $('#view');
  view.addEventListener('click', (e) => {
    const t = e.target;
    const row = t.closest('.row');
    if (t.closest('[data-fav]')) return toggleFav(row.dataset.id);
    if (t.closest('[data-more]')) {
      if (route.name === 'playlist' && !query) {
        S.removeFromPlaylist(route.id, row.dataset.id);
        toast('Playlist ထဲက ဖယ်ပြီးပါပြီ'); render(true);
      } else openSheet(row.dataset.id);
      return;
    }
    const sc = t.closest('[data-scroll]');
    if (sc) {
      const scroller = sc.closest('section')?.querySelector('.scroller');
      scroller?.scrollBy({ left: Number(sc.dataset.scroll) * scroller.clientWidth * 0.8, behavior: 'smooth' });
      return;
    }
    const tab = t.closest('[data-tab]');
    if (tab) { cat.tab = tab.dataset.tab; return render(); }

    const act = t.closest('[data-do]');
    if (act) {
      const a = act.dataset.do;
      if (a === 'play') playAll(false);
      else if (a === 'shuffle') playAll(true);
      else if (a === 'playalbum') playAlbumKey(act.dataset.id);
      else if (a === 'newpl') openSheet(null);
      else if (a === 'delpl' && confirm('ဒီ playlist ကို ဖျက်မလား?')) {
        S.deletePlaylist(route.id); toast('Playlist ဖျက်ပြီးပါပြီ'); navigate('playlists');
      }
      return;
    }
    if (row) return P.playQueue(shown, row.dataset.id);
    const go = t.closest('[data-go]');
    if (go) navigate(go.dataset.go, go.dataset.id || null);
  });

  // catalog filter dropdowns
  view.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-cat]');
    if (!sel) return;
    cat[sel.dataset.cat] = sel.value;
    render(true);
  });

  view.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('.row');
    if (row && e.target === row && e.key === 'Enter') P.playQueue(shown, row.dataset.id);
  });
}

/* ---------- sidebar: quick list + user ---------- */
function renderQuick() {
  const list = recentTracks().slice(0, 5);
  $('#quick').innerHTML = list.length
    ? '<p class="quick-title muted small">ဆက်နားထောင်ရန်</p>' + list.map((t) => `
      <button class="q-item" data-q="${esc(t.id)}">${trackCover(t)}
        <span><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join('')
    : '';
}

function renderMe() {
  const r = getRole();
  const name = r === 'admin' ? 'Owner' : r === 'guest' ? 'Friend' : '';
  $('#me-name').textContent = name;
  $('#avatar').textContent = name.charAt(0);
}

async function reloadLibrary(rerender = true) {
  try { await fetch('__rescan'); } catch { /* serve.py မဟုတ်ရင် ကျော် */ }
  await loadLibrary();
  $('#count').textContent = `${lib.tracks.length} သီချင်း၊ ${albums().length} albums`;
  renderQuick();
  if (rerender) { render(true); syncFavs(); }
}

/* ---------- player bar ---------- */
function setPlayIcons() {
  const html = icon(P.isPlaying() ? 'pause' : 'play');
  $$('[data-act="play"]').forEach((b) => { b.innerHTML = html; });
}
function updateModes() {
  const m = P.modes();
  $$('.p-shuffle').forEach((b) => b.classList.toggle('active', m.shuffle));
  $$('.p-repeat').forEach((b) => { b.classList.toggle('active', m.repeat !== 'off'); b.innerHTML = icon(m.repeat === 'one' ? 'repeat1' : 'repeat'); });
}
function updateTime() {
  const { time, duration } = P.progress();
  const f = duration ? Math.min(1, time / duration) : 0;
  $$('.t-cur').forEach((e) => { e.textContent = fmt(time); });
  $$('.t-dur').forEach((e) => { e.textContent = fmt(duration); });
  $('.mini-progress').style.setProperty('--pp', f * 100 + '%');
  if (dragging) return;
  $$('.seek:not(.vol)').forEach((r) => { r.value = Math.round(f * 1000); r.style.setProperty('--p', f * 100 + '%'); });
}

function bindPlayer() {
  P.bus.addEventListener('track', (e) => {
    const t = e.detail;
    $('#player').hidden = false;
    document.title = `${t.title} – ${t.artist}`;
    $$('.p-title').forEach((el) => { el.textContent = t.title; });
    $$('.p-artist').forEach((el) => { el.textContent = t.artist; });
    $$('.p-cover').forEach((el) => {
      el.classList.add('cover');
      el.style.setProperty('--h', hueOf(t.artist + t.album));
      el.innerHTML = `<span>${esc(([...(t.album || t.title)][0] || '♪').toUpperCase())}</span>` +
        (t.cover ? `<img src="${esc(t.cover)}" alt="" onerror="this.remove()">` : '');
    });
    document.documentElement.style.setProperty('--hue', hueOf(t.artist + t.album));
    setPlayIcons(); syncPlaying(); syncFavs(); updateTime(); renderQuick();
  });
  P.bus.addEventListener('play', setPlayIcons);
  P.bus.addEventListener('pause', setPlayIcons);
  P.bus.addEventListener('time', updateTime);
  P.bus.addEventListener('mode', updateModes);
  P.bus.addEventListener('error', (e) => toast(`ဖွင့်မရပါ: ${e.detail?.title || ''}`));

  // buttons
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, cur = P.current();
    if (a === 'play') P.toggle();
    else if (a === 'next') P.next();
    else if (a === 'prev') P.prev();
    else if (a === 'shuffle') P.toggleShuffle();
    else if (a === 'repeat') P.cycleRepeat();
    else if (a === 'fav' && cur) toggleFav(cur.id);
    else if (a === 'addto' && cur) openSheet(cur.id);
  });

  // seek bars
  $$('.seek:not(.vol)').forEach((r) => {
    r.addEventListener('pointerdown', () => { dragging = true; });
    ['pointerup', 'pointercancel', 'change'].forEach((ev) => r.addEventListener(ev, () => { dragging = false; }));
    r.addEventListener('input', () => {
      const f = r.value / 1000;
      r.style.setProperty('--p', f * 100 + '%');
      P.seekFrac(f);
    });
  });

  // volume
  const vol = $('#volume');
  vol.value = Math.round(P.volume() * 100);
  vol.style.setProperty('--p', vol.value + '%');
  vol.addEventListener('input', () => { P.setVolume(vol.value / 100); vol.style.setProperty('--p', vol.value + '%'); });

  // phone Now Playing
  const phone = matchMedia('(max-width: 860px)');
  $('#open-np').addEventListener('click', () => {
    if (!phone.matches) return;
    $('#np').classList.add('open');
    history.pushState({ np: 1 }, '');
  });
  $('#close-np').addEventListener('click', () => closeNP());
}

function closeNP() {
  const np = $('#np');
  if (!np.classList.contains('open')) return;
  np.classList.remove('open');
  if (history.state?.np) { ignorePop = true; history.back(); }
}

/* ---------- keyboard + history ---------- */
function bindGlobal() {
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if ($('#np').classList.contains('open')) { $('#np').classList.remove('open'); return; }
    if (isDetail(route.name)) toParent();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); closeNP(); return; }
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const { time, duration } = P.progress();
    const seekBy = (d) => duration && P.seekFrac(Math.min(1, Math.max(0, (time + d) / duration)));
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); P.toggle(); }
    else if (e.key === 'ArrowRight') { e.shiftKey ? P.next() : seekBy(5); }
    else if (e.key === 'ArrowLeft') { e.shiftKey ? P.prev() : seekBy(-5); }
    else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
  });
}

/* ---------- init ---------- */
export function initUI() {
  hydrateIcons();
  setPlayIcons(); updateModes();

  $$('[data-view]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
  $('#back').addEventListener('click', goBack);
  $('#search').addEventListener('input', (e) => { query = e.target.value.trim(); render(); });

  const rescan = async () => {
    toast('ဖတ်နေပါတယ်...');
    await reloadLibrary();
    toast(`သီချင်း ${lib.tracks.length} ပုဒ် တွေ့ပါတယ်`);
  };
  $('#rescan').addEventListener('click', rescan);
  $('#rescan-m').addEventListener('click', rescan);
  $('#logout').addEventListener('click', logout);
  $('#logout-m').addEventListener('click', logout);
  $('#quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) P.playQueue(recentTracks(), b.dataset.q);
  });
  renderMe();

  bindView(); bindSheet(); bindPlayer(); bindGlobal();
}

export function afterLibrary() {
  $('#count').textContent = `${lib.tracks.length} သီချင်း၊ ${albums().length} albums`;
  renderQuick();
  render(true);
  syncFavs();
}

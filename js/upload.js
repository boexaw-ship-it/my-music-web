// Upload page (Owner သာ) — ဖိုင် / folder ရွေး၊ ဆွဲချ၊ progress ပြ
import { icon } from './icons.js';

const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i;
const COVER = /^(cover|folder|front|album)\.(jpe?g|png|webp)$/i;
const CONCURRENCY = 2;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mb = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';

export function mountUpload(root, { onDone, goCatalog }) {
  root.innerHTML = `
  <section class="upload">
    <div class="dropzone" id="dz">
      <div class="dz-icon">${icon('upload')}</div>
      <b>သီချင်းဖိုင်တွေကို ဒီမှာ ဆွဲချပါ</b>
      <span class="muted">Folder တစ်ခုလုံး ဆွဲချလည်း ရပါတယ်</span>
      <div class="dz-btns">
        <button class="solid" id="pick-files" type="button">ဖိုင်ရွေးမယ်</button>
        <button class="ghost bordered" id="pick-folder" type="button">Folder ရွေးမယ်</button>
      </div>
      <input type="file" id="in-files" multiple hidden accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.jpg,.jpeg,.png,.webp">
      <input type="file" id="in-folder" multiple hidden webkitdirectory>
    </div>

    <div class="up-fields">
      <label>Artist<input id="up-artist" placeholder="မဖြည့်လည်း ရ" autocomplete="off"></label>
      <label>Album<input id="up-album" placeholder="မဖြည့်လည်း ရ" autocomplete="off"></label>
    </div>
    <p class="muted small up-note">မဖြည့်ရင် ဖိုင်ထဲက tag (artist / album) နဲ့ folder နာမည်ကနေ Album အလိုအလျောက် စီပေးပါမယ်။
      ဖြည့်ရင် ရွေးထားတဲ့ ဖိုင်အားလုံးကို ဒီ Artist / Album အောက် ထည့်ပါမယ်။</p>

    <div id="up-list" class="up-list"></div>
    <div class="up-actions">
      <button class="solid" id="up-start" type="button" disabled>Upload လုပ်မယ်</button>
      <button class="ghost" id="up-clear" type="button">စာရင်းရှင်းမယ်</button>
      <span id="up-sum" class="muted small"></span>
    </div>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const list = $('#up-list'), start = $('#up-start'), sum = $('#up-sum'), dz = $('#dz');
  let queue = [];
  let running = false;

  /* ---------- queue ---------- */
  function add(entries) {
    let skipped = 0;
    for (const { file, path } of entries) {
      if (!(AUDIO.test(file.name) || COVER.test(file.name))) { skipped++; continue; }
      queue.push({ file, hint: path || file.webkitRelativePath || '', state: 'wait', pct: 0, msg: '' });
    }
    draw();
    if (skipped) sum.textContent = `သီချင်းမဟုတ်တဲ့ ဖိုင် ${skipped} ခု ကျော်လိုက်ပါတယ်`;
  }

  function draw() {
    list.innerHTML = queue.map((q) => {
      const label = { wait: 'စောင့်နေပါတယ်', up: q.pct + '%', done: 'ပြီးပါပြီ', dup: 'ရှိပြီးသား', err: q.msg || 'မအောင်မြင်ပါ' }[q.state];
      return `<div class="up-item ${q.state}">
        <div class="up-name"><b>${esc(q.file.name)}</b><small>${mb(q.file.size)}${q.msg && q.state === 'done' ? ' → ' + esc(q.msg) : ''}</small></div>
        <div class="up-bar"><i style="width:${q.state === 'done' || q.state === 'dup' ? 100 : q.pct}%"></i></div>
        <span class="up-state">${esc(label)}</span></div>`;
    }).join('');
    start.disabled = running || !queue.some((q) => q.state === 'wait');
  }

  /* ---------- send ---------- */
  function sendOne(item) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/upload');
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-Filename', encodeURIComponent(item.file.name));
      const artist = $('#up-artist').value.trim(), album = $('#up-album').value.trim();
      if (artist) xhr.setRequestHeader('X-Artist', encodeURIComponent(artist));
      if (album) xhr.setRequestHeader('X-Album', encodeURIComponent(album));
      if (item.hint) xhr.setRequestHeader('X-Hint', encodeURIComponent(item.hint));

      item.state = 'up'; item.pct = 0; draw();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) { item.pct = Math.round((e.loaded / e.total) * 100); draw(); }
      };
      xhr.onload = () => {
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status === 401) { location.replace('login.html'); return resolve(); }
        if (xhr.status === 200 && r.ok) {
          item.state = r.dup ? 'dup' : 'done';
          item.msg = `${r.artist} / ${r.album}`;
        } else { item.state = 'err'; item.msg = r.error || `Error ${xhr.status}`; }
        draw(); resolve();
      };
      xhr.onerror = () => { item.state = 'err'; item.msg = 'Server နဲ့ ချိတ်မရပါ'; draw(); resolve(); };
      xhr.send(item.file);
    });
  }

  async function run() {
    running = true; draw();
    const todo = queue.filter((q) => q.state === 'wait');
    let i = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (i < todo.length) await sendOne(todo[i++]);
    }));
    running = false; draw();
    const ok = queue.filter((q) => q.state === 'done').length;
    const dup = queue.filter((q) => q.state === 'dup').length;
    const err = queue.filter((q) => q.state === 'err').length;
    await onDone(ok);
    $('#up-artist').value = ''; $('#up-album').value = '';     // နောက် album မှာ မှားမထည့်မိအောင်
    sum.innerHTML = `ပြီးပါပြီ: ${ok} ခု ထည့်ပြီး${dup ? `၊ ရှိပြီးသား ${dup}` : ''}${err ? `၊ မအောင်မြင် ${err}` : ''}။ ` +
      (ok ? '<button class="link" id="to-cat" type="button">Catalog ကြည့်မယ်</button>' : '');
    $('#to-cat')?.addEventListener('click', goCatalog);
  }

  /* ---------- inputs ---------- */
  $('#pick-files').onclick = () => $('#in-files').click();
  $('#pick-folder').onclick = () => $('#in-folder').click();
  $('#in-files').onchange = (e) => { add([...e.target.files].map((file) => ({ file, path: '' }))); e.target.value = ''; };
  $('#in-folder').onchange = (e) => { add([...e.target.files].map((file) => ({ file, path: file.webkitRelativePath }))); e.target.value = ''; };
  start.onclick = run;
  $('#up-clear').onclick = () => { if (running) return; queue = []; sum.textContent = ''; draw(); };

  /* ---------- drag & drop (folder ပါ ဖတ်) ---------- */
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', async (e) => {
    const dt = e.dataTransfer;
    const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);   // await မတိုင်ခင် ဖတ်ထားရမယ်
    if (!entries.length) return add([...dt.files].map((file) => ({ file, path: '' })));
    const out = [];
    const walk = async (entry, path) => {
      if (entry.isFile) {
        out.push({ file: await new Promise((r) => entry.file(r)), path: path + entry.name });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((r) => reader.readEntries(r));
          for (const en of batch) await walk(en, path + entry.name + '/');
        } while (batch.length);
      }
    };
    for (const en of entries) await walk(en, '');
    add(out);
  });
  // ဖိုင်ကို page အပြင်ဘက် ချမိရင် browser က ဖိုင်ဖွင့်မသွားအောင်
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  draw();
}

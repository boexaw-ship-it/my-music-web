import { initAuth } from './auth.js';
import { loadLibrary, lib } from './library.js';
import { initUI, afterLibrary } from './ui.js';
import * as P from './player.js';

// --- GITHUB PAGES MOCK API OVERRIDE ---
// Backend မရှိသော GitHub တွင် Error မတက်စေရန် API များကို ကြားဖြတ်ဖန်တီးပေးခြင်း
const originalFetch = window.fetch;
const basePath = window.location.pathname.replace(/\/[^\/]*$/, '/');

window.fetch = async function(url, options) {
  const urlStr = typeof url === 'object' && url.url ? String(url.url) : String(url);
  
  // 1. Login တောင်းလျှင် Admin အဖြစ် အမြဲ အောင်မြင်စေမည်
  if (urlStr.includes('/api/me') || urlStr.includes('api/me')) {
    return new Response(JSON.stringify({ role: 'admin' }), { 
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 2. သီချင်းစာရင်း တောင်းလျှင် library.json မှ တိုက်ရိုက်ဖတ်ပေးမည်
  if (urlStr.includes('__rescan') || urlStr.includes('library.json')) {
    try {
      const res = await originalFetch(basePath + 'library.json');
      const data = await res.json();
      
      // Frontend လိုအပ်သော { tracks: [...] } ပုံစံသို့ ပြောင်းပေးခြင်း
      let finalData = Array.isArray(data) ? { tracks: data } : data;
      
      return new Response(JSON.stringify(finalData), { 
          status: 200, headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.error("Library.json ဖတ်မရပါ:", e);
      return new Response(JSON.stringify({ tracks: [] }), { status: 200 });
    }
  }
  
  return originalFetch(url, options);
};
// --------------------------------------

window.getAutoCover = async function(title, artist, imgElement) {
    imgElement.onerror = null; 
    try {
        let searchTerm = encodeURIComponent((title || "") + " " + (artist || ""));
        let response = await fetch(`https://itunes.apple.com/search?term=${searchTerm}&media=music&limit=1`);
        let data = await response.json();

        if (data.results && data.results.length > 0) {
            let highResUrl = data.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
            imgElement.src = highResUrl;
        } else {
            imgElement.src = 'assets/icons/icon-192.png';
        }
    } catch (error) {
        imgElement.src = 'assets/icons/icon-192.png';
    }
};

async function boot() {
  console.log("App စတင်နေပါပြီ...");
  
  try { await initAuth(); } catch(e) { console.warn("Auth check skipped"); }
  try { initUI(); } catch(e) { console.error("UI Error:", e); }
  try { await loadLibrary(); } catch(e) { console.error("Library Error:", e); }
  try { afterLibrary(); } catch(e) { console.error("AfterLibrary Error:", e); }
  
  if (lib && lib.tracks && lib.tracks.length > 0) {
      try { P.restore(lib.tracks); } catch(e) {}
  }
  
  console.log("App အပြည့်အဝ ပွင့်သွားပါပြီ!");
}
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

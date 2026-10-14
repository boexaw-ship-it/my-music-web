import { initAuth } from './auth.js';
import { loadLibrary, lib } from './library.js';
import { initUI, afterLibrary } from './ui.js';
import * as P from './player.js';

async function boot() {
  await initAuth();            // login မလုပ်ရသေးရင် login.html ကို ပို့မယ်
  initUI();
  await loadLibrary();
  afterLibrary();
  P.restore(lib.tracks);       // နောက်ဆုံး ဖွင့်ခဲ့တဲ့ သီချင်းကို ပြန်ပြ (auto-play မလုပ်)
}
boot();

// Service worker (https သို့မဟုတ် localhost မှာပဲ အလုပ်လုပ်တယ်)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

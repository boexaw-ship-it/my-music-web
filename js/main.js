import { initAuth } from './auth.js';
import { loadLibrary, lib } from './library.js';
import { initUI, afterLibrary } from './ui.js';
import * as P from './player.js';

// သီချင်းနာမည်နဲ့ အဆိုတော်ကိုယူပြီး အွန်လိုင်းမှာ ပုံအလိုအလျောက်ရှာပေးမယ့် Function
// (ui.js ထဲကနေ တိုက်ရိုက် လှမ်းခေါ်လို့ရအောင် window.getAutoCover အဖြစ် ကြေညာထားပါသည်)
window.getAutoCover = async function(title, artist, imgElement) {
    // ထပ်ခါထပ်ခါ Error မတက်အောင် onerror ကို အရင်ဖျက်ပါမယ်
    imgElement.onerror = null; 
    
    try {
        let searchTerm = encodeURIComponent((title || "") + " " + (artist || ""));
        let response = await fetch(`https://itunes.apple.com/search?term=${searchTerm}&media=music&limit=1`);
        let data = await response.json();

        if (data.results && data.results.length > 0) {
            // ပုံတွေ့ရင် 300x300 အရည်အသွေးဖြင့် ပြောင်းထည့်မယ်
            let highResUrl = data.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
            imgElement.src = highResUrl;
        } else {
            // မတွေ့ရင် BaZaw MUSIC လိုဂို ပြမယ်
            imgElement.src = 'assets/icons/icon-192.png';
        }
    } catch (error) {
        imgElement.src = 'assets/icons/icon-192.png';
    }
};

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

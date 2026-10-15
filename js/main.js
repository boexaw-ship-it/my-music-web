import { initAuth } from './auth.js';
import { loadLibrary, lib } from './library.js';
import { initUI, afterLibrary } from './ui.js';
import * as P from './player.js';

// သီချင်းနာမည်နဲ့ အဆိုတော်ကိုယူပြီး အွန်လိုင်းမှာ ပုံအလိုအလျောက်ရှာပေးမယ့် Function
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
  
  // 1. GitHub Test တွင် Backend မရှိသဖြင့် Auth စစ်ဆေးခြင်းကို ကျော်ပါမည်
  // await initAuth(); 
  
  // 2. UI များကို စတင်ပြင်ဆင်မည်
  initUI();
  
  // 3. သီချင်းစာရင်း (library.json) ကို ဖတ်မည်
  await loadLibrary();
  
  // 4. သီချင်းဖတ်ပြီးနောက် UI ကို Update လုပ်မည်
  afterLibrary();
  
  // 5. Player ကို စတင်မည်
  if(lib && lib.tracks) {
      P.restore(lib.tracks);       
  }
  
  console.log("App အပြည့်အဝ ပွင့်သွားပါပြီ!");
}
boot();

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

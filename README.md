# 🎵 My Music

ကိုယ့် computer ထဲက သီချင်းတွေကို Album အလိုက် စီပြီး၊ ကိုယ်နဲ့ သူငယ်ချင်းတွေ browser / phone မှာ နားထောင်ဖို့ **private** music website (dark UI, PWA)။

- **Browser view**: sidebar + Home hero + Catalog (Albums / Artists / Songs, Genre / နှစ် / စီစဉ်ပုံ filter) + player bar
- **Phone view**: tab bar + mini player + full-screen Now Playing
- **Upload**: website ထဲကနေ ဖိုင် / folder ဆွဲချရင် tag နဲ့ folder နာမည်ကနေ Artist / Album အလိုအလျောက် စီသိမ်းပေးတယ်
- **Password ၂ မျိုး**: Owner (upload လုပ်လို့ရ) နဲ့ Friend (နားထောင်ရုံ)
- Favorites, Playlists, Search, Shuffle, Repeat, lock screen ထိန်းချုပ်မှု၊ နောက်ဆုံးနားထောင်တာ မှတ်ထားမှု
- `manifest.json` + `sw.js` ပါလို့ Home Screen မှာ app လို install လုပ်လို့ရတယ် (https လိုတယ်)

## စတင်ရန်

```
pip install mutagen          # tag / cover ပုံ ဖတ်ဖို့ (မလုပ်လည်း ရ၊ ဒါပေမယ့် လုပ်သင့်တယ်)
python scripts/serve.py
```

ပထမဆုံး run ရင် `config.json` ထုတ်ပေးပြီး terminal မှာ password ၂ ခု ပြပါမယ်:

| Password | လုပ်ခွင့် |
|---|---|
| **Owner** | နားထောင် + Upload + Library ပြန်ဖတ် |
| **Friend** | နားထောင်ရုံ |

Browser မှာ `http://localhost:8000` ဖွင့်ပြီး Owner password နဲ့ ဝင်ပါ။ Password ပြင်ချင်ရင် `config.json` ကို ပြင်ပြီး server ပြန် run ပါ။
လက်ရှိ login ဝင်ထားသူအားလုံးကို ထုတ်ချင်ရင် `config.json` ထဲက `"secret"` ကို ဖျက်ပါ (နောက် run မှာ အသစ်ထွက်မယ်)။

## သီချင်း ထည့်နည်း

**နည်း ၁ — Website ကနေ Upload (အလွယ်ဆုံး)**
Owner နဲ့ ဝင်ပြီး ဘေးက **Upload** ကို နှိပ်ပါ။ ဖိုင်တွေ / folder တစ်ခုလုံး ဆွဲချပါ။
- Artist / Album ကွက် **မဖြည့်ရင်**: ဖိုင်ထဲက tag ကို သုံးမယ်၊ tag မရှိရင် folder နာမည် (`Artist/Album/ဖိုင်`) ကို သုံးမယ်
- **ဖြည့်ရင်**: ရွေးထားတဲ့ ဖိုင်အားလုံးကို အဲဒီ Artist / Album အောက် ထည့်မယ်
- `cover.jpg` (သို့ folder.jpg) ပါရင် Album ပုံအဖြစ် သုံးမယ်

**နည်း ၂ — `music/` folder ထဲ တိုက်ရိုက်ကူး**
`music/Artist/Album/01 - Song.mp3` ပုံစံနဲ့ ကူးပြီး app ထဲက **Library ပြန်ဖတ်** (↻) ကို နှိပ်ပါ။

> `music/` ကို တခြားနေရာက folder နဲ့ ချိတ်ချင်ရင်: Windows `mklink /J music D:\Music` · Mac/Linux `ln -s ~/Music music`

## သူငယ်ချင်းတွေကို Share လုပ်နည်း

သင့် computer ဖွင့်ထားပြီး `serve.py` run နေမှ သူတို့ နားထောင်လို့ရပါမယ်။

**နည်း ၁ — Cloudflare Tunnel** (အလွယ်ဆုံး၊ အခမဲ့၊ သူတို့ဘက်မှာ ဘာမှ install မလို)
```
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:8000
```
ထွက်လာတဲ့ `https://xxxx.trycloudflare.com` link ကို **Friend password** နဲ့အတူ သူငယ်ချင်းတွေကို ပို့ပါ။ Link က run တိုင်း ပြောင်းပါတယ်။

**နည်း ၂ — Tailscale** (ပိုလုံခြုံ — အင်တာနက်ပေါ်မှာ လူတိုင်းမြင်စရာမလို)
သင်ရော သူငယ်ချင်းတွေပါ Tailscale install လုပ်ပြီး သူတို့ကို သင့် network ထဲ ဖိတ်ပါ။ သူတို့က `http://<သင့် Tailscale IP>:8000` ကို ဖွင့်ပါ။

**သတိထားရန်**
- **Owner password ကို မပေးပါနဲ့။** Friend password ပဲ ပေးပါ။
- Tunnel နဲ့ ဖွင့်ထားရင် အင်တာနက်ကနေ link သိသူတိုင်း login page ကို မြင်ရပါမယ်။ Password ကို မှန်အောင် ခန့်မှန်းဖို့ ကြိုးစားရင် ၅ ကြိမ်မှားတာနဲ့ ၅ မိနစ် ပိတ်ပါတယ်။
- ဖိုင်ကြီးတွေကို tunnel ကနေ upload လုပ်ရင် ပြဿနာတက်နိုင်လို့ **Upload ကို ကိုယ့် computer ရဲ့ `http://localhost:8000` မှာပဲ လုပ်ပါ**။
- သူငယ်ချင်းတွေ နားထောင်တာက သင့်အိမ် internet upload speed ပေါ် မူတည်ပါတယ်။
- သူများ copyright ရှိတဲ့ သီချင်းတွေ ကိုယ်ပိုင်အသုံးနဲ့ နီးစပ်သူ အနည်းငယ်အတွက်ပဲ share ပါ။

## Phone မှာ app အဖြစ် install (PWA)

Tunnel link (https) ကို phone မှာ ဖွင့်ပါ။
iPhone: Safari → Share → *Add to Home Screen* · Android: Chrome → ⋮ → *Install app*

(`http://192.168.x.x` မှာတော့ player ကို အပြည့်အဝ သုံးလို့ရပေမယ့် install ခလုတ် မပေါ်ပါဘူး — https လိုလို့ပါ။)

## Folder structure

```
my-music/
├── index.html · login.html · manifest.json · sw.js
├── css/      base · layout · player · home · login
├── js/       main · auth · library · player · ui · upload · storage · icons · login
├── assets/icons/
├── scripts/
│   ├── serve.py            server (login, upload, Range support)
│   └── build_library.py    music/ ကို scan လုပ်ပြီး library.json ထုတ်
├── music/                  ← သီချင်းတွေ (GitHub မတင်ဘူး)
├── covers/ · library.json · config.json   (auto ထွက်တာ၊ GitHub မတင်ဘူး)
```

## GitHub မှာ code သိမ်းချင်ရင်

`.gitignore` က `music/`, `covers/`, `library.json`, **`config.json` (password ပါတယ်)** ကို ဖယ်ထားပြီးသား။

```
git init && git add . && git commit -m "My Music"
```

> ဒီ version က server လိုတာမို့ GitHub Pages ပေါ်မှာ တန်းမလည်ပါဘူး။ GitHub ကို code သိမ်းဖို့ပဲ သုံးပါ။

## Code ပြင်ပြီးရင်

`sw.js` ထိပ်က `VERSION = 'v2'` ကို တိုးပါ (`'v3'` …)၊ ဒါမှ phone က code အသစ်ကို ယူမယ်။

## ဖိုင်အမျိုးအစား

mp3 · wav · m4a · aac · ogg · flac · opus (browser ပေါ်မူတည်ပြီး flac / ogg / opus မဖွင့်နိုင်တာ ရှိတယ်)

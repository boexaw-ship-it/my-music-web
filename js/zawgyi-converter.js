// ဇော်ဂျီစာသားကို ယူနီကုဒ်သို့ အလိုအလျောက်ပြောင်းပေးသော Helper Function
export function fixUnicode(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        // Rabbit library ရှိမရှိ စစ်ဆေးပြီး ဇော်ဂျီဆိုလျှင် ယူနီကုဒ်သို့ ပြောင်းပေးခြင်း
        return typeof Rabbit !== 'undefined' ? Rabbit.zg2uni(text) : text;
    } catch (e) {
        return text;
    }
}

// သီချင်းစာရင်း (Array သို့မဟုတ် Object) ထဲပါလာသည့် Title, Artist, Album စသည်တို့ကို တစ်ခါတည်း လိုက်ပြောင်းပေးရန်
export function sanitizeSong(song) {
    if (!song) return song;
    if (song.title) song.title = fixUnicode(song.title);
    if (song.artist) song.artist = fixUnicode(song.artist);
    if (song.album) song.album = fixUnicode(song.album); // မှားနေတဲ့နေရာကို ပြင်ဆင်ထားပါသည်
    return song;
}

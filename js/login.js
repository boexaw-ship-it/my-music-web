const form = document.getElementById('f');
const err = document.getElementById('err');
const pw = document.getElementById('pw');

// ?next=/xxx ကို ပြန်သွား (အပြင်ဘက် URL မဖြစ်စေရန် စစ်)
const next = new URLSearchParams(location.search).get('next');
const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : './';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw.value }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) { location.replace(dest); return; }
    err.textContent = data.error || 'ဝင်မရပါ';
    pw.select();
  } catch {
    err.textContent = 'Server နဲ့ ချိတ်မရပါ';
  }
  btn.disabled = false;
});

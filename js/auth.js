// Login အခြေအနေ: admin (Owner) / guest (Friend) / local (auth server မရှိ — upload မရ)
let role = 'local';

export const getRole = () => role;
export const isAdmin = () => role === 'admin';

export async function initAuth() {
  try {
    const r = await fetch('api/me', { cache: 'no-store' });
    if (r.status === 401) { location.replace('login.html'); return new Promise(() => {}); }
    if (r.ok) role = (await r.json()).role || 'local';
  } catch { /* server မရှိ / offline → local mode */ }
  document.body.dataset.role = role;
  return role;
}

export async function logout() {
  try { await fetch('api/logout', { method: 'POST' }); } catch { /* ignore */ }
  location.replace('login.html');
}

'use strict';
/* Sincronizzazione con Supabase: un documento per utente nella tabella "state", unito record per record. */
(function () {
  const URL_ = window.SUPA_URL, KEY_ = window.SUPA_KEY, SK = 'agenda-santi-session';
  let session = null, status = '', timer = null, busy = false;
  try { session = JSON.parse(localStorage.getItem(SK)); } catch {}
  const configured = () => !!(URL_ && KEY_);
  const setSession = s => { session = s; try { s ? localStorage.setItem(SK, JSON.stringify(s)) : localStorage.removeItem(SK); } catch {} };

  async function auth(path, body) {
    const r = await fetch(`${URL_}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY_, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Accesso non riuscito');
    return j;
  }
  const keep = j => setSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user.id, email: j.user.email } });
  async function token() {
    if (!session) throw new Error('not-logged');
    if (Date.now() > session.expires_at - 60000) keep(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
    return session.access_token;
  }
  async function rest(method, q, body) {
    const r = await fetch(`${URL_}/rest/v1/state${q}`, { method, headers: { apikey: KEY_, Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: body && JSON.stringify(body) });
    if (!r.ok) throw new Error('Errore server ' + r.status);
    return method === 'GET' ? r.json() : null;
  }

  function merge(a, b) {
    const out = Object.assign({}, b, a);
    const del = Object.assign({}, b.deleted || {});
    Object.entries(a.deleted || {}).forEach(([k, v]) => { del[k] = Math.max(v, del[k] || 0); });
    out.deleted = del;
    COLLS.forEach(c => {
      const m = new Map();
      [...(b[c] || []), ...(a[c] || [])].forEach(r => { const o = m.get(r.id); if (!o || (r.u || 0) >= (o.u || 0)) m.set(r.id, r); });
      out[c] = [...m.values()].filter(r => !(del[r.id] >= (r.u || 0)));
    });
    out.accounts = {};
    new Set([...Object.keys(a.accounts || {}), ...Object.keys(b.accounts || {})]).forEach(k => {
      const x = (a.accounts || {})[k], y = (b.accounts || {})[k];
      out.accounts[k] = !x ? y : !y ? x : ((x.ts || 0) >= (y.ts || 0) ? x : y);
    });
    return out;
  }

  async function sync() {
    if (!configured() || !session || busy) return;
    busy = true; status = 'Sincronizzo…'; paint();
    try {
      const rows = await rest('GET', `?user_id=eq.${session.user.id}&select=data`);
      const remote = rows[0]?.data || null;
      const merged = remote ? merge(db, remote) : db;
      const changed = !remote || JSON.stringify(merged) !== JSON.stringify(remote);
      db = Object.assign(structuredClone(EMPTY), merged);
      resetSnapshot();
      runAutoDebits();
      save(true);
      if (changed || JSON.stringify(db) !== JSON.stringify(remote)) await rest('POST', '', { user_id: session.user.id, data: db, updated_at: new Date().toISOString() });
      status = 'Sincronizzato alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      status = e.message === 'not-logged' ? '' : navigator.onLine === false ? 'Offline: sincronizzo appena torna la rete' : 'Sincronizzazione non riuscita: ' + e.message;
    }
    busy = false; render();
  }
  function paint() { const el = document.querySelector('#syncStatus'); if (el) el.textContent = status; }

  window.syncSoon = () => { clearTimeout(timer); timer = setTimeout(sync, 1500); };
  window.syncCard = () => {
    if (!configured()) return '';
    if (session) return `<h2>Sincronizzazione</h2><div class="card"><div class="row"><div class="ic">☁️</div><div class="main"><b>${esc(session.user.email)}</b><div class="sub" id="syncStatus">${esc(status)}</div></div>
      <button class="btn ghost" data-sync="now">Aggiorna</button></div><div class="row"><button class="btn ghost" data-sync="out" style="color:var(--red)">Esci</button></div></div>`;
    return `<h2>Sincronizzazione iPhone ↔ Mac</h2><div class="card" id="syncLogin">
      <div class="fields"><label><span>Email</span><input id="sEmail" type="email" autocomplete="username"></label>
      <label><span>Password</span><input id="sPass" type="password" autocomplete="current-password"></label></div>
      <div class="row" style="gap:8px"><button class="btn" data-sync="in">Accedi</button><button class="btn ghost" data-sync="up">Crea account</button></div>
      <div class="row"><div class="sub" id="syncStatus">${esc(status || 'Accedi con lo stesso account su iPhone e Mac per avere gli stessi dati.')}</div></div></div>`;
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-sync]'); if (!b) return;
    const act = b.dataset.sync;
    if (act === 'now') return sync();
    if (act === 'out') { setSession(null); status = ''; return render(); }
    const email = document.querySelector('#sEmail').value.trim(), password = document.querySelector('#sPass').value;
    if (!email || password.length < 6) { status = 'Scrivi email e una password di almeno 6 caratteri.'; return paint(); }
    status = 'Attendi…'; paint();
    try {
      const j = act === 'up' ? await auth('signup', { email, password }) : await auth('token?grant_type=password', { email, password });
      if (!j.access_token) { status = 'Account creato: conferma dal link che ti è arrivato via email, poi tocca Accedi.'; return paint(); }
      keep(j); await sync();
    } catch (err) { status = /invalid login/i.test(err.message) ? 'Email o password sbagliate.' : err.message; paint(); }
  });
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  render(); sync();
})();

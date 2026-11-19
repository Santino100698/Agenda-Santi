'use strict';
/* ---------- Dati ---------- */
const KEY = 'agenda-santi-v1';
const EMPTY = { expenses: [], bills: [], events: [], workouts: [], meals: [], incomes: [], income: [], transfers: [], accounts: {} };
let db = load();
function load() {
  try { return Object.assign(structuredClone(EMPTY), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return structuredClone(EMPTY); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const CATS = [
  ['benzina', '⛽', 'Benzina'], ['spesa', '🛒', 'Spesa'], ['ristorante', '🍕', 'Ristoranti/bar'],
  ['bollette', '💡', 'Bollette'], ['casa', '🏠', 'Casa'], ['auto', '🚗', 'Auto'], ['sport', '🏋️', 'Sport'],
  ['salute', '💊', 'Salute'], ['svago', '🎉', 'Svago'], ['abbonamenti', '📺', 'Abbonamenti'],
  ['vestiti', '👕', 'Vestiti'], ['risparmio', '🐷', 'Risparmio/investimenti'], ['altro', '📦', 'Altro']];
const CAT = Object.fromEntries(CATS.map(([k, i, n]) => [k, { i, n }]));
const SPORTS = [['corsa', '🏃', 'Corsa'], ['palestra', '🏋️', 'Palestra'], ['bici', '🚴', 'Bici'],
  ['calcio', '⚽', 'Calcio'], ['nuoto', '🏊', 'Nuoto'], ['padel', '🎾', 'Padel/Tennis'], ['camminata', '🚶', 'Camminata'], ['altro', '💪', 'Altro']];
const SPORT = Object.fromEntries(SPORTS.map(([k, i, n]) => [k, { i, n }]));
const MEALS = [['colazione', '☕', 'Colazione'], ['pranzo', '🍝', 'Pranzo'], ['cena', '🍽️', 'Cena'], ['spuntino', '🍎', 'Spuntino']];
const MEAL = Object.fromEntries(MEALS.map(([k, i, n]) => [k, { i, n }]));
const RECUR = { none: 'Una volta', monthly: 'Ogni mese', bimonthly: 'Ogni 2 mesi', quarterly: 'Ogni 3 mesi', semester: 'Ogni 6 mesi', yearly: 'Ogni anno' };
const METHOD = { conto: 'Dal conto', carta: 'Carta', contanti: 'Contanti' };
const ACCT = { banca: 'Conto Banco BPM', contanti: 'Contanti' };
const acctOf = e => e.method === 'contanti' ? 'contanti' : 'banca';
const counts = (a, e) => { const st = db.accounts[a]; if (!st) return false; return e.date > st.date || (e.date === st.date && (e.at || 0) > st.ts); };
function balance(a) {
  const st = db.accounts[a]; if (!st) return null;
  let b = st.start;
  db.income.forEach(x => { if (x.account === a && counts(a, x)) b += x.amount; });
  db.expenses.forEach(x => { if (acctOf(x) === a && counts(a, x)) b -= x.amount; });
  db.transfers.forEach(x => { if (x.from === a && counts(a, x)) b -= x.amount; if (x.to === a && counts(a, x)) b += x.amount; });
  return Math.round(b * 100) / 100;
}
const RECUR_M = { monthly: 1, bimonthly: 2, quarterly: 3, semester: 6, yearly: 12 };

/* ---------- Utilità ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysTo = s => Math.round((parse(s) - parse(today())) / 864e5);
const eur = n => (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const fmtDay = s => {
  const dd = daysTo(s);
  if (dd === 0) return 'Oggi'; if (dd === 1) return 'Domani'; if (dd === -1) return 'Ieri';
  return parse(s).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
};
const ym = s => s.slice(0, 7);
function addMonths(s, n) {
  const d = parse(s), day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return iso(t);
}
const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));

/* ---------- Stato UI ---------- */
let tab = 'home';
let month = ym(today());
let soldiView = 'spese';
const $ = s => document.querySelector(s);
const view = $('#view');

function monthNav() {
  const [y, m] = month.split('-').map(Number);
  return `<div class="month"><button data-mon="-1">‹</button><b>${MESI[m - 1]} ${y}</b><button data-mon="1">›</button></div>`;
}
const row = ({ ic, title, sub = '', val = '', act = '', extra = '' }) =>
  `<div class="row${act ? ' tap' : ''}" ${act}><div class="ic">${ic}</div><div class="main"><b>${title}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${val ? `<div class="val">${val}</div>` : ''}${extra}</div>`;
const card = (rows, empty = 'Ancora niente qui.') => `<div class="card">${rows.length ? rows.join('') : `<div class="empty">${empty}</div>`}</div>`;
function billBadge(b) {
  const d = daysTo(b.due);
  if (d < 0) return `<span class="pill red">Scaduta</span>`;
  if (d <= 3) return `<span class="pill orange">${d === 0 ? 'Oggi' : d === 1 ? 'Domani' : 'Tra ' + d + ' gg'}</span>`;
  return `<span class="pill">${fmtDay(b.due)}</span>`;
}
const openBills = () => db.bills.filter(b => !b.done).sort((a, b) => a.due.localeCompare(b.due));

/* ---------- Viste ---------- */
const VIEWS = {
  home() {
    const t = today(), m = ym(t);
    const savedM = db.expenses.filter(e => ym(e.date) === m && e.cat === 'risparmio').reduce((s, e) => s + e.amount, 0);
    const spentM = db.expenses.filter(e => ym(e.date) === m && e.cat !== 'risparmio').reduce((s, e) => s + e.amount, 0);
    const fuelM = db.expenses.filter(e => ym(e.date) === m && e.cat === 'benzina').reduce((s, e) => s + e.amount, 0);
    const foodM = db.expenses.filter(e => ym(e.date) === m && (e.cat === 'spesa' || e.cat === 'ristorante')).reduce((s, e) => s + e.amount, 0);
    const wk = iso(new Date(Date.now() - 6 * 864e5));
    const sportW = db.workouts.filter(w => w.date >= wk && w.date <= t).length;
    const bills = openBills().filter(b => daysTo(b.due) <= 14);
    const ev = db.events.filter(e => e.date >= t && daysTo(e.date) <= 7).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const meals = db.meals.filter(x => x.date === t);
    const bal = a => { const v = balance(a); return `<div class="stat tap" data-acct="${a}"><div class="k">${a === 'banca' ? '🏦' : '💵'} ${ACCT[a]}</div><div class="v" style="${v < 0 ? 'color:var(--red)' : ''}">${v === null ? '<span style="font-size:15px;color:var(--accent)">Imposta saldo</span>' : eur(v)}</div></div>`; };
    return `
      <div class="stats">${bal('banca')}${bal('contanti')}</div>
      <h2>Questo mese</h2>
      <div class="stats">
        <div class="stat"><div class="k">Speso questo mese</div><div class="v">${eur(spentM)}</div></div>
        <div class="stat"><div class="k">🐷 Messo da parte</div><div class="v">${eur(savedM)}</div></div>
        <div class="stat"><div class="k">⛽ Benzina mese</div><div class="v">${eur(fuelM)}</div></div>
        <div class="stat"><div class="k">🍝 Cibo mese</div><div class="v">${eur(foodM)}</div></div>
        <div class="stat"><div class="k">Allenamenti (7 gg)</div><div class="v">${sportW}</div></div>
        <div class="stat"><div class="k">Fissi al mese</div><div class="v">${eur(fixedMonthly())}</div></div>
      </div>
      <h2>Da pagare (prossimi 14 giorni)</h2>
      ${card(bills.map(b => row({ ic: '🧾', title: esc(b.name), sub: b.amount ? eur(b.amount) : '', extra: billBadge(b), act: `data-edit="bills:${b.id}"` })), 'Nessuna scadenza in arrivo 👍')}
      <h2>Impegni (prossimi 7 giorni)</h2>
      ${card(ev.map(e => row({ ic: '📌', title: esc(e.title), sub: fmtDay(e.date) + (e.time ? ' · ' + e.time : ''), act: `data-edit="events:${e.id}"` })), 'Nessun impegno in arrivo')}
      <h2>Mangiato oggi</h2>
      ${card(meals.map(x => row({ ic: MEAL[x.meal].i, title: esc(x.desc), sub: MEAL[x.meal].n, val: x.kcal ? x.kcal + ' kcal' : '', act: `data-edit="meals:${x.id}"` })), 'Niente registrato oggi')}
      <h2>Backup</h2>
      <div class="card"><div class="row"><div class="main"><div class="sub">I dati sono salvati su questo dispositivo. Fai un backup ogni tanto.</div></div></div>
      <div class="row" style="gap:8px"><button class="btn" data-act="export">Esporta backup</button><button class="btn ghost" data-act="import">Importa</button><button class="btn ghost" data-act="csv">Spese in Excel</button></div></div>`;
  },
  soldi() {
    const seg = `<div class="seg"><button data-seg="spese" class="${soldiView === 'spese' ? 'on' : ''}">Spese</button><button data-seg="scadenze" class="${soldiView === 'scadenze' ? 'on' : ''}">Scadenze</button></div>`;
    if (soldiView === 'scadenze') {
      const open = openBills(), done = db.bills.filter(b => b.done).sort((a, b) => b.due.localeCompare(a.due)).slice(0, 10);
      const tot30 = open.filter(b => daysTo(b.due) <= 30).reduce((s, b) => s + (b.amount || 0), 0);
      return seg + `
        <div class="stats" style="margin-top:10px"><div class="stat"><div class="k">Da pagare in 30 gg</div><div class="v">${eur(tot30)}</div></div>
        <div class="stat"><div class="k">Scadute</div><div class="v" style="color:${open.some(b => daysTo(b.due) < 0) ? 'var(--red)' : 'inherit'}">${open.filter(b => daysTo(b.due) < 0).length}</div></div></div>
        <h2>Entrate fisse</h2>
        ${card(db.incomes.filter(x => !x.done).sort((a, b) => a.due.localeCompare(b.due)).map(x => row({ ic: '💰', title: esc(x.name), sub: [eur(x.amount), RECUR[x.recur], ACCT[x.account]].join(' · '), extra: `<span class="pill">${fmtDay(x.due)}</span>`, act: `data-edit="incomes:${x.id}"` })), 'Aggiungi lo stipendio con il + → Entrata')}
        <h2>Da pagare</h2>
        ${card(open.map(b => row({ ic: '🧾', title: esc(b.name), sub: [b.amount ? eur(b.amount) : '', RECUR[b.recur], METHOD[b.method || 'conto']].filter(Boolean).join(' · '), extra: b.auto ? `${billBadge(b)}<span class="pill green">Automatico</span>` : `${billBadge(b)}<button class="btn" data-pay="${b.id}">Pagato</button>`, act: `data-edit="bills:${b.id}"` })), 'Aggiungi affitto, bollo, assicurazione… con il +')}
        ${done.length ? `<h2>Pagate di recente</h2>${card(done.map(b => row({ ic: '✅', title: esc(b.name), sub: fmtDay(b.due), val: b.amount ? eur(b.amount) : '', act: `data-edit="bills:${b.id}"` })))}` : ''}`;
    }
    const list = db.expenses.filter(e => ym(e.date) === month).sort(byDateDesc);
    const tot = list.filter(e => e.cat !== 'risparmio').reduce((s, e) => s + e.amount, 0);
    const saved = list.filter(e => e.cat === 'risparmio').reduce((s, e) => s + e.amount, 0);
    const inc = db.income.filter(x => ym(x.date) === month).reduce((s, x) => s + x.amount, 0);
    const byCat = {};
    list.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amount);
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = cats[0]?.[1] || 1;
    const fuel = list.filter(e => e.cat === 'benzina'), liters = fuel.reduce((s, e) => s + (e.liters || 0), 0);
    return seg + `<button class="btn ghost" style="width:100%;margin-top:6px;padding:10px" data-act="bank">🏦 Importa movimenti dalla banca</button>` + monthNav() + `
      <div class="stats"><div class="stat"><div class="k">💰 Entrate</div><div class="v">${eur(inc)}</div></div><div class="stat"><div class="k">Speso</div><div class="v">${eur(tot)}</div></div>
      <div class="stat"><div class="k">🐷 Messo da parte</div><div class="v">${eur(saved)}</div></div><div class="stat"><div class="k">Avanzo del mese</div><div class="v" style="color:${inc - tot - saved < 0 ? 'var(--red)' : 'var(--green)'}">${eur(inc - tot - saved)}</div></div></div>
      ${cats.length ? `<h2>Per categoria</h2>${card(cats.map(([k, v]) => row({ ic: CAT[k].i, title: CAT[k].n, sub: `<div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div>`, val: eur(v) })))}` : ''}
      ${liters ? `<p class="note">⛽ ${liters.toFixed(1).replace('.', ',')} litri, prezzo medio ${eur(fuel.reduce((s, e) => s + e.amount, 0) / liters)}/l</p>` : ''}
      <h2>Movimenti</h2>
      ${card(list.map(e => row({ ic: CAT[e.cat].i, title: esc(e.note) || CAT[e.cat].n, sub: fmtDay(e.date) + (e.note ? ' · ' + CAT[e.cat].n : ''), val: eur(e.amount), act: `data-edit="expenses:${e.id}"` })), 'Nessuna spesa in questo mese. Tocca + per aggiungerne una.')}`;
  },
  agenda() {
    const t = today();
    const next = db.events.filter(e => e.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const past = db.events.filter(e => e.date < t).sort(byDateDesc).slice(0, 15);
    const groups = {};
    next.forEach(e => (groups[e.date] ||= []).push(e));
    const g = Object.entries(groups);
    return (g.length ? g.map(([d, es]) => `<h2>${fmtDay(d)}</h2>` + card(es.map(e => row({ ic: '📌', title: esc(e.title), sub: [e.time, esc(e.note)].filter(Boolean).join(' · '), act: `data-edit="events:${e.id}"` })))).join('')
      : `<h2>Prossimi impegni</h2>${card([], 'Nessun impegno. Tocca + per aggiungerne uno.')}`)
      + (past.length ? `<h2>Passati</h2>${card(past.map(e => row({ ic: '🕘', title: esc(e.title), sub: fmtDay(e.date), act: `data-edit="events:${e.id}"` })))}` : '');
  },
  sport() {
    const list = db.workouts.filter(w => ym(w.date) === month).sort(byDateDesc);
    const min = list.reduce((s, w) => s + (w.minutes || 0), 0), km = list.reduce((s, w) => s + (w.km || 0), 0);
    return monthNav() + `
      <div class="stats"><div class="stat"><div class="k">Allenamenti</div><div class="v">${list.length}</div></div>
      <div class="stat"><div class="k">Tempo totale</div><div class="v">${Math.floor(min / 60)}h ${min % 60}m</div></div>
      ${km ? `<div class="stat"><div class="k">Km totali</div><div class="v">${km.toFixed(1).replace('.', ',')}</div></div>` : ''}</div>
      <h2>Allenamenti</h2>
      ${card(list.map(w => row({ ic: SPORT[w.type].i, title: SPORT[w.type].n + (w.note ? ' · ' + esc(w.note) : ''), sub: fmtDay(w.date), val: [w.minutes ? w.minutes + "'" : '', w.km ? String(w.km).replace('.', ',') + ' km' : ''].filter(Boolean).join(' · '), act: `data-edit="workouts:${w.id}"` })), 'Nessun allenamento questo mese.')}`;
  },
  cibo() {
    const list = db.meals.filter(x => ym(x.date) === month).sort((a, b) => b.date.localeCompare(a.date) || MEALS.findIndex(m => m[0] === a.meal) - MEALS.findIndex(m => m[0] === b.meal));
    const days = {};
    list.forEach(x => (days[x.date] ||= []).push(x));
    const foodSpend = db.expenses.filter(e => ym(e.date) === month && (e.cat === 'spesa' || e.cat === 'ristorante')).reduce((s, e) => s + e.amount, 0);
    return monthNav() + `
      <div class="stat"><div class="k">Speso per mangiare (spesa + ristoranti)</div><div class="v">${eur(foodSpend)}</div></div>
      ${Object.entries(days).map(([d, xs]) => {
        const kc = xs.reduce((s, x) => s + (x.kcal || 0), 0);
        return `<h2>${fmtDay(d)}${kc ? ' · ' + kc + ' kcal' : ''}</h2>` + card(xs.map(x => row({ ic: MEAL[x.meal].i, title: esc(x.desc), sub: MEAL[x.meal].n, val: x.kcal ? x.kcal + ' kcal' : '', act: `data-edit="meals:${x.id}"` })));
      }).join('') || `<h2>Pasti</h2>${card([], 'Niente registrato questo mese. Tocca + per aggiungere un pasto.')}`}`;
  }
};
const TITLES = { home: 'Oggi', soldi: 'Soldi', agenda: 'Agenda', sport: 'Sport', cibo: 'Cibo' };

function render() {
  $('#title').textContent = TITLES[tab];
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  view.innerHTML = VIEWS[tab]();
}

/* ---------- Moduli (form) ---------- */
const sheet = $('#sheet'), form = $('#sheetForm');
const FORMS = {
  expenses: { title: 'Spesa', nuovo: 'Nuova spesa', fields: e => `
      <label><span>Importo €</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${e.amount ? String(e.amount).replace('.', ',') : ''}" required></label>
      <label><span>Data</span><input type="date" name="date" value="${e.date || today()}" required></label>
      <label><span>Nota</span><input name="note" placeholder="es. Esselunga" value="${esc(e.note)}"></label>
      <label><span>Pagato con</span><select name="method">${[['carta', 'Carta / conto'], ['contanti', 'Contanti']].map(([k, n]) => `<option value="${k}" ${(e.method || 'carta') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="liters" ${e.cat === 'benzina' ? '' : 'hidden'}><span>Litri</span><input name="liters" inputmode="decimal" placeholder="facoltativo" value="${e.liters ? String(e.liters).replace('.', ',') : ''}"></label>`,
    after: e => `<div class="cats">${CATS.map(([k, i, n]) => `<button type="button" data-cat="${k}" class="${(e.cat || 'altro') === k ? 'on' : ''}">${i} ${n}</button>`).join('')}</div><input type="hidden" name="cat" value="${e.cat || 'altro'}">`,
    read: f => ({ amount: num(f.amount), date: f.date, note: f.note.trim(), cat: f.cat, method: f.method, liters: f.cat === 'benzina' ? num(f.liters) || undefined : undefined }) },
  incomes: { title: 'Entrata', nuovo: 'Nuova entrata', fields: x => `
      <label><span>Cosa</span><input name="name" placeholder="es. Stipendio" value="${esc(x.name)}" required></label>
      <label><span>Importo €</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${x.amount ? String(x.amount).replace('.', ',') : ''}" required></label>
      <label><span>Dove</span><select name="account">${Object.entries(ACCT).map(([k, n]) => `<option value="${k}" ${(x.account || 'banca') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label><span>Arriva il</span><input type="date" name="due" value="${x.due || today()}" required></label>
      <label><span>Ripeti</span><select name="recur">${Object.entries(RECUR).map(([k, n]) => `<option value="${k}" ${(x.recur || 'monthly') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`,
    after: () => `<p class="note">Il giorno indicato l'entrata viene aggiunta da sola al saldo.</p>`,
    read: f => ({ name: f.name.trim(), amount: num(f.amount), account: f.account, due: f.due, recur: f.recur }) },
  account: { title: 'Saldo', fields: x => `
      <label><span>Saldo oggi €</span><input name="start" inputmode="decimal" value="${x.v !== null && x.v !== undefined ? String(x.v).replace('.', ',') : ''}" required></label>`,
    after: () => `<p class="note">Scrivi quanto hai adesso. Da qui in poi l'app aggiorna il saldo con entrate e spese.</p>`, read: f => f },
  bills: { title: 'Scadenza', nuovo: 'Nuova scadenza', fields: b => `
      <label><span>Cosa</span><input name="name" placeholder="es. Bollo auto" value="${esc(b.name)}" required></label>
      <label><span>Importo €</span><input name="amount" inputmode="decimal" placeholder="facoltativo" value="${b.amount ? String(b.amount).replace('.', ',') : ''}"></label>
      <label><span>Scade il</span><input type="date" name="due" value="${b.due || today()}" required></label>
      <label><span>Ripeti</span><select name="recur">${Object.entries(RECUR).map(([k, n]) => `<option value="${k}" ${(b.recur || 'none') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label><span>Categoria</span><select name="cat">${CATS.map(([k, i, n]) => `<option value="${k}" ${(b.cat || 'bollette') === k ? 'selected' : ''}>${i} ${n}</option>`).join('')}</select></label>
      <label><span>Come paghi</span><select name="method">${Object.entries(METHOD).map(([k, n]) => `<option value="${k}" ${(b.method || 'conto') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label><span>Addebito automatico</span><input type="checkbox" name="auto" ${b.auto ? 'checked' : ''} style="flex:none;width:22px;height:22px;margin-left:auto"></label>`,
    after: () => `<p class="note">Con «Addebito automatico» (es. fondo pensione, investimenti) la spesa si registra da sola il giorno della scadenza. Altrimenti tocchi «Pagato» quando paghi (es. affitto in contanti).</p>`,
    read: f => ({ name: f.name.trim(), amount: num(f.amount) || undefined, due: f.due, recur: f.recur, cat: f.cat, method: f.method, auto: !!f.auto }) },
  events: { title: 'Impegno', nuovo: 'Nuovo impegno', fields: e => `
      <label><span>Cosa</span><input name="title" placeholder="es. Dentista" value="${esc(e.title)}" required></label>
      <label><span>Data</span><input type="date" name="date" value="${e.date || today()}" required></label>
      <label><span>Ora</span><input type="time" name="time" value="${e.time || ''}"></label>
      <label><span>Note</span><input name="note" placeholder="facoltativo" value="${esc(e.note)}"></label>`,
    read: f => ({ title: f.title.trim(), date: f.date, time: f.time, note: f.note.trim() }) },
  workouts: { title: 'Allenamento', nuovo: 'Nuovo allenamento', fields: w => `
      <label><span>Tipo</span><select name="type">${SPORTS.map(([k, i, n]) => `<option value="${k}" ${(w.type || 'palestra') === k ? 'selected' : ''}>${i} ${n}</option>`).join('')}</select></label>
      <label><span>Data</span><input type="date" name="date" value="${w.date || today()}" required></label>
      <label><span>Minuti</span><input name="minutes" inputmode="numeric" placeholder="es. 60" value="${w.minutes || ''}"></label>
      <label><span>Km</span><input name="km" inputmode="decimal" placeholder="facoltativo" value="${w.km ? String(w.km).replace('.', ',') : ''}"></label>
      <label><span>Note</span><input name="note" placeholder="es. gambe, 5x5" value="${esc(w.note)}"></label>`,
    read: f => ({ type: f.type, date: f.date, minutes: Math.round(num(f.minutes)) || undefined, km: num(f.km) || undefined, note: f.note.trim() }) },
  meals: { title: 'Pasto', nuovo: 'Nuovo pasto', fields: x => `
      <label><span>Pasto</span><select name="meal">${MEALS.map(([k, i, n]) => `<option value="${k}" ${(x.meal || guessMeal()) === k ? 'selected' : ''}>${i} ${n}</option>`).join('')}</select></label>
      <label><span>Cosa</span><input name="desc" placeholder="es. pasta al pomodoro" value="${esc(x.desc)}" required></label>
      <label><span>Data</span><input type="date" name="date" value="${x.date || today()}" required></label>
      <label><span>Calorie</span><input name="kcal" inputmode="numeric" placeholder="facoltativo" value="${x.kcal || ''}"></label>`,
    read: f => ({ meal: f.meal, desc: f.desc.trim(), date: f.date, kcal: Math.round(num(f.kcal)) || undefined }) }
};
function guessMeal() { const h = new Date().getHours(); return h < 11 ? 'colazione' : h < 16 ? 'pranzo' : h < 18 ? 'spuntino' : 'cena'; }

function openForm(kind, id) {
  const F = FORMS[kind], item = kind === 'account' ? { v: balance(id) } : id ? db[kind].find(x => x.id === id) : {};
  if (!item) return;
  form.innerHTML = `<div class="sh"><button value="cancel" formnovalidate>Annulla</button><h3>${id ? 'Modifica ' + F.title.toLowerCase() : F.nuovo}</h3><button class="save" value="save">Salva</button></div>
    <div class="fields">${F.fields(item)}</div>${F.after ? F.after(item) : ''}
    ${id && kind !== 'account' ? `<button type="button" class="del" data-del>Elimina</button>` : ''}`;
  form.dataset.kind = kind; form.dataset.id = id || '';
  sheet.showModal();
  if (!id) setTimeout(() => form.querySelector('input:not([type=hidden]),select')?.focus(), 50);
}
form.addEventListener('click', e => {
  const c = e.target.closest('[data-cat]');
  if (c) {
    form.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b === c));
    form.elements.cat.value = c.dataset.cat;
    form.querySelector('.liters').hidden = c.dataset.cat !== 'benzina';
  }
  const d = e.target.closest('[data-del]');
  if (d) {
    if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = 'Tocca di nuovo per eliminare'; return; }
    const { kind, id } = form.dataset;
    db[kind] = db[kind].filter(x => x.id !== id); save(); sheet.close(); render();
  }
});
form.addEventListener('submit', e => {
  if (e.submitter?.value !== 'save') return;
  const { kind, id } = form.dataset;
  if (kind === 'pay') return confirmPay(id, Object.fromEntries(new FormData(form)));
  if (kind === 'import') return confirmImport();
  if (!FORMS[kind]) return;
  const data = FORMS[kind].read(Object.fromEntries(new FormData(form)));
  if (kind === 'account') { db.accounts[id] = { start: num(data.start), date: today(), ts: Date.now() }; save(); render(); return; }
  data.at = Date.now();
  if (kind === 'expenses' && !data.amount) { e.preventDefault(); form.elements.amount.focus(); return; }
  if (id) Object.assign(db[kind].find(x => x.id === id), data);
  else db[kind].push({ id: uid(), ...data });
  runAutoDebits(); save(); render(); scheduleChecks();
});

/* ---------- Pagare una scadenza ---------- */
function pay(id) {
  const b = db.bills.find(x => x.id === id); if (!b) return;
  form.innerHTML = `<div class="sh"><button value="cancel" formnovalidate>Annulla</button><h3>Pagato</h3><button class="save" value="save">Conferma</button></div>
    <div class="fields"><label><span>${esc(b.name)}</span><input name="amount" inputmode="decimal" placeholder="importo €" value="${b.amount ? String(b.amount).replace('.', ',') : ''}"></label>
    <label><span>Pagato il</span><input type="date" name="date" value="${today()}" required></label></div>
    <p class="note">La spesa finisce in «Soldi».${b.recur !== 'none' ? ' La prossima scadenza passa al ' + fmtDay(addMonths(b.due, RECUR_M[b.recur])).toLowerCase() + '.' : ''}</p>`;
  form.dataset.kind = 'pay'; form.dataset.id = id;
  sheet.showModal();
}
function confirmPay(id, f) {
  const b = db.bills.find(x => x.id === id); if (!b) return;
  const amount = num(f.amount);
  if (amount) db.expenses.push({ id: uid(), amount, date: f.date || today(), cat: b.cat || 'bollette', note: b.name, method: b.method === 'contanti' ? 'contanti' : 'carta', at: Date.now() });
  if (b.recur && b.recur !== 'none') b.due = addMonths(b.due, RECUR_M[b.recur]);
  else b.done = true;
  b.notified = null;
  save(); render();
}

function fixedMonthly() {
  return openBills().filter(b => b.recur !== 'none' && b.amount).reduce((s, b) => s + b.amount / RECUR_M[b.recur], 0);
}
/* Addebiti automatici: registra da soli le scadenze arrivate */
function runAutoDebits() {
  const t = today(); let changed = false;
  db.bills.filter(b => b.auto && !b.done).forEach(b => {
    let guard = 0;
    while (!b.done && b.due <= t && guard++ < 60) {
      if (b.amount) db.expenses.push({ id: uid(), amount: b.amount, date: b.due, cat: b.cat || 'bollette', note: b.name, method: b.method === 'contanti' ? 'contanti' : 'carta', auto: true, at: Date.now() });
      if (b.recur && b.recur !== 'none') b.due = addMonths(b.due, RECUR_M[b.recur]); else b.done = true;
      changed = true;
    }
  });
  db.incomes.filter(x => !x.done).forEach(x => {
    let guard = 0;
    while (!x.done && x.due <= t && guard++ < 60) {
      db.income.push({ id: uid(), date: x.due, amount: x.amount, account: x.account, note: x.name, at: Date.now() });
      if (x.recur && x.recur !== 'none') x.due = addMonths(x.due, RECUR_M[x.recur]); else x.done = true;
      changed = true;
    }
  });
  if (changed) save();
}

/* ---------- Import movimenti banca (CSV / Excel) ---------- */
const KW = [
  ['benzina', /\b(eni|q8|ip|tamoil|esso|agip|api|shell|totalenergies|carburant\w*|distributor\w*|stazione di servizio)\b/],
  ['spesa', /\b(esselunga|coop|conad|carrefour|lidl|eurospin|pam|iper\w*|md|despar|eurospar|bennet|aldi|penny|famila|tigros|unes|crai|sigma|supermerc\w*|market|alimentari|panetteri\w*|macelleri\w*)\b/],
  ['ristorante', /\b(ristor\w*|pizzer\w*|bar|caff[eè]|mcdonald\w*|burger\w*|kfc|sushi|just ?eat|deliveroo|glovo|trattoria|osteria|pub|gelateri\w*|pasticceri\w*|autogrill)\b/],
  ['abbonamenti', /\b(netflix|spotify|prime|disney|dazn|apple\.com|icloud|now ?tv|youtube|google play)\b/],
  ['bollette', /\b(enel|a2a|iren|hera|edison|plenitude|acea|sorgenia|tim|vodafone|windtre|wind|iliad|fastweb|very mobile|ho\. mobile|bolletta|utenz\w*)\b/],
  ['auto', /\b(autostrad\w*|telepass|parchegg\w*|easypark|officina|gommist\w*|revisione|bollo)\b/],
  ['salute', /\b(farmaci\w*|parafarmaci\w*|medic\w*|dentist\w*|ospedal\w*|ticket sanit\w*|ottic\w*)\b/],
  ['sport', /\b(decathlon|palestra|fitness|mcfit|virgin active|piscina|padel)\b/],
  ['vestiti', /\b(zara|h&m|primark|ovs|bershka|pull&bear|nike|adidas|zalando|calzedonia)\b/],
  ['casa', /\b(ikea|leroy merlin|brico\w*|mediaworld|unieuro|euronics|affitto|condominio)\b/],
  ['svago', /\b(cinema|ticketone|steam|playstation|nintendo|amazon|booking|ryanair|trenitalia|italo)\b/],
  ['risparmio', /\b(fondo pensione|previdenz\w*|pac|investiment\w*|titoli|deposito titoli)\b/]
];
const guessCat = d => { const t = ' ' + d.toLowerCase() + ' '; for (const [k, re] of KW) if (re.test(t)) return k; return 'altro'; };
const isCashWithdrawal = d => /\b(prelievo|prelevamento|atm|bancomat contanti)\b/i.test(d);
function parseCSV(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
}
function toISO(v) {
  if (v instanceof Date && !isNaN(v)) return iso(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return iso(new Date(Date.UTC(1899, 11, 30) + v * 864e5));
  const m = String(v).trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  const m2 = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m2 ? m2[0] : null;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[€\s]/g, '').replace(/EUR/i, '');
  if (!t) return NaN;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  return parseFloat(t);
}
function rowsToMovements(rows) {
  const norm = c => String(c ?? '').toLowerCase().trim();
  const hi = rows.findIndex(r => r.some(c => /^data/.test(norm(c))) && r.some(c => /importo|dare|avere|uscit|entrat|addebit|accredit/.test(norm(c))));
  if (hi < 0) throw new Error('Non trovo le colonne Data e Importo nel file.');
  const h = rows[hi].map(norm), col = re => h.findIndex(x => re.test(x));
  const cDate = [col(/data contab/), col(/data oper/), col(/^data$/), col(/^data/)].find(i => i >= 0);
  const cAmt = col(/^importo/), cOut = col(/dare|uscit|addebit/), cIn = col(/avere|entrat|accredit/);
  const cDesc = h.map((x, i) => /descriz|causale|operazione|dettagl|beneficiar|esercente|note/.test(x) ? i : -1).filter(i => i >= 0);
  const out = [];
  rows.slice(hi + 1).forEach(r => {
    const date = toISO(r[cDate]); if (!date) return;
    let amt;
    if (cAmt >= 0) amt = toNum(r[cAmt]);
    else { const o = toNum(r[cOut]), i = toNum(r[cIn]); amt = !isNaN(o) && o !== 0 ? -Math.abs(o) : (!isNaN(i) ? Math.abs(i) : NaN); }
    if (isNaN(amt) || amt === 0) return;
    const desc = cDesc.map(i => String(r[i] ?? '').trim()).filter(Boolean).join(' · ').replace(/\s+/g, ' ');
    out.push({ date, amount: amt, desc });
  });
  return out;
}
const shortDesc = d => d
  .replace(/carta\s*n\.?\s*\**\d+/gi, ' ').replace(/\d+[.,]\d{2}\s*eur\b/gi, ' ').replace(/\b(del|ore)\s+[\d\/:.]+/gi, ' ')
  .replace(/\b(pagamento|pag\.|pos|carta|eur|spa|s\.p\.a\.|srl|s\.r\.l\.|n\.|nr\.?|c\/o|presso|op\.|addebito|sdd)(?=\s|$)/gi, ' ')
  .replace(/\b\d{3,}\b/g, ' ').replace(/[*·]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
let pendingImport = [];
async function importBank(file) {
  let rows;
  if (/\.xlsx?$/i.test(file.name)) {
    await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  } else rows = parseCSV(await file.text());
  const moves = rowsToMovements(rows);
  const have = new Set(db.expenses.concat(db.transfers).map(e => e.src).filter(Boolean));
  const autos = db.expenses.filter(e => e.auto && !e.src);
  let dup = 0, cash = 0, income = 0, linked = 0;
  pendingImport = [];
  moves.forEach(m => {
    if (m.amount > 0) { income++; return; }
    const amount = Math.round(-m.amount * 100) / 100, src = `${m.date}|${amount}|${m.desc}`;
    if (have.has(src)) { dup++; return; }
    if (isCashWithdrawal(m.desc)) { cash++; db.transfers.push({ id: uid(), date: m.date, amount, from: 'banca', to: 'contanti', src, at: Date.now() }); have.add(src); return; }
    const a = autos.find(e => e.amount === amount && ym(e.date) === ym(m.date) && !e.src);
    if (a) { a.src = src; a.date = m.date; linked++; return; }
    pendingImport.push({ id: uid(), date: m.date, amount, cat: guessCat(m.desc), note: shortDesc(m.desc) || 'Movimento banca', method: 'carta', src, bank: m.desc, at: Date.now() });
  });
  save();
  showImport({ total: moves.length, dup, cash, income, linked });
}
function showImport(st) {
  const list = pendingImport.sort(byDateDesc);
  form.innerHTML = `<div class="sh"><button value="cancel" formnovalidate>Annulla</button><h3>Movimenti banca</h3><button class="save" value="save">Importa ${list.length}</button></div>
    <p class="note">${st.total} movimenti letti: <b>${list.length} spese nuove</b>${st.linked ? `, ${st.linked} addebiti fissi già in app` : ''}${st.dup ? `, ${st.dup} già importati` : ''}${st.cash ? `, ${st.cash} prelievi spostati nei contanti` : ''}${st.income ? `, ${st.income} entrate ignorate` : ''}. Controlla le categorie:</p>
    <div class="card">${list.map((e, i) => `<div class="row"><div class="main"><b>${esc(e.note)}</b><div class="sub">${fmtDay(e.date)} · ${eur(e.amount)}</div></div>
      <select data-imp="${i}" style="border:0;background:var(--line);color:var(--text);border-radius:8px;padding:6px;font:inherit;font-size:14px;max-width:46%">${CATS.map(([k, ic, n]) => `<option value="${k}" ${e.cat === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></div>`).join('') || '<div class="empty">Nessuna spesa nuova da importare.</div>'}</div>`;
  form.dataset.kind = 'import'; form.dataset.id = '';
  if (!sheet.open) sheet.showModal();
}
form.addEventListener('change', e => { const s = e.target.closest('[data-imp]'); if (s) pendingImport[+s.dataset.imp].cat = s.value; });
function confirmImport() {
  pendingImport.forEach(({ bank, ...e }) => db.expenses.push(e));
  const last = pendingImport.map(e => e.date).sort().pop();
  pendingImport = []; save();
  if (last) month = ym(last);
  render();
}

/* ---------- Eventi UI ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-mon],[data-seg],[data-pay],[data-edit],[data-act],[data-acct]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; window.scrollTo(0, 0); render(); }
  else if (t.dataset.mon) { const [y, m] = month.split('-').map(Number); month = ym(iso(new Date(y, m - 1 + Number(t.dataset.mon), 1))); render(); }
  else if (t.dataset.seg) { soldiView = t.dataset.seg; render(); }
  else if (t.dataset.pay) { e.stopPropagation(); pay(t.dataset.pay); }
  else if (t.dataset.edit) { const [k, id] = t.dataset.edit.split(':'); openForm(k, id); }
  else if (t.dataset.act) ACTIONS[t.dataset.act]();
  else if (t.dataset.acct) openForm('account', t.dataset.acct);
});
$('#addBtn').addEventListener('click', () => {
  if (tab === 'home') return quickAdd();
  openForm({ soldi: soldiView === 'scadenze' ? 'bills' : 'expenses', agenda: 'events', sport: 'workouts', cibo: 'meals' }[tab]);
});
function quickAdd() {
  form.innerHTML = `<div class="sh"><button value="cancel" formnovalidate>Annulla</button><h3>Aggiungi</h3><span style="width:60px"></span></div>
    ${card([['expenses', '💶', 'Spesa'], ['incomes', '💰', 'Entrata (es. stipendio)'], ['bills', '🧾', 'Scadenza da pagare'], ['events', '📌', 'Impegno'], ['workouts', '🏃', 'Allenamento'], ['meals', '🍝', 'Pasto']]
      .map(([k, i, n]) => row({ ic: i, title: n, act: `data-quick="${k}"` })))}`;
  form.dataset.kind = '';
  sheet.showModal();
}
form.addEventListener('click', e => { const q = e.target.closest('[data-quick]'); if (q) { sheet.close(); openForm(q.dataset.quick); } });

/* ---------- Backup ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const ACTIONS = {
  bank() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.txt,.xls,.xlsx,text/csv';
    i.onchange = () => importBank(i.files[0]).catch(err => { form.innerHTML = `<div class="sh"><span></span><h3>Import non riuscito</h3><button value="cancel">Chiudi</button></div><p class="note">${esc(err.message || 'Non riesco a leggere questo file.')} Esporta i movimenti da Banco BPM in Excel o CSV e riprova, oppure mandami il file e adatto l'app.</p>`; form.dataset.kind = ''; if (!sheet.open) sheet.showModal(); });
    i.click();
  },
  export() { download(`agenda-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json'); },
  import() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      try {
        const d = JSON.parse(await i.files[0].text());
        if (!d || !Array.isArray(d.expenses)) throw 0;
        db = Object.assign(structuredClone(EMPTY), d); save(); render();
      } catch { view.insertAdjacentHTML('afterbegin', '<p class="note" style="color:var(--red)">Il file scelto non è un backup valido.</p>'); }
    };
    i.click();
  },
  csv() {
    const rows = [['Data', 'Categoria', 'Nota', 'Importo', 'Litri']].concat(
      [...db.expenses].sort(byDateDesc).map(e => [e.date, CAT[e.cat].n, e.note || '', String(e.amount).replace('.', ','), e.liters ? String(e.liters).replace('.', ',') : '']));
    download(`spese-${today()}.csv`, '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  }
};

/* ---------- Promemoria (notifiche locali quando l'app è aperta) ---------- */
function scheduleChecks() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const t = today();
  openBills().filter(b => !b.auto).forEach(b => {
    const d = daysTo(b.due);
    if (d <= 2 && b.notified !== t) {
      new Notification('Da pagare: ' + b.name, { body: (d < 0 ? 'Scaduta il ' : 'Scade ') + fmtDay(b.due).toLowerCase() + (b.amount ? ' · ' + eur(b.amount) : ''), icon: 'icon-192.png' });
      b.notified = t;
    }
  });
  save();
}

/* ---------- Avvio ---------- */
runAutoDebits();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { runAutoDebits(); render(); scheduleChecks(); } });
scheduleChecks();

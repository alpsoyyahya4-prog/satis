(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad2 = n => String(n).padStart(2, '0');
const dayStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => dayStr(new Date());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NB = window.AndroidBridge || null;   // native Android bridge (APK only)

const CUR = { TRY: '₺', USD: '$', EUR: '€' };
const CUR_OPTS = [{ v: 'TRY', l: '₺ TL' }, { v: 'USD', l: '$ USD' }, { v: 'EUR', l: '€ EUR' }];
const UNIT_OPTS = [{ v: 'mt', l: 'Metre' }, { v: 'kg', l: 'Kg' }, { v: 'adet', l: 'Adet' }, { v: 'top', l: 'Top' }, { v: 'yard', l: 'Yard' }];
const UNIT_NAME = { mt: 'metre', kg: 'kilogram', adet: 'adet', top: 'top', yard: 'yard' };
const CUR_NAME = { TRY: 'Türk lirası', USD: 'Amerikan doları', EUR: 'Euro' };

const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfCsv = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('tr-TR');
const money = (v, cur) => (CUR[cur] || '₺') + nf2.format(v);
// display form: "₺" and ",00" get their own spans so they can sit smaller than the lira
function moneyHtml(v, cur) {
  const s = nf2.format(v), i = s.lastIndexOf(',');
  return `<span class="cur">${CUR[cur] || '₺'}</span>${s.slice(0, i)}<span class="dec">${s.slice(i)}</span>`;
}

// Accepts "125,50", "1.250,50", "125.5", "₺ 1250"
function parseAmount(str) {
  let s = String(str ?? '').replace(/[\s₺$€]|tl/gi, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Math.round(Number(s) * 100) / 100;
}

const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s).getTime());
const dfLong = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const dfShort = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const dfDM = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const dfStamp = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const daysAgo = s => Math.round((parseDay(today()) - parseDay(s)) / 864e5);
function ago(s) {
  const n = daysAgo(s);
  if (n === 0) return 'bugün';
  if (n === 1) return 'dün';
  if (n > 1 && n < 30) return n + ' gün önce';
  return dfShort.format(parseDay(s));
}
function whenMs(ms) {
  if (!ms) return '—';
  const d = new Date(ms), t = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const n = daysAgo(dayStr(d));
  return n === 0 ? 'bugün ' + t : n === 1 ? 'dün ' + t : dfStamp.format(d);
}

// Search-friendly text: "Süprem" matches "suprem", "KAŞE" matches "kase"
const norm = s => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/* price history: [{id, f: price, t: 'YYYY-MM-DD', n: note}] */
const hist = k => (Array.isArray(k.fiyatlar) ? k.fiyatlar : [])
  .filter(e => e && Number.isFinite(e.f) && e.t && !e.silindi)
  .slice().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
const lastOf = k => { const h = hist(k); return h[h.length - 1] || null; };
// Nothing is ever removed: deleted records keep a "silindi" date, stay in the data and wait in Silinenler.
const liveCariler = () => store.cariler.filter(c => !c.silindi);
const liveKumaslar = () => {
  const gone = new Set(store.cariler.filter(c => c.silindi).map(c => c.id));
  return store.kumaslar.filter(k => !k.silindi && !gone.has(k.cariId));
};
function chg(c, p) {
  if (!c || !p || !p.f) return '';
  const d = (c.f - p.f) / p.f * 100;
  if (Math.abs(d) < 0.05) return '<span class="chg flat" title="Önceki fiyatla aynı">= %0</span>';
  const up = d > 0;
  return `<span class="chg ${up ? 'up' : 'down'}" title="Önceki fiyata göre ${up ? 'arttı' : 'düştü'}">${up ? '▲' : '▼'} %${nf1.format(Math.abs(d))}</span>`;
}

const svg = (p, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  back: svg('<path d="M15 18l-6-6 6-6"/>', 24),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 20),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', 18),
  msg: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>', 18),
  dl: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 20),
  up: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', 20),
  share: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>', 20),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 18),
  chev: svg('<path d="M9 6l6 6-6 6"/>', 18),
  store: svg('<path d="M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-6h6v6"/>', 30),
  roll: svg('<ellipse cx="7" cy="12" rx="3.5" ry="8"/><path d="M7 4h10.5a3.5 8 0 0 1 0 16H7"/><circle cx="7" cy="12" r="1"/>', 30),
  tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>', 20),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 20),
  shield: svg('<path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>', 24),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 18),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 20),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', 20),
  sheet: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>', 20),
  broom: svg('<path d="M14 4l-4 8M6 13h9l2 7H4z"/>', 20),
  sort: svg('<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>', 16),
  coins: svg('<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7M10 16.4c.6.1 1.3.1 2 .1 2.8 0 5-1.1 5-2.5v-4"/>', 20),
};

// the price tag from the app icon, for the list heading
const LOGO = `<svg class="logo" viewBox="0 0 108 108" width="30" height="30" aria-hidden="true">
  <rect fill="var(--accent)" x="23" y="23" width="62" height="62" rx="17"/>
  <path fill="none" stroke="var(--surface)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M67 40c-4-4-9-6-16-6-9 0-15 4-15 10 0 7 6 9 16 11 10 2 16 5 16 13 0 7-6 12-17 12-8 0-15-3-20-8"/>
  <path fill="none" stroke="#E9B04E" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" d="M34 70 49 55l10 9 19-23M67 41h11v11"/>
</svg>`;
function haptic(kind) { try { NB && NB.haptic && NB.haptic(kind || 'tick'); } catch { /* optional */ } }

let toastTimer;
function toast(msg, icon = true, action = null) {
  const t = $('#toast');
  const hide = () => {
    clearTimeout(toastTimer);
    if (t.hidePopover) { try { t.hidePopover(); } catch { /* closed */ } }
    t.hidden = true;
  };
  t.innerHTML = (icon ? ICON.check : '') + '<span>' + esc(msg) + '</span>'
    + (action ? `<button class="t-act" type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('.t-act').onclick = () => { hide(); action.run(); };
  t.hidden = false;
  if (t.showPopover) { try { t.hidePopover(); } catch { /* not open */ } try { t.showPopover(); } catch { /* unsupported */ } }
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 6000 : 2800);
}

/* ---------- preferences (this device) ---------- */
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const LS_DATA = 'satis-app-v1', LS_PREF = 'satis-app-pref';
const pref = Object.assign({ para: 'TRY', birim: 'mt', sort: 'az', cariSort: 'az', theme: 'system', anim: true }, lsGet(LS_PREF) || {});
const savePref = () => lsSet(LS_PREF, pref);
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme() {
  const root = document.documentElement;
  if (pref.theme === 'light' || pref.theme === 'dark') root.dataset.theme = pref.theme; else delete root.dataset.theme;
  root.classList.toggle('no-anim', !pref.anim);
  syncBars();
}
function syncBars() {
  if (!NB || !NB.setBars) return;
  const cs = getComputedStyle(document.documentElement);
  const dark = pref.theme === 'dark' || (pref.theme !== 'light' && !!(darkMQ && darkMQ.matches));
  try { NB.setBars(cs.getPropertyValue('--bg').trim(), cs.getPropertyValue('--surface').trim(), dark); } catch { /* old bridge */ }
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', syncBars);

/* ---------- storage: phone file (APK), cloud db (Claude), or this browser ---------- */
const store = { mode: 'loading', ready: false, db: null, dl: null, cariler: [], kumaslar: [], firstRun: false };

function sampleData() {
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return dayStr(x); };
  const P = (f, n, note) => ({ id: uid(), f, t: d(n), n: note || '' });
  const K = (id, cariId, ad, kod, para, birim, fiyatlar) => ({ id, cariId, ad, kod, para, birim, not: '', fiyatlar, ornek: true });
  return {
    cariler: [
      { id: 'ornek-yildiz', ad: 'Yıldız Tekstil', yetkili: 'Murat Bey', telefon: '0555 000 00 01', not: 'Vade 60 gün. 500 kg üzeri iskonto var.', ornek: true },
      { id: 'ornek-deniz', ad: 'Deniz Kumaşçılık', yetkili: 'Ayşe Hanım', telefon: '0555 000 00 02', not: '', ornek: true },
    ],
    kumaslar: [
      K('ornek-k1', 'ornek-yildiz', 'Süprem 30/1', 'SP-301', 'TRY', 'kg', [P(245, 103), P(258, 61), P(272, 6, 'Hammadde zammı')]),
      K('ornek-k2', 'ornek-yildiz', 'Ribana 2x2', 'RB-22', 'TRY', 'kg', [P(289, 82), P(281, 11)]),
      K('ornek-k3', 'ornek-yildiz', 'Kaşe', 'KS-140', 'USD', 'mt', [P(6.4, 47)]),
      K('ornek-k4', 'ornek-deniz', 'Süprem 30/1', 'D-114', 'TRY', 'kg', [P(265, 51), P(262, 3)]),
      K('ornek-k5', 'ornek-deniz', 'Gabardin', 'GB-75', 'TRY', 'mt', [P(118.5, 124), P(126, 53), P(131.75, 2)]),
      K('ornek-k6', 'ornek-deniz', 'Keten %100', 'KT-01', 'EUR', 'mt', [P(7.9, 19)]),
    ],
  };
}

function parseData(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (d && Array.isArray(d.cariler) && Array.isArray(d.kumaslar)) return d;
  } catch { /* not a backup */ }
  return null;
}
const serialize = () => JSON.stringify({ app: 'satis', v: 1, savedAt: new Date().toISOString(), cariler: store.cariler, kumaslar: store.kumaslar });

function nativeBackups() { try { return JSON.parse(NB.backups() || '[]'); } catch { return []; } }
function snapshotNow(tag) { if (NB && NB.snapshot) { try { NB.snapshot(tag); } catch { /* best effort */ } } }

function loadNative() {
  store.mode = 'native';
  let data = parseData(NB.load());
  if (!data) {
    // main file missing or unreadable: fall back to the newest readable automatic backup
    for (const b of nativeBackups()) {
      const d = parseData(NB.readBackup(b.name));
      if (d) { data = d; NB.save(JSON.stringify(d)); setTimeout(() => toast('Kayıt dosyası okunamadı; son yedekten yüklendi.'), 600); break; }
    }
  }
  if (!data) data = { cariler: [], kumaslar: [] };   // the phone app starts empty
  store.cariler = data.cariler; store.kumaslar = data.kumaslar;
  store.ready = true;
}

function useLocal() {
  if (store.mode === 'local') return;
  store.mode = 'local';
  const data = parseData(lsGet(LS_DATA)) || sampleData();
  store.cariler = data.cariler; store.kumaslar = data.kumaslar;
  store.ready = true;
  refresh();
}

async function initStore() {
  if (NB) { loadNative(); refresh(); return; }
  let db = null;
  try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch { db = null; }
  if (!db) return useLocal();
  store.db = db; store.mode = 'db';
  const got = {};
  const sub = col => db.collection(col).onSnapshot(snap => {
    if (store.mode !== 'db') return;
    store[col] = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    got[col] = true;
    if (got.cariler && got.kumaslar) store.ready = true;
    refresh();
  }, () => {
    if (!store.ready) { useLocal(); toast('Bulut kaydına ulaşılamadı; bu cihazda çalışılıyor.', false); }
    else toast('Bağlantı kesildi. Sayfayı yenileyince devam eder.', false);
  });
  sub('cariler'); sub('kumaslar');
}

function persist() {
  if (store.mode === 'native') {
    let ok = false;
    try { ok = NB.save(serialize()); } catch { ok = false; }
    if (!ok) throw { code: 'native_write' };
  } else if (store.mode === 'local') {
    lsSet(LS_DATA, { cariler: store.cariler, kumaslar: store.kumaslar });
  }
}

// Apply several writes as one change: [{op:'put'|'del', col, doc|id}]
async function commit(changes) {
  if (store.mode === 'db') {
    for (const c of changes) {
      const write = () => c.op === 'put'
        ? store.db.doc(c.col + '/' + c.doc.id).set((({ id, ...rest }) => rest)(c.doc))
        : store.db.doc(c.col + '/' + c.id).delete();
      try { await write(); } catch (e) {
        if (e && e.code === 'unavailable') { await sleep(400 + Math.random() * 600); await write(); } else throw e;
      }
    }
    return;
  }
  const before = { cariler: store.cariler.slice(), kumaslar: store.kumaslar.slice() };
  for (const c of changes) {
    if (c.op === 'put') {
      const arr = store[c.col], i = arr.findIndex(x => x.id === c.doc.id);
      if (i >= 0) arr[i] = c.doc; else arr.push(c.doc);
    } else store[c.col] = store[c.col].filter(x => x.id !== c.id);
  }
  try { persist(); } catch (e) { store.cariler = before.cariler; store.kumaslar = before.kumaslar; refresh(); throw e; }
  store.firstRun = false;
  refresh();
}
const put = (col, doc) => commit([{ op: 'put', col, doc }]);

function writeErr(e) {
  const c = e && e.code;
  if (c === 'native_write') return 'Kaydedilemedi: telefonda yer kalmamış olabilir.';
  if (c === 'quota_exceeded') return 'Kayıt sınırı doldu. Kullanmadığın kumaşları silip tekrar dene.';
  if (c === 'invalid_argument') return 'Kaydedilemedi: bu sayfada düzenleme yetkin olmayabilir.';
  if (c === 'resource_exhausted') return 'Çok hızlı işlem yapıldı. Birkaç saniye bekleyip tekrar dene.';
  return 'Kaydedilemedi. Tekrar dene.';
}

/* ---------- routing: #/  #/kumaslar  #/ayarlar  #/cari/<id>  #/kumas/<id> ---------- */
const TABS = ['cariler', 'kumaslar', 'ayarlar'];
function parseRoute() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'kumaslar' || a === 'ayarlar') return { name: a };
  if (a === 'grup' && b) return { name: 'grup', key: decodeURIComponent(b) };
  if (a === 'cari' && b) return { name: 'cari', id: decodeURIComponent(b) };
  if (a === 'kumas' && b) return { name: 'kumas', id: decodeURIComponent(b) };
  return { name: 'cariler' };
}
let route = parseRoute();
let animNext = 'tab';
const nav = { stack: [location.hash], lastTab: 'cariler', scroll: {}, q: {}, replacing: false };
const qKey = () => (route.name === 'cari' ? 'cari:' + route.id : route.name);

window.addEventListener('hashchange', () => {
  const h = location.hash, st = nav.stack, prev = route;
  nav.scroll[st[st.length - 1]] = window.scrollY;
  let back = false;
  if (nav.replacing) { st[st.length - 1] = h; nav.replacing = false; back = true; }
  else if (st.length > 1 && st[st.length - 2] === h) { st.pop(); back = true; }
  else st.push(h);
  route = parseRoute();
  animNext = TABS.includes(route.name) && TABS.includes(prev.name) ? 'tab' : back ? 'back' : 'fwd';
  mount();
  window.scrollTo(0, back ? (nav.scroll[h] || 0) : 0);
});
function goBack(parent) {
  if (nav.stack.length > 1) history.back();
  else if (location.hash !== parent) { nav.replacing = true; location.replace(parent); }
}

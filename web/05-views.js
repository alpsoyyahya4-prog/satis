
/* ---------- views ---------- */
const cariMap = () => new Map(liveCariler().map(c => [c.id, c]));
const byName = (a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr');
const findCari = id => liveCariler().find(c => c.id === id);
const findKumas = id => liveKumaslar().find(k => k.id === id);
let animating = false;
const prevOf = k => { const h = hist(k); return h.length > 1 ? h[h.length - 2] : null; };

function mount() {
  const r = route;
  if (TABS.includes(r.name)) nav.lastTab = r.name;
  const tab = r.name === 'cari' ? 'cariler' : r.name === 'kumas' ? nav.lastTab : r.name;
  for (const t of TABS) {
    const el = $('#tab-' + t);
    if (t === tab) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }
  const q = $('#q');
  q.value = nav.q[qKey()] || '';
  q.placeholder = r.name === 'cariler' ? 'Cari ara' : r.name === 'kumaslar' ? 'Kumaş veya cari ara' : 'Bu caride kumaş ara';
  $('#fab').classList.remove('mini');
  refresh(true);
}

function refresh(swap) {
  const r = route;
  renderTop(swap === true);
  document.documentElement.style.setProperty('--toph', $('#top').offsetHeight + 'px');
  const has = nav.q[qKey()];
  const count = r.name === 'cariler' ? liveCariler().length
    : r.name === 'kumaslar' ? liveKumaslar().length
    : r.name === 'cari' ? liveKumaslar().filter(k => k.cariId === r.id).length : 0;
  // main lists always get a search box; a supplier's own fabric list once it grows
  $('#searchWrap').hidden = !store.ready || !['cariler', 'kumaslar', 'cari'].includes(r.name) || (!has && count < (r.name === 'cari' ? 6 : 1));
  $('#qClear').hidden = !has;
  const exists = r.name === 'cari' ? !!findCari(r.id) : r.name === 'kumas' ? !!findKumas(r.id) : true;
  const fab = $('#fab');
  fab.hidden = !store.ready || !exists || r.name === 'ayarlar' || r.name === 'grup';
  const label = { cariler: 'Cari ekle', kumaslar: 'Kumaş ekle', cari: 'Kumaş ekle', kumas: 'Yeni fiyat' }[r.name] || '';
  const html = ICON.plus + '<span>' + label + '</span>';
  if (fab.innerHTML !== html) fab.innerHTML = html;
  fab.setAttribute('aria-label', label);
  renderView();
}

function renderView() {
  const r = route, v = $('#view');
  const anim = store.ready ? animNext : null;
  if (store.ready) animNext = null;
  animating = !!anim && pref.anim;
  v.innerHTML = !store.ready ? skeleton()
    : r.name === 'kumaslar' ? viewKumaslar()
    : r.name === 'ayarlar' ? viewAyarlar()
    : r.name === 'cari' ? viewCari(r.id)
    : r.name === 'grup' ? viewGrup(r.key)
    : r.name === 'kumas' ? viewKumas(r.id)
    : viewCariler();
  if (animating) { v.classList.remove('a-fwd', 'a-back', 'a-tab'); void v.offsetWidth; v.classList.add('a-' + anim); }
  animating = false;
}

function renderTop(swap) {
  const r = route, top = $('#top'), sc = top.classList.contains('scrolled') ? ' scrolled' : '';
  if (TABS.includes(r.name)) {
    top.className = 'top main' + sc;
    const title = { cariler: 'Cariler', kumaslar: 'Kumaşlar', ayarlar: 'Ayarlar' }[r.name];
    top.innerHTML = `<div class="tt${swap ? ' swap' : ''}"><h1>${r.name === 'cariler' ? LOGO : ''}${title}</h1></div>`;
    return;
  }
  let t1 = store.ready ? 'Bulunamadı' : '', sub = '', canEdit = false;
  if (r.name === 'grup') {
    const items = liveKumaslar().filter(k => norm(k.ad) === r.key);
    if (items.length) { t1 = items[0].ad; sub = items.length + ' caride'; }
  } else {
    const item = r.name === 'cari' ? findCari(r.id) : findKumas(r.id);
    if (item) {
      t1 = item.ad;
      canEdit = true;
      if (r.name === 'kumas') sub = [findCari(item.cariId)?.ad, item.kod].filter(Boolean).join(' · ');
    }
  }
  top.className = 'top detail' + sc;
  top.innerHTML = `<button class="icon-btn" type="button" data-act="back" aria-label="Geri">${ICON.back}</button>
    <div class="tt${swap ? ' swap' : ''}"><div class="t1">${esc(t1)}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}</div>
    ${canEdit ? `<button class="icon-btn" type="button" data-act="edit" aria-label="Düzenle">${ICON.edit}</button>` : ''}`;
}

const skeleton = () => '<div class="list" aria-busy="true" aria-label="Yükleniyor">'
  + '<div class="row sk"><div class="main"><div class="sk-l"></div><div class="sk-l s"></div></div></div>'.repeat(3) + '</div>';
const emptyBox = (icon, title, text, btns) => `<div class="empty"><div class="ic">${icon}</div><h3>${title}</h3><p>${text}</p><div class="acts">${btns || ''}</div></div>`;
const noResults = q => `<div class="empty"><h3>“${esc(q)}” bulunamadı</h3><p>Daha kısa bir kelimeyle ara.</p></div>`;
const agoSpan = t => { const s = ago(t); return daysAgo(t) > 30 ? `<span class="stale">${s}</span>` : s; };

function fabricRow(k, info) {
  const h = hist(k), c = h[h.length - 1], p = h[h.length - 2];
  const meta = [info, c ? agoSpan(c.t) : 'Fiyat yok'].filter(Boolean).join(' · ');
  return `<a class="row" href="#/kumas/${encodeURIComponent(k.id)}">
    <div class="main"><div class="name">${esc(k.ad)}</div><div class="meta">${meta}</div></div>
    ${c ? `<div class="side"><div class="amt">${moneyHtml(c.f, k.para)}<small>/${esc(k.birim)}</small></div>${chg(c, p)}</div>` : ''}
  </a>`;
}

const CARI_SORTS = { az: 'A–Z', za: 'Z–A', cok: 'En çok kumaş', yeni: 'Son eklenen' };
function viewCariler() {
  if (!liveCariler().length) return emptyBox(ICON.store, 'Henüz cari yok',
    'Kumaş aldığın tedarikçileri ekle, sonra her birine kumaş ve fiyat gir.',
    `<button class="btn primary" type="button" data-act="add">${ICON.plus}Cari ekle</button>`
    + `<button class="btn" type="button" data-act="bk-restore">${NB ? 'Eski telefondan aktar' : 'Yedekten yükle'}</button>`);
  const raw = nav.q.cariler || '', q = norm(raw), qd = raw.replace(/\D/g, '');
  const counts = new Map(), fabs = new Map();
  for (const k of liveKumaslar()) {
    counts.set(k.cariId, (counts.get(k.cariId) || 0) + 1);
    if (q) { if (!fabs.has(k.cariId)) fabs.set(k.cariId, []); fabs.get(k.cariId).push(k); }
  }
  // match the name, contact, phone digits or any fabric of the supplier; names starting with the query come first
  const list = [];
  for (const c of liveCariler()) {
    if (!q) { list.push({ c, rank: 0 }); continue; }
    const n = norm(c.ad);
    if (n.startsWith(q)) list.push({ c, rank: 0 });
    else if (n.includes(q) || norm([c.yetkili, c.not].join(' ')).includes(q)) list.push({ c, rank: 1 });
    else if (qd.length >= 3 && String(c.telefon || '').replace(/\D/g, '').includes(qd)) list.push({ c, rank: 1 });
    else {
      const f = (fabs.get(c.id) || []).find(k => norm(k.ad + ' ' + (k.kod || '')).includes(q));
      if (f) list.push({ c, rank: 2, f });
    }
  }
  const cmp = {
    za: (a, b) => byName(b.c, a.c),
    cok: (a, b) => (counts.get(b.c.id) || 0) - (counts.get(a.c.id) || 0) || byName(a.c, b.c),
    yeni: (a, b) => String(b.c.olusturma || '').localeCompare(String(a.c.olusturma || '')) || byName(a.c, b.c),
  }[pref.cariSort] || ((a, b) => byName(a.c, b.c));
  list.sort((a, b) => a.rank - b.rank || cmp(a, b));
  if (!list.length) return noResults(raw) + '<p class="note-sm" style="text-align:center">Kumaş adı veya telefon numarasıyla da arayabilirsin.</p>';
  return `<div class="sec" style="margin-top:0"><span>${q ? list.length + ' sonuç' : list.length + ' cari'}</span>
      <button class="link" type="button" data-act="cari-sort">${ICON.sort}${CARI_SORTS[pref.cariSort] || CARI_SORTS.az}</button></div>`
    + '<div class="list">' + list.map(({ c, f }) => `<a class="row" href="#/cari/${encodeURIComponent(c.id)}">
      <div class="main"><div class="name">${esc(c.ad)}${c.ornek ? '<span class="chip">Örnek</span>' : ''}</div>
        <div class="meta">${f ? `<span class="hit">${esc(f.ad)}</span> bu caride` : esc([(counts.get(c.id) || 0) + ' kumaş', c.yetkili].filter(Boolean).join(' · '))}</div></div>
      ${ICON.chev}
    </a>`).join('') + '</div>';
}

const SORTS = { az: 'A–Z', cheap: 'En ucuz', recent: 'Son güncellenen' };
const CUR_ORDER = { TRY: 0, USD: 1, EUR: 2 };
const cheapestFirst = (a, b) => ((CUR_ORDER[a.k.para] ?? 9) - (CUR_ORDER[b.k.para] ?? 9)) || ((a.l?.f ?? 1e15) - (b.l?.f ?? 1e15));

// one row per fabric name: tapping it opens every supplier's price for that fabric, cheapest first
function viewKumaslar() {
  const all = liveKumaslar();
  if (!all.length) return emptyBox(ICON.roll, 'Henüz kumaş yok',
    liveCariler().length ? 'Bir cariyi açıp kumaş ekle. Bütün kumaşlar burada toplanır.' : 'Önce bir cari ekle, sonra o cariye kumaş gir.',
    `<button class="btn primary" type="button" data-act="add">${ICON.plus}${liveCariler().length ? 'Kumaş ekle' : 'Cari ekle'}</button>`);
  const raw = nav.q.kumaslar || '', q = norm(raw), cm = cariMap();
  const groups = new Map();
  for (const k of all) {
    const key = norm(k.ad);
    if (!groups.has(key)) groups.set(key, { key, ad: k.ad, items: [] });
    groups.get(key).items.push({ k, l: lastOf(k), cari: cm.get(k.cariId) });
  }
  let list = [...groups.values()].map(g => ({
    ...g,
    best: g.items.filter(x => x.l).sort(cheapestFirst)[0] || null,
    t: g.items.reduce((m, x) => (x.l && x.l.t > m ? x.l.t : m), ''),
  }));
  if (q) list = list.filter(g => norm(g.ad).includes(q) || g.items.some(x => norm([x.k.kod, x.cari && x.cari.ad].join(' ')).includes(q)));
  const az = (a, b) => a.ad.localeCompare(b.ad, 'tr');
  list.sort({
    cheap: (a, b) => ((a.best ? a.best.l.f : 1e15) - (b.best ? b.best.l.f : 1e15)) || az(a, b),
    recent: (a, b) => String(b.t).localeCompare(String(a.t)) || az(a, b),
  }[pref.sort] || az);
  const head = `<div class="sec" style="margin-top:0"><span>${list.length} kumaş</span>
    <button class="link" type="button" data-act="sort">${ICON.sort}${SORTS[pref.sort] || SORTS.az}</button></div>`;
  if (!list.length) return head + noResults(raw);
  return head + '<div class="list">' + list.map(g => {
    const many = g.items.length > 1, b = g.best, one = g.items[0];
    const meta = many
      ? `${g.items.length} caride${b ? ` · en ucuz <span class="hit">${esc(b.cari?.ad || '')}</span>` : ''}`
      : esc([one.cari?.ad, one.l ? ago(one.l.t) : 'Fiyat yok'].filter(Boolean).join(' · '));
    const href = many ? '#/grup/' + encodeURIComponent(g.key) : '#/kumas/' + encodeURIComponent(one.k.id);
    return `<a class="row" href="${href}">
      <div class="main"><div class="name">${esc(g.ad)}</div><div class="meta">${meta}</div></div>
      ${b ? `<div class="side"><div class="amt">${moneyHtml(b.l.f, b.k.para)}<small>/${esc(b.k.birim)}</small></div>
        ${many ? '<span class="chg flat">en ucuz</span>' : chg(b.l, prevOf(b.k))}</div>` : ''}
      ${many ? ICON.chev : ''}
    </a>`;
  }).join('') + '</div>';
}

// every supplier that carries this fabric, cheapest first
function viewGrup(key) {
  const cm = cariMap();
  const rows = liveKumaslar().filter(k => norm(k.ad) === key)
    .map(k => ({ k, l: lastOf(k), cari: cm.get(k.cariId) })).sort(cheapestFirst);
  if (!rows.length) return emptyBox(ICON.roll, 'Kumaş bulunamadı', 'Bu kumaş silinmiş olabilir.', '<a class="btn" href="#/kumaslar">Kumaşlara dön</a>');
  const priced = rows.filter(r => r.l);
  const best = priced[0] || null;
  const same = best ? priced.filter(r => r.k.para === best.k.para && r.k.birim === best.k.birim) : [];
  const gap = same.length > 1 ? same[same.length - 1].l.f - best.l.f : 0;
  return `<div class="sec" style="margin-top:0"><h2>En ucuzdan pahalıya</h2><span>${rows.length} cari</span></div>`
    + (gap > 0 ? `<p class="note-sm" style="margin:0 6px 10px">En ucuz ile en pahalı arasında <b>${money(gap, best.k.para)}</b> fark var.</p>` : '')
    + '<div class="list">' + rows.map(r => `<a class="row" href="#/kumas/${encodeURIComponent(r.k.id)}">
      <div class="main"><div class="name">${esc(r.cari?.ad || '—')}${best && r === best && same.length > 1 ? '<span class="chip good">En ucuz</span>' : ''}</div>
        <div class="meta">${esc([r.k.kod, r.l ? ago(r.l.t) : 'Fiyat yok'].filter(Boolean).join(' · '))}</div></div>
      ${r.l ? `<div class="side"><div class="amt">${moneyHtml(r.l.f, r.k.para)}<small>/${esc(r.k.birim)}</small></div>${chg(r.l, prevOf(r.k))}</div>` : ''}
    </a>`).join('') + '</div>';
}

function waNumber(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d.length >= 11 ? d : '';
}

function viewCari(id) {
  const c = findCari(id);
  if (!c) return emptyBox(ICON.store, 'Cari bulunamadı', 'Bu cari silinmiş olabilir.', '<a class="btn" href="#/">Carilere dön</a>');
  const ks = liveKumaslar().filter(k => k.cariId === id);
  const raw = nav.q['cari:' + id] || '', q = norm(raw);
  const list = ks.filter(k => !q || norm([k.ad, k.kod].join(' ')).includes(q)).sort(byName);
  const tel = String(c.telefon || '').replace(/[^\d+]/g, ''), wa = waNumber(c.telefon);
  const contact = [c.yetkili, c.telefon].filter(Boolean).join(' · ');
  let html = `<div class="info">
    ${contact ? `<p class="meta">${esc(contact)}</p>` : ''}
    <div class="pills">${tel ? `<a class="pill" href="tel:${esc(tel)}">${ICON.phone}Ara</a>` : `<button class="pill" type="button" data-act="edit">${ICON.phone}Telefon ekle</button>`}${wa ? `<a class="pill" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ICON.msg}WhatsApp</a>` : ''}</div>
    ${c.not ? `<p class="memo">${esc(c.not)}</p>` : ''}
  </div>
  <div class="sec"><h2>Kumaşlar</h2><span>${ks.length}</span></div>`;
  if (!ks.length) return html + emptyBox(ICON.roll, 'Kumaş yok', 'Bu carinin kumaşını ve fiyatını ekle.',
    `<button class="btn primary" type="button" data-act="add">${ICON.plus}Kumaş ekle</button>`);
  if (!list.length) return html + noResults(raw);
  return html + '<div class="list">' + list.map(k => fabricRow(k, k.kod ? esc(k.kod) : '')).join('') + '</div>';
}

function viewKumas(id) {
  const k = findKumas(id);
  if (!k) return emptyBox(ICON.roll, 'Kumaş bulunamadı', 'Bu kumaş silinmiş olabilir.', '<a class="btn" href="#/kumaslar">Kumaşlara dön</a>');
  const h = hist(k), c = h[h.length - 1], p = h[h.length - 2];
  let html = `<section class="card">
    <div class="lbl">Güncel fiyat</div>
    <div class="big">${c ? moneyHtml(c.f, k.para) : '—'}<span class="unit"> / ${esc(k.birim)}</span></div>
    ${c ? `<div class="pmeta">${chg(c, p)}<span>${esc(dfLong.format(parseDay(c.t)))}</span></div>` : ''}
    ${h.length >= 2 ? chart(h) : ''}
    ${k.not ? `<p class="memo">${esc(k.not)}</p>` : ''}
  </section>
  <div class="sec"><h2>Fiyat geçmişi</h2><span>${h.length}</span></div>`;
  if (h.length) html += '<div class="list">' + h.map((e, i) => ({ e, pe: h[i - 1] })).reverse().map(({ e, pe }) => `
    <div class="hrow">
      <div class="main">${esc(dfLong.format(parseDay(e.t)))}${e.n ? `<div class="meta">${esc(e.n)}</div>` : ''}</div>
      <div class="side"><div class="amt">${moneyHtml(e.f, k.para)}</div>${pe ? chg(e, pe) : ''}</div>
      ${h.length > 1 ? `<button class="icon-btn sm" type="button" data-act="del-price" data-id="${esc(e.id || e.t + '|' + e.f)}" aria-label="Bu fiyatı sil">${ICON.trash}</button>` : ''}
    </div>`).join('') + '</div>';

  // the same fabric at other suppliers, cheapest comparable one marked
  const key = norm(k.ad), same = liveKumaslar().filter(x => x.id !== k.id && norm(x.ad) === key);
  if (same.length) {
    const cm = cariMap();
    const rows = [k, ...same].map(x => ({ x, l: lastOf(x), cmp: x.para === k.para && x.birim === k.birim }));
    const comp = rows.filter(r => r.cmp && r.l);
    const min = comp.length > 1 ? Math.min(...comp.map(r => r.l.f)) : null;
    rows.sort((a, b) => (b.cmp - a.cmp) || ((a.l?.f ?? 1e15) - (b.l?.f ?? 1e15)));
    html += `<div class="sec"><h2>Diğer carilerde</h2></div><div class="list">` + rows.map(({ x, l, cmp }) => {
      const self = x.id === k.id;
      const inner = `<div class="main"><div class="name">${esc(cm.get(x.cariId)?.ad || '—')}${self ? '<span class="chip">Bu</span>' : ''}${min !== null && cmp && l && l.f === min ? '<span class="chip good">En ucuz</span>' : ''}</div>
        <div class="meta">${l ? agoSpan(l.t) : 'Fiyat yok'}</div></div>
        ${l ? `<div class="side"><div class="amt">${moneyHtml(l.f, x.para)}<small>/${esc(x.birim)}</small></div></div>` : ''}`;
      return self ? `<div class="row">${inner}</div>` : `<a class="row" href="#/kumas/${encodeURIComponent(x.id)}">${inner}</a>`;
    }).join('') + '</div>';
  }
  return html;
}

// Step line: a quoted price holds until the next quote; the dashed tail runs to today.
function chart(h) {
  const W = Math.round(Math.min(528, Math.max(250, ($('#view').clientWidth || 360) - 32)));
  const H = 110, T = 10, B = 24, L = 5, R = 5;
  const t0 = parseDay(h[0].t).getTime(), tLast = parseDay(h[h.length - 1].t).getTime();
  const tEnd = Math.max(tLast, parseDay(today()).getTime()), span = tEnd - t0;
  const xAt = (e, i) => L + (span > 0 ? (parseDay(e.t).getTime() - t0) / span : i / (h.length - 1)) * (W - L - R);
  const vals = h.map(e => e.f), vMin = Math.min(...vals), vMax = Math.max(...vals);
  const padV = (vMax - vMin) * 0.2 || Math.max(vMax * 0.05, 0.5);
  const lo = Math.max(0, vMin - padV), hi = vMax + padV;
  const yAt = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const f1 = n => n.toFixed(1), base = H - B;
  const pts = h.map((e, i) => [xAt(e, i), yAt(e.f)]);
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += ` H${f1(pts[i][0])} V${f1(pts[i][1])}`;
  const [lx, ly] = pts[pts.length - 1];
  const xEnd = span > 0 ? W - R : lx;
  const ext = xEnd - lx > 1 ? `<path class="ch-ext" d="M${f1(lx)} ${f1(ly)} H${f1(xEnd)}"/>` : '';
  const dots = pts.map(([x, y], i) => `<circle class="${i === pts.length - 1 ? 'ch-end' : 'ch-dot'}" cx="${f1(x)}" cy="${f1(y)}" r="${i === pts.length - 1 ? 4.5 : 3}"/>`).join('');
  return `<div class="chart${animating ? ' draw' : ''}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fiyat grafiği: en düşük ${nf2.format(vMin)}, en yüksek ${nf2.format(vMax)}">
    <path class="ch-area" d="${d} H${f1(xEnd)} V${base} H${f1(pts[0][0])} Z"/>
    <line class="ch-base" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>
    <path class="ch-line" pathLength="1" d="${d}"/>${ext}${dots}
    <text class="ch-txt" x="${L}" y="${H - 6}">${esc(dfDM.format(parseDay(h[0].t)))}</text>
    <text class="ch-txt" x="${W - R}" y="${H - 6}" text-anchor="end">${tEnd > tLast ? 'bugün' : esc(dfDM.format(parseDay(h[h.length - 1].t)))}</text>
  </svg></div>`;
}


/* ---------- dialogs ---------- */
const sheet = $('#sheet'), sheetForm = $('#sheetForm'), conf = $('#confirm');
let sheetSubmit = null, sheetDanger = null;

function closeDialog(d) {
  if (!d.open || d.classList.contains('closing')) return;
  if (!pref.anim || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { d.close(); return; }
  d.classList.add('closing');
  let done = false;
  const fin = () => {
    if (done) return; done = true;
    d.removeEventListener('animationend', onEnd);
    d.classList.remove('closing'); d.style.transform = ''; d.style.removeProperty('--drag');
    d.close();
  };
  const onEnd = e => { if (e.target === d) fin(); };
  d.addEventListener('animationend', onEnd);
  setTimeout(fin, 340);
}

// drag the sheet down by its handle/header to dismiss
(() => {
  let y0 = null, dy = 0;
  const start = e => { if (e.target.closest('button')) return; y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; };
  const move = e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; };
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    if (dy > 90) { sheet.style.transition = ''; sheet.style.setProperty('--drag', dy + 'px'); closeDialog(sheet); }
    else { sheet.style.transition = 'transform .25s var(--ease)'; sheet.style.transform = ''; }
  };
  for (const el of [sheet.querySelector('.grab'), $('#sheetHead')]) {
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
})();

function fieldHtml(f) {
  if (f.type === 'pair') return `<div class="pair">${f.fields.map(fieldHtml).join('')}</div>`;
  if (f.type === 'more') return `<details class="more"><summary>${ICON.chev}${esc(f.label)}</summary><div class="inner">${f.fields.map(fieldHtml).join('')}</div></details>`;
  const id = 'f-' + f.name, v = f.value ?? '';
  if (f.type === 'opts') return `<fieldset class="fld" data-f="${f.name}"><legend>${esc(f.label)}</legend><div class="opts">`
    + f.options.map(o => `<label><input type="radio" id="${id}-${o.v}" name="${f.name}" value="${esc(o.v)}"${o.v === v ? ' checked' : ''}><span>${esc(o.l)}</span></label>`).join('')
    + '</div></fieldset>';
  const common = `id="${id}" name="${f.name}"${f.autofocus ? ' autofocus' : ''} aria-describedby="${id}-err${f.hint ? ' ' + id + '-hint' : ''}"`;
  let ctl;
  if (f.type === 'textarea') ctl = `<textarea ${common} rows="3" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  else if (f.type === 'select') ctl = `<select ${common}>${f.options.map(o => `<option value="${esc(o.v)}"${o.v === v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  else {
    const type = { amount: 'type="text" inputmode="decimal"', tel: 'type="tel" inputmode="tel"', date: 'type="date"' }[f.type] || 'type="text"';
    const caps = f.type ? '' : ` autocapitalize="${f.caps ? 'characters' : 'sentences'}"`;
    ctl = `<input ${common} ${type} value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"${caps}>`;
  }
  return `<div class="fld" data-f="${f.name}"><label for="${id}">${esc(f.label)}</label>${ctl}`
    + (f.hint ? `<div class="hint" id="${id}-hint">${esc(f.hint)}</div>` : '')
    + `<span class="err" id="${id}-err" hidden></span></div>`;
}

function openSheet({ title, fields, html, submit = 'Kaydet', onSubmit, danger }) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html || fields.map(fieldHtml).join('');
  const sb = $('#sheetSubmit'), dz = $('#sheetDanger');
  sb.textContent = submit; sb.disabled = false; sb.hidden = !onSubmit;
  dz.hidden = !danger; dz.textContent = danger ? danger.label : '';
  sb.parentElement.hidden = !onSubmit && !danger;
  sheetSubmit = onSubmit; sheetDanger = danger ? danger.run : null;
  sheet.classList.remove('closing'); sheet.style.transform = '';
  if (!sheet.open) sheet.showModal();
  haptic('tick');
  const af = sheet.querySelector('[autofocus]');
  if (af) setTimeout(() => af.focus(), 80);
}

sheetForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!sheetSubmit) return;
  const vals = Object.fromEntries(new FormData(sheetForm).entries());
  for (const el of sheetForm.querySelectorAll('.fld')) {
    el.classList.remove('bad');
    const er = el.querySelector('.err'); if (er) { er.hidden = true; er.textContent = ''; }
  }
  const sb = $('#sheetSubmit');
  sb.disabled = true;
  try {
    const errors = await sheetSubmit(vals);
    if (errors && Object.keys(errors).length) {
      haptic('warn');
      let first = null;
      for (const [name, msg] of Object.entries(errors)) {
        const fld = sheetForm.querySelector(`.fld[data-f="${name}"]`), er = fld && fld.querySelector('.err');
        if (!er) { toast(msg, false); continue; }
        fld.classList.add('bad'); er.textContent = msg; er.hidden = false;
        const det = fld.closest('details'); if (det) det.open = true;
        first = first || fld.querySelector('input,select,textarea');
      }
      if (first) first.focus();
      return;
    }
    closeDialog(sheet);
  } catch (err) {
    haptic('warn'); toast(writeErr(err), false);
  } finally { sb.disabled = false; }
});
$('#sheetDanger').addEventListener('click', () => { if (sheetDanger) sheetDanger(); });
sheet.addEventListener('close', () => { sheetSubmit = null; sheetDanger = null; });
for (const d of [sheet, conf]) {
  const dismiss = () => (d === conf ? $('#confirmNo').click() : closeDialog(d));
  d.addEventListener('cancel', e => { e.preventDefault(); dismiss(); });
  d.addEventListener('click', e => { if (e.target === d) dismiss(); });
}

function confirmBox(title, text, ok, danger = true) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  const yes = $('#confirmYes'), no = $('#confirmNo');
  yes.textContent = ok || 'Sil';
  yes.className = 'btn ' + (danger ? 'danger' : 'primary');
  haptic(danger ? 'warn' : 'tick');
  return new Promise(resolve => {
    let settled = false;
    const done = v => {
      if (settled) return; settled = true;
      conf.removeEventListener('close', onClose);
      yes.onclick = no.onclick = null;
      closeDialog(conf);
      resolve(v);
    };
    const onClose = () => done(false);
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    conf.addEventListener('close', onClose);
    conf.classList.remove('closing');
    conf.showModal();
  });
}

/* ---------- forms ---------- */
const stamp = () => new Date().toISOString();
const priceKey = e => e.id || e.t + '|' + e.f;

function cariForm(c) {
  openSheet({
    title: c ? 'Cariyi düzenle' : 'Yeni cari',
    submit: c ? 'Kaydet' : 'Cariyi ekle',
    fields: [
      { name: 'ad', label: 'Firma adı', value: c?.ad, placeholder: 'ör. Yıldız Tekstil', autofocus: !c },
      { name: 'telefon', type: 'tel', label: 'Telefon', value: c?.telefon, placeholder: '05xx xxx xx xx' },
      { type: 'more', label: 'Yetkili ve not', fields: [
        { name: 'yetkili', label: 'Yetkili kişi', value: c?.yetkili, placeholder: 'ör. Murat Bey' },
        { name: 'not', type: 'textarea', label: 'Not', value: c?.not, placeholder: 'Adres, vade, iskonto…' },
      ] },
    ],
    danger: c ? { label: 'Cariyi sil', run: () => deleteCari(c) } : null,
    onSubmit: async v => {
      const ad = (v.ad || '').trim();
      if (!ad) return { ad: 'Firma adını yaz.' };
      if (liveCariler().some(x => x.id !== c?.id && norm(x.ad) === norm(ad))) return { ad: 'Bu isimde bir cari zaten var.' };
      const base = c ? (findCari(c.id) || c) : { id: uid(), olusturma: stamp() };
      const doc = { ...base, ad, yetkili: (v.yetkili || '').trim(), telefon: (v.telefon || '').trim(), not: (v.not || '').trim(), guncelleme: stamp() };
      await put('cariler', doc);
      haptic('ok'); toast(c ? 'Cari güncellendi' : 'Cari eklendi');
      if (!c) location.hash = '#/cari/' + encodeURIComponent(doc.id);
    },
  });
}

// Deleting only marks a record; it waits in Ayarlar › Silinenler and can always be brought back.
async function deleteCari(c) {
  const n = liveKumaslar().filter(k => k.cariId === c.id).length;
  const ok = await confirmBox('Cari silinsin mi?', `${c.ad}${n ? ' ve ' + n + ' kumaşı' : ''} Silinenler’e taşınır. İstediğin zaman Ayarlar › Silinenler’den geri alabilirsin.`, 'Sil');
  if (!ok) return;
  snapshotNow('silme');
  try {
    await put('cariler', { ...(store.cariler.find(x => x.id === c.id) || c), silindi: stamp() });
    closeDialog(sheet); haptic('ok');
    toast('Cari silindi', true, { label: 'Geri al', run: () => undelete('cari', c.id) });
    if (route.name === 'cari' && route.id === c.id) goBack('#/');
  } catch (e) { toast(writeErr(e), false); }
}

function kumasForm(k, cariId) {
  if (!k && !cariId && !liveCariler().length) { toast('Önce bir cari ekle.', false); return cariForm(); }
  const isNew = !k, fields = [];
  if (isNew && !cariId) fields.push({ name: 'cariId', type: 'select', label: 'Cari', value: '',
    options: [{ v: '', l: 'Cari seç…' }, ...liveCariler().sort(byName).map(c => ({ v: c.id, l: c.ad }))] });
  fields.push({ name: 'ad', label: 'Kumaş adı', value: k?.ad, placeholder: 'ör. Süprem 30/1', autofocus: isNew && !!cariId });
  if (isNew) fields.push({ name: 'fiyat', type: 'amount', label: 'Fiyat', placeholder: '0,00' });
  fields.push({ name: 'birim', type: 'opts', label: 'Birim', value: k?.birim || pref.birim, options: UNIT_OPTS });
  fields.push({ name: 'para', type: 'opts', label: 'Para birimi', value: k?.para || pref.para, options: CUR_OPTS });
  fields.push({ type: 'more', label: isNew ? 'Kod, tarih ve not' : 'Kod ve not', fields: [
    { name: 'kod', label: 'Kod / artikel', value: k?.kod, placeholder: 'ör. SP-301', caps: true },
    ...(isNew ? [{ name: 'tarih', type: 'date', label: 'Fiyat tarihi', value: today() }] : []),
    { name: 'not', type: 'textarea', label: 'Not', value: k?.not, placeholder: 'Gramaj, en, renk, minimum sipariş…' },
  ] });
  openSheet({
    title: isNew ? 'Yeni kumaş' : 'Kumaşı düzenle',
    submit: isNew ? 'Kumaşı ekle' : 'Kaydet',
    fields,
    danger: k ? { label: 'Kumaşı sil', run: () => deleteKumas(k) } : null,
    onSubmit: async v => {
      const errs = {}, cid = k?.cariId || cariId || v.cariId, ad = (v.ad || '').trim(), kod = (v.kod || '').trim();
      if (!cid || !findCari(cid)) errs.cariId = 'Kumaşın hangi cariye ait olduğunu seç.';
      if (!ad) errs.ad = 'Kumaş adını yaz.';
      else if (liveKumaslar().some(x => x.id !== k?.id && x.cariId === cid && norm(x.ad) === norm(ad) && norm(x.kod) === norm(kod)))
        errs.ad = 'Bu caride bu kumaş zaten kayıtlı. Yeni fiyatı o kumaşın sayfasından ekle.';
      let f;
      if (isNew) {
        f = parseAmount(v.fiyat);
        if (!(f > 0)) errs.fiyat = 'Geçerli bir fiyat yaz (ör. 125,50).';
        if (!validDay(v.tarih)) errs.tarih = 'Tarih seç.';
      }
      if (Object.keys(errs).length) return errs;
      const base = { ad, kod, para: v.para, birim: v.birim, not: (v.not || '').trim(), guncelleme: stamp() };
      const doc = isNew
        ? { id: uid(), cariId: cid, ...base, fiyatlar: [{ id: uid(), f, t: v.tarih, n: '' }], olusturma: base.guncelleme }
        : { ...(findKumas(k.id) || k), ...base };
      await put('kumaslar', doc);
      haptic('ok'); toast(isNew ? 'Kumaş eklendi' : 'Kumaş güncellendi');
    },
  });
}

async function deleteKumas(k) {
  const ok = await confirmBox('Kumaş silinsin mi?', `${k.ad} fiyat geçmişiyle birlikte Silinenler’e taşınır. İstediğin zaman geri alabilirsin.`, 'Sil');
  if (!ok) return;
  snapshotNow('silme');
  try {
    await put('kumaslar', { ...(store.kumaslar.find(x => x.id === k.id) || k), silindi: stamp() });
    closeDialog(sheet); haptic('ok');
    toast('Kumaş silindi', true, { label: 'Geri al', run: () => undelete('kumas', k.id) });
    if (route.name === 'kumas' && route.id === k.id) goBack('#/cari/' + encodeURIComponent(k.cariId));
  } catch (e) { toast(writeErr(e), false); }
}

function fiyatForm(k) {
  const c = lastOf(k);
  openSheet({
    title: 'Yeni fiyat · ' + k.ad,
    submit: 'Fiyatı kaydet',
    fields: [
      { name: 'fiyat', type: 'amount', label: `Yeni fiyat (${CUR[k.para] || '₺'} / ${k.birim})`, placeholder: c ? nf2.format(c.f) : '0,00', autofocus: true,
        hint: c ? `Şu anki fiyat: ${money(c.f, k.para)}` : '' },
      { type: 'more', label: 'Tarih ve not', fields: [
        { name: 'tarih', type: 'date', label: 'Fiyat tarihi', value: today() },
        { name: 'not', label: 'Not', placeholder: 'ör. peşin fiyat, 500 kg üzeri' },
      ] },
    ],
    onSubmit: async v => {
      const f = parseAmount(v.fiyat), errs = {};
      if (!(f > 0)) errs.fiyat = 'Geçerli bir fiyat yaz (ör. 125,50).';
      if (!validDay(v.tarih)) errs.tarih = 'Tarih seç.';
      if (Object.keys(errs).length) return errs;
      const now = findKumas(k.id) || k, entry = { id: uid(), f, t: v.tarih, n: (v.not || '').trim() };
      const doc = { ...now, fiyatlar: [...(now.fiyatlar || []), entry], guncelleme: stamp() };
      animNext = 'tab';
      await put('kumaslar', doc);
      const h = hist(doc), p = h[h.findIndex(e => e.id === entry.id) - 1];
      haptic('ok');
      toast(p && p.f ? `Fiyat kaydedildi (${f > p.f ? '▲' : f < p.f ? '▼' : '='} %${nf1.format(Math.abs((f - p.f) / p.f * 100))})` : 'Fiyat kaydedildi');
    },
  });
}

async function deletePrice(k, key) {
  const e = (k.fiyatlar || []).find(x => priceKey(x) === key);
  if (!e) return;
  const ok = await confirmBox('Fiyat silinsin mi?', `${dfLong.format(parseDay(e.t))} tarihli ${money(e.f, k.para)} fiyatı Silinenler’e taşınır. İstediğin zaman geri alabilirsin.`, 'Sil');
  if (!ok) return;
  const now = findKumas(k.id) || k;
  try {
    await put('kumaslar', { ...now, fiyatlar: (now.fiyatlar || []).map(x => (priceKey(x) === key ? { ...x, silindi: stamp() } : x)), guncelleme: stamp() });
    haptic('ok');
    toast('Fiyat silindi', true, { label: 'Geri al', run: () => undelete('fiyat', k.id, key) });
  } catch (err) { toast(writeErr(err), false); }
}

async function clearExamples() {
  const ok = await confirmBox('Örnek kayıtlar silinsin mi?', 'Yalnızca “Örnek” işaretli cariler ve kumaşlar silinir. Senin eklediklerin kalır.', 'Örnekleri sil');
  if (!ok) return;
  snapshotNow('ornek');
  const changes = store.kumaslar.filter(x => x.ornek).map(k => ({ op: 'del', col: 'kumaslar', id: k.id }));
  for (const c of store.cariler.filter(x => x.ornek)) {
    // an example supplier the user already added own fabrics to is kept as a real one
    if (store.kumaslar.some(k => k.cariId === c.id && !k.ornek)) changes.push({ op: 'put', col: 'cariler', doc: { ...c, ornek: false } });
    else changes.push({ op: 'del', col: 'cariler', id: c.id });
  }
  try { await commit(changes); haptic('ok'); toast('Örnekler silindi'); } catch (e) { toast(writeErr(e), false); }
}

/* ---------- events ---------- */
function appBack() {
  if (conf.open) { $('#confirmNo').click(); return true; }
  if (sheet.open) { closeDialog(sheet); return true; }
  if (route.name === 'cariler') return false;
  const k = route.name === 'kumas' ? findKumas(route.id) : null;
  goBack(route.name === 'kumas' ? (k ? '#/cari/' + encodeURIComponent(k.cariId) : '#/kumaslar')
    : route.name === 'grup' ? '#/kumaslar' : '#/');
  return true;
}
window.appBack = appBack;   // Android back button asks the page first

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, r = route;
  switch (act) {
    case 'close-sheet': return closeDialog(sheet);
    case 'back': return appBack();
    case 'edit': {
      if (r.name === 'cari') { const c = findCari(r.id); if (c) cariForm(c); }
      if (r.name === 'kumas') { const k = findKumas(r.id); if (k) kumasForm(k); }
      return;
    }
    case 'add': {
      if (!store.ready) return;
      if (r.name === 'cariler') return cariForm();
      if (r.name === 'kumaslar') return kumasForm(null, null);
      if (r.name === 'cari') return kumasForm(null, r.id);
      const k = findKumas(r.id); if (k) fiyatForm(k);
      return;
    }
    case 'sort': {
      const ks = Object.keys(SORTS);
      pref.sort = ks[(ks.indexOf(pref.sort) + 1) % ks.length]; savePref(); haptic('tick');
      return renderView();
    }
    case 'cari-sort': {
      const ks = Object.keys(CARI_SORTS);
      pref.cariSort = ks[(ks.indexOf(pref.cariSort) + 1) % ks.length]; savePref(); haptic('tick');
      return renderView();
    }
    case 'snaps': return openSnaps();
    case 'trash': return openTrash();
    case 'rem': {
      const w = b.dataset.w, el = $('#rem-' + w + '-t'), t = el ? el.value : '';
      try { NB.setReminder(w, b.checked, t); } catch { /* older build */ }
      haptic('tick');
      if (b.checked) {
        if (nativeRems().notif === false) NB.askNotif();
        toast(`${REMS[w].t} kuruldu: her gün ${t}`);
      } else toast(REMS[w].t + ' kapatıldı', false);
      return;
    }
    case 'notif-izin': return NB.askNotif();
    case 'rem-test': { try { NB.testNotif(); toast('Deneme bildirimi gönderildi'); } catch { toast('Gönderilemedi.', false); } return; }
    case 'transfer': return sendToNewPhone();
    case 'undel': return undelete(b.dataset.kind, b.dataset.id, b.dataset.pid);
    case 'del-price': { const k = findKumas(r.id); if (k) deletePrice(k, b.dataset.id); return; }
    case 'clear-examples': return clearExamples();
    case 'export': return exportCsv();
    case 'bk-save': return saveBackup();
    case 'bk-share': return shareBackup();
    case 'bk-restore': return pickBackup().then(raw => raw && restoreFrom(raw));
    case 'bk-snap': return restoreFrom(NB.readBackup(b.dataset.name), whenMs(Number(b.dataset.time))).then(ok => { if (ok) closeDialog(sheet); });
    case 'theme': segPick(b); pref.theme = b.dataset.v; savePref(); return applyTheme();
    case 'anim': pref.anim = b.checked; savePref(); applyTheme(); return haptic('tick');
  }
});

$('#q').addEventListener('input', e => {
  nav.q[qKey()] = e.target.value;
  $('#qClear').hidden = !e.target.value;
  if (window.scrollY) window.scrollTo(0, 0);
  renderView();
});
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
// reminder time pickers
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act="rem-time"]');
  if (!el || !NB) return;
  const w = el.dataset.w, box = $('#rem-' + w);
  try { NB.setReminder(w, !!(box && box.checked), el.value); } catch { /* older build */ }
  haptic('tick');
  if (box && box.checked) toast(`${REMS[w].t} saati: ${el.value}`);
});
$('#qClear').addEventListener('click', () => {
  const q = $('#q');
  q.value = ''; nav.q[qKey()] = ''; $('#qClear').hidden = true;
  renderView(); q.focus();
});
for (const t of TABS) $('#tab-' + t).addEventListener('click', e => {
  haptic('tick');
  if (route.name === t) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});

let lastY = window.scrollY, ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY, fab = $('#fab');
    $('#top').classList.toggle('scrolled', y > 8);
    if (y > lastY + 6 && y > 140) fab.classList.add('mini');
    else if (y < lastY - 6) fab.classList.remove('mini');
    lastY = y; ticking = false;
  });
}, { passive: true });
// relative dates ("bugün", "dün") stay right when the app comes back the next day
document.addEventListener('visibilitychange', () => { if (!document.hidden && store.ready) refresh(); });

/* ---------- start ---------- */
function runSplash() {
  const sp = $('#splash');
  if (!sp) return;
  if (!pref.anim || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { sp.remove(); return; }
  if (NB && NB.setBars) { try { NB.setBars('#24337F', '#24337F', true); } catch { /* old bridge */ } }
  const done = () => {
    if (!sp.isConnected) return;
    sp.remove(); syncBars();
    const v = $('#view');
    v.classList.remove('a-fwd', 'a-back', 'a-tab'); void v.offsetWidth; v.classList.add('a-tab');
  };
  sp.addEventListener('animationend', e => { if (e.animationName === 'spOut') done(); });
  setTimeout(done, 1800);
}

applyTheme();
runSplash();
mount();
initStore();
if (!NB) Promise.resolve(window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads') : null)
  .catch(() => null)
  .then(dl => { store.dl = dl || null; if (route.name === 'ayarlar') renderView(); });
})();

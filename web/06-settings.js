
/* ---------- settings, deleted items, backups ---------- */
const TAGS = { oto: 'Otomatik', silme: 'Silmeden önce', geri: 'Yedek yüklemeden önce', ornek: 'Örnekler silinmeden önce' };
const nativeInfo = () => { try { return JSON.parse(NB.info() || '{}'); } catch { return {}; } };
const unmark = o => { const { silindi, ...rest } = o; return rest; };

function segc(act, value, opts) {
  const k = Math.max(0, opts.findIndex(o => o.v === value));
  return `<div class="segc" role="group" style="--n:${opts.length};--k:${k}"><span class="thumb"></span>${opts.map(o =>
    `<button type="button" data-act="${act}" data-v="${o.v}" aria-pressed="${o.v === value}">${esc(o.l)}</button>`).join('')}</div>`;
}
// slide the segmented thumb in place instead of re-rendering
function segPick(btn) {
  const seg = btn.parentElement, bs = [...seg.querySelectorAll('button')];
  seg.style.setProperty('--k', bs.indexOf(btn));
  bs.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  haptic('tick');
}

function viewAyarlar() {
  const hasEx = store.cariler.some(c => c.ornek) || store.kumaslar.some(k => k.ornek);
  const nTrash = trashItems().length;
  let html = '<div class="sec" style="margin-top:4px"><h2>Yedekleme</h2></div>', transfer = '';
  if (store.mode === 'native') {
    const inf = nativeInfo(), snaps = nativeBackups();
    html += `<section class="card">
      <div class="status"><span class="ok">${ICON.shield}</span>
        <div><div class="name">Otomatik yedek açık</div><div class="meta">Son yedek: ${esc(whenMs((snaps[0] && snaps[0].time) || inf.dataTime))}</div></div></div>
      <div class="btn-row">
        <button class="btn primary${inf.canShare ? '' : ' wide'}" type="button" data-act="bk-save">Yedeği kaydet</button>
        ${inf.canShare ? '<button class="btn" type="button" data-act="bk-share">Gönder</button>' : ''}
        <button class="btn wide" type="button" data-act="bk-restore">Yedekten yükle</button>
      </div>
    </section>
    <p class="note-sm">Her değişiklik anında telefona kaydedilir ve yedekler hiç silinmez.${inf.mirrorPath ? ` Ayrıca ${esc(inf.mirrorPath)} klasöründe güncel yedek ve her ayın arşivi durur; uygulama silinse bile kalır.` : ''}</p>`;
    if (inf.canShare) transfer = `<div class="sec"><h2>Telefon değiştirme</h2></div><section class="card">
      <div class="meta" style="margin:0">Uygulamayı ve bütün kayıtlarını yeni telefona tek seferde gönder.</div>
      <div class="btn-row"><button class="btn primary wide" type="button" data-act="transfer">Yeni telefona gönder</button></div>
      <p class="note-sm" style="margin:12px 0 0">Yeni telefonda önce gelen <b>Satış.apk</b>’yı kur, sonra <b>satis-tasima</b> dosyasına dokunup “Satış ile aç” de. Bütün kayıtlar anında gelir.</p>
    </section>`;
  } else {
    html += `<section class="card">
      <div class="meta" style="margin:0">${store.mode === 'db' ? 'Kayıtlar Claude hesabında saklanıyor.' : 'Kayıtlar yalnızca bu tarayıcıda saklanıyor.'}</div>
      <div class="btn-row">
        ${store.dl ? '<button class="btn primary" type="button" data-act="bk-save">Yedeği indir</button>' : ''}
        <button class="btn${store.dl ? '' : ' wide'}" type="button" data-act="bk-restore">Yedekten yükle</button>
      </div></section>`;
  }
  const snapsN = store.mode === 'native' ? nativeBackups().length : 0;
  html += `<div class="group" style="margin-top:12px">
    <button class="set" type="button" data-act="trash"><div class="tx"><div class="t">Silinenler</div>
      <div class="d">${nTrash ? nTrash + ' kayıt · geri alabilirsin' : 'Silinen kayıtlar burada durur'}</div></div>${ICON.chev}</button>
    ${snapsN ? `<button class="set" type="button" data-act="snaps"><div class="tx"><div class="t">Otomatik yedekler</div>
      <div class="d">${snapsN} yedek</div></div>${ICON.chev}</button>` : ''}
  </div>`;
  html += transfer + remindersCard() + `<div class="sec"><h2>Görünüm</h2></div><div class="group">
      <div class="set col"><div class="t">Tema</div>${segc('theme', pref.theme, [{ v: 'system', l: 'Telefona göre' }, { v: 'light', l: 'Açık' }, { v: 'dark', l: 'Koyu' }])}</div>
      <label class="set" for="set-anim"><div class="tx"><div class="t">Animasyonlar</div></div>
        <span class="tg"><input type="checkbox" id="set-anim" data-act="anim"${pref.anim ? ' checked' : ''}><span></span></span></label>
    </div>`;
  const rows = [];
  if (liveKumaslar().length && (NB || store.dl)) rows.push(`<button class="set" type="button" data-act="export"><div class="tx"><div class="t">Excel’e aktar</div><div class="d">Bütün kumaşlar ve güncel fiyatlar</div></div>${ICON.chev}</button>`);
  if (hasEx) rows.push(`<button class="set" type="button" data-act="clear-examples"><div class="tx"><div class="t">Örnek kayıtları sil</div></div>${ICON.chev}</button>`);
  if (rows.length) html += `<div class="sec"><h2>Veri</h2></div><div class="group">${rows.join('')}</div>`;
  const nP = liveKumaslar().reduce((s, k) => s + hist(k).length, 0);
  return html + `<p class="about">${nf0.format(liveCariler().length)} cari · ${nf0.format(liveKumaslar().length)} kumaş · ${nf0.format(nP)} fiyat<br>Satış ${esc(NB ? (nativeInfo().version || '') : 'web')}</p>`;
}

/* ---------- daily price reminders (phone notifications) ---------- */
const REMS = {
  sabah: { t: 'Sabah hatırlatması', d: 'Patron, yeni fiyatlar hazır mı?' },
  aksam: { t: 'Akşam hatırlatması', d: 'Patron, kapanış saatin geldi' },
};
const nativeRems = () => { try { return JSON.parse(NB.reminders() || '{}'); } catch { return {}; } };

function remindersCard() {
  if (store.mode !== 'native' || !NB.reminders) return '';
  const r = nativeRems();
  const row = w => {
    const s = r[w] || {};
    return `<div class="set"><div class="tx"><div class="t">${REMS[w].t}</div><div class="d">${esc(REMS[w].d)}</div></div>
      <input class="time" type="time" id="rem-${w}-t" data-act="rem-time" data-w="${w}" value="${esc(s.time || '')}" aria-label="${REMS[w].t} saati">
      <span class="tg"><input type="checkbox" id="rem-${w}" data-act="rem" data-w="${w}"${s.on ? ' checked' : ''} aria-label="${REMS[w].t}"><span></span></span></div>`;
  };
  return `<div class="sec"><h2>Hatırlatma</h2></div><div class="group">${row('sabah')}${row('aksam')}</div>`
    + (r.notif === false
      ? `<p class="note-sm">Bildirimler telefonda kapalı. <button class="link" type="button" data-act="notif-izin">Bildirimlere izin ver</button></p>`
      : `<p class="note-sm">Bildirimler uygulama kapalıyken de gelir. <button class="link" type="button" data-act="rem-test">Deneme bildirimi gönder</button><br>Xiaomi’de gelmezse Ayarlar › Uygulamalar › Satış › Otomatik başlatma’yı aç.</p>`);
}

/* ---------- Silinenler: deleted suppliers, fabrics and prices, all restorable ---------- */
function trashItems() {
  const items = [], cm = new Map(store.cariler.map(c => [c.id, c]));
  for (const c of store.cariler) if (c.silindi) items.push({ kind: 'cari', id: c.id, t: c.silindi, title: c.ad,
    sub: 'Cari · ' + store.kumaslar.filter(k => k.cariId === c.id && !k.silindi).length + ' kumaşıyla' });
  for (const k of store.kumaslar) {
    if (k.silindi) items.push({ kind: 'kumas', id: k.id, t: k.silindi, title: k.ad, sub: 'Kumaş · ' + (cm.get(k.cariId)?.ad || '') });
    for (const e of (k.fiyatlar || [])) if (e && e.silindi) items.push({ kind: 'fiyat', id: k.id, pid: priceKey(e), t: e.silindi,
      title: money(e.f, k.para) + ' / ' + k.birim, sub: 'Fiyat · ' + k.ad + ' · ' + dfShort.format(parseDay(e.t)) });
  }
  return items.sort((a, b) => String(b.t).localeCompare(String(a.t)));
}

function openTrash() {
  const items = trashItems();
  openSheet({
    title: 'Silinenler',
    html: items.length
      ? '<p class="meta" style="margin:0">Silinen hiçbir şey kaybolmaz. Geri almak istediğine dokun.</p><div class="list">'
        + items.map(i => `<div class="row"><div class="main"><div class="name">${esc(i.title)}</div>
          <div class="meta">${esc(i.sub)} · ${esc(whenMs(Date.parse(i.t)))}</div></div>
          <button class="btn sm" type="button" data-act="undel" data-kind="${i.kind}" data-id="${esc(i.id)}" data-pid="${esc(i.pid || '')}">Geri al</button></div>`).join('')
        + '</div>'
      : '<div class="empty" style="padding:20px 0 8px"><h3>Silinen kayıt yok</h3><p>Sildiğin cari, kumaş ve fiyatlar burada durur; istediğin zaman geri alırsın.</p></div>',
  });
}

async function undelete(kind, id, pid) {
  const k = store.kumaslar.find(x => x.id === id), changes = [];
  const reviveCari = cid => { const c = store.cariler.find(x => x.id === cid); if (c && c.silindi) changes.push({ op: 'put', col: 'cariler', doc: unmark(c) }); };
  if (kind === 'cari') reviveCari(id);
  else if (k) {
    let doc = k.silindi || kind === 'kumas' ? unmark(k) : { ...k };
    if (kind === 'fiyat') doc = { ...doc, fiyatlar: (k.fiyatlar || []).map(e => (priceKey(e) === pid ? unmark(e) : e)) };
    changes.push({ op: 'put', col: 'kumaslar', doc });
    reviveCari(k.cariId);   // bring the supplier back too so the record is visible again
  }
  if (!changes.length) return;
  try {
    await commit(changes);
    haptic('ok'); toast('Geri alındı');
    if (sheet.open && $('#sheetTitle').textContent === 'Silinenler') openTrash();
  } catch (e) { toast(writeErr(e), false); }
}

function openSnaps() {
  const snaps = nativeBackups(), shown = snaps.slice(0, 80);
  openSheet({
    title: 'Otomatik yedekler',
    html: '<p class="meta" style="margin:0">Yedekten yükleme sadece eksik kayıtları ekler; mevcut hiçbir şey silinmez.</p><div class="list">'
      + shown.map(b => `<div class="row"><div class="main"><div class="name">${esc(whenMs(b.time))}</div>
        <div class="meta">${b.cariler ?? '?'} cari · ${b.kumaslar ?? '?'} kumaş · ${esc(TAGS[b.tag] || 'Otomatik')}</div></div>
        <button class="btn sm" type="button" data-act="bk-snap" data-name="${esc(b.name)}" data-time="${b.time}">Yükle</button></div>`).join('')
      + '</div>' + (snaps.length > shown.length ? `<p class="meta" style="margin:0">Daha eski ${snaps.length - shown.length} yedek de telefonda saklanıyor.</p>` : ''),
  });
}

/* native activity results (save dialog / file picker) arrive here */
const nativeWait = {};
window.onNative = (kind, status, payload) => {
  if (kind === 'perm') {
    toast(status === 'ok' ? 'Bildirimlere izin verildi' : 'Bildirim izni verilmedi.', status === 'ok');
    if (route.name === 'ayarlar') renderView();
    return;
  }
  if (kind === 'import') {   // a backup opened from WhatsApp, Files or Quick Share with "Satış ile aç"
    if (status === 'ok') restoreFrom(payload).then(ok => { if (ok && route.name !== 'cariler') location.hash = '#/'; });
    else toast('Dosya okunamadı.', false);
    return;
  }
  const f = nativeWait[kind]; delete nativeWait[kind]; if (f) f({ status, payload });
};
const waitNative = kind => new Promise(r => { nativeWait[kind] = r; });

async function saveFileOut(body, name, mime, okMsg) {
  if (NB) {
    const p = waitNative('save');
    NB.saveFile(body, name, mime);
    const r = await p;
    if (r.status === 'ok') { haptic('ok'); toast(okMsg); }
    else if (r.status !== 'cancel') toast('Dosya kaydedilemedi.', false);
    return;
  }
  if (!store.dl) return;
  try { await store.dl.save({ filename: name, data: body }); toast(okMsg); }
  catch (e) { if (!e || e.code !== 'declined') toast(e && e.code === 'rate_limited' ? 'Birkaç saniye sonra tekrar dene.' : 'Dosya kaydedilemedi.', false); }
}
const saveBackup = () => saveFileOut(serialize(), `satis-yedek-${today()}.json`, 'application/json', 'Yedek kaydedildi');

// sends the app itself and all records in one share (Quick Share, Bluetooth, WhatsApp…)
function sendToNewPhone() {
  let ok = false;
  try { ok = NB && NB.shareTransfer && NB.shareTransfer(serialize(), `satis-tasima-${today()}.json`); } catch { ok = false; }
  if (!ok) toast('Gönderilemedi. “Yedeği kaydet”i dene.', false);
}

function shareBackup() {
  let ok = false;
  try { ok = NB && NB.share(serialize(), `satis-yedek-${today()}.json`); } catch { ok = false; }
  if (!ok) toast('Gönderilemedi. “Yedeği kaydet”i dene.', false);
}

async function pickBackup() {
  if (NB) {
    const p = waitNative('open');
    NB.openFile();
    const r = await p;
    if (r.status === 'ok') return r.payload;
    if (r.status !== 'cancel') toast('Dosya okunamadı.', false);
    return null;
  }
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return resolve(null); f.text().then(resolve, () => resolve(null)); };
    inp.click();
  });
}

// Loading a backup only ADDS what is missing: current suppliers, fabrics and prices are never removed or overwritten.
async function restoreFrom(raw, label) {
  const d = parseData(raw);
  if (!d) { haptic('warn'); toast('Bu dosya bir Satış yedeği değil.', false); return false; }
  const curC = new Set(store.cariler.map(c => c.id)), curK = new Map(store.kumaslar.map(k => [k.id, k]));
  const changes = [];
  let nC = 0, nK = 0, nP = 0;
  for (const c of d.cariler) if (c && c.id && !curC.has(c.id)) { changes.push({ op: 'put', col: 'cariler', doc: c }); nC++; }
  for (const k of d.kumaslar) {
    if (!k || !k.id) continue;
    const cur = curK.get(k.id);
    if (!cur) { changes.push({ op: 'put', col: 'kumaslar', doc: k }); nK++; nP += (k.fiyatlar || []).filter(e => e && !e.silindi).length; continue; }
    const have = new Set((cur.fiyatlar || []).map(priceKey));
    const extra = (k.fiyatlar || []).filter(e => e && !have.has(priceKey(e)));
    if (extra.length) { changes.push({ op: 'put', col: 'kumaslar', doc: { ...cur, fiyatlar: [...(cur.fiyatlar || []), ...extra] } }); nP += extra.length; }
  }
  if (!changes.length) { toast('Bu yedekteki her şey zaten uygulamada var.'); return true; }
  const when = label || (d.savedAt ? whenMs(Date.parse(d.savedAt)) : '');
  const parts = [nC && nC + ' cari', nK && nK + ' kumaş', nP && nP + ' fiyat'].filter(Boolean).join(', ');
  const fresh = !liveCariler().length;   // e.g. the first start on a new phone
  const ok = await confirmBox(fresh ? 'Veriler aktarılsın mı?' : 'Eksik kayıtlar eklensin mi?',
    `${when ? when + ' tarihli dosyadan' : 'Dosyadan'} ${parts} ${fresh ? 'aktarılacak.' : 'eklenecek. Şu anki kayıtlarına dokunulmaz.'}`,
    fresh ? 'Aktar' : 'Ekle', false);
  if (!ok) return false;
  snapshotNow('geri');
  try { await commit(changes); haptic('ok'); toast((fresh ? 'Aktarıldı: ' : 'Eklendi: ') + parts); return true; }
  catch (e) { toast(writeErr(e), false); return false; }
}

/* ---------- Excel (CSV) export ---------- */
function exportCsv() {
  const cm = cariMap();
  const trDate = s => (s ? s.split('-').reverse().join('.') : '');
  const head = ['Cari', 'Yetkili', 'Telefon', 'Kumaş', 'Kod', 'Birim', 'Para birimi', 'Güncel fiyat', 'Fiyat tarihi', 'Önceki fiyat', 'Değişim %', 'Not'];
  const rows = liveKumaslar().map(k => ({ k, c: cm.get(k.cariId) }))
    .sort((a, b) => String(a.c?.ad || '').localeCompare(String(b.c?.ad || ''), 'tr') || byName(a.k, b.k))
    .map(({ k, c }) => {
      const h = hist(k), l = h[h.length - 1], p = h[h.length - 2];
      return [c?.ad || '', c?.yetkili || '', c?.telefon || '', k.ad, k.kod || '', k.birim, k.para,
        l ? nfCsv.format(l.f) : '', l ? trDate(l.t) : '', p ? nfCsv.format(p.f) : '',
        l && p && p.f ? nf1.format((l.f - p.f) / p.f * 100) : '', k.not || ''];
    });
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s;
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
  return saveFileOut(csv, `satis-fiyat-listesi-${today()}.csv`, 'text/csv', 'Fiyat listesi kaydedildi');
}

// 相册, like a phone's own: 图库 (every photo, by the day) and 相簿 (收藏, the ones one makes, where photos came from). A
// finger held and moved picks photos (ui/photo-select.js). A 相簿 only lists photos (core/albums.js): taking one out
// leaves it in 图库, and a whole 相簿 goes to the phone in one go (导出).
import {createView, esc, btn, heading, empty, size, field, input, groupTitle, menu, pictureCopies} from './common.js';
import {icon} from './icons.js';
import {openAlbum} from './album-viewer.js';
import {thumbBlob} from './thumbs.js';
import {nudge} from './carry.js';
import {canCopyPicture, copyPicture} from './draw-images.js';
import {slideSelect} from './photo-select.js';
import {saveFile, shareFile, shareFiles, canShareFiles, zipFiles, plainImage} from '../download.js';
import {FAVORITES, byNewest, photoDays, photoSources, albumsInOrder} from '../core/albums.js';

const IMPORT_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif';
// A phone holds a whole zip in memory while making it; a share sheet takes a few files at a time.
const ZIP_MOST = 150 * 1024 * 1024, SHARE_FILES = 30, SHARE_BYTES = 100 * 1024 * 1024;
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
/** Rows in batches: none over `bytes`, none with more than `files`. */
function batches(rows, bytes, files = Infinity) {
  const out = [];
  for (const row of rows) { const last = out.at(-1); if (last && last.bytes + (row.size || 0) <= bytes && last.rows.length < files) { last.rows.push(row); last.bytes += row.size || 0; } else out.push({rows: [row], bytes: row.size || 0}); }
  return out.map(x => x.rows);
}

export function galleryApp(ctx) {
  const {api, win} = ctx, v = createView(ctx, 'gallery'), urls = new Map();
  // tab: 图库 or 相簿; place: inside a 相簿 ({kind: 'album', id}) or a source ({kind: 'source', key}); selecting: the photos
  // ticked (null when not choosing); shown: the ids in the grid, in order; viewer: the photo open full screen.
  let epoch = 0, tab = 'all', place = null, selecting = null, shown = [], viewer = null, rows = [], albums = [], hearts = new Set(), gestureAt = 0;
  const urlFor = (id, blob) => { if (!urls.has(id)) urls.set(id, win.URL.createObjectURL(blob)); return urls.get(id); };
  const importButton = `<label class="chip-button file-button">${icon('import')}导入<input type="file" data-photo-files multiple accept="${IMPORT_TYPES}" aria-label="导入照片"></label>`;
  const photoFile = async id => { const photo = await api.getPhoto(id); if (!photo) throw Error('这张照片已经不在了'); return {source: photo.blob, name: photo.name}; };

  // ---------- what there is ----------
  async function read() {
    const [photos, lists] = await Promise.all([api.listPhotos(), api.listAlbums()]);
    rows = byNewest(photos);
    const known = new Set(rows.map(r => r.id));
    albums = albumsInOrder(lists, known);
    hearts = new Set(albums.find(a => a.id === FAVORITES)?.photos || []);
    for (const [id, url] of urls) if (!known.has(id)) { win.URL.revokeObjectURL(url); urls.delete(id); }
    if (selecting) selecting = new Set([...selecting].filter(id => known.has(id)));
  }
  const albumNow = () => place?.kind === 'album' ? albums.find(a => a.id === place.id) || (place.id === FAVORITES ? {id: FAVORITES, name: '收藏', photos: []} : null) : null;
  const sourceNow = () => place?.kind === 'source' ? photoSources(rows).find(s => s.key === place.key) || null : null;
  /** The photos this page shows. */
  function here() {
    if (!place) return rows;
    if (place.kind === 'source') return sourceNow()?.rows || [];
    const by = new Map(rows.map(r => [r.id, r]));
    return (albumNow()?.photos || []).map(id => by.get(id)).filter(Boolean);
  }

  // ---------- the pages ----------
  const tile = r => `<button type="button" data-action="photo" data-id="${esc(r.id)}" aria-label="${selecting ? '选择' : '查看'} ${esc(r.name)}"${selecting ? ` aria-pressed="${selecting.has(r.id)}"` : ''}${hearts.has(r.id) ? ' data-fav' : ''}><img loading="lazy" decoding="async" draggable="false" data-photo="${esc(r.id)}" alt="${esc(r.name)}"${urls.has(r.id) ? ` src="${esc(urls.get(r.id))}"` : ''}></button>`;
  const grid = (list, days = true) => (days ? photoDays(list) : [{label: '', rows: list}]).map(({label, rows: part}) => `${label ? `<h3 class="photo-day">${esc(label)}</h3>` : ''}<div class="photo-grid${selecting ? ' selecting' : ''}">${part.map(tile).join('')}</div>`).join('');
  const tabs = () => place ? '' : `<div class="segmented album-tabs" role="group" aria-label="图库和相簿"${selecting ? ' hidden' : ''}>${[['all', '图库'], ['albums', '相簿']].map(([key, label]) => `<button type="button" data-action="album-tab" data-tab="${key}" aria-pressed="${tab === key}">${label}</button>`).join('')}</div>`;
  const toolsHTML = () => selecting ? btn('select-cancel', '取消', 'chip-button')
    : (here().length ? btn('select', icon('check') + '选择', 'chip-button') : '') + (place?.kind === 'album' ? btn('album-menu', icon('more'), 'chip-button', 'aria-label="更多"') : !place ? importButton : '');
  const cover = (id, extra = '') => `<span class="album-cover${extra}">${id ? `<img loading="lazy" decoding="async" draggable="false" data-photo="${esc(id)}" alt=""${urls.has(id) ? ` src="${esc(urls.get(id))}"` : ''}>` : icon('image')}</span>`;
  function albumsPage() {
    const favs = albums.find(a => a.id === FAVORITES) || {id: FAVORITES, name: '收藏', photos: []}, mine = albums.filter(a => a.id !== FAVORITES), sources = photoSources(rows);
    const card = a => `<button type="button" class="album-card" data-action="open-album" data-album-id="${esc(a.id)}"${a.id === FAVORITES ? '' : ' data-sort'}>${cover(a.photos[0], a.id === FAVORITES ? ' favs' : '')}<strong>${esc(a.name)}</strong><small>${a.photos.length} 张</small></button>`;
    return heading('相簿', btn('album-new', icon('add') + '新建', 'chip-button'), 'Albums')
      + `<div class="album-cards" data-album-cards>${[favs, ...mine].map(card).join('')}<button type="button" class="album-card album-card-new" data-action="album-new"><span class="album-cover">${icon('add')}</span><strong>新建相簿</strong></button></div>`
      + (sources.length ? groupTitle('来源') + `<div class="group album-sources">${sources.map(s => `<button type="button" class="list-row" data-action="open-source" data-key="${esc(s.key)}">${cover(s.rows[0].id, ' mini')}<span><strong>${esc(s.label)}</strong><small>${s.rows.length} 张</small></span>${icon('next')}</button>`).join('')}</div>` : '')
      + tabs();
  }
  function placePage() {
    const list = here(), album = albumNow(), favs = album?.id === FAVORITES, name = album?.name || sourceNow()?.label || '相册', bytes = list.reduce((n, r) => n + (r.size || 0), 0);
    return heading(name, `<span class="gallery-tools">${toolsHTML()}</span>`, `Album · ${list.length}`)
      + (list.length ? `<div class="album-summary"><small>${list.length} 张 · ${size(bytes)}</small>${btn('album-export', icon('download') + '导出到手机', 'chip-button')}</div>${grid(list, !album)}`
        : favs ? empty('还没有收藏', '点照片上的心，它就会在这里。', 'heart')
        : empty('这个相簿还没有照片', '', 'image') + (album ? `<div class="actions">${btn('album-add', icon('add') + '添加照片', 'primary')}</div>` : ''));
  }
  function libraryPage() {
    return heading('相册', `<span class="gallery-tools">${toolsHTML()}</span>`, `Album · ${rows.length}`)
      + (rows.length ? grid(rows) : empty('留住喜欢的画面', '从本地导入照片，也可以设为手机壁纸。', 'image')) + tabs();
  }
  async function render() {
    const ticket = ++epoch;
    await read();
    if (v.disposed || ticket !== epoch) return;
    if (place && !albumNow() && !sourceNow()) place = null;
    if (!here().length) selecting = null;
    const onAlbums = !place && tab === 'albums';
    shown = onAlbums ? [] : here().map(r => r.id);
    v.draw(place ? placePage() : onAlbums ? albumsPage() : libraryPage());
    if (selecting) paintChoosing();
    await fillPictures(ticket);
  }
  /** The small pictures already made show at once; the others are made one by one, and kept. */
  async function fillPictures(ticket) {
    const by = new Map(rows.map(r => [r.id, r])), imgs = new Map();
    for (const img of v.root.querySelectorAll('img[data-photo]')) { if (!imgs.has(img.dataset.photo)) imgs.set(img.dataset.photo, []); imgs.get(img.dataset.photo).push(img); }
    const put = (id, blob) => { const url = urlFor(id, blob); for (const img of imgs.get(id)) if (img.getAttribute('src') !== url) img.src = url; };
    const later = [];
    for (const id of imgs.keys()) { const row = by.get(id); if (urls.has(id)) put(id, null); else if (row?.thumb) put(id, row.thumb); else if (row) later.push(row); }
    for (const row of later) {
      const blob = await thumbBlob(api, row);
      if (v.disposed || ticket !== epoch) return;
      if (blob) put(row.id, blob);
    }
  }

  // ---------- choosing several ----------
  const countText = () => selecting.size ? `已选 ${selecting.size} 张` : '点照片来选择，或者按住一滑';
  const allText = () => selecting.size === shown.length ? '全不选' : '全选';
  const allHearted = () => selecting.size > 0 && [...selecting].every(id => hearts.has(id));
  function barHTML() {
    const album = albumNow(), act = (key, name, label, style = '') => `<button type="button" class="select-act${style}" data-action="${key}">${icon(name)}<span>${label}</span></button>`;
    return `<div class="select-bar" role="toolbar" aria-label="多选"><div class="select-head"><span data-select-count>${countText()}</span>${btn('select-all', allText(), 'text-button')}</div><div class="select-acts">${act('select-fav', 'heart', '收藏')}${album?.id === FAVORITES ? '' : act('select-album', 'layers', '放入相簿')}${album ? act('select-remove', 'minus', '移出') : ''}${act('select-download', 'download', '下载')}${canShareFiles(win) ? act('select-share', 'share', '分享') : ''}${act('select-delete', 'trash', '删除', ' select-danger')}</div></div>`;
  }
  /** Choosing on or off, in place: a finger may be on the grid, and what it touches must stay. */
  function paintChoosing() {
    const on = !!selecting;
    for (const g of v.root.querySelectorAll('.photo-grid')) g.classList.toggle('selecting', on);
    const tools = v.root.querySelector('.gallery-tools');
    if (tools) tools.innerHTML = toolsHTML();
    v.root.querySelector('.album-tabs')?.toggleAttribute('hidden', on);
    const bar = v.root.querySelector('.select-bar');
    if (on && !bar) v.root.insertAdjacentHTML('beforeend', barHTML());
    if (!on) bar?.remove();
    for (const b of v.root.querySelectorAll('.photo-grid [data-id]')) {
      const name = b.querySelector('img')?.alt || '';
      b.setAttribute('aria-label', `${on ? '选择' : '查看'} ${name}`);
      if (!on) b.removeAttribute('aria-pressed');
    }
    if (on) syncSelection();
  }
  /** Ticks change in place (the grid is not drawn again, which would load every picture again). */
  function syncSelection() {
    if (!selecting) return;
    for (const b of v.root.querySelectorAll('.photo-grid [data-id]')) { const want = String(selecting.has(b.dataset.id)); if (b.getAttribute('aria-pressed') !== want) b.setAttribute('aria-pressed', want); }
    const $ = key => v.root.querySelector(`[data-action=${key}]`), count = v.root.querySelector('[data-select-count]');
    if (count) count.textContent = countText();
    if ($('select-all')) $('select-all').textContent = allText();
    for (const key of ['select-fav', 'select-album', 'select-remove', 'select-download', 'select-share', 'select-delete']) if ($(key)) $(key).disabled = !selecting.size;
    const fav = $('select-fav');
    if (fav) { const off = allHearted(); fav.querySelector('span').textContent = off ? '取消收藏' : '收藏'; fav.querySelector('svg')?.setAttribute('fill', off ? 'currentColor' : 'none'); }
  }
  const choose = () => { selecting = new Set(); paintChoosing(); };
  const leaveChoosing = () => { selecting = null; paintChoosing(); };
  const slide = slideSelect({ctx, root: v.root, order: () => shown, picked: id => !!selecting?.has(id), pick: (id, on) => { if (on) selecting.add(id); else selecting.delete(id); },
    choosing: () => !!selecting, begin: choose, changed: syncSelection, covered: () => v.root.querySelector('.select-bar')?.offsetHeight || 0});
  const hearted = async (ids, on) => { await api.favoritePhotos(ids, on); for (const id of ids) { if (on) hearts.add(id); else hearts.delete(id); for (const b of v.root.querySelectorAll('.photo-grid [data-id]')) if (b.dataset.id === id) b.toggleAttribute('data-fav', on); } };

  // ---------- sheets ----------
  /** A name for a 相簿. go(name) keeps it; what it throws is said, and the sheet stays. */
  function nameSheet(title, value, go, {over = false} = {}) {
    const d = ctx.dialog(title, `${field('名字', input('album-name', value, 'text', 'maxlength="30" autocomplete="off" placeholder="比如：喜欢的立绘"'))}<div class="actions"><button type="button" class="primary" data-action="go">好</button></div>`, {over});
    const box = d.body.querySelector('[data-field=album-name]');
    const submit = async b => {
      if (b) b.disabled = true;
      try { await go(box.value); d.close(); } catch (error) { ctx.notify(error.message, {error: true}); if (b) b.disabled = false; }
    };
    d.body.addEventListener('click', e => { const b = e.target.closest('[data-action=go]'); if (b && !b.disabled) submit(b); });
    d.body.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(d.body.querySelector('[data-action=go]')); } });
    box.focus?.({preventScroll: true});
    return d;
  }
  /** 放入相簿: which one, or a new one. */
  function putInto(ids, done = () => {}) {
    const mine = albums.filter(a => a.id !== FAVORITES);
    const d = ctx.dialog('放入相簿', `<div class="pick-list album-pick-list"><button type="button" class="list-row" data-new-album>${icon('add')}<span><strong>新建相簿</strong></span></button>${mine.map(a => { const all = ids.every(id => a.photos.includes(id)); return `<button type="button" class="list-row" data-into="${esc(a.id)}"${all ? ' disabled' : ''}>${cover(a.photos[0], ' mini')}<span><strong>${esc(a.name)}</strong><small>${a.photos.length} 张${all ? ' · 已经在里面了' : ''}</small></span></button>`; }).join('')}</div>`);
    for (const img of d.body.querySelectorAll('img[data-photo]')) { const row = rows.find(r => r.id === img.dataset.photo); if (urls.has(img.dataset.photo)) img.src = urls.get(img.dataset.photo); else if (row) thumbBlob(api, row).then(blob => { if (blob && d.live) img.src = urlFor(row.id, blob); }); }
    d.body.addEventListener('click', async e => {
      const into = e.target.closest('[data-into]'), fresh = e.target.closest('[data-new-album]');
      try {
        if (fresh) {
          nameSheet('新建相簿', '', async name => { const made = await api.saveAlbum({name}); await api.addToAlbum(made.id, ids); await read(); ctx.notify(`放进「${made.name}」了`); d.close(); done(); }, {over: true});
        } else if (into && !into.disabled) {
          const target = mine.find(a => a.id === into.dataset.into), {added} = await api.addToAlbum(target.id, ids);
          await read();
          ctx.notify(added ? `放进「${target.name}」了` : '已经在里面了');
          d.close();
          done();
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 添加照片: the album's photos not in it yet, picked as anywhere else: a tap, or held and moved. */
  function addPhotos(album) {
    const inside = new Set(album.photos), list = rows.filter(r => !inside.has(r.id)), picked = new Set();
    if (!list.length) { ctx.notify(rows.length ? '所有照片都在里面了' : '相册里还没有照片'); return; }
    const d = ctx.dialog(`放进「${album.name}」`, `<div class="photo-grid selecting album-pick">${list.map(r => `<button type="button" data-id="${esc(r.id)}" aria-pressed="false" aria-label="选择 ${esc(r.name)}"><img loading="lazy" decoding="async" draggable="false" data-photo="${esc(r.id)}" alt="${esc(r.name)}"${urls.has(r.id) ? ` src="${esc(urls.get(r.id))}"` : ''}></button>`).join('')}</div><div class="actions album-pick-go"><button type="button" class="primary" data-action="go" disabled>点照片来选择，或者按住一滑</button></div>`);
    const tiles = () => d.body.querySelectorAll('.photo-grid [data-id]'), go = d.body.querySelector('[data-action=go]');
    const show = () => { for (const b of tiles()) b.setAttribute('aria-pressed', String(picked.has(b.dataset.id))); go.disabled = !picked.size; go.textContent = picked.size ? `放进去 ${picked.size} 张` : '点照片来选择，或者按住一滑'; };
    const sliding = slideSelect({ctx, root: d.body, scroller: d.body, order: () => list.map(r => r.id), picked: id => picked.has(id), pick: (id, on) => { if (on) picked.add(id); else picked.delete(id); }, choosing: () => true, changed: show, covered: () => go.offsetHeight + 12});
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-id]');
      if (b && !sliding.justEnded()) { const id = b.dataset.id; if (picked.has(id)) picked.delete(id); else picked.add(id); show(); return; }
      if (e.target.closest('[data-action=go]') && picked.size) {
        go.disabled = true;
        try { await api.addToAlbum(album.id, [...picked]); d.close(); ctx.notify(`放进去了 ${picked.size} 张`); await render(); }
        catch (error) { go.disabled = false; ctx.notify(error.message, {error: true}); }
      }
    });
    for (const row of list) if (row.thumb && !urls.has(row.id)) urlFor(row.id, row.thumb);
    for (const img of d.body.querySelectorAll('img[data-photo]')) if (urls.has(img.dataset.photo)) img.src = urls.get(img.dataset.photo);
    (async () => { for (const row of list) { if (urls.has(row.id)) continue; const blob = await thumbBlob(api, row); if (!d.live) return; if (blob) { const url = urlFor(row.id, blob), img = [...d.body.querySelectorAll('img[data-photo]')].find(x => x.dataset.photo === row.id); if (img) img.src = url; } } })().catch(() => {});
  }
  /**
   * 导出到手机: a whole 相簿 or what was picked. On a phone 存到手机相册 is the system's share sheet (保存图片), a few at a time;
   * 打包下载 is one zip, or several for what a phone cannot hold in one. 不带生成信息 makes JPGs first.
   */
  function exportSheet(list, title) {
    const bytes = list.reduce((n, r) => n + (r.size || 0), 0), drawn = list.some(r => /^image\/(png|webp)$/.test(r.type || '')), sharing = canShareFiles(win);
    const zips = batches(list, ZIP_MOST), shares = sharing ? batches(list, SHARE_BYTES, SHARE_FILES) : [];
    let plain = false, zipAt = 0, shareAt = 0, ready = null;
    const d = ctx.dialog(`导出「${title}」`, `<p class="export-sum">${list.length} 张 · ${size(bytes)}</p>
      ${drawn ? `<div class="segmented export-kind" role="group" aria-label="导出哪种"><button type="button" data-export-kind="original" aria-pressed="true">原图</button><button type="button" data-export-kind="plain" aria-pressed="false">不带生成信息</button></div>` : ''}
      <div class="actions export-go">${sharing ? `<button type="button" class="primary" data-action="export-share"></button>` : ''}<button type="button" class="${sharing ? 'secondary' : 'primary'}" data-action="export-zip"></button></div>`);
    const $ = key => d.body.querySelector(`[data-action=${key}]`);
    const paint = () => {
      if (!d.live) return;
      const zip = $('export-zip'), share = $('export-share');
      zip.innerHTML = icon('download') + (zipAt >= zips.length ? '都下载好了' : zips.length > 1 ? `打包下载（第 ${zipAt + 1}/${zips.length} 包）` : list.length > 1 ? '打包下载' : '下载');
      zip.disabled = zipAt >= zips.length;
      if (share) { share.innerHTML = icon('share') + (ready ? '准备好了，点这里保存' : shareAt >= shares.length ? '都存好了' : shares.length > 1 ? `存到手机相册（第 ${shareAt + 1}/${shares.length} 批）` : '存到手机相册'); share.disabled = !ready && shareAt >= shares.length; }
    };
    /** The files of a batch, as asked for. say: how far it has come. */
    const filesOf = async (part, say) => {
      const out = [];
      for (const [i, row] of part.entries()) {
        say(i + 1, part.length);
        const photo = await api.getPhoto(row.id);
        if (!photo?.blob) continue;
        out.push(plain && /^image\/(png|webp)$/.test(photo.blob.type) ? {name: photo.name.replace(/\.[^.]*$/, '') + '.jpg', blob: await plainImage(ctx.doc, photo.blob)} : {name: photo.name, blob: photo.blob});
      }
      if (!out.length) throw Error('这些照片已经不在了');
      return out;
    };
    const sendShare = async files => {
      try { await shareFiles(ctx.doc, files); shareAt++; ctx.notify('存好了可以去手机相册看看'); }
      catch (error) { ctx.notify(error.message, {error: !/已取消/.test(error.message)}); }
    };
    paint();
    d.body.addEventListener('click', async e => {
      const kind = e.target.closest('[data-export-kind]');
      if (kind) {
        plain = kind.dataset.exportKind === 'plain'; ready = null;
        for (const b of d.body.querySelectorAll('[data-export-kind]')) b.setAttribute('aria-pressed', String(b === kind));
        paint();
        return;
      }
      const b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      b.disabled = true;
      try {
        if (b.dataset.action === 'export-zip') {
          const part = zips[zipAt], files = await filesOf(part, (i, n) => { b.textContent = `正在打包 ${i}/${n}……`; });
          const name = files.length === 1 ? files[0].name : `ST-iPhonie 相册 ${title} ${stamp()}${zips.length > 1 ? ` 第 ${zipAt + 1} 包` : ''} ${files.length} 张`;
          const saved = await saveFile(ctx.doc, files.length === 1 ? files[0].blob : await zipFiles(files), name);
          zipAt++;
          ctx.notify(`已下载 ${saved}`);
        } else if (b.dataset.action === 'export-share') {
          if (ready) { const files = ready; ready = null; await sendShare(files); }
          else {
            const began = Date.now(), files = await filesOf(shares[shareAt], (i, n) => { b.textContent = `正在准备 ${i}/${n}……`; });
            // A share sheet must come soon after the tap: what took long waits for one more.
            if (Date.now() - began < 700) await sendShare(files); else ready = files;
          }
        }
      } catch (error) { ctx.notify(error.message, {error: !/已取消/.test(error.message)}); }
      b.disabled = false;
      paint();
    });
  }

  // ---------- a photo full screen ----------
  /** Opens a photo; the others of the page are a swipe away. */
  function openPhoto(id, from = null) {
    viewer?.close();
    let changed = false;
    const album = albumNow();
    viewer = openAlbum({ctx, host: v.root.closest('.screen') || ctx.doc.body, ids: shown, index: Math.max(0, shown.indexOf(id)), from,
      to: x => [...v.root.querySelectorAll('.photo-grid [data-id]')].find(b => b.dataset.id === x)?.getBoundingClientRect(),
      // a photo made smaller by 压缩旧图 says so under 参数
      load: async x => { const p = await api.getPhoto(x); return p?.packed ? {...p, info: [...(p.info || []), ['压缩', `已压缩，原图 ${size(p.packed.size)}`]]} : p; },
      actions: [
        {key: 'fav', icon: 'heart', label: '收藏', labelOn: '已收藏', on: x => hearts.has(x), run: async x => { await hearted([x], !hearts.has(x)); changed = true; }},
        {key: 'album', icon: 'layers', label: '放入相簿', run: async x => { putInto([x], () => { changed = true; }); }},
        {key: 'download', icon: 'download', label: '下载', run: async x => { const {source, name} = await photoFile(x); const [file] = await pictureCopies(ctx, [{blob: source, name}]) || []; if (file) ctx.notify('已下载 ' + await saveFile(ctx.doc, file.blob, file.name)); }},
        ...(album && album.id !== FAVORITES ? [{key: 'out', icon: 'minus', label: `移出「${album.name}」`, more: true, run: async x => { await api.removeFromAlbum(album.id, [x]); changed = true; ctx.notify('移出了，它还在图库里'); return 'removed'; }}] : []),
        ...(canShareFiles(win) ? [{key: 'share', icon: 'share', label: '分享', more: true, run: async x => { const {source, name} = await photoFile(x); try { await shareFile(ctx.doc, source, name); } catch (error) { ctx.notify(error.message, {error: !/已取消/.test(error.message)}); } }}] : []),
        ...(canCopyPicture(win) ? [{key: 'copy', icon: 'copy', label: '复制', more: true, run: async x => { try { await copyPicture(win, photoFile(x).then(f => f.source)); ctx.notify('已复制'); } catch { ctx.notify('这个浏览器不让复制图片', {error: true}); } }}] : []),
        {key: 'wallpaper', icon: 'image', label: '设为壁纸', more: true, run: async x => { await api.savePhone({wallpaper: {kind: 'photo', photoId: x}}); ctx.notify('已设为壁纸'); }},
        {key: 'cover', icon: 'paint', label: '当效果图', more: true, run: async x => {
          const photo = await api.getPhoto(x);
          if (!photo?.blob) throw Error('这张照片已经不在了');
          const {coverFromAlbum} = await import('./draw-styles.js');
          coverFromAlbum(ctx, photo.blob, (photo.info || []).map(row => row[1]).join(' '));
        }},
        {key: 'vibe', icon: 'layers', label: '当 Vibe', more: true, run: async x => {
          const {source, name} = await photoFile(x), r = await api.importVibes([new win.File([source], name || 'Vibe.png', {type: source.type || 'image/png'})]);
          if (r.errors.length) throw Error(r.errors[0].message);
          ctx.notify(r.updated && !r.added ? '这张图已经是 Vibe 了' : '已存成 Vibe，在绘图的 Vibe 页里');
        }},
        {key: 'delete', icon: 'trash', label: '删除', danger: true, run: async x => {
          if (!await ctx.confirm('删除这张照片？', '使用它的壁纸和图标会恢复默认。')) return;
          await api.deletePhoto(x); changed = true; ctx.notify('已删除');
          return 'removed';
        }}
      ],
      onClose: () => { viewer = null; if (changed) render().catch(e => ctx.notify(e.message)); }});
  }

  // ---------- 相簿 held and moved: the others make room ----------
  let lifted = null;
  function moveLifted(p, x, y) {
    p.x2 = x; p.y2 = y;
    p.card.style.transform = '';
    const box = p.card.getBoundingClientRect();
    p.card.style.transform = `translate(${x - p.grabX - box.left}px,${y - p.grabY - box.top}px) scale(1.04)`;
    const over = ctx.doc.elementFromPoint?.(x, y)?.closest?.('.album-card[data-sort]');
    if (!over || over === p.card) return;
    const parent = p.card.parentElement, cards = [...parent.querySelectorAll('.album-card')], was = new Map(cards.map(c => [c, c.getBoundingClientRect()]));
    parent.insertBefore(p.card, cards.indexOf(over) > cards.indexOf(p.card) ? over.nextSibling : over);
    for (const c of cards) {
      if (c === p.card) continue;
      const a = was.get(c), b = c.getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 1 || Math.abs(a.top - b.top) > 1) nudge(win, c, [{transform: `translate(${a.left - b.left}px,${a.top - b.top}px)`}, {transform: 'none'}], {duration: 300, easing: 'soft'});
    }
    p.card.style.transform = '';
    const after = p.card.getBoundingClientRect();
    p.card.style.transform = `translate(${x - p.grabX - after.left}px,${y - p.grabY - after.top}px) scale(1.04)`;
  }
  v.root.addEventListener('pointerdown', e => {
    const card = e.target.closest?.('.album-card[data-sort]');
    if (!card || e.button > 0 || lifted) return;
    const box = card.getBoundingClientRect(), p = lifted = {card, id: e.pointerId, x: e.clientX, y: e.clientY, grabX: e.clientX - box.left, grabY: e.clientY - box.top, on: false};
    p.timer = win.setTimeout(() => {
      if (lifted !== p) return;
      p.on = true;
      card.classList.add('album-lifted');
      try { win.navigator?.vibrate?.(8); } catch { /* none */ }
      try { v.root.setPointerCapture?.(p.id); } catch { /* a pointer the browser no longer tracks */ }
      moveLifted(p, p.x, p.y);
    }, 360);
  });
  v.root.addEventListener('pointermove', e => {
    const p = lifted;
    if (!p || e.pointerId !== p.id) return;
    if (p.on) { moveLifted(p, e.clientX, e.clientY); return; }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { win.clearTimeout(p.timer); lifted = null; }
  });
  const dropCard = e => {
    const p = lifted;
    if (!p || e.pointerId !== p.id) return;
    lifted = null;
    win.clearTimeout(p.timer);
    if (!p.on) return;
    gestureAt = Date.now();
    p.card.classList.remove('album-lifted');
    p.card.style.transform = '';
    const order = [...v.root.querySelectorAll('.album-card[data-sort]')].map(c => c.dataset.albumId);
    api.arrangeAlbums(order).catch(error => ctx.notify(error.message, {error: true}));
  };
  v.root.addEventListener('pointerup', dropCard);
  v.root.addEventListener('pointercancel', dropCard);
  v.root.addEventListener('touchmove', e => { if (lifted?.on && e.cancelable) e.preventDefault(); }, {passive: false});
  v.root.addEventListener('contextmenu', e => { if (lifted) e.preventDefault(); });

  v.back = () => {
    if (viewer) { viewer.close(); return true; }
    if (selecting) { leaveChoosing(); return true; }
    if (place) { place = null; tab = 'albums'; render().catch(e => ctx.notify(e.message)); return true; }
    return false;
  };
  // A finger on the grid is not interrupted: what came meanwhile shows when it is lifted, with the next change.
  v.refresh = () => slide.active || lifted?.on ? undefined : render();
  const dispose = v.dispose;
  v.dispose = () => { epoch++; viewer?.close(); for (const url of urls.values()) win.URL.revokeObjectURL(url); urls.clear(); dispose(); };
  v.on('change', '[data-photo-files]', async el => {
    el.disabled = true;
    try {
      for (const file of el.files || []) await api.addPhoto({name: file.name, blob: file});
      await render();
      ctx.notify('照片已保存');
    } finally { if (el.isConnected) { el.value = ''; el.disabled = false; } }
  });
  v.on('click', '[data-action]', async el => {
    if (slide.justEnded() || Date.now() - gestureAt < 350) return;
    switch (el.dataset.action) {
      case 'photo':
        if (selecting) { const id = el.dataset.id; if (selecting.has(id)) selecting.delete(id); else selecting.add(id); syncSelection(); break; }
        openPhoto(el.dataset.id, (el.querySelector('img') || el).getBoundingClientRect()); break;
      case 'album-tab': if (tab !== el.dataset.tab) { tab = el.dataset.tab; selecting = null; await render(); v.root.scrollTop = 0; } break;
      case 'open-album': place = {kind: 'album', id: el.dataset.albumId}; selecting = null; await render(); v.root.scrollTop = 0; break;
      case 'open-source': place = {kind: 'source', key: el.dataset.key}; selecting = null; await render(); v.root.scrollTop = 0; break;
      case 'album-new':
        nameSheet('新建相簿', '', async name => { const made = await api.saveAlbum({name}); place = {kind: 'album', id: made.id}; await render(); v.root.scrollTop = 0; });
        break;
      case 'album-add': { const album = albumNow(); if (album) addPhotos(album); break; }
      case 'album-export': { const list = here(); if (list.length) exportSheet(list, albumNow()?.name || sourceNow()?.label || '相册'); break; }
      case 'album-menu': {
        const album = albumNow(), favs = album?.id === FAVORITES;
        if (!album) break;
        const key = await menu(ctx, album.name, [{key: 'add', icon: 'add', label: '添加照片'}, ...(here().length ? [{key: 'export', icon: 'download', label: '导出到手机'}] : []), ...(favs ? [] : [{key: 'rename', icon: 'edit', label: '改名'}, {key: 'delete', icon: 'trash', label: '删除相簿', note: '里面的照片还在图库里', danger: true}])]);
        if (key === 'add') addPhotos(album);
        else if (key === 'export') exportSheet(here(), album.name);
        else if (key === 'rename') nameSheet('改名', album.name, async name => { await api.saveAlbum({id: album.id, name}); await render(); });
        else if (key === 'delete' && await ctx.confirm(`删除相簿「${album.name}」？`, '里面的照片还在图库里。')) { await api.deleteAlbum(album.id); place = null; tab = 'albums'; await render(); ctx.notify('相簿删了，照片还在'); }
        break;
      }
      case 'select': choose(); break;
      case 'select-cancel': leaveChoosing(); break;
      case 'select-all': selecting = selecting.size === shown.length ? new Set() : new Set(shown); syncSelection(); break;
      case 'select-fav': {
        const ids = [...selecting], on = !allHearted();
        if (!ids.length) break;
        await v.busy(el, () => hearted(ids, on));
        ctx.notify(on ? `收藏了 ${ids.length} 张` : `取消收藏 ${ids.length} 张`);
        leaveChoosing();
        break;
      }
      case 'select-album': { const ids = [...selecting]; if (ids.length) putInto(ids, () => { leaveChoosing(); }); break; }
      case 'select-remove': {
        const ids = [...selecting], album = albumNow();
        if (!ids.length || !album) break;
        await v.busy(el, () => album.id === FAVORITES ? api.favoritePhotos(ids, false) : api.removeFromAlbum(album.id, ids));
        selecting = null;
        await render();
        ctx.notify(`移出了 ${ids.length} 张，它们还在图库里`);
        break;
      }
      // 下载 the ticked photos: one is saved as it is, several go in one .zip (a phone keeps only the first of many
      // downloads started at once), so the album can be emptied after.
      case 'select-download': {
        const ids = shown.filter(id => selecting.has(id));
        if (!ids.length) break;
        await v.busy(el, async () => {
          let files = [];
          for (const id of ids) { const photo = await api.getPhoto(id); if (photo?.blob) files.push({name: photo.name, blob: photo.blob}); }
          if (!files.length) throw Error('选中的照片已经不在了');
          files = await pictureCopies(ctx, files);
          if (!files) return;
          if (files.length === 1) { ctx.notify('已下载 ' + await saveFile(ctx.doc, files[0].blob, files[0].name)); return; }
          const name = await saveFile(ctx.doc, await zipFiles(files), `ST-iPhonie 相册 ${stamp()} ${files.length} 张`);
          ctx.notify(`已打包下载 ${files.length} 张：${name}`);
        });
        break;
      }
      case 'select-share': { const list = rows.filter(r => selecting.has(r.id)); if (list.length) exportSheet(list, '选中的照片'); break; }
      case 'select-delete': {
        const ids = [...selecting];
        if (!ids.length || !await ctx.confirm(`删除这 ${ids.length} 张照片？`, '用它们当的壁纸、图标、头像和聊天背景会恢复默认；朋友圈配图和查手机照片变回「没画」，想要可以再画。')) break;
        const n = await v.busy(el, () => api.deletePhotos(ids));
        selecting = null; await render(); ctx.notify(`已删除 ${n} 张`);
        break;
      }
    }
  });
  render().catch(e => ctx.notify(e.message));
  return v;
}

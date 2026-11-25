import {FAVORITES, albumsInOrder, byNewest, photoDays, photoSources} from '../core/albums.js';
import {btn, esc} from './common.js';
import {icon} from './icons.js';
import {photoWall} from './photo-wall.js';
import {eachThumb} from './thumbs.js';
import {slideSelect} from './photo-select.js';

export async function pickReplacement(ctx, api, {
  title = '替换图片', over = false, accept = 'image/png,image/jpeg,image/webp',
  exclude = new Set(), multiple = 0, device = true, selected = '', actions = [],
  confirmLabel = '使用所选', unit = '张', onConfirm
} = {}) {
  const [photos, albums] = await Promise.all([api.listPhotos(), api.listAlbums?.() || []]);
  const rows = byNewest(photos).filter(row => !exclude.has(row.id));
  const byId = new Map(rows.map(row => [row.id, row]));
  const lists = albumsInOrder(albums, new Set(byId.keys()));
  const folders = [
    lists.find(a => a.id === FAVORITES) || {name:'收藏', photos:[]},
    ...lists.filter(a => a.id !== FAVORITES),
  ].map(a => ({name:a.name, rows:a.photos.map(id => byId.get(id))}));
  const sources = photoSources(rows).map(s => ({name:s.label, rows:s.rows}));
  const groups = folders.concat(sources), chosen = new Set();
  const wall = photoWall({api, win:ctx.win, tile: (row, url) =>
    `<button type="button" data-id="${esc(row.id)}" data-pick-photo="${esc(row.id)}"${multiple || selected ? ` aria-pressed="${multiple ? chosen.has(row.id) : selected === row.id}"` : ''} aria-label="选择 ${esc(row.name)}"><img alt="" draggable="false" data-photo="${esc(row.id)}"${url ? ` src="${esc(url)}"` : ''}></button>`});
  const d = ctx.dialog(title, `<div class="stip-picker">
    <div class="stip-picker-head"><div role="group" aria-label="浏览方式"><button type="button" data-tab="library">图库</button><button type="button" data-tab="albums">相簿</button></div>
    ${device ? `<button type="button" data-device>${icon('image')}从设备选择</button><input hidden type="file" data-pick-file accept="${esc(accept)}"${multiple ? ' multiple' : ''}>` : ''}</div>
    <div class="stip-picker-back" hidden><button type="button">‹ 返回相簿</button><strong></strong></div>
    <div class="stip-picker-scroll" tabindex="0"></div>
    ${multiple ? `<div class="actions stip-picker-selection">${btn('go', esc(confirmLabel), 'primary', 'disabled')}</div>` : ''}
    ${actions.length ? `<div class="stip-picker-options">${actions.map(({value, label}) => `<button type="button" data-picker-option="${esc(value)}">${esc(label)}</button>`).join('')}</div>` : ''}</div>`, {over});
  const root = d.body.querySelector('.stip-picker');
  const scroll = root.querySelector('.stip-picker-scroll');
  const back = root.querySelector('.stip-picker-back');
  const positions = new Map(), covers = new Map();
  let page = 'library', folder = null, revision = 0, shown = [], saving = false, closed = false;
  const confirm = root.querySelector('[data-action=go]');
  function updateSelection() {
    for (const tile of scroll.querySelectorAll('[data-pick-photo]')) tile.setAttribute('aria-pressed', String(chosen.has(tile.dataset.pickPhoto)));
    confirm.disabled = saving || !chosen.size;
    confirm.textContent = saving ? '正在保存…' : chosen.size ? `${confirmLabel} ${chosen.size} ${unit}` : confirmLabel;
  }
  const pick = (id, on) => { if (!saving) { if (on) chosen.add(id); else chosen.delete(id); } };
  const sliding = multiple && slideSelect({
    ctx, root:scroll, tiles:'[data-pick-photo]', order:() => shown.map(row => row.id),
    picked:id => chosen.has(id), pick, choosing:() => true, changed:updateSelection
  });
  const key = () => folder === null ? page : 'folder-' + folder;
  function navigate(tab, index = null) {
    positions.set(key(), scroll.scrollTop);
    page = tab;
    folder = index;
    render();
  }
  function render() {
    const ticket = ++revision;
    for (const tab of root.querySelectorAll('[data-tab]')) tab.setAttribute('aria-pressed', String(tab.dataset.tab === page));
    back.hidden = folder === null;
    back.querySelector('strong').textContent = groups[folder]?.name || '';
    shown = page === 'albums' && folder === null ? [] : folder === null ? rows : groups[folder].rows;
    if (page === 'albums' && folder === null) {
      const card = (group, i) => {
        const id = group.rows[0]?.id;
        return `<button type="button" data-folder="${i}"><span>${id ? `<img data-cover="${esc(id)}" alt="">` : icon('image')}</span><b>${esc(group.name)}</b><small>${group.rows.length} 张</small></button>`;
      };
      scroll.innerHTML = `<div class="stip-folders">${folders.map(card).join('')}</div>` +
        (sources.length ? `<h3>来源</h3><div class="stip-folders">${sources.map((s,i) => card(s, folders.length+i)).join('')}</div>` : '');
      const images = [...scroll.querySelectorAll('[data-cover]')];
      const ids = new Set(images.map(img => img.dataset.cover));
      for (const img of images) if (covers.has(img.dataset.cover)) img.src = covers.get(img.dataset.cover);
      eachThumb(api, [...ids].filter(id => !covers.has(id)).map(id => byId.get(id)), (id,blob) => {
        const url = ctx.win.URL.createObjectURL(blob);
        covers.set(id,url);
        for (const img of images) if (img.dataset.cover === id) img.src = url;
      }, () => ticket === revision).catch(() => {});
    } else {
      scroll.innerHTML = shown.length ? wall.html(folder === null || folder >= folders.length ? photoDays(shown) : [{label:'',rows:shown}], multiple ? ' album-pick' : '') : '<p>这里还没有可选照片</p>';
    }
    scroll.scrollTop = positions.get(key()) || 0;
    wall.mount(scroll);
    if (multiple) updateSelection();
  }
  return new Promise(resolve => {
    d.onClose(() => {
      closed = true;
      ++revision;
      if (sliding) sliding.stop();
      wall.stop();
      for (const url of covers.values()) ctx.win.URL.revokeObjectURL(url);
      resolve(null);
    });
    function choose(value) { resolve(value); d.close(); }
    root.addEventListener('click', async event => {
      const b = event.target.closest('button');
      if (!b || saving) return;
      if (b.hasAttribute('data-pick-photo')) {
        if (!multiple) { choose(b.dataset.pickPhoto); return; }
        if (sliding.justEnded()) return;
        pick(b.dataset.pickPhoto, !chosen.has(b.dataset.pickPhoto));
        updateSelection();
      } else if (b === confirm) {
        if (!chosen.size) return;
        if (chosen.size > multiple) { ctx.notify(`一次最多选 ${multiple} ${unit}`); return; }
        const ids = [...chosen];
        if (onConfirm) {
          saving = true;
          updateSelection();
          try { await onConfirm(ids); }
          catch (error) {
            if (!closed) { saving = false; updateSelection(); ctx.notify(error.message, {error:true}); }
            return;
          }
          if (closed) return;
        }
        choose(ids);
      } else if (b.hasAttribute('data-device')) root.querySelector('input').click();
      else if (b.hasAttribute('data-picker-option')) choose({action:b.dataset.pickerOption});
      else if (b.dataset.tab) navigate(b.dataset.tab);
      else if (b.hasAttribute('data-folder')) navigate('albums', Number(b.dataset.folder));
      else if (back.contains(b)) navigate('albums');
    });
    if (device) root.querySelector('input').onchange = event => {
      const files = [...event.target.files];
      if (!files.length) return;
      if (multiple && files.length > multiple) {
        event.target.value = '';
        ctx.notify(`一次最多选 ${multiple} ${unit}`);
        return;
      }
      choose(multiple ? files : files[0]);
    };
    render();
  });
}

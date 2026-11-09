// 衣柜 (0.9.29): clothes for the user and for this card's roles (角色 App). A photo goes in and a model that sees says
// what it is (name, category, words); a tap picks pieces: 穿上 tells the next story reply once, 去搭配 has the model put
// an outfit together from them (or design one from a wish), kept as 存过的搭配 and drawn as a 试穿图. When the story
// changes someone's clothes, 正在穿 follows (host-wardrobe.js). The documents are core/wardrobe.js; photos stay in the album.
import {createView, esc, btn, heading, help, empty, avatar, groupTitle, menu, field, input, textArea} from './common.js';
import {icon} from './icons.js';
import {eachThumb, previewBlob} from './thumbs.js';
import {photoWall} from './photo-wall.js';
import {slideSelect} from './photo-select.js';
import {openAlbum} from './album-viewer.js';
import {byNewest} from '../core/albums.js';
import {WARDROBE_CATEGORIES, WARDROBE_LIMITS, ownerKey, ownerName} from '../core/wardrobe.js';
import {shareToChat} from './share-to-chat.js';

const PHOTO_TYPES = 'image/png,image/jpeg,image/webp';
const UNSORTED = '未分类';
/** Pieces put in at once (each is a request to the model that sees). */
const AT_ONCE = 30;
/** Faces in the row while there are many (0.9.33), with 「全部 N」 after them; up to one more, everyone is shown. */
const ROW = 6;
const RECENT_KEY = 'sttts-wardrobe-recent';
const extOf = blob => /png/.test(blob?.type || '') ? 'png' : /webp/.test(blob?.type || '') ? 'webp' : 'jpg';
const fileSafe = name => String(name || '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || '我';
const HELP = '衣柜是你和这张卡的角色（角色 App 里的）的，点上面的头像换人。\n放进照片后，能看图的文字模型会认出名字、分类和描述；认不出来时点「⋯」自己写。\n点衣服选中：「穿上」让下一次正文写进这身衣着（只这一次，之后跟着剧情走）；「去搭配」用选中的衣服搭一套，什么都没选就从整个衣柜挑。\n正文里有人换了衣服，「正在穿」会跟着变。\n试穿图用绘图引擎画，要花钱时先问你。\n放进来的照片在相册的「衣柜」里，试穿图在「衣柜试穿」里。';

export function wardrobeApp(ctx) {
  const {api, win} = ctx, v = createView(ctx, 'wardrobe'), urls = new Map(), drafts = new Map(), recognizing = new Set();
  // owner: whose 衣柜 is open ('me' or 'role:<name>'); tab: 衣柜 or 搭配; picked: the pieces tapped (this owner's).
  let owner = 'me', tab = 'closet', filter = 'all', picked = new Set(), all = {items: [], sets: [], wears: []}, turn = 0, soon = 0, suggesting = false, drawing = false, saving = false;
  const me = () => api.userName?.() || '我';
  const who = (key = owner) => ownerName(key, me());
  function owners() {
    let roles = [];
    try { roles = (api.chatContacts?.() || []).filter(c => c.source === 'role'); } catch { /* closed */ }
    const list = [{key: 'me', name: me(), engine: 'none', pic: 'me'}];
    for (const c of roles) { const key = ownerKey(c.name); if (!list.some(o => o.key === key)) list.push({key, name: c.name, engine: c.engine || 'none', pic: c.name}); }
    return list;
  }
  // Switched to lately (this browser only): with many people, they stay in the row.
  const recent = () => { try { const got = JSON.parse(win.localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(got) ? got.filter(x => typeof x === 'string').slice(0, 12) : []; } catch { return []; } };
  const noteRecent = key => { try { win.localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recent().filter(x => x !== key)].slice(0, 12))); } catch { /* this visit only */ } };
  /**
   * The row: everyone while they fit. With more, the user, whoever is open, those in the story just now and those switched
   * to lately, ROW of them in the list's order (a tap never moves a face), then 「全部 N」.
   */
  function shownOwners(list) {
    if (list.length <= ROW + 1) return list;
    let present = [];
    try { present = api.wardrobePresent?.() || []; } catch { /* closed */ }
    const keep = new Set();
    for (const key of ['me', owner, ...present, ...recent(), ...list.map(o => o.key)]) { if (keep.size >= ROW) break; if (list.some(o => o.key === key)) keep.add(key); }
    return list.filter(o => keep.has(o.key));
  }
  const pending = key => all.wears.some(w => w.owner === key && w.pending);
  const face = (o, size = 40, attr = 'data-owner') => `<button type="button" class="wardrobe-owner" ${attr}="${esc(o.key)}" data-find="${esc(o.name.toLowerCase())}" aria-pressed="${o.key === owner}">${avatar(o.name, o.engine, size, o.pic)}<span>${esc(o.name)}</span>${pending(o.key) ? '<i class="wardrobe-dot" aria-label="有要穿上的"></i>' : ''}</button>`;
  /** 「全部 N」: everyone, as a grid of faces with a box to find someone by name. */
  function ownersSheet() {
    const list = owners();
    const d = ctx.dialog(`全部 ${list.length} 个人`, `<div class="picker-search"><input type="search" data-owner-search placeholder="找人" aria-label="找人" autocomplete="off"></div>
      <div class="wardrobe-people">${list.map(o => face(o, 48, 'data-pick-owner')).join('')}</div><p class="hint" data-owner-none hidden>没有找到这个名字</p>`);
    const box = d.body.querySelector('[data-owner-search]');
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase();
      let any = false;
      for (const el of d.body.querySelectorAll('[data-pick-owner]')) { const hit = !q || el.dataset.find.includes(q); el.hidden = !hit; any ||= hit; }
      d.body.querySelector('[data-owner-none]').hidden = any;
    });
    d.body.addEventListener('click', e => {
      const key = e.target.closest('[data-pick-owner]')?.dataset.pickOwner;
      if (!key) return;
      d.close();
      switchTo(key);
    });
  }
  function switchTo(key) {
    if (key === owner) return;
    owner = key; picked = new Set(); filter = 'all';
    noteRecent(key);
    render();
  }
  const draft = (key = owner) => { if (!drafts.has(key)) drafts.set(key, {mode: 'closet', wish: '', result: '', photoId: ''}); return drafts.get(key); };
  const mine = () => all.items.filter(x => x.owner === owner);
  const seg = (action, value, label, now) => `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${value === now}">${esc(label)}</button>`;

  // ---------- drawing the page ----------
  function ownersRow(list) {
    const shown = shownOwners(list), hidden = list.filter(o => !shown.includes(o));
    const more = hidden.length ? `<button type="button" class="wardrobe-owner wardrobe-all" data-action="owners-all" aria-label="全部 ${list.length} 个人"><span class="avatar none" style="--s:40px">${icon('group')}</span><span>全部 ${list.length}</span>${hidden.some(o => pending(o.key)) ? '<i class="wardrobe-dot" aria-label="有要穿上的"></i>' : ''}</button>` : '';
    return `<div class="wardrobe-owners" role="group" aria-label="谁的衣柜" data-keep-scroll="owners">${shown.map(o => face(o)).join('')}${more}</div>`;
  }
  function wearCard(wear) {
    const state = wear.pending ? '下一次正文会写进去' : wear.from === 'story' ? '正文里换的' : '已经写进正文';
    return `<div class="wardrobe-wear${wear.pending ? ' pending' : ''}"><div><small>正在穿 · ${state}</small><p>${esc(wear.text)}</p></div>${btn('wear-off', '脱下', 'text-button')}</div>`;
  }
  function tile(x) {
    const url = x.photoId ? urls.get(x.photoId) : '', busy = recognizing.has(x.id);
    const pic = x.photoId ? `<img data-photo="${esc(x.photoId)}" alt="" draggable="false" decoding="async"${url ? ` src="${esc(url)}"` : ''}>` : `<span class="wardrobe-words">${esc(x.description)}</span>`;
    return `<div class="wardrobe-item" data-flip="wardrobe:${esc(x.id)}" data-item="${esc(x.id)}" role="button" tabindex="0" aria-pressed="${picked.has(x.id)}" aria-label="${esc(x.name)}">`
      + `<span class="wardrobe-pic">${pic}${busy ? '<span class="wardrobe-scan">正在识别…</span>' : ''}</span><span class="wardrobe-check" aria-hidden="true">${icon('check')}</span>`
      + `<button type="button" class="wardrobe-more" data-action="item-edit" data-id="${esc(x.id)}" aria-label="编辑 ${esc(x.name)}">${icon('more')}</button>`
      + `<span class="wardrobe-name">${esc(x.name)}</span>${x.description || busy ? '' : '<span class="wardrobe-todo">待写描述</span>'}</div>`;
  }
  function closet(list) {
    if (!list.length) return empty('衣柜还是空的', '点右上角的 ＋ 放进第一件衣服', 'hanger');
    const counts = {};
    for (const x of list) counts[x.category || UNSORTED] = (counts[x.category || UNSORTED] || 0) + 1;
    const cats = [...WARDROBE_CATEGORIES, UNSORTED].filter(c => counts[c]);
    if (filter !== 'all' && !counts[filter]) filter = 'all';
    const shown = filter === 'all' ? list : list.filter(x => (x.category || UNSORTED) === filter);
    return (cats.length > 1 ? `<div class="wardrobe-filters" role="group" aria-label="按分类看" data-keep-scroll="filters">${[['all', `全部 ${list.length}`], ...cats.map(c => [c, `${c} ${counts[c]}`])].map(([key, label]) => `<button type="button" class="wardrobe-filter" data-filter="${esc(key)}" aria-pressed="${key === filter}">${esc(label)}</button>`).join('')}</div>` : '')
      + `<div class="wardrobe-grid"${picked.size ? ' data-picking' : ''}>${shown.map(tile).join('')}</div>`;
  }
  const act = (key, name, label, style = '') => `<button type="button" class="select-act${style}" data-action="${key}">${icon(name)}<span>${label}</span></button>`;
  const bar = () => `<div class="select-bar wardrobe-bar" role="toolbar" aria-label="选中的衣服"><div class="select-head"><span data-picked-count>已选 ${picked.size} 件</span>${btn('pick-clear', '清空', 'text-button')}</div><div class="select-acts">${act('pick-wear', 'hanger', '穿上')}${act('pick-outfit', 'wand', '去搭配')}${act('pick-delete', 'trash', '拿出衣柜', ' select-danger')}</div></div>`;
  function outfit(list, sets) {
    const d = draft(), described = list.filter(x => x.description).length, chosen = list.filter(x => picked.has(x.id)).length, none = d.result.trim() ? '' : 'disabled';
    const source = d.mode !== 'closet' ? '' : `<p class="hint wardrobe-source">${chosen ? `用选中的 ${chosen} 件` : described ? `从衣柜的 ${described} 件里挑` : '衣柜里还没有写了描述的衣服'}</p>`;
    const tryOn = d.photoId ? `<button type="button" class="wardrobe-tryon" data-action="tryon-open" aria-label="看试穿图"><img data-photo="${esc(d.photoId)}" alt=""${urls.get(d.photoId) ? ` src="${esc(urls.get(d.photoId))}"` : ''}></button>` : '';
    return `<div class="segmented wardrobe-mode" role="group" aria-label="怎么搭">${seg('mode', 'closet', '从衣柜选', d.mode)}${seg('mode', 'free', '自由设计', d.mode)}</div>`
      + field(d.mode === 'free' ? '想要什么样的' : '想要的风格（选填）', textArea('wish', d.wish, `rows="2" maxlength="${WARDROBE_LIMITS.wish}" placeholder="例如：入秋的日常装，温柔、轻便"`)) + source
      + `<div class="actions">${btn('suggest', suggesting ? '搭配中…' : '搭一套', 'primary', suggesting ? 'disabled' : '')}</div>`
      + field(`给${who()}的搭配`, textArea('result', d.result, `rows="4" maxlength="${WARDROBE_LIMITS.wear}" placeholder="搭好的在这里，也可以自己写"`))
      + `<div class="actions wardrobe-result-acts">${btn('outfit-wear', '穿上这套', 'primary', none)}${btn('outfit-save', saving ? '存进衣柜…' : '存成一套', 'secondary', saving ? 'disabled' : none)}${btn('outfit-draw', drawing ? '在画…' : '试穿图', 'secondary', drawing ? 'disabled' : none)}</div>${tryOn}`
      + (sets.length ? groupTitle('存过的搭配') + `<div class="group wardrobe-sets">${sets.map(s => `<div class="list-row wardrobe-set" data-id="${esc(s.id)}"><button type="button" class="wardrobe-set-main" data-action="set-load" data-id="${esc(s.id)}"><strong>${esc(s.name)}</strong><small>${esc(s.description)}</small></button><button type="button" class="round-button" data-action="set-more" data-id="${esc(s.id)}" aria-label="${esc(s.name)} 的更多操作">${icon('more')}</button></div>`).join('')}</div>` : '');
  }
  function render() {
    if (v.disposed) return;
    const list = owners();
    if (!list.some(o => o.key === owner)) { owner = 'me'; picked = new Set(); }
    const items = mine(), sets = all.sets.filter(x => x.owner === owner), wear = all.wears.find(w => w.owner === owner), hadBar = !!v.root.querySelector('.wardrobe-bar');
    v.draw(heading('衣柜', help(HELP) + btn('add', icon('add'), 'round-button', `aria-label="往${esc(who())}的衣柜里放衣服"`), `Wardrobe · ${items.length} 件`)
      + ownersRow(list) + (wear ? wearCard(wear) : '')
      + `<div class="segmented wardrobe-tabs" role="group" aria-label="衣柜或搭配">${seg('tab', 'closet', '衣柜', tab)}${seg('tab', 'outfit', '搭配', tab)}</div>`
      + (tab === 'closet' ? closet(items) + (picked.size ? bar() : '') : outfit(items, sets)));
    // The bar stays where it was when the page is drawn again (it came in once).
    if (hadBar) v.root.querySelector('.wardrobe-bar')?.style.setProperty('animation', 'none');
    thumbs();
  }
  /** The small pictures not shown yet, as they come. */
  function thumbs() {
    const want = [...new Set([...v.root.querySelectorAll('img[data-photo]:not([src])')].map(img => img.dataset.photo))].filter(id => !urls.has(id));
    if (!want.length) return;
    eachThumb(api, want.map(id => ({id})), (id, blob) => {
      if (!urls.has(id)) urls.set(id, win.URL.createObjectURL(blob));
      for (const img of v.root.querySelectorAll('img[data-photo]')) if (img.dataset.photo === id) img.src = urls.get(id);
    }, () => !v.disposed).catch(() => {});
  }
  async function load() {
    const ticket = ++turn, got = await api.wardrobe();
    if (v.disposed || ticket !== turn) return;
    all = got;
    for (const id of [...picked]) if (!all.items.some(x => x.id === id && x.owner === owner)) picked.delete(id);
    render();
  }
  /** A pick changed: the tile and the bar, without drawing the page again. */
  function syncPicks() {
    const grid = v.root.querySelector('.wardrobe-grid');
    if (!grid) return;
    for (const el of grid.querySelectorAll('[data-item]')) el.setAttribute('aria-pressed', String(picked.has(el.dataset.item)));
    grid.toggleAttribute('data-picking', picked.size > 0);
    const old = v.root.querySelector('.wardrobe-bar');
    if (!picked.size) { old?.remove(); return; }
    if (old) { old.querySelector('[data-picked-count]').textContent = `已选 ${picked.size} 件`; return; }
    grid.insertAdjacentHTML('afterend', bar());
  }

  // ---------- putting clothes in ----------
  function addSheet() {
    const d = ctx.dialog(`放进${who()}的衣柜`, `<div class="pick-list wardrobe-add">
      <label class="list-row file-button">${icon('image')}<span><strong>拍照或选图片</strong><small>可以多选，放进来会自动认出是什么</small></span><input type="file" accept="${PHOTO_TYPES}" multiple data-add-files aria-label="拍照或选图片"></label>
      <button type="button" class="list-row" data-add="album">${icon('album')}<span><strong>从相册选</strong></span></button>
      <button type="button" class="list-row" data-add="words">${icon('edit')}<span><strong>只写文字</strong></span></button></div>`);
    d.body.addEventListener('change', e => { const files = [...(e.target.closest('[data-add-files]')?.files || [])]; if (files.length) { d.close(); addFiles(files).catch(error => ctx.notify(error.message, {error: true})); } });
    d.body.addEventListener('click', e => {
      const how = e.target.closest('[data-add]')?.dataset.add;
      if (how === 'album') { d.close(); pickFromAlbum().catch(error => ctx.notify(error.message, {error: true})); }
      if (how === 'words') { d.close(); editItem(null); }
    });
  }
  async function addFiles(files) {
    const forWhom = owner, name = fileSafe(who(forWhom)), ids = [];
    if (files.length > AT_ONCE) ctx.notify(`一次最多放 ${AT_ONCE} 件，先放前 ${AT_ONCE} 件`);
    for (const [i, file] of files.slice(0, AT_ONCE).entries()) {
      const photo = await api.addPhoto({name: `衣柜-${name}-${Date.now()}${i ? '-' + i : ''}.${extOf(file)}`, blob: file});
      ids.push((await api.saveWardrobeItem({owner: forWhom, photoId: photo.id})).id);
    }
    if (ids.length) recognizeAll(ids);
  }
  /** 从相册选: photos already there, picked as in the album (a tap, or held and moved); the photo is not copied. */
  async function pickFromAlbum() {
    const forWhom = owner, inside = new Set(all.items.filter(x => x.owner === forWhom && x.photoId).map(x => x.photoId));
    const list = byNewest(await api.listPhotos()).filter(r => !inside.has(r.id)), chosen = new Set();
    if (!list.length) { ctx.notify('相册里没有能放进来的照片'); return; }
    const pieces = photoWall({api, win, tile: (r, url) => `<button type="button" data-id="${esc(r.id)}" aria-pressed="${chosen.has(r.id)}" aria-label="选择 ${esc(r.name)}"><img decoding="async" draggable="false" data-photo="${esc(r.id)}" alt="${esc(r.name)}"${url ? ` src="${esc(url)}"` : ''}></button>`});
    const idle = '点照片来选择，或者按住一滑';
    const d = ctx.dialog('从相册选', `${pieces.html([{rows: list}], ' selecting album-pick')}<div class="actions album-pick-go"><button type="button" class="primary" data-action="go" disabled>${idle}</button></div>`);
    pieces.mount(d.body);
    d.onClose(() => pieces.stop());
    const go = d.body.querySelector('[data-action=go]');
    const show = () => { for (const b of d.body.querySelectorAll('.photo-grid [data-id]')) b.setAttribute('aria-pressed', String(chosen.has(b.dataset.id))); go.disabled = !chosen.size; go.textContent = chosen.size ? `放进衣柜 ${chosen.size} 件` : idle; };
    const sliding = slideSelect({ctx, root: d.body, scroller: d.body, order: () => list.map(r => r.id), picked: id => chosen.has(id), pick: (id, on) => { if (on) chosen.add(id); else chosen.delete(id); }, choosing: () => true, changed: show, covered: () => go.offsetHeight + 12});
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-id]');
      if (b && !sliding.justEnded()) { if (chosen.has(b.dataset.id)) chosen.delete(b.dataset.id); else chosen.add(b.dataset.id); show(); return; }
      if (!e.target.closest('[data-action=go]') || !chosen.size) return;
      if (chosen.size > AT_ONCE) { ctx.notify(`一次最多放 ${AT_ONCE} 件`); return; }
      go.disabled = true;
      try {
        const ids = [];
        for (const id of list.map(r => r.id).filter(id => chosen.has(id))) ids.push((await api.saveWardrobeItem({owner: forWhom, photoId: id})).id);
        d.close();
        recognizeAll(ids);
      } catch (error) { go.disabled = false; ctx.notify(error.message, {error: true}); }
    });
  }
  /** One after another; a failure that is about one photo goes on to the next, any other stops (it would fail them all). */
  async function recognizeAll(ids) {
    for (const id of ids) recognizing.add(id);
    render();
    let failed = '';
    for (const [i, id] of ids.entries()) {
      try { await api.wardrobeRecognize(id); }
      catch (error) {
        failed = failed || error.message;
        if (error.code !== 'ITEM') { for (const rest of ids.slice(i)) recognizing.delete(rest); break; }
      }
      recognizing.delete(id);
    }
    render();
    if (failed) ctx.notify(failed, {error: true});
    else ctx.notify(ids.length > 1 ? `认好了 ${ids.length} 件` : '认好了');
  }
  /** 「⋯」 of a piece (null: one written by hand): its name, category and words, 重新识别, 拿出衣柜. */
  function editItem(id) {
    const old = id ? all.items.find(x => x.id === id) : null;
    if (id && !old) return;
    const forWhom = old?.owner || owner;
    let category = old?.category || '';
    const d = ctx.dialog(old ? old.name : '写一件衣服', `<div class="wardrobe-edit">${old?.photoId ? '<div class="wardrobe-edit-pic"><img alt=""></div>' : ''}
      ${field('名字', input('name', old?.name || '', 'text', `maxlength="${WARDROBE_LIMITS.name}" placeholder="比如：白色亚麻衬衫"`))}
      <div class="field"><span>分类</span><div class="wardrobe-cats" role="group" aria-label="分类">${WARDROBE_CATEGORIES.map(c => `<button type="button" class="wardrobe-filter" data-cat="${esc(c)}" aria-pressed="${c === category}">${esc(c)}</button>`).join('')}</div></div>
      ${field('描述', textArea('description', old?.description || '', `rows="4" maxlength="${WARDROBE_LIMITS.description}" placeholder="颜色、款式、材质、图案……"`))}
      <div class="actions">${old?.photoId ? btn('item-recognize', '重新识别', 'secondary') : ''}${btn('item-save', '保存', 'primary')}</div>
      ${old ? `<div class="actions wardrobe-edit-more">${btn('item-draw', old.photoId ? '重画' : '画出来', 'secondary')}${btn('item-delete', icon('trash') + '拿出衣柜', 'text-button danger-text')}</div>` : ''}</div>`);
    let url = '';
    if (old?.photoId) previewBlob(api, old.photoId).then(small => small || api.getPhoto(old.photoId).then(p => p?.blob || null)).then(blob => {
      const img = d.body.querySelector('.wardrobe-edit-pic img');
      if (blob && img && d.live) { url = win.URL.createObjectURL(blob); img.src = url; }
    }).catch(() => {});
    d.onClose(() => { if (url) win.URL.revokeObjectURL(url); });
    d.body.addEventListener('click', async e => {
      const cat = e.target.closest('[data-cat]');
      if (cat) { category = category === cat.dataset.cat ? '' : cat.dataset.cat; for (const b of d.body.querySelectorAll('[data-cat]')) b.setAttribute('aria-pressed', String(b.dataset.cat === category)); return; }
      const action = e.target.closest('[data-action]')?.dataset.action, value = key => d.body.querySelector(`[data-field=${key}]`).value;
      try {
        if (action === 'item-save') {
          const description = value('description').trim();
          await api.saveWardrobeItem({...(old || {owner: forWhom}), name: value('name'), category, description, recognized: !!old?.recognized && description === old.description});
          d.close();
        } else if (action === 'item-recognize') { d.close(); recognizeAll([old.id]); }
        else if (action === 'item-draw') {
          const button = e.target.closest('[data-action]');
          if (button.disabled) return;
          button.disabled = true; button.textContent = '正在画…';
          try {
            let allowPaid = false;
            for (;;) {
              try { await api.wardrobeDrawItem({id: old.id, allowPaid}); break; }
              catch (error) {
                if (error.code !== 'PAID' || allowPaid) throw error;
                const ask = api.paidPrompt();
                if (!await ctx.confirm(ask.title, ask.text)) return;
                allowPaid = true;
              }
            }
            d.close(); await load(); ctx.notify('画好了，透明图片已放进衣柜');
          } finally { button.disabled = false; button.textContent = old.photoId ? '重画' : '画出来'; }
        }
        else if (action === 'item-delete') {
          d.close();
          if (await ctx.confirm(`把「${old.name}」拿出衣柜？`, old.photoId ? '照片还留在相册里。' : '')) { await api.deleteWardrobe([old.id]); picked.delete(old.id); }
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  // ---------- wearing and outfits ----------
  async function wearPicked() {
    const chosen = mine().filter(x => picked.has(x.id)), missing = chosen.find(x => !x.description);
    if (missing) {
      if (recognizing.has(missing.id)) { ctx.notify('还在认这件衣服，等一下'); return; }
      ctx.notify('先给选中的衣服写上描述');
      editItem(missing.id);
      return;
    }
    await api.setWardrobeWear({owner, text: chosen.map(x => x.description).join('；')});
    picked = new Set();
    ctx.notify(`${who()}穿上了，下一次正文会写进去`);
  }
  async function suggest() {
    const forWhom = owner, d = draft(forWhom);
    suggesting = true;
    render();
    try { d.result = await api.wardrobeSuggest({owner: forWhom, mode: d.mode, wish: d.wish, itemIds: d.mode === 'closet' ? mine().filter(x => picked.has(x.id)).map(x => x.id) : []}); d.photoId = ''; }
    finally { suggesting = false; render(); }
  }
  /** 试穿图: a picture that costs money is drawn only after a yes. */
  async function tryOn() {
    const forWhom = owner, d = draft(forWhom), text = d.result.trim();
    if (!text) return;
    if (api.drawReady && !api.drawReady()) { ctx.notify(api.drawMissing?.() || '还没有设置绘图引擎', {error: true}); return; }
    let allowPaid = false;
    try {
      for (;;) {
        drawing = true;
        render();
        try { d.photoId = await api.wardrobeTryOn({owner: forWhom, text, allowPaid}); break; }
        catch (error) {
          if (error.code !== 'PAID' || allowPaid) throw error;
          drawing = false;
          render();
          const ask = api.paidPrompt();
          if (!await ctx.confirm(ask.title, ask.text)) return;
          allowPaid = true;
        }
      }
      ctx.notify('试穿图画好了，相册的「衣柜试穿」里也有');
    } finally { drawing = false; render(); }
  }
  /**
   * 存成一套: designed freely, the model splits it into pieces and they go into the 衣柜 too (one request); from the 衣柜,
   * with the pieces picked. The same words again are not kept twice.
   */
  async function saveOutfit() {
    const forWhom = owner, d = draft(forWhom), text = d.result.trim();
    if (!text) return;
    saving = true;
    render();
    try {
      const got = await api.wardrobeSaveOutfit({owner: forWhom, text, mode: d.mode, itemIds: d.mode === 'closet' ? mine().filter(x => picked.has(x.id)).map(x => x.id) : []});
      ctx.notify(got.again ? '这套存过了，在下面「存过的搭配」里' : got.added ? `存好了，拆成 ${got.added} 件放进了衣柜` : '存好了，在下面「存过的搭配」里');
    } finally { saving = false; render(); }
  }
  async function setMore(s) {
    const key = await menu(ctx, s.name, [{key: 'wear', icon: 'hanger', label: '穿上'}, {key: 'send', icon: 'share', label: '发给…'}, {key: 'rename', icon: 'edit', label: '改名'}, {key: 'delete', icon: 'trash', label: '删除', danger: true}]);
    if (key === 'wear') { await api.setWardrobeWear({owner: s.owner, text: s.description}); ctx.notify(`${who(s.owner)}穿上了，下一次正文会写进去`); }
    // 衣柜 × 聊天 (0.9.35): the set as a card in a chat, with a picture of one of its pieces when there is one.
    if (key === 'send') {
      const photoId = s.items.map(id => all.items.find(x => x.id === id)?.photoId).find(Boolean) || '';
      await shareToChat(ctx, {title: `把「${s.name}」发给…`, what: '这身', message: {kind: 'outfit', outfit: {name: s.name, text: s.description, owner: s.owner, ...(photoId ? {photoId} : {})}}});
    }
    if (key === 'rename') {
      const d = ctx.dialog('改名', `${field('名字', input('name', s.name, 'text', `maxlength="${WARDROBE_LIMITS.name}"`))}<div class="actions">${btn('rename-save', '保存', 'primary')}</div>`);
      d.body.addEventListener('click', async e => {
        if (!e.target.closest('[data-action=rename-save]')) return;
        try { await api.saveWardrobeSet({...s, name: d.body.querySelector('[data-field=name]').value}); d.close(); } catch (error) { ctx.notify(error.message, {error: true}); }
      });
    }
    if (key === 'delete' && await ctx.confirm(`删除「${s.name}」？`, '')) await api.deleteWardrobe([s.id]);
  }

  // ---------- taps ----------
  function toggle(id) {
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    syncPicks();
  }
  v.on('click', '[data-owner]', el => switchTo(el.dataset.owner));
  v.on('click', '[data-filter]', el => { filter = el.dataset.filter; render(); });
  v.on('click', '[data-item]', (el, e) => { if (!e.target.closest('[data-action]')) toggle(el.dataset.item); });
  v.on('keydown', '[data-item]', (el, e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); toggle(el.dataset.item); } });
  v.root.addEventListener('input', e => {
    const key = e.target.dataset?.field;
    if (key === 'wish') draft().wish = e.target.value;
    if (key !== 'result') return;
    draft().result = e.target.value;
    const none = !e.target.value.trim();
    for (const action of ['outfit-wear', 'outfit-save', 'outfit-draw']) { const b = v.root.querySelector(`[data-action=${action}]`); if (b && !(action === 'outfit-draw' && drawing) && !(action === 'outfit-save' && saving)) b.disabled = none; }
  });
  v.on('click', '[data-action]', async el => {
    const action = el.dataset.action, d = draft();
    switch (action) {
      case 'add': addSheet(); break;
      case 'tab': tab = el.dataset.value; render(); break;
      case 'mode': d.mode = el.dataset.value; render(); break;
      case 'item-edit': editItem(el.dataset.id); break;
      case 'pick-clear': picked = new Set(); syncPicks(); break;
      case 'pick-wear': await wearPicked(); break;
      case 'pick-outfit': tab = 'outfit'; d.mode = 'closet'; render(); v.root.scrollTop = 0; break;
      case 'pick-delete':
        if (await ctx.confirm(`把这 ${picked.size} 件拿出衣柜？`, '照片还留在相册里。')) { await api.deleteWardrobe([...picked]); picked = new Set(); }
        break;
      case 'wear-off': await api.clearWardrobeWear(owner); ctx.notify('脱下了'); break;
      case 'suggest': await v.busy(el, suggest); break;
      case 'outfit-wear': if (d.result.trim()) { await api.setWardrobeWear({owner, text: d.result}); ctx.notify(`${who()}穿上了，下一次正文会写进去`); } break;
      case 'outfit-save': await v.busy(el, saveOutfit); break;
      case 'owners-all': ownersSheet(); break;
      case 'outfit-draw': await v.busy(el, tryOn); break;
      case 'tryon-open': if (d.photoId) openAlbum({ctx, host: v.root.closest('.screen') || ctx.doc.body, ids: [d.photoId], from: el.getBoundingClientRect(), load: id => api.getPhoto(id)}); break;
      case 'set-load': {
        const s = all.sets.find(x => x.id === el.dataset.id);
        if (!s) break;
        d.result = s.description; d.photoId = '';
        render();
        v.root.querySelector('[data-field=result]')?.scrollIntoView?.({block: 'center', behavior: 'smooth'});
        break;
      }
      case 'set-more': { const s = all.sets.find(x => x.id === el.dataset.id); if (s) await setMore(s); break; }
    }
  });
  // Changes from anywhere (a photo recognized, the story changing clothes, a sync) come as one redraw.
  v.onWardrobe = () => { win.clearTimeout(soon); soon = win.setTimeout(() => load().catch(() => {}), 60); };
  v.refresh = () => load();
  const dispose = v.dispose;
  v.dispose = () => { win.clearTimeout(soon); for (const url of urls.values()) win.URL.revokeObjectURL(url); urls.clear(); dispose(); };
  load().catch(error => ctx.notify(error.message, {error: true}));
  return v;
}

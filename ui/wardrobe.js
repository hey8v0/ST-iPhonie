// 衣柜 (0.9.29): clothes for the user and for this card's roles (角色 App). A photo goes in and a model that sees says
// what it is (name, category, words); a tap picks pieces: 穿上 tells the next story reply once, 去搭配 has the model put
// an outfit together from them (or design one from a wish), kept as 存过的搭配 and drawn as a 试穿图. When the story
// changes someone's clothes, 正在穿 follows (host-wardrobe.js). The documents are core/wardrobe.js; photos stay in the album.
import {createView, esc, btn, heading, help, empty, avatar, groupTitle, menu, field, select, input, textArea} from './common.js';
import {icon} from './icons.js';
import {eachThumb, previewBlob} from './thumbs.js';
import {pickReplacement} from './replacement-album.js';
import {openAlbum} from './album-viewer.js';
import {openImageViewer} from '../image-viewer.js';
import {genderOf} from '../core/draw.js';
import {SHARED_OWNER, WARDROBE_CATEGORIES, WARDROBE_LIMITS, ownerKey, ownerName} from '../core/wardrobe.js';
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
const HELP = '衣柜是你和这张卡的角色（角色 App 里的）的，点上面的头像换人。\n放进照片后，能看图的文字模型会认出名字、分类和描述；也可以在单品详情里自己写。\n点图片或名称查看单品，点详情里的图片看大图。长按缩略图进入多选，再点缩略图勾选：「穿上」让下一次正文写进这身衣着（只这一次，之后跟着剧情走）；「去搭配」用选中的衣服搭一套，什么都没选就从整个衣柜挑。\n正文里有人换了衣服，「正在穿」会跟着变。\n试穿图用绘图引擎画，要花钱时先问你。\n放进来的照片在相册的「衣柜」里，试穿图在「衣柜试穿」里。';

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
  const cardKey=()=>api.wardrobeCardKey?.() || '';
  const prefKey=(card)=> 'sttts-closet:'+JSON.stringify([card,owner]);
  const groupsKey=(card)=> 'sttts-closet-groups:'+JSON.stringify(card);
  function sharedPrefs() {
    try {
      const card = cardKey(), pref = JSON.parse(win.localStorage.getItem(prefKey(card))) || {};
      // Before per-person groups, one group selection applied to everyone on the card.
      const groups = pref.groups ?? JSON.parse(win.localStorage.getItem(groupsKey(card)));
      return {...pref, groups: Array.isArray(groups) ? groups : []};
    } catch { return {groups: []}; }
  }
  function defaultCut() {
    const gender = owner === 'me' ? '' : genderOf(ctx.routeFor?.(who())?.appearance);
    return gender === 'girl' ? '女装' : gender === 'boy' ? '男装' : '中性';
  }
  function matchesBorrow(item, pref, cut) {
    return (cut === '*' || item.cut === cut || item.cut === '中性')
      && (!pref.age || !item.age || item.age === pref.age)
      && (!pref.groups.length || item.collections?.some(g => pref.groups.includes(g)));
  }
  function mine() {
    const pref = sharedPrefs(), cut = pref.on && (pref.cut || defaultCut());
    return all.items.filter(x => x.owner === owner || (pref.on && x.shared && matchesBorrow(x, pref, cut)));
  }
  function pictureButton(x, busy = false) {
    const url = urls.get(x.photoId);
    return `<button type="button" class="wardrobe-pic" data-action="item-card-photo" data-id="${esc(x.id)}" aria-label="${picked.size ? '选择' : '查看'} ${esc(x.name)}"${picked.size ? ` aria-pressed="${picked.has(x.id)}"` : ''}>
      <img loading="lazy" decoding="async" draggable="false" data-photo="${esc(x.photoId)}" alt=""${url ? ` src="${esc(url)}"` : ''}>${busy ? '<span class="wardrobe-scan">正在识别…</span>' : ''}<span class="wardrobe-check" aria-hidden="true">${icon('check')}</span></button>`;
  }
  const catalogTile = x => `<div class="wardrobe-catalog-item${x.photoId ? '' : ' text-only'}" data-item="${esc(x.id)}" data-selected="${picked.has(x.id)}">
    ${x.photoId ? pictureButton(x) : ''}
    <button type="button" class="wardrobe-catalog-label" data-catalog-id="${esc(x.id)}"><strong>${esc(x.name)}</strong>${!x.photoId && x.description ? `<span class="catalog-description">${esc(x.description)}</span>` : ''}
    <small>${esc([x.category, x.cut || '未标款式'].filter(Boolean).join(' · '))}</small></button></div>`;
  let catalogOpen = false, ownerScroll = 0, catalogCut = '', catalogAge = '', catalogCategory = '';
  function catalogPage() {
    const items = all.items.filter(x => x.shared);
    const visible = items.filter(x => (!catalogCut || x.cut === catalogCut)
      && (!catalogAge || x.age === catalogAge) && (!catalogCategory || (x.category || UNSORTED) === catalogCategory));
    const sections = new Map();
    for (const item of visible) {
      for (const tag of item.collections?.length ? item.collections : ['']) {
        if (!sections.has(tag)) sections.set(tag, []);
        sections.get(tag).push(item);
      }
    }
    const groups = [...sections].sort(([a], [b]) => a && b ? a.localeCompare(b) : Number(!a) - Number(!b))
      .map(([tag, clothes]) => `<section data-catalog-group="${esc(tag)}">${groupTitle((tag || '未分组') + ' · ' + clothes.length + ' 件')}<div class="wardrobe-grid"${picked.size ? ' data-picking' : ''}>${clothes.map(catalogTile).join('')}</div></section>`).join('');
    const tools = help('点 ＋ 添加衣物。点图片或名称查看和编辑，长按缩略图可以多选。衣物可同时属于多个风格分组。')
      + btn('catalog-add', icon('add'), 'round-button', 'aria-label="新建通用衣物"');
    const tabs = ['', '女装', '男装', '中性'].map(cut => seg('catalog-cut', cut, cut || '全部', catalogCut)).join('');
    const options = values => [['','全部'], ...[...new Set(values)].filter(Boolean).sort().map(value => [value,value])];
    v.draw(heading('通用衣柜', tools, `Shared Wardrobe · ${items.length} 件`)
      + `<div class="segmented wardrobe-tabs" role="group" aria-label="衣物款式">${tabs}</div>
        <details class="wardrobe-refine" data-group="catalog-filters" ${catalogAge || catalogCategory ? 'open' : ''}><summary>筛选${catalogAge || catalogCategory ? ' · ' + esc([catalogCategory,catalogAge].filter(Boolean).join(' · ')) : ''}</summary>
        ${field('分类', select('catalog-category', catalogCategory, options(items.map(x => x.category || UNSORTED))))}
        ${field('年龄段', select('catalog-age', catalogAge, options(items.map(x => x.age))))}</details>`
      + (groups || (items.length ? empty('没有符合筛选的衣物', '', 'hanger') + btn('catalog-reset','清除筛选','secondary') :
        empty('通用衣柜还是空的','','hanger'))) + (picked.size ? bar() : ''));
    thumbs();
  }
  function sharedSettings() {
    const key = prefKey(cardKey()), pref = sharedPrefs(), items = all.items.filter(x => x.shared);
    const groups = [...new Set([...items.flatMap(x => x.collections || []), ...pref.groups])].sort();
    const ages = [...new Set([pref.age, ...items.map(x => x.age)].filter(Boolean))].sort();
    const automatic = defaultCut();
    const cuts = [['', '自动 · ' + automatic], ['女装','女装和中性'], ['男装','男装和中性'], ['中性','仅中性'], ['*','全部款式']];
    const groupButtons = groups.map(g => `<button type="button" class="wardrobe-filter" data-group="${esc(g)}" aria-pressed="${pref.groups.includes(g)}">${esc(g)}</button>`).join('');
    const d = ctx.dialog('通用衣柜设置', `<div class="group pad"><label class="setting-row">为${esc(who())}使用通用衣柜<input class="switch" type="checkbox" data-shared-on ${pref.on ? 'checked' : ''}></label>
      <div data-preferences ${pref.on ? '' : 'hidden'}>
      ${field('款式',select('borrow-cut',pref.cut || '',cuts,'data-cut'),'自动按角色外貌选款式，未识别时使用中性款。')}
      ${field('年龄段',select('borrow-age',pref.age || '',[['','全部'],...ages.map(k => [k,k])],'data-age'))}
      ${groups.length ? `<div class="field"><span>风格标签${help('可多选，留空时使用所有风格。')}</span><div class="wardrobe-cats">${groupButtons}</div></div>` : ''}
      <small data-borrow-count aria-live="polite"></small></div><div class="actions">${btn('apply','保存','primary')}</div></div>`);
    const q = selector => d.body.querySelector(selector);
    const draftPrefs = () => ({
      on: q('[data-shared-on]').checked, cut: q('[data-cut]').value, age: q('[data-age]').value,
      groups: [...d.body.querySelectorAll('[data-group][aria-pressed=true]')].map(el => el.dataset.group)
    });
    function preview() {
      const selected = draftPrefs();
      q('[data-preferences]').hidden = !selected.on;
      const count = items.filter(x => x.owner !== owner && matchesBorrow(x, selected, selected.cut || automatic)).length;
      q('[data-borrow-count]').textContent = `符合条件的通用衣物 · ${count} 件`;
    }
    d.body.onchange = preview;
    d.body.onclick = e => {
      const group = e.target.closest('[data-group]');
      if (group) {
        group.setAttribute('aria-pressed', String(group.getAttribute('aria-pressed') !== 'true'));
        preview(); return;
      }
      if (e.target.closest('[data-action=apply]')) {
        try { win.localStorage.setItem(key, JSON.stringify(draftPrefs())); }
        catch { ctx.notify('设置保存失败，请检查浏览器存储', {error:true}); return; }
        picked.clear(); drafts.delete(owner); d.close(); render();
      }
    };
    preview();
  }
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
    const busy = recognizing.has(x.id), id = esc(x.id), name = esc(x.name);
    const pic = x.photoId ? pictureButton(x, busy) : `<button type="button" class="wardrobe-pic" data-action="item-card-photo" data-id="${id}" aria-label="${picked.size ? '选择' : '查看'} ${name}"${picked.size ? ` aria-pressed="${picked.has(x.id)}"` : ''}><span class="wardrobe-words">${esc(x.description)}</span><span class="wardrobe-check" aria-hidden="true">${icon('check')}</span></button>`;
    return `<div class="wardrobe-item" data-flip="wardrobe:${id}" data-item="${id}" data-selected="${picked.has(x.id)}">${pic}
      <button type="button" class="wardrobe-name" data-action="item-edit" data-id="${id}">${name}</button>
      ${x.description || busy ? '' : '<span class="wardrobe-todo">待写描述</span>'}</div>`;
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
  const bar = () => `<div class="select-bar wardrobe-bar" role="toolbar" aria-label="选中的衣服"><div class="select-head"><span data-picked-count>已选 ${picked.size} 件</span>${btn('pick-clear', '清空', 'text-button')}</div><div class="select-acts">${catalogOpen ? '' : act('pick-wear', 'hanger', '穿上') + act('pick-outfit', 'wand', '去搭配')}${act('pick-delete', 'trash', '拿出衣柜', ' select-danger')}</div></div>`;
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
    if (catalogOpen) return catalogPage();
    const list = owners();
    if (!list.some(o => o.key === owner)) { owner = 'me'; picked = new Set(); }
    const items = mine(), sets = all.sets.filter(x => x.owner === owner), wear = all.wears.find(w => w.owner === owner), hadBar = !!v.root.querySelector('.wardrobe-bar');
    const sharedOn = !!sharedPrefs().on;
    const libraryEntry = `<div class="wardrobe-library-entry" data-enabled="${sharedOn}">
      ${btn('shared-closet',icon('hanger') + '<span>通用衣柜 · ' + all.items.filter(item => item.shared).length + ' 件</span>'
        + '<small class="wardrobe-library-status">' + (sharedOn ? icon('check') + '已启用' : '未启用') + '</small>', 'secondary')}
      ${btn('shared-settings',icon('sliders'),'round-button','aria-label="通用衣柜设置" title="通用衣柜设置"')}</div>`;
    v.draw(heading('衣柜', help(HELP) + btn('add', icon('add'), 'round-button', `aria-label="往${esc(who())}的衣柜里放衣服"`), `Wardrobe · ${items.length} 件`)
      + ownersRow(list) + libraryEntry + (wear ? wearCard(wear) : '')
      + `<div class="segmented wardrobe-tabs" role="group" aria-label="衣柜或搭配">${seg('tab', 'closet', '衣柜', tab)}${seg('tab', 'outfit', '搭配', tab)}</div>`
      + (tab === 'closet' ? closet(items) + (picked.size ? bar() : '') : outfit(items, sets)));
    // The bar stays where it was when the page is drawn again (it came in once).
    if (hadBar) v.root.querySelector('.wardrobe-bar')?.style.setProperty('animation', 'none');
    thumbs();
  }
  /** The small pictures not shown yet, as they come. */
  function thumbs(root = v.root, alive = () => !v.disposed) {
    const want = [...new Set([...root.querySelectorAll('img[data-photo]:not([src])')].map(img => img.dataset.photo))].filter(id => !urls.has(id));
    if (!want.length) return;
    eachThumb(api, want.map(id => ({id})), (id, blob) => {
      if (!urls.has(id)) urls.set(id, win.URL.createObjectURL(blob));
      for (const img of root.querySelectorAll('img[data-photo]')) if (img.dataset.photo === id) img.src = urls.get(id);
    }, alive).catch(() => {});
  }
  async function load() {
    const ticket = ++turn, got = await api.wardrobe();
    if (v.disposed || ticket !== turn) return;
    all = got;
    for (const id of [...picked]) if (!(catalogOpen ? all.items.filter(x => x.shared) : mine()).some(x => x.id === id)) picked.delete(id);
    render();
  }
  /** A pick changed: the tile and the bar, without drawing the page again. */
  function syncPicks() {
    const grids = [...v.root.querySelectorAll('.wardrobe-grid')];
    if (!grids.length) return;
    for (const grid of grids) {
      grid.toggleAttribute('data-picking', picked.size > 0);
      for (const el of grid.querySelectorAll('[data-item]')) {
        const selected = String(picked.has(el.dataset.item)), button = el.querySelector('[data-action=item-card-photo]');
        el.dataset.selected = selected;
        if (!button) continue;
        if (picked.size) button.setAttribute('aria-pressed', selected);
        else button.removeAttribute('aria-pressed');
        const name = el.querySelector('.wardrobe-name, strong')?.textContent || '';
        button.setAttribute('aria-label', (picked.size ? '选择 ' : '查看 ') + name);
      }
    }
    const old = v.root.querySelector('.wardrobe-bar');
    if (!picked.size) { old?.remove(); return; }
    if (old) { old.querySelector('[data-picked-count]').textContent = `已选 ${picked.size} 件`; return; }
    if (catalogOpen) v.root.insertAdjacentHTML('beforeend', bar());
    else grids[0].insertAdjacentHTML('afterend', bar());
  }

  // ---------- putting clothes in ----------
  function addSheet(sharedCatalog = false) {
    const d = ctx.dialog(sharedCatalog ? '添加通用衣物' : `放进${who()}的衣柜`, `<div class="pick-list wardrobe-add">
      <label class="list-row file-button">${icon('image')}<span><strong>拍照或选图片</strong>${sharedCatalog ? '' : '<small>可以多选，放进来会自动认出是什么</small>'}</span><input type="file" accept="${PHOTO_TYPES}" ${sharedCatalog ? '' : 'multiple'} data-add-files aria-label="拍照或选图片"></label>
      <button type="button" class="list-row" data-add="album">${icon('album')}<span><strong>从相册选</strong></span></button>
      <button type="button" class="list-row" data-add="words">${icon('edit')}<span><strong>只写文字</strong></span></button></div>`);
    d.body.addEventListener('change', e => { const files = [...(e.target.closest('[data-add-files]')?.files || [])]; if (!files.length) return;
      d.close();
      if (sharedCatalog) editItem(null, {sharedCatalog, changed:load, file:files[0]});
      else addFiles(files).catch(error => ctx.notify(error.message, {error: true})); });
    d.body.addEventListener('click', e => {
      const how = e.target.closest('[data-add]')?.dataset.add;
      if (how === 'album') { d.close(); pickFromAlbum(sharedCatalog).catch(error => ctx.notify(error.message, {error: true})); }
      if (how === 'words') { d.close(); editItem(null, {sharedCatalog, changed:load}); }
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
  /** A photo already in the album keeps its existing file, whatever view it was picked from. */
  async function pickFromAlbum(sharedCatalog = false) {
    const forWhom = sharedCatalog ? SHARED_OWNER : owner;
    const exclude = new Set(all.items.filter(x => x.owner === forWhom && x.photoId).map(x => x.photoId));
    const selection = await pickReplacement(ctx, api, {title:'从相册选', device:false, exclude, multiple:sharedCatalog ? 0 : AT_ONCE});
    if (!selection || v.disposed || catalogOpen !== sharedCatalog || (!sharedCatalog && owner !== forWhom)) return;
    if (sharedCatalog) {
      editItem(null, {sharedCatalog, photoId:selection});
      return;
    }
    const ids = [];
    for (const photoId of selection) ids.push((await api.saveWardrobeItem({owner:forWhom, photoId})).id);
    if (ids.length) await recognizeAll(ids);
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
  function editItem(id, {sharedCatalog = false, changed = load, file, photoId = ''} = {}) {
    const old = id ? all.items.find(x => x.id === id) : null;
    if (id && !old) return;
    if (old && old.owner !== owner && !old.shared) return;
    const forWhom = old?.owner || (sharedCatalog ? SHARED_OWNER : owner);
    photoId ||= old?.photoId || '';
    const hasPhoto = !!(photoId || file);
    const inLibrary = forWhom === SHARED_OWNER, sharing = inLibrary || old?.shared;
    let category = old?.category || '', recognizedDescription = old?.recognized ? old.description : null;
    const d = ctx.dialog(old ? old.name : inLibrary ? '新建通用衣物' : '写一件衣服', `<div class="wardrobe-edit">${hasPhoto ? '<button type="button" class="wardrobe-edit-pic" data-action="zoom-item" aria-label="放大衣物照片"><img alt="衣物照片"></button>' : ''}
      ${field('名字', input('name', old?.name || '', 'text', `maxlength="${WARDROBE_LIMITS.name}" placeholder="比如：白色亚麻衬衫"`))}
      <div class="field"><span>分类</span><div class="wardrobe-cats" role="group" aria-label="分类">${WARDROBE_CATEGORIES.map(c => `<button type="button" class="wardrobe-filter" data-cat="${esc(c)}" aria-pressed="${c === category}">${esc(c)}</button>`).join('')}</div></div>
      <label class="setting-row" ${inLibrary ? 'hidden' : ''}>放入通用衣柜<input type="checkbox" class="switch" data-field="shared" ${sharing?'checked':''}></label>
      <div data-sharing ${sharing?'':'hidden'}>
      ${field('款式',select('cut',old?.cut || '',[['',inLibrary && !old ? '请选择款式' : '未标款式'],['男装','男装'],['女装','女装'],['中性','中性']]))}
      ${field('风格标签',input('collections',(old?.collections || []).join('、'),'text','placeholder="例如：古风、冬装"'),'同一风格填同一个名字。多个分组用顿号隔开，例如「古风、冬装」。')}
      ${field('年龄段',input('age',old?.age || '','text','maxlength="24" placeholder="不限，例如：儿童"'))}</div>
      ${field('描述', textArea('description', old?.description || '', `rows="4" maxlength="${WARDROBE_LIMITS.description}" placeholder="颜色、款式、材质、图案……"`))}
      <div class="actions">${hasPhoto && (api.wardrobeInspect || old && api.wardrobeRecognize) ? btn('item-recognize', old?.description ? '重新识别' : '识别衣物', 'secondary') : ''}${btn('item-save', '保存', 'primary')}</div>
      ${old ? `<div class="actions wardrobe-edit-more">${btn('item-draw', old.photoId ? '重画' : '画出来', 'secondary')}${btn('item-delete', icon('trash') + '拿出衣柜', 'text-button danger-text')}</div>` : ''}</div>`, {over:sharedCatalog});
    d.body.querySelector('[data-field=shared]').onchange=e=>{d.body.querySelector('[data-sharing]').hidden=!e.target.checked;};
    let url = '', fullURL = '', viewer;
    if (hasPhoto) (file ? Promise.resolve(file) : previewBlob(api, photoId).then(small => small || api.getPhoto(photoId).then(p => p?.blob || null))).then(blob => {
      const img = d.body.querySelector('.wardrobe-edit-pic img');
      if (blob && img && d.live) { url = win.URL.createObjectURL(blob); img.src = url; }
    }).catch(() => {});
    d.onClose(() => {
      viewer?.close();
      if (url) win.URL.revokeObjectURL(url);
      if (fullURL) win.URL.revokeObjectURL(fullURL);
    });
    d.body.addEventListener('click', async e => {
      const cat = e.target.closest('[data-cat]');
      if (cat) { category = category === cat.dataset.cat ? '' : cat.dataset.cat; for (const b of d.body.querySelectorAll('[data-cat]')) b.setAttribute('aria-pressed', String(b.dataset.cat === category)); return; }
      const action = e.target.closest('[data-action]')?.dataset.action, value = key => d.body.querySelector(`[data-field=${key}]`).value;
      try {
        if (action === 'zoom-item') {
          const button = e.target.closest('button');
          if (button.disabled) return;
          button.disabled = true;
          try {
            if (!fullURL) {
              const blob = file || (await api.getPhoto(photoId))?.blob;
              if (!d.live) return;
              if (!blob) throw Error('这张照片已经不在相册里了');
              fullURL = win.URL.createObjectURL(blob);
            }
            viewer = openImageViewer({doc:ctx.doc, src:fullURL, alt:old?.name || '衣物照片', from:button});
          } finally { button.disabled = false; }
        } else if (action === 'item-save') {
          const save = e.target.closest('[data-action]');
          if (save.disabled) return;
          save.disabled = true;
          if (inLibrary && !old && !value('cut')) throw Error('请选择这件衣物的款式：男装、女装或中性');
          const description = value('description').trim();
          if (!description && !hasPhoto) throw Error('写一下这件衣服是什么样的');
          if (!photoId && file) {
            const photo = await api.addPhoto({name: `衣柜-通用-${Date.now()}.${extOf(file)}`, blob: file});
            photoId = photo.id;
          }
          await api.saveWardrobeItem({...(old || {owner: forWhom}), ...(photoId ? {photoId} : {}), name: value('name'), category, description, shared:d.body.querySelector('[data-field=shared]').checked,cut:value('cut'),age:value('age'),collections:value('collections').split(/[,，、]/), recognized: recognizedDescription !== null && description === recognizedDescription});
          d.close(); await changed?.();
        } else if (action === 'item-recognize') {
          const button = e.target.closest('[data-action]'), save = d.body.querySelector('[data-action=item-save]');
          if (button.disabled || save.disabled) return;
          if (!api.wardrobeInspect) {
            if (await ctx.confirm('重新识别衣物？', '识别结果会覆盖这件衣物的描述。', {over:true})) { d.close(); await recognizeAll([old.id]); }
            return;
          }
          const description = d.body.querySelector('[data-field=description]'), name = d.body.querySelector('[data-field=name]');
          const before = {description: description.value, name: name.value, category};
          button.disabled = save.disabled = true;
          const label = button.textContent;
          button.textContent = '正在识别…';
          try {
            const got = await api.wardrobeInspect(file ? {blob:file} : {photoId});
            if (!d.live) return;
            if (description.value !== before.description || name.value !== before.name || category !== before.category) {
              ctx.notify('识别期间已编辑衣物。再点一次识别可更新描述。');
              return;
            }
            description.value = recognizedDescription = got.description;
            if (!name.value.trim()) name.value = got.name || '';
            if (!category && got.category) {
              category = got.category;
              for (const b of d.body.querySelectorAll('[data-cat]')) b.setAttribute('aria-pressed', String(b.dataset.cat === category));
            }
          } finally { button.disabled = save.disabled = false; button.textContent = label; }
        } else if (action === 'item-draw') {
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
            d.close(); await (changed ? changed() : load()); ctx.notify('画好了，图片已放进衣柜');
          } finally { button.disabled = false; button.textContent = old.photoId ? '重画' : '画出来'; }
        }
        else if (action === 'item-delete') {
          d.close();
          if (await ctx.confirm(`把「${old.name}」拿出衣柜？`, old.shared ? '这件衣物也会从其他角色的通用衣柜中移除。' : old.photoId ? '照片还留在相册里。' : '')) { await api.deleteWardrobe([old.id]); picked.delete(old.id); await changed?.(); }
        }
      } catch (error) {
        if (action === 'item-save') d.body.querySelector('[data-action=item-save]').disabled = false;
        ctx.notify(error.message, {error: true});
      }
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
    try { d.result = await api.wardrobeSuggest({owner: forWhom, mode: d.mode, wish: d.wish, itemIds: d.mode === 'closet' ? mine().filter(x => !picked.size || picked.has(x.id)).map(x => x.id) : []}); d.photoId = ''; }
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
      const got = await api.wardrobeSaveOutfit({owner: forWhom, text, photoId: d.photoId, mode: d.mode, itemIds: d.mode === 'closet' ? mine().filter(x => picked.has(x.id)).map(x => x.id) : []});
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
  let held, pressedClick = '', suppressTimer = 0;
  function cancelHold() {
    if (held) win.clearTimeout(held.timer);
    held = null;
  }
  v.on('pointerdown', '[data-action=item-card-photo]', (el, event) => {
    win.clearTimeout(suppressTimer);
    pressedClick = '';
    if (event.button > 0 || held) return;
    const id = el.dataset.id;
    held = {id:event.pointerId, x:event.clientX, y:event.clientY, timer:win.setTimeout(() => {
      if (!v.root.contains(el)) return;
      pressedClick = id;
      picked.add(id);
      syncPicks();
    }, 400)};
  });
  v.root.addEventListener('pointermove', e => {
    if (held?.id === e.pointerId && Math.hypot(e.clientX - held.x, e.clientY - held.y) > 9) cancelHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) v.root.addEventListener(type, e => {
    if (held?.id === e.pointerId) cancelHold();
    if (!pressedClick) return;
    win.clearTimeout(suppressTimer);
    suppressTimer = win.setTimeout(() => { pressedClick = ''; }, 450);
  });
  v.on('contextmenu', '[data-action=item-card-photo]', (el, event) => {
    event.preventDefault();
  });
  v.on('keydown', '[data-action=item-card-photo]', (el, event) => {
    if (event.shiftKey && event.key === ' ') { event.preventDefault(); toggle(el.dataset.id); }
  });
  v.back = () => {
    if (picked.size && (catalogOpen || tab === 'closet')) { picked.clear(); syncPicks(); return true; }
    if (!catalogOpen) return false;
    catalogOpen = false; render(); v.root.scrollTop = ownerScroll;
    return true;
  };
  v.on('change', '[data-field^=catalog-]', el => {
    if (el.dataset.field === 'catalog-category') catalogCategory = el.value;
    else catalogAge = el.value;
    render();
  });
  v.on('click', '[data-catalog-id]', el => {
    const item = all.items.find(x => x.id === el.dataset.catalogId);
    if (!item) return;
    editItem(item.id, {sharedCatalog:true});
  });
  v.on('click', '[data-owner]', el => switchTo(el.dataset.owner));
  v.on('click', '[data-filter]', el => { filter = el.dataset.filter; render(); });
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
      case 'item-card-photo':
        if (pressedClick === el.dataset.id) { pressedClick = ''; break; }
        if (picked.size) toggle(el.dataset.id);
        else editItem(el.dataset.id, {sharedCatalog:catalogOpen});
        break;
      case 'pick-clear': picked = new Set(); syncPicks(); break;
      case 'pick-wear': await wearPicked(); break;
      case 'pick-outfit': tab = 'outfit'; d.mode = 'closet'; render(); v.root.scrollTop = 0; break;
      case 'pick-delete':
        {
          const ids = [...picked], shared = all.items.some(item => item.shared && picked.has(item.id));
          if (await ctx.confirm(`把这 ${ids.length} 件拿出衣柜？`, shared ? '其中的通用衣物也会从其他角色的通用衣柜中移除。照片仍留在相册。' : '照片还留在相册里。')) {
            await api.deleteWardrobe(ids); picked.clear(); await load();
          }
          break;
        }
      case 'wear-off': await api.clearWardrobeWear(owner); ctx.notify('脱下了'); break;
      case 'suggest': await v.busy(el, suggest); break;
      case 'outfit-wear': if (d.result.trim()) { await api.setWardrobeWear({owner, text: d.result}); ctx.notify(`${who()}穿上了，下一次正文会写进去`); } break;
      case 'outfit-save': await v.busy(el, saveOutfit); break;
      case 'shared-closet':
        ownerScroll = v.root.scrollTop; picked.clear(); catalogOpen = true;
        catalogAge = catalogCut = catalogCategory = ''; render(); v.root.scrollTop = 0; break;
      case 'shared-settings': sharedSettings(); break;
      case 'catalog-cut': catalogCut = el.dataset.value; render(); break;
      case 'catalog-reset': catalogAge = catalogCut = catalogCategory = ''; render(); break;
      case 'catalog-add': addSheet(true); break;
      case 'owners-all': ownersSheet(); break;
      case 'outfit-draw': await v.busy(el, tryOn); break;
      case 'tryon-open': if (d.photoId) openAlbum({ctx, host: v.root.closest('.screen') || ctx.doc.body, ids: [d.photoId], from: el.getBoundingClientRect(), load: id => api.getPhoto(id)}); break;
      case 'set-load': {
        const s = all.sets.find(x => x.id === el.dataset.id);
        if (!s) break;
        d.result = s.description; d.photoId = s.photoId || '';
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
  v.leave = () => { cancelHold(); pressedClick = ''; };
  const dispose = v.dispose;
  v.dispose = () => { cancelHold(); win.clearTimeout(suppressTimer); win.clearTimeout(soon); for (const url of urls.values()) win.URL.revokeObjectURL(url); urls.clear(); dispose(); };
  load().catch(error => ctx.notify(error.message, {error: true}));
  return v;
}

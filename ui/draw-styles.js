// 画风 in the drawing app: the list and the editor. The list works the way Procreate's layers do, and looks it: rows are
// cards with the 效果图 on the left (the same tile when there is none yet, so they line up), and the one in use is a colour
// of its own. A tap on the tile shows the 效果图 big (and pages through the others) or adds one. A tap uses a 画风; a
// tap on a group opens or shuts it. Held still, a row lifts and follows the finger while the others make room: a 画风
// goes between others, into an open group or out of one, or onto a shut group's row (into it); a group moves with all
// its 画风. Swiped left a row shows 改 / 复制 / 删除 (a group: 改名 / 解散 / 删除); swiped right rows are picked, to put
// them in a new group or delete them. Every 画风 shows at once (rows are text, and groups fold); the search box finds
// one by its name or 画师串, and while it is used the list is flat and does not move.
// Each 画风 keeps its NovelAI parameters (core/draw.js STYLE_PARAM_KEYS): shown in its row and its editor, and put back
// when it is picked.
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {esc, btn, field, input, textArea} from './common.js';
import {icon} from './icons.js';
import {layerSort} from './layer-sort.js';
import {styleTree, styleOfWords, styleSample} from '../core/draw.js';
import {openImageViewer} from '../image-viewer.js';
import {pickPicture} from './draw-images.js';

/** One line for a 画风's parameters: 「V4.5 Full · 28 步 · CFG 5 · k_euler_ancestral」. */
export const paramLine = (p, names = {}) => [names[p.model] || p.model, `${p.steps} 步`, `CFG ${p.scale}`, p.sampler].join(' · ');

const norm = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase();
const coverArt = s => `${icon('image')}${s.cover ? `<img src="${esc(s.cover.thumb)}" alt="" loading="lazy" decoding="async" draggable="false">` : ''}`;
/** The tile on the left of a 画风's row. */
const coverTile = s => `<button type="button" class="style-cover" data-style-cover="${esc(s.id)}" aria-label="${s.cover ? '看' : '给'}「${esc(s.name)}」${s.cover ? '的' : '加'}效果图">${coverArt(s)}</button>`;
/** A 效果图 whose file is gone (another tavern, a backup without files) shows as none: the tile and the chip on the page. */
export const watchCovers = root => root.addEventListener('error', e => { if (e.target.matches?.('.style-cover img, .chip-cover')) e.target.remove(); }, true);
const SAMPLE = '1girl, solo, smile, upper body, looking at viewer';

/** state(): the drawing settings; styleId() / style(): the 画风 in use (its id / itself); render(): draws the app again;
 *  shownPicture(): the picture on show in the app as a Blob (a promise), or null when there is none; afterPaid(): a
 *  picture that cost something has been drawn. */
export function styleSheets({ctx, state, styleId, style, render, shownPicture = () => null, afterPaid = () => {}}) {
  const {api} = ctx;
  // leaveList closes the list when it is what is open.
  let sample = SAMPLE, afterCover = () => {}, leaveList = () => {};
  const line = p => paramLine(p, api.drawCatalog?.modelNames);
  /** The list as it shows, in the shape api.arrangeStyles takes. */
  const tree = () => styleTree(state()).map(e => e.style ? {style: e.style.id} : {group: {...e.group}, styles: e.styles.map(s => s.id)});
  const groupOf = id => tree().find(e => e.group?.id === id) || null;
  /** Picked rows as 画风: a group's row stands for its 画风. */
  const stylesOf = ids => [...new Set(ids.flatMap(id => id.startsWith('g:') ? groupOf(id.slice(2))?.styles || [] : [id]))];
  const groupName = () => { const taken = new Set(state().styleGroups.map(g => g.name)); for (let n = 1; ; n++) { const name = n === 1 ? '新建组' : `新建组 ${n}`; if (!taken.has(name)) return name; } };

  function pickStyle() {
    const all = () => state().styles;
    const d = ctx.dialog('画风', `<div class="style-picker"><div class="picker-search" hidden><input type="search" data-style-search aria-label="搜索画风、画师串" placeholder="搜索画风、画师串…" autocomplete="off"></div><div class="style-list" data-style-list></div></div>`, {add: '新建画风'});
    const list = d.body.querySelector('[data-style-list]'), search = d.body.querySelector('[data-style-search]');
    let query = '';
    const styleActions = () => [{key: 'edit', label: '改', icon: 'edit'}, {key: 'copy', label: '复制', icon: 'copy'}, ...(all().length > 1 ? [{key: 'delete', label: '删除', icon: 'trash', danger: true}] : [])];
    const groupActions = [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'ungroup', label: '解散', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
    const styleRow = (s, using) => swipeRow(s.id, `<div class="list-row style-row" aria-current="${s.id === using}">${coverTile(s)}<span><strong>${esc(s.name)}</strong><small class="mono picker-preview">${esc(s.artist || '没有画师串')}</small>${s.params ? `<small class="style-params">${esc(line(s.params))}</small>` : ''}</span></div>`, styleActions(), {label: s.name, ...(s.id === using ? {className: 'style-on'} : {})});
    const groupRows = (g, styles, using) => swipeRow('g:' + g.id, `<div class="list-row style-group-row" aria-expanded="${g.open}"><span class="style-group-chevron">${icon('chevron')}</span><span class="style-group-art">${icon('layers')}</span><span><strong data-group-name>${esc(g.name)}</strong><small>${styles.length} 个画风${styles.some(s => s.id === using) ? ' · 在用的在里面' : ''}</small></span></div>`, groupActions, {className: 'style-group', label: g.name})
      + `<div class="style-group-body" data-group-body="${esc(g.id)}"${g.open ? '' : ' data-closed'}><div class="style-group-inner">${styles.map(s => styleRow(s, using)).join('')}</div></div>`;
    function paint() {
      const using = styleId(), draw = state();
      list.classList.toggle('searching', !!query);
      if (query) {
        const found = styleTree(draw).flatMap(e => e.style ? [e.style] : e.styles).filter(s => norm(s.name + ' ' + s.artist).includes(query));
        list.innerHTML = found.map(s => styleRow(s, using)).join('') || '<p class="hint">没有匹配的画风</p>';
      } else list.innerHTML = styleTree(draw).map(e => e.style ? styleRow(e.style, using) : groupRows(e.group, e.styles, using)).join('');
      search.closest('.picker-search').hidden = draw.styles.length <= 6 && !query;
    }
    const {places, flip, arrange, toggle, rename, makeGroup, lift} = layerSort({ctx, list, tree, commit: next => api.arrangeStyles(next), paint, groupName});
    const again = () => { swipe.dispose(); d.close(); pickStyle(); };
    paint();
    afterCover = () => { if (d.live !== false) paint(); };
    leaveList = () => { swipe.dispose(); d.close(); };
    watchCovers(list);
    // The one in use in sight, in a long list.
    const on = list.querySelector('.style-on'), box = list.closest('.sheet-body');
    if (on && box && !on.closest('[data-closed]')) { const top = on.getBoundingClientRect().top - box.getBoundingClientRect().top; if (top > box.clientHeight * .7) box.scrollTop += top - box.clientHeight / 3; }
    const swipe = mountSwipeList(list, {ctx,
      hint: '点一下用这个画风，点左边的图看效果图；按住可以拖动排序；左滑：改、复制、删除；右滑：多选、建组；点组：展开或收起',
      mouseHint: '点一下用这个画风，点左边的图看效果图；按住可以拖动排序；⋯ 或右键：改、复制、删除；Ctrl / ⌘ 点：多选、建组；点组：展开或收起',
      sort: {start: (row, point) => query ? null : lift(row, point)},
      onTap: id => {
        if (id.startsWith('g:')) return toggle(id.slice(2));
        api.saveDraw({activeStyle: id}); d.close(); render();
      },
      onAction: async (key, id) => {
        try {
          if (id.startsWith('g:')) {
            const gid = id.slice(2), entry = groupOf(gid);
            if (!entry) return;
            if (key === 'rename') rename(gid);
            else if (key === 'ungroup') arrange(tree().flatMap(e => e.group?.id === gid ? e.styles.map(s => ({style: s})) : [e]));
            else if (key === 'delete') {
              if (entry.styles.length >= all().length) throw Error('至少要留一个画风');
              if (!await ctx.confirm(`删除组「${entry.group.name}」？`, `里面的 ${entry.styles.length} 个画风会一起删掉。只想拆开组，用「解散」。`)) return;
              api.deleteStyles(entry.styles); render(); again();
            }
            return;
          }
          const target = all().find(x => x.id === id);
          if (!target) return;
          if (key === 'edit') { swipe.dispose(); d.close(); editStyle(target); }
          else if (key === 'copy') {
            const before = places();
            api.saveStyle({name: (target.name + ' 副本').slice(0, 40), artist: target.artist, positive: target.positive, negative: target.negative, params: target.params, cover: target.cover, after: target.id});
            flip(paint, before);
            ctx.notify('复制好了');
          } else if (key === 'delete' && await ctx.confirm(`删除画风「${target.name}」？`, '其他画风保留。')) { api.deleteStyle(id); render(); again(); }
        } catch (error) { ctx.notify(error.message, {error: true}); }
      },
      bulk: [{key: 'group', label: '建组', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}],
      onBulk: async (key, ids) => {
        if (key === 'group') return makeGroup(ids);
        if (key !== 'delete') return;
        const styles = stylesOf(ids);
        if (styles.length >= all().length) throw Error('至少要留一个画风');
        if (!await ctx.confirm(`删除这 ${styles.length} 个画风？`, '其他画风保留。')) return;
        api.deleteStyles(styles); render(); again();
      }});
    search.addEventListener('input', () => { query = norm(search.value).trim(); swipe.done(); paint(); });
    // The tile: the picture big, or adding one. A tap that was for something else (a swipe, picking rows) stops before here.
    list.addEventListener('click', e => {
      const tile = e.target.closest('[data-style-cover]'), target = tile && all().find(x => x.id === tile.dataset.styleCover);
      if (!target) return;
      if (target.cover && tile.querySelector('img')) showCovers(target, tile);
      else coverSheet(target);
    });
    d.onClose?.(() => { swipe.dispose(); afterCover = () => {}; leaveList = () => {}; });
    d.overlay.addEventListener('click', e => {
      if (!e.target.closest('[data-sheet-add]')) return;
      try {
        const now = style(), created = api.saveStyle({name: '新画风 ' + (all().length + 1), artist: '', positive: now.positive, negative: now.negative});
        api.saveDraw({activeStyle: created.id});
        swipe.dispose(); d.close(); render(); editStyle(created);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /**
   * The 效果图 big, paging through the others in the list's order: use one from here, or change it. closeSheet: the
   * 效果图 sheet this was opened from, which either of them is done with.
   */
  function showCovers(which, from, closeSheet = () => {}) {
    const covered = styleTree(state()).flatMap(e => e.style ? [e.style] : e.styles).filter(x => x.cover);
    openImageViewer({doc: ctx.doc, from, gallery: {items: covered.map(x => ({src: x.cover.full, alt: x.name, caption: x.name})), index: Math.max(0, covered.findIndex(x => x.id === which.id))},
      actions: [{label: '用这个', run: i => { api.saveDraw({activeStyle: covered[i].id}); closeSheet(); leaveList(); afterCover(); render(); }}, {label: '换图', run: i => { closeSheet(); coverSheet(covered[i]); }}]});
  }
  /**
   * Adding or changing a 画风's 效果图: any picture, the one on show, or one drawn now with this 画风. It opens over the list
   * (or the 画风's page), which is there again underneath, with the new picture in place, when this one goes.
   */
  function coverSheet(which, {drawing = false} = {}) {
    const now = () => state().styles.find(x => x.id === which.id) || which;
    const d = ctx.dialog(`${now().name} · 效果图`, '', {over: true});
    const paint = () => {
      const s = now(), picture = shownPicture();
      d.body.innerHTML = `<div class="cover-big">${s.cover ? `<button type="button" data-cover-view aria-label="看大图"><img src="${esc(s.cover.full)}" alt="${esc(s.name)} 的效果图"></button>` : `<div class="cover-none">${icon('image')}</div>`}</div>
        <div class="actions cover-actions">${btn('cover-pick', icon('import') + '选一张图', 'secondary')}${picture ? btn('cover-shown', icon('image') + '用刚画的', 'secondary') : ''}</div>
        ${field('或者用这个画风画一张', `<div class="music-selfhost">${input('cover-words', sample, 'text', 'autocomplete="off" spellcheck="false"')}${btn('cover-draw', icon('paint') + '画', 'secondary small')}</div>`, '按这个画风自己的设置画，图也会存进相册。要扣 Anlas 或花钱时会先问。')}
        ${s.cover ? `<div class="actions cover-clear">${btn('cover-clear', icon('trash') + '去掉效果图', 'text-button danger-text')}</div>` : ''}`;
    };
    const changed = message => { if (message) ctx.notify(message); afterCover(); if (d.live !== false) paint(); render(); };
    const put = async blob => { await api.setStyleCover(which.id, blob); changed(`已放到「${now().name}」的效果图`); };
    async function drawOne(allowPaid) {
      const el = d.body.querySelector('[data-action=cover-draw]'), label = el.innerHTML, input = styleSample(state(), now(), sample);
      el.disabled = true; el.textContent = '正在画…';
      try {
        const made = await api.generateImage({...input, allowPaid, name: '效果图-' + now().name, label: `效果图 · ${now().name}`});
        if (allowPaid) afterPaid();
        await put((await api.getPhoto(made.photoId))?.blob);
      } finally { if (el.isConnected) { el.disabled = false; el.innerHTML = label; } }
    }
    d.body.addEventListener('input', e => { if (e.target.dataset.field === 'cover-words') sample = e.target.value; });
    d.body.addEventListener('click', async e => {
      const el = e.target.closest('button');
      if (!el || el.disabled) return;
      try {
        if (el.matches('[data-cover-view]')) showCovers(now(), el, () => d.close());
        // The picker takes this sheet's place: when it is done the list is what is there, with the new picture.
        else if (el.dataset.action === 'cover-pick') { const blob = await pickPicture(ctx, api, '选一张当效果图'); if (blob) await put(blob); }
        else if (el.dataset.action === 'cover-shown') { el.disabled = true; try { await put(await shownPicture()); } finally { el.disabled = false; } }
        else if (el.dataset.action === 'cover-clear') { api.clearStyleCover(which.id); changed('去掉了'); }
        else if (el.dataset.action === 'cover-draw') {
          if (!api.drawReady()) throw Error(api.drawMissing());
          if (api.drawQuote(styleSample(state(), now(), sample).params).free !== false) return await drawOne(false);
          // The question takes this sheet's place too: it comes back for the drawing.
          const ask = api.paidPrompt(), yes = await ctx.confirm(ask.title, ask.text);
          coverSheet(which, {drawing: yes});
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
    paint();
    // The big picture's file is gone: as with no picture, and adding one still works.
    d.body.addEventListener('error', e => { if (e.target.closest?.('.cover-big')) e.target.closest('.cover-big').innerHTML = `<div class="cover-none">${icon('image')}</div>`; }, true);
    if (drawing) drawOne(true).catch(error => ctx.notify(error.message, {error: true}));
  }
  /** A style (the one in use unless another is given), in a sheet: saved with its button, left as it was when the sheet is closed. */
  function editStyle(which = style()) {
    const s = {...which};
    const d = ctx.dialog('画风', `<div class="style-edit-cover" data-edit-cover></div>${field('名字', input('name', s.name, 'text', 'maxlength="40"'))}
      ${field('画师串', textArea('artist', s.artist, 'class="code" rows="3" placeholder="例如 artist:wlop, artist:ciloranko"'), '正文出图和这里单独生图都会带上画风。每个引擎记住自己用的画风；GPT 不读画师串和固定负面。')}
      ${field('固定正面', textArea('positive', s.positive, 'class="code" rows="3"'))}
      ${field('固定负面', textArea('negative-fixed', s.negative, 'class="code" rows="3"'))}
      ${s.params ? field('NovelAI 参数', `<p class="style-param-line">${esc(line(s.params))}</p>`, '这个画风记住的模型、步数、CFG、采样器和噪声调度。选这个画风时自动换上；它在用的时候，在绘图里改这些参数会记到它身上。尺寸和种子是每张图自己的，不跟画风走。') : ''}
      <div class="actions">${btn('save-style', '保存画风', 'primary')}</div>`);
    // Its 效果图 changes at once, whatever becomes of the rest.
    const tile = () => { const now = state().styles.find(x => x.id === s.id) || s; d.body.querySelector('[data-edit-cover]').innerHTML = `${coverTile(now)}<span><strong>效果图</strong><small>${now.cover ? '点图看大图、换图' : '点一下加一张，列表里一眼能认出它'}</small></span>`; };
    tile();
    watchCovers(d.body);
    const before = afterCover;
    afterCover = () => { before(); if (d.live !== false) tile(); };
    d.onClose?.(() => { afterCover = before; });
    d.body.addEventListener('input', e => { const key = e.target.dataset.field; if (key) s[key === 'negative-fixed' ? 'negative' : key] = e.target.value; });
    d.body.addEventListener('click', e => {
      const art = e.target.closest('[data-style-cover]');
      if (art) { const now = state().styles.find(x => x.id === s.id) || s; if (now.cover && art.querySelector('img')) showCovers(now, art); else coverSheet(now); return; }
      if (!e.target.closest('[data-action=save-style]')) return;
      if (!s.name.trim()) { ctx.notify('请填写画风名字'); return; }
      try { api.saveStyle(s); d.close(); render(); ctx.notify('画风已保存'); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }


  return {pickStyle, editStyle};
}

/**
 * 当效果图 from the 相册: which 画风 this picture goes on. The one it was drawn with (by the 画师串 in its words) comes first,
 * so that is one tap. words: what is known about the picture.
 */
export function coverFromAlbum(ctx, blob, words = '') {
  const {api} = ctx, draw = () => api.getState().draw;
  const row = (s, note = '') => `<button type="button" class="list-row style-row cover-choice" data-cover-for="${esc(s.id)}"><span class="style-cover">${coverArt(s)}</span><span><strong>${esc(s.name)}</strong><small class="mono picker-preview">${esc(note || s.artist || '没有画师串')}</small></span></button>`;
  const d = ctx.dialog('放到哪个画风', `<div class="style-picker"><div class="picker-search" hidden><input type="search" data-cover-search aria-label="搜索画风、画师串" placeholder="搜索画风、画师串…" autocomplete="off"></div><div data-cover-list></div></div>`);
  const list = d.body.querySelector('[data-cover-list]'), search = d.body.querySelector('[data-cover-search]');
  const paint = query => {
    const all = styleTree(draw()).flatMap(e => e.style ? [e.style] : e.styles), guess = styleOfWords(draw(), words);
    const found = query ? all.filter(s => norm(s.name + ' ' + s.artist).includes(query)) : all;
    list.innerHTML = (!query && guess ? row(guess, '这张图就是用它画的') : '') + (found.filter(s => query || s.id !== guess?.id).map(s => row(s)).join('') || (query ? '<p class="hint">没有匹配的画风</p>' : ''));
    search.closest('.picker-search').hidden = all.length <= 6 && !query;
  };
  paint('');
  watchCovers(list);
  search.addEventListener('input', () => paint(norm(search.value).trim()));
  list.addEventListener('click', async e => {
    const el = e.target.closest('[data-cover-for]');
    if (!el || el.disabled) return;
    el.disabled = true;
    try { await api.setStyleCover(el.dataset.coverFor, blob); ctx.notify(`已放到「${draw().styles.find(s => s.id === el.dataset.coverFor)?.name || '画风'}」的效果图`); d.close(); }
    catch (error) { ctx.notify(error.message, {error: true}); el.disabled = false; }
  });
}

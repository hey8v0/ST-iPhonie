// 画风 in the drawing app: the list and the editor. The list works the way Procreate's layers do. A tap uses a 画风; a
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
import {styleTree} from '../core/draw.js';

/** One line for a 画风's parameters: 「V4.5 Full · 28 步 · CFG 5 · k_euler_ancestral」. */
export const paramLine = (p, names = {}) => [names[p.model] || p.model, `${p.steps} 步`, `CFG ${p.scale}`, p.sampler].join(' · ');

const norm = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase();

/** state(): the drawing settings; styleId() / style(): the 画风 in use (its id / itself); render(): draws the app again. */
export function styleSheets({ctx, state, styleId, style, render}) {
  const {api} = ctx;
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
    const styleRow = (s, using) => swipeRow(s.id, `<div class="list-row style-row" aria-current="${s.id === using}">${icon(s.id === using ? 'check' : 'paint')}<span><strong>${esc(s.name)}</strong><small class="mono picker-preview">${esc(s.artist || '没有画师串')}</small>${s.params ? `<small class="style-params">${esc(line(s.params))}</small>` : ''}</span></div>`, styleActions(), {label: s.name});
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
    const swipe = mountSwipeList(list, {ctx,
      hint: '点一下用这个画风，按住可以拖动排序；左滑：改、复制、删除；右滑：多选、建组；点组：展开或收起',
      mouseHint: '点一下用这个画风，按住可以拖动排序；⋯ 或右键：改、复制、删除；Ctrl / ⌘ 点：多选、建组；点组：展开或收起',
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
            api.saveStyle({name: (target.name + ' 副本').slice(0, 40), artist: target.artist, positive: target.positive, negative: target.negative, params: target.params, after: target.id});
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
    d.onClose?.(() => swipe.dispose());
    d.overlay.addEventListener('click', e => {
      if (!e.target.closest('[data-sheet-add]')) return;
      try {
        const now = style(), created = api.saveStyle({name: '新画风 ' + (all().length + 1), artist: '', positive: now.positive, negative: now.negative});
        api.saveDraw({activeStyle: created.id});
        swipe.dispose(); d.close(); render(); editStyle(created);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** A style (the one in use unless another is given), in a sheet: saved with its button, left as it was when the sheet is closed. */
  function editStyle(which = style()) {
    const s = {...which};
    const d = ctx.dialog('画风', `${field('名字', input('name', s.name, 'text', 'maxlength="40"'))}
      ${field('画师串', textArea('artist', s.artist, 'class="code" rows="3" placeholder="例如 artist:wlop, artist:ciloranko"'), '正文出图和这里单独生图都会带上画风。每个引擎记住自己用的画风；GPT 不读画师串和固定负面。')}
      ${field('固定正面', textArea('positive', s.positive, 'class="code" rows="3"'))}
      ${field('固定负面', textArea('negative-fixed', s.negative, 'class="code" rows="3"'))}
      ${s.params ? field('NovelAI 参数', `<p class="style-param-line">${esc(line(s.params))}</p>`, '这个画风记住的模型、步数、CFG、采样器和噪声调度。选这个画风时自动换上；它在用的时候，在绘图里改这些参数会记到它身上。尺寸和种子是每张图自己的，不跟画风走。') : ''}
      <div class="actions">${btn('save-style', '保存画风', 'primary')}</div>`);
    d.body.addEventListener('input', e => { const key = e.target.dataset.field; if (key) s[key === 'negative-fixed' ? 'negative' : key] = e.target.value; });
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=save-style]')) return;
      if (!s.name.trim()) { ctx.notify('请填写画风名字'); return; }
      try { api.saveStyle(s); d.close(); render(); ctx.notify('画风已保存'); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }


  return {pickStyle, editStyle};
}

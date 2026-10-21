// 画风 in the drawing app: the list (a tap uses one; swiped left 改 / 复制 / 删除; swiped right several are picked to
// delete) and the editor. Each 画风 keeps its NovelAI parameters (core/draw.js STYLE_PARAM_KEYS): shown in its row and
// its editor, and put back when it is picked.
import {pagedPicker} from './paged-picker.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {esc, btn, field, input, textArea} from './common.js';
import {icon} from './icons.js';

/** One line for a 画风's parameters: 「V4.5 Full · 28 步 · CFG 5 · k_euler_ancestral」. */
export const paramLine = (p, names = {}) => [names[p.model] || p.model, `${p.steps} 步`, `CFG ${p.scale}`, p.sampler].join(' · ');

/** state(): the drawing settings; styleId() / style(): the 画风 in use (its id / itself); render(): draws the app again. */
export function styleSheets({ctx, state, styleId, style, render}) {
  const {api} = ctx;
  const line = p => paramLine(p, api.drawCatalog?.modelNames);
  /**
   * 画风: a tap uses one. Swiped left a style shows 改 / 复制 / 删除; swiped right it is picked, to delete several at once.
   */
  function pickStyle() {
    const using = styleId(), all = () => state().styles;
    const d = ctx.dialog('画风', '<div data-style-picker></div>', {add: '新建画风'});
    const actions = () => [{key: 'edit', label: '改', icon: 'edit'}, {key: 'copy', label: '复制', icon: 'copy'}, ...(all().length > 1 ? [{key: 'delete', label: '删除', icon: 'trash', danger: true}] : [])];
    const picker = d.body.querySelector('[data-style-picker]');
    pagedPicker(picker, {items: all(), selected: using, pageSize: 8, placeholder: '搜索画风、画师串…', text: x => x.name + ' ' + x.artist,
      render: x => swipeRow(x.id, `<div class="list-row style-row" aria-current="${x.id === using}">${icon(x.id === using ? 'check' : 'paint')}<span><strong>${esc(x.name)}</strong><small class="mono picker-preview">${esc(x.artist || '没有画师串')}</small>${x.params ? `<small class="style-params">${esc(line(x.params))}</small>` : ''}</span></div>`, actions(), {label: x.name})});
    const list = picker.querySelector('[data-picker-items]');
    const again = () => { swipe.dispose(); d.close(); pickStyle(); };
    const swipe = mountSwipeList(list, {ctx,
      onTap: id => { api.saveDraw({activeStyle: id}); d.close(); render(); },
      onAction: async (key, id) => {
        const target = all().find(x => x.id === id);
        if (!target) return;
        try {
          if (key === 'edit') { swipe.dispose(); d.close(); editStyle(target); }
          else if (key === 'copy') { api.saveStyle({name: (target.name + ' 副本').slice(0, 40), artist: target.artist, positive: target.positive, negative: target.negative, params: target.params}); ctx.notify('复制好了'); again(); }
          else if (key === 'delete' && await ctx.confirm(`删除画风「${target.name}」？`, '其他画风保留。')) { api.deleteStyle(id); render(); again(); }
        } catch (error) { ctx.notify(error.message, {error: true}); }
      },
      bulk: [{key: 'delete', label: '删除', icon: 'trash', danger: true}],
      onBulk: async (key, ids) => {
        if (key !== 'delete') return;
        if (ids.length >= all().length) throw Error('至少要留一个画风');
        if (!await ctx.confirm(`删除这 ${ids.length} 个画风？`, '其他画风保留。')) return;
        for (const id of ids) api.deleteStyle(id);
        render(); again();
      }});
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

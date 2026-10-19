// 系统提示词: what the plugin itself tells the model, one block per kind of request, each part editable.
import {popupSelect, bindPopupSelect} from './popup-select.js';
import {PROMPT_BLOCKS, promptOn} from '../core/prompt-rules.js';
import {esc, field, textArea, toggle} from './common.js';
import {icon} from './icons.js';

export function promptRulesSheet(ctx) {
  let group = '全部', query = '';
  const groups = ['全部', ...new Set(PROMPT_BLOCKS.map(b => b.group))];
  const status = (b, saved) => {
    const on = promptOn(saved ? {[b.id]: saved} : {}, b.id);
    return [!on ? '已关闭' : b.off ? '已打开' : '', saved?.parts && Object.keys(saved.parts).length ? '已修改' : ''].filter(Boolean).join('、') || '默认';
  };
  function list() {
    const d = ctx.dialog('系统提示词', `<input class="search" type="search" data-rules-search aria-label="搜索系统提示词" placeholder="搜索…" value="${esc(query)}"><div class="prompt-rule-filter">${popupSelect('rule-group', group, groups.map(g => [g, g]), '分类')}</div><div data-rule-list></div>`);
    const paint = () => {
      const overrides = ctx.api.getState().promptRules || {}, q = query.toLowerCase();
      const rows = PROMPT_BLOCKS.filter(b => (group === '全部' || b.group === group) && [b.title, b.note, ...b.parts.map(p => overrides[b.id]?.parts?.[p.key] ?? p.text)].join('\n').toLowerCase().includes(q)).map(b =>
        `<button class="list-row" data-rule-id="${esc(b.id)}"><span><strong>${esc(b.title)}</strong><small>${esc(b.group)} · ${status(b, overrides[b.id])} · ${esc(b.note)}</small></span>${icon('next')}</button>`);
      const legacy = overrides.legacy || [];
      if (legacy.length && group === '全部' && !q) rows.push(`<button class="list-row" data-rule-legacy><span><strong>旧版逐句修改（${legacy.length} 条）</strong><small>0.8.22 以前按句改过的提示词，已经不再生效，可以照着改进上面的块里</small></span>${icon('next')}</button>`);
      d.body.querySelector('[data-rule-list]').innerHTML = rows.join('') || '<p class="hint">没有匹配的提示词</p>';
    };
    const picker = bindPopupSelect(d.body, (key, value) => { group = value; d.body.querySelector('.prompt-rule-filter').innerHTML = popupSelect('rule-group', group, groups.map(g => [g, g]), '分类'); paint(); });
    d.onClose(() => picker.dispose());
    d.body.querySelector('[data-rules-search]').addEventListener('input', e => { query = e.target.value; paint(); });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-rule-id]');
      if (b) edit(b.dataset.ruleId);
      else if (e.target.closest('[data-rule-legacy]')) legacyList();
    });
    paint();
  }
  function edit(id) {
    const block = PROMPT_BLOCKS.find(b => b.id === id), saved = ctx.api.getState().promptRules?.[id];
    const d = ctx.dialog(block.title + ' · 系统提示词', `<div class="group pad"><p class="hint">${esc(block.note)}</p>`
      + (block.optional ? toggle('rule-enabled', '启用', promptOn(saved ? {[id]: saved} : {}, id)) : '')
      + block.parts.map(p => {
        const text = saved?.parts?.[p.key] ?? p.text, rows = Math.min(14, Math.max(3, Math.ceil(text.length / 24) + text.split('\n').length));
        return field(p.label, textArea('part-' + p.key, text, `rows="${rows}" spellcheck="false"`));
      }).join('')
      + `<p class="hint">{{名字}} 由插件填进去；{{#名字}}…{{/名字}} 有内容时才保留，{{^名字}}…{{/名字}} 没有时才保留。</p><p class="hint">${esc(block.fills)}</p></div>`
      + `<div class="actions"><button class="secondary" data-rule-back>返回</button><button class="secondary" data-rule-reset>恢复默认</button><button class="primary" data-rule-save>保存</button></div>`);
    d.body.querySelector('[data-rule-back]').onclick = list;
    d.body.querySelector('[data-rule-reset]').onclick = () => { ctx.api.savePromptRule(id, null); edit(id); };
    d.body.querySelector('[data-rule-save]').onclick = () => {
      // Only parts that differ from the shipped text are kept, so the others follow later updates.
      const parts = {};
      for (const p of block.parts) {
        const text = d.body.querySelector(`[data-field="part-${p.key}"]`).value;
        if (text !== p.text) parts[p.key] = text;
      }
      const enabled = d.body.querySelector('[data-field=rule-enabled]');
      try { ctx.api.savePromptRule(id, {...(enabled ? {enabled: enabled.checked} : {}), parts}); ctx.notify('已保存'); list(); }
      catch (error) { ctx.notify(error.message, {error: true}); }
    };
  }
  function legacyList() {
    const legacy = ctx.api.getState().promptRules?.legacy || [];
    const d = ctx.dialog('旧版逐句修改', `<div class="group pad"><p class="hint">0.8.23 起系统提示词合成了上面那些块，这些按句改过的内容不再生效。需要的话复制下来，改进对应的块里。</p>`
      + legacy.map(x => field(x.id + (x.enabled ? '' : '（当时关掉了）'), textArea('legacy-' + x.id, x.text, 'rows="4" readonly'))).join('')
      + `</div><div class="actions"><button class="secondary" data-rule-back>返回</button><button class="danger" data-rule-clear>不再保留</button></div>`);
    d.body.querySelector('[data-rule-back]').onclick = list;
    d.body.querySelector('[data-rule-clear]').onclick = () => { ctx.api.savePromptRule('legacy', null); ctx.notify('已清掉旧版修改'); list(); };
  }
  list();
}

import {popupSelect, bindPopupSelect} from './popup-select.js';
import {PROMPT_RULES} from '../core/prompt-rules.js';
import {esc, textArea, toggle} from './common.js';
import {icon} from './icons.js';

export function promptRulesSheet(ctx) {
  let group = '全部', query = '';
  const groups = ['全部', ...new Set(PROMPT_RULES.map(r => r.group))];
  function list() {
    const d = ctx.dialog('系统提示词', `<input class="search" type="search" data-rules-search aria-label="搜索系统提示词" placeholder="搜索规则…" value="${esc(query)}"><div class="prompt-rule-filter">${popupSelect('rule-group',group,groups.map(g=>[g,g]),'规则分类')}</div><div data-rule-list></div>`);
    const paint = () => {
      const overrides = ctx.api.getState().promptRules || {};
      d.body.querySelector('[data-rule-list]').innerHTML = PROMPT_RULES.filter(r => (group === '全部' || r.group === group) && (r.title + r.text + (overrides[r.id]?.text || '')).toLowerCase().includes(query.toLowerCase())).map(r => {
        const saved = overrides[r.id];
        return `<button class="list-row" data-rule-id="${esc(r.id)}"><span><strong>${esc(r.title)}</strong><small>${r.group} · ${saved?.enabled === false ? '已关闭' : saved ? '已修改' : '默认'}</small></span>${icon('next')}</button>`;
      }).join('') || '<p class="hint">没有匹配的规则</p>';
    };
    const picker = bindPopupSelect(d.body, (key, value) => { group = value;d.body.querySelector('.prompt-rule-filter').innerHTML = popupSelect('rule-group',group,groups.map(g=>[g,g]),'规则分类');paint(); });d.onClose(()=>picker.dispose());
    d.body.querySelector('[data-rules-search]').addEventListener('input', e => { query = e.target.value; paint(); });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-rule-id]');if (b) edit(b.dataset.ruleId);
    });
    paint();
  }
  function edit(id) {
    const base = PROMPT_RULES.find(r => r.id === id), saved = ctx.api.getState().promptRules?.[id];
    const d = ctx.dialog(base.group + ' · 系统提示词', `<div class="group pad">${toggle('rule-enabled', '启用', saved?.enabled !== false)}<div class="field">${textArea('rule-text', saved?.text ?? base.text, 'rows="14" spellcheck="false"')}</div>${base.text.includes('{{') ? `<small class="hint">${[...new Set(base.text.match(/\{\{[^{}]+\}\}/g) || [])].map(esc).join(' · ')}</small>` : ''}</div><div class="actions"><button class="secondary" data-rule-back>返回</button><button class="secondary" data-rule-reset>恢复默认</button><button class="primary" data-rule-save>保存</button></div>`);
    d.body.querySelector('[data-rule-back]').onclick = list;
    d.body.querySelector('[data-rule-reset]').onclick = () => { ctx.api.savePromptRule(id, null); edit(id); };
    d.body.querySelector('[data-rule-save]').onclick = () => {
      try { ctx.api.savePromptRule(id, {enabled: d.body.querySelector('[data-field=rule-enabled]').checked, text: d.body.querySelector('textarea').value}); ctx.notify('已保存'); list(); }
      catch (error) { ctx.notify(error.message, {error: true}); }
    };
  }
  list();
}

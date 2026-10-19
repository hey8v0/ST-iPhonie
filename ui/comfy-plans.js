// ComfyUI 出图方案 in the drawing app: pick the scheme in use, and one sheet to rename, copy, delete and import.
// Like everything else in the phone, a change is saved at once; "另存为新方案" keeps a copy before trying things out.
import {esc, btn, field, input, select, help, groupTitle} from './common.js';
import {icon} from './icons.js';
import {defaultWorkflow} from '../core/image-engines.js';

export function comfyPlans(ctx, render) {
  const {api} = ctx;
  let panel = null;
  const comfy = () => api.getState().draw.comfy;
  const current = () => { const c = comfy(); return c.workflows.find(p => p.id === c.activeWorkflow); };
  function summary(info) {
    const c = comfy();
    return `<div class="group pad comfy-plan">
      <div class="row-heading"><strong>出图方案 ${help('一套方案 = 一个工作流，加上它的模型、LoRA 和出图参数。改动马上保存进正在用的方案，正文出图、朋友圈、查手机也都用它。想留一份原样，先「另存为新方案」。默认工作流不会被改：在它上面加 LoRA，会自动另存一份。')}</strong></div>
      ${select('comfy-preset', c.activeWorkflow, c.workflows.map(p => [p.id, p.name])).replace('aria-label="comfy-preset"', 'aria-label="出图方案"')}
      <div class="comfy-plan-actions">${btn('comfy-manage', icon('edit') + '管理与导入', 'chip-button')}${info?.restorable ? btn('comfy-restore', icon('refresh') + '恢复原始工作流', 'chip-button') : ''}</div>
      ${info?.missing ? `<p class="comfy-note">${esc(info.missing)}</p>` : ''}
    </div>`;
  }
  function choose(id) { if (id !== comfy().activeWorkflow) api.selectComfyWorkflow(id); render(); }
  /** Two taps for what cannot be undone: the first one asks on the button itself. */
  const armed = new Set();
  function twice(b, text) {
    if (armed.has(b.dataset.action)) { armed.delete(b.dataset.action); return true; }
    armed.add(b.dataset.action); b.dataset.label = b.textContent; b.textContent = text;
    setTimeout(() => { armed.delete(b.dataset.action); if (b.isConnected) b.textContent = b.dataset.label; }, 3000);
    return false;
  }
  function manage() {
    panel?.close();
    const row = current(), builtIn = row.id === 'default';
    const d = panel = ctx.dialog('出图方案', `
      <div class="group pad">${builtIn ? '<p class="hint" style="padding:0">正在用默认工作流（酒馆自带的那一个）。它不能改名、不能删除。</p>' : field('名字', input('comfy-name', row.name, 'text', 'maxlength="60"'))}
        <div class="actions">${builtIn ? '' : btn('plan-rename', '保存名字', 'primary')}${btn('plan-copy', icon('add') + '另存为新方案', builtIn ? 'primary' : 'secondary')}</div>
      </div>
      ${groupTitle('导入工作流', help('在 ComfyUI 里用「导出 (API)」（Export (API)）存成 JSON 文件。在 ComfyUI 的正面提示词输入框填 %prompt%（不要手动加引号，导出 JSON 会自动加）；负面、尺寸、步数也能填 %negative_prompt%、%width%、%steps% 等，换了的会出现在「参数」里。误填成带引号的占位符，导入时会自动修正。每导入一次多一套方案，已有的保留。'))}
      <div class="group pad"><div class="key-actions"><label class="file-pick"><input type="file" accept=".json,application/json" data-comfy-file aria-label="导入工作流 JSON 文件"><span>${icon('add')}导入 JSON 文件</span></label>${btn('plan-tavern', '从酒馆读取', 'secondary')}</div><div data-tavern-list></div></div>
      ${builtIn ? '' : `<div class="actions">${btn('plan-delete', icon('trash') + '删除这套方案', 'danger')}</div>`}`);
    const done = text => { d.close(); render(); if (text) ctx.notify(text); };
    const imported = (name, workflow) => {
      const saved = api.saveComfyWorkflow({name: String(name).replace(/\.json$/i, '').trim().slice(0, 60) || '导入的方案', workflow, sourceWorkflow: workflow});
      done('已导入「' + saved.name + '」并换成它');
    };
    const guard = task => Promise.resolve().then(task).catch(error => { if (d.live) ctx.notify(error.message, {error: true}); });
    d.body.addEventListener('change', event => {
      if (!event.target.matches('[data-comfy-file]')) return;
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) guard(async () => { if (file.size > 300000) throw Error('工作流太大了（超过 300 KB）'); imported(file.name, await file.text()); });
    });
    d.body.addEventListener('click', event => {
      const b = event.target.closest('[data-action], [data-wf]');
      if (!b || b.disabled) return;
      guard(async () => {
        if (b.dataset.wf) { imported(b.dataset.wf, await api.comfyWorkflow(b.dataset.wf)); return; }
        switch (b.dataset.action) {
          case 'plan-rename': { const saved = api.saveComfyWorkflow({id: row.id, name: d.body.querySelector('[data-field=comfy-name]').value}); done('改名为「' + saved.name + '」'); break; }
          case 'plan-copy': {
            const name = (builtIn ? '我的方案' : (d.body.querySelector('[data-field=comfy-name]')?.value.trim() || row.name) + ' 副本').slice(0, 60);
            const workflow = row.workflow || defaultWorkflow(row);
            const saved = api.saveComfyWorkflow({name, workflow, sourceWorkflow: row.sourceWorkflow || workflow, disabledLoras: row.disabledLoras, params: row});
            done('另存为「' + saved.name + '」并换成它'); break;
          }
          case 'plan-delete': if (twice(b, '再点一下删除')) { api.deleteComfyWorkflow(row.id); done('已删除，换回默认工作流'); } break;
          case 'plan-tavern': {
            const names = await api.comfyWorkflows();
            if (!d.live) return;
            const list = d.body.querySelector('[data-tavern-list]');
            list.innerHTML = names.length ? `<div class="group">${names.map(n => `<button type="button" class="list-row" data-wf="${esc(n)}"><span><strong>${esc(n.replace(/\.json$/i, ''))}</strong></span>${icon('next')}</button>`).join('')}</div>` : '<p class="hint">酒馆里还没有存过工作流。</p>';
            break;
          }
        }
      });
    });
  }
  async function click(el) {
    switch (el.dataset.action) {
      case 'comfy-manage': manage(); return true;
      case 'comfy-restore':
        if (await ctx.confirm('恢复原始工作流？', '这套方案的 LoRA 改动会撤回，变回导入时的样子；出图参数保留。')) { api.restoreComfyWorkflow(); render(); ctx.notify('已恢复'); }
        return true;
    }
    return false;
  }
  return {summary, choose, click, dispose() { panel?.close(); }};
}

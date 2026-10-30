// ComfyUI 出图方案 in the drawing app: pick the scheme in use, and one sheet to rename, copy, delete and import.
// Like everything else in the phone, a change is saved at once; "另存为新方案" keeps a copy before trying things out.
import {esc, btn, field, input, select, help, groupTitle} from './common.js';
import {icon} from './icons.js';
import {defaultWorkflow} from '../core/image-engines.js';

const FILLS = {prompt: '提示词', negative_prompt: '反向', seed: '种子', width: '尺寸', steps: '步数', scale: 'CFG', sampler: '采样器', scheduler: '噪声调度', model: '模型', vae: 'VAE', clip: 'CLIP', clip_skip: 'CLIP Skip', denoise: '重绘幅度'};

export function comfyPlans(ctx, render) {
  const {api} = ctx;
  let panel = null;
  const comfy = () => api.getState().draw.comfy;
  const current = () => { const c = comfy(); return c.workflows.find(p => p.id === c.activeWorkflow); };
  function summary(info) {
    const c = comfy();
    return `<div class="group pad comfy-plan">
      <div class="row-heading"><strong>出图方案 ${help('一套方案 = 一个工作流，加上它的模型、LoRA 和出图参数。改动马上保存进正在用的方案，正文出图、朋友圈、查手机也都用它。想留一份原样，先「另存为新方案」。默认工作流是酒馆自带的，不能改名、不能删，改它时会自动另存一份。')}</strong></div>
      ${select('comfy-preset', c.activeWorkflow, c.workflows.map(p => [p.id, p.name])).replace('aria-label="comfy-preset"', 'aria-label="出图方案"')}
      <div class="comfy-plan-actions">${btn('comfy-manage', icon('edit') + '管理与导入', 'chip-button')}${info?.restorable ? btn('comfy-restore', icon('refresh') + '恢复原始工作流', 'chip-button') : ''}<a class="chip-button" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">打开 ComfyUI</a></div>
      ${info?.fills?.length ? `<p class="comfy-note">小手机来填：${esc(Object.keys(FILLS).filter(k => info.fills.includes(k)).map(k => FILLS[k]).join('、'))}</p>` : ''}
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
      <div class="group pad">${builtIn ? '' : field('名字', input('comfy-name', row.name, 'text', 'maxlength="60"'))}
        <div class="actions">${builtIn ? '' : btn('plan-rename', '保存名字', 'primary')}${btn('plan-copy', icon('add') + '另存为新方案', builtIn ? 'primary' : 'secondary')}</div>
      </div>
      ${groupTitle('导入工作流', help('在 ComfyUI 里能画的工作流都可以，不用改它：小手机自己认出提示词、反向、种子、尺寸、步数、CFG、采样器和模型，第一张图和在 ComfyUI 里画的一样。原来的反向词留着。认错了就在「全部节点」里改。\n\n文件可以是：\n· ComfyUI 保存的工作流（.json）\n· 「导出 (API)」的 JSON\n· ComfyUI 画的原图（PNG、WebP，发到别处压缩过的不行）\n\n「从 ComfyUI 读取」要酒馆开 enableCorsProxy，或者 ComfyUI 加 --enable-cors-header。\n\n已经填了 %prompt% 的工作流按你填的来。每导入一次多一套方案，已有的保留。'))}
      <div class="group pad"><div class="key-actions"><label class="file-pick"><input type="file" accept=".json,application/json,image/png,image/webp" data-comfy-file aria-label="导入工作流文件"><span>${icon('add')}导入文件</span></label>${btn('plan-comfy', '从 ComfyUI 读取', 'secondary')}${btn('plan-tavern', '从酒馆读取', 'secondary')}</div><div data-tavern-list></div></div>
      ${builtIn ? '' : `<div class="actions">${btn('plan-delete', icon('trash') + '删除这套方案', 'danger')}</div>`}`);
    const done = text => { d.close(); render(); if (text) ctx.notify(text); };
    const imported = async (name, source) => {
      const plan = await api.prepareComfyImport(source);
      if (!d.live) return;
      // Nothing says which box is the prompt: the only thing asked, and only then.
      if (plan.needsPrompt) {
        if (!plan.candidates.length) throw Error('这个工作流里没有能填提示词的节点');
        pending = {name, source, candidates: plan.candidates};
        d.body.querySelector('[data-tavern-list]').innerHTML = `<p class="hint">哪个是正向提示词？</p><div class="group">${plan.candidates.map((c, i) => `<button type="button" class="list-row" data-prompt-at="${i}"><span><strong>${esc(c.title)}</strong><small>${esc(c.text)}</small></span>${icon('next')}</button>`).join('')}</div>`;
        return;
      }
      const saved = api.saveComfyWorkflow({name: String(name).replace(/\.(json|png|webp)$/i, '').trim().slice(0, 60) || '导入的方案', workflow: plan.workflow, sourceWorkflow: plan.workflow, params: plan.params});
      done('已导入「' + saved.name + '」并换成它');
    };
    let pending = null, runs = [];
    const guard = task => Promise.resolve().then(task).catch(error => { if (d.live) ctx.notify(error.message, {error: true}); });
    d.body.addEventListener('change', event => {
      if (!event.target.matches('[data-comfy-file]')) return;
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) guard(async () => {
        const picture = /^image\//.test(file.type) || /\.(png|webp)$/i.test(file.name);
        if (!picture && file.size > 3000000) throw Error('工作流太大了（超过 3 MB）');
        await imported(file.name, picture ? {buffer: await file.arrayBuffer()} : {text: await file.text()});
      });
    });
    d.body.addEventListener('click', event => {
      const b = event.target.closest('[data-action], [data-wf], [data-saved], [data-run], [data-prompt-at]');
      if (!b || b.disabled) return;
      guard(async () => {
        if (b.dataset.wf) { await imported(b.dataset.wf, {text: await api.comfyWorkflow(b.dataset.wf)}); return; }
        if (b.dataset.saved) { await imported(b.dataset.saved.split('/').pop(), {text: await api.comfySavedWorkflow(b.dataset.saved)}); return; }
        if (b.dataset.run) { const run = runs[Number(b.dataset.run)]; if (run) await imported(run.label || '最近画的', {text: run.graph}); return; }
        if (b.dataset.promptAt && pending) { const {id, key} = pending.candidates[Number(b.dataset.promptAt)]; await imported(pending.name, {...pending.source, prompt: {id, key}}); return; }
        switch (b.dataset.action) {
          case 'plan-rename': { const saved = api.saveComfyWorkflow({id: row.id, name: d.body.querySelector('[data-field=comfy-name]').value}); done('改名为「' + saved.name + '」'); break; }
          case 'plan-copy': {
            const name = (builtIn ? '我的方案' : (d.body.querySelector('[data-field=comfy-name]')?.value.trim() || row.name) + ' 副本').slice(0, 60);
            const workflow = row.workflow || defaultWorkflow(row);
            const saved = api.saveComfyWorkflow({name, workflow, sourceWorkflow: row.sourceWorkflow || workflow, disabledLoras: row.disabledLoras, disabledNodes: row.disabledNodes, output: row.output, params: row});
            done('另存为「' + saved.name + '」并换成它'); break;
          }
          case 'plan-delete': if (twice(b, '再点一下删除')) { api.deleteComfyWorkflow(row.id); done('已删除，换回默认工作流'); } break;
          case 'plan-comfy': {
            const [saved, recent] = await Promise.allSettled([api.comfySavedWorkflows(), api.comfyRecentRuns()]);
            if (!d.live) return;
            runs = recent.status === 'fulfilled' ? recent.value : [];
            const names = saved.status === 'fulfilled' ? saved.value : [], list = d.body.querySelector('[data-tavern-list]');
            const row = (attr, value, title) => `<button type="button" class="list-row" ${attr}="${esc(value)}"><span><strong>${esc(title)}</strong></span>${icon('next')}</button>`;
            if (saved.status === 'rejected' && recent.status === 'rejected') { list.innerHTML = `<p class="hint error-copy">${esc(saved.reason?.message || '读不到 ComfyUI')}</p>`; break; }
            list.innerHTML = (names.length ? groupTitle('存着的工作流') + `<div class="group">${names.map(n => row('data-saved', n, n.replace(/\.json$/i, ''))).join('')}</div>` : '')
              + (runs.length ? groupTitle('最近画过的') + `<div class="group">${runs.map((run, i) => row('data-run', i, run.label)).join('')}</div>` : '')
              || '<p class="hint">ComfyUI 里还没有存过工作流，也没有画过图。</p>';
            break;
          }
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

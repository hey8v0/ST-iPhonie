// Every node of the ComfyUI scheme in use, one card each: all its values to change, on or off, and which picture is
// kept. Wiring stays in ComfyUI. A change is saved at once and redraws only what it has to, so the next tap still lands.
import {esc, btn, help, groupTitle} from './common.js';
import {icon} from './icons.js';

const PARAM = {denoise: 'denoise', scale: 'scale', steps: 'steps', sampler: 'sampler', scheduler: 'scheduler', width: 'width', height: 'height', model: 'model', vae: 'vae', clip: 'clip', clip_type: 'clipType', clip_skip: 'clipSkip'};
const attrs = (node, f) => `data-node="${esc(node.id)}" data-key="${esc(f.key)}" data-kind="${f.kind}" aria-label="${esc(f.label)}"`;

export function comfyNodePanel({ctx, api, rerender}) {
  // Cards left open stay open through a redraw; their values are drawn only then (a model list can be thousands long).
  const open = new Set();
  let query = '', problem = '', asked = '', controller = null, disposed = false;
  const state = () => api.getState().draw.comfy;
  function fieldHtml(node, f) {
    const label = `<span>${esc(f.label)}${f.label !== f.key ? `<small>${esc(f.key)}</small>` : ''}</span>`;
    if (f.kind === 'link') return `<div class="comfy-link"><span>${esc(f.label)}</span><small>← ${esc(f.from.title)}</small></div>`;
    if (f.role === 'seed' || PARAM[f.role]) {
      const param = PARAM[f.role], shown = param ? state()[param] : '';
      return `<div class="field comfy-field">${label}<div class="comfy-follow"><span>${f.role === 'seed' ? '每次随机' : `跟随「参数」${shown === '' ? '' : ' · ' + esc(f.role === 'clip_skip' ? -shown : shown)}`}</span>${btn('node-fix', '写死', 'chip-button', `data-node="${esc(node.id)}" data-key="${esc(f.key)}" data-role="${esc(f.role)}"`)}</div></div>`;
    }
    const tools = f.follow && !f.absent ? btn('node-follow', f.follow === 'seed' ? '每次随机' : '跟随「参数」', 'chip-button', `data-node="${esc(node.id)}" data-key="${esc(f.key)}" data-role="${esc(f.follow)}"`) : '';
    switch (f.kind) {
      case 'bool': return `<div class="setting-row">${label}<input class="switch" type="checkbox" data-node-value ${attrs(node, f)} ${f.value ? 'checked' : ''}></div>`;
      case 'combo': {
        const options = f.options.some(o => String(o) === String(f.value)) ? f.options : [f.value, ...f.options];
        const picker = `<span class="select"><select data-node-value ${attrs(node, f)}>${options.map(o => `<option value="${esc(o)}"${String(o) === String(f.value) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></span>`;
        const upload = f.upload ? `<label class="file-pick"><input type="file" accept="image/*" data-node-file data-node="${esc(node.id)}" data-key="${esc(f.key)}" aria-label="传一张图给 ComfyUI"><span>${icon('add')}传一张图</span></label>` : '';
        return `<div class="field comfy-field">${label}${picker}${tools || upload ? `<div class="comfy-field-tools">${upload}${tools}</div>` : ''}</div>`;
      }
      case 'number': return `<div class="field comfy-field">${label}<input type="number" data-node-value ${attrs(node, f)} value="${esc(f.value ?? '')}" step="${esc(f.step ?? 'any')}"${f.min === undefined ? '' : ` min="${esc(f.min)}"`}${f.max === undefined ? '' : ` max="${esc(f.max)}"`}>${tools ? `<div class="comfy-field-tools">${tools}</div>` : ''}</div>`;
      case 'text': {
        const box = f.long ? `<textarea rows="3" data-node-value ${attrs(node, f)} spellcheck="false">${esc(f.value ?? '')}</textarea>` : `<input type="text" data-node-value ${attrs(node, f)} value="${esc(f.value ?? '')}" spellcheck="false" autocomplete="off">`;
        const marks = f.long ? `<div class="comfy-field-tools">${btn('node-mark', '填提示词', 'chip-button', `data-node="${esc(node.id)}" data-key="${esc(f.key)}" data-mark="%prompt%"`)}${btn('node-mark', '填反向', 'chip-button', `data-node="${esc(node.id)}" data-key="${esc(f.key)}" data-mark="%negative_prompt%"`)}</div>` : '';
        return `<div class="field comfy-field">${label}${box}${marks}</div>`;
      }
      default: return `<div class="field comfy-field">${label}<code class="comfy-other">${esc(f.value)}</code></div>`;
    }
  }
  function body(node, many) {
    const pick = node.isOutput && many ? `<div class="setting-row"><span>小手机要这张图</span><input class="switch" type="checkbox" data-node-output="${esc(node.id)}" aria-label="小手机要这张图" ${node.output ? 'checked' : ''}></div>` : '';
    return pick + (node.fields.map(f => fieldHtml(node, f)).join('') || '<p class="hint" style="padding:0">这个节点没有能改的值。</p>');
  }
  /** The nodes as they are now, with the file names offered wherever ComfyUI has said what it has. */
  const list = () => api.comfyNodeList();
  const many = nodes => nodes.filter(n => n.isOutput && !n.off).length > 1;
  const matches = node => !query || `${node.title} ${node.type} ${node.id}`.toLowerCase().includes(query);
  function card(node, several) {
    const on = open.has(node.id);
    return `<details class="comfy-node${node.off ? ' off' : ''}" data-node-card="${esc(node.id)}"${on ? ' open' : ''}${matches(node) ? '' : ' hidden'}>
      <summary><span class="comfy-node-name"><strong>${esc(node.title)}</strong><small>#${esc(node.id)}${node.title === node.type ? '' : ' · ' + esc(node.type)}${node.unknown ? ' · ComfyUI 里没有' : ''}</small></span>${node.fills.map(f => `<span class="chip">${f}</span>`).join('')}${node.output && several ? '<span class="chip">要这张</span>' : ''}<input class="switch" type="checkbox" data-node-switch="${esc(node.id)}" aria-label="使用 ${esc(node.title)}" ${node.off ? '' : 'checked'}${node.canOff || node.off ? '' : ` disabled title="后面的节点要用它的结果"`}></summary>
      <div class="comfy-node-body">${on ? body(node, several) : ''}</div>
    </details>`;
  }
  function html() {
    let nodes;
    try { nodes = list(); } catch (error) { return `<p class="hint error-copy">${esc(error.message)}</p>`; }
    const several = many(nodes);
    return groupTitle(`全部节点 · ${nodes.length}`, help('工作流里每个节点的值都能在这里改，开关决定这次用不用它（关掉的节点会被绕过）。接线要在 ComfyUI 里改。\n\n写着「跟随参数」的值由「参数」页决定；想让它固定，点「写死」。\n\n文字框里的 %prompt% 和 %negative_prompt% 是小手机填词的位置，前后可以留自己的词。'))
      + (problem ? `<div class="comfy-note error-copy">读不到选项列表，可以手填 ${help(problem)}</div>` : '')
      + (nodes.length > 6 ? `<div class="picker-search comfy-node-search"><input type="search" data-node-search value="${esc(query)}" placeholder="找节点" aria-label="找节点" autocomplete="off"></div>` : '')
      + `<div class="group comfy-nodes">${nodes.map(n => card(n, several)).join('')}</div>`;
  }
  /** Asks ComfyUI what the workflow's nodes are, once per address and workflow; the list works without it, more plainly. */
  async function load(fresh = false) {
    // Changing a value asks nothing new: only another address or other kinds of node do.
    const mark = state().url + '|' + [...new Set(list().map(n => n.type))].sort().join();
    if (!fresh && asked === mark) return;
    asked = mark;
    controller?.abort(); controller = new AbortController();
    try { await api.comfyNodeSpecs({fresh, signal: controller.signal}); problem = ''; }
    catch (error) { if (controller.signal.aborted) return; problem = error.message; }
    if (!disposed) rerender();
  }
  function apply(change) {
    try {
      const result = api.editComfyNodes(change);
      if (result.copied) { ctx.notify(`默认工作流不会被改：已另存为「${result.name}」并换成它`); rerender(); }
      return result;
    } catch (error) { ctx.notify(error.message, {error: true}); rerender(); return null; }
  }
  function change(el) {
    const {node: id, key, kind} = el.dataset;
    let value = kind === 'bool' ? el.checked : el.value;
    if (kind === 'number') { if (el.value.trim() === '') { rerender(); return; } value = Number(el.value); }
    apply({set: [{id, key, value}]});
  }
  async function click(el) {
    const {node: id, key, role, mark} = el.dataset;
    switch (el.dataset.action) {
      case 'node-follow': {
        // The value the node had goes to the 参数 page, so the picture does not change by following it.
        const field = list().find(n => n.id === id)?.fields.find(f => f.key === key), param = PARAM[role];
        const params = param && field ? {[param]: role === 'clip_skip' ? -field.value : field.value} : undefined;
        apply({set: [{id, key, value: `%${role}%`}], params}); rerender(); return true;
      }
      case 'node-fix': {
        const param = PARAM[role];
        let value = role === 'seed' ? Math.floor(Math.random() * 4294967295) : state()[param];
        if (role === 'clip_skip') value = -value;
        apply({set: [{id, key, value}]}); rerender(); return true;
      }
      case 'node-mark': apply({set: [{id, key, value: mark}]}); rerender(); return true;
    }
    return false;
  }
  async function pick(el) {
    const {node: id, key} = el.dataset, file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try { const name = await api.comfyUploadPicture(file); await api.comfyNodeSpecs({fresh: true}).catch(() => {}); apply({set: [{id, key, value: name}]}); ctx.notify('已传给 ComfyUI'); rerender(); }
    catch (error) { ctx.notify(error.message, {error: true}); }
  }
  function toggled(details) {
    const id = details.dataset.nodeCard;
    if (id === undefined) return;
    const box = details.querySelector('.comfy-node-body');
    if (details.open) {
      open.add(id);
      if (!box.innerHTML) { const nodes = list(), node = nodes.find(n => n.id === id); if (node) box.innerHTML = body(node, many(nodes)); }
    } else open.delete(id);
  }
  function search(root, value) {
    query = value.trim().toLowerCase();
    const nodes = list();
    for (const details of root.querySelectorAll('[data-node-card]')) { const node = nodes.find(n => n.id === details.dataset.nodeCard); details.hidden = !!node && !matches(node); }
  }
  function switched(el) { apply({off: {[el.dataset.nodeSwitch]: !el.checked}}); rerender(); }
  function output(el) { apply({output: el.checked ? el.dataset.nodeOutput : ''}); rerender(); }
  return {html, load, click, change, pick, toggled, search, switched, output, dispose() { disposed = true; controller?.abort(); }};
}

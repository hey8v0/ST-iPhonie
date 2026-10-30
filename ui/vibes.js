// The Vibe tab of the drawing app: one switch for every picture, the groups (tap one to use it), the single vibes,
// import (.naiv4vibe, .naiv4vibebundle, 智绘姬 exports, pictures) and export. The vibes themselves stay in the backend.
import {esc, btn, field, input, toggle, help, groupTitle} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';

const MAX_FREE = 4;
const tileImage = s => s.thumb ? `<img src="${esc(s.thumb)}" alt="">` : `<span class="vibe-blank">${icon('image')}</span>`;
const encodedNote = s => s.keys.length ? '已编码' : s.image ? '第一次用要编码' : '没有原图';
/** A search box appears once the lists are this long. */
const SEARCH_FROM = 8;
const matches = (name, query) => !query || String(name).toLowerCase().includes(query.trim().toLowerCase());
/** Hides the rows of a list ([data-name]) that do not match, and says so when none is left. */
function filterList(box, query) {
  if (!box) return;
  let shown = 0;
  for (const el of box.querySelectorAll('[data-name]')) { const hit = matches(el.dataset.name, query); el.hidden = !hit; shown += hit; }
  const none = box.parentElement.querySelector(`[data-none="${box.dataset.list}"]`);
  if (none) none.hidden = shown > 0;
}

export function vibePanel({ctx, api, root, rerender}) {
  const state = () => api.getState().draw.vibe;
  const vibes = () => api.listVibes();
  let query = '', selecting = false;
  /** Multi-select: the vibes and groups picked. */
  const picked = {vibes: new Set(), groups: new Set()};

  /** One line saying what the next picture will use and what it costs. */
  function planText() {
    const v = state(), plan = api.vibePlan();
    if (!v.enabled) return 'Vibe 已关闭。打开后，不管用哪个画风，每张图都会带上选中的 Vibe。';
    if (!v.use.kind) return '还没有选：点一个 Vibe 组，或者打开单个 Vibe 点「单独使用」。';
    const model = api.getState().draw.params.model;
    if (!plan.model) return `当前模型 ${model} 不能用 Vibe（V5 还不支持），出图时会跳过。换成 V4.5 才会生效。`;
    const group = v.use.kind === 'group' ? v.groups.find(g => g.id === v.use.id) : null;
    const parts = [`正在用：${group ? `组「${esc(group.name)}」` : `「${esc(plan.used[0]?.name || plan.skipped[0]?.name || '')}」`} · ${plan.used.length} 个`];
    if (plan.over) parts.push(`免费档守卫只用前 ${MAX_FREE} 个，后面 ${plan.over} 个这次不用`);
    if (plan.extra) parts.push(`超过 ${MAX_FREE} 个，每张图多扣 ${plan.extra * 2} Anlas`);
    if (plan.encode) parts.push(`其中 ${plan.encode} 个第一次用要编码，每个扣 2 Anlas，编码一次以后就不扣了`);
    const lost = plan.skipped.filter(s => s.why !== 'model');
    if (lost.length) parts.push(`${lost.map(s => esc(s.name)).join('、')} 没有这个模型的编码也没有原图，跳过`);
    return parts.join('；') + '。';
  }

  function html() {
    const v = state(), list = vibes(), byId = new Map(list.map(s => [s.id, s]));
    const check = on => selecting ? `<span class="vibe-check${on ? ' on' : ''}">${on ? icon('check') : ''}</span>` : '';
    const groupRows = v.groups.map(g => {
      const using = v.use.kind === 'group' && v.use.id === g.id, thumbs = g.items.slice(0, 3).map(i => byId.get(i.vibe)).filter(Boolean), on = picked.groups.has(g.id);
      return `<div class="vibe-group${using ? ' using' : ''}${on ? ' picked' : ''}" data-name="${esc(g.name)}"${matches(g.name, query) ? '' : ' hidden'}><button type="button" class="vibe-group-main" data-action="${selecting ? 'vibe-pick' : 'vibe-use-group'}" data-kind="groups" data-id="${esc(g.id)}" aria-pressed="${selecting ? on : using}">
        ${check(on)}<span class="vibe-stack">${thumbs.map(tileImage).join('') || `<span class="vibe-blank">${icon('layers')}</span>`}</span>
        <span class="grow"><strong>${esc(g.name)}</strong><small>${using ? '使用中 · ' : ''}${g.items.length} 个${g.items.length > MAX_FREE ? ` · 守卫只用前 ${MAX_FREE} 个` : ''}</small></span></button>
        ${selecting ? '' : `<button type="button" class="nav-button" data-action="vibe-group-menu" data-id="${esc(g.id)}" aria-label="编辑「${esc(g.name)}」">${icon('more')}</button>`}</div>`;
    }).join('');
    const tiles = list.map(s => {
      const using = v.use.kind === 'vibe' && v.use.id === s.id, on = picked.vibes.has(s.id);
      return `<button type="button" class="vibe-tile${using ? ' using' : ''}${on ? ' picked' : ''}" data-name="${esc(s.name)}"${matches(s.name, query) ? '' : ' hidden'} data-action="${selecting ? 'vibe-pick' : 'vibe-open'}" data-kind="vibes" data-id="${esc(s.id)}" aria-label="${esc(s.name)}"${selecting ? ` aria-pressed="${on}"` : ''}>${check(on)}${tileImage(s)}<span class="vibe-name">${esc(s.name)}</span><small>${using ? '使用中' : encodedNote(s)}</small></button>`;
    }).join('');
    // Select all / none, for the names the search shows.
    const pickAll = (kind, items) => {
      if (!selecting || !items.length) return '';
      const shown = items.filter(x => matches(x.name, query)), all = shown.length && shown.every(x => picked[kind].has(x.id));
      return btn('vibe-pick-all', all ? '全不选' : query ? '全选搜到的' : '全选', 'text-button', `data-kind="${kind}"`);
    };
    const count = picked.vibes.size + picked.groups.size;
    const buttons = selecting
      ? `<div class="vibe-selectbar"><strong>已选 ${picked.vibes.size} 个 Vibe${picked.groups.size ? `、${picked.groups.size} 个组` : ''}</strong>${btn('vibe-pick-done', '完成', 'chip-button')}</div>
        <div class="actions" style="margin-top:0">${btn('vibe-pick-group', icon('add') + '加入组', 'secondary', picked.vibes.size ? '' : 'disabled')}${btn('vibe-pick-delete', icon('trash') + '删除', 'danger', count ? '' : 'disabled')}</div>`
      // The buttons fold away (ui/common.js keeps the fold open across redraws); with nothing saved yet they are open.
      : `<details class="tool-fold" data-group="vibe-tools"${list.length + v.groups.length ? '' : ' open'}><summary>${icon('layers')}导入与管理<small>导入 · 新建组 · 多选 · 导出</small></summary><div><div class="actions" style="margin-top:0">${btn('vibe-import', icon('import') + '导入', 'secondary')}${btn('vibe-new-group', icon('add') + '新建组', 'secondary')}${list.length + v.groups.length ? btn('vibe-select', icon('check') + '多选', 'secondary') : ''}${list.length ? btn('vibe-export-all', icon('download') + '全部导出', 'secondary') : ''}${api.chatu8Vibes?.() ? btn('vibe-chatu8', icon('import') + '从智绘姬导入', 'secondary') : ''}</div></div></details>`;
    const tools = (kind, items, info) => `<span class="title-tools">${pickAll(kind, items)}${help(info)}</span>`;
    return `<div class="group">${toggle('vibeEnabled', '使用 Vibe', v.enabled, '打开后，不管用哪个画风或画师串，绘图 App 和正文出图的每张图都会带上选中的 Vibe（一个组，或者单个 Vibe）。\n\n只有 V4 / V4.5 模型能用，V5 还不支持，会自动跳过。\n\n费用：一张图片第一次用要编码，扣 2 Anlas，编码存下来以后再用就不扣了；一次最多 4 个不额外收费，第 5 个起每多一个扣 2 Anlas。免费档守卫打开时只用前 4 个。')}${toggle('vibeNormalize', '强度自动缩放', v.normalize !== false, '几个 Vibe 的强度加起来超过 1 时按比例缩小，官方建议这样，结果更稳。关掉就按填的强度发。')}</div>
      <p class="hint vibe-plan">${planText()}</p>
      ${buttons}
      <input type="file" data-vibe-file multiple hidden accept=".naiv4vibe,.naiv4vibebundle,.json,image/png,image/jpeg,image/webp">
      ${list.length + v.groups.length > SEARCH_FROM ? `<div class="vibe-search">${icon('search')}<input type="search" data-vibe-search value="${esc(query)}" placeholder="搜索组和 Vibe 的名字" aria-label="搜索 Vibe"></div>` : ''}
      ${groupTitle(`Vibe 组 · ${v.groups.length}`, tools('groups', v.groups, '点一个组就用这个组。组里每个 Vibe 有自己的强度；强度加起来超过 1 时会按比例缩回 1。\n\n导入官网的 .naiv4vibebundle 或智绘姬导出的 Vibe 组，会自动建好组。\n\n「多选」可以一次删除好几个组。'))}
      ${v.groups.length ? `<div class="vibe-groups vibe-scroll" data-list="groups" data-keep-scroll="vibe-groups">${groupRows}</div><p class="hint" data-none="groups"${v.groups.some(g => matches(g.name, query)) ? ' hidden' : ''}>没有名字里带「${esc(query)}」的组。</p>` : '<p class="hint">还没有组。导入组文件，或者点「新建组」。</p>'}
      ${groupTitle(`单个 Vibe · ${list.length}`, tools('vibes', list, '可以导入：官网的 .naiv4vibe（单个）、.naiv4vibebundle（一组）、智绘姬「导出全部」的 Vibe 组文件，以及普通图片（第一次用时编码）。已经有的 Vibe 不会重复添加。再点一次「从智绘姬导入」，已经有的 Vibe 会改成智绘姬里的名字。\n\n「多选」可以一次删除好几个，或者一起加进一个组。\n\nVibe 保存在当前浏览器里；换设备用 设置 → 备份与恢复（勾「Vibe 和 Vibe 组」），或者先导出再导入。'))}
      ${list.length ? `<div class="vibe-grid vibe-scroll" data-list="vibes" data-keep-scroll="vibe-grid">${tiles}</div><p class="hint" data-none="vibes"${list.some(s => matches(s.name, query)) ? ' hidden' : ''}>没有名字里带「${esc(query)}」的 Vibe。</p>` : '<p class="hint">还没有 Vibe。点「导入」。</p>'}`;
  }

  /** Several vibes into one group (a new one, or one that is there), each with its own strength. */
  function pickToGroup() {
    const groups = state().groups, ids = [...picked.vibes];
    const d = ctx.dialog(`加入组 · ${ids.length} 个 Vibe`, `<div class="group pad">${field('加到', `<span class="select"><select data-field="pick-group" aria-label="加到">${groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}（${g.items.length} 个）</option>`).join('')}<option value="">新建一个组</option></select></span>`)}
      ${field('新组的名字', input('pick-name', '新组 ' + (groups.length + 1), 'text', 'maxlength="40"'))}
      <p class="hint" style="padding:0">已经在组里的不会重复加；一个组最多 50 个。每个 Vibe 用它自己的强度，加进去以后可以在组里调。</p></div>
      <div class="actions">${btn('pick-group-ok', '加入', 'primary')}</div>`);
    const nameField = () => d.body.querySelector('[data-field=pick-name]').closest('.field');
    const sync = () => { nameField().style.display = d.body.querySelector('[data-field=pick-group]').value ? 'none' : ''; };
    sync();
    d.body.addEventListener('change', sync);
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=pick-group-ok]')) return;
      try {
        const all = structuredClone(state().groups), gid = d.body.querySelector('[data-field=pick-group]').value;
        let g = all.find(x => x.id === gid);
        if (!g) { g = {id: crypto.randomUUID(), name: d.body.querySelector('[data-field=pick-name]').value.trim() || '新组 ' + (all.length + 1), items: []}; all.push(g); }
        const strengthOf = new Map(vibes().map(s => [s.id, s.strength]));
        let added = 0;
        for (const id of ids) { if (g.items.length >= 50) break; if (g.items.some(i => i.vibe === id)) continue; g.items.push({vibe: id, strength: strengthOf.get(id) ?? 0.6}); added++; }
        api.saveDraw({vibe: {groups: all}});
        d.close(); selecting = false; picked.vibes.clear(); picked.groups.clear(); rerender();
        ctx.notify(`已把 ${added} 个 Vibe 加进「${g.name}」${added < ids.length ? `（${ids.length - added} 个已经在里面或者超过 50 个）` : ''}`);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  async function save(file) { ctx.notify('已下载 ' + await saveFile(ctx.doc, file.blob, file.name)); }

  /** A vibe: rename, its own strength, use it alone, add it to a group, export, delete. */
  function openVibe(id) {
    const s = vibes().find(x => x.id === id);
    if (!s) return;
    const groups = state().groups;
    const d = ctx.dialog(s.name, `<div class="vibe-detail">${tileImage(s)}</div>
      <div class="group pad">${field('名字', input('vibe-name', s.name, 'text', 'maxlength="80"'))}
        <div class="field"><div class="meter-label"><span>强度${help('单独使用时的强度，也是加进组时的默认强度。越高越像这张图。')}</span><output>${s.strength}</output></div><input class="slider" type="range" data-field="vibe-strength" min="0" max="1" step="0.05" value="${s.strength}" aria-label="强度"></div>
        <p class="hint" style="padding:0">${s.keys.length ? '已编码：' + s.keys.join('、') + '（用这些模型不再扣 Anlas）' : s.image ? '还没有编码：第一次用时编码，扣 2 Anlas' : '没有原图，也没有编码，用不了'} · 提取信息量 ${s.ie}</p></div>
      ${groups.length ? `<div class="group pad">${field('加入组', `<span class="select"><select data-field="vibe-group" aria-label="加入组">${groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}${g.items.some(i => i.vibe === id) ? '（已在）' : ''}</option>`).join('')}</select></span>`)}<div class="actions" style="margin-top:0">${btn('vibe-to-group', icon('add') + '加入', 'secondary')}</div></div>` : ''}
      <div class="actions">${btn('vibe-save', '保存', 'primary')}${btn('vibe-alone', '单独使用', 'secondary')}${btn('vibe-export', icon('download') + '导出', 'secondary')}${btn('vibe-delete', icon('trash') + '删除', 'danger')}</div>`);
    d.body.addEventListener('input', e => { if (e.target.dataset.field === 'vibe-strength') e.target.previousElementSibling.querySelector('output').textContent = e.target.value; });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      try {
        if (b.dataset.action === 'vibe-save') { await api.updateVibe(id, {name: d.body.querySelector('[data-field=vibe-name]').value, strength: Number(d.body.querySelector('[data-field=vibe-strength]').value)}); d.close(); rerender(); ctx.notify('已保存'); }
        if (b.dataset.action === 'vibe-alone') { api.saveDraw({vibe: {enabled: true, use: {kind: 'vibe', id}}}); d.close(); rerender(); ctx.notify(`正在用「${s.name}」`); }
        if (b.dataset.action === 'vibe-export') await save(await api.exportVibes({vibe: id}));
        if (b.dataset.action === 'vibe-to-group') {
          const gid = d.body.querySelector('[data-field=vibe-group]').value, all = structuredClone(state().groups), g = all.find(x => x.id === gid);
          if (!g) return;
          if (g.items.some(i => i.vibe === id)) { ctx.notify('已经在这个组里了'); return; }
          g.items.push({vibe: id, strength: Number(d.body.querySelector('[data-field=vibe-strength]').value)});
          api.saveDraw({vibe: {groups: all}}); d.close(); rerender(); ctx.notify(`已加入「${g.name}」`);
        }
        if (b.dataset.action === 'vibe-delete') {
          d.close();
          if (await ctx.confirm('删除这个 Vibe？', `「${s.name}」会从这台设备删除，也会从所有组里去掉。想留着可以先导出。`)) { await api.deleteVibe(id); rerender(); }
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  /** A group: rename, each vibe's strength, take vibes out or add more, use it, export, delete. */
  function openGroup(gid) {
    const draft = structuredClone(state().groups.find(g => g.id === gid));
    if (!draft) return;
    const d = ctx.dialog('Vibe 组', '');
    let find = '';
    const paint = () => {
      const keep = d.body.querySelector('[data-list=add]')?.scrollTop || 0;
      const list = vibes(), byId = new Map(list.map(s => [s.id, s])), outside = list.filter(s => !draft.items.some(i => i.vibe === s.id));
      d.body.innerHTML = `<div class="group pad">${field('组名', input('group-name', draft.name, 'text', 'maxlength="40"'))}</div>
        ${groupTitle(`组里的 Vibe · ${draft.items.length}`, help('第 5 个起每多一个扣 2 Anlas；免费档守卫打开时只用前 4 个。'))}
        <div class="group pad">${draft.items.map((item, n) => { const s = byId.get(item.vibe); return `<div class="vibe-item${n >= MAX_FREE ? ' beyond' : ''}">${s ? tileImage(s) : `<span class="vibe-blank">${icon('alert')}</span>`}
          <div class="grow"><div class="meter-label"><span>${esc(s?.name || '已删除')}</span><output>${item.strength}</output></div><input class="slider" type="range" data-item-strength="${n}" min="0" max="1" step="0.05" value="${item.strength}" aria-label="${esc(s?.name || '')} 强度"></div>
          <button type="button" class="text-button" data-item-remove="${n}">移出</button></div>`; }).join('') || '<p class="hint">组里还没有 Vibe，从下面加。</p>'}</div>
        ${outside.length ? groupTitle(`加进来 · ${outside.length}`) + (outside.length > SEARCH_FROM ? `<div class="vibe-search">${icon('search')}<input type="search" data-add-search value="${esc(find)}" placeholder="搜索名字" aria-label="搜索要加的 Vibe"></div>` : '')
          + `<div class="vibe-grid small vibe-scroll" data-list="add">${outside.map(s => `<button type="button" class="vibe-tile" data-name="${esc(s.name)}"${matches(s.name, find) ? '' : ' hidden'} data-item-add="${esc(s.id)}" aria-label="加入 ${esc(s.name)}">${tileImage(s)}<span class="vibe-name">${esc(s.name)}</span></button>`).join('')}</div><p class="hint" data-none="add"${outside.some(s => matches(s.name, find)) ? ' hidden' : ''}>没有名字里带「${esc(find)}」的 Vibe。</p>` : ''}
        <div class="actions">${btn('group-save', '保存', 'primary')}${btn('group-use', '使用这个组', 'secondary')}${btn('group-export', icon('download') + '导出', 'secondary')}${btn('group-delete', icon('trash') + '删除组', 'danger')}</div>`;
      const add = d.body.querySelector('[data-list=add]');
      if (add) add.scrollTop = keep;
    };
    paint();
    const commit = () => { const all = structuredClone(state().groups), at = all.findIndex(g => g.id === gid); if (at < 0) throw Error('这个组已经不在了'); draft.name = d.body.querySelector('[data-field=group-name]').value.trim() || draft.name; all[at] = draft; api.saveDraw({vibe: {groups: all}}); };
    d.body.addEventListener('input', e => {
      if (e.target.dataset.addSearch !== undefined) { find = e.target.value; filterList(d.body.querySelector('[data-list=add]'), find); return; }
      if (e.target.dataset.itemStrength !== undefined) { draft.items[Number(e.target.dataset.itemStrength)].strength = Number(e.target.value); e.target.previousElementSibling.querySelector('output').textContent = e.target.value; }
      if (e.target.dataset.field === 'group-name') draft.name = e.target.value;
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      try {
        if (b.dataset.itemRemove !== undefined) { draft.items.splice(Number(b.dataset.itemRemove), 1); paint(); return; }
        if (b.dataset.itemAdd) { const s = vibes().find(x => x.id === b.dataset.itemAdd); draft.items.push({vibe: b.dataset.itemAdd, strength: s?.strength ?? 0.6}); paint(); return; }
        switch (b.dataset.action) {
          case 'group-save': commit(); d.close(); rerender(); ctx.notify('组已保存'); break;
          case 'group-use': commit(); api.saveDraw({vibe: {enabled: true, use: {kind: 'group', id: gid}}}); d.close(); rerender(); ctx.notify(`正在用「${draft.name}」`); break;
          case 'group-export': commit(); await save(await api.exportVibes({group: gid})); break;
          case 'group-delete':
            d.close();
            if (await ctx.confirm('删除这个组？', `组「${draft.name}」会被删除，里面的 Vibe 还在。`)) {
              const v = state();
              api.saveDraw({vibe: {groups: v.groups.filter(g => g.id !== gid), use: v.use.kind === 'group' && v.use.id === gid ? {kind: '', id: ''} : v.use}});
              rerender();
            }
            break;
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  /** The tab's buttons; returns true when the action was a Vibe one. */
  async function click(el) {
    switch (el.dataset.action) {
      case 'vibe-import': root().querySelector('[data-vibe-file]')?.click(); return true;
      case 'vibe-use-group': {
        const v = state(), same = v.use.kind === 'group' && v.use.id === el.dataset.id;
        api.saveDraw({vibe: same ? {use: {kind: '', id: ''}} : {enabled: true, use: {kind: 'group', id: el.dataset.id}}});
        rerender();
        return true;
      }
      case 'vibe-group-menu': openGroup(el.dataset.id); return true;
      case 'vibe-open': openVibe(el.dataset.id); return true;
      case 'vibe-new-group': {
        const v = state(), id = crypto.randomUUID();
        api.saveDraw({vibe: {groups: [...v.groups, {id, name: '新组 ' + (v.groups.length + 1), items: []}]}});
        rerender(); openGroup(id);
        return true;
      }
      case 'vibe-export-all': await save(await api.exportVibes({all: true})); return true;
      case 'vibe-chatu8': report(await api.importChatu8()); return true;
      case 'vibe-select': selecting = true; picked.vibes.clear(); picked.groups.clear(); rerender(); return true;
      case 'vibe-pick-done': selecting = false; picked.vibes.clear(); picked.groups.clear(); rerender(); return true;
      case 'vibe-pick': { const set = picked[el.dataset.kind]; if (set) { if (set.has(el.dataset.id)) set.delete(el.dataset.id); else set.add(el.dataset.id); rerender(); } return true; }
      case 'vibe-pick-all': {
        const kind = el.dataset.kind, set = picked[kind], items = kind === 'groups' ? state().groups : vibes();
        if (!set) return true;
        const shown = items.filter(x => matches(x.name, query)).map(x => x.id);
        if (shown.length && shown.every(id => set.has(id))) shown.forEach(id => set.delete(id)); else shown.forEach(id => set.add(id));
        rerender();
        return true;
      }
      case 'vibe-pick-group': if (picked.vibes.size) pickToGroup(); return true;
      case 'vibe-pick-delete': {
        const nv = picked.vibes.size, ng = picked.groups.size;
        if (!nv && !ng) return true;
        const what = [nv && `${nv} 个 Vibe`, ng && `${ng} 个组`].filter(Boolean).join('和');
        if (!await ctx.confirm(`删除 ${what}？`, `${nv ? '删掉的 Vibe 会从这台设备删除，也会从所有组里去掉。' : ''}${ng ? '删掉组不会删组里的 Vibe。' : ''}想留着可以先「全部导出」或者备份一次。`)) return true;
        if (ng) {
          const v = state();
          api.saveDraw({vibe: {groups: v.groups.filter(g => !picked.groups.has(g.id)), use: v.use.kind === 'group' && picked.groups.has(v.use.id) ? {kind: '', id: ''} : v.use}});
        }
        if (nv) await api.deleteVibes([...picked.vibes]);
        selecting = false; picked.vibes.clear(); picked.groups.clear(); rerender();
        ctx.notify(`已删除 ${what}`);
        return true;
      }
    }
    return false;
  }
  /** Files picked for import. */
  async function importFiles(files) {
    if (!files?.length) return;
    report(await api.importVibes(files));
  }
  function report(r) {
    rerender();
    const done = [r.added && `新增 ${r.added} 个 Vibe`, r.updated && `${r.updated} 个已经有了`, r.renamed && `${r.renamed} 个改成了智绘姬里的名字`, r.groups && `${r.groups} 个组`].filter(Boolean).join('，');
    if (r.errors.length) ctx.notify((done ? done + '；' : '') + r.errors.map(x => `${x.name}：${x.message}`).join('；'), {error: true});
    else ctx.notify(done ? '已导入：' + done : '没有导入任何内容');
  }
  /** Typing in the search box: filters both lists in place (no redraw, so the keyboard stays up). */
  function search(value) {
    query = value;
    for (const box of root().querySelectorAll('[data-list]')) filterList(box, query);
  }
  return {html, click, importFiles, search};
}

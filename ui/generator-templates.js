import {esc, field, input, textArea, btn} from './common.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {layerSort} from './layer-sort.js';
import {layerTree, arrangeRows} from '../core/layers.js';
import {icon} from './icons.js';

// Templates live in ordinary generator settings, so settings backup/sync keep
// them too. A template owns instructions, form, source and requested length.
export function generatorTemplates(ctx, current, use) {
  const {api} = ctx;
  const state = () => api.getState().generator || {};
  const rows = () => (state().templates || []).filter(x => x && typeof x.id === 'string');
  const save = (templates, groups = state().templateGroups || []) => {
    const s = api.getState(); s.generator = {...s.generator, templates, templateGroups: groups}; api.save(s);
  };
  function edit(template = null, done = () => {}) {
    const form = template?.form || current();
    const d = ctx.dialog(template ? '编辑指令模板' : '存成指令模板', field('名字', input('gt-name', template?.name || '', 'text', 'maxlength="40" placeholder="例如：论坛体番外"'))
      + field('完整指令', textArea('gt-wish', form.wish || '', 'rows="8" placeholder="写下格式、篇幅、情境等要求"'))
      + `<div class="actions">${btn('gt-save', '保存', 'primary')}</div>`, {over: true});
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=gt-save]')) return;
      const name = d.body.querySelector('[data-field=gt-name]').value.trim(), wish = d.body.querySelector('[data-field=gt-wish]').value;
      if (!name || !wish.trim()) { ctx.notify('请写好模板名字和指令'); return; }
      const list = rows(), row = {...template, id: template?.id || 'gt-' + crypto.randomUUID(), name, form: {...form, wish}};
      const i = list.findIndex(x => x.id === row.id); if (i < 0) list.push(row); else list[i] = row;
      save(list); d.close(); done(); ctx.notify('模板已保存');
    });
  }
  function open() {
    const d = ctx.dialog('指令模板', `<div class="actions">${btn('gt-new', icon('add') + '存当前指令', 'secondary')}</div><div class="gen-template-list"></div>`);
    const list = d.body.querySelector('.gen-template-list');
    const tree = () => layerTree(rows(), state().templateGroups).map(e => e.style ? {style: e.style.id} : {group: {...e.group}, styles: e.styles.map(x => x.id)});
    const commit = next => { const [templates, groups] = arrangeRows(rows(), next); save(templates, groups); };
    const actions = [{key:'edit',label:'编辑',icon:'edit'}, {key:'copy',label:'复制',icon:'copy'}, {key:'delete',label:'删除',icon:'trash',danger:true}];
    const row = t => swipeRow(t.id, `<div class="list-row"><span><strong>${esc(t.name)}</strong><small class="gen-template-preview">${esc(t.form?.wish || '')}</small></span></div>`, actions, {label:t.name});
    const paint = () => {
      const all = rows();
      list.innerHTML = layerTree(all,state().templateGroups).map(e => e.style ? row(e.style) : swipeRow('g:'+e.group.id, `<div class="list-row style-group-row" aria-expanded="${!!e.group.open}"><span>${icon(e.group.open ? 'chevron' : 'layers')}</span><span><strong data-group-name>${esc(e.group.name)}</strong><small>${e.styles.length} 个模板</small></span></div>`, [{key:'rename',label:'改名',icon:'edit'},{key:'ungroup',label:'解散',icon:'layers'}], {className:'style-group'}) + `<div class="style-group-body" data-group-body="${esc(e.group.id)}"${e.group.open ? '' : ' data-closed'}><div class="style-group-inner">${e.styles.map(row).join('')}</div></div>`).join('') || '<p class="hint">把常用指令存下来，下次点一下就能用。</p>';
    };
    const groupName = () => '新建组';
    const sort = layerSort({ctx, list, tree, commit, paint, groupName});
    const remove = async ids => {
      if (!await ctx.confirm(`删除 ${ids.length} 个指令模板？`, '已经生成的小剧场会保留。')) return;
      save(rows().filter(t => !ids.includes(t.id))); paint();
    };
    paint();
    const swipe = mountSwipeList(list, {ctx, sort:{start:(r,p)=>sort.lift(r,p)},
      bulk:[{key:'group',label:'建组',icon:'layers'},{key:'delete',label:'删除',icon:'trash',danger:true}],
      onBulk:async(key,ids)=>{if(key==='group') await sort.makeGroup(ids); else await remove(ids);},
      onTap:id=>{if(id.startsWith('g:'))return sort.toggle(id.slice(2));const t=rows().find(x=>x.id===id);if(t){use(structuredClone(t.form));d.close();}},
      onAction:async(key,id)=>{
        if(id.startsWith('g:')) { if(key==='rename')sort.rename(id.slice(2)); else {const gid=id.slice(2);save(rows().map(t=>t.group===gid?{...t,group:undefined}:t),(state().templateGroups||[]).filter(g=>g.id!==gid));paint();} return; }
        const t=rows().find(x=>x.id===id);if(!t)return;
        if(key==='edit')edit(t,paint);
        else if(key==='copy'){save([...rows(),{...structuredClone(t),id:'gt-'+crypto.randomUUID(),name:t.name+' 副本'}]);paint();}
        else await remove([id]);
      }});
    d.body.addEventListener('click', e=>{if(e.target.closest('[data-action=gt-new]'))edit(null,paint);});
    d.onClose(()=>swipe.dispose());
  }
  return {open};
}

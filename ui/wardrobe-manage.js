import {esc, field, input, menu, select, toggle} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';

function form(ctx, title, fields, action, submit, options) {
  return new Promise(resolve => {
    let saved;
    const d = ctx.dialog(title, '<form>' + fields + '<div class="actions"><button type="submit" class="primary">' + esc(action) + '</button></div></form>', options);
    const el = d.body.querySelector('form'), button = el.querySelector('[type=submit]');
    d.onClose(() => resolve(saved));
    el.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      try {
        saved = await submit(key => el.querySelector('[data-field=' + key + ']')?.value);
        if (saved !== undefined) d.close();
      } catch (error) { if (d.live) ctx.notify(error.message, {error:true}); }
      finally { button.disabled = false; }
    });
  });
}

export function nameCategory(ctx, old = '', options) {
  return form(ctx, old ? '分类改名' : '新建分类', field('分类名称', input('name', old, 'text', 'maxlength="40" required')), '保存', async get => {
    const name = get('name').trim().replace(/\s+/g, ' ');
    const categories = await ctx.api.editWardrobeCategory({old, name});
    return {name, categories};
  }, options);
}

export async function manageCategories(ctx, {categories, items}) {
  const name = await menu(ctx, '管理分类', [
    {key:'new', icon:'add', label:'新建分类'},
    ...categories.map((name, index) => ({key:String(index), icon:'layers', label:name,
      note:items.filter(item => item.category === name).length + ' 件'})),
  ]);
  if (name === null) return;
  if (name === 'new') return nameCategory(ctx);
  const old = categories[Number(name)], count = items.filter(item => item.category === old).length;
  const action = await menu(ctx, old, [
    {key:'rename', icon:'edit', label:'改名'}, {key:'remove', icon:'trash', label:'删除分类', danger:true},
  ]);
  if (action === 'rename') return nameCategory(ctx, old);
  if (action !== 'remove') return;
  const choices = [['','移到未分类'], ...categories.filter(name => name !== old).map(name => ['category:' + name,'移到「' + name + '」']), ['delete','同时删除衣物']];
  const fields = count ? '<p class="hint">此分类有 ' + count + ' 件衣物</p>' + field('衣物处理', select('target', '', choices)) : '';
  return form(ctx, '删除「' + old + '」', fields, '删除分类', async get => {
    const target = get('target') || '', deleteItems = target === 'delete';
    if (deleteItems && !await ctx.confirm('同时移除 ' + count + ' 件衣物？', '这些衣物会从衣柜移除，图片仍保留在相册。', {over:true})) return;
    return ctx.api.editWardrobeCategory({old, name:target.startsWith('category:') ? target.slice('category:'.length) : '', remove:true, deleteItems, expectedCount:count});
  });
}

export async function wardrobeSettings(ctx, state) {
  const story = await ctx.api.wardrobeStorySettings?.().catch(() => null);
  const d = ctx.dialog('衣柜设置', '<div class="group pad">'
    + toggle('detail-outfit','记录详细穿搭',story?.enabled,'跟随这段剧情。实际换装时记下详细描述和绘图标签。')
    + (story?.available ? '' : '<p class="hint">打开一段酒馆剧情后即可开启。</p>')
    + '<button type="button" class="list-row" data-action="categories">' + icon('layers') + '<span>管理分类</span>' + icon('next') + '</button></div>');
  const box = d.body.querySelector('[data-field=detail-outfit]');
  box.disabled = !story?.available;
  box.addEventListener('change', async () => {
    box.disabled = true;
    try {
      const saved = await ctx.api.wardrobeStorySettings(box.checked);
      box.checked = saved.enabled;
      box.disabled = !saved.available;
      if (!saved.available) ctx.notify('打开一段酒馆剧情后即可开启');
    } catch (error) {
      box.checked = !box.checked;
      box.disabled = false;
      ctx.notify(error.message, {error:true});
    }
  });
  d.body.querySelector('[data-action=categories]').addEventListener('click', () => {
    d.close();
    manageCategories(ctx, state).catch(error => ctx.notify(error.message, {error:true}));
  });
}

export async function sharedWardrobeMenu(ctx, all, visible, add) {
  const key = await menu(ctx, '通用衣柜操作', [
    {key:'add', icon:'add', label:'添加衣物'},
    {key:'import', icon:'import', label:'导入衣柜包'},
    all.length && {key:'all', icon:'share', label:'导出全部衣物', note:all.length + ' 件'},
    visible.length > 0 && visible.length < all.length && {key:'filtered', icon:'sliders', label:'导出当前筛选结果', note:visible.length + ' 件'},
  ]);
  if (key === 'add') return add();
  if (key === 'all' || key === 'filtered') {
    const file = await ctx.api.exportWardrobePack(key === 'filtered' ? visible.map(item => item.id) : undefined);
    await saveFile(ctx.doc, file, '通用衣柜.json');
    return;
  }
  if (key !== 'import') return;
  const pick = ctx.dialog('导入衣柜包', '<div class="pick-list"><label class="list-row file-button">' + icon('file')
    + '<span><strong>选择衣柜包文件</strong></span><input type="file" accept=".json,application/json" aria-label="选择衣柜包文件"></label></div>');
  pick.body.querySelector('input').addEventListener('change', async event => {
    const input = event.target, file = input.files[0];
    if (!file) return;
    input.disabled = true;
    try {
      const preview = await ctx.api.previewWardrobePack(file);
      if (!pick.live) return;
      pick.close();
      const fields = '<p>新增 ' + preview.added + ' 件 · 重复 ' + preview.duplicate + ' 件 · 冲突 ' + preview.conflicts + ' 件</p>'
        + (preview.conflicts ? '<ul class="wardrobe-pack-conflicts">' + preview.names.map(name => '<li>' + esc(name) + '</li>').join('') + '</ul>'
          + field('冲突处理', select('mode', 'merge', [['merge','合并 · 保留现有衣物'],['overwrite','覆盖上面列出的冲突衣物']])) : '');
      await form(ctx, '预览衣柜包', fields, '导入', async get => {
        const result = await ctx.api.importWardrobePack(file, {overwrite:get('mode') === 'overwrite', expected:preview});
        ctx.notify('已新增 ' + result.added + ' 件，覆盖 ' + result.replaced + ' 件');
        return result;
      });
    } catch (error) { ctx.notify(error.message, {error:true}); }
    finally { input.disabled = false; input.value = ''; }
  });
}

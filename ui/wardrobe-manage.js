import {esc, field, input, menu, select, toggle} from './common.js';
import {icon} from './icons.js';
import {layerSort} from './layer-sort.js';
import {mountSwipeList, swipeRow} from './swipe-list.js';
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

function removeCategory(ctx, old, categories, count) {
  const choices = [['','移到未分类'], ...categories.filter(name => name !== old).map(name => ['category:' + name,'移到「' + name + '」']), ['delete','同时删除衣物']];
  const fields = count ? '<p class="hint">此分类有 ' + count + ' 件衣物</p>' + field('衣物处理', select('target', '', choices)) : '';
  return form(ctx, '删除「' + old + '」', fields, '删除分类', async get => {
    const target = get('target') || '', deleteItems = target === 'delete';
    if (deleteItems && !await ctx.confirm('同时移除 ' + count + ' 件衣物？', '这些衣物会从衣柜移除，图片仍保留在相册。', {over:true})) return;
    return ctx.api.editWardrobeCategory({old, name:target.startsWith('category:') ? target.slice('category:'.length) : '', remove:true, deleteItems, expectedCount:count});
  }, {over:true});
}

async function manageCategories(ctx, parent) {
  let {categories, items} = await ctx.api.wardrobe();
  if (!parent.live) return;
  const d = ctx.dialog('管理分类', '<div class="style-list"></div>', {add:'新建分类', over:true});
  const list = d.body.querySelector('.style-list'), prefix = 'category:';
  const actions = [{key:'rename', icon:'edit', label:'改名'}, {key:'remove', icon:'trash', label:'删除', danger:true}];
  let working = false;

  function paint() {
    const counts = new Map();
    for (const {category} of items) counts.set(category, (counts.get(category) || 0) + 1);
    list.innerHTML = categories.map(name => swipeRow(prefix + name,
      `<div class="list-row">${icon('layers')}<span><strong>${esc(name)}</strong><small>${counts.get(name) || 0} 件</small></span></div>`,
      actions, {label:name})).join('') || '<p class="hint">点右上角的 + 新建分类。</p>';
  }

  async function run(change) {
    if (working || !d.live) return;
    working = true;
    try { await change(); }
    catch (error) { if (d.live) ctx.notify(error.message, {error:true}); }
    finally { working = false; }
  }

  const edit = change => run(async () => {
    if (!await change()) return;
    ({categories, items} = await ctx.api.wardrobe());
    if (d.live) paint();
  });
  const sort = layerSort({ctx, list, paint, tree:() => categories.map(name => ({style:prefix + name})), commit:next => {
    const previous = categories;
    categories = next.map(row => row.style.slice(prefix.length));
    run(async () => {
      try { await ctx.api.editWardrobeCategory({order:categories}); }
      catch (error) { categories = previous; if (d.live) paint(); throw error; }
    });
  }});
  paint();
  const swipe = mountSwipeList(list, {ctx, leftOnly:true,
    hint:'左滑改名或删除，长按拖动排序。', mouseHint:'点行尾「⋯」改名或删除，按住拖动排序。',
    sort:{start:(row, point) => working ? null : sort.lift(row, point)},
    onAction:(action, id) => edit(() => {
      const name = id.slice(prefix.length);
      return action === 'rename' ? nameCategory(ctx, name, {over:true})
        : removeCategory(ctx, name, categories, items.filter(item => item.category === name).length);
    })});
  d.overlay.querySelector('[data-sheet-add]').addEventListener('click', () => edit(() => nameCategory(ctx, '', {over:true})));
  d.onClose(() => swipe.dispose());
}

export async function wardrobeSettings(ctx) {
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
  const button = d.body.querySelector('[data-action=categories]');
  button.addEventListener('click', () => {
    button.disabled = true;
    manageCategories(ctx, d).catch(error => ctx.notify(error.message, {error:true})).finally(() => { button.disabled = false; });
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

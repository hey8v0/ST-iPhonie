// 我的主题 in 设置: how the phone looks (配色, 壁纸, 图标) kept as a set and put on again with a tap, and the same set as one
// file to give someone (core/looks.js). A theme holds its own pictures, made small and with nothing but the picture in them,
// so the album can be tidied whatever the themes are. Nothing is lost by putting one on: how the phone looked, not kept
// yet, is kept first.
import {esc, btn, field, input, heading, help, groupTitle, size} from './common.js';
import {icon} from './icons.js';
import {APPS} from './apps.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {saveFile, shareFile, canShareFiles} from '../download.js';
import {themePicture} from '../core/thumbnail.js';
import {cleanTheme} from '../core/theme-colors.js';
import {LOOK_MOST, WALLPAPER_FIT, ICON_FIT, readLookFile, writeLookFile, exportLook, lookParts, lookPatch, wholeLook, wornLook, lookKept, defaultLookPatch} from '../core/looks.js';
import {lookShot} from './look-shot.js';

const HELP = '把现在手机的配色、壁纸和图标存成一套，随时一点就换回来。也能导出成一个文件发给别人，对方在这里导入就是同一套。\n版本不一样也能用：图标是按 App 认的，不是按位置。对方这个版本没有的 App，图标先留着，更新插件后自动用上；主题里没做的 App 用默认图标。\n点开一个主题，配色、壁纸、图标三个按钮可以点掉：只换或者只导出其中几样。\n换主题前，没存过的样子会自动存一份，不会丢。\n存下来的图片会缩小，拍摄地点、出图参数这些不会带上。想自己做：解压导出的文件，把 icons 里的图换掉再压缩回 zip，里面的 README.txt 写了怎么命名。\n左滑一行能改名、导出和删除，右滑能多选。';
const FILE_TYPES = '.zip,application/zip,application/x-zip-compressed,.json,application/json';
const APP_NAMES = Object.entries(APPS).map(([id, app]) => [id, app.name]);
const NAMES = Object.fromEntries(APP_NAMES.map(([id, name]) => [name, id]));
const EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'};
const PARTS = [['colors', '配色'], ['wallpaper', '壁纸'], ['icons', '图标']];
const ROW_ACTIONS = [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'export', label: '导出', icon: 'download'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
const pad = n => String(n).padStart(2, '0');
const iconCount = look => Object.values(look.icons || {}).filter(one => one.file).length;
const facts = look => [look.author && '作者 ' + look.author, iconCount(look) && iconCount(look) + ' 个图标', look.size && size(look.size)].filter(Boolean).join(' · ');
const fileNameOf = look => `ST-iPhonie 主题 ${look.name}`;
/** What to say before a theme goes on: which apps have the default icon, which of its icons this version cannot show yet. */
function notesOf(look) {
  const out = [], icons = look.icons || {};
  if (Object.keys(icons).length) {
    const plain = Object.keys(APPS).filter(app => !icons[app]).map(app => APPS[app].name);
    if (plain.length) out.push(`${plain.slice(0, 5).join('、')}${plain.length > 5 ? ` 等 ${plain.length} 个 App` : ''} 没有做图标，用默认的。`);
    const later = Object.keys(icons).filter(app => !APPS[app]).length;
    if (later) out.push(`还带了 ${later} 个新版本才有的 App 的图标，更新插件后自动用上。`);
  }
  if (look.fixed) out.push(`有 ${look.fixed} 处看不清的颜色自动调了。`);
  if (look.skipped) out.push(`有 ${look.skipped} 张图用不了，没放进去。`);
  return out;
}

export function looksPage({ctx, v}) {
  const {api, win, doc} = ctx;
  let left = true, phone = null, list = [], urls = [], swipe = null;
  const live = fn => (...args) => { if (!left) return fn(...args); };
  const newId = () => `looks:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const urlOf = blob => { const url = win.URL.createObjectURL(blob); urls.push(url); return url; };
  const letGo = () => { for (const url of urls) win.URL.revokeObjectURL(url); urls = []; };
  async function pluginVersion() {
    try { return (await (await win.fetch(new URL('../manifest.json', import.meta.url))).json())?.version || ''; } catch { return ''; }
  }

  // ---------- making one ----------
  /** How the phone looks now, as what a theme is made from. Pictures that are in a theme already need no drawing again. */
  async function sourceOf(now) {
    const inLook = new Map(), fromLook = async id => { if (!inLook.has(id)) inLook.set(id, await api.lookFiles(id).catch(() => null)); return inLook.get(id); };
    const fromPhoto = async id => (await api.getPhoto(id).catch(() => null))?.blob || null;
    const colors = now.skin === 'custom' || now.wallpaper.key === 'custom' ? cleanTheme(now.customTheme) : null, wall = now.wallpaper;
    const source = {skin: now.skin, iconStyle: now.iconStyle, monoHue: now.monoHue ?? null, icons: {}, ...(colors ? {customTheme: colors} : {})};
    if (wall.kind === 'builtin') source.wallpaper = {key: wall.key};
    else {
      const blob = wall.kind === 'photo' ? await fromPhoto(wall.photoId) : (await fromLook(wall.id))?.wallpaper;
      source.wallpaper = blob ? {blob, done: wall.kind === 'look'} : {key: now.skin};
    }
    for (const [app, one] of Object.entries(now.icons)) {
      if (one.kind === 'glyph') { if (one.key !== 'default') source.icons[app] = {glyph: one.key}; continue; }
      const blob = one.kind === 'photo' ? await fromPhoto(one.photoId) : (await fromLook(one.id))?.icons[app]?.blob;
      if (blob) source.icons[app] = {blob, done: one.kind === 'look'};
    }
    return source;
  }
  /** A theme ready to keep: its pictures fitted, the small picture for the list, its file. redraw: pictures of one's own go in drawn anew; from a file, only when too big. */
  async function makeLook(source, {id = newId(), name, author = '', at = Date.now(), made = Date.now(), own = false, redraw = true}) {
    const files = [], shown = {wallpaper: null, icons: {}}, icons = {};
    let wallpaper = source.wallpaper?.key ? {key: source.wallpaper.key} : undefined, skipped = source.skipped || 0;
    if (source.wallpaper?.blob) {
      try {
        const {blob} = await themePicture(win, source.wallpaper.blob, {...WALLPAPER_FIT, redraw: redraw && !source.wallpaper.done}), file = `wallpaper.${EXT[blob.type] || 'png'}`;
        files.push({path: file, blob}); shown.wallpaper = blob; wallpaper = {file};
      } catch { skipped++; }
    }
    for (const [app, one] of Object.entries(source.icons || {})) {
      if (one.glyph) { icons[app] = {glyph: one.glyph}; continue; }
      try {
        const {blob, clear} = await themePicture(win, one.blob, {...ICON_FIT, redraw: redraw && !one.done}), file = `icons/${app}.${EXT[blob.type] || 'png'}`;
        files.push({path: file, blob}); shown.icons[app] = {blob, clear};
        icons[app] = {file, ...(clear ? {clear: true} : {})};
      } catch { skipped++; }
    }
    const look = {id, kind: 'look', at, updatedAt: Date.now(), made, name, author, ...(own ? {own} : {}), ...(source.skin ? {skin: source.skin} : {}), ...(source.customTheme ? {customTheme: source.customTheme} : {}), ...(wallpaper ? {wallpaper} : {}), ...(source.iconStyle ? {iconStyle: source.iconStyle, monoHue: source.monoHue ?? null} : {}), icons};
    const thumb = await lookShot(win, look, shown).catch(() => null);
    if (thumb) files.push({path: `preview.${EXT[thumb.type] || 'png'}`, blob: thumb});
    const blob = await writeLookFile(look, files, {version: await pluginVersion(), names: APP_NAMES});
    return {...look, size: blob.size, blob, ...(thumb ? {thumb} : {}), ...(skipped ? {skipped} : {}), ...(source.fixed ? {fixed: source.fixed} : {})};
  }
  /** Kept as a theme: what is said once about it does not stay. */
  const keep = ({skipped, fixed, ...look}) => api.saveLook(look);
  /** How the phone looks now, made into a theme and worn: it no longer leans on the album. */
  async function keepPhone({id, name, author, at, own = true}) {
    const now = await api.getPhone(), look = await makeLook(await sourceOf(now), {...(id ? {id} : {}), name, author, ...(at ? {at} : {}), own});
    await keep(look);
    await api.savePhone(lookPatch(look, now));
    return look;
  }
  /** Before another look goes on: this one, unless it is kept or there is nothing of one's own in it. */
  async function keepBefore() {
    const now = await api.getPhone();
    if (lookKept(now, await api.listLooks())) return;
    const d = new Date();
    await keep(await makeLook(await sourceOf(now), {name: `之前的样子 ${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`, own: true}));
  }
  async function wear(look, parts) {
    await keepBefore();
    await api.savePhone(lookPatch(look, await api.getPhone(), parts));
  }

  // ---------- the page ----------
  async function load() { [phone, list] = await Promise.all([api.getPhone(), api.listLooks()]); }
  function render() {
    if (left || !phone) return;
    swipe?.dispose(); swipe = null;
    letGo();
    const current = wornLook(phone, list), from = current ? null : list.find(look => look.id === phone.look?.id);
    const buttons = current ? (wholeLook(current) ? '' : btn('look-save', '存成新主题', 'secondary')) + btn('look-open-current', icon('download') + '导出', 'secondary')
      : from ? btn('look-update', '保存改动', 'primary') + btn('look-save', '存成新主题', 'secondary')
      : btn('look-save', '存成主题', 'primary');
    v.draw(heading('我的主题', help(HELP), 'My Themes')
      + `<div class="group pad look-now"><div class="look-now-text"><strong>${current ? esc(current.name) : from ? `${esc(from.name)}（改过）` : '现在的样子'}</strong><small>${current ? '正在用' : from ? '改动还没存' : '还没存下来'}</small></div><div class="actions">${buttons}</div></div>`
      + (list.length ? groupTitle('存下来的') + `<div class="group look-list" data-look-list>${list.map(look => swipeRow(look.id, `<div class="list-row look-row"><span class="look-thumb">${look.thumb ? `<img src="${esc(urlOf(look.thumb))}" alt="">` : ''}</span><span class="look-row-text"><strong>${esc(look.name)}</strong><small>${esc(facts(look))}</small></span>${look === current ? `<span class="look-on" aria-label="正在用">${icon('check')}</span>` : ''}</div>`, ROW_ACTIONS, {label: look.name})).join('')}</div>` : '')
      + `<div class="actions"><label class="secondary file-button">${icon('import')}导入主题<input type="file" data-look-file accept="${FILE_TYPES}" aria-label="选主题文件"></label></div>`
      + `<div class="actions">${btn('look-reset', '恢复默认的样子', 'text-button')}</div>`);
    const rows = v.root.querySelector('[data-look-list]');
    if (rows) swipe = mountSwipeList(rows, {ctx,
      onTap: id => { const look = list.find(x => x.id === id); if (look) lookSheet(look); },
      onAction: (key, id) => { const look = list.find(x => x.id === id); if (look) rowAction(key, look).catch(error => ctx.notify(error.message, {error: true})); },
      bulk: [{key: 'delete', label: '删除', icon: 'trash', danger: true}],
      onBulk: async (key, ids) => { if (key === 'delete') await deleteMany(ids); }});
  }
  async function again() { await load(); render(); }
  async function rowAction(key, look) {
    if (key === 'rename') renameSheet(look);
    else if (key === 'export') await saveLookFile(look, lookParts(look));
    else if (key === 'delete') await deleteMany([look.id]);
  }
  async function deleteMany(ids) {
    const names = list.filter(look => ids.includes(look.id));
    if (!names.length || !await ctx.confirm(names.length > 1 ? `删除这 ${names.length} 个主题？` : `删除「${names[0].name}」？`, '它的壁纸和图标也一起删掉，相册里的照片不受影响。想留着可以先导出。')) return;
    let gone = 0, inUse = 0;
    for (const look of names) { try { await api.deleteLook(look.id); gone++; } catch { inUse++; } }
    await again();
    ctx.notify(inUse ? `${gone ? `删了 ${gone} 个，` : ''}正在用的不能删，先换一个主题` : '已删除', {error: !gone});
  }
  /** The file to give away, the parts asked for. */
  async function fileFor(look, parts) {
    const full = look.blob ? look : await api.getLook(look.id);
    if (!full?.blob) throw Error('这个主题已经不在了');
    return exportLook(full, parts, {version: await pluginVersion(), names: APP_NAMES});
  }
  const saveLookFile = async (look, parts) => ctx.notify('已下载 ' + await saveFile(doc, await fileFor(look, parts), fileNameOf(look)));

  // ---------- its sheet ----------
  /** A theme: what it looks like, which parts go with it, and what to do with it. fresh: it came from a file just now, kept only when asked. */
  function lookSheet(look, {fresh = false} = {}) {
    const has = lookParts(look), parts = {...has}, picture = look.thumb ? win.URL.createObjectURL(look.thumb) : '', shown = PARTS.filter(([key]) => has[key]);
    const worn = !fresh && wornLook(phone, list)?.id === look.id, notes = notesOf(look), share = !fresh && canShareFiles(win);
    const d = ctx.dialog(look.name, `<div class="look-sheet">${picture ? `<img class="look-shot" src="${esc(picture)}" alt="">` : ''}
      ${facts(look) ? `<p class="look-facts">${esc(facts(look))}</p>` : ''}
      ${shown.length > 1 ? `<div class="look-chips" role="group" aria-label="包含哪些">${shown.map(([key, label]) => `<button type="button" class="combo-chip" data-look-part="${key}" aria-pressed="true">${label}</button>`).join('')}</div>` : ''}
      ${notes.map(note => `<p class="hint">${esc(note)}</p>`).join('')}
      <div class="actions look-sheet-actions">${worn ? '<span class="look-worn">' + icon('check') + '正在用</span>' : btn('use', '用这个主题', 'primary')}${fresh ? btn('keep', '只存下来', 'secondary') : btn('export', icon('download') + '导出', 'secondary')}${share ? btn('share', icon('share') + '分享', 'secondary') : ''}</div>
      ${fresh ? '' : `<div class="actions look-sheet-more">${btn('rename', '改名', 'text-button')}${btn('delete', '删除', 'text-button')}</div>`}</div>`);
    if (picture) d.onClose(() => win.URL.revokeObjectURL(picture));
    const any = () => Object.values(parts).some(Boolean);
    d.body.addEventListener('click', async e => {
      const part = e.target.closest('[data-look-part]');
      if (part) {
        parts[part.dataset.lookPart] = !parts[part.dataset.lookPart];
        part.setAttribute('aria-pressed', String(parts[part.dataset.lookPart]));
        for (const el of d.body.querySelectorAll('[data-action=use],[data-action=keep],[data-action=export],[data-action=share]')) el.disabled = !any();
        return;
      }
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled || !any()) return;
      el.disabled = true;
      try {
        switch (el.dataset.action) {
          case 'use':
            el.textContent = '正在换……';
            if (fresh) await keep(look);
            await wear(look, parts);
            d.close();
            await again();
            ctx.notify('换好了');
            break;
          case 'keep': await keep(look); d.close(); await again(); ctx.notify('存下来了'); break;
          case 'export': await saveLookFile(look, parts); break;
          case 'share': await shareFile(doc, await fileFor(look, parts), fileNameOf(look)); break;
          case 'rename': renameSheet(look, d); break;
          case 'delete': d.close(); await deleteMany([look.id]); break;
        }
      } catch (error) { ctx.notify(error.message, {error: !/已取消/.test(error.message)}); }
      finally { if (el.isConnected) { el.disabled = false; if (el.dataset.action === 'use') el.textContent = '用这个主题'; } }
    });
    return d;
  }
  function nameFields(name, author) {
    return field('名字', input('look-name', name, 'text', 'maxlength="40" autocomplete="off"')) + field('作者', input('look-author', author, 'text', 'maxlength="40" autocomplete="off" placeholder="可以不填，发给别人时会显示"'));
  }
  function renameSheet(look, under = null) {
    const d = ctx.dialog('改名', `${nameFields(look.name, look.author || '')}<div class="actions"><button type="button" class="primary" data-action="go">好</button></div>`, {over: !!under});
    d.body.addEventListener('click', async e => {
      const go = e.target.closest('[data-action=go]');
      if (!go) return;
      go.disabled = true;
      try {
        const name = d.body.querySelector('[data-field=look-name]').value, author = d.body.querySelector('[data-field=look-author]').value;
        await api.renameLook(look.id, {name, author});
        d.close();
        under?.close();
        await again();
      } catch (error) { go.disabled = false; ctx.notify(error.message, {error: true}); }
    });
  }
  /** 存成主题: a name, and it is kept; its sheet then has the 导出. */
  function saveSheet() {
    const named = list.find(look => look.own && look.author)?.author || '', first = phone.skin === 'custom' && phone.customTheme?.name || '我的主题';
    const d = ctx.dialog('存成主题', `${nameFields(first, named)}<div class="actions"><button type="button" class="primary" data-action="go">存下来</button></div>`);
    d.body.addEventListener('click', async e => {
      const go = e.target.closest('[data-action=go]');
      if (!go) return;
      const name = d.body.querySelector('[data-field=look-name]').value.trim(), author = d.body.querySelector('[data-field=look-author]').value.trim();
      if (!name) { ctx.notify('要有名字'); return; }
      go.disabled = true; go.textContent = '正在存……';
      try {
        const look = await keepPhone({name, author});
        d.close();
        await again();
        lookSheet(list.find(row => row.id === look.id) || look);
      } catch (error) { go.disabled = false; go.textContent = '存下来'; ctx.notify(error.message, {error: true}); }
    });
  }

  // ---------- on the page ----------
  v.on('change', '[data-look-file]', live(async el => {
    const file = el.files?.[0];
    if (!file) return;
    el.value = '';
    el.disabled = true;
    try {
      if (file.size > LOOK_MOST) throw Error('这个文件太大了，不像主题文件');
      ctx.notify('正在读主题……');
      const read = await readLookFile(new Uint8Array(await file.arrayBuffer()), {fileName: file.name, names: NAMES});
      await load();
      const have = read.id ? list.find(look => look.id === read.id) : null;
      // The same file again is the one already here; another version of it comes as one more.
      if (have && have.made === read.made) { lookSheet(have); return; }
      lookSheet(await makeLook(read, {...(read.id && !have ? {id: read.id} : {}), name: read.name, author: read.author, ...(read.made ? {made: read.made} : {}), redraw: false}), {fresh: true});
    } catch (error) { ctx.notify(error.message, {error: true}); }
    finally { if (el.isConnected) el.disabled = false; }
  }));
  v.on('click', '[data-action^=look-]', live(async el => {
    try {
      switch (el.dataset.action) {
        case 'look-save': saveSheet(); break;
        case 'look-open-current': { const look = wornLook(phone, list); if (look) lookSheet(look); break; }
        case 'look-update': {
          const from = list.find(look => look.id === phone.look?.id);
          if (!from) break;
          await v.busy(el, () => keepPhone({id: from.id, name: from.name, author: from.author, at: from.at, own: from.own}));
          await again();
          ctx.notify('改动存好了');
          break;
        }
        case 'look-reset': {
          if (!await ctx.confirm('恢复默认的样子？', '配色、壁纸和图标都换回默认。现在的样子没存过的话，会先存下来。')) break;
          await keepBefore();
          await api.savePhone(defaultLookPatch(await api.getPhone()));
          await again();
          ctx.notify('换回来了');
          break;
        }
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }));
  return {
    async start() { left = false; await again(); },
    render,
    /** Something came from another device. */
    synced() { if (!left) again().catch(() => {}); },
    leave() { left = true; swipe?.dispose(); swipe = null; letGo(); }
  };
}

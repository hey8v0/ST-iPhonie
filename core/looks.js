// 我的主题: a whole look (配色, 壁纸 and 图标) as one zip, the same whether it is kept on the phone or sent to someone:
//   theme.json        what the look is               wallpaper.*   the wallpaper, when it is a picture
//   icons/<app id>.*  an icon that is a picture      preview.*     a small picture of it, in the kept copy only
//   README.txt        how to make one by hand
// Icons go by the app's id, never by place, so a file from another version still fits: an icon for an app this version does
// not have stays in the file and on the phone, and shows once the plugin has that app; an app the file has no icon for has
// the default one. Nothing in a file is run: colours go through cleanTheme, a picture must be a picture, words are cut
// short and only ever shown as text.
import {readZip, writeZip} from './model-files.js';
import {cleanTheme, readableTheme, readThemeFile} from './theme-colors.js';
import {LIBRARY_LIMITS, PHONE_APPS, PHONE_GLYPHS, PHONE_SKINS, PHONE_WALLPAPERS} from './library.js';

export const LOOK_FORMAT = 1;
/** The biggest file taken, and how big its pictures end up (at 3× an icon on the home screen is under 200 px wide). */
export const LOOK_MOST = 64 * 1024 * 1024;
export const WALLPAPER_FIT = Object.freeze({long: 2560, short: 1440, most: 3 * 1024 * 1024, quality: .86, flat: true});
export const ICON_FIT = Object.freeze({long: 384, most: 400 * 1024, quality: .9});

const APP_ID = /^[a-z][a-z0-9_-]{0,39}$/, LOOK_ID = /^looks:[\w-]{1,80}$/;
const tag = (b, at) => String.fromCharCode(...b.subarray(at, at + 4));
/** What a picture really is, from its first bytes ('' when it is none of those the phone shows). */
export function pictureType(b) {
  if (b[0] === 0x89 && tag(b, 1).startsWith('PNG')) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (tag(b, 0) === 'GIF8') return 'image/gif';
  if (tag(b, 0) === 'RIFF' && tag(b, 8) === 'WEBP') return 'image/webp';
  if (tag(b, 4) === 'ftyp' && /^avi[fs]/.test(tag(b, 8))) return 'image/avif';
  return '';
}
const words = (value, most = 40) => typeof value === 'string' ? [...value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()].slice(0, most).join('') : '';
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const nameOf = fileName => words(String(fileName || '').replace(/\.[^.]*$/, '').replace(/^ST-iPhonie\s*主题\s*/i, '')) || '别人的主题';
/** Where the theme is in a zip (one made by hand often has a folder around everything); null when there is none. */
function rootOf(paths) {
  for (const kind of [/^(.*\/)?theme\.json$/i, /^(.*\/)?icons\/[^/]+$/i, /^(.*\/)?wallpaper\.[a-z0-9]+$/i]) for (const path of paths) { const found = path.match(kind); if (found) return found[1] || ''; }
  return null;
}

/**
 * A theme file back, made by the phone, by hand, or only a 配色 file: {id, made, name, author, skin, customTheme,
 * wallpaper: {key} | {blob}, iconStyle, monoHue, icons: {app: {glyph} | {blob}}, fixed (colours put right to be readable),
 * skipped (pictures left out)}. names: {中文名: app id}, so a picture made by hand may be called 角色.png. Throws a plain
 * message for anything else.
 */
export async function readLookFile(bytes, {fileName = '', names = {}} = {}) {
  const first = bytes.find(b => b > 32 && b !== 0xef && b !== 0xbb && b !== 0xbf);
  if (first === 0x7b) return colorsOnly(bytes, fileName);
  let files;
  try { files = readZip(bytes, {exact: true}); }
  catch (error) { throw Error(/密码|zip64|压缩方式/.test(error.message) ? error.message : '这不是主题文件，要选导出的 .zip'); }
  const paths = [...files.keys()];
  if (paths.length > 300 || paths.reduce((n, path) => n + files.get(path).size, 0) > 4 * LOOK_MOST) throw Error('这个压缩包太大了，不像主题文件');
  const root = rootOf(paths);
  if (root === null) throw Error('这个压缩包里没有主题：要有 theme.json，或者 wallpaper 图片和 icons 文件夹');
  const inside = paths.filter(path => path.startsWith(root)).map(path => path.slice(root.length));
  let m = {};
  const head = files.get(root + inside.find(path => /^theme\.json$/i.test(path)));
  if (head) {
    if (head.size > 1024 * 1024) throw Error('主题文件坏了（theme.json 太大）');
    try { m = JSON.parse(new TextDecoder().decode(await head.bytes())); } catch { throw Error('主题文件坏了（theme.json 读不出来）'); }
    if (m?.app !== 'ST-iPhonie' || m.kind !== 'look') throw Error('这不是小手机的主题文件');
    if (m.format > LOOK_FORMAT) throw Error('这个主题是更新版本的插件做的，请先更新插件');
  }
  let skipped = 0;
  const read = new Map();
  /** A picture of the file, once: theme.json and the file's own name can both lead to it. */
  const picture = async path => {
    if (read.has(path)) return read.get(path);
    const entry = files.get(root + path);
    if (!entry) return null;
    const data = entry.size > LIBRARY_LIMITS.photo ? null : await entry.bytes().catch(() => null), type = data ? pictureType(data) : '';
    if (!type) skipped++;
    read.set(path, type ? new Blob([data], {type}) : null);
    return read.get(path);
  };
  const clean = cleanTheme(m.customTheme), {theme: customTheme, fixed} = clean ? readableTheme(clean) : {theme: null, fixed: 0};
  let wallpaper;
  const wallFile = typeof m.wallpaper?.file === 'string' ? m.wallpaper.file : inside.find(path => /^wallpaper\.[a-z0-9]+$/i.test(path));
  if (wallFile) { const blob = await picture(wallFile); if (blob) wallpaper = {blob}; }
  else if (PHONE_WALLPAPERS.includes(m.wallpaper?.key) && (m.wallpaper.key !== 'custom' || customTheme)) wallpaper = {key: m.wallpaper.key};
  const icons = {};
  for (const [app, one] of Object.entries(isObject(m.icons) ? m.icons : {}).slice(0, 200)) {
    if (!APP_ID.test(app) || !isObject(one)) continue;
    if (one.glyph !== undefined) { if (one.glyph !== 'default' && PHONE_GLYPHS.includes(one.glyph)) icons[app] = {glyph: one.glyph}; continue; }
    const blob = typeof one.file === 'string' ? await picture(one.file) : null;
    if (blob) icons[app] = {blob};
  }
  // Pictures theme.json does not name (made by hand): by the file's name, the app's id or what it is called.
  for (const path of inside) {
    const stem = path.match(/^icons\/([^/]+)\.[a-z0-9]+$/i)?.[1];
    if (!stem) continue;
    const app = Object.hasOwn(names, stem) ? names[stem] : stem.toLowerCase();
    if (!APP_ID.test(app)) { skipped++; continue; }
    if (icons[app]) continue;
    const blob = await picture(path);
    if (blob) icons[app] = {blob};
  }
  const skin = PHONE_SKINS.includes(m.skin) ? m.skin : customTheme ? 'custom' : undefined;
  const iconStyle = ['color', 'glass', 'mono'].includes(m.iconStyle) ? m.iconStyle : undefined;
  if (!skin && !wallpaper && !iconStyle && !Object.keys(icons).length) throw Error('这个主题里什么能用的都没有');
  return {id: typeof m.id === 'string' && LOOK_ID.test(m.id) ? m.id : '', made: Number.isFinite(m.made) ? m.made : 0, name: words(m.name) || nameOf(fileName), author: words(m.author),
    ...(skin ? {skin} : {}), ...(customTheme ? {customTheme} : {}), ...(wallpaper ? {wallpaper} : {}),
    ...(iconStyle ? {iconStyle, monoHue: m.monoHue === 'theme' || (typeof m.monoHue === 'number' && m.monoHue >= 0 && m.monoHue <= 360) ? m.monoHue : null} : {}),
    icons, fixed, skipped};
}
/** A 配色 file (自定义主题's own) is a theme with only colours. */
function colorsOnly(bytes, fileName) {
  if (bytes.length > 256 * 1024) throw Error('这不是主题文件，要选导出的 .zip');
  const text = new TextDecoder().decode(bytes);
  let kind = '';
  try { kind = JSON.parse(text)?.kind; } catch { throw Error('这不是主题文件，要选导出的 .zip'); }
  if (kind === 'backup') throw Error('这是备份文件，请用设置里的「从文件恢复」');
  const {theme, fixed} = readThemeFile(text);
  return {id: '', made: 0, name: words(theme.name) || nameOf(fileName), author: '', skin: 'custom', customTheme: theme, icons: {}, fixed, skipped: 0};
}

const readme = names => `这是 ST-iPhonie（小手机）的主题文件，里面是配色、壁纸和图标。

怎么用：打开小手机 → 设置 → 我的主题 → 导入主题，选这个 zip，不用解压。

想自己改图：解压后把 icons 文件夹里的图换掉（png、jpg、webp、gif 都行），再压缩回 zip。
图片用 App 的名字命名，中文或者下面的英文都可以，比如 角色.png 或 roles.png。没有放图的 App 用默认图标。
壁纸是 wallpaper.jpg（后缀不限）。theme.json 里写的图优先；把它里面 icons 那一段删掉，就只按文件名认。

${names.map(([id, name]) => `${id}  ${name}`).join('\n')}
`;
/** What a theme is, as theme.json holds it. */
const manifest = (look, version) => ({app: 'ST-iPhonie', kind: 'look', format: LOOK_FORMAT, ...(version ? {madeWith: version} : {}), id: look.id, made: look.made, name: look.name, ...(look.author ? {author: look.author} : {}),
  ...(look.skin ? {skin: look.skin} : {}), ...(look.customTheme ? {customTheme: look.customTheme} : {}), ...(look.wallpaper ? {wallpaper: look.wallpaper} : {}),
  ...(look.iconStyle ? {iconStyle: look.iconStyle, monoHue: look.monoHue ?? null} : {}), icons: look.icons || {}});
/** A theme's file. files: [{path, blob | bytes}] (stored as they are: pictures are compressed already). names: [[app id, 中文名]]. */
export async function writeLookFile(look, files, {version = '', names = []} = {}) {
  const enc = new TextEncoder(), list = [{path: 'theme.json', bytes: enc.encode(JSON.stringify(manifest(look, version), null, 2))}];
  for (const {path, blob, bytes} of files) list.push({path, bytes: bytes || new Uint8Array(await blob.arrayBuffer())});
  list.push({path: 'README.txt', bytes: enc.encode(readme(names))});
  return writeZip(list);
}
/** Which parts a theme has. */
export const lookParts = look => ({colors: !!look.skin, wallpaper: !!look.wallpaper, icons: !!look.iconStyle || Object.keys(look.icons || {}).length > 0});
/** Its pictures as the phone shows them: {wallpaper: Blob | null, icons: {app: {blob, clear}}}. */
export async function lookPictures(look) {
  const files = readZip(new Uint8Array(await look.blob.arrayBuffer()));
  const picture = async path => { const entry = files.get(path), data = entry && await entry.bytes(); return data ? new Blob([data], {type: pictureType(data)}) : null; };
  const icons = {};
  for (const [app, one] of Object.entries(look.icons || {})) if (one.file) { const blob = await picture(one.file); if (blob) icons[app] = {blob, clear: one.clear === true}; }
  return {wallpaper: look.wallpaper?.file ? await picture(look.wallpaper.file) : null, icons};
}
/** The small picture for the list, out of the file (a theme that came from another device arrives without one). */
export async function lookThumb(look) {
  const files = readZip(new Uint8Array(await look.blob.arrayBuffer()));
  const entry = [...files].find(([path]) => /^preview\.[a-z0-9]+$/.test(path))?.[1], data = entry && await entry.bytes();
  return data && pictureType(data) ? new Blob([data], {type: pictureType(data)}) : null;
}
/**
 * The file to give away: the parts asked for, under the name it has now. Not the small picture: it would show what was
 * left out, and whoever takes the file makes their own.
 */
export async function exportLook(look, parts, options = {}) {
  const files = readZip(new Uint8Array(await look.blob.arrayBuffer())), out = [];
  const wallpaper = parts.wallpaper && look.wallpaper && (look.wallpaper.key !== 'custom' || parts.colors) ? look.wallpaper : undefined, icons = parts.icons ? look.icons || {} : {};
  if (wallpaper?.file && files.has(wallpaper.file)) out.push({path: wallpaper.file, bytes: await files.get(wallpaper.file).bytes()});
  for (const one of Object.values(icons)) if (one.file && files.has(one.file)) out.push({path: one.file, bytes: await files.get(one.file).bytes()});
  const {skin, customTheme, iconStyle, monoHue, ...rest} = look;
  const kept = {...rest, wallpaper, icons, ...(parts.colors ? {skin, customTheme} : {}), ...(parts.icons ? {iconStyle, monoHue} : {})};
  return writeLookFile(kept, out, options);
}

/**
 * What the phone is set to for this theme: of the parts asked for, those it has; a part it does not have stays as it is.
 * What only a newer version knows (a theme can come from another device) is left out here, and stays in the theme.
 */
export function lookPatch(look, phone, parts = lookParts(look)) {
  const patch = {look: {id: look.id, at: look.made}}, has = lookParts(look), colors = parts.colors && has.colors && PHONE_SKINS.includes(look.skin);
  if (colors) { patch.skin = look.skin; if (look.customTheme) patch.customTheme = look.customTheme; }
  const wall = parts.wallpaper && has.wallpaper && (look.wallpaper.file || (PHONE_WALLPAPERS.includes(look.wallpaper.key) && (look.wallpaper.key !== 'custom' || colors))) ? look.wallpaper : null;
  if (wall) patch.wallpaper = wall.file ? {kind: 'look', id: look.id} : {kind: 'builtin', key: wall.key};
  // As when a skin is chosen: it brings its own wallpaper, unless the wallpaper is a picture.
  else if (colors && phone.wallpaper?.kind === 'builtin') patch.wallpaper = {kind: 'builtin', key: look.skin};
  if (parts.icons && has.icons) {
    patch.icons = Object.fromEntries(Object.keys(phone.icons || {}).map(app => [app, null]));
    for (const [app, one] of Object.entries(look.icons || {})) {
      if (one.file) patch.icons[app] = {kind: 'look', id: look.id};
      else if (PHONE_APPS.includes(app) && PHONE_GLYPHS.includes(one.glyph)) patch.icons[app] = {kind: 'glyph', key: one.glyph};
    }
    patch.iconStyle = ['color', 'glass', 'mono'].includes(look.iconStyle) ? look.iconStyle : 'color';
    patch.monoHue = look.monoHue ?? null;
  }
  return patch;
}
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const seen = p => JSON.stringify(stable({skin: p.skin, colors: p.skin === 'custom' || p.wallpaper?.key === 'custom' ? cleanTheme(p.customTheme) : null, wallpaper: p.wallpaper, icons: p.icons || {}, iconStyle: p.iconStyle, monoHue: p.iconStyle === 'mono' ? p.monoHue ?? null : null}));
/** Whether the phone shows this theme: putting it on would change nothing. */
export function isLook(phone, look) {
  const {icons, ...patch} = lookPatch(look, phone), worn = {...phone, ...patch, icons: icons ? Object.fromEntries(Object.entries(icons).filter(([, one]) => one)) : phone.icons};
  return seen(phone) === seen(worn);
}
/** Whether a theme has all its parts: only such a one says how the whole phone looks. */
export const wholeLook = look => Object.values(lookParts(look)).every(Boolean);
/** Of the themes kept, the one the phone is wearing: the one put on last if it still shows, or any that is all of it. */
export const wornLook = (phone, list) => list.find(look => look.id === phone.look?.id && isLook(phone, look)) || list.find(look => wholeLook(look) && isLook(phone, look)) || null;
/** Whether there is nothing of one's own in how the phone looks: a built-in theme and its default icons. */
export const plainLook = phone => phone.skin !== 'custom' && phone.wallpaper?.kind === 'builtin' && !Object.keys(phone.icons || {}).length;
/** Whether nothing of how the phone looks is lost when something else goes on: there is nothing of one's own in it, or all of that is a theme kept. */
export const lookKept = (phone, list) => plainLook(phone) || list.some(look => {
  const has = lookParts(look);
  return isLook(phone, look) && (has.colors || phone.skin !== 'custom') && (has.wallpaper || phone.wallpaper?.kind === 'builtin') && (has.icons || !Object.keys(phone.icons || {}).length);
});
/** The phone with nothing of one's own. */
export const defaultLookPatch = phone => ({skin: 'sky', wallpaper: {kind: 'builtin', key: 'sky'}, icons: Object.fromEntries(Object.keys(phone.icons || {}).map(app => [app, null])), iconStyle: 'color', monoHue: null, look: null});

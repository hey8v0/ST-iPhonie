// Backup files: one JSON file holding the chosen parts of the plugin's data, with pictures and audio inside as base64.
// Keys go in only when the user asks, encrypted with a password of theirs (PBKDF2-SHA-256 → AES-GCM); without the
// password they cannot be read. The file is assembled in pieces and read back in pieces: a string cannot pass about 512 MB,
// which a large album or a music library does.

import {normalizeMemoryBooks, normalizeAssistantThreads} from './data-transfer.js';

export const BACKUP_FORMAT = 2;
/** The parts a backup can hold, in the order they are shown. settings brings the reference audio and the phone's look. */
export const BACKUP_PARTS = Object.freeze({
  settings: '设置、预设和角色音色',
  vnFiles: '视觉小说的立绘和模型、画风效果图',
  chats: '聊天记录',
  memories: '聊天记忆',
  assistant: '助手会话与记忆',
  moments: '朋友圈',
  forum: '论坛',
  peek: '查手机',
  notes: '备忘录',
  photos: '相册',
  looks: '我的主题',
  favorites: '收藏的语音',
  vibes: 'Vibe 和 Vibe 组',
  books: '绘本',
  music: '音乐（歌单和本机的歌）',
  sounds: '音效（传的和生成的）',
  paint: '画画的作品',
  ledger: '账本',
  keys: '密钥（用密码加密）'
});
/** Which library stores each part covers. */
export const PART_STORES = Object.freeze({settings: ['references', 'phone'], vnFiles: [], notes: ['notes'], photos: ['photos'], favorites: ['favorites'], vibes: ['vibes'], books: ['books'], chats: [], memories: [], assistant: [], moments: [], forum: [], peek: [], music: [], sounds: [], paint: [], ledger: [], looks: [], keys: []});
/** The rows outside the library that a backup holds under a part's own name. */
export const ROW_PARTS = Object.freeze(['forum', 'peek', 'music', 'sounds', 'paint', 'ledger', 'looks']);
/** Parts chosen by default: keys only when the user turns them on. */
export const DEFAULT_BACKUP_PARTS = Object.freeze(Object.keys(BACKUP_PARTS).filter(part => part !== 'keys'));
export const KEY_PASSWORD_MIN = 6;

const fail = message => Object.assign(new Error(message), {code: 'BACKUP'});

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function fromBase64(data, type) {
  const text = atob(String(data));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return new Blob([bytes], {type: String(type || '')});
}
const isBlob = value => value && typeof value.arrayBuffer === 'function' && typeof value.size === 'number';

const KDF_ROUNDS = 310000;
const b64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };
const unb64 = text => Uint8Array.from(atob(String(text)), c => c.charCodeAt(0));
const NEEDS_SECURE = '带密钥的加密备份要用 localhost 或 HTTPS 地址打开酒馆（局域网 http 地址下浏览器不提供加密功能）；备份里的其他内容不受影响';
async function passwordKey(password, salt, rounds) {
  if (!globalThis.crypto?.subtle) throw fail(NEEDS_SECURE);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
/** Keys ({engine: key}) sealed with a password. The engine names stay readable, so a restore can say what is inside. */
export async function sealKeys(keys, password) {
  if (String(password || '').length < KEY_PASSWORD_MIN) throw fail(`密码至少 ${KEY_PASSWORD_MIN} 位`);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, KDF_ROUNDS);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(JSON.stringify(keys))));
  return {kdf: 'PBKDF2-SHA-256', rounds: KDF_ROUNDS, cipher: 'AES-GCM', salt: b64(salt), iv: b64(iv), data: b64(sealed), engines: Object.keys(keys)};
}
/** The keys back, or a plain message when the password is wrong. */
export async function openKeys(sealed, password) {
  if (!sealed?.data || !sealed.salt || !sealed.iv) throw fail('备份里的密钥损坏了');
  if (!password) throw fail('这份备份里的密钥要输入备份时设的密码');
  try {
    const key = await passwordKey(password, unb64(sealed.salt), Number(sealed.rounds) || KDF_ROUNDS);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(sealed.iv)}, key, unb64(sealed.data));
    const keys = JSON.parse(new TextDecoder().decode(plain));
    return keys && typeof keys === 'object' ? keys : {};
  } catch { if (!globalThis.crypto?.subtle) throw fail(NEEDS_SECURE); throw fail('密码不对，密钥没有恢复（其他内容不受影响）'); }
}

const hasBlob = value => isBlob(value) || (Array.isArray(value) ? value.some(hasBlob) : !!value && typeof value === 'object' && Object.values(value).some(hasBlob));
async function withoutBlobs(value) {
  if (isBlob(value)) return {$blob: {type: value.type, data: await toBase64(value)}};
  if (!hasBlob(value)) return value;
  if (Array.isArray(value)) { const out = []; for (const x of value) out.push(await withoutBlobs(x)); return out; }
  const out = {};
  for (const [key, x] of Object.entries(value)) out[key] = await withoutBlobs(x);
  return out;
}
/** A row as JSON text, every Blob in it (a work's layers are some way in) written as {"$blob":{type,data}}. */
export async function rowJSON(row) { return JSON.stringify(await withoutBlobs(row)); }
/** What rowJSON wrote, with its Blobs back. */
export function withBlobs(value) {
  if (Array.isArray(value)) return value.map(withBlobs);
  if (!value || typeof value !== 'object') return value;
  if (value.$blob && typeof value.$blob === 'object') return fromBase64(value.$blob.data, value.$blob.type);
  for (const key of Object.keys(value)) if (value[key] && typeof value[key] === 'object') value[key] = withBlobs(value[key]);
  return value;
}

/**
 * Builds the backup file.
 * data: {version, settings?: object, library?: {store: rows[]}, chats?: threads[], memories?: books[],
 *   assistant?: threads with memory (book or null)[], moments?: posts[], vibeGroups?: groups[], vnFiles?: [{path, blob}],
 *   rows?: {part: rows[]}} (vnFiles: the 视觉小说's 立绘 and 模型 files, which live in the tavern, not in the settings;
 *   rows: the parts in ROW_PARTS).
 */
export async function writeBackup({version = '', settings = null, library = {}, chats = null, memories = null, assistant = null, moments = null, keys = null, vibeGroups = null, vnFiles = null, rows: more = {}}) {
  const pieces = [JSON.stringify({app: 'ST-iPhonie', kind: 'backup', format: BACKUP_FORMAT, version, createdAt: Date.now()}).slice(0, -1), ',"data":{'];
  const fields = [];
  if (settings) fields.push(['settings', JSON.stringify(settings)]);
  if (chats) fields.push(['chats', JSON.stringify(chats)]);
  if (memories !== null) fields.push(['memories', JSON.stringify(normalizeMemoryBooks(memories))]);
  if (assistant !== null) fields.push(['assistant', JSON.stringify(normalizeAssistantThreads(assistant))]);
  if (moments) fields.push(['moments', JSON.stringify(moments)]);
  if (keys) fields.push(['keys', JSON.stringify(keys)]);
  if (vibeGroups) fields.push(['vibeGroups', JSON.stringify(vibeGroups)]);
  for (const [store, rows] of [...Object.entries(library), ...(vnFiles ? [['vnFiles', vnFiles]] : []), ...Object.entries(more)]) {
    const parts = ['['];
    // Each as a Blob at once: the browser may keep those on disk, where a heap full of strings would stop a phone.
    for (let i = 0; i < rows.length; i++) parts.push(i ? ',' : '', new Blob([await rowJSON(rows[i])]));
    parts.push(']');
    fields.push([store, parts]);
  }
  fields.forEach(([name, value], i) => pieces.push(i ? ',' : '', JSON.stringify(name), ':', ...[value].flat()));
  pieces.push('}}');
  return new Blob(pieces, {type: 'application/json'});
}

const CHUNK = 8 * 1024 * 1024;
async function* textOf(file) {
  const decoder = new TextDecoder();
  for (let at = 0; at < file.size; at += CHUNK) yield decoder.decode(await file.slice(at, at + CHUNK).arrayBuffer(), {stream: true});
  const rest = decoder.decode();
  if (rest) yield rest;
}
const SPACE = new Set([' ', '\n', '\r', '\t']);
/**
 * A backup's JSON as it comes from the file, never all of it in one string: the fields of the top object, the fields of
 * its data and each row of an array in data are parsed as soon as they are complete. wants(name): whether to keep an
 * array's rows; the others are only counted (a 0 for each), without being read into memory. chunks: pieces of the text.
 */
export async function walkBackup(chunks, wants = () => true) {
  const top = {}, data = {};
  let place = 'start', level = 0, depth = 0, inText = false, slash = false, held = [], key = '', rows = null, filled = false, keepRow = true;
  const taken = () => { const text = held.join(''); held = []; return text; };
  const shut = () => { if (level === 2) { level = 1; depth = 1; place = 'after'; } else { level = 0; depth = 0; place = 'end'; } };
  const rowDone = () => { if (filled) rows.push(keepRow ? withBlobs(JSON.parse(taken())) : 0); held = []; filled = false; };
  for await (const chunk of chunks) {
    let i = 0, from = 0, nextSlash = -2;
    const cut = to => { if (to > from && (place !== 'row' || keepRow)) held.push(chunk.slice(from, to)); };
    while (i < chunk.length) {
      if (inText) {
        if (slash) { slash = false; i++; continue; }
        const quote = chunk.indexOf('"', i);
        if (nextSlash !== -1 && nextSlash < i) nextSlash = chunk.indexOf('\\', i);
        if (nextSlash >= 0 && (quote < 0 || nextSlash < quote)) { slash = true; i = nextSlash + 1; continue; }
        if (quote < 0) { i = chunk.length; continue; }
        inText = false; i = quote + 1;
        continue;
      }
      const c = chunk[i];
      if (place === 'start' || place === 'after' || place === 'end' || place === 'begin') {
        if (SPACE.has(c)) { from = ++i; continue; }
        if (place === 'end') throw Error('text after the end');
        if (place === 'start') { if (c !== '{') throw Error('not an object'); level = depth = 1; place = 'key'; from = ++i; continue; }
        if (place === 'after') {
          if (c === ',') place = 'key'; else if (c === '}') shut(); else throw Error('unexpected ' + c);
          from = ++i;
          continue;
        }
        if (level === 1 && key === 'data' && c === '{') { top.data = data; level = depth = 2; place = 'key'; from = ++i; continue; }
        if (level === 2 && c === '[') { depth = 3; rows = []; keepRow = wants(key); filled = false; place = 'row'; from = ++i; continue; }
        place = 'value'; from = i;
      }
      if (c === '"') { inText = true; if (place === 'row') filled = true; i++; continue; }
      if (place === 'key') {
        if (c === ':') { cut(i); key = JSON.parse(taken().trim()); place = 'begin'; from = ++i; continue; }
        if (c === '}') { cut(i); if (taken().trim()) throw Error('a key without a value'); shut(); from = ++i; continue; }
        i++;
        continue;
      }
      const edge = place === 'row' ? 3 : level;
      if (depth === edge && c === ',') {
        cut(i);
        if (place === 'row') rowDone();
        else { (level === 1 ? top : data)[key] = JSON.parse(taken()); place = 'key'; }
        from = ++i;
        continue;
      }
      if (depth === edge && c === ']' && place === 'row') {
        cut(i);
        rowDone();
        data[key] = rows; rows = null; depth = 2; place = 'after';
        from = ++i;
        continue;
      }
      if (depth === edge && c === '}' && place === 'value') {
        cut(i);
        (level === 1 ? top : data)[key] = JSON.parse(taken());
        shut();
        from = ++i;
        continue;
      }
      if (place === 'row' && !SPACE.has(c)) filled = true;
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      i++;
    }
    cut(chunk.length);
  }
  if (place !== 'end') throw Error('the file stops early');
  return top;
}

/** The fields of a backup's data that restoring these parts reads. */
export const fieldsOf = parts => new Set(parts.flatMap(part => part === 'vibes' ? ['vibes', 'vibeGroups'] : PART_STORES[part]?.length ? PART_STORES[part] : [part]));

/** Reads a backup file back: {version, createdAt, settings, chats, memories, assistant, library: {store: rows[]}, rows: {part: rows[]}, summary}.
 *  Throws a plain Chinese message for files that are not ST-iPhonie backups. wanted: the fields to keep (fieldsOf);
 *  of the others only the number of rows is known. */
export async function readBackup(file, {wanted = null} = {}) {
  if (!isBlob(file) || !file.size) throw fail('请选择备份文件');
  let parsed;
  try { parsed = await walkBackup(textOf(file), name => !wanted || wanted.has(name)); } catch { throw fail('这不是有效的备份文件（读不出内容）'); }
  if (parsed?.app !== 'ST-iPhonie' || parsed.kind !== 'backup' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw fail('这不是 ST-iPhonie 的备份文件');
  if (parsed.format > BACKUP_FORMAT) throw fail('这个备份来自更新版本的插件，请先更新插件再恢复');
  if (!Number.isInteger(parsed.format) || parsed.format < 1) throw fail('备份格式版本无效');
  const kept = name => !wanted || wanted.has(name);
  // Missing sections stay null, so restoring an older file cannot clear data it never contained.
  const memories = parsed.data.memories === undefined ? null : kept('memories') ? normalizeMemoryBooks(parsed.data.memories) : parsed.data.memories;
  const assistant = parsed.data.assistant === undefined ? null : kept('assistant') ? normalizeAssistantThreads(parsed.data.assistant) : parsed.data.assistant;
  const library = {};
  for (const store of ['notes', 'photos', 'favorites', 'vibes', 'references', 'phone', 'books']) {
    const rows = parsed.data[store];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw fail('备份内容损坏：' + store);
    library[store] = rows;
  }
  const rows = {};
  for (const part of ROW_PARTS) {
    const list = parsed.data[part];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw fail('备份内容损坏：' + part);
    rows[part] = list;
  }
  const settings = parsed.data.settings && typeof parsed.data.settings === 'object' ? parsed.data.settings : null;
  const chats = Array.isArray(parsed.data.chats) ? parsed.data.chats : null, moments = Array.isArray(parsed.data.moments) ? parsed.data.moments : null;
  const vibeGroups = library.vibes && Array.isArray(parsed.data.vibeGroups) ? parsed.data.vibeGroups : null;
  const files = Array.isArray(parsed.data.vnFiles) ? parsed.data.vnFiles : null;
  const vnFiles = files && kept('vnFiles') ? files.filter(f => typeof f?.path === 'string' && isBlob(f.blob)) : files;
  const summary = {
    settings: settings ? {roles: settings.routes?.length || 0, presets: settings.presets?.length || 0} : null,
    chats: chats ? chats.length : null,
    memories: memories ? memories.length : null,
    assistant: assistant ? assistant.length : null,
    moments: moments ? moments.length : null,
    notes: library.notes ? library.notes.length : null,
    photos: library.photos ? library.photos.length : null,
    favorites: library.favorites ? library.favorites.length : null,
    vibes: library.vibes ? {vibes: library.vibes.length, groups: vibeGroups?.length || 0} : null,
    vnFiles: vnFiles ? vnFiles.length : null,
    books: library.books ? library.books.length : null,
    ...Object.fromEntries(ROW_PARTS.map(part => [part, rows[part] ? rows[part].length : null])),
    keys: parsed.data.keys?.data ? (Array.isArray(parsed.data.keys.engines) ? parsed.data.keys.engines.length : 0) : null
  };
  return {version: String(parsed.version || ''), createdAt: Number(parsed.createdAt) || 0, settings, chats, memories, assistant, moments, library, rows, vibeGroups, vnFiles, keys: parsed.data.keys?.data ? parsed.data.keys : null, summary};
}

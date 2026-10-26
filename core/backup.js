// Backup files: one JSON file holding the chosen parts of the plugin's data, with pictures and audio inside as base64.
// Keys go in only when the user asks, encrypted with a password of theirs (PBKDF2-SHA-256 → AES-GCM); without the
// password they cannot be read. The file is assembled in pieces, so a large album is not first built as one huge string.

import {normalizeMemoryBooks, normalizeAssistantThreads} from './data-transfer.js';

export const BACKUP_FORMAT = 2;
/** The parts a backup can hold, in the order they are shown. settings brings the reference audio and the phone's look. */
export const BACKUP_PARTS = Object.freeze({
  settings: '设置、预设和角色音色',
  vnFiles: '视觉小说的立绘和模型',
  chats: '聊天记录',
  memories: '聊天记忆',
  assistant: '助手会话与记忆',
  moments: '朋友圈',
  notes: '备忘录',
  photos: '相册',
  favorites: '收藏的语音',
  vibes: 'Vibe 和 Vibe 组',
  books: '绘本',
  keys: '密钥（用密码加密）'
});
/** Which library stores each part covers. */
export const PART_STORES = Object.freeze({settings: ['references', 'phone'], vnFiles: [], notes: ['notes'], photos: ['photos'], favorites: ['favorites'], vibes: ['vibes'], books: ['books'], chats: [], memories: [], assistant: [], moments: [], keys: []});
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

/** A row as JSON text, its blob (if any) written as {"$blob":{type,data}}. */
async function rowJSON(row) {
  if (!isBlob(row?.blob)) return JSON.stringify(row);
  return JSON.stringify({...row, blob: {$blob: {type: row.blob.type, data: await toBase64(row.blob)}}});
}

/**
 * Builds the backup file.
 * data: {version, settings?: object, library?: {store: rows[]}, chats?: threads[], memories?: books[],
 *   assistant?: threads with memory (book or null)[], moments?: posts[], vibeGroups?: groups[], vnFiles?: [{path, blob}]}
 *   (vnFiles: the 视觉小说's 立绘 and 模型 files, which live in the tavern, not in the settings).
 */
export async function writeBackup({version = '', settings = null, library = {}, chats = null, memories = null, assistant = null, moments = null, keys = null, vibeGroups = null, vnFiles = null}) {
  const pieces = [JSON.stringify({app: 'ST-iPhonie', kind: 'backup', format: BACKUP_FORMAT, version, createdAt: Date.now()}).slice(0, -1), ',"data":{'];
  const fields = [];
  if (settings) fields.push(['settings', JSON.stringify(settings)]);
  if (chats) fields.push(['chats', JSON.stringify(chats)]);
  if (memories !== null) fields.push(['memories', JSON.stringify(normalizeMemoryBooks(memories))]);
  if (assistant !== null) fields.push(['assistant', JSON.stringify(normalizeAssistantThreads(assistant))]);
  if (moments) fields.push(['moments', JSON.stringify(moments)]);
  if (keys) fields.push(['keys', JSON.stringify(keys)]);
  if (vibeGroups) fields.push(['vibeGroups', JSON.stringify(vibeGroups)]);
  for (const [store, rows] of [...Object.entries(library), ...(vnFiles ? [['vnFiles', vnFiles]] : [])]) {
    const parts = ['['];
    for (let i = 0; i < rows.length; i++) parts.push(i ? ',' : '', await rowJSON(rows[i]));
    parts.push(']');
    fields.push([store, parts]);
  }
  fields.forEach(([name, value], i) => pieces.push(i ? ',' : '', JSON.stringify(name), ':', ...[value].flat()));
  pieces.push('}}');
  return new Blob(pieces, {type: 'application/json'});
}

/** Reads a backup file back: {version, createdAt, settings, chats, memories, assistant, library: {store: rows[]}, summary}. Throws a plain
 *  Chinese message for files that are not ST-iPhonie backups. */
export async function readBackup(file) {
  if (!isBlob(file) || !file.size) throw fail('请选择备份文件');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw fail('这不是有效的备份文件（读不出内容）'); }
  if (parsed?.app !== 'ST-iPhonie' || parsed.kind !== 'backup' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw fail('这不是 ST-iPhonie 的备份文件');
  if (parsed.format > BACKUP_FORMAT) throw fail('这个备份来自更新版本的插件，请先更新插件再恢复');
  if (!Number.isInteger(parsed.format) || parsed.format < 1) throw fail('备份格式版本无效');
  // Missing sections stay null, so restoring an older file cannot clear data it never contained.
  const memories = parsed.data.memories === undefined ? null : normalizeMemoryBooks(parsed.data.memories);
  const assistant = parsed.data.assistant === undefined ? null : normalizeAssistantThreads(parsed.data.assistant);
  const library = {};
  for (const store of ['notes', 'photos', 'favorites', 'vibes', 'references', 'phone', 'books']) {
    const rows = parsed.data[store];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw fail('备份内容损坏：' + store);
    library[store] = rows.map(row => row?.blob?.$blob ? {...row, blob: fromBase64(row.blob.$blob.data, row.blob.$blob.type)} : row);
  }
  const settings = parsed.data.settings && typeof parsed.data.settings === 'object' ? parsed.data.settings : null;
  const chats = Array.isArray(parsed.data.chats) ? parsed.data.chats : null, moments = Array.isArray(parsed.data.moments) ? parsed.data.moments : null;
  const vibeGroups = library.vibes && Array.isArray(parsed.data.vibeGroups) ? parsed.data.vibeGroups : null;
  const vnFiles = Array.isArray(parsed.data.vnFiles) ? parsed.data.vnFiles.filter(f => typeof f?.path === 'string' && f.blob?.$blob).map(f => ({path: f.path, blob: fromBase64(f.blob.$blob.data, f.blob.$blob.type)})) : null;
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
    keys: parsed.data.keys?.data ? (Array.isArray(parsed.data.keys.engines) ? parsed.data.keys.engines.length : 0) : null
  };
  return {version: String(parsed.version || ''), createdAt: Number(parsed.createdAt) || 0, settings, chats, memories, assistant, moments, library, vibeGroups, vnFiles, keys: parsed.data.keys?.data ? parsed.data.keys : null, summary};
}

// 保存到酒馆: the phone's own data (see SYNC_PARTS) kept as files in the tavern user's folder, so another browser or device
// of the same tavern account sees the same phone, and clearing a browser loses nothing.
// Settings already live in the tavern; keys never leave the browser; the voice cache stays local (a voice can be made
// again). How the phone looks now is each device's own; the themes it can put on (我的主题) are kept here too.
//
// Files (in data/<user>/user/files, written with the tavern's /api/files/upload):
//   st-iphonie-sync.json        {app, kind:'sync', format, savedAt, device, deviceName, parts:{part:{hash, count}}}
//   st-iphonie-chats.json       chat threads          st-iphonie-moments.json   朋友圈 posts
//   st-iphonie-notes.json       notes                 st-iphonie-photos.json    album index (no pictures)
//   st-iphonie-memories.json    complete chat books   st-iphonie-assistant.json assistant threads with memory: book | null
//   st-iphonie-forum.json, -peek, -music, -sounds, -paint, -ledger, -looks, -albums, -books, -vibes, -favorites, -references  the same way
//   st-iphonie-p-<id>.<ext>     one file per picture, written once (a picture never changes); a photo made smaller by
//                               压缩旧图 is another picture, st-iphonie-p-<id>-c<when>.<ext>, and wins over the original
//   st-iphonie-m-, -s-, -v-, -f-, -r-<id>   a song, a sound, a vibe, a saved voice, a reference voice: one file each, like
//                               the pictures; a part's JSON lists them without the file (FILES)
//   st-iphonie-w-<id>-<when>.json   a work of 画画: its layers, a new file each time it was saved
//   st-iphonie-t-<id>-<when>.zip    a 主题 (core/looks.js), a new file each time it was saved
//
// A sync reads the tavern's copy first. A part changed only there is taken as it is (so deletions carry over); a part
// changed on both sides is merged item by item (the newer item wins, messages and comments are joined); then what
// changed here is written back. Each device remembers the hashes of the last copy it saw.
// What was deleted (a chat, a message, a post, a comment, a note, a photo) is remembered for a while, here and in the
// manifest, so a merge does not bring it back from a copy that still has it.
import {sha256Hex} from './hash.js';

export const SYNC_FORMAT = 2;
export const SYNC_PARTS = Object.freeze({chats: '聊天记录', moments: '朋友圈', notes: '备忘录', photos: '相册', memories: '聊天记忆', assistant: '助手会话与记忆', forum: '论坛', peek: '查手机', books: '绘本', vibes: 'Vibe', favorites: '收藏的语音', references: '参考音频', music: '音乐', sounds: '音效', paint: '画画的作品', ledger: '账本', looks: '我的主题', albums: '相册的分类'});
export const MANIFEST = 'st-iphonie-sync.json';
export const partFile = part => `st-iphonie-${part}.json`;
const EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'};
const packedAt = row => Number.isFinite(row?.packed?.at) ? row.packed.at : 0;
export const photoFile = row => `st-iphonie-p-${String(row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}${packedAt(row) ? '-c' + packedAt(row).toString(36) : ''}.${EXT[row.type] || 'png'}`;
const plain = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
const SOUND_EXT = {'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogg'};
const voiceFile = letter => row => `st-iphonie-${letter}-${plain(row.id)}.${SOUND_EXT[row.mime || row.type] || 'bin'}`;
/** The file a row of a part has in the tavern, or null when it has none (a song from a music source, a 歌单). */
export const FILES = Object.freeze({
  photos: photoFile,
  music: row => row.kind === 'song' && row.origin !== 'source' ? voiceFile('m')(row) : null,
  sounds: voiceFile('s'),
  favorites: voiceFile('f'),
  references: voiceFile('r'),
  // A vibe's file changes as strengths are encoded for it: its time tells them apart.
  vibes: row => `st-iphonie-v-${plain(row.id)}-${(Number(row.updatedAt) || 0).toString(36)}.bin`,
  paint: row => `st-iphonie-w-${plain(row.id)}-${(Number(row.updatedAt) || 0).toString(36)}.json`,
  // A new name changes its row, not its file: made is when the file was written.
  looks: row => `st-iphonie-t-${plain(row.id)}-${(Number(row.made) || 0).toString(36)}.zip`,
});

export function defaultSync() { return {enabled: false}; }
export function normalizeSync(value) { return {enabled: value?.enabled === true}; }

const byId = list => [...list].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const wholePart = part => part === 'memories' || part === 'assistant';
// Key order must not decide ties or keep equal books from converging after a store validates them.
const stableValue = value => Array.isArray(value) ? value.map(stableValue) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])])) : value;
const stableText = value => JSON.stringify(stableValue(value));
const rowTime = row => Number.isFinite(row.updatedAt) ? row.updatedAt : Number.isFinite(row.at) ? row.at : 0;
const newerWhole = (a, b) => rowTime(b) > rowTime(a) || (rowTime(b) === rowTime(a) && stableText(b) > stableText(a)) ? b : a;
/** The JSON that is compared and written for a part: items in id order, the album without its pictures. */
export function canonical(part, items) {
  if (part === 'photos') return byId(items.map(({id, name, type, size, createdAt, updatedAt, packed}) => ({id, name, type, size, createdAt, updatedAt, ...(packed ? {packed} : {})})));
  if (wholePart(part)) return byId(items).map(stableValue);
  // The files are apart; a work's list has its small picture in its file too.
  if (part in FILES) return byId(items.map(({blob, thumb, layers, ...row}) => row));
  return byId(items);
}
export async function hashText(text) { return sha256Hex(text); }

const GONE_DAYS = 90, GONE_MAX = 3000;
const REMADE = new Set(['forum', 'peek', 'books', 'vibes', 'favorites', 'references', 'music', 'sounds', 'paint', 'ledger', 'looks']);
/**
 * Deletions: {part: {key: at}}. The key is the item's id, or `itemId/childId` for a chat message or a post comment.
 * Joins several lists, keeps the last GONE_DAYS days and at most GONE_MAX keys a part (the newest).
 */
export function joinGone(lists, now = Date.now()) {
  const out = {}, since = now - GONE_DAYS * 864e5;
  for (const list of lists) for (const [part, keys] of Object.entries(list && typeof list === 'object' ? list : {})) {
    if (!(part in SYNC_PARTS) || !keys || typeof keys !== 'object') continue;
    for (const [key, at] of Object.entries(keys)) if (Number.isFinite(at) && at > since) (out[part] ||= {})[key] = Math.max(out[part][key] || 0, at);
  }
  for (const part of Object.keys(out)) {
    const keys = Object.entries(out[part]);
    if (keys.length > GONE_MAX) out[part] = Object.fromEntries(keys.sort((a, b) => b[1] - a[1]).slice(0, GONE_MAX));
  }
  return out;
}
/** A part's items without what was deleted. */
export function prune(part, items, gone = {}) {
  const has = key => Object.hasOwn(gone, key);
  // Only an explicit backup restore can supersede an assistant deletion. Ordinary edits cannot revive old copies.
  const restored = x => part === 'assistant' && Number.isFinite(x.restoredAt) && x.restoredAt > gone[String(x.id)];
  // Here an id can come again (the same person's phone looked at again, today's 账本 after clearing it): what was made
  // after it was deleted is a new one, and only an older copy stays deleted.
  const remade = x => REMADE.has(part) && rowTime(x) > gone[String(x.id)];
  return items.filter(x => !has(String(x.id)) || restored(x) || remade(x)).map(x =>
    part === 'chats' && Array.isArray(x.messages) && x.messages.some(m => has(`${x.id}/${m.id}`)) ? {...x, messages: x.messages.filter(m => !has(`${x.id}/${m.id}`))}
    : part === 'moments' && Array.isArray(x.comments) && x.comments.some(c => has(`${x.id}/${c.id}`)) ? {...x, comments: x.comments.filter(c => !has(`${x.id}/${c.id}`))}
    : part === 'forum' && Array.isArray(x.replies) && x.replies.some(r => has(`${x.id}/${r.id}`)) ? {...x, replies: x.replies.filter(r => !has(`${x.id}/${r.id}`))}
    : x);
}
const newer = (a, b, time) => (time(b) || 0) > (time(a) || 0) ? b : a;
const union = (a = [], b = [], key = x => x.id) => { const map = new Map(); for (const x of [...a, ...b]) map.set(key(x), x); return [...map.values()]; };
function mergeMessages(local = [], remote = []) {
  const messages = new Map(local.map(m => [m.id, m]));
  for (const incoming of remote) {
    const here = messages.get(incoming.id);
    if (!here) { messages.set(incoming.id, incoming); continue; }
    // Recall is irreversible, including messages saved before message versions existed.
    if ((here.kind === 'recall') !== (incoming.kind === 'recall')) { messages.set(here.id, here.kind === 'recall' ? here : incoming); continue; }
    const a = here.updatedAt || here.at || 0, b = incoming.updatedAt || incoming.at || 0;
    // Stable ties let two devices converge even when their clocks have the same millisecond.
    if (b > a || (b === a && JSON.stringify(incoming) > JSON.stringify(here))) messages.set(incoming.id, incoming);
  }
  return [...messages.values()].sort((a, b) => a.at - b.at);
}

/** Replays changes since the network snapshot over its result, inside the store's write transaction. */
function rebase(part, before, incoming, current) {
  const old = new Map(before.map(row => [row.id, row])), latest = new Map(current.map(row => [row.id, row]));
  const result = new Map(incoming.map(row => [row.id, row]));
  for (const id of old.keys()) if (!latest.has(id)) result.delete(id);
  for (const row of current) {
    const previous = old.get(row.id);
    if (!previous) { result.set(row.id, row); continue; }
    if (wholePart(part)) {
      // A book is one graph; an assistant's messages and book describe one revision. Never mix their fields.
      if (stableText(row) !== stableText(previous)) result.set(row.id, row);
      continue;
    }
    if (JSON.stringify(row) === JSON.stringify(previous)) continue;
    const merged = { ...(result.get(row.id) || row) };
    for (const key of new Set([...Object.keys(previous), ...Object.keys(row)])) {
      if (JSON.stringify(row[key]) === JSON.stringify(previous[key])) continue;
      if ((part === 'chats' && key === 'messages') || (part === 'moments' && key === 'comments') || (part === 'forum' && key === 'replies')) merged[key] = rebase('', previous[key] || [], merged[key] || [], row[key] || []).sort((a, b) => a.at - b.at);
      else if (Object.hasOwn(row, key)) merged[key] = row[key];
      else delete merged[key];
    }
    result.set(row.id, merged);
  }
  return [...result.values()];
}
/** Both sides changed a part: joins them item by item; what either side deleted stays deleted. */
export function mergePart(part, local, remote, gone = {}) {
  local = prune(part, local, gone); remote = prune(part, remote, gone);
  const mine = new Map(local.map(x => [x.id, x])), out = [];
  for (const theirs of remote) {
    const here = mine.get(theirs.id);
    mine.delete(theirs.id);
    if (!here) { out.push(theirs); continue; }
    if (part === 'chats') {
      const base = newer(here, theirs, t => t.updatedAt);
      out.push({...base, messages: mergeMessages(here.messages, theirs.messages), unread: Math.max(here.unread || 0, theirs.unread || 0)});
    } else if (part === 'moments') {
      out.push({...here, ...theirs, likes: [...new Set([...(here.likes || []), ...(theirs.likes || [])])], comments: union(here.comments, theirs.comments).sort((a, b) => a.at - b.at), photoId: theirs.photoId || here.photoId});
    } else if (wholePart(part)) out.push(newerWhole(here, theirs));
    else if (part === 'notes') out.push(newer(here, theirs, n => n.updatedAt));
    // a photo made smaller (压缩旧图) on one side is smaller on both; otherwise this side's copy is the same picture
    else if (part === 'photos') out.push(packedAt(theirs) > packedAt(here) ? theirs : here);
    // A heart given on either side stays (the rare heart taken away on one side at the same time comes back: better than one lost).
    else if (part === 'albums') { const base = newer(here, theirs, rowTime), other = base === here ? theirs : here; out.push({...base, photos: [...new Set([...(base.photos || []), ...(other.photos || [])])]}); }
    else if (part === 'forum' && here.kind === 'forum') out.push({...here, ...theirs, likes: Math.max(here.likes || 0, theirs.likes || 0), heat: Math.max(here.heat || 0, theirs.heat || 0), liked: here.liked || theirs.liked, replies: union(here.replies, theirs.replies).sort((a, b) => a.at - b.at)});
    else if (part in SYNC_PARTS) out.push(newer(here, theirs, rowTime));
    else out.push(here);
  }
  return [...out, ...mine.values()];
}

/**
 * Runs one sync. stores: {read(part) → items (those with files: rows with blobs), write(part, items, {replace, merge}), fileBlob(part, row)}
 * write must run the synchronous merge(currentRows) callback inside the same transaction as its replacement.
 * files: {read(name, {blob}) → text | Blob | null, write(name, text | Blob), remove(name)}; memory: {hashes, savedAt}.
 * Returns {memory, pulled:[parts], pushed:[parts], merged:[parts], savedAt, remote}.
 */
export async function runSync({stores, files, memory = {}, readGone = () => memory.gone, device = '', deviceName = '', now = () => Date.now(), parts = Object.keys(SYNC_PARTS)}) {
  const blobOf = (part, row) => stores.fileBlob ? stores.fileBlob(part, row) : stores.photoBlob(row);
  const hashes = {...(memory.hashes || {})}, pulled = [], pushed = [], merged = [];
  let gone = joinGone([memory.gone], now());
  let manifest = null;
  const raw = await files.read(MANIFEST);
  if (raw) {
    try { manifest = JSON.parse(raw); } catch { throw Error('酒馆里的同步文件读不出来（st-iphonie-sync.json），可以在酒馆的数据文件夹里删掉它再试'); }
    if (manifest?.app !== 'ST-iPhonie' || manifest.kind !== 'sync') throw Error('酒馆里的 st-iphonie-sync.json 不是小手机的同步文件');
    if (manifest.format > SYNC_FORMAT) throw Error('酒馆里的数据来自更新版本的插件，请先在这台设备上更新插件');
  }
  const remoteParts = manifest?.parts || {}, next = {};
  gone = joinGone([gone, manifest?.gone], now());
  for (const part of parts) {
    gone = joinGone([gone, readGone()], now());
    let items = await stores.read(part);
    let text = JSON.stringify(canonical(part, items)), hash = await hashText(text);
    const remoteHash = remoteParts[part]?.hash, base = hashes[part];
    let result = prune(part, items, gone[part]), changedHere = false, fromRemote = false;
    if (remoteHash && remoteHash !== base && remoteHash !== hash) {
      const body = await files.read(partFile(part));
      if (body === null) throw Error(`酒馆里少了 ${partFile(part)}，这次先不同步`);
      const theirs = JSON.parse(body);
      changedHere = base !== undefined ? hash !== base : items.length > 0;
      fromRemote = true;
      result = changedHere ? mergePart(part, items, theirs, gone[part]) : prune(part, theirs, gone[part]);
      if (part === 'photos') {
        const have = new Map(items.map(r => [r.id, r]));
        result = await Promise.all(result.map(async row => {
          const mine = have.get(row.id);
          if (mine && packedAt(mine) >= packedAt(row)) return mine;
          // theirs is new here, or was made smaller there: its picture (what was drawn with stays from here)
          const blob = await files.read(photoFile(row), {blob: true});
          return blob ? {...mine, ...row, blob} : mine || null;
        }));
        result = result.filter(row => row?.blob);
      } else if (FILES[part]) {
        const have = new Map(items.map(r => [r.id, r])), fileOf = FILES[part], out = [];
        for (const row of result) {
          const mine = have.get(row.id), name = fileOf(row);
          // no file of its own, or the same one as here
          if (!name || (mine && fileOf(mine) === name)) { out.push({...mine, ...row}); continue; }
          const blob = await files.read(name, {blob: true});
          if (blob) out.push({...mine, ...row, blob: blob.slice(0, blob.size, row.mime || row.type || blob.type)});
          else if (mine) out.push(mine);
        }
        result = out;
      }
    }
    if (fromRemote || JSON.stringify(canonical(part, result)) !== text) {
      const before = items;
      await stores.write(part, result, {replace: true, merge: current => {
        gone = joinGone([gone, readGone()], now());
        if (JSON.stringify(canonical(part, current)) !== text) changedHere = true;
        return prune(part, rebase(part, before, result, current), gone[part]);
      }});
      if (fromRemote) (changedHere ? merged : pulled).push(part);
      items = await stores.read(part);
      text = JSON.stringify(canonical(part, items));
      hash = await hashText(text);
    }
    if (hash !== remoteHash) {
      const fileOf = FILES[part];
      if (fileOf) {
        // The files first: a list in the tavern never names one that is not there.
        const theirs = new Set((remoteHash ? JSON.parse(await files.read(partFile(part)) || '[]') : []).map(fileOf).filter(Boolean));
        const mine = new Set(items.map(fileOf).filter(Boolean));
        for (const row of items) { const name = fileOf(row); if (name && !theirs.has(name)) await files.write(name, await blobOf(part, row)); }
        for (const name of theirs) if (!mine.has(name)) await files.remove(name).catch(() => {});
      }
      await files.write(partFile(part), text);
      pushed.push(part);
    }
    next[part] = {hash, count: items.length};
    hashes[part] = hash;
  }
  const told = Object.entries(gone).some(([part, keys]) => Object.keys(keys).some(key => !manifest?.gone?.[part]?.[key]));
  let remote = manifest ? {savedAt: manifest.savedAt, deviceName: manifest.deviceName || '', device: manifest.device || ''} : null;
  if (pushed.length || !manifest || told || manifest.format !== SYNC_FORMAT) {
    remote = {savedAt: now(), deviceName, device};
    await files.write(MANIFEST, JSON.stringify({app: 'ST-iPhonie', kind: 'sync', format: SYNC_FORMAT, ...remote, parts: {...remoteParts, ...next}, gone}));
  }
  // The tavern's copy is now what this device holds.
  return {memory: {hashes, savedAt: remote.savedAt, gone}, pulled, pushed, merged, savedAt: remote.savedAt, remote};
}

/**
 * Deletes the phone's copy in the tavern: every picture, every part and the manifest (last, so a failed run can be
 * done again). Returns how many files it removed (0 when there was no copy). What is on this device stays.
 */
export async function removeSync(files) {
  const raw = await files.read(MANIFEST);
  if (raw === null) return 0;
  let parts = [];
  const own = [];
  try { parts = Object.keys(JSON.parse(raw)?.parts || {}); } catch { /* a broken manifest: the known parts below */ }
  for (const [part, fileOf] of Object.entries(FILES)) {
    try { own.push(...(JSON.parse(await files.read(partFile(part)) || '[]') || []).map(fileOf).filter(Boolean)); } catch { /* no list */ }
  }
  // Removing a file that is not there counts as removed.
  const names = [...own, ...[...new Set([...Object.keys(SYNC_PARTS), ...parts])].map(partFile), MANIFEST];
  for (const name of names) await files.remove(name);
  return names.length;
}

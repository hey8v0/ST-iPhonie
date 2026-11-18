// The phone save belongs to a host chat, not to a metadata object copied into another file.
// Existing library rows are never rewritten. A rename keeps the token; a copy gets a stable new token.
import {sha256Plain} from './hash.js';
import {validChatSave} from './chat.js';
const OWNER = 'stIphonieSaveOwner';
const nameOf = value => value === undefined || value === null || value === '' ? '' : String(value);
const ownerOf = value => value?.version === 1 && typeof value.card === 'string' && typeof value.chat === 'string' && typeof value.integrity === 'string' ? value : null;
const tokenOf = seed => 'c-' + Array.from(sha256Plain(new TextEncoder().encode(JSON.stringify(seed))), x => x.toString(16).padStart(2, '0')).join('');
const idOf = ctx => nameOf(ctx?.getCurrentChatId?.() ?? ctx?.chatId);
const fingerprint = meta => JSON.stringify([meta.stIphonieSave, meta[OWNER], meta.integrity, meta.main_chat]);

/** readHeader(card, filename) returns just that file's metadata, or null for a verified missing file.
 * Failure must reject; it must never be mistaken for a rename. All late reads are checked against the active visit. */
export function createChatSaveIdentity({context, card, readHeader, readPeers = async () => { throw Error('酒馆暂时不能核对旧聊天归属，请稍后重试'); }, chooseLegacy = async () => null, ready = () => {}, error = () => {}}) {
  let pending = new WeakMap(), failures = new WeakMap();
  const accepted = new WeakMap(), claims = new Map();
  let closed = false, visit = 0;
  function snapshot() {
    const ctx = context(), meta = ctx?.chatMetadata, place = card(), id = idOf(ctx);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !place?.key || !id) return null;
    return {ctx, meta, card: place, id, integrity: typeof meta.integrity === 'string' ? meta.integrity : '', token: meta.stIphonieSave, mark: fingerprint(meta), visit};
  }
  const current = s => {
    if (closed || visit !== s.visit) return false;
    const now = snapshot();
    return now && now.meta === s.meta && now.id === s.id && now.card.key === s.card.key && now.mark === s.mark;
  };
  const owner = s => ({version: 1, card: s.card.key, chat: s.id, integrity: s.integrity});
  function commit(s, token) {
    if (!current(s)) return '';
    const next = owner(s), old = s.meta[OWNER], oldToken = s.meta.stIphonieSave;
    if (oldToken !== token || JSON.stringify(old) !== JSON.stringify(next)) {
      if (typeof s.ctx.saveMetadataDebounced !== 'function') throw Error('酒馆暂时不能保存聊天标识，请重新打开聊天后重试');
      const hadOwner = Object.hasOwn(s.meta, OWNER), hadToken = Object.hasOwn(s.meta, 'stIphonieSave');
      try { s.meta.stIphonieSave = token; s.meta[OWNER] = next; s.ctx.saveMetadataDebounced(); }
      catch (e) { if (hadToken) s.meta.stIphonieSave = oldToken; else delete s.meta.stIphonieSave; if (hadOwner) s.meta[OWNER] = old; else delete s.meta[OWNER]; throw e; }
    }
    accepted.set(s.meta, {mark: fingerprint(s.meta), id: s.id, card: s.card.key, token});
    claims.set(JSON.stringify([s.card.key, token]), next);
    return token;
  }
  const fork = s => tokenOf(['phone-chat-copy-v1', s.card.key, s.token, s.id, s.integrity]);
  async function distinguish(s, previous, branch = false) {
    const header = await readHeader(s.card, previous.chat, s.ctx);
    if (!current(s)) return '';
    // A different file still holding this token proves a copy/branch. A reused name with another token is not its source.
    if (header?.stIphonieSave === s.token) return commit(s, fork(s));
    if (branch && header === null) throw Error('找不到这份旧分支的原聊天，暂未切换手机资料，请先确认原聊天名称');
    return commit(s, s.token);
  }
  async function adoptLegacy(s) {
    const peers = await readPeers(s.card, s.ctx, s.id);
    if (!current(s)) return '';
    if (!Array.isArray(peers) || peers.some(p => !p || typeof p.chat !== 'string' || !p.meta || typeof p.meta !== 'object')) throw Error('酒馆返回的聊天归属不完整，原手机资料没有改动');
    const aliases = peers.filter(p => p.chat !== s.id && p.meta.stIphonieSave === s.token);
    if (!aliases.length) return commit(s, s.token);
    // A persisted owner proves which old file this unbound copy came from. Otherwise legacy ownership is unknowable.
    if (aliases.some(p => { const own = ownerOf(p.meta[OWNER]); return own?.card === s.card.key && own.chat === p.chat; })) return commit(s, fork(s));
    const choice = await chooseLegacy({chat: s.id, aliases: aliases.map(p => p.chat)});
    if (!current(s)) return '';
    if (choice === 'new') return commit(s, fork(s));
    if (choice === 'keep') return commit(s, s.token); // Explicitly retain legacy shared data; never move or retag it.
    throw Object.assign(Error('旧聊天共用手机资料，尚未确认归属，原资料没有改动'), {code:'CHAT_IDENTITY_CANCELLED'});
  }
  function read() {
    if (closed) return '';
    let s;
    try {
      s = snapshot(); if (!s) return '';
      const got = accepted.get(s.meta);
      if (got?.mark === s.mark && got.id === s.id && got.card === s.card.key) return got.token;
      if (pending.get(s.meta)?.mark === s.mark) return '';
      if (failures.get(s.meta)?.mark === s.mark && Date.now() < failures.get(s.meta).until) return '';
      if (s.token !== undefined && s.token !== '' && !validChatSave(s.token)) throw Error('这份聊天的手机存档标识无效，原资料没有改动');
      if (s.meta[OWNER] !== undefined && !ownerOf(s.meta[OWNER])) throw Error('这份聊天的手机归属标记无法识别，原资料没有改动');
      if (!s.token) return commit(s, tokenOf(['phone-chat-v1', s.card.key, s.integrity || globalThis.crypto.randomUUID(), s.id]));
      const previous = ownerOf(s.meta[OWNER]) || claims.get(JSON.stringify([s.card.key, s.token]));
      if (previous && previous.card === s.card.key && previous.chat !== s.id) {
        // Modern ST creates a fresh integrity UUID for branches and checkpoints, while normal rename retains it.
        if (previous.integrity && s.integrity && previous.integrity !== s.integrity) return commit(s, fork(s));
        start(s, () => distinguish(s, previous)); return '';
      }
      if (!previous && nameOf(s.meta.main_chat) && nameOf(s.meta.main_chat) !== s.id) {
        start(s, () => distinguish(s, {chat: nameOf(s.meta.main_chat)}, true)); return '';
      }
      if (!previous) { start(s, () => adoptLegacy(s)); return ''; }
      return commit(s, s.token);
    } catch (e) { if (s) failed(s, e); return ''; }
  }
  function failed(s, e) {
    if (!current(s)) return;
    const last = failures.get(s.meta);failures.set(s.meta, {mark: s.mark, until: e.code === 'CHAT_IDENTITY_CANCELLED' ? Infinity : Date.now() + 1000});
    if (last?.mark !== s.mark) error(e);
  }
  function start(s, work) {
    const job = Promise.resolve().then(() => current(s) ? work() : '').then(token => { if (token) ready(); }, e => failed(s, e)).finally(() => { if (pending.get(s.meta)?.job === job) pending.delete(s.meta); });
    pending.set(s.meta, {mark: s.mark, job});
  }
  return {read, change() { visit++; pending = new WeakMap(); failures = new WeakMap(); }, close() { closed = true; visit++; }};
}

// Phone chat history, kept in this browser (IndexedDB) and scoped to the tavern account like the other local data.
// Thread: {id, type:'dm'|'group', name, members:[name], unread, createdAt, updatedAt, messages:[Message]}
// Message: {id, from:'me'|name, kind, text, at, quote?:{from,text}} plus, by kind:
//   voice: translation, emotion · photo: photoId? (none when a contact describes a photo in words), imageTags? (to draw
//         it), imageState?: 'waiting'|'done'|'failed', imageNote?
//   redpacket: amount, state:'sent'|'opened', openedBy? · transfer: amount, state:'sent'|'accepted'|'returned'
//   location: text = place, detail = address · pat: target (who was patted) · dice: text = 1..6
//   notice: text = what `from` did, with {对方} standing for `target` · recall: a withdrawn message · system: app notes
//   gift: gift:{name, emoji, price}, state:'sent'|'accepted'|'returned', openedBy? (a present; price 0 when a character sends it)
//   call: dir:'in'|'out' (from is who called), state:'answered'|'missed'|'declined'|'cancelled', duration (seconds),
//         lines:[{from, text, translation, emotion}] what was said, voicemail:[{text, translation, emotion}] a missed call's message
// list() returns threads without their messages, plus the last message for previews, pinned threads first.
// A thread can be pinned (置顶) or muted (免打扰: its unread messages do not count toward the app's badge).
// friend (删好友, private chats only): {by:'me'|'them', at, requests:[{text, at}]} — by 'me': the user deleted the contact
// (the chat is put away; what the contact sends meanwhile waits as 好友申请 in requests); by 'them': the contact deleted
// the user (the user's messages are refused until a 好友申请 is accepted).
// streak (聊天火花): days in a row, up to today or yesterday, on which both the user and the other side wrote.
import {connectionLost, lostError} from './idb.js';

export const CHAT_STORE_LIMITS = Object.freeze({messages: 1000, text: 4000, members: 20, fileText: 30000});
const KINDS = ['text', 'voice', 'photo', 'sticker', 'system', 'redpacket', 'transfer', 'location', 'pat', 'dice', 'notice', 'recall', 'call', 'gift', 'song', 'file'];
const CALL_STATES = ['answered', 'missed', 'declined', 'cancelled'];
const spoken = (list, max, withFrom) => (Array.isArray(list) ? list : []).slice(-max).filter(l => l && String(l.text || l.translation || '').trim()).map(l => ({...(withFrom ? {from: clip(l.from, 40).trim() || 'me'} : {}), text: clip(l.text || l.translation, 1000), translation: clip(l.translation || l.text, 1000), emotion: clip(l.emotion || 'calm', 100)}));
const STATES = {redpacket: ['sent', 'opened'], transfer: ['sent', 'accepted', 'returned'], gift: ['sent', 'accepted', 'returned']};
/** A private chat's 删好友 state, checked; null when there is none. */
export function cleanFriend(f) {
  if (!f || typeof f !== 'object' || !['me', 'them'].includes(f.by)) return null;
  const requests = (Array.isArray(f.requests) ? f.requests : []).filter(r => r && String(r.text || '').trim()).slice(-10).map(r => ({text: clip(r.text, 300).trim(), at: Number.isFinite(r.at) ? r.at : 0}));
  return {by: f.by, at: Number.isFinite(f.at) ? f.at : 0, requests};
}
/** Money as a string with two decimals, 0.01 to 200000; null when the value is not an amount. */
export function money(value) {
  const n = Math.round(Number(String(value ?? '').replace(/[¥￥,，\s元]/g, '')) * 100) / 100;
  return Number.isFinite(n) && n >= 0.01 && n <= 200000 ? n.toFixed(2) : null;
}
const fail = (message, code = 'INVALID') => Object.assign(new Error(message), {code});
const clip = (value, max) => String(value ?? '').slice(0, max);

function cleanMessage(m, id, at) {
  if (!m || typeof m !== 'object') throw fail('消息格式无效');
  const kind = KINDS.includes(m.kind) ? m.kind : 'text';
  const from = clip(m.from, 40).trim();
  if (!from) throw fail('消息缺少发送人');
  const out = {id, from, kind, text: clip(m.text, CHAT_STORE_LIMITS.text), at};
  if (Number.isFinite(m.updatedAt) && m.updatedAt > 0) out.updatedAt = m.updatedAt;
  if (kind === 'voice') { out.translation = clip(m.translation, CHAT_STORE_LIMITS.text); out.emotion = clip(m.emotion, 100); }
  if (kind === 'photo' && m.photoId) out.photoId = clip(m.photoId, 512);
  if (kind === 'photo' && m.imageTags) out.imageTags = clip(m.imageTags, 6000);
  if (kind === 'photo' && Array.isArray(m.imageVersions)) out.imageVersions = [...new Set(m.imageVersions.filter(x => typeof x === 'string' && x).map(x => clip(x, 512)))].slice(-100);
  if (kind === 'photo' && ['waiting', 'done', 'failed'].includes(m.imageState)) out.imageState = m.imageState;
  if (kind === 'photo' && m.imageNote) out.imageNote = clip(m.imageNote, 200);
  if (kind === 'gift') {
    const g = m.gift && typeof m.gift === 'object' ? m.gift : {};
    out.gift = {name: clip(g.name, 20).trim(), emoji: [...clip(g.emoji, 16).trim()].slice(0, 2).join('') || '🎁', price: Math.max(0, Math.min(99999, Math.round(Number(g.price) * 100) / 100 || 0))};
    if (!out.gift.name) throw fail('礼物缺少名字');
  }
  if (STATES[kind]) {
    if (kind !== 'gift') { out.amount = money(m.amount); if (!out.amount) throw fail('金额无效'); }
    out.state = STATES[kind].includes(m.state) ? m.state : 'sent';
    if (m.openedBy) out.openedBy = clip(m.openedBy, 40);
  }
  if (kind === 'location') out.detail = clip(m.detail, 200);
  // A document the user sent: its name and the words in it (what the contact reads); the file itself is not kept.
  if (kind === 'file') {
    out.name = clip(m.name, 120).trim(); out.size = Math.max(0, Math.round(Number(m.size) || 0)); out.fileText = clip(m.fileText, CHAT_STORE_LIMITS.fileText);
    if (!out.name) throw fail('文件缺少名字');
    if (!out.fileText.trim()) throw fail('文件里没有能读的文字');
  }
  // A song shared: what it is (played from the 歌单 or the user's music sources when tapped).
  if (kind === 'song') { const s = m.song && typeof m.song === 'object' ? m.song : {}; out.song = {title: clip(s.title, 120).trim(), artist: clip(s.artist, 120).trim()}; if (!out.song.title) throw fail('歌曲缺少名字'); }
  // A sticker keeps its address, so it still shows after it leaves the collection.
  if (kind === 'sticker') { out.text = clip(m.text, 20); out.url = /^https?:\/\//i.test(String(m.url || '')) ? clip(m.url, 2000) : ''; }
  if (kind === 'pat' || kind === 'notice') out.target = clip(m.target, 40).trim() || 'me';
  if (kind === 'dice') out.text = String(Math.min(6, Math.max(1, Math.round(Number(m.text)) || 1)));
  if (kind === 'recall') out.text = '';
  if (kind === 'call') {
    out.dir = m.dir === 'out' ? 'out' : 'in';
    out.state = CALL_STATES.includes(m.state) ? m.state : 'missed';
    out.duration = Math.max(0, Math.min(86400, Math.round(Number(m.duration) || 0)));
    out.lines = spoken(m.lines, 80, true);
    out.voicemail = spoken(m.voicemail, 4, false);
  }
  if (m.quote?.text && ['text', 'voice'].includes(kind)) out.quote = {from: clip(m.quote.from, 40), text: clip(m.quote.text, 200)};
  // Sent by a story reply (正文联动手机): which reply (chat|message) and which version of it.
  if (typeof m.story === 'string' && m.story) { out.story = clip(m.story, 300); out.storyVer = clip(m.storyVer, 40); }
  const textless = ['photo', 'system', 'redpacket', 'transfer', 'pat', 'dice', 'recall', 'call', 'gift', 'file'];
  if (!textless.includes(kind) && !out.text.trim()) throw fail('消息内容为空');
  return out;
}

export class ChatStore {
  #scope; #factory; #now; #id; #db = null; #opening = null; #closed = false;
  constructor(scope, {indexedDB = globalThis.indexedDB, now = Date.now, id = () => globalThis.crypto.randomUUID()} = {}) {
    this.#scope = String(scope); this.#factory = indexedDB; this.#now = now; this.#id = id;
  }
  async #open() {
    if (this.#closed) throw fail('聊天记录已关闭', 'CLOSED');
    if (this.#db) return this.#db;
    if (!this.#factory?.open) throw fail('浏览器不支持本地保存聊天记录，请检查存储权限', 'STORAGE_UNAVAILABLE');
    this.#opening ||= new Promise((resolve, reject) => {
      const req = this.#factory.open('st-iphonie-chats-v1', 1);
      req.onupgradeneeded = () => { const store = req.result.createObjectStore('threads', {keyPath: ['scope', 'id']}); store.createIndex('scope', 'scope'); };
      req.onerror = () => reject(fail('无法打开聊天记录，请检查浏览器的存储权限', 'STORAGE_UNAVAILABLE'));
      req.onblocked = () => reject(fail('另一个页面占用了聊天记录，请关闭旧页面后重试', 'STORAGE_BLOCKED'));
      req.onsuccess = () => {
        if (this.#closed) { req.result.close(); reject(fail('聊天记录已关闭', 'CLOSED')); return; }
        this.#db = req.result;
        const db = this.#db;
        db.onversionchange = () => { db.close(); if (this.#db === db) this.#db = null; };
        db.onclose = () => { if (this.#db === db) this.#db = null; };
        resolve(db);
      };
    }).finally(() => { this.#opening = null; });
    return this.#opening;
  }
  // A dropped connection (iPhone Safari after the page sat in the background) is reopened once; nothing was written.
  async #tx(mode, work, again = true) {
    const db = await this.#open();
    try {
      return await new Promise((resolve, reject) => {
        let result, own, tx;
        try { tx = db.transaction('threads', mode); } catch (error) { reject(this.#closed ? fail('聊天记录已关闭', 'CLOSED') : lostError(error)); return; }
        const store = tx.objectStore('threads');
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(own || (connectionLost(tx.error) ? lostError(tx.error) : fail(tx.error?.name === 'QuotaExceededError' ? '设备存储空间不足，聊天没有保存' : '聊天记录没有保存，请重试', 'STORAGE')));
        work(store, value => { result = value; }, error => { own = error; tx.abort(); });
      });
    } catch (error) {
      if (error?.code !== 'STORAGE_LOST' || this.#closed) throw error;
      if (this.#db === db) { try { db.close(); } catch {} this.#db = null; }
      if (again) return this.#tx(mode, work, false);
      throw error;
    }
  }
  #get(store, id, then) {
    const req = store.get([this.#scope, String(id)]);
    req.onsuccess = () => then(req.result || null);
  }
  #public(row, full = true) {
    if (!row) return null;
    const {scope, messages, ...rest} = row;
    const base = {pinned: false, muted: false, ...rest};
    return full ? structuredClone({...base, messages}) : structuredClone({...base, count: messages.length, last: messages.filter(m => m.kind !== 'system').at(-1) || null, streak: this.#streak(messages)});
  }
  #streak(messages) {
    const day = at => { const d = new Date(at); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    const mine = new Set(), theirs = new Set();
    for (const m of messages) if (!['system', 'notice', 'recall'].includes(m.kind)) (m.from === 'me' ? mine : theirs).add(day(m.at));
    const both = [...mine].filter(d => theirs.has(d)).sort((a, b) => b - a);
    const today = day(this.#now()), DAY = 86400000;
    if (!both.length || today - both[0] > DAY) return 0;
    let n = 1;
    while (n < both.length && both[n - 1] - both[n] <= DAY + 3600000 && both[n - 1] - both[n] >= DAY - 3600000) n++;
    return n;
  }

  async list() {
    const rows = await this.#tx('readonly', (store, done) => { const req = store.index('scope').getAll(this.#scope); req.onsuccess = () => done(req.result); });
    return rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt).map(row => this.#public(row, false));
  }
  async get(id) {
    return this.#tx('readonly', (store, done) => this.#get(store, id, row => done(this.#public(row))));
  }
  async create({type = 'dm', name = '', members = [], space = '', windowOf = ''} = {}) {
    const list = [...new Set((Array.isArray(members) ? members : []).map(m => clip(m, 40).trim()).filter(Boolean))];
    if (!list.length) throw fail('请选择聊天对象');
    if (list.length > CHAT_STORE_LIMITS.members) throw fail('群聊最多 20 人');
    if (type === 'group' && list.length < 2) throw fail('群聊至少要选两个人');
    const now = this.#now(), row = {scope: this.#scope, id: this.#id(), type: type === 'group' ? 'group' : 'dm', name: clip(name, 40).trim() || (type === 'group' ? list.join('、').slice(0, 40) : list[0]), members: type === 'group' ? list : [list[0]], unread: 0, createdAt: now, updatedAt: now, messages: [], ...(space ? {space: clip(space, 300)} : {}), ...(type === 'group' && windowOf ? {windowOf: clip(windowOf, 512)} : {})};
    await this.#tx('readwrite', (store, done) => { store.put(row); done(); });
    return this.#public(row);
  }
  async #change(id, change) {
    return this.#tx('readwrite', (store, done, abort) => this.#get(store, id, row => {
      if (!row) { abort(fail('这段聊天已不存在', 'MISSING')); return; }
      try { change(row); } catch (error) { abort(error); return; }
      if (row.messages.length > CHAT_STORE_LIMITS.messages) row.messages = row.messages.slice(-CHAT_STORE_LIMITS.messages);
      store.put(row);
      done(this.#public(row));
    }));
  }
  async update(id, {name, members, pinned, muted, friend, story, open, label} = {}) {
    return this.#change(id, row => {
      // 聊天窗口: a private chat can have several; the one opened last is the one the list shows and replies go to.
      if (open === true) row.openedAt = this.#now();
      if (label !== undefined) { const text = clip(label, 40).trim(); if (text) row.label = text; else delete row.label; }
      // 一直带着: the story always knows this chat (its memory and what is not written up yet).
      if (story !== undefined) { if (story === true) row.story = true; else delete row.story; }
      if (friend !== undefined && row.type === 'dm') { const f = cleanFriend(friend); if (f) row.friend = f; else delete row.friend; }
      if (pinned !== undefined) row.pinned = pinned === true;
      if (muted !== undefined) row.muted = muted === true;
      if (name !== undefined) row.name = clip(name, 40).trim() || row.name;
      if (members !== undefined && row.type === 'group') {
        const list = [...new Set(members.map(m => clip(m, 40).trim()).filter(Boolean))];
        if (list.length < 2) throw fail('群聊至少要选两个人');
        row.members = list.slice(0, CHAT_STORE_LIMITS.members);
      }
      if (name !== undefined || members !== undefined) row.updatedAt = this.#now();
    });
  }
  /** Adds messages. Replies count as unread unless `read` is set (the chat is open on screen). */
  async append(id, messages, {read = false} = {}) {
    return this.#change(id, row => {
      const now = this.#now();
      const added = messages.map((m, i) => cleanMessage(m, this.#id(), now + i));
      row.messages.push(...added);
      if (!read) row.unread += added.filter(m => m.from !== 'me' && !['system', 'notice', 'recall'].includes(m.kind)).length;
      row.updatedAt = now;
    });
  }
  /**
   * Changes one message: {state, openedBy} for a red packet or transfer, or {recall: true} to withdraw it
   * (the message keeps its place and sender and loses its content).
   */
  async updateMessage(id, messageId, patch = {}) {
    return this.#change(id, row => {
      const m = row.messages.find(x => x.id === messageId);
      if (!m) throw fail('这条消息已不存在', 'MISSING');
      m.updatedAt = Math.max(this.#now(), (m.updatedAt || m.at || 0) + 1);
      if (patch.recall) {
        for (const key of Object.keys(m)) if (!['id', 'from', 'at', 'updatedAt'].includes(key)) delete m[key];
        Object.assign(m, {kind: 'recall', text: ''});
        return;
      }
      // A contact's photo: its drawing (photoId '' takes the picture away again).
      if (m.kind === 'photo' && ['photoId', 'imageState', 'imageNote', 'imageTags', 'imageVersions'].some(k => k in patch)) {
        if ('imageTags' in patch) m.imageTags = clip(patch.imageTags, 6000);
        if ('imageVersions' in patch) m.imageVersions = [...new Set((Array.isArray(patch.imageVersions) ? patch.imageVersions : []).filter(x => typeof x === 'string' && x).map(x => clip(x, 512)))].slice(-100);
        if ('photoId' in patch) { if (patch.photoId) m.photoId = clip(patch.photoId, 512); else delete m.photoId; }
        if ('imageState' in patch) { if (['waiting', 'done', 'failed'].includes(patch.imageState)) m.imageState = patch.imageState; else delete m.imageState; }
        if ('imageNote' in patch) { if (patch.imageNote) m.imageNote = clip(patch.imageNote, 200); else delete m.imageNote; }
        return;
      }
      if (!STATES[m.kind]) throw fail('这条消息不能修改');
      if (patch.state !== undefined) {
        if (!STATES[m.kind].includes(patch.state)) throw fail('状态无效');
        m.state = patch.state;
      }
      if (patch.openedBy !== undefined) m.openedBy = clip(patch.openedBy, 40);
    });
  }
  /** A 好友申请 from a contact the user deleted: kept with the chat until the user adds them back. */
  async addRequest(id, texts) {
    return this.#change(id, row => {
      if (row.friend?.by !== 'me') throw fail('TA 还是你的好友');
      const now = this.#now(), list = (Array.isArray(texts) ? texts : [texts]).map(t => clip(t, 300).trim()).filter(Boolean);
      row.friend = cleanFriend({...row.friend, requests: [...row.friend.requests, ...list.map((text, i) => ({text, at: now + i}))]});
      row.updatedAt = now;
    });
  }
  async removeMessages(id, ids) {
    const drop = new Set(ids);
    return this.#change(id, row => { row.messages = row.messages.filter(m => !drop.has(m.id)); });
  }
  async markRead(id) {
    return this.#change(id, row => { row.unread = 0; });
  }
  async remove(id) {
    return this.#tx('readwrite', (store, done) => { store.delete([this.#scope, String(id)]); done(true); });
  }
  async unread() {
    return (await this.list()).reduce((n, t) => n + (t.muted ? 0 : t.unread), 0);
  }
  /** Every thread with its messages, for a backup. */
  async exportThreads() {
    const rows = await this.#tx('readonly', (store, done) => { const req = store.index('scope').getAll(this.#scope); req.onsuccess = () => done(req.result); });
    return rows.map(row => this.#public(row));
  }
  /** Puts backup threads back with their ids, checked like new ones, in one transaction. replace: other threads go. */
  async importThreads(threads, {replace = false, merge} = {}) {
    if (!Array.isArray(threads)) throw fail('备份里的聊天记录无效');
    const now = this.#now(), prepare = values => values.map(t => {
      if (!t || typeof t !== 'object' || !t.id) throw fail('备份里的聊天记录无效');
      const members = [...new Set((Array.isArray(t.members) ? t.members : []).map(m => clip(m, 40).trim()).filter(Boolean))].slice(0, CHAT_STORE_LIMITS.members);
      if (!members.length) throw fail('备份里有一段聊天没有聊天对象');
      const messages = (Array.isArray(t.messages) ? t.messages : []).slice(-CHAT_STORE_LIMITS.messages).map(m => cleanMessage(m, clip(m?.id || this.#id(), 512), Number.isFinite(m?.at) ? m.at : now));
      return {scope: this.#scope, id: clip(t.id, 512), type: t.type === 'group' ? 'group' : 'dm', name: clip(t.name, 40).trim() || members.join('、').slice(0, 40), members: t.type === 'group' ? members : [members[0]], pinned: t.pinned === true, muted: t.muted === true, ...(t.story === true ? {story: true} : {}), ...(Number.isFinite(t.openedAt) ? {openedAt: t.openedAt} : {}), ...(typeof t.label === 'string' && t.label.trim() ? {label: clip(t.label, 40).trim()} : {}), ...(t.type === 'group' && t.windowOf ? {windowOf: clip(t.windowOf, 512)} : {}),
        unread: Math.max(0, Math.min(CHAT_STORE_LIMITS.messages, Math.round(Number(t.unread)) || 0)), createdAt: Number.isFinite(t.createdAt) ? t.createdAt : now, updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : now, messages, ...(t.space ? {space: clip(t.space, 300)} : {}), ...(t.type !== 'group' && cleanFriend(t.friend) ? {friend: cleanFriend(t.friend)} : {})};
    });
    const rows = prepare(threads);
    return this.#tx('readwrite', (store, done, abort) => {
      const write = incoming => { for (const row of incoming) store.put(row); done(incoming.length); };
      if (!replace) { write(rows); return; }
      const req = store.index('scope').getAll(this.#scope);
      req.onsuccess = () => {
        try {
          const incoming = merge ? prepare(merge(req.result.map(row => this.#public(row)))) : rows;
          for (const row of req.result) store.delete([this.#scope, row.id]);
          write(incoming);
        } catch (error) { abort(error); }
      };
    });
  }
  close() { this.#closed = true; this.#db?.close(); this.#db = null; }
}

// ---------- 聊天窗口 ----------
const openedLast = (a, b) => Math.max(b.openedAt || 0, b.createdAt || 0) - Math.max(a.openedAt || 0, a.createdAt || 0);
/** A contact's private chats (聊天窗口), the one in use first: the one opened (or started) last. */
export function dmWindows(threads, name) {
  return (threads || []).filter(t => t.type === 'dm' && t.members.length === 1 && t.members[0] === name).sort(openedLast);
}
/** The private chat with a contact that is in use, or undefined. */
export const currentDm = (threads, name) => dmWindows(threads, name)[0];
/** Which group a group chat is a window of: the first one's id (windowOf), kept when that one is deleted. */
export const groupKey = t => t.windowOf || t.id;
/** The 聊天窗口 a chat belongs with, the one in use first: a contact's private chats, or one group's windows. */
export function chatWindows(threads, thread) {
  if (thread?.type !== 'group') return dmWindows(threads, thread?.members?.[0]);
  const key = groupKey(thread);
  return (threads || []).filter(t => t.type === 'group' && groupKey(t) === key).sort(openedLast);
}
/** The window in use among a chat's windows, or undefined. */
export const currentWindow = (threads, thread) => chatWindows(threads, thread)[0];


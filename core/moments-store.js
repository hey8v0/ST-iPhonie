// 朋友圈 posts, kept in this browser (IndexedDB) and scoped to the tavern account like the other local data.
// Post: {id, author:'me'|name, text, at, source:'manual'|'auto'|'me'|'chat', photoId?, imageTags?, imageState?:'waiting'|'done'|'failed',
//        imageNote?, imageVersions?:[photoId] (every picture drawn for it, to swipe through), likes:[name|'me'],
//        comments:[{id, from:'me'|name, to?:'me'|name, text, at}]}
import {MOMENTS_LIMITS} from './moments.js';
import {connectionLost, lostError} from './idb.js';

const fail = (message, code = 'INVALID') => Object.assign(new Error(message), {code});
const clip = (value, max) => String(value ?? '').slice(0, max);
const person = value => clip(value, 40).trim();
const versionList = list => [...new Set((Array.isArray(list) ? list : []).filter(x => typeof x === 'string' && x).map(x => clip(x, 512)))].slice(-30);

function cleanComment(c, id, at) {
  const from = person(c?.from), said = clip(c?.text, 500).trim();
  if (!from || !said) throw fail('评论内容为空');
  return {id, from, ...(person(c.to) ? {to: person(c.to)} : {}), text: said, at};
}
function cleanPost(p, id, at) {
  const author = person(p?.author), said = clip(p?.text, MOMENTS_LIMITS.text).trim();
  if (!author) throw fail('动态缺少发布人');
  if (!said && !p?.photoId) throw fail('动态内容为空');
  const out = {id, author, text: said, at, source: ['manual', 'auto', 'me', 'chat'].includes(p.source) ? p.source : 'manual', likes: [], comments: []};
  if (p.photoId) out.photoId = clip(p.photoId, 512);
  if (p.imageTags) out.imageTags = clip(p.imageTags, 600);
  if (versionList(p.imageVersions).length) out.imageVersions = versionList(p.imageVersions);
  if (['waiting', 'done', 'failed'].includes(p.imageState)) out.imageState = p.imageState;
  if (p.imageNote) out.imageNote = clip(p.imageNote, 200);
  if (p.space) out.space = clip(p.space, 300);
  out.likes = [...new Set((Array.isArray(p.likes) ? p.likes : []).map(person).filter(Boolean))].slice(0, 50);
  return out;
}

export class MomentStore {
  #scope; #factory; #now; #id; #db = null; #opening = null; #closed = false;
  constructor(scope, {indexedDB = globalThis.indexedDB, now = Date.now, id = () => globalThis.crypto.randomUUID()} = {}) {
    this.#scope = String(scope); this.#factory = indexedDB; this.#now = now; this.#id = id;
  }
  async #open() {
    if (this.#closed) throw fail('朋友圈已关闭', 'CLOSED');
    if (this.#db) return this.#db;
    if (!this.#factory?.open) throw fail('浏览器不支持本地保存朋友圈，请检查存储权限', 'STORAGE_UNAVAILABLE');
    this.#opening ||= new Promise((resolve, reject) => {
      const req = this.#factory.open('st-iphonie-moments-v1', 1);
      req.onupgradeneeded = () => { const store = req.result.createObjectStore('posts', {keyPath: ['scope', 'id']}); store.createIndex('scope', 'scope'); };
      req.onerror = () => reject(fail('无法打开朋友圈，请检查浏览器的存储权限', 'STORAGE_UNAVAILABLE'));
      req.onblocked = () => reject(fail('另一个页面占用了朋友圈，请关闭旧页面后重试', 'STORAGE_BLOCKED'));
      req.onsuccess = () => {
        if (this.#closed) { req.result.close(); reject(fail('朋友圈已关闭', 'CLOSED')); return; }
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
        try { tx = db.transaction('posts', mode); } catch (error) { reject(this.#closed ? fail('朋友圈已关闭', 'CLOSED') : lostError(error)); return; }
        const store = tx.objectStore('posts');
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(own || (connectionLost(tx.error) ? lostError(tx.error) : fail(tx.error?.name === 'QuotaExceededError' ? '设备存储空间不足，朋友圈没有保存' : '朋友圈没有保存，请重试', 'STORAGE')));
        work(store, value => { result = value; }, error => { own = error; tx.abort(); });
      });
    } catch (error) {
      if (error?.code !== 'STORAGE_LOST' || this.#closed) throw error;
      if (this.#db === db) { try { db.close(); } catch {} this.#db = null; }
      if (again) return this.#tx(mode, work, false);
      throw error;
    }
  }
  #all(store, then) { const req = store.index('scope').getAll(this.#scope); req.onsuccess = () => then(req.result); }
  #public(row) { if (!row) return null; const {scope, ...rest} = row; return structuredClone(rest); }
  /** Changes one post inside a transaction; change(row) edits it in place. */
  async #change(id, change) {
    return this.#tx('readwrite', (store, done, abort) => {
      const req = store.get([this.#scope, String(id)]);
      req.onsuccess = () => {
        const row = req.result;
        if (!row) { abort(fail('这条动态已经不在了', 'MISSING')); return; }
        try { change(row); } catch (error) { abort(error); return; }
        if (row.comments.length > MOMENTS_LIMITS.comments) row.comments = row.comments.slice(-MOMENTS_LIMITS.comments);
        store.put(row);
        done(this.#public(row));
      };
    });
  }

  /** Newest first. */
  async list() {
    const rows = await this.#tx('readonly', (store, done) => this.#all(store, done));
    return rows.sort((a, b) => b.at - a.at).map(row => this.#public(row));
  }
  async get(id) {
    return this.#tx('readonly', (store, done) => { const req = store.get([this.#scope, String(id)]); req.onsuccess = () => done(this.#public(req.result)); });
  }
  /** Adds posts (each with its likes and comments); the oldest go once there are more than the limit. */
  async add(posts) {
    const now = this.#now();
    const rows = posts.map((p, i) => ({scope: this.#scope, ...cleanPost(p, this.#id(), now + i),
      comments: (p.comments || []).slice(0, MOMENTS_LIMITS.comments).map((c, k) => cleanComment(c, this.#id(), now + i + k + 1))}));
    return this.#tx('readwrite', (store, done) => this.#all(store, existing => {
      for (const row of rows) store.put(row);
      const all = [...existing, ...rows].sort((a, b) => b.at - a.at);
      for (const old of all.slice(MOMENTS_LIMITS.posts)) store.delete([this.#scope, old.id]);
      done(rows.map(row => this.#public(row)));
    }));
  }
  async like(id, who, on = true) {
    return this.#change(id, row => {
      const name = person(who);
      row.likes = row.likes.filter(n => n !== name);
      if (on) row.likes.push(name);
    });
  }
  /** Adds likes and comments from a reaction (duplicates of likes are ignored). */
  async react(id, {likes = [], comments = []} = {}) {
    return this.#change(id, row => {
      const now = this.#now();
      for (const n of likes.map(person)) if (n && !row.likes.includes(n) && n !== row.author) row.likes.push(n);
      comments.forEach((c, k) => row.comments.push(cleanComment(c, this.#id(), now + k)));
    });
  }
  async comment(id, value) {
    let added;
    const post = await this.#change(id, row => { added = cleanComment(value, this.#id(), this.#now()); row.comments.push(added); });
    return {post, comment: added};
  }
  async removeComment(id, commentId) { return this.#change(id, row => { row.comments = row.comments.filter(c => c.id !== commentId); }); }
  /** The picture of a post: {photoId, imageState, imageNote, imageTags, imageVersions}. */
  async setImage(id, {photoId, imageState, imageNote, imageTags, imageVersions} = {}) {
    return this.#change(id, row => {
      if (photoId !== undefined) { if (photoId) row.photoId = clip(photoId, 512); else delete row.photoId; }
      if (imageTags !== undefined && String(imageTags).trim()) row.imageTags = clip(String(imageTags).trim(), 600);
      if (imageVersions !== undefined) { const list = versionList(imageVersions); if (list.length) row.imageVersions = list; else delete row.imageVersions; }
      if (imageState !== undefined) row.imageState = imageState;
      if (imageNote !== undefined) { if (imageNote) row.imageNote = clip(imageNote, 200); else delete row.imageNote; }
    });
  }
  async remove(id) { return this.#tx('readwrite', (store, done) => { store.delete([this.#scope, String(id)]); done(true); }); }
  async clear() { return this.#tx('readwrite', (store, done) => this.#all(store, rows => { for (const row of rows) store.delete([this.#scope, row.id]); done(rows.length); })); }
  /** Posts made today by the characters on their own (for the daily limit). */
  async autoToday() {
    const start = new Date(this.#now()); start.setHours(0, 0, 0, 0);
    return (await this.list()).filter(p => p.source === 'auto' && p.at >= start.getTime()).length;
  }

  /** Every post, for a backup. */
  async exportPosts() { return this.list(); }
  /** Puts backup posts back with their ids, checked like new ones, in one transaction. replace: other posts go. */
  async importPosts(posts, {replace = false, merge} = {}) {
    if (!Array.isArray(posts)) throw fail('备份里的朋友圈无效');
    const now = this.#now(), prepare = values => values.slice(0, MOMENTS_LIMITS.posts).map(p => {
      if (!p || typeof p !== 'object' || !p.id) throw fail('备份里的朋友圈无效');
      const at = Number.isFinite(p.at) ? p.at : now;
      return {scope: this.#scope, ...cleanPost(p, clip(p.id, 512), at),
        comments: (Array.isArray(p.comments) ? p.comments : []).slice(-MOMENTS_LIMITS.comments).map(c => cleanComment(c, clip(c?.id || this.#id(), 512), Number.isFinite(c?.at) ? c.at : at))};
    });
    const rows = prepare(posts);
    return this.#tx('readwrite', (store, done, abort) => {
      const write = incoming => { for (const row of incoming) store.put(row); done(incoming.length); };
      if (!replace) { write(rows); return; }
      this.#all(store, existing => {
        try {
          const incoming = merge ? prepare(merge(existing.map(row => this.#public(row)))) : rows;
          for (const row of existing) store.delete([this.#scope, row.id]);
          write(incoming);
        } catch (error) { abort(error); }
      });
    });
  }
  close() { this.#closed = true; this.#db?.close(); this.#db = null; }
}

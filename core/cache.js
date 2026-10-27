import {sha256Hex} from './hash.js';
import {connectionLost} from './idb.js';

// The most it keeps (the oldest go first) when not told: core/storage-budget.js gives the share of this browser.
const MAX_BYTES = 200 * 1024 * 1024;
export async function requestHash(request) {
 // A Fish line is the same audio straight or through a relay: the address is left out, so switching keeps the cache.
 if (request?.engine === 'fish' && typeof request.url === 'string') { const {official, headers, viaTavern, ...rest} = request; request = {...rest, url: 'https://api.fish.audio/compat/v1/audio/speech', body: official?.body ?? request.body}; }
 return sha256Hex(JSON.stringify(request));
}
// Version 2 keeps each line's size and time in a small store of its own ('meta', no audio in it) and each account's
// total in 'sums'. Version 1 read every cached line, audio and all, to find the oldest whenever a new line was saved:
// with a few thousand lines that took seconds and held up the next line's playback while it ran.
const STORES = ['audio', 'meta', 'sums'];
const metaOf = row => ({id: row.id, key: row.key, scope: row.scope, at: Number.isFinite(row.at) ? row.at : 0, size: row.size || row.blob?.size || 0, metadata: row.metadata || {}});
// An account's {bytes, count}: its sums row, or added up from 'meta' when there is none yet.
function readSum(s, scope, then) {
 const sum = s.sums.get(scope);
 sum.onsuccess = () => {
  if (sum.result) { then(sum.result); return; }
  const rows = s.meta.index('scope').getAll(scope);
  rows.onsuccess = () => then({scope, bytes: rows.result.reduce((n, row) => n + row.size, 0), count: rows.result.length});
 };
}
export class AudioCache {
 constructor(scope, notify = () => {}, factory = globalThis.indexedDB, {limit = async () => MAX_BYTES, keep = () => {}} = {}) { Object.assign(this, { scope, notify, factory, limit, keep, epoch: 0, db: null, failed: false, closed: false }); }
 async room() { try { const n = await this.limit(); return Number.isFinite(n) && n > 0 ? n : MAX_BYTES; } catch { return MAX_BYTES; } }
 async open() {
  if (this.failed || this.closed) return null;
  if (!this.db) this.db = new Promise((resolve, reject) => {
   const request = this.factory.open('st-tts-audio-v1', 2);
   let settled = false;
   const fail = error => { if (!settled) { settled = true; reject(error); } };
   request.onupgradeneeded = event => {
    const db = request.result, tx = request.transaction;
    const audio = db.objectStoreNames.contains('audio') ? tx.objectStore('audio') : db.createObjectStore('audio', { keyPath: 'id' });
    if (db.objectStoreNames.contains('meta')) return;
    const meta = db.createObjectStore('meta', { keyPath: 'id' }), sums = db.createObjectStore('sums', { keyPath: 'scope' });
    meta.createIndex('at', 'at'); meta.createIndex('scope', 'scope');
    if (!event.oldVersion) return;
    // From version 1: every line's size and time, once (the only time the audio itself is read through).
    const totals = new Map(), cursor = audio.openCursor();
    cursor.onsuccess = () => {
     const c = cursor.result;
     if (!c) { for (const [scope, t] of totals) sums.put({scope, ...t}); return; }
     const row = c.value;
     if (typeof row?.scope === 'string' && typeof row.id === 'string') {
      const m = metaOf(row), t = totals.get(m.scope) || {bytes: 0, count: 0};
      meta.put(m); t.bytes += m.size; t.count++; totals.set(m.scope, t);
     }
     c.continue();
    };
   };
   request.onsuccess = () => {
    if (settled || this.closed) { request.result.close(); if (!settled) { settled = true; resolve(null); } return; }
    settled = true; const db = request.result; db.onversionchange = () => db.close(); db.onclose = () => { this.db = null; }; resolve(db);
   };
   request.onerror = () => fail(request.error);
   request.onblocked = () => fail(Error('缓存正在被另一个页面使用'));
  }).catch(() => { this.failed = true; if (!this.closed) this.notify('本机无法保存语音缓存；仍可生成和播放'); return null; });
  return this.db;
 }
 // A dropped connection (iPhone Safari after the page sat in the background) is reopened once; nothing was written.
 // action gets the stores {audio, meta, sums}.
 async transaction(mode, action, again = true) {
  const db = await this.open(); if (!db) return null;
  try {
   return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, mode); let value;
    try { value = action(Object.fromEntries(STORES.map(name => [name, tx.objectStore(name)]))); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(value && typeof value === 'object' && 'onsuccess' in value ? value.result : value);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('缓存操作中止'));
   });
  } catch (error) {
   if (!again || this.closed || !connectionLost(error)) throw error;
   if (await this.db === db) { try { db.close(); } catch {} this.db = null; }
   return this.transaction(mode, action, false);
  }
 }
 id(key) { return this.scope + ':' + key; }
 async getRecord(key) { try { return await this.transaction('readonly', s => s.audio.get(this.id(key))) || null; } catch { return null; } }
 async get(key) { const row = await this.getRecord(key); return row?.blob instanceof Blob && row.blob.size ? row.blob : null; }
 async has(key) { return Boolean(await this.get(key)); }
 async put(key, blob, epoch = this.epoch, metadata = {}) {
  if (epoch !== this.epoch || !(blob instanceof Blob) || !blob.size) return;
  const max = await this.room(); this.keep();
  if (blob.size > max) return;
  try { await this.transaction('readwrite', s => {
   if (epoch !== this.epoch) return;
   const id = this.id(key), row = { id, key, scope: this.scope, at: Date.now(), size: blob.size, metadata: structuredClone(metadata) };
   readSum(s, this.scope, sum => {
    const was = s.meta.get(id);
    was.onsuccess = () => {
     if (epoch !== this.epoch) return;
     let bytes = sum.bytes - (was.result?.size || 0) + blob.size, count = sum.count + (was.result ? 0 : 1);
     const write = () => { s.audio.put({...row, blob}); s.meta.put(row); s.sums.put({scope: this.scope, bytes, count}); };
     if (bytes <= max) { write(); return; }
     // Over the limit: this account's oldest lines go, down to nine tenths of it, so the next ones need no clearing.
     const goal = max * .9, cursor = s.meta.index('at').openCursor();
     cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c || bytes <= goal) { write(); return; }
      const old = c.value;
      if (old.scope === this.scope && old.id !== id) { bytes -= old.size; count--; s.audio.delete(old.id); c.delete(); }
      c.continue();
     };
    };
   });
  }); } catch { this.notify('语音已生成，但本机缓存未能保存'); }
 }
 async list() {
  const rows = await this.transaction('readonly', s => s.meta.index('scope').getAll(this.scope)).catch(() => null);
  return (rows || []).sort((a,b) => b.at-a.at).map(row => ({key:row.key || row.id.slice(this.scope.length+1),at:row.at,bytes:row.size,metadata:structuredClone(row.metadata || {})}));
 }
 async stats() {
  const out = {count: 0, bytes: 0};
  await this.transaction('readonly', s => readSum(s, this.scope, sum => { out.count = sum.count; out.bytes = sum.bytes; })).catch(() => null);
  return {...out, limit: await this.room(), available: !this.failed && !this.closed};
 }
 async remove(key) {
  this.epoch++; if(!await this.open()) throw Error('无法访问本机语音缓存');
  await this.transaction('readwrite', s => readSum(s, this.scope, sum => {
   const id = this.id(key), was = s.meta.get(id);
   was.onsuccess = () => {
    s.audio.delete(id);
    if (!was.result) return;
    s.meta.delete(id); s.sums.put({scope: this.scope, bytes: Math.max(0, sum.bytes - was.result.size), count: Math.max(0, sum.count - 1)});
   };
  }));
 }
 async clear() {
  this.epoch++; if(!await this.open()) throw Error('无法访问本机语音缓存');
  await this.transaction('readwrite', s => {
   const ids = s.meta.index('scope').getAllKeys(this.scope);
   ids.onsuccess = () => { for (const id of ids.result) { s.audio.delete(id); s.meta.delete(id); } s.sums.put({scope: this.scope, bytes: 0, count: 0}); };
  });
 }
 async close() {
  if (this.closed) return this.closing;
  this.closed = true; this.epoch++;
  this.closing = (async () => { const db = await this.db; db?.close(); this.db = null; })();
  return this.closing;
 }
}

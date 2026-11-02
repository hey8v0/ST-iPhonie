// iPhone Safari (WebKit) drops IndexedDB connections, most often after the page sat in the background: the old
// connection then refuses every transaction ("Connection to Indexed Database server lost"). A fresh connection
// usually works again, so the stores reconnect once before giving up with this message.
export const LOST_MESSAGE = '浏览器断开了本地存储（iPhone 上页面在后台放久了常见），请刷新页面后再试';

/** Whether a failed transaction looks like a dropped connection rather than a full disk or a bad value. */
export function connectionLost(error) {
  if (!error) return false;
  if (['InvalidStateError', 'UnknownError', 'TransactionInactiveError'].includes(error.name)) return true;
  return /connection|closing|closed|server lost/i.test(String(error.message || ''));
}

/** What the browser really said, for whoever reads the report: a restart that does not help means it was not a lost connection after all. */
const rawError = error => error ? `${error.name || 'Error'}${error.message ? '：' + String(error.message).slice(0, 80) : ''}` : '';
export const lostError = cause => Object.assign(new Error(`${LOST_MESSAGE}。重启还这样的话，到「设置 → 自检」看是哪里出的问题${cause ? `（${rawError(cause)}）` : ''}`), {code: 'STORAGE_LOST', cause});
/** A moment before reconnecting: WebKit's storage process may be starting again. */
export const breath = () => new Promise(resolve => setTimeout(resolve, 150));

const STORES = {'st-tts-library-v1': '资料库（相册、收藏、备忘录）', 'st-tts-audio-v1': '语音缓存', 'st-iphonie-chats-v1': '聊天记录', 'st-iphonie-moments-v1': '朋友圈', 'st-iphonie-apps-v1': '论坛、查手机、账本', 'st-iphonie-memory-v1': '记忆', 'st-iphonie-sounds-v1': '音效', 'st-iphonie-music-v1': '音乐和写的歌'};
const within = (work, ms = 4000) => Promise.race([work, new Promise((_, reject) => setTimeout(() => reject(Object.assign(Error('一直没有回应'), {name: 'Timeout'})), ms))]);
const done = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
/** Opens a store as it is, or null when there is none. It is never made here: an empty one under that name would stay without its tables. */
function existing(factory, name) {
  return new Promise((resolve, reject) => {
    let none = false;
    const request = factory.open(name);
    request.onupgradeneeded = () => { none = true; request.transaction.abort(); };
    request.onerror = event => { event.preventDefault?.(); if (none) resolve(null); else reject(request.error); };
    request.onsuccess = () => resolve(request.result);
  });
}
/** Whether a row, and a row with a file in it, can be kept here at all, in a store made for it and then removed. */
async function canKeep(factory) {
  const name = 'st-iphonie-check-v1', opening = factory.open(name, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore('rows', {keyPath: 'id'});
  const db = await done(opening);
  try {
    const put = row => new Promise((resolve, reject) => { const tx = db.transaction('rows', 'readwrite'); tx.objectStore('rows').put(row); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    await put({id: 'text', text: 'x'});
    let file = '';
    try {
      await put({id: 'file', blob: new Blob(['x'], {type: 'text/plain'})});
      const row = await done(db.transaction('rows').objectStore('rows').get('file'));
      if (row?.blob?.size !== 1) file = '存进去的文件读回来不对';
    } catch (error) { file = rawError(error); }
    return {file};
  } finally { db.close(); factory.deleteDatabase(name); }
}
/** The self-check's look at local storage: {keep, file, stores: [{name, label, error}]}; only what is wrong has an error. Changes nothing of the player's. */
export async function probeStorage(factory = globalThis.indexedDB) {
  if (!factory?.open) return null;
  const out = {keep: '', file: '', stores: []};
  try { out.file = (await within(canKeep(factory))).file; } catch (error) { out.keep = rawError(error); }
  for (const [name, label] of Object.entries(STORES)) {
    let error = '';
    try {
      const db = await within(existing(factory, name));
      if (db) {
        try {
          const table = db.objectStoreNames[0];
          if (!table) error = '里面是空的，没有数据表';
          else await within(done(db.transaction(table).objectStore(table).count()));
        } finally { db.close(); }
      }
    } catch (failure) { error = rawError(failure); }
    out.stores.push({name, label, error});
  }
  return out;
}

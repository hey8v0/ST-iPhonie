/** The last drawing workspace belongs to this browser, like the local painting gallery. */
export function drawWorkspace(win, scope = 'default') {
  let database, savedAt = 0;
  const key = 'st-iphonie-draw-draft:' + scope;
  function open() {
    if (!win.indexedDB) return Promise.resolve(null);
    return database ??= new Promise((resolve, reject) => {
      const request = win.indexedDB.open('st-iphonie-draw-workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('draft');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function use(mode, operation) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('draft', mode);
      const request = operation(transaction.objectStore('draft'));
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  return {
    async read() {
      let latest = null;
      try { latest = JSON.parse(win.localStorage.getItem(key) || 'null'); } catch { /* storage may be disabled */ }
      const stored = await use('readonly', store => store.get(scope)).catch(() => null);
      savedAt = Math.max(latest?.savedAt || 0, stored?.savedAt || 0);
      return latest && (latest.savedAt > (stored?.savedAt || 0)) ? {...latest, refs: stored?.refs} : stored;
    },
    write({refs, ...draft}) {
      savedAt = Math.max(Date.now(), savedAt + 1);
      const latest = {...draft, savedAt};
      // Write text and album IDs synchronously so reloading during an IndexedDB write also keeps the latest draft.
      try { win.localStorage.setItem(key, JSON.stringify(latest)); } catch { /* the full draft still goes to IndexedDB */ }
      return use('readwrite', store => store.put({...latest, refs}, scope));
    },
    close: () => database?.then(db => db?.close(), () => {})
  };
}

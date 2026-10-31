// 画画的作品, kept in this browser (IndexedDB 'st-iphonie-paint'): a list (name, size, when, a small picture) and,
// apart, each work's layers as PNG pictures — so the list opens quickly however big the works are. The phone (ui/paint.js)
// draws in it; the backend reads it for backups and 保存到酒馆. win: anything with indexedDB.

const DB = 'st-iphonie-paint';
export function paintStore(win) {
  let opening = null;
  const open = () => opening ||= new Promise((resolve, reject) => {
    const req = win.indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('works', {keyPath: 'id'}); db.createObjectStore('layers', {keyPath: 'id'}); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error || Error('打不开画画的存储')); };
  });
  const tx = async (names, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(names, mode), out = {value: undefined};
      t.oncomplete = () => resolve(out.value);
      t.onerror = t.onabort = () => reject(t.error || Error('画画的存储出错了'));
      fn(t, out);
    });
  };
  return {
    /** The works, newest first: {id, name, width, height, updatedAt, thumb (Blob)}. */
    list: () => tx(['works'], 'readonly', (t, out) => { const r = t.objectStore('works').getAll(); r.onsuccess = () => { out.value = r.result.sort((a, b) => b.updatedAt - a.updatedAt); }; }),
    /** A work with its layers ({id, name, opacity, visible, blob}), or null. */
    get: id => tx(['works', 'layers'], 'readonly', (t, out) => {
      const w = t.objectStore('works').get(id), l = t.objectStore('layers').get(id);
      l.onsuccess = () => { out.value = w.result ? {...w.result, layers: l.result?.layers || []} : null; };
    }),
    /** Every work with its layers. */
    all: () => tx(['works', 'layers'], 'readonly', (t, out) => {
      const w = t.objectStore('works').getAll(), l = t.objectStore('layers').getAll();
      l.onsuccess = () => { const layers = new Map(l.result.map(row => [row.id, row.layers])); out.value = w.result.map(work => ({...work, layers: layers.get(work.id) || []})); };
    }),
    /**
     * Puts works back: those with layers whole, the others (the entry only) over what is there. replace: the others go.
     * merge(current entries): makes the list inside the transaction, for 保存到酒馆. skip(entry): an entry left out of all this.
     */
    importWorks: (rows, {replace = false, merge, skip = () => false} = {}) => tx(['works', 'layers'], 'readwrite', (t, out) => {
      const works = t.objectStore('works'), layers = t.objectStore('layers'), read = works.getAll();
      read.onsuccess = () => {
        const current = read.result.filter(entry => !skip(entry)), whole = new Map(rows.filter(row => Array.isArray(row.layers)).map(row => [row.id, row]));
        const list = merge ? merge(current) : replace ? rows : [...current.filter(entry => !rows.some(row => row.id === entry.id)), ...rows];
        const kept = new Set(list.map(row => row.id));
        if (merge || replace) for (const entry of current) if (!kept.has(entry.id)) { works.delete(entry.id); layers.delete(entry.id); }
        for (const row of list) {
          const {layers: own, blob, ...entry} = whole.get(row.id) ? {...row, ...whole.get(row.id)} : row;
          works.put(entry);
          if (own) layers.put({id: row.id, layers: own});
        }
        out.value = list.length;
      };
    }),
    /** Keeps a work: its entry and its layers. */
    put: work => tx(['works', 'layers'], 'readwrite', t => {
      const {layers, ...fields} = work, entry = {...fields, bytes: layers.reduce((n, layer) => n + (layer.blob?.size || 0), 0)};
      t.objectStore('works').put(entry);
      t.objectStore('layers').put({id: work.id, layers});
    }),
    rename: (id, name) => tx(['works'], 'readwrite', t => { const s = t.objectStore('works'), r = s.get(id); r.onsuccess = () => { if (r.result) s.put({...r.result, name}); }; }),
    remove: id => tx(['works', 'layers'], 'readwrite', t => { t.objectStore('works').delete(id); t.objectStore('layers').delete(id); }),
    close: async () => { if (opening) (await opening.catch(() => null))?.close(); opening = null; },
  };
}

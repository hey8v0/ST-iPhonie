// The saves, in this browser's IndexedDB: the list of worlds (with the player, the time and the inventory) and the
// columns the player changed (blocks only; light is worked out again). Also the textures imported from the player's
// own game files, which stay on this device. Used by both the page and the worker.
import {BLOCKS, MINY, SECTIONS} from './blocks.js';

const NAME = 'st-iphonie-blocks', VERSION = 1;
let opening = null;
export function openDB() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', {keyPath: 'id'});
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      if (!db.objectStoreNames.contains('pack')) db.createObjectStore('pack');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error || Error('存档打不开')); };
    req.onblocked = () => reject(Error('存档被另一个页面占着，关掉其他打开的游戏再试'));
  });
  return opening;
}
const done = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
export async function tx(store, mode, fn) {
  const db = await openDB(), t = db.transaction(store, mode), s = t.objectStore(store);
  const out = await fn(s);
  await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || Error('存档没存上')); });
  return out;
}
export const getOne = (store, k) => tx(store, 'readonly', s => done(s.get(k)));
export const putOne = (store, v, k) => tx(store, 'readwrite', s => done(k === undefined ? s.put(v) : s.put(v, k)));
export const delOne = (store, k) => tx(store, 'readwrite', s => done(s.delete(k)));
export const getAll = store => tx(store, 'readonly', s => done(s.getAll()));

// ---------- worlds ----------
export const listWorlds = async () => (await getAll('worlds')).sort((a, b) => (b.played || 0) - (a.played || 0));
export const saveWorld = w => putOne('worlds', w);
export async function deleteWorld(id) {
  await delOne('worlds', id);
  await tx('chunks', 'readwrite', s => done(s.delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`))));
}

// ---------- columns ----------
/**
 * A column as kept: the names of the blocks in it and each section as indexes into them (meta kept), in runs —
 * [index, how many, …] — so mostly-stone sections take a few hundred numbers instead of 4096 (v 2; v 1 kept them
 * whole). A pre-generated column (made ahead, unchanged) says so: its animals come when it is first loaded.
 */
export function packColumn(c) {
  const names = [], index = new Map(), secs = [];
  for (let si = 0; si < SECTIONS; si++) {
    const s = c.sections[si];
    if (!s || !s.some(v => v)) continue;
    const runs = [];
    let last = -1, n = 0;
    for (let i = 0; i < 4096; i++) {
      const v = s[i], id = v & 0xFFF;
      let k = index.get(id);
      if (k === undefined) { k = names.length; names.push(BLOCKS[id].name); index.set(id, k); }
      const p = k | (v & 0xF000);
      if (p === last && n < 65535) n++;
      else { if (n) runs.push(last, n); last = p; n = 1; }
    }
    runs.push(last, n);
    secs.push([si, Uint16Array.from(runs)]);
  }
  return {v: 2, names, secs, biome: c.biome, height: c.height, ...(c.pregen ? {pregen: 1} : {})};
}
export function unpackColumn(cx, cz, data, byName) {
  const sections = new Array(SECTIONS).fill(null), ids = data.names.map(n => byName[n]?.id ?? 0);
  for (const [si, packed] of data.secs) {
    const s = new Uint16Array(4096);
    if (data.v === 2) { let i = 0; for (let r = 0; r < packed.length; r += 2) { const v = packed[r], b = ids[v & 0xFFF] | (v & 0xF000); s.fill(b, i, i + packed[r + 1]); i += packed[r + 1]; } }
    else for (let i = 0; i < 4096; i++) { const v = packed[i]; s[i] = ids[v & 0xFFF] | (v & 0xF000); }
    sections[si] = s;
  }
  return {cx, cz, sections, biome: new Uint8Array(data.biome), height: new Int16Array(data.height), changed: false, pregen: !!data.pregen};
}
/** The worker's view of one world's saved columns. */
export async function openStore(worldId, byName) {
  const keys = await tx('chunks', 'readonly', s => done(s.getAllKeys(IDBKeyRange.bound(`${worldId}:`, `${worldId}:￿`))));
  const saved = new Set(keys.map(k => k.slice(worldId.length + 1)));
  return {
    has: (cx, cz) => saved.has(`${cx},${cz}`),
    async load(cx, cz) { const d = await getOne('chunks', `${worldId}:${cx},${cz}`); return d ? unpackColumn(cx, cz, d, byName) : null; },
    async save(c) { await putOne('chunks', packColumn(c), `${worldId}:${c.cx},${c.cz}`); saved.add(`${c.cx},${c.cz}`); c.changed = false; },
    count: () => saved.size,
  };
}
export {MINY};

// How much the phone may keep in this browser. Not a fixed number: the browser says how much it gives this site
// (navigator.storage.estimate), and the phone uses a share of that, so a computer with room keeps much more than a
// small phone, and nothing is promised that the browser would refuse halfway through a save.
const MB = 1024 * 1024;
/** The least and the most of each part: 本地资料 (album, 语音收藏, 参考音频, Vibe, notes) and the voice cache. */
export const STORAGE_BUDGET = Object.freeze({library: {share: .5, min: 256 * MB, max: 4096 * MB}, voice: {share: .2, min: 200 * MB, max: 2048 * MB}});

const clamp = (value, {min, max}) => Math.round(Math.min(max, Math.max(min, value)));
/** {quota, library, voice}: what the browser gives this site (0 when unknown) and the bytes each part may use. */
export function budgetFor(quota) {
  const q = Number.isFinite(quota) && quota > 0 ? quota : 0;
  return {quota: q, library: clamp(q * STORAGE_BUDGET.library.share, STORAGE_BUDGET.library), voice: clamp(q * STORAGE_BUDGET.voice.share, STORAGE_BUDGET.voice)};
}

/**
 * The budget of this browser, read again at most every half minute. keep(): asks the browser once to keep the
 * phone's data when space runs short (persistent storage); called when something is saved, so a browser that asks
 * the user (Firefox) does it when it makes sense.
 */
export function createStorageBudget(storage = globalThis.navigator?.storage, now = Date.now) {
  let last = null, at = 0, asked = false;
  async function read() {
    if (last && now() - at < 30000) return last;
    let quota = 0, persisted = false;
    try { quota = (await storage?.estimate?.())?.quota || 0; } catch {}
    try { persisted = !!(await storage?.persisted?.()); } catch {}
    last = {...budgetFor(quota), persisted}; at = now();
    return last;
  }
  return {
    read,
    library: async () => (await read()).library,
    voice: async () => (await read()).voice,
    keep() {
      if (asked || typeof storage?.persist !== 'function') return;
      asked = true;
      storage.persisted?.().then(on => on || storage.persist()).then(() => { at = 0; }, () => {});
    },
  };
}

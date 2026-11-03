// Older Android WebViews (TauriTavern, in-app browsers) lack some newer APIs the plugin uses.
// Imported first by index.js and ui/phone.js: the phone runs in its own iframe, which the host's polyfills do not reach.
export function installCompat(g = globalThis) {
  const define = (target, key, value) => { if (target && typeof target[key] !== 'function') Object.defineProperty(target, key, { value, configurable: true, writable: true }); };
  const at = function (index) { const n = Math.trunc(index) || 0, i = n < 0 ? this.length + n : n; return i < 0 || i >= this.length ? undefined : this[i]; };
  define(g.Array?.prototype, 'at', at);
  define(g.String?.prototype, 'at', function (index) { return at.call(String(this), index); });
  define(g.Array?.prototype, 'findLast', function (fn, self) { for (let i = this.length - 1; i >= 0; i--) if (fn.call(self, this[i], i, this)) return this[i]; });
  define(g.Array?.prototype, 'findLastIndex', function (fn, self) { for (let i = this.length - 1; i >= 0; i--) if (fn.call(self, this[i], i, this)) return i; return -1; });
  define(g.Object, 'hasOwn', (object, key) => Object.prototype.hasOwnProperty.call(Object(object), key));
  const Signal = g.AbortSignal, Controller = g.AbortController;
  if (Signal && Controller) {
    define(Signal, 'timeout', ms => { const c = new Controller(); setTimeout(() => c.abort(new DOMException('signal timed out', 'TimeoutError')), ms); return c.signal; });
    define(Signal, 'any', signals => {
      const c = new Controller(), done = c.signal;
      for (const s of signals) if (s.aborted) { c.abort(s.reason); return done; }
      for (const s of signals) s.addEventListener('abort', () => c.abort(s.reason), { once: true, signal: done });
      return done;
    });
  }
  // iOS before 14.5 only has the prefixed name.
  if (!g.AudioContext && g.webkitAudioContext) g.AudioContext = g.webkitAudioContext;
  if (g.crypto?.getRandomValues) define(g.crypto, 'randomUUID', () => {
    const b = g.crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  });
  // Plugin data is plain JSON-like values plus Dates, Maps, Sets, binary data and Blobs (immutable, so shared).
  const clone = (value, seen) => {
    if (value === null || typeof value !== 'object') { if (typeof value === 'function' || typeof value === 'symbol') throw new DOMException('value could not be cloned', 'DataCloneError'); return value; }
    if (seen.has(value)) return seen.get(value);
    if (g.Blob && value instanceof g.Blob) return value;
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return new value.constructor(value.buffer.slice(0), value.byteOffset, value.byteLength / (value.BYTES_PER_ELEMENT || 1));
    let copy;
    if (value instanceof Map) { copy = new Map(); seen.set(value, copy); for (const [k, v] of value) copy.set(clone(k, seen), clone(v, seen)); return copy; }
    if (value instanceof Set) { copy = new Set(); seen.set(value, copy); for (const v of value) copy.add(clone(v, seen)); return copy; }
    copy = Array.isArray(value) ? [] : {}; seen.set(value, copy);
    for (const key of Object.keys(value)) copy[key] = clone(value[key], seen);
    return copy;
  };
  define(g, 'structuredClone', value => clone(value, new Map()));
}
installCompat();

/**
 * The bytes of a Blob as one of this window: a file picked in the phone is the frame's (instanceof Blob says no to it).
 * Throws when value is no Blob. The end is given as a number: Chromium before 141 (still the core of many browsers and
 * Android WebViews) took a passed undefined as 0, and every song, sound and model came out an empty file.
 */
export function ownBlob(value, type = value?.type || '') {
  const native = Blob.prototype;
  return native.slice.call(value, 0, Object.getOwnPropertyDescriptor(native, 'size').get.call(value), type);
}

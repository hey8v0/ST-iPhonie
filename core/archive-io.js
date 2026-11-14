// Archive bytes stay in this realm. Some WebViews/polyfills accept ArrayBuffer only.
const byteView = value => ArrayBuffer.isView(value)
  ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  : new Uint8Array(value);
export async function archiveBuffer(value) {
  let bytes;
  if (typeof value?.arrayBuffer === 'function') bytes = await value.arrayBuffer();
  else if (ArrayBuffer.isView(value) || Object.prototype.toString.call(value) === '[object ArrayBuffer]') bytes = value;
  else if (typeof FileReader === 'function') bytes = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || Error('文件读取失败')); reader.readAsArrayBuffer(value);
  });
  else throw Error('浏览器无法读取这个文件，请重新选择原文件');
  return byteView(bytes).slice().buffer;
}
const tooLarge = () => Object.assign(Error('压缩包里的文件比它说的大'), {archiveLimit: true});
const incomplete = () => Error('压缩包里的文件长度不完整，可能已损坏');
const badNative = new Set();
let fallback;
/** Each ZIP member is opened independently, and output is bounded before it is retained. */
export async function inflateEntry(blob, most = Infinity, exact = false, checksum) {
  const makeSink = () => {
    const parts = []; let total = 0, sum = 0;
    return {
      push(value) { const bytes = byteView(value); total += bytes.byteLength; if (total > most) throw tooLarge(); if (bytes.byteLength) { if (checksum !== undefined) sum = crc32(bytes, sum); parts.push(bytes.slice()); } },
      finish() { if (exact && total !== most) throw incomplete(); if (checksum !== undefined && sum !== checksum) throw Error('文件校验失败，可能已损坏'); return new Blob(parts); }
    };
  };
  const Native = globalThis.DecompressionStream;
  if (typeof Native === 'function' && !badNative.has(Native) && typeof blob.stream === 'function') {
    let reader;
    try {
      const decoder = new Native('deflate-raw');
      const normalized = blob.stream().pipeThrough(new TransformStream({transform(value, out) {out.enqueue(byteView(value).slice().buffer);}}));
      reader = normalized.pipeThrough(decoder).getReader();
      const sink = makeSink();
      for (;;) { const {done, value} = await reader.read(); if (done) break; sink.push(value); }
      return sink.finish();
    } catch (error) {
      try { await reader?.cancel(); } catch {}
      if (error.archiveLimit) throw error;
      if (/ArrayBuffer|not supported|unsupported|invalid format/i.test(error.message || '')) badNative.add(Native);
      // Malformed data must fail the independent decoder too; it is never treated as an empty member.
    } finally { try { reader?.releaseLock(); } catch {} }
  }
  fallback ||= import('../vendor/fflate.js').catch(error => {fallback = null; throw error;});
  const {Inflate} = await fallback, sink = makeSink(), inflater = new Inflate(bytes => sink.push(bytes));
  for (let at = 0, chunks = 0; at < blob.size; at += 4096) {
    const end = Math.min(blob.size, at + 4096);
    inflater.push(new Uint8Array(await archiveBuffer(blob.slice(at, end))), end === blob.size);
    if (++chunks % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!blob.size) inflater.push(new Uint8Array(), true);
  return sink.finish();
}

let CRC = null;
export function crc32(b, previous = 0) {
  CRC ??= Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
  let c = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ c >>> 8;
  return (c ^ 0xffffffff) >>> 0;
}

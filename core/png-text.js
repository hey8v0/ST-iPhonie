// The text chunks of a PNG: read (what NovelAI drew a picture with, a vibe kept inside a picture) and written (a vibe put
// into a picture). Everything else in the file stays byte for byte.
import {crc32} from './model-files.js';

const isPng = bytes => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
const inflate = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

/** The text chunks of a PNG ({keyword: text}); {} when it is not a PNG. */
export async function pngText(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = {};
  if (!isPng(bytes)) return out;
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const zero = data.indexOf(0), key = new TextDecoder('latin1').decode(data.subarray(0, zero));
      let text = data.subarray(zero + 1), wide = false;
      if (type === 'iTXt') {
        const compressed = text[0], rest = text.subarray(2), lang = rest.indexOf(0), trans = rest.indexOf(0, lang + 1);
        text = rest.subarray(trans + 1); wide = true;
        if (compressed && typeof DecompressionStream === 'function') text = await inflate(text);
      } else if (type === 'zTXt') {
        text = typeof DecompressionStream === 'function' ? await inflate(text.subarray(1)) : new Uint8Array(0);
      }
      out[key] = new TextDecoder(wide ? 'utf-8' : 'latin1').decode(text);
      if (!wide) try { out[key] = new TextDecoder('utf-8', {fatal: true}).decode(text); } catch { /* latin1 it is */ }
    }
    if (type === 'IEND') break;
    at += 12 + length;
  }
  return out;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The PNG with a tEXt chunk added before its end (one of that keyword already there is replaced). The text is plain ASCII. */
export function addPngText(buffer, keyword, text) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!isPng(bytes)) throw Error('只能写进 PNG 图片');
  const value = String(text), data = new Uint8Array(keyword.length + 1 + value.length), mark = new TextEncoder().encode(keyword + '\0');
  for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i);
  for (let i = 0; i < value.length; i++) data[keyword.length + 1 + i] = value.charCodeAt(i);
  const parts = [bytes.subarray(0, 8)];
  let ended = false;
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), end = at + 12 + length;
    if (type === 'IEND') { parts.push(chunk('tEXt', data), bytes.subarray(at, end)); ended = true; break; }
    const body = bytes.subarray(at + 8, at + 8 + mark.length);
    const same = (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') && mark.every((b, i) => body[i] === b);
    if (!same) parts.push(bytes.subarray(at, end));
    at = end;
  }
  if (!ended) throw Error('这张 PNG 不完整');
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

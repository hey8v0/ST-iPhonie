// 导入笔刷: brushes from other drawing apps, as tips for our brush engine.
// - Procreate .brushset / .brush: a zip; each brush a folder with Shape.png (white is paint) and Brush.archive (a
//   binary plist, NSKeyedArchiver) with its name and settings, of which the ones we have are taken over.
// - Photoshop .abr (version 6 and later, and the old 1 and 2): the sampled tips (grey images, packbits-compressed).
// - A picture: its transparency, or its darkness (black is paint).
// Nothing is sent anywhere; the files are read here.
import {cleanBrush} from './brushes.js';

const MAX_BRUSHES = 80, TIP = 160;

// ---------- zip ----------
/** The files of a zip: Map(name → () => Promise<Uint8Array>). Stored and deflated entries. */
export function unzip(bytes, win = globalThis) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('不是 zip 文件');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map(), utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), nameLen = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extra + comment;
    if (name.endsWith('/')) continue;
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8) throw Error('zip 里有不认识的压缩方式');
      if (!win.DecompressionStream) throw Error('这个浏览器解不开压缩包，换个新一点的浏览器试试');
      const stream = new win.Blob([data]).stream().pipeThrough(new win.DecompressionStream('deflate-raw'));
      return new Uint8Array(await new win.Response(stream).arrayBuffer());
    });
  }
  return files;
}

// ---------- binary plist ----------
/** A binary plist (bplist00) as JS values; UIDs as {uid: n}. */
export function parseBplist(bytes) {
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== 'bplist00') throw Error('不是 plist');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), t = bytes.length - 32;
  const offSize = bytes[t + 6], refSize = bytes[t + 7], count = Number(view.getBigUint64(t + 8)), top = Number(view.getBigUint64(t + 16)), table = Number(view.getBigUint64(t + 24));
  const int = (at, size) => { let n = 0; for (let i = 0; i < size; i++) n = n * 256 + bytes[at + i]; return n; };
  const offsets = Array.from({length: count}, (_, i) => int(table + i * offSize, offSize));
  const cache = new Map();
  function length(at, low) { if (low !== 15) return [low, at + 1]; const marker = bytes[at + 1], size = 1 << (marker & 15); return [int(at + 2, size), at + 2 + size]; }
  function read(i, depth = 0) {
    if (cache.has(i)) return cache.get(i);
    if (depth > 200) throw Error('plist 太深了');
    const at = offsets[i], marker = bytes[at], high = marker >> 4, low = marker & 15;
    let value;
    if (marker === 0x08) value = false; else if (marker === 0x09) value = true; else if (marker === 0) value = null;
    else if (high === 1) { const size = 1 << low; value = size === 8 ? Number(view.getBigInt64(at + 1)) : int(at + 1, size); }
    else if (high === 2) value = low === 2 ? view.getFloat32(at + 1) : view.getFloat64(at + 1);
    else if (high === 3) value = new Date((978307200 + view.getFloat64(at + 1)) * 1000);
    else if (high === 4) { const [n, s] = length(at, low); value = bytes.subarray(s, s + n); }
    else if (high === 5) { const [n, s] = length(at, low); value = new TextDecoder('latin1').decode(bytes.subarray(s, s + n)); }
    else if (high === 6) { const [n, s] = length(at, low); let str = ''; for (let k = 0; k < n; k++) str += String.fromCharCode(view.getUint16(s + k * 2)); value = str; }
    else if (high === 8) value = {uid: int(at + 1, low + 1)};
    else if (high === 10) { const [n, s] = length(at, low); value = []; cache.set(i, value); for (let k = 0; k < n; k++) value.push(read(int(s + k * refSize, refSize), depth + 1)); }
    else if (high === 13) { const [n, s] = length(at, low); value = {}; cache.set(i, value); for (let k = 0; k < n; k++) value[read(int(s + k * refSize, refSize), depth + 1)] = read(int(s + (n + k) * refSize, refSize), depth + 1); }
    else value = null;
    cache.set(i, value);
    return value;
  }
  return read(top);
}
/** The root object of an NSKeyedArchiver plist, its UIDs followed one level (strings and numbers come out plain). */
export function unarchive(plist) {
  const objects = plist?.$objects, rootRef = plist?.$top?.root;
  if (!Array.isArray(objects) || !rootRef) return null;
  const deref = v => v && typeof v === 'object' && 'uid' in v ? objects[v.uid] : v;
  const root = deref(rootRef);
  if (!root || typeof root !== 'object') return null;
  return Object.fromEntries(Object.entries(root).map(([k, v]) => [k, deref(v)]));
}

// ---------- tips ----------
/** A mask (white with paint as alpha) from an image: by `rule` 'alpha', 'dark' (alpha where transparent, else black is paint), 'dark-only' (black is paint) or 'light' (white is paint). */
export function maskOf(doc, img, rule, size = TIP) {
  const s = Math.min(1, size / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = doc.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h), px = data.data;
  let clear = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { clear = true; break; }
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * .299 + px[i + 1] * .587 + px[i + 2] * .114) / 255;
    // A picture with transparency: its alpha (with how light it is, for white-is-paint pictures); else its greys.
    const a = rule === 'alpha' ? px[i + 3] / 255 : rule === 'light' ? lum * (clear ? px[i + 3] / 255 : 1) : clear && rule !== 'dark-only' ? px[i + 3] / 255 : 1 - lum;
    px[i + 3] = Math.round(a * 255); px[i] = px[i + 1] = px[i + 2] = 255;
  }
  g.putImageData(data, 0, 0);
  return c.toDataURL('image/png');
}
/** A grey image (paint = 255) as a mask's data URL, scaled down to fit. */
function maskOfGrey(doc, grey, w, h) {
  const c = doc.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), data = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255; data.data[i * 4 + 3] = grey[i]; }
  g.putImageData(data, 0, 0);
  return maskOf(doc, c, 'alpha');
}
// A tip that is all empty (or all full) is no tip.
function blank(doc, url) { return !url || url.length < 200; }

// ---------- Procreate ----------
const num = (v, min, max) => Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
/** The brush settings Procreate's Brush.archive has that ours share (when they are there). */
export function procreateSettings(o) {
  if (!o) return {};
  const out = {};
  if (typeof o.name === 'string' && o.name.trim()) out.name = o.name.trim().slice(0, 30);
  const spacing = num(o.plotSpacing, .01, 1); if (spacing !== undefined) out.spacing = Math.max(.02, spacing);
  const jitter = num(o.plotJitter, 0, 1); if (jitter !== undefined) out.jitter = jitter;
  const ps = num(o.dynamicsPressureSize, 0, 1); if (ps !== undefined) out.pressureSize = ps;
  const po = num(o.dynamicsPressureOpacity, 0, 1); if (po !== undefined) out.pressureOpacity = po;
  const flow = num(o.paintOpacity, .01, 1); if (flow !== undefined) out.flow = flow;
  const smooth = num(o.plotSmoothing, 0, 1); if (smooth !== undefined) out.streamline = smooth;
  const size = num(o.maxSize, 0, 1); if (size !== undefined) out.size = Math.max(4, Math.round(size * 120));
  if (o.shapeInverted === true) out.inverted = true;
  return out;
}
async function procreate(doc, win, bytes, fileName) {
  const files = unzip(bytes, win), folders = new Map();
  for (const name of files.keys()) {
    const m = name.match(/^(.*?)(?:^|\/)(Shape\.png|Brush\.archive)$/i);
    if (!m) continue;
    const key = m[1] || '.';
    folders.set(key, {...folders.get(key), [m[2].toLowerCase()]: files.get(name)});
  }
  const out = [];
  for (const [folder, parts] of folders) {
    if (out.length >= MAX_BRUSHES) break;
    if (!parts['shape.png']) continue;
    let settings = {};
    try { if (parts['brush.archive']) settings = procreateSettings(unarchive(parseBplist(await parts['brush.archive']()))); } catch { /* the tip alone */ }
    const img = await win.createImageBitmap(new win.Blob([await parts['shape.png']()], {type: 'image/png'}));
    // Procreate's shapes: white is paint (inverted ones the other way).
    const tip = maskOf(doc, img, settings.inverted ? 'dark-only' : 'light');
    if (blank(doc, tip)) continue;
    out.push({name: settings.name || (folder === '.' ? fileName : folder.split('/').pop()).slice(0, 30), ...settings, tip});
  }
  return out;
}

// ---------- Photoshop ----------
/** Packbits rows (each with its length first, as Photoshop keeps them) to w×h bytes. */
function unpackRows(bytes, at, w, h, depth) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), lengths = [], step = depth >> 3, out = new Uint8Array(w * h * step);
  for (let r = 0; r < h; r++) lengths.push(view.getUint16(at + r * 2));
  let p = at + h * 2, o = 0;
  for (let r = 0; r < h; r++) {
    const stop = p + lengths[r];
    while (p < stop && o < out.length) {
      let n = bytes[p++];
      if (n > 127) { n = 257 - n; const v = bytes[p++]; for (let k = 0; k < n && o < out.length; k++) out[o++] = v; }
      else { n += 1; for (let k = 0; k < n && o < out.length; k++) out[o++] = bytes[p++]; }
    }
    p = stop;
  }
  return out;
}
/** One sampled tip: bounds, depth, compression, then the image. Returns {width, height, grey}. */
function abrImage(bytes, at, view) {
  const top = view.getInt32(at), left = view.getInt32(at + 4), bottom = view.getInt32(at + 8), right = view.getInt32(at + 12);
  const depth = view.getUint16(at + 16), packed = bytes[at + 18], w = right - left, h = bottom - top;
  if (!(w > 0 && h > 0 && w * h < 25e6) || ![8, 16].includes(depth)) return null;
  const start = at + 19, raw = packed ? unpackRows(bytes, start, w, h, depth) : bytes.subarray(start, start + w * h * (depth >> 3));
  const grey = depth === 16 ? Uint8Array.from({length: w * h}, (_, i) => raw[i * 2]) : raw;
  return {width: w, height: h, grey};
}
/** The tips of a Photoshop brush file: [{width, height, grey, name?}]. */
export function parseAbr(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), version = view.getUint16(0), out = [];
  if (version === 1 || version === 2) {
    const count = view.getUint16(2);
    let at = 4;
    for (let n = 0; n < count && at < bytes.length; n++) {
      const type = view.getUint16(at), size = view.getUint32(at + 2), next = at + 6 + size;
      if (type === 2) {
        let p = at + 6 + 4 + 2;
        let name = '';
        if (version === 2) { const len = view.getUint32(p); p += 4; for (let k = 0; k < len; k++) name += String.fromCharCode(view.getUint16(p + k * 2)); p += len * 2; name = name.replace(/\0+$/, ''); }
        p += 1 + 8; // antialias, short bounds
        const img = abrImage(bytes, p, view);
        if (img) out.push({...img, name});
      }
      at = next;
    }
    return out;
  }
  if (version < 6) throw Error('这个 abr 版本还不认识');
  const sub = view.getUint16(2), text = (a, n) => String.fromCharCode(...bytes.subarray(a, a + n));
  let at = 4;
  // Sections: '8BIM' + a key + a length; the tips are in 'samp'.
  while (at + 12 <= bytes.length) {
    if (text(at, 4) !== '8BIM') break;
    const key = text(at + 4, 4), size = view.getUint32(at + 8), body = at + 12, stop = body + size;
    if (key === 'samp') {
      let p = body;
      while (p + 4 < stop && out.length < MAX_BRUSHES) {
        const len = view.getUint32(p), next = p + 4 + Math.ceil(len / 4) * 4;
        // An id (37 bytes), then 10 more bytes in sub-version 1 or 264 in 2, then the image.
        const img = abrImage(bytes, p + 4 + (sub === 1 ? 47 : 301), view);
        if (img) out.push(img);
        p = next;
      }
    }
    at = stop;
  }
  return out;
}

/** Brushes from a file: Procreate, Photoshop or a picture. [cleaned brushes], a group named after the file. */
export async function importBrushFile(doc, win, file) {
  const base = file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '导入', ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const id = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const defaults = {group: base, size: 60, opacity: 1, flow: .8, spacing: .15, hardness: 1, pressureSize: .5, pressureOpacity: .3, streamline: .2, jitter: 0, source: file.name};
  if (ext === 'sut') throw Error('CSP 的 .sut 笔刷还读不了（它是个数据库文件，正在想办法）；可以先在 CSP 里把笔尖图片导出成 PNG，用「导入笔刷」导进来');
  if (ext === 'brushset' || ext === 'brush') {
    const found = await procreate(doc, win, new Uint8Array(await file.arrayBuffer()), base);
    if (!found.length) throw Error('这个文件里没找到笔尖图片');
    return found.map((b, i) => cleanBrush({...defaults, ...b, id: id() + i, name: b.name || `${base} ${i + 1}`}));
  }
  if (ext === 'abr') {
    const tips = parseAbr(new Uint8Array(await file.arrayBuffer()));
    const out = [];
    tips.forEach((t, i) => { const tip = maskOfGrey(doc, t.grey, t.width, t.height); if (!blank(doc, tip)) out.push(cleanBrush({...defaults, id: id() + i, name: (t.name || `${base} ${i + 1}`).slice(0, 30), tip})); });
    if (!out.length) throw Error('这个 abr 里没有能用的取样笔尖（只有参数、没有图片的笔刷读不出来）');
    return out;
  }
  if (/^image\//.test(file.type) || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    const img = await win.createImageBitmap(file);
    return [cleanBrush({...defaults, id: id(), name: base, group: '导入', tip: maskOf(doc, img, 'dark')})];
  }
  // A name without its ending (some phones hand files over so): a zip is a Procreate brush, else maybe a picture.
  if (!ext) {
    const head = new Uint8Array(await (file.slice ? file.slice(0, 4) : file).arrayBuffer()).subarray(0, 4);
    if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) return importBrushFile(doc, win, {name: base + '.brushset', type: file.type, arrayBuffer: () => file.arrayBuffer()});
    const img = await Promise.resolve(win.createImageBitmap?.(file)).catch(() => null);
    if (img) return [cleanBrush({...defaults, id: id(), name: base, group: '导入', tip: maskOf(doc, img, 'dark')})];
  }
  throw Error('这种文件还不认识：能导入 Procreate 的 .brushset / .brush、Photoshop 的 .abr，或者一张图片');
}

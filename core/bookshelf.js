// Local EPUB/TXT reading. Archive entries are opened on demand, never retained by the ZIP directory.
import {readZipBlob} from './model-files.js';
import {AppStore} from './app-store.js';

export const readerDefaults = {size: 19, line: 1.9, margin: 24, font: 'serif', theme: 'auto', mode: 'pages', rtl: false, annotations: true, effect: 'page'};
/** 翻页效果 (0.9.52): 仿真翻页 / 平滑滑动 / 无。 */
export const READ_EFFECTS = Object.freeze(['page', 'slide', 'none']);
export const effectOf = value => READ_EFFECTS.includes(value) ? value : 'page';
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function decodeBook(bytes) {
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('gbk').decode(bytes); }
}
export function txtChapters(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), chapters = [];
  let title = '正文', words = [];
  const flush = () => { if (words.length) chapters.push({title, text: words.join('\n')}); words = []; };
  let length = 0;
  for (const line of lines) {
    if (/^\s*(?:第[零〇一二三四五六七八九十百千万两\d]+[章卷回节部]|序章|序言|楔子|尾声|后记|chapter\s+\d+).{0,70}$/i.test(line)) { flush(); title = line.trim(); length = 0; }
    if (length > 16000) { flush(); length = 0; }
    if (line.length > 16000) {
      for (let at=0;at<line.length;at+=16000) { if(length)flush(); words.push(line.slice(at,at+16000)); length=16000; if(at+16000<line.length){flush();length=0;} }
    } else { words.push(line); length += line.length; }
  }
  flush(); return chapters.length ? chapters : [{title: '正文', text: ''}];
}
export function bookPath(base, href) {
  let raw; try { raw = decodeURIComponent(String(href || '').split('#')[0]); } catch { return ''; }
  if (!raw || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(raw)) return '';
  const parts = base.split('/').slice(0, -1);
  for (const bit of raw.split('/')) { if (bit === '..') { if (!parts.length) return ''; parts.pop(); } else if (bit && bit !== '.') parts.push(bit); }
  return parts.join('/');
}
const nodes = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
const xml = (text, Parser) => { const doc = new Parser().parseFromString(text, 'application/xml'); if (nodes(doc, 'parsererror').length) throw Error('电子书目录格式不完整'); return doc; };
const raster = path => /\.(?:png|jpe?g|gif|webp|avif)$/i.test(path);
export function sanitizeBook(html, path, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html');
  const images = [];
  const allowed = new Set(['p','div','span','h1','h2','h3','h4','h5','h6','em','strong','b','i','u','s','br','hr','blockquote','ul','ol','li','ruby','rt','rp','sub','sup']);
  const walk = node => {
    if (node.nodeType === 3) return escape(node.textContent);
    if (node.nodeType !== 1) return '';
    const tag = node.localName.toLowerCase();
    if (['script','style','iframe','object','embed','form','link','meta','audio','video'].includes(tag)) return '';
    if (tag === 'img' || tag === 'image') {
      const src = bookPath(path, node.getAttribute('src') || node.getAttribute('href') || node.getAttribute('xlink:href'));
      if (!raster(src)) return '';
      images.push(src); return `<img data-book-image="${escape(src)}" alt="插图">`;
    }
    const children = [...node.childNodes].map(walk).join('');
    return allowed.has(tag) ? `<${tag}>${children}${['br','hr'].includes(tag) ? '' : `</${tag}>`}` : children;
  };
  const clean = walk(doc.body), plain = new Parser().parseFromString(clean, 'text/html').body.textContent.trim();
  return {html: clean, text: plain, images};
}
export async function openBook(blob, name, Parser = globalThis.DOMParser) {
  if (/\.txt$/i.test(name)) {
    const chapters = txtChapters(decodeBook(await blob.arrayBuffer()));
    return {title: name.replace(/\.txt$/i, ''), author: '', type: 'novel', chapters: chapters.map(c => ({title: c.title})),
      chapter: async i => ({html: chapters[i].text.split('\n').map(t => `<p>${escape(t) || '<br>'}</p>`).join(''), text: chapters[i].text, images: []}), image: async () => null};
  }
  const files = await readZipBlob(blob, {cache: false});
  const read = async path => { const f = files.get(path); if (!f || f.size > 16 * 1024 * 1024) throw Error('电子书章节缺失或过大'); return (await f.blob()).text(); };
  const container = xml(await read('META-INF/container.xml'), Parser), opfPath = nodes(container, 'rootfile')[0]?.getAttribute('full-path');
  const opf = xml(await read(opfPath), Parser), manifest = new Map(nodes(opf, 'item').map(n => [n.getAttribute('id'), {path: bookPath(opfPath, n.getAttribute('href')), properties: n.getAttribute('properties') || '', mime: n.getAttribute('media-type')} ]));
  const chapters = nodes(opf, 'itemref').filter(n => n.getAttribute('linear') !== 'no').map(n => manifest.get(n.getAttribute('idref'))).filter(Boolean).map((n, i) => ({...n, title: `第 ${i + 1} 节`}));
  if (!chapters.length) throw Error('电子书没有可阅读的章节');
  let toc = [];
  const nav = [...manifest.values()].find(n => n.properties.split(/\s+/).includes('nav'));
  const ncx = [...manifest.values()].find(n => n.mime === 'application/x-dtbncx+xml');
  if (nav) {
    const doc = xml(await read(nav.path), Parser), section = nodes(doc, 'nav').find(n => /toc/.test(n.getAttribute('epub:type') || n.getAttribute('type') || '')) || doc;
    toc = nodes(section, 'a').map(n => ({title: n.textContent.trim(), path: bookPath(nav.path, n.getAttribute('href'))}));
  } else if (ncx) {
    toc = nodes(xml(await read(ncx.path), Parser), 'navPoint').map(n => ({title: nodes(n, 'text')[0]?.textContent.trim(), path: bookPath(ncx.path, nodes(n, 'content')[0]?.getAttribute('src'))}));
  }
  for (const c of chapters) c.title = toc.find(t => t.path === c.path)?.title || c.title;
  const chapter = async i => sanitizeBook(await read(chapters[i].path), chapters[i].path, Parser);
  const sample = await Promise.all(chapters.slice(0, 5).map((_, i) => chapter(i)));
  const fixed = nodes(opf, 'meta').some(n => n.getAttribute('property') === 'rendition:layout' && n.textContent.trim() === 'pre-paginated');
  const comic = fixed || sample.every(c => c.images.length > 0 && c.text.length < 100);
  const coverId = nodes(opf, 'meta').find(n => n.getAttribute('name') === 'cover')?.getAttribute('content');
  const cover = manifest.get(coverId)?.path || [...manifest.values()].find(n => n.properties.split(/\s+/).includes('cover-image'))?.path || (comic ? sample[0].images[0] : '');
  const image = async path => raster(path) && files.has(path) ? new Blob([await files.get(path).blob()], {type: /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : /\.gif$/i.test(path) ? 'image/gif' : /\.avif$/i.test(path) ? 'image/avif' : 'image/jpeg'}) : null;
  return {title: nodes(opf, 'title')[0]?.textContent.trim() || name.replace(/\.epub$/i, ''), author: nodes(opf, 'creator').map(n => n.textContent.trim()).join('、'), type: comic ? 'comic' : 'novel', chapters, cover, chapter, image};
}
export async function bookImports(files) {
  const out = [];
  for (const file of files) {
    if (/\.(epub|txt)$/i.test(file.name)) out.push({name: file.name, open: async () => file});
    else if (/\.zip$/i.test(file.name)) for (const [name, item] of await readZipBlob(file, {cache: false})) if (/\.(epub|txt)$/i.test(name)) out.push({name: name.split('/').pop(), open: item.blob});
  }
  return out;
}
/** Book titles in the order people number them (0.9.49): 第2卷 before 第10卷, Vol.9 before Vol.10. */
const NATURAL = typeof Intl !== 'undefined' ? new Intl.Collator('zh-Hans-CN', {numeric: true, sensitivity: 'base'}) : null;
export const naturalCompare = (a, b) => NATURAL ? NATURAL.compare(String(a), String(b)) : String(a).localeCompare(String(b));
/**
 * The series a book belongs to, from its name (0.9.49): 「黑执事 第3卷」「黑执事 Vol.03」「黑执事_03」 are all 「黑执事」.
 * '' when the name has no number at its end to take off.
 */
export function seriesOf(name) {
  const base = String(name || '').replace(/\.(epub|txt|zip)$/i, '').trim();
  const cut = base.replace(/[\s_\-—–·.]*[(（\[【]?\s*(?:第\s*[0-9０-９一二三四五六七八九十百零〇两]+\s*[卷册集话話部巻本期]|(?:vol(?:ume)?|v|#|no)\.?\s*[0-9０-９]+|[0-9０-９]+\s*[卷册集话話部巻]?)\s*[)）\]】]?\s*$/i, '').trim();
  return cut && cut !== base ? cut.replace(/[\s_\-—–·.]+$/, '') : '';
}
export function readingPosition(value = {}, chapters = 1) {
  return {chapter: Math.max(0, Math.min(chapters - 1, Math.trunc(Number(value.chapter) || 0))), fraction: Math.max(0, Math.min(1, Number(value.fraction) || 0))};
}
export function annotationDue(book, {now = Date.now(), random = Math.random()} = {}) {
  const day = new Date(now).toLocaleDateString('sv-SE');
  return book.settings?.annotations !== false && !!book.companion && (book.turns || 0) >= (book.nextNote || 6) && (book.daily?.day !== day || book.daily.count < 12) && random < .65;
}

// ---------- 阅读统计 (0.9.52) ----------
const DAY = 86400000;
/** A day as 「2026-11-09」 in this device's zone. */
export const dayKey = at => {
  const d = new Date(at), pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/**
 * What a book's reading time adds up to: sec (all time), days ({day: sec}, 120 kept), prog (progress added — what the
 * speed is worked out from). Kept apart from the reading position, which the user can clear without losing the stats.
 */
export function normalizeStats(value = {}) {
  const sec = Math.max(0, Math.round(Number(value?.sec) || 0)), prog = Math.max(0, Number(value?.prog) || 0), days = {};
  if (value?.days && typeof value.days === 'object') for (const [k, v] of Object.entries(value.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number(v) > 0) days[k] = Math.round(Number(v));
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete days[k];
  return {sec, prog: Math.min(1e6, prog), days};
}
/** The stats after `seconds` more reading and `progress` (0…1 of the book) further on. Negative numbers add nothing. */
export function addReadingTime(stats, seconds, {now = Date.now(), progress = 0} = {}) {
  const out = normalizeStats(stats), sec = Math.max(0, Math.round(Number(seconds) || 0));
  if (sec) { out.sec += sec; const day = dayKey(now); out.days[day] = (out.days[day] || 0) + sec; }
  if (progress > 0) out.prog = Math.min(1e6, out.prog + Math.min(1, progress));
  return normalizeStats(out);
}
export const todaySeconds = (stats, now = Date.now()) => normalizeStats(stats).days[dayKey(now)] || 0;
/** The last seven days, oldest first: [{day, sec}] — for the little bar chart. */
export function weekSeconds(stats, now = Date.now()) {
  const s = normalizeStats(stats), out = [];
  for (let i = 6; i >= 0; i--) { const key = dayKey(now - i * DAY); out.push({day: key, sec: s.days[key] || 0}); }
  return out;
}
/** How much longer this book takes at the speed so far (seconds), or null when it is too early to tell or finished. */
export function readingLeft(book, stats) {
  const s = normalizeStats(stats), chapters = Math.max(1, book?.chapters?.length || 1);
  const done = Math.min(1, Math.max(0, ((Number(book?.position?.chapter) || 0) + (Number(book?.position?.fraction) || 0)) / chapters));
  if (s.sec < 20 || s.prog <= 0.0005 || done >= .999) return null;
  const left = (1 - done) / (s.prog / s.sec);
  return Number.isFinite(left) && left > 0 ? Math.round(Math.min(left, 1e7)) : null;
}
/** 「1 小时 20 分」／「18 分钟」／「不到 1 分钟」. */
export function span(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (!s) return '';
  if (s < 60) return '不到 1 分钟';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`;
}

// ---------- 书摘和批注 (0.9.52) ----------
export const HIGHLIGHT_MAX = 500, ANNOTATION_MAX = 500;
const cleanText = (value, most) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, most);
/**
 * A 书摘: {id, chapter, para, text, at}. The paragraph is the nth block of the chapter (`data-para`), so it stays on
 * the right lines when the page is laid out again; the first words are kept to find it again if the book changed.
 */
export function normalizeHighlights(list) {
  const out = [], seen = new Set();
  for (const h of Array.isArray(list) ? list : []) {
    const text = cleanText(h?.text, 600), chapter = Math.trunc(Number(h?.chapter)), para = Math.trunc(Number(h?.para));
    if (!text || !Number.isFinite(chapter) || !Number.isFinite(para) || chapter < 0 || para < 0) continue;
    const key = `${chapter}:${para}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({id: String(h?.id || `h:${chapter}:${para}`), chapter, para, text, at: Number(h?.at) || Date.now()});
  }
  return out.slice(-HIGHLIGHT_MAX);
}
/** Adds a 书摘, or takes it off again when that paragraph is already picked — what the long-press menu does. */
export function toggleHighlight(list, {chapter, para, text, at = Date.now()}) {
  const rows = normalizeHighlights(list), body = cleanText(text, 600);
  const at0 = rows.findIndex(h => h.chapter === Number(chapter) && h.para === Number(para));
  if (at0 >= 0) { const copy = rows.slice(); copy.splice(at0, 1); return copy; }
  if (!body) return rows;
  return normalizeHighlights([...rows, {chapter, para, text: body, at}]);
}
export const highlighted = (list, chapter, para) => normalizeHighlights(list).some(h => h.chapter === Number(chapter) && h.para === Number(para));

/** A note in the page: {id, chapter, para, text, who, at}. `para` is where it is tucked in (after that paragraph). */
export function normalizeAnnotations(list) {
  const out = [];
  for (const n of Array.isArray(list) ? list : []) {
    const text = cleanText(n?.text, 200), chapter = Math.trunc(Number(n?.chapter));
    if (!text || !Number.isFinite(chapter) || chapter < 0) continue;
    const para = Math.max(0, Math.trunc(Number(n?.para)) || 0);
    out.push({id: String(n?.id || crypto.randomUUID()), chapter, para, text, who: cleanText(n?.who, 40), at: Number(n?.at) || Date.now()});
  }
  return out.slice(-ANNOTATION_MAX);
}
export class BookshelfStore {
  constructor(scope, options = {}) {
    this.meta = new AppStore(scope, {...options, database: 'st-iphonie-bookshelf-v1'});
    this.files = new AppStore(scope, {...options, database: 'st-iphonie-bookshelf-files-v1'});
  }
  list() { return this.meta.list('reading'); }
  get(id) { return this.meta.get(id); }
  async blob(id) { return (await this.files.get(id))?.blob || null; }
  async add(data, blob, cover) {
    const id = 'reading:' + crypto.randomUUID(), at = Date.now();
    await this.files.put([{id, kind: 'reading-file', at, blob, cover}]);
    const row = {...data, id, kind: 'reading', at, size: blob.size, position: readingPosition(), settings: {...readerDefaults}, bookmarks: [], annotations: [], turns: 0};
    try { await this.meta.put([row]); } catch (e) { await this.files.remove(id); throw e; }
    return row;
  }
  async update(id, patch) {
    return this.meta.change(id, row => {
      for (const key of ['companion','settings','bookmarks','annotations','turns','nextNote','daily','shelf','lastRead','chapters','stats','highlights']) if (key in patch) row[key] = structuredClone(patch[key]);
      if (patch.position) row.position = readingPosition(patch.position, row.chapters.length);
      if ('stats' in patch) row.stats = normalizeStats(row.stats);
      if ('highlights' in patch) row.highlights = normalizeHighlights(row.highlights);
      if ('annotations' in patch) row.annotations = normalizeAnnotations(row.annotations);
    });
  }
  /** 多选 (0.9.52): the same change on several books at once (a category, say). */
  async updateMany(ids, patch) {
    const out = [];
    for (const id of ids || []) out.push(await this.update(String(id), patch).catch(error => ({error})));
    return out.filter(x => x && !x.error);
  }
  async remove(id) { await this.meta.remove(id); await this.files.remove(id); }
  /** 多选删除: the books and their files go; one failing does not stop the rest. */
  async removeMany(ids) {
    let gone = 0;
    for (const id of ids || []) { try { await this.remove(String(id)); gone++; } catch { /* keep going */ } }
    return gone;
  }
  close() { this.meta.close(); this.files.close(); }
}

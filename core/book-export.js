// 绘本导出: a book as a PDF (each page drawn as a picture, so the Chinese type and the look come out the same anywhere)
// and as an EPUB 3 (words as words, pictures with them, for e-readers). Built here, byte by byte; no libraries.
import {writeZip} from './model-files.js';

const enc = new TextEncoder();
const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
/** Text for a PDF string: UTF-16 with its mark, as hex (titles in Chinese). */
const pdfText = s => '<FEFF' + [...String(s ?? '')].map(ch => { const c = ch.codePointAt(0); if (c < 0x10000) return c.toString(16).padStart(4, '0'); const v = c - 0x10000; return ((v >> 10) + 0xd800).toString(16) + ((v & 0x3ff) + 0xdc00).toString(16); }).join('').toUpperCase() + '>';

/** The width and height of a JPEG (from its frame header), or null. */
export function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return {h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8]};
    i += 2 + len;
  }
  return null;
}

/**
 * A PDF of whole-page pictures: pages [{jpeg: Uint8Array}] (each its own size), width: the page width in points (the
 * height follows each picture's shape). title / author go in the document's information.
 */
export function pdfFromJpegs(pages, {title = '', author = '', width = 420} = {}) {
  const chunks = [], offsets = [];
  let length = 0;
  const put = data => { const bytes = typeof data === 'string' ? enc.encode(data) : data; chunks.push(bytes); length += bytes.length; };
  const obj = (n, body) => { offsets[n] = length; put(`${n} 0 obj\n`); for (const part of [].concat(body)) put(part); put('\nendobj\n'); };
  put('%PDF-1.4\n'); put(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const kids = pages.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${kids.map(k => k + ' 0 R').join(' ')}] >>`);
  pages.forEach((p, i) => {
    const size = jpegSize(p.jpeg);
    if (!size) throw Error(`第 ${i + 1} 页的图不是 JPEG`);
    const w = width, h = Math.round(width * size.h / size.w * 100) / 100, n = 3 + i * 3, draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    obj(n + 1, [`<< /Length ${draw.length} >>\nstream\n`, draw, '\nendstream']);
    obj(n + 2, [`<< /Type /XObject /Subtype /Image /Width ${size.w} /Height ${size.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
  });
  const info = 3 + pages.length * 3;
  obj(info, `<< /Title ${pdfText(title)} /Author ${pdfText(author)} /Producer ${pdfText('ST-iPhonie 绘本')} >>`);
  const xrefAt = length, count = info + 1;
  put(`xref\n0 ${count}\n0000000000 65535 f \n` + Array.from({length: count - 1}, (_, i) => String(offsets[i + 1]).padStart(10, '0') + ' 00000 n \n').join(''));
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(chunks, {type: 'application/pdf'});
}

/**
 * An EPUB 3 of the book: book {title, author, theme: {paper, ink, accent, font}, pages: [{kind, text, chapter}]},
 * images: Map(page index → {bytes, type}) for the pages that have a picture (the cover too). One XHTML file a page.
 */
export function epubOf(book, images = new Map(), {id = 'urn:uuid:' + (globalThis.crypto?.randomUUID?.() || Date.now()), now = new Date()} = {}) {
  const t = book.theme || {}, files = [], items = [], spine = [], toc = [];
  const add = (path, text) => files.push({path, bytes: typeof text === 'string' ? enc.encode(text) : text});
  add('mimetype', 'application/epub+zip');
  add('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  add('OEBPS/style.css', `body{margin:0;padding:1em;background:${t.paper || '#fff'};color:${t.ink || '#222'};font-family:${t.font || 'serif'};line-height:1.8}
img{display:block;max-width:100%;margin:0 auto 1em;border-radius:6px}h1,h2{color:${t.accent || '#c55'};text-align:center}
.cover{text-align:center}.cover h1{font-size:2em;margin-top:1em}.end{text-align:center;margin-top:30%;font-size:1.6em;color:${t.accent || '#c55'}}p{text-indent:2em;margin:.4em 0}`);
  items.push('<item id="css" href="style.css" media-type="text/css"/>');
  const page = (name, title, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN"><head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
  let coverImage = '';
  book.pages.forEach((p, i) => {
    const img = images.get(i), ext = img ? (/png/.test(img.type) ? 'png' : 'jpg') : '', imgName = img ? `images/p${i}.${ext}` : '';
    if (img) { add('OEBPS/' + imgName, img.bytes); items.push(`<item id="img${i}" href="${imgName}" media-type="${ext === 'png' ? 'image/png' : 'image/jpeg'}"${p.kind === 'cover' ? ' properties="cover-image"' : ''}/>`); if (p.kind === 'cover') coverImage = imgName; }
    const name = `p${i}.xhtml`, picture = img ? `<img src="${imgName}" alt=""/>` : '';
    const words = String(p.text || '').split(/\n+/).filter(Boolean).map(line => `<p>${xml(line)}</p>`).join('');
    const body = p.kind === 'cover' ? `<div class="cover">${picture}<h1>${xml(book.title)}</h1>${book.author ? `<p>${xml(book.author)}</p>` : ''}</div>`
      : p.kind === 'chapter' ? `<h2>${xml(p.text || p.chapter)}</h2>${picture}`
      : p.kind === 'end' ? `${picture}<div class="end">${xml(p.text || '完')}</div>` : `${picture}${words}`;
    add('OEBPS/' + name, page(name, p.kind === 'chapter' ? p.text : book.title, body));
    items.push(`<item id="p${i}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="p${i}"/>`);
    if (p.kind === 'cover' || p.kind === 'chapter') toc.push(`<li><a href="${name}">${xml(p.kind === 'cover' ? book.title : p.text || p.chapter)}</a></li>`);
  });
  if (!toc.length) toc.push(`<li><a href="p0.xhtml">${xml(book.title)}</a></li>`);
  add('OEBPS/nav.xhtml', page('nav', '目录', `<nav epub:type="toc" id="toc"><h1>目录</h1><ol>${toc.join('')}</ol></nav>`));
  items.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  const modified = now.toISOString().replace(/\.\d+Z$/, 'Z');
  add('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${xml(id)}</dc:identifier><dc:title>${xml(book.title)}</dc:title><dc:language>zh-CN</dc:language>${book.author ? `<dc:creator>${xml(book.author)}</dc:creator>` : ''}<meta property="dcterms:modified">${modified}</meta>${coverImage ? `<meta name="cover" content="img0"/>` : ''}</metadata><manifest>${items.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  return new Blob([writeZip(files)], {type: 'application/epub+zip'});
}

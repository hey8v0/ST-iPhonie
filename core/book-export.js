// 绘本导出: a book as a PDF and as an EPUB 3 — both of whole pages drawn as pictures (ui/book-render.js), so the type,
// the collage and the look come out the same anywhere; the EPUB is fixed-layout, a page a screen (two side by side
// where the reader can), each page's words kept with its picture for reading aloud and search. Built here, byte by
// byte; no libraries.
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
 * A PDF of whole-page pictures: pages [{jpeg: Uint8Array, width?}] — width: the page's width in points (a spread is
 * wider), else `width`; the height follows each picture's shape. title / author go in the document's information.
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
    const w = p.width || width, h = Math.round(w * size.h / size.w * 100) / 100, n = 3 + i * 3, draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
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
 * A fixed-layout EPUB 3 of the book: book {title, author}; pages [{jpeg: Uint8Array, width, height, text, label}] —
 * each page's picture (the cover first), its words (kept as the picture's text) and, for the contents, its label
 * (the cover's and each chapter's).
 */
export function epubOf(book, pages, {id = 'urn:uuid:' + (globalThis.crypto?.randomUUID?.() || Date.now()), now = new Date()} = {}) {
  const files = [], items = [], spine = [], toc = [];
  const add = (path, text) => files.push({path, bytes: typeof text === 'string' ? enc.encode(text) : text});
  add('mimetype', 'application/epub+zip');
  add('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const head = (title, w, h) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN"><head><meta charset="UTF-8"/>${w ? `<meta name="viewport" content="width=${w}, height=${h}"/>` : ''}<title>${xml(title)}</title>${w ? `<style>html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden}img{display:block;width:${w}px;height:${h}px}</style>` : ''}</head>`;
  pages.forEach((p, i) => {
    const img = `images/p${i}.jpg`, name = `p${i}.xhtml`, w = p.width || 1200, h = p.height || 1600;
    add('OEBPS/' + img, p.jpeg);
    items.push(`<item id="img${i}" href="${img}" media-type="image/jpeg"${i === 0 ? ' properties="cover-image"' : ''}/>`);
    add('OEBPS/' + name, `${head(p.label || book.title, w, h)}<body><img src="${img}" alt="${xml(p.text || p.label || '')}"/></body></html>`);
    items.push(`<item id="p${i}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="p${i}"${i === 0 ? ' properties="rendition:page-spread-center"' : ''}/>`);
    if (p.label) toc.push(`<li><a href="${name}">${xml(p.label)}</a></li>`);
  });
  if (!toc.length) toc.push(`<li><a href="p0.xhtml">${xml(book.title)}</a></li>`);
  add('OEBPS/nav.xhtml', `${head('目录')}<body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>${toc.join('')}</ol></nav></body></html>`);
  items.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  const modified = now.toISOString().replace(/\.\d+Z$/, 'Z');
  add('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN" prefix="rendition: http://www.idpf.org/vocab/rendition/#"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${xml(id)}</dc:identifier><dc:title>${xml(book.title)}</dc:title><dc:language>zh-CN</dc:language>${book.author ? `<dc:creator>${xml(book.author)}</dc:creator>` : ''}<meta property="dcterms:modified">${modified}</meta><meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">landscape</meta><meta name="cover" content="img0"/></metadata><manifest>${items.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  return new Blob([writeZip(files)], {type: 'application/epub+zip'});
}

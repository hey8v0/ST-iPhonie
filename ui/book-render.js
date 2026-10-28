// 绘本 as pictures: for the PDF, the EPUB and the pictures export — the cover and the last page each a page, each
// spread both its pages side by side. What is drawn is the reader's own (core/book-pages.js viewMarkup): laid out in
// the document at the picture's size, its pictures put inside it, then drawn through an SVG onto a canvas, so the
// picture is the book as it is read. A browser that will not draw it that way gets a plainer one drawn on the canvas
// by hand (drawSimple): the pictures, the words beside them, the title on the cover.
import {themeOf} from '../core/book-themes.js';
import {BOOK_CSS, fitWords} from '../core/book-pages.js';
import {SPREADS, sheetOf} from '../core/book.js';

export const PAGE_W = 1200, PAGE_H = 1600;
const NO_START = /[，。！？、；：」』”’）》〉…—,.!?;:)\]]/;

/** Lines of text that fit `width` (measured by g), breaking anywhere but before closing marks. */
export function wrap(g, text, width) {
  const out = [];
  for (const para of String(text || '').split(/\n/)) {
    let line = '';
    for (const ch of [...para]) {
      if (line && g.measureText(line + ch).width > width && !NO_START.test(ch)) { out.push(line); line = ch; } else line += ch;
    }
    out.push(line);
  }
  return out;
}
function cover(g, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
function rounded(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/**
 * A sheet drawn by hand (when it cannot be drawn as it is read): images — its pictures (bitmaps or images; null where
 * there is none). The cover: its picture, the title over it; a spread: its pictures, its words on the paper beside or
 * under them (on a soft white where they lie over a picture); the last page: 完 and the ending.
 */
export function drawSimple(g, book, n, images = [], {W = PAGE_W, H = PAGE_H} = {}) {
  const t = themeOf(book.theme), sheet = sheetOf(book, n), k = H / PAGE_H, pad = 80 * k;
  g.save();
  g.fillStyle = t.paper; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const pics = images.filter(Boolean);
  /** Words in a box, from its middle (over a picture: on a soft white). */
  const words = (text, box, over = false) => {
    g.font = `500 ${46 * k}px ${t.font}`;
    const lines = wrap(g, text, box.w - pad * 2), lh = 74 * k, h = lines.length * lh, y0 = box.y + (box.h - h) / 2;
    if (over) { g.fillStyle = 'rgba(255,255,255,.82)'; rounded(g, box.x + pad / 2, y0 - pad / 2, box.w - pad, h + pad, 28 * k); g.fill(); }
    g.fillStyle = over ? '#2b2b2b' : t.ink;
    lines.forEach((line, i) => g.fillText(line, box.x + box.w / 2, y0 + (i + .78) * lh));
  };
  if (sheet.kind === 'cover') {
    if (pics[0]) cover(g, pics[0], 0, 0, W, H);
    g.font = `800 ${120 * k}px ${t.title}`;
    g.lineWidth = 16 * k; g.strokeStyle = t.accent; g.fillStyle = '#fff'; g.lineJoin = 'round';
    wrap(g, book.title, W - pad * 2).forEach((line, i) => { const y = 260 * k + i * 140 * k; g.strokeText(line, W / 2, y); g.fillText(line, W / 2, y); });
  } else if (sheet.kind === 'end') {
    g.fillStyle = t.accent; g.font = `800 ${220 * k}px ${t.title}`; g.fillText('完', W / 2, H * .45);
    if (book.ending) words(book.ending, {x: 0, y: H * .55, w: W, h: H * .3});
  } else {
    const s = sheet.spread, text = s.words.map(w => w.role ? `「${w.text}」` : w.text).join('');
    const near = s.side === 'left' ? 0 : W / 2, far = s.side === 'left' ? W / 2 : 0;
    if (s.layout === 'pair') {
      pics.slice(0, 2).forEach((im, i) => cover(g, im, i * W / 2 + pad, pad * 1.5, W / 2 - pad * 2, H * .55));
      if (text) words(text, {x: 0, y: H * .62, w: W, h: H * .34});
    } else if (SPREADS[s.layout].halves) {
      if (pics[0]) cover(g, pics[0], near + (s.layout === 'quiet' ? pad * 2 : 0), s.layout === 'quiet' ? H * .25 : 0, W / 2 - (s.layout === 'quiet' ? pad * 4 : 0), s.layout === 'quiet' ? H * .5 : H);
      if (text) words(text, {x: far, y: 0, w: W / 2, h: H});
    } else if (s.layout === 'window') {
      if (pics[0]) cover(g, pics[0], W * .07, H * .07, W * .86, H * .62);
      if (text) words(text, {x: near, y: H * .72, w: W / 2, h: H * .25});
    } else {
      if (pics[0]) cover(g, pics[0], 0, 0, W, H);
      if (text) words(text, {x: near, y: s.space === 'top' && s.layout !== 'fade' || s.layout === 'ground' ? 0 : H * .6, w: W / 2, h: H * .4}, !!pics[0]);
    }
  }
  g.restore();
}

const loadImage = (win, src) => new Promise((resolve, reject) => { const im = new win.Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('没能画出这一页')); im.src = src; });
const toJpeg = (canvas, quality = .9) => new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(Error('没能存成图片')), 'image/jpeg', quality); } catch (error) { reject(error); } });

/**
 * A view's markup as a JPEG of width × height (bytes). inline(src, img): a picture's address as a data: URL (a picture
 * drawn through an SVG cannot fetch anything). fallback(g): draws it by hand when this browser will not.
 */
export async function pageJpeg(doc, markup, {width = PAGE_W, height = PAGE_H, inline = async s => s, fallback = null} = {}) {
  const win = doc.defaultView, canvas = doc.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw Error('这个浏览器不能画图');
  try {
    const holder = doc.createElement('div');
    holder.style.cssText = `position:fixed;left:-${width + 4000}px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;contain:strict`;
    holder.innerHTML = markup;
    (doc.body || doc.documentElement).append(holder);
    const page = holder.firstElementChild;
    try {
      // A picture that cannot be had (a file gone) is left out.
      for (const img of page.querySelectorAll('img')) { const src = img.getAttribute('src'), data = src ? await inline(src, img) : ''; if (data) img.setAttribute('src', data); else img.remove(); }
      await Promise.all([...page.querySelectorAll('img')].map(im => im.decode?.().catch(() => {})));
      fitWords(page);
      const xhtml = new win.XMLSerializer().serializeToString(page);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${width}px;height:${height}px;overflow:hidden"><style><![CDATA[${BOOK_CSS}]]></style>${xhtml}</div></foreignObject></svg>`;
      const image = await loadImage(win, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      g.drawImage(image, 0, 0, width, height);
      // Some browsers show the pictures inside only from the second drawing on.
      g.drawImage(image, 0, 0, width, height);
    } finally { holder.remove(); }
    return new Uint8Array(await (await toJpeg(canvas)).arrayBuffer());
  } catch (error) {
    if (!fallback) throw error;
    const plain = doc.createElement('canvas');
    plain.width = width; plain.height = height;
    await fallback(plain.getContext('2d'), width, height);
    return new Uint8Array(await (await toJpeg(plain)).arrayBuffer());
  }
}

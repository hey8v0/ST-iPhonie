// 绘本的一页 as a picture: for the PDF, the EPUB and the pictures export. The page is the reader's own (core/book-pages.js):
// laid out in the document at the picture's size, its pictures put inside it, then drawn through an SVG onto a canvas,
// so the picture is the page as it is read. A browser that will not draw it that way gets a plainer page drawn on the
// canvas by hand (drawSimple): the picture over the page, the words in a box, the title on the cover.
import {themeOf} from '../core/book-themes.js';
import {BOOK_CSS, fitProse} from '../core/book-pages.js';

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
 * A page drawn by hand (when the page cannot be drawn as it is read): images — the page's pictures (bitmaps or
 * images; null where there is none). number: the page number at the foot (0: none).
 */
export function drawSimple(g, book, p, images = [], {W = PAGE_W, H = PAGE_H, number = 0} = {}) {
  const t = themeOf(book.theme), k = Math.min(W, H) / 1200, pad = 80 * k;
  g.save();
  g.fillStyle = t.paper; g.fillRect(0, 0, W, H);
  const pics = images.filter(Boolean);
  if (pics.length === 1) cover(g, pics[0], 0, 0, W, H);
  else if (pics.length > 1) { const h = (H - pad) / pics.length; pics.forEach((im, i) => cover(g, im, pad / 2, pad / 2 + i * h, W - pad, h - 20 * k)); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if (p.kind === 'cover') {
    g.font = `800 ${120 * k}px ${t.title}`;
    g.lineWidth = 16 * k; g.strokeStyle = t.accent; g.fillStyle = '#fff'; g.lineJoin = 'round';
    wrap(g, book.title, W - pad * 2).forEach((line, i) => { const y = 260 * k + i * 140 * k; g.strokeText(line, W / 2, y); g.fillText(line, W / 2, y); });
  } else if (p.kind === 'end') {
    g.fillStyle = t.accent; g.font = `800 ${220 * k}px ${t.title}`; g.fillText('完', W / 2, H / 2);
  }
  const words = p.kind === 'cover' ? [] : p.texts.map(w => (w.who && w.kind !== 'caption' ? w.who + '：' : '') + w.text);
  if (words.length) {
    g.font = `500 ${44 * k}px ${t.font}`;
    const lines = words.flatMap(w => wrap(g, w, W - pad * 3)), lh = 66 * k, boxH = lines.length * lh + pad;
    const y0 = p.layout === 'title' ? (H - boxH) / 2 : H - boxH - pad / 2;
    g.fillStyle = 'rgba(255,255,255,.86)'; rounded(g, pad, y0, W - pad * 2, boxH, 28 * k); g.fill();
    g.fillStyle = '#2b2b2b';
    lines.forEach((line, i) => g.fillText(line, W / 2, y0 + pad / 2 + (i + .8) * lh));
  }
  if (number) { g.font = `600 ${30 * k}px ${t.font}`; g.fillStyle = t.ink; g.globalAlpha = .6; g.fillText(String(number), W - pad, H - 40 * k); }
  g.restore();
}

const loadImage = (win, src) => new Promise((resolve, reject) => { const im = new win.Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('没能画出这一页')); im.src = src; });
const toJpeg = (canvas, quality = .9) => new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(Error('没能存成图片')), 'image/jpeg', quality); } catch (error) { reject(error); } });

/**
 * A page's markup as a JPEG of width × height (bytes). inline(src, img): a picture's address as a data: URL (a picture
 * drawn through an SVG cannot fetch anything). fallback(g): draws the page by hand when this browser will not.
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
      fitProse(page);
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

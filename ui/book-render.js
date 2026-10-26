// 绘本的一页, drawn on a canvas: for the PDF, the pictures export and the shelf's covers. The same look as the reader
// (ui/book.css): the theme's paper and ornament, the picture placed by the page's layout, the words wrapped (Chinese
// breaks anywhere; a closing mark never starts a line), the cover's title, a chapter's heading, 「完」 at the end.
import {themeOf} from '../core/book-themes.js';

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
/** The theme's ornament around the page. */
function ornament(g, t, W, H) {
  g.save();
  g.strokeStyle = t.accent; g.fillStyle = t.accent;
  const k = W / 1200;
  if (t.deco === 'ornate' || t.deco === 'seal' || t.deco === 'map') { g.globalAlpha = .55; g.lineWidth = 6 * k; g.strokeRect(36 * k, 36 * k, W - 72 * k, H - 72 * k); g.lineWidth = 2 * k; g.strokeRect(52 * k, 52 * k, W - 104 * k, H - 104 * k); }
  if (t.deco === 'stars' || t.deco === 'pop') { g.globalAlpha = .35; for (let i = 0; i < 18; i++) { const x = (i * 197 % 1100 + 50) * k, y = (i % 2 ? 40 + i * 7 : H / k - 60 - i * 5) * k; g.beginPath(); g.arc(x, y, (6 + i % 4 * 3) * k, 0, Math.PI * 2); g.fill(); } }
  if (t.deco === 'petals') { g.globalAlpha = .3; for (let i = 0; i < 14; i++) { g.save(); g.translate((i * 233 % 1150 + 25) * k, (i % 2 ? 30 + i * 9 : H / k - 40 - i * 6) * k); g.rotate(i); g.beginPath(); g.ellipse(0, 0, 18 * k, 9 * k, 0, 0, Math.PI * 2); g.fill(); g.restore(); } }
  if (t.deco === 'lines') { g.globalAlpha = .18; g.lineWidth = 2 * k; for (let y = 120 * k; y < H; y += 64 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  if (t.deco === 'grid') { g.globalAlpha = .12; g.lineWidth = 1.5 * k; for (let x = 0; x < W; x += 80 * k) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 80 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  if (t.deco === 'noir' || t.deco === 'scratch') { const v = g.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); g.globalAlpha = 1; g.fillStyle = v; g.fillRect(0, 0, W, H); }
  g.restore();
}
/** The seal of 古风 (a red square with the book's first character) and other small marks. */
function seal(g, t, text, x, y, s) {
  g.save(); g.fillStyle = t.accent; rounded(g, x, y, s, s, s * .12); g.fill();
  g.fillStyle = t.paper; g.font = `700 ${s * .62}px ${t.font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText([...text][0] || '书', x + s / 2, y + s / 2 + s * .04); g.restore();
}

/**
 * Draws page p of book onto g (W×H). image: the page's picture (an HTMLImageElement or ImageBitmap) or null.
 * number: the page number printed at the foot (0: none).
 */
export function drawPage(g, book, p, image, {W = PAGE_W, H = PAGE_H, number = 0} = {}) {
  const t = themeOf(book.theme), k = W / 1200, pad = 90 * k;
  g.save();
  g.fillStyle = t.paper; g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  if (p.kind === 'cover') {
    if (image) { cover(g, image, 0, 0, W, H); const fade = g.createLinearGradient(0, H * .45, 0, H); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.7)'); g.fillStyle = fade; g.fillRect(0, 0, W, H); }
    else ornament(g, t, W, H);
    g.fillStyle = image ? '#fff' : t.accent; g.textAlign = 'center';
    g.font = `800 ${110 * k}px ${t.font}`;
    const lines = wrap(g, book.title || '绘本', W - pad * 2);
    lines.forEach((line, i) => g.fillText(line, W / 2, (image ? H - 330 * k : H * .38) + i * 130 * k));
    if (book.subtitle) { g.font = `500 ${46 * k}px ${t.font}`; g.globalAlpha = .85; g.fillText(book.subtitle, W / 2, (image ? H - 330 * k : H * .38) + lines.length * 130 * k + 10 * k); g.globalAlpha = 1; }
    g.font = `600 ${36 * k}px ${t.font}`; g.fillStyle = image ? 'rgba(255,255,255,.85)' : t.ink; g.fillText(`${t.label}绘本${book.author ? ' · ' + book.author : ''}`, W / 2, H - 90 * k);
    if (t.deco === 'seal') seal(g, t, book.title, W - 200 * k, 120 * k, 110 * k);
    g.restore(); return;
  }
  ornament(g, t, W, H);
  if (p.kind === 'chapter') {
    if (image) { g.save(); rounded(g, pad, pad * 1.6, W - pad * 2, H * .5, 28 * k); g.clip(); cover(g, image, pad, pad * 1.6, W - pad * 2, H * .5); g.restore(); }
    g.fillStyle = t.accent; g.textAlign = 'center'; g.font = `800 ${84 * k}px ${t.font}`;
    wrap(g, p.text || '', W - pad * 2).forEach((line, i) => g.fillText(line, W / 2, (image ? H * .72 : H * .45) + i * 100 * k));
    g.restore(); return;
  }
  if (p.kind === 'end') {
    if (image) { g.save(); rounded(g, pad, pad * 1.6, W - pad * 2, H * .55, 28 * k); g.clip(); cover(g, image, pad, pad * 1.6, W - pad * 2, H * .55); g.restore(); }
    g.fillStyle = t.accent; g.textAlign = 'center'; g.font = `800 ${120 * k}px ${t.font}`; g.fillText(p.text || '完', W / 2, image ? H * .82 : H * .5);
    g.restore(); return;
  }
  const layout = p.layout || t.layout, size = 52 * k, lh = size * 1.75;
  g.font = `500 ${size}px ${t.font}`;
  const textW = W - pad * 2, lines = wrap(g, p.text || '', textW);
  if (image && layout === 'full') {
    cover(g, image, 0, 0, W, H);
    const boxH = Math.min(H * .5, lines.length * lh + pad), y = H - boxH - pad * .6;
    g.fillStyle = t.paper; g.globalAlpha = .9; rounded(g, pad * .6, y, W - pad * 1.2, boxH, 30 * k); g.fill(); g.globalAlpha = 1;
    g.fillStyle = t.ink; g.textAlign = 'left';
    lines.forEach((line, i) => g.fillText(line, pad, y + pad * .55 + size + i * lh));
  } else {
    let top = pad * 1.3;
    if (image) {
      const ph = Math.min(H * (layout === 'frame' ? .52 : .58), H - pad * 2.6 - lines.length * lh);
      if (layout === 'frame') { g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 24 * k; g.fillStyle = '#fff'; g.fillRect(pad * .9, top - 18 * k, W - pad * 1.8, ph + 36 * k); g.restore(); cover(g, image, pad, top, W - pad * 2, ph); }
      else { g.save(); rounded(g, pad, top, W - pad * 2, ph, 30 * k); g.clip(); cover(g, image, pad, top, W - pad * 2, ph); g.restore(); }
      top += ph + 80 * k;
    } else top = Math.max(pad * 2, (H - lines.length * lh) / 2 - lh);
    g.fillStyle = t.ink; g.textAlign = 'left';
    lines.forEach((line, i) => g.fillText(line, pad, top + size + i * lh));
  }
  if (number) { g.fillStyle = t.ink; g.globalAlpha = .5; g.textAlign = 'center'; g.font = `500 ${30 * k}px ${t.font}`; g.fillText(String(number), W / 2, H - 46 * k); g.globalAlpha = 1; }
  g.restore();
}

/** A page drawn into a JPEG (bytes), for the PDF and the pictures export. */
export async function pageJpeg(doc, book, p, image, {W = PAGE_W, H = PAGE_H, number = 0, quality = .88} = {}) {
  const c = doc.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) throw Error('这个浏览器不能画图');
  drawPage(g, book, p, image, {W, H, number});
  const blob = await new Promise(resolve => c.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw Error('这一页没能存成图片');
  return new Uint8Array(await blob.arrayBuffer());
}

// 聊天长图 (0.9.33): the messages picked, as one tall picture of the chat as it looks now — its background, the bubbles
// (自定义气泡 too), the avatars and the pictures. The rows are copied out of the chat and laid out out of sight at its
// width, with the phone's own style sheets (no 多选 circles, nothing moving); that copy is drawn through an SVG onto a
// canvas, as the 绘本 export draws its pages. A browser that will not let such a canvas be saved (iPhone Safari) gets the
// same copy drawn by hand from where its parts are and what colours they have (drawPlain).

const SCALE = 2, MAX_H = 16000, MAX_AREA = 15_000_000;

/** A picture's address as a data: URL ('' when it cannot be had: a picture of another site that does not allow it). */
async function dataUrl(win, src) {
  if (!src || src.startsWith('data:')) return src || '';
  try {
    const r = await win.fetch(src, {credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!r.ok) return '';
    const blob = await r.blob();
    return await new Promise((ok, no) => { const fr = new win.FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(fr.error); fr.readAsDataURL(blob); });
  } catch { return ''; }
}
/** The phone's style sheets as one text; :root, html and body stand for the picture's own root and body. */
function sheets(doc) {
  let out = '';
  for (const sheet of doc.styleSheets) {
    let rules = null;
    try { rules = sheet.cssRules; } catch { /* not ours */ }
    for (const r of rules || []) out += r.cssText + '\n';
  }
  return out.replace(/:root(?![\w-])/g, '.shot-root').replace(/(^|[\s,}>+~(])html(?=[\s,.{:[>+~)#])/g, '$1.shot-root').replace(/(^|[\s,}>+~(])body(?=[\s,.{:[>+~)#])/g, '$1.shot-body')
    .replaceAll(']]>', ']] >');
}
/** The custom properties in force at the page's root (the theme, its colours), as a style for the picture's root. */
function variables(doc) {
  const win = doc.defaultView, out = [];
  for (const el of [doc.documentElement, doc.body]) {
    const cs = win.getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) { const name = cs[i]; if (name.startsWith('--')) out.push(`${name}:${cs.getPropertyValue(name)}`); }
  }
  return out.join(';');
}
const toBlob = (canvas, type = 'image/png') => new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(Error('没能存成图片')), type, .92); } catch (error) { reject(error); } });
const loadImage = (win, src) => new Promise((resolve, reject) => { const im = new win.Image(); im.onload = () => resolve(im); im.onerror = () => reject(Error('没能画出长图')); im.src = src; });
const fitScale = (w, h) => Math.max(.5, Math.min(SCALE, MAX_H / h, Math.sqrt(MAX_AREA / (w * h))));
const STILL = '*,*::before,*::after{animation:none!important;transition:none!important}';
const OWN = '.shot-root{display:block;background:var(--bg)}.shot-title{font-weight:800}.shot-missing{display:inline-block;padding:6px 10px;border-radius:12px;background:var(--card2);color:var(--ink2);font-size:13px}';

/**
 * The picture (a PNG): thread, the chat's .chat-thread; rows, the message rows picked (in order; the day lines before
 * them come along). title: words on top (who the chat is with).
 */
export async function chatLongImage(doc, {thread, rows, title = ''}) {
  if (!rows.length) throw Error('先选几条消息');
  const box = thread.querySelector('.msgs'), width = Math.max(240, Math.round(box?.clientWidth || 360));
  const copy = await layOut(doc, {thread, rows, title, width});
  try {
    try { return await throughSvg(doc, copy); }
    catch (error) {
      // This browser will not keep a canvas such a picture was drawn on: by hand.
      if (error?.name !== 'SecurityError' && !/没能画出|没能存成|tainted|insecure/i.test(String(error?.message))) throw error;
      return await drawPlain(doc.defaultView, copy);
    }
  } finally { copy.holder.remove(); }
}

/** The copy, laid out out of sight: {root, holder, width, height}. Its pictures and backgrounds as data: URLs. */
async function layOut(doc, {thread, rows, title, width}) {
  const win = doc.defaultView, box = thread.querySelector('.msgs'), wrapFrom = thread.querySelector('.msgs-wrap');
  const root = doc.createElement('div');
  root.className = 'shot-root';
  for (const a of doc.documentElement.attributes) if (!['class', 'style'].includes(a.name)) root.setAttribute(a.name, a.value);
  root.setAttribute('style', `${variables(doc)};width:${width}px`);
  const body = doc.createElement('div');
  body.className = 'shot-body ' + (doc.body.className || '');
  const t = thread.cloneNode(false);
  t.classList.remove('selecting');
  t.setAttribute('style', `position:relative;inset:auto;display:block;width:${width}px;height:auto`);
  const wrap = wrapFrom.cloneNode(false);
  wrap.setAttribute('style', 'position:relative;display:block');
  const scene = wrapFrom.querySelector(':scope > .chat-scene');
  if (scene) wrap.append(scene.cloneNode(true));
  const msgs = box.cloneNode(false);
  msgs.setAttribute('style', `${box.getAttribute('style') || ''};overflow:visible;height:auto;min-height:0;flex:none;padding-top:${title ? 6 : 16}px;padding-bottom:18px`);
  if (title) { const head = doc.createElement('div'); head.className = 'day shot-title'; head.textContent = title; msgs.append(head); }
  for (const row of rows) {
    const before = row.previousElementSibling;
    if (before?.classList.contains('day')) msgs.append(before.cloneNode(true));
    const c = row.cloneNode(true);
    c.removeAttribute('data-picked');
    c.setAttribute('data-recent', '');
    for (const x of c.querySelectorAll('.pick,.range-bar,.photo-note,button.text-button')) x.remove();
    msgs.append(c);
  }
  wrap.append(msgs);
  t.append(wrap);
  body.append(t);
  root.append(body);
  // Pictures and backgrounds as data: URLs; one that cannot be had leaves its words (a sticker its name).
  for (const img of root.querySelectorAll('img')) {
    const data = await dataUrl(win, img.currentSrc || img.getAttribute('src'));
    if (data) { img.setAttribute('src', data); img.removeAttribute('loading'); img.removeAttribute('srcset'); continue; }
    const words = img.closest('[data-name]')?.dataset.name || img.getAttribute('alt') || '';
    img.replaceWith(Object.assign(doc.createElement('span'), {className: 'shot-missing', textContent: words}));
  }
  for (const el of [root, ...root.querySelectorAll('[style*="url("]')]) {
    const style = el.getAttribute('style') || '';
    if (!/url\(/.test(style)) continue;
    let out = style;
    for (const m of style.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) if (!m[1].startsWith('data:')) out = out.replace(m[0], `url("${await dataUrl(win, m[1]) || 'data:,'}")`);
    el.setAttribute('style', out);
  }
  // In this page (its style sheets apply), out of sight, still.
  const holder = doc.createElement('div');
  holder.setAttribute('style', `position:fixed;left:-${width + 5000}px;top:0;width:${width}px;pointer-events:none;contain:layout paint`);
  // (Its rules reach only the copy: this page goes on moving meanwhile.)
  holder.innerHTML = `<style>${STILL.replace(/\*(?=[,:{])/g, '.shot-root *')}${OWN}</style>`;
  holder.append(root);
  doc.body.append(holder);
  await Promise.all([...root.querySelectorAll('img')].map(im => im.decode?.().catch(() => {})));
  return {root, holder, width, height: Math.ceil(root.getBoundingClientRect().height) || 200};
}

async function throughSvg(doc, {root, width, height}) {
  const win = doc.defaultView;
  const xhtml = new win.XMLSerializer().serializeToString(root).replace(/^<div /, '<div xmlns="http://www.w3.org/1999/xhtml" ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${sheets(doc)}\n${STILL}${OWN}]]></style>${xhtml}</div></foreignObject></svg>`;
  const image = await loadImage(win, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const k = fitScale(width, height), canvas = doc.createElement('canvas');
  canvas.width = Math.round(width * k); canvas.height = Math.round(height * k);
  const g = canvas.getContext('2d');
  if (!g) throw Error('这个浏览器不能画图');
  g.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Some browsers show the pictures inside only from the second drawing on.
  g.drawImage(image, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas);
}

// ---------- by hand ----------
const solid = c => !!c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
const light = c => { const n = String(c).match(/[\d.]+/g)?.map(Number) || []; return n.length >= 3 && n[0] * .299 + n[1] * .587 + n[2] * .114 > 232; };
function rounded(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function lines(g, text, width) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const ch of [...para]) { if (line && g.measureText(line + ch).width > width) { out.push(line); line = ch; } else line += ch; }
    out.push(line);
  }
  return out;
}
/** The copy drawn where its parts are: the ground, day lines and the title as words, avatars as circles (their pictures),
 *  bubbles and cards as boxes of their colour and border with their words, pictures as they are. */
async function drawPlain(win, {root, width, height}) {
  const doc = win.document, base = root.getBoundingClientRect(), k = fitScale(width, height), canvas = doc.createElement('canvas');
  canvas.width = Math.round(width * k); canvas.height = Math.round(height * k);
  const g = canvas.getContext('2d');
  if (!g) throw Error('这个浏览器不能画图');
  g.scale(k, k);
  const cs = el => win.getComputedStyle(el), at = el => { const r = el.getBoundingClientRect(); return {x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height}; };
  const vars = cs(root), ground = [root.querySelector('.msgs'), root.querySelector('.msgs-wrap'), root.querySelector('.chat-thread'), root].map(el => el && cs(el).backgroundColor).find(solid) || vars.getPropertyValue('--bg').trim() || '#f4f7fb';
  g.fillStyle = ground; g.fillRect(0, 0, width, height);
  const text = (el, align = 'left') => { const r = at(el), s = cs(el); g.fillStyle = s.color; g.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(el.textContent.trim(), align === 'center' ? r.x + r.w / 2 : r.x, r.y + r.h / 2); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; };
  for (const el of root.querySelectorAll('.msgs > .day')) text(el, 'center');
  const picture = (img, r, radius) => { if (!img?.complete || !img.naturalWidth) return false; g.save(); rounded(g, r.x, r.y, r.w, r.h, radius); g.clip(); g.drawImage(img, r.x, r.y, r.w, r.h); g.restore(); return true; };
  for (const row of root.querySelectorAll('.msgs > .msg')) {
    for (const el of row.querySelectorAll('.avatar')) {
      const r = at(el), s = cs(el);
      if (picture(el.querySelector('img'), r, r.w / 2)) continue;
      g.save(); g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fillStyle = solid(s.backgroundColor) ? s.backgroundColor : '#ccd'; g.fill();
      g.fillStyle = s.color || '#fff'; g.font = `700 ${Math.round(r.w * .42)}px ${s.fontFamily}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(el.textContent.trim().slice(0, 1), r.x + r.w / 2, r.y + r.h / 2); g.restore();
    }
    for (const el of row.querySelectorAll('.m-name')) text(el);
    const body = row.querySelector('.m-body');
    for (const el of body ? [...body.children].filter(x => !x.classList.contains('m-name')) : []) {
      const r = at(el), s = cs(el), img = el.querySelector('img');
      if (img && picture(img, at(img), 12)) continue;
      const radius = parseFloat(s.borderTopLeftRadius) || 14, edge = parseFloat(s.borderTopWidth) || 0;
      rounded(g, r.x, r.y, r.w, r.h, radius);
      g.fillStyle = solid(s.backgroundColor) ? s.backgroundColor : 'rgba(255,255,255,.92)';
      g.fill();
      // A border as it is; a pale bubble on a pale ground gets a fine line, or it would not be seen.
      if (edge) { g.lineWidth = edge; g.strokeStyle = s.borderTopColor; g.stroke(); }
      else if (light(g.fillStyle) && light(ground)) { g.lineWidth = 1; g.strokeStyle = 'rgba(30,50,90,.16)'; g.stroke(); }
      const padX = parseFloat(s.paddingLeft) || 12, padY = parseFloat(s.paddingTop) || 8, size = parseFloat(s.fontSize) || 15, lh = parseFloat(s.lineHeight) || size * 1.5;
      g.fillStyle = s.color || '#222'; g.font = `${s.fontWeight} ${size}px ${s.fontFamily}`; g.textBaseline = 'middle';
      lines(g, (el.innerText || el.textContent || '').trim(), Math.max(20, r.w - padX * 2 - edge * 2) + 1).forEach((line, i) => g.fillText(line, r.x + padX + edge, r.y + padY + edge + lh * (i + .5)));
      g.textBaseline = 'alphabetic';
    }
  }
  return toBlob(canvas);
}

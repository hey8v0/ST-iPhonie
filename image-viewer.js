// Full-screen image viewer shared by the tavern page (pictures in the chat) and the phone (album, drawing app).
// It grows from where the picture was on the page (`from`) to the whole screen (as big as fits, small pictures too),
// then zooms freely: wheel, pinch or the buttons; drag to move; double-click or double-tap switches between that size
// and 2.5x; a single tap hides or shows the bars. As on a phone, there is no reset button: pinched (or wheeled)
// smaller than the screen, the picture springs back to it when let go.
// The picture sits between the top bar and the bottom bar, so the bars never cover it at its opening size.
// It brings its own styles, so it works in any document.

const STYLE_ID = 'sttts-viewer-style';
const CSS = `
.sttts-viewer{position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;z-index:40000;background:rgba(8,10,20,.94);touch-action:none;user-select:none;-webkit-user-select:none;overscroll-behavior:contain;font:14px/1.4 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#fff}
.sttts-viewer img{position:absolute;left:0;top:0;max-width:none;max-height:none;transform-origin:0 0;will-change:transform;cursor:grab;-webkit-user-drag:none}
.sttts-viewer[data-dragging] img{cursor:grabbing}
.sttts-viewer-top{position:absolute;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;display:flex;align-items:center;gap:8px;pointer-events:none}
.sttts-viewer-top>*{pointer-events:auto}
.sttts-viewer-top .sttts-viewer-count{margin:0 auto;padding:6px 12px;border-radius:999px;background:rgba(20,24,40,.7);font-variant-numeric:tabular-nums;font-weight:700}
.sttts-viewer-bar{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:4px;border-radius:24px;background:rgba(20,24,40,.8);box-shadow:0 8px 24px rgba(0,0,0,.4);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);max-width:calc(100vw - 24px);flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
.sttts-viewer-bar::-webkit-scrollbar{display:none}
.sttts-viewer-top,.sttts-viewer-bar,.sttts-viewer-info,.sttts-viewer-caption{transition:opacity .2s}
.sttts-viewer[data-chrome=off] .sttts-viewer-top,.sttts-viewer[data-chrome=off] .sttts-viewer-bar,.sttts-viewer[data-chrome=off] .sttts-viewer-info,.sttts-viewer[data-chrome=off] .sttts-viewer-caption{opacity:0;pointer-events:none}
.sttts-viewer-caption{position:absolute;left:12px;right:12px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 66px);max-height:30%;overflow:auto;margin:0;padding:9px 13px;border-radius:14px;background:rgba(20,24,40,.78);color:#fff;font-size:13px;line-height:1.6;white-space:pre-wrap;user-select:text;-webkit-user-select:text}
/* all:unset makes pointer-events inherit (none from the top bar): buttons say auto themselves, and none while hidden. */
.sttts-viewer[data-chrome=off] button{pointer-events:none}
.sttts-viewer button{all:unset;pointer-events:auto;box-sizing:border-box;flex-shrink:0;min-width:40px;height:44px;padding:0 12px;border-radius:999px;display:inline-grid;place-items:center;cursor:pointer;color:#fff;font-weight:700;white-space:nowrap}
.sttts-viewer button:hover{background:rgba(255,255,255,.12)}
.sttts-viewer button:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
.sttts-viewer button:disabled{opacity:.35;cursor:default}
.sttts-viewer button[data-danger]{color:#ff9cb8}
.sttts-viewer button[hidden],.sttts-viewer-bar[hidden]{display:none}
.sttts-viewer-top button{background:rgba(20,24,40,.7)}
.sttts-viewer-top button[aria-pressed=true]{background:rgba(124,196,255,.3)}
.sttts-viewer .sttts-viewer-close{margin-left:auto;font-size:22px}
.sttts-viewer [data-v=prev],.sttts-viewer [data-v=next]{font-size:24px;font-weight:400}
.sttts-viewer output{flex-shrink:0;min-width:48px;text-align:center;font-variant-numeric:tabular-nums;opacity:.85}
.sttts-viewer-info{position:absolute;left:12px;right:12px;top:calc(max(12px,env(safe-area-inset-top)) + 54px);max-height:min(52vh,420px);overflow:auto;padding:12px 14px;border-radius:16px;background:rgba(20,24,40,.92);box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:13px;line-height:1.6;user-select:text;-webkit-user-select:text;touch-action:pan-y}
.sttts-viewer-info dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
.sttts-viewer-info dt{opacity:.65;white-space:nowrap}
.sttts-viewer-info dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:480px){.sttts-viewer [data-v=full],.sttts-viewer [data-v=in],.sttts-viewer [data-v=out],.sttts-viewer output{display:none}}
@media(prefers-reduced-motion:no-preference){.sttts-viewer img[data-animate]{transition:transform .3s cubic-bezier(.22,1,.36,1.08)}}
`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const infoHTML = info => Array.isArray(info)
  ? `<dl>${info.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
  : `<dl><dd>${esc(info)}</dd></dl>`;

/**
 * Opens the viewer.
 * from: the element the picture was shown in (its size and place are where the viewer starts).
 * info: details shown under the 参数 button, as [[label, value]] rows or plain text.
 * caption: words shown over the bottom of the picture (what a chat photo shows); a tap hides them with the bars.
 * gallery: {items: [{src, alt, info}], index, onIndex?(i)} to page through versions with ‹ ›.
 * actions: [{label, danger?, run(index)}] extra buttons; `run` may return a promise; the viewer closes after an
 * action unless it returns false.
 */
export function openImageViewer({doc = document, src, alt = '', actions = [], from = null, info = null, gallery = null, caption = ''}) {
  const win = doc.defaultView;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.append(style);
  }
  const items = gallery?.items?.length ? gallery.items : [{src, alt, info}];
  let index = gallery?.items?.length ? Math.min(items.length - 1, Math.max(0, gallery.index ?? 0)) : 0;
  const paged = items.length > 1;
  const focus = doc.activeElement;
  const root = doc.createElement('div');
  root.className = 'sttts-viewer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '查看图片');
  root.innerHTML = `<img alt="">
    <div class="sttts-viewer-top"><button data-v="info" aria-pressed="false" hidden>参数</button>${paged ? '<span class="sttts-viewer-count" aria-live="polite"></span>' : ''}<button class="sttts-viewer-close" data-v="close" aria-label="关闭">×</button></div>
    <div class="sttts-viewer-info" hidden></div>${caption ? `<p class="sttts-viewer-caption">${esc(caption)}</p>` : ''}
    <div class="sttts-viewer-bar">${paged ? '<button data-v="prev" aria-label="上一个版本">‹</button><button data-v="next" aria-label="下一个版本">›</button>' : ''}<button data-v="out" aria-label="缩小">－</button><output aria-live="polite"></output><button data-v="in" aria-label="放大">＋</button><button data-v="full">实际像素</button>${actions.map((a, i) => `<button data-action="${i}"${a.danger ? ' data-danger' : ''}></button>`).join('')}</div>`;
  const img = root.querySelector('img'), label = root.querySelector('output'), bar = root.querySelector('.sttts-viewer-bar');
  const panel = root.querySelector('.sttts-viewer-info'), infoButton = root.querySelector('[data-v=info]'), count = root.querySelector('.sttts-viewer-count');
  // On a phone the zoom buttons are hidden: with nothing else on it, there is no bottom bar.
  const narrow = !!win.matchMedia?.('(max-width:480px)').matches, barKept = paged || actions.length > 0 || !narrow;
  bar.hidden = !barKept;
  actions.forEach((a, i) => { root.querySelector(`[data-action="${i}"]`).textContent = a.label; });
  doc.body.append(root);

  let s = 1, tx = 0, ty = 0, fit = 1, base = 1, closed = false, opened = false, chrome = true, tapTimer = 0, wheelTimer = 0;
  let start = from?.getBoundingClientRect?.();
  const pointers = new Map();
  let gesture = null, lastTap = null;
  // The tavern puts a transform on <html>, which makes a fixed box with only `inset` collapse to 0 height:
  // the box has an explicit viewport size, and the window size is the fallback.
  const size = () => ({w: root.clientWidth || win.innerWidth, h: root.clientHeight || win.innerHeight});
  const nat = () => ({w: img.naturalWidth || 1, h: img.naturalHeight || 1});
  /** The band the picture is centred in: between the bars while they show, the whole screen otherwise. */
  function band() {
    const {h} = size();
    if (!chrome || h < 240) return {top: 0, bottom: h};
    const top = Math.min(h / 4, 64), bottom = h - (barKept ? Math.min(h / 4, (bar.offsetHeight || 52) + 26) : 12);
    return {top, bottom};
  }

  function clamp() {
    const {w} = size(), {top, bottom} = band(), n = nat(), iw = n.w * s, ih = n.h * s, room = bottom - top;
    tx = iw <= w ? (w - iw) / 2 : Math.min(0, Math.max(w - iw, tx));
    const {h} = size();
    ty = ih <= room ? top + (room - ih) / 2 : ih <= h ? Math.min(h - ih, Math.max(0, ty)) : Math.min(0, Math.max(h - ih, ty));
  }
  function apply(animate = false) {
    clamp();
    img.toggleAttribute('data-animate', animate);
    img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
    label.textContent = Math.round(s * 100) + '%';
  }
  /** loose: a pinch or the wheel may go below the screen size for a moment (it springs back); buttons and keys stop there. */
  function zoomAt(next, x, y, animate, loose = false) {
    const max = Math.max(4, fit * 8, base * 8), min = loose ? base * .45 : base;
    next = Math.min(max, Math.max(min, next));
    tx = x - (x - tx) * next / s;
    ty = y - (y - ty) * next / s;
    s = next;
    apply(animate);
  }
  function measure() {
    const {w} = size(), {top, bottom} = band(), n = nat(), room = bottom - top;
    // A hidden viewer (0×0) keeps 100%.
    fit = w > 0 && room > 0 ? Math.min(w / n.w, room / n.h, 1) : 1;
    // Opens as big as the band holds (small pictures grown to it too), so the bars do not cover it.
    base = w > 0 && room > 0 ? Math.min(w / n.w, room / n.h) : fit;
  }
  /** Smaller than the screen and let go: springs back. */
  function settle() { if (s < base * .99) home(true); }
  /** Back to the opening size: the whole band, centred. */
  function home(animate = false) { measure(); s = base; tx = 0; ty = 0; apply(animate); }
  function reset() {
    if (opened) { home(); return; }
    opened = true;
    measure();
    s = base;
    // Start exactly over the picture on the page, then glide to the centre.
    if (start?.width > 0) { tx = start.left; ty = start.top; img.style.transform = `translate(${tx}px,${ty}px) scale(${start.width / nat().w})`; label.textContent = Math.round(s * 100) + '%'; win.requestAnimationFrame(() => win.requestAnimationFrame(() => { tx = 0; ty = 0; apply(true); })); }
    else apply();
  }
  const center = () => { const {w} = size(), {top, bottom} = band(); return [w / 2, (top + bottom) / 2]; };

  function show(i) {
    index = i;
    const item = items[index];
    img.alt = item.alt ?? alt;
    const details = item.info ?? info;
    infoButton.hidden = !details;
    panel.innerHTML = details ? infoHTML(details) : '';
    if (!details) { panel.hidden = true; infoButton.setAttribute('aria-pressed', 'false'); }
    if (count) count.textContent = `${index + 1} / ${items.length}`;
    const prev = root.querySelector('[data-v=prev]'), next = root.querySelector('[data-v=next]');
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === items.length - 1;
    if (img.getAttribute('src') !== item.src) img.src = item.src;
    gallery?.onIndex?.(index);
  }
  img.addEventListener('load', () => reset());
  show(index);
  if (img.complete && img.naturalWidth) reset();

  function close() {
    if (closed) return;
    closed = true;
    win.clearTimeout(tapTimer); win.clearTimeout(wheelTimer);
    root.remove();
    win.removeEventListener('resize', onResize);
    doc.removeEventListener('keydown', onKey, true);
    if (focus?.isConnected) focus.focus?.({preventScroll: true});
  }
  function setChrome(on) {
    chrome = on;
    root.dataset.chrome = on ? 'on' : 'off';
    if (s <= Math.max(base, fit) * 1.01) home(true); else apply(true);
  }
  const onResize = () => home();
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === '+' || e.key === '=') zoomAt(s * 1.25, ...center(), true);
    else if (e.key === '-') zoomAt(s / 1.25, ...center(), true);
    else if (paged && e.key === 'ArrowLeft' && index > 0) { start = null; show(index - 1); }
    else if (paged && e.key === 'ArrowRight' && index < items.length - 1) { start = null; show(index + 1); }
  };
  win.addEventListener('resize', onResize);
  doc.addEventListener('keydown', onKey, true);

  const onChrome = e => e.target.closest('.sttts-viewer-top,.sttts-viewer-bar,.sttts-viewer-info,.sttts-viewer-caption');
  root.addEventListener('wheel', e => {
    if (onChrome(e)) return;
    e.preventDefault();
    const r = root.getBoundingClientRect();
    zoomAt(s * Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top, false, true);
    win.clearTimeout(wheelTimer);
    wheelTimer = win.setTimeout(settle, 220);
  }, {passive: false});
  root.addEventListener('pointerdown', e => {
    if (onChrome(e)) return;
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY});
    try { root.setPointerCapture?.(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    root.toggleAttribute('data-dragging', true);
    gesture = null;
  });
  root.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const r = root.getBoundingClientRect();
    if (pointers.size === 1) {
      tx += e.clientX - p.x; ty += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 10) p.moved = true;
      apply();
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    if (gesture) {
      tx += mx - gesture.mx; ty += my - gesture.my;
      zoomAt(s * dist / gesture.dist, mx, my, false, true);
    }
    gesture = {dist, mx, my};
    lastTap = null;
  });
  const end = e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const tap = pointers.size === 1 && gesture === null && !p.moved, pinched = pointers.size >= 2;
    pointers.delete(e.pointerId);
    gesture = null;
    if (!pointers.size) root.removeAttribute('data-dragging');
    // A pinch let go below the screen size: back to it, like a phone's album.
    if (pinched) { settle(); return; }
    // Several pictures, not zoomed in: a swipe sideways is the one before or after.
    if (paged && e.type === 'pointerup' && p.moved && !pointers.size && s <= Math.max(base, fit) * 1.05) {
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const next = index + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < items.length) { start = null; show(next); } else home(true);
        return;
      }
    }
    if (e.type !== 'pointerup' || !tap) return;
    const r = root.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = Date.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      win.clearTimeout(tapTimer);
      if (s > base * 1.05) home(true); else zoomAt(base * 2.5, x, y, true);
    } else {
      lastTap = {t: now, x: e.clientX, y: e.clientY};
      // A single tap (no second tap follows) hides or shows the bars.
      win.clearTimeout(tapTimer);
      tapTimer = win.setTimeout(() => { if (lastTap?.t === now) setChrome(!chrome); }, 330);
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = b.dataset.v;
    if (v === 'close') close();
    else if (v === 'info') { panel.hidden = !panel.hidden; b.setAttribute('aria-pressed', String(!panel.hidden)); }
    else if (v === 'prev' && index > 0) { start = null; show(index - 1); }
    else if (v === 'next' && index < items.length - 1) { start = null; show(index + 1); }
    else if (v === 'in') zoomAt(s * 1.5, ...center(), true);
    else if (v === 'out') zoomAt(s / 1.5, ...center(), true);
    else if (v === 'full') zoomAt(1, ...center(), true);
    else if (b.dataset.action !== undefined) {
      const result = await actions[Number(b.dataset.action)].run(index);
      if (result !== false) close();
    }
  });
  root.dataset.chrome = 'on';
  root.querySelector('[data-v=close]').focus({preventScroll: true});
  return {close, get scale() { return s; }, get index() { return index; }};
}

// 相册浏览: a photo full screen inside the phone, like a phone's own album. Swipe (or ‹ ›, or the arrow keys) for the one
// before and after; a tap hides the bars. The photo zooms where it is: pinch (or the wheel), a double tap to 2.5× and
// back, drag to look around while zoomed; pinched smaller than the screen it springs back. 放大 opens the zoom viewer
// (with 参数 for a drawn picture). Pictures load as they are needed:
// the one shown and the ones beside it.
import {icon} from './icons.js';
import {esc} from './common.js';
import {openImageViewer} from '../image-viewer.js';
import {fly} from './carry.js';

const SLIDE = 100 / 3;

/**
 * ids: the photos in order; load(id) → {blob, name, size}. actions: [{key, icon, label, danger, run(id)}]; a run that
 * resolves to 'removed' takes the photo out of the row (the next one shows; none left closes). from: where the photo
 * was tapped (a rect); the picture grows out of it once it has loaded (ui/carry.js).
 */
export function openAlbum({ctx, host, ids, index = 0, load, actions = [], from = null, onClose = () => {}}) {
  const {doc, win} = ctx;
  let list = ids.slice(), at = Math.min(list.length - 1, Math.max(0, index)), closed = false, moving = false, chrome = true;
  const urls = new Map(), names = new Map(), infos = new Map();
  const root = doc.createElement('div');
  root.className = 'album-viewer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '照片');
  root.dataset.chrome = 'on';
  root.innerHTML = `<div class="album-stage"><div class="album-track">${[0, 1, 2].map(i => `<figure class="album-slide" data-slot="${i}"><img alt="" draggable="false" hidden></figure>`).join('')}</div></div>
    <header class="album-top"><button type="button" class="album-round" data-av="close" aria-label="返回相册">${icon('back')}</button><span class="album-title"><b data-av-count aria-live="polite"></b><small data-av-name></small></span><button type="button" class="album-round" data-av="zoom" aria-label="放大查看">${icon('search')}</button></header>
    <button type="button" class="album-arrow prev" data-av="prev" aria-label="上一张">${icon('back')}</button><button type="button" class="album-arrow next" data-av="next" aria-label="下一张">${icon('next')}</button>
    <footer class="album-bar">${actions.map((a, i) => `<button type="button" data-av-action="${i}" data-album="${esc(a.key || '')}"${a.danger ? ' class="album-danger"' : ''}>${icon(a.icon || 'star')}<span>${esc(a.label)}</span></button>`).join('')}</footer>`;
  host.append(root);
  const track = root.querySelector('.album-track'), stage = root.querySelector('.album-stage'), slots = [...root.querySelectorAll('.album-slide img')];

  async function ensure(id) {
    if (urls.has(id)) return urls.get(id);
    const photo = await load(id);
    if (closed || !photo) return null;
    if (urls.has(id)) return urls.get(id);
    const url = win.URL.createObjectURL(photo.blob);
    urls.set(id, url); names.set(id, photo.name || ''); if (photo.info?.length) infos.set(id, photo.info);
    return url;
  }
  /** The first picture grows out of the tapped thumbnail, once, when it can be measured. */
  let start = from;
  function grown(img) {
    if (!start) return;
    const rect = start; start = null;
    const go = () => fly(win, img, rect, {duration: 340, easing: 'soft'});
    if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, {once: true});
  }
  /** The three slides: the one before, this one, the one after; pictures further away are let go. */
  function fill() {
    const want = [at - 1, at, at + 1];
    want.forEach((i, slot) => {
      const img = slots[slot], id = list[i];
      img.dataset.id = id || '';
      if (!id) { img.hidden = true; img.removeAttribute('src'); return; }
      const ready = urls.get(id);
      if (ready) { img.src = ready; img.hidden = false; img.alt = names.get(id) || ''; }
      else {
        img.hidden = true;
        ensure(id).then(url => { if (url && img.dataset.id === id) { img.src = url; img.hidden = false; img.alt = names.get(id) || ''; if (id === list[at]) { title(); grown(img); } } }).catch(() => {});
      }
    });
    for (const [id, url] of urls) if (Math.abs(list.indexOf(id) - at) > 2) { win.URL.revokeObjectURL(url); urls.delete(id); }
    track.style.transform = `translateX(-${SLIDE}%)`;
    for (const img of slots) { img.style.transform = ''; img.style.transition = ''; }
    z = 1; zx = 0; zy = 0; root.removeAttribute('data-zoomed');
    title();
  }
  function title() {
    root.querySelector('[data-av-count]').textContent = `${at + 1} / ${list.length}`;
    root.querySelector('[data-av-name]').textContent = names.get(list[at]) || '';
    root.querySelector('[data-av=prev]').disabled = at <= 0;
    root.querySelector('[data-av=next]').disabled = at >= list.length - 1;
  }
  /** Slides to the one before (-1) or after (+1). */
  function go(step) {
    const next = at + step;
    if (moving || next < 0 || next >= list.length) { settle(); return; }
    moving = true;
    track.classList.add('settle');
    track.style.transform = `translateX(-${SLIDE * (1 + step)}%)`;
    let done = false;
    const finish = () => { if (done || closed) return; done = true; track.classList.remove('settle'); at = next; moving = false; fill(); };
    track.addEventListener('transitionend', finish, {once: true});
    win.setTimeout(finish, 320);
  }
  // ---------- Zooming in place ----------
  let z = 1, zx = 0, zy = 0, pinch = null, wheelTimer = 0;
  const pointers = new Map();
  const box = () => ({w: stage.clientWidth || 1, h: stage.clientHeight || 1});
  function paint(animate = false) {
    const img = slots[1];
    img.style.transition = animate ? 'transform .32s var(--spring-soft, cubic-bezier(.23,1,.32,1))' : 'none';
    img.style.transform = z === 1 && !zx && !zy ? '' : `translate(${zx}px,${zy}px) scale(${z})`;
    root.toggleAttribute('data-zoomed', z > 1.01);
  }
  /** Keeps the zoomed photo over the screen: no empty band where it could still cover. */
  function bound() {
    const img = slots[1], {w, h} = box(), mx = Math.max(0, (img.offsetWidth * z - w) / 2), my = Math.max(0, (img.offsetHeight * z - h) / 2);
    zx = Math.min(mx, Math.max(-mx, zx)); zy = Math.min(my, Math.max(-my, zy));
  }
  /** To scale `next`, keeping the point (x, y) of the stage where it is. loose: a pinch may go below 1 for a moment. */
  function zoomAt(next, x, y, {loose = false, animate = false} = {}) {
    next = Math.min(5, Math.max(loose ? .6 : 1, next));
    const r = stage.getBoundingClientRect(), cx = x - r.left - box().w / 2, cy = y - r.top - box().h / 2;
    zx = cx - (cx - zx) * next / z; zy = cy - (cy - zy) * next / z; z = next;
    if (!loose) bound();
    paint(animate);
  }
  function unzoom(animate = true) { z = 1; zx = 0; zy = 0; paint(animate); }
  /** Let go smaller than the screen: back to it. */
  function release() { if (z < 1) unzoom(); else { bound(); paint(true); } }
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(z * Math.exp(-e.deltaY * .0015), e.clientX, e.clientY, {loose: true});
    win.clearTimeout(wheelTimer);
    wheelTimer = win.setTimeout(release, 220);
  }, {passive: false});

  function settle() { track.classList.add('settle'); track.style.transform = `translateX(-${SLIDE}%)`; win.setTimeout(() => track.classList.remove('settle'), 300); }
  function setChrome(on) { chrome = on; root.dataset.chrome = on ? 'on' : 'off'; }
  function zoom() {
    const img = slots[1];
    if (!img.getAttribute('src')) return;
    // A drawn picture shows how it was made under 参数.
    openImageViewer({doc, src: img.src, alt: img.alt, from: img, info: infos.get(img.dataset.id) || null});
  }

  // ---------- Swiping and tapping ----------
  let drag = null, lastTap = 0, tapTimer = 0;
  stage.addEventListener('pointerdown', e => {
    if (e.button > 0 || moving) return;
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    try { stage.setPointerCapture?.(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    if (pointers.size === 2) {
      // Two fingers: a pinch, not a swipe.
      if (drag?.side) settle();
      drag = null; lastTap = 0;
      const [a, b] = [...pointers.values()];
      pinch = {dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      return;
    }
    if (pointers.size > 2) return;
    drag = {id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: Date.now(), dx: 0, side: false, pan: z > 1.01};
  });
  stage.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zx += mx - pinch.x; zy += my - pinch.y;
      zoomAt(z * dist / pinch.dist, mx, my, {loose: true});
      pinch = {dist, x: mx, y: my};
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    // Zoomed in: the finger moves the photo around instead of turning to the next one.
    if (drag.pan) { zx += e.clientX - drag.x; zy += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; bound(); paint(); if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 10) drag.moved = true; return; }
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.side && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) drag.side = true;
    if (!drag.side) return;
    // Past the first or the last photo it only gives a little.
    const edge = (dx > 0 && at <= 0) || (dx < 0 && at >= list.length - 1);
    drag.dx = edge ? dx * 0.35 : dx;
    track.style.transform = `translateX(calc(-${SLIDE}% + ${drag.dx}px))`;
  });
  const end = e => {
    const pinched = !!pinch;
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; release(); }
    if (pinched) { drag = null; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.pan && d.moved) return;
    if (d.side) {
      const width = stage.clientWidth || 300, fast = Math.abs(d.dx) / Math.max(1, Date.now() - d.t0) > 0.5;
      if (e.type === 'pointerup' && (Math.abs(d.dx) > width * 0.18 || (fast && Math.abs(d.dx) > 30))) go(d.dx < 0 ? 1 : -1);
      else settle();
      return;
    }
    if (e.type !== 'pointerup' || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) return;
    // One tap hides or shows the bars; two quick taps zoom in there, or back out.
    const now = Date.now();
    win.clearTimeout(tapTimer);
    if (now - lastTap < 300) { lastTap = 0; if (z > 1.01) unzoom(); else zoomAt(2.5, e.clientX, e.clientY, {animate: true}); return; }
    lastTap = now;
    tapTimer = win.setTimeout(() => { if (lastTap === now) setChrome(!chrome); }, 300);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  const onKey = e => {
    if (doc.querySelector('.sttts-viewer, .overlay')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  doc.addEventListener('keydown', onKey, true);
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    const v = b.dataset.av;
    if (v === 'close') return close();
    if (v === 'prev') return go(-1);
    if (v === 'next') return go(1);
    if (v === 'zoom') return zoom();
    const action = actions[Number(b.dataset.avAction)];
    if (!action) return;
    const id = list[at];
    try {
      b.disabled = true;
      const result = await action.run(id);
      if (result === 'removed' && !closed) {
        const gone = urls.get(id);
        if (gone) { win.URL.revokeObjectURL(gone); urls.delete(id); }
        list = list.filter(x => x !== id);
        if (!list.length) return close();
        at = Math.min(at, list.length - 1);
        fill();
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
    finally { if (b.isConnected) b.disabled = false; }
  });

  function close() {
    if (closed) return;
    closed = true;
    win.clearTimeout(tapTimer); win.clearTimeout(wheelTimer);
    doc.removeEventListener('keydown', onKey, true);
    for (const url of urls.values()) win.URL.revokeObjectURL(url);
    urls.clear();
    root.remove();
    onClose();
  }
  fill();
  root.querySelector('[data-av=close]').focus({preventScroll: true});
  return {close, get index() { return at; }, get id() { return list[at]; }, get open() { return !closed; }, go};
}

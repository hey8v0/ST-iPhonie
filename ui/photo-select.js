// 按住一滑: picking photos the way a phone's album does. A finger held on a photo starts choosing with it; moved on, it
// picks everything between where it began and where it is now, and moved back those let go again. While choosing, a
// sideways move does the same at once (up and down still scrolls), and so does any drag with a mouse. Near the top or
// the bottom of the page it scrolls by itself. Nothing is drawn anew meanwhile: the grid stays under the finger.
const HOLD = 320, SLOP = 8, EDGE = 72, SPEED = 14;

/**
 * root: what holds the tiles, for as long as it lives. order(): the ids in order. picked(id), pick(id, on): what is chosen.
 * choosing(): whether choosing is on; begin(): turns it on. changed(): picks changed, show them. scroller: what scrolls;
 * covered(): how much of its bottom a bar covers.
 * Returns {active: a finger is picking now, justEnded(): the click that ends a gesture is not a tap}.
 */
export function slideSelect({ctx, root, tiles = '.photo-grid [data-id]', scroller = root, order, picked, pick, choosing, begin = () => {}, changed = () => {}, covered = () => 0}) {
  const {win, doc} = ctx;
  let press = null, endedAt = 0;
  const buzz = () => { try { win.navigator?.vibrate?.(8); } catch { /* none */ } };
  const tileAt = (x, y) => doc.elementFromPoint?.(x, y)?.closest?.(tiles) || null;
  function start(p) {
    win.clearTimeout(p.timer);
    if (!choosing()) begin();
    const ids = order(), at = ids.indexOf(p.id);
    if (at < 0) { press = null; return; }
    Object.assign(p, {mode: 'paint', ids, anchor: at, last: at, lo: at, hi: at, adding: !picked(p.id), before: new Set(ids.filter(picked))});
    pick(p.id, p.adding);
    changed();
    buzz();
    try { root.setPointerCapture?.(p.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    p.frame = win.requestAnimationFrame(() => roll(p));
  }
  /** The finger is over this tile: from where it began to here is picked, what is no longer between goes back to how it was. */
  function reach(p, x, y) {
    const el = tileAt(x, y), k = el ? p.ids.indexOf(el.dataset.id) : -1;
    if (k < 0 || k === p.last) return;
    p.last = k;
    const lo = Math.min(p.anchor, k), hi = Math.max(p.anchor, k);
    for (let i = Math.min(lo, p.lo); i <= Math.max(hi, p.hi); i++) pick(p.ids[i], i >= lo && i <= hi ? p.adding : p.before.has(p.ids[i]));
    p.lo = lo; p.hi = hi;
    changed();
  }
  /** Near an edge of the page it scrolls by itself, and what comes under the finger is picked. */
  function roll(p) {
    if (press !== p) return;
    const box = scroller.getBoundingClientRect(), top = box.top + EDGE, bottom = box.bottom - covered() - EDGE;
    const step = p.y2 < top ? -(top - p.y2) / EDGE : p.y2 > bottom ? (p.y2 - bottom) / EDGE : 0;
    if (step) { scroller.scrollTop += Math.max(-1.5, Math.min(1.5, step)) * SPEED; reach(p, p.x2, p.y2); }
    p.frame = win.requestAnimationFrame(() => roll(p));
  }
  root.addEventListener('pointerdown', e => {
    if (e.button > 0 || press) return;
    const el = e.target.closest?.(tiles);
    if (!el) return;
    const p = press = {id: el.dataset.id, pointerId: e.pointerId, mouse: e.pointerType === 'mouse', x: e.clientX, y: e.clientY, x2: e.clientX, y2: e.clientY, mode: ''};
    p.timer = win.setTimeout(() => { if (press === p && !p.mode) start(p); }, HOLD);
  });
  root.addEventListener('pointermove', e => {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    p.x2 = e.clientX; p.y2 = e.clientY;
    if (p.mode) { reach(p, e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
    // Moved before it was held: while choosing, a drag picks; otherwise the page is being scrolled.
    if (choosing() && (p.mouse || Math.abs(dx) > Math.abs(dy) * 1.2)) { start(p); if (press === p) reach(p, e.clientX, e.clientY); return; }
    win.clearTimeout(p.timer);
    press = null;
  });
  const lift = e => {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    press = null;
    win.clearTimeout(p.timer);
    if (!p.mode) return;
    win.cancelAnimationFrame(p.frame);
    endedAt = Date.now();
    try { root.releasePointerCapture?.(p.pointerId); } catch { /* already let go */ }
  };
  root.addEventListener('pointerup', lift);
  root.addEventListener('pointercancel', lift);
  // While a finger picks, the page must not scroll under it.
  root.addEventListener('touchmove', e => { if (press?.mode && e.cancelable) e.preventDefault(); }, {passive: false});
  // A finger held would bring the browser's own menu for the picture.
  root.addEventListener('contextmenu', e => { if (press) e.preventDefault(); });
  return {get active() { return !!press?.mode; }, justEnded: () => Date.now() - endedAt < 350};
}

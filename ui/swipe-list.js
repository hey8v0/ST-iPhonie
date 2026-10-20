// Rows that swipe the way Procreate's layers do. Swiped left, a row slides aside and its actions pop out one after
// another (a quick flick is enough); swiped right, it is picked (swiped right again, let go), and with rows picked a
// bar comes for what to do with them all. A tap does what a tap did before. One row is open at a time; touching anything else
// closes it. The list scrolls as usual: only a sideways move takes the row.
// With a mouse the same is at hand without swiping: a ⋯ on the row under the pointer (or the right button) opens its
// actions, and Ctrl / ⌘ / Shift with a click picks rows, as when choosing files.
//
// swipeRow(id, inner, actions) writes a row; mountSwipeList(list, options) brings every row under `list` to life, also
// the ones drawn later (a paged list, a list drawn again).
import {esc} from './common.js';
import {icon} from './icons.js';

const PICK = 56, BUTTON = 64, GAP = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** How far a row slides past where it stops: less and less the further it is pulled. */
const rubber = (over, room = 90) => room * (1 - Math.exp(-over / room));
const width = n => n * (BUTTON + GAP) + GAP;

/** actions: [{key, label, icon, danger}] shown from left to right behind the row. */
export function swipeRow(id, inner, actions = [], {className = '', label = ''} = {}) {
  const n = actions.length;
  return `<div class="sw-row${className ? ' ' + className : ''}" data-swipe="${esc(id)}" style="--sw-w:${width(n)}px">`
    + `<div class="sw-actions">${actions.map((a, i) => `<button type="button" class="sw-act${a.danger ? ' danger' : ''}" data-sw-act="${esc(a.key)}" style="--i:${n - 1 - i}" tabindex="-1" aria-label="${esc(a.label)}${label ? ' ' + esc(label) : ''}">${icon(a.icon || 'star')}<span>${esc(a.label)}</span></button>`).join('')}</div>`
    + `<div class="sw-main"><span class="sw-check" aria-hidden="true">${icon('check')}</span><div class="sw-body">${inner}</div>`
    + (n ? `<button type="button" class="sw-more" data-sw-more aria-label="更多操作${label ? ' ' + esc(label) : ''}" aria-expanded="false">⋯</button>` : '') + `</div></div>`;
}

/**
 * list: the element holding the rows. onAction(key, id, button): an action behind a row was tapped. onTap(id, event):
 * a row was tapped (not on a button of its own). bulk: [{key, label, icon, danger}] for the choosing bar;
 * onBulk(key, ids): one of them (choosing ends when it resolves). Returns {close(), done(), get chosen()}.
 */
export function mountSwipeList(list, {ctx, onAction = () => {}, onTap = null, bulk = [], onBulk = () => {}, hint = '', mouseHint = ''} = {}) {
  const win = ctx.win, doc = ctx.doc;
  let open = null, press = null, chosen = null, suppress = 0;
  const rows = () => [...list.querySelectorAll('.sw-row[data-swipe]')];
  const rowOf = id => rows().find(r => r.dataset.swipe === id) || null;
  const buzz = () => { try { win.navigator?.vibrate?.(8); } catch { /* none */ } };
  const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const room = row => parseFloat(row.style.getPropertyValue('--sw-w')) || width(row.querySelectorAll('.sw-act').length);

  /** A row to where it rests (0: closed; -room: open), with a spring. */
  function settle(row, to) {
    const main = row.querySelector('.sw-main');
    row.classList.remove('sw-drag');
    main.style.transition = reduced() ? 'none' : '';
    main.style.transform = to ? `translateX(${to}px)` : '';
    row.style.setProperty('--sw-p', to ? '1' : '0');
    row.style.setProperty('--sw-r', '0');
    row.classList.toggle('sw-open', !!to);
    row.querySelector('.sw-more')?.setAttribute('aria-expanded', String(!!to));
    for (const b of row.querySelectorAll('.sw-act')) b.tabIndex = to ? 0 : -1;
  }
  function close() { if (open?.isConnected) settle(open, 0); open = null; }
  function openRow(row) { if (open && open !== row) close(); open = row; settle(row, -room(row)); }

  // ---------- choosing several ----------
  const bar = doc.createElement('div');
  bar.className = 'sw-bar' + (bulk.length > 2 ? ' many' : ''); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '多选'); bar.hidden = true;
  bar.innerHTML = `<button type="button" class="sw-bar-all" data-sw-bulk="all">全选</button><span class="sw-count" aria-live="polite"></span><span class="sw-bar-gap"></span>`
    + bulk.map(b => `<button type="button" class="sw-bar-act${b.danger ? ' danger' : ''}" data-sw-bulk="${esc(b.key)}" aria-label="${esc(b.label)}">${icon(b.icon || 'star')}<span>${esc(b.label)}</span></button>`).join('')
    + `<button type="button" class="sw-bar-done" data-sw-bulk="done">完成</button>`;
  list.after(bar);
  // The hint for the way this device is used: swiping on a touch screen, ⋯ and Ctrl with a mouse.
  const mouse = !!win.matchMedia?.('(hover: hover) and (pointer: fine)').matches, said = mouse ? mouseHint || hint : hint;
  if (said) { const p = doc.createElement('p'); p.className = 'hint sw-hint'; p.textContent = said; bar.after(p); }
  function paintChoice() {
    list.classList.toggle('sw-choosing', !!chosen);
    for (const r of rows()) { const on = !!chosen?.has(r.dataset.swipe); r.classList.toggle('sw-chosen', on); r.setAttribute('aria-selected', String(on)); }
    if (chosen) { bar.hidden = false; bar.querySelector('.sw-count').textContent = `已选 ${chosen.size} 项`; for (const b of bar.querySelectorAll('.sw-bar-act')) b.disabled = !chosen.size; }
    else if (!bar.hidden) { bar.classList.add('sw-leaving'); win.setTimeout(() => { if (!chosen) { bar.hidden = true; bar.classList.remove('sw-leaving'); } }, reduced() ? 0 : 220); }
  }
  /** A row picked, or let go when it was picked; the last one let go ends choosing. */
  function pick(id) { close(); chosen ??= new Set(); if (chosen.has(id)) chosen.delete(id); else chosen.add(id); buzz(); if (!chosen.size) chosen = null; paintChoice(); }
  function done() { chosen = null; paintChoice(); }
  bar.addEventListener('click', async e => {
    const b = e.target.closest('[data-sw-bulk]');
    if (!b || !chosen) return;
    const key = b.dataset.swBulk;
    if (key === 'done') return done();
    if (key === 'all') { const ids = rows().map(r => r.dataset.swipe); chosen = chosen.size === ids.length ? new Set() : new Set(ids); return paintChoice(); }
    if (!chosen.size) return;
    b.disabled = true;
    try { await onBulk(key, [...chosen]); done(); } catch (error) { ctx.notify?.(error.message, {error: true}); } finally { b.disabled = false; }
  });
  // Rows drawn again (another page, the list drawn anew) take their state back.
  const watch = new win.MutationObserver(() => { if (open && !open.isConnected) open = null; paintChoice(); });
  watch.observe(list, {childList: true, subtree: true});

  // ---------- a finger on a row ----------
  list.addEventListener('pointerdown', e => {
    const main = e.target.closest('.sw-main');
    if (!main || e.button > 0 || press || e.target.closest('.sw-more')) return;
    const row = main.closest('.sw-row');
    press = {id: e.pointerId, x: e.clientX, y: e.clientY, row, main, mode: '', start: open === row ? -room(row) : 0, at: Date.now(), vx: 0, last: {x: e.clientX, t: e.timeStamp || Date.now()}, crossed: false};
  });
  list.addEventListener('pointermove', e => {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        p.mode = 'swipe';
        if (open && open !== p.row) close();
        p.row.classList.add('sw-drag');
        p.main.style.transition = 'none';
        try { p.main.setPointerCapture(e.pointerId); } catch { /* fine */ }
      } else if (Math.abs(dy) > 8) { press = null; return; }
      else return;
    }
    const w = room(p.row), raw = p.start + dx;
    const canPick = bulk.length > 0 && p.start === 0;
    let x = raw;
    if (raw < -w) x = -w - rubber(-w - raw, 40);
    else if (raw > 0) x = canPick ? rubber(raw, 110) : rubber(raw, 24);
    if (!w && raw < 0) x = -rubber(-raw, 24);
    p.x2 = x;
    p.main.style.transform = `translateX(${x}px)`;
    p.row.style.setProperty('--sw-p', String(clamp(-x / (w || 1), 0, 1.15)));
    p.row.style.setProperty('--sw-r', String(clamp(x / PICK, 0, 1)));
    // A small tap of the phone when letting go would open the row, or pick it.
    const past = (w && x < -w / 2) || (canPick && x > PICK);
    if (past !== p.crossed) { p.crossed = past; if (past) buzz(); }
    const t = e.timeStamp || Date.now();
    if (t > p.last.t) { p.vx = (e.clientX - p.last.x) / (t - p.last.t); p.last = {x: e.clientX, t}; }
  });
  // While a row is being swiped the list must not scroll sideways or bounce.
  list.addEventListener('touchmove', e => { if (press?.mode === 'swipe' && e.cancelable) e.preventDefault(); }, {passive: false});
  const release = e => {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    press = null;
    if (p.mode !== 'swipe') return;
    suppress = Date.now();
    const w = room(p.row), x = p.x2 ?? 0, fresh = (e.timeStamp || Date.now()) - p.last.t < 90, v = fresh ? p.vx : 0;
    if (e.type === 'pointercancel') return settle(p.row, open === p.row ? -w : 0);
    if (bulk.length && p.start === 0 && (x > PICK || (v > .5 && x > 16))) { settle(p.row, 0); return pick(p.row.dataset.swipe); }
    if (w && (v < -.35 || (v <= .35 && x < -w / 2))) return openRow(p.row);
    settle(p.row, 0);
    if (open === p.row) open = null;
  };
  list.addEventListener('pointerup', release);
  list.addEventListener('pointercancel', release);

  // ---------- taps ----------
  list.addEventListener('click', e => {
    const row = e.target.closest('.sw-row');
    if (!row) return;
    // The click that ends a swipe is not a tap.
    if (Date.now() - suppress < 350) { e.preventDefault(); e.stopPropagation(); return; }
    const more = e.target.closest('.sw-more');
    if (more) { e.preventDefault(); e.stopPropagation(); if (chosen) return; if (open === row) close(); else { openRow(row); row.querySelector('.sw-act')?.focus({preventScroll: true}); } return; }
    // Ctrl / ⌘ / Shift and a click: picking rows, with a mouse.
    if (bulk.length && (e.ctrlKey || e.metaKey || e.shiftKey) && !e.target.closest('.sw-act')) { e.preventDefault(); e.stopPropagation(); pick(row.dataset.swipe); return; }
    const act = e.target.closest('.sw-act');
    if (act) { e.preventDefault(); e.stopPropagation(); const id = row.dataset.swipe; close(); onAction(act.dataset.swAct, id, act); return; }
    if (chosen) { e.preventDefault(); e.stopPropagation(); pick(row.dataset.swipe); return; }
    if (open) { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (onTap && !e.target.closest('button, a, input, select, textarea, label')) onTap(row.dataset.swipe, e);
  }, true);
  // A mouse: the right button opens a row's actions.
  list.addEventListener('contextmenu', e => { const row = e.target.closest('.sw-row'); if (!row || !row.querySelector('.sw-act')) return; e.preventDefault(); if (open === row) close(); else openRow(row); });
  list.addEventListener('keydown', e => {
    const row = e.target.closest('.sw-row');
    if (e.key === 'Escape') { if (open) { close(); e.stopPropagation(); } else if (chosen) { done(); e.stopPropagation(); } return; }
    if (!row || e.target.closest('.sw-act')) return;
    if (e.key === 'ArrowLeft' && row.querySelector('.sw-act')) { e.preventDefault(); openRow(row); row.querySelector('.sw-act')?.focus(); }
    else if (e.key === 'ArrowRight' && open === row) { e.preventDefault(); close(); }
  });
  const outside = e => { if (open && !open.contains(e.target)) close(); };
  doc.addEventListener('pointerdown', outside, true);
  return {
    close, done,
    get chosen() { return chosen ? [...chosen] : null; },
    dispose() { watch.disconnect(); doc.removeEventListener('pointerdown', outside, true); bar.remove(); },
  };
}

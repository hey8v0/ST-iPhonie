// What the games share: best scores (this browser), the theme's colours for drawing, swipes and the arrow pad, canvases
// sharp on any screen, and a loop that stops when the game is left.

const KEY = 'st-iphonie-games';
/** Best scores and saved games, per browser (only a convenience: a private window keeps none). */
export function store(win, report = () => {}) {
  // A storage that fails is told once (to the 日志), not on every move.
  let readFailed = false, writeFailed = false;
  const read = () => {
    try { const value = JSON.parse(win.localStorage.getItem(KEY) || '{}') || {}; readFailed = false; return value; }
    catch (error) { if (!readFailed) { readFailed = true; report({kind: '小游戏存档读取', message: error.message}); } return {}; }
  };
  const write = all => {
    try { win.localStorage.setItem(KEY, JSON.stringify(all)); writeFailed = false; }
    catch (error) { if (!writeFailed) { writeFailed = true; report({kind: '小游戏存档保存', message: error.message}); } }
  };
  return {
    best: id => Number(read()[id]?.best) || 0,
    /** Keeps the score when it beats the best; true when it did. lower: smaller is better (times, moves). */
    offer(id, score, {lower = false} = {}) {
      const all = read(), was = Number(all[id]?.best) || 0;
      if (!(score > 0) || (was && (lower ? score >= was : score <= was))) return false;
      all[id] = {...all[id], best: score}; write(all); return true;
    },
    played(id) { const all = read(); all[id] = {...all[id], plays: (Number(all[id]?.plays) || 0) + 1}; write(all); },
    /** The game left off (its state), to go on with next time; null when there is none. */
    saved: id => read()[id]?.saved || null,
    keep(id, state) { const all = read(); if (state) all[id] = {...all[id], saved: state}; else if (all[id]) delete all[id].saved; write(all); },
  };
}

/** A colour of the theme (CSS variable on the phone), for canvas drawing. */
export const color = (el, name, fallback) => (el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(name) || '').trim() || fallback;

/** A canvas w×h CSS pixels, drawn at the screen's density. Returns {canvas, g}. */
export function canvas(doc, w, h) {
  const c = doc.createElement('canvas'), ratio = Math.min(3, doc.defaultView.devicePixelRatio || 1);
  c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const g = c.getContext('2d');
  g?.scale?.(ratio, ratio);
  return {canvas: c, g};
}

/**
 * Swipes on el: fn('up'|'down'|'left'|'right'). Short taps are left alone (tap(x, y, event) if given, in el's pixels).
 * The page does not scroll under the finger.
 */
export function swipes(el, fn, {tap = null, min = 22} = {}) {
  let start = null, swiped = 0;
  el.style.touchAction = 'none';
  // The click that a swipe ends with is not a tap on what it ended over.
  el.addEventListener('click', e => { if (Date.now() - swiped < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('pointerdown', e => { start = {x: e.clientX, y: e.clientY, id: e.pointerId}; });
  el.addEventListener('pointerup', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) { if (tap) { const r = el.getBoundingClientRect(); tap(e.clientX - r.left, e.clientY - r.top, e); } return; }
    swiped = Date.now();
    fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  el.addEventListener('pointercancel', () => { start = null; });
}

export const ARROWS = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'};
const ARROW = {up: 'M12 6l-6 7h12z', down: 'M12 18l-6-7h12z', left: 'M6 12l7-6v12z', right: 'M18 12l-7-6v12z'};
/**
 * On-screen arrows (and extra buttons): [data-pad=dir]. row: one row (← ↑ ↓ → and the extras) instead of a cross.
 * labels: words in place of an arrow, by direction ({up: '转'}).
 */
export function pad(extra = '', {row = false, labels = {}} = {}) {
  const b = d => `<button type="button" class="pad-key pad-${d}" data-pad="${d}" aria-label="${labels[d] || ({up: '上', down: '下', left: '左', right: '右'})[d]}">${labels[d] || `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW[d]}" fill="currentColor"/></svg>`}</button>`;
  return `<div class="game-pad${row ? ' row' : ''}">${b('up')}${b('left')}${b('right')}${b('down')}${extra}</div>`;
}
/** Presses on the pad: fn(dir, again) — again: a repeat while held. hold: ms between repeats (0: once). */
export function padKeys(root, fn, {hold = 0} = {}) {
  const win = root.ownerDocument.defaultView;
  let timer = 0;
  const stop = () => { win.clearInterval(timer); timer = 0; };
  root.addEventListener('pointerdown', e => {
    const k = e.target.closest('[data-pad]');
    if (!k) return;
    e.preventDefault();
    fn(k.dataset.pad);
    stop();
    if (hold) timer = win.setInterval(() => fn(k.dataset.pad, true), hold);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(t, stop);
  return stop;
}

/** A loop calling step(dt in ms) every frame while running; start/stop. */
export function loop(win, step) {
  let raf = 0, last = 0, on = false;
  const frame = now => { if (!on) return; const dt = last ? Math.min(100, now - last) : 16; last = now; step(dt); raf = win.requestAnimationFrame(frame); };
  return {
    start() { if (on) return; on = true; last = 0; raf = win.requestAnimationFrame(frame); },
    stop() { on = false; win.cancelAnimationFrame(raf); },
    get running() { return on; },
  };
}

/** A whole number 0 ≤ n < max. */
export const rand = max => Math.floor(Math.random() * max);
/** The list in a random order (a new list). */
export function shuffle(list) { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = rand(i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out; }

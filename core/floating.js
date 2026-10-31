// ST-iPhonie floating entry. Plain DOM (no shadow root) so that dock/organizer scripts can clone its look
// and forward clicks to it; every rule in floating.css is scoped under #sttts-floating.
// Two forms. On a computer or a tablet: the round ball, which tucks behind the screen edge when left alone. On a phone
// (a small touch screen, where the phone opens full screen): a small bar on the screen edge; a tap turns it into a
// block, a tap on the block opens the phone, and while a line plays the bar sends sound waves out from the edge. In
// both, the five bars of the wave follow how loud the voice is (BrowserAudio.levels) and bounce on springs.
// The phone's bar is played by the browser itself. A move's springs are worked out ahead, when it starts, into keyframes
// of transform and opacity only (startPlan), and the browser's compositor plays them: however busy the page is with other
// plugins they keep going, no style is written while they do, so nothing wakes what watches the page, and nothing is
// painted again. Only what cannot be known ahead goes frame by frame (liveFrame): the voice and a finger carrying the bar.
// The sound waves are drawn in a worker (waves.worker.js), which goes on with them by itself.
import {WAVES_W, WAVES_H, clearWaves, paintWaves} from './floating-waves.js';

const SPARK = '<svg class="spark" viewBox="-10 -10 20 20" fill="currentColor" aria-hidden="true"><path d="M0-10C1-2 2-1 10 0 2 1 1 2 0 10-1 2-2 1-10 0-2-1-1-2 0-10z"/></svg>';
const WAVE = '<svg class="wave" viewBox="0 0 32 32" aria-hidden="true"><g class="wave"><rect x="4" y="11" width="3" height="10" rx="1.5"/><rect x="9.25" y="6.5" width="3" height="19" rx="1.5"/><rect x="14.5" y="3" width="3" height="26" rx="1.5"/><rect x="19.75" y="8" width="3" height="16" rx="1.5"/><rect x="25" y="12" width="3" height="8" rx="1.5"/></g></svg>';
const STYLE_ID = 'sttts-floating-style';
// The wave's bars in their 32×32 box: the height at rest, the tallest the voice makes them, the shortest. The height
// changes (not a stretch), so the round ends stay round.
const REST = [10, 19, 26, 16, 8], TALL = [16, 23, 28, 23, 16], LOW = 4;
// How each move of the phone's bar feels: [stiffness, damping] of its spring.
const FEEL = {pop: [420, 24], settle: [520, 40], follow: [1600, 78], throw: [260, 23], press: [900, 40], glide: [300, 30], launch: [240, 28], back: [380, 22]};
const SHAPE = ['x', 'y', 'w', 'h', 'r', 'glyph'];
// The block and the bar as they are drawn once (floating.css, data-gpu), and scaled from there.
const BLOCK = 56, BAR_W = 10, BAR_H = 37;
// How a plan is worked out: the springs' own steps, a keyframe every few of them, and the longest it goes on.
const PLAN_STEP = 1 / 240, PLAN_EVERY = 4, PLAN_MOST = 5;
const PLAYED = ['float', 'shape', 'orb', 'pill', 'lift', 'icon'];
const TIPS = 'sttts-floating-tips';
// The glow colours of floating.css (--glow-rgb), for the waves' canvas. Kept here: reading them from the page's styles
// makes the browser work out the whole tavern page's styles in the middle of a frame.
export const FLOAT_GLOW = Object.freeze({idle: '58,156,240', fish: '34,104,196', mini: '242,169,59', eleven: '194,68,122', mimo: '228,85,42', doubao: '96,120,19', custom: '46,148,100'});
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../floating.css', import.meta.url).href;
  document.head.append(link);
}

/** A phone: a small touch screen, the screens where the phone opens full screen. Some Android browsers and web views do
 *  not say (pointer: coarse), so any touch point counts; turned sideways, a phone is small the other way. */
export function phoneScreen() {
  const m = query => !!globalThis.matchMedia?.(query)?.matches;
  const touch = m('(pointer: coarse)') || m('(any-pointer: coarse)') || globalThis.navigator?.maxTouchPoints > 0;
  return touch && m('(max-width: 540px), (max-height: 540px)') || m('(max-width: 360px)');
}

/** A spring pulling x toward t: k is how stiff it is, c how much it is damped; v is its speed. */
class Spring {
  constructor(x, k = 500, c = 36) { this.x = this.t = x; this.v = 0; this.k = k; this.c = c; }
  to(t, k, c) { this.t = t; if (k) { this.k = k; this.c = c; } }
  set(x) { this.x = this.t = x; this.v = 0; }
  step(h) { this.v += (-this.k * (this.x - this.t) - this.c * this.v) * h; this.x += this.v * h; }
  get moving() { return Math.abs(this.x - this.t) > .01 || Math.abs(this.v) > .05; }
}

/** Something like a voice, for the 系统朗读 narration the page cannot hear: about four syllables a second, each with its
 *  own stress, and short breaths between phrases. */
function speaking(s) {
  const syllable = .5 - .5 * Math.cos(s * 27 + 1.6 * Math.sin(s * 2.3));
  const stress = .5 + .5 * Math.sin(s * 1.9 + 2 * Math.sin(s * .7));
  const breath = Math.min(1, 1.4 * Math.pow(.5 + .5 * Math.sin(s * 1.25 + .9), .35));
  return syllable * (.3 + .7 * stress) * breath;
}

export class FloatingPlayer {
  constructor({openSettings, prepare, position, savePosition, levels, loudness, theme, motion}) {
    Object.assign(this, {openSettings, prepare, savePosition, levels, loudness, theme, motion});
    this.side = position?.side === 'left' ? 'left' : 'right';
    this.y = Number.isFinite(position?.y) ? Math.max(0, Math.min(1, position.y)) : .58;
    this.phase = 'idle';
    this.engine = '';
    this.mode = 'rest';
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = 'sttts-floating';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'ST-iPhonie');
    this.root.innerHTML = `<div class="float" data-side="${this.side}" data-mode="rest" data-phase="idle" data-engine="fish"><canvas class="waves" aria-hidden="true"></canvas><span class="pulse"></span><span class="shape"><span class="lift"></span><span class="squash"><span class="pill"><span class="shine"></span></span></span><button class="orb" type="button" aria-label="打开小手机，可拖动"><span class="shine"></span>${WAVE}<span class="edge-mark"></span></button></span>${SPARK}<span class="hit" aria-hidden="true"></span><span class="hint" aria-hidden="true"></span></div>`;
    this.box = this.root.querySelector('.float');
    this.orb = this.root.querySelector('.orb');
    this.glyph = this.root.querySelector('svg.wave');
    this.bars = [...this.root.querySelectorAll('.wave rect')];
    this.canvas = this.root.querySelector('canvas.waves');
    this.hit = this.root.querySelector('.hit');
    this.hint = this.root.querySelector('.hint');
    this.squash = this.root.querySelector('.squash');
    const shape = this.root.querySelector('.shape');
    this.parts = {float: this.box, shape, stretch: shape, orb: this.orb, pill: this.root.querySelector('.pill'), lift: this.root.querySelector('.lift'), icon: this.glyph, waves: this.canvas};
    // Where the browser can play animations itself (everywhere but the tests, which step the frames by hand).
    this.gpu = typeof this.orb.animate === 'function';
    this.anims = {};
    this.held = {};
    // Both forms: the wave's bars and the voice that moves them. The bar alone: where it is and its size and corners,
    // the wave icon showing, a press, a lift while carried, a pop when a line starts, opening the phone, fading when idle.
    this.heights = REST.map(h => new Spring(h, 900, 30));
    this.voice = new Spring(0, 260, 22);
    this.S = {x: new Spring(0), y: new Spring(0), w: new Spring(56), h: new Spring(56), r: new Spring(19), glyph: new Spring(1),
      press: new Spring(0), lift: new Spring(0), pop: new Spring(0, 300, 13), launch: new Spring(0), rest: new Spring(0)};
    this.ripples = [];
    this.nextWave = 0;
    // What render() last wrote on each element: a style that stays the same is not written again.
    this.written = new WeakMap();
    this.abort = new AbortController();
    const opts = {signal: this.abort.signal};
    document.body.append(this.root);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.colorScheme = matchMedia('(prefers-color-scheme: dark)');
    this.colorScheme.addEventListener('change', () => this.applyTheme(), opts);
    this.reduced.addEventListener('change', () => this.animate(), opts);
    // Clicks that a script dispatches on the outer element (e.g. a dock that hid the ball) open the phone directly.
    this.root.addEventListener('click', e => { if (e.target === this.root) this.activate(); }, opts);
    this.box.addEventListener('click', e => { if (e.target === this.box && (this.mode === 'docked' || this.hidden)) this.activate(); }, opts);
    // A dock script hides the ball (display:none) and briefly shows it again only while it forwards a click.
    // The observer never runs inside that synchronous window, so `hidden` still says the user could not see the ball.
    this.hidden = false;
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(([entry]) => {
        // The bar changes size as it moves: only being hidden or shown again counts.
        const hidden = !entry.contentRect.width;
        if (hidden === this.hidden) return;
        this.hidden = hidden;
        // Stay expanded while another script holds the ball, so a later copy of its look shows the full icon.
        if (this.hidden && this.mode === 'docked') this.setMode('rest'); else this.arm();
      });
      this.observer.observe(this.root);
    }
    for (const el of [this.orb, this.hit]) {
      el.addEventListener('pointerdown', e => this.down(e), opts);
      el.addEventListener('pointermove', e => this.move(e), opts);
      el.addEventListener('pointerup', e => this.up(e), opts);
      el.addEventListener('pointercancel', e => this.cancelDrag(e), opts);
      el.addEventListener('click', e => { e.stopPropagation(); this.activate(); }, opts);
    }
    this.root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.setMode('docked'); this.orb.focus({preventScroll: true}); } }, opts);
    window.addEventListener('resize', () => this.place(), opts);
    window.visualViewport?.addEventListener('resize', () => this.place(), opts);
    document.addEventListener('visibilitychange', () => this.animate(), opts);
    this.place();
    this.applyTheme();
    // The first tuck waits longer: dock scripts copy the ball's look a few seconds after the page loads.
    this.arm(8000);
  }
  get barForm() { return this.box.dataset.form === 'bar'; }
  get composited() { return this.gpu && this.barForm; }
  // The screen's size, measured when the window changes (place), never in a frame: reading it then makes the browser
  // lay out the whole tavern page first, every frame (that cost 7–42 ms a frame while the phone opened).
  measure() { this.vw = document.documentElement.clientWidth || innerWidth; this.vh = window.visualViewport?.height || innerHeight; }
  width() { if (!this.vw) this.measure(); return this.vw; }
  height() { if (!this.vh) this.measure(); return this.vh; }
  label(mode = this.mode) { return mode === 'docked' ? (this.barForm ? '展开 ST-iPhonie 悬浮条' : '展开 ST-iPhonie 悬浮球') : '打开小手机，可拖动'; }
  applyTheme() {
    const theme = this.theme();
    this.box.dataset.theme = theme === 'dark' || theme === 'system' && this.colorScheme.matches ? 'dark' : 'light';
  }
  place() {
    this.measure();
    const form = phoneScreen() ? 'bar' : 'ball';
    if (form !== this.box.dataset.form) this.setForm(form);
    this.box.dataset.side = this.side;
    if (this.barForm) { this.aim(this.drag?.moved ? 'follow' : 'glide'); return; }
    const height = window.visualViewport?.height || innerHeight;
    const top = 24 + this.y * Math.max(0, height - 136);
    this.root.style.top = Math.round(top) + 'px';
    this.root.style.left = this.side === 'left' ? '8px' : 'auto';
    this.root.style.right = this.side === 'right' ? '8px' : 'auto';
  }
  /** The ball, or the phone's bar: what the script set for the other form goes, the bar starts where it belongs. */
  setForm(form) {
    this.box.dataset.form = form;
    this.root.dataset.form = form;
    this.written = new WeakMap();
    this.drag = null;
    delete this.box.dataset.dragging;
    this.stopPlan();
    if (this.gpu && form === 'bar') this.box.dataset.gpu = ''; else delete this.box.dataset.gpu;
    for (const k of ['top', 'left', 'right', 'width', 'height', 'transform']) this.root.style.removeProperty(k);
    for (const k of ['width', 'height', 'transform']) this.box.style.removeProperty(k);
    for (const k of ['transform', 'border-radius', 'opacity', 'box-shadow', '--sttts-gloss']) this.orb.style.removeProperty(k);
    for (const k of ['opacity', 'transform']) this.glyph.style.removeProperty(k);
    this.hit.style.removeProperty('display');
    this.hideHint();
    this.ripples.length = 0;
    this.orb.setAttribute('aria-label', this.label());
    // Nothing to draw for the ball: what the worker still had fades with this.
    if (form !== 'bar') { this.worker?.postMessage({state: {launching: true, glowing: false}, ripples: []}); return; }
    Object.assign(this.root.style, {left: '0px', top: '0px', right: 'auto'});
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (!this.worker) {
      this.canvas.width = Math.round(WAVES_W * this.dpr);
      this.canvas.height = Math.round(WAVES_H * this.dpr);
    }
    // Played by the browser, the block moves by itself: the waves stay beside the screen's edge, out of it.
    if (this.gpu) this.root.prepend(this.canvas);
    const t = this.target();
    for (const k of SHAPE) this.S[k].set(t[k]);
    if (!this.gpu) this.render();
    this.jolted = true;
    this.kick();
  }
  arm(delay = 3200) {
    clearTimeout(this.timer);
    if (this.mode === 'rest' && !this.hidden) this.timer = setTimeout(() => {
      if (this.mode !== 'rest' || this.hidden || this.drag || this.orb.matches(':focus-visible')) return;
      this.setMode('docked');
      if (this.barForm) this.tip('bar');
    }, delay);
  }
  /** A tap on the docked pill or bar expands it first; a click forwarded while the ball is hidden opens the phone at once. */
  activate() {
    if (Date.now() - (this.lastDrag || 0) < 400) return;
    // Brought out: the phone is likely next, so it may get ready now (index.js preparePanel).
    if (this.mode === 'docked' && !this.hidden) { this.setMode('rest'); if (this.barForm) this.tip('block'); this.prepare?.(); return; }
    if (!this.hidden) { if (this.barForm) this.launch(); this.setMode('docked'); }
    // The swell starts first: the phone coming up keeps the page busy, and the browser needs a frame to begin playing it.
    if (this.composited && !this.hidden && !document.hidden) { requestAnimationFrame(() => setTimeout(() => { if (!this.dead) this.openSettings(); }, 0)); return; }
    this.openSettings();
  }
  setMode(mode, feel) {
    this.sync();
    this.mode = mode === 'docked' ? 'docked' : 'rest';
    this.box.dataset.mode = this.mode;
    const label = this.label();
    this.orb.setAttribute('aria-label', label);
    this.orb.title = this.mode === 'docked' ? label : this.message || label;
    if (this.barForm) {
      if (this.mode === 'docked') { this.hideHint(); this.restSoon(); } else this.wake();
      if (!this.launching) this.aim(feel || (this.mode === 'docked' ? 'settle' : 'pop'));
    }
    this.arm();
  }
  down(e) {
    if (e.button !== 0 || this.launching) return;
    this.sync();
    clearTimeout(this.timer);
    const el = e.currentTarget || this.orb;
    if (this.barForm) {
      this.drag = {x: e.clientX, y: e.clientY, moved: false, pointer: e.pointerId, el, trail: [[performance.now(), e.clientX, e.clientY]]};
      this.wake();
      this.press(1);
    } else {
      const rect = this.root.getBoundingClientRect();
      this.drag = {x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false, pointer: e.pointerId, el};
    }
    try { el.setPointerCapture(e.pointerId); } catch { /* Synthetic pointers from other scripts cannot be captured. */ }
  }
  move(e) {
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.trail) { d.trail.push([performance.now(), e.clientX, e.clientY]); if (d.trail.length > 8) d.trail.shift(); }
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    this.sync();
    if (!d.moved && d.trail) { this.hideHint(); this.press(0); this.S.lift.to(1, 420, 30); }
    if (!d.moved) this.box.dataset.dragging = 'true';
    d.moved = true;
    if (d.trail) {
      // Carried, the bar becomes a block under the finger.
      this.finger = {x: clamp(e.clientX, 26, this.width() - 26), y: clamp(e.clientY, 26, this.height() - 26)};
      this.aim('follow');
      return;
    }
    this.box.dataset.mode = 'rest';
    const h = window.visualViewport?.height || innerHeight;
    this.root.style.left = Math.min(innerWidth - 62, Math.max(2, d.left + dx)) + 'px';
    this.root.style.right = 'auto';
    this.root.style.top = Math.min(h - 76, Math.max(20, d.top + dy)) + 'px';
  }
  up(e) {
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return;
    if (d.trail) {
      this.sync();
      this.drag = null;
      delete this.box.dataset.dragging;
      this.drop('stretch');
      try { d.el.releasePointerCapture(e.pointerId); } catch { /* Not captured. */ }
      this.press(0);
      this.S.lift.to(0, 260, 26);
      if (d.moved) this.throw(d); else this.arm();
      return;
    }
    if (d.moved) {
      this.lastDrag = Date.now();
      const rect = this.root.getBoundingClientRect(), h = window.visualViewport?.height || innerHeight;
      this.side = rect.left + 30 < innerWidth / 2 ? 'left' : 'right';
      this.y = Math.max(0, Math.min(1, (rect.top - 24) / Math.max(1, h - 136)));
      this.place();
      this.savePosition({side: this.side, y: this.y});
      this.setMode('rest');
    }
    this.drag = null;
    delete this.box.dataset.dragging;
    try { this.orb.releasePointerCapture(e.pointerId); } catch { /* Not captured. */ }
    this.arm();
  }
  /** The bar let go: the speed of the last tenth of a second picks the edge and carries on into the dock. */
  throw(d) {
    this.lastDrag = Date.now();
    const now = performance.now(), recent = d.trail.filter(([t]) => now - t < 110);
    let vx = 0, vy = 0;
    if (recent.length > 1) {
      const [t0, x0, y0] = recent[0], [t1, x1, y1] = recent[recent.length - 1], dt = Math.max(.016, (t1 - t0) / 1000);
      vx = clamp((x1 - x0) / dt, -4000, 4000);
      vy = clamp((y1 - y0) / dt, -4000, 4000);
    }
    const S = this.S;
    this.side = S.x.x + vx * .18 < this.width() / 2 ? 'left' : 'right';
    this.y = clamp((S.y.x + vy * .12 - 53) / Math.max(1, this.height() - 136));
    this.box.dataset.side = this.side;
    this.savePosition({side: this.side, y: this.y});
    S.x.v = vx * .9;
    S.y.v = vy * .6;
    this.jolted = true;
    this.setMode('docked', 'throw');
  }
  cancelDrag(e) {
    if (e && this.drag && this.drag.pointer !== e.pointerId) return;
    this.sync();
    const d = this.drag;
    this.drag = null;
    delete this.box.dataset.dragging;
    if (this.barForm) {
      this.drop('stretch');
      this.press(0);
      this.S.lift.to(0, 260, 26);
      this.aim('settle');
      if (d) this.arm();
      return;
    }
    this.place();
    this.setMode('rest');
  }
  update(value) {
    this.sync();
    const before = this.phase;
    this.phase = value.phase;
    this.box.dataset.phase = value.phase;
    if (value.engine) { this.box.dataset.engine = value.engine; this.engine = value.engine; }
    this.message = value.message;
    this.orb.title = this.mode === 'docked' ? this.label() : value.message || '打开小手机';
    this.applyTheme();
    if (this.barForm && before !== this.phase) {
      if (this.phase === 'idle') this.restSoon(); else this.wake();
      if (this.mode === 'docked' && !this.launching) this.aim('glide', ['x', 'w', 'h', 'r']);
      if (this.phase === 'playing' && this.moving()) {
        this.S.pop.v = 7;
        this.jolted = true;
        this.ripples.push({t0: performance.now(), amp: 1, kind: this.mode === 'docked' ? 'arc' : 'ring'});
      }
    }
    this.animate();
  }
  /** Starts the frame loop when something is to move: the wave while a line is made or plays, the bar's springs. */
  animate() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.kick();
  }
  kick() {
    if (this.dead || document.hidden) return;
    if (this.composited) this.planSoon();
    if (this.raf || (this.composited && !this.needsFrames())) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(now => this.frame(now));
  }
  moving() { return !!this.motion?.() && !this.reduced.matches; }
  /** What the wave's bars aim for (0–1 each): the voice while a line plays, a soft wave running across while one is
   *  made, else null (they rest). Nothing moves with 声波动画 off or reduced motion. */
  wave(now) {
    if (!this.moving()) return null;
    if (this.phase === 'playing') {
      if (this.engine === 'system') return [.74, .9, 1, .9, .74].map((gain, i) => gain * speaking(now / 1000 - Math.abs(i - 2) * .035));
      const values = this.levels?.() || [];
      return values.length ? values : null;
    }
    if (this.phase === 'generating') return REST.map((_, i) => .16 + .44 * (.5 + .5 * Math.sin(now / 1000 * 7.5 - i * .85)));
    return null;
  }
  frame(now) {
    this.raf = 0;
    if (this.dead) return;
    if (this.composited) { this.liveFrame(now); return; }
    const dt = Math.min(.034, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const bar = this.barForm, wave = this.wave(now);
    this.heights.forEach((s, i) => { s.t = wave ? LOW + (TALL[i] - LOW) * Math.min(1.1, wave[i] || 0) : REST[i]; });
    let level = 0;
    if (wave && this.phase === 'playing') {
      level = this.engine === 'system' ? speaking(now / 1000) : this.loudness?.();
      if (!Number.isFinite(level)) level = wave.reduce((a, b) => a + b, 0) / wave.length;
    }
    this.voice.t = level;
    const springs = bar ? [...Object.values(this.S), ...this.heights, this.voice] : [...this.heights, this.voice];
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) for (const s of springs) s.step(h);
    this.paintWave();
    if (bar) { this.spawnRipples(now); this.render(); this.drawWaves(now); }
    const busy = !!wave || springs.some(s => s.moving) || this.ripples.length > 0 || !!this.drag?.moved || this.hint.classList.contains('on');
    if (busy && !document.hidden) this.raf = requestAnimationFrame(t => this.frame(t));
  }
  /** The wave's bars at their springs' heights; on the ball the whole wave lifts a little with the voice. */
  paintWave() {
    this.bars.forEach((rect, i) => {
      const h = Math.max(3, this.heights[i].x), value = h.toFixed(2);
      if (rect.getAttribute('height') === value) return;
      rect.setAttribute('height', value);
      rect.setAttribute('y', (16 - h / 2).toFixed(2));
    });
    if (this.barForm) return;
    const v = Math.max(0, this.voice.x);
    this.glyph.style.transform = v > .002 ? `translateY(${(-v * 1.2).toFixed(2)}px) scale(${(1 + v * .06).toFixed(3)})` : '';
  }

  // ---------- the phone's bar, played by the browser ----------
  /** How the bar looks for these springs: only what the browser can play by itself. The block and the bar are each drawn
   *  once and scaled, and take over from each other as the shape goes from one to the other. The voice is apart (voiceTo). */
  look(S) {
    const g = clamp(S.glyph.x), barish = 1 - g, press = S.press.x, pop = S.pop.x, lift = S.lift.x, launch = clamp(S.launch.x);
    const w = Math.max(4, S.w.x + barish * (press * 3 + pop * 3)), h = Math.max(4, S.h.x + barish * (pop * 7 - press * 4));
    const scale = 1 - g * press * .07 + lift * .04 + g * pop * .18 + launch * .32;
    const ax = g * clamp(Math.abs(S.x.v) / 2600, 0, .16), ay = g * clamp(Math.abs(S.y.v) / 2600, 0, .16);
    const block = `scale(${(w / BLOCK * scale * (1 + ax - ay * .6)).toFixed(4)},${(h / BLOCK * scale * (1 + ay - ax * .6)).toFixed(4)})`;
    const icon = .55 + .45 * g;
    return {
      float: {transform: `translate3d(${(S.x.x - BLOCK / 2).toFixed(2)}px,${(S.y.x - BLOCK / 2).toFixed(2)}px,0)`},
      shape: {opacity: ((1 - launch) * (1 - .4 * clamp(S.rest.x))).toFixed(3)},
      orb: {transform: block, opacity: clamp((g - .06) / .4).toFixed(3)},
      pill: {transform: `scale(${(w / BAR_W).toFixed(4)},${(h / BAR_H).toFixed(4)})`, opacity: clamp((.6 - g) / .14).toFixed(3)},
      lift: {transform: block, opacity: (clamp(lift) * g).toFixed(3)},
      // The block being scaled must not squash the icon in it.
      icon: {transform: `scale(${(icon * BLOCK / w).toFixed(3)},${(icon * BLOCK / h).toFixed(3)})`, opacity: clamp((g - .35) / .65).toFixed(3)}
    };
  }
  planSoon() {
    if (this.planQueued) return;
    this.planQueued = true;
    queueMicrotask(() => { this.planQueued = false; this.startPlan(); });
  }
  /** Where the springs have got to along the plan playing: before one is told something new, and for what goes frame by frame.
   *  By the animation's own clock: on a busy page it starts later than it was asked to, and until then has not moved. */
  sync() {
    const plan = this.plan;
    if (!plan) return;
    const played = plan.clock ? plan.clock.currentTime ?? 0 : performance.now() - plan.t0;
    const steps = Math.min(plan.steps, Math.max(0, Math.floor(played / 1000 / PLAN_STEP + 1e-6)));
    for (; plan.done < steps; plan.done++) for (const name of plan.names) this.S[name].step(PLAN_STEP);
    if (plan.done < plan.steps) return;
    for (const name of plan.names) this.S[name].set(this.S[name].t);
    this.plan = null;
  }
  /** Works the move out to its end from where the springs are now, and hands it to the browser. */
  startPlan() {
    if (this.dead || !this.composited || document.hidden) return;
    this.sync();
    this.placeAround();
    // Carried, the finger moves the block frame by frame; its shape still springs by itself.
    const carried = !!this.drag?.moved, names = Object.keys(this.S).filter(k => !carried || (k !== 'x' && k !== 'y'));
    const key = names.map(n => `${n}:${this.S[n].t},${this.S[n].k},${this.S[n].c}`).join();
    // Told nothing new: what is playing goes on.
    if (key === this.planKey && !this.jolted && (this.plan || !names.some(n => this.S[n].moving))) return;
    this.planKey = key;
    this.jolted = false;
    const sim = Object.fromEntries(Object.entries(this.S).map(([n, s]) => [n, Object.assign(new Spring(s.x, s.k, s.c), {t: s.t, v: s.v})]));
    if (carried) sim.x.v = sim.y.v = 0;
    const frames = [this.look(sim)];
    let steps = 0;
    while (steps < PLAN_MOST / PLAN_STEP && (steps % PLAN_EVERY || names.some(n => sim[n].moving))) {
      for (const n of names) sim[n].step(PLAN_STEP);
      if (++steps % PLAN_EVERY === 0) frames.push(this.look(sim));
    }
    // It ends exactly at rest.
    for (const n of names) sim[n].set(sim[n].t);
    frames[Math.max(1, frames.length - 1)] = this.look(sim);
    const slots = carried ? PLAYED.filter(slot => slot !== 'float') : PLAYED;
    for (const slot of slots) this.play(slot, frames.map(f => f[slot]), steps * PLAN_STEP * 1000);
    if (!steps) for (const n of names) this.S[n].set(this.S[n].t);
    this.plan = steps ? {t0: performance.now(), done: 0, steps, names, clock: slots.map(slot => !this.held[slot] && this.anims[slot]).find(Boolean)} : null;
  }
  /** One part's keyframes, playing at once in place of what it played before. One that does not change, or never shows, is
   *  only set, and setting it writes no style (so carrying the block wakes nothing either). */
  play(slot, frames, ms) {
    const end = frames[frames.length - 1];
    const still = frames.every(f => f.opacity === '0.000') || frames.every(f => f.transform === end.transform && f.opacity === end.opacity);
    const state = still ? `${end.transform}|${end.opacity}` : '';
    if (still && this.held[slot] === state) return;
    if (still && this.held[slot] && this.anims[slot].effect?.setKeyframes) {
      this.anims[slot].effect.setKeyframes([end, end]);
      this.held[slot] = state;
      return;
    }
    const anim = this.parts[slot].animate(still ? [end, end] : frames, {duration: still ? 1 : Math.max(1, ms), fill: 'both', easing: 'linear'});
    this.anims[slot]?.cancel();
    this.anims[slot] = anim;
    this.held[slot] = state;
  }
  drop(slot) { this.anims[slot]?.cancel(); delete this.anims[slot]; delete this.held[slot]; }
  stopPlan() {
    for (const slot of Object.keys(this.anims)) this.drop(slot);
    this.voiceBar?.cancel();
    this.voiceIcon?.cancel();
    this.voiceBar = this.voiceIcon = null;
    this.plan = null;
    this.planKey = '';
  }
  /** The touch strip, the waves and the tip, placed for where the bar is going: they do not change in a frame. */
  placeAround() {
    const t = this.target(), right = this.side === 'right', vw = this.width(), left = t.x - BLOCK / 2, top = t.y - BLOCK / 2;
    this.put(this.hit, 'display', this.mode === 'docked' && !this.launching || this.drag?.el === this.hit ? 'block' : 'none');
    if (this.mode === 'docked' && !this.drag?.moved) {
      this.put(this.hit, 'height', (t.h + 12).toFixed(1) + 'px');
      this.put(this.hit, 'transform', `translate3d(${((right ? vw - 20 : 0) - left).toFixed(2)}px,${(BLOCK / 2 - (t.h + 12) / 2).toFixed(1)}px,0)`);
    }
    // Carried, they go with the block, frame by frame.
    if (!this.drag?.moved) this.placeWaves(right, t.y);
    if (this.hint.classList.contains('on')) {
      const [hw, hh] = this.hintSize || [0, 0], half = t.w / 2, x = right ? t.x - half - 12 - hw : t.x + half + 12;
      this.put(this.hint, 'left', (clamp(x, 8, vw - hw - 8) - left).toFixed(1) + 'px');
      this.put(this.hint, 'top', (t.y - hh / 2 - top).toFixed(1) + 'px');
    }
    if (this.worker) this.drawWaves(performance.now());
  }
  placeWaves(right, y) {
    this.wavesRight = right;
    this.wavesLeft = right ? this.width() - WAVES_W : 0;
    this.play('waves', [{transform: `translate3d(${this.wavesLeft}px,${(y - WAVES_H / 2).toFixed(2)}px,0)`}], 0);
  }
  /** The bar stretching with the voice, and the icon lifting while the block shows: moved by the animations' clocks, so no
   *  style is written for it. */
  voiceTo(v, shown) {
    const paused = (el, top) => { const anim = el.animate([{transform: 'none'}, {transform: top}], {duration: 1000, fill: 'both'}); anim.pause(); return anim; };
    const seek = (anim, at) => { if (anim.currentTime !== at) anim.currentTime = at; };
    this.voiceBar ??= paused(this.squash, `scale(${1 + 1.5 / BAR_W},${1 + 12 / BAR_H})`);
    this.voiceIcon ??= paused(this.bars[0].parentNode, 'translateY(-1.5px) scale(1.06)');
    const at = Math.round(clamp(v) * 1000);
    seek(this.voiceBar, at);
    seek(this.voiceIcon, shown ? at : 0);
  }
  /** Whether anything has to go frame by frame now: the voice, a finger, sound waves still on their way; the wave's bars only
   *  while the block shows them. */
  needsFrames(now = performance.now()) {
    const wave = this.wave(now), shown = this.S.glyph.x > .05 || this.S.glyph.t > .05;
    return !!this.drag?.moved || this.voice.moving || this.ripples.length > 0 || this.painted === true
      || this.phase === 'playing' && !!wave || shown && (!!wave || this.heights.some(s => s.moving));
  }
  liveFrame(now) {
    // A busy page gives few frames: these catch up, the finger most of all.
    const dt = Math.min(.12, Math.max(0, (now - this.last) / 1000)), S = this.S;
    this.last = now;
    this.sync();
    const wave = this.wave(now), carried = !!this.drag?.moved;
    this.heights.forEach((s, i) => { s.t = wave ? LOW + (TALL[i] - LOW) * Math.min(1.1, wave[i] || 0) : REST[i]; });
    let level = 0;
    if (wave && this.phase === 'playing') {
      level = this.engine === 'system' ? speaking(now / 1000) : this.loudness?.();
      if (!Number.isFinite(level)) level = wave.reduce((a, b) => a + b, 0) / wave.length;
    }
    this.voice.t = level;
    const springs = carried ? [S.x, S.y, ...this.heights, this.voice] : [...this.heights, this.voice], n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) for (const s of springs) s.step(h);
    const shown = S.glyph.x > .05;
    this.voiceTo(Math.max(0, this.voice.x), shown);
    if (shown) this.paintWave();
    if (carried) {
      // Under the finger; moving fast, the block stretches along the way it goes.
      const ax = clamp(Math.abs(S.x.v) / 2600, 0, .16), ay = clamp(Math.abs(S.y.v) / 2600, 0, .16);
      this.play('float', [{transform: `translate3d(${(S.x.x - BLOCK / 2).toFixed(2)}px,${(S.y.x - BLOCK / 2).toFixed(2)}px,0)`}], 0);
      this.play('stretch', [{transform: `scale(${(1 + ax - ay * .6).toFixed(3)},${(1 + ay - ax * .6).toFixed(3)})`}], 0);
    }
    this.placeWaves(carried ? S.x.x >= this.width() / 2 : this.side === 'right', S.y.x);
    this.spawnRipples(now);
    this.drawWaves(now);
    if (this.needsFrames(now) && !document.hidden) { this.raf = requestAnimationFrame(t => this.frame(t)); return; }
    this.voiceTo(0, shown);
    this.paintWave();
  }

  // ---------- the phone's bar ----------
  /** Where the bar or block belongs now: x, y its middle (viewport px), w × h, r its corners, glyph how much the wave icon shows. */
  target() {
    const vw = this.width(), right = this.side === 'right', y = 53 + this.y * Math.max(0, this.height() - 136);
    if (this.drag?.moved && this.finger) return {x: this.finger.x, y: this.finger.y, w: 52, h: 52, r: 18, glyph: 1};
    if (this.mode === 'docked') {
      const talking = this.phase === 'playing' && this.moving(), bw = talking ? 11 : 10, bh = talking ? 41 : 37;
      return {x: right ? vw - 3 - bw / 2 : 3 + bw / 2, y, w: bw, h: bh, r: bw / 2, glyph: 0};
    }
    return {x: right ? vw - 42 : 42, y, w: 56, h: 56, r: 19, glyph: 1};
  }
  aim(feel, keys = SHAPE) {
    if (!this.barForm) return;
    this.sync();
    const t = this.target(), [k, c] = FEEL[feel];
    for (const key of keys) if (this.reduced.matches) this.S[key].set(t[key]); else this.S[key].to(t[key], k, c);
    this.kick();
  }
  press(value) { this.sync(); this.S.press.to(value, ...FEEL.press); this.kick(); }
  /** The block opens the phone: it swells and fades, and the bar slides back out of the screen edge behind the phone. */
  launch() {
    this.sync();
    this.launching = true;
    this.hideHint();
    if (this.reduced.matches) this.S.launch.set(1); else this.S.launch.to(1, ...FEEL.launch);
    clearTimeout(this.launchTimer);
    this.launchTimer = setTimeout(() => this.comeBack(), 280);
    this.kick();
  }
  comeBack() {
    this.sync();
    this.launching = false;
    const S = this.S, t = this.target();
    S.launch.set(0);
    for (const k of ['y', 'w', 'r', 'glyph']) S[k].set(t[k]);
    S.h.set(t.h * .5);
    S.x.set(this.side === 'right' ? this.width() + 14 : -14);
    // Behind a phone that covers the screen nobody sees it slide back: it does when the phone is closed (cover).
    this.jolted = true;
    if (this.covered) { this.backLater = true; if (this.composited) this.kick(); else this.render(); return; }
    this.aim('back', ['x', 'h']);
  }
  /** The phone covers the screen (on a phone it opens full screen), or no longer does. */
  cover(on) {
    this.covered = !!on;
    if (!on && this.backLater) { this.backLater = false; if (this.barForm) this.aim('back', ['x', 'h']); }
  }
  // A bar left alone fades a little; anything that happens brings it back.
  restSoon() {
    clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => {
      if (this.mode !== 'docked' || this.phase !== 'idle' || this.drag) return;
      this.sync();
      this.S.rest.to(1, 30, 11);
      this.kick();
    }, 4500);
  }
  wake() { this.sync(); clearTimeout(this.restTimer); this.S.rest.to(0, 260, 32); this.kick(); }
  /** A first-time tip beside the bar, each shown once on this device. */
  tip(name) {
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(TIPS) || '{}') || {}; } catch { /* No storage: show it. */ }
    if (seen[name]) return;
    try { localStorage.setItem(TIPS, JSON.stringify({...seen, [name]: true})); } catch { /* Shown again next time. */ }
    this.showHint(name === 'bar' ? '点一下展开，按住可以拖' : '再点一下，进入小手机', name === 'bar' ? 3400 : 2600);
  }
  showHint(text, ms) {
    clearTimeout(this.hintTimer);
    this.hint.textContent = text;
    this.hint.classList.add('on');
    this.hintSize = [this.hint.offsetWidth, this.hint.offsetHeight];
    this.hintTimer = setTimeout(() => this.hideHint(), ms);
    if (this.composited) this.placeAround();
    this.kick();
  }
  hideHint() { clearTimeout(this.hintTimer); this.hint.classList.remove('on'); }
  /** One frame of the bar: its place and size, squash, shine and shadow, the touch strip, the canvas and the tip. */
  render() {
    const S = this.S, g = clamp(S.glyph.x), barish = 1 - g, press = S.press.x, pop = S.pop.x, v = Math.max(0, this.voice.x);
    // Pressed, the bar squashes (wider and shorter) and springs back; the voice stretches it; a pressed block sinks.
    const w = Math.max(4, S.w.x + barish * (press * 3 + v * 1.5 + pop * 3));
    const h = Math.max(4, S.h.x + barish * (v * 12 + pop * 7 - press * 4));
    const launch = clamp(S.launch.x), lift = S.lift.x;
    const scale = 1 - g * press * .07 + lift * .04 + g * pop * .18 + launch * .32;
    // Moving fast, the block stretches along the way it goes.
    const ax = g * clamp(Math.abs(S.x.v) / 2600, 0, .16), ay = g * clamp(Math.abs(S.y.v) / 2600, 0, .16);
    const vw = this.width(), left = S.x.x - w / 2, top = S.y.x - h / 2, put = (el, prop, value) => this.put(el, prop, value);
    // The size changes on the inner box. The root stays 1 px and keeps layout inside it (floating.css): its size changing
    // every frame made the browser lay the tavern page out again each frame (20–30 ms a frame on a long chat).
    put(this.box, 'width', w.toFixed(2) + 'px');
    put(this.box, 'height', h.toFixed(2) + 'px');
    put(this.root, 'transform', `translate3d(${left.toFixed(2)}px,${top.toFixed(2)}px,0)`);
    put(this.orb, 'borderRadius', Math.min(Math.max(0, S.r.x), w / 2, h / 2).toFixed(2) + 'px');
    put(this.orb, 'transform', `scale(${(scale * (1 + ax - ay * .6)).toFixed(4)},${(scale * (1 + ay - ax * .6)).toFixed(4)})`);
    put(this.orb, 'opacity', ((1 - launch) * (1 - .4 * clamp(S.rest.x))).toFixed(3));
    const glow = (.32 + barish * v * .45 + press * .25 + lift * .1).toFixed(3);
    put(this.orb, 'boxShadow', `inset 0 0 0 ${(1 + g).toFixed(2)}px rgba(255,255,255,${(.35 + .55 * g).toFixed(3)}),0 ${(3 + g * 7 + lift * 10).toFixed(1)}px ${(8 + g * 16 + lift * 18).toFixed(1)}px ${(-3 - g * 5).toFixed(1)}px rgba(var(--glow-rgb),${glow}),0 1px ${(2 + lift * 6).toFixed(1)}px rgba(0,0,0,${(.14 + lift * .1).toFixed(3)})`);
    put(this.orb, '--sttts-gloss', (.55 + .45 * g).toFixed(3));
    put(this.glyph, 'opacity', clamp((g - .35) / .65).toFixed(3));
    put(this.glyph, 'transform', `translateY(${(-v * 1.5).toFixed(2)}px) scale(${((.55 + .45 * g) * (1 + v * .06)).toFixed(3)})`);
    // The bar is thin, so a strip at the screen edge a little bigger than it takes the touch; nothing else around it does.
    const right = this.side === 'right', carried = this.drag?.moved;
    put(this.hit, 'display', this.mode === 'docked' && !this.launching || this.drag?.el === this.hit ? 'block' : 'none');
    if (this.mode === 'docked' && !carried) {
      put(this.hit, 'height', (h + 12).toFixed(1) + 'px');
      put(this.hit, 'transform', `translate3d(${((right ? vw - 20 : 0) - left).toFixed(2)}px,${(-6).toFixed(1)}px,0)`);
    }
    // The waves' canvas sits on the edge the bar is on (carried: the edge it would go to), level with the bar.
    this.wavesRight = carried ? S.x.x >= vw / 2 : right;
    this.wavesLeft = this.wavesRight ? vw - WAVES_W : 0;
    put(this.canvas, 'transform', `translate3d(${(this.wavesLeft - left).toFixed(2)}px,${(S.y.x - WAVES_H / 2 - top).toFixed(2)}px,0)`);
    if (this.hint.classList.contains('on')) {
      const [hw, hh] = this.hintSize || [0, 0], half = w * scale / 2, x = right ? S.x.x - half - 12 - hw : S.x.x + half + 12;
      put(this.hint, 'left', (clamp(x, 8, vw - hw - 8) - left).toFixed(1) + 'px');
      put(this.hint, 'top', (S.y.x - hh / 2 - top).toFixed(1) + 'px');
    }
  }
  /** Writes a style unless render() already wrote that very value there. */
  put(el, prop, value) {
    let last = this.written.get(el);
    if (!last) this.written.set(el, last = new Map());
    if (last.get(prop) === value) return;
    last.set(prop, value);
    if (prop.startsWith('--')) el.style.setProperty(prop, value); else el.style[prop] = value;
  }
  spawnRipples(now) {
    const v = this.voice.x;
    if (this.phase !== 'playing' || !this.moving() || this.drag?.moved || this.launching || now < this.nextWave || v < .16) return;
    this.ripples.push({t0: now, amp: clamp(v * 1.6), kind: this.mode === 'docked' ? 'arc' : 'ring'});
    this.nextWave = now + 230 + (1 - v) * 320;
  }
  /** The sound waves (floating-waves.js), in the worker when there is one: it goes on with them by itself. */
  drawWaves(now) {
    const S = this.S, docked = this.mode === 'docked', carried = !!this.drag?.moved, launching = !!this.launching;
    const glowing = carried || docked && this.phase === 'playing' && this.moving() && !launching;
    const st = {dpr: this.dpr, docked, carried, launching, glowing, v: Math.max(0, this.voice.x), right: this.wavesRight, left: this.wavesLeft, x: S.x.x, w: S.w.x, h: S.h.x, r: S.r.x,
      rgb: ['playing', 'paused', 'generating'].includes(this.phase) && FLOAT_GLOW[this.engine] || FLOAT_GLOW.idle};
    // Nothing to draw yet: no worker yet either.
    const worker = glowing || this.ripples.length ? this.wavesWorker() : this.worker;
    if (worker) {
      worker.postMessage({state: st, ripples: this.ripples});
      this.ripples.length = 0;
      return;
    }
    const ctx = this.ctx ??= this.canvas.getContext?.('2d') || null;
    if (!ctx) return;
    const drawing = paintWaves(ctx, st, this.ripples, now);
    if (!drawing && this.painted) clearWaves(ctx);
    this.painted = drawing;
  }
  /** The worker that draws the waves, where the browser can have one. Tried once. */
  wavesWorker() {
    if (this.worker !== undefined) return this.worker;
    this.worker = null;
    if (!this.composited || !this.canvas.transferControlToOffscreen) return null;
    let worker;
    try {
      worker = new Worker(new URL('./waves.worker.js', import.meta.url), {type: 'module'});
      const canvas = this.canvas.transferControlToOffscreen();
      worker.onerror = worker.onmessage = () => this.wavesOnPage();
      worker.postMessage({canvas}, [canvas]);
      this.worker = worker;
    } catch { worker?.terminate(); /* Not allowed here: they are drawn on the page, as before. */ }
    return this.worker;
  }
  /** The worker could not after all. The canvas it was given stays its own, so the page draws on a new one. */
  wavesOnPage() {
    this.worker?.terminate();
    this.worker = null;
    const canvas = this.canvas.cloneNode(false);
    canvas.width = Math.round(WAVES_W * this.dpr);
    canvas.height = Math.round(WAVES_H * this.dpr);
    this.canvas.replaceWith(canvas);
    this.canvas = this.parts.waves = canvas;
    this.drop('waves');
    this.placeWaves(this.side === 'right', this.target().y);
  }
  destroy() {
    this.dead = true;
    this.abort.abort();
    this.observer?.disconnect();
    this.stopPlan();
    this.worker?.terminate();
    for (const timer of [this.timer, this.restTimer, this.hintTimer, this.launchTimer]) clearTimeout(timer);
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }
}

// 绘本的阅读器: a picture book shown to be read — inside the phone, or over the whole tavern page (book-stage.js). On a
// wide screen the book lies open, a spread at a time, the leaf turning over the fold; on a tall one a page at a time
// (core/book-pages.js viewsOf: a spread laid across both pages is one page there, its picture drifting across), turned
// away to the left. A tap on the left or right goes back or on, a swipe too, the arrow keys and the wheel; a tap in
// the middle shows the bar (the title, 朗读, the slider, 全屏, ⋯) or hides it. 朗读 reads what is in front aloud, the
// line being read marked and whoever says it moving, and turns on when it is read (by the time it takes to look at it
// when nothing can be read). Over a spread the weather of its story is drawn (vn-fx.js), and its ambience and sound
// play as it comes in (when 音效 is on). Pictures are found by `picture` (a picture's address, made once each).
import {BOOK_CSS, viewsOf, viewMarkup, viewWords, fitWords, themeStyle, directionOf} from './core/book-pages.js';
import {readOf, linesOf, sheetOf, sheetCount} from './core/book.js';
import {createFx, FX_KINDS} from './vn-fx.js';

const STYLE_ID = 'sttts-book-style';
const READER_CSS = `
.bkr{position:absolute;inset:0;overflow:hidden;background:#1c1a22;color:#fff;font:14px/1.4 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:contain}
.bkr *{box-sizing:border-box}
.bkr button{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bkr-desk{position:absolute;inset:-8%;background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--bk-soft) 40%,#2a2732),#121016 75%) center/cover}
.bkr-desk img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(38px) brightness(.45) saturate(1.2);opacity:.9}
.bkr-book{position:absolute;perspective:2600px}
.bkr-slot{position:absolute;top:0;bottom:0;overflow:hidden}
.bkr-slot[data-side=one],.bkr-slot[data-side=wide]{left:0;right:0}
.bkr-slot[data-side=lone]{left:25%;width:50%;border-radius:3px 8px 8px 3px}
.bkr[data-two] .bkr-slot{border-radius:4px;box-shadow:0 18px 50px -12px rgba(0,0,0,.65)}
.bkr[data-two] .bkr-slot[data-side=lone]{border-radius:3px 8px 8px 3px}
.bkr-book[data-framed] .bkr-slot{border-radius:4px 10px 10px 4px;box-shadow:0 18px 50px -12px rgba(0,0,0,.65)}
.bkr-leaf{position:absolute;top:0;bottom:0;width:50%;z-index:20;transform-style:preserve-3d;transition:transform .8s cubic-bezier(.45,.05,.25,1)}
.bkr-face{position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.bkr-face.back{transform:rotateY(180deg)}
.bkr-inner{position:absolute;top:0;bottom:0;width:200%}
.bkr-face::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:9;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,0));transition:background .8s}
.bkr-leaf[data-turning] .bkr-face.front::after{background:linear-gradient(90deg,rgba(0,0,0,.04),rgba(0,0,0,.3))}
.bkr-leaf[data-turning] .bkr-face.back::after{background:linear-gradient(90deg,rgba(0,0,0,.22),rgba(0,0,0,0) 60%)}
.bkr-one-leaf{position:absolute;inset:0;z-index:20;transform-origin:left center;transition:transform .62s cubic-bezier(.4,.05,.25,1),opacity .62s ease;box-shadow:0 0 40px rgba(0,0,0,.35)}
.bkr-one-leaf[data-away]{transform:perspective(1800px) rotateY(-96deg);opacity:.2}
.bkr-bar,.bkr-foot{position:absolute;left:0;right:0;z-index:40;display:flex;align-items:center;gap:6px;padding:10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));transition:opacity .25s,transform .25s;pointer-events:auto}
.bkr-bar{top:0;padding-top:max(10px,env(safe-area-inset-top));background:linear-gradient(rgba(0,0,0,.6),transparent)}
.bkr-foot{bottom:0;padding-bottom:max(12px,env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.65))}
.bkr[data-quiet] .bkr-bar{opacity:0;transform:translateY(-100%);pointer-events:none}
.bkr[data-quiet] .bkr-foot{opacity:0;transform:translateY(100%);pointer-events:none}
.bkr-title{flex:1;min-width:0;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.bkr-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:38px;height:38px;padding:0 12px;border-radius:19px;background:rgba(255,255,255,.16);color:#fff;font-size:14px;font-weight:700;white-space:nowrap;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.bkr-btn:hover{background:rgba(255,255,255,.26)}
.bkr-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.bkr-btn[aria-pressed=true]{background:#fff;color:#222}
.bkr-btn svg{width:18px;height:18px;fill:currentColor}
.bkr-where{min-width:58px;text-align:center;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.bkr-slider{flex:1;min-width:60px;accent-color:#fff;height:28px;cursor:pointer}
.bkr-hint{position:absolute;left:50%;bottom:72px;z-index:41;transform:translateX(-50%);padding:8px 14px;border-radius:16px;background:rgba(0,0,0,.66);color:#fff;font-size:13px;pointer-events:none;opacity:0;transition:opacity .3s;max-width:86%;text-align:center}
.bkr-hint[data-on]{opacity:1}
.bkr-fx{position:absolute;z-index:30;pointer-events:none;overflow:hidden}
.bkr-fx .vn-fx{position:absolute;inset:0;width:100%;height:100%}
@media (prefers-reduced-motion:reduce){.bkr-leaf,.bkr-one-leaf{transition:none}}
`;

/** The pages' and the reader's styles in a document (once). */
export function bookStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BOOK_CSS + READER_CSS;
  (doc.head || doc.documentElement).append(style);
}
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 0h2v5h-5v-2h3z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>',
};

/**
 * Puts a reader in `root` (filled). picture(p): a picture's address (a promise; '' when it is gone); sprite(name,
 * emotion): a 立绘's address; read(lines, onLine): reads lines aloud, resolving when done (false: nothing could be
 * read), onLine(k) when line k starts; stop(): stops reading. onClose / onFull / onMenu: buttons shown when given
 * (onFull and onMenu are told the sheet in front: 0 the cover, then the spreads, the last page). two: whether a wide
 * screen shows a spread whole. onPage(sheet): the sheet now in front. visible(): whether keys are for it now.
 * sound(kind, name): an ambience ('ambience'), a sound ('sfx') or 'stop'. escape: whether Esc closes it (not in the
 * phone, where Esc is its back). at: the sheet to open at. Returns {go, refresh, changed, at, reading, setReading,
 * destroy}.
 */
export function mountBookReader({doc, root, book, picture, sprite = () => '', read = null, stop = () => {}, at = 0, two = true, onClose = null, onFull = null, onMenu = null, onPage = () => {}, notify = () => {}, draft = false, visible = () => true, sound = null, escape = true}) {
  bookStyles(doc);
  const win = doc.defaultView, keys = new win.AbortController(), urls = new Map(), waiting = new Map();
  const frame = f => win.requestAnimationFrame ? win.requestAnimationFrame(f) : win.setTimeout(f, 16);
  const el = doc.createElement('div');
  el.className = 'bkr';
  el.tabIndex = -1;
  el.setAttribute('style', themeStyle(book.theme));
  el.innerHTML = `<div class="bkr-desk"></div><div class="bkr-book"></div><div class="bkr-fx"></div>
    <div class="bkr-bar">${onClose ? `<button type="button" class="bkr-btn" data-r="close" aria-label="关上">${ICON.close}</button>` : ''}<span class="bkr-title"></span>
      ${onFull ? `<button type="button" class="bkr-btn" data-r="full" aria-label="全屏">${ICON.full}</button>` : ''}${onMenu ? `<button type="button" class="bkr-btn" data-r="menu" aria-label="更多">${ICON.more}</button>` : ''}</div>
    <div class="bkr-foot"><button type="button" class="bkr-btn" data-r="prev" aria-label="上一页">${ICON.prev}</button><input class="bkr-slider" type="range" min="0" value="0" aria-label="翻到"><span class="bkr-where"></span><button type="button" class="bkr-btn" data-r="next" aria-label="下一页">${ICON.next}</button>
      ${read ? `<button type="button" class="bkr-btn" data-r="read" aria-pressed="false">${ICON.play}朗读</button>` : ''}</div>
    <div class="bkr-hint"></div>`;
  root.append(el);
  const $ = s => el.querySelector(s), bookEl = $('.bkr-book'), fxEl = $('.bkr-fx');
  // The weather over the pages: fewer particles where drawing costs more.
  const fx = createFx({doc, host: fxEl, lite: !!win.matchMedia?.('(pointer: coarse)').matches || (win.navigator?.hardwareConcurrency || 8) <= 4});
  let ambience = '', lastSheet = -1;
  // A picture that will not load (a file gone) is left out, not shown broken.
  el.addEventListener('error', e => { if (e.target?.tagName === 'IMG') e.target.classList.add('bk-broken'); }, true);
  let wide = false, list = [], shown = -1, heading = -1, showTurn = 0, busy = null, reading = false, readTurn = 0, quietTimer = 0, gone = false;

  // ---------- pictures ----------
  const keyOf = p => p?.id ? 'id:' + p.id : p?.url ? 'url:' + p.url : '';
  function want(p) {
    const k = keyOf(p);
    if (!k || urls.has(k)) return null;
    if (!waiting.has(k)) waiting.set(k, Promise.resolve(picture(p)).catch(() => '').then(u => { urls.set(k, u || ''); waiting.delete(k); }));
    return waiting.get(k);
  }
  const picturesOf = n => { const s = sheetOf(book, n); return (s.kind === 'spread' ? s.spread.pictures.map(x => x.picture) : [book.cover.picture]).filter(Boolean); };
  const urlOf = p => urls.get(keyOf(p)) || '';
  /** A view as an element: 'pre' (its words to come in when shown), or '' (as it is, nothing coming in). */
  function viewEl(v, cls = 'pre') {
    const t = doc.createElement('div');
    t.innerHTML = viewMarkup(book, v, {url: urlOf, sprite, draft});
    const n = t.firstElementChild;
    if (cls) n.classList.add(cls);
    return n;
  }
  /** Pictures of the view after `i` start loading (the turn is smoother). */
  function ahead(i) { const v = list[i + 1]; if (v) for (const p of picturesOf(v.sheet)) want(p)?.then(() => { const u = urlOf(p); if (u) { const im = new win.Image(); im.src = u; } }); }

  // ---------- size ----------
  function layout() {
    const r = el.getBoundingClientRect(), W = r.width, H = r.height;
    if (!W || !H) return false;
    const nowWide = two && W / H > 1.15 && W >= 560;
    let w, h;
    if (nowWide) { const m = Math.min(28, W * .03); w = Math.min(W - m * 2, (H - m * 2) * 1.5); h = w / 1.5; }
    else {
      // A page about the shape of a book's: on a phone a little less tall than the screen, the desk above and below.
      const m = W / H > .86 ? 16 : 0, a = Math.min(.8, Math.max(.6, (W - m * 2) / (H - m * 2)));
      h = Math.min(H - m * 2, (W - m * 2) / a); w = h * a;
    }
    const box = {width: w + 'px', height: h + 'px', left: (W - w) / 2 + 'px', top: (H - h) / 2 + 'px'};
    Object.assign(bookEl.style, box);
    Object.assign(fxEl.style, box);
    fx.resize();
    bookEl.toggleAttribute('data-framed', !nowWide && (w < W - 2 || h < H - 2));
    const changed = nowWide !== wide || !list.length;
    wide = nowWide;
    el.toggleAttribute('data-two', wide);
    if (changed) list = viewsOf(book, wide);
    return changed;
  }
  const viewOf = sheet => Math.max(0, list.findIndex(v => v.sheet === sheet));
  /** Where a view {sheet, part} is in the list now (its sheet's first view when that part is not there). */
  const placeOf = v => { const i = list.findIndex(x => x.sheet === v.sheet && x.part === v.part); return i >= 0 ? i : viewOf(v.sheet); };
  const sideOf = v => !wide ? 'one' : sheetOf(book, v.sheet).kind === 'spread' ? 'wide' : 'lone';
  function slot(v, cls) {
    const s = doc.createElement('div');
    s.className = 'bkr-slot'; s.dataset.side = sideOf(v); s.dataset.sheet = v.sheet;
    s.append(viewEl(v, cls));
    return s;
  }
  const fit = nodes => nodes.forEach(n => fitWords(n));
  const turnOn = nodes => frame(() => nodes.forEach(n => { const b = n.querySelector('.bk'); b?.classList.remove('pre'); b?.classList.add('on'); }));

  // ---------- showing a view ----------
  async function show(i, dir = 0, {sounds = true} = {}) {
    i = Math.max(0, Math.min(list.length - 1, i));
    heading = i;
    const turn = ++showTurn, v = list[i];
    await Promise.all(picturesOf(v.sheet).map(want).filter(Boolean));
    // A later turn asked for meanwhile: that one is shown.
    if (gone || turn !== showTurn) return;
    busy?.(); busy = null;
    const old = [...bookEl.querySelectorAll(':scope > .bkr-slot')], was = list[shown];
    const fresh = [slot(v)];
    shown = i;
    paintBar();
    onPage(v.sheet);
    ahead(i);
    weather(v.sheet);
    if (v.sheet !== lastSheet) { lastSheet = v.sheet; if (sounds) soundFor(v.sheet); }
    const motion = dir && old.length && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let over;
    if (!motion) { bookEl.replaceChildren(...fresh); fit(fresh); turnOn(fresh); over = Promise.resolve(); }
    else if (!wide) over = turnOne(old, fresh, dir);
    else if (was && sideOf(was) === 'wide' && sideOf(v) === 'wide') over = turnLeaf(old[0], fresh[0], was, v, dir);
    else over = turnFade(old, fresh);
    await over;
  }
  /** The weather of the spread in front, drawn over it. */
  const weather = n => fx.weather(directionOf(book, n).fx.filter(k => FX_KINDS.includes(k)));
  /** Its ambience (a new one, or 停) and its sound, as it comes in. */
  function soundFor(n) {
    if (!sound) return;
    const s = sheetOf(book, n).spread?.sound || {};
    if (s.ambience && s.ambience !== ambience) { ambience = s.ambience; try { sound(/^(停|stop)$/i.test(s.ambience) ? 'stop' : 'ambience', s.ambience); } catch {} }
    if (s.sfx) win.setTimeout(() => { if (!gone) try { sound('sfx', s.sfx); } catch {} }, 450);
  }
  /** The cover or the last page and a spread: the new one fades in over the old. */
  function turnFade(old, fresh) {
    return new Promise(resolve => {
      let done = false;
      bookEl.replaceChildren(...old, ...fresh);
      fit(fresh);
      const a = fresh[0].animate?.([{opacity: 0}, {opacity: 1}], {duration: 600, easing: 'ease', fill: 'both'});
      const end = () => { if (done) return; done = true; win.clearTimeout(t); try { a?.cancel(); } catch {} bookEl.replaceChildren(...fresh); turnOn(fresh); resolve(); };
      const t = win.setTimeout(end, 630);
      busy = end;
    });
  }
  /** One page: the old one turns away over the new (on), or the new one comes back over the old (back). */
  function turnOne(old, fresh, dir) {
    let done = false, resolve;
    const over = new Promise(r => { resolve = r; });
    const end = () => { if (done) return; done = true; bookEl.replaceChildren(...fresh); turnOn(fresh); resolve(); };
    if (dir > 0) {
      bookEl.replaceChildren(...fresh, ...old);
      fit(fresh);
      const leaf = old[0];
      leaf.classList.add('bkr-one-leaf');
      frame(() => frame(() => leaf.setAttribute('data-away', '')));
    } else {
      const leaf = fresh[0];
      leaf.classList.add('bkr-one-leaf');
      leaf.setAttribute('data-away', '');
      bookEl.replaceChildren(...old, leaf);
      fit(fresh);
      frame(() => frame(() => leaf.removeAttribute('data-away')));
    }
    const t = win.setTimeout(() => { fresh[0].classList.remove('bkr-one-leaf'); end(); }, 650);
    busy = () => { win.clearTimeout(t); fresh[0].classList.remove('bkr-one-leaf'); fresh[0].removeAttribute('data-away'); end(); };
    return over;
  }
  /**
   * A spread to a spread: the leaf turns over the fold. On, it lifts from the right — the old spread's right half on
   * its front, the new one's left half behind — and lands on the left, the old left half staying until it does; back,
   * the other way round. The halves on the leaf are copies of the whole spread, cut to the half.
   */
  function turnLeaf(oldSlot, freshSlot, oldView, newView, dir) {
    const back = dir < 0, leaf = doc.createElement('div');
    leaf.className = 'bkr-leaf';
    Object.assign(leaf.style, back ? {left: 0, transformOrigin: 'right center'} : {left: '50%', transformOrigin: 'left center'});
    const half = (view, right, cls, how) => {
      const f = doc.createElement('div'), inner = doc.createElement('div'), page = viewEl(view, how);
      f.className = 'bkr-face ' + cls; inner.className = 'bkr-inner'; inner.style.left = right ? '-100%' : '0';
      inner.append(page); f.append(inner);
      return {face: f, page};
    };
    const front = half(oldView, !back, 'front', ''), behind = half(newView, back, 'back', 'pre');
    // The old spread's copy as it is now: its pictures where their slow move has brought them.
    const was = oldSlot.querySelectorAll('.bk-img'), copy = front.page.querySelectorAll('.bk-img');
    was.forEach((im, k) => { if (copy[k]) { copy[k].style.animation = 'none'; copy[k].style.transform = win.getComputedStyle(im).transform; } });
    leaf.append(front.face, behind.face);
    oldSlot.style.clipPath = back ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)';
    oldSlot.style.zIndex = '15';
    bookEl.replaceChildren(freshSlot, oldSlot, leaf);
    fit([freshSlot, front.face, behind.face]);
    let done = false, resolve;
    const over = new Promise(r => { resolve = r; });
    const end = () => { if (done) return; done = true; bookEl.replaceChildren(freshSlot); turnOn([freshSlot]); resolve(); };
    frame(() => frame(() => { leaf.setAttribute('data-turning', ''); leaf.style.transform = `rotateY(${back ? 180 : -180}deg)`; }));
    const t = win.setTimeout(end, 840);
    busy = () => { win.clearTimeout(t); end(); };
    return over;
  }
  function paintBar() {
    const last = list.length - 1;
    $('.bkr-title').textContent = book.title;
    $('.bkr-where').textContent = shown <= 0 ? '封面' : shown >= last ? '完' : `${shown} / ${last - 1}`;
    const slider = $('.bkr-slider');
    slider.max = String(last); slider.value = String(Math.max(0, shown));
  }
  const now = () => heading >= 0 ? heading : shown;
  function go(i, {keepReading = false} = {}) {
    if (i < 0 || i >= list.length || i === now()) return null;
    const dir = i > now() ? 1 : -1;
    const was = reading && !keepReading;
    if (was) { readTurn++; stop(); release(); }
    // Reading when turned by hand: it goes on from the new view.
    return show(i, dir).then(() => { if (was && reading) readHere(); });
  }
  const step = d => go(now() + d);

  // ---------- reading aloud ----------
  let warned = false;
  function hint(text) { const h = $('.bkr-hint'); h.textContent = text; h.setAttribute('data-on', ''); win.clearTimeout(hint.t); hint.t = win.setTimeout(() => h.removeAttribute('data-on'), 2600); }
  function setReading(on) {
    reading = on;
    const b = $('[data-r=read]');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.innerHTML = on ? `${ICON.pause}停` : `${ICON.play}朗读`; }
    readTurn++;
    if (on) { quiet(true); readHere(); } else { stop(); release(); }
  }
  /** Nothing marked as being read, nobody speaking. */
  function release() {
    bookEl.querySelectorAll('.bk [data-k].now').forEach(n => n.classList.remove('now'));
    bookEl.querySelectorAll('.bk-actor[data-talk]').forEach(a => a.removeAttribute('data-talk'));
  }
  /** What a view reads: its lines, and each one's place among its spread's words. */
  function linesHere(v) {
    const s = sheetOf(book, v.sheet);
    if (s.kind !== 'spread') return {lines: readOf(book, v.sheet), places: []};
    const places = viewWords(book, v);
    return {lines: linesOf(places.map(k => s.spread.words[k])), places};
  }
  async function readHere() {
    const turn = ++readTurn, v = list[now()];
    if (!v) return;
    const {lines, places} = linesHere(v), page = bookEl.querySelector(':scope > .bkr-slot .bk');
    // The line being read is marked; whoever says it moves.
    const mark = k => {
      if (turn !== readTurn || !page) return;
      page.querySelectorAll('[data-k].now').forEach(n => n.classList.remove('now'));
      if (places[k] != null) page.querySelectorAll(`[data-k="${places[k]}"]`).forEach(n => n.classList.add('now'));
      const role = lines[k]?.role || '';
      page.querySelectorAll('.bk-actor').forEach(a => a.toggleAttribute('data-talk', !!role && a.getAttribute('aria-label') === role));
    };
    let done = false;
    if (lines.length) {
      try { done = await read(lines, mark); } catch (error) { notify(error.message, true); setReading(false); return; }
      if (turn !== readTurn || !reading) return;
      if (!done && !warned) { warned = true; hint('没有能朗读的声音，按时间自动翻页（在设置 → 整篇朗读选旁白声音）'); }
    }
    if (!done) {
      // Nothing read (or nothing to read: a page that is a picture): as long as it takes to look at it.
      const chars = lines.reduce((n, l) => n + l.text.length, 0), wait = lines.length ? Math.min(9000, 2600 + chars * 120) : 2600;
      await new Promise(r => win.setTimeout(r, wait));
      if (turn !== readTurn || !reading) return;
    }
    release();
    if (now() >= list.length - 1) { setReading(false); return; }
    win.setTimeout(async () => { if (turn === readTurn && reading) { await go(now() + 1, {keepReading: true}); if (turn === readTurn && reading) readHere(); } }, 700);
  }

  // ---------- touch, keys, the bar ----------
  function quiet(on) { win.clearTimeout(quietTimer); el.toggleAttribute('data-quiet', on); }
  const later = () => { win.clearTimeout(quietTimer); quietTimer = win.setTimeout(() => quiet(true), 3200); };
  let down = null;
  el.addEventListener('pointerdown', e => { if (e.target.closest('.bkr-bar,.bkr-foot')) return; down = {x: e.clientX, y: e.clientY, t: Date.now()}; });
  el.addEventListener('pointerup', e => {
    if (!down || e.target.closest('.bkr-bar,.bkr-foot')) { down = null; return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { step(dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < .3) step(-1); else if (x > .7) step(1);
    else { const q = el.hasAttribute('data-quiet'); quiet(!q); if (q) later(); }
  });
  el.addEventListener('pointercancel', () => { down = null; });
  let wheelAt = 0;
  el.addEventListener('wheel', e => { if (e.target.closest('.bkr-foot')) return; e.preventDefault(); const t = Date.now(); if (t - wheelAt < 450 || Math.abs(e.deltaY) < 8) return; wheelAt = t; step(e.deltaY > 0 ? 1 : -1); }, {passive: false});
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = b.dataset.r;
    later();
    if (r === 'prev') step(-1); else if (r === 'next') step(1);
    else if (r === 'read') setReading(!reading);
    else if (r === 'close') onClose?.();
    else if (r === 'full') onFull?.(list[now()]?.sheet ?? 0);
    else if (r === 'menu') onMenu?.(list[now()]?.sheet ?? 0);
  });
  $('.bkr-slider').addEventListener('input', e => { later(); go(Number(e.target.value)); });
  doc.addEventListener('keydown', e => {
    if (gone || !el.isConnected || el.closest('[hidden], [inert]') || e.target.closest?.('input:not(.bkr-slider), textarea, select, button, [contenteditable=true]')) return;
    if (!visible()) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); step(-1); }
    else if (k === 'Home') go(0); else if (k === 'End') go(list.length - 1);
    else if (k === 'Escape' && onClose && escape) onClose();
  }, {signal: keys.signal});
  const resized = win.ResizeObserver ? new win.ResizeObserver(() => { const v = list[now()]; if (layout()) { shown = -1; heading = -1; show(v ? placeOf(v) : viewOf(at), 0, {sounds: false}); } }) : null;
  resized?.observe(el);

  // ---------- start ----------
  if (book.cover.picture) Promise.resolve(picture(book.cover.picture)).then(u => { if (u && !gone) { const im = doc.createElement('img'); im.alt = ''; im.src = u; $('.bkr-desk').append(im); } }).catch(() => {});
  if (!layout()) list = viewsOf(book, false);
  show(viewOf(Math.min(at, sheetCount(book) - 1)));
  quiet(false); later();

  return {
    get at() { return list[now()]?.sheet ?? 0; },
    get reading() { return reading; },
    go: sheet => go(viewOf(sheet)),
    setReading,
    /** The book changed (a spread edited, a picture drawn): drawn again where it is (or at `sheet`). */
    refresh(next = book, sheet = null) {
      book = next;
      el.setAttribute('style', themeStyle(book.theme));
      for (const [k, u] of [...urls]) if (!u) urls.delete(k);
      const v = list[now()], keep = Math.min(sheet ?? v?.sheet ?? 0, sheetCount(book) - 1);
      list = viewsOf(book, wide);
      shown = -1; heading = -1;
      return show(v && v.sheet === keep ? placeOf(v) : viewOf(keep), 0, {sounds: false});
    },
    /** Sheet n changed (a picture drawn for it): drawn again when it is in front, else kept for when it comes. */
    changed(next, n) {
      const v = list[now()];
      if (v && (v.sheet === n || (n === 0 && sheetOf(next, v.sheet).kind === 'end'))) return this.refresh(next);
      const head = list[heading], seen = list[shown];
      book = next;
      list = viewsOf(book, wide);
      heading = head ? placeOf(head) : -1; shown = seen ? placeOf(seen) : -1;
      paintBar();
      return null;
    },
    destroy() { gone = true; readTurn++; if (reading) stop(); if (ambience && sound) try { sound('stop'); } catch {} keys.abort(); resized?.disconnect(); busy?.(); fx.dispose(); el.remove(); },
  };
}

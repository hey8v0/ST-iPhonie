// 绘本的阅读器: a picture book shown to be read — inside the phone, or over the whole tavern page (book-stage.js). On a
// wide screen the book lies open, two pages at a time, the leaf turning over the spine; on a tall one a page fills the
// screen and turns away to the left. A tap on the left or right goes back or on, a swipe too, the arrow keys and the
// wheel; a tap in the middle shows the bar (the title, 朗读, the page slider, 全屏, ⋯) or hides it. 朗读 reads the
// pages aloud and turns them as it goes (by the time a page takes to look at when nothing on it can be read).
// The pages come from core/book-pages.js; pictures are found by `picture` (a picture's address, made once each).
import {BOOK_CSS, pageMarkup, openings, pageNumbers, fitProse, themeStyle} from './core/book-pages.js';
import {readOf} from './core/book.js';

const STYLE_ID = 'sttts-book-style';
const READER_CSS = `
.bkr{position:absolute;inset:0;overflow:hidden;background:#1c1a22;color:#fff;font:14px/1.4 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:contain}
.bkr *{box-sizing:border-box}
.bkr button{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bkr-desk{position:absolute;inset:-8%;background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--bk-soft) 40%,#2a2732),#121016 75%) center/cover}
.bkr-desk img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(38px) brightness(.45) saturate(1.2);opacity:.9}
.bkr-book{position:absolute;perspective:2400px}
.bkr-slot{position:absolute;top:0;bottom:0;overflow:hidden}
.bkr-slot[data-side=one]{left:0;right:0}
.bkr-slot[data-side=left]{left:0;width:50%;border-radius:6px 0 0 6px}
.bkr-slot[data-side=right]{left:50%;width:50%;border-radius:0 6px 6px 0}
.bkr-slot[data-side=wide]{left:0;right:0;border-radius:6px}
.bkr-slot[data-side=lone]{left:25%;width:50%;border-radius:4px 8px 8px 4px}
.bkr[data-two] .bkr-slot{box-shadow:0 18px 50px -12px rgba(0,0,0,.65)}
.bkr[data-two] .bkr-slot[data-side=left]::after,.bkr[data-two] .bkr-slot[data-side=right]::after{content:'';position:absolute;top:0;bottom:0;width:12%;pointer-events:none;z-index:9}
.bkr[data-two] .bkr-slot[data-side=left]::after{right:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.22))}
.bkr[data-two] .bkr-slot[data-side=right]::after{left:0;background:linear-gradient(90deg,rgba(0,0,0,.26),transparent)}
.bkr[data-two] .bkr-slot[data-side=wide]::after{content:'';position:absolute;top:0;bottom:0;left:47%;width:6%;background:linear-gradient(90deg,transparent,rgba(0,0,0,.18),transparent);pointer-events:none;z-index:9}
.bkr:not([data-two]) .bkr-book[data-framed] .bkr-slot{border-radius:6px 12px 12px 6px;box-shadow:0 18px 50px -12px rgba(0,0,0,.65)}
.bkr-leaf{position:absolute;top:0;bottom:0;z-index:20;transform-style:preserve-3d;transition:transform .72s cubic-bezier(.45,.05,.25,1)}
.bkr-face{position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.bkr-face.back{transform:rotateY(180deg)}
.bkr-face::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:9;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,0));transition:background .72s}
.bkr-leaf[data-turning] .bkr-face.front::after{background:linear-gradient(90deg,rgba(0,0,0,.05),rgba(0,0,0,.35))}
.bkr-cover{position:absolute;z-index:19;overflow:hidden}
.bkr-fade{animation:bkr-fade .45s ease both}
@keyframes bkr-fade{from{opacity:0}to{opacity:1}}
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
 * emotion): a 立绘's address; read(lines): reads lines aloud, resolving when done (false: nothing could be read);
 * stop(): stops reading. onClose / onFull / onMenu: buttons shown when given. two: whether a wide screen shows two
 * pages. onPage(i): the page now in front. visible(): whether keys are for it now. Returns {go, refresh, changed, at,
 * reading, setReading, destroy}.
 */
export function mountBookReader({doc, root, book, picture, sprite = () => '', read = null, stop = () => {}, at = 0, two = true, onClose = null, onFull = null, onMenu = null, onPage = () => {}, notify = () => {}, draft = false, visible = () => true}) {
  bookStyles(doc);
  const win = doc.defaultView, keys = new win.AbortController(), urls = new Map(), waiting = new Map();
  const frame = f => win.requestAnimationFrame ? win.requestAnimationFrame(f) : win.setTimeout(f, 16);
  const el = doc.createElement('div');
  el.className = 'bkr';
  el.tabIndex = -1;
  el.setAttribute('style', themeStyle(book.theme));
  el.innerHTML = `<div class="bkr-desk"></div><div class="bkr-book"></div>
    <div class="bkr-bar">${onClose ? `<button type="button" class="bkr-btn" data-r="close" aria-label="关上">${ICON.close}</button>` : ''}<span class="bkr-title"></span>
      ${onFull ? `<button type="button" class="bkr-btn" data-r="full" aria-label="全屏">${ICON.full}</button>` : ''}${onMenu ? `<button type="button" class="bkr-btn" data-r="menu" aria-label="更多">${ICON.more}</button>` : ''}</div>
    <div class="bkr-foot"><button type="button" class="bkr-btn" data-r="prev" aria-label="上一页">${ICON.prev}</button><input class="bkr-slider" type="range" min="0" value="0" aria-label="翻到"><span class="bkr-where"></span><button type="button" class="bkr-btn" data-r="next" aria-label="下一页">${ICON.next}</button>
      ${read ? `<button type="button" class="bkr-btn" data-r="read" aria-pressed="false">${ICON.play}朗读</button>` : ''}</div>
    <div class="bkr-hint"></div>`;
  root.append(el);
  const $ = s => el.querySelector(s), bookEl = $('.bkr-book');
  // A picture that will not load (a file gone) is left out, not shown broken.
  el.addEventListener('error', e => { if (e.target?.tagName === 'IMG') e.target.classList.add('bkp-broken'); }, true);
  let wide = false, list = [], shown = -1, heading = -1, showTurn = 0, size = {w: 0, h: 0}, busy = null, reading = false, readTurn = 0, quietTimer = 0, gone = false;
  let numbers = pageNumbers(book);

  // ---------- pictures ----------
  const keyOf = p => p?.id ? 'id:' + p.id : p?.url ? 'url:' + p.url : '';
  function want(p) {
    const k = keyOf(p);
    if (!k || urls.has(k)) return null;
    if (!waiting.has(k)) waiting.set(k, Promise.resolve(picture(p)).catch(() => '').then(u => { urls.set(k, u || ''); waiting.delete(k); }));
    return waiting.get(k);
  }
  const picturesOf = i => { const p = book.pages[i]; return p ? [...p.shots.map(s => s.picture), ...p.props.map(x => x.picture), ...(p.kind === 'end' ? [book.pages[0]?.shots[0]?.picture] : [])].filter(Boolean) : []; };
  const ready = async idx => { await Promise.all(idx.flatMap(picturesOf).map(want).filter(Boolean)); };
  const urlOf = p => urls.get(keyOf(p)) || '';
  function markup(i) {
    const cover = book.pages[0]?.shots[0]?.picture;
    return pageMarkup(book, i, {url: urlOf, sprite, number: numbers[i]?.number || 0, chapter: numbers[i]?.chapter || 0, draft, coverUrl: cover ? urlOf(cover) : ''});
  }
  const pageEl = i => { const t = doc.createElement('div'); t.innerHTML = markup(i); return t.firstElementChild; };
  /** Pictures of the opening after `o` start loading (the turn is smoother). */
  function ahead(o) { for (const i of list[o + 1] || []) for (const p of picturesOf(i)) want(p)?.then(() => { const u = urlOf(p); if (u) { const im = new win.Image(); im.src = u; } }); }

  // ---------- size ----------
  function layout() {
    const r = el.getBoundingClientRect(), W = r.width, H = r.height;
    if (!W || !H) return false;
    const nowWide = two && W / H > 1.15 && W >= 560;
    let w, h, framed = false;
    if (nowWide) { const m = Math.min(28, W * .03); w = Math.min(W - m * 2, (H - m * 2) * 1.5); h = w / 1.5; }
    else if (W / H > .86) { framed = true; const m = 16; h = Math.min(H - m * 2, (W - m * 2) / .75); w = h * .75; }
    else { w = W; h = H; }
    Object.assign(bookEl.style, {width: w + 'px', height: h + 'px', left: (W - w) / 2 + 'px', top: (H - h) / 2 + 'px'});
    bookEl.toggleAttribute('data-framed', framed);
    const changed = nowWide !== wide || !list.length;
    wide = nowWide;
    el.toggleAttribute('data-two', wide);
    size = {w, h};
    if (changed) list = openings(book, wide);
    return changed;
  }
  const openingOf = i => Math.max(0, list.findIndex(o => o.includes(i)));
  const sideOf = (o, k) => !wide ? 'one' : o.length === 2 ? (k ? 'right' : 'left') : book.pages[o[0]].layout === 'spread' ? 'wide' : 'lone';
  function slot(i, side) {
    const s = doc.createElement('div');
    s.className = 'bkr-slot'; s.dataset.side = side; s.dataset.page = i;
    s.append(pageEl(i));
    return s;
  }
  function fit(nodes) { for (const n of nodes) fitProse(n.querySelector?.('.bkp')); }
  const turnOn = nodes => frame(() => nodes.forEach(n => n.querySelector('.bkp')?.classList.add('on')));

  // ---------- showing an opening ----------
  async function show(o, dir = 0) {
    o = Math.max(0, Math.min(list.length - 1, o));
    heading = o;
    const turn = ++showTurn, target = list[o];
    await ready(target);
    // A later turn asked for meanwhile: that one is shown.
    if (gone || turn !== showTurn) return;
    busy?.(); busy = null;
    const old = [...bookEl.querySelectorAll(':scope > .bkr-slot')];
    const fresh = target.map((i, k) => slot(i, sideOf(target, k)));
    const was = shown;
    shown = o;
    const motion = dir && old.length && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!motion) { bookEl.replaceChildren(...fresh); fit(fresh); turnOn(fresh); }
    else if (!wide) turnOne(old, fresh, dir);
    else if (list[was]?.length === 2 && target.length === 2) turnLeaf(old, fresh, target, dir);
    else { bookEl.replaceChildren(...fresh); fresh.forEach(f => f.classList.add('bkr-fade')); fit(fresh); turnOn(fresh); }
    paintBar();
    onPage(target[0]);
    ahead(o);
  }
  /** One page: the old one turns away over the new (on), or the new one comes back over the old (back). */
  function turnOne(old, fresh, dir) {
    let done = false;
    const end = () => { if (done) return; done = true; bookEl.replaceChildren(...fresh); fit(fresh); turnOn(fresh); };
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
  }
  /**
   * Two pages: the leaf turns over the spine. On: it holds the old right page in front and the new left page behind,
   * and goes from the right to the left; back: the old left page in front, the new right behind, left to right.
   */
  function turnLeaf(old, fresh, target, dir) {
    const [oldL, oldR] = old, back = dir < 0;
    const leaf = doc.createElement('div');
    leaf.className = 'bkr-leaf';
    Object.assign(leaf.style, back ? {left: 0, width: '50%', transformOrigin: 'right center'} : {left: '50%', width: '50%', transformOrigin: 'left center'});
    const face = (node, cls) => { const f = doc.createElement('div'); f.className = 'bkr-face ' + cls; f.append(node); return f; };
    // The page that stays until the leaf lands on it.
    const stay = back ? oldR : oldL;
    stay.style.zIndex = 15;
    const front = back ? oldL : oldR;
    front.removeAttribute('data-side'); front.style.cssText = 'position:absolute;inset:0;width:auto;left:0;right:0;box-shadow:none';
    const behind = slot(back ? target[1] : target[0], 'one');
    behind.style.boxShadow = 'none';
    leaf.append(face(front, 'front'), face(behind, 'back'));
    bookEl.replaceChildren(...fresh, stay, leaf);
    fit([...fresh, behind]);
    let done = false;
    const end = () => { if (done) return; done = true; bookEl.replaceChildren(...fresh); turnOn(fresh); };
    frame(() => frame(() => { leaf.setAttribute('data-turning', ''); leaf.style.transform = `rotateY(${back ? 180 : -180}deg)`; }));
    const t = win.setTimeout(end, 760);
    busy = () => { win.clearTimeout(t); end(); };
  }
  function paintBar() {
    const o = list[shown] || [0], last = book.pages.length;
    $('.bkr-title').textContent = book.title;
    $('.bkr-where').textContent = o.length === 2 ? `${o[0] + 1}-${o[1] + 1} / ${last}` : `${o[0] + 1} / ${last}`;
    const slider = $('.bkr-slider');
    slider.max = String(list.length - 1); slider.value = String(shown);
  }
  const now = () => heading >= 0 ? heading : shown;
  function go(o, {keepReading = false} = {}) {
    if (o < 0 || o >= list.length || o === now()) return null;
    const dir = o > now() ? 1 : -1;
    const was = reading && !keepReading;
    if (was) { readTurn++; stop(); }
    // Reading when turned by hand: it goes on from the new page.
    return show(o, dir).then(() => { if (was && reading) readHere(); });
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
    if (on) { quiet(true); readHere(); } else stop();
  }
  async function readHere() {
    const turn = ++readTurn, o = now();
    for (const i of list[o] || []) {
      const lines = readOf(book, book.pages[i]);
      let done = false;
      try { done = lines.length ? await read(lines) : false; } catch (error) { notify(error.message, true); setReading(false); return; }
      if (turn !== readTurn || !reading) return;
      if (!done) {
        if (lines.length && !warned) { warned = true; hint('没有能朗读的声音，按时间自动翻页（在设置 → 整篇朗读选旁白声音）'); }
        // Nothing read: as long as it takes to look at it.
        const chars = lines.reduce((n, l) => n + l.text.length, 0);
        await new Promise(r => win.setTimeout(r, Math.min(9000, 2600 + chars * 120)));
        if (turn !== readTurn || !reading) return;
      }
    }
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
  el.addEventListener('wheel', e => { if (e.target.closest('.bkr-foot')) return; e.preventDefault(); const now = Date.now(); if (now - wheelAt < 450 || Math.abs(e.deltaY) < 8) return; wheelAt = now; step(e.deltaY > 0 ? 1 : -1); }, {passive: false});
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = b.dataset.r;
    later();
    if (r === 'prev') step(-1); else if (r === 'next') step(1);
    else if (r === 'read') setReading(!reading);
    else if (r === 'close') onClose?.();
    else if (r === 'full') onFull?.(list[now()]?.[0] ?? 0);
    else if (r === 'menu') onMenu?.(list[now()]?.[0] ?? 0);
  });
  $('.bkr-slider').addEventListener('input', e => { later(); go(Number(e.target.value)); });
  doc.addEventListener('keydown', e => {
    if (gone || !el.isConnected || el.closest('[hidden]') || e.target.closest?.('input:not(.bkr-slider), textarea, select, button, [contenteditable=true]')) return;
    if (!visible()) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); step(-1); }
    else if (k === 'Home') go(0); else if (k === 'End') go(list.length - 1);
    else if (k === 'Escape' && onClose) onClose();
  }, {signal: keys.signal});
  const resized = win.ResizeObserver ? new win.ResizeObserver(() => { const keep = list[now()]?.[0] ?? at; if (layout()) { shown = -1; show(openingOf(keep)); } }) : null;
  resized?.observe(el);

  // ---------- start ----------
  const cover = book.pages[0]?.shots[0]?.picture;
  if (cover) Promise.resolve(picture(cover)).then(u => { if (u && !gone) { const im = doc.createElement('img'); im.alt = ''; im.src = u; $('.bkr-desk').append(im); } }).catch(() => {});
  if (!layout()) list = openings(book, false);
  show(openingOf(Math.min(at, book.pages.length - 1)));
  quiet(false); later();

  return {
    get at() { return list[now()]?.[0] ?? 0; },
    get reading() { return reading; },
    go: i => go(openingOf(i)),
    setReading,
    /** The book changed (a page edited, a picture drawn): drawn again where it is. */
    refresh(next = book, i = null) {
      book = next; numbers = pageNumbers(book);
      el.setAttribute('style', themeStyle(book.theme));
      for (const [k, u] of [...urls]) if (!u) urls.delete(k);
      const keep = i ?? list[now()]?.[0] ?? 0;
      list = openings(book, wide);
      shown = -1;
      return show(openingOf(Math.min(keep, book.pages.length - 1)));
    },
    /** A page changed (a picture drawn for it): drawn again when it is in front, else kept for when it comes. */
    changed(next, page) {
      const front = list[now()] || [];
      if (front.includes(page) || (page === 0 && front.some(i => next.pages[i]?.kind === 'end'))) return this.refresh(next);
      book = next; numbers = pageNumbers(book);
      return null;
    },
    destroy() { gone = true; readTurn++; if (reading) stop(); keys.abort(); resized?.disconnect(); busy?.(); el.remove(); },
  };
}

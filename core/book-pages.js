// 绘本的页面: how a picture book looks — one renderer for the phone's reader, the full-screen reader on the tavern page
// and the exports (the web page, and the pictures the PDF / EPUB / images are made from). A book is its cover, its
// spreads and its last page. On a wide screen a spread is seen whole, the two pages side by side with the fold between
// them; on a tall one a page at a time — a spread of two pages (a picture on one, its words on the other) as its two
// pages one after the other, a spread laid across both (a picture across both pages) as one page, its picture
// drifting slowly across so all of it is seen. A view is markup and one stylesheet (BOOK_CSS); every size on it is in
// units of the page (1% of its height, less on a page narrower than 3:4), so the same view fits a phone, half of a
// book open on a computer, or a picture of 2400 × 1600.
// The words are set on the paper or in the room a picture leaves for them, without boxes, in the book's type; a few
// lines said may be in a speech bubble. When a view is shown (class "on") its picture moves a little and its words
// come in; read aloud, the line being read is marked. Over it only the weather of its story is drawn (by the reader).
import {themeOf} from './book-themes.js';
import {SPREADS, WEATHER, sheetOf, sheetCount} from './book.js';
import {storyFx} from './vn.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .3 0 0 0 0 .25 0 0 0 0 .2 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
/** A steady random for a spread (the same spread always looks the same). */
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** The theme as CSS variables (on a page, or on whatever holds pages). */
export function themeStyle(id) {
  const t = themeOf(id), q = s => s.replace(/"/g, "'");
  return `--bk-paper:${t.paper};--bk-ink:${t.ink};--bk-accent:${t.accent};--bk-soft:${t.soft};--bk-font:${q(t.font)};--bk-title:${q(t.title)}`;
}
/** Whether a theme's paper is dark (pictures on white backgrounds are then faded in, not printed onto it). */
const darkPaper = id => { const h = themeOf(id).paper.replace('#', ''), n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16); return ((n >> 16 & 255) * .3 + (n >> 8 & 255) * .59 + (n & 255) * .11) < 110; };

/**
 * What is seen at once: [{sheet, part}] — wide: the cover, each spread whole, the last page (part 'all'); tall: the
 * cover, a spread of two pages as 'left' then 'right' (a page with nothing on it left out), a spread laid across both
 * as one page ('tall'), the last page.
 */
export function viewsOf(book, wide) {
  const out = [{sheet: 0, part: 'all'}];
  book.spreads.forEach((s, i) => {
    const sheet = i + 1;
    if (wide) out.push({sheet, part: 'all'});
    else if (!SPREADS[s.layout].halves) out.push({sheet, part: 'tall'});
    else {
      // A page with nothing on it (no picture, no words) is not one to turn to.
      const pages = ['left', 'right'].filter(part => pictured(s, part) || viewWords(book, {sheet, part}).length);
      for (const part of pages.length ? pages : ['left']) out.push({sheet, part});
    }
  });
  out.push({sheet: sheetCount(book) - 1, part: 'all'});
  return out;
}
// Whether a page of a spread of two pages has its picture (or someone standing) on it.
const pictured = (s, side) => s.layout === 'pair' || (side === s.side && (SPREADS[s.layout].pictures > 0 || s.layout === 'stage'));
/** A spread's words cut in two at about half their length (two moments, two pages of words): [first, second] by place. */
function halvesOf(list) {
  const total = list.reduce((n, w) => n + w.text.length, 0);
  let at = 0, k = 0;
  while (k < list.length - 1 && at + list[k].text.length <= total / 2 + 8) at += list[k++].text.length;
  if (!k && list.length > 1) k = 1;
  return [list.map((_, i) => i).slice(0, k || list.length), list.map((_, i) => i).slice(k || list.length)];
}
/**
 * Which of a spread's words a view shows (their places, in order): all of them seen whole; on a tall screen, the
 * page with the words has them (the speech bubble of someone standing on the paper is on their page), two moments or
 * two pages of words each their half, a page with only a picture none.
 */
export function viewWords(book, view) {
  const sheet = sheetOf(book, view.sheet);
  if (sheet.kind !== 'spread') return [];
  const s = sheet.spread, all = s.words.map((_, i) => i);
  if (view.part === 'all' || view.part === 'tall') return all;
  if (s.layout === 'pair' || s.layout === 'text') return halvesOf(s.words)[view.part === 'left' ? 0 : 1];
  const pictureSide = view.part === s.side;
  if (s.layout === 'stage') { const said = all.filter(k => standsAndSays(s, k)); return pictureSide ? said : all.filter(k => !said.includes(k)); }
  return pictureSide ? [] : all;
}
// A line in a bubble over someone standing on the paper.
const standsAndSays = (s, k) => s.layout === 'stage' && s.words[k].bubble && s.cast.some(c => c.name === s.words[k].role);

/**
 * How sheet n is performed: {fx} — the weather drawn over it: what the spread says, else what its words name
 * (rain, snow, fog …); none on the cover and the last page.
 */
export function directionOf(book, n) {
  const sheet = sheetOf(book, n);
  if (sheet.kind !== 'spread') return {fx: []};
  let fx = [...sheet.spread.fx];
  if (!fx.length) {
    const f = storyFx(sheet.spread.words.map(w => w.text).join(' '));
    if (f.weather && f.weather !== 'clear') fx = f.weather.split('+').filter(k => Object.hasOwn(WEATHER, k));
  }
  return {fx: fx.slice(0, 2)};
}

// Where a picture is still to come: a few pencil lines of a picture.
const SKETCH = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M4 4 H60 V44 H4 Z M8 38 L22 22 L32 32 L40 24 L56 38" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round"/><circle cx="46" cy="14" r="4.5" style="fill:none;stroke:currentColor;stroke-width:2.2"/></svg>';
const FRAMES = ['plain', 'round', 'arch'];

/**
 * A view's markup ({sheet, part} — viewsOf). url(picture): where a picture is ('' when it is not there);
 * sprite(name, emotion): a character's 立绘 ('' when none); draft: show where pictures are still to come.
 */
export function viewMarkup(book, view, {url = () => '', sprite = () => '', draft = false} = {}) {
  const sheet = sheetOf(book, view.sheet), t = themeOf(book.theme), part = view.part || 'all';
  const blank = s => `<div class="bk-blank">${SKETCH}${draft && (s?.prompt || s?.wanted) ? '<small>这张图还没画</small>' : ''}</div>`;
  const img = (s, cls = '') => { const u = s?.picture ? url(s.picture) : ''; return u ? `<img class="bk-img${cls ? ' ' + cls : ''}" src="${esc(u)}" alt="" draggable="false">` : blank(s); };
  const attrs = (kind, layout, extra = '') => `class="bk" data-kind="${kind}" data-layout="${layout}" data-part="${part}" data-theme="${esc(book.theme)}"${darkPaper(book.theme) ? ' data-dark' : ''}${extra} style="${themeStyle(book.theme)}"`;

  if (sheet.kind === 'cover') {
    const pic = book.cover.picture && url(book.cover.picture), vertical = book.theme === 'ancient';
    const chars = [...book.title].map((c, k) => `<span style="--k:${k}">${esc(c)}</span>`).join('');
    return `<article ${attrs('cover', 'cover')}>${pic ? `<div class="bk-fill">${img(book.cover, 'bk-push')}</div><i class="bk-shade"></i>` : `<div class="bk-cover-art">${draft && book.cover.prompt ? blank({wanted: true}) : ''}</div>`}
      <div class="bk-cover-words"><h1 class="bk-booktitle">${chars}</h1>${book.subtitle ? `<p class="bk-subtitle">${esc(book.subtitle)}</p>` : ''}</div>
      <div class="bk-imprint"><b>${esc(t.label)}绘本</b>${book.author ? `<span>${esc(book.author)}</span>` : ''}</div>${vertical ? `<i class="bk-seal">${esc([...book.title][0] || '书')}</i>` : ''}</article>`;
  }
  if (sheet.kind === 'end') {
    const pic = book.cover.picture && url(book.cover.picture);
    return `<article ${attrs('end', 'end')}><div class="bk-end">${pic ? `<div class="bk-end-pic"><img class="bk-img" src="${esc(pic)}" alt="" draggable="false"></div>` : ''}
      <strong class="bk-fin">${book.theme === 'scifi' || book.theme === 'mystery' ? 'THE END' : '完'}</strong>${book.ending ? `<p class="bk-ending">${esc(book.ending)}</p>` : ''}</div>${book.theme === 'ancient' ? '<i class="bk-seal">终</i>' : ''}</article>`;
  }

  const s = sheet.spread, r = rng(book.id + '#' + view.sheet), L = s.layout, def = SPREADS[L];
  const total = s.words.reduce((n, w) => n + w.text.length, 0);
  const quote = w => /^[「『“"]/.test(w.text) ? esc(w.text) : `「${esc(w.text)}」`;
  const seg = k => { const w = s.words[k], body = w.role ? quote(w) : esc(w.text); return `<span data-k="${k}"${w.role ? ' class="bk-q"' : ''}>${body.replace(/\n/g, '<br>')}</span>`; };
  /** A block of words: the spread's heading over it (the first block only), long ones set justified and smaller. */
  let headed = false;
  const block = ks => {
    if (!ks.length) return '';
    const head = s.heading && !headed ? (headed = true, `<h3 class="bk-head">${esc(s.heading)}</h3>`) : '';
    const n = ks.reduce((m, k) => m + s.words[k].text.length, 0);
    return `<div class="bk-words${n > 46 ? ' bk-long' : ''}">${head}<p>${ks.map(seg).join('')}</p></div>`;
  };
  const bubble = (k, cls = '') => { const w = s.words[k]; return `<div class="bk-bubble${cls}" data-k="${k}" data-at="${w.at}"><span>${esc(w.text)}</span></div>`; };
  const tall = part === 'tall', moving = tall ? 'bk-pan' : 'bk-push';

  // ---- a spread of two pages: what each page has ----
  const page = side => {
    const pictureSide = side === s.side, ks = viewWords(book, {sheet: view.sheet, part: side});
    switch (L) {
      case 'quiet': return pictureSide ? `<div class="bk-vig">${img(s.pictures[0])}</div>` : block(ks);
      case 'page': return pictureSide ? `<div class="bk-fill">${img(s.pictures[0], 'bk-push')}</div>` : block(ks);
      case 'stage': {
        if (!pictureSide) return block(ks);
        const said = ks.length ? `<div class="bk-over">${ks.map(k => bubble(k)).join('')}</div>` : '';
        return `<i class="bk-shadow"></i><div class="bk-cast" data-n="${s.cast.length}">${s.cast.map((c, k) => { const u = sprite(c.name, c.emotion); return u ? `<figure class="bk-actor" style="--i:${k}" aria-label="${esc(c.name)}"><img src="${esc(u)}" alt="" draggable="false"></figure>` : ''; }).join('')}</div>${said}`;
      }
      case 'pair': {
        const k = side === 'left' ? 0 : 1;
        return `<figure class="bk-snap">${img(s.pictures[k])}</figure>${block(ks).replace('class="bk-words', 'class="bk-words bk-under')}`;
      }
      default: return block(ks);
    }
  };
  if (def.halves) {
    const halves = part === 'all' ? ['left', 'right'] : [part];
    const body = halves.map(side => `<section class="bk-half ${part === 'all' ? (side === 'left' ? 'bk-l' : 'bk-r') : 'bk-one'}" data-side="${side}"${side === s.side ? ' data-pic' : ''}>${page(side)}</section>`).join('');
    return `<article ${attrs('spread', L)}>${body}${part === 'all' ? '<i class="bk-gutter"></i>' : ''}</article>`;
  }

  // ---- a spread laid across both pages: the picture, and the words where it leaves room for them ----
  const all = s.words.map((_, i) => i), bubbles = L === 'window' ? [] : all.filter(k => s.words[k].bubble), plain = all.filter(k => !bubbles.includes(k));
  const place = L === 'window' ? 'under' : L === 'ground' ? 'top' : s.space;
  // Each corner of the room for words: the words on their page, a bubble on its speaker's side (with the words when
  // the speaker is on their page).
  const zones = new Map();
  const put = (side, html) => { const k = tall ? 'one' : side; zones.set(k, (zones.get(k) || '') + html); };
  put(s.side, block(plain));
  for (const k of bubbles) put(s.words[k].at, bubble(k));
  const zoneHtml = [...zones].filter(([, h]) => h).map(([side, h]) => `<div class="bk-zone" data-place="${place}" data-side="${side}"${L === 'spread' ? ` data-tone="${s.tone}"` : ''}>${h}</div>`).join('');
  const shape = FRAMES[Math.floor(r() * FRAMES.length)];
  const picture = L === 'window' ? `<div class="bk-frame" data-shape="${shape}">${img(s.pictures[0], moving)}</div>`
    : L === 'fade' ? `<div class="bk-fadepic" data-space="${s.space}">${img(s.pictures[0], moving)}</div>`
    : L === 'ground' ? `<div class="bk-groundpic">${img(s.pictures[0], moving)}</div>`
    : `<div class="bk-fill">${img(s.pictures[0], moving)}</div>`;
  return `<article ${attrs('spread', L, ` data-space="${s.space}"`)}>${picture}${zoneHtml}${part === 'all' && L !== 'spread' ? '<i class="bk-gutter"></i>' : ''}${part === 'all' && L === 'spread' ? '<i class="bk-gutter bk-soft-gutter"></i>' : ''}</article>`;
}

/** The pages' stylesheet. Everything is inside .bk; a view is sized by what holds it. */
export const BOOK_CSS = `
.bk{container:bk/size;--u:min(1cqh,1.3333cqw);position:absolute;inset:0;overflow:hidden;box-sizing:border-box;background:var(--bk-paper);background-image:${NOISE};color:var(--bk-ink);font-family:var(--bk-font);font-size:16px;line-height:1.6;-webkit-user-select:none;user-select:none;text-align:left;letter-spacing:0;word-break:normal;overflow-wrap:anywhere;line-break:strict}
.bk *,.bk *::before,.bk *::after{box-sizing:border-box}
:where(.bk) :where(h1,h2,h3,p,figure){margin:0;padding:0;font:inherit;color:inherit}
.bk img.bk-broken{visibility:hidden}
.bk img{-webkit-user-drag:none;max-width:none}
.bk-img{display:block;width:100%;height:100%;object-fit:cover}
.bk-blank{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:calc(var(--u) * 2);background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--bk-paper) 70%,transparent),var(--bk-soft));color:var(--bk-ink)}
.bk-blank svg{width:calc(var(--u) * 20);height:auto;opacity:.22}
.bk-blank small{font-size:calc(var(--u) * 2.4);opacity:.6}
.bk-fill{position:absolute;inset:0;overflow:hidden;background:var(--bk-soft)}
.bk-shade{position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.42),transparent 40%,transparent 72%,rgba(0,0,0,.32));pointer-events:none}

/* ---- two pages: each its own, the fold between ---- */
/* a page is its own layer (a size container): it has the paper too, so a picture printed onto it (multiply) shows the paper through its white */
.bk-half{position:absolute;top:0;bottom:0;width:50%;overflow:hidden;container:bkh/size;background:inherit}
.bk-l{left:0}.bk-r{right:0}.bk-one{left:0;right:0;width:auto}
.bk-gutter{position:absolute;top:0;bottom:0;left:50%;width:9%;transform:translateX(-50%);background:linear-gradient(90deg,transparent,rgba(0,0,0,.05) 38%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.05) 62%,transparent);pointer-events:none;z-index:6}
.bk-soft-gutter{opacity:.6}

/* ---- the words: on the paper, no box ---- */
.bk-words{font-size:calc(var(--u) * 3.5);line-height:1.85;letter-spacing:.03em;max-width:100%}
.bk-words p{margin:0;text-wrap:pretty}
.bk-head{display:block;margin:0 0 .8em;font:700 calc(var(--u) * 2.5)/1.35 var(--bk-title);letter-spacing:.24em;color:var(--bk-accent)}
.bk-half>.bk-words{position:absolute;left:15%;right:15%;top:47%;transform:translateY(-50%);text-align:center}
.bk-half>.bk-words.bk-long{left:12%;right:12%;text-align:justify}
.bk-half>.bk-words.bk-long .bk-head{text-align:center}
.bk[data-theme=ancient] .bk-half>.bk-words{writing-mode:vertical-rl;top:13%;bottom:13%;left:12%;right:14%;transform:none;text-align:start;letter-spacing:.16em;line-height:2.1}
.bk-words [data-k]{border-radius:.2em;transition:background-color .35s,box-shadow .35s}
.bk-words [data-k].now{background:color-mix(in srgb,var(--bk-accent) 20%,transparent);box-shadow:0 0 0 .12em color-mix(in srgb,var(--bk-accent) 20%,transparent)}

/* ---- a small picture alone in white space ---- */
.bk-vig{position:absolute;left:11%;right:11%;top:50%;aspect-ratio:1;transform:translateY(-53%)}
.bk-vig>.bk-img,.bk-vig>.bk-blank{position:absolute;inset:0;-webkit-mask:radial-gradient(closest-side,#000 72%,transparent);mask:radial-gradient(closest-side,#000 72%,transparent)}
.bk:not([data-dark]) :is(.bk-vig,.bk-snap,.bk-fadepic,.bk-groundpic){mix-blend-mode:multiply}

/* ---- someone standing on the paper ---- */
.bk-cast{position:absolute;left:0;right:0;bottom:10%;height:70%}
.bk-actor{position:absolute;left:50%;bottom:0;height:100%;width:88%;transform:translateX(-50%);display:flex;justify-content:center;align-items:flex-end;margin:0}
.bk-actor img{height:100%;width:100%;object-fit:contain;object-position:50% 100%}
.bk-cast[data-n="2"] .bk-actor{width:64%;height:86%}
.bk-cast[data-n="2"] .bk-actor:nth-child(1){left:32%}.bk-cast[data-n="2"] .bk-actor:nth-child(2){left:68%}
.bk-shadow{position:absolute;left:16%;right:16%;bottom:7.5%;height:5%;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.16),transparent);pointer-events:none}
.bk-actor[data-talk] img{animation:bk-talk .4s ease-in-out infinite alternate;transform-origin:50% 100%}
.bk-over{position:absolute;top:5%;left:9%;right:9%;display:flex;justify-content:center;z-index:3}

/* ---- two moments ---- */
.bk-snap{position:absolute;left:14%;right:14%;top:11%;aspect-ratio:1;margin:0;border-radius:calc(var(--u) * .9);overflow:hidden}
.bk-snap>.bk-img,.bk-snap>.bk-blank{position:relative;width:100%;height:100%}
.bk-half>.bk-words.bk-under{top:calc(15% + 72cqw);transform:none}
.bk[data-theme=ancient] .bk-half>.bk-words.bk-under{writing-mode:horizontal-tb;top:calc(15% + 72cqw);bottom:auto;letter-spacing:.06em;line-height:1.85;text-align:center}

/* ---- across both pages: a frame, a picture to the edges, a picture fading into the paper, a foreground ---- */
.bk-frame{position:absolute;left:7%;right:7%;top:7%;height:62%;overflow:hidden;background:var(--bk-soft);box-shadow:0 0 0 calc(var(--u) * .3) color-mix(in srgb,var(--bk-ink) 72%,transparent),0 0 0 calc(var(--u) * 1.4) var(--bk-paper),0 0 0 calc(var(--u) * 1.65) color-mix(in srgb,var(--bk-ink) 30%,transparent)}
.bk-frame[data-shape=round]{border-radius:calc(var(--u) * 4.5)}
.bk-frame[data-shape=arch]{border-radius:46% 46% calc(var(--u) * 1) calc(var(--u) * 1)/22% 22% calc(var(--u) * 1) calc(var(--u) * 1)}
.bk-fadepic{position:absolute;left:0;right:0;height:72%;overflow:hidden}
.bk-fadepic[data-space=bottom]{top:0;-webkit-mask:linear-gradient(#000 52%,transparent);mask:linear-gradient(#000 52%,transparent)}
.bk-fadepic[data-space=top]{bottom:0;-webkit-mask:linear-gradient(transparent,#000 48%);mask:linear-gradient(transparent,#000 48%)}
.bk-groundpic{position:absolute;left:0;right:0;bottom:0;height:80%;overflow:hidden;-webkit-mask:linear-gradient(transparent 4%,#000 42%);mask:linear-gradient(transparent 4%,#000 42%)}
.bk-groundpic>.bk-img{object-position:50% 100%}
.bk-zone{position:absolute;display:flex;flex-direction:column;gap:calc(var(--u) * 2.6);z-index:4;width:36%}
.bk-zone[data-side=left]{left:7%}.bk-zone[data-side=right]{right:7%}
.bk-zone[data-place=top]{top:7%}.bk-zone[data-place=bottom]{bottom:8%;justify-content:flex-end}.bk-zone[data-place=under]{top:75%}
.bk-zone .bk-words{position:relative}
.bk[data-layout=spread] .bk-zone[data-tone=light] .bk-words{color:#1f1a16;text-shadow:0 0 .5em rgba(255,255,255,.9),0 0 .18em rgba(255,255,255,.9)}
.bk[data-layout=spread] .bk-zone[data-tone=dark] .bk-words{color:#fff;text-shadow:0 0 .55em rgba(0,0,0,.7),0 .08em .2em rgba(0,0,0,.6)}
.bk[data-layout=spread] .bk-zone::before{content:'';position:absolute;inset:-28% -20%;z-index:-1;pointer-events:none;background:radial-gradient(closest-side,rgba(255,255,255,.42),transparent)}
.bk[data-layout=spread] .bk-zone[data-tone=dark]::before{background:radial-gradient(closest-side,rgba(0,0,0,.34),transparent)}
.bk[data-layout=spread] .bk-head{color:inherit}

/* ---- a speech bubble (only a few) ---- */
.bk-bubble{position:relative;max-width:96%;align-self:flex-start}
.bk-zone[data-side=right] .bk-bubble,.bk-bubble[data-at=right]{align-self:flex-end}
.bk-bubble span{display:block;padding:.45em .95em;border-radius:1.3em;background:#fff;color:#222;border:calc(var(--u) * .32) solid #2b2b2b;font-size:calc(var(--u) * 3.1);line-height:1.5;box-shadow:0 calc(var(--u) * .8) calc(var(--u) * 2.2) calc(var(--u) * -1) rgba(0,0,0,.4)}
.bk-bubble::after{content:'';position:absolute;bottom:calc(var(--u) * -1.9);left:18%;width:calc(var(--u) * 3.2);height:calc(var(--u) * 3.2);background:#fff;border:calc(var(--u) * .32) solid #2b2b2b;border-top:0;border-left:0;transform:skew(28deg) rotate(42deg);border-radius:0 0 calc(var(--u) * .5) 0}
.bk-bubble[data-at=right]::after{left:auto;right:18%;transform:skew(-28deg) rotate(42deg)}
.bk-over .bk-bubble,.bk-over .bk-bubble[data-at=right]{align-self:center}
.bk-over .bk-bubble::after,.bk-over .bk-bubble[data-at=right]::after{left:calc(50% - var(--u) * 1.6);right:auto;transform:skew(28deg) rotate(42deg)}
.bk-bubble.now span{box-shadow:0 0 0 calc(var(--u) * .6) color-mix(in srgb,var(--bk-accent) 45%,transparent)}
.bk[data-dark] .bk-bubble span{background:#f1ece2;border-color:#111}

/* ---- one page on a tall screen, the spread laid across both: the picture drifts across; the words where it has room ---- */
.bk[data-part=tall] .bk-zone{left:9%;right:9%;width:auto}
.bk[data-part=tall] .bk-zone[data-place=top]{top:7%}.bk[data-part=tall] .bk-zone[data-place=bottom]{bottom:8%}
.bk[data-part=tall][data-layout=window] .bk-frame{left:7%;right:7%;top:9%;height:44%}
.bk[data-part=tall][data-layout=window] .bk-zone[data-place=under]{top:62%}
.bk[data-part=tall][data-layout=fade] .bk-fadepic{height:66%}
.bk[data-part=tall][data-layout=ground] .bk-groundpic{height:72%}
.bk[data-part=tall] .bk-zone .bk-words{text-align:center}

/* ---- the cover and the last page ---- */
.bk-cover-art{position:absolute;inset:0;background:radial-gradient(circle at 30% 25%,var(--bk-soft),transparent 55%),radial-gradient(circle at 75% 80%,color-mix(in srgb,var(--bk-accent) 30%,transparent),transparent 55%),var(--bk-paper)}
.bk-cover-words{position:absolute;left:6%;right:6%;top:8%;text-align:center;z-index:3}
.bk-booktitle{font:900 13cqmin/1.15 var(--bk-title);color:#fff;letter-spacing:.04em;text-shadow:.8cqmin 0 0 var(--bk-accent),-.8cqmin 0 0 var(--bk-accent),0 .8cqmin 0 var(--bk-accent),0 -.8cqmin 0 var(--bk-accent),.6cqmin .6cqmin 0 var(--bk-accent),-.6cqmin -.6cqmin 0 var(--bk-accent),.6cqmin -.6cqmin 0 var(--bk-accent),-.6cqmin .6cqmin 0 var(--bk-accent),0 2cqmin 3cqmin rgba(0,0,0,.35)}
.bk-booktitle span{display:inline-block}
.bk:is([data-theme=fairy],[data-theme=comedy],[data-theme=school],[data-theme=adventure]) .bk-booktitle span:nth-child(odd){--rot:-5deg;transform:rotate(-5deg)}
.bk:is([data-theme=fairy],[data-theme=comedy],[data-theme=school],[data-theme=adventure]) .bk-booktitle span:nth-child(even){--rot:4deg;transform:rotate(4deg)}
.bk[data-theme=comedy] .bk-booktitle{color:#ffe14d;text-shadow:.9cqmin 0 0 #222,-.9cqmin 0 0 #222,0 .9cqmin 0 #222,0 -.9cqmin 0 #222,.7cqmin .7cqmin 0 #222,-.7cqmin -.7cqmin 0 #222,.7cqmin -.7cqmin 0 #222,-.7cqmin .7cqmin 0 #222,2cqmin 2cqmin 0 #ff5d8f}
.bk[data-theme=romance] .bk-booktitle{font-weight:400;color:#fff;text-shadow:0 0 1cqmin #ff9dbb,0 0 3cqmin #ff6a9a,0 0 6cqmin rgba(255,106,154,.7)}
.bk[data-theme=fantasy] .bk-booktitle{color:#ffe7a3;text-shadow:0 .5cqmin 0 #6b4518,0 -.3cqmin 0 #6b4518,.4cqmin 0 0 #6b4518,-.4cqmin 0 0 #6b4518,0 0 4cqmin rgba(255,210,120,.8)}
.bk[data-theme=fantasy] .bk-cover-words::before,.bk[data-theme=fantasy] .bk-cover-words::after{content:'❦';display:block;color:#ffe7a3;font-size:6cqmin;text-shadow:0 0 2cqmin rgba(0,0,0,.5)}
.bk[data-theme=ancient] .bk-cover-words{left:auto;right:8%;top:7%;padding:3cqmin 2cqmin;background:#f6efe0;border:.5cqmin solid #2b2420;outline:.3cqmin solid #2b2420;outline-offset:.8cqmin;box-shadow:0 2cqmin 4cqmin rgba(0,0,0,.3)}
.bk[data-theme=ancient] .bk-booktitle{writing-mode:vertical-rl;font-weight:400;font-size:10cqmin;color:#1d1814;text-shadow:none;letter-spacing:.12em}
.bk[data-theme=ancient] .bk-subtitle{writing-mode:vertical-rl;font-size:3.6cqmin;margin:0;padding:1.6cqmin .8cqmin;color:#3b2f26;background:rgba(246,239,224,.9);text-shadow:none;position:absolute;right:calc(100% + 2cqmin);top:4cqmin;box-shadow:0 1cqmin 2.4cqmin rgba(0,0,0,.25)}
.bk[data-theme=mystery] .bk-booktitle{color:#f3ecdc;font-weight:700;letter-spacing:.2em;text-shadow:0 .6cqmin 0 #000;border-top:.5cqmin solid var(--bk-accent);border-bottom:.5cqmin solid var(--bk-accent);padding:.15em 0}
.bk[data-theme=horror] .bk-booktitle{color:#e9d6c3;text-shadow:0 .5cqmin 0 #4a0808,0 1.5cqmin 1.2cqmin #a62626,0 3.5cqmin 2.5cqmin rgba(166,38,38,.75)}
.bk[data-theme=scifi] .bk-booktitle{font-weight:300;letter-spacing:.24em;color:#eafcff;text-shadow:0 0 1cqmin #3fd0ff,0 0 3cqmin #3fd0ff,0 0 7cqmin #ff5fd2}
.bk[data-theme=school] .bk-booktitle{color:var(--bk-ink);text-shadow:.5cqmin .5cqmin 0 #fff,-.5cqmin -.5cqmin 0 #fff,.5cqmin -.5cqmin 0 #fff,-.5cqmin .5cqmin 0 #fff;background:linear-gradient(transparent 58%,color-mix(in srgb,var(--bk-accent) 85%,transparent) 58% 92%,transparent 92%);display:inline;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.bk-subtitle{margin-top:2cqmin;font:500 4.4cqmin/1.5 var(--bk-font);color:#fff;text-shadow:0 .3cqmin 1.2cqmin rgba(0,0,0,.7)}
.bk-cover-art~.bk-cover-words .bk-subtitle{color:var(--bk-ink);text-shadow:none}
.bk-imprint{position:absolute;left:0;right:0;bottom:4%;display:flex;flex-direction:column;align-items:center;gap:.8cqmin;z-index:3;color:#fff;text-shadow:0 .3cqmin 1cqmin rgba(0,0,0,.7);font-size:3.2cqmin}
.bk-imprint b{padding:.25em 1.1em;border-radius:99px;background:var(--bk-accent);color:#fff;text-shadow:none;letter-spacing:.2em;font-size:3cqmin}
.bk-cover-art~.bk-imprint{color:var(--bk-ink);text-shadow:none}
.bk-seal{position:absolute;left:6%;bottom:6%;width:11cqmin;height:11cqmin;display:grid;place-items:center;border:.7cqmin solid #b02a2a;border-radius:1.2cqmin;color:#b02a2a;font:700 7cqmin/1 var(--bk-title);font-style:normal;transform:rotate(-8deg);opacity:.85;mix-blend-mode:multiply;z-index:4;background:rgba(176,42,42,.06)}
.bk-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4cqmin;padding:10%;text-align:center}
.bk-end-pic{width:44cqmin;height:44cqmin;border-radius:50%;overflow:hidden;border:1.4cqmin solid #fff;box-shadow:0 2cqmin 5cqmin -1cqmin rgba(0,0,0,.4)}
.bk-fin{font:900 18cqmin/1 var(--bk-title);color:var(--bk-accent);letter-spacing:.1em;text-shadow:0 1cqmin 0 color-mix(in srgb,var(--bk-accent) 35%,transparent)}
.bk[data-theme=scifi] .bk-fin,.bk[data-theme=mystery] .bk-fin{font-size:12cqmin;font-family:var(--bk-font);letter-spacing:.3em;font-weight:300}
.bk-ending{max-width:76%;font-size:calc(var(--u) * 3.2);line-height:1.8;text-align:center}

/* ---- coming in when shown (class pre: about to be shown; on: shown) ---- */
.bk.pre :is(.bk-words,.bk-bubble,.bk-ending,.bk-booktitle,.bk-subtitle,.bk-imprint,.bk-fin,.bk-end-pic){opacity:0}
.bk.on .bk-words,.bk.on .bk-bubble{animation:bk-in 1s ease .35s both}
.bk.on .bk-push{animation:bk-push 20s ease-out both}
.bk.on .bk-pan{animation:bk-pan 44s ease-in-out infinite}
.bk.on .bk-fin{animation:bk-stamp .7s cubic-bezier(.2,1.3,.4,1) .35s both}
.bk.on .bk-end-pic,.bk.on .bk-ending{animation:bk-in 1.2s ease .2s both}
.bk.on .bk-subtitle{animation:bk-rise .9s ease 1s both}
.bk.on .bk-imprint{animation:bk-rise .9s ease 1.3s both}
.bk.on .bk-booktitle span{animation:bk-pop .6s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(.3s + var(--k) * .08s)}
@keyframes bk-in{from{opacity:0}}
@keyframes bk-push{from{transform:scale(1)}to{transform:scale(1.045)}}
@keyframes bk-pan{0%,100%{object-position:50% 50%}25%{object-position:0% 50%}75%{object-position:100% 50%}}
@keyframes bk-talk{to{transform:translateY(-1.2%) scale(1.012)}}
@keyframes bk-stamp{from{opacity:0;transform:scale(1.6)}}
@keyframes bk-rise{from{opacity:0;transform:translateY(1em)}}
@keyframes bk-pop{from{opacity:0;transform:translateY(.4em) scale(.6)}}
@media (prefers-reduced-motion:reduce){.bk *{animation:none !important}}
`;

/**
 * A view's words made smaller until they fit (the story as written can be long): each block of words in a view shown
 * in the document kept on its page with a margin — in the room a picture leaves, no more than about two fifths of the
 * page — not below 55% of its size. Needs nothing but the document (the web page export carries it as it is).
 */
export function fitWords(view) {
  for (const box of view?.querySelectorAll?.('.bk-words') || []) {
    box.style.fontSize = '';
    const page = box.closest('.bk-half') || box.closest('.bk'), zone = box.closest('.bk-zone');
    if (!page) continue;
    const fits = () => {
      const p = page.getBoundingClientRect(), b = (zone || box).getBoundingClientRect(), m = Math.min(p.width, p.height) * .04;
      if (!p.height) return true;
      if (b.top < p.top + m || b.bottom > p.bottom - m || b.left < p.left + m / 2 || b.right > p.right - m / 2) return false;
      return !zone || zone.dataset.place === 'under' || b.height <= p.height * .45;
    };
    let k = 1;
    while (!fits() && k > .58) { k -= .06; box.style.fontSize = 'calc(var(--u) * ' + (3.5 * k).toFixed(2) + ')'; }
  }
}

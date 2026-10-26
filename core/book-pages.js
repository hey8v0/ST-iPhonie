// 绘本的页面: how a page of a picture book looks and performs — one renderer for the phone's reader, the full-screen
// reader on the tavern page and the exports (the web page, and the pictures PDF / EPUB / images are made from). A page
// is markup and one stylesheet (BOOK_CSS); every size on it is in units of the page itself (cqmin), so the same page
// fits a phone in full screen, half of a book open on a computer, or a picture of 1200 × 1600.
// Pictures are the page: one over the whole of it, panels, photos taped on paper, a small picture in white space, a
// scene with the characters' 立绘 standing on it like paper cut-outs. On them, few words: a caption in the theme's way,
// speech bubbles, a thought, a shout, a whisper; little drawings and drawn things cut out; the theme's paper and
// ornaments. Each page is directed (directionOf): the light of its mood, a camera move over its picture, effects
// (lightning, a heartbeat, light rays, a memory's sepia … and weather the reader draws over it), the way it is turned
// to, and how its words come in (by the book's kind: fading up, typed, soaking in like ink, popping, flickering), piece
// by piece, one line after another — or each as it is read aloud. All of it plays when the page is shown (class "on").
import {themeOf} from './book-themes.js';
import {ornamentSvg} from './book-ornaments.js';
import {visualEmotion} from './visual-emotion.js';
import {storyFx} from './vn.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** A steady random for a page (the same page always looks the same). */
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (list, r) => list[Math.floor(r() * list.length) % list.length];
const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .3 0 0 0 0 .25 0 0 0 0 .2 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** The theme as CSS variables (on a page, or on whatever holds pages). */
export function themeStyle(id) {
  const t = themeOf(id), q = s => s.replace(/"/g, "'");
  return `--bk-paper:${t.paper};--bk-ink:${t.ink};--bk-accent:${t.accent};--bk-soft:${t.soft};--bk-font:${q(t.font)};--bk-title:${q(t.title)};--bk-hand:${q(t.hand)};--bk-tape1:${t.tape[0]};--bk-tape2:${t.tape[1]};--bk-tape3:${t.tape[2]}`;
}

/** Page numbers and chapter numbers: [{number, chapter}] by page (number 0: none shown). */
export function pageNumbers(book) {
  let n = 0, c = 0;
  return book.pages.map(p => {
    if (p.kind !== 'scene') return {number: 0, chapter: 0};
    if (p.layout === 'title') return {number: 0, chapter: ++c};
    return {number: ++n, chapter: c};
  });
}

/**
 * How pages are seen two at a time on a wide screen: [[i] | [i, j]] — the cover alone (on the right, as a book opens),
 * a spread page alone across both, the rest in twos (a page left alone before a spread has a blank page beside it).
 */
export function openings(book, two = true) {
  const n = book.pages.length;
  if (!two) return book.pages.map((_, i) => [i]);
  const out = [[0]];
  for (let i = 1; i < n;) {
    if (book.pages[i].layout === 'spread' || i === n - 1) { out.push([i]); i++; continue; }
    if (book.pages[i + 1].layout === 'spread') { out.push([i]); i++; continue; }
    out.push([i, i + 1]); i += 2;
  }
  return out;
}

// ---------- direction ----------
const MOOD_OF = {happy: 'joy', angry: 'angry', sad: 'sad', surprised: 'tense', shy: 'love', nervous: 'tense', fearful: 'scary', tired: 'calm', confused: 'mystery', tender: 'love', sulky: 'funny', worried: 'tense', curious: 'mystery', moved: 'warm', neutral: 'calm'};
const MOOD_CAMS = {calm: ['drift', 'push', 'left', 'right'], warm: ['push', 'drift', 'rise'], joy: ['rise', 'right', 'push', 'drift'], sad: ['pull', 'fall', 'push'], tense: ['push', 'zoom', 'shake'], scary: ['shake', 'push', 'zoom', 'tilt'],
  love: ['push', 'drift', 'rise'], mystery: ['left', 'right', 'push', 'tilt'], epic: ['pull', 'rise', 'left', 'right'], funny: ['zoom', 'shake', 'tilt', 'push'], dream: ['drift', 'pull', 'rise'], angry: ['zoom', 'shake', 'push']};
// The air of a mood, now and then: what floats or shines over a page that names no weather of its own.
const MOOD_AIR = {dream: ['sparkles', .45], mystery: ['dust', .4], epic: ['rays', .4], love: ['glow', .4], scary: ['fog', .4], joy: ['sparkles', .25], warm: ['dust', .35], sad: ['dark', .25], calm: ['dust', .15]};
const MOOD_TURNS = {scary: ['black', 'fade'], funny: ['slide', 'zoom'], epic: ['zoom', 'wipe'], dream: ['fade', 'iris'], love: ['fade', 'iris'], sad: ['fade', 'black'], mystery: ['black', 'wipe'], tense: ['white', 'zoom'],
  angry: ['white', 'zoom'], joy: ['slide', 'iris'], warm: ['fade', 'iris'], calm: ['fade', 'wipe']};
/**
 * How page i is performed: {mood, camera, fx, turn, reveal} — what the page says itself, the rest chosen from its words
 * (the feeling in them; the weather and the events the story names: lightning, a blow, a heartbeat, a memory …) and
 * the kind of book, a little differently on every page and the same each time it is read.
 */
export function directionOf(book, i) {
  const p = book.pages[i], t = themeOf(book.theme), r = rng(book.id + '#' + i);
  const words = [...p.texts.map(x => x.text), ...p.lines.map(l => `${l.text} ${l.emotion}`)].join(' ');
  const scene = p.kind === 'scene' && p.layout !== 'title';
  const mood = p.mood || (scene ? MOOD_OF[visualEmotion(words)] || '' : '') || t.mood || 'calm';
  let fx = [...(p.fx || [])];
  if (!fx.length && scene) {
    const f = storyFx(words);
    if (f.weather && f.weather !== 'clear') fx.push(...f.weather.split('+'));
    if (f.flash === 'lightning') fx.push('lightning');
    if (f.flash === 'boom' || f.impact) fx.push('quake', 'flash');
    if (f.pulse) fx.push('heartbeat');
    if (f.blackout) fx.push('dark');
    if (f.memory) fx.push('memory');
    if (f.glitch) fx.push('glitch');
    if (f.rays) fx.push('rays');
    const air = MOOD_AIR[mood];
    if (air && fx.length < 2 && r() < air[1]) fx.push(air[0]);
  }
  fx = [...new Set(fx)].slice(0, 3);
  const camera = p.camera || (p.layout === 'spread' ? (r() < .5 ? 'left' : 'right') : pick(MOOD_CAMS[mood] || MOOD_CAMS.calm, r));
  const turn = p.turn || (p.kind === 'cover' || p.kind === 'end' ? 'fade' : p.layout === 'title' ? 'black'
    : p.layout === 'shout' || fx.includes('quake') || fx.includes('flash') ? 'white' : r() < .45 ? 'curl' : pick(MOOD_TURNS[mood] || ['curl'], r));
  return {mood, camera, fx, turn, reveal: t.reveal || 'fade'};
}

// ---------- words ----------
/** The time between two pieces of words coming in, by how they come in (the stylesheet's --cs). */
const STEP = {fade: .055, type: .07, ink: .09, pop: .05, flicker: .07};
const GAP = /^[\n \u3000]$/;
/**
 * Words in the pieces that come in one by one: a character each, a closing mark kept with the one before it and an
 * opening one with the one after (a line never starts with ，), a word of letters or digits whole.
 */
export function wordPieces(text) {
  const out = [];
  for (const ch of String(text || '')) {
    const prev = out[out.length - 1];
    if (GAP.test(ch)) { out.push(ch); continue; }
    const glue = prev && !GAP.test(prev) && (/[，。！？、；：」』）)”’》〉】\]…—,.!?;:~～]/.test(ch) || /[「『（(“‘《〈【\[]$/.test(prev) || /[A-Za-z0-9'’]/.test(ch) && /[A-Za-z0-9'’]$/.test(prev));
    if (glue) out[out.length - 1] = prev + ch; else out.push(ch);
  }
  return out;
}
// Where a picture is still to come: a few pencil lines of a picture.
const SKETCH = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M4 4 H60 V44 H4 Z M8 38 L22 22 L32 32 L40 24 L56 38" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round"/><circle cx="46" cy="14" r="4.5" style="fill:none;stroke:currentColor;stroke-width:2.2"/></svg>';
const SPOTS = [[4, 5], [80, 4], [6, 82], [80, 84], [44, 2], [84, 44]];
const PAPER = new Set(['polaroid', 'letter', 'vignette', 'title', 'classic']);
/**
 * A page's markup. url(picture): where a picture is ('' when it is not there); sprite(name, emotion): a character's
 * 立绘 ('' when none); number / chapter: from pageNumbers; draft: show where pictures are still to come; coverUrl: the
 * cover's picture (the last page shows it small).
 */
export function pageMarkup(book, index, {url = () => '', sprite = () => '', number = 0, chapter = 0, draft = false, coverUrl = ''} = {}) {
  const p = book.pages[index], t = themeOf(book.theme), r = rng(book.id + ':' + index), d = directionOf(book, index), step = STEP[d.reveal] || .06;
  // When each line of words comes in (seconds after the page is shown): one after another, each as long as its words.
  let order = 0, clock = .6;
  const tilt = (n = 3) => ((r() * 2 - 1) * n).toFixed(2);
  const img = (s, kb = true) => {
    const u = s?.picture ? url(s.picture) : '';
    if (u) return `<img class="bkp-img${kb ? ' bkp-kb' : ''}" src="${esc(u)}" alt="" draggable="false" style="--kx:${tilt(2)}%;--ky:${tilt(2)}%">`;
    return `<div class="bkp-blank">${SKETCH}${draft && s?.prompt ? '<small>这张图还没画</small>' : ''}</div>`;
  };
  const pieces = text => { let c = 0; return wordPieces(text).map(x => GAP.test(x) ? esc(x) : `<i style="--c:${c++}">${esc(x)}</i>`).join(''); };
  const timeOf = (text, kind) => { const t0 = clock; clock += kind === 'shout' ? .9 : wordPieces(text).filter(x => !GAP.test(x)).length * step + .45; return t0; };
  // ---- words ----
  // data-k: its place among the page's words (the reader matches each to the line read with it).
  const word = (w, extra = '', k = p.texts.indexOf(w)) => {
    const i = order++, t0 = timeOf(w.text, w.kind);
    const who = w.who && (w.kind === 'bubble' || w.kind === 'think') ? `<b class="bkp-who">${esc(w.who)}</b>` : '';
    return `<div class="bkp-t bkp-${w.kind}${extra}" data-k="${k}" style="--i:${i};--t0:${t0.toFixed(2)}s;--n:${Math.max(1, [...w.text].length)};--rot:${tilt(w.kind === 'shout' ? 8 : 2.5)}deg">${who}<span>${w.kind === 'shout' ? esc(w.text) : pieces(w.text)}</span></div>`;
  };
  const vertical = book.theme === 'ancient';
  /** Words over a picture: said and thought at the top (left, right, by turns), shouts in the middle, the rest below. */
  const over = (texts, {skipWho = new Set()} = {}) => {
    const top = [], mid = [], low = [], side = [];
    let turn = 0;
    for (const w of texts) {
      if (skipWho.has(w)) continue;
      if (w.kind === 'bubble' || w.kind === 'think') top.push(word(w, turn++ % 2 ? ' bkp-r' : ' bkp-l'));
      else if (w.kind === 'shout') mid.push(word(w));
      else if (w.kind === 'caption' && vertical) side.push(word(w));
      else if (w.kind === 'title') mid.push(word(w));
      else low.push(word(w, w.kind === 'whisper' ? ' bkp-r' : ''));
    }
    return (top.length ? `<div class="bkp-zone bkp-top">${top.join('')}</div>` : '') + (mid.length ? `<div class="bkp-zone bkp-mid">${mid.join('')}</div>` : '')
      + (low.length ? `<div class="bkp-zone bkp-low">${low.join('')}</div>` : '') + (side.length ? `<div class="bkp-zone bkp-side">${side.join('')}</div>` : '');
  };
  const tape = (where, k = 1) => `<i class="bkp-tape bkp-tape-${where}" style="--tape:var(--bk-tape${k});--rot:${tilt(10)}deg"></i>`;
  // ---- little drawings and cut-out things ----
  const extras = () => {
    const list = p.doodles.length ? p.doodles : (PAPER.has(p.layout) || p.kind === 'end') && index % 2 === 1 ? [t.doodles[(index >> 1) % t.doodles.length]] : [];
    const spots = [...SPOTS].filter(([x, y]) => p.layout !== 'panels' || x > 50 || y > 50).sort(() => r() - .5), colors = [t.accent, ...t.tape];
    const drawn = list.map((id, k) => `<span class="bkp-orn" style="--x:${spots[k][0]}%;--y:${spots[k][1]}%;--rot:${tilt(16)}deg;--i:${k};--o1:${colors[(index + k) % colors.length]};--o2:${colors[(index + k + 2) % colors.length]}">${ornamentSvg(id)}</span>`).join('');
    const props = p.props.map((x, k) => { const u = x.picture ? url(x.picture) : ''; return u ? `<img class="bkp-prop bkp-prop${k}" src="${esc(u)}" alt="" draggable="false" style="--rot:${tilt(9)}deg;--i:${k}">` : ''; }).join('');
    return drawn + props;
  };
  const num = number ? `<span class="bkp-num">${number}</span>` : '';
  let body = '';

  if (p.kind === 'cover') {
    const pic = p.shots[0]?.picture && url(p.shots[0].picture);
    const chars = [...book.title].map((c, k) => `<span style="--k:${k}">${esc(c)}</span>`).join('');
    body = `${pic ? `<div class="bkp-shot bkp-fill">${img(p.shots[0])}</div><div class="bkp-shade"></div>` : '<div class="bkp-cover-art"></div>'}
      <div class="bkp-cover-words"><h1 class="bkp-booktitle">${chars}</h1>${book.subtitle ? `<p class="bkp-subtitle">${esc(book.subtitle)}</p>` : ''}</div>
      <div class="bkp-imprint"><b>${esc(t.label)}绘本</b>${book.author ? `<span>${esc(book.author)}</span>` : ''}</div>${vertical ? `<i class="bkp-seal">${esc([...book.title][0] || '书')}</i>` : ''}`;
  } else if (p.kind === 'end') {
    clock = 1.4;
    body = `<div class="bkp-end">${coverUrl ? `<div class="bkp-end-pic"><img class="bkp-img" src="${esc(coverUrl)}" alt="" draggable="false"></div>` : ''}
      <strong class="bkp-fin">${book.theme === 'scifi' || book.theme === 'mystery' ? 'THE END' : '完'}</strong>${p.texts.map(w => word(w)).join('')}</div>${vertical ? `<i class="bkp-seal">终</i>` : ''}`;
  } else switch (p.layout) {
    case 'stage': {
      const cast = p.cast.slice(0, 3), at = cast.length === 1 ? [cast[0].at === 'center' ? 'center' : cast[0].at] : cast.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
      const placed = cast.map((c, k) => ({...c, at: at[k], url: sprite(c.name, c.emotion)}));
      const said = new Set(), heads = {left: [], center: [], right: []}, speaks = {};
      clock = 1.1;
      for (const w of p.texts) {
        const who = (w.kind === 'bubble' || w.kind === 'think') && placed.find(c => c.name === w.who);
        // Whoever speaks moves as their words come.
        if (who) { said.add(w); speaks[who.name] ??= clock; heads[who.at].push(word(w, ` bkp-${who.at === 'right' ? 'r' : who.at === 'left' ? 'l' : 'c'}`)); }
      }
      body = `${p.shots[0] ? `<div class="bkp-shot bkp-fill">${img(p.shots[0])}</div>` : ''}
        <div class="bkp-cast" data-n="${placed.length}">${placed.map((c, k) => c.url ? `<figure class="bkp-actor" data-at="${c.at}" style="--i:${k}${speaks[c.name] != null ? `;--speak:${speaks[c.name].toFixed(2)}s` : ''}" aria-label="${esc(c.name)}"><img src="${esc(c.url)}" alt="" draggable="false"></figure>` : '').join('')}</div>
        ${Object.entries(heads).filter(([, l]) => l.length).map(([side, l]) => `<div class="bkp-zone bkp-heads" data-at="${side}">${l.join('')}</div>`).join('')}
        ${over(p.texts, {skipWho: said})}`;
      break;
    }
    case 'panels': {
      const n = Math.max(2, p.shots.length), bubbles = p.texts.filter(w => w.kind === 'bubble' || w.kind === 'think'), rest = p.texts.filter(w => !bubbles.includes(w));
      const caps = rest.filter(w => w.kind === 'caption'), others = rest.filter(w => w.kind !== 'caption');
      body = `<div class="bkp-panels" data-n="${n}">${p.shots.map((s, k) => {
        const mine = bubbles.filter((_, j) => j % p.shots.length === k), cap = caps.filter((_, j) => j % p.shots.length === k);
        return `<div class="bkp-panel" style="--i:${k}">${img(s, false)}${cap.length ? `<div class="bkp-zone bkp-boxcap">${cap.map(w => word(w)).join('')}</div>` : ''}${mine.length ? `<div class="bkp-zone bkp-top">${mine.map((w, j) => word(w, j % 2 ? ' bkp-r' : ' bkp-l')).join('')}</div>` : ''}</div>`;
      }).join('')}</div>${over(others)}`;
      break;
    }
    case 'polaroid': {
      const caps = p.texts.filter(w => w.kind === 'caption' || w.kind === 'whisper'), rest = p.texts.filter(w => !caps.includes(w));
      clock = 1.2;
      body = `<div class="bkp-photos" data-n="${p.shots.length}">${p.shots.map((s, k) => `<figure class="bkp-photo" style="--rot:${tilt(7)}deg;--i:${k}">${tape('top', 1 + k % 3)}<div class="bkp-photo-pic">${img(s, false)}</div><figcaption>${caps[k] ? word(caps[k], ' bkp-hand') : ''}</figcaption></figure>`).join('')}</div>
        ${caps.length > p.shots.length ? `<div class="bkp-zone bkp-notes">${caps.slice(p.shots.length).map(w => word(w, ' bkp-hand')).join('')}</div>` : ''}${over(rest)}`;
      break;
    }
    case 'vignette': {
      const [first, ...rest] = p.texts;
      clock = 1.2;
      body = `<div class="bkp-vig">${tape('corner', 2)}${img(p.shots[0])}</div><div class="bkp-vig-words">${first ? word(first, ' bkp-big') : ''}${rest.map(w => word(w)).join('')}</div>`;
      break;
    }
    case 'shout':
      body = `<div class="bkp-shot bkp-fill">${img(p.shots[0])}</div><div class="bkp-burst"></div>${over(p.texts)}`;
      break;
    case 'letter': {
      const pic = p.shots[0];
      body = `<div class="bkp-sheet" style="--rot:${tilt(1.6)}deg">${tape('top', 1)}<div class="bkp-sheet-words">${p.texts.map((w, k) => word({...w, text: w.who && w.kind !== 'caption' ? `${w.who}：${w.text}` : w.text, who: ''}, ' bkp-hand', k)).join('')}</div></div>
        ${pic ? `<figure class="bkp-pin" style="--rot:${tilt(6)}deg">${tape('top', 3)}${img(pic, false)}</figure>` : ''}`;
      break;
    }
    case 'title': {
      const pic = p.shots[0];
      clock = .8;
      body = `${pic ? `<div class="bkp-title-pic">${img(pic)}</div>` : ''}<div class="bkp-chapter"><small>${chapter ? `第 ${chapter} 章` : ''}</small>${p.texts.map((w, k) => `<h2 class="bkp-t bkp-chapter-name" data-k="${k}" style="--i:0;--t0:${timeOf(w.text, 'title').toFixed(2)}s">${pieces(w.text)}</h2>`).join('')}<i class="bkp-flourish"></i></div>`;
      break;
    }
    case 'classic': {
      const pic = p.shots[0];
      body = `${pic ? `<div class="bkp-classic-pic">${tape('corner', 1)}${img(pic)}</div>` : ''}<div class="bkp-prose" data-fit>${p.texts.map((w, k) => `<p class="${w.kind === 'bubble' || w.kind === 'think' ? 'bkp-said' : k === 0 ? 'bkp-first' : ''}" style="--i:${k}">${w.who && w.kind !== 'caption' ? `<b>${esc(w.who)}</b>` : ''}${esc(w.text)}</p>`).join('')}</div>`;
      break;
    }
    default: // bleed, spread
      body = `<div class="bkp-shot bkp-fill">${img(p.shots[0])}</div>${p.texts.some(w => w.kind === 'caption' || w.kind === 'whisper') && !vertical ? '<div class="bkp-scrim"></div>' : ''}${over(p.texts)}`;
  }
  // The light of the page's mood and what happens to the page itself, over its pictures and under its words.
  const air = '<i class="bkp-grade"></i><i class="bkp-sky"></i><i class="bkp-blink"></i>';
  return `<article class="bkp" data-kind="${p.kind}" data-layout="${p.layout}" data-theme="${esc(book.theme)}" data-deco="${t.deco}" data-mood="${d.mood}" data-cam="${d.camera}" data-fx="${d.fx.join(' ')}" data-turn="${d.turn}" data-reveal="${d.reveal}" style="${themeStyle(book.theme)}">${body}${air}${p.kind === 'scene' ? extras() : ''}${num}</article>`;
}

/** The pages' stylesheet. Everything is inside .bkp; a page is sized by what holds it. */
export const BOOK_CSS = `
.bkp{container:bkp/size;position:absolute;inset:0;overflow:hidden;box-sizing:border-box;background:var(--bk-paper);background-image:${NOISE};color:var(--bk-ink);font-family:var(--bk-font);font-size:16px;line-height:1.6;-webkit-user-select:none;user-select:none;text-align:left;letter-spacing:0;word-break:normal;overflow-wrap:anywhere;line-break:strict}
.bkp *,.bkp *::before,.bkp *::after{box-sizing:border-box}
.bkp>*{font-size:4.2cqmin}
:where(.bkp) :where(h1,h2,p,figure,figcaption){margin:0;padding:0;font:inherit;color:inherit}
.bkp img.bkp-broken{visibility:hidden}
.bkp img{-webkit-user-drag:none;max-width:none}
.bkp-shot{position:absolute;overflow:hidden;background:var(--bk-soft)}
.bkp-fill{inset:0}
.bkp-img{display:block;width:100%;height:100%;object-fit:cover}
.bkp-blank{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:2cqmin;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--bk-paper) 70%,transparent),var(--bk-soft));color:var(--bk-ink)}
.bkp-blank svg{width:26cqmin;height:auto;opacity:.22}
.bkp-blank small{font-size:3.2cqmin;opacity:.6}
.bkp-scrim{position:absolute;left:0;right:0;bottom:0;height:42%;background:linear-gradient(transparent,color-mix(in srgb,var(--bk-ink) 38%,transparent));pointer-events:none}
.bkp[data-theme=mystery] .bkp-scrim,.bkp[data-theme=horror] .bkp-scrim,.bkp[data-theme=scifi] .bkp-scrim{background:linear-gradient(transparent,rgba(0,0,0,.55))}
.bkp-shade{position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.42),transparent 38%,transparent 70%,rgba(0,0,0,.35));pointer-events:none}

/* ---- where words go ---- */
.bkp-zone{position:absolute;left:4%;right:4%;display:flex;flex-direction:column;gap:2.2cqmin;pointer-events:none;z-index:3}
.bkp-top{top:4%;max-height:46%}
.bkp-mid{top:30%;bottom:30%;justify-content:center;align-items:center}
.bkp-low{bottom:5%;max-height:44%;justify-content:flex-end;align-items:center}
.bkp-side{top:5%;right:5%;left:auto;bottom:22%;width:46%;flex-direction:row-reverse;align-items:flex-start;gap:3cqmin}
.bkp-l{align-self:flex-start}.bkp-r{align-self:flex-end}.bkp-c{align-self:center}
.bkp-t{position:relative;max-width:88%;transform:rotate(var(--rot,0deg))}
.bkp-t span{white-space:pre-wrap}
.bkp-who{display:block;width:max-content;margin:0 0 .6cqmin .4em;padding:.15em .6em;border-radius:99px;background:var(--bk-accent);color:#fff;font:700 2.7cqmin/1.3 var(--bk-font);letter-spacing:.05em}

/* caption: the 旁白's line, each theme its own way */
.bkp-caption{padding:.55em .95em;border-radius:1.1em;background:color-mix(in srgb,var(--bk-paper) 90%,transparent);color:var(--bk-ink);font-size:4.3cqmin;line-height:1.65;box-shadow:0 1.2cqmin 3cqmin -1.5cqmin rgba(0,0,0,.35);text-align:center;transform:rotate(calc(var(--rot) * .5))}
.bkp[data-theme=fairy] .bkp-caption{border:.6cqmin dashed color-mix(in srgb,var(--bk-accent) 60%,transparent);border-radius:2.2em 1.4em 2em 1.2em}
.bkp[data-theme=romance] .bkp-caption{background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);font-style:italic;text-shadow:0 0 .6em rgba(255,160,190,.8);border-radius:1.6em}
.bkp[data-theme=school] .bkp-caption{border-radius:.3em;background:#fff repeating-linear-gradient(transparent 0 1.6em,rgba(74,144,217,.22) 1.6em calc(1.6em + 1px));line-height:1.6em;padding:.3em 1em .35em 1.4em;box-shadow:inset .5em 0 0 -.4em #ff8a8a,0 1.2cqmin 3cqmin -1.5cqmin rgba(0,0,0,.35)}
.bkp[data-theme=fantasy] .bkp-caption{background:linear-gradient(#f6e7c1,#e9d29e);border:.5cqmin double var(--bk-accent);border-radius:.4em;color:#3d2f1f;outline:.35cqmin solid color-mix(in srgb,var(--bk-accent) 45%,transparent);outline-offset:.6cqmin}
.bkp[data-theme=ancient] .bkp-caption{background:none;box-shadow:none;writing-mode:vertical-rl;text-orientation:upright;font-size:5cqmin;letter-spacing:.18em;line-height:1.9;padding:0;color:#1d1814;text-shadow:0 0 .35em #fff,0 0 .7em #fff,0 0 1.1em rgba(255,255,255,.9);max-height:100%;max-width:none;transform:none}
.bkp[data-theme=mystery] .bkp-caption{border-radius:0;background:rgba(8,8,10,.86);color:#ece6da;letter-spacing:.08em;border-left:1cqmin solid var(--bk-accent);text-align:left}
.bkp[data-theme=horror] .bkp-caption{border-radius:.2em;background:rgba(20,6,6,.84);color:#ead9c9;text-shadow:0 0 .4em rgba(200,20,20,.8);letter-spacing:.06em}
.bkp[data-theme=scifi] .bkp-caption{border-radius:0;background:rgba(8,20,40,.78);color:#bdf3ff;font-family:"Consolas","Menlo",var(--bk-font);border:1px solid rgba(63,208,255,.8);box-shadow:0 0 2cqmin rgba(63,208,255,.45),inset 0 0 2cqmin rgba(63,208,255,.2);text-align:left;clip-path:polygon(0 0,calc(100% - 1.4em) 0,100% 1.4em,100% 100%,1.4em 100%,0 calc(100% - 1.4em))}
.bkp[data-theme=adventure] .bkp-caption{border-radius:0;background:#fbf0cf;clip-path:polygon(0 6%,4% 0,12% 5%,22% 0,34% 4%,47% 0,58% 5%,71% 0,82% 4%,93% 0,100% 7%,98% 50%,100% 94%,92% 100%,80% 95%,66% 100%,52% 96%,38% 100%,25% 95%,12% 100%,3% 96%,0 90%,2% 50%);padding:.8em 1.2em}
.bkp[data-theme=comedy] .bkp-caption{border-radius:0;background:#ffe14d;border:.7cqmin solid #222;box-shadow:1cqmin 1cqmin 0 #222;font-weight:700;text-align:left}

/* handwritten: no box, whatever the theme */
.bkp .bkp-t.bkp-hand{background:none;border:0;box-shadow:none;clip-path:none;outline:0;padding:0;writing-mode:inherit;text-shadow:none;color:inherit;font-style:normal;-webkit-backdrop-filter:none;backdrop-filter:none;text-align:center;font-weight:400}
.bkp .bkp-hand::before,.bkp .bkp-hand::after{display:none}
.bkp[data-theme=ancient] .bkp-caption{--rot:0deg !important}

/* bubble: someone says it */
.bkp-bubble span{display:block;padding:.5em .95em;border-radius:1.4em;background:#fff;color:#222;border:.55cqmin solid #2b2b2b;font-size:4.4cqmin;line-height:1.5;box-shadow:0 1cqmin 2.6cqmin -1cqmin rgba(0,0,0,.4)}
.bkp-bubble::after{content:'';position:absolute;bottom:-2.4cqmin;left:16%;width:4.2cqmin;height:4.2cqmin;background:#fff;border:.55cqmin solid #2b2b2b;border-top:0;border-left:0;transform:skew(28deg) rotate(42deg);border-radius:0 0 .6cqmin 0}
.bkp-bubble.bkp-r::after{left:auto;right:16%;transform:skew(-28deg) rotate(42deg)}
.bkp-bubble.bkp-c::after{left:calc(50% - 2.1cqmin)}
.bkp[data-theme=scifi] .bkp-bubble span{border-radius:.25em;background:rgba(10,24,44,.9);color:#d6f6ff;border-color:#3fd0ff;box-shadow:0 0 2cqmin rgba(63,208,255,.5)}
.bkp[data-theme=scifi] .bkp-bubble::after{background:rgba(10,24,44,.9);border-color:#3fd0ff}
.bkp:is([data-theme=mystery],[data-theme=horror]) .bkp-bubble span{background:#f1ece2;border-color:#111}
.bkp[data-theme=comedy] .bkp-bubble span{border-width:.8cqmin;font-weight:700}
.bkp[data-theme=ancient] .bkp-bubble span{border-radius:.6em;background:#fbf6ea;border-color:#5a3d2b;font-family:var(--bk-title);font-size:4.8cqmin}
/* think: in a cloud */
.bkp-think span{display:block;padding:.6em 1.1em;border-radius:50%/45%;background:rgba(255,255,255,.93);color:#444;border:.45cqmin dashed #777;font-style:italic;font-size:4cqmin;line-height:1.5}
.bkp-think::before,.bkp-think::after{content:'';position:absolute;border-radius:50%;background:rgba(255,255,255,.93);border:.4cqmin dashed #777}
.bkp-think::before{width:3cqmin;height:3cqmin;bottom:-3.2cqmin;left:18%}
.bkp-think::after{width:1.8cqmin;height:1.8cqmin;bottom:-6cqmin;left:14%}
.bkp-think.bkp-r::before{left:auto;right:18%}.bkp-think.bkp-r::after{left:auto;right:14%}
/* shout: big */
.bkp-shout{max-width:96%;text-align:center;font:900 clamp(9cqmin,calc(64cqmin / var(--n)),22cqmin)/1.1 "STHupo","华文琥珀","Wawati SC","Hiragino Sans GB","PingFang SC","Microsoft YaHei",sans-serif;color:#fff;letter-spacing:.02em;
  text-shadow:.7cqmin 0 0 var(--bk-accent),-.7cqmin 0 0 var(--bk-accent),0 .7cqmin 0 var(--bk-accent),0 -.7cqmin 0 var(--bk-accent),.5cqmin .5cqmin 0 var(--bk-accent),-.5cqmin -.5cqmin 0 var(--bk-accent),.5cqmin -.5cqmin 0 var(--bk-accent),-.5cqmin .5cqmin 0 var(--bk-accent),1.6cqmin 1.6cqmin 0 #222;transform:rotate(var(--rot)) skew(-6deg)}
.bkp[data-theme=horror] .bkp-shout{color:#e8d6c0;text-shadow:0 .6cqmin 0 #6a0d0d,0 1.6cqmin 1cqmin #a62626,0 3cqmin 2cqmin rgba(166,38,38,.7);transform:rotate(var(--rot))}
.bkp[data-theme=scifi] .bkp-shout{color:#e8fbff;text-shadow:0 0 1cqmin #3fd0ff,0 0 3cqmin #3fd0ff,0 0 6cqmin #ff5fd2;font-family:var(--bk-font);letter-spacing:.12em;transform:rotate(var(--rot))}
.bkp:is([data-theme=ancient],[data-theme=horror]) .bkp-shout{font-family:var(--bk-title)}
.bkp[data-theme=ancient] .bkp-shout{color:#1d1814;text-shadow:0 0 .3em #fff,0 0 .6em #fff,0 0 1em #fff;transform:rotate(var(--rot))}
.bkp[data-theme=mystery] .bkp-shout{color:#f3ecdc;text-shadow:.6cqmin 0 0 #111,-.6cqmin 0 0 #111,0 .6cqmin 0 #111,0 -.6cqmin 0 #111,.45cqmin .45cqmin 0 #111,-.45cqmin -.45cqmin 0 #111,1.4cqmin 1.4cqmin 0 var(--bk-accent),0 0 4cqmin rgba(0,0,0,.8)}
.bkp-burst{position:absolute;left:50%;top:50%;width:120cqmin;height:120cqmin;margin:-60cqmin 0 0 -60cqmin;background:repeating-conic-gradient(color-mix(in srgb,var(--bk-accent) 34%,transparent) 0 5deg,transparent 5deg 15deg);-webkit-mask:radial-gradient(circle,transparent 16%,#000 40%,transparent 70%);mask:radial-gradient(circle,transparent 16%,#000 40%,transparent 70%);pointer-events:none;z-index:2}
/* whisper: small and soft */
.bkp-whisper span{display:block;padding:.35em .8em;border-radius:1em;background:color-mix(in srgb,var(--bk-paper) 72%,transparent);border:.35cqmin dotted color-mix(in srgb,var(--bk-ink) 50%,transparent);font-size:3.3cqmin;letter-spacing:.14em;opacity:.92;font-family:var(--bk-hand)}
.bkp-hand span{font-family:var(--bk-hand);font-size:4.3cqmin;line-height:1.55;background:none;border:0;padding:0;letter-spacing:.02em}

/* ---- the cover ---- */
.bkp-cover-art{position:absolute;inset:0;background:radial-gradient(circle at 30% 25%,var(--bk-soft),transparent 55%),radial-gradient(circle at 75% 80%,color-mix(in srgb,var(--bk-accent) 30%,transparent),transparent 55%),var(--bk-paper)}
.bkp-cover-words{position:absolute;left:6%;right:6%;top:8%;text-align:center;z-index:3}
.bkp-booktitle{font:900 13cqmin/1.15 var(--bk-title);color:#fff;letter-spacing:.04em;text-shadow:.8cqmin 0 0 var(--bk-accent),-.8cqmin 0 0 var(--bk-accent),0 .8cqmin 0 var(--bk-accent),0 -.8cqmin 0 var(--bk-accent),.6cqmin .6cqmin 0 var(--bk-accent),-.6cqmin -.6cqmin 0 var(--bk-accent),.6cqmin -.6cqmin 0 var(--bk-accent),-.6cqmin .6cqmin 0 var(--bk-accent),0 2cqmin 3cqmin rgba(0,0,0,.35)}
.bkp-booktitle span{display:inline-block}
.bkp:is([data-theme=fairy],[data-theme=comedy],[data-theme=school],[data-theme=adventure]) .bkp-booktitle span:nth-child(odd){--rot:-5deg;transform:rotate(-5deg)}
.bkp:is([data-theme=fairy],[data-theme=comedy],[data-theme=school],[data-theme=adventure]) .bkp-booktitle span:nth-child(even){--rot:4deg;transform:rotate(4deg)}
.bkp[data-theme=comedy] .bkp-booktitle{color:#ffe14d;text-shadow:.9cqmin 0 0 #222,-.9cqmin 0 0 #222,0 .9cqmin 0 #222,0 -.9cqmin 0 #222,.7cqmin .7cqmin 0 #222,-.7cqmin -.7cqmin 0 #222,.7cqmin -.7cqmin 0 #222,-.7cqmin .7cqmin 0 #222,2cqmin 2cqmin 0 #ff5d8f}
.bkp[data-theme=romance] .bkp-booktitle{font-weight:400;color:#fff;text-shadow:0 0 1cqmin #ff9dbb,0 0 3cqmin #ff6a9a,0 0 6cqmin rgba(255,106,154,.7)}
.bkp[data-theme=fantasy] .bkp-booktitle{color:#ffe7a3;text-shadow:0 .5cqmin 0 #6b4518,0 -.3cqmin 0 #6b4518,.4cqmin 0 0 #6b4518,-.4cqmin 0 0 #6b4518,0 0 4cqmin rgba(255,210,120,.8)}
.bkp[data-theme=fantasy] .bkp-cover-words::before,.bkp[data-theme=fantasy] .bkp-cover-words::after{content:'❦';display:block;color:#ffe7a3;font-size:6cqmin;text-shadow:0 0 2cqmin rgba(0,0,0,.5)}
.bkp[data-theme=ancient] .bkp-cover-words{left:auto;right:8%;top:7%;padding:3cqmin 2cqmin;background:#f6efe0;border:.5cqmin solid #2b2420;outline:.3cqmin solid #2b2420;outline-offset:.8cqmin;box-shadow:0 2cqmin 4cqmin rgba(0,0,0,.3)}
.bkp[data-theme=ancient] .bkp-booktitle{writing-mode:vertical-rl;font-weight:400;font-size:10cqmin;color:#1d1814;text-shadow:none;letter-spacing:.12em}
.bkp[data-theme=ancient] .bkp-subtitle{writing-mode:vertical-rl;font-size:3.6cqmin;margin:0;padding:1.6cqmin .8cqmin;color:#3b2f26;background:rgba(246,239,224,.9);text-shadow:none;position:absolute;right:calc(100% + 2cqmin);top:4cqmin;box-shadow:0 1cqmin 2.4cqmin rgba(0,0,0,.25)}
.bkp[data-theme=mystery] .bkp-booktitle{color:#f3ecdc;font-weight:700;letter-spacing:.2em;text-shadow:0 .6cqmin 0 #000;border-top:.5cqmin solid var(--bk-accent);border-bottom:.5cqmin solid var(--bk-accent);padding:.15em 0}
.bkp[data-theme=horror] .bkp-booktitle{color:#e9d6c3;text-shadow:0 .5cqmin 0 #4a0808,0 1.5cqmin 1.2cqmin #a62626,0 3.5cqmin 2.5cqmin rgba(166,38,38,.75)}
.bkp[data-theme=scifi] .bkp-booktitle{font-weight:300;letter-spacing:.24em;color:#eafcff;text-shadow:0 0 1cqmin #3fd0ff,0 0 3cqmin #3fd0ff,0 0 7cqmin #ff5fd2}
.bkp[data-theme=school] .bkp-booktitle{color:var(--bk-ink);text-shadow:.5cqmin .5cqmin 0 #fff,-.5cqmin -.5cqmin 0 #fff,.5cqmin -.5cqmin 0 #fff,-.5cqmin .5cqmin 0 #fff;background:linear-gradient(transparent 58%,color-mix(in srgb,var(--bk-tape2) 85%,transparent) 58% 92%,transparent 92%);display:inline;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.bkp-subtitle{margin-top:2cqmin;font:500 4.4cqmin/1.5 var(--bk-font);color:#fff;text-shadow:0 .3cqmin 1.2cqmin rgba(0,0,0,.7)}
.bkp-cover-art~.bkp-cover-words .bkp-subtitle{color:var(--bk-ink);text-shadow:none}
.bkp-imprint{position:absolute;left:0;right:0;bottom:4%;display:flex;flex-direction:column;align-items:center;gap:.8cqmin;z-index:3;color:#fff;text-shadow:0 .3cqmin 1cqmin rgba(0,0,0,.7);font-size:3.2cqmin}
.bkp-imprint b{padding:.25em 1.1em;border-radius:99px;background:var(--bk-accent);color:#fff;text-shadow:none;letter-spacing:.2em;font-size:3cqmin}
.bkp-cover-art~.bkp-imprint{color:var(--bk-ink);text-shadow:none}
.bkp-seal{position:absolute;left:6%;bottom:6%;width:11cqmin;height:11cqmin;display:grid;place-items:center;border:.7cqmin solid #b02a2a;border-radius:1.2cqmin;color:#b02a2a;font:700 7cqmin/1 var(--bk-title);font-style:normal;transform:rotate(-8deg);opacity:.85;mix-blend-mode:multiply;z-index:4;background:rgba(176,42,42,.06)}

/* ---- the last page ---- */
.bkp-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4cqmin;padding:10%;text-align:center}
.bkp-end-pic{width:44cqmin;height:44cqmin;border-radius:50%;overflow:hidden;border:1.4cqmin solid #fff;box-shadow:0 2cqmin 5cqmin -1cqmin rgba(0,0,0,.4)}
.bkp-fin{font:900 18cqmin/1 var(--bk-title);color:var(--bk-accent);letter-spacing:.1em;text-shadow:0 1cqmin 0 color-mix(in srgb,var(--bk-accent) 35%,transparent)}
.bkp[data-theme=scifi] .bkp-fin,.bkp[data-theme=mystery] .bkp-fin{font-size:12cqmin;font-family:var(--bk-font);letter-spacing:.3em;font-weight:300}
.bkp-end .bkp-t{max-width:100%;--rot:0deg !important}

/* ---- stage: the 立绘 stand on the scene ---- */
.bkp-cast{position:absolute;inset:0;z-index:2;pointer-events:none}
.bkp-actor{position:absolute;bottom:0;height:78%;width:62%;display:flex;justify-content:center}
.bkp-actor img{width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(.9cqmin 0 0 #fff) drop-shadow(-.9cqmin 0 0 #fff) drop-shadow(0 .9cqmin 0 #fff) drop-shadow(0 -.9cqmin 0 #fff) drop-shadow(0 2cqmin 3cqmin rgba(0,0,0,.45))}
.bkp-actor[data-at=left]{left:-5%}.bkp-actor[data-at=right]{right:-5%}.bkp-actor[data-at=center]{left:50%;width:84%;transform:translateX(-50%)}
.bkp-cast[data-n="3"] .bkp-actor{height:68%;width:46%}
.bkp-cast[data-n="3"] .bkp-actor[data-at=left]{left:-6%}.bkp-cast[data-n="3"] .bkp-actor[data-at=right]{right:-6%}
.bkp-heads{top:5%;max-height:34%;width:58%;left:auto;right:auto}
.bkp-heads[data-at=left]{left:4%}.bkp-heads[data-at=right]{right:4%;align-items:flex-end}.bkp-heads[data-at=center]{left:21%;align-items:center}

/* ---- panels: comic cells ---- */
.bkp-panels{position:absolute;inset:3.5%;display:grid;gap:2.2cqmin}
.bkp-panels[data-n="2"]{grid-template-rows:1fr 1fr}
.bkp-panels[data-n="3"]{grid-template-columns:1fr 1fr;grid-template-rows:44fr 56fr}
.bkp-panels[data-n="3"] .bkp-panel:first-child{grid-column:1/3}
.bkp-panel{position:relative;overflow:hidden;border:.8cqmin solid var(--bk-ink);background:var(--bk-soft);box-shadow:1cqmin 1cqmin 0 color-mix(in srgb,var(--bk-ink) 25%,transparent)}
.bkp[data-theme=scifi] .bkp-panel{border-color:#3fd0ff;box-shadow:0 0 2cqmin rgba(63,208,255,.45)}
.bkp[data-theme=ancient] .bkp-panel{border-width:.4cqmin;border-color:#5a3d2b}
.bkp-panel .bkp-top{top:5%;left:5%;right:5%}
.bkp-panel .bkp-bubble span,.bkp-panel .bkp-think span{font-size:3.9cqmin}
.bkp-boxcap{position:absolute;top:0;left:0;right:auto;width:max-content;max-width:80%}
.bkp-boxcap .bkp-t{max-width:none}
.bkp-boxcap .bkp-caption{border-radius:0;transform:none;text-align:left;font-size:3.7cqmin;padding:.4em .8em;box-shadow:none;border-right:.5cqmin solid var(--bk-ink);border-bottom:.5cqmin solid var(--bk-ink);background:color-mix(in srgb,var(--bk-paper) 94%,transparent)}
.bkp[data-theme=ancient] .bkp-boxcap .bkp-caption{writing-mode:horizontal-tb;text-shadow:none;letter-spacing:.06em;font-size:3.9cqmin;padding:.4em .8em;background:#f6efe0}

/* ---- photos taped on paper ---- */
.bkp-photos{position:absolute;inset:5% 4% 8%}
.bkp-photo{position:absolute;width:56%;padding:2.2cqmin 2.2cqmin 0;background:#fff;box-shadow:0 1.6cqmin 3.6cqmin -1cqmin rgba(0,0,0,.4);transform:rotate(var(--rot))}
.bkp-photo-pic{position:relative;aspect-ratio:1;overflow:hidden;background:var(--bk-soft)}
.bkp-photo figcaption{min-height:11cqmin;padding:1.4cqmin .6cqmin 1.8cqmin;color:#333;text-align:center}
.bkp-photo figcaption .bkp-t{max-width:100%;--rot:0deg !important}
.bkp-photos[data-n="2"] .bkp-photo:nth-child(1){left:2%;top:0}
.bkp-photos[data-n="2"] .bkp-photo:nth-child(2){right:2%;bottom:0}
.bkp-photos[data-n="3"] .bkp-photo{width:50%}
.bkp-photos[data-n="3"] .bkp-photo:nth-child(1){left:0;top:0}
.bkp-photos[data-n="3"] .bkp-photo:nth-child(2){right:0;top:24%}
.bkp-photos[data-n="3"] .bkp-photo:nth-child(3){left:10%;bottom:0}
.bkp-notes{bottom:3%;left:auto;right:5%;width:46%;align-items:flex-end}
.bkp-tape{position:absolute;z-index:3;width:24cqmin;height:6.5cqmin;background:color-mix(in srgb,var(--tape) 78%,transparent);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.35) 0 1.2cqmin,transparent 1.2cqmin 2.4cqmin);box-shadow:0 .4cqmin 1cqmin rgba(0,0,0,.15);transform:rotate(var(--rot));clip-path:polygon(2% 0,98% 4%,100% 50%,97% 100%,3% 96%,0 50%)}
.bkp-tape-top{top:-3cqmin;left:calc(50% - 12cqmin)}
.bkp-tape-corner{top:-2cqmin;left:-6cqmin;transform:rotate(-38deg)}

@container bkp (max-aspect-ratio: 3/5) { .bkp-photos .bkp-photo{width:72%} .bkp-photos[data-n="3"] .bkp-photo{width:60%} }

/* ---- a small picture in white space ---- */
.bkp-vig{position:absolute;left:9%;right:9%;top:8%;aspect-ratio:1;border-radius:46% 54% 50% 50%/52% 46% 54% 48%;overflow:visible}
.bkp-vig>.bkp-img,.bkp-vig>.bkp-blank{position:absolute;inset:0;border-radius:inherit;-webkit-mask:radial-gradient(closest-side,#000 74%,transparent);mask:radial-gradient(closest-side,#000 74%,transparent)}
.bkp-vig-words{position:absolute;left:8%;right:8%;top:calc(8% + 84cqw);bottom:6%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:5cqmin;gap:2.6cqmin;text-align:center}
.bkp-vig-words .bkp-t{max-width:100%;--rot:0deg !important}
.bkp .bkp-vig-words .bkp-t.bkp-caption{background:none;box-shadow:none;border:0;clip-path:none;outline:0;color:var(--bk-ink);padding:0;text-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;writing-mode:horizontal-tb}
.bkp-big span{font-family:var(--bk-title);font-size:7.4cqmin;line-height:1.35;color:var(--bk-accent);letter-spacing:.06em}
.bkp[data-theme=ancient] .bkp-vig-words .bkp-caption{writing-mode:horizontal-tb;text-shadow:none}

/* ---- a letter, a page of a diary ---- */
.bkp-sheet{position:absolute;left:8%;right:8%;top:9%;bottom:9%;padding:6cqmin 7cqmin 7cqmin 10cqmin;background:#fffdf7 repeating-linear-gradient(transparent 0 8.6cqmin,color-mix(in srgb,var(--bk-accent) 26%,transparent) 8.6cqmin calc(8.6cqmin + 1px)) 0 5cqmin;box-shadow:0 2cqmin 5cqmin -1.6cqmin rgba(0,0,0,.45),inset 7cqmin 0 0 -6.6cqmin #f19a9a;transform:rotate(var(--rot));color:#2e2a26}
.bkp[data-theme=ancient] .bkp-sheet{background:#f7f0de repeating-linear-gradient(90deg,transparent 0 8.6cqmin,rgba(168,50,50,.28) 8.6cqmin calc(8.6cqmin + 1px));box-shadow:0 2cqmin 5cqmin -1.6cqmin rgba(0,0,0,.45)}
.bkp[data-theme=ancient] .bkp-sheet-words{writing-mode:vertical-rl;height:100%}
.bkp:is([data-theme=mystery],[data-theme=horror],[data-theme=scifi]) .bkp-sheet{background-color:#ece6d8}
.bkp-sheet-words{display:flex;flex-direction:column;gap:0;line-height:8.6cqmin}
.bkp .bkp-sheet-words .bkp-t{max-width:100%;--rot:0deg !important;text-align:left}
.bkp-sheet-words .bkp-t span{font-size:5.2cqmin;line-height:8.6cqmin;background:none;border:0;padding:0;box-shadow:none}
.bkp-pin{position:absolute;right:4%;bottom:5%;width:40%;padding:1.6cqmin 1.6cqmin 6cqmin;background:#fff;box-shadow:0 1.6cqmin 3.6cqmin -1cqmin rgba(0,0,0,.45);transform:rotate(var(--rot));z-index:2}
.bkp-pin>.bkp-img,.bkp-pin>.bkp-blank{position:relative;aspect-ratio:3/4;height:auto}

/* ---- a chapter ---- */
.bkp-title-pic{position:absolute;left:14%;right:14%;top:9%;aspect-ratio:1;border-radius:50%;overflow:hidden;border:1.2cqmin solid #fff;box-shadow:0 2cqmin 5cqmin -1cqmin rgba(0,0,0,.4)}
.bkp-chapter{position:absolute;left:8%;right:8%;bottom:14%;top:auto;display:flex;flex-direction:column;align-items:center;gap:2cqmin;text-align:center}
.bkp-title-pic~.bkp-chapter{bottom:9%}
.bkp-chapter:only-child,.bkp-chapter:first-child{top:28%;bottom:auto}
.bkp-chapter small{font-size:3.6cqmin;letter-spacing:.4em;color:var(--bk-accent);opacity:.85}
.bkp-chapter-name{font:900 9.5cqmin/1.3 var(--bk-title);color:var(--bk-ink);letter-spacing:.06em}
.bkp[data-theme=ancient] .bkp-chapter-name{font-weight:400}
.bkp[data-theme=scifi] .bkp-chapter-name{font-weight:300;letter-spacing:.2em;color:#eafcff;text-shadow:0 0 2cqmin #3fd0ff}
.bkp-flourish{display:block;width:40cqmin;height:3cqmin;background:radial-gradient(circle,var(--bk-accent) 0 1cqmin,transparent 1.1cqmin) center/3cqmin 3cqmin no-repeat,linear-gradient(var(--bk-accent),var(--bk-accent)) center/100% .35cqmin no-repeat;opacity:.7}

/* ---- the story as written: a picture above its words ---- */
.bkp-classic-pic{position:absolute;left:7%;right:7%;top:5.5%;height:50%;border-radius:2cqmin;overflow:visible;box-shadow:0 1.6cqmin 4cqmin -1.6cqmin rgba(0,0,0,.45)}
.bkp-classic-pic>.bkp-img,.bkp-classic-pic>.bkp-blank{border-radius:inherit;position:absolute;inset:0}
.bkp-prose{position:absolute;left:8%;right:8%;top:60%;bottom:7%;overflow:hidden;font-size:4.2cqmin;line-height:1.85}
.bkp-classic-pic~.bkp-prose{top:60%}
.bkp-prose:first-child{top:9%}
.bkp-prose p{margin:0 0 .5em;text-indent:2em}
.bkp-prose p.bkp-said{text-indent:0;padding-left:.9em;border-left:.6cqmin solid color-mix(in srgb,var(--bk-accent) 60%,transparent)}
.bkp-prose p b{display:block;font-size:.78em;color:var(--bk-accent)}
.bkp-prose p.bkp-first{text-indent:0}
.bkp-prose p.bkp-first::first-letter{float:left;font:900 2.6em/1 var(--bk-title);color:var(--bk-accent);margin:.06em .12em 0 0}

/* ---- little drawings and cut-outs ---- */
.bkp-orn{position:absolute;left:var(--x);top:var(--y);z-index:2;width:10.5cqmin;height:10.5cqmin;transform:rotate(var(--rot));filter:drop-shadow(.6cqmin 0 0 #fff) drop-shadow(-.6cqmin 0 0 #fff) drop-shadow(0 .6cqmin 0 #fff) drop-shadow(0 -.6cqmin 0 #fff) drop-shadow(0 1cqmin 1.4cqmin rgba(0,0,0,.3))}
.bkp-orn svg{display:block;width:100%;height:100%;overflow:visible}
.bkp-prop{position:absolute;z-index:2;width:30cqmin;height:auto;max-height:34cqmin;object-fit:contain;transform:rotate(var(--rot));filter:drop-shadow(.8cqmin 0 0 #fff) drop-shadow(-.8cqmin 0 0 #fff) drop-shadow(0 .8cqmin 0 #fff) drop-shadow(0 -.8cqmin 0 #fff) drop-shadow(0 1.4cqmin 2cqmin rgba(0,0,0,.4))}
.bkp-prop0{right:3%;bottom:13%}.bkp-prop1{left:3%;top:30%}
.bkp-num{position:absolute;bottom:2.2%;right:4%;z-index:5;min-width:6cqmin;padding:.1em .5em;border-radius:99px;background:color-mix(in srgb,var(--bk-paper) 80%,transparent);color:var(--bk-ink);font:700 2.8cqmin/1.5 var(--bk-font);text-align:center;opacity:.85}

/* ---- the paper's ornaments ---- */
.bkp::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:6}
.bkp[data-deco=ornate]::after{inset:2.4cqmin;border:.5cqmin solid color-mix(in srgb,var(--bk-accent) 70%,transparent);outline:.25cqmin solid color-mix(in srgb,var(--bk-accent) 60%,transparent);outline-offset:1cqmin;border-radius:1cqmin}
.bkp[data-deco=noir]::after{background:radial-gradient(ellipse at center,transparent 52%,rgba(0,0,0,.55))}
.bkp[data-deco=scratch]::after{background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.7)),repeating-linear-gradient(97deg,transparent 0 31px,rgba(255,255,255,.035) 31px 32px)}
.bkp[data-deco=grid]::after{background:linear-gradient(#3fd0ff,#3fd0ff) 2.4cqmin 2.4cqmin/6cqmin .4cqmin no-repeat,linear-gradient(#3fd0ff,#3fd0ff) 2.4cqmin 2.4cqmin/.4cqmin 6cqmin no-repeat,linear-gradient(#3fd0ff,#3fd0ff) calc(100% - 2.4cqmin) calc(100% - 2.4cqmin)/6cqmin .4cqmin no-repeat,linear-gradient(#3fd0ff,#3fd0ff) calc(100% - 2.4cqmin) calc(100% - 2.4cqmin)/.4cqmin 6cqmin no-repeat;opacity:.8}
.bkp[data-deco=pop]::after{background:radial-gradient(circle,rgba(255,159,28,.35) 22%,transparent 24%) 0 0/3.4cqmin 3.4cqmin;-webkit-mask:linear-gradient(135deg,#000 0 12%,transparent 22% 78%,#000 88%);mask:linear-gradient(135deg,#000 0 12%,transparent 22% 78%,#000 88%)}
.bkp[data-deco=lines]:is([data-layout=title],[data-kind=end]){background-image:${NOISE},repeating-linear-gradient(transparent 0 7.4cqmin,color-mix(in srgb,var(--bk-accent) 16%,transparent) 7.4cqmin calc(7.4cqmin + 1px))}
.bkp[data-deco=grid]:is([data-layout=title],[data-layout=letter],[data-layout=polaroid],[data-layout=vignette],[data-kind=end]){background-image:${NOISE},linear-gradient(color-mix(in srgb,var(--bk-accent) 12%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--bk-accent) 12%,transparent) 1px,transparent 1px);background-size:auto,5.4cqmin 5.4cqmin,5.4cqmin 5.4cqmin}
.bkp[data-deco=stars]:is([data-layout=title],[data-layout=polaroid],[data-layout=vignette],[data-layout=letter],[data-kind=end]){background-image:${NOISE},radial-gradient(circle at 12% 18%,color-mix(in srgb,var(--bk-accent) 30%,transparent) 0 .6cqmin,transparent .8cqmin),radial-gradient(circle at 86% 12%,color-mix(in srgb,var(--bk-accent) 30%,transparent) 0 .9cqmin,transparent 1.1cqmin),radial-gradient(circle at 78% 88%,color-mix(in srgb,var(--bk-accent) 30%,transparent) 0 .7cqmin,transparent .9cqmin),radial-gradient(circle at 20% 82%,color-mix(in srgb,var(--bk-accent) 26%,transparent) 0 1cqmin,transparent 1.2cqmin)}
.bkp[data-deco=petals]:is([data-layout=title],[data-layout=polaroid],[data-layout=vignette],[data-layout=letter],[data-kind=end]){background-image:${NOISE},radial-gradient(ellipse 2cqmin 1.2cqmin at 14% 16%,color-mix(in srgb,var(--bk-accent) 34%,transparent) 98%,transparent),radial-gradient(ellipse 1.4cqmin 2.2cqmin at 84% 22%,color-mix(in srgb,var(--bk-accent) 28%,transparent) 98%,transparent),radial-gradient(ellipse 2.2cqmin 1.3cqmin at 76% 86%,color-mix(in srgb,var(--bk-accent) 30%,transparent) 98%,transparent),radial-gradient(ellipse 1.3cqmin 2cqmin at 18% 78%,color-mix(in srgb,var(--bk-accent) 26%,transparent) 98%,transparent)}
.bkp[data-deco=map]:is([data-layout=title],[data-layout=polaroid],[data-layout=letter],[data-kind=end]){background-image:${NOISE},radial-gradient(circle at 80% 20%,transparent 18cqmin,color-mix(in srgb,var(--bk-accent) 22%,transparent) 18cqmin calc(18cqmin + 1px),transparent calc(18cqmin + 2px)),radial-gradient(circle at 15% 85%,transparent 26cqmin,color-mix(in srgb,var(--bk-accent) 18%,transparent) 26cqmin calc(26cqmin + 1px),transparent calc(26cqmin + 2px))}

/* ---- a spread seen on a narrow page: the picture goes across slowly ---- */
@container bkp (orientation: portrait) {
  .bkp[data-layout=spread] .bkp-img{object-position:0 50%}
}

/* ---- the light of a page's mood (over its pictures, under its words) ---- */
.bkp-grade,.bkp-sky,.bkp-blink{position:absolute;inset:0;z-index:2;pointer-events:none}
.bkp-sky,.bkp-blink{opacity:0}
.bkp[data-mood=warm] .bkp-grade{background:radial-gradient(ellipse at 30% 20%,rgba(255,214,150,.4),transparent 60%),radial-gradient(ellipse at center,transparent 55%,rgba(140,70,20,.28));mix-blend-mode:soft-light}
.bkp[data-mood=warm] .bkp-img{filter:saturate(1.06) sepia(.08)}
.bkp[data-mood=joy] .bkp-grade{background:radial-gradient(ellipse at 15% 0%,rgba(255,240,200,.5),transparent 55%);mix-blend-mode:screen}
.bkp[data-mood=joy] .bkp-img{filter:saturate(1.18) brightness(1.03)}
.bkp[data-mood=sad] .bkp-grade{background:linear-gradient(180deg,rgba(70,100,170,.2),rgba(30,40,90,.42)),radial-gradient(ellipse at center,transparent 50%,rgba(10,15,40,.4));mix-blend-mode:multiply}
.bkp[data-mood=sad] .bkp-img{filter:saturate(.7) brightness(.97)}
.bkp[data-mood=tense] .bkp-grade{background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.52))}
.bkp[data-mood=tense] .bkp-img{filter:contrast(1.1) saturate(.86)}
.bkp[data-mood=scary] .bkp-grade{background:linear-gradient(rgba(40,62,40,.28),rgba(20,10,10,.38)),radial-gradient(ellipse at center,transparent 34%,rgba(0,0,0,.72));mix-blend-mode:multiply}
.bkp[data-mood=scary] .bkp-img{filter:saturate(.45) contrast(1.15) brightness(.86)}
.bkp[data-mood=love] .bkp-grade{background:radial-gradient(ellipse at 70% 15%,rgba(255,170,200,.5),transparent 60%),radial-gradient(ellipse at center,transparent 60%,rgba(255,140,180,.28));mix-blend-mode:screen}
.bkp[data-mood=love] .bkp-img{filter:saturate(1.05) brightness(1.04)}
.bkp[data-mood=mystery] .bkp-grade{background:linear-gradient(160deg,rgba(20,90,110,.4),rgba(140,80,20,.3)),radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.48));mix-blend-mode:soft-light}
.bkp[data-mood=mystery] .bkp-img{filter:contrast(1.08) saturate(.9)}
.bkp[data-mood=epic] .bkp-grade{background:linear-gradient(180deg,rgba(255,200,110,.4),transparent 50%),radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.36));mix-blend-mode:soft-light}
.bkp[data-mood=epic] .bkp-img{filter:contrast(1.12) saturate(1.1)}
.bkp[data-mood=funny] .bkp-img{filter:saturate(1.25) brightness(1.02)}
.bkp[data-mood=dream] .bkp-grade{background:radial-gradient(ellipse at 50% 30%,rgba(255,255,255,.38),transparent 65%),radial-gradient(ellipse at center,transparent 60%,rgba(200,180,255,.32));mix-blend-mode:screen}
.bkp[data-mood=dream] .bkp-img{filter:saturate(1.05) brightness(1.05)}
.bkp[data-mood=angry] .bkp-grade{background:radial-gradient(ellipse at center,transparent 44%,rgba(190,20,30,.42));mix-blend-mode:multiply}
.bkp[data-mood=angry] .bkp-img{filter:saturate(1.12) contrast(1.12)}
/* What the page itself does: darkness at the edges, an old photograph, light pouring in, a soft glow. */
.bkp[data-fx~=dark] .bkp-sky{opacity:1;background:radial-gradient(ellipse at center,transparent 28%,rgba(0,0,0,.78))}
.bkp[data-fx~=memory] .bkp-img{filter:sepia(.62) saturate(.7) contrast(.95)}
.bkp[data-fx~=memory] .bkp-sky{opacity:1;background:radial-gradient(ellipse at center,transparent 45%,rgba(255,236,200,.7));mix-blend-mode:screen}
.bkp[data-fx~=rays] .bkp-sky{opacity:1;background:repeating-conic-gradient(from 200deg at 15% -10%,rgba(255,244,214,0) 0deg 6deg,rgba(255,244,214,.32) 8deg 11deg,rgba(255,244,214,0) 13deg 20deg);-webkit-mask:linear-gradient(165deg,#000 10%,transparent 72%);mask:linear-gradient(165deg,#000 10%,transparent 72%);mix-blend-mode:screen;transform-origin:15% 0}
.bkp[data-fx~=glow] .bkp-sky{opacity:1;background:radial-gradient(ellipse at 50% 35%,rgba(255,255,240,.4),transparent 70%);mix-blend-mode:screen}

/* ---- how the words come in, by the kind of book ---- */
.bkp-t i{display:inline-block;font-style:normal;white-space:pre-wrap}
.bkp{--rv:bkp-c-fade;--rv-t:.5s;--cs:.055s}
.bkp[data-reveal=type]{--rv:bkp-c-type;--rv-t:.08s;--cs:.07s}
.bkp[data-reveal=ink]{--rv:bkp-c-ink;--rv-t:.8s;--cs:.09s}
.bkp[data-reveal=pop]{--rv:bkp-c-pop;--rv-t:.36s;--cs:.05s}
.bkp[data-reveal=flicker]{--rv:bkp-c-flicker;--rv-t:.6s;--cs:.07s}

/* ---- coming in ---- */
@media (prefers-reduced-motion:no-preference){
  /* The camera over the page's picture. */
  .bkp.on .bkp-kb{animation:var(--cam,none) var(--cam-t,16s) cubic-bezier(.3,.05,.3,1) both}
  .bkp[data-cam=push]{--cam:bkp-cam-push}.bkp[data-cam=pull]{--cam:bkp-cam-pull}.bkp[data-cam=left]{--cam:bkp-cam-left}.bkp[data-cam=right]{--cam:bkp-cam-right}
  .bkp[data-cam=rise]{--cam:bkp-cam-rise}.bkp[data-cam=fall]{--cam:bkp-cam-fall}.bkp[data-cam=drift]{--cam:bkp-cam-drift}.bkp[data-cam=tilt]{--cam:bkp-cam-tilt}
  .bkp[data-cam=zoom]{--cam:bkp-cam-zoom;--cam-t:9s}
  .bkp.on[data-cam=shake] .bkp-kb{animation:bkp-cam-shake 2.4s ease-in-out infinite}
  .bkp.on .bkp-panel .bkp-img{animation:bkp-cam-push 12s cubic-bezier(.3,.05,.3,1) calc(.2s + var(--i) * .35s) both}
  /* The words: each line as its turn comes, piece by piece. */
  .bkp.on .bkp-t{animation:bkp-in .7s cubic-bezier(.2,1.25,.4,1) both;animation-delay:var(--t0,.5s)}
  .bkp.on .bkp-t i{animation:var(--rv) var(--rv-t) ease-out both;animation-delay:calc(var(--t0,.5s) + .15s + var(--c) * var(--cs))}
  .bkp.on .bkp-shout{animation-name:bkp-slam;animation-duration:.55s}
  .bkp.on .bkp-caption{animation-name:bkp-rise}
  .bkp.on .bkp-chapter-name{animation:none}
  .bkp.on .bkp-whisper{animation:bkp-fade 1.6s ease both;animation-delay:var(--t0,.6s)}
  .bkp.on .bkp-prose p{animation:bkp-rise .8s ease both;animation-delay:calc(.5s + var(--i) * .35s)}
  /* Read aloud: a line of words waits for its turn. */
  .bkp.on[data-wait] .bkp-t:not([data-go]){visibility:hidden}
  .bkp.on[data-wait] .bkp-t:not([data-go]),.bkp.on[data-wait] .bkp-t:not([data-go]) i{animation:none}
  .bkp.on[data-wait] .bkp-t[data-go]{--t0:0s !important}
  /* The people step in, and move as their words come (or as their lines are read). */
  .bkp.on .bkp-actor{animation:bkp-step .8s cubic-bezier(.2,1.1,.4,1) both,bkp-speak .5s ease var(--speak,99s);animation-delay:calc(.15s + var(--i) * .25s),var(--speak,99s)}
  .bkp.on .bkp-actor[data-at=right]{animation-name:bkp-step-r,bkp-speak}
  .bkp.on .bkp-actor[data-at=center]{animation-name:bkp-step-c,bkp-speak}
  .bkp.on .bkp-actor[data-talk]{animation:bkp-talk .34s ease-in-out infinite alternate}
  .bkp-cast:has(.bkp-actor[data-talk]) .bkp-actor:not([data-talk]){filter:brightness(.72) saturate(.85)}
  .bkp.on .bkp-orn{animation:bkp-stick .6s cubic-bezier(.2,1.5,.4,1) both,bkp-bob 3.6s ease-in-out infinite alternate;animation-delay:calc(1s + var(--i) * .3s),calc(1.6s + var(--i) * .3s)}
  .bkp.on .bkp-prop{animation:bkp-stick .6s cubic-bezier(.2,1.5,.4,1) both;animation-delay:calc(1s + var(--i) * .3s)}
  .bkp.on .bkp-photo,.bkp.on .bkp-panel{animation:bkp-drop .6s cubic-bezier(.2,1.1,.4,1) both;animation-delay:calc(.1s + var(--i) * .35s)}
  /* A photo develops as it lands; a small picture opens like an eye; a chapter's line is drawn; the end is stamped. */
  .bkp-photo-pic::after{content:'';position:absolute;inset:0;background:linear-gradient(#f4efe4,#e6dccb);opacity:0;pointer-events:none}
  .bkp.on .bkp-photo-pic::after{animation:bkp-develop 1.8s ease-out calc(.4s + var(--i) * .35s) both}
  .bkp.on .bkp-vig{animation:bkp-iris 1.4s cubic-bezier(.22,1,.36,1) .15s both}
  .bkp.on .bkp-flourish{animation:bkp-draw .9s ease .5s both}
  .bkp.on .bkp-chapter small{animation:bkp-fade 1s ease .3s both}
  .bkp.on .bkp-fin{animation:bkp-stamp .7s cubic-bezier(.2,1.3,.4,1) .35s both}
  .bkp.on .bkp-end-pic{animation:bkp-fade 1.2s ease both}
  .bkp.on .bkp-subtitle{animation:bkp-rise .9s ease 1s both}
  .bkp.on .bkp-imprint{animation:bkp-rise .9s ease 1.3s both}
  .bkp.on .bkp-burst{animation:bkp-spin 30s linear infinite}
  .bkp.on .bkp-booktitle span{animation:bkp-in .6s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(.3s + var(--k) * .08s)}
  @container bkp (orientation: portrait) { .bkp.on[data-layout=spread] .bkp-kb{animation:bkp-pan 16s ease-in-out .6s infinite alternate both} }
  .bkp.on[data-theme=horror] .bkp-shout{animation:bkp-slam .55s both,bkp-flicker 3s 1.2s infinite}
  /* What happens on the page: lightning, a flash, a heartbeat, a shake, a glitch; the light breathes. */
  .bkp.on[data-fx~=lightning] .bkp-blink{background:#fff;animation:bkp-lightning 6.5s linear .8s infinite}
  .bkp.on[data-fx~=heartbeat] .bkp-blink{background:radial-gradient(ellipse at center,transparent 38%,rgba(200,20,60,.6));animation:bkp-beat 1.7s ease-in-out .5s infinite}
  .bkp.on[data-fx~=flash] .bkp-blink{background:#fff;animation:bkp-flash 1s ease-out .1s both}
  .bkp.on[data-fx~=quake]{animation:bkp-quake .7s linear .35s}
  .bkp.on[data-fx~=glitch] .bkp-shot.bkp-fill{animation:bkp-glitch 3.4s steps(1) .5s infinite}
  .bkp.on[data-fx~=rays] .bkp-sky{animation:bkp-rays 8s ease-in-out infinite alternate}
  .bkp.on[data-fx~=glow] .bkp-sky{animation:bkp-glow 5s ease-in-out infinite alternate}
  .bkp.on[data-mood=scary] .bkp-grade{animation:bkp-flicker 5s 2s infinite}
  .bkp.on[data-mood=angry] .bkp-grade{animation:bkp-glow 1.6s ease-in-out infinite alternate}
}
@keyframes bkp-cam-push{from{transform:scale(1.03) translate(var(--kx),var(--ky))}to{transform:scale(1.17)}}
@keyframes bkp-cam-pull{from{transform:scale(1.24)}to{transform:scale(1.02) translate(var(--kx),var(--ky))}}
@keyframes bkp-cam-left{from{transform:scale(1.14) translateX(4%)}to{transform:scale(1.14) translateX(-4%)}}
@keyframes bkp-cam-right{from{transform:scale(1.14) translateX(-4%)}to{transform:scale(1.14) translateX(4%)}}
@keyframes bkp-cam-rise{from{transform:scale(1.14) translateY(5%)}to{transform:scale(1.14) translateY(-4%)}}
@keyframes bkp-cam-fall{from{transform:scale(1.14) translateY(-5%)}to{transform:scale(1.14) translateY(4%)}}
@keyframes bkp-cam-drift{from{transform:scale(1.08) translate(calc(var(--kx) * -1),calc(var(--ky) * -1))}to{transform:scale(1.15) translate(var(--kx),var(--ky))}}
@keyframes bkp-cam-zoom{0%{transform:scale(1)}7%{transform:scale(1.26)}100%{transform:scale(1.32)}}
@keyframes bkp-cam-tilt{from{transform:scale(1.14) rotate(-1.6deg)}to{transform:scale(1.18) rotate(1.2deg)}}
@keyframes bkp-cam-shake{0%,100%{transform:scale(1.1) translate(0,0)}25%{transform:scale(1.1) translate(-.6%,.4%)}50%{transform:scale(1.1) translate(.5%,-.5%)}75%{transform:scale(1.1) translate(-.4%,-.3%)}}
@keyframes bkp-in{from{opacity:0;transform:scale(.55) rotate(var(--rot,0deg))}to{opacity:1;transform:scale(1) rotate(var(--rot,0deg))}}
@keyframes bkp-rise{from{opacity:0;transform:translateY(3cqmin) rotate(calc(var(--rot,0deg) * .5))}to{opacity:1;transform:translateY(0) rotate(calc(var(--rot,0deg) * .5))}}
@keyframes bkp-slam{0%{opacity:0;transform:scale(2.6) rotate(var(--rot))}60%{opacity:1;transform:scale(.92) rotate(var(--rot))}100%{opacity:1;transform:scale(1) rotate(var(--rot)) skew(-6deg)}}
@keyframes bkp-fade{from{opacity:0}to{opacity:1}}
@keyframes bkp-c-fade{from{opacity:0;transform:translateY(.35em)}to{opacity:1;transform:none}}
@keyframes bkp-c-type{from{opacity:0}to{opacity:1}}
@keyframes bkp-c-ink{0%{opacity:0;transform:scale(1.35);filter:blur(.12em)}55%{opacity:.8}100%{opacity:1;transform:none;filter:none}}
@keyframes bkp-c-pop{0%{opacity:0;transform:scale(.2) rotate(-14deg)}70%{opacity:1;transform:scale(1.18) rotate(3deg)}100%{opacity:1;transform:none}}
@keyframes bkp-c-flicker{0%{opacity:0}20%{opacity:1}30%{opacity:.1}45%{opacity:.9}60%{opacity:.25}100%{opacity:1}}
@keyframes bkp-step{from{opacity:0;transform:translateX(-14%)}to{opacity:1;transform:none}}
@keyframes bkp-step-r{from{opacity:0;transform:translateX(14%)}to{opacity:1;transform:none}}
@keyframes bkp-step-c{from{opacity:0;transform:translate(-50%,8%)}to{opacity:1;transform:translateX(-50%)}}
@keyframes bkp-speak{0%,100%{translate:0 0}35%{translate:0 -2.6%}}
@keyframes bkp-talk{from{translate:0 0}to{translate:0 -1.2%}}
@keyframes bkp-stick{from{opacity:0;transform:scale(1.8) rotate(0deg)}to{opacity:1;transform:scale(1) rotate(var(--rot))}}
@keyframes bkp-bob{from{transform:rotate(var(--rot)) translateY(0)}to{transform:rotate(var(--rot)) translateY(-1.2cqmin)}}
@keyframes bkp-drop{from{opacity:0;transform:translateY(-6cqmin) rotate(calc(var(--rot,0deg) - 8deg))}to{opacity:1;transform:rotate(var(--rot,0deg))}}
@keyframes bkp-develop{from{opacity:.96}to{opacity:0}}
@keyframes bkp-iris{from{clip-path:circle(0% at 50% 50%)}to{clip-path:circle(150% at 50% 50%)}}
@keyframes bkp-draw{from{transform:scaleX(0)}to{transform:none}}
@keyframes bkp-stamp{0%{opacity:0;transform:scale(2.8) rotate(-16deg)}60%{opacity:1;transform:scale(.92) rotate(2deg)}100%{opacity:1;transform:none}}
@keyframes bkp-spin{to{transform:rotate(360deg)}}
@keyframes bkp-pan{from{object-position:0 50%}to{object-position:100% 50%}}
@keyframes bkp-flicker{0%,100%{opacity:1}46%{opacity:1}48%{opacity:.4}50%{opacity:1}52%{opacity:.6}54%{opacity:1}}
@keyframes bkp-lightning{0%,9%,16%,100%{opacity:0}2%{opacity:.85}5%{opacity:.1}7%{opacity:.6}}
@keyframes bkp-beat{0%,42%,100%{opacity:0}8%{opacity:1}18%{opacity:.2}26%{opacity:.9}}
@keyframes bkp-flash{from{opacity:.95}to{opacity:0}}
@keyframes bkp-quake{0%,100%{transform:none}10%{transform:translate(-2.2%,1.2%)}25%{transform:translate(2%,-1.4%)}40%{transform:translate(-1.4%,.8%)}60%{transform:translate(1%,-.6%)}80%{transform:translate(-.4%,.2%)}}
@keyframes bkp-glitch{0%,86%,100%{transform:none;filter:none;clip-path:none}88%{transform:translateX(-2%);filter:drop-shadow(1.2cqmin 0 rgba(255,0,60,.6)) drop-shadow(-1.2cqmin 0 rgba(0,220,255,.6));clip-path:inset(18% 0 52% 0)}91%{transform:translateX(1.6%);clip-path:inset(56% 0 14% 0)}94%{transform:none;filter:hue-rotate(70deg) saturate(1.6);clip-path:none}97%{transform:translateX(-.8%);filter:drop-shadow(.8cqmin 0 rgba(255,0,60,.5)) drop-shadow(-.8cqmin 0 rgba(0,220,255,.5))}}
@keyframes bkp-rays{from{transform:rotate(-2deg);opacity:.75}to{transform:rotate(2deg);opacity:1}}
@keyframes bkp-glow{from{opacity:.65}to{opacity:1}}
`;

/**
 * A page's words made smaller until they fit (the story as written can be long): the .bkp-prose of a page shown in
 * the document, not below 60% of its size.
 */
export function fitProse(page) {
  const box = page?.querySelector?.('.bkp-prose');
  if (!box) return;
  box.style.fontSize = '';
  let k = 1;
  while (box.scrollHeight > box.clientHeight + 1 && k > .6) { k -= .05; box.style.fontSize = `calc(4.2cqmin * ${k.toFixed(2)})`; }
}

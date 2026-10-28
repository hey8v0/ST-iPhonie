// 绘本: the story made into picture books — spreads of two pages, the pictures telling the story and a few sentences on
// each read aloud. The shelf (each book's cover as it is); 做一本 (which part of the chat; 改编 by the text model into
// spreads laid out to the story's pace, or the story as written with its pictures; the kind of book; whether pictures
// are drawn, in the book's own way or the 绘图 App's; how long); making it (written, then every picture planned drawn,
// each kept as it comes, so leaving does not lose it); the reader (book-reader.js: a page at a time on the phone, 全屏
// on the tavern page, 朗读 turning the pages, the line being read marked); changes to a spread (its words and who says
// them, its heading, its layout, its pictures, its weather and sound, spreads added or taken out) and the book (its
// kind, how it is drawn, its title, its last line); and exports: a web page that reads itself (.html), PDF, EPUB, the
// reading as one sound file, and the pages as pictures.
import {createView, esc, heading, menu, help} from './common.js';
import {icon} from './icons.js';
import {saveFile, zipFiles} from '../download.js';
import {pictureInputs, sizeFor, activeStyle, withoutPeopleTags} from '../core/draw.js';
import {pickLook} from '../core/vn.js';
import {BOOK_THEMES, THEME_IDS, themeOf, guessTheme} from '../core/book-themes.js';
import {storySpreads, storyScript, retellPrompt, retoldSpreads, paceSpreads, bookOf, spreadsFor, scriptParts, normalizeSpread, readOf, castOf, shapeOf, composeOf, missingPictures, wordsOf, sheetOf, sheetCount, SPREADS, SPREAD_IDS, WEATHER, BOOK_LIMIT} from '../core/book.js';
import {viewMarkup, themeStyle, directionOf} from '../core/book-pages.js';
import {mountBookReader, bookStyles} from '../book-reader.js';
import {pageJpeg, drawSimple} from './book-render.js';
import {pdfFromJpegs, epubOf} from '../core/book-export.js';
import {bookHtml} from '../core/book-html.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';

const RANGES = [['20', '近 20 条'], ['50', '近 50 条'], ['all', '整个聊天'], ['pick', '自己选']];
const MODES = [['retell', '绘本（改编）'], ['story', '原文配图']];
const PICTURES = [['draw', '正文的图＋补画'], ['story', '只用正文的图'], ['none', '不要插图']];
const ARTS = [['book', '绘本画风'], ['app', '绘图 App 的画风']];
const LENGTHS = [['auto', '按故事长短'], ['8', '短（8 个跨页）'], ['12', '中（12 个跨页）'], ['16', '长（16 个跨页）']];
const SHAPES = {横: '横图', 竖: '竖图', 方: '方图'};
const keyOf = p => p?.id ? 'id:' + p.id : p?.url ? 'url:' + p.url : '';

export function bookApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'picbook'), photoUrls = new Map();
  let view = 'shelf', books = [], book = null, at = 0, job = null, form = null, reader = null, cast = null;
  bookStyles(ctx.doc);

  // ---------- pictures ----------
  const absolute = url => /^(https?:|data:|blob:|\/)/.test(url) ? url : '/' + url.replace(/^\.?\//, '');
  async function picUrl(pic) {
    if (!pic) return '';
    if (pic.url) return absolute(pic.url);
    if (photoUrls.has(pic.id)) return photoUrls.get(pic.id);
    const photo = await api.getPhoto(pic.id).catch(() => null);
    if (!photo?.blob) return '';
    const url = ctx.win.URL.createObjectURL(photo.blob);
    photoUrls.set(pic.id, url);
    return url;
  }
  async function picBlob(pic) {
    if (!pic) return null;
    if (pic.id) return (await api.getPhoto(pic.id).catch(() => null))?.blob || null;
    const r = await ctx.win.fetch(absolute(pic.url)).catch(() => null);
    return r?.ok ? r.blob() : null;
  }
  const firstPicture = b => b.cover.picture || b.spreads.flatMap(s => s.pictures.map(p => p.picture)).find(Boolean) || null;
  /** The pictures sheet n shows (the last page shows the cover's). */
  const picturesOf = (b, n) => { const s = sheetOf(b, n); return (s.kind === 'spread' ? s.spread.pictures.slice(0, SPREADS[s.spread.layout].pictures).map(p => p.picture) : [b.cover.picture]).filter(Boolean); };
  /** Picture k of sheet n (the cover's on sheet 0), made when the spread has no place for it yet. */
  const slotOf = (n, k) => n === 0 ? book.cover : (book.spreads[n - 1].pictures[k] ||= {prompt: '', picture: null, people: true});

  // ---------- the 立绘 (the 视觉小说's) ----------
  function loadCast() {
    try { cast = {entries: Object.fromEntries((api.vnCast?.() || []).map(c => [c.name, c])), wear: api.vnWear?.() || {}}; } catch { cast = {entries: {}, wear: {}}; }
    return cast;
  }
  function sprite(name, emotion = '') {
    const c = cast || loadCast(), entry = c.entries[name];
    if (!entry) return '';
    const url = pickLook(entry, {emotion, name, names: Object.keys(c.entries), outfit: c.wear[name] || '', random: () => 0});
    return url ? absolute(url) : '';
  }

  // ---------- the shelf ----------
  async function shelf() {
    leaveReader();
    view = 'shelf'; book = null;
    books = await api.listBooks().catch(() => []);
    books.sort((a, b) => (b.at || 0) - (a.at || 0));
    const covers = await Promise.all(books.map(b => picUrl(firstPicture(b))));
    const card = (b, i) => {
      const front = {...b, cover: {prompt: '', picture: covers[i] ? {url: 'cover'} : null}}, lack = missingPictures(b).length;
      return `<button type="button" class="bk-card" data-book="${esc(b.id)}" aria-label="${esc(b.title)}"><span class="bk-mini">${viewMarkup(front, {sheet: 0, part: 'all'}, {url: () => covers[i]})}</span><span class="bk-badge">${esc(themeOf(b.theme).label)} · ${b.spreads.length} 个跨页${lack ? ` · 差 ${lack} 张图` : ''}</span></button>`;
    };
    v.draw(heading('绘本', `<button type="button" class="chip-button" data-action="bk-new">${icon('add')}做一本</button>`, 'Picture Book')
      + `<div class="bk-shelf">${books.map(card).join('')}<button type="button" class="bk-new" data-action="bk-new">${icon('add')}<span>做一本绘本</span></button></div>`
      + `<p class="hint">把酒馆里的故事做成绘本：一个个摊开的两页（跨页），画面讲故事，每一面只有几句话，读出来的就是印在纸上的。${help('「绘本（改编）」让文字模型把故事编成跨页，像真的绘本那样有节奏：开头安静，画面越来越大，最紧张的地方是一幅铺满两页的大图，结尾再安静下来。字是讲故事的旁白，偶尔一句说话放进气泡；有立绘的角色偶尔会像剪纸一样站在纸上出场。「原文配图」不改一个字，按段落分成跨页，配上正文的图。\n插图用绘图 App 现在的引擎：「绘本画风」按这本书的风格画（水彩、蜡笔、水墨……），「绘图 App 的画风」用你在绘图 App 里选的画风。\n看书：手机上一页一页翻，铺满两页的大图会慢慢移动，让你看到整幅；点右上角的全屏按钮在酒馆页面看，电脑和平板横着放是摊开的两页。下雨下雪这些天气会飘在画上，朗读时正在读的那句会标出来。')}</p>`);
  }

  // ---------- 做一本 ----------
  function make() {
    let info;
    try { info = api.bookInfo?.(); } catch (error) { ctx.notify(error.message, {error: true}); return; }
    if (!info) { ctx.notify('要在酒馆里打开小手机才能做绘本', {error: true}); return; }
    leaveReader();
    view = 'make';
    form ??= {range: info.length > 50 ? '50' : 'all', from: Math.max(0, info.length - 50), to: info.length - 1, mode: 'retell', theme: 'auto', pictures: 'draw', art: 'book', length: 'auto', title: ''};
    form.to = Math.min(form.to, info.length - 1);
    const seg = (key, list) => `<div class="segmented">${list.map(([k, l]) => `<button type="button" data-bk-set="${key}" data-value="${k}" aria-pressed="${form[key] === k}">${l}</button>`).join('')}</div>`;
    v.draw(heading('做一本绘本', '', 'New Book')
      + `<p class="hint">从「${esc(info.title || '当前聊天')}」里取故事（共 ${info.length} 条消息）。</p>`
      + `<div class="group pad"><div class="field"><span>哪一段故事</span>${seg('range', RANGES)}</div>
        ${form.range === 'pick' ? `<div class="bk-range"><label>从第 <input type="number" min="0" max="${info.length - 1}" value="${form.from}" data-bk-field="from"> 条</label><label>到第 <input type="number" min="0" max="${info.length - 1}" value="${form.to}" data-bk-field="to"> 条</label></div>` : ''}
        <div class="field"><span>怎么做${help('绘本（改编）：文字模型把故事编成一个个跨页，每一面一到三句旁白，会用文字模型的额度。原文配图：不改一个字，按段落分成跨页，每个跨页配一张图。')}</span>${seg('mode', MODES)}</div>
        <div class="field"><span>风格</span></div>
        <div class="bk-themes"><button type="button" class="bk-theme" data-bk-theme="auto" aria-pressed="${form.theme === 'auto'}" style="--bk-paper:var(--card);--bk-ink:var(--ink);--bk-accent:var(--accent);--bk-title:inherit"><b>自动</b><i></i></button>${THEME_IDS.map(id => `<button type="button" class="bk-theme" data-bk-theme="${id}" data-theme="${id}" aria-pressed="${form.theme === id}" style="${themeStyle(id)}"><b>${esc(BOOK_THEMES[id].label)}</b><i></i></button>`).join('')}</div>
        <div class="field"><span>插图${help('补画用绘图 App 现在的引擎，每张都存进相册。一本书要画的有：封面，和每个跨页的一张图（「两个瞬间」是两张）。NovelAI 用 Opus 画小图不扣点；别的大小或引擎会花额度，开始前会问你。')}</span>${seg('pictures', PICTURES)}</div>
        ${form.pictures === 'draw' ? `<div class="field"><span>画风${help('绘本画风：按这本书的风格画（童话是水彩彩铅、古风是水墨、搞笑是蜡笔卡通……），不用绘图 App 里的画师串。绘图 App 的画风：用你在绘图 App 里选的画风画。')}</span>${seg('art', ARTS)}</div>` : ''}
        ${form.mode === 'retell' ? `<div class="field"><span>篇幅</span>${seg('length', LENGTHS)}</div>` : ''}
        <div class="field"><span>书名（可以不填）</span><input data-bk-field="title" value="${esc(form.title)}" maxlength="40" placeholder="${form.mode === 'retell' ? '让文字模型起' : '用聊天的名字'}"></div></div>
        <div class="actions"><button type="button" class="secondary" data-action="bk-shelf">取消</button><button type="button" class="primary" data-action="bk-start">${icon('paint')}开始做</button></div>`);
  }

  // ---------- making ----------
  function progress(title, done, total, note = '', preview = '') {
    if (view !== 'making') return;
    v.draw(heading('正在做绘本', '', 'Making')
      + `<div class="bk-progress">${preview ? `<img class="bk-preview" src="${esc(preview)}" alt="">` : ''}<b>${esc(title)}</b><div class="bk-bar"><i style="width:${total ? Math.round(done / total * 100) : 5}%"></i></div><small>${esc(note)}</small></div>
        <p class="hint">做好的部分随时存着：中途停下，之后在书里点「⋯ → 补画缺的图」接着画。</p>
        <div class="actions"><button type="button" class="secondary" data-action="bk-stop">停下</button></div>`);
  }
  /**
   * Spreads without the pictures they were planned with (只用正文的图 / 不要插图): the story's own pictures kept; a
   * spread left with none is words only (someone standing on the paper stays).
   */
  function picturesFor(spreads, how) {
    if (how === 'draw') return spreads;
    return spreads.map(s => {
      if (s.layout === 'stage' || s.layout === 'text') return s;
      const pictures = how === 'story' ? s.pictures.filter(p => p.picture) : [];
      const layout = !pictures.length ? 'text' : pictures.length < SPREADS[s.layout].pictures ? 'page' : s.layout;
      return normalizeSpread({...s, layout, pictures});
    });
  }
  async function start() {
    const info = api.bookInfo();
    const [from, to] = form.range === 'pick' ? [Math.min(form.from, form.to), Math.max(form.from, form.to)] : form.range === 'all' ? [0, info.length - 1] : [Math.max(0, info.length - Number(form.range)), info.length - 1];
    const me = job = {stop: false};
    view = 'making'; book = null;
    try {
      progress('读故事', 0, 1, `第 ${from} 到第 ${to} 条`);
      const source = api.bookSource(from, to);
      if (!source.messages.length) throw Error('这一段里没有故事内容');
      loadCast();
      const speakers = [...new Set(source.messages.flatMap(m => m.steps.filter(s => s.kind === 'say').map(s => s.role)).filter(Boolean))];
      const standing = speakers.filter(n => sprite(n));
      let spreads, title = form.title.trim(), subtitle = '', genre = '', cover = '', ending = '';
      if (form.mode === 'retell') {
        const {script, pictures} = storyScript(source.messages), parts = scriptParts(script), want = form.length === 'auto' ? spreadsFor(script.length) : Number(form.length);
        // The sounds the 音效 library has (while 音效 is on): the model picks each spread's ambience and sounds from them.
        const sounds = await api.bookSounds?.().catch(() => null) || null;
        spreads = [];
        for (let i = 0; i < parts.length; i++) {
          if (me.stop) throw Error('停下了');
          progress('文字模型在编绘本', i, parts.length, parts.length > 1 ? `故事比较长，分成 ${parts.length} 段来编：第 ${i + 1} 段` : '分成跨页、想每一面的画面和排法、写读出来的几句话');
          const last = spreads.at(-1);
          const prompt = retellPrompt(parts[i], {spreads: Math.max(3, Math.round(want * parts[i].length / script.length)), cast: speakers, staged: standing, part: parts.length > 1 ? {index: i, of: parts.length} : null, before: last ? last.words.map(w => w.text).join('').slice(0, 160) : '', sounds});
          const got = retoldSpreads(await api.bookWrite(prompt.system, prompt.user), {pictures, cast: speakers, staged: standing});
          if (!i) { title ||= got.title; subtitle = got.subtitle; genre = got.genre; cover = got.cover; }
          ending = got.ending || ending;
          spreads.push(...got.spreads);
        }
        // Written in parts: paced once more as one book (the pictures across both pages, those standing on the paper).
        if (parts.length > 1) spreads = paceSpreads(spreads);
      } else spreads = storySpreads(source.messages);
      spreads = picturesFor(spreads, form.pictures);
      const theme = form.theme === 'auto' ? genre || guessTheme(wordsOf(spreads)) : form.theme;
      const drawn = form.pictures === 'draw' && !!cover;
      let made = bookOf({title: title || `${source.title || '我们'}的故事`, subtitle, author: source.user, theme, art: form.art, mode: form.mode, source: {chat: source.chat, name: source.title, from, to}, spreads,
        cover: drawn ? cover : '', coverPicture: drawn ? null : spreads.flatMap(s => s.pictures.map(p => p.picture)).find(Boolean) || null, ending});
      made = await api.saveBook(made);
      book = made;
      // 原文 plans no picture: each spread without one gets one written from its words.
      if (form.pictures === 'draw') await drawMissing(me, {all: form.mode === 'story'});
      if (job === me) { job = null; at = 0; await open(book.id); ctx.notify(`《${book.title}》做好了`); }
    } catch (error) {
      if (job === me) job = null;
      if (book) { ctx.notify(`停在这里了：${error.message}（做好的部分已存好）`, {error: !me.stop}); await open(book.id); }
      else { ctx.notify(error.message, {error: true}); make(); }
    }
  }
  /** Draws every picture still to be drawn (asking once when it costs). Each one is kept as it comes. */
  async function drawMissing(me = {stop: false}, {all = false} = {}) {
    const todo = missingPictures(book, all);
    if (!todo.length) return 0;
    if (!api.drawReady?.()) { ctx.notify('绘图 App 还没设置好引擎，图先空着，设置好后在书里点「⋯ → 补画缺的图」', {error: true}); return 0; }
    const quote = api.drawQuote?.(api.getState().draw.params);
    if (quote && quote.free === false && !await ctx.confirm(`要画 ${todo.length} 张图`, '按现在绘图 App 的设置，每张都会花点数或额度。继续画吗？')) return 0;
    let done = 0, failed = 0, last = '', why = '';
    for (const item of todo) {
      if (me.stop) break;
      if (view === 'making') progress('画插图', done, todo.length, `第 ${done + failed + 1} 张，共 ${todo.length} 张${item.sheet ? '' : '（封面）'}${failed ? `；${failed} 张没画成` : ''}`, last);
      try {
        const pic = await drawShot(item.sheet, item.k);
        done++;
        book = await api.saveBook(book);
        last = await picUrl(pic);
        reader?.changed(book, item.sheet);
      } catch (error) { failed++; why = error.message; if (error.code === 'PAID') break; }
    }
    if (failed) ctx.notify(`有 ${failed} 张图没画成${why ? `（${why}）` : ''}，之后可以在书里点「⋯ → 补画缺的图」再试`, {error: true});
    return done;
  }
  /** The settings pictures are drawn with: 绘本画风 puts the book's own way of drawing in place of the 画风's artists. */
  function drawSettings() {
    const state = api.getState();
    if (book.art !== 'book') return state;
    const s = structuredClone(state), style = activeStyle(s.draw), t = themeOf(book.theme);
    if (style) { style.artist = ''; style.positive = t.art; }
    return s;
  }
  const safeTitle = () => book.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 30) || '绘本';
  /**
   * Draws picture k of sheet n (the cover: sheet 0): what it shows (its prompt, else one written from the spread's
   * words), in the book's way, with the people in it, composed for where it goes (alone on white, room left for the
   * words …), in the shape of its place.
   */
  async function drawShot(n, k, {prompt} = {}) {
    const spread = sheetOf(book, n).spread || null, t = themeOf(book.theme), names = castOf(book), s = slotOf(n, k);
    const words = readOf(book, n).map(l => l.text).join(' ');
    let what = prompt ?? s.prompt;
    if (!what) { const w = await api.writePrompt((words || book.title).slice(0, 300), names); what = w?.prompt || ''; }
    if (!what) throw Error('没能写出这一张要画什么');
    s.prompt = what;
    const people = s.people !== false, who = people ? names.filter(x => (what + ' ' + words).includes(x)) : [];
    const scene = [people ? what : [withoutPeopleTags(what), 'no humans, scenery'].filter(Boolean).join(', '), composeOf(spread)].filter(Boolean).join(', ');
    const inputs = pictureInputs(drawSettings(), {prompt: scene, characters: who}, people ? words : '');
    inputs.params = {...inputs.params, ...sizeFor(inputs.params, shapeOf(spread))};
    inputs.negative = [inputs.negative, t.negative, people ? '' : '1girl, 1boy, people, person, character', spread && ['quiet', 'ground'].includes(spread.layout) ? 'frame, border, busy background' : ''].filter(Boolean).join(', ');
    const {names: _n, ...request} = inputs;
    const result = await api.generateImage({...request, allowPaid: true, name: '绘本-' + safeTitle(), key: `book:${book.id}:${n}:${k}`, label: `绘本 · ${book.title} · ${n ? `第 ${n} 个跨页` : '封面'}`});
    s.picture = {id: result.photoId};
    return s.picture;
  }

  // ---------- the reader ----------
  function leaveReader() { reader?.destroy(); reader = null; v.root.classList.remove('book-mode'); }
  async function open(id, sheet = at) {
    const next = await api.getBook(id);
    if (!next) { ctx.notify('这本绘本找不到了', {error: true}); return shelf(); }
    leaveReader();
    book = next; view = 'read'; at = Math.min(sheet, sheetCount(book) - 1);
    loadCast();
    v.draw('<div class="bk-reading" data-bk-host></div>');
    v.root.classList.add('book-mode');
    reader = mountBookReader({doc: ctx.doc, root: v.root.querySelector('[data-bk-host]'), book, picture: picUrl, sprite, read: (lines, onLine) => api.bookRead(lines, onLine), sound: api.bookSound ? (kind, name) => api.bookSound(kind, name) : null, stop: () => api.stop?.(), at, two: true, draft: true,
      onClose: () => shelf(), onFull: api.bookStage ? n => full(n) : null, onMenu: n => sheetMenu(n), onPage: n => { at = n; }, notify: (text, error) => ctx.notify(text, {error}), visible: () => ctx.visible?.('picbook') !== false && !ctx.doc.querySelector('.overlay .sheet'), escape: false});
  }
  async function full(n) {
    try { if (reader?.reading) reader.setReading(false); await api.bookStage(book.id, n); }
    catch (error) { ctx.notify(error.message, {error: true}); }
  }
  async function keep(n = at) { book = await api.saveBook(book); await reader?.refresh(book, n); }

  // ---------- changes ----------
  async function sheetMenu(n) {
    at = n;
    const sheet = sheetOf(book, n), s = sheet.spread, lack = missingPictures(book).length, bare = missingPictures(book, true).length - lack;
    const room = s ? SPREADS[s.layout].pictures : sheet.kind === 'cover' ? 1 : 0, has = picturesOf(book, n).length > 0;
    const key = await menu(ctx, sheet.kind === 'cover' ? '封面' : sheet.kind === 'end' ? '最后一页' : `第 ${n} 个跨页`, [
      sheet.kind === 'cover' && {key: 'title', icon: 'edit', label: '改书名'},
      sheet.kind === 'end' && {key: 'ending', icon: 'edit', label: '改最后一句'},
      s && {key: 'words', icon: 'edit', label: '改字', note: '印在纸上、读出来的几句话，谁说的，小标题'},
      s && {key: 'layout', icon: 'sliders', label: '排法', note: SPREADS[s.layout].label},
      s && (room > 0 || s.layout === 'stage') && s.layout !== 'pair' && {key: 'flip', icon: 'sliders', label: s.layout === 'stage' ? '人物和字换一边' : SPREADS[s.layout].halves ? '图和字换一边' : '字换到另一边'},
      s && ['spread', 'fade'].includes(s.layout) && {key: 'space', icon: 'sliders', label: s.space === 'top' ? '字挪到画面下面' : '字挪到画面上面'},
      s && s.layout === 'spread' && {key: 'tone', icon: 'sliders', label: s.tone === 'dark' ? '字改成深色' : '字改成白色', note: s.tone === 'dark' ? '画面亮的时候' : '画面暗的时候'},
      room > 0 && {key: 'draw', icon: 'paint', label: has ? (s ? '重画这一面的图' : '重画封面') : (s ? '给这一面画图' : '画封面'), note: '可以先改要画什么'},
      room > 0 && {key: 'pick', icon: 'image', label: '从相册换图'},
      room > 0 && has && {key: 'unpic', icon: 'trash', label: '去掉图'},
      s && {key: 'weather', icon: 'star', label: '天气和声音', note: weatherNote(n)},
      s && book.spreads.length < BOOK_LIMIT.spreads && {key: 'insert', icon: 'add', label: '在后面加一个跨页'},
      s && book.spreads.length > 1 && {key: 'remove', icon: 'trash', label: '删掉这个跨页'},
      lack ? {key: 'fill', icon: 'paint', label: `补画缺的图（${lack} 张）`, note: '按写好的画面画'} : bare > 0 && {key: 'fill-all', icon: 'paint', label: `给没图的地方都画图（${bare} 张）`, note: '按每一面的字写画面再画'},
      {key: 'theme', icon: 'star', label: '换风格', note: '现在是' + themeOf(book.theme).label},
      {key: 'art', icon: 'paint', label: '画风', note: book.art === 'book' ? '绘本画风（跟着风格画）' : '绘图 App 的画风'},
      {key: 'export', icon: 'download', label: '导出', note: '网页绘本、PDF、EPUB、有声书、图片'},
      {key: 'delete', icon: 'trash', label: '删掉这本绘本', note: '画好的图还留在相册里', danger: true},
    ]);
    if (!key) return;
    try {
      if (key === 'title') await editTitle();
      else if (key === 'ending') await editEnding();
      else if (key === 'words') await editWords(n);
      else if (key === 'layout') await changeLayout(n);
      else if (key === 'flip') { s.side = s.side === 'left' ? 'right' : 'left'; await keep(n); }
      else if (key === 'space') { s.space = s.space === 'top' ? 'bottom' : 'top'; await keep(n); }
      else if (key === 'tone') { s.tone = s.tone === 'dark' ? 'light' : 'dark'; await keep(n); }
      else if (key === 'draw') { const k = await whichPicture(n, '画哪一张？'); if (k != null) await redraw(n, k); }
      else if (key === 'pick') { const k = await whichPicture(n, '换哪一张？'); if (k != null) { const blob = await pickBlob(); if (blob) { const ph = await api.addPhoto({name: `绘本-${safeTitle()}-${Date.now()}.${/png/.test(blob.type) ? 'png' : 'jpg'}`, blob}); slotOf(n, k).picture = {id: ph.id}; await keep(n); } } }
      else if (key === 'unpic') { const k = await whichPicture(n, '去掉哪一张？'); if (k != null) { slotOf(n, k).picture = null; await keep(n); } }
      else if (key === 'weather') await editWeather(n);
      else if (key === 'insert') await insertAfter(n);
      else if (key === 'remove' && await ctx.confirm(`删掉第 ${n} 个跨页？`, '这一面的字和排法就没了；画好的图还留在相册里。')) { book.spreads.splice(n - 1, 1); await keep(Math.min(n, book.spreads.length)); }
      else if (key === 'fill' || key === 'fill-all') await drawWithNote(key === 'fill-all');
      else if (key === 'theme') { const id = await menu(ctx, '换风格', THEME_IDS.map(k => ({key: k, icon: k === book.theme ? 'check' : 'star', label: BOOK_THEMES[k].label, note: BOOK_THEMES[k].art.split(',').slice(1, 4).join(',')}))); if (id) { book.theme = id; await keep(n); ctx.notify('换好了；之后画的图用新风格的画法'); } }
      else if (key === 'art') { const a = await menu(ctx, '画风', ARTS.map(([k, label]) => ({key: k, icon: k === book.art ? 'check' : 'paint', label, note: k === 'book' ? themeOf(book.theme).art.split(',').slice(1, 4).join(',') : '绘图 App 里选的画风'}))); if (a) { book.art = a; await keep(n); ctx.notify('之后画的图用这个画风'); } }
      else if (key === 'export') await exportMenu();
      else if (key === 'delete' && await ctx.confirm(`删掉《${book.title}》？`, '书删了就没了；画好的图还留在相册里。')) { await api.deleteBook(book.id); ctx.notify('删掉了'); await shelf(); }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  /** Which picture of sheet n (asked on a spread of two moments: the left one or the right one). */
  async function whichPicture(n, title) {
    const s = sheetOf(book, n).spread;
    if (!s || SPREADS[s.layout].pictures <= 1) return 0;
    const k = await menu(ctx, title, [0, 1].map(k => ({key: String(k), icon: 'image', label: k ? '右边那张' : '左边那张', note: s.pictures[k]?.picture ? (s.pictures[k].prompt || '已有图').slice(0, 40) : '还没有图'})));
    return k == null ? null : Number(k);
  }
  async function drawWithNote(all = false) { ctx.notify('开始画，画好一张放一张'); const n = await drawMissing(job = {stop: false}, {all}); job = null; await reader?.refresh(book); if (n) ctx.notify(`画好了 ${n} 张`); }
  function pickBlob() {
    return new Promise(resolve => import('./draw-images.js').then(m => m.pickPicture(ctx, api, '给这一面选一张图')).then(resolve, () => resolve(null)));
  }
  function dialogDone(d, save) {
    return new Promise(resolve => {
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        if (!e.target.closest('[data-bk-save]')) return;
        try { await save(); d.close(); } catch (error) { ctx.notify(error.message, {error: true}); }
      });
    });
  }
  function editTitle() {
    const d = ctx.dialog('改书名', `<div class="field"><span>书名</span><input data-bk-edit="title" value="${esc(book.title)}" maxlength="40"></div><div class="field"><span>副标题</span><input data-bk-edit="subtitle" value="${esc(book.subtitle)}" maxlength="60"></div><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    return dialogDone(d, async () => { book.title = d.body.querySelector('[data-bk-edit=title]').value.trim() || book.title; book.subtitle = d.body.querySelector('[data-bk-edit=subtitle]').value.trim(); await keep(); });
  }
  function editEnding() {
    const d = ctx.dialog('改最后一句', `<div class="field"><span>最后一页的一句话（可以不写）</span><textarea data-bk-edit="ending" rows="3" maxlength="80">${esc(book.ending)}</textarea></div><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    return dialogDone(d, async () => { book.ending = d.body.querySelector('[data-bk-edit=ending]').value.trim(); await keep(); });
  }
  /** What a spread's weather and sound are now, in words (the menu's note). */
  function weatherNote(n) {
    const s = book.spreads[n - 1], fx = directionOf(book, n).fx;
    return [fx.length ? fx.map(k => WEATHER[k]).join('、') + (s.fx.length ? '' : '（按字）') : '没有天气', s.sound.ambience && '环境声 ' + s.sound.ambience, s.sound.sfx && '音效 ' + s.sound.sfx].filter(Boolean).join(' · ');
  }
  /** The weather drawn over a spread (none chosen: what its words name) and its ambience and sound. */
  async function editWeather(n) {
    const s = book.spreads[n - 1], names = await api.bookSounds?.().catch(() => null) || null;
    const list = (id, items) => items?.length ? `<datalist id="${id}">${items.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
    const d = ctx.dialog('天气和声音', `<p class="hint">不选就按这一面的字来：写到下雨就下雨，写到雪就下雪。现在是：${esc(weatherNote(n))}。</p>
      <div class="field"><span>天气（最多两个）</span><div class="bk-chips" data-bk-chips>${Object.entries(WEATHER).map(([id, label]) => `<button type="button" data-bk-chip="${id}" aria-pressed="${s.fx.includes(id)}">${esc(label)}</button>`).join('')}</div></div>
      ${api.bookSound ? `<div class="field"><span>环境声${help('音效库里的名字（音效 App 打开时才会响）。一直响到下一个环境声；写「停」就停下。')}</span><input data-bk-amb value="${esc(s.sound.ambience)}" maxlength="40" list="bk-amb-list" placeholder="比如 雨声">${list('bk-amb-list', names?.ambience)}</div>
      <div class="field"><span>翻到这一面时的音效</span><input data-bk-sfx value="${esc(s.sound.sfx)}" maxlength="40" list="bk-sfx-list" placeholder="比如 开门">${list('bk-sfx-list', names?.sfx)}</div>` : ''}
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-bk-chip]');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (on && d.body.querySelectorAll('[data-bk-chip][aria-pressed=true]').length >= BOOK_LIMIT.fx) { ctx.notify('天气最多两个'); return; }
      b.setAttribute('aria-pressed', String(on));
    });
    return dialogDone(d, async () => {
      s.fx = [...d.body.querySelectorAll('[data-bk-chip][aria-pressed=true]')].map(b => b.dataset.bkChip);
      s.sound = {ambience: d.body.querySelector('[data-bk-amb]')?.value.trim() ?? s.sound.ambience, sfx: d.body.querySelector('[data-bk-sfx]')?.value.trim() ?? s.sound.sfx};
      await keep(n);
    });
  }
  /**
   * A spread's words: each line who says it (旁白, or one of the book's people), whether it is in a speech bubble (one
   * a spread), and the spread's heading. What is printed is what is read.
   */
  function editWords(n) {
    const s = book.spreads[n - 1], names = [...new Set([...castOf(book), ...Object.keys((cast || loadCast()).entries)])];
    const row = (w = {role: '', text: '', bubble: false}, i = -1) => `<div class="bk-row" data-bk-row data-i="${i}"><select data-k="role" aria-label="谁说的"><option value="">旁白</option>${names.map(x => `<option${x === w.role ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select><label class="bk-bub"><input type="checkbox" data-k="bubble"${w.bubble ? ' checked' : ''}> 气泡</label><button type="button" class="icon-button" data-bk-del aria-label="删掉这句">${icon('close')}</button><textarea data-k="text" rows="2" maxlength="${BOOK_LIMIT.word}" placeholder="这一句" aria-label="字">${esc(w.text)}</textarea></div>`;
    const d = ctx.dialog('改字', `<div class="field"><span>小标题（可以不写）</span><input data-bk-head value="${esc(s.heading)}" maxlength="${BOOK_LIMIT.heading}" placeholder="比如 初雪"></div>
      <div class="field"><span>这一面的字${help('印在纸上的就是读出来的。一面一到三句最像绘本，讲故事用旁白；角色说的话用他们的声音读。「气泡」一面最多一句：画面铺满两页、渐隐、只画前景的排法会把它放进对话气泡，人物出场时气泡在人物头上，别的排法写成引号。')}</span><div class="bk-rows" data-bk-rows>${s.words.map((w, i) => row(w, i)).join('')}</div><button type="button" class="secondary" data-bk-add>${icon('add')}加一句</button></div>
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    d.body.addEventListener('click', e => {
      if (e.target.closest('[data-bk-add]')) { d.body.querySelector('[data-bk-rows]').insertAdjacentHTML('beforeend', row()); d.body.querySelector('[data-bk-row]:last-child [data-k=text]')?.focus(); }
      const del = e.target.closest('[data-bk-del]');
      if (del) del.closest('[data-bk-row]').remove();
    });
    d.body.addEventListener('change', e => {
      // One bubble a spread: ticking one unticks the others.
      if (e.target.dataset?.k !== 'bubble' || !e.target.checked) return;
      d.body.querySelectorAll('[data-k=bubble]').forEach(b => { if (b !== e.target) b.checked = false; });
    });
    return dialogDone(d, async () => {
      const words = [...d.body.querySelectorAll('[data-bk-row]')].map(r => {
        const was = s.words[Number(r.dataset.i)], role = r.querySelector('[data-k=role]').value, text = r.querySelector('[data-k=text]').value.trim();
        // A line kept as it was keeps where it came from (its voice already made) and how it is said.
        return {role, text, emotion: was && was.role === role ? was.emotion : '', bubble: !!role && r.querySelector('[data-k=bubble]').checked, at: was?.at || (s.side === 'left' ? 'right' : 'left'), ...(was?.from && was.text === text && was.role === role ? {from: was.from} : {})};
      }).filter(w => w.text);
      book.spreads[n - 1] = normalizeSpread({...s, words, heading: d.body.querySelector('[data-bk-head]').value.trim()});
      await keep(n);
    });
  }
  /** A new spread after spread n: words only, written now (nothing written: not added). */
  async function insertAfter(n) {
    const s = book.spreads[n - 1];
    book.spreads.splice(n, 0, normalizeSpread({layout: 'text', side: s.side === 'left' ? 'right' : 'left'}));
    await keep(n + 1);
    await editWords(n + 1);
    if (!book.spreads[n]?.words.length) { book.spreads.splice(n, 1); await keep(n); }
    else ctx.notify('加好了；要配图就点「⋯ → 排法」选一种有图的，再画');
  }
  async function changeLayout(n) {
    const s = book.spreads[n - 1];
    const l = await menu(ctx, '排法', SPREAD_IDS.map(id => ({key: id, icon: id === s.layout ? 'check' : 'sliders', label: SPREADS[id].label, note: SPREADS[id].note})));
    if (!l || l === s.layout) return;
    const want = SPREADS[l].pictures, base = s.pictures[0]?.prompt || '', pictures = [...s.pictures];
    while (pictures.length < want) pictures.push({prompt: base ? base + ', close-up' : '', picture: null, people: true});
    let castOn = s.cast;
    if (l === 'stage' && !castOn.length) {
      const who = [...new Set(s.words.map(w => w.role).filter(x => x && sprite(x)))].slice(0, 2);
      if (!who.length) throw Error('这一面说话的人还没有立绘（在视觉小说里给角色做立绘），用不了「人物出场」');
      castOn = who.map(name => ({name, emotion: s.words.find(w => w.role === name)?.emotion || ''}));
    }
    const reshaped = want && pictures[0]?.picture && SPREADS[s.layout].pictures && SPREADS[l].shape !== SPREADS[s.layout].shape;
    book.spreads[n - 1] = normalizeSpread({...s, layout: l, pictures, cast: castOn});
    await keep(n);
    if (missingPictures(book).some(m => m.sheet === n)) ctx.notify('这个排法多了要画的图，点「给这一面画图」或「补画缺的图」画上');
    else if (reshaped) ctx.notify(`这个排法要${SHAPES[SPREADS[l].shape]}，原来的图会被裁掉一些，可以点「重画这一面的图」`);
  }
  function redraw(n, k) {
    const s = slotOf(n, k), spread = sheetOf(book, n).spread;
    const d = ctx.dialog(n ? '画这一张' : '画封面', `<div class="field"><span>画什么（英文标签，空着就按${n ? '这一面的字' : '书名'}写）</span><textarea data-bk-prompt rows="4">${esc(s.prompt)}</textarea></div>
      <label class="bk-check"><input type="checkbox" data-bk-people${s.people !== false ? ' checked' : ''}> 画面里画人物</label>
      <p class="hint">${book.art === 'book' ? `用「${esc(themeOf(book.theme).label)}」的绘本画风` : '用绘图 App 的画风'}，画成${SHAPES[shapeOf(spread)]}，加上出场人物的外貌，用绘图 App 现在的引擎。</p><div class="actions"><button type="button" class="primary" data-bk-go>${icon('paint')}画</button></div>`);
    return new Promise(resolve => {
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        const b = e.target.closest('[data-bk-go]');
        if (!b) return;
        b.disabled = true; b.textContent = '正在画…';
        try {
          slotOf(n, k).people = d.body.querySelector('[data-bk-people]').checked;
          await drawShot(n, k, {prompt: d.body.querySelector('[data-bk-prompt]').value.trim()});
          d.close(); await keep(n);
        } catch (error) { b.disabled = false; b.textContent = '再试一次'; ctx.notify(error.message, {error: true}); }
      });
    });
  }

  // ---------- exports ----------
  const safe = s => String(s || '绘本').replace(/[\\/:*?"<>|]/g, ' ').trim() || '绘本';
  const dataUrl = blob => new Promise(resolve => { const r = new ctx.win.FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(''); r.readAsDataURL(blob); });
  /** A picture made smaller for a file: a JPEG (a PNG when it is see-through: a 立绘), as a data: URL. */
  async function squeeze(src, alpha = false, max = alpha ? 900 : 1600) {
    try {
      const r = await ctx.win.fetch(src), blob = await r.blob(), bmp = await ctx.win.createImageBitmap(blob);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = ctx.doc.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
      return await dataUrl(await new Promise(res => c.toBlob(res, alpha ? 'image/png' : 'image/jpeg', .88)));
    } catch { return ''; }
  }
  /** Sheet n whole (a spread both its pages), pictures at their addresses here. */
  async function sheetHtml(n) {
    const urls = new Map();
    for (const p of picturesOf(book, n)) urls.set(keyOf(p), await picUrl(p));
    return viewMarkup(book, {sheet: n, part: 'all'}, {url: p => urls.get(keyOf(p)) || '', sprite});
  }
  async function bitmaps(n) {
    const out = [];
    for (const p of picturesOf(book, n)) { const b = await picBlob(p); try { out.push(b ? await ctx.win.createImageBitmap(b) : null); } catch { out.push(null); } }
    return out;
  }
  async function sheetSound(n, rate = 22050) {
    const blobs = (await api.bookAudio(readOf(book, n))).filter(Boolean);
    if (!blobs.length) return null;
    const clips = [];
    for (const b of blobs) clips.push(await decodeMono(ctx.win, b, rate));
    return encodeWav(joinClips(clips, rate, .35), rate);
  }
  async function exportMenu() {
    const kind = await menu(ctx, '导出《' + book.title + '》', [
      {key: 'html-voice', icon: 'play', label: '网页绘本（带朗读）', note: '一个 .html 文件，手机电脑都能打开，翻页、自动朗读；没生成过的台词会现在生成'},
      {key: 'html', icon: 'book', label: '网页绘本（不带声音）', note: '文件小一些'},
      {key: 'pdf', icon: 'download', label: 'PDF', note: '封面、每个跨页（两页并排）、最后一页，和书里一样，适合打印和发给别人'},
      {key: 'epub', icon: 'notes', label: 'EPUB 电子书', note: '固定版式的绘本，在阅读软件里一面一面翻'},
      {key: 'audio', icon: 'listen', label: '有声书（一个声音文件）', note: '整本书读出来，WAV'},
      {key: 'images', icon: 'image', label: '每一面的图片', note: '打包成 .zip'},
    ]);
    if (!kind) return;
    const narr = api.bookNarration?.() || {kept: false};
    if ((kind === 'html-voice' || kind === 'audio') && !narr.kept && !await ctx.confirm('旁白不会在文件里出声', '旁白现在用的是浏览器的系统朗读，存不进文件，导出的声音里只有角色的台词。想让旁白也有声音：在角色 App 里给「旁白」选音色，再在设置 → 整篇朗读里选「旁白角色」。先这样导出吗？')) return;
    if (reader?.reading) reader.setReading(false);
    const name = safe(book.title), n = sheetCount(book);
    let blob, file;
    if (kind === 'pdf' || kind === 'images' || kind === 'epub') {
      const cache = new Map();
      const inline = async (src, img) => { const alpha = !!img?.closest('.bk-actor'), k = (alpha ? 'a:' : 'j:') + src; if (!cache.has(k)) cache.set(k, await squeeze(src, alpha)); return cache.get(k); };
      const pages = [];
      for (let i = 0; i < n; i++) {
        ctx.notify(`正在排版：第 ${i + 1} / ${n} 面`);
        const wide = sheetOf(book, i).kind === 'spread', width = wide ? 2400 : 1200, height = 1600;
        const jpeg = await pageJpeg(ctx.doc, await sheetHtml(i), {width, height, inline, fallback: async (g, W, H) => { const b = await bitmaps(i); drawSimple(g, book, i, b, {W, H}); b.forEach(x => x?.close?.()); }});
        pages.push({jpeg, width, height, wide});
      }
      if (kind === 'pdf') { blob = pdfFromJpegs(pages.map(p => ({jpeg: p.jpeg, width: p.wide ? 840 : 420})), {title: book.title, author: book.author}); file = name + '.pdf'; }
      else if (kind === 'images') { blob = await zipFiles(pages.map((p, i) => ({name: `${String(i + 1).padStart(2, '0')}.jpg`, blob: new Blob([p.jpeg], {type: 'image/jpeg'})}))); file = name + ' 图片'; }
      else {
        const label = i => { const s = sheetOf(book, i); return s.kind === 'cover' ? book.title : s.spread?.heading || ''; };
        blob = epubOf(book, pages.map((p, i) => ({jpeg: p.jpeg, width: p.width, height: p.height, text: readOf(book, i).map(l => l.text).join(' '), label: label(i)}))); file = name + '.epub';
      }
    } else if (kind === 'audio') {
      const all = [];
      for (let i = 0; i < n; i++) { ctx.notify(`正在准备声音：第 ${i + 1} / ${n} 面`); const b = await sheetSound(i, 24000); if (b) all.push(await decodeMono(ctx.win, b, 24000)); }
      if (!all.length) throw Error('这本书还没有能读出声音的部分');
      blob = encodeWav(joinClips(all, 24000, 1.1), 24000); file = name + ' 有声书';
    } else {
      // Each picture once, as bk:N in the pages.
      const images = [], index = new Map(), tokens = new Map(), people = new Map();
      const slot = async (src, alpha) => { if (!src) return ''; const d = await squeeze(src, alpha); if (!d) return ''; if (!index.has(d)) { index.set(d, images.length); images.push(d); } return 'bk:' + index.get(d); };
      const sounds = [];
      for (let i = 0; i < n; i++) {
        ctx.notify(`正在准备：第 ${i + 1} / ${n} 面`);
        for (const p of picturesOf(book, i)) if (!tokens.has(keyOf(p))) tokens.set(keyOf(p), await slot(await picUrl(p), false));
        for (const c of sheetOf(book, i).spread?.cast || []) if (!people.has(c.name + '|' + c.emotion)) people.set(c.name + '|' + c.emotion, await slot(sprite(c.name, c.emotion), true));
        if (kind === 'html-voice') { const b = await sheetSound(i); sounds.push(b ? await dataUrl(b) : ''); }
      }
      // The weather drawn over the pages comes with the file (vn-fx.js inside it).
      let fx = '';
      try { const r = await ctx.win.fetch(new URL('../vn-fx.js', import.meta.url)); if (r.ok) fx = await r.text(); } catch {}
      blob = new Blob([bookHtml(book, {url: p => tokens.get(keyOf(p)) || '', sprite: (who, how) => people.get(who + '|' + how) || '', images, sounds, fx})], {type: 'text/html'}); file = name + '.html';
    }
    ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, file));
  }

  // ---------- events ----------
  v.on('click', '[data-action=bk-new]', () => { form = null; make(); });
  v.on('click', '[data-action=bk-shelf]', () => shelf());
  v.on('click', '[data-action=bk-start]', () => start());
  v.on('click', '[data-action=bk-stop]', () => { if (job) job.stop = true; ctx.notify('画完这一张就停'); });
  v.on('click', '[data-book]', el => { at = 0; open(el.dataset.book); });
  v.on('click', '[data-bk-set]', el => { form[el.dataset.bkSet] = el.dataset.value; make(); });
  v.on('click', '[data-bk-theme]', el => { form.theme = el.dataset.bkTheme; make(); });
  v.root.addEventListener('change', e => { const f = e.target.dataset?.bkField; if (f && form) form[f] = f === 'title' ? e.target.value : Math.max(0, Number(e.target.value) || 0); });
  v.root.addEventListener('input', e => { if (e.target.dataset?.bkField === 'title' && form) form.title = e.target.value; });
  v.root.addEventListener('error', e => { if (e.target?.tagName === 'IMG' && e.target.closest('.bk')) e.target.classList.add('bk-broken'); }, true);
  v.back = () => { if (view === 'shelf') return false; if (view === 'making') { if (job) job.stop = true; return true; } shelf(); return true; };
  v.leave = () => { if (reader?.reading) reader.setReading(false); };
  v.refresh = () => { if (view === 'shelf') shelf(); };
  const dispose = v.dispose;
  v.dispose = () => { leaveReader(); if (job) job.stop = true; for (const u of photoUrls.values()) ctx.win.URL.revokeObjectURL(u); dispose(); };
  shelf();
  return v;
}

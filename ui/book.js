// 绘本: the story made into picture books — told by pictures, with few words. The shelf (each book's cover as it is);
// 做一本 (which part of the chat; 改编 by the text model into pages of pictures, or the story as written with pictures;
// the kind of book; whether pictures are drawn, and in the book's own way or the 绘图 App's); making it (written, then
// every picture planned drawn — scenes, backgrounds the characters' 立绘 stand on, small things cut out as stickers —
// each kept as it comes, so leaving does not lose it); the reader (book-reader.js: the page filling the phone, 全屏 on
// the tavern page, 朗读 turning the pages, the words coming in as they are read); changes to a page (its words, what is
// read, its little drawings, its layout, its pictures, how it is performed: mood, camera, effects, the turn, its
// sound) and the book (its kind, how it is drawn, its title); and exports: a web page that reads and performs itself
// (.html), PDF, EPUB, the reading as one sound file, and the pages as pictures.
import {createView, esc, heading, menu, help} from './common.js';
import {icon} from './icons.js';
import {saveFile, zipFiles} from '../download.js';
import {pictureInputs, sizeFor, activeStyle, withoutPeopleTags} from '../core/draw.js';
import {isV5} from '../core/novelai.js';
import {pickLook, cutBackground, clearEdges, opaqueBounds} from '../core/vn.js';
import {BOOK_THEMES, THEME_IDS, themeOf, guessTheme} from '../core/book-themes.js';
import {storyPages, storyScript, retellPrompt, retoldPages, bookOf, pagesFor, scriptParts, normalizePage, linesFromText, linesText, readOf, castOf, shotShape, missingPictures, wordsOf, textsOfLines, LAYOUTS, TEXT_KINDS, TEXT_LABELS, MOODS, CAMERAS, FX, TURNS} from '../core/book.js';
import {pageMarkup, pageNumbers, themeStyle, directionOf} from '../core/book-pages.js';
import {ORNAMENTS, ORNAMENT_IDS, ornamentSvg} from '../core/book-ornaments.js';
import {mountBookReader, bookStyles} from '../book-reader.js';
import {pageJpeg, drawSimple} from './book-render.js';
import {pdfFromJpegs, epubOf} from '../core/book-export.js';
import {bookHtml} from '../core/book-html.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';

const RANGES = [['20', '近 20 条'], ['50', '近 50 条'], ['all', '整个聊天'], ['pick', '自己选']];
const MODES = [['retell', '绘本（改编）'], ['story', '原文配图']];
const PICTURES = [['draw', '正文的图＋补画'], ['story', '只用正文的图'], ['none', '不要插图']];
const ARTS = [['book', '绘本画风'], ['app', '绘图 App 的画风']];
const LENGTHS = [['auto', '按故事长短'], ['8', '短（8 页）'], ['14', '中（14 页）'], ['22', '长（22 页）']];
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
  const firstPicture = b => b.pages[0]?.shots[0]?.picture || b.pages.flatMap(p => p.shots.map(s => s.picture)).find(Boolean) || null;
  const picturesOf = (b, i) => { const p = b.pages[i]; return [...p.shots.map(s => s.picture), ...p.props.map(x => x.picture), ...(p.kind === 'end' ? [b.pages[0]?.shots[0]?.picture] : [])].filter(Boolean); };

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
      const front = {...b, pages: [{...b.pages[0], kind: 'cover', shots: covers[i] ? [{picture: {url: 'cover'}, prompt: '', people: true}] : [], props: [], texts: [], doodles: [], cast: []}]};
      const lack = missingPictures(b).length, n = b.pages.filter(p => p.kind === 'scene' && p.layout !== 'title').length;
      return `<button type="button" class="bk-card" data-book="${esc(b.id)}" aria-label="${esc(b.title)}"><span class="bk-mini">${pageMarkup(front, 0, {url: () => covers[i]})}</span><span class="bk-badge">${esc(themeOf(b.theme).label)} · ${n} 页${lack ? ` · 差 ${lack} 张图` : ''}</span></button>`;
    };
    v.draw(heading('绘本', `<button type="button" class="chip-button" data-action="bk-new">${icon('add')}做一本</button>`, 'Picture Book')
      + `<div class="bk-shelf">${books.map(card).join('')}<button type="button" class="bk-new" data-action="bk-new">${icon('add')}<span>做一本绘本</span></button></div>`
      + `<p class="hint">把酒馆里的故事做成以画面为主的绘本：大图、分镜、相片拼贴、人物立绘站在场景里，字只有几句，用旁白和角色的声音读出来。${help('「绘本（改编）」让文字模型把故事编成一页页的画面：每页选一种版式（满版大图、人物登场、分镜、相片拼贴、小画留白、大字、信纸、跨页大图），只放几句字或者一个字都不放，另写好朗读的话。「原文配图」不改一个字，按段落分页配上图。\n插图用绘图 App 现在的引擎：「绘本画风」按这本书的风格画（水彩、蜡笔、水墨……），「绘图 App 的画风」用你在绘图 App 里选的画风。人物登场页用视觉小说里的立绘，小物件画好后自动抠出来当贴纸。\n看书：手机上铺满屏幕，点右上角的全屏按钮在酒馆页面全屏看，电脑和平板横着放是左右两页的书。每一页有自己的演出：光线和颜色、镜头、下雨下雪烟花这些效果、翻页的方式、环境声和音效；字跟着朗读一句句出来。')}</p>`);
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
        <div class="field"><span>怎么做${help('绘本（改编）：文字模型把故事编成一页页的画面，字很少，另写好朗读的话，会用文字模型的额度。原文配图：不改一个字，按段落分页，每页配一张图。')}</span>${seg('mode', MODES)}</div>
        <div class="field"><span>风格</span></div>
        <div class="bk-themes"><button type="button" class="bk-theme" data-bk-theme="auto" aria-pressed="${form.theme === 'auto'}" style="--bk-paper:var(--card);--bk-ink:var(--ink);--bk-accent:var(--accent);--bk-title:inherit"><b>自动</b><i></i></button>${THEME_IDS.map(id => `<button type="button" class="bk-theme" data-bk-theme="${id}" data-theme="${id}" aria-pressed="${form.theme === id}" style="${themeStyle(id)}"><b>${esc(BOOK_THEMES[id].label)}</b><i></i></button>`).join('')}</div>
        <div class="field"><span>插图${help('补画用绘图 App 现在的引擎，每张都存进相册。一本书要画的有：每页的场景、人物登场页的背景、小物件贴纸。NovelAI 用 Opus 画小图不扣点；别的大小或引擎会花额度，开始前会问你。')}</span>${seg('pictures', PICTURES)}</div>
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
  /** Pages without the pictures they were planned with (只用正文的图 / 不要插图): what is left of them, words shown. */
  function picturesFor(pages, how) {
    if (how === 'draw') return pages;
    return pages.map(p => {
      if (p.kind !== 'scene' || p.layout === 'title') return p;
      const shots = how === 'story' ? p.shots.filter(s => s.picture) : [];
      const texts = !shots.length && !p.texts.length && p.layout !== 'stage' ? textsOfLines(p.lines) : p.texts;
      return normalizePage({...p, shots, props: [], texts});
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
      let pages, title = form.title.trim(), subtitle = '', genre = '', cover = '', ending = '';
      if (form.mode === 'retell') {
        const {script, pictures} = storyScript(source.messages), parts = scriptParts(script), want = form.length === 'auto' ? pagesFor(script.length) : Number(form.length);
        // The sounds the 音效 library has (while 音效 is on): the model picks each scene's ambience and sounds from them.
        const sounds = await api.bookSounds?.().catch(() => null) || null;
        pages = [];
        for (let i = 0; i < parts.length; i++) {
          if (me.stop) throw Error('停下了');
          progress('文字模型在编绘本', i, parts.length, parts.length > 1 ? `故事比较长，分成 ${parts.length} 段来编：第 ${i + 1} 段` : '分页、想每一页的画面和版式、写几句字和朗读的话');
          const last = pages.filter(p => p.layout !== 'title').at(-1);
          const prompt = retellPrompt(parts[i], {pages: Math.max(4, Math.round(want * parts[i].length / script.length)), cast: speakers, staged: standing, part: parts.length > 1 ? {index: i, of: parts.length} : null, before: last ? readOf({title: ''}, last).map(l => l.text).join('').slice(0, 160) : '', sounds});
          const got = retoldPages(await api.bookWrite(prompt.system, prompt.user), {pictures, cast: speakers, staged: standing});
          if (!i) { title ||= got.title; subtitle = got.subtitle; genre = got.genre; cover = got.cover; ending = got.ending; }
          pages.push(...got.pages);
        }
      } else pages = storyPages(source.messages);
      pages = picturesFor(pages, form.pictures);
      const theme = form.theme === 'auto' ? genre || guessTheme(wordsOf(pages)) : form.theme;
      const drawn = form.pictures === 'draw' && !!cover;
      let made = bookOf({title: title || `${source.title || '我们'}的故事`, subtitle, author: source.user, theme, art: form.art, mode: form.mode, source: {chat: source.chat, name: source.title, from, to}, pages,
        cover: drawn ? cover : '', coverPicture: drawn ? null : pages.flatMap(p => p.shots.map(s => s.picture)).find(Boolean) || null, ending});
      made = await api.saveBook(made);
      book = made;
      // 原文 plans no picture: each 图文 page without one gets one written from its words.
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
      if (view === 'making') progress('画插图', done, todo.length, `第 ${done + failed + 1} 张，共 ${todo.length} 张${'prop' in item ? '（小物件贴纸）' : ''}${failed ? `；${failed} 张没画成` : ''}`, last);
      try {
        const pic = 'prop' in item ? await drawProp(item.page, item.prop) : await drawShot(item.page, item.shot);
        done++;
        book = await api.saveBook(book);
        last = await picUrl(pic);
        reader?.changed(book, item.page);
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
   * Draws picture k of page i: what it shows (its prompt, else one written from the page's words), in the book's way,
   * with the people in it (a background for 立绘 to stand on has nobody), in the shape of its place on the page.
   */
  async function drawShot(i, k, {prompt} = {}) {
    const p = book.pages[i], t = themeOf(book.theme), names = castOf(book);
    if (!p.shots[k]) p.shots[k] = {prompt: '', picture: null, people: true};
    const s = p.shots[k], words = readOf(book, p).map(l => l.text).join(' ');
    let what = prompt ?? s.prompt;
    if (!what) { const w = await api.writePrompt((words || book.title).slice(0, 300), names); what = w?.prompt || ''; }
    if (!what) throw Error('没能写出这一张要画什么');
    s.prompt = what;
    const who = s.people ? names.filter(n => (what + ' ' + words).includes(n)) : [];
    const scene = s.people ? what : [withoutPeopleTags(what), 'no humans, scenery'].filter(Boolean).join(', ');
    const inputs = pictureInputs(drawSettings(), {prompt: scene, characters: who}, s.people ? words : '');
    inputs.params = {...inputs.params, ...sizeFor(inputs.params, shotShape(p, k))};
    inputs.negative = [inputs.negative, t.negative, s.people ? '' : '1girl, 1boy, people, person, character'].filter(Boolean).join(', ');
    const {names: _n, ...request} = inputs;
    const result = await api.generateImage({...request, allowPaid: true, name: '绘本-' + safeTitle(), key: `book:${book.id}:${i}:${k}`, label: `绘本 · ${book.title} · 第 ${i} 页`});
    s.picture = {id: result.photoId};
    return s.picture;
  }
  /** Draws a small thing on its own and cuts it out (its plain background taken off), to stick on the page. */
  async function drawProp(i, k) {
    const x = book.pages[i].props[k], state = drawSettings(), draw = state.draw;
    const clear = (draw.engine === 'nai' || !draw.engine) && isV5(draw.params?.model);
    const inputs = pictureInputs(state, {prompt: [x.prompt, 'no humans, object focus, still life', clear ? '2::transparent background::' : 'simple background, white background'].join(', '), characters: []}, '');
    inputs.params = {...inputs.params, ...sizeFor(inputs.params, '方'), transparent: clear};
    inputs.negative = [inputs.negative, 'scenery, room, landscape, text, frame, border, 1girl, 1boy, multiple views'].filter(Boolean).join(', ');
    const {names: _n, ...request} = inputs;
    const result = await api.generateImage({...request, allowPaid: true, name: '绘本-' + safeTitle(), key: `book:${book.id}:${i}:p${k}`, label: `绘本 · ${book.title} · 贴纸`});
    let id = result.photoId;
    const raw = (await api.getPhoto(id).catch(() => null))?.blob;
    if (raw) {
      try {
        const cut = await cutOut(raw);
        const ph = await api.addPhoto({name: `绘本-${safeTitle()}-${Date.now()}.png`, blob: cut});
        await api.deletePhoto(id).catch(() => {});
        id = ph.id;
      } catch {}
    }
    x.picture = {id};
    return x.picture;
  }
  async function cutOut(blob) {
    const bmp = await ctx.win.createImageBitmap(blob), c = ctx.doc.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', {willReadFrequently: true});
    g.drawImage(bmp, 0, 0); bmp.close?.();
    const data = g.getImageData(0, 0, c.width, c.height);
    if (!clearEdges(data.data, c.width, c.height)) cutBackground(data.data, c.width, c.height, 40);
    g.putImageData(data, 0, 0);
    const box = opaqueBounds(data.data, c.width, c.height, 6);
    let out = c;
    if (box && (box.width < c.width || box.height < c.height)) { out = ctx.doc.createElement('canvas'); out.width = box.width; out.height = box.height; out.getContext('2d').drawImage(c, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height); }
    return new Promise((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(Error('没能剪下来')), 'image/png'));
  }

  // ---------- the reader ----------
  function leaveReader() { reader?.destroy(); reader = null; v.root.classList.remove('book-mode'); }
  async function open(id, page = at) {
    const next = await api.getBook(id);
    if (!next) { ctx.notify('这本绘本找不到了', {error: true}); return shelf(); }
    leaveReader();
    book = next; view = 'read'; at = Math.min(page, book.pages.length - 1);
    loadCast();
    v.draw('<div class="bk-reading" data-bk-host></div>');
    v.root.classList.add('book-mode');
    reader = mountBookReader({doc: ctx.doc, root: v.root.querySelector('[data-bk-host]'), book, picture: picUrl, sprite, read: (lines, onLine) => api.bookRead(lines, onLine), sound: api.bookSound ? (kind, name) => api.bookSound(kind, name) : null, stop: () => api.stop?.(), at, two: true, draft: true,
      onClose: () => shelf(), onFull: api.bookStage ? i => full(i) : null, onMenu: i => pageMenu(i), onPage: i => { at = i; }, notify: (text, error) => ctx.notify(text, {error}), visible: () => ctx.visible?.('picbook') !== false && !ctx.doc.querySelector('.overlay .sheet'), escape: false});
  }
  async function full(i) {
    try { if (reader?.reading) reader.setReading(false); await api.bookStage(book.id, i); }
    catch (error) { ctx.notify(error.message, {error: true}); }
  }
  async function keep(i = at) { book = await api.saveBook(book); await reader?.refresh(book, i); }

  // ---------- changes ----------
  async function pageMenu(i) {
    at = i;
    const p = book.pages[i], scene = p.kind === 'scene' && p.layout !== 'title', lack = missingPictures(book).length, bare = missingPictures(book, true).length - lack, has = p.shots.some(s => s.picture);
    const key = await menu(ctx, p.kind === 'cover' ? '封面' : p.kind === 'end' ? '最后一页' : `第 ${i + 1} 页`, [
      p.kind === 'cover' && {key: 'title', icon: 'edit', label: '改书名'},
      p.layout === 'title' && {key: 'chapter', icon: 'edit', label: '改章节名'},
      (scene || p.kind === 'end') && {key: 'words', icon: 'edit', label: '改字和朗读', note: '页面上的几句字、读出来的话、小装饰'},
      {key: 'show', icon: 'star', label: '演出', note: showNote(i)},
      scene && {key: 'layout', icon: 'sliders', label: '版式', note: LAYOUTS[p.layout].label},
      p.kind !== 'end' && {key: 'draw', icon: 'paint', label: has ? '重画这一页的图' : '给这一页画图', note: '可以先改要画什么'},
      p.kind !== 'end' && {key: 'pick', icon: 'image', label: '从相册换图'},
      has && {key: 'unpic', icon: 'trash', label: '去掉这一页的图'},
      lack ? {key: 'fill', icon: 'paint', label: `补画缺的图（${lack} 张）`, note: '按写好的画面画'} : bare > 0 && {key: 'fill-all', icon: 'paint', label: `给没图的页都画图（${bare} 张）`, note: '按每一页的字写画面再画'},
      {key: 'theme', icon: 'star', label: '换风格', note: '现在是' + themeOf(book.theme).label},
      {key: 'art', icon: 'paint', label: '画风', note: book.art === 'book' ? '绘本画风（跟着风格画）' : '绘图 App 的画风'},
      {key: 'export', icon: 'download', label: '导出', note: '网页绘本、PDF、EPUB、有声书、图片'},
      {key: 'delete', icon: 'trash', label: '删掉这本绘本', note: '画好的图还留在相册里', danger: true},
    ]);
    if (!key) return;
    try {
      if (key === 'title') await editTitle();
      else if (key === 'chapter') await editChapter(i);
      else if (key === 'words') await editWords(i);
      else if (key === 'show') await editShow(i);
      else if (key === 'layout') await changeLayout(i);
      else if (key === 'draw') { const k = await whichShot(i, '画哪一张？'); if (k != null) await redraw(i, k); }
      else if (key === 'pick') { const k = await whichShot(i, '换哪一张？'); if (k != null) { const blob = await pickBlob(); if (blob) { const ph = await api.addPhoto({name: `绘本-${safeTitle()}-${Date.now()}.${/png/.test(blob.type) ? 'png' : 'jpg'}`, blob}); p.shots[k] = {prompt: '', people: true, ...p.shots[k], picture: {id: ph.id}}; book.pages[i] = normalizePage(p); await keep(i); } } }
      else if (key === 'unpic') { const k = await whichShot(i, '去掉哪一张？'); if (k != null && p.shots[k]) { p.shots[k].picture = null; await keep(i); } }
      else if (key === 'fill' || key === 'fill-all') await drawWithNote(key === 'fill-all');
      else if (key === 'theme') { const id = await menu(ctx, '换风格', THEME_IDS.map(k => ({key: k, icon: k === book.theme ? 'check' : 'star', label: BOOK_THEMES[k].label, note: BOOK_THEMES[k].art.split(',').slice(1, 4).join(',')}))); if (id) { book.theme = id; await keep(i); ctx.notify('换好了；之后画的图用新风格的画法'); } }
      else if (key === 'art') { const a = await menu(ctx, '画风', ARTS.map(([k, label]) => ({key: k, icon: k === book.art ? 'check' : 'paint', label, note: k === 'book' ? themeOf(book.theme).art.split(',').slice(1, 4).join(',') : '绘图 App 里选的画风'}))); if (a) { book.art = a; await keep(i); ctx.notify('之后画的图用这个画风'); } }
      else if (key === 'export') await exportMenu();
      else if (key === 'delete' && await ctx.confirm(`删掉《${book.title}》？`, '书删了就没了；画好的图还留在相册里。')) { await api.deleteBook(book.id); ctx.notify('删掉了'); await shelf(); }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  /** Which picture of page i (asked when there are several; a page with room for one more can take it). */
  async function whichShot(i, title) {
    const p = book.pages[i], n = p.shots.length, room = p.kind === 'scene' ? LAYOUTS[p.layout].shots[1] : 1;
    if (!room) return null;
    if (n <= 1 && room <= 1) return 0;
    if (!n) return 0;
    const items = p.shots.map((s, k) => ({key: String(k), icon: 'image', label: `第 ${k + 1} 张`, note: s.picture ? (s.prompt || '已有图').slice(0, 40) : '还没有图'}));
    if (n < room) items.push({key: String(n), icon: 'add', label: '再加一张'});
    if (items.length === 1) return 0;
    const k = await menu(ctx, title, items);
    return k == null ? null : Number(k);
  }
  async function drawWithNote(all = false) { ctx.notify('开始画，画好一张放一张'); const n = await drawMissing(job = {stop: false}, {all}); job = null; await reader?.refresh(book); if (n) ctx.notify(`画好了 ${n} 张`); }
  function pickBlob() {
    return new Promise(resolve => import('./draw-images.js').then(m => m.pickPicture(ctx, api, '给这一页选一张图')).then(resolve, () => resolve(null)));
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
  function editChapter(i) {
    const p = book.pages[i], d = ctx.dialog('改章节名', `<div class="field"><span>章节名</span><input data-bk-edit="chapter" value="${esc(p.texts[0]?.text || '')}" maxlength="30"></div><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    return dialogDone(d, async () => { const t = d.body.querySelector('[data-bk-edit=chapter]').value.trim(); if (!t) return; book.pages[i] = normalizePage({...p, texts: [{kind: 'title', text: t}], lines: [{role: '', text: t}]}); await keep(i); });
  }
  /** How a page is performed now, in words (the menu's note). */
  function showNote(i) {
    const d = directionOf(book, i);
    return [MOODS[d.mood], CAMERAS[d.camera], ...d.fx.map(k => FX[k]), TURNS[d.turn]].filter(Boolean).join(' · ');
  }
  /**
   * How a page is performed: its mood (the colour of its light), the camera over its picture, effects, the way it is
   * turned to, and its sound; 自动 leaves each to its words.
   */
  async function editShow(i) {
    const p = book.pages[i], d0 = directionOf(book, i), names = await api.bookSounds?.().catch(() => null) || null;
    const chips = (key, table, multi = false) => `<div class="bk-chips" data-bk-chips="${key}"${multi ? ' data-multi' : ''}>${multi ? '' : `<button type="button" data-bk-chip="" aria-pressed="${!p[key]}">自动</button>`}${Object.entries(table).map(([id, label]) => `<button type="button" data-bk-chip="${id}" aria-pressed="${multi ? p.fx.includes(id) : p[key] === id}">${esc(label)}</button>`).join('')}</div>`;
    const list = (id, items) => items?.length ? `<datalist id="${id}">${items.map(n => `<option value="${esc(n)}">`).join('')}</datalist>` : '';
    const d = ctx.dialog('演出', `<p class="hint">「自动」按这一页的字和故事的类型来选。现在是：${esc(showNote(i))}。</p>
      <div class="field"><span>情绪基调（画面的光和颜色）</span>${chips('mood', MOODS)}</div>
      <div class="field"><span>镜头</span>${chips('camera', CAMERAS)}</div>
      <div class="field"><span>效果（最多三个，不选就按字来）</span>${chips('fx', FX, true)}</div>
      <div class="field"><span>翻到这一页的方式</span>${chips('turn', TURNS)}</div>
      ${api.bookSound ? `<div class="field"><span>环境声${help('音效库里的名字（音效 App 打开时才会响）。一直响到下一个环境声；写「停」就停下。')}</span><input data-bk-amb value="${esc(p.sound.ambience)}" maxlength="40" list="bk-amb-list" placeholder="比如 雨声">${list('bk-amb-list', names?.ambience)}</div>
      <div class="field"><span>翻到这一页时的音效</span><input data-bk-sfx value="${esc(p.sound.sfx)}" maxlength="40" list="bk-sfx-list" placeholder="比如 开门">${list('bk-sfx-list', names?.sfx)}</div>` : ''}
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    void d0;
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-bk-chip]');
      if (!b) return;
      const group = b.closest('[data-bk-chips]');
      if (group.hasAttribute('data-multi')) {
        const on = b.getAttribute('aria-pressed') !== 'true';
        if (on && group.querySelectorAll('[aria-pressed=true]').length >= 3) { ctx.notify('效果最多三个'); return; }
        b.setAttribute('aria-pressed', String(on));
      } else group.querySelectorAll('[data-bk-chip]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
    return dialogDone(d, async () => {
      const chosen = key => d.body.querySelector(`[data-bk-chips="${key}"] [aria-pressed=true]`)?.dataset.bkChip || '';
      const fx = [...d.body.querySelectorAll('[data-bk-chips=fx] [aria-pressed=true]')].map(b => b.dataset.bkChip);
      const sound = {ambience: d.body.querySelector('[data-bk-amb]')?.value.trim() ?? p.sound.ambience, sfx: d.body.querySelector('[data-bk-sfx]')?.value.trim() ?? p.sound.sfx};
      book.pages[i] = normalizePage({...p, mood: chosen('mood'), camera: chosen('camera'), turn: chosen('turn'), fx, sound});
      await keep(i);
    });
  }
  /** The words on a page (each its kind and who says it), what is read aloud, its little drawings. */
  function editWords(i) {
    const p = book.pages[i], names = castOf(book), kinds = TEXT_KINDS.filter(k => k !== 'title'), t = themeOf(book.theme);
    const row = (w = {kind: 'caption', text: '', who: ''}) => `<div class="bk-row" data-bk-row><select data-k="kind" aria-label="哪种字">${kinds.map(k => `<option value="${k}"${k === w.kind ? ' selected' : ''}>${TEXT_LABELS[k]}</option>`).join('')}</select><select data-k="who" aria-label="谁说的"><option value="">（旁白）</option>${names.map(n => `<option${n === w.who ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><input data-k="text" value="${esc(w.text)}" maxlength="160" placeholder="页面上的字" aria-label="字"><button type="button" class="icon-button" data-bk-del aria-label="删掉这句">${icon('close')}</button></div>`;
    const d = ctx.dialog('改字和朗读', `<div class="field"><span>页面上的字${help('少一点更像绘本，可以一句都没有，只靠画面。旁白是一句话的说明；说话和心里话会放进气泡；大字是拟声词或大喊；小声是悄悄话。')}</span><div class="bk-rows" data-bk-rows>${p.texts.map(row).join('')}</div><button type="button" class="secondary" data-bk-add>${icon('add')}加一句</button></div>
      <div class="field"><span>读出来的话${help('一行一段。人物说的写成 名字：「……」，用他们的声音读；其他的是旁白。空着就读页面上的字。')}</span><textarea data-bk-read rows="5">${esc(linesText(p.lines))}</textarea></div>
      <div class="field"><span>小装饰（最多三个，可以不选）</span><div class="bk-orns">${ORNAMENT_IDS.map(id => `<button type="button" class="bk-orn" data-bk-orn="${id}" aria-pressed="${p.doodles.includes(id)}" aria-label="${esc(ORNAMENTS[id].label)}" title="${esc(ORNAMENTS[id].label)}" style="--o1:${t.accent};--o2:${t.tape[1]}">${ornamentSvg(id)}</button>`).join('')}</div></div>
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    d.body.addEventListener('click', e => {
      if (e.target.closest('[data-bk-add]')) { d.body.querySelector('[data-bk-rows]').insertAdjacentHTML('beforeend', row()); d.body.querySelector('[data-bk-row]:last-child [data-k=text]')?.focus(); }
      const del = e.target.closest('[data-bk-del]');
      if (del) del.closest('[data-bk-row]').remove();
      const orn = e.target.closest('[data-bk-orn]');
      if (orn) {
        const on = orn.getAttribute('aria-pressed') !== 'true';
        if (on && d.body.querySelectorAll('[data-bk-orn][aria-pressed=true]').length >= 3) { ctx.notify('小装饰最多三个'); return; }
        orn.setAttribute('aria-pressed', String(on));
      }
    });
    return dialogDone(d, async () => {
      const texts = [...d.body.querySelectorAll('[data-bk-row]')].map(r => ({kind: r.querySelector('[data-k=kind]').value, who: r.querySelector('[data-k=who]').value, text: r.querySelector('[data-k=text]').value.trim()})).filter(w => w.text);
      const lines = linesFromText(d.body.querySelector('[data-bk-read]').value, names, p.lines);
      const doodles = [...d.body.querySelectorAll('[data-bk-orn][aria-pressed=true]')].map(b => b.dataset.bkOrn);
      book.pages[i] = normalizePage({...p, texts, lines, doodles});
      await keep(i);
    });
  }
  async function changeLayout(i) {
    const p = book.pages[i];
    const l = await menu(ctx, '版式', Object.entries(LAYOUTS).filter(([id]) => id !== 'title' && (id !== 'classic' || p.layout === 'classic')).map(([id, x]) => ({key: id, icon: id === p.layout ? 'check' : 'sliders', label: x.label, note: x.note})));
    if (!l || l === p.layout) return;
    const [least, most] = LAYOUTS[l].shots, base = p.shots[0]?.prompt || '', more = [', close-up', ', from side', ', wide shot'];
    const shots = p.shots.slice(0, most);
    while (shots.length < least) shots.push({prompt: base ? base + more[shots.length % 3] : '', picture: null, people: true});
    let castOn = p.cast;
    if (l === 'stage' && !castOn.length) {
      const who = [...new Set([...p.texts.map(w => w.who), ...p.lines.map(x => x.role)].filter(n => n && sprite(n)))].slice(0, 2);
      if (!who.length) throw Error('这一页说话的人还没有立绘（在视觉小说里给角色做立绘），用不了「人物登场」');
      castOn = who.map((name, k) => ({name, emotion: '', at: who.length === 1 ? 'center' : k ? 'right' : 'left'}));
    }
    book.pages[i] = normalizePage({...p, layout: l, shots, cast: castOn});
    await keep(i);
    if (missingPictures(book).some(m => m.page === i && 'shot' in m)) ctx.notify('这个版式多了几张图的位置，点「给这一页画图」或「补画缺的图」画上');
  }
  function redraw(i, k) {
    const p = book.pages[i], s = p.shots[k] || {prompt: '', people: p.layout !== 'stage'};
    const d = ctx.dialog('画这一张', `<div class="field"><span>画什么（英文标签，空着就按这一页的字写）</span><textarea data-bk-prompt rows="4">${esc(s.prompt)}</textarea></div>
      <label class="bk-check"><input type="checkbox" data-bk-people${s.people !== false ? ' checked' : ''}> 画面里画人物${p.layout === 'stage' ? '（人物登场页的背景不画人，人物用立绘站上去）' : ''}</label>
      <p class="hint">${book.art === 'book' ? `用「${esc(themeOf(book.theme).label)}」的绘本画风` : '用绘图 App 的画风'}，加上出场人物的外貌，用绘图 App 现在的引擎。</p><div class="actions"><button type="button" class="primary" data-bk-go>${icon('paint')}画</button></div>`);
    return new Promise(resolve => {
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        const b = e.target.closest('[data-bk-go]');
        if (!b) return;
        b.disabled = true; b.textContent = '正在画…';
        try {
          if (!p.shots[k]) p.shots[k] = {prompt: '', picture: null, people: true};
          p.shots[k].people = d.body.querySelector('[data-bk-people]').checked;
          await drawShot(i, k, {prompt: d.body.querySelector('[data-bk-prompt]').value.trim()});
          d.close(); await keep(i);
        } catch (error) { b.disabled = false; b.textContent = '再试一次'; ctx.notify(error.message, {error: true}); }
      });
    });
  }

  // ---------- exports ----------
  const safe = s => String(s || '绘本').replace(/[\\/:*?"<>|]/g, ' ').trim() || '绘本';
  const dataUrl = blob => new Promise(resolve => { const r = new ctx.win.FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(''); r.readAsDataURL(blob); });
  /** A picture made smaller for a file: a JPEG (a PNG when it is see-through: a 立绘, a cut-out), as a data: URL. */
  async function squeeze(src, alpha = false, max = alpha ? 900 : 1400) {
    try {
      const r = await ctx.win.fetch(src), blob = await r.blob(), bmp = await ctx.win.createImageBitmap(blob);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = ctx.doc.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
      return await dataUrl(await new Promise(res => c.toBlob(res, alpha ? 'image/png' : 'image/jpeg', .88)));
    } catch { return ''; }
  }
  const seeThrough = img => !!img && (img.classList.contains('bkp-prop') || !!img.closest('.bkp-actor'));
  /** Page i as the reader shows it (pictures at their addresses here). */
  async function pageHtml(i, numbers) {
    const urls = new Map();
    for (const p of picturesOf(book, i)) urls.set(keyOf(p), await picUrl(p));
    const coverPic = book.pages[0]?.shots[0]?.picture;
    return pageMarkup(book, i, {url: p => urls.get(keyOf(p)) || '', sprite, number: numbers[i].number, chapter: numbers[i].chapter, coverUrl: coverPic ? urls.get(keyOf(coverPic)) || await picUrl(coverPic) : ''});
  }
  async function bitmaps(i) {
    const out = [];
    for (const s of book.pages[i].shots) { const b = await picBlob(s.picture); try { out.push(b ? await ctx.win.createImageBitmap(b) : null); } catch { out.push(null); } }
    return out;
  }
  async function pageSound(p, rate = 22050) {
    const blobs = (await api.bookAudio(readOf(book, p))).filter(Boolean);
    if (!blobs.length) return null;
    const clips = [];
    for (const b of blobs) clips.push(await decodeMono(ctx.win, b, rate));
    return encodeWav(joinClips(clips, rate, .35), rate);
  }
  async function exportMenu() {
    const kind = await menu(ctx, '导出《' + book.title + '》', [
      {key: 'html-voice', icon: 'play', label: '网页绘本（带朗读）', note: '一个 .html 文件，手机电脑都能打开，翻页、自动朗读；没生成过的台词会现在生成'},
      {key: 'html', icon: 'book', label: '网页绘本（不带声音）', note: '文件小一些'},
      {key: 'pdf', icon: 'download', label: 'PDF', note: '每页都和书里一样，适合打印和发给别人'},
      {key: 'epub', icon: 'notes', label: 'EPUB 电子书', note: '固定版式的绘本，在阅读软件里一页一页翻'},
      {key: 'audio', icon: 'listen', label: '有声书（一个声音文件）', note: '整本书读出来，WAV'},
      {key: 'images', icon: 'image', label: '每一页的图片', note: '打包成 .zip'},
    ]);
    if (!kind) return;
    const narr = api.bookNarration?.() || {kept: false};
    if ((kind === 'html-voice' || kind === 'audio') && !narr.kept && !await ctx.confirm('旁白不会在文件里出声', '旁白现在用的是浏览器的系统朗读，存不进文件，导出的声音里只有角色的台词。想让旁白也有声音：在角色 App 里给「旁白」选音色，再在设置 → 整篇朗读里选「旁白角色」。先这样导出吗？')) return;
    if (reader?.reading) reader.setReading(false);
    const name = safe(book.title), numbers = pageNumbers(book), n = book.pages.length;
    let blob, file;
    if (kind === 'pdf' || kind === 'images' || kind === 'epub') {
      const cache = new Map();
      const inline = async (src, img) => { const alpha = seeThrough(img), k = (alpha ? 'a:' : 'j:') + src; if (!cache.has(k)) cache.set(k, await squeeze(src, alpha)); return cache.get(k); };
      const pages = [];
      for (let i = 0; i < n; i++) {
        ctx.notify(`正在排版：第 ${i + 1} / ${n} 页`);
        const wide = book.pages[i].layout === 'spread', width = wide ? 2400 : 1200, height = 1600;
        const jpeg = await pageJpeg(ctx.doc, await pageHtml(i, numbers), {width, height, inline, fallback: async (g, W, H) => { const b = await bitmaps(i); drawSimple(g, book, book.pages[i], b, {W, H, number: numbers[i].number}); b.forEach(x => x?.close?.()); }});
        pages.push({jpeg, width, height, wide});
      }
      if (kind === 'pdf') { blob = pdfFromJpegs(pages.map(p => ({jpeg: p.jpeg, width: p.wide ? 840 : 420})), {title: book.title, author: book.author}); file = name + '.pdf'; }
      else if (kind === 'images') { blob = await zipFiles(pages.map((p, i) => ({name: `${String(i + 1).padStart(2, '0')}.jpg`, blob: new Blob([p.jpeg], {type: 'image/jpeg'})}))); file = name + ' 图片'; }
      else {
        const label = i => book.pages[i].kind === 'cover' ? book.title : book.pages[i].layout === 'title' ? book.pages[i].texts[0]?.text || '' : '';
        blob = epubOf(book, pages.map((p, i) => ({jpeg: p.jpeg, width: p.width, height: p.height, text: readOf(book, book.pages[i]).map(l => l.text).join(' '), label: label(i)}))); file = name + '.epub';
      }
    } else if (kind === 'audio') {
      const all = [];
      for (let i = 0; i < n; i++) { ctx.notify(`正在准备声音：第 ${i + 1} / ${n} 页`); const b = await pageSound(book.pages[i], 24000); if (b) all.push(await decodeMono(ctx.win, b, 24000)); }
      if (!all.length) throw Error('这本书还没有能读出声音的部分');
      blob = encodeWav(joinClips(all, 24000, 1.1), 24000); file = name + ' 有声书';
    } else {
      // Each picture once, as bk:N in the pages.
      const images = [], index = new Map();
      const slot = async (src, alpha) => { if (!src) return ''; const d = await squeeze(src, alpha); if (!d) return ''; if (!index.has(d)) { index.set(d, images.length); images.push(d); } return 'bk:' + index.get(d); };
      const pages = [], sounds = [];
      for (let i = 0; i < n; i++) {
        ctx.notify(`正在准备：第 ${i + 1} / ${n} 页`);
        const tokens = new Map(), people = new Map(), p = book.pages[i];
        for (const s of p.shots) if (s.picture) tokens.set(keyOf(s.picture), await slot(await picUrl(s.picture), false));
        for (const x of p.props) if (x.picture) tokens.set(keyOf(x.picture), await slot(await picUrl(x.picture), true));
        for (const c of p.cast) people.set(c.name + '|' + c.emotion, await slot(sprite(c.name, c.emotion), true));
        const coverPic = book.pages[0]?.shots[0]?.picture, coverUrl = p.kind === 'end' && coverPic ? await slot(await picUrl(coverPic), false) : '';
        pages.push(pageMarkup(book, i, {url: x => tokens.get(keyOf(x)) || '', sprite: (who, how) => people.get(who + '|' + how) || '', number: numbers[i].number, chapter: numbers[i].chapter, coverUrl}));
        if (kind === 'html-voice') { const b = await pageSound(p); sounds.push(b ? await dataUrl(b) : ''); }
      }
      // The weather drawn over the pages comes with the file (vn-fx.js inside it).
      let fx = '';
      try { const r = await ctx.win.fetch(new URL('../vn-fx.js', import.meta.url)); if (r.ok) fx = await r.text(); } catch {}
      blob = new Blob([bookHtml(book, {pages, images, sounds, fx})], {type: 'text/html'}); file = name + '.html';
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
  v.root.addEventListener('error', e => { if (e.target?.tagName === 'IMG' && e.target.closest('.bkp')) e.target.classList.add('bkp-broken'); }, true);
  v.back = () => { if (view === 'shelf') return false; if (view === 'making') { if (job) job.stop = true; return true; } shelf(); return true; };
  v.leave = () => { if (reader?.reading) reader.setReading(false); };
  v.refresh = () => { if (view === 'shelf') shelf(); };
  const dispose = v.dispose;
  v.dispose = () => { leaveReader(); if (job) job.stop = true; for (const u of photoUrls.values()) ctx.win.URL.revokeObjectURL(u); dispose(); };
  shelf();
  return v;
}

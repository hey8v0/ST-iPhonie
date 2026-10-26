// 绘本: the story made into picture books. The shelf (each book with its cover); 做一本 (which part of the chat, 改写 by
// the text model or the story as written, the kind of book, whether pictures are drawn); making it (written, then a
// picture for every page that has none, each kept as it comes, so leaving does not lose it); the reader (pages turned
// by tap or swipe, read aloud page by page in the 旁白's and the characters' voices, turning by itself); changes to a
// page (its words, its picture, its layout) and the book (its kind, its title); and exports: a web page that reads
// itself (.html), PDF, EPUB, the reading as one sound file, and the pages as pictures.
import {createView, esc, heading, menu, help} from './common.js';
import {icon} from './icons.js';
import {saveFile, zipFiles} from '../download.js';
import {pictureInputs, sizeFor} from '../core/draw.js';
import {BOOK_THEMES, THEME_IDS, themeOf, guessTheme} from '../core/book-themes.js';
import {storyPages, storyScript, retellPrompt, retoldPages, bookOf, pagesFor, scriptParts, normalizePage, linesFromText, pageText} from '../core/book.js';
import {pageJpeg} from './book-render.js';
import {pdfFromJpegs, epubOf} from '../core/book-export.js';
import {bookHtml} from '../core/book-html.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';

const RANGES = [['20', '近 20 条'], ['50', '近 50 条'], ['all', '整个聊天'], ['pick', '自己选']];
const PICTURES = [['draw', '正文的图＋补画'], ['story', '只用正文的图'], ['none', '不要插图']];
const LENGTHS = [['auto', '按故事长短'], ['8', '短（8 页）'], ['16', '中（16 页）'], ['26', '长（26 页）']];
const themeVars = id => { const t = themeOf(id); return `--bk-paper:${t.paper};--bk-ink:${t.ink};--bk-accent:${t.accent};--bk-soft:${t.soft};--bk-font:${t.font.replace(/"/g, "'")}`; };
const castOf = book => [...new Set(book.pages.flatMap(p => p.lines.map(l => l.role)).filter(Boolean))];
/** What a page reads aloud: its lines; the cover its title; a chapter its heading; the end 完. */
const readOf = (book, p) => p.kind === 'cover' ? [{role: '', text: book.title + (book.subtitle ? '。' + book.subtitle : ''), emotion: ''}]
  : p.lines.length ? p.lines : p.text ? [{role: '', text: p.text, emotion: ''}] : [];
/** Pages still without the picture planned for them (a prompt written); all: every page of story without one. */
const missing = (book, all = false) => book.pages.map((p, i) => i).filter(i => { const p = book.pages[i]; return !p.picture && (p.prompt ? p.kind === 'page' || p.kind === 'cover' : all && p.kind === 'page'); });

export function bookApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'picbook'), photoUrls = new Map(), keys = new ctx.win.AbortController();
  let view = 'shelf', books = [], book = null, at = 0, reading = false, job = null, form = null;

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
  const coverPic = b => b.pages[0]?.picture || b.pages.find(p => p.picture)?.picture || null;

  // ---------- the shelf ----------
  async function shelf() {
    view = 'shelf'; book = null; stopReading();
    books = await api.listBooks().catch(() => []);
    const covers = await Promise.all(books.map(b => picUrl(coverPic(b))));
    v.draw(heading('绘本', `<button type="button" class="chip-button" data-action="bk-new">${icon('add')}做一本</button>`, 'Picture Book')
      + `<div class="bk-shelf">${books.map((b, i) => `<button type="button" class="bk-cover${covers[i] ? '' : ' plain'}" data-book="${esc(b.id)}" style="${themeVars(b.theme)};${covers[i] ? `background-image:url('${covers[i]}')` : 'background:var(--bk-paper)'}"><span class="bk-badge">${esc(themeOf(b.theme).label)} · ${b.pages.filter(p => p.kind === 'page').length} 页</span><span class="bk-cover-text"><strong>${esc(b.title)}</strong><small>${esc(b.source.name || '')}${missing(b).length ? ` · 还差 ${missing(b).length} 张图` : ''}</small></span></button>`).join('')}
        <button type="button" class="bk-new" data-action="bk-new">${icon('add')}<span>做一本绘本</span></button></div>`
      + `<p class="hint">把酒馆里的故事做成绘本：每一页一个画面，配上插图，用旁白和角色的声音读出来，可以导出成网页、PDF、EPUB 和有声书。${help('「改写成绘本」让文字模型把故事改写成绘本的样子：起书名、分章节、每页几句话、每页画什么，人物说的话还用他们的声音读。「原文排版」不改一个字，按段落分页，正文里已有的插图和配音直接用。\n插图用绘图 App 现在的引擎和画风，加上这本书风格的画法；正文里已有的图先用上，缺的再画。\n朗读：人物有音色的用他们的声音，其他的用「整篇朗读」选的旁白声音。')}</p>`);
  }

  // ---------- 做一本 ----------
  function make() {
    let info;
    try { info = api.bookInfo?.(); } catch (error) { ctx.notify(error.message, {error: true}); return; }
    if (!info) { ctx.notify('要在酒馆里打开小手机才能做绘本', {error: true}); return; }
    view = 'make';
    form ??= {range: info.length > 50 ? '50' : 'all', from: Math.max(0, info.length - 50), to: info.length - 1, mode: 'retell', theme: 'auto', pictures: 'draw', length: 'auto', title: ''};
    form.to = Math.min(form.to, info.length - 1);
    const seg = (key, list) => `<div class="segmented">${list.map(([k, l]) => `<button type="button" data-bk-set="${key}" data-value="${k}" aria-pressed="${form[key] === k}">${l}</button>`).join('')}</div>`;
    v.draw(heading('做一本绘本', '', 'New Book')
      + `<p class="hint">从「${esc(info.title || '当前聊天')}」里取故事（共 ${info.length} 条消息）。</p>`
      + `<div class="group pad"><div class="field"><span>哪一段故事</span>${seg('range', RANGES)}</div>
        ${form.range === 'pick' ? `<div class="bk-range"><label>从第 <input type="number" min="0" max="${info.length - 1}" value="${form.from}" data-bk-field="from"> 条</label><label>到第 <input type="number" min="0" max="${info.length - 1}" value="${form.to}" data-bk-field="to"> 条</label></div>` : ''}
        <div class="field"><span>怎么做${help('改写：文字模型把故事改写成绘本（起书名、分章、每页几句话、每页画什么），会用文字模型的额度。原文：不改一个字，按段落分页。')}</span>${seg('mode', [['retell', '改写成绘本'], ['story', '原文排版']])}</div>
        <div class="field"><span>风格</span></div>
        <div class="bk-themes"><button type="button" class="bk-theme" data-bk-theme="auto" aria-pressed="${form.theme === 'auto'}" style="--bk-paper:var(--card);--bk-ink:var(--ink);--bk-accent:var(--accent);--bk-font:inherit"><i></i>自动</button>${THEME_IDS.map(id => `<button type="button" class="bk-theme" data-bk-theme="${id}" aria-pressed="${form.theme === id}" style="${themeVars(id)}"><i></i>${esc(BOOK_THEMES[id].label)}</button>`).join('')}</div>
        <div class="field"><span>插图${help('补画用绘图 App 现在的引擎和画风，每张图会存进相册。NovelAI 用 Opus 画小图不扣点；别的大小或引擎会花额度，开始前会问你。')}</span>${seg('pictures', PICTURES)}</div>
        ${form.mode === 'retell' ? `<div class="field"><span>篇幅</span>${seg('length', LENGTHS)}</div>` : ''}
        <div class="field"><span>书名（可以不填）</span><input data-bk-field="title" value="${esc(form.title)}" maxlength="40" placeholder="${form.mode === 'retell' ? '让文字模型起' : '用聊天的名字'}"></div></div>
        <div class="actions"><button type="button" class="secondary" data-action="bk-shelf">取消</button><button type="button" class="primary" data-action="bk-start">${icon('paint')}开始做</button></div>`);
  }

  // ---------- making ----------
  function progress(title, done, total, note = '') {
    if (view !== 'making') return;
    v.draw(heading('正在做绘本', '', 'Making')
      + `<div class="bk-progress"><b>${esc(title)}</b><div class="bk-bar"><i style="width:${total ? Math.round(done / total * 100) : 5}%"></i></div><small>${esc(note)}</small></div>
        <p class="hint">做好的部分随时存着：中途停下，之后在书里点「补画缺的图」接着画。</p>
        <div class="actions"><button type="button" class="secondary" data-action="bk-stop">停下</button></div>`);
  }
  async function start() {
    const info = api.bookInfo();
    const [from, to] = form.range === 'pick' ? [Math.min(form.from, form.to), Math.max(form.from, form.to)] : form.range === 'all' ? [0, info.length - 1] : [Math.max(0, info.length - Number(form.range)), info.length - 1];
    const me = job = {stop: false};
    view = 'making';
    try {
      progress('读故事', 0, 1, `第 ${from} 到第 ${to} 条`);
      const source = api.bookSource(from, to);
      if (!source.messages.length) throw Error('这一段里没有故事内容');
      let pages, title = form.title.trim(), subtitle = '', genre = '', cover = '';
      if (form.mode === 'retell') {
        const {script, pictures} = storyScript(source.messages), parts = scriptParts(script), want = form.length === 'auto' ? pagesFor(script.length) : Number(form.length);
        const cast = [...new Set(source.messages.flatMap(m => m.steps.filter(s => s.kind === 'say').map(s => s.role)).filter(Boolean))];
        pages = [];
        for (let i = 0; i < parts.length; i++) {
          if (me.stop) throw Error('停下了');
          progress('文字模型在写绘本', i, parts.length, parts.length > 1 ? `故事比较长，分成 ${parts.length} 段来写：第 ${i + 1} 段` : '写书名、分章节、每一页的文字和画面');
          const prompt = retellPrompt(parts[i], {pages: Math.max(4, Math.round(want * parts[i].length / script.length)), cast, part: parts.length > 1 ? {index: i, of: parts.length} : null, before: pages.filter(p => p.kind === 'page').at(-1)?.text || ''});
          const got = retoldPages(await api.bookWrite(prompt.system, prompt.user), {pictures, cast});
          if (!i) { title ||= got.title; subtitle = got.subtitle; genre = got.genre; cover = got.cover; }
          pages.push(...got.pages);
        }
      } else pages = storyPages(source.messages);
      if (form.pictures === 'none') pages = pages.map(p => ({...p, picture: null, prompt: ''}));
      const theme = form.theme === 'auto' ? genre || guessTheme(pages.map(p => p.text).join('\n')) : form.theme;
      let made = bookOf({title: title || `${source.title || '我们'}的故事`, subtitle, author: source.user, theme, mode: form.mode, source: {chat: source.chat, name: source.title, from, to}, pages, cover});
      // The cover: drawn from its own prompt when pictures are drawn; else the story's first picture.
      if (form.mode === 'story' || !cover || form.pictures !== 'draw') made.pages[0].picture = made.pages.find(p => p.picture)?.picture || null;
      made = await api.saveBook(made);
      book = made;
      // 原文 has no picture planned: each page without one gets one written from its words.
      if (form.pictures === 'draw') await drawMissing(me, {all: form.mode === 'story'});
      if (job === me) { job = null; await open(book.id); ctx.notify(`《${book.title}》做好了`); }
    } catch (error) {
      if (job === me) job = null;
      if (book) { ctx.notify(`停在这里了：${error.message}（做好的部分已存好）`, {error: !me.stop}); await open(book.id); }
      else { ctx.notify(error.message, {error: true}); make(); }
    }
  }
  /** Draws a picture for every page still without one (asking once when it costs). Each one is kept as it comes. */
  async function drawMissing(me = {stop: false}, {all = false} = {}) {
    const todo = missing(book, all);
    if (!todo.length) return 0;
    if (!api.drawReady?.()) { ctx.notify('绘图 App 还没设置好引擎，插图先空着，设置好后在书里点「补画缺的图」', {error: true}); return 0; }
    const quote = api.drawQuote?.(api.getState().draw.params);
    if (quote && quote.free === false && !await ctx.confirm(`要画 ${todo.length} 张插图`, '按现在绘图 App 的设置，每张都会花点数或额度。继续画吗？')) return 0;
    let done = 0, failed = 0;
    for (const i of todo) {
      if (me.stop) break;
      if (view === 'making') progress('画插图', done, todo.length, `第 ${done + 1} 张，共 ${todo.length} 张${failed ? `（${failed} 张没画成）` : ''}`);
      try { await drawPage(i, {paid: true}); done++; book = await api.saveBook(book); if (view === 'read' && at === i) paint(); }
      catch (error) { failed++; if (error.code === 'PAID') break; }
    }
    if (failed) ctx.notify(`有 ${failed} 张插图没画成，之后可以在书里点「补画缺的图」再试`, {error: true});
    return done;
  }
  /** Draws page i's picture: what it shows (its prompt, else one written from its words), the book's style, its people. */
  async function drawPage(i, {paid = false, prompt} = {}) {
    const p = book.pages[i], t = themeOf(book.theme), cast = castOf(book);
    let what = prompt ?? p.prompt;
    if (!what) { const w = await api.writePrompt((p.text || book.title).slice(0, 300), cast); what = w?.prompt || ''; }
    if (!what) throw Error('没能写出这一页要画什么');
    p.prompt = what;
    const names = cast.filter(n => (p.text + ' ' + what).includes(n));
    const inputs = pictureInputs(api.getState(), {prompt: [what, t.art].join(', '), characters: names}, p.text);
    if (p.kind === 'cover' || (p.layout || t.layout) === 'full') inputs.params = {...inputs.params, ...sizeFor(inputs.params, '竖')};
    const {names: _n, ...request} = inputs;
    const result = await api.generateImage({...request, allowPaid: paid, name: '绘本-' + book.title.replace(/[\\/:*?"<>|]/g, ''), key: `book:${book.id}:${i}`, label: `绘本 · ${book.title} · 第 ${i} 页`});
    p.picture = {id: result.photoId};
  }

  // ---------- the reader ----------
  async function open(id) {
    book = await api.getBook(id);
    if (!book) { ctx.notify('这本绘本找不到了', {error: true}); return shelf(); }
    view = 'read'; at = Math.min(at, book.pages.length - 1); if (!book.pages[at]) at = 0;
    v.draw(`<div class="bk-reader" style="${themeVars(book.theme)}">
      <div class="bk-head"><strong>${esc(book.title)}</strong></div>
      <div class="bk-stage" data-bk-stage></div>
      <div class="bk-controls"><button type="button" class="chip-button" data-action="bk-prev" aria-label="上一页">‹</button><span class="bk-where" data-bk-where></span><button type="button" class="chip-button" data-action="bk-next" aria-label="下一页">›</button>
        <button type="button" class="chip-button" data-action="bk-read" aria-pressed="false">${icon('play')}朗读</button><button type="button" class="chip-button" data-action="bk-more">⋯</button></div>
      <div class="bk-pages" data-bk-pages></div></div>`);
    swipe(v.root.querySelector('[data-bk-stage]'));
    await paint();
    thumbs();
  }
  async function pageHtml(p, i) {
    const t = themeOf(book.theme), url = await picUrl(p.picture);
    const pic = url ? `<div class="bk-pic"><img src="${esc(url)}" alt=""></div>` : p.kind === 'page' && p.prompt && !p.picture ? '<div class="bk-pic waiting">这一页的图还没画</div>' : '';
    const layout = url ? (p.kind === 'page' ? p.layout || t.layout : '') : 'bare';
    const words = String(p.text || '').split('\n').filter(Boolean).map(line => `<p${/^[^「]{1,20}：「/.test(line) ? ' class="said"' : ''}>${esc(line)}</p>`).join('');
    const body = p.kind === 'cover' ? `${pic}<div class="bk-title"><h1>${esc(book.title)}</h1>${book.subtitle ? `<h2>${esc(book.subtitle)}</h2>` : ''}<small>${esc(t.label)}绘本${book.author ? ' · ' + esc(book.author) : ''}</small></div>`
      : p.kind === 'chapter' ? `${pic}<h2>${esc(p.text)}</h2>`
      : p.kind === 'end' ? `${pic}<div class="bk-end">${esc(p.text || '完')}</div>`
      : `${pic}<div class="bk-words">${words}</div><span class="bk-num">${i}</span>`;
    return `<article class="bk-page ${p.kind} ${layout}" data-deco="${t.deco}">${body}</article>`;
  }
  async function paint(dir = 0) {
    const stage = v.root.querySelector('[data-bk-stage]');
    if (!stage || !book) return;
    // A turn still going: it ends at once (a quick tap is not lost).
    const pages = [...stage.querySelectorAll('.bk-page')];
    pages.slice(0, -1).forEach(p => p.remove());
    const html = await pageHtml(book.pages[at], at), old = stage.querySelector('.bk-page');
    const tmp = ctx.doc.createElement('div'); tmp.innerHTML = html;
    const next = tmp.firstElementChild;
    if (old && dir && !ctx.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      if (dir > 0) { next.classList.add('coming'); stage.append(next); old.style.zIndex = 2; ctx.win.requestAnimationFrame(() => { old.classList.add('turned'); next.classList.remove('coming'); }); }
      else { next.classList.add('turned'); stage.append(next); ctx.win.requestAnimationFrame(() => { next.classList.remove('turned'); old.classList.add('coming'); }); }
      ctx.win.setTimeout(() => { old.remove(); }, 560);
    } else { stage.replaceChildren(next); }
    fitWords(next);
    const where = v.root.querySelector('[data-bk-where]');
    if (where) where.textContent = `${at + 1} / ${book.pages.length}`;
    v.root.querySelectorAll('[data-bk-thumb]').forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.bkThumb) === at)));
  }
  /** The words of a page made smaller until they fit it (a long page of the story as written), not below 11px. */
  function fitWords(page) {
    const box = page.querySelector('.bk-words');
    if (!box) return;
    const fit = () => { let size = 15.5; box.style.fontSize = ''; while (box.scrollHeight > box.clientHeight + 1 && size > 11) { size -= .5; box.style.fontSize = size + 'px'; } };
    fit();
    page.querySelector('img')?.addEventListener('load', fit, {once: true});
  }
  async function thumbs() {
    const box = v.root.querySelector('[data-bk-pages]');
    if (!box || !book) return;
    const urls = await Promise.all(book.pages.map(p => picUrl(p.picture)));
    box.innerHTML = book.pages.map((p, i) => `<button type="button" class="bk-thumb" data-bk-thumb="${i}" aria-current="${i === at}" aria-label="第 ${i + 1} 页" style="${urls[i] ? `background-image:url('${urls[i]}')` : ''}">${urls[i] ? '' : p.kind === 'cover' ? '封面' : p.kind === 'end' ? '完' : i}</button>`).join('');
  }
  function go(n, {keepReading = false} = {}) {
    if (!book) return;
    const next = Math.max(0, Math.min(book.pages.length - 1, n));
    if (next === at) return;
    if (!keepReading && reading) { api.stop?.(); }
    const dir = next > at ? 1 : -1;
    at = next; paint(dir);
    if (reading && !keepReading) readHere();
  }
  function swipe(el) {
    let x0 = null;
    el.addEventListener('pointerdown', e => { x0 = e.clientX; });
    el.addEventListener('pointerup', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
      else if (!e.target.closest('.bk-words')) { const r = el.getBoundingClientRect(); go(at + (e.clientX - r.left < r.width / 3 ? -1 : 1)); }
    });
  }

  // ---------- reading aloud ----------
  function setReading(on) {
    reading = on;
    const b = v.root.querySelector('[data-action=bk-read]');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.innerHTML = on ? '❚❚ 停' : `${icon('play')}朗读`; }
    if (on) readHere(); else api.stop?.();
  }
  function stopReading() { if (reading) { reading = false; api.stop?.(); } }
  let readTurn = 0;
  async function readHere() {
    const turn = ++readTurn, page = at;
    let read = false;
    try { read = await api.bookRead(readOf(book, book.pages[page])); } catch (error) { ctx.notify(error.message, {error: true}); setReading(false); return; }
    if (turn !== readTurn || !reading || view !== 'read') return;
    if (!read && page === 0) { ctx.notify('还没有能朗读的声音：在设置 → 整篇朗读选旁白声音，或者给角色选音色', {error: true}); setReading(false); return; }
    if (at >= book.pages.length - 1) { setReading(false); return; }
    ctx.win.setTimeout(() => { if (turn === readTurn && reading) { go(at + 1, {keepReading: true}); readHere(); } }, read ? 700 : 2200);
  }

  // ---------- changes ----------
  async function pageMenu() {
    const p = book.pages[at], t = themeOf(book.theme), lack = missing(book).length, bare = missing(book, true).length;
    const key = await menu(ctx, `第 ${at + 1} 页`, [
      p.kind !== 'end' && {key: 'edit', icon: 'edit', label: p.kind === 'cover' ? '改书名' : '改这一页的字', note: p.kind === 'page' ? '人物的话写成 名字：「……」，朗读时用他们的声音' : ''},
      p.kind !== 'end' && {key: 'draw', icon: 'paint', label: p.picture ? '重画这一页的图' : '给这一页画图', note: '可以先改要画什么'},
      {key: 'pick', icon: 'image', label: '从相册换一张图', note: '或者从手机里选'},
      p.picture && {key: 'unpic', icon: 'trash', label: '去掉这一页的图'},
      p.kind === 'page' && {key: 'layout', icon: 'sliders', label: '版式', note: {top: '图在上、字在下', full: '满版图、字在框里', frame: '图放在相框里'}[p.layout || t.layout] + (p.layout ? '' : '（跟着风格）')},
      lack ? {key: 'fill', icon: 'paint', label: `补画缺的图（${lack} 张）`, note: '按写好的画面画'} : bare && {key: 'fill-all', icon: 'paint', label: `给没图的页都画图（${bare} 张）`, note: '按每一页的字写画面再画，会用文字模型和绘图的额度'},
      {key: 'theme', icon: 'star', label: '换风格', note: '现在是' + t.label},
      {key: 'export', icon: 'download', label: '导出', note: '网页绘本、PDF、EPUB、有声书、图片'},
      {key: 'delete', icon: 'trash', label: '删掉这本绘本', note: '画好的插图还留在相册里', danger: true},
    ]);
    if (!key) return;
    try {
      if (key === 'edit') await editPage();
      else if (key === 'draw') await redraw();
      else if (key === 'pick') { const blob = await pickBlob(); if (blob) { const ph = await api.addPhoto({name: `绘本-${book.title}-${Date.now()}.${/png/.test(blob.type) ? 'png' : 'jpg'}`, blob}); p.picture = {id: ph.id}; await keep(); } }
      else if (key === 'unpic') { p.picture = null; await keep(); }
      else if (key === 'layout') { const l = await menu(ctx, '版式', [['', `跟着风格（${({top: '图在上', full: '满版图', frame: '相框'})[t.layout]}）`], ['top', '图在上、字在下'], ['full', '满版图、字在框里'], ['frame', '图放在相框里']].map(([k, label]) => ({key: k || 'theme', icon: (p.layout || '') === k ? 'check' : 'sliders', label}))); if (l) { p.layout = l === 'theme' ? '' : l; await keep(); } }
      else if (key === 'fill' || key === 'fill-all') { await drawWithNote(key === 'fill-all'); }
      else if (key === 'theme') { const id = await menu(ctx, '换风格', THEME_IDS.map(k => ({key: k, icon: k === book.theme ? 'check' : 'star', label: BOOK_THEMES[k].label, note: BOOK_THEMES[k].art.split(',').slice(0, 2).join(',')}))); if (id) { book.theme = id; await keep(); await open(book.id); ctx.notify('换好了；之后补画的图用新风格的画法'); } }
      else if (key === 'export') await exportMenu();
      else if (key === 'delete' && await ctx.confirm(`删掉《${book.title}》？`, '书删了就没了；画好的插图还留在相册里。')) { await api.deleteBook(book.id); ctx.notify('删掉了'); await shelf(); }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  async function keep() { book = await api.saveBook(book); await paint(); thumbs(); }
  async function drawWithNote(all = false) { ctx.notify('开始画，画好一张放一张'); const n = await drawMissing(job = {stop: false}, {all}); job = null; await paint(); thumbs(); ctx.notify(`画好了 ${n} 张`); }
  function pickBlob() {
    return new Promise(resolve => import('./draw-images.js').then(m => m.pickPicture(ctx, api, '给这一页选一张图')).then(resolve, () => resolve(null)));
  }
  function editPage() {
    const p = book.pages[at], cover = p.kind === 'cover';
    return new Promise(resolve => {
      const d = ctx.dialog(cover ? '改书名' : '改这一页', cover
        ? `<div class="field"><span>书名</span><input data-bk-edit="title" value="${esc(book.title)}" maxlength="40"></div><div class="field"><span>副标题</span><input data-bk-edit="subtitle" value="${esc(book.subtitle)}" maxlength="60"></div><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`
        : `<div class="bk-edit"><textarea data-bk-edit="text" rows="8">${esc(p.text)}</textarea></div><p class="hint">人物的话写成「名字：「……」」，朗读时用他们的声音；其他的是旁白。</p><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        if (!e.target.closest('[data-bk-save]')) return;
        if (cover) { book.title = d.body.querySelector('[data-bk-edit=title]').value.trim() || book.title; book.subtitle = d.body.querySelector('[data-bk-edit=subtitle]').value.trim(); }
        else { const text = d.body.querySelector('[data-bk-edit=text]').value.trim(); if (text !== p.text) { const lines = linesFromText(text, castOf(book), p.lines); Object.assign(p, normalizePage({...p, lines, text: lines.length ? pageText(lines) : text})); } }
        d.close(); await keep();
      });
    });
  }
  function redraw() {
    const p = book.pages[at];
    return new Promise(resolve => {
      const d = ctx.dialog('画这一页', `<div class="field"><span>画什么（英文标签，空着就按这一页的字写）</span><textarea data-bk-prompt rows="4">${esc(p.prompt)}</textarea></div><p class="hint">会加上「${esc(themeOf(book.theme).label)}」风格的画法和出场人物的外貌，用绘图 App 现在的引擎和画风。</p><div class="actions"><button type="button" class="primary" data-bk-go>${icon('paint')}画</button></div>`);
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        const b = e.target.closest('[data-bk-go]');
        if (!b) return;
        b.disabled = true; b.textContent = '正在画…';
        try { await drawPage(at, {paid: true, prompt: d.body.querySelector('[data-bk-prompt]').value.trim()}); d.close(); await keep(); }
        catch (error) { b.disabled = false; b.textContent = '再试一次'; ctx.notify(error.message, {error: true}); }
      });
    });
  }

  // ---------- exports ----------
  const safe = s => String(s || '绘本').replace(/[\\/:*?"<>|]/g, ' ').trim() || '绘本';
  async function bitmapOf(pic) { const blob = await picBlob(pic); if (!blob) return null; try { return await ctx.win.createImageBitmap(blob); } catch { return null; } }
  async function jpegOf(bitmap, max = 1400) {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height)), c = ctx.doc.createElement('canvas');
    c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .86));
    return new Uint8Array(await blob.arrayBuffer());
  }
  const dataUrl = (bytes, type) => new Promise(resolve => { const r = new ctx.win.FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(new Blob([bytes], {type})); });
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
      {key: 'pdf', icon: 'download', label: 'PDF', note: '每页排好版，适合打印和发给别人'},
      {key: 'epub', icon: 'notes', label: 'EPUB 电子书', note: '在阅读软件里看，文字能放大'},
      {key: 'audio', icon: 'listen', label: '有声书（一个声音文件）', note: '整本书读出来，WAV'},
      {key: 'images', icon: 'image', label: '每一页的图片', note: '打包成 .zip'},
    ]);
    if (!kind) return;
    const narr = api.bookNarration?.() || {kept: false};
    if ((kind === 'html-voice' || kind === 'audio') && !narr.kept && !await ctx.confirm('旁白不会在文件里出声', '旁白现在用的是浏览器的系统朗读，存不进文件，导出的声音里只有角色的台词。想让旁白也有声音：在角色 App 里给「旁白」选音色，再在设置 → 整篇朗读里选「旁白角色」。先这样导出吗？')) return;
    const stopNote = text => ctx.notify(text);
    const pics = [];
    stopNote('正在准备图…');
    for (const p of book.pages) pics.push(await bitmapOf(p.picture));
    const name = safe(book.title);
    let blob, file;
    if (kind === 'pdf' || kind === 'images') {
      const pages = [];
      for (let i = 0; i < book.pages.length; i++) pages.push(await pageJpeg(ctx.doc, book, book.pages[i], pics[i], {number: book.pages[i].kind === 'page' ? i : 0}));
      if (kind === 'pdf') { blob = pdfFromJpegs(pages.map(jpeg => ({jpeg})), {title: book.title, author: book.author}); file = name + '.pdf'; }
      else { blob = await zipFiles(pages.map((jpeg, i) => ({name: `${String(i + 1).padStart(2, '0')}.jpg`, blob: new Blob([jpeg], {type: 'image/jpeg'})}))); file = name + ' 图片'; }
    } else if (kind === 'epub') {
      const images = new Map();
      for (let i = 0; i < pics.length; i++) if (pics[i]) images.set(i, {bytes: await jpegOf(pics[i], 1200), type: 'image/jpeg'});
      blob = epubOf({title: book.title, author: book.author, theme: themeOf(book.theme), pages: book.pages}, images); file = name + '.epub';
    } else if (kind === 'audio') {
      const all = [];
      for (let i = 0; i < book.pages.length; i++) { stopNote(`正在准备声音：第 ${i + 1} / ${book.pages.length} 页`); const b = await pageSound(book.pages[i], 24000); if (b) all.push(await decodeMono(ctx.win, b, 24000)); }
      if (!all.length) throw Error('这本书还没有能读出声音的部分');
      blob = encodeWav(joinClips(all, 24000, 1.1), 24000); file = name + ' 有声书';
    } else {
      const pictures = [], sounds = [];
      for (const bmp of pics) pictures.push(bmp ? await dataUrl(await jpegOf(bmp, 1100), 'image/jpeg') : '');
      if (kind === 'html-voice') for (let i = 0; i < book.pages.length; i++) { stopNote(`正在准备朗读：第 ${i + 1} / ${book.pages.length} 页`); const b = await pageSound(book.pages[i]); sounds.push(b ? await dataUrl(new Uint8Array(await b.arrayBuffer()), 'audio/wav') : ''); }
      blob = new Blob([bookHtml(book, pictures, sounds)], {type: 'text/html'}); file = name + '.html';
    }
    for (const bmp of pics) bmp?.close?.();
    ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, file));
  }

  // ---------- events ----------
  v.on('click', '[data-action=bk-new]', () => { form = null; make(); });
  v.on('click', '[data-action=bk-shelf]', () => shelf());
  v.on('click', '[data-action=bk-start]', () => start());
  v.on('click', '[data-action=bk-stop]', () => { if (job) job.stop = true; ctx.notify('画完这一张就停'); });
  v.on('click', '[data-book]', el => { at = 0; open(el.dataset.book); });
  v.on('click', '[data-action=bk-prev]', () => go(at - 1));
  v.on('click', '[data-action=bk-next]', () => go(at + 1));
  v.on('click', '[data-action=bk-read]', () => setReading(!reading));
  v.on('click', '[data-action=bk-more]', () => pageMenu());
  v.on('click', '[data-bk-thumb]', el => go(Number(el.dataset.bkThumb)));
  v.on('click', '[data-bk-set]', el => { form[el.dataset.bkSet] = el.dataset.value; make(); });
  v.on('click', '[data-bk-theme]', el => { form.theme = el.dataset.bkTheme; make(); });
  v.root.addEventListener('change', e => { const f = e.target.dataset?.bkField; if (f && form) form[f] = f === 'title' ? e.target.value : Math.max(0, Number(e.target.value) || 0); });
  v.root.addEventListener('input', e => { if (e.target.dataset?.bkField === 'title' && form) form.title = e.target.value; });
  ctx.doc.addEventListener('keydown', e => {
    if (view !== 'read' || v.disposed || ctx.visible?.('picbook') === false || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowLeft') go(at - 1); else if (e.key === 'ArrowRight') go(at + 1);
  }, {signal: keys.signal});
  v.back = () => { if (view === 'shelf') return false; if (view === 'making') { if (job) job.stop = true; return true; } stopReading(); shelf(); return true; };
  v.leave = () => stopReading();
  v.refresh = () => { if (view === 'shelf') shelf(); };
  const dispose = v.dispose;
  v.dispose = () => { stopReading(); keys.abort(); if (job) job.stop = true; for (const u of photoUrls.values()) ctx.win.URL.revokeObjectURL(u); dispose(); };
  shelf();
  return v;
}

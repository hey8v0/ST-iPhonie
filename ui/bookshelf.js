// 书架 (0.9.48; 0.9.49 shelves and categories; 0.9.52 the feel of a real bookshelf): books standing on wooden planks with
// their boards and side rails, a 继续读 card that also says how long you read today, multi-select for putting several in
// a category or taking them off at once, paper-like page turns, 书摘 (a held paragraph can be marked) and the character's
// notes tucked in between the paragraphs like little handwritten slips of paper — the words make room, so nothing is
// covered. Comics are read in the album's viewer (a swipe down opens 目录 instead of leaving).
import {createView, esc, heading, btn, empty, menu, field, select, input, toggle, size} from './common.js';
import {icon} from './icons.js';
import {openBook, bookImports, readerDefaults, annotationDue, naturalCompare, seriesOf, effectOf,
  normalizeStats, addReadingTime, todaySeconds, weekSeconds, readingLeft, span,
  normalizeHighlights, toggleHighlight, highlighted, normalizeAnnotations} from '../core/bookshelf.js';
import {readingSend} from '../core/reading-chat.js';
import {currentDm} from '../core/chats.js';
import {openAlbum} from './album-viewer.js';
import {popAt} from './msg-pop.js';

const ALL = '', RECENT = '\u0001recent', LOOSE = '\u0001loose';
const IDLE = 120000;   // not reading any more after two minutes without a touch (0.9.52)

export function bookshelfApp(ctx) {
  const {api, win, doc} = ctx, v = createView(ctx, 'bookshelf');
  let books = [], book = null, reader = null, chapter = null, page = 0, pages = 1, epoch = 0, album = null, busy = false, noteBusy = false, resize = null;
  let stage = null, filter = ALL, importing = null;
  let picking = null, mark = new Set();              // 多选
  let session = null, activeAt = 0;                  // reading time (0.9.52)
  const urls = new Set(), covers = new Map();
  const url = blob => { const u = win.URL.createObjectURL(blob); urls.add(u); return u; };
  const clearURLs = () => { for (const u of urls) win.URL.revokeObjectURL(u); urls.clear(); covers.clear(); };
  const fail = error => ctx.notify(error.message, {error: true});
  const progress = b => Math.round(((b.position?.chapter || 0) + (b.position?.fraction || 0)) / Math.max(1, b.chapters.length) * 100);
  const $ = sel => (stage || v.root).querySelector(sel);
  function leave() {
    const stats = book ? flushRead() : null;
    if (stats && book) api.updateReadingBook(book.id, {stats}).catch(() => {});
    epoch++; resize?.disconnect(); resize = null;
    const a = album; album = null; a?.close();
    stage?.remove(); stage = null;
    reader = null; chapter = null; clearURLs();
  }

  // ---------- the shelf ----------
  const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
  // Books differ a little in height and thickness, but always the same way for the same book: a shelf of one size looks fake.
  const shape = b => { let h = 0; for (const c of String(b.id)) h = (h * 17 + c.codePointAt(0)) % 100; return {'--tall': String(h % 3), '--thick': String(h % 4)}; };
  const styleOf = b => Object.entries(shape(b)).map(([k, x]) => `${k}:${x}`).join(';');
  const coverHTML = b => `<button type="button" class="bs-book${b.type === 'comic' ? ' comic' : ''}${mark.has(b.id) ? ' picked' : ''}" data-read="${esc(b.id)}" style="--book-hue:${hue(b.title)};${styleOf(b)}" aria-label="${picking ? '选择' : '打开'}《${esc(b.title)}》"${picking ? ` aria-pressed="${mark.has(b.id)}"` : ''}><span class="bs-face"><span class="bs-title">${esc(b.title)}</span><small>${esc(b.author || (b.type === 'comic' ? '漫画' : '小说'))}</small></span>${progress(b) ? `<i class="bs-progress" style="--p:${progress(b)}%"></i>` : ''}${picking ? '<span class="bs-tick" aria-hidden="true"></span>' : ''}</button>`;
  const labelHTML = b => `<div class="bs-label"><span><strong>${esc(b.title)}</strong><small>${progress(b) ? `读到 ${progress(b)}%` : '还没开始'}${b.companion ? ' · 和' + esc(b.companion) : ''}</small></span>${picking ? '' : `<button type="button" data-more="${esc(b.id)}" aria-label="《${esc(b.title)}》的菜单">${icon('more')}</button>`}</div>`;
  function shelvesHTML(list) {
    const rows = [];
    for (let i = 0; i < list.length; i += 3) rows.push(list.slice(i, i + 3));
    return rows.map(r => `<div class="bs-shelf"><div class="bs-row">${r.map(coverHTML).join('')}</div><div class="bs-plank" aria-hidden="true"></div><div class="bs-labels">${r.map(labelHTML).join('')}</div></div>`).join('');
  }
  const categories = () => [...new Set(books.map(b => b.shelf).filter(Boolean))].sort(naturalCompare);
  function inView() {
    if (filter === RECENT) return books.filter(b => b.lastRead).sort((a, b) => b.lastRead - a.lastRead);
    const list = filter === ALL ? books : filter === LOOSE ? books.filter(b => !b.shelf) : books.filter(b => b.shelf === filter);
    return list.slice().sort((a, b) => naturalCompare(a.shelf || '\uffff', b.shelf || '\uffff') || naturalCompare(a.title, b.title));
  }
  async function shelf() {
    leave(); book = null;
    books = await api.listReadingBooks(); if (v.disposed) return;
    const cats = categories(), last = books.filter(b => b.lastRead).sort((a, b) => b.lastRead - a.lastRead)[0];
    if (filter !== ALL && filter !== RECENT && filter !== LOOSE && !cats.includes(filter)) filter = ALL;
    if (picking === 'pick' && mark.size) { mark = new Set([...mark].filter(id => books.some(b => b.id === id))); if (!mark.size) picking = null; }
    const chips = books.length ? `<div class="filter-row bs-chips" role="group" aria-label="分类">${[[ALL, `全部 <small>${books.length}</small>`], ...(last ? [[RECENT, '最近在读']] : []), ...cats.map(c => [c, `${esc(c)} <small>${books.filter(b => b.shelf === c).length}</small>`]), ...(cats.length && books.some(b => !b.shelf) ? [[LOOSE, '未分类']] : [])].map(([k, label]) => `<button type="button" data-shelf="${esc(k)}" aria-pressed="${filter === k}">${label}</button>`).join('')}</div>` : '';
    const today = last ? todaySeconds(last.stats) : 0;
    const left = last ? readingLeft(last, last.stats) : null;
    const going = last && filter === ALL && !picking ? `<button type="button" class="bs-continue" data-read="${esc(last.id)}"><span class="bs-mini" style="--book-hue:${hue(last.title)}" data-cover="${esc(last.id)}"></span><span class="bs-go"><small>继续读</small><strong>${esc(last.title)}</strong><small>${esc(last.chapters[last.position?.chapter || 0]?.title || '')} · ${progress(last)}%${left ? ` · 还剩约 ${span(left)}` : ''}</small></span>${icon('next')}</button>${today ? `<p class="bs-today">今天在这本书上读了 ${span(today)}</p>` : ''}` : '';
    const head = heading('书架', picking ? btn('pick-done', '完成', 'text-button') : (books.length ? btn('pick-start', icon('check') + '多选', 'text-button') + btn('import', icon('add') + '导入', 'text-button') : btn('import', icon('add') + '导入', 'text-button')));
    v.draw(head + (books.length ? chips + going + `<div class="bs-shelves">${shelvesHTML(inView())}</div>` : empty('书架还是空的', '导入 EPUB 漫画、小说或 TXT，一次可以选很多本，也可以选一个装着书的 ZIP。', 'book'))
      + (picking ? `<div class="bs-pickbar"><span>${mark.size ? `选了 ${mark.size} 本` : '点书选择'}</span><div>${btn('pick-shelf', icon('layers') + '放进分类', 'chip-button', mark.size ? '' : 'disabled')}${btn('pick-delete', icon('trash') + '删除', 'chip-button danger', mark.size ? '' : 'disabled')}</div></div>` : ''));
    for (const b of inView()) {
      if (!covers.has(b.id)) { const f = await api.readingBookFile(b.id).catch(() => null); if (!f?.cover) continue; covers.set(b.id, url(f.cover)); }
      for (const el of v.root.querySelectorAll(`[data-read="${CSS.escape(b.id)}"] .bs-face, [data-cover="${CSS.escape(b.id)}"]`)) { el.style.backgroundImage = `url("${covers.get(b.id)}")`; el.classList.add('pic'); }
    }
  }
  async function pickCompanion(target) {
    const contacts = api.chatContacts();
    const key = await menu(ctx, '和谁一起看', [{key: '-', label: '自己看'}, ...contacts.map(c => ({key: c.name, label: c.name}))]);
    if (!key) return;
    const result = await api.updateReadingBook(target.id, {companion: key === '-' ? '' : key});
    if (book?.id === target.id) book = result; else await shelf();
  }
  /** Asks for a category name (an existing one, a new one, or none) — returns {shelf} or null when the user backs out. */
  async function askShelf(current = '') {
    const cats = categories();
    const key = await menu(ctx, '放进分类', [...cats.map(c => ({key: 'c:' + c, label: c, note: c === current ? '现在在这里' : ''})), {key: 'new', label: '新建分类', icon: 'add'}, ...(current ? [{key: 'none', label: '不分类', icon: 'close'}] : [])]);
    if (!key) return null;
    if (key === 'none') return {shelf: ''};
    if (!key.startsWith('c:')) {
      const suggested = seriesOf(current) || '';
      const d = ctx.dialog('新建分类', `${field('分类名', input('shelf-name', suggested, 'text', 'maxlength="20" placeholder="比如：黑执事、轻小说"'))}<div class="actions">${btn('shelf-ok', '好', 'primary')}</div>`);
      const name = await new Promise(resolve => {
        d.onClose(() => resolve(''));
        d.body.addEventListener('click', e => { if (!e.target.closest('[data-action=shelf-ok]')) return; const value = d.body.querySelector('[data-field=shelf-name]').value.trim(); resolve(value); d.close(); });
      });
      return name ? {shelf: name} : null;
    }
    return {shelf: key.slice(2)};
  }
  /** 多选 → 放进分类: the same category for every picked book. */
  async function shelfPicked() {
    const ids = [...mark]; if (!ids.length) return;
    const answer = await askShelf(ids.length === 1 ? (books.find(b => b.id === ids[0])?.shelf || '') : '');
    if (!answer) return;
    await api.updateReadingBooks?.(ids, {shelf: answer.shelf});
    picking = null; mark.clear(); await shelf();
    ctx.notify(answer.shelf ? `放进「${answer.shelf}」了` : '移出分类了');
  }
  async function deletePicked() {
    const ids = [...mark]; if (!ids.length) return;
    if (!await ctx.confirm(`删除这 ${ids.length} 本书？`, '书、进度、书签、书摘和页边批注会从这台设备移除，空间也会释放。')) return;
    const gone = await api.deleteReadingBooks?.(ids) ?? 0;
    picking = null; mark.clear(); await shelf();
    ctx.notify(`删掉了 ${gone} 本`);
  }
  async function more(id) {
    const b = await api.getReadingBook(id); if (!b) return;
    const key = await menu(ctx, b.title, [{key: 'shelf', label: '放进分类', icon: 'layers', note: b.shelf || '没分类'}, {key: 'companion', label: '和谁一起看', icon: 'chat', note: b.companion || '自己看'}, {key: 'info', label: '信息', icon: 'book'}, {key: 'stats', label: '阅读统计', icon: 'clock'}, {key: 'reset', label: '清除进度', icon: 'back'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}]);
    if (key === 'info') {
      const left = readingLeft(b, b.stats);
      ctx.dialog('书籍信息', `<p><strong>${esc(b.title)}</strong></p><p>${esc(b.author || '作者未注明')} · ${b.type === 'comic' ? '漫画' : '小说'} · ${b.chapters.length} ${b.type === 'comic' ? '页' : '节'} · ${size(b.size)}</p>${normalizeStats(b.stats).sec ? `<p>一共读了 ${span(normalizeStats(b.stats).sec)}${left ? `，按这个速度还剩约 ${span(left)}` : ''}。</p>` : ''}<p class="hint">导入时复制了一份存在这台设备的浏览器里，占 ${size(b.size)}；原文件不会被改动，删掉这本书就释放空间。</p>`);
    }
    if (key === 'shelf') { const answer = await askShelf(b.shelf || ''); if (answer) { await api.updateReadingBook(id, {shelf: answer.shelf}); await shelf(); } }
    if (key === 'stats') await statsSheet(b);
    if (key === 'companion') await pickCompanion(b);
    if (key === 'reset') { await api.updateReadingBook(id, {position: {chapter: 0, fraction: 0}}); await shelf(); }
    if (key === 'delete' && await ctx.confirm('删除这本书？', '书籍、进度、书签、书摘和页边批注会从这台设备移除。')) { await api.deleteReadingBook(id); await shelf(); }
  }
  /** 阅读统计 (0.9.52): the last seven days, the total, and how long this book still takes. Reached from 书的「⋯」. */
  async function statsSheet(b) {
    const stats = normalizeStats(b.stats), week = weekSeconds(stats), most = Math.max(1, ...week.map(d => d.sec)), left = readingLeft(b, stats);
    const labels = ['日', '一', '二', '三', '四', '五', '六'];
    ctx.dialog('阅读统计', `<p class="bs-stat-line"><strong>${span(stats.sec) || '还没有记录'}</strong>${stats.sec ? ' 一共读了这么久' : ''}</p>
      ${week.some(d => d.sec) ? `<div class="bs-chart" role="img" aria-label="最近七天的阅读时间">${week.map(d => `<span class="bs-bar-w"><i style="--h:${Math.round(d.sec / most * 100)}%"></i><small>${labels[new Date(d.day + 'T00:00:00').getDay()]}</small></span>`).join('')}</div>` : ''}
      <p class="hint">${left ? `按你现在的速度，这本书还要约 ${span(left)} 读完。` : '读满一会儿就能算出这本书还要多久。'}</p>
      <p class="hint">只看正在翻页或滚动的时间，停下两分钟就不算了。清除进度不会清掉这里。</p>`);
  }

  // ---------- import ----------
  function importFiles() {
    if (importing) { importing.show(); return; }
    const pick = doc.createElement('input'); pick.type = 'file'; pick.multiple = true; pick.accept = '.epub,.txt,.zip';
    pick.onchange = () => runImport([...pick.files]).catch(fail);
    pick.click();
  }
  async function runImport(files) {
    const items = (await bookImports(files)).sort((a, b) => naturalCompare(a.name, b.name));
    if (!items.length) { ctx.notify('没有找到 EPUB 或 TXT'); return; }
    const series = new Map();
    for (const it of items) { const s = seriesOf(it.name); if (s) series.set(s, (series.get(s) || 0) + 1); }
    const state = {done: 0, total: items.length, now: '', errors: [], sheet: null};
    const paint = () => {
      const d = state.sheet; if (!d?.live) return;
      d.body.innerHTML = `<div class="bs-import"><p>${state.done < state.total ? `正在导入第 ${state.done + 1} 本，共 ${state.total} 本` : `导入完了：${state.total - state.errors.length} 本`}</p><strong>${esc(state.now)}</strong><div class="bs-bar"><i style="width:${Math.round(state.done / state.total * 100)}%"></i></div><small class="hint">可以先关掉这页，导入会在后台继续；大的漫画每本要几十秒（要把整本复制进这台设备）。</small>${state.errors.length ? `<p class="hint">没导入的：<br>${state.errors.map(esc).join('<br>')}</p>` : ''}</div>`;
    };
    importing = {show() { state.sheet = ctx.dialog('导入书', ''); paint(); }};
    importing.show();
    for (const item of items) {
      state.now = item.name; paint();
      try {
        const blob = await item.open(), b = await openBook(blob, item.name, win.DOMParser), s = seriesOf(item.name);
        await api.addReadingBook({name: item.name, title: b.title, author: b.author, type: b.type, chapters: b.chapters.map(c => ({title: c.title})), ...(s && series.get(s) > 1 ? {shelf: s} : {})}, blob, b.cover ? await b.image(b.cover) : null);
      } catch (e) { state.errors.push(item.name + '：' + e.message); }
      state.done++; paint();
      await new Promise(resolve => win.setTimeout(resolve, 0));
    }
    importing = null;
    if (!state.sheet?.live) ctx.notify(`导入了 ${state.total - state.errors.length} 本书${state.errors.length ? `，${state.errors.length} 本没导入` : ''}`);
    if (!book) await shelf();
  }

  // ---------- reading time ----------
  const overall = () => book ? (Math.min(book.position?.chapter || 0, book.chapters.length - 1) + (book.position?.fraction || 0)) / Math.max(1, book.chapters.length) : 0;
  const stillReading = () => Date.now() - activeAt < IDLE;
  /** Writes what has been read since the last save: seconds actually reading, and how much further the book went. */
  function flushRead() {
    if (!book || !session) { session = null; return null; }
    const from = Math.min(Date.now(), Math.max(activeAt, session.at)), sec = Math.round((from - session.at) / 1000), delta = overall() - session.overall;
    session = {at: Date.now(), overall: overall()};
    if (sec < 5 && delta <= 0) return null;
    book.stats = addReadingTime(book.stats, sec, {progress: Math.max(0, delta)});
    return book.stats;
  }

  // ---------- reading ----------
  function settings() {
    const s = book.settings, effect = effectOf(s.effect);
    const d = ctx.dialog('阅读设置', field('翻阅方式', select('mode', s.mode, [['pages', '左右翻页'], ['scroll', '上下滚动']]))
      + (s.mode === 'pages' && book.type !== 'comic' ? field('翻页效果', select('effect', effect, [['page', '仿真翻页'], ['slide', '平滑滑动'], ['none', '直接翻页']])) : '')
      + (book.type === 'comic' ? toggle('rtl', '从右往左翻', s.rtl) : field('字号', input('size', s.size, 'range', 'min="14" max="30" step="1"')) + field('行距', input('line', s.line, 'range', 'min="1.3" max="2.6" step="0.1"')) + field('页边距', input('margin', s.margin, 'range', 'min="12" max="40" step="2"')) + field('字体', select('font', s.font, [['serif', '衬线'], ['sans-serif', '无衬线']])))
      + field('纸张', select('theme', s.theme, [['auto', '跟随手机'], ['white', '白纸'], ['cream', '米黄'], ['green', '护眼绿'], ['night', '夜间']]))
      + toggle('annotations', '页边批注', s.annotations));
    d.body.addEventListener('change', async e => {
      const key = e.target.dataset.field; if (!key) return;
      const value = e.target.type === 'checkbox' ? e.target.checked : ['size', 'line', 'margin'].includes(key) ? Number(e.target.value) : e.target.value;
      book = await api.updateReadingBook(book.id, {settings: {...book.settings, [key]: value}});
    });
    d.onClose(() => { if (book && reader) showChapter(book.position.chapter, book.position.fraction).catch(fail); });
  }
  /** 目录、书签和书摘 in one sheet with three tabs (0.9.52). */
  async function contents(start = 'toc') {
    let tab = start;
    const d = ctx.dialog('目录与书签', '');
    const paint = () => {
      if (!d.live) return;
      const marks = book.bookmarks || [], picks = normalizeHighlights(book.highlights);
      const tabs = `<div class="segmented bs-tabs">${[['toc', `目录`], ['marks', `书签${marks.length ? ` ${marks.length}` : ''}`], ['picks', `书摘${picks.length ? ` ${picks.length}` : ''}`]].map(([k, t]) => `<button type="button" data-btab="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>`;
      const body = tab === 'marks' ? (marks.length ? marks.map((m, i) => `<button class="bs-row-link" data-mark="${i}"><strong>${esc(book.chapters[m.chapter]?.title || '')}</strong><small>${Math.round((m.fraction || 0) * 100)}%</small></button>`).join('') : '<p class="hint">还没有书签。看的时候点下面中间的「书签」。</p>')
        : tab === 'picks' ? (picks.length ? picks.map(h => `<div class="bs-pick"><button type="button" class="bs-pick-go" data-pick="${esc(h.id)}"><strong>${esc(book.chapters[h.chapter]?.title || '')}</strong><p>${esc(h.text)}</p></button><div class="bs-pick-acts">${btn('pick-send', icon('chat'), 'round-button', `data-id="${esc(h.id)}" aria-label="发给 TA"`)}${btn('pick-del', icon('trash'), 'round-button', `data-id="${esc(h.id)}" aria-label="删掉这段书摘"`)}</div></div>`).join('') : '<p class="hint">长按一段文字，选「划线」就收进这里。</p>')
          : `<div class="reading-toc">${book.bookmarks.length ? '' : ''}${book.chapters.map((c, i) => `<button data-chapter="${i}" ${i === book.position.chapter ? 'aria-current="true"' : ''}>${esc(c.title)}</button>`).join('')}</div>`;
      d.body.innerHTML = tabs + body;
      d.body.querySelector('[aria-current=true]')?.scrollIntoView?.({block: 'center'});
    };
    paint();
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.btab) { tab = b.dataset.btab; paint(); return; }
      if (b.dataset.pick) { const h = normalizeHighlights(book.highlights).find(x => x.id === b.dataset.pick); d.close(); if (h) showChapter(h.chapter, 0).then(() => content?.querySelector(`[data-para="${h.para}"]`)?.scrollIntoView?.({block: 'center'})).catch(fail); return; }
      if (b.dataset.action === 'pick-del') { await api.updateReadingBook(book.id, {highlights: normalizeHighlights(book.highlights).filter(x => x.id !== b.dataset.id)}); book = await api.getReadingBook(book.id); paint(); return; }
      if (b.dataset.action === 'pick-send') { const h = normalizeHighlights(book.highlights).find(x => x.id === b.dataset.id); d.close(); if (h) chatPanel(h.text); return; }
      const m = b.dataset.mark !== undefined ? book.bookmarks[Number(b.dataset.mark)] : b.dataset.chapter !== undefined ? {chapter: Number(b.dataset.chapter), fraction: 0} : null;
      if (!m) return;
      d.close(); showChapter(m.chapter, m.fraction).catch(fail);
    });
    return d;
  }
  /** The paragraph in the middle of the page being read (what a note is about, and where a held paragraph was). */
  function visiblePara() {
    const pane = $('.reading-page'); if (!pane) return 0;
    const top = pane.getBoundingClientRect().top + 6;
    for (const [i, el] of (blocks.length ? blocks : [...(content?.children || [])]).entries()) if (el.getBoundingClientRect().bottom > top) return i;
    return 0;
  }
  let content = null, blocks = [];   // blocks: the paragraphs by their data-para, before any note is put in
  function visible() {
    const pane = $('.reading-page'), text = [];
    if (pane && content && book.type !== 'comic') {
      const r = pane.getBoundingClientRect(), walker = doc.createTreeWalker(content, 4), range = doc.createRange();
      for (let node = walker.nextNode(), used = 0; node && used < 2200; node = walker.nextNode()) {
        const len = node.textContent.length;
        const coord = i => { range.setStart(node, i); range.setEnd(node, Math.min(len, i + 1)); const b = range.getBoundingClientRect(); return book.settings.mode === 'scroll' ? b.top : b.left; };
        const low = book.settings.mode === 'scroll' ? r.top : r.left, high = book.settings.mode === 'scroll' ? r.bottom : r.right;
        const search = target => { let a = 0, b = len; while (a < b) { const mid = (a + b) >> 1; if (coord(mid) < target) a = mid + 1; else b = mid; } return a; };
        if (len && typeof range.getBoundingClientRect === 'function') { const bit = node.textContent.slice(search(low), search(high)); text.push(bit); used += bit.length; }
      }
    }
    return {chapter: book.position.chapter, para: visiblePara(), page: page + 1, text: text.join('\n').trim().slice(0, 2200)};
  }
  async function savePosition(fraction, turn = false) {
    if (!book) return;
    activeAt = Date.now();
    const id = book.id, p = {...book.position, fraction};
    book.position = p; if (turn) book.turns = (book.turns || 0) + 1;
    const stats = turn ? flushRead() : null;
    const saved = await api.updateReadingBook(id, {position: p, turns: book.turns, lastRead: Date.now(), ...(stats ? {stats} : {})});
    if (book?.id !== id || book.position.chapter !== p.chapter || book.position.fraction !== p.fraction) return;
    book = {...book, ...saved};
    const label = $('[data-reading-count]'); if (label) label.textContent = `${book.chapters[p.chapter]?.title || ''} · ${page + 1}/${pages}`;
    const slider = $('[data-reading-progress]'); if (slider) slider.value = ((p.chapter + p.fraction) / book.chapters.length) * 100;
    const folio = $('[data-folio-page]'); if (folio) folio.textContent = book.settings.mode === 'pages' ? `${page + 1} / ${pages}` : `${Math.round(p.fraction * 100)}%`;
    if (turn) { showNotes(); maybeNote().catch(fail); }
  }
  /** The character's notes, tucked in after the paragraph each one is about: the words make room, nothing is covered. */
  function showNotes() {
    if (!content) return;
    for (const old of content.parentElement?.querySelectorAll('.reading-note-inline') || []) old.remove();
    if (book.settings.annotations === false) return;
    const notes = normalizeAnnotations(book.annotations).filter(n => n.chapter === book.position.chapter);
    for (const n of notes) {
      const el = doc.createElement('aside');
      el.className = 'reading-note-inline';
      el.innerHTML = `<small>${esc(n.who || book.companion || '')}</small><p>${esc(n.text)}</p>`;
      el.addEventListener('click', () => chatPanel());
      const target = blocks[Math.min(n.para, Math.max(0, blocks.length - 1))];
      if (target) target.after(el); else content.append(el);
    }
  }
  async function send(text, quote = '', annotation = false) {
    if (!book.companion) { await pickCompanion(book); if (!book.companion) return; }
    const target = book, view = visible(); if (quote) view.text = quote.slice(0, 2200);
    const blob = book.type === 'comic' && chapter?.images[0] ? await reader.image(chapter.images[0]) : null;
    return readingSend(api, target, view, text, {blob, annotation});
  }
  async function maybeNote() {
    if (busy || noteBusy || !annotationDue(book)) return;
    noteBusy = true;
    const target = book, view = visible(), source = reader, image = chapter?.images[0], day = new Date().toLocaleDateString('sv-SE');
    try {
      const reserved = await api.updateReadingBook(target.id, {nextNote: (target.turns || 0) + 6 + Math.floor(Math.random() * 5), daily: {day, count: (target.daily?.day === day ? target.daily.count : 0) + 1}});
      if (book?.id !== target.id) return;
      book = {...book, nextNote: reserved.nextNote, daily: reserved.daily};
      const blob = target.type === 'comic' && image ? await source.image(image) : null;
      if (book?.id !== target.id) return;
      const result = await readingSend(api, target, view, '这一页你有什么感想？', {blob, annotation: true}), text = result?.messages.filter(m => m.from === target.companion && m.kind === 'text').at(-1)?.text;
      if (text) {
        const current = await api.getReadingBook(target.id); if (!current) return;
        const note = {chapter: view.chapter, para: view.para, text: text.slice(0, 120), who: target.companion, at: Date.now()};
        const saved = await api.updateReadingBook(target.id, {annotations: normalizeAnnotations([...(current.annotations || []), note])});
        if (book?.id === target.id) { book = saved; showNotes(); }
      }
    } finally { noteBusy = false; }
  }
  async function chatPanel(quote = '') {
    if (!book?.companion) { await pickCompanion(book); if (!book?.companion) return; }
    const target = book, d = ctx.dialog('和' + target.companion + '一起看', `<div class="reading-chat"></div>${quote ? `<blockquote>${esc(quote.slice(0, 200))}</blockquote>` : ''}<form class="reading-compose"><input type="text" aria-label="聊聊这一页" placeholder="聊聊这一页…" maxlength="3000" enterkeyhint="send"><button type="submit" class="primary">发送</button></form>`, {over: true});
    const list = d.body.querySelector('.reading-chat'), box = d.body.querySelector('input'), form = d.body.querySelector('form');
    const draw = t => { list.innerHTML = (t?.messages || []).filter(m => ['text', 'voice', 'photo'].includes(m.kind)).slice(-20).map(m => `<div class="reading-msg${m.from === 'me' ? ' reading-mine' : ''}"><small>${esc(m.from === 'me' ? '我' : m.from)}</small>${m.quote ? `<blockquote>${esc(m.quote.text)}</blockquote>` : ''}<span>${esc(m.text || '图片')}</span></div>`).join(''); list.scrollTop = list.scrollHeight; };
    const t = currentDm(await api.listThreads(), target.companion); if (t) draw(await api.getThread(t.id));
    form.onsubmit = async e => { e.preventDefault(); if (busy || !box.value.trim()) return; busy = true; const value = box.value; box.value = ''; form.querySelector('button').disabled = true; try { draw(await send(value, quote)); quote = ''; } catch (error) { box.value = value; fail(error); } finally { busy = false; form.querySelector('button').disabled = false; } };
    if (quote) box.value = '这段你怎么看？';
  }
  async function bookmark() {
    const p = {...book.position}, marks = book.bookmarks || [], found = marks.findIndex(m => m.chapter === p.chapter && Math.abs(m.fraction - p.fraction) < .01);
    book = await api.updateReadingBook(book.id, {bookmarks: found < 0 ? [...marks, p].slice(-200) : marks.filter((_, i) => i !== found)}); ctx.notify(found < 0 ? '已加书签' : '已移除书签');
  }
  /** A paragraph held for half a second: it lights up and our own little menu opens (发给 TA, 划线, 复制) — not the system's. */
  function paragraphMenu(el, index) {
    const text = el.textContent.trim();
    if (!text) return;
    const marked = highlighted(book.highlights, book.position.chapter, index);
    el.classList.add('reading-picked');
    const d = ctx.dialog('这一段', `<div class="mp-grid">${[['para-send', 'chat', '发给 TA'], ['para-mark', 'star', marked ? '取消划线' : '划线'], ['para-copy', 'copy', '复制']].map(([k, g, l]) => `<button type="button" class="mp-item" data-action="${k}"><span class="mp-ico">${icon(g)}</span><span class="mp-label">${l}</span></button>`).join('')}</div>`);
    d.overlay.querySelector('.mp-grid').style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))';
    popAt(d, el, {win, reduced: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
    d.onClose(() => el.classList.remove('reading-picked'));
    d.body.addEventListener('click', async e => {
      const k = e.target.closest('[data-action]')?.dataset.action;
      if (k === 'para-send') { d.close(); chatPanel(text); }
      if (k === 'para-mark') {
        d.close();
        const list = toggleHighlight(book.highlights, {chapter: book.position.chapter, para: index, text});
        book = await api.updateReadingBook(book.id, {highlights: list});
        paintMarks(); ctx.notify(list.length > normalizeHighlights(book.highlights).length || list.some(h => h.para === index) ? '收进书摘了' : '取消划线了');
      }
      if (k === 'para-copy') { d.close(); try { await win.navigator.clipboard.writeText(text); ctx.notify('已复制'); } catch { ctx.notify('这个浏览器不让复制', {error: true}); } }
    });
  }
  /** The picked paragraphs get a soft underline under their words. */
  function paintMarks() {
    if (!content) return;
    const picks = normalizeHighlights(book.highlights).filter(h => h.chapter === book.position.chapter);
    for (const el of blocks) el.classList.remove('reading-mark');
    for (const h of picks) blocks[h.para]?.classList.add('reading-mark');
  }
  const STAGE_ACTIONS = {shelf: () => shelf().catch(fail), settings: () => settings(), toc: () => contents(), bookmark: () => bookmark().catch(fail), chat: () => chatPanel()};
  function openStage(html) {
    if (!stage) {
      stage = doc.createElement('section');
      stage.className = 'reading-stage';
      (v.root.closest('.screen') || v.root).append(stage);
      stage.addEventListener('click', e => { const a = e.target.closest('[data-action]')?.dataset.action; if (a && STAGE_ACTIONS[a]) STAGE_ACTIONS[a](); });
      stage.addEventListener('change', e => { if (e.target.matches('[data-reading-progress]')) { const p = Number(e.target.value) / 100 * book.chapters.length; showChapter(Math.min(book.chapters.length - 1, Math.floor(p)), p >= book.chapters.length ? 1 : p % 1).catch(fail); } });
    }
    stage.innerHTML = html;
  }
  /** 仿真翻页: a sheet of paper sweeps across with a soft shadow (a class for a moment; the layout never changes). */
  function turnFX(step) {
    const pane = $('.reading-page'); if (!pane || effectOf(book.settings.effect) !== 'page') return;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    pane.classList.remove('turn-next', 'turn-prev');
    void pane.offsetWidth;
    pane.classList.add(step > 0 ? 'turn-next' : 'turn-prev');
    win.setTimeout(() => pane.classList.remove('turn-next', 'turn-prev'), 420);
  }
  async function showChapter(index, fraction = 0, didTurn = false) {
    if (!reader || index < 0 || index >= book.chapters.length) return;
    const token = ++epoch, a = album; album = null; a?.close(); resize?.disconnect(); clearURLs();
    book.position = {chapter: index, fraction}; chapter = await reader.chapter(index); if (token !== epoch) return;
    if (book.type === 'comic' && book.settings.mode === 'pages') { stage?.remove(); stage = null; await comic(index); return; }
    const s = book.settings, hidden = stage?.querySelector('.reading-reader')?.classList.contains('reading-hidden');
    openStage(`<section class="reading-reader${hidden ? ' reading-hidden' : ''}" data-paper="${esc(s.theme)}" data-mode="${esc(s.mode)}" data-effect="${esc(effectOf(s.effect))}" style="--read-size:${s.size}px;--read-line:${s.line};--read-margin:${s.margin}px;--read-font:${s.font}"><header class="reading-bar"><button data-action="shelf" aria-label="返回书架">${icon('back')}</button><span>${esc(book.title)}</span><button data-action="settings" aria-label="阅读设置">${icon('settings')}</button></header><div class="reading-page" tabindex="0"><article class="reading-content">${chapter.html}</article></div><div class="reading-folio" aria-hidden="true"><span data-folio-title>${esc(book.chapters[index]?.title || '')}</span><span data-folio-page></span></div><footer class="reading-bottom"><small data-reading-count></small><input aria-label="阅读进度" data-reading-progress type="range" min="0" max="100" step="0.01"><nav><button data-action="toc">${icon('book')}目录</button><button data-action="bookmark">${icon('star')}书签</button><button data-action="chat">${icon('chat')}一起看</button></nav></footer></section>`);
    const pane = $('.reading-page'); content = $('.reading-content');
    // Each block gets its number: 书摘 and notes remember where they sit by it (0.9.52).
    blocks = [...content.children];
    blocks.forEach((el, i) => { el.dataset.para = String(i); });
    for (const img of content.querySelectorAll('[data-book-image]')) { const blob = await reader.image(img.dataset.bookImage); if (token !== epoch) return; if (blob) img.src = url(blob); }
    await new Promise(resolve => win.requestAnimationFrame(resolve)); if (token !== epoch) return;
    const layout = () => { if (token !== epoch) return; const f = book.position.fraction; content.style.width = pane.clientWidth + 'px'; pages = s.mode === 'pages' ? Math.max(1, Math.round(content.scrollWidth / Math.max(1, pane.clientWidth))) : 1; page = Math.round(f * (pages - 1)); if (s.mode === 'pages') content.style.transform = `translateX(${-page * pane.clientWidth}px)`; else pane.scrollTop = f * Math.max(0, pane.scrollHeight - pane.clientHeight); savePosition(f, didTurn).catch(fail); didTurn = false; };
    layout(); if (win.ResizeObserver) { resize = new win.ResizeObserver(layout); resize.observe(pane); }
    paintMarks(); showNotes();
    let start = null, swiped = false, hold = null, drag = 0;
    const paraAt = el => el.closest('.reading-content > *');
    pane.addEventListener('pointerdown', e => {
      activeAt = Date.now();
      start = {x: e.clientX, y: e.clientY}; swiped = false; drag = 0;
      win.clearTimeout(hold?.timer);
      const para = paraAt(e.target);
      hold = para && s.mode === 'pages' ? {timer: win.setTimeout(() => { const box = para; hold = null; swiped = true; paragraphMenu(box, Number(box.dataset.para)); }, 520)} : null;
    });
    pane.addEventListener('pointermove', e => {
      if (hold && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { win.clearTimeout(hold.timer); hold = null; }
      // 手指拖着时页跟着手走 (0.9.52), only where a page can turn and the finger goes sideways.
      if (!start || swiped || s.mode !== 'pages' || effectOf(s.effect) === 'none') return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 12) return;
      const at = (page <= 0 && dx > 0) || (page >= pages - 1 && dx < 0) ? dx * .22 : dx * .5;
      drag = at;
      content.style.transition = 'none';
      content.style.transform = `translateX(${-page * pane.clientWidth + at}px)`;
    });
    const endDrag = e => {
      if (hold) { win.clearTimeout(hold.timer); hold = null; }
      if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      content.style.transition = '';
      if (drag) { const kept = drag; drag = 0; content.style.transform = `translateX(${-page * pane.clientWidth}px)`; if (Math.abs(kept) > 40) { swiped = true; turn(kept < 0 ? 1 : -1).catch(fail); } return; }
      if (s.mode === 'pages' && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { swiped = true; turn(dx < 0 ? 1 : -1).catch(fail); }
      else if (s.mode === 'scroll' && Math.abs(dy) > 65) { swiped = true; if (dy < 0 && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 2) turn(1).catch(fail); else if (dy > 0 && pane.scrollTop <= 1) turn(-1).catch(fail); }
      else if (dy < -65 && Math.abs(dy) > Math.abs(dx)) { swiped = true; chatPanel(); }
    };
    pane.addEventListener('pointerup', endDrag);
    pane.addEventListener('pointercancel', endDrag);
    pane.addEventListener('contextmenu', e => e.preventDefault());
    pane.addEventListener('click', e => {
      activeAt = Date.now();
      if (swiped) return;
      const r = pane.getBoundingClientRect(), x = e.clientX - r.left;
      if (s.mode === 'pages' && (x < r.width * .22 || x > r.width * .78)) turn(x < r.width * .22 ? -1 : 1);
      else $('.reading-reader').classList.toggle('reading-hidden');
    });
    pane.addEventListener('keyup', e => { if (e.key === 'ArrowRight') turn(1); if (e.key === 'ArrowLeft') turn(-1); });
    let timer = 0;
    pane.addEventListener('scroll', () => { activeAt = Date.now(); if (s.mode !== 'scroll') return; win.clearTimeout(timer); timer = win.setTimeout(() => { if (token !== epoch) return; savePosition(pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight), true).catch(fail); }, 180); });
    pane.addEventListener('wheel', e => { if (s.mode === 'scroll' && e.deltaY > 0 && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 2) turn(1); });
    if (!session) session = {at: Date.now(), overall: overall()};
    activeAt = Date.now();
  }
  async function comic(index) {
    const owner = book.id, ids = book.chapters.map((_, i) => String(i)); if (book.settings.rtl) ids.reverse();
    album = openAlbum({ctx, host: v.root.closest('.screen') || v.root, ids, index: ids.indexOf(String(index)), preload: true,
      load: async id => { const c = await reader.chapter(Number(id)), blob = await reader.image(c.images[0]); return blob ? {blob, name: book.chapters[Number(id)].title} : null; },
      onPage: id => { const n = Number(id); activeAt = Date.now(); book.position = {chapter: n, fraction: 0}; page = n; pages = book.chapters.length; reader.chapter(n).then(c => { if (book?.id !== owner) return; chapter = c; savePosition(0, true).catch(fail); }); },
      onPullDown: () => contents(),
      onHold: () => chatPanel('这一页漫画'), onClose: () => { if (album) { album = null; if (book?.settings.mode === 'scroll') showChapter(book.position.chapter, book.position.fraction).catch(fail); else shelf().catch(fail); } },
      actions: [{key: 'toc', icon: 'book', label: '目录', run: contents}, {key: 'bookmark', icon: 'star', label: '书签', run: bookmark}, {key: 'chat', icon: 'chat', label: '一起看', run: () => chatPanel()}, {key: 'settings', icon: 'settings', label: '设置', run: settings}]});
    album.root.setAttribute('aria-label', book.title); album.root.querySelector('[data-av=close]').setAttribute('aria-label', '返回书架');
    const slider = doc.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(book.chapters.length - 1); slider.value = String(index); slider.setAttribute('aria-label', '漫画进度'); slider.className = 'reading-comic-progress'; slider.onchange = () => showChapter(Number(slider.value)).catch(fail); album.root.querySelector('.album-bar').before(slider); showNotes();
  }
  async function turn(step) {
    if (!book) return;
    activeAt = Date.now();
    if (book.settings.mode === 'pages' && book.type !== 'comic' && page + step >= 0 && page + step < pages) {
      turnFX(step);
      page += step;
      const pane = $('.reading-page'), style = effectOf(book.settings.effect);
      content.style.transition = style === 'none' ? 'none' : style === 'page' ? 'transform .3s cubic-bezier(.3,.9,.3,1)' : 'transform .32s ease';
      content.style.transform = `translateX(${-page * pane.clientWidth}px)`;
      await savePosition(page / Math.max(1, pages - 1), true);
    } else await showChapter(book.position.chapter + step, step < 0 ? 1 : 0, true);
  }
  async function comicPages(token) {
    const rows = [], total = book.chapters.length;
    const note = ctx.dialog('第一次打开', `<div class="bs-import"><p>正在整理这本漫画的页……</p><div class="bs-bar"><i style="width:0%"></i></div></div>`);
    try {
      for (let i = 0; i < total; i++) {
        const c = await reader.chapter(i); if (token !== epoch) return null;
        for (const image of c.images) rows.push({title: book.chapters[i].title, source: i, image});
        if (i % 8 === 0) { const bar = note.body.querySelector('.bs-bar i'); if (bar) bar.style.width = Math.round(i / total * 100) + '%'; await new Promise(resolve => win.setTimeout(resolve, 0)); }
      }
    } finally { note.close(); }
    if (!rows.length) throw Error('这本漫画没有可显示的图片');
    return (await api.updateReadingBook(book.id, {chapters: rows, position: {chapter: 0, fraction: 0}})).chapters;
  }
  async function open(id) {
    leave(); const token = epoch, next = await api.getReadingBook(id); if (token !== epoch) return; book = next; if (!book) return shelf();
    book.settings = {...readerDefaults, ...book.settings}; book.stats = normalizeStats(book.stats);
    book = {...book, ...(await api.updateReadingBook(id, {settings: book.settings}))}; if (token !== epoch) return;
    book.highlights = normalizeHighlights(book.highlights); book.annotations = normalizeAnnotations(book.annotations);
    const f = await api.readingBookFile(id); if (token !== epoch) return; if (!f?.blob) throw Error('原书文件不在这台设备上，请重新导入');
    const opened = await openBook(f.blob, book.name, win.DOMParser); if (token !== epoch) return; reader = opened;
    if (book.type === 'comic' && !book.chapters[0]?.image) { const pos = book.position; const rows = await comicPages(token); if (!rows) return; book.chapters = rows; book.position = pos?.chapter < rows.length ? pos : {chapter: 0, fraction: 0}; }
    if (book.type === 'comic' && book.chapters[0]?.image) { const base = reader.chapter, rows = book.chapters; reader.chapter = async i => { const c = await base(rows[i].source); return {...c, images: [rows[i].image], html: `<img data-book-image="${esc(rows[i].image)}" alt="漫画页">`}; }; }
    await showChapter(book.position.chapter, book.position.fraction);
  }
  v.on('click', '[data-read]', el => {
    if (!picking) return open(el.dataset.read).catch(fail);
    const id = el.dataset.read;
    if (mark.has(id)) mark.delete(id); else mark.add(id);
    shelf().catch(fail);
  });
  v.on('click', '[data-more]', el => more(el.dataset.more).catch(fail));
  v.on('click', '[data-shelf]', el => { filter = el.dataset.shelf; shelf().catch(fail); });
  v.on('click', '[data-action]', el => ({import: importFiles, 'pick-start': () => { picking = 'pick'; mark.clear(); shelf().catch(fail); }, 'pick-done': () => { picking = null; mark.clear(); shelf().catch(fail); }, 'pick-shelf': shelfPicked, 'pick-delete': deletePicked, shelf: () => shelf().catch(fail)})[el.dataset.action]?.());
  v.back = () => { if (!book) return false; shelf().catch(fail); return true; }; v.refresh = () => { if (!book) shelf().catch(fail); }; v.edit = id => open(id).catch(fail);
  const dispose = v.dispose; v.dispose = () => { leave(); dispose(); };
  v.leave = () => { leave(); book = null; };
  shelf().catch(fail);
  return v;
}

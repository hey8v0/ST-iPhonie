// 书架 (0.9.48; 0.9.49 reworked): books on wooden shelves, a 继续读 card, categories (a series becomes one by itself on
// import), import in the order the files are numbered with a progress sheet, novels read full screen, comics in the
// album's viewer (a swipe down opens 目录 instead of leaving), and a long press on a paragraph for our own menu
// (发给 TA, 复制) instead of the system's selection bar. Reading together with a character: see core/reading-chat.js.
import {createView, esc, heading, btn, empty, menu, field, select, input, toggle, size} from './common.js';
import {icon} from './icons.js';
import {openBook, bookImports, readerDefaults, annotationDue, naturalCompare, seriesOf} from '../core/bookshelf.js';
import {readingSend} from '../core/reading-chat.js';
import {currentDm} from '../core/chats.js';
import {openAlbum} from './album-viewer.js';
import {popAt} from './msg-pop.js';

const ALL = '', RECENT = '\u0001recent', LOOSE = '\u0001loose';

export function bookshelfApp(ctx) {
  const {api, win, doc} = ctx, v = createView(ctx, 'bookshelf');
  let books = [], book = null, reader = null, chapter = null, page = 0, pages = 1, epoch = 0, album = null, busy = false, noteBusy = false, resize = null;
  let stage = null, filter = ALL, importing = null;
  const urls = new Set(), covers = new Map();
  const url = blob => { const u = win.URL.createObjectURL(blob); urls.add(u); return u; };
  const clearURLs = () => { for (const u of urls) win.URL.revokeObjectURL(u); urls.clear(); covers.clear(); };
  const fail = error => ctx.notify(error.message, {error: true});
  const progress = b => Math.round(((b.position?.chapter || 0) + (b.position?.fraction || 0)) / Math.max(1, b.chapters.length) * 100);
  const $ = sel => (stage || v.root).querySelector(sel);
  function leave() {
    epoch++; resize?.disconnect(); resize = null;
    const a = album; album = null; a?.close();
    stage?.remove(); stage = null;
    reader = null; chapter = null; clearURLs();
  }

  // ---------- the shelf ----------
  const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
  const coverHTML = b => `<button type="button" class="bs-book${b.type === 'comic' ? ' comic' : ''}" data-read="${esc(b.id)}" style="--book-hue:${hue(b.title)}" aria-label="打开《${esc(b.title)}》"><span class="bs-face"><span class="bs-title">${esc(b.title)}</span><small>${esc(b.author || (b.type === 'comic' ? '漫画' : '小说'))}</small></span>${progress(b) ? `<i class="bs-progress" style="--p:${progress(b)}%"></i>` : ''}</button>`;
  const labelHTML = b => `<div class="bs-label"><span><strong>${esc(b.title)}</strong><small>${progress(b) ? `读到 ${progress(b)}%` : '还没开始'}${b.companion ? ' · 和' + esc(b.companion) : ''}</small></span><button type="button" data-more="${esc(b.id)}" aria-label="《${esc(b.title)}》的菜单">${icon('more')}</button></div>`;
  function shelvesHTML(list) {
    const rows = [];
    for (let i = 0; i < list.length; i += 3) rows.push(list.slice(i, i + 3));
    return rows.map(r => `<div class="bs-row">${r.map(coverHTML).join('')}</div><div class="bs-plank" aria-hidden="true"></div><div class="bs-labels">${r.map(labelHTML).join('')}</div>`).join('');
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
    const chips = books.length ? `<div class="filter-row bs-chips" role="group" aria-label="分类">${[[ALL, `全部 <small>${books.length}</small>`], ...(last ? [[RECENT, '最近在读']] : []), ...cats.map(c => [c, `${esc(c)} <small>${books.filter(b => b.shelf === c).length}</small>`]), ...(cats.length && books.some(b => !b.shelf) ? [[LOOSE, '未分类']] : [])].map(([k, label]) => `<button type="button" data-shelf="${esc(k)}" aria-pressed="${filter === k}">${label}</button>`).join('')}</div>` : '';
    const going = last && filter === ALL ? `<button type="button" class="bs-continue" data-read="${esc(last.id)}"><span class="bs-mini" style="--book-hue:${hue(last.title)}" data-cover="${esc(last.id)}"></span><span class="bs-go"><small>继续读</small><strong>${esc(last.title)}</strong><small>${esc(last.chapters[last.position?.chapter || 0]?.title || '')} · ${progress(last)}%</small></span>${icon('next')}</button>` : '';
    v.draw(heading('书架', btn('import', icon('add') + '导入', 'text-button'))
      + (books.length ? chips + going + `<div class="bs-shelves">${shelvesHTML(inView())}</div>` : empty('书架还是空的', '导入 EPUB 漫画、小说或 TXT，一次可以选很多本，也可以选一个装着书的 ZIP。', 'book')));
    const mark = epoch;
    for (const b of books) {
      const f = await api.readingBookFile(b.id).catch(() => null); if (mark !== epoch || v.disposed) return;
      if (!f?.cover) continue;
      const u = url(f.cover); covers.set(b.id, u);
      for (const el of v.root.querySelectorAll(`[data-read="${CSS.escape(b.id)}"] .bs-face, [data-cover="${CSS.escape(b.id)}"]`)) { el.style.backgroundImage = `url("${u}")`; el.classList.add('pic'); }
    }
  }
  async function pickCompanion(target) {
    const contacts = api.chatContacts();
    const key = await menu(ctx, '和谁一起看', [{key: '-', label: '自己看'}, ...contacts.map(c => ({key: c.name, label: c.name}))]);
    if (!key) return;
    const result = await api.updateReadingBook(target.id, {companion: key === '-' ? '' : key});
    if (book?.id === target.id) book = result; else await shelf();
  }
  async function putOnShelf(b) {
    const cats = categories();
    const key = await menu(ctx, '放进分类', [...cats.map(c => ({key: 'c:' + c, label: c, note: c === b.shelf ? '现在在这里' : ''})), {key: 'new', label: '新建分类', icon: 'add'}, ...(b.shelf ? [{key: 'none', label: '不分类', icon: 'close'}] : [])]);
    if (!key) return;
    let name = key.startsWith('c:') ? key.slice(2) : '';
    if (key === 'new') {
      const d = ctx.dialog('新建分类', `${field('分类名', input('shelf-name', seriesOf(b.title) || '', 'text', 'maxlength="20" placeholder="比如：黑执事、轻小说"'))}<div class="actions">${btn('shelf-ok', '好', 'primary')}</div>`);
      name = await new Promise(resolve => { d.onClose(() => resolve('')); d.body.addEventListener('click', e => { if (e.target.closest('[data-action=shelf-ok]')) { const value = d.body.querySelector('[data-field=shelf-name]').value.trim(); d.close(); resolve(value); } }); });
      if (!name) return;
    }
    await api.updateReadingBook(b.id, {shelf: key === 'none' ? '' : name});
    await shelf();
  }
  async function more(id) {
    const b = await api.getReadingBook(id); if (!b) return;
    const key = await menu(ctx, b.title, [{key: 'shelf', label: '放进分类', icon: 'layers', note: b.shelf || '没分类'}, {key: 'companion', label: '和谁一起看', icon: 'chat', note: b.companion || '自己看'}, {key: 'info', label: '信息', icon: 'book'}, {key: 'reset', label: '清除进度', icon: 'back'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}]);
    if (key === 'info') ctx.dialog('书籍信息', `<p><strong>${esc(b.title)}</strong></p><p>${esc(b.author || '作者未注明')} · ${b.type === 'comic' ? '漫画' : '小说'} · ${b.chapters.length} ${b.type === 'comic' ? '页' : '节'} · ${size(b.size)}</p><p class="hint">导入时复制了一份存在这台设备的浏览器里，占 ${size(b.size)}；原文件不会被改动，删掉这本书就释放空间。</p>`);
    if (key === 'shelf') await putOnShelf(b);
    if (key === 'companion') await pickCompanion(b);
    if (key === 'reset') { await api.updateReadingBook(id, {position: {chapter: 0, fraction: 0}}); await shelf(); }
    if (key === 'delete' && await ctx.confirm('删除这本书？', '书籍、进度、书签和页边批注会从这台设备移除。')) { await api.deleteReadingBook(id); await shelf(); }
  }

  // ---------- import: in the order the files are numbered, with a sheet that says how far it got ----------
  function importFiles() {
    if (importing) { importing.show(); return; }
    const pick = doc.createElement('input'); pick.type = 'file'; pick.multiple = true; pick.accept = '.epub,.txt,.zip';
    pick.onchange = () => runImport([...pick.files]).catch(fail);
    pick.click();
  }
  async function runImport(files) {
    const items = (await bookImports(files)).sort((a, b) => naturalCompare(a.name, b.name));
    if (!items.length) { ctx.notify('没有找到 EPUB 或 TXT'); return; }
    // A series (two books or more of one name, numbered) goes onto a shelf of its own.
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
        // A comic's pages are found the first time it is opened (reading every page here made big imports take long).
        await api.addReadingBook({name: item.name, title: b.title, author: b.author, type: b.type, chapters: b.chapters.map(c => ({title: c.title})), ...(s && series.get(s) > 1 ? {shelf: s} : {})}, blob, b.cover ? await b.image(b.cover) : null);
      } catch (e) { state.errors.push(item.name + '：' + e.message); }
      state.done++; paint();
      await new Promise(resolve => win.setTimeout(resolve, 0));
    }
    importing = null;
    if (!state.sheet?.live) ctx.notify(`导入了 ${state.total - state.errors.length} 本书${state.errors.length ? `，${state.errors.length} 本没导入` : ''}`);
    if (!book) await shelf();
  }

  // ---------- reading ----------
  function settings() {
    const s = book.settings;
    const d = ctx.dialog('阅读设置', field('翻阅方式', select('mode', s.mode, [['pages', '左右翻页'], ['scroll', '上下滚动']])) + (book.type === 'comic' ? toggle('rtl', '从右往左翻', s.rtl) : field('字号', input('size', s.size, 'range', 'min="14" max="30" step="1"')) + field('行距', input('line', s.line, 'range', 'min="1.3" max="2.6" step="0.1"')) + field('页边距', input('margin', s.margin, 'range', 'min="12" max="40" step="2"')) + field('字体', select('font', s.font, [['serif', '衬线'], ['sans-serif', '无衬线']]))) + field('纸张', select('theme', s.theme, [['auto', '跟随手机'], ['white', '白纸'], ['cream', '米黄'], ['green', '护眼绿'], ['night', '夜间']])) + toggle('annotations', '页边批注', s.annotations));
    d.body.addEventListener('change', async e => {
      const key = e.target.dataset.field; if (!key) return;
      const value = e.target.type === 'checkbox' ? e.target.checked : ['size', 'line', 'margin'].includes(key) ? Number(e.target.value) : e.target.value;
      book = await api.updateReadingBook(book.id, {settings: {...book.settings, [key]: value}});
    });
    d.onClose(() => { if (book && reader) showChapter(book.position.chapter, book.position.fraction).catch(fail); });
  }
  async function contents() {
    const d = ctx.dialog('目录与书签', `<div class="reading-toc">${book.bookmarks.map((m, i) => `<button data-mark="${i}">书签 · ${esc(book.chapters[m.chapter]?.title)} · ${Math.round(m.fraction * 100)}%</button>`).join('')}${book.chapters.map((c, i) => `<button data-chapter="${i}" ${i === book.position.chapter ? 'aria-current="true"' : ''}>${esc(c.title)}</button>`).join('')}</div>`);
    d.body.querySelector('[aria-current=true]')?.scrollIntoView?.({block: 'center'});
    d.body.addEventListener('click', e => { const el = e.target.closest('button'); if (!el) return; const m = el.dataset.mark !== undefined ? book.bookmarks[Number(el.dataset.mark)] : {chapter: Number(el.dataset.chapter), fraction: 0}; d.close(); showChapter(m.chapter, m.fraction).catch(fail); });
  }
  function visible() {
    const pane = $('.reading-page'), content = $('.reading-content');
    let text = '';
    if (pane && content && book.type !== 'comic') {
      const r = pane.getBoundingClientRect(), walker = doc.createTreeWalker(content, 4), range = doc.createRange();
      for (let node = walker.nextNode(); node && text.length < 2200; node = walker.nextNode()) {
        const len = node.textContent.length;
        // Columns are monotone in x; scroll layout is monotone in y. Binary search avoids per-character layout reads.
        const coord = i => { range.setStart(node, i); range.setEnd(node, Math.min(len, i + 1)); const b = range.getBoundingClientRect(); return book.settings.mode === 'scroll' ? b.top : b.left; };
        const low = book.settings.mode === 'scroll' ? r.top : r.left, high = book.settings.mode === 'scroll' ? r.bottom : r.right;
        const search = target => { let a = 0, b = len; while (a < b) { const mid = (a + b) >> 1; if (coord(mid) < target) a = mid + 1; else b = mid; } return a; };
        if (len && typeof range.getBoundingClientRect === 'function') text += node.textContent.slice(search(low), search(high)) + '\n';
      }
    }
    return {chapter: book.position.chapter, page: page + 1, text: text.trim().slice(0, 2200)};
  }
  async function savePosition(fraction, turn = false) {
    if (!book) return;
    const id = book.id, p = {...book.position, fraction};
    book.position = p; if (turn) book.turns = (book.turns || 0) + 1;
    const saved = await api.updateReadingBook(id, {position: p, turns: book.turns, lastRead: Date.now()});
    if (book?.id !== id || book.position.chapter !== p.chapter || book.position.fraction !== p.fraction) return;
    book = {...book, ...saved};
    const label = $('[data-reading-count]'); if (label) label.textContent = `${book.chapters[p.chapter]?.title} · ${page + 1}/${pages}`;
    const slider = $('[data-reading-progress]'); if (slider) slider.value = ((p.chapter + p.fraction) / book.chapters.length) * 100;
    showNote();
    if (turn) maybeNote().catch(fail);
  }
  function showNote() {
    const host = album?.root || stage, old = host?.querySelector('.reading-note'); old?.remove();
    if (!host) return;
    const note = book?.annotations.findLast(n => n.chapter === book.position.chapter && Math.abs(n.fraction - book.position.fraction) < .015);
    if (!note || book.settings.annotations === false) return;
    const el = doc.createElement('button'); el.className = 'reading-note'; el.textContent = note.text; el.onclick = () => chatPanel(); host.append(el);
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
    const target = book, p = {...book.position}, view = visible(), source = reader, image = chapter?.images[0], day = new Date().toLocaleDateString('sv-SE');
    try {
      const reserved = await api.updateReadingBook(target.id, {nextNote: (target.turns || 0) + 6 + Math.floor(Math.random() * 5), daily: {day, count: (target.daily?.day === day ? target.daily.count : 0) + 1}});
      if (book?.id !== target.id) return;
      book = {...book, nextNote: reserved.nextNote, daily: reserved.daily};
      const blob = target.type === 'comic' && image ? await source.image(image) : null;
      if (book?.id !== target.id) return;
      const result = await readingSend(api, target, view, '这一页你有什么感想？', {blob, annotation: true}), text = result?.messages.filter(m => m.from === target.companion && m.kind === 'text').at(-1)?.text;
      if (text) { const current = await api.getReadingBook(target.id); if (!current) return; const saved = await api.updateReadingBook(target.id, {annotations: [...(current.annotations || []), {...p, text: text.slice(0, 120)}].slice(-500)}); if (book?.id === target.id) { book = saved; showNote(); } }
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
  /** A paragraph held for half a second: lit, with a small menu over it (发给 TA, 复制) — not the system's selection bar. */
  function paragraphMenu(el) {
    const text = el.textContent.trim();
    if (!text) return;
    el.classList.add('reading-picked');
    const d = ctx.dialog('这一段', `<div class="mp-grid">${[['para-send', 'chat', '发给 TA'], ['para-copy', 'copy', '复制']].map(([k, g, l]) => `<button type="button" class="mp-item" data-action="${k}"><span class="mp-ico">${icon(g)}</span><span class="mp-label">${l}</span></button>`).join('')}</div>`);
    d.overlay.querySelector('.mp-grid').style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
    popAt(d, el, {win, reduced: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
    d.onClose(() => el.classList.remove('reading-picked'));
    d.body.addEventListener('click', async e => {
      const k = e.target.closest('[data-action]')?.dataset.action;
      if (k === 'para-send') { d.close(); chatPanel(text); }
      if (k === 'para-copy') { d.close(); try { await win.navigator.clipboard.writeText(text); ctx.notify('已复制'); } catch { ctx.notify('这个浏览器不让复制', {error: true}); } }
    });
  }
  const STAGE_ACTIONS = {shelf: () => shelf().catch(fail), settings: () => settings(), toc: () => contents(), bookmark: () => bookmark().catch(fail), chat: () => chatPanel()};
  /** The page full screen (0.9.49): it lies over the whole phone screen like the comics' viewer, the bars come and go on a tap. */
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
  async function showChapter(index, fraction = 0, didTurn = false) {
    if (!reader || index < 0 || index >= book.chapters.length) return;
    const token = ++epoch, a = album; album = null; a?.close(); resize?.disconnect(); clearURLs();
    book.position = {chapter: index, fraction}; chapter = await reader.chapter(index); if (token !== epoch) return;
    if (book.type === 'comic' && book.settings.mode === 'pages') { stage?.remove(); stage = null; await comic(index); return; }
    const s = book.settings, hidden = stage?.querySelector('.reading-reader')?.classList.contains('reading-hidden');
    openStage(`<section class="reading-reader${hidden ? ' reading-hidden' : ''}" data-paper="${esc(s.theme)}" data-mode="${esc(s.mode)}" style="--read-size:${s.size}px;--read-line:${s.line};--read-margin:${s.margin}px;--read-font:${s.font}"><header class="reading-bar"><button data-action="shelf" aria-label="返回书架">${icon('back')}</button><span>${esc(book.title)}</span><button data-action="settings" aria-label="阅读设置">${icon('settings')}</button></header><div class="reading-page" tabindex="0"><article class="reading-content">${chapter.html}</article></div><footer class="reading-bottom"><small data-reading-count></small><input aria-label="阅读进度" data-reading-progress type="range" min="0" max="100" step="0.01"><nav><button data-action="toc">${icon('book')}目录</button><button data-action="bookmark">${icon('star')}书签</button><button data-action="chat">${icon('chat')}一起看</button></nav></footer></section>`);
    const pane = $('.reading-page'), content = $('.reading-content');
    for (const img of content.querySelectorAll('[data-book-image]')) { const blob = await reader.image(img.dataset.bookImage); if (token !== epoch) return; if (blob) img.src = url(blob); }
    await new Promise(resolve => win.requestAnimationFrame(resolve)); if (token !== epoch) return;
    const layout = () => { if (token !== epoch) return; const f = book.position.fraction; content.style.width = pane.clientWidth + 'px'; pages = s.mode === 'pages' ? Math.max(1, Math.round(content.scrollWidth / Math.max(1, pane.clientWidth))) : 1; page = Math.round(f * (pages - 1)); if (s.mode === 'pages') content.style.transform = `translateX(${-page * pane.clientWidth}px)`; else pane.scrollTop = f * Math.max(0, pane.scrollHeight - pane.clientHeight); savePosition(f, didTurn).catch(fail); didTurn = false; };
    layout(); if (win.ResizeObserver) { resize = new win.ResizeObserver(layout); resize.observe(pane); }
    let start = null, swiped = false, hold = null;
    pane.addEventListener('pointerdown', e => {
      start = {x: e.clientX, y: e.clientY}; swiped = false;
      win.clearTimeout(hold?.timer);
      const para = e.target.closest('.reading-content p, .reading-content li, .reading-content blockquote, .reading-content h1, .reading-content h2, .reading-content h3');
      hold = para ? {timer: win.setTimeout(() => { hold = null; swiped = true; paragraphMenu(para); }, 520)} : null;
    });
    pane.addEventListener('pointermove', e => { if (hold && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { win.clearTimeout(hold.timer); hold = null; } });
    pane.addEventListener('pointerup', e => {
      if (hold) { win.clearTimeout(hold.timer); hold = null; }
      if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      if (s.mode === 'pages' && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { swiped = true; turn(dx < 0 ? 1 : -1).catch(fail); }
      else if (s.mode === 'scroll' && Math.abs(dy) > 65) { swiped = true; if (dy < 0 && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 2) turn(1).catch(fail); else if (dy > 0 && pane.scrollTop <= 1) turn(-1).catch(fail); }
      else if (dy < -65 && Math.abs(dy) > Math.abs(dx)) { swiped = true; chatPanel(); }
    });
    pane.addEventListener('contextmenu', e => e.preventDefault());
    pane.addEventListener('click', e => { if (swiped) return; const r = pane.getBoundingClientRect(), x = e.clientX - r.left; if (s.mode === 'pages' && (x < r.width * .22 || x > r.width * .78)) turn(x < r.width * .22 ? -1 : 1); else $('.reading-reader').classList.toggle('reading-hidden'); });
    pane.addEventListener('keyup', e => { if (e.key === 'ArrowRight') turn(1); if (e.key === 'ArrowLeft') turn(-1); });
    let timer = 0;
    pane.addEventListener('scroll', () => { if (s.mode !== 'scroll') return; win.clearTimeout(timer); timer = win.setTimeout(() => { if (token !== epoch) return; savePosition(pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight), true).catch(fail); }, 180); });
    pane.addEventListener('wheel', e => { if (s.mode === 'scroll' && e.deltaY > 0 && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 2) turn(1); });
  }
  async function comic(index) {
    const owner = book.id, ids = book.chapters.map((_, i) => String(i)); if (book.settings.rtl) ids.reverse();
    album = openAlbum({ctx, host: v.root.closest('.screen') || v.root, ids, index: ids.indexOf(String(index)), preload: true,
      load: async id => { const c = await reader.chapter(Number(id)), blob = await reader.image(c.images[0]); return blob ? {blob, name: book.chapters[Number(id)].title} : null; },
      onPage: id => { const n = Number(id); book.position = {chapter: n, fraction: 0}; page = n; pages = book.chapters.length; reader.chapter(n).then(c => { if (book?.id !== owner) return; chapter = c; savePosition(0, true).catch(fail); }); },
      // A swipe down opens 目录与书签 (it used to close the book, too easily by mistake); 返回 at the top left goes back.
      onPullDown: () => contents(),
      onHold: () => chatPanel('这一页漫画'), onClose: () => { if (album) { album = null; if (book?.settings.mode === 'scroll') showChapter(book.position.chapter, book.position.fraction).catch(fail); else shelf().catch(fail); } },
      actions: [{key: 'toc', icon: 'book', label: '目录', run: contents}, {key: 'bookmark', icon: 'star', label: '书签', run: bookmark}, {key: 'chat', icon: 'chat', label: '一起看', run: () => chatPanel()}, {key: 'settings', icon: 'settings', label: '设置', run: settings}]});
    album.root.setAttribute('aria-label', book.title); album.root.querySelector('[data-av=close]').setAttribute('aria-label', '返回书架');
    const slider = doc.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(book.chapters.length - 1); slider.value = String(index); slider.setAttribute('aria-label', '漫画进度'); slider.className = 'reading-comic-progress'; slider.onchange = () => showChapter(Number(slider.value)).catch(fail); album.root.querySelector('.album-bar').before(slider); showNote();
  }
  async function turn(step) {
    if (!book) return;
    if (book.settings.mode === 'pages' && book.type !== 'comic' && page + step >= 0 && page + step < pages) { page += step; const pane = $('.reading-page'); $('.reading-content').style.transform = `translateX(${-page * pane.clientWidth}px)`; await savePosition(page / Math.max(1, pages - 1), true); }
    else await showChapter(book.position.chapter + step, step < 0 ? 1 : 0, true);
  }
  /** A comic imported since 0.9.49 has its pages found now, once: every picture of every page, in order (then kept). */
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
    leave(); const token = epoch, next = await api.getReadingBook(id); if (token !== epoch) return; book = next; if (!book) return shelf(); book.settings = {...readerDefaults, ...book.settings};
    const f = await api.readingBookFile(id); if (token !== epoch) return; if (!f?.blob) throw Error('原书文件不在这台设备上，请重新导入');
    const opened = await openBook(f.blob, book.name, win.DOMParser); if (token !== epoch) return; reader = opened;
    if (book.type === 'comic' && !book.chapters[0]?.image) { const pos = book.position; const rows = await comicPages(token); if (!rows) return; book.chapters = rows; book.position = pos?.chapter < rows.length ? pos : {chapter: 0, fraction: 0}; }
    if (book.type === 'comic' && book.chapters[0]?.image) { const base = reader.chapter, rows = book.chapters; reader.chapter = async i => { const c = await base(rows[i].source); return {...c, images: [rows[i].image], html: `<img data-book-image="${esc(rows[i].image)}" alt="漫画页">`}; }; }
    await showChapter(book.position.chapter, book.position.fraction);
  }
  v.on('click', '[data-read]', el => open(el.dataset.read).catch(fail)); v.on('click', '[data-more]', el => more(el.dataset.more).catch(fail));
  v.on('click', '[data-shelf]', el => { filter = el.dataset.shelf; shelf().catch(fail); });
  v.on('click', '[data-action]', el => ({import: importFiles, shelf: () => shelf().catch(fail)})[el.dataset.action]?.());
  v.back = () => { if (!book) return false; shelf().catch(fail); return true; }; v.refresh = () => { if (!book) shelf().catch(fail); }; v.edit = id => open(id).catch(fail);
  const dispose = v.dispose; v.dispose = () => { leave(); dispose(); };
  v.leave = () => { leave(); book = null; };
  shelf().catch(fail);
  return v;
}

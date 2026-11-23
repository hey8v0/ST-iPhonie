// 书架 (0.9.48; 0.9.49 shelves and categories; 0.9.52 the feel of a real bookshelf): books standing on wooden planks with
// their boards and side rails, a 继续读 card that also says how long you read today, multi-select for putting several in
// a category or taking them off at once, paper-like page turns, 书摘 (a held paragraph can be marked) and the character's
// notes tucked in between the paragraphs like little handwritten slips of paper — the words make room, so nothing is
// covered. Comics are read in the album's viewer (a swipe down opens 目录 instead of leaving).
import {createView, copyText, esc, heading, btn, empty, menu, field, select, input, toggle, size} from './common.js';
import {icon} from './icons.js';
import {openBook, bookImports, bookFileAccept, readerDefaults, annotationDue, naturalCompare, seriesOf, effectOf,
  normalizeStats, addReadingTime, todaySeconds, weekSeconds, readingLeft, span,
  normalizeHighlights, toggleHighlight, normalizeAnnotations} from '../core/bookshelf.js';
import {readingSend, readingSources, readingContext} from '../core/reading-chat.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {openReadingThreads} from './reading-threads.js';
import {openAlbum} from './album-viewer.js';
import {selectedRange, underline, point, offsetAt} from './reading-range.js';
import {readingArt} from './reading-art.js';
import {paperTurn} from './reading-paper.js';

const ALL = '', RECENT = '\u0001recent', LOOSE = '\u0001loose';
const IDLE = 120000;   // not reading any more after two minutes without a touch (0.9.52)

export function bookshelfApp(ctx) {
  const {api, win, doc} = ctx, v = createView(ctx, 'bookshelf');
  let books = [], book = null, reader = null, chapter = null, page = 0, pages = 1, epoch = 0, album = null, noteBusy = false, resize = null;
  let shelfLayout = null, coverObserver = null, pulledId;
  let stage = null, filter = ALL, importing = null, lastPosition = null;
  let preferenceWrites = Promise.resolve();
  let picking = null, mark = new Set();              // 多选
  let session = null, activeAt = 0;                  // reading time (0.9.52)
  const urls = new Set(), covers = new Map();
  const url = blob => { const u = win.URL.createObjectURL(blob); urls.add(u); return u; };
  const clearURLs = () => { for (const u of urls) win.URL.revokeObjectURL(u); urls.clear(); covers.clear(); };
  const fail = error => ctx.notify(error.message, {error: true});
  const progress = b => Math.round(((b.position?.chapter || 0) + (b.position?.fraction || 0)) / Math.max(1, b.chapters.length) * 100);
  const $ = sel => (stage || v.root).querySelector(sel);
  let detachSelection = () => {}, noteTimer;
  let refreshLayout = () => {}, leaf = null, turning = false;
  const art = readingArt(ctx, () => content && book ? {book,blocks} : null, () => refreshLayout());
  function resetPage() {
    refreshLayout = () => {};
    leaf?.remove(); leaf = null; turning = false; art.clear();
  }
  function leave() {
    shelfLayout?.disconnect(); shelfLayout = null;
    coverObserver?.disconnect(); coverObserver = null;
    resetPage(); detachSelection(); win.clearTimeout(noteTimer);
    const stats = book ? flushRead() : null;
    if (stats && book) api.updateReadingBook(book.id, {stats}).catch(() => {});
    lastPosition = null; epoch++; resize?.disconnect(); resize = null;
    const a = album; album = null; a?.close();
    stage?.remove(); stage = null;
    reader = null; chapter = null; content = null; blocks = []; clearURLs();
  }

  // ---------- the shelf ----------
  const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
  function shelfPages(book) {
    if (book.type === 'comic' && book.chapters[0]?.image) return book.chapters.length;
    if (book.estimatedPages > 0) return book.estimatedPages;
    // Older imports get a content estimate until the reader measures their text or image pages.
    if (/\.txt$/i.test(book.name) && book.size) return Math.max(1, book.size / 1200);
    return Math.max(1, book.chapters.length * (book.type === 'comic' ? 1 : 6));
  }
  function styleOf(book) {
    const depth = Math.min(12, 1 + Math.sqrt(shelfPages(book)) * .43);
    // A stable trim size for each edition; volume affects the page block, not cover height.
    const format = hue(book.title) % 5;
    return `--page-depth:${depth.toFixed(2)}px;--trim:${82 + format * 3}%`;
  }
  const coverHTML = b => `<button type="button" class="bs-book${b.type === 'comic' ? ' comic' : ''}${mark.has(b.id) ? ' picked' : ''}" data-read="${esc(b.id)}" style="--book-hue:${hue(b.title)};${styleOf(b)}" aria-label="${picking ? '选择' : '打开'}《${esc(b.title)}》"${picking ? ` aria-pressed="${mark.has(b.id)}"` : ''}><span class="bs-face"><span class="bs-title">${esc(b.title)}</span><small>${esc(b.author || (b.type === 'comic' ? '漫画' : '小说'))}</small></span>${progress(b) ? `<i class="bs-progress" style="--p:${progress(b)}%"></i>` : ''}${picking ? '<span class="bs-tick" aria-hidden="true"></span>' : ''}</button>`;
  function shelfTitle(book) {
    if (filter !== book.shelf || !filter || !book.title.startsWith(filter)) return book.title;
    const volume = book.title.slice(filter.length).match(/^\s*[-–—·:：]\s*((?:卷|巻|話|话|第|vol\.)\s*\d.*)$/i);
    return volume ? volume[1] : book.title;
  }
  const labelHTML = b => `<div class="bs-label"><span><strong title="${esc(b.title)}">${esc(shelfTitle(b))}</strong><small>${progress(b) ? `读到 ${progress(b)}%` : '还没开始'}${b.companion ? ' · 和' + esc(b.companion) : ''}</small></span>${picking ? '' : `<button type="button" data-more="${esc(b.id)}" aria-label="《${esc(b.title)}》的菜单">${icon('more')}</button>`}</div>`;
  function shelvesHTML(list) {
    const rows = [];
    for (let i = 0; i < list.length; i += 3) rows.push(list.slice(i, i + 3));
    return rows.map((r, i) => `<div class="bs-shelf" style="--grain-x:${(i * 137) % 311}px;--grain-y:${(i * 83) % 197}px;--grain-angle:${174 + i % 7}deg"><div class="bs-row">${r.map(coverHTML).join('')}</div><div class="bs-plank" aria-hidden="true"></div><div class="bs-labels">${r.map(labelHTML).join('')}</div></div>`).join('');
  }
  // Each binding is viewed straight on. Its measured width also determines which ledge it fits on.
  const cloths = [
    ['#36494b','#f9ebca'], ['#efe6d5','#45372d'], ['#80483b','#fff1cd'],
    ['#344761','#f9efd7'], ['#d2bf9c','#382e2c'], ['#536049','#f8eed1'],
    ['#4c3944','#f5dec7'], ['#c1cdd0','#293c48']
  ];
  function standingBook(b) {
    const seed = hue(b.title), [cloth, foil] = cloths[seed % cloths.length];
    const thickness = Math.round(13 + 47 * (1 - Math.exp(-shelfPages(b) / 480)));
    const slot = Math.max(24, thickness);
    const id = esc(b.id);
    return `<button type="button" class="bs-spine" data-spine="${id}" data-width="${slot}" aria-label="${esc(b.title)}" aria-pressed="false" style="--slot:${slot}px;--thickness:${thickness}px;--height:${125 + seed % 17}px;--cloth:${cloth};--foil:${foil}">
      <span class="bs-volume" aria-hidden="true"><span class="bs-page-top"></span><span class="bs-cover-side" data-cover="${id}"></span><span class="bs-wrap" data-cover="${id}"><b>${esc(shelfTitle(b))}</b></span></span></button>`;
  }
  function browsingShelf(list) {
    if (picking) return shelvesHTML(list);
    return `<div class="bs-rack">${list.map(standingBook).join('')}</div>`;
  }
  function arrangeRack() {
    const rack = v.root.querySelector('.bs-rack');
    if (!rack) return;
    const volumes = [...rack.querySelectorAll('[data-spine]')];
    if (pulledId === undefined && volumes.length === 1) pulledId = volumes[0].dataset.spine;
    const caption = doc.createElement('div');
    caption.className = 'bs-caption';
    caption.innerHTML = `<button type="button" data-read=""></button><button type="button" data-more="" aria-label="书籍菜单">${icon('more')}</button>`;
    let lastWidth;
    function fit(width) {
      const available = Math.floor(width || 300) - 4;
      if (lastWidth === available) return;
      lastWidth = available;
      const focused = doc.activeElement;
      const fragment = doc.createDocumentFragment();
      let row, used = 0;
      for (const volume of volumes) {
        const size = Number(volume.dataset.width);
        if (!row || used + size + 1 > available) {
          const tier = doc.createElement('section');
          row = doc.createElement('div');
          row.className = 'bs-rail';
          const ledge = doc.createElement('div');
          ledge.className = 'bs-plank';
          tier.append(row, ledge);
          fragment.append(tier);
          used = 0;
        }
        const recede = 1 - 2 * (used + size / 2) / available;
        volume.style.setProperty('--recede', String(recede));
        volume.classList.toggle('recedes-left', recede < 0);
        row.append(volume);
        used += size + 1;
      }
      for (const volume of volumes) volume.classList.remove('resting');
      for (const rail of fragment.querySelectorAll('.bs-rail')) {
        const items = [...rail.children];
        if (items.length < 2) continue;
        const thickness = book => parseFloat(book.style.getPropertyValue('--thickness'));
        const height = book => parseFloat(book.style.getPropertyValue('--height'));
        const inset = book => (Number(book.dataset.width) - thickness(book)) / 2;
        const slim = items.filter(book => thickness(book) <= .22 * height(book));
        if (!slim.length) continue;
        const seed = hue(items.map(book => book.dataset.spine).join('|'));
        const thinnest = Math.min(...slim.map(thickness));
        const choices = slim.filter(book => thickness(book) <= thinnest + 3);
        const book = choices[(seed >>> 1) % choices.length], index = items.indexOf(book);
        const right = index === 0 || (index < items.length - 1 && (seed & 1) === 1);
        const support = items[index + (right ? 1 : -1)];
        const occupied = items.reduce((sum, item) => sum + Number(item.dataset.width), items.length - 1);
        const space = Math.max(0, Math.min(available - occupied, 6 + seed % 8));
        const distance = 1 + inset(book) + inset(support) + space;
        // The first contact is either our top corner or the neighbour's top corner.
        const angle = Math.max(Math.asin(distance / height(book)), Math.atan(distance / height(support)));
        if (angle < .018) continue;
        book.style.setProperty('--lean-start', (right ? 0 : space) + 'px');
        book.style.setProperty('--lean-end', (right ? space : 0) + 'px');
        book.style.setProperty('--lean-pivot', right ? 'right' : 'left');
        book.style.setProperty('--lean-angle', (right ? angle : -angle) + 'rad');
        book.classList.add('resting');
      }
      rack.replaceChildren(fragment);
      rack.append(caption);
      caption.hidden = true;
      const chosen = volumes.find(el => el.dataset.spine === pulledId);
      if (chosen) pull(chosen);
      if (focused && rack.contains(focused)) focused.focus({preventScroll:true});
    }
    fit(rack.clientWidth ? rack.clientWidth - 4 : 300);
    if (win.ResizeObserver) {
      shelfLayout = new win.ResizeObserver(entries => fit(entries[0].contentRect.width));
      shelfLayout.observe(rack);
    }
  }
  function pull(el) {
    const rack = el.closest('.bs-rack'), row = el.closest('.bs-rail'), id = el.dataset.spine;
    const previous = rack.querySelector('[aria-pressed=true]');
    previous?.setAttribute('aria-pressed','false');
    el.setAttribute('aria-pressed','true');
    pulledId = id;
    const caption = rack.querySelector('.bs-caption');
    const link = caption.querySelector('[data-read]');
    link.dataset.read = id;
    link.textContent = el.getAttribute('aria-label');
    caption.querySelector('[data-more]').dataset.more = id;
    row.parentElement.append(caption);
    caption.hidden = false;
  }
  v.root.addEventListener('click', event => {
    if (!pulledId || book || picking || event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    const rack = v.root.querySelector('.bs-rack');
    const selected = rack?.querySelector('.bs-spine[aria-pressed=true]');
    if (!selected) return;
    selected.setAttribute('aria-pressed', 'false');
    rack.querySelector('.bs-caption').hidden = true;
    pulledId = null;
  });
  v.on('click','[data-spine]', el => {
    if(el.getAttribute('aria-pressed')==='true') return details(el.dataset.spine);
    pull(el);
  });
  let swipe = null, ignoreClickUntil = 0;
  v.root.addEventListener('pointerdown', e => {
    const row=e.target.closest('.bs-rail');
    swipe=row ? {row,start:e.target.closest('[data-spine]'),x:e.clientX,y:e.clientY}:null;
  });
  v.root.addEventListener('pointercancel',()=>{swipe=null;});
  v.root.addEventListener('pointerup',e=>{
    if (!swipe) return;
    const {row,start,x,y}=swipe; swipe=null;
    const dx=e.clientX-x;
    if(Math.abs(dx)<28 || Math.abs(dx)<Math.abs(e.clientY-y)*1.4)return;
    const current=row.querySelector('[aria-pressed=true]') || start || row.firstElementChild;
    const next=dx<0?current.nextElementSibling:current.previousElementSibling;
    if(next)pull(next);
    ignoreClickUntil=Date.now()+250;
  });
  v.root.addEventListener('click',e=>{
    if(Date.now()<ignoreClickUntil && e.target.closest('.bs-rail')){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  async function details(id) {
    const b=books.find(row=>row.id===id);
    if (!b)return;
    const d=ctx.dialog('书籍信息',`<div class="bs-dossier"><div data-detail-cover></div><h2>${esc(b.title)}</h2><small>${esc(b.author || (b.type==='comic'?'漫画':'小说'))} · ${b.lastRead?'已读 '+progress(b)+'%':'未开始'}</small></div>`
      +btn('book-options',icon('sliders')+' 共读与阅读设置','bs-options-link')
      +btn('detail-start',b.lastRead?'继续阅读':'开始阅读','primary'));
    d.body.querySelector('[data-action=book-options]').onclick=()=>bookOptions(b.id, 'together', {over:true});
    const paintCover=src=>{const img=doc.createElement('img');img.alt='';img.src=src;d.body.querySelector('[data-detail-cover]').replaceChildren(img);};
    if(covers.has(id)) paintCover(covers.get(id));
    else api.readingBookFile(id).then(f=>{if(d.live && !v.disposed && f?.cover){const src=url(f.cover);covers.set(id,src);paintCover(src);}}).catch(fail);
    const start=d.body.querySelector('[data-action=detail-start]');
    start.onclick=async()=>{
      if(start.disabled)return;
      start.disabled=true;
      try {
        if(!d.live)return;
        d.close();await open(id);
      } catch(error){fail(error);} finally{start.disabled=false;}
    };
  }
  const categories = () => [...new Set(books.map(b => b.shelf).filter(Boolean))].sort(naturalCompare);
  function inView() {
    if (filter === RECENT) return books.filter(b => b.lastRead).sort((a, b) => b.lastRead - a.lastRead);
    const list = filter === ALL ? books : filter === LOOSE ? books.filter(b => !b.shelf) : books.filter(b => b.shelf === filter);
    return list.slice().sort((a, b) => naturalCompare(a.shelf || '\uffff', b.shelf || '\uffff') || naturalCompare(a.title, b.title));
  }
  async function shelf() {
    leave(); book = null;
    const token=epoch, loaded=await api.listReadingBooks();
    if (v.disposed || token!==epoch)return;
    books=loaded;
    const cats = categories(), last = books.filter(b => b.lastRead).sort((a, b) => b.lastRead - a.lastRead)[0];
    if (filter !== ALL && filter !== RECENT && filter !== LOOSE && !cats.includes(filter)) filter = ALL;
    if (picking === 'pick' && mark.size) { mark = new Set([...mark].filter(id => books.some(b => b.id === id))); if (!mark.size) picking = null; }
    const chips = books.length ? `<div class="filter-row bs-chips" role="group" aria-label="分类">${cats.length ? btn('manage-categories',icon('layers')+' 分类','text-button','aria-label="管理分类"') : ''}${[[ALL, `全部 <small>${books.length}</small>`], ...(last ? [[RECENT, '最近在读']] : []), ...cats.map(c => [c, `${esc(c)} <small>${books.filter(b => b.shelf === c).length}</small>`]), ...(cats.length && books.some(b => !b.shelf) ? [[LOOSE, '未分类']] : [])].map(([k, label]) => `<button type="button" data-shelf="${esc(k)}" aria-pressed="${filter === k}">${label}</button>`).join('')}</div>` : '';
    const today = last ? todaySeconds(last.stats) : 0;
    const left = last ? readingLeft(last, last.stats) : null;
    const going = last && filter === ALL && !picking ? `<button type="button" class="bs-continue" data-read="${esc(last.id)}"><span class="bs-mini" style="--book-hue:${hue(last.title)}" data-cover="${esc(last.id)}"><b>${esc(last.title)}</b></span><span class="bs-go"><small>继续读</small><strong>${esc(last.title)}</strong><small>${esc(last.chapters[last.position?.chapter || 0]?.title || '')} · ${progress(last)}%${left ? ` · 还剩约 ${span(left)}` : ''}</small></span>${icon('next')}</button>${today ? `<p class="bs-today">今天在这本书上读了 ${span(today)}</p>` : ''}` : '';
    const head = heading('书架', picking ? btn('pick-done', '完成', 'text-button') : (books.length ? btn('pick-start', icon('check') + '多选', 'text-button') + btn('import', icon('add') + '导入', 'text-button') : btn('import', icon('add') + '导入', 'text-button')), 'Bookshelf');
    v.draw(head + (books.length ? going + chips + `<div class="bs-shelves">${browsingShelf(inView())}</div>` : empty('书架还是空的', '支持 EPUB、TXT、Markdown、CBZ，也可以导入图片 ZIP 或打包好的多本书。', 'book'))
      + (picking ? `<div class="bs-pickbar"><span>${mark.size ? `选了 ${mark.size} 本` : '点书选择'}</span><div>${btn('pick-shelf', icon('layers') + '放进分类', 'chip-button', mark.size ? '' : 'disabled')}${btn('pick-delete', icon('trash') + '删除', 'chip-button danger', mark.size ? '' : 'disabled')}</div></div>` : ''));
    arrangeRack();
    const targets = new Map();
    for (const el of v.root.querySelectorAll('[data-cover],.bs-book[data-read] .bs-face')) {
      const id = el.dataset.cover || el.closest('.bs-book').dataset.read;
      if (!targets.has(id)) targets.set(id, []);
      targets.get(id).push(el);
    }
    async function loadCover(id) {
      const elements = targets.get(id);
      if (!elements) return;
      targets.delete(id);
      const file = await api.readingBookFile(id).catch(() => null);
      if (v.disposed || token !== epoch || !file?.cover) return;
      const src = url(file.cover);
      covers.set(id, src);
      for (const el of elements) {
        const img = doc.createElement('img');
        img.alt = '';
        const face = el.closest('.bs-book');
        if (face) img.onload = () => {
          if (img.naturalHeight) face.style.aspectRatio = String(Math.max(.58, Math.min(.84, img.naturalWidth / img.naturalHeight)));
        };
        img.src = src;
        el.replaceChildren(img);
        el.classList.add('pic');
      }
    }
    if (win.IntersectionObserver) {
      coverObserver = new win.IntersectionObserver((entries, observer) => {
        for (const entry of entries) if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          loadCover(entry.target.dataset.spine || entry.target.dataset.cover || entry.target.dataset.read);
        }
      }, {rootMargin:'180px'});
      for (const el of v.root.querySelectorAll('[data-spine],.bs-mini[data-cover],.bs-book[data-read]')) coverObserver.observe(el);
    } else {
      for (const id of targets.keys()) {
        if (token !== epoch || v.disposed) break;
        await loadCover(id);
      }
    }
  }
  async function pickCompanion(target) {
    const contacts = api.chatContacts();
    const key = await menu(ctx, '和谁一起看', [{key: '-', label: '自己看'}, ...contacts.map(c => ({key: c.name, label: c.name}))]);
    if (!key) return;
    const result = await api.updateReadingBook(target.id, {companion: key === '-' ? '' : key});
    if (book?.id === target.id) book = {...book, companion: result.companion}; else await shelf();
  }
  /** Asks for a category name (an existing one, a new one, or none) — returns {shelf} or null when the user backs out. */
  async function askShelf(current = '') {
    const cats = categories();
    const key = await menu(ctx, '放进分类', [...cats.map(c => ({key: 'c:' + c, label: c, note: c === current ? '现在在这里' : ''})), {key: 'new', label: '新建分类', icon: 'add'}, {key: 'none', label: '移出分类', icon: 'close'}]);
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
  function manageCategories(){
    const d=ctx.dialog('管理分类', categories().map(name=>swipeRow(name,'<strong>'+esc(name)+'</strong>',[{key:'rename',label:'改名',icon:'edit'},{key:'remove',label:'解散',icon:'trash',danger:true}],{label:name})).join(''));
    d.body.classList.add('bs-category-manager');
    const control=mountSwipeList(d.body,{ctx,onAction:async(action,name)=>{
      const ids=books.filter(b=>b.shelf===name).map(b=>b.id);
      d.close();
      if(action==='remove'){
        if(!await ctx.confirm('解散「'+name+'」？','这 '+ids.length+' 本书将移到未分类。')) return;
        await api.updateReadingBooks(ids,{shelf:''});
      } else {
        const form=ctx.dialog('分类改名',field('分类名',input('rename',name,'text','maxlength="20"'))+btn('save-name','保存','primary'));
        const next=await new Promise(resolve=>{form.onClose(()=>resolve('')); form.body.querySelector('button[data-action=save-name]').onclick=()=>{const value=form.body.querySelector('input').value.trim();if(!value)return;resolve(value);form.close();};});
        if(!next || next===name)return;
        if(categories().includes(next)){ctx.notify('这个分类名已经存在');return;}
        await api.updateReadingBooks(ids,{shelf:next}); if(filter===name)filter=next;
      }
      await shelf();
    }}); d.onClose(()=>control.dispose());
  }
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
    const key = await menu(ctx, b.title, [{key: 'shelf', label: '放进分类', icon: 'layers', note: b.shelf || '没分类'}, {key: 'info', label: '信息', icon: 'book'}, {key: 'stats', label: '阅读统计', icon: 'clock'}, {key: 'reset', label: '清除进度', icon: 'back'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}]);
    if (key === 'info') {
      const left = readingLeft(b, b.stats);
      ctx.dialog('书籍信息', `<p><strong>${esc(b.title)}</strong></p><p>${esc(b.author || '作者未注明')} · ${b.type === 'comic' ? '漫画' : '小说'} · ${b.chapters.length} ${b.type === 'comic' ? '页' : '节'} · ${size(b.size)}</p>${normalizeStats(b.stats).sec ? `<p>一共读了 ${span(normalizeStats(b.stats).sec)}${left ? `，按这个速度还剩约 ${span(left)}` : ''}。</p>` : ''}<p class="hint">导入时复制了一份存在这台设备的浏览器里，占 ${size(b.size)}；原文件不会被改动，删掉这本书就释放空间。</p>`);
    }
    if (key === 'shelf') { const answer = await askShelf(b.shelf || ''); if (answer) { await api.updateReadingBook(id, {shelf: answer.shelf}); await shelf(); } }
    if (key === 'stats') await statsSheet(b);
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
    const pick = doc.createElement('input'); pick.type = 'file'; pick.multiple = true; pick.accept = bookFileAccept;
    pick.onchange = () => runImport([...pick.files]).catch(fail);
    pick.click();
  }
  async function runImport(files) {
    const items = (await bookImports(files)).sort((a, b) => naturalCompare(a.name, b.name));
    if (!items.length) { ctx.notify('没有找到支持的书籍或漫画图片'); return; }
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
        await api.addReadingBook({name: item.name, title: b.title, author: b.author, type: b.type, estimatedPages: b.estimatedPages, chapters: b.chapters.map(c => c.image ? {title: c.title, source: c.source, image: c.image} : {title: c.title}), ...(s && series.get(s) > 1 ? {shelf: s} : {})}, blob, b.cover ? await b.image(b.cover) : null);
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
  function bookOptions(id, initialTab, {library = false, over = false} = {}) {
    let target = book?.id === id ? book : books.find(b => b.id === id);
    if (!target) return;
    const d = ctx.dialog('书架设置', '', {over});
    let tab = initialTab, refreshReader = false;
    const render = () => {
      const s = {...readerDefaults, ...target.settings}, refs = readingSources(s);
      const mate = target.companion || '';
      const names = [...new Set([mate, ...(api.chatContacts?.() || []).map(c => c.name)].filter(Boolean))];
      const heading = library ? field('当前书籍', select('options-book', target.id, books.map(b => [b.id, b.title])))
        : `<p class="bs-options-title">《${esc(target.title)}》</p>`;
      const tabs = [['together','共读'],['reading','阅读']].map(([value,label]) =>
        `<button type="button" data-options-tab="${value}" aria-pressed="${tab === value}">${label}</button>`).join('');
      const group = (title, rows) => `<section class="bs-options-group"><h3>${title}</h3>${rows}</section>`;
      const together = () => field('和谁一起看', select('mate', mate, [['','自己看'],...names.map(n=>[n,n])]))
        + group('聊书和批注时参考', toggle('withPersona','角色人设',refs.persona,'优先使用联系人设，留空时读取同名酒馆角色卡的描述和性格。')
          + toggle('withUserPersona','我的酒馆人设',refs.userPersona,'参考当前酒馆用户的名字与人设描述。关闭时只使用名字。')
          + toggle('withLore','世界书',refs.lore,'扫描本页和角色名，沿用聊天预设的书目、条目筛选和预算。')
          + toggle('withStory','酒馆剧情',refs.story,'读取当前酒馆聊天的可见正文，按聊天预设的字数范围截取。')
          + toggle('withHistory','最近私聊',refs.history,'读取你和这位角色的手机私聊，条数跟随聊天预设。'))
        + group('页边批注',toggle('occasionalNotes','偶尔留评',s.occasionalNotes === true) + toggle('annotations','显示已留的批注',s.annotations));
      const reading = () => group('翻阅', field('阅读方式',select('mode',s.mode,[['pages','左右翻页'],['scroll','上下滚动']]))
        + (target.type === 'comic' ? toggle('rtl','从右往左翻',s.rtl) : s.mode === 'pages' ? field('翻页效果',select('effect',effectOf(s.effect),[['page','仿真翻页'],['slide','平滑滑动'],['none','直接翻页']])) : ''))
        + group('版面', (target.type === 'comic' ? '' : field('字号',input('size',s.size,'range','min="14" max="30" step="1"'))
          + field('行距',input('line',s.line,'range','min="1.3" max="2.6" step="0.1"'))
          + field('页边距',input('margin',s.margin,'range','min="12" max="40" step="2"'))
          + field('字体',select('font',s.font,[['serif','衬线'],['sans-serif','无衬线']])))
          + field('纸张',select('theme',s.theme,[['auto','跟随手机'],['white','白纸'],['cream','米黄'],['green','护眼绿'],['night','夜间']])));
      d.body.innerHTML = `<div class="bs-options">${heading}<div class="bs-options-tabs" role="group" aria-label="设置分类">${tabs}</div>${tab === 'together' ? together() : reading()}</div>`;
    };
    render();
    d.body.addEventListener('click', e => {
      const button = e.target.closest('[data-options-tab]');
      if (button) { tab = button.dataset.optionsTab; render(); d.body.querySelector(`[data-options-tab="${tab}"]`).focus(); }
    });
    d.body.addEventListener('change', e => {
      const el = e.target, key = el.dataset.field;
      if (!key) return;
      if (key === 'options-book') { target = books.find(b=>b.id === el.value); render(); return; }
      const id = target.id;
      const value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      const patch = key === 'mate' ? {companion:value} : {settingsPatch:{[key]:value}};
      if (key === 'mate') target.companion = value;
      else target.settings = {...target.settings,[key]:value};
      if (key === 'mode') render();
      refreshReader ||= book?.id === id;
      preferenceWrites = preferenceWrites.then(async () => {
        const saved = await api.updateReadingBook(id, patch);
        if (book?.id === id) {
          if (key === 'mate') book.companion = saved.companion;
          else book.settings = {...book.settings,[key]:saved.settings[key]};
        }
      }).catch(async error => {
        fail(error);
        const saved = await api.getReadingBook(id);
        if (saved && target.id === id && d.live) { Object.assign(target,saved); render(); }
      });
    });
    d.onClose(() => preferenceWrites.then(() => {
      if (!v.disposed && refreshReader && reader && book?.id === id) return showChapter(book.position.chapter,book.position.fraction);
    }).catch(fail));
    return d;
  }
  const settings = () => book && bookOptions(book.id,'reading');
  /** 目录、书签和书摘 in one sheet with three tabs (0.9.52). */
  async function contents(start = 'toc') {
    let tab = start;
    const d = ctx.dialog('目录与书签', '');
    const paint = () => {
      if (!d.live) return;
      const marks = book.bookmarks || [], picks = normalizeHighlights(book.highlights);
      const tabs = `<div class="segmented bs-tabs">${[['toc', `目录`], ['marks', `书签${marks.length ? ` ${marks.length}` : ''}`], ['picks', `书摘${picks.length ? ` ${picks.length}` : ''}`], ['notes','本章批注']].map(([k, t]) => `<button type="button" data-btab="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>`;
      const body = tab === 'marks' ? (marks.length ? marks.map((m, i) => `<button class="bs-row-link" data-mark="${i}"><strong>${esc(book.chapters[m.chapter]?.title || '')}</strong><small>${Math.round((m.fraction || 0) * 100)}%</small></button>`).join('') : '<p class="hint">还没有书签。看的时候点下面中间的「书签」。</p>')
        : tab === 'notes' ? (normalizeAnnotations(book.annotations).filter(n => n.chapter === book.position.chapter).map(n => `<div class="bs-pick"><strong>${esc(n.who)}</strong><p>${esc(n.text)}</p></div>`).join('') || '<p class="hint">本章还没有批注。</p>')
        : tab === 'picks' ? (picks.length ? picks.map(h => `<div class="bs-pick"><button type="button" class="bs-pick-go" data-pick="${esc(h.id)}"><strong>${esc(book.chapters[h.chapter]?.title || '')}</strong><p>${esc(h.text)}</p></button><div class="bs-pick-acts">${btn('pick-send', icon('chat'), 'round-button', `data-id="${esc(h.id)}" aria-label="发给 TA"`)}${btn('pick-del', icon('trash'), 'round-button', `data-id="${esc(h.id)}" aria-label="删掉这段书摘"`)}</div></div>`).join('') : '<p class="hint">长按一段文字，选「划线」就收进这里。</p>')
          : `<div class="reading-toc">${book.bookmarks.length ? '' : ''}${book.chapters.map((c, i) => `<button data-chapter="${i}" ${i === book.position.chapter ? 'aria-current="true"' : ''}>${esc(c.title)}</button>`).join('')}</div>`;
      d.body.innerHTML = tabs + (tab === 'toc' ? '<label class="qq-search bs-chapter-search">'+icon('search')+'<input type="search" data-find-chapter aria-label="查找章节" placeholder="搜索章节名或序号"></label>' : '') + '<div class="bs-directory-list">'+body+'</div>';
      const search=d.body.querySelector('[data-find-chapter]');
      if(search) search.oninput=()=>{ const q=search.value.trim().toLowerCase();
        for(const item of d.body.querySelectorAll('[data-chapter]')) item.hidden=!!q && !item.textContent.toLowerCase().includes(q) && String(Number(item.dataset.chapter)+1)!==q;
      };
      const current=d.body.querySelector('[aria-current=true]'), list=d.body.querySelector('.bs-directory-list'); if(current && list) list.scrollTop=current.offsetTop-list.clientHeight/2;
    };
    paint();
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.btab) { tab = b.dataset.btab; paint(); return; }
      if (b.dataset.pick) { const h = normalizeHighlights(book.highlights).find(x => x.id === b.dataset.pick); d.close(); if (h) showChapter(h.chapter, 0).then(() => {
        const block = blocks[h.para], pane = $('.reading-page'); if (!block || !pane) return;
        const pos = point(block,h.start || 0), r = doc.createRange();
        if (pos) { r.setStart(...pos); r.collapse(true); }
        const rect = (pos && r.getBoundingClientRect?.()) || block.getBoundingClientRect(), view = pane.getBoundingClientRect();
        if (book.settings.mode === 'pages') {
          page = Math.max(0,Math.min(pages-1,page + Math.floor((rect.left-view.left)/Math.max(1,pane.clientWidth))));
          content.style.transform = `translateX(${-page*pane.clientWidth}px)`;
          return savePosition(page/Math.max(1,pages-1));
        }
        pane.scrollTop += rect.top-view.top;
      }).catch(fail); return; }
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
    const view = pane.getBoundingClientRect();
    for (const [i, el] of (blocks.length ? blocks : [...(content?.children || [])]).entries()) if ([...el.getClientRects()].some(r => r.bottom > view.top && r.top < view.bottom && r.left < view.right && r.right > view.left)) return i;
    return 0;
  }
  let content = null, blocks = [];   // blocks: the paragraphs by their data-para, before any note is put in
  function visible() {
    const pane = $('.reading-page'), text = [];
    let anchor;
    if (pane && content && book.type !== 'comic') {
      const r = pane.getBoundingClientRect(), walker = doc.createTreeWalker(content, 4), range = doc.createRange();
      for (let node = walker.nextNode(), used = 0; node && used < 2200; node = walker.nextNode()) {
        if (node.parentElement.closest('[data-reading-extra]') || !range.getClientRects) continue;
        const len = node.length;
        range.selectNodeContents(node);
        const inside = b => b.bottom > r.top && b.top < r.bottom && b.left < r.right && b.right > r.left;
        const rects = [...range.getClientRects()];
        if (!rects.some(inside)) continue;
        let start = 0, end = len;
        if (!rects.every(inside)) {
          // Column order is monotonic even though line beginnings inside a column move left again.
          const before = b => book.settings.mode === 'scroll' ? b.bottom <= r.top : b.right <= r.left;
          const after = b => book.settings.mode === 'scroll' ? b.top >= r.bottom : b.left >= r.right;
          const first = predicate => { let a=0,b=len; while (a<b) { const m=(a+b)>>1; range.setStart(node,m); range.setEnd(node,m+1); if (predicate(range.getBoundingClientRect())) b=m; else a=m+1; } return a; };
          start = first(b => !before(b)); end = first(after);
        }
        const bit = node.data.slice(start,end);
        if (bit.trim() && !anchor) { const para = blocks.findIndex(el => el.contains(node)); if (para >= 0) anchor = {para,offset:offsetAt(blocks[para],node,start)}; }
        text.push(bit); used += bit.length;
      }
    }
    return {chapter: book.position.chapter, para: visiblePara(), ...anchor, page: page + 1, text: text.join('\n').trim().slice(0, 2200)};
  }
  async function savePosition(fraction, turn = false) {
    if (!book) return;
    activeAt = Date.now();
    const id = book.id, p = {...book.position, fraction};
    const position = `${id}|${p.chapter}|${Math.round(p.fraction * 10000)}`;
    turn = turn && lastPosition !== null && lastPosition !== position; lastPosition = position;
    book.position = p; paintRibbon(); if (turn) book.turns = (book.turns || 0) + 1;
    const stats = turn ? flushRead() : null;
    const saved = await api.updateReadingBook(id, {position: p, turns: book.turns, lastRead: Date.now(), ...(stats ? {stats} : {})});
    if (book?.id !== id || book.position.chapter !== p.chapter || book.position.fraction !== p.fraction) return;
    book.lastRead = saved.lastRead;
    const label = $('[data-reading-count]'); if (label) label.textContent = `${book.chapters[p.chapter]?.title || ''} · ${page + 1}/${pages}`;
    const slider = $('[data-reading-progress]'); if (slider) slider.value = ((p.chapter + p.fraction) / book.chapters.length) * 100;
    const folio = $('[data-folio-page]'); if (folio) folio.textContent = book.settings.mode === 'pages' ? `${page + 1} / ${pages}` : `${Math.round(p.fraction * 100)}%`;
    if (turn) {
      win.clearTimeout(noteTimer);
      if (book.settings.occasionalNotes && book.companion) noteTimer = win.setTimeout(() => {
        if (position === lastPosition && !doc.hidden && stage?.isConnected !== false && !doc.querySelector('.sheet') && stillReading()) maybeNote().catch(fail);
      }, 60000);
    }
  }
  /** The character's notes, tucked in after the paragraph each one is about: the words make room, nothing is covered. */
  function showNotes() {
    if (!content) return;
    for (const old of content.parentElement?.querySelectorAll('.reading-note-inline') || []) old.remove();
    if (book.settings.annotations === false) return;
    const notes = normalizeAnnotations(book.annotations).filter(n => n.chapter === book.position.chapter);
    for (const n of notes) {
      if (!n.para && !Number.isInteger(n.offset)) continue;
      const el = doc.createElement('details');
      el.dataset.readingExtra = '';
      el.className = 'reading-note-inline';
      el.innerHTML = `<summary>${esc(n.who || book.companion || '读书')}的批注</summary><p>${esc(n.text)}</p>`;
      el.addEventListener('click', e => e.stopPropagation());
      const target = blocks[n.para];
      const p = target && Number.isInteger(n.offset) && point(target,n.offset);
      if (p) { const r = doc.createRange(); r.setStart(...p); r.collapse(true); r.insertNode(el); } else if (target) target.after(el);
    }
  }
  async function maybeNote() {
    if (noteBusy || !book?.settings.occasionalNotes || !annotationDue(book) || Date.now() - (book.annotations?.at(-1)?.at || 0) < 600000) return;
    noteBusy = true;
    const target = book, view = visible(), source = reader, image = chapter?.images[0], day = new Date().toLocaleDateString('sv-SE');
    const companion = target.companion, sources = readingSources(target.settings);
    const samePreferences = b => b?.id === target.id && b.companion === companion && b.settings?.occasionalNotes === true
      && Object.entries(readingSources(b.settings)).every(([key, value]) => sources[key] === value);
    try {
      const reserved = await api.updateReadingBook(target.id, {nextNote: (target.turns || 0) + 6 + Math.floor(Math.random() * 5), daily: {day, count: (target.daily?.day === day ? target.daily.count : 0) + 1}});
      if (!samePreferences(book)) return;
      book = {...book, nextNote: reserved.nextNote, daily: reserved.daily};
      const blob = target.type === 'comic' && image ? await source.image(image) : null;
      if (!samePreferences(book)) return;
      const text = await readingSend(api, target, view, '', {blob, annotation: true});
      if (text) {
        const current = await api.getReadingBook(target.id);
        if (!samePreferences(current) || (book?.id === target.id && !samePreferences(book))) return;
        const note = {chapter: view.chapter, para: view.para, offset:view.offset, text: text.slice(0, 120), who: companion, at: Date.now()};
        const saved = await api.updateReadingBook(target.id, {annotations: normalizeAnnotations([...(current.annotations || []), note])});
        if (book?.id === target.id && book.companion === target.companion) { book = {...book, annotations: saved.annotations}; showNotes(); }
      }
    } finally { noteBusy = false; }
  }
  async function chatPanel(quote = '') {
    if (!book?.companion) { await pickCompanion(book); if (!book?.companion) return; }
    const target=book, source=reader, companion=target.companion;
    const contact=api.chatContacts().find(c=>c.name===companion);
    const key='readingThreads:'+JSON.stringify([contact?.id || '',companion]);
    await openReadingThreads(ctx,{book:target,key,companion,quote,visible,openSettings:()=>bookOptions(target.id,'together',{over:true}), async respond(messages,view,memoryText){
      const blob=target.type==='comic' ? await source.image((await source.chapter(view.chapter)).images[0]) : null;
      if(target.type==='comic' && !blob) throw Error('未读到这页漫画，可以重试');
      return api.readingReply({companion,sources:readingSources(target.settings),messages,blob,memoryText,
        reading:readingContext(target,view,api.readState().promptRules)});
    }});
  }
  function paintRibbon() {
    const root = album?.root || stage;
    if (!root || !book) return;
    const marked = book.bookmarks?.some(m=>m.chapter===book.position.chapter && Math.abs(m.fraction-book.position.fraction)<.01);
    let ribbon = root.querySelector('.bs-ribbon');
    if (!marked) { ribbon?.remove(); return; }
    if (!ribbon) { ribbon=doc.createElement('span'); ribbon.className='bs-ribbon'; ribbon.setAttribute('aria-label','本页已加书签'); root.append(ribbon); }
  }
  async function bookmark() {
    const p = {...book.position}, marks = book.bookmarks || [], found = marks.findIndex(m => m.chapter === p.chapter && Math.abs(m.fraction - p.fraction) < .01);
    book = await api.updateReadingBook(book.id, {bookmarks: found < 0 ? [...marks, p].slice(-200) : marks.filter((_, i) => i !== found)}); paintRibbon(); ctx.notify(found < 0 ? '已加书签' : '已移除书签');
  }
  function enableSelection(pane) {
    let bar, selected, settling;
    function refresh() {
      const sel = win.getSelection();
      const h = selectedRange(sel,blocks);
      if (!h) { bar?.remove(); bar = null; return; }
      selected = {...h,chapter:book.position.chapter};
      if (!bar) {
        bar = doc.createElement('div'); bar.className = 'reading-tools';
        for (const [action,glyph,label] of [['mark','star','划线或取消划线'],['draw','paint','为选中文字生图'],['send','chat','发给 TA'],['copy','copy','复制']]) {
          if (action==='draw' && api.getState().draw.selectionDraw===false) continue;
          bar.insertAdjacentHTML('beforeend',btn('para-'+action,icon(glyph),'reading-tool',`aria-label="${label}" title="${label}"`));
        }
        stage.append(bar);
        bar.onpointerdown = e => e.preventDefault();
        bar.onclick = async e => {
          const action = e.target.closest('button')?.dataset.action, h = selected, target = book.id;
          if (!action) return;
          sel.removeAllRanges(); bar?.remove(); bar = null;
          try {
            if (action === 'para-mark') {
              const list = toggleHighlight(book.highlights,h), saved = await api.updateReadingBook(target,{highlights:list});
              if (book?.id === target) { book.highlights = saved.highlights; paintMarks(); }
            } else if (action === 'para-draw') await art.selected(book,h);
            else if (action === 'para-send') await chatPanel(h.text);
            else ctx.notify(await copyText(win,h.text) ? '已复制书摘' : '无法访问剪贴板，请用系统菜单复制');
          } catch (error) { fail(error); }
        };
      }
      const rect = [...(sel.getRangeAt(0).getClientRects?.() || [])].at(-1) || pane.getBoundingClientRect();
      const host = stage.getBoundingClientRect();
      bar.style.left = Math.max(4,Math.min(host.width-bar.offsetWidth-4,rect.right-host.left-bar.offsetWidth/2))+'px';
      bar.style.top = Math.max(4,Math.min(host.height-bar.offsetHeight-4,rect.bottom-host.top+24))+'px';
    }
    function moved() { if(!bar) { refresh();return; } bar.style.visibility='hidden'; win.clearTimeout(settling); settling=win.setTimeout(()=>{refresh();if(bar) bar.style.visibility='';},100); }
    doc.addEventListener('selectionchange',moved);
    pane.addEventListener('scroll',refresh);
    detachSelection = () => { win.clearTimeout(settling);doc.removeEventListener('selectionchange',moved); pane.removeEventListener('scroll',refresh); bar?.remove(); detachSelection = () => {}; };
  }
  function paintMarks() {
    if (!content) return;
    for (const mark of content.querySelectorAll('[data-underline]')) mark.replaceWith(...mark.childNodes);
    for (const el of blocks) el.classList.remove('reading-mark');
    for (const h of normalizeHighlights(book.highlights).filter(h => h.chapter === book.position.chapter)) {
      if (h.start === undefined) blocks[h.para]?.classList.add('reading-mark');
      else for (let i=h.para;i<=h.endPara && i<blocks.length;i++) underline(blocks[i],i===h.para?h.start:0,i===h.endPara?h.end:Infinity);
    }
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
  function paperEnabled() {
    return !!$('.reading-page')?.clientWidth && book?.settings.mode === 'pages' && effectOf(book.settings.effect) === 'page' && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  function preview(step, distance) {
    const pane = $('.reading-page');
    const next = page + step;
    if (!pane || next < 0 || next >= pages) return false;
    if (leaf?.step !== step) { leaf?.remove(); leaf = paperTurn(win,pane,content,page,step); }
    content.style.transition = 'none';
    content.style.transform = `translateX(${-next * pane.clientWidth}px)`;
    leaf.move(distance / Math.max(1,pane.clientWidth));
    return true;
  }
  function cancelDrag() {
    if (!content) return;
    const sheet = leaf;
    if (sheet) {
      turning = true;
      sheet.finish(false).then(() => {
        if (leaf !== sheet) return;
        content.style.transform = `translateX(${-page * $('.reading-page').clientWidth}px)`;
        leaf = null; turning = false;
      });
    } else {
      content.style.transition = '';
      content.style.transform = `translateX(${-page * $('.reading-page').clientWidth}px)`;
    }
  }
  async function showChapter(index, fraction = 0, didTurn = false) {
    if (!reader || index < 0 || index >= book.chapters.length) return;
    resetPage(); detachSelection(); win.clearTimeout(noteTimer);
    const token = ++epoch, a = album; album = null; a?.close(); resize?.disconnect(); clearURLs();
    content = null; blocks = [];
    book.position = {chapter: index, fraction}; const nextChapter = await reader.chapter(index); if (token !== epoch) return; chapter = nextChapter;
    if (book.type === 'comic' && book.settings.mode === 'pages') { stage?.remove(); stage = null; content = null; blocks = []; await comic(index); return; }
    const s = book.settings, hidden = stage?.querySelector('.reading-reader')?.classList.contains('reading-hidden') ?? true;
    openStage(`<section class="reading-reader${hidden ? ' reading-hidden' : ''}" data-paper="${esc(s.theme)}" data-mode="${esc(s.mode)}" data-effect="${esc(effectOf(s.effect))}" style="--read-size:${s.size}px;--read-line:${s.line};--read-margin:${s.margin}px;--read-font:${s.font}"><header class="reading-bar"><button data-action="shelf" aria-label="返回书架">${icon('back')}</button><span>${esc(book.title)}</span><button data-action="settings" aria-label="阅读设置">${icon('sliders')}</button></header><div class="reading-page" tabindex="0"><article class="reading-content">${chapter.html}</article></div><div class="reading-folio" aria-hidden="true"><span data-folio-title>${esc(book.chapters[index]?.title || '')}</span><span data-folio-page></span></div><footer class="reading-bottom"><small data-reading-count></small><input aria-label="阅读进度" data-reading-progress type="range" min="0" max="100" step="0.01"><nav><button data-action="toc">${icon('book')}目录</button><button data-action="bookmark">${icon('star')}书签</button><button data-action="chat">${icon('chat')}一起看</button></nav></footer></section>`);
    const pane = $('.reading-page'); content = $('.reading-content');
    // Each block gets its number: 书摘 and notes remember where they sit by it (0.9.52).
    blocks = [...content.children];
    blocks.forEach((el, i) => { el.dataset.para = String(i); });
    for (const img of content.querySelectorAll('[data-book-image]')) { const blob = await reader.image(img.dataset.bookImage); if (token !== epoch) return; if (blob) img.src = url(blob); }
    art.paint(book.id);
    paintMarks(); showNotes();
    await new Promise(resolve => win.requestAnimationFrame(resolve)); if (token !== epoch) return;
    let laidOut = false;
    const layout = () => {
      if (token !== epoch || leaf) return;
      const fraction = book.position.fraction;
      content.style.width = pane.clientWidth + 'px';
      const count = s.mode === 'pages' ? Math.max(1,Math.round(content.scrollWidth / Math.max(1,pane.clientWidth))) : 1;
      const changed = !laidOut || pages !== count;
      pages = count; page = Math.round(fraction * (pages - 1));
      if (s.mode === 'pages') content.style.transform = `translateX(${-page * pane.clientWidth}px)`;
      else if (!laidOut) pane.scrollTop = fraction * Math.max(0,pane.scrollHeight - pane.clientHeight);
      if (changed) savePosition(fraction,didTurn).catch(fail);
      laidOut = true; didTurn = false;
    };
    refreshLayout = layout; layout();
    if (win.ResizeObserver) { resize = new win.ResizeObserver(layout); resize.observe(pane); }
    paintRibbon();
    enableSelection(pane);
    let start = null, swiped = false, drag = 0;
    pane.addEventListener('pointerdown', e => {
      if (token !== epoch || turning || e.target.closest('[data-reading-extra]')) return;
      activeAt = Date.now(); start = {x:e.clientX,y:e.clientY}; swiped = false; drag = 0;
    });
    pane.addEventListener('pointermove', e => {
      if (!win.getSelection()?.isCollapsed) return;
      // 手指拖着时页跟着手走 (0.9.52), only where a page can turn and the finger goes sideways.
      if (!start || swiped || s.mode !== 'pages' || effectOf(s.effect) === 'none') return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 12) return;
      if (paperEnabled() && preview(dx < 0 ? 1 : -1,Math.abs(dx))) { drag = dx; return; }
      if (leaf) { leaf.remove(); leaf = null; }
      const at = (page <= 0 && dx > 0) || (page >= pages - 1 && dx < 0) ? dx * .22 : dx * .5;
      drag = at;
      content.style.transition = 'none';
      content.style.transform = `translateX(${-page * pane.clientWidth + at}px)`;
    });
    const endDrag = e => {
      if (!win.getSelection()?.isCollapsed || e.type === 'pointercancel') { start=null; if (drag) cancelDrag(); drag=0; return; }
      if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      content.style.transition = '';
      if (drag) {
        drag = 0; swiped = true;
        if (Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1).catch(fail);
        else cancelDrag();
        return;
      }
      if (s.mode === 'pages' && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { swiped = true; turn(dx < 0 ? 1 : -1).catch(fail); }
      else if (s.mode === 'scroll' && Math.abs(dy) > 65) { swiped = true; if (dy < 0 && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 2) turn(1).catch(fail); else if (dy > 0 && pane.scrollTop <= 1) turn(-1).catch(fail); }
    };
    pane.addEventListener('pointerup', endDrag);
    pane.addEventListener('pointercancel', endDrag);
    pane.addEventListener('click', e => {
      activeAt = Date.now();
      if (token !== epoch || swiped || !win.getSelection()?.isCollapsed || e.target.closest('[data-reading-extra]')) return;
      const r = pane.getBoundingClientRect(), x = e.clientX - r.left;
      if (s.mode === 'pages' && (x < r.width * .22 || x > r.width * .78)) turn(x < r.width * .22 ? -1 : 1);
      else $('.reading-reader').classList.toggle('reading-hidden');
    });
    pane.addEventListener('toggle', e => { if (e.target.matches('.reading-note-inline')) layout(); }, true);
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
      onPage: id => { const n = Number(id); activeAt = Date.now(); book.position = {chapter: n, fraction: 0}; page = n; pages = book.chapters.length; paintRibbon(); const range=album?.root.querySelector('.reading-comic-progress'); if(range) range.value=String(n); reader.chapter(n).then(c => { if (book?.id !== owner || book.position.chapter !== n) return; chapter = c; savePosition(0, true).catch(fail); }); },
      onPullDown: () => bookmark().catch(fail),
      onHold: () => chatPanel('这一页漫画'), onClose: () => { if (album) { album = null; if (book?.settings.mode === 'scroll') showChapter(book.position.chapter, book.position.fraction).catch(fail); else shelf().catch(fail); } },
      actions: [{key: 'toc', icon: 'book', label: '目录', run: contents}, {key: 'bookmark', icon: 'star', label: '书签', run: bookmark}, {key: 'chat', icon: 'chat', label: '一起看', run: () => chatPanel()}, {key: 'settings', icon: 'sliders', label: '设置', run: settings}]});
    album.root.setAttribute('aria-label', book.title); album.root.querySelector('[data-av=close]').setAttribute('aria-label', '返回书架');
    const slider = doc.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(book.chapters.length - 1); slider.value = String(index); slider.setAttribute('aria-label', '漫画进度'); slider.className = 'reading-comic-progress'; slider.onchange = () => showChapter(Number(slider.value)).catch(fail); album.root.querySelector('.album-bar').before(slider); paintRibbon(); showNotes();
  }
  async function turn(step) {
    if (!book || !content || turning) return;
    activeAt = Date.now();
    const next = page + step, pane = $('.reading-page'), token = epoch;
    if (book.settings.mode === 'pages' && book.type !== 'comic' && next >= 0 && next < pages) {
      turning = true;
      try {
        if (paperEnabled() && (leaf || preview(step,0))) {
          await leaf.finish(true);
          if (epoch !== token) return;
          leaf = null;
        }
        page = next;
        content.style.transition = effectOf(book.settings.effect) === 'slide' ? 'transform .28s ease' : 'none';
        content.style.transform = `translateX(${-page * pane.clientWidth}px)`;
        await savePosition(page / Math.max(1, pages - 1), true);
      } finally { if (epoch === token) turning = false; }
    } else {
      cancelDrag();
      const index = book.position.chapter + step;
      if (index < 0 || index >= book.chapters.length) { ctx.notify(step > 0 ? '已经是最后一页' : '已经是第一页'); return; }
      const sheet = pane && paperEnabled() && paperTurn(win,pane,content,page,step);
      try {
        await showChapter(index,step < 0 ? 1 : 0,true);
        if (sheet && epoch === token + 1 && $('.reading-page')) {
          turning = true; leaf = sheet;
          sheet.attach($('.reading-page')); await sheet.finish(true);
        }
      } finally {
        if (sheet && leaf === sheet) { leaf = null; turning = false; refreshLayout(); }
        sheet?.remove?.();
      }
    }
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
    leave(); const token = epoch; await preferenceWrites; if (token !== epoch) return; const next = await api.getReadingBook(id); if (token !== epoch) return; book = next; if (!book) return shelf();
    book.settings = {...readerDefaults, ...book.settings}; book.stats = normalizeStats(book.stats);
    book = {...book, ...(await api.updateReadingBook(id, {settings: book.settings}))}; if (token !== epoch) return;
    book.highlights = normalizeHighlights(book.highlights); book.annotations = normalizeAnnotations(book.annotations);
    const f = await api.readingBookFile(id); if (token !== epoch) return; if (!f?.blob) throw Error('原书文件不在这台设备上，请重新导入');
    const opened = await openBook(f.blob, book.name, win.DOMParser); if (token !== epoch) return; reader = opened;
    if (!book.estimatedPages && reader.estimatedPages) {
      await api.updateReadingBook(book.id, {estimatedPages: reader.estimatedPages});
      if (token !== epoch) return;
      book.estimatedPages = reader.estimatedPages;
    }
    if (book.type === 'comic' && !book.chapters[0]?.image) { const pos = book.position; const rows = await comicPages(token); if (!rows) return; book.chapters = rows; book.position = pos?.chapter < rows.length ? pos : {chapter: 0, fraction: 0}; }
    if (book.type === 'comic' && book.chapters[0]?.image) { const base = reader.chapter, rows = book.chapters; reader.chapter = async i => { const c = await base(rows[i].source); return {...c, images: [rows[i].image], html: `<img data-book-image="${esc(rows[i].image)}" alt="漫画页">`}; }; }
    await showChapter(book.position.chapter, book.position.fraction);
  }
  v.on('click', '[data-read]', el => {
    if (!picking) return details(el.dataset.read);
    const id = el.dataset.read;
    if (mark.has(id)) mark.delete(id); else mark.add(id);
    el.classList.toggle('picked', mark.has(id));
    el.setAttribute('aria-pressed', String(mark.has(id)));
    const bar = v.root.querySelector('.bs-pickbar');
    bar.querySelector('span').textContent = mark.size ? `选了 ${mark.size} 本` : '点书选择';
    for (const button of bar.querySelectorAll('button')) button.disabled = !mark.size;
  });
  v.on('click', '[data-more]', el => more(el.dataset.more).catch(fail));
  v.on('click', '[data-shelf]', el => { filter = el.dataset.shelf; shelf().catch(fail); });
  v.on('click', '[data-action]', el => ({import: importFiles, 'manage-categories':manageCategories, 'pick-start': () => { picking = 'pick'; mark.clear(); shelf().catch(fail); }, 'pick-done': () => { picking = null; mark.clear(); shelf().catch(fail); }, 'pick-shelf': shelfPicked, 'pick-delete': deletePicked, shelf: () => shelf().catch(fail)})[el.dataset.action]?.());
  v.back = () => { if (!book && filter!==ALL && !picking) { filter=ALL; shelf().catch(fail); return true; } if (!book) return false; shelf().catch(fail); return true; }; v.refresh = () => { if (!book) shelf().catch(fail); }; v.edit = id => open(id).catch(fail);
  const dispose = v.dispose; v.dispose = () => { leave(); art.dispose(); dispose(); };
  // A temporary system overlay hides the document without navigating away.
  v.suspend = () => {
    const stats=flushRead(); session=null;
    if(book && stats)api.updateReadingBook(book.id,{stats}).catch(fail);
  };
  v.resume = () => { if(reader && book && !session){activeAt=Date.now();session={at:activeAt,overall:overall()};} };
  v.leave = () => { leave(); book = null; };
  shelf().catch(fail);
  return v;
}

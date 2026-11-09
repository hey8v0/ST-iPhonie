import {createView, esc, heading, btn, empty, menu, field, select, input, toggle, size} from './common.js';
import {icon} from './icons.js';
import {openBook, bookImports, readerDefaults, annotationDue} from '../core/bookshelf.js';
import {readingSend} from '../core/reading-chat.js';
import {currentDm} from '../core/chats.js';
import {openAlbum} from './album-viewer.js';

export function bookshelfApp(ctx) {
  const {api, win, doc} = ctx, v = createView(ctx, 'bookshelf');
  let books = [], book = null, reader = null, chapter = null, page = 0, pages = 1, epoch = 0, album = null, busy = false, noteBusy = false, resize = null;
  const urls = new Set(), covers = new Map();
  const url = blob => { const u = win.URL.createObjectURL(blob); urls.add(u); return u; };
  const clearURLs = () => { for (const u of urls) win.URL.revokeObjectURL(u); urls.clear(); covers.clear(); };
  const fail = error => ctx.notify(error.message, {error: true});
  const progress = b => Math.round(((b.position?.chapter || 0) + (b.position?.fraction || 0)) / Math.max(1, b.chapters.length) * 100);
  function leave() { epoch++; resize?.disconnect(); resize = null; const a = album; album = null; a?.close(); reader = null; chapter = null; clearURLs(); }
  async function shelf() {
    leave(); book = null; v.root.removeAttribute('data-reading'); books = await api.listReadingBooks(); if (v.disposed) return;
    v.draw(heading('书架', btn('import', icon('plus') + ' 导入', 'text-button')) + '<p class="reading-caption">把喜欢的故事，留在手边。</p>' + (books.length ? `<div class="reading-grid">${books.map((b,i) => `<article class="reading-tile"><button class="reading-cover" data-read="${esc(b.id)}" style="--book-hue:${[30,155,205,340,70][i%5]}"><span>${esc(b.title)}</span><small>${esc(b.author || (b.type === 'comic' ? '漫画' : '小说'))}</small></button><div class="reading-title"><strong>${esc(b.title)}</strong><button data-more="${esc(b.id)}" aria-label="${esc(b.title)}的菜单">${icon('more')}</button></div><small>${progress(b) ? `已读 ${progress(b)}%` : '还没开始'}${b.companion ? ' · 和' + esc(b.companion) : ''}</small></article>`).join('')}</div>` : empty('下一段故事，从这里开始', '导入 EPUB 漫画、小说或 TXT；也可以一次选多本或一个 ZIP 书包。', 'book')) + '<p class="reading-caption reading-local">文件保存在本机，请保留原书文件。</p>');
    const mark = epoch;
    for (const b of books) { const f = await api.readingBookFile(b.id); if (mark !== epoch) return; if (f?.cover) { const u = url(f.cover); covers.set(b.id, u); const el = [...v.root.querySelectorAll('[data-read]')].find(el => el.dataset.read === b.id); if (el) el.innerHTML = `<img src="${u}" alt="${esc(b.title)}">`; } }
  }
  async function pickCompanion(target) {
    const contacts = api.chatContacts();
    const key = await menu(ctx, '和谁一起看', [{key: '-', label: '自己看'}, ...contacts.map(c => ({key: c.name, label: c.name}))]);
    if (!key) return;
    const result = await api.updateReadingBook(target.id, {companion: key === '-' ? '' : key});
    if (book?.id === target.id) { book = result; } else await shelf();
  }
  async function more(id) {
    const b = await api.getReadingBook(id); if (!b) return;
    const key = await menu(ctx, b.title, [{key:'info',label:'信息',icon:'book'}, {key:'companion',label:'和谁一起看',icon:'chat'}, {key:'reset',label:'清除进度',icon:'back'}, {key:'delete',label:'删除',icon:'trash',danger:true}]);
    if (key === 'info') ctx.dialog('书籍信息', `<p>${esc(b.title)}</p><p>${esc(b.author || '作者未注明')} · ${b.type === 'comic' ? '漫画' : '小说'}</p><p>${b.chapters.length} 节 · ${size(b.size)}</p><p class="hint">文件只存在这台设备；备份勾选「书架」会包含原书、进度和批注。请保留原书文件。</p>`);
    if (key === 'companion') await pickCompanion(b);
    if (key === 'reset') { await api.updateReadingBook(id, {position: {chapter:0, fraction:0}}); await shelf(); }
    if (key === 'delete' && await ctx.confirm('删除这本书？', '书籍、进度、书签和页边批注会从这台设备移除。')) { await api.deleteReadingBook(id); await shelf(); }
  }
  async function importFiles() {
    const pick = doc.createElement('input'); pick.type = 'file'; pick.multiple = true; pick.accept = '.epub,.txt,.zip';
    pick.onchange = async () => {
      let count = 0; const errors = [];
      try {
        const items = await bookImports([...pick.files]);
        for (const item of items) {
          ctx.notify(`正在导入 ${count + 1}/${items.length}：${item.name}`);
          try {
            const blob = await item.open(), b = await openBook(blob, item.name, win.DOMParser), chapters = [];
            if (b.type === 'comic') {
              for (let i=0;i<b.chapters.length;i++) { const c=await b.chapter(i); for(const image of c.images) chapters.push({...b.chapters[i],source:i,image}); if(i%16===0)await new Promise(resolve=>win.setTimeout(resolve,0)); }
              if(!chapters.length)throw Error('这本漫画没有可显示的图片');
            }
            await api.addReadingBook({name:item.name,title:b.title,author:b.author,type:b.type,chapters:chapters.length?chapters:b.chapters}, blob, b.cover ? await b.image(b.cover) : null); count++;
          }
          catch (e) { errors.push(item.name + '：' + e.message); }
        }
        await shelf(); ctx.notify(`导入了 ${count} 本书`);
        if (errors.length) ctx.dialog('有些书没有导入', `<p>${errors.map(esc).join('<br>')}</p>`);
      } catch (e) { fail(e); }
    }; pick.click();
  }
  function settings() {
    const s = book.settings;
    const d = ctx.dialog('阅读设置', field('翻阅方式', select('mode', s.mode, [['pages','左右翻页'],['scroll','上下滚动']])) + (book.type === 'comic' ? toggle('rtl','从右往左翻',s.rtl) : field('字号',input('size',s.size,'range','min="14" max="30" step="1"')) + field('行距',input('line',s.line,'range','min="1.3" max="2.6" step="0.1"')) + field('页边距',input('margin',s.margin,'range','min="12" max="40" step="2"')) + field('字体',select('font',s.font,[['serif','衬线'],['sans-serif','无衬线']]))) + field('纸张',select('theme',s.theme,[['auto','跟随手机'],['white','白纸'],['cream','米黄'],['green','护眼绿'],['night','夜间']])) + toggle('annotations','页边批注',s.annotations));
    d.body.addEventListener('change', async e => {
      const key = e.target.dataset.field; if (!key) return;
      const value = e.target.type === 'checkbox' ? e.target.checked : ['size','line','margin'].includes(key) ? Number(e.target.value) : e.target.value;
      book = await api.updateReadingBook(book.id, {settings: {...book.settings, [key]:value}});
    });
    d.onClose(() => { if (book && reader) showChapter(book.position.chapter, book.position.fraction).catch(fail); });
  }
  async function contents() {
    const d = ctx.dialog('目录与书签', `<div class="reading-toc">${book.bookmarks.map((m,i) => `<button data-mark="${i}">书签 · ${esc(book.chapters[m.chapter]?.title)} · ${Math.round(m.fraction*100)}%</button>`).join('')}${book.chapters.map((c,i) => `<button data-chapter="${i}" ${i === book.position.chapter ? 'aria-current="true"' : ''}>${esc(c.title)}</button>`).join('')}</div>`);
    d.body.addEventListener('click', e => { const el = e.target.closest('button'); if (!el) return; const m = el.dataset.mark !== undefined ? book.bookmarks[Number(el.dataset.mark)] : {chapter:Number(el.dataset.chapter),fraction:0}; d.close(); showChapter(m.chapter,m.fraction).catch(fail); });
  }
  function visible() {
    const pane = v.root.querySelector('.reading-page'), content = v.root.querySelector('.reading-content');
    let text = '';
    if (pane && content && book.type !== 'comic') {
      const r = pane.getBoundingClientRect(), walker = doc.createTreeWalker(content, 4), range = doc.createRange();
      for (let node = walker.nextNode(); node && text.length < 2200; node = walker.nextNode()) {
        const len = node.textContent.length;
        // Columns are monotone in x; scroll layout is monotone in y. Binary search avoids per-character layout reads.
        const coord = i => { range.setStart(node,i); range.setEnd(node,Math.min(len,i+1)); const b = range.getBoundingClientRect(); return book.settings.mode === 'scroll' ? b.top : b.left; };
        const low = book.settings.mode === 'scroll' ? r.top : r.left, high = book.settings.mode === 'scroll' ? r.bottom : r.right;
        const search = target => { let a=0,b=len; while(a<b) { const mid=(a+b)>>1; if(coord(mid)<target) a=mid+1; else b=mid; } return a; };
        if (len && typeof range.getBoundingClientRect === 'function') text += node.textContent.slice(search(low),search(high)) + '\n';
      }
    }
    return {chapter:book.position.chapter,page:page+1,text:text.trim().slice(0,2200)};
  }
  async function savePosition(fraction, turn = false) {
    if (!book) return;
    const id = book.id, p = {...book.position, fraction};
    book.position = p; if (turn) book.turns = (book.turns || 0)+1;
    const saved = await api.updateReadingBook(id,{position:p,turns:book.turns});
    if (book?.id !== id || book.position.chapter!==p.chapter || book.position.fraction!==p.fraction) return;
    book = {...book, ...saved};
    const label = v.root.querySelector('[data-reading-count]'); if (label) label.textContent = `${book.chapters[p.chapter]?.title} · ${page+1}/${pages}`;
    const slider = v.root.querySelector('[data-reading-progress]'); if (slider) slider.value = ((p.chapter + p.fraction)/book.chapters.length)*100;
    showNote();
    if (turn) maybeNote().catch(fail);
  }
  function showNote() {
    const host = album?.root || v.root, old = host.querySelector('.reading-note'); old?.remove();
    const note = book?.annotations.findLast(n => n.chapter === book.position.chapter && Math.abs(n.fraction-book.position.fraction)<.015);
    if (!note || book.settings.annotations === false) return;
    const el = doc.createElement('button'); el.className='reading-note'; el.textContent=note.text; el.onclick=()=>chatPanel(); host.append(el);
  }
  async function send(text, quote = '', annotation = false) {
    if (!book.companion) { await pickCompanion(book); if (!book.companion) return; }
    const target = book, view = visible(); if (quote) view.text = quote.slice(0,2200);
    const blob = book.type === 'comic' && chapter?.images[0] ? await reader.image(chapter.images[0]) : null;
    return readingSend(api,target,view,text,{blob,annotation});
  }
  async function maybeNote() {
    if (busy || noteBusy || !annotationDue(book)) return;
    noteBusy = true;
    const target = book, p = {...book.position}, view = visible(), source = reader, image = chapter?.images[0], day = new Date().toLocaleDateString('sv-SE');
    try {
      const reserved = await api.updateReadingBook(target.id,{nextNote:(target.turns||0)+6+Math.floor(Math.random()*5),daily:{day,count:(target.daily?.day === day ? target.daily.count : 0)+1}});
      if(book?.id!==target.id)return;
      book = {...book,nextNote:reserved.nextNote,daily:reserved.daily};
      const blob = target.type==='comic' && image ? await source.image(image) : null;
      if(book?.id!==target.id)return;
      const result = await readingSend(api,target,view,'这一页你有什么感想？',{blob,annotation:true}), text = result?.messages.filter(m=>m.from===target.companion && m.kind==='text').at(-1)?.text;
      if (text) { const current = await api.getReadingBook(target.id); if (!current) return; const saved = await api.updateReadingBook(target.id,{annotations:[...(current.annotations||[]),{...p,text:text.slice(0,120)}].slice(-500)}); if(book?.id===target.id) {book=saved;showNote();} }
    } finally { noteBusy=false; }
  }
  async function chatPanel(quote = '') {
    if (!book?.companion) { await pickCompanion(book); if (!book?.companion) return; }
    const target = book, d = ctx.dialog('和' + target.companion + '一起看', `<div class="reading-chat"></div>${quote ? `<blockquote>${esc(quote.slice(0,200))}</blockquote>`:''}<form class="reading-compose"><input type="text" aria-label="聊聊这一页" placeholder="聊聊这一页…" maxlength="3000" enterkeyhint="send"><button type="submit" class="primary">发送</button></form>`, {over:true});
    const list = d.body.querySelector('.reading-chat'), box = d.body.querySelector('input'), form = d.body.querySelector('form');
    const draw = t => { list.innerHTML = (t?.messages||[]).filter(m=>['text','voice','photo'].includes(m.kind)).slice(-20).map(m=>`<div class="reading-msg${m.from==='me'?' reading-mine':''}"><small>${esc(m.from==='me'?'我':m.from)}</small>${m.quote ? `<blockquote>${esc(m.quote.text)}</blockquote>`:''}<span>${esc(m.text || '图片')}</span></div>`).join(''); list.scrollTop=list.scrollHeight; };
    const t = currentDm(await api.listThreads(),target.companion); if(t) draw(await api.getThread(t.id));
    form.onsubmit=async e=>{e.preventDefault(); if(busy || !box.value.trim())return; busy=true; const value=box.value;box.value='';form.querySelector('button').disabled=true;try{draw(await send(value,quote));quote='';}catch(e){box.value=value;fail(e);}finally{busy=false;form.querySelector('button').disabled=false;}};
    if (quote) box.value = '这段你怎么看？';
  }
  async function bookmark() {
    const p = {...book.position}, marks=book.bookmarks||[], found=marks.findIndex(m=>m.chapter===p.chapter&&Math.abs(m.fraction-p.fraction)<.01);
    book=await api.updateReadingBook(book.id,{bookmarks:found<0?[...marks,p].slice(-200):marks.filter((_,i)=>i!==found)});ctx.notify(found<0?'已加书签':'已移除书签');
  }
  async function showChapter(index, fraction = 0, didTurn = false) {
    if (!reader || index<0 || index>=book.chapters.length) return;
    const token=++epoch, a=album;album=null;a?.close(); resize?.disconnect();clearURLs();
    book.position={chapter:index,fraction}; chapter=await reader.chapter(index); if(token!==epoch)return;
    if(book.type==='comic' && book.settings.mode==='pages') { await comic(index); return; }
    const s=book.settings;
    v.root.setAttribute('data-reading','');
    v.draw(`<section class="reading-reader" data-paper="${esc(s.theme)}" data-mode="${esc(s.mode)}" style="--read-size:${s.size}px;--read-line:${s.line};--read-margin:${s.margin}px;--read-font:${s.font}"><header class="reading-bar"><button data-action="shelf" aria-label="返回书架">${icon('back')}</button><span>${esc(book.title)}</span><button data-action="settings" aria-label="阅读设置">${icon('settings')}</button></header><div class="reading-page" tabindex="0"><article class="reading-content">${chapter.html}</article></div><footer class="reading-bottom"><small data-reading-count></small><input aria-label="阅读进度" data-reading-progress type="range" min="0" max="100" step="0.01"><nav><button data-action="toc">目录</button><button data-action="bookmark">书签</button><button data-action="chat">一起看</button></nav></footer></section>`);
    const pane=v.root.querySelector('.reading-page'), content=v.root.querySelector('.reading-content');
    for(const img of content.querySelectorAll('[data-book-image]')) { const blob=await reader.image(img.dataset.bookImage); if(token!==epoch)return;if(blob)img.src=url(blob); }
    await new Promise(resolve=>win.requestAnimationFrame(resolve)); if(token!==epoch)return;
    const layout=()=>{if(token!==epoch)return;const f=book.position.fraction;content.style.width=pane.clientWidth+'px';pages=s.mode==='pages'?Math.max(1,Math.round(content.scrollWidth/Math.max(1,pane.clientWidth))):1;page=Math.round(f*(pages-1));if(s.mode==='pages')content.style.transform=`translateX(${-page*pane.clientWidth}px)`;else pane.scrollTop=f*Math.max(0,pane.scrollHeight-pane.clientHeight);savePosition(f,didTurn).catch(fail);didTurn=false;};
    layout(); if(win.ResizeObserver){resize=new win.ResizeObserver(layout);resize.observe(pane);}
    let start=null, swiped=false;
    pane.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};swiped=false;});
    pane.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(win.getSelection()?.toString())return;if(s.mode==='pages'&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){swiped=true;turn(dx<0?1:-1).catch(fail);}else if(s.mode==='scroll'&&Math.abs(dy)>65){swiped=true;if(dy<0&&pane.scrollTop>=pane.scrollHeight-pane.clientHeight-2)turn(1).catch(fail);else if(dy>0&&pane.scrollTop<=1)turn(-1).catch(fail);}else if(dy<-65&&Math.abs(dy)>Math.abs(dx)){swiped=true;chatPanel();}});
    pane.addEventListener('click',e=>{if(swiped||win.getSelection()?.toString())return;const r=pane.getBoundingClientRect(),x=e.clientX-r.left;if(s.mode==='pages'&&(x<r.width*.22||x>r.width*.78))turn(x<r.width*.22?-1:1);else v.root.querySelector('.reading-reader').classList.toggle('reading-hidden');});
    pane.addEventListener('keyup',e=>{if(e.key==='ArrowRight')turn(1);if(e.key==='ArrowLeft')turn(-1);});
    let timer=0;
    pane.addEventListener('scroll',()=>{if(s.mode!=='scroll')return;win.clearTimeout(timer);timer=win.setTimeout(()=>{if(token!==epoch)return;savePosition(pane.scrollTop/Math.max(1,pane.scrollHeight-pane.clientHeight),true).catch(fail);},180);});
    pane.addEventListener('wheel',e=>{if(s.mode==='scroll'&&e.deltaY>0&&pane.scrollTop>=pane.scrollHeight-pane.clientHeight-2)turn(1);});
    pane.addEventListener('pointerup',()=>{const selected=win.getSelection()?.toString().trim();if(selected && content.contains(win.getSelection()?.anchorNode)) {const d=ctx.dialog('选中文字',btn('send-selection','发给 TA','text-button'),{over:true});d.body.querySelector('button').onclick=()=>{d.close();chatPanel(selected);};}});
    if(book.type==='comic') {
      pane.addEventListener('dblclick',()=>comic(book.position.chapter).catch(fail));
      pane.addEventListener('contextmenu',e=>{e.preventDefault();chatPanel('这一页漫画');});
    }
  }
  async function comic(index) {
    const owner=book.id, ids=book.chapters.map((_,i)=>String(i));if(book.settings.rtl)ids.reverse();
    album=openAlbum({ctx,host:v.root.closest('.screen')||v.root,ids,index:ids.indexOf(String(index)),preload:true,
      load:async id=>{const c=await reader.chapter(Number(id)),blob=await reader.image(c.images[0]);return blob?{blob,name:book.chapters[Number(id)].title}:null;},
      onPage:(id)=>{const n=Number(id);book.position={chapter:n,fraction:0};page=n;pages=book.chapters.length;reader.chapter(n).then(c=>{if(book?.id!==owner)return;chapter=c;savePosition(0,true).catch(fail);});},
      onHold:()=>chatPanel('这一页漫画'),onClose:()=>{if(album){album=null;if(book?.settings.mode==='scroll')showChapter(book.position.chapter,book.position.fraction).catch(fail);else shelf().catch(fail);}},
      actions:[{key:'toc',icon:'book',label:'目录',run:contents},{key:'bookmark',icon:'star',label:'书签',run:bookmark},{key:'chat',icon:'chat',label:'一起看',run:()=>chatPanel()},{key:'settings',icon:'settings',label:'设置',run:settings}]});
    album.root.setAttribute('aria-label',book.title);album.root.querySelector('[data-av=close]').setAttribute('aria-label','返回书架');
    const slider=doc.createElement('input');slider.type='range';slider.min='0';slider.max=String(book.chapters.length-1);slider.value=String(index);slider.setAttribute('aria-label','漫画进度');slider.className='reading-comic-progress';slider.onchange=()=>showChapter(Number(slider.value)).catch(fail);album.root.querySelector('.album-bar').before(slider);showNote();
  }
  async function turn(step) {
    if(!book)return;
    if(book.settings.mode==='pages'&&book.type!=='comic'&&page+step>=0&&page+step<pages){page+=step;const pane=v.root.querySelector('.reading-page');v.root.querySelector('.reading-content').style.transform=`translateX(${-page*pane.clientWidth}px)`;await savePosition(page/Math.max(1,pages-1),true);}
    else await showChapter(book.position.chapter+step,step<0?1:0,true);
  }
  async function open(id) {
    leave();const token=epoch, next=await api.getReadingBook(id);if(token!==epoch)return;book=next;if(!book)return shelf();book.settings={...readerDefaults,...book.settings};
    const f=await api.readingBookFile(id);if(token!==epoch)return;if(!f?.blob)throw Error('原书文件不在这台设备上，请重新导入');
    const opened=await openBook(f.blob,book.name,win.DOMParser);if(token!==epoch)return;reader=opened;
    if(book.type==='comic'&&book.chapters[0]?.image){const base=reader.chapter, rows=book.chapters;reader.chapter=async i=>{const c=await base(rows[i].source);return {...c,images:[rows[i].image],html:`<img data-book-image="${esc(rows[i].image)}" alt="漫画页">`};};}
    await showChapter(book.position.chapter,book.position.fraction);
  }
  v.on('click','[data-read]',el=>open(el.dataset.read));v.on('click','[data-more]',el=>more(el.dataset.more));
  v.on('click','[data-action]',el=>({import:importFiles,shelf,settings,toc:contents,bookmark,chat:()=>chatPanel()})[el.dataset.action]?.());
  v.on('change','[data-reading-progress]',el=>{const p=Number(el.value)/100*book.chapters.length;return showChapter(Math.min(book.chapters.length-1,Math.floor(p)),p>=book.chapters.length?1:p%1);});
  v.back=()=>{if(!book)return false;shelf().catch(fail);return true;};v.refresh=()=>{if(!book)shelf().catch(fail);};v.edit=id=>open(id);const dispose=v.dispose;v.dispose=()=>{leave();dispose();};
  v.leave=()=>{leave();book=null;};
  shelf().catch(fail);
  return v;
}

import {pictureInputs} from '../core/draw.js';
import {openImageViewer} from '../image-viewer.js';
import {downloadAction} from '../download.js';
import {editTags} from '../host-ask.js';
import {viewerHeart} from './photo-heart.js';
import {point} from './reading-range.js';

const sessions = new WeakMap();
const artId = row => row.id || row.photoId;
const versionsOf = row => row.versions || [{photoId:row.photoId}];

export function readingArt(ctx, current, reflow) {
  const {api, win, doc} = ctx;
  if (!sessions.has(api)) sessions.set(api,{tasks:new Map(),listeners:new Set()});
  const {tasks,listeners} = sessions.get(api);
  const mounts = new Map(), urls = new Map();
  let generation = 0, viewer, tap, opening = 0;
  const notify = error => ctx.notify(error.message,{error:true});
  const broadcast = (bookId,rows) => { for (const fn of listeners) fn(bookId,rows); };

  function clear() {
    generation++; opening++; win.clearTimeout(tap); viewer?.close(); viewer=null;
    for (const u of urls.values()) win.URL.revokeObjectURL(u);
    urls.clear(); mounts.clear();
  }
  function source(id,blob) {
    if (!urls.has(id)) urls.set(id,win.URL.createObjectURL(blob));
    return urls.get(id);
  }
  async function view(bookId,row,button) {
    const ticket=++opening;
    viewer?.close();
    const book=await api.getReadingBook(bookId);
    row=book?.illustrations?.find(r=>artId(r)===artId(row)) || row;
    const list=(await Promise.all(versionsOf(row).map(async version => {
      const photo=await api.getPhoto(version.photoId);
      return photo?.blob ? {...version,photo} : null;
    }))).filter(Boolean);
    if (ticket!==opening || !button.isConnected) return;
    if (!list.length) throw Error('相册里找不到这张插图');
    const heart=await viewerHeart(api,i=>list[i].photoId,ctx.notify);
    if (ticket!==opening || !button.isConnected) return;
    const redo = async (i,edit) => {
      viewer?.close();
      try {
        const version=list[i], info=Object.fromEntries(version.photo.info || []);
        let prompt=version.prompt || info['提示词'] || '';
        if (edit || !prompt) {
          prompt=await editTags({doc,text:prompt,about:'修改这一版的提示词，再画一张。原图会留在历史版本里。',
            ask:(text,mode,wish)=>api.tagText(text,mode,wish)});
          if (!prompt?.trim()) return;
        }
        if (current()?.book.id===bookId) await draw(bookId,row,{prompt,people:version.people || [],legacy:!version.prompt,info});
      } catch(error) { notify(error); }
    };
    let picked=row.photoId;
    viewer=openImageViewer({doc,from:button, gallery:{items:list.map(v=>({src:source(v.photoId,v.photo.blob),alt:'书摘插图',info:v.photo.info})),
      index:Math.max(0,list.findIndex(v=>v.photoId===row.photoId)),
      onIndex:i=>{
        const id=list[i].photoId;
        if (id===picked) return;
        picked=id;
        api.updateReadingBook(bookId,{pickIllustration:{id:artId(row),photoId:id}}).then(saved=>broadcast(bookId,saved.illustrations),notify);
      }},
      actions:[heart,downloadAction(doc,i=>({source:list[i].photo.blob,name:list[i].photo.name || '书摘插图'}),ctx.notify),
        {label:'重画',run:i=>redo(i,false)},{label:'改提示词再画',run:i=>redo(i,true)}]});
  }
  function mount(bookId,row) {
    const id=artId(row), {blocks}=current(), p=blocks[row.para] && point(blocks[row.para],row.offset);
    if (!p) return;
    const frame=doc.createElement('span'); frame.className='reading-art';frame.dataset.readingExtra='';
    const button=doc.createElement('button');button.type='button';button.className='reading-art-image';button.hidden=true;
    const img=doc.createElement('img');img.alt='书摘插图';img.dataset.readingExtra='';
    img.onload=reflow; button.append(img);
    const state=doc.createElement('span');state.className='reading-art-status';state.setAttribute('role','status');state.hidden=true;
    frame.append(button,state);
    const range=doc.createRange();range.setStart(...p);range.collapse(true);range.insertNode(frame);
    const item={frame,button,img,state,row}; mounts.set(id,item);
    let last=0;
    button.onclick=e=>{
      e.stopPropagation();const now=Date.now();
      if (e.detail===0 || now-last<330) {
        win.clearTimeout(tap);last=0;view(bookId,item.row,button).catch(notify);return;
      }
      last=now;win.clearTimeout(tap);tap=win.setTimeout(()=>{
        frame.classList.toggle('folded');button.setAttribute('aria-expanded',String(!frame.classList.contains('folded')));reflow();
      },330);
    };
    button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','书摘插图，点一下收起或展开，双击查看大图');
    return item;
  }
  function paint(bookId,rows) {
    const here=current();if (!here || here.book.id!==bookId) return;
    if (rows) here.book.illustrations=rows;
    const chapter=here.book.position.chapter;
    const entries=new Map((here.book.illustrations || []).filter(r=>r.chapter===chapter).map(r=>[artId(r),r]));
    for (const t of tasks.values()) if (t.bookId===bookId && t.row.chapter===chapter && !entries.has(t.key)) entries.set(t.key,t.row);
    for (const [id,item] of mounts) if (!entries.has(id)) { item.frame.remove();mounts.delete(id);reflow(); }
    for (const [id,row] of entries) {
      const t=tasks.get(id), item=mounts.get(id) || mount(bookId,row);
      if (!item) continue;
      item.row=row;
      if (row.photoId && item.img.dataset.photo!==row.photoId) {
        item.img.dataset.photo=row.photoId;const ticket=generation;
        api.getPhoto(row.photoId).then(photo=>{
          if(ticket!==generation || item.img.dataset.photo!==row.photoId)return;
          if (!photo?.blob) { item.img.alt='插图已移除';return; }
          item.img.src=source(row.photoId,photo.blob);item.button.hidden=false;reflow();
        }).catch(notify);
      }
      const status=t?.message || '';
      if (item.state.dataset.message!==status) {
        item.state.dataset.message=status;item.state.hidden=!status;item.state.textContent=status;
        if (t?.failed) {
          const retry=doc.createElement('button');retry.type='button';retry.textContent='重试';
          retry.onclick=()=>draw(bookId,t.row,t.recipe).catch(notify);item.state.append(retry);
        }
        reflow();
      }
    }
  }
  listeners.add(paint);
  async function draw(bookId,row,recipe) {
    const key=artId(row), old=tasks.get(key);
    if (old && !old.failed) return;
    const t={key,bookId,row,recipe,result:old?.result,message:'准备绘图…'};tasks.set(key,t);
    const status=message=>{t.message=message;broadcast(bookId);};
    let unsub;
    try {
      ctx.notify('正在为书摘准备插图');
      status('准备绘图…');
      const settings=api.getState(), paid=api.drawQuote()?.free===false;
      if (!t.result && paid && !await ctx.confirm('为这段书摘生图？','这次生成会使用绘图额度。')) { tasks.delete(key);broadcast(bookId);return; }
      if (!t.recipe) {
        status('正在写提示词…');
        const cast=settings.routes.map(r=>r.name).filter(n=>n && row.text.includes(n));
        const suggestion=await api.writePrompt(row.text,cast);
        t.recipe={prompt:suggestion.prompt,people:suggestion.people?.length?suggestion.people:cast};
      }
      const {prompt,people,legacy,info}=t.recipe;
      const input=pictureInputs(settings,{prompt,characters:people},row.text || '');
      if (legacy) { input.prompt=prompt;input.negative=info?.['负面'] || input.negative; }
      status('等待绘图…');
      unsub=api.subscribe(event=>{
        if (event.type!=='draw' || !event.queue) return;
        const job=event.queue.find(j=>j.key===key);
        if(job)status(job.state==='running'?'正在绘图…':'等待绘图 · 第 '+(job.position+1)+' 位');
      });
      if (!t.result) t.result=await api.generateImage({...input,key,allowPaid:paid,name:'书摘插图'});
      status('正在保存…');
      const saved=await api.updateReadingBook(bookId,{illustration:{id:key,chapter:row.chapter,para:row.para,offset:row.offset,text:row.text,
        photoId:t.result.photoId,version:{photoId:t.result.photoId,prompt:legacy?'':prompt,people}}});
      tasks.delete(key);broadcast(bookId,saved.illustrations);
    } catch(error) {
      t.failed=true;status(error.message || '绘图失败');
      if (current()?.book.id===bookId) notify(error);
    }
    finally { unsub?.(); }
  }
  return {clear,paint,dispose(){clear();listeners.delete(paint);},selected(book,h){
    const id=[book.id,h.chapter,h.para,h.start,h.endPara,h.end].join(':');
    const row=(book.illustrations || []).find(r=>r.id===id);
    if (row && mounts.get(id)) return view(book.id,row,mounts.get(id).button);
    return draw(book.id,{id,chapter:h.chapter,para:h.endPara,offset:h.end,text:h.text});
  }};
}

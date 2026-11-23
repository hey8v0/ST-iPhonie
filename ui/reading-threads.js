import {popAt} from './msg-pop.js';
import {readingMemory} from './reading-memory.js';
import {esc, avatar, copyText, btn, menu, toggle} from './common.js';
import {mountSwipeList, swipeRow} from './swipe-list.js';
import {pickReplacement} from './replacement-album.js';
import {objectURLs} from './object-urls.js';
import {icon} from './icons.js';

const writing = new Set();
const room = () => ({id:crypto.randomUUID(), messages:[]});

export async function openReadingThreads(ctx,{book,key,companion,quote,visible,respond,openSettings}) {
  const lock=JSON.stringify([book.id,key]);
  if(writing.has(lock)){ctx.notify('正在保存或等待这次回复');return;}
  const saved=await ctx.api.getReadingBook(book.id);
  if(!saved)return;
  let state=structuredClone(saved.settings?.[key] || {rooms:[room()]});
  function keepLatestPhoto(messages){
    let seen=false;
    for(let i=messages.length-1;i>=0;i--){
      if(!messages[i].photoId)continue;
      if(seen)delete messages[i].photoId;
      seen=true;
    }
  }
  for(const window of state.rooms)keepLatestPhoto(window.messages);
  let active=state.rooms.find(r=>r.id===state.active) || state.rooms[0];
  const d=ctx.dialog('一起看','',{over:true});
  d.overlay.classList.add('reading-chat-overlay');
  const photos=objectURLs(ctx.win);
  d.onClose(()=>photos.dispose());
  let draft=quote?'「'+quote+'」\n':'';
  function paint(){
    if(!d.live)return;
    const locked=writing.has(lock);
    const last=active.messages.at(-1);
    d.body.classList.add('bs-chat-room');
    const name=active.messages[0]?.text || '新会话';
    const glyph=(key,label,image)=>btn(key,icon(image),'round-button','aria-label="'+label+'" title="'+label+'"');
    if (!d.body.querySelector('form')) d.body.innerHTML='<header class="bs-chat-head">'+avatar(companion,'none',38)+'<div class="bs-chat-name"><strong>'+esc(companion)+'</strong><small>'+esc(name)+'</small></div>'+glyph('options','更多','more')+'</header>'
      +'<div class="reading-chat" role="log"></div><form class="composer" data-reading-compose>'+btn('attach',icon('add'),'round-button plus','aria-label="添加图片附件"')+'<input class="field-in" aria-label="共读消息" placeholder="聊聊这一页…" maxlength="3000" enterkeyhint="send" autocomplete="off"><button class="round-button send" type="submit"></button></form>';
    d.body.querySelector('.bs-chat-name small').textContent=name;
    const log=d.body.querySelector('.reading-chat');
    const keys=active.messages.map(m=>JSON.stringify([m.id,m.from,m.photoId,m.text]));
    let same=0;
    while(same<keys.length && log.children[same]?.dataset.rowKey===keys[same]) same++;
    while(log.children.length>same)log.lastElementChild.remove();
    active.messages.slice(same).forEach((m,offset)=>{
      const i=same+offset;
      const mine=m.from==='me';
      log.insertAdjacentHTML('beforeend','<div class="msg'+(mine?' me':'')+'">'+avatar(mine?'我':companion,'none',32,mine?'me':companion)+'<div class="m-body"><button type="button" class="chat-bubble" data-msg="'+i+'" aria-haspopup="dialog">'+(m.photoId?'<img class="bs-chat-photo" data-chat-photo="'+esc(m.photoId)+'" alt="'+esc(m.text)+'">':esc(m.text))+'</button></div></div>');
      log.lastElementChild.dataset.rowKey=keys[i];
    });
    const input=d.body.querySelector('form input'), submit=d.body.querySelector('form [type=submit]');
    for(const img of d.body.querySelectorAll('[data-chat-photo]:not([src])')){
      const id=img.dataset.chatPhoto;
      photos.load(id,async()=>(await ctx.api.getPhoto(id))?.blob).then(url=>{if(url && img.isConnected)img.src=url;}).catch(()=>{});
    }
    input.value=draft;
    function label(){const writingText=!!draft.trim(), label=locked?'处理中':writingText?'发送':'让 TA 回复';
      submit.innerHTML=icon(writingText?'send':'bubble');submit.setAttribute('aria-label',label);submit.title=label;
      submit.classList.toggle('ask',!writingText);submit.disabled=locked || (!writingText && last?.from!=='me');}
    input.oninput=()=>{draft=input.value;label();};label();
    for(const el of d.body.querySelectorAll('button:not([type=submit])'))el.disabled=locked;
    input.readOnly=locked;
    const list=d.body.querySelector('.reading-chat');list.scrollTop=list.scrollHeight;
  }
  async function change(action){
    if(writing.has(lock))return;
    writing.add(lock); const before=structuredClone(state), originalDraft=draft;
    const hadFocus=d.body.querySelector('form input')===d.body.ownerDocument.activeElement;
    paint();
    try{
      await action();
      state.active=active.id;
      await ctx.api.updateReadingBook(book.id,{settingsPatch:{[key]:state}});
      book.settings={...book.settings,[key]:state};
    }catch(error){state=before;active=state.rooms.find(r=>r.id===state.active)||state.rooms[0];draft=originalDraft;ctx.notify(error.message||String(error));}
    finally{writing.delete(lock);paint();if(hadFocus && d.live)d.body.querySelector('form input')?.focus();}
  }
  async function generate(reroll){
    let end = active.messages.length;
    if (reroll) {
      const previous = active.messages[--end];
      while (end > 0 && previous.turn && active.messages[end-1].turn === previous.turn) end--;
    }
    const messages = active.messages.slice(0,end);
    const last=messages.at(-1);
    if(last?.from!=='me')return;
    const context=active.remember===false ? {recent:messages.slice(-24),text:''} : await readingMemory(ctx.api,active,messages,companion);
    const text=await respond(context.recent,last.view,context.text);
    const turn = crypto.randomUUID();
    const bubbles = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (!bubbles.length) throw Error('没有收到可显示的共读消息，可以重试');
    active.messages.splice(end,active.messages.length-end,...bubbles.map(line => ({
      id:crypto.randomUUID(), at:Date.now(), from:'ta', turn, text:line,
    })));
  }
  d.body.addEventListener('submit',e=>{e.preventDefault();change(async()=>{
    if(draft.trim()){active.messages.push({id:crypto.randomUUID(),at:Date.now(),from:'me',text:draft.trim(),view:visible()});draft='';}
    else await generate(false);
  });});
  function rooms(){
    const rows=state.rooms.map((r,i)=>{
      const name=r.messages[0]?.text || '共读 '+(i+1);
      const content='<div class="list-row">'+icon(r===active?'check':'bubble')+'<span><strong>'+esc(name)+'</strong><small>'+(r===active?'正在用 · ':'')+r.messages.length+' 条消息</small></span></div>';
      return swipeRow(r.id,content,[{key:'delete',label:'删除',icon:'trash',danger:true}],{label:name});
    });
    const pane=ctx.dialog('共读窗口','<div class="pick-list" data-reading-rooms>'+rows.join('')+'</div>',{over:true,add:'新建共读窗口'});
    const select=selected=>{pane.close();change(()=>{if(active!==selected)draft='';active=selected;});};
    pane.overlay.querySelector('[data-sheet-add]').onclick=()=>{pane.close();change(()=>{active=room();state.rooms.push(active);draft='';});};
    async function remove(ids){
      const title=ids.length===1?'删除这个共读窗口？':'删除选中的 '+ids.length+' 个共读窗口？';
      if(!await ctx.confirm(title,'选中窗口里的消息和记忆会一起移除。',{over:true}))return;
      pane.close();
      await change(()=>{
        state.rooms=state.rooms.filter(r=>!ids.includes(r.id));
        if(!state.rooms.length)state.rooms.push(room());
        if(ids.includes(active.id)){active=state.rooms[0];draft='';}
      });
    }
    const control=mountSwipeList(pane.body.querySelector('[data-reading-rooms]'),{ctx,
      onTap:id=>select(state.rooms.find(r=>r.id===id)),onAction:(_,id)=>remove([id]),
      bulk:[{key:'delete',label:'删除',icon:'trash',danger:true}],onBulk:(_,ids)=>remove(ids)
    });
    pane.onClose(()=>control.dispose());
  }
  function memory(){
    const notes=(active.memory?.nodes || []).filter(n=>!n.coveredBy);
    const pane=ctx.dialog('窗口记忆',toggle('remember','记住较早的共读对话',active.remember!==false)
      +'<p class="hint">开启后会整理较早的对话。关闭时只参考最近 24 条共读消息。</p>'
      +notes.map(n=>'<p>'+esc(n.text)+'</p>').join(''),{over:true});
    pane.body.onchange=async e=>{
      const input=e.target;
      input.disabled=true;
      await change(()=>{active.remember=input.checked;});
      input.checked=active.remember!==false;input.disabled=false;
    };
  }
  async function options(){
    const choice=await menu(ctx,'共读选项',[
      {key:'reroll',icon:'refresh',label:'重新回复'},
      {key:'rooms',icon:'layers',label:'聊天窗口'},
      {key:'memory',icon:'book',label:'记忆'},
      {key:'settings',icon:'sliders',label:'设置'}
    ],{over:true});
    if(!d.live)return;
    if(choice==='rooms')rooms();
    if(choice==='memory')memory();
    if(choice==='settings')openSettings()?.onClose(()=>{if(book.companion!==companion)d.close();});
    if(choice==='reroll'){
      if(active.messages.at(-1)?.from==='ta')await change(()=>generate(true));
      else ctx.notify('收到 TA 的回复后可以重新回复');
    }
  }
  async function attach(){
    const view=visible();
    const image=await pickReplacement(ctx,ctx.api,{title:'添加图片附件',over:true});
    if(!image || !d.live)return;
    await change(async()=>{
      const photo=typeof image==='string'?await ctx.api.getPhoto(image):await ctx.api.addPhoto({name:image.name,blob:image});
      if(!photo)throw Error('找不到这张图片');
      active.messages.push({id:crypto.randomUUID(),at:Date.now(),from:'me',text:'[图片] '+(photo.name || '图片附件'),photoId:photo.id,view});
      keepLatestPhoto(active.messages);
    });
  }
  let press, timeout, popup;
  function cancelHold(){clearTimeout(timeout);press=null;}
  function actions(anchor){
    if(writing.has(lock)||popup?.live)return;
    const i=Number(anchor.dataset.msg), m=active.messages[i];
    const items=[['copy','copy','复制'],['quote','reply','引用'],...(i===active.messages.length-1 && m.from==='ta'?[['reroll','refresh','重新回复']]:[]),['remove','trash','删除']];
    const panel=ctx.dialog('消息','<div class="mp-grid">'+items.map(([key,g,label])=>'<button type="button" data-option="'+key+'" class="mp-item'+(key==='remove'?' danger':'')+'"><span class="mp-ico">'+icon(g)+'</span><span class="mp-label">'+label+'</span></button>').join('')+'</div>',{over:true});
    popup=panel;popAt(panel,anchor,{win:ctx.win});
    panel.body.onclick=async e=>{const key=e.target.closest('[data-option]')?.dataset.option;if(!key)return;panel.close();
      if(key==='copy')await copyText(ctx.win,m.text);
      if(key==='quote'){draft='「'+m.text+'」\n'+draft;paint();d.body.querySelector('form input').focus();}
      if(key==='reroll')change(()=>generate(true));
      if(key==='remove' && await ctx.confirm('删除这条共读消息？','仅从这个窗口移除。',{over:true}))change(()=>{active.messages.splice(i,1);delete active.memory;});
    };
  }
  d.body.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-msg]');if(!b)return;cancelHold();press={x:e.clientX,y:e.clientY};timeout=setTimeout(()=>{cancelHold();actions(b);},460);});
  d.body.addEventListener('pointermove',e=>{if(press && Math.hypot(e.clientX-press.x,e.clientY-press.y)>8)cancelHold();});
  for(const event of ['pointerup','pointercancel','pointerleave'])d.body.addEventListener(event,cancelHold);
  d.onClose(cancelHold);
  d.body.addEventListener('contextmenu',e=>{const b=e.target.closest('[data-msg]');if(b){e.preventDefault();cancelHold();actions(b);}});
  d.body.addEventListener('click',e=>{const b=e.target.closest('button');if(!b || writing.has(lock))return;
    const task=b.dataset.action==='options'?options:b.dataset.action==='attach'?attach:null;
    if(task)task().catch(error=>ctx.notify(error.message || String(error)));
    if(b.dataset.msg!==undefined && e.detail===0)actions(b);
  });paint();
}

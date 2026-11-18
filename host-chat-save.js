// Host-side identity IO. Only local tavern routes are used; chat bodies are cancelled after their first header.
// The first object also contains other extensions' saved chat metadata. It can be much larger than the ownership fields.
const HEADER_LIMIT = 16 * 1024 * 1024, LIST_LIMIT = 4 * 1024 * 1024;
const invalid = () => Error('无法完整读取聊天归属，原手机资料没有改动，请重新打开聊天重试');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const selected = meta => Object.fromEntries(['stIphonieSave','stIphonieSaveOwner','integrity','main_chat'].filter(k => Object.hasOwn(meta,k)).map(k => [k,meta[k]]));
const fileId = value => typeof value === 'string' ? value.replace(/\.jsonl$/i, '') : '';

/** Empty results mean no readable header, not verified absence. Parse the first object only, including braces and escapes inside JSON strings. Refuse truncated/oversized data. */
export async function chatHeader(response, {limit = HEADER_LIMIT} = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) throw invalid();
  const decoder = new TextDecoder('utf-8', {fatal:true}), encoder = new TextEncoder();
  let used = 0, array = false, started = false, depth = 0, quoted = false, escaped = false;
  const pieces = [], marks = /["\\{}]/g;
  const account = text => {
    used += encoder.encode(text).length;
    if (used > limit) throw Error('聊天的存档头太大，无法核对手机资料归属，原资料没有改动');
  };
  try {
    while (true) {
      const {value,done}=await reader.read();
      if(done)throw invalid();
      // A host may deliver a large chunk containing the entire file. Decode only bounded slices until the header ends.
      for (let offset = 0; offset < value.byteLength; offset += 4096) {
        const chunk = decoder.decode(value.subarray(offset, offset + 4096), {stream: true});
        let at = 0;
        if (!started) {
          for (; at < chunk.length; at++) {
            const char = chunk[at];
            if (/\s/.test(char)) continue;
            if (!array && char === '[') { array = true; continue; }
            if (array && char === ']') { account(chunk.slice(0, at + 1)); return null; }
            if (char !== '{') throw invalid();
            started = true;
            break;
          }
          account(chunk.slice(0, at));
          if (!started) continue;
        }
        const start = at;
        if (escaped && at < chunk.length) { at++; escaped = false; }
        marks.lastIndex = at;
        for (let match; (match = marks.exec(chunk));) {
          const char = match[0];
          if (quoted && char === '\\') {
            if (marks.lastIndex === chunk.length) escaped = true;
            else marks.lastIndex++;
          } else if (char === '"') quoted = !quoted;
          else if (!quoted && char === '{') depth++;
          else if (!quoted && char === '}' && !--depth) {
            const tail = chunk.slice(start, marks.lastIndex);
            account(tail);
            pieces.push(tail);
            const header = JSON.parse(pieces.join(''));
            if (!array) { if (!Object.keys(header).length) return null; throw invalid(); }
            if (!object(header.chat_metadata)) throw invalid();
            return selected(header.chat_metadata);
          }
        }
        const remainder = chunk.slice(start);
        account(remainder);
        if (remainder) pieces.push(remainder);
      }
    }
  } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
}
async function jsonBounded(response){
  const reader=response.body?.getReader?.();if(!reader)throw invalid();
  const pieces=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIST_LIMIT)throw Error('聊天列表太大，暂未切换手机资料');pieces.push(value);}}
  finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const p of pieces){bytes.set(p,at);at+=p.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

/** The same choices in all hosts; text is assigned through textContent, never interpreted as HTML. */
export function legacySaveChoice(doc, {chat,aliases}, signal) {
  if(signal?.aborted)return Promise.resolve(null);
  const root=doc.createElement('div');root.className='sttts-save-choice';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','sttts-save-title');
  root.innerHTML='<style>.sttts-save-choice{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:#0d103088;color:#eef0f8;font:14px/1.6 system-ui}.sttts-save-choice section{box-sizing:border-box;width:min(460px,100%);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;padding:20px;border-radius:18px;background:#1d2030;box-shadow:0 18px 50px #0007}.sttts-save-choice h2{margin:0 0 12px;font-size:18px;color:#fff}.sttts-save-choice p{white-space:pre-wrap;overflow-wrap:anywhere}.sttts-save-choice button{display:block;width:100%;min-height:44px;margin-top:10px;padding:10px;border:1px solid #ffffff40;border-radius:12px;font:inherit;color:inherit;background:#ffffff12;cursor:pointer}.sttts-save-choice button:first-of-type{background:#7cc4ff;color:#0d1b2a;border-color:transparent}.sttts-save-choice button:focus{outline:2px solid #7cc4ff;outline-offset:2px}</style><section><h2 id="sttts-save-title">这份旧聊天的手机资料</h2><p data-chat></p><p>它与其他聊天共用旧版手机资料。可以保留这份资料继续使用，也可以给当前聊天单独开一部手机。原资料都会留在原处，不会删除或搬走。</p><p data-aliases></p><button type="button" data-choice="new">为当前聊天单独开始</button><button type="button" data-choice="keep">继续使用原资料</button><button type="button" data-choice="cancel">暂不处理</button></section>';
  root.querySelector('[data-chat]').textContent=chat;
  root.querySelector('[data-aliases]').textContent='同用旧资料的聊天：'+aliases.join('、');
  const previous=doc.activeElement;doc.body.append(root);
  return new Promise(resolve=>{
    let done=false;
    const finish=value=>{if(done)return;done=true;signal?.removeEventListener('abort',cancel);root.remove();if(previous?.isConnected)previous.focus?.({preventScroll:true});resolve(value);};
    const cancel=()=>finish(null);signal?.addEventListener('abort',cancel,{once:true});
    root.addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(b)finish(b.dataset.choice==='cancel'?null:b.dataset.choice);});
    root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}else if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button')],i=buttons.indexOf(doc.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}});
    root.querySelector('[data-choice=cancel]').focus({preventScroll:true});
  });
}
export function chatSaveHost({doc=document,fetcher=(...args)=>globalThis.fetch(...args)}={}) {
  let controller=new AbortController(),closed=false;
  const check=signal=>{if(closed||signal.aborted)throw new DOMException('聊天已切换','AbortError');};
  async function request(path,body,ctx,parse,signal){
    check(signal);const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),15000);timer.unref?.();
    const abort=()=>timeout.abort();signal.addEventListener('abort',abort,{once:true});
    try{const response=await fetcher(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(ctx.getRequestHeaders?.()||{})},body:JSON.stringify(body),signal:timeout.signal});check(signal);if(!response.ok)throw Error('酒馆暂时无法核对聊天归属，请稍后重新打开聊天');const value=await parse(response);check(signal);return value;}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async function namesFor(card,ctx,signal){
    let names;
    if(card.key.startsWith('group:')){const group=ctx.groups?.find(g=>'group:'+g.id===card.key);if(!Array.isArray(group?.chats))throw invalid();names=group.chats.map(value=>typeof value==='string'?value:typeof value==='number'&&Number.isFinite(value)?String(value):'');}
    else{const rows=await request('/api/characters/chats',{avatar_url:card.key.slice(5),simple:true},ctx,jsonBounded,signal);if(!Array.isArray(rows))throw invalid();names=rows.map(r=>fileId(r?.file_name));}
    if(names.some(n=>!n)||names.length>10000)throw invalid();check(signal);return [...new Set(names)];
  }
  async function header(card,filename,ctx,signal){
    if(!filename||typeof filename!=='string')throw invalid();
    const group=card.key.startsWith('group:');
    const meta=await request(group?'/api/chats/group/get':'/api/chats/get',group?{id:filename}:{avatar_url:card.key.slice(5),file_name:filename},ctx,chatHeader,signal);
    // ST returns [] for missing, empty and unreadable files; {} also covers errors.
    // Only a complete independent list proving the old name absent may establish a rename.
    if(meta===null&&(await namesFor(card,ctx,signal)).includes(filename))throw invalid();
    return meta;
  }
  return {
    readHeader:(card,filename,ctx)=>header(card,filename,ctx,controller.signal),
    async readPeers(card,ctx,currentChat){
      const visit=controller.signal,batch=new AbortController(),signal=batch.signal,abort=()=>batch.abort();check(visit);visit.addEventListener('abort',abort,{once:true});
      try{const names=(await namesFor(card,ctx,signal)).filter(name=>name!==currentChat);
      const out=[];let cursor=0;
      await Promise.all(Array.from({length:Math.min(4,names.length)},async()=>{while(cursor<names.length){const name=names[cursor++];check(signal);const meta=await header(card,name,ctx,signal);if(meta!==null)out.push({chat:name,meta});}}));
      check(signal);return out;
      }finally{batch.abort();visit.removeEventListener('abort',abort);}
    },
    chooseLegacy:details=>legacySaveChoice(doc,details,controller.signal),
    change(){controller.abort();controller=new AbortController();},
    close(){closed=true;controller.abort();}
  };
}

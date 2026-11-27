export const bridgeOrigin = 'http://127.0.0.1:6091';
export const bridgeVersion = 2;
export const bridgeKey = /^([a-f0-9]{64})$/;

export function browserLink({doc,win},target,key,onEvent) {
  const frame = doc.createElement('iframe');
  frame.title = '网页画面';
  frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');
  frame.src = bridgeOrigin+'/viewer';
  const send = (type,payload={}) => frame.contentWindow?.postMessage({type,...payload},bridgeOrigin);
  const pending = new Map();
  let closed = false, watchdog = win.setTimeout(()=>onEvent('rfb-state',{stage:'unavailable'}),12000);
  function receive(event) {
    if (event.source !== frame.contentWindow || event.origin !== bridgeOrigin || closed || !event.data) return;
    const {type,id,result} = event.data;
    if (type === 'rfb-result') {
      pending.get(id)?.(result);
      return;
    }
    if (!['rfb-state','rfb-size','browser-state','rfb-gesture','rfb-touch'].includes(type)) return;
    if (type === 'rfb-state' || type === 'browser-state') win.clearTimeout(watchdog);
    onEvent(type,event.data);
  }
  win.addEventListener('message',receive);
  frame.addEventListener('load',()=>send('rfb-init',{key}),{once:true});
  target.replaceChildren(frame);
  return {
    send,
    command(action,params) {
      if (closed) return Promise.resolve({ok:false});
      const id = win.crypto.randomUUID();
      return new Promise(resolve=>{
        const timer = win.setTimeout(()=>complete({ok:false,error:'timeout'}),5200);
        function complete(result) {
          win.clearTimeout(timer);
          pending.delete(id);
          resolve(result || {ok:false});
        }
        pending.set(id,complete);
        send('rfb-command',{id,action,params});
      });
    },
    close() {
      send('rfb-dispose');
      closed = true;
      win.clearTimeout(watchdog);
      win.removeEventListener('message',receive);
      for (const complete of pending.values()) complete({ok:false,error:'disconnected'});
      frame.remove();
    },
  };
}

export function browserInput({doc,win},root,send,onKeyboard) {
  const field = doc.createElement('textarea');
  field.className = 'browser-ime-proxy';
  field.rows = 1;
  field.tabIndex = -1;
  field.setAttribute('aria-label','网页文字输入');
  field.autocomplete = 'off';
  field.autocapitalize = 'off';
  field.spellcheck = false;
  root.append(field);
  let target, type, composing = false, stamp = 0, timer;
  const viewport = win.visualViewport;
  let fullHeight = viewport?.height || win.innerHeight;

  function syncKeyboard() {
    const height = viewport?.height || win.innerHeight;
    if (doc.activeElement !== field && height >= fullHeight-40) fullHeight = height;
    const active = doc.activeElement === field && fullHeight-height > 90;
    onKeyboard(active,active ? height : 0);
  }
  viewport?.addEventListener('resize',syncKeyboard);
  function release() {
    stamp++;
    win.clearTimeout(timer);
    composing = false;
    field.value = '';
    field.blur();
    syncKeyboard();
  }
  function bind(tabId,role) {
    if (tabId !== target || !role) release();
    target = tabId;
    type = role;
  }
  function focus() {
    if (!type || target == null) return false;
    field.inputMode = ({'input:email':'email','input:url':'url','input:tel':'tel',
      'input:number':'decimal','input:search':'search'})[type] || 'text';
    if (doc.activeElement !== field) {
      fullHeight = viewport?.height || win.innerHeight;
      field.focus({preventScroll:true});
    }
    return true;
  }
  function flush() {
    if (composing || !field.value || !type || target == null) return;
    const text = field.value;
    field.value = '';
    for (let i=0;i<text.length;) {
      let end = Math.min(text.length,i+4096);
      const last = text.charCodeAt(end-1);
      if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
      send({tabId:target,text:text.slice(i,end)});
      i=end;
    }
  }
  function schedule() {
    const current = stamp;
    win.clearTimeout(timer);
    timer = win.setTimeout(()=>{if (current === stamp) flush();},0);
  }
  field.addEventListener('compositionstart',()=>{composing=true;});
  field.addEventListener('compositionend',()=>{composing=false;schedule();});
  field.addEventListener('input',event=>{if (!event.isComposing && !composing) schedule();});
  field.addEventListener('keydown',event=>{
    if (composing || event.isComposing || event.keyCode === 229 || !type) return;
    if (event.key === 'Escape') {event.preventDefault();release();return;}
    if (['Enter','Backspace','Delete','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      flush();
      send({tabId:target,key:event.key});
    }
  });
  field.addEventListener('beforeinput',event=>{
    if (!type || composing || event.isComposing || field.value) return;
    if (['deleteContentBackward','deleteContentForward','insertLineBreak','insertParagraph'].includes(event.inputType)) {
      event.preventDefault();
      const key = event.inputType === 'deleteContentBackward' ? 'Backspace' :
        event.inputType === 'deleteContentForward' ? 'Delete' : 'Enter';
      send({tabId:target,key});
    }
  });
  field.addEventListener('blur',syncKeyboard);
  return {bind,focus,release,paste(text) {
    if (type && target != null && !composing) {field.value=text.slice(0,16000);flush();}
  },isFocused:()=>doc.activeElement===field,dispose() {
    release();
    viewport?.removeEventListener('resize',syncKeyboard);
    field.remove();
  }};
}

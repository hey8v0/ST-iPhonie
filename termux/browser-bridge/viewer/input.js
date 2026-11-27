export function browserInput({doc,win},root,send,onFocus) {
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
  function clear() {
    stamp++;
    win.clearTimeout(timer);
    composing = false;
    field.value = '';
  }
  function release() {clear();field.blur();}
  function bind(tabId,role,identity) {
    if (!role || !identity || tabId == null) {release();target=null;type=null;return;}
    if (!target || target.tabId!==tabId) release();
    else if (target.frame!==identity.frame || target.id!==identity.id) clear();
    target = {tabId,frame:identity.frame,id:identity.id};
    type = role;
  }
  function focus() {
    if (!type || target == null) return false;
    field.inputMode = ({'input:email':'email','input:url':'url','input:tel':'tel',
      'input:number':'decimal','input:search':'search'})[type] || 'text';
    if (doc.activeElement !== field) {
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
      send({...target,text:text.slice(i,end)});
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
      if (target) send({...target,key:event.key});
    }
  });
  field.addEventListener('beforeinput',event=>{
    if (!type || composing || event.isComposing || field.value) return;
    if (['deleteContentBackward','deleteContentForward','insertLineBreak','insertParagraph'].includes(event.inputType)) {
      event.preventDefault();
      const key = event.inputType === 'deleteContentBackward' ? 'Backspace' :
        event.inputType === 'deleteContentForward' ? 'Delete' : 'Enter';
      if (target) send({...target,key});
    }
  });
  field.addEventListener('focus',()=>onFocus(true));
  field.addEventListener('blur',()=>{clear();onFocus(false);});
  return {bind,focus,release,paste(text) {
    if (type && target != null && !composing) {field.value=text.slice(0,16000);flush();}
  },isFocused:()=>doc.activeElement===field,dispose() {
    release();
    field.remove();
  }};
}

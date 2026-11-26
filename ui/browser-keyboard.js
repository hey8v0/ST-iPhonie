import {btn} from './common.js';
import {icon} from './icons.js';

export function browserKeyboard(ctx, send) {
  const {doc,win}=ctx;
  const panel=doc.createElement('section');
  panel.className='browser-keyboard';
  panel.hidden=true;
  panel.setAttribute('aria-label','Firefox 键盘');
  panel.innerHTML=`<div class="browser-keyboard-row">
    <textarea rows="1" maxlength="8000" aria-label="输入到 Firefox" placeholder="输入到 Firefox" enterkeyhint="send" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
    ${btn('send-text','输入','primary')}
    ${btn('close-keyboard',icon('close'),'browser-icon','aria-label="收起键盘"')}
  </div><div class="browser-keyboard-keys">
    ${btn('key-backspace','退格','secondary')}
    ${btn('key-space','空格','secondary')}
    ${btn('key-enter','回车','secondary')}
  </div>`;
  const input=panel.querySelector('textarea');
  const submit=panel.querySelector('[data-action=send-text]');
  let composing=false, pending=false, revision=0;
  const setComposing=value=>{
    composing=value;
    submit.disabled=value || pending;
    for(const el of panel.querySelectorAll('.browser-keyboard-keys button'))el.disabled=value || pending;
  };
  input.addEventListener('compositionstart',()=>setComposing(true));
  input.addEventListener('compositionupdate',()=>setComposing(true));
  input.addEventListener('compositionend',()=>setComposing(false));
  function show(){
    if(panel.hidden){panel.hidden=false;send('pause-resize',true);}
    // Keep this in the trusted toolbar click. Awaiting an iframe response loses the activation on Android.
    input.focus({preventScroll:true});
  }
  function hide(){
    if(panel.hidden)return;
    panel.hidden=true;
    input.blur();
    setComposing(false);
    send('pause-resize',false);
  }
  async function flush(enter=false){
    if(composing || pending)return;
    if(!input.value){
      if(enter)await send('key','enter');
      return;
    }
    const value=input.value, stamp=revision;
    pending=true;setComposing(false);
    try{
      const result=await send('input',value);
      if(!result?.ok){ctx.notify('文字还在这里，可以重试或使用原有键盘。');return;}
      if(input.value===value && revision===stamp)input.value='';
      if(enter)await send('key','enter');
    }finally{pending=false;setComposing(composing);}
  }
  input.addEventListener('input',()=>revision++);
  input.addEventListener('keydown',event=>{
    if(event.isComposing || composing || event.keyCode===229)return;
    if(event.key==='Enter' && !event.shiftKey){event.preventDefault();flush(false);}
    if(event.key==='Escape'){event.preventDefault();hide();}
  });
  // Avoid moving focus to the buttons while Android is showing the local keyboard.
  panel.addEventListener('pointerdown',event=>{
    if(event.target.closest('button') && doc.activeElement===input)event.preventDefault();
  });
  panel.addEventListener('click',event=>{
    switch(event.target.closest('button')?.dataset.action){
      case 'send-text': flush();break;
      case 'close-keyboard': hide();break;
      case 'key-backspace':
        if(composing || pending)return;
        if(input.value) {
          const from=input.selectionStart,to=input.selectionEnd;
          if(from!==to)input.setRangeText('',from,to,'end');
          else if(from){
            const unit=Array.from(input.value.slice(0,from)).at(-1);
            input.setRangeText('',from-unit.length,to,'end');
          }
          revision++;
        } else send('key','backspace');
        break;
      case 'key-space':
        if(composing || pending)return;
        input.setRangeText(' ',input.selectionStart,input.selectionEnd,'end');revision++;
        break;
      case 'key-enter': flush(true);break;
    }
  });
  // Recovery closes the composer but keeps the user's unsent text in this view.
  return {panel,show,hide,isOpen:()=>!panel.hidden};
}


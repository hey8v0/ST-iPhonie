// Keep our full-message decoration out of a touch sequence. Other plugins keep
// their own gesture handlers; no event is stopped, rewritten or replayed.
export function storyIdle(win) {
  let until=0,closed=false;
  const now=()=>win.performance?.now?.()??Date.now();
  const touch=event=>{if(event.target?.closest?.('#chat .mes_text'))until=now()+420;};
  for(const type of ['touchstart','touchend','pointerdown'])win.addEventListener(type,touch,{capture:true,passive:true});
  return {remaining:()=>Math.max(0,until-now()),async yield(){
    await new Promise(r=>win.setTimeout(r,0));
    while(!closed&&until>now())await new Promise(r=>win.setTimeout(r,Math.ceil(until-now())));
  },dispose(){closed=true;for(const type of ['touchstart','touchend','pointerdown'])win.removeEventListener(type,touch,true);}};
}

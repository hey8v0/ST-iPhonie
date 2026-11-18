import {paragraphs} from './core/draw.js';
import {blockRanges, NARRATION_BODY, storyScope} from './core/story-scope.js';
import {icon} from './ui/icons.js';

// Match rendered words to the original story, without guessing through a regex replacement.
const compact = (doc, text) => {
  const box=doc.createElement('textarea');box.innerHTML=String(text).replace(/<[^>]*>/g,'');
  return box.value.replace(/[\s*_~`]+/g,'');
};
export function selectedStoryTarget(doc, snap, range, scope = {}) {
  if (!snap || !range || range.collapsed) return null;
  const element=node=>node?.nodeType===1?node:node?.parentElement;
  const start=element(range.startContainer),end=element(range.endContainer),body=start?.closest('#chat .mes[mesid] .mes_text');
  if (!body || !body.contains(end) || Number(body.closest('.mes').getAttribute('mesid'))!==snap.id) return null;
  if (start.closest('button,input,textarea,[contenteditable=true],[data-sttts-pic]') || end.closest('button,input,textarea,[contenteditable=true],[data-sttts-pic]')) return null;
  const text=range.toString().trim();if(!text || text.length>12000) return null;
  const masked=storyScope(snap.raw,scope).masked.replace(/<tts\b[^>]*>[\s\S]*?<\/tts\s*>/gi, tag=>tag.replace(/[^\r\n]/g,' '));
  const needle=compact(doc,text);
  if (!needle) return null;
  let offset=0, normalized='';
  const parts=paragraphs(snap.raw,scope).map(p=>{
    const content=masked.slice(offset,p.end);
    offset=p.end;
    const start=normalized.length;
    normalized+=compact(doc,content);
    return {start, stop:normalized.length, end:p.end, text:content.trim()};
  });
  // A whole paragraph disambiguates a short phrase repeated elsewhere in the same reply.
  const first=start.closest('p,li,blockquote'),last=end.closest('p,li,blockquote');
  const context=first && first===last ? compact(doc,first.textContent) : needle;
  const search=context.includes(needle)?context:needle;
  const hit=normalized.indexOf(search);
  // Identical fragments without a unique location must not write into the wrong paragraph.
  if(hit<0 || normalized.indexOf(search,hit+1)>=0)return null;
  const firstPart=parts.findIndex(p=>hit<p.stop), lastPart=parts.findIndex(p=>hit+search.length<=p.stop);
  if(firstPart<0 || lastPart<0)return null;
  let insertion=parts[lastPart].end;
  const wrappers=new Set((scope.body??NARRATION_BODY).map(x=>String(x).replace(/[<>/\s]/g,'').toLowerCase()));
  for(const [a,b,name] of blockRanges(snap.raw).sort((x,y)=>y[0]-x[0])) {
    if(a<insertion && insertion<b && !wrappers.has(name)) insertion=b;
  }
  const nearby=parts.slice(Math.max(0,firstPart-1),lastPart+2).map(p=>p.text.replace(/<[^>]*>/g,'')).join('\n');
  return {snap,text,end:insertion,context:nearby.slice(0,4000)};
}

export function createSelectionDraw({doc,hidden,message,valid,scope=()=>({}),draw,notice}) {
  const win=doc.defaultView;let target=null,button=null,timer=null,working=false;
  function hide(){button?.remove();button=null;target=null;}
  function capture(){
    if(working || hidden() || typeof draw!=='function') {hide();return;}
    const selection=doc.getSelection();if(!selection?.rangeCount || selection.isCollapsed){hide();return;}
    const range=selection.getRangeAt(0),node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    const mes=node?.closest('#chat .mes[mesid]'),snap=mes && message(Number(mes.getAttribute('mesid')));
    const next=selectedStoryTarget(doc,snap,range,scope());if(!next || !valid(next.snap)){hide();return;}
    target=next;
    if(!button){
      button=doc.createElement('button');button.type='button';button.className='sttts-selection-draw';button.setAttribute('aria-label','为选中文字生图');button.innerHTML=icon('paint');
      button.addEventListener('pointerdown',e=>e.preventDefault());
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();activate();});doc.body.append(button);
    }
    const rect=range.getBoundingClientRect?.() || mes.getBoundingClientRect(),size=40;
    button.style.left=Math.max(8,Math.min(rect.right+8,win.innerWidth-size-8))+'px';
    button.style.top=Math.max(8,Math.min(rect.bottom+10,win.innerHeight-size-8))+'px';
  }
  function schedule(){win.clearTimeout(timer);timer=win.setTimeout(capture,180);}
  async function activate(selected=target){
    if(!selected || working)return;
    working=true;hide();
    try{if(hidden() || !valid(selected.snap))throw Error('正文已经变化，请重新选择文字');await draw(selected);}
    catch(error){notice(error.message);}
    finally{working=false;}
  }
  doc.addEventListener('selectionchange',schedule);doc.addEventListener('pointerup',schedule);win.addEventListener('scroll',schedule,true);win.addEventListener('resize',schedule);
  return {refresh(){if(target && (hidden()||!valid(target.snap)))hide();},forMessage(id){return target?.snap.id===id?target:null;},activate,
    dispose(){win.clearTimeout(timer);hide();doc.removeEventListener('selectionchange',schedule);doc.removeEventListener('pointerup',schedule);win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',schedule);}};
}

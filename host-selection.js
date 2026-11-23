import {paragraphs} from './core/draw.js';
import {blockRanges, cleanSkip, NARRATION_SKIP, NARRATION_BODY, storyScope} from './core/story-scope.js';
import {icon} from './ui/icons.js';

// Match rendered words to the original story, without guessing through a regex replacement.
const compact = (doc, text) => {
  const box=doc.createElement('textarea');box.innerHTML=String(text).replace(/<[^>]*>/g,'');
  return box.value.replace(/[\s*_~`]+/g,'');
};
// Manual selections can also belong to an expanded extra outside the narration scope.
function foldedTarget(doc, snap, panel, text, scope) {
  if (!panel.open || panel.parentElement?.closest('details:not([open])')) return null;
  const skip=cleanSkip(scope.skip ?? NARRATION_SKIP).filter(tag=>!['details','小剧场','theater'].includes(tag));
  const masked=storyScope(snap.raw,{body:[],skip}).masked;
  const needle=compact(doc,text);
  if (!needle) return null;
  const title=compact(doc,panel.querySelector(':scope > summary')?.textContent || '');
  const stack=[], matches=[];
  for (const tag of masked.matchAll(/<(\/?)(details)(?=[\s>])[^<>]*>/gi)) {
    if (!tag[1]) { stack.push(tag.index+tag[0].length); continue; }
    const start=stack.pop();
    if (start===undefined) continue;
    const raw=snap.raw.slice(start,tag.index);
    const heading=raw.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i)?.[1];
    if (title && heading && compact(doc,heading)!==title) continue;
    const content=masked.slice(start,tag.index).replace(/<(?:i-tts|tts)\b[^>]*>[\s\S]*?<\/(?:i-tts|tts)\s*>/gi,' ');
    if (compact(doc,content).includes(needle)) matches.push(tag.index);
  }
  return matches.length===1 ? {snap,text,end:matches[0],context:''} : null;
}

export function selectedStoryTarget(doc, snap, range, scope = {}) {
  if (!snap || !range || range.collapsed) return null;
  const element=node=>node?.nodeType===1?node:node?.parentElement;
  const start=element(range.startContainer),end=element(range.endContainer),body=start?.closest('#chat .mes[mesid] .mes_text');
  if (!body || !body.contains(end) || Number(body.closest('.mes').getAttribute('mesid'))!==snap.id) return null;
  if (start.closest('button,input,textarea,[contenteditable=true],[data-sttts-pic]') || end.closest('button,input,textarea,[contenteditable=true],[data-sttts-pic]')) return null;
  const text=range.toString().trim();if(!text || text.length>12000) return null;
  const panel=start.closest('details');
  if (panel!==end.closest('details')) return null;
  if (panel) {
    if (start.closest('summary') || end.closest('summary')) return null;
    return foldedTarget(doc,snap,panel,text,scope);
  }
  const masked=storyScope(snap.raw,scope).masked.replace(/<(?:i-tts|tts)(?=[\s/>])[^>]*>[\s\S]*?<\/(?:i-tts|tts)\s*>/gi, tag=>tag.replace(/[^\r\n]/g,' '));
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

function drawButtonPosition(range, win) {
  const viewport=win.visualViewport;
  const left=viewport?.offsetLeft ?? 0, top=viewport?.offsetTop ?? 0;
  const right=left+(viewport?.width ?? win.innerWidth), bottom=top+(viewport?.height ?? win.innerHeight);
  const size=40, margin=8, handleGap=24;
  if (right-left<size+2*margin || bottom-top<size+2*margin) return null;
  const rects=Array.from(range.getClientRects?.() ?? []);
  if (!rects.length) rects.push(range.getBoundingClientRect?.());
  const visible=rects.filter(rect=>rect && rect.width>0 && rect.height>0
    && rect.right>left && rect.left<right && rect.bottom>top && rect.top<bottom);
  const last=visible.at(-1);
  if (!last) return null;
  const x=Math.max(left+margin,Math.min(last.right-size/2,right-size-margin));
  const below=last.bottom+handleGap;
  if (below+size<=bottom-margin) return {x,y:below};

  const y=Math.max(top+margin,Math.min((last.top+last.bottom-size)/2,bottom-size-margin));
  // When the last line is near the keyboard or window edge, keep the button out of the selected text.
  const clearSide=side=>visible.every(rect=>rect.bottom<=y || rect.top>=y+size
    || rect.right<=side || rect.left>=side+size);
  for (const side of [last.right+handleGap,last.left-margin-size]) {
    if (side>=left+margin && side+size<=right-margin && clearSide(side)) return {x:side,y};
  }
  const above=Math.min(...visible.map(rect=>rect.top))-handleGap-size;
  return above>=top+margin ? {x,y:above} : null;
}

export function createSelectionDraw({doc,hidden,message,valid,scope=()=>({}),draw,notice}) {
  const win=doc.defaultView, viewport=win.visualViewport;
  const requestFrame=win.requestAnimationFrame?.bind(win) ?? (callback=>win.setTimeout(callback,16));
  const cancelFrame=win.cancelAnimationFrame?.bind(win) ?? win.clearTimeout.bind(win);
  let target=null,button=null,frame=null,working=false,matchedRange=null;
  function hide(){button?.remove();button=null;target=null;matchedRange=null;}
  function capture(){
    frame=null;
    if(working || hidden() || typeof draw!=='function') {hide();return;}
    const selection=doc.getSelection();if(!selection?.rangeCount || selection.isCollapsed){hide();return;}
    const range=selection.getRangeAt(0);
    const sameRange=matchedRange && range.startContainer===matchedRange.startContainer
      && range.endContainer===matchedRange.endContainer && range.startOffset===matchedRange.startOffset
      && range.endOffset===matchedRange.endOffset;
    if (!sameRange || !valid(target.snap)) {
      const node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
      const mes=node?.closest('#chat .mes[mesid]'),snap=mes && message(Number(mes.getAttribute('mesid')));
      const next=selectedStoryTarget(doc,snap,range,scope());if(!next || !valid(next.snap)){hide();return;}
      target=next;
      matchedRange={startContainer:range.startContainer,endContainer:range.endContainer,
        startOffset:range.startOffset,endOffset:range.endOffset};
    }
    const position=drawButtonPosition(range,win);
    if (!position) {button?.remove();button=null;return;}
    if(!button){
      button=doc.createElement('button');button.type='button';button.className='sttts-selection-draw';button.setAttribute('aria-label','为选中文字生图');button.innerHTML=icon('paint');
      button.addEventListener('pointerdown',e=>e.preventDefault());
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();activate();});doc.body.append(button);
    }
    button.style.left=position.x+'px';
    button.style.top=position.y+'px';
  }
  function schedule(){if(frame===null)frame=requestFrame(capture);}
  async function activate(selected=target){
    if(!selected || working)return;
    working=true;hide();
    try{if(hidden() || !valid(selected.snap))throw Error('正文已经变化，请重新选择文字');await draw(selected);}
    catch(error){notice(error.message);}
    finally{working=false;}
  }
  const listeners=[[doc,'selectionchange'],[doc,'pointerup'],[doc,'touchend'],[win,'scroll',true],[win,'resize'],
    [viewport,'scroll'],[viewport,'resize']];
  for (const [source,event,capture] of listeners) source?.addEventListener(event,schedule,capture);
  return {refresh(){if(target && (hidden()||!valid(target.snap)))hide();},forMessage(id){return target?.snap.id===id?target:null;},activate,
    dispose(){
      if (frame!==null) cancelFrame(frame);
      hide();
      for (const [source,event,capture] of listeners) source?.removeEventListener(event,schedule,capture);
    }};
}

// Small, passive, in-memory evidence for conflicting message gestures. No text,
// field values, URLs, credentials or persistent storage are read or retained.
export function storyInputProbe(win, {paused = () => false} = {}) {
  const rows=[], realms=new Map(), pending=new WeakMap(), nodes=new WeakMap(), timers=new Set();
  let serial=0,disposed=false;
  const own='#sttts-panel,#sttts-floating,#sttts-open,#sttts-wand-entry,.sttts-context-menu,.sttts-viewer,.sttts-vn,.sttts-ask,[data-sttts-owned=game]';
  const number=node=>{if(!node)return null;if(!nodes.has(node))nodes.set(node,++serial);return nodes.get(node);};
  const label=node=>{const cls=typeof node?.className==='string'?node.className:node?.className?.baseVal||'';return (node?.tagName?.toLowerCase()||'?')+[...String(cls).split(/\s+/).filter(Boolean)].slice(0,3).map(c=>'.'+c.slice(0,50)).join('');};
  const path=node=>{const out=[];for(let i=0;node&&i<4;i++,node=node.parentElement)out.push(label(node));return out.join(' ← ');};
  function attach(realm,frame=null) {
    let doc;try{doc=realm.document;if(!doc)return;}catch{return;}
    const old=realms.get(realm);if(old?.doc===doc)return;old?.stop();
    const capture=event=>{
      if(disposed||paused())return;
      const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
      if(!target||target.closest?.(own))return;
      const box=target.closest?.('.mes_text'),mes=target.closest?.('.mes[mesid]')||frame?.closest?.('.mes[mesid]');
      const now=Date.now(),before=[...rows].reverse().find(row=>row.type===event.type&&row.realm===(frame?'正文 iframe':'主页面')),delay=realm.performance?.now?.()-event.timeStamp,id=mes?.getAttribute('mesid');
      const row={at:now,stamp:event.timeStamp,type:event.type,realm:frame?'正文 iframe':'主页面',target:path(target),message:/^\d{1,9}$/.test(id||'')?id:null,node:number(box||frame||target),gap:before?now-before.at:null,inputGap:before?Math.round(event.timeStamp-before.stamp):null,delay:Number.isFinite(delay)&&delay>=0&&delay<60000?Math.round(delay):null,bubbled:false,prevented:false,connected:true,menu:false};
      rows.push(row);if(rows.length>8)rows.shift();pending.set(event,row);
      // Native input can run microtask checkpoints between event listeners.
      // A task observes the final flags after all handlers, without intercepting.
      const timer=win.setTimeout(()=>{timers.delete(timer);if(disposed)return;row.prevented=event.defaultPrevented;row.connected=target.isConnected&&(box?.isConnected??true);row.menu=!!win.document.querySelector('.st-chatu8-click-trigger-overlay:not(.closing)');},120);timers.add(timer);
    };
    const bubble=event=>{const row=pending.get(event);if(row)row.bubbled=true;};
    for(const type of ['touchend','dblclick']){realm.addEventListener(type,capture,{capture:true,passive:true});realm.addEventListener(type,bubble,{passive:true});}
    const stop=()=>{try{for(const type of ['touchend','dblclick']){realm.removeEventListener(type,capture,true);realm.removeEventListener(type,bubble,false);}}catch{/* a frame may have navigated cross-origin */}};
    realms.set(realm,{doc,frame,stop});
  }
  function watchFrames() {
    if(disposed)return;
    for(const [realm,v] of realms)if(v.frame&&!v.frame.isConnected){v.stop();realms.delete(realm);}
    for(const frame of [...win.document.querySelectorAll('#chat iframe')].slice(0,20))try{if(frame.contentWindow)attach(frame.contentWindow,frame);}catch{/* cross-origin is not inspected */}
  }
  attach(win);
  const loaded=event=>{const frame=event.target;if(frame?.tagName!=='IFRAME'||!frame.closest('#chat'))return;for(const [realm,v] of realms)if(v.frame&&!v.frame.isConnected){v.stop();realms.delete(realm);}if(realms.size<21)try{attach(frame.contentWindow,frame);}catch{/* cross-origin */}};
  win.document.addEventListener('load',loaded,true);
  watchFrames();
  return {watchFrames,snapshot(){
    watchFrames();const d=win.document;
    return {version:'0.9.73',width:win.innerWidth,clientWidth:d.documentElement.clientWidth,visualWidth:Math.round(win.visualViewport?.width||0),scale:win.visualViewport?.scale||1,touchPoints:win.navigator?.maxTouchPoints||0,touchStart:'ontouchstart' in win,frames:realms.size-1,events:rows.map(row=>({...row}))};
  },dispose(){disposed=true;win.document.removeEventListener('load',loaded,true);for(const v of realms.values())v.stop();realms.clear();for(const timer of timers)win.clearTimeout(timer);timers.clear();rows.length=0;}};
}

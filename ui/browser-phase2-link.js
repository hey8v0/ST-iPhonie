export const bridgeOrigin = 'http://127.0.0.1:6091';
export const bridgeVersion = 3;
export const bridgeBuild = '0.2.2';
const repairOrigin = 'http://127.0.0.1:6092';
export const bridgeKey = /^([a-f0-9]{64})$/;

export function browserLink({doc,win},target,key,onEvent,{repair=false}={}) {
  const origin=repair ? repairOrigin : bridgeOrigin;
  const frame = doc.createElement('iframe');
  frame.title = '网页画面';
  frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');
  frame.src = origin+(repair?'/repair':'/viewer');
  const send = (type,payload={}) => frame.contentWindow?.postMessage({type,...payload},origin);
  const pending = new Map();
  let closed = false, watchdog = win.setTimeout(()=>onEvent('rfb-state',{stage:'unavailable'}),12000);
  function receive(event) {
    if (event.source !== frame.contentWindow || event.origin !== origin || closed || !event.data) return;
    const {type,id,result} = event.data;
    if (type === 'rfb-result') {
      pending.get(id)?.(result);
      return;
    }
    if (!['rfb-state','rfb-trace','browser-state','rfb-gesture','rfb-touch','rfb-ime',...(repair?['repair-info']:[])].includes(type)) return;
    if (type === 'rfb-state' || type === 'browser-state') win.clearTimeout(watchdog);
    onEvent(type,event.data);
  }
  win.addEventListener('message',receive);
  frame.addEventListener('load',()=>send('rfb-init',{key}),{once:true});
  target.replaceChildren(frame);
  return {
    frame,
    send,
    command(action,params) {
      if (closed) return Promise.resolve({ok:false});
      const id = win.crypto.randomUUID();
      return new Promise(resolve=>{
        const timer = win.setTimeout(()=>complete({ok:false,error:'timeout'}),repair?12000:5200);
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

// Project each ancestor's visual viewport into the browser area's own layout
// coordinates. The host can move or scale the phone while the keyboard opens.
export function visibleBrowserArea(win,element) {
  const rect=element.getBoundingClientRect();
  let top=rect.top,bottom=rect.bottom,offset=0,scale=1,current=win;
  const viewports=[];
  while (current) {
    const viewport=current.visualViewport;
    const start=viewport?.offsetTop || 0;
    const height=viewport?.height || current.innerHeight;
    viewports.push({offsetTop:Math.round(start),height:Math.round(height),
      width:Math.round(viewport?.width || current.innerWidth),scale:viewport?.scale || 1});
    top=Math.max(top,(start-offset)/scale);
    bottom=Math.min(bottom,(start+height-offset)/scale);
    if (current===current.parent) break;
    try {
      const child=current.frameElement;
      if (!child?.clientHeight) break;
      const bounds=child.getBoundingClientRect();
      const factor=bounds.height/(child.offsetHeight || child.clientHeight);
      if (!(factor>0)) break;
      offset=bounds.top+(child.clientTop+offset)*factor;
      scale*=factor;
      current=current.parent;
    } catch {break;}
  }
  return {top:Math.round(Math.max(0,top-rect.top)),height:Math.max(0,Math.floor(bottom-top)),
    width:Math.round(rect.width),containerHeight:Math.round(rect.height),viewports};
}

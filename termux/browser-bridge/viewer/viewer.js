import {viewerGeometry} from './geometry.js';
import {browserInput} from './input.js';

const surface = document.getElementById('surface');
const trusted = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const token = /^[a-f0-9]{64}$/;
const version = 3;
const supportedServices = new Set(['0.2.2','0.2.3']);
const recoveryMode=location.pathname==='/repair';
let parentOrigin, key, rfb, geometry,frame = false, verified = false, telem, desktop = false;
let stopped = false, pollTimer, connectionTimer, waitingClipboard,lastStatus,planned,planTimer, editing=false,hold=false;

function announce(type,data={}) {
  if (parentOrigin) parent.postMessage({type,...data},parentOrigin);
}
async function api(route,body) {
  const response = await fetch(route,{method:'POST',redirect:'error',cache:'no-store',
    headers:{Authorization:'Bearer '+key,...(body ? {'Content-Type':'application/json'} : {})},
    body:body && JSON.stringify(body),signal:AbortSignal.timeout(recoveryMode?11000:4500)});
  if (response.status === 403) throw new Error('pair');
  return response.json();
}
function publish(payload) {
  const snapshot=JSON.stringify(payload);
  if (snapshot!==lastStatus) {lastStatus=snapshot;announce('browser-state',payload);}
}
function sameTarget(data,state=telem) {
  return state?.activeId === data.tabId && state?.focus &&
    state.field?.frame === data.frame && state.field?.id === data.id;
}
const proxy=browserInput({doc:document,win:window},document.body,payload=>{
  if (!sendInput(payload) && planned && planned.rows.length<12) planned.rows.push(payload);
},active=>announce('rfb-ime',{active}));
function reconcileInput() {
  if (planned && telem?.activeId===planned.tabId && !sameTarget(planned)) return;
  if (planned) {
    if (sameTarget(planned)) for (const payload of planned.rows) sendInput(payload);
    planned=null;clearTimeout(planTimer);
  }
  if (proxy.isFocused()) proxy.bind(telem?.activeId,telem?.focus,telem?.field);
}
async function status() {
  clearTimeout(pollTimer);
  if (stopped || !verified) return;
  try {
    const result = await api('/status');
    telem = result.state;
    reconcileInput();
    publish({status:result.status,version:result.version,build:result.build,extension:result.extension,signed:result.signed,state:telem});
    desktop = telem?.tabs.find(tab=>tab.id === telem.activeId)?.desktop === true;
    geometry?.mode(desktop);
    geometry?.firefox(telem?.viewport);
  } catch (error) {
    telem=null;reconcileInput();
    publish({status:error.message === 'pair' ? 'pair' : 'offline',state:null});
  } finally {
    if (!stopped) pollTimer = setTimeout(status,document.hidden ? 1500 : 250);
  }
}

function setStage(stage) {
  announce('rfb-state',{stage});
}
async function connect() {
  try {
    const result = await api('/status');
    if (recoveryMode) {
      if (result?.service!=='iphonie-firefox-recovery' || result.revision!==1) {setStage('version');return;}
      announce('repair-info',{build:result.build,addon:result.addon,update:result.update,signed:result.signed});
    } else if (result?.version !== version || !supportedServices.has(result.build)) {
      publish({status:'version-mismatch',version:result?.version,build:result?.build,state:null});
      setStage('version');return;
    }
    verified = true;
    if (!recoveryMode) void status();
  } catch (error) {setStage(error.message === 'pair' ? 'pair' : 'unavailable');return;}
  try {
    const module = await Promise.race([import('/core/rfb.js'),
      new Promise((_,reject)=>{connectionTimer=setTimeout(reject,7500);})]);
    clearTimeout(connectionTimer);
    if (stopped) return;
    const address = new URL('/rfb',location.href);
    address.protocol = 'ws:';
    rfb = new module.default(surface,address.href,{shared:true,wsProtocols:['iphonie.'+key]});
    rfb.background = '#111';
    rfb.focusOnClick = !matchMedia('(pointer: coarse)').matches;
    rfb.qualityLevel=9;
    geometry=viewerGeometry(rfb,surface,(kind,details)=>{
      announce('rfb-trace',{kind,details});
      if (kind==='first-frame') {
        frame=true;clearTimeout(connectionTimer);setStage('ready');
      }
    });
    geometry.mode(desktop);
    geometry.editing(editing);
    geometry.hold(hold || recoveryMode);
    const deadline = () => {
      clearTimeout(connectionTimer);
      connectionTimer = setTimeout(()=>{
        setStage('timeout');
        rfb.disconnect();
      },18000);
    };
    deadline();
    rfb.addEventListener('credentialsrequired',()=>{
      clearTimeout(connectionTimer);
      setStage('password');
    });
    rfb.addEventListener('connect',deadline);
    rfb.addEventListener('securityfailure',()=>{
      clearTimeout(connectionTimer);
      setStage('security');
    });
    rfb.addEventListener('disconnect',()=>{
      frame = false;
      geometry?.close();
      proxy.release();
      clearTimeout(connectionTimer);
      setStage('closed');
    });
    rfb.addEventListener('clipboard',event=>waitingClipboard?.(event.detail.text));
  } catch {
    clearTimeout(connectionTimer);
    setStage('unavailable');
  }
}

const xkeys = {Enter:0xff0d,Backspace:0xff08,Escape:0xff1b,Delete:0xffff,Tab:0xff09,
  ArrowLeft:0xff51,ArrowUp:0xff52,ArrowRight:0xff53,ArrowDown:0xff54,Home:0xff50,End:0xff57};
function textInput(text) {
  for (const character of text.replace(/\r\n?/g,'\n')) {
    const point = character.codePointAt(0);
    rfb.sendKey(character === '\n' ? xkeys.Enter :
      character === '\t' ? xkeys.Tab : point <= 255 ? point : 0x01000000 | point);
  }
}
function sendInput(data) {
  if (!frame || !sameTarget(data)) return false;
  if (typeof data.text === 'string' && data.text.length <= 4096) textInput(data.text);
  if (Object.hasOwn(xkeys,data.key)) rfb.sendKey(xkeys[data.key]);
  return true;
}
function selectText() {
  if (waitingClipboard) return Promise.resolve('');
  return new Promise(resolve=>{
    const timer = setTimeout(()=>waitingClipboard(''),900);
    waitingClipboard = text => {clearTimeout(timer);waitingClipboard=null;resolve(String(text||'').slice(0,8000));};
    rfb.sendKey(0xffe3,'ControlLeft',true);
    rfb.sendKey(99,'KeyC');
    rfb.sendKey(0xffe3,'ControlLeft',false);
  });
}

window.addEventListener('message',async ({source,origin,data})=>{
  if (source !== parent || !trusted.test(origin) || !data || (parentOrigin && origin !== parentOrigin)) return;
  if (data.type === 'rfb-init' && !parentOrigin && token.test(data.key || '')) {
    parentOrigin = origin;
    key = data.key;
    void connect();
    return;
  }
  if (!parentOrigin) return;
  if (data.type === 'rfb-dispose') {
    stopped=true;proxy.release();clearTimeout(planTimer);rfb?.disconnect();clearTimeout(pollTimer);return;
  }
  if (data.type === 'rfb-password' && typeof data.password === 'string' && data.password.length <= 128) {
    rfb?.sendCredentials({password:data.password});
    connectionTimer = setTimeout(()=>{setStage('timeout');rfb?.disconnect();},18000);
  }
  if (data.type === 'rfb-geometry') {
    editing=data.editing===true;hold=data.hold===true;
    geometry?.editing(editing);geometry?.hold(hold || recoveryMode);
  }
  if (data.type === 'rfb-input') sendInput(data);
  if (data.type === 'rfb-ime-release') {planned=null;clearTimeout(planTimer);proxy.release();}
  if (data.type === 'rfb-command' && verified && typeof data.id === 'string') {
    let result = {ok:false};
    try {
      if (recoveryMode) {
        if (data.action==='repair-done' ||
          (frame && ['repair-open','repair-restore','repair-addon','repair-restart'].includes(data.action))) result=await api('/'+data.action,{});
      } else if (data.action === 'diagnostics') result = await api('/diagnostics');
      else if (data.action === 'selection' && frame) result = {text:await selectText()};
      else if (data.action === 'screenshot' && frame) {
        const canvas = geometry?.canvas;
        result = {image:canvas?.toDataURL('image/jpeg',.82)};
      } else result = await api('/command',{version,id:data.id,action:data.action,params:data.params});
    } catch {}
    announce('rfb-result',{id:data.id,result});
  }
});

let drag = null;
let rfbDrag;
for (const name of ['gesturestart','gesturemove','gestureend']) {
  surface.addEventListener(name,event=>{
    if (!rfb || event.detail.type !== 'drag') return;
    if (name === 'gesturestart') {
      rfbDrag={start:event,y:event.detail.clientY,mode:null};
      event.stopPropagation();
      return;
    }
    if (!rfbDrag) return;
    const current=rfbDrag;
    if (name === 'gestureend') {
      if (current.mode !== 'pointer') event.stopPropagation();
      rfbDrag=null;return;
    }
    if (!current.mode) {
      const dx=event.detail.clientX-current.start.detail.clientX;
      const dy=event.detail.clientY-current.start.detail.clientY;
      current.mode=Math.abs(dy)>=Math.abs(dx)*1.15 ? 'scroll' : 'pointer';
      if (current.mode === 'pointer') rfb._handleGesture(current.start);
    }
    if (current.mode === 'pointer') return;
    event.stopPropagation();
    rfb._handleWheel(new WheelEvent('wheel',{
      clientX:current.start.detail.clientX,clientY:current.start.detail.clientY,
      deltaY:(current.y-event.detail.clientY)*1.45,
    }));
    current.y=event.detail.clientY;
  },true);
}
surface.addEventListener('touchstart',event=>{
  if (event.touches.length !== 1) {drag=null;return;}
  const touch=event.touches[0];
  drag={x:touch.clientX,y:touch.clientY,at:performance.now(),sent:false};
},{capture:true,passive:true});
surface.addEventListener('touchmove',event=>{
  if (!drag || drag.sent || event.touches.length !== 1) return;
  const touch=event.touches[0], dy=touch.clientY-drag.y;
  if (Math.abs(dy) < 36 || Math.abs(dy) < Math.abs(touch.clientX-drag.x)*1.3) return;
  const edge = (drag.y < 22 && dy > 0) || (drag.y > innerHeight-22 && dy < 0);
  drag.sent=true;
  announce('rfb-gesture',{direction:dy<0 ? 'down' : 'up',edge});
},{capture:true,passive:true});
surface.addEventListener('wheel',event=>{
  if (!event.ctrlKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX) && event.deltaY)
    announce('rfb-gesture',{direction:event.deltaY>0 ? 'down' : 'up',edge:false});
},{capture:true,passive:true});
surface.addEventListener('touchend',event=>{
  const first=drag;
  drag=null;
  const touch=event.changedTouches[0];
  if (!frame || !event.isTrusted || !first || !touch || performance.now()-first.at>460 ||
    Math.hypot(touch.clientX-first.x,touch.clientY-first.y)>12) return;
  const view=telem?.viewport;
  let hint;
  if (view && geometry && !desktop && geometry.interactive()) {
    const rect=geometry.canvas.getBoundingClientRect();
    const unit=geometry.display.scale*view.dpr*view.scale;
    const x=(touch.clientX-rect.left)/unit+view.offsetLeft,y=(touch.clientY-rect.top)/unit+view.offsetTop;
    hint=telem.hints.find(box=>x>=box.x && x<box.x+box.w && y>=box.y && y<box.y+box.h);
  }
  let prepared=false;
  if (hint && telem.activeId!=null) {
    const field={frame:hint.frame,id:hint.id};
    planned={tabId:telem.activeId,...field,rows:[]};
    proxy.bind(planned.tabId,hint.role,field);
    prepared=proxy.focus();
    clearTimeout(planTimer);
    planTimer=setTimeout(()=>{
      if (!planned) return;
      planned=null;
      proxy.release();
    },1250);
  } else if (proxy.isFocused()) {
    // The last remote focus could belong to an input the tap just left.
    planned=null;
    clearTimeout(planTimer);
    proxy.release();
  }
  announce('rfb-touch',{prepared});
},{capture:true,passive:true});
surface.addEventListener('touchcancel',()=>{drag=null;},{capture:true,passive:true});
window.addEventListener('keydown',event=>{
  if(event.key === 'Escape') announce('rfb-gesture',{direction:'escape'});
},true);

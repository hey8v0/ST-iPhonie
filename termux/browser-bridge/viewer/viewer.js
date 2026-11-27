const surface = document.getElementById('surface');
const trusted = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const token = /^[a-f0-9]{64}$/;
const version = 2;
let parentOrigin, key, rfb, frame = false, verified = false, telem, pause = false, desktop = false;
let stopped = false, pollTimer, connectionTimer, waitingClipboard;

function announce(type,data={}) {
  if (parentOrigin) parent.postMessage({type,...data},parentOrigin);
}
async function api(route,body) {
  const response = await fetch(route,{method:'POST',redirect:'error',cache:'no-store',
    headers:{Authorization:'Bearer '+key,...(body ? {'Content-Type':'application/json'} : {})},
    body:body && JSON.stringify(body),signal:AbortSignal.timeout(4500)});
  if (response.status === 403) throw new Error('pair');
  return response.json();
}
async function status() {
  clearTimeout(pollTimer);
  if (stopped || !verified) return;
  try {
    const result = await api('/status');
    telem = result.state;
    announce('browser-state',{status:result.status,version:result.version,state:telem});
    const mode = telem?.tabs.find(tab=>tab.id === telem.activeId)?.desktop === true;
    if (mode !== desktop) {
      desktop = mode;
      if (rfb && !pause) rfb.resizeSession = true;
    }
  } catch (error) {
    announce('browser-state',{status:error.message === 'pair' ? 'pair' : 'offline',state:null});
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
    if (result?.version !== version) {setStage('version');return;}
    verified = true;
    void status();
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
    rfb.scaleViewport = true;
    // v1.6.0 private hooks. noVNC still maps physical coordinates using the
    // actual display scale. Only the requested server dimensions are widened.
    const requestResize = rfb._requestRemoteResize;
    const screenSize = rfb._screenSize;
    const dataRect = rfb._handleDataRect;
    const update = rfb._framebufferUpdate;
    if (![requestResize,screenSize,dataRect,update].every(fn=>typeof fn === 'function')) throw Error('viewer-version');
    rfb._requestRemoteResize = function () {
      if (pause) return;
      if (!desktop) return requestResize.call(this);
      this._screenSize = () => {
        const {w,h} = screenSize.call(this);
        const wide = Math.max(w,960);
        return {w:Math.floor(wide),h:Math.floor(Math.max(h,Math.min(h*wide/w,1600)))};
      };
      try {return requestResize.call(this);} finally {delete this._screenSize;}
    };
    let pixels = false, painted = false;
    const resize = rfb._resize;
    rfb._resize = function (width,height) {
      const result = resize.call(this,width,height);
      announce('rfb-size',{width,height});
      return result;
    };
    rfb._handleDataRect = function (...args) {
      const done = dataRect.apply(this,args);
      pixels ||= done;
      return done;
    };
    rfb._framebufferUpdate = function (...args) {
      const done = update.apply(this,args);
      if (done && pixels && !painted) {
        painted = true;
        queueMicrotask(()=>Promise.resolve().then(()=>this._display.flush()).then(()=>{
          if (stopped) return;
          frame = true;
          clearTimeout(connectionTimer);
          setStage('ready');
        }).catch(()=>setStage('unavailable')));
      }
      return done;
    };
    rfb.resizeSession = true;
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
  if (data.type === 'rfb-dispose') {stopped=true;rfb?.disconnect();clearTimeout(pollTimer);return;}
  if (data.type === 'rfb-password' && typeof data.password === 'string' && data.password.length <= 128) {
    rfb?.sendCredentials({password:data.password});
    connectionTimer = setTimeout(()=>{setStage('timeout');rfb?.disconnect();},18000);
  }
  if (data.type === 'rfb-resize-pause') {
    pause = data.pause === true;
    if (rfb) rfb.resizeSession = !pause;
  }
  if (data.type === 'rfb-input' && frame && telem?.activeId === data.tabId && telem?.focus) {
    if (typeof data.text === 'string' && data.text.length <= 4096) textInput(data.text);
    if (Object.hasOwn(xkeys,data.key)) rfb.sendKey(xkeys[data.key]);
  }
  if (data.type === 'rfb-command' && verified && typeof data.id === 'string') {
    let result = {ok:false};
    try {
      if (data.action === 'diagnostics') result = await api('/diagnostics');
      else if (data.action === 'selection' && frame) result = {text:await selectText()};
      else if (data.action === 'screenshot' && frame) {
        const canvas = surface.querySelector('canvas');
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
surface.addEventListener('pointerdown',()=>announce('rfb-touch'),{capture:true,passive:true});
window.addEventListener('keydown',event=>{
  if(event.key === 'Escape') announce('rfb-gesture',{direction:'escape'});
},true);

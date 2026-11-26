// Compatibility bootstrap for the pinned noVNC v1.6.0 UI.
(async()=>{
  const status=window.iphonieViewer;
  const report=stage=>status.report(stage);
  const bounded=async(promise,ms,stage)=>{
    let timer;
    try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(stage),{stage})),ms);})]);}
    finally{clearTimeout(timer);}
  };
  let UI,RFB;
  report('modules');
  try{[{default:UI},{default:RFB}]=await bounded(Promise.all([import('/app/ui.js'),import('/core/rfb.js')]),8000,'module-timeout');}
  catch(e){report(e.stage||'module-failure');return;}
  // noVNC v1.6.0 private hooks are version-locked. Only acknowledge a real
  // data rectangle followed by a completed framebuffer update and display flush.
  const dataRect=RFB.prototype._handleDataRect, framebuffer=RFB.prototype._framebufferUpdate;
  if(typeof dataRect!=='function'||typeof framebuffer!=='function'){report('ui-failure');return;}
  const drew=new WeakSet(), acknowledged=new WeakSet();
  let active=null, timer;
  const clear=()=>{clearTimeout(timer);};
  const deadline=(stage,ms)=>{clear();timer=setTimeout(()=>{report(stage);active?.disconnect();},ms);};
  RFB.prototype._handleDataRect=function(...args){const done=dataRect.apply(this,args);if(done)drew.add(this);return done;};
  RFB.prototype._framebufferUpdate=function(...args){
    const done=framebuffer.apply(this,args);
    if(done&&drew.has(this)&&!acknowledged.has(this)){
      acknowledged.add(this);
      Promise.resolve().then(()=>this._display.flush()).then(()=>{
        if(active===this&&status.stage==='authenticated'){clear();report('first-frame');}
      }).catch(()=>{if(active===this){clear();report('render-failure');}});
    }
    return done;
  };
  const connect=UI.connect;
  UI.connect=function(...args){
    if(UI.rfb)return connect.apply(this,args);
    report('ws-start');
    try{connect.apply(this,args);}catch{report('ui-failure');return;}
    const rfb=UI.rfb;
    if(!rfb){report('ui-failure');return;}
    window.iphonieControl(rfb, UI);
    active=rfb;deadline('connection-timeout',18000);
    rfb.addEventListener('credentialsrequired',()=>{if(active===rfb){clear();report('password');}});
    rfb.addEventListener('connect',()=>{if(active===rfb){report('authenticated');deadline('frame-timeout',15000);}});
    rfb.addEventListener('securityfailure',()=>{if(active===rfb){clear();report('security-failure');}});
    rfb.addEventListener('disconnect',()=>{if(active===rfb){clear();active=null;report('disconnect');}});
  };
  // Credential submission restarts the handshake deadline, without recording the password.
  document.getElementById('noVNC_credentials_dlg')?.addEventListener('submit',()=>{if(active){report('ws-start');deadline('connection-timeout',18000);}},true);
  report('ui-start');
  try{
    await bounded(UI.start({settings:{defaults:{host:location.hostname,port:location.port,path:'websockify',resize:'scale'},mandatory:{host:location.hostname,port:location.port,path:'websockify',encrypt:false}}}),7000,'ui-timeout');
    if(status.stage==='ui-start')report('ui-ready');
  }catch(e){report(e.stage||'ui-failure');}
})();

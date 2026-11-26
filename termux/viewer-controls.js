// Only the authenticated RFB session receives browser shortcuts. No command shell is involved.
window.iphonieControl = function bindBrowserControls(rfb, UI) {
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  let authenticated = false, pendingCopy, copyTimer, connectedParent = '';
  let resizeMode='remote', resizePaused=false, resizeTimer;
  const send = (origin, data) => parent.postMessage({type:'iphonie-browser-result', ...data}, origin);
  const ctrl = 0xffe3, alt = 0xffe9, shift = 0xffe1;
  const keys = {
    back:[alt,0xff51], forward:[alt,0xff53], reload:[ctrl,114], home:[alt,0xff50],
    tabs:[ctrl,9+0xff00], newTab:[ctrl,116], closeTab:[ctrl,119],
    zoomIn:[ctrl,43], zoomOut:[ctrl,45], zoomReset:[ctrl,48],
    firefoxFull:[0xffc8], escape:[0xff1b]
  };
  function installDesktopSizing(){
    // Keep noVNC's real screen size for drawing, fitting and pointer mapping.
    // Only a SetDesktopSize request uses the desktop preview dimensions.
    const baseSize=rfb._screenSize?.bind(rfb);
    const request=rfb._requestRemoteResize?.bind(rfb);
    if(!baseSize || !request)return;
    rfb._requestRemoteResize=()=>{
      const {w,h}=baseSize();
      if(resizePaused || w<160 || h<120)return;
      if(resizeMode!=='desktop')return request();
      const size=rfb._screenSize;
      rfb._screenSize=()=>({w:1024,h:Math.min(1280,Math.max(480,Math.round(h*1024/w)))});
      try{return request();}finally{rfb._screenSize=size;}
    };
  }
  const shortcut = keys => {
    keys.forEach(key => rfb.sendKey(key, null, true));
    [...keys].reverse().forEach(key => rfb.sendKey(key, null, false));
  };
  const editKeys = {backspace:0xff08, enter:0xff0d, space:32};
  // noVNC 1.6 advertises extended UTF-8 clipboard support through these pinned fields.
  // Its legacy clipboard encoding replaces Unicode characters with question marks.
  function inputText(text){
    if(rfb._clipboardServerCapabilitiesFormats?.[1] && rfb._clipboardServerCapabilitiesActions?.[1<<27]){
      rfb.clipboardPasteFrom(text);
      shortcut([ctrl,118]);
      return;
    }
    for(const char of text.replace(/\r\n?/g,'\n')){
      const code=char.codePointAt(0);
      const key=char==='\n'?0xff0d:char==='\t'?0xff09:code<=255?code:0x01000000|code;
      if(code>=32 || char==='\n' || char==='\t')rfb.sendKey(key);
    }
  }
  function freezeResize(paused){
    clearTimeout(resizeTimer);
    resizePaused=paused;
    if(paused)rfb.resizeSession=false;
    else resizeTimer=setTimeout(()=>{
      if(authenticated && !resizePaused)rfb.resizeSession=resizeMode!=='scale';
    },500);
  }
  const capture = () => {
    const source = document.querySelector('#noVNC_container canvas');
    if (!source?.width || !source?.height) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 960 / Math.max(source.width,source.height));
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.75);
  };
  function clearCopy() {pendingCopy=null;clearTimeout(copyTimer);}
  rfb.addEventListener('clipboard', event => {
    if (!pendingCopy) return;
    const {origin,id,action}=pendingCopy;
    clearCopy();
    const text=String(event.detail.text || '').slice(0,4000);
    if(action==='url') {
      shortcut([0xff1b]);
      let url;
      try {url=new URL(text); if(!['https:','http:'].includes(url.protocol)||url.username||url.password) url=null;} catch {}
      send(origin,{id,text:url?.href || ''});
    } else send(origin,{id,text});
  });
  function message(event) {
    if(!authenticated || event.source!==parent || !allowed.test(event.origin) || event.data?.type!=='iphonie-browser-control') return;
    const {action,id,value}=event.data;
    connectedParent=event.origin;
    if(Object.hasOwn(keys,action)) {shortcut(keys[action]);return;}
    if(action==='native-tools') {
      document.documentElement.classList.toggle('iphonie-show-native');
      return;
    }
    if(action==='pause-resize' && typeof value==='boolean'){
      freezeResize(value);return;
    }
    if(action==='key' && Object.hasOwn(editKeys,value)){
      rfb.sendKey(editKeys[value]);return;
    }
    if(action==='mode' && ['remote','desktop','scale'].includes(value)) {
      rfb.scaleViewport=true;
      resizeMode=value;
      rfb.resizeSession=resizeMode!=='scale' && !resizePaused;
      return;
    }
    if(action==='open' && typeof value==='string' && value.length<2048) {
      let url;
      try {url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;}catch{return;}
      shortcut([ctrl,108]);inputText(url.href);shortcut([0xff0d]);
      send(event.origin,{id,ok:true});return;
    }
    if(['input','paste'].includes(action) && typeof value==='string' && value.length>0 && value.length<=8000) {
      inputText(value);
      send(event.origin,{id,ok:true});return;
    }
    if(!Number.isSafeInteger(id))return;
    if(action==='screenshot'){
      const image=capture();
      send(event.origin,{id,image});return;
    }
    if(!['url','selection'].includes(action))return;
    clearCopy();
    pendingCopy={origin:event.origin,id,action};
    if(action==='url')shortcut([ctrl,108]);
    shortcut([ctrl,99]);
    copyTimer=setTimeout(()=>{
      if(action==='url')shortcut([0xff1b]);
      send(event.origin,{id,text:''});clearCopy();
    },1400);
  }
  rfb.addEventListener('connect',()=>{
    authenticated=true;
    if(new URLSearchParams(location.search).get('iphonie')!=='next')return;
    document.documentElement.classList.add('iphonie-embedded');
    rfb.scaleViewport=true;
    resizeMode=new URLSearchParams(location.search).get('resize')==='scale'?'scale':'remote';
    installDesktopSizing();
    rfb.resizeSession=resizeMode!=='scale';
    window.addEventListener('message',message);
  });
  rfb.addEventListener('disconnect',()=>{
    authenticated=false;clearCopy();
    clearTimeout(resizeTimer);
    window.removeEventListener('message',message);
    if(connectedParent)send(connectedParent,{disconnected:true});
  });
};


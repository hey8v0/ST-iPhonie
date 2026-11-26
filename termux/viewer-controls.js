// Only the authenticated RFB session receives browser shortcuts. No command shell is involved.
window.iphonieControl = function bindBrowserControls(rfb, UI) {
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  let authenticated = false, pendingCopy, copyTimer, connectedParent = '';
  const send = (origin, data) => parent.postMessage({type:'iphonie-browser-result', ...data}, origin);
  const ctrl = 0xffe3, alt = 0xffe9, shift = 0xffe1;
  const keys = {
    back:[alt,0xff51], forward:[alt,0xff53], reload:[ctrl,114], home:[alt,0xff50],
    tabs:[ctrl,9+0xff00], newTab:[ctrl,116], closeTab:[ctrl,119],
    zoomIn:[ctrl,43], zoomOut:[ctrl,45], zoomReset:[ctrl,48],
    responsive:[ctrl,shift,109], firefoxFull:[0xffc8], escape:[0xff1b]
  };
  const shortcut = keys => {
    keys.forEach(key => rfb.sendKey(key, null, true));
    [...keys].reverse().forEach(key => rfb.sendKey(key, null, false));
  };
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
    if(action==='keyboard') {document.querySelector('#noVNC_keyboard_button')?.click();return;}
    if(action==='mode') {
      rfb.scaleViewport=true;
      rfb.resizeSession=value==='remote';
      return;
    }
    if(action==='open' && typeof value==='string' && value.length<2048) {
      let url;
      try {url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;}catch{return;}
      shortcut([ctrl,108]);rfb.clipboardPasteFrom(url.href);shortcut([ctrl,118]);shortcut([0xff0d]);return;
    }
    if(action==='paste' && typeof value==='string' && value.length<=8000) {
      rfb.clipboardPasteFrom(value);shortcut([ctrl,118]);return;
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
    rfb.resizeSession=new URLSearchParams(location.search).get('resize')!=='scale';
    window.addEventListener('message',message);
  });
  rfb.addEventListener('disconnect',()=>{
    authenticated=false;clearCopy();
    window.removeEventListener('message',message);
    if(connectedParent)send(connectedParent,{disconnected:true});
  });
};


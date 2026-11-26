// Runs before any noVNC module; never exports credentials, URLs or frame data.
(() => {
  'use strict';
  const labels = {bootstrap:'正在初始化画面客户端', modules:'正在加载 noVNC 模块', 'ui-start':'正在初始化界面', 'ui-ready':'画面客户端已就绪', 'ws-start':'正在建立 VNC 连接', password:'请输入画面密码', authenticated:'认证成功，正在等待首帧', 'first-frame':'已收到并绘制首帧', disconnect:'连接已断开', 'security-failure':'画面认证失败', 'module-failure':'noVNC 模块加载失败', 'module-timeout':'noVNC 模块加载超时', 'ui-failure':'noVNC 界面初始化失败', 'ui-timeout':'noVNC 界面初始化超时', 'connection-timeout':'VNC 握手超时', 'frame-timeout':'认证成功，但首帧超时', 'render-failure':'首帧绘制失败', 'script-error':'画面客户端脚本异常'};
  const states = {bootstrap:'connecting',modules:'connecting','ui-start':'connecting','ui-ready':'connecting','ws-start':'connecting',password:'password',authenticated:'waiting-frame','first-frame':'connected',disconnect:'interrupted','security-failure':'error','module-failure':'error','module-timeout':'error','ui-failure':'error','ui-timeout':'error','connection-timeout':'error','frame-timeout':'error','render-failure':'error','script-error':'error'};
  const trace=[];
  let last='', terminal=false;
  const session = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  function report(stage){
    if(!Object.hasOwn(labels,stage) || stage===last) return;
    if(terminal) return;
    if(stage==='ws-start') terminal=false;
    last=stage; trace.push({stage,at:Date.now()}); if(trace.length>40) trace.shift();
    if(window.parent!==window) window.parent.postMessage({type:'iphonie-vnc',state:states[stage],stage,detail:labels[stage],trace:trace.slice()},'*');
    // Send only a fixed stage identifier; no log text, URL, pixels or password.
    fetch('/viewer-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,stage}),keepalive:true}).catch(()=>{});
    if(states[stage]==='error'){
      terminal=true;
      document.documentElement.classList.remove('noVNC_loading');
      let panel=document.getElementById('iphonie-viewer-error');
      if(!panel){panel=document.createElement('div');panel.id='iphonie-viewer-error';panel.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#20242d;color:#fff;padding:24px;display:flex;flex-direction:column;justify-content:center;gap:16px;font:16px system-ui';document.body.append(panel);}
      panel.replaceChildren();const msg=document.createElement('p');msg.textContent=labels[stage]+'（'+stage+'）';const b=document.createElement('button');b.textContent='重新连接';b.onclick=()=>location.reload();panel.append(msg,b);
    }
  }
  window.addEventListener('error',e=>{if(e instanceof ErrorEvent && !['first-frame','disconnect'].includes(last))report('script-error');});
  window.addEventListener('unhandledrejection',()=>{if(!['first-frame','disconnect'].includes(last))report('script-error');});
  window.iphonieViewer={report,get stage(){return last;}};
  report('bootstrap');
})();

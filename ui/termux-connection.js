import {btn, esc} from './common.js';

export const TERMUX_VIEW = 'http://127.0.0.1:6089/vnc.html?autoconnect=1&resize=scale';
const origin = new URL(TERMUX_VIEW).origin;
const install = 'bash "$(find "$HOME" -type f -path \'*/termux/browser.sh\' -execdir test -f ./service.cjs \\; -print -quit)"';
const labels = {unknown:'未检测到本机服务', stopped:'服务未启动', starting:'正在启动', connecting:'正在连接',
  password:'请输入画面密码', connected:'已连接', interrupted:'连接中断', failed:'启动失败', environment:'运行环境异常'};
const reasons = {dependency:'Firefox 或运行库无法加载，请在 Termux 运行 iphonie-browser repair。',
  display:'虚拟屏幕未就绪。',port:'本机浏览器端口已被占用。',firefox:'Firefox 未能保持可见窗口。',
  bridge:'本机连接未收到 VNC 握手。',font:'未找到可读字体。',environmentError:'启动环境不完整，请重新安装。',
  screen:'正在建立虚拟屏幕。',window:'正在等待 Firefox 窗口。',handshake:'正在验证本机连接。',software:'正在用软件渲染重试。'};

export function connectTermux(ctx, content, note, onState=()=>{}) {
  const {win,doc}=ctx;
  let active=true, sequence=0, deadline, poll, frame, state, code, detail;
  let seen=false;
  try {seen=win.localStorage.getItem('stip-termux-installed')==='1';} catch {}
  let controls=false, commandId=0, recoveryUsed=false;
  const pending = new Map();
  let request, trace=[], healthSnapshot;
  const clear=()=>{win.clearTimeout(deadline); win.clearTimeout(poll);};
  const button=(id,label)=>btn(id,label,'browser-recent');
  const tools=()=>button('retry','重新连接')+button('guide','启动教程')+button('copy','复制启动命令')+button('export','导出诊断');
  function show(next, explanation='') {
    state=next;detail=explanation;onState(next,controls);
    note(labels[next]);
    if(next==='connected' || next==='password' || (next==='connecting' && frame)) return;
    frame=null;
    content.innerHTML='<section class="browser-page"><p>'+esc(explanation || labels[next])+'</p>'+tools()+'</section>';
  }
  const timeout=(ms,fn)=>{win.clearTimeout(deadline);deadline=win.setTimeout(fn,ms);};
  function viewer() {
    frame=doc.createElement('iframe');
    frame.title='本机 Firefox';frame.referrerPolicy='no-referrer';
    frame.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin');
    frame.allowFullscreen=true;
    frame.src=TERMUX_VIEW.replace('resize=scale', controls?'resize=remote':'resize=scale')+'&iphonie='+(controls?'next':'compat2');content.replaceChildren(frame);
    show('connecting');timeout(25000,()=>show('interrupted','画面连接超时，请重新连接。'));
  }
  function message(event) {
    if(!frame || event.origin!==origin || event.source!==frame.contentWindow) return;
    if (event.data?.type==='iphonie-browser-result') {
      pending.get(event.data.id)?.(event.data);
      return;
    }
    if(event.data?.type!=='iphonie-vnc') return;
    if(Array.isArray(event.data.trace)) trace=event.data.trace.slice(-40).filter(x=>typeof x?.stage==='string' && /^[a-z-]{1,40}$/.test(x.stage) && Number.isFinite(x.at)).map(x=>({stage:x.stage,at:x.at}));
    switch(event.data.state){
      case 'password': win.clearTimeout(deadline);show('password');break;
      case 'connected': win.clearTimeout(deadline);show('connected');break;
      case 'waiting-frame': win.clearTimeout(deadline);note('已连接，正在等待首帧…');break;
      case 'dark-frame': win.clearTimeout(deadline);note('已连接，画面仍为空或很暗。可点刷新重新连接。');break;
      case 'connecting': show('connecting');timeout(25000,()=>show('interrupted','等待画面超时，请重新连接。'));break;
      case 'error': case 'interrupted': clear();show('interrupted',typeof event.data.detail==='string'?event.data.detail.slice(0,100):'画面连接已断开，请重新连接。');break;
    }
  }
  async function connect(){
    const ticket=++sequence;
    request?.abort();clear();frame=null;trace=[];healthSnapshot=undefined;show('connecting','正在检查本机服务…');
    const end=Date.now()+110000;
    async function check(){
      try{
        const current = new AbortController();
        request=current;
        const cancel=win.setTimeout(()=>current.abort(),3500);
        let res,h;
        try{
          res=await win.fetch(origin+'/health',{cache:'no-store',signal:current.signal});
          h=await res.json();
        }finally{win.clearTimeout(cancel);}
        if(!active || ticket!==sequence) return;
        if(!res.ok || h.service!=='iphonie-firefox-v2') {show('environment','本机端口运行了其他程序或旧版本，请查看启动教程。');return;}
        healthSnapshot={state:h.state,code:h.code,build:h.build,healthCheck:h.healthCheck,vncSecurity:h.vncSecurity};seen=true;try{win.localStorage.setItem('stip-termux-installed','1');}catch{}
        code=Object.hasOwn(reasons,h.code)?h.code:undefined;
        if(h.state==='ready'){controls=h.controls===true;viewer();return;}
        if(h.state==='starting' && Date.now()<end){
          show('starting',reasons[code]);poll=win.setTimeout(check,1200);return;
        }
        show(h.state==='environment'?'environment':'failed',reasons[code] || '启动超时或服务已退出。');
      }catch{
        if(active && ticket===sequence) show(seen?'stopped':'unknown',seen?'请运行 iphonie-browser，再重新连接。':'未安装请查看启动教程。已安装请运行 iphonie-browser。');
      }
    }
    await check();
  }
  async function click(e){
    const action=e.target.closest('button')?.dataset.action;
    if(action==='retry'){recoveryUsed=false;connect();return;}
    if(action==='guide'){
      content.innerHTML='<section class="browser-page"><h2>启动教程</h2><p>未安装时，先更新小手机插件，在 Termux 粘贴安装命令。以后只需输入 iphonie-browser。服务会在后台运行，可继续使用同一终端启动酒馆。</p><code>'+esc(install)+'</code>'+button('install-copy','复制安装命令')+tools()+'</section>';return;
    }
    if(action==='copy'||action==='install-copy'){
      const text=action==='copy'?'iphonie-browser':install;
      try{await win.navigator.clipboard.writeText(text);ctx.notify('已复制');}catch{note(text);}
    }
    if(action==='export'){
      let backend;
      try{const r=await win.fetch(origin+'/health',{cache:'no-store',signal:AbortSignal.timeout(2000)});const h=await r.json();if(h.service==='iphonie-firefox-v2')backend={state:h.state,code:h.code,build:h.build,healthCheck:h.healthCheck,vncSecurity:h.vncSecurity,viewerEvents:h.viewerEvents};}catch{}
      const url=URL.createObjectURL(new Blob([JSON.stringify({service:'iphonie-firefox-v2',state,code,detail,trace,backend:backend||healthSnapshot},null,2)],{type:'application/json'}));
      const a=doc.createElement('a');a.href=url;a.download='iphonie-connection.json';a.click();
      win.setTimeout(()=>URL.revokeObjectURL(url),1500);
    }
  }
  function resume(){
    if(doc.visibilityState==='visible' && !recoveryUsed && ['interrupted','stopped'].includes(state)){
      recoveryUsed=true;
      connect();
    }
  }
  win.addEventListener('message',message);content.addEventListener('click',click);doc.addEventListener('visibilitychange',resume);
  connect();
  const dispose=()=>{active=false;clear();request?.abort();win.removeEventListener('message',message);content.removeEventListener('click',click);doc.removeEventListener('visibilitychange',resume); for(const done of pending.values()) done({});};
  dispose.command=(action,value)=>new Promise(resolve=>{
    if(!controls || state!=='connected' || !frame?.contentWindow){resolve({});return;}
    const id=++commandId;
    const timer=win.setTimeout(()=>{pending.delete(id);resolve({});},1800);
    pending.set(id,result=>{win.clearTimeout(timer);pending.delete(id);resolve(result);});
    frame.contentWindow.postMessage({type:'iphonie-browser-control',id,action,value},origin);
  });
  return dispose;
}

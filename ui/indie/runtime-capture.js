// Runs before game modules so failed imports and startup exceptions are visible too.
(() => {
 const q=new URLSearchParams(location.search),session=q.get('session'),source=document.currentScript?.dataset.game||'大游戏';
 const report=(kind,detail)=>{if(!session||parent===window)return;parent.postMessage({type:'st-iphonie:game:diagnostic',session,source,detail:{kind,...detail}},location.origin);};
 window.addEventListener('error',e=>{const resource=e.target!==window&&(e.target?.src||e.target?.href);report(resource?'资源加载':'运行异常',resource?{url:resource}:{message:e.message,stack:e.error?.stack,file:e.filename,line:e.lineno,column:e.colno});},true);
 window.addEventListener('unhandledrejection',e=>report('异步异常',{message:e.reason?.message||String(e.reason),stack:e.reason?.stack}));
 window.stGameReport=(detail,level='error')=>{if(session&&parent!==window)parent.postMessage({type:'st-iphonie:game:diagnostic',session,source,detail,level},location.origin);};
})();

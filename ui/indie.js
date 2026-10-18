import {createView,heading,esc} from './common.js';

const GAME = new URL('./indie/tide/index.html', import.meta.url);
const COVER = new URL('./indie/tide/assets/cover.png', import.meta.url);
export function indieApp(ctx) {
  const v=createView(ctx,'indie');let session=null;
  function close(){if(!session)return;const {dialog,frame,host,receive}=session;session=null;host.defaultView.removeEventListener('message',receive);try{frame.contentWindow?.stTide?.dispose();}catch{}if(host.fullscreenElement===dialog)host.exitFullscreen?.().catch(()=>{});dialog.close?.();dialog.remove();}
  function launch(){
    if(session)return;
    let host=ctx.doc;try{if(ctx.win.top.document?.body)host=ctx.win.top.document;}catch{}
    const dialog=host.createElement('dialog'),frame=host.createElement('iframe'),url=new URL(GAME),token=ctx.win.crypto.randomUUID();
    url.searchParams.set('scope',ctx.api.getState().scope||'local');url.searchParams.set('session',token);
    dialog.setAttribute('aria-label','潮汐来信');dialog.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;padding:0;margin:0;background:#133f47;overflow:hidden;';
    frame.title='潮汐来信';frame.allow='fullscreen; autoplay';frame.allowFullscreen=true;frame.style.cssText='display:block;width:100%;height:100%;border:0;background:#133f47';frame.src=url.href;
    const receive=e=>{if(e.source!==frame.contentWindow||e.origin!==url.origin||e.data?.session!==token)return;if(e.data.type==='st-iphonie:tide:close')close();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();frame.contentWindow?.postMessage({type:'st-iphonie:tide:pause',session:token},url.origin);});
    host.defaultView.addEventListener('message',receive);session={dialog,frame,host,receive};dialog.append(frame);host.body.append(dialog);
    try{dialog.showModal();}catch{dialog.setAttribute('open','');}
    frame.focus();
  }
  v.draw(heading('大游戏','','Independent worlds')+`<div class="indie-library"><p class="indie-overline">第一封信，寄往海上。</p><button type="button" class="indie-cover" data-indie-play aria-label="打开潮汐来信"><img src="${esc(COVER.href)}" alt="海上的小船与守望小岛的灯塔"><span class="indie-cover-shade"></span><span class="indie-cover-type"><small>LETTERS ON THE TIDE</small><strong>潮汐来信</strong><span>序章 · 灯塔下的第一封信</span></span><span class="indie-cover-play">启程 ↗</span></button><div class="indie-description"><span>探索冒险</span><span>单人</span><span>本机存档</span></div><p class="indie-copy">驾一艘小船，循着潮水寻找消失的路。<br>把一封迟到的信，交到仍在等它的人手里。</p><div class="indie-edition"><span>01</span><div><strong>一个可以慢慢停留的世界</strong><p>开船、登岛、等潮。海边的小故事，藏在航海手册里。</p></div></div></div>`);
  v.on('click','[data-indie-play]',launch);
  v.leave=close;const dispose=v.dispose;v.dispose=()=>{close();dispose();};
  return v;
}

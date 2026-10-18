import {createView,heading,esc} from './common.js';
const GAMES={tide:{name:'潮汐来信',close:'stTide',color:'#133f47'},whalebay:{name:'鲸湾小镇',close:'stWhaleBay',color:'#283f48'}};
const asset=(id,path)=>new URL(`./indie/${id}/${path}`,import.meta.url).href;
export function indieApp(ctx) {
 const v=createView(ctx,'indie');let session=null;
 const report=(name,detail,level='info')=>ctx.api.reportDiagnostic?.('大游戏 · '+name,detail,level);
 function close(){if(!session)return;const {dialog,frame,host,receive,game}=session;session=null;host.defaultView.removeEventListener('message',receive);try{frame.contentWindow?.[game.close]?.dispose();}catch(error){report(game.name,error,'error');}if(host.fullscreenElement===dialog)host.exitFullscreen?.().catch(()=>{});dialog.close?.();dialog.remove();report(game.name,{event:'关闭游戏'});}
 function launch(el){
  const id=el?.dataset?.indiePlay||'tide',game=GAMES[id];if(!game||session)return;
  let host=ctx.doc;try{if(ctx.win.top.document?.body)host=ctx.win.top.document;}catch{}
  const dialog=host.createElement('dialog'),frame=host.createElement('iframe'),url=new URL(asset(id,'index.html')),token=ctx.win.crypto.randomUUID();
  url.searchParams.set('scope',ctx.api.getState().scope||'local');url.searchParams.set('session',token);
  dialog.setAttribute('aria-label',game.name);dialog.style.cssText=`position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;padding:0;margin:0;background:${game.color};overflow:hidden;`;
  frame.title=game.name;frame.allow='fullscreen; autoplay; gamepad';frame.allowFullscreen=true;frame.style.cssText=`display:block;width:100%;height:100%;border:0;background:${game.color}`;
  const receive=e=>{if(e.source!==frame.contentWindow||e.origin!==url.origin||e.data?.session!==token)return;
   if(e.data.type===`st-iphonie:${id}:close`)close();
   if(e.data.type==='st-iphonie:game:diagnostic')report(game.name,e.data.detail,['warn','info'].includes(e.data.level)?e.data.level:'error');
  };
  dialog.addEventListener('cancel',event=>{event.preventDefault();frame.contentWindow?.postMessage({type:`st-iphonie:${id}:pause`,session:token},url.origin);});
  frame.addEventListener('error',()=>report(game.name,{event:'游戏页面加载失败'},'error'));
  host.defaultView.addEventListener('message',receive);session={dialog,frame,host,receive,game};frame.src=url.href;dialog.append(frame);host.body.append(dialog);
  try{dialog.showModal();}catch{dialog.setAttribute('open','');}frame.focus();report(game.name,{event:'打开游戏'});
 }
 v.draw(heading('大游戏','','Independent worlds')+`<div class="indie-library"><p class="indie-overline">留一段时间，走进另一个世界。</p>
  <button type="button" class="indie-cover indie-bay" data-indie-play="whalebay" aria-label="打开鲸湾小镇"><img src="${esc(asset('whalebay','cover.webp'))}" alt="像素海湾里的农园、屋舍与码头"><span class="indie-cover-shade"></span><span class="indie-cover-type"><small>W H A L E &nbsp; B A Y</small><strong>鲸湾小镇</strong><span>把日子种进海风里</span></span><span class="indie-cover-play">住进鲸湾 ↗</span></button><div class="indie-description"><span>像素经营</span><span>四季生活</span><span>本机存档</span></div><p class="indie-copy">种下一点明天，等一条鱼上钩。<br>收获、制作、交货，让海边的小农园慢慢长大。</p><div class="indie-edition"><span>02</span><div><strong>一段可以继续的生活</strong><p>每日委托与海岸拾取会刷新，作物与配方随农园等级解锁。</p></div></div>
  <button type="button" class="indie-cover" data-indie-play="tide" aria-label="打开潮汐来信"><img src="${esc(asset('tide','assets/cover-code.webp'))}" alt="海上的小船与守望小岛的灯塔" loading="lazy"><span class="indie-cover-shade"></span><span class="indie-cover-type"><small>LETTERS ON THE TIDE</small><strong>潮汐来信</strong><span>序章 · 灯塔下的第一封信</span></span><span class="indie-cover-play">启程 ↗</span></button><div class="indie-description"><span>探索冒险</span><span>单人</span><span>本机存档</span></div><p class="indie-copy">驾一艘小船，循着潮水寻找消失的路。<br>把一封迟到的信，交到仍在等它的人手里。</p><div class="indie-edition"><span>01</span><div><strong>一个可以慢慢停留的世界</strong><p>开船、登岛、等潮。海边的小故事，藏在航海手册里。</p></div></div></div>`);
 v.on('click','[data-indie-play]',launch);v.leave=close;const dispose=v.dispose;v.dispose=()=>{close();dispose();};return v;
}

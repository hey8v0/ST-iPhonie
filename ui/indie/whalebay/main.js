import {restoreBay,level,season,weather,timeText,CROPS,ITEMS,RECIPES,STATIONS,walkable,route,nearby,tick,farm,gather,buy,sell,make,dailyOrders,deliver,expand,fish,spendEnergy,drink,sleep,talk} from './model.js';
import {createBayPainter} from './scene3d.js';
import {createGamepadInput} from '../gamepad.js';
import {tideAudio} from '../tide/audio.js';
const $=s=>document.querySelector(s),canvas=$('#world'),overlay=$('#overlay'),paper=$('#paper');
const q=new URLSearchParams(location.search),session=q.get('session')||'',key='st-iphonie:whalebay:v1:'+encodeURIComponent((q.get('scope')||'local').slice(0,200));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved=null,loadError=null;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch(error){loadError=error;window.stGameReport?.({kind:'存档读取',message:error.message},'warn');}
let s=restoreBay(saved),mode='title',disposed=false,raf=0,previous=0,lastPaint=0,lastSave=0,lastHud=0,path=[],destination=null,seed='turnip',toastTimer=0,portrait=false,saveFailed=false,fishState=null;
let input=matchMedia('(pointer:coarse)').matches?'touch':'keyboard',lastNonPad=input;
const painter=createBayPainter(canvas),pad=createGamepadInput(navigator),audio=tideAudio(window),keys=new Set(),stick={id:null,x:0,y:0},abort=new AbortController();
const listen=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal:abort.signal});
function notice(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300);}
function save(){if(mode==='title'||disposed)return;try{localStorage.setItem(key,JSON.stringify(s));lastSave=performance.now();saveFailed=false;}catch(error){if(!saveFailed){notice('进度未能保存，请检查浏览器存储空间。');window.stGameReport?.({kind:'存档保存',message:error.message});}saveFailed=true;}}
function resetInput(){keys.clear();path=[];destination=null;stick.x=stick.y=0;stick.id=null;$('#stick i').style.transform='';}
function useInput(next){input=next;if(next!=='gamepad')lastNonPad=next;document.body.dataset.input=next;for(const el of document.querySelectorAll('kbd[data-key]'))el.textContent=next==='gamepad'?el.dataset.pad:el.dataset.key;}
useInput(input);
function rotate(){const needed=mode==='play'&&input==='touch'&&innerHeight>innerWidth&&!portrait;$('#rotate').hidden=!needed;if(needed)resetInput();return needed;}
function hud(){const near=nearby(s);$('#day').textContent=`${season(s)} · 第 ${(s.day-1)%14+1} 日`;
 $('#clock').textContent=`${weather(s)} ${timeText(s)}`;$('#coins').textContent=`◈ ${s.coins.toLocaleString()}`;$('#level').textContent=`农园 Lv.${level(s)}`;$('#energy').style.width=s.energy+'%';$('#energy-label').textContent=`体力 ${Math.floor(s.energy)} / 100`;
 $('#interact span').textContent=near?.verb||'互动';$('#interact').disabled=!near;$('#interact').setAttribute('aria-label',near?`${near.verb} · ${near.name}`:'附近暂无互动');
 $('#goal').textContent=s.minute>=1320?'夜深了 · 回海风阁楼休息':s.energy<5?'体力不多了 · 喝茶或回小屋休息':s.stats.harvest===0?'先种一颗种子，浇水后等待两个夜晚':`第 ${s.day} 天 · 今日委托 ${s.orders.length} / 3 · ${level(s)<4?'再积累 '+(100-s.xp%100)+' 经验升级农园':'鲸蓝花已解锁'}`;
}
function showHud(on){for(const sel of ['#hud','#status','#goal','#stick','#interact','.control-hint'])$(sel).hidden=!on;}
function frame(title,body,actions=''){return `<button class="close" data-action="resume" aria-label="关闭">×</button><span class="overline">W H A L E &nbsp; B A Y</span><h2>${esc(title)}</h2>${body}${actions?'<div class="paper-actions">'+actions+'</div>':''}`;}
function show(title,body,actions='',next='menu'){mode=next;resetInput();paper.innerHTML=frame(title,body,actions);overlay.hidden=false;rotate();paper.scrollTop=0;paper.querySelector('button:not(.close)')?.focus({preventScroll:true});}
function resume(){audio.start(s.sound);mode='play';overlay.hidden=true;fishState=null;resetInput();hud();rotate();canvas.focus({preventScroll:true});}
function commit(fn,refresh){try{const oldLevel=level(s),text=fn();audio.sound('paper');notice(text||'完成了');if(level(s)>oldLevel)notice(`农园升到 Lv.${level(s)} · 新田地、种子和配方已解锁`);save();hud();refresh?.();}catch(error){notice(error.message);}}
function seedButtons(){return `<div class="seed-strip">${Object.entries(CROPS).filter(([,c])=>level(s)>=c.level).map(([id,c])=>`<button data-seed="${id}" aria-pressed="${seed===id}">${c.name} · ${s.seeds[id]||0}</button>`).join('')}</div>`;}
function fieldMenu(p){const f=s.fields[p.plot];if(f){commit(()=>farm(s,p.plot,seed));return;}show('种下一点明天',`<p class="sub">选择种子 · 雨天不用浇水</p>${seedButtons()}`,`<button class="gold" data-plant="${p.plot}">种在这里</button><button data-action="shop-location">去杂货铺</button>`,'plant');}
function shop(){show('鲸尾杂货',`<p class="sub">◈ ${s.coins} 代币 · 农园 Lv.${level(s)}</p><div class="rows">${Object.entries(CROPS).map(([id,c])=>`<div class="row"><div><strong>${c.name}</strong><small>${c.days} 个浇水夜晚 · 出货 ${c.value} ◈${level(s)<c.level?' · Lv.'+c.level+' 解锁':''}</small></div><button data-buy="${id}" ${level(s)<c.level||s.coins<c.seed?'disabled':''}>${c.seed} ◈ / 颗</button><button data-buy-five="${id}" ${level(s)<c.level||s.coins<c.seed*5?'disabled':''}>5 颗</button></div>`).join('')}</div>`, '<button data-action="resume">回小镇</button>');}
function workshop(){show('岸边工坊',`<p class="sub">把今天找到的，做成明天需要的。</p><div class="rows">${Object.entries(RECIPES).map(([id,r])=>`<div class="row"><div><strong>${r.name}</strong><small>${Object.entries(r.needs).map(([k,n])=>`${ITEMS[k].name} ${s.inventory[k]||0}/${n}`).join(' · ')}${level(s)<r.level?' · Lv.'+r.level+' 解锁':''}</small></div><button data-make="${id}" ${level(s)<r.level||Object.entries(r.needs).some(([k,n])=>(s.inventory[k]||0)<n)?'disabled':''}>制作</button></div>`).join('')}<div class="row"><div><strong>开垦农园 ${s.expansion}/4</strong><small>增加 4 块田 · 漂流木 ${s.inventory.wood||0}/5 · ${100+s.expansion*150} 代币</small></div><button data-action="expand" ${s.expansion>=4?'disabled':''}>开垦</button></div></div>`);}
function orders(){show('小镇委托',`<p class="sub">每天三封小小的心愿 · 明早更新</p><div class="rows">${dailyOrders(s).map(o=>`<div class="row"><div><strong>${o.name}</strong><small>${ITEMS[o.item].name} ${s.inventory[o.item]||0}/${o.count} · 酬谢 ${o.pay} ◈ · 25 经验</small></div><button data-deliver="${o.id}" ${s.orders.includes(o.id)||(s.inventory[o.item]||0)<o.count?'disabled':''}>${s.orders.includes(o.id)?'已交付':'交货'}</button></div>`).join('')}</div>`);}
function inventory(selling=false){const entries=Object.entries(s.inventory).filter(([,n])=>n>0);show(selling?'出货箱':'旅行背包',`<p class="sub">${selling?'交给明天出海的船队 · 立即结算':'◈ '+s.coins+' 代币 · 农园 Lv.'+level(s)}</p><div class="rows">${entries.map(([id,n])=>`<div class="row"><div><strong>${ITEMS[id].name}</strong><small>${ITEMS[id].value} ◈ / 份</small></div><span class="count">${n}</span>${selling?`<button data-sell="${id}">出货 1 份</button><button data-sell-all="${id}">全部</button>`:id==='tea'?'<button data-action="drink">喝茶 +25</button>':''}</div>`).join('')||'<p class="sub">海岸和农园里，还有很多东西等你发现。</p>'}</div>${!selling?seedButtons():''}`,selling?'<button data-action="resume">回小镇</button>':'<button data-action="collection">小镇图鉴</button><button data-action="guide">生活手册</button>');}
function collection(){show('鲸湾图鉴',`<p class="sub">已经发现 ${Object.keys(ITEMS).filter(id=>s.collection[id]>0).length} / ${Object.keys(ITEMS).length} 种 · 每一份日子都有痕迹</p><div class="collection">${Object.entries(ITEMS).map(([id,item])=>`<div class="collect-cell ${s.collection[id]?'':'unknown'}"><b>${s.collection[id]?item.name:'？'}</b><small>${s.collection[id]?'累计 '+s.collection[id]+' 份':'尚未发现'}</small></div>`).join('')}</div>`);}
function guide(){show('给新邻居的手册','<div class="dialogue">在田地边播种、浇水，回小屋睡觉后作物就会生长。雨天会替你浇水。<br>木栈桥可以钓鱼，海岸上的漂流木、香草和贝壳每天刷新。<br>出货赚取代币，委托和收获提升农园等级；在工坊制作、开垦更多田地。<br>鲸湾每 14 天换一个季节，生活没有终点，也没有必须赶上的进度。</div><p class="sub">键盘 WASD / 方向键移动，E 互动，B 背包。鼠标可点击目的地；触屏使用摇杆。标准映射手柄：左摇杆移动，A 互动，Y 背包，菜单暂停。</p>');}
function home(){show('海风阁楼',`<p class="sub">明早，还是熟悉的海风。</p><div class="sleep"><div><small>住进鲸湾的日子</small><b>${s.day}</b></div><div><small>已经完成的委托</small><b>${s.stats.orders}</b></div></div>`,`<button class="gold" data-action="sleep">睡到明天</button><button data-action="resume">再逛一会儿</button>`);}
function newDay(){sleep(s);save();show(`第 ${s.day} 天 · ${season(s)}日`, `<p class="dialogue">${weather(s)==='雨'?'屋檐响起雨声。今天，田地交给天空。':weather(s)==='薄雾'?'薄雾慢慢掠过鲸湾。码头上，又有新的心愿。':'海风吹开了窗帘。田地和海岸，都有新的期待。'}</p><p class="sub">体力已恢复 · 海岸拾取与小镇委托已更新</p>`, '<button class="gold" data-action="resume">开始新的一天 →</button>');hud();}
function beginFishing(){try{spendEnergy(s,6,12);save();fishState={started:performance.now(),hits:0,tries:0,quality:0};show('等海给你一个回应', '<p class="sub">浮标进入浅绿色水域时收线 · 三次机会</p><div class="fish-track"><i class="fish-zone"></i><i class="fish-cursor"></i></div><div class="fish-meta"><span data-fish-progress>0 / 2 次命中</span><span data-fish-tries>3 次机会</span></div>','<button class="gold" data-action="reel">收线 <kbd data-key="Space" data-pad="A"></kbd></button><button data-action="resume">收竿</button>','fish');useInput(input);}catch(error){notice(error.message);}}
function fishingPosition(now){return (Math.sin((now-fishState.started)*.0024)+1)/2;}
function reel(){if(!fishState)return;const pos=fishingPosition(performance.now());fishState.tries++;if(pos>=.57&&pos<=.78){fishState.hits++;fishState.quality+=1-Math.abs(pos-.675)*4;audio.sound('paper');}else audio.sound('step');
 if(fishState.hits>=2){const quality=fishState.quality/2;resume();commit(()=>fish(s,quality));return;}if(fishState.tries>=3){resume();notice('鱼儿溜走了。海还在，下一竿再见。');return;}
 $('[data-fish-progress]').textContent=`${fishState.hits} / 2 次命中`;$('[data-fish-tries]').textContent=`${3-fishState.tries} 次机会`;
}
function interact(p=nearby(s)){if(!p||mode!=='play')return;if(p.plot!==undefined){fieldMenu(p);return;}if(p.item){commit(()=>gather(s,p.id));return;}const actions={home,shop,craft:workshop,orders,sell:()=>inventory(true),fish:beginFishing};if(actions[p.id])return actions[p.id]();if(['mira','levi'].includes(p.id)){const text=talk(s,p.id);save();show(p.name,`<p class="dialogue">${esc(text)}</p><p class="sub">邻里熟悉度 ${s.friendship[p.id]||0}</p>`,'<button class="gold" data-action="resume">下次再见</button>');}}
function pause(){if(mode==='title')return;audio.pause();save();show('留一会儿海风',`<p class="sub">第 ${s.day} 天 · ${season(s)}日 · ${timeText(s)} · ${saveFailed?'进度尚未保存':'进度已保存在本机'}</p>`, '<button class="gold" data-action="resume">继续生活</button><button data-action="guide">生活手册</button><button data-action="sound">海岸声音</button><button data-action="fullscreen">全屏</button><button data-action="export">导出存档</button><button data-action="exit">返回大游戏</button>');}
function start(){mode='play';$('#title').hidden=true;showHud(true);resume();audio.start(s.sound);save();if(loadError)notice('旧存档读取失败，日志已记录。本次从新的生活开始。');else if(!saved)notice('欢迎来到鲸湾。先到左侧田地种下第一颗种子吧。');}
function exit(){save();dispose();if(parent!==window)parent.postMessage({type:'st-iphonie:whalebay:close',session},location.origin);}
const actions={start,interact,bag:()=>inventory(),pause,resume,sleep:newDay,collection,guide,expand:()=>commit(()=>expand(s),workshop),drink:()=>commit(()=>drink(s),()=>inventory()),reel,exit,fullscreen:()=>{const target=parent!==window?window.frameElement?.parentElement:document.documentElement;try{const doc=target?.ownerDocument||document;(doc.fullscreenElement?doc.exitFullscreen():target?.requestFullscreen?.())?.catch(error=>{notice('浏览器暂不支持全屏');window.stGameReport?.({kind:'全屏',message:error.message},'warn');});}catch(error){notice('浏览器暂不支持全屏');}},sound:()=>{s.sound=!s.sound;audio.toggle(s.sound);save();notice(s.sound?'海岸声音已打开':'海岸声音已关闭');},portrait:()=>{portrait=true;rotate();},'shop-location':()=>{resume();path=route(s.player,STATIONS.find(p=>p.id==='shop'));},export:()=>{const blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`鲸湾小镇-第${s.day}天.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
listen(document,'click',event=>{const el=event.target.closest('button');if(!el||el.disabled)return;if(el.dataset.action){actions[el.dataset.action]?.();return;}
 if(el.dataset.seed){seed=el.dataset.seed;for(const b of document.querySelectorAll('[data-seed]'))b.setAttribute('aria-pressed',String(b.dataset.seed===seed));return;}
 if(el.dataset.plant!==undefined){const id=Number(el.dataset.plant);try{const text=farm(s,id,seed);save();resume();notice(text);}catch(error){notice(error.message);}return;}
 if(el.dataset.buy)commit(()=>buy(s,el.dataset.buy),shop);if(el.dataset.buyFive)commit(()=>buy(s,el.dataset.buyFive,5),shop);
 if(el.dataset.make)commit(()=>make(s,el.dataset.make),workshop);if(el.dataset.deliver!==undefined)commit(()=>deliver(s,el.dataset.deliver),orders);
 if(el.dataset.sell)commit(()=>sell(s,el.dataset.sell),()=>inventory(true));if(el.dataset.sellAll)commit(()=>sell(s,el.dataset.sellAll,s.inventory[el.dataset.sellAll]),()=>inventory(true));
});
listen(canvas,'pointerdown',e=>{useInput(e.pointerType==='touch'?'touch':'keyboard');if(mode!=='play'||rotate())return;const end=painter.world(e.clientX,e.clientY);destination={x:Math.round(end.x),y:Math.round(end.y)};path=route(s.player,destination);canvas.focus({preventScroll:true});});
listen($('#stick'),'pointerdown',e=>{if(stick.id!==null)return;useInput('touch');stick.id=e.pointerId;$('#stick').setPointerCapture(e.pointerId);path=[];destination=null;});
listen($('#stick'),'pointermove',e=>{if(stick.id!==e.pointerId)return;const r=$('#stick').getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width*.35),y=(e.clientY-r.top-r.height/2)/(r.height*.35),m=Math.max(1,Math.hypot(x,y));stick.x=x/m;stick.y=y/m;$('#stick i').style.transform=`translate(${stick.x*26}px,${stick.y*26}px)`;});
for(const type of ['pointerup','pointercancel','lostpointercapture'])listen($('#stick'),type,e=>{if(stick.id!==e.pointerId)return;stick.id=null;stick.x=stick.y=0;$('#stick i').style.transform='';});
listen(document,'keydown',e=>{useInput('keyboard');if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.repeat)return;
 if(mode==='title'){if(e.key==='Enter')start();return;}if(mode==='fish'&&(e.key===' '||e.key.toLowerCase()==='e')){reel();return;}
 if(e.key==='Escape'){mode==='play'?pause():resume();return;}if(mode!=='play')return;
 if(e.key.toLowerCase()==='e'){interact();return;}if(e.key.toLowerCase()==='b'){inventory();return;}keys.add(e.key.toLowerCase());path=[];destination=null;
});
listen(document,'keyup',e=>keys.delete(e.key.toLowerCase()));
listen(window,'pointerdown',e=>{if(e.pointerType==='touch')useInput('touch');else useInput('keyboard');},{capture:true});
listen(window,'blur',()=>{resetInput();if(mode==='play'||mode==='fish')pause();});
listen(document,'visibilitychange',()=>{if(document.hidden){resetInput();if(mode==='play'||mode==='fish')pause();}});
listen(window,'resize',rotate);
listen(canvas,'webglcontextlost',event=>{event.preventDefault();window.stGameReport?.({kind:'3D 图形上下文丢失'});if(mode!=='title')pause();notice('图形渲染暂停了，恢复后可继续生活。');});
listen(window,'message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.session===session&&e.data?.type==='st-iphonie:whalebay:pause')pause();});
listen(window,'pagehide',event=>{save();if(!event.persisted)dispose();else audio.pause();});
function move(x,y,dt){const norm=Math.max(1,Math.hypot(x,y)),speed=3.8*dt,nx=s.player.x+x/norm*speed,ny=s.player.y+y/norm*speed;if(walkable(nx,s.player.y))s.player.x=nx;if(walkable(s.player.x,ny))s.player.y=ny;}
function loop(now){if(disposed)return;raf=requestAnimationFrame(loop);if(document.hidden){previous=now;return;}const dt=Math.min(.05,(now-(previous||now))/1000);previous=now;
 const p=pad.read(now);if(p.pressed.size||Math.abs(p.x)>.15||Math.abs(p.y)>.15)useInput('gamepad');if(p.lost){useInput(lastNonPad);if(mode==='play'||mode==='fish')pause();}
 if(p.pressed.has(9)){mode==='play'?pause():mode==='title'?start():resume();}
 if(mode==='title'&&p.pressed.has(0))start();else if(mode==='fish'&&p.pressed.has(0))reel();else if(mode!=='play'&&mode!=='title'){
  if(p.pressed.has(1))resume();else if(p.pressed.has(0))document.activeElement?.click();
  if(p.direction){const buttons=[...paper.querySelectorAll('button:not([disabled])')],i=buttons.indexOf(document.activeElement),step=['down','right'].includes(p.direction)?1:-1;buttons[(i+step+buttons.length)%buttons.length]?.focus({preventScroll:false});}
 }
 let moving=false;if(mode==='play'&&!document.hidden&&!rotate()){
  let x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))+stick.x+(input==='gamepad'?p.x:0),y=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'))+stick.y+(input==='gamepad'?p.y:0);
  if(Math.hypot(x,y)>.1){const input=painter.inputVector(x,y);x=input.x;y=input.y;path=[];destination=null;}else if(path.length){const point=path[0],dx=point.x-s.player.x,dy=point.y-s.player.y,d=Math.hypot(dx,dy);if(d<.15){path.shift();}else{x=dx/d;y=dy/d;}}
  if(Math.hypot(x,y)>.1){move(x,y,dt);moving=true;}else if(!path.length&&destination){destination=null;interact();}
  if(p.pressed.has(0))interact();if(p.pressed.has(3))inventory();tick(s,dt);
  if(now-lastSave>12000)save();if(now-lastHud>250){hud();lastHud=now;}
 }
 if(mode==='fish'&&fishState){const cursor=$('.fish-cursor');if(cursor)cursor.style.left=fishingPosition(now)*100+'%';}
 if(['title','play','fish'].includes(mode)&&now-lastPaint>1000/30){painter.render(s,now/1000,{title:mode==='title',target:destination,near:mode==='play'?nearby(s):null,moving});lastPaint=now;}
}
function dispose(){if(disposed)return;save();disposed=true;cancelAnimationFrame(raf);clearTimeout(toastTimer);abort.abort();audio.dispose();painter.dispose?.();resetInput();}
window.stWhaleBay={dispose,project:(x,y)=>painter.project(x,y),renderStats:()=>painter.stats?.(),snapshot:()=>structuredClone(s),get mode(){return mode;}};
if(saved)$('[data-action=start]').innerHTML='继续生活 <span>→</span>';hud();if(painter.failed)show('暂时无法打开立体鲸湾','<p class="dialogue">当前浏览器没有成功启动 3D 渲染。可以更新浏览器或检查图形加速设置，详细错误已写入日志。</p>','<button data-action="exit">返回大游戏</button>');raf=requestAnimationFrame(loop);

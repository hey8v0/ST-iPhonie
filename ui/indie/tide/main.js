import {freshTide,restoreTide,stepTide,nearby,interact,waitFor,turnLens,objective,tideName,tideAt,CLUES} from './model.js';
import {createGamepadInput} from '../gamepad.js';
import {planRoute,destinationAt} from './navigation.js';
import {createPainter} from './paint.js';
import {tideAudio} from './audio.js';

const win=window,doc=document,$=s=>doc.querySelector(s),canvas=$('#sea'),overlay=$('#overlay'),content=$('#overlay-content');
const query=new URLSearchParams(location.search),session=query.get('session')||'',key='st-iphonie:tide:v1:'+encodeURIComponent((query.get('scope')||'local').slice(0,200));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved=null;try{saved=JSON.parse(win.localStorage.getItem(key)||'null');}catch(error){window.stGameReport?.({kind:'存档读取',message:error.message},'warn');}
let fullscreenTarget=null;
let inputKind=win.matchMedia('(pointer:coarse)').matches?'touch':'keyboard',lastNonPad=inputKind,lastPadX=0,lastPadY=0,lastMousePoint=null;
let s=restoreTide(saved),mode='title',disposed=false,raf=0,previous=0,lastDraw=0,lastSave=0,lastHud=0,steps=0,portrait=false,target=null,waypoints=[],targetId=null,blocked=0,dialogue=null,dialogueIndex=0,bookReturn='play',lastPage='letter',noticeTimer=0,saveFailed=false;
const gamepad=createGamepadInput(win.navigator);
const painter=createPainter(canvas),audio=tideAudio(win),keys=new Set(),stick={x:0,y:0,id:null},abort=new AbortController(),timers=new Set();
const listen=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:abort.signal});
const later=(fn,ms)=>{const id=win.setTimeout(()=>{timers.delete(id);if(!disposed)fn();},ms);timers.add(id);return id;};
function useInput(kind){
 if(inputKind===kind&&doc.body.dataset.input===kind)return;
 inputKind=kind;if(kind!=='gamepad')lastNonPad=kind;doc.body.dataset.input=kind;
 const pad=kind==='gamepad',touch=kind==='touch';$('#interact small').textContent=pad?'A':'E';
 $('.keyboard-hint').textContent=pad?'左摇杆 / 十字键 · 移动':'WASD / 方向键 · 移动　E · 交互';
 canvas.setAttribute('aria-label',pad?'左摇杆或十字键移动，A 互动，X 海图，Y 手册，菜单键暂停':'用方向键或 WASD 移动，E 交互，J 打开手册，M 查看海图，Escape 暂停');
 for(const button of doc.querySelectorAll('[data-control-label]')){const key=pad?button.dataset.gamepad:button.dataset.keyboard,label=button.dataset.controlLabel;button.querySelector('.control-key').textContent=key;button.title=touch?label:label+' · '+(key==='≡'?'菜单键':key);button.setAttribute('aria-label',button.title);}
}
useInput(inputKind);
function resetInput(){keys.clear();stick.x=stick.y=0;stick.id=null;$('#joystick i').style.transform='';target=null;waypoints=[];targetId=null;blocked=0;}
function notice(text){if(!text)return;$('#notice').textContent=text;$('#notice').classList.add('show');win.clearTimeout(noticeTimer);noticeTimer=win.setTimeout(()=>$('#notice').classList.remove('show'),3800);}
function save(){if(mode==='title'&&!saved)return;try{win.localStorage.setItem(key,JSON.stringify({...s,savedAt:Date.now()}));saved=true;saveFailed=false;}catch(error){if(!saveFailed){saveFailed=true;window.stGameReport?.({kind:'存档保存',message:error.message});notice('这次的进度暂时无法保存，请检查浏览器存储空间。');}}lastSave=performance.now();}
function rotation(){const show=mode!=='title'&&mode==='play'&&win.matchMedia('(pointer:coarse)').matches&&win.innerHeight>win.innerWidth&&!portrait;$('#rotate').hidden=!show;if(show)resetInput();return show;}
function updateHud(){const point=nearby(s),button=$('#interact');$('#objective').textContent=objective(s);$('#tide-name').textContent=tideName(s);$('#tide-level').style.width=(tideAt(s.clock)*100)+'%';button.disabled=!point;button.querySelector('span').textContent=point?.verb||'探索';button.setAttribute('aria-label',point?point.verb+' · '+point.label:'附近暂无可交互物件');button.title=point?.label||'';button.querySelector('small').textContent=inputKind==='gamepad'?'A':'E';}
function showHud(on){$('.hud').hidden=$('.tide-dial').hidden=$('.keyboard-hint').hidden=$('#interact').hidden=!on;$('#joystick').style.visibility=on?'':'hidden';}
function show(html,nextMode){resetInput();mode=nextMode;content.innerHTML=html;overlay.hidden=false;rotation();later(()=>content.querySelector('button')?.focus({preventScroll:true}),30);}
function resume(){content.innerHTML='';overlay.hidden=true;mode='play';resetInput();rotation();updateHud();audio.start(s.sound);canvas.focus({preventScroll:true});}
function paper(title,body,actions='',className=''){return `<article class="paper ${className}"><button class="close-paper" data-action="close-overlay" aria-label="返回海上">×</button><small>LETTERS ON THE TIDE</small><h2>${esc(title)}</h2>${body}<div class="paper-actions">${actions}</div></article>`;}
function openPage(id,returnTo='play'){const page=CLUES[id];if(!page)return;bookReturn=returnTo;lastPage=id;audio.sound('paper');show(paper(page.title,`<small>${esc(page.subtitle)}</small><p>${esc(page.text)}</p><div class="stamp">${esc(page.stamp)}</div>`,`<button class="gold" data-action="close-overlay">${returnTo==='lens'?'回到灯镜':returnTo==='ending'?'合上信纸':'收进手册'}</button>`),'page');}
function journal(id=lastPage){const page=CLUES[id]||CLUES.letter;lastPage=id;bookReturn='play';audio.sound('paper');show(`<article class="paper journal-layout"><button class="close-paper" data-action="close-overlay" aria-label="合上手册">×</button><nav class="journal-tabs" aria-label="已发现的手册页">${s.pages.filter(p=>CLUES[p]).map(p=>`<button data-page="${p}" class="${p===id?'active':''}">${esc(CLUES[p].title)}</button>`).join('')}</nav><div class="journal-body"><small>邮 差 的 航 海 手 册</small><h2>${esc(page.title)}</h2><small>${esc(page.subtitle)}</small><p>${esc(page.text)}</p><div class="stamp">${esc(page.stamp)}</div><div class="paper-actions"><button data-action="close-overlay">回到海上</button></div></div></article>`,'journal');}
function map(){bookReturn='play';audio.sound('paper');show(paper('白鹭群岛 · 手绘海图','<canvas class="sea-chart" aria-label="白鹭群岛海图，红点为当前位置"></canvas><div class="map-legend"><span>● 你的位置</span><span>虚线 · 退潮时可走的石路</span></div>','<button data-action="close-overlay">收起海图</button>','map-paper'),'map');painter.chart($('.sea-chart'),s);}
function talk(data){dialogue=data;dialogueIndex=0;renderTalk();}
function renderTalk(){show(`<article class="dialogue-card"><div class="dialogue-name">${esc(dialogue.name)}</div><p>${esc(dialogue.lines[dialogueIndex])}</p><button class="next" data-action="next">${dialogueIndex===dialogue.lines.length-1?'收好这段故事':'继续'}　▸</button></article>`,'dialogue');}
function nextTalk(){if(!dialogue)return;if(++dialogueIndex<dialogue.lines.length)return renderTalk();const page=dialogue.page,ending=dialogue.ending;dialogue=null;if(ending)return endingCard();if(page)return openPage(page);resume();}
function lens(){bookReturn='play';const symbols=['≈','✧','彡','△'],names=['海','星','风','山'];show(paper('给灯，找一个方向',`<p>黄铜钥匙转动了。灯镜的三个刻度，停在了不同的方向。</p><div class="lens-mechanism">${s.rings.map((v,i)=>`<div class="lens-wheel ${v===[0,2,1][i]?'solved':''}"><span>${['外环','中环','内环'][i]}</span><button data-turn="${i}" aria-label="转动${['外环','中环','内环'][i]}，当前${names[v]}">${symbols[v]}</button><span>${names[v]}</span></div>`).join('')}</div>`,`<button data-action="lens-clue">翻开旧便笺</button><button data-action="close-overlay">等一会儿再来</button>`,'lens-paper'),'lens');}
function waitMenu(){bookReturn='play';show(paper('坐一会儿，等海换一条路',`<p>${esc(tideName(s))}\n远处的海鸟沿着岸线飞过。你把邮差包放在长椅的一边。</p>`,'<button class="gold" data-wait="low">等到退潮</button><button data-wait="high">等到涨潮</button><button data-action="close-overlay">起身</button>'),'wait');}
function changeTide(kind){$('#fade').classList.add('on');resetInput();later(()=>{waitFor(s,kind);save();resume();painter.snap(s);later(()=>$('#fade').classList.remove('on'),70);notice(kind==='low'?'海水退下去了。白石路露出了水面。':'潮水回来了。海面比刚才宽了一点。');},470);}
function endingCard(){bookReturn='play';show(paper('信抵达的地方',`<small>序 章 完</small><p class="letter-line">灯还亮着。\n这一次，有人在码头等他。</p><div class="ending-stats"><div><b>1</b><span>已送达的信</span></div><div><b>${s.pages.filter(p=>['shell','bell','bottle'].includes(p)).length} / 3</b><span>海边拾遗</span></div><div><b>${s.pages.length}</b><span>手册页</span></div></div>`,`<button class="gold" data-action="ending-letter">读他的回信</button><button data-action="close-overlay">在海上多待一会儿</button>`,'ending-screen'),'ending');save();}
function act(){if(mode!=='play'||rotation())return;const place=nearby(s);if(!place)return;const result=interact(s,place.id);resetInput();save();updateHud();if(!result)return;
 if(place.id==='bell')audio.sound('bell');else if(result.kind==='page')audio.sound('found');else audio.sound('paper');
 if(result.kind==='notice'){notice(result.text);painter.snap(s);}else if(result.kind==='dialogue')talk(result);else if(result.kind==='page')openPage(result.page);else if(result.kind==='wait')waitMenu();else if(result.kind==='lens')lens();else if(result.kind==='ending'){audio.sound('ending');talk({name:'林见海',lines:['是小满的字。她小的时候，总爱把“海”写得像一只船。','我替过路的人守了这么多年灯……倒让她一直替我等着。','谢谢你，邮差。请再替我带一封回信。'],ending:true});}}
function pause(){if(mode==='title'||disposed)return;save();resetInput();audio.pause();bookReturn='play';show(paper('歇一会儿',`<p class="save-label">${saveFailed?'存档暂时不可用':'旅程已自动保存'}<br>这片海会等你回来。</p>`,`<button class="gold" data-action="resume">继续旅程</button><button data-action="journal">航海手册</button><button data-action="fullscreen">⛶ 全屏 / 窗口</button><button data-action="sound">声音 · ${s.sound?'开':'关'}</button><button data-action="title">回到标题</button><button data-action="exit">返回大游戏</button>`,'pause-menu'),'pause');}
function showTitle(){if(mode!=='title')save();mode='title';resetInput();overlay.hidden=true;content.innerHTML='';$('#title-screen').hidden=false;showHud(false);$('#rotate').hidden=true;audio.pause();const begin=$('[data-action=start]');begin.innerHTML=saved?'继续旅程 <span>→</span>':'启程 <span>→</span>';$('[data-action=new]').hidden=!saved;}
function start(fresh=false){if(fresh){s=freshTide();saved=null;}$('#title-screen').hidden=true;showHud(true);mode='play';painter.snap(s);resume();audio.start(s.sound);save();if(fresh||!s.flags.started){s.flags.started=true;openPage('letter');}else notice('海还在，信也还在。');}
async function fullscreen(){let target=doc.documentElement;try{if(win.frameElement?.parentElement?.tagName==='DIALOG')target=win.frameElement.parentElement.ownerDocument.documentElement;}catch{}const host=target.ownerDocument;try{if(host.fullscreenElement)await host.exitFullscreen();else if(target.requestFullscreen){await target.requestFullscreen();fullscreenTarget=target;if(win.matchMedia('(pointer:coarse)').matches)await win.screen.orientation?.lock?.('landscape').catch(()=>{});}else notice('画面已铺满窗口。');}catch{notice('画面已铺满窗口，浏览器暂不支持系统全屏。');}}
function exit(){save();audio.pause();if(win.parent!==win)win.parent.postMessage({type:'st-iphonie:tide:close',session},location.origin);else showTitle();}
function closeOverlay(){if(mode==='confirm')return showTitle();const back=bookReturn;bookReturn='play';if(mode==='page'&&back==='lens')return lens();if(mode==='page'&&back==='ending')return endingCard();resume();}
listen(doc,'click',event=>{const b=event.target.closest('button');if(!b)return;
 if(b.dataset.page)return journal(b.dataset.page);
 if(b.dataset.wait)return changeTide(b.dataset.wait);
 if(b.dataset.turn!==undefined){if(mode!=='lens')return;audio.sound('turn');if(turnLens(s,Number(b.dataset.turn))){save();resume();audio.sound('found');notice('灯亮了。有人从门后走过来。');}else{save();lens();}return;}
 const action=b.dataset.action;
 if(action==='start')start();else if(action==='new'){bookReturn='title';show(paper('重新启程？','<p>现在的旅程会被新的存档替换。</p>','<button class="gold" data-action="confirm-new">重新启程</button><button data-action="title">保留现在的旅程</button>'),'confirm');}
 else if(action==='confirm-new')start(true);else if(action==='exit')exit();else if(action==='fullscreen')fullscreen();else if(action==='pause')pause();else if(action==='resume')resume();else if(action==='map')map();else if(action==='journal')journal();else if(action==='close-overlay')closeOverlay();else if(action==='next')nextTalk();else if(action==='title')showTitle();else if(action==='sound'){s.sound=!s.sound;audio.toggle(s.sound);save();pause();}else if(action==='lens-clue')openPage('office','lens');else if(action==='ending-letter')openPage('delivered','ending');else if(action==='portrait'){portrait=true;rotation();}
});
listen($('#interact'),'click',act);
listen(doc,'keydown',event=>{if(event.target.closest('input,textarea,select'))return;useInput('keyboard');const k=event.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' ','escape'].includes(k))event.preventDefault();
 if(mode==='title'){if(k==='enter')start();return;}if(event.repeat&&['e','enter','j','m','escape'].includes(k))return;
 if(k==='escape'){if(mode==='play')pause();else if(mode==='pause')resume();else if(mode==='dialogue')nextTalk();else closeOverlay();return;}
 if(mode==='dialogue'&&(k==='enter'||k===' ')){event.preventDefault();nextTalk();return;}
 if(mode!=='play'||rotation())return;if(k==='e'||k==='enter'){event.preventDefault();act();}else if(k==='j')journal();else if(k==='m')map();else{keys.add(k);target=null;waypoints=[];targetId=null;}
});
listen(doc,'keyup',e=>keys.delete(e.key.toLowerCase()));
listen(canvas,'pointerup',event=>{if(mode!=='play'||rotation()||event.button>0)return;const r=canvas.getBoundingClientRect(),point=painter.screenToWorld(event.clientX-r.left,event.clientY-r.top),near=nearby(s);if(near&&Math.hypot(point.x-near.x,point.y-near.y)<70)return act();const destination=destinationAt(s,point),route=planRoute(s,destination||point);waypoints=route;target=waypoints.shift()||null;targetId=target?destination?.id:null;blocked=0;if(!target)notice(s.mode==='boat'?'这里暂时无法靠近，试试木码头旁的海面。':'海水挡住了这条路。等退潮后再试试吧。');});
function joystick(event){if(stick.id!==event.pointerId)return;const r=$('#joystick').getBoundingClientRect(),dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2,length=Math.hypot(dx,dy),scale=Math.min(1,38/(length||1));stick.x=dx*scale/38;stick.y=dy*scale/38;$('#joystick i').style.transform=`translate(${dx*scale}px,${dy*scale}px)`;target=null;waypoints=[];targetId=null;}
listen($('#joystick'),'pointerdown',event=>{if(mode!=='play'||rotation())return;event.preventDefault();stick.id=event.pointerId;$('#joystick').setPointerCapture(event.pointerId);joystick(event);});listen($('#joystick'),'pointermove',joystick);
for(const type of ['pointerup','pointercancel','lostpointercapture'])listen($('#joystick'),type,event=>{if(stick.id!==event.pointerId)return;stick.id=null;stick.x=stick.y=0;$('#joystick i').style.transform='';});
listen(doc,'pointerdown',e=>{if(e.pointerType==='mouse')lastMousePoint={x:e.clientX,y:e.clientY};useInput(e.pointerType==='touch'||e.target.closest('#joystick')?'touch':'mouse');},{capture:true});
listen(doc,'pointermove',e=>{if(e.pointerType!=='mouse')return;const moved=e.movementX||e.movementY||!lastMousePoint||lastMousePoint.x!==e.clientX||lastMousePoint.y!==e.clientY;lastMousePoint={x:e.clientX,y:e.clientY};if(moved&&!e.target.closest('#joystick'))useInput('mouse');},{capture:true});
listen(win,'blur',()=>{if(mode==='play')pause();else resetInput();});
listen(win,'resize',()=>{painter.resize();rotation();});
listen(doc,'visibilitychange',()=>{if(doc.hidden){if(mode==='play')pause();audio.pause();if(raf)cancelAnimationFrame(raf);raf=0;save();}else if(!raf&&!disposed){previous=lastDraw=performance.now();raf=requestAnimationFrame(loop);}});
listen(win,'pagehide',()=>{save();audio.pause();});
listen(win,'message',e=>{if(e.source!==win.parent||e.origin!==location.origin||e.data?.session!==session)return;if(e.data.type==='st-iphonie:tide:pause')pause();});
function controllerInput(now){
 const pad=gamepad.read(now);if(!pad.connected&&inputKind==='gamepad')useInput(lastNonPad);if(pad.connected&&(pad.pressed.size||((pad.x||pad.y)&&Math.hypot(pad.x-lastPadX,pad.y-lastPadY)>.05)))useInput('gamepad');lastPadX=pad.x;lastPadY=pad.y;if(pad.lost&&mode==='play'){pause();notice('手柄已断开');}if(!pad.connected)return pad;
 if(pad.changed)notice('手柄已连接');
 if(!$('#rotate').hidden){if(pad.pressed.has(0)){portrait=true;rotation();}return {...pad,x:0,y:0};}
 if(pad.pressed.has(9)){if(mode==='play')pause();else if(mode==='pause')resume();else if(mode!=='title')pause();return {...pad,x:0,y:0};}
 if(pad.pressed.has(1)){if(mode==='play')pause();else if(mode==='pause')resume();else if(mode==='title')exit();else closeOverlay();return {...pad,x:0,y:0};}
 if(mode==='play'){
  if(pad.pressed.has(0))act();else if(pad.pressed.has(2))map();else if(pad.pressed.has(3))journal();
  if(pad.x||pad.y){target=null;waypoints=[];targetId=null;}
 }else{
  const scope=mode==='title'?$('#title-screen'):content,buttons=[...scope.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);
  if(pad.direction&&buttons.length){const index=buttons.indexOf(doc.activeElement),step=['up','left'].includes(pad.direction)?-1:1,next=buttons[(index<0?0:(index+step+buttons.length)%buttons.length)];next.focus({preventScroll:true});next.scrollIntoView({block:'nearest'});}
  if(pad.pressed.has(0)){const selected=buttons.includes(doc.activeElement)?doc.activeElement:scope.querySelector('.gold,[data-turn],.next')||buttons[0];selected?.click();}
 }
 return pad;
}
function loop(now){raf=0;if(disposed||doc.hidden)return;raf=requestAnimationFrame(loop);const interval=win.matchMedia('(pointer:coarse)').matches?30:16;if(now-lastDraw<interval)return;const dt=Math.min(.05,(now-(previous||now))/1000);previous=now;lastDraw=now;const pad=doc.hasFocus()?controllerInput(now):{x:0,y:0};if(mode==='title')return;
 if(mode==='play'&&!rotation()){
  const input={x:pad.x+stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),y:pad.y+stick.y+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)};
  if(target&&!input.x&&!input.y){const dx=target.x-s.x,dy=target.y-s.y,len=Math.hypot(dx,dy);if(len<12){target=waypoints.shift()||null;if(!target&&targetId){const id=targetId;targetId=null;if(nearby(s)?.id===id){act();return;}}}else{const speed=Math.min(1,len/(s.mode==='boat'?70:28));input.x=dx/len*speed;input.y=dy/len*speed;}}
  const before={x:s.x,y:s.y},result=stepTide(s,input,dt),moved=Math.hypot(s.x-before.x,s.y-before.y);
  if(result==='shoal'){resetInput();save();notice('浅滩露出了水面。你把小船推回了深水。');}
  if(result==='rising'){resetInput();save();notice('潮水漫上石路。你及时回到了安全的岸边，邮差包没有弄湿。');painter.snap(s);}
  if(target){blocked=moved<.1?blocked+dt:0;if(blocked>.6){target=null;waypoints=[];targetId=null;blocked=0;notice(s.mode==='boat'?'前面是浅滩或海岸。绕开它，木码头可以靠岸。':'前面是海。沿岸找找露出来的路吧。');}}
  if(s.mode==='foot'&&moved>0){steps+=moved;if(steps>37){audio.sound('step');steps=0;}}
  if(now-lastSave>5000)save();
 }
 if(now-lastHud>180){updateHud();lastHud=now;}
 painter.draw(s,dt,{target:waypoints.at(-1)||target,near:nearby(s),menu:mode!=='play'});
}
function dispose(){if(disposed)return;save();if(fullscreenTarget?.ownerDocument.fullscreenElement===fullscreenTarget)fullscreenTarget.ownerDocument.exitFullscreen?.().catch(()=>{});fullscreenTarget=null;disposed=true;abort.abort();cancelAnimationFrame(raf);win.clearTimeout(noticeTimer);for(const id of timers)win.clearTimeout(id);timers.clear();resetInput();audio.dispose();}
win.stTide={pause,dispose,snapshot:()=>structuredClone(s)};
painter.snap(s);showTitle();raf=requestAnimationFrame(loop);

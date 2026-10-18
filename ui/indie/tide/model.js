// The first island, its tide and its story. No DOM, network or model calls.
export const WORLD = {w: 2440, h: 1580};
export const PERIOD = 180;
export const ISLANDS = [
  {id:'harbor', name:'旧码头', x:380,y:1150,rx:180,ry:140,level:-1},
  {id:'egret', name:'白鹭岛', x:1460,y:900,rx:340,ry:240,level:-1},
  {id:'office', name:'旧邮局', x:920,y:940,rx:120,ry:95,level:.42},
  {id:'light', name:'守灯人的小岛', x:1750,y:475,rx:160,ry:130,level:-1}
];
export const PATHS = [{a:[1000,940],b:[1220,940],width:46,level:.42},{a:[1600,735],b:[1720,565],width:64,level:.42}];
export const DOCKS = [{id:'harbor',name:'旧码头',water:[594,1220],land:[520,1190]},{id:'egret',name:'白鹭岛码头',water:[1810,1040],land:[1700,990]}];
export const PLACES = [
  {id:'keeper',x:1430,y:885,label:'岑婆婆',verb:'交谈'},
  {id:'bench',x:1555,y:960,label:'望潮长椅',verb:'等潮'},
  {id:'office',x:920,y:935,label:'旧邮局',verb:'调查'},
  {id:'lighthouse',x:1750,y:475,label:'灯塔',verb:'敲门'},
  {id:'shell',x:1310,y:1030,label:'海玻璃',verb:'拾起'},
  {id:'bell',x:1590,y:765,label:'旧雾钟',verb:'轻敲'},
  {id:'bottle',x:815,y:1170,label:'漂流瓶',verb:'打捞',boat:true}
];
export const CLUES = {
  letter:{title:'一封没有寄出的信',subtitle:'收信人 · 林见海',text:'爸：\n海桐今年开得很晚。我给窗边那盆换了土，想起小时候，你总说等最后一班船回来就回家。\n这次不用等船。等灯亮起来，就到码头来吧。我在那里等你。\n——小满',stamp:'白鹭岛 · 旧邮局'},
  chart:{title:'岑婆婆的潮汐表',subtitle:'岛上的路，一天出现两次',text:'海水退到白石以下，旧邮局和灯塔的石路才会露出来。\n长椅上的人不赶时间。坐一会儿，就能等到想要的潮水。',stamp:'望潮人赠'},
  office:{title:'邮局最后一页值班簿',subtitle:'一页沾着盐的便笺',text:'灯镜的三个刻度，总是从外向内数。\n第一圈，朝向海。\n第二圈，追着风。\n第三圈，留给星。\n钥匙还在抽屉里。别让灯熄得太久。',stamp:'灯镜 · 海／风／星'},
  shell:{title:'一片绿色的海',subtitle:'海玻璃 · 潮间带',text:'棱角被海水磨平以后，一片旧瓶子也能盛住光。\n你把它夹进手册。纸页上留下了一点盐。',stamp:'海边拾遗 01'},
  bell:{title:'雾里的回声',subtitle:'旧雾钟 · 白鹭岛北岸',text:'钟声越过小岛，海上的白鹭同时抬起头。\n灯塔的窗后，似乎也有人听见了。',stamp:'海边拾遗 02'},
  bottle:{title:'写给下一个夏天',subtitle:'漂流瓶 · 航道',text:'“如果你捡到它，请替我看看岛上的灯。\n我小时候觉得，它是海里最大的一颗星。”\n落款已经褪色了。',stamp:'海边拾遗 03'},
  delivered:{title:'回信',subtitle:'林见海 · 灯塔',text:'小满：\n灯已经亮了。\n今天，我会赶上最后一班船。\n窗边那盆海桐，替我再浇一点水。\n——爸',stamp:'已送达 · 第一封信'}
};
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export const tideAt = clock => .5+.5*Math.sin(clock/PERIOD*Math.PI*2);
export const tideName = s => tideAt(s.clock)<.42?'退潮 · 石路显露':tideAt(s.clock)>.72?'满潮 · 海面开阔':'潮水正在转向';
const segment = (x,y,p) => {const [ax,ay]=p.a,[bx,by]=p.b,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-dx*t,y-ay-dy*t);};
export function landAt(x,y,tide) {return ISLANDS.some(i=>tide>=i.level&&i.level>=0?false:((x-i.x)/i.rx)**2+((y-i.y)/i.ry)**2<1)||PATHS.some(p=>tide<p.level&&segment(x,y,p)<p.width/2);}
export function buildingAt(x,y){return [[355,1130],[1460,850],[920,935]].some(([cx,cy])=>Math.abs(x-cx)<48&&y>cy-44&&y<cy-8)||((x-1750)/19)**2+((y-451)/18)**2<1;}
export function questTarget(s){return s.flags.delivered?null:s.flags.office?{id:'lighthouse',x:1750,y:475,label:'灯塔'}:s.flags.metKeeper?{id:'office',x:920,y:935,label:'旧邮局'}:s.mode==='boat'?{id:'dock:egret',x:1810,y:1040,label:'白鹭岛码头'}:{id:'keeper',x:1430,y:885,label:'岑婆婆'};}
export function passable(s,x,y) {if(x<45||y<45||x>WORLD.w-45||y>WORLD.h-45)return false;const land=landAt(x,y,tideAt(s.clock));return s.mode==='boat'?!land:land&&!buildingAt(x,y);}
export function freshTide() {return {version:1,x:650,y:1250,heading:-.6,vx:0,vy:0,mode:'boat',dock:'harbor',boat:{x:650,y:1250,heading:-.6},clock:30,elapsed:0,flags:{},pages:['letter'],rings:[1,0,3],sound:true,visited:['harbor']};}
export function restoreTide(value) {
  if(!value||value.version!==1)return freshTide();
  const s=freshTide(),finite=(v,min,max,f)=>Number.isFinite(v)&&v>=min&&v<=max?v:f;
  for(const k of ['x','y','heading','clock','elapsed'])s[k]=finite(value[k],k==='heading'?-100:0,k==='heading'?100:k==='x'?WORLD.w:k==='y'?WORLD.h:1e9,s[k]);
  s.mode=value.mode==='foot'?'foot':'boat';s.dock=DOCKS.some(d=>d.id===value.dock)?value.dock:'harbor';
  s.sound=value.sound!==false;s.pages=[...new Set(['letter',...(Array.isArray(value.pages)?value.pages:[])].filter(p=>Object.hasOwn(CLUES,p)))];
  for(const k of ['started','metKeeper','office','aligned','delivered','shell','bell','bottle'])s.flags[k]=value.flags?.[k]===true;
  if(s.flags.delivered){s.flags.aligned=s.flags.office=true;if(!s.pages.includes('delivered'))s.pages.push('delivered');}
  s.rings=Array.isArray(value.rings)&&value.rings.length===3?value.rings.map(v=>Number.isInteger(v)&&v>=0&&v<4?v:0):s.rings;
  s.boat={x:finite(value.boat?.x,45,WORLD.w-45,650),y:finite(value.boat?.y,45,WORLD.h-45,1250),heading:finite(value.boat?.heading,-100,100,0)};
  s.visited=[...new Set(['harbor',...(Array.isArray(value.visited)?value.visited:[])].filter(id=>ISLANDS.some(i=>i.id===id)))];
  if(!passable(s,s.x,s.y)){const d=DOCKS.find(d=>d.id===s.dock);[s.x,s.y]=s.mode==='foot'?d.land:d.water;s.vx=s.vy=0;}
  return s;
}
export function objective(s) {return s.flags.delivered?'信已送达。海上还有一些小小的故事。':s.flags.aligned?'灯亮了。去和守灯的人说说话。':s.flags.office?'沿退潮后的北岸石路，去灯塔。':s.flags.metKeeper?'退潮时，沿西岸的石路寻找旧邮局。':'前往白鹭岛，寻找旧邮局。';}
export function nearby(s) {
  const spots=s.mode==='boat'?DOCKS.map(d=>({id:'dock:'+d.id,x:d.water[0],y:d.water[1],label:d.name,verb:'靠岸'})):[];
  if(s.mode==='foot'){const d=DOCKS.find(d=>d.id===s.dock);spots.push({id:'boat',x:d.land[0],y:d.land[1],label:'邮差的小船',verb:'上船'});}
  spots.push(...PLACES.filter(p=>!!p.boat===(s.mode==='boat')&&!(['shell','bottle'].includes(p.id)&&s.flags[p.id])));
  return spots.map(p=>({...p,distance:distance(s,p)})).filter(p=>p.distance<(p.id.startsWith('dock:')?110:80)).sort((a,b)=>a.distance-b.distance)[0]||null;
}
export function discover(s,id) {if(Object.hasOwn(CLUES,id)&&!s.pages.includes(id))s.pages.push(id);if(!s.visited.includes(id)&&ISLANDS.some(i=>i.id===id))s.visited.push(id);}
export function interact(s,id=nearby(s)?.id) {
  const spot=nearby(s);if(!spot||spot.id!==id)return null;
  if(id.startsWith('dock:')){const d=DOCKS.find(d=>'dock:'+d.id===id);s.boat={x:s.x,y:s.y,heading:s.heading};s.mode='foot';s.dock=d.id;[s.x,s.y]=d.land;s.vx=s.vy=0;discover(s,d.id);return {kind:'notice',text:'缆绳系好了。'};}
  if(id==='boat'){s.mode='boat';s.x=s.boat.x;s.y=s.boat.y;s.heading=s.boat.heading;s.vx=s.vy=0;if(!passable(s,s.x,s.y))[s.x,s.y]=DOCKS.find(d=>d.id===s.dock).water;return {kind:'notice',text:'风从海面吹过来。'};}
  if(id==='keeper'){s.flags.metKeeper=true;discover(s,'chart');return {kind:'dialogue',name:'岑婆婆',lines:['找旧邮局？你来得有些晚。不过，海上的信，从来不怕晚。','西边那条白石路，要等海水退下去才走得过。去长椅坐一会儿吧。','林见海还在守灯。许多年了……你见到他，替我问声好。'],page:'chart'};}
  if(id==='bench')return {kind:'wait'};
  if(id==='office'){s.flags.office=true;discover(s,'office');return {kind:'dialogue',name:'旧邮局',lines:['门一推就开了。海水退去以后，柜台上留下浅浅的盐痕。','抽屉里有一把黄铜钥匙，还有一页给守灯人的便笺。你把它们收进邮差包。','这封信的收信人，已经搬去了北边的灯塔。'],page:'office'};}
  if(id==='lighthouse'){
    if(!s.flags.office)return {kind:'dialogue',name:'灯塔',lines:['门锁着。门边的小牌上写着：备用钥匙，存于旧邮局。']};
    if(!s.flags.aligned)return {kind:'lens'};
    if(s.flags.delivered)return {kind:'dialogue',name:'林见海',lines:['谢谢你。今天的灯，会替我再守一小会儿。','等潮水涨起来，我就回家。'],page:'delivered'};
    s.flags.delivered=true;discover(s,'delivered');return {kind:'ending'};
  }
  s.flags[id]=true;discover(s,id);return {kind:'page',page:id};
}
export function waitFor(s,kind) {const phase=kind==='low'?135:45;let target=Math.floor(s.clock/PERIOD)*PERIOD+phase;while(target<s.clock+5)target+=PERIOD;s.clock=target;s.vx=s.vy=0;}
export function turnLens(s,index) {if(!s.flags.office||!Number.isInteger(index)||index<0||index>2)return false;s.rings[index]=(s.rings[index]+1)%4;const aligned=s.rings.every((v,i)=>v===[0,2,1][i]);if(aligned)s.flags.aligned=true;return aligned;}
export function stepTide(s,input,dt) {
  dt=Math.min(.05,Math.max(0,dt));s.clock+=dt;s.elapsed+=dt;
  if(s.mode==='foot'&&!landAt(s.x,s.y,tideAt(s.clock))){[s.x,s.y]=DOCKS.find(d=>d.id===s.dock).land;s.vx=s.vy=0;return 'rising';}
  if(s.mode==='boat'&&landAt(s.x,s.y,tideAt(s.clock))){for(let r=16;r<420;r+=16)for(let a=0;a<Math.PI*2;a+=Math.PI/8){const x=s.x+Math.cos(a)*r,y=s.y+Math.sin(a)*r;if(passable(s,x,y)){s.x=x;s.y=y;s.vx=s.vy=0;return 'shoal';}}}
  let x=input.x||0,y=input.y||0;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  const speed=s.mode==='boat'?150:112,friction=s.mode==='boat'?2.2:12;
  s.vx+=(x*speed-s.vx)*Math.min(1,dt*friction);s.vy+=(y*speed-s.vy)*Math.min(1,dt*friction);
  let moved=false;
  if(passable(s,s.x+s.vx*dt,s.y)){s.x+=s.vx*dt;moved=true;}else s.vx=0;
  if(passable(s,s.x,s.y+s.vy*dt)){s.y+=s.vy*dt;moved=true;}else s.vy=0;
  if(Math.hypot(s.vx,s.vy)>5){let delta=Math.atan2(s.vy,s.vx)-s.heading;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;s.heading+=delta*Math.min(1,dt*(s.mode==='boat'?3:12));}
  return moved?'move':null;
}

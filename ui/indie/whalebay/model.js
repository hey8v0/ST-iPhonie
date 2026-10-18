// Whale Bay's simulation has no DOM, network or wall-clock dependency.
export const WIDTH=36, HEIGHT=28, SEASONS=['春','夏','秋','冬'];
export const CROPS={turnip:{name:'海风萝卜',days:2,seed:8,value:24,level:1,color:'#e7b6c0'},tomato:{name:'日光番茄',days:3,seed:14,value:48,level:2,color:'#dd7157'},pumpkin:{name:'蜜糖南瓜',days:4,seed:25,value:90,level:3,color:'#e5a249'},blueflower:{name:'鲸蓝花',days:3,seed:22,value:72,level:4,color:'#87b8dd'}};
export const ITEMS={wood:{name:'漂流木',value:8},shell:{name:'月白贝',value:12},herb:{name:'海岸香草',value:10},sardine:{name:'银沙鱼',value:22},bream:{name:'珊瑚鲷',value:42},moonfish:{name:'月鳍鱼',value:88},tea:{name:'海风茶',value:52},stew:{name:'渔夫浓汤',value:105},bouquet:{name:'鲸蓝花束',value:195},...CROPS};
export const RECIPES={tea:{name:'海风茶',needs:{herb:3},level:1},stew:{name:'渔夫浓汤',needs:{sardine:2,herb:1},level:2},bouquet:{name:'鲸蓝花束',needs:{blueflower:2,shell:2},level:4}};
export const STATIONS=[{id:'home',x:8,y:7,name:'海风小屋',verb:'休息',solid:true},{id:'shop',x:20,y:7,name:'鲸尾杂货',verb:'种子',solid:true},{id:'craft',x:21,y:14,name:'岸边工坊',verb:'制作',solid:true},{id:'orders',x:15,y:10,name:'小镇委托',verb:'委托'},{id:'sell',x:11,y:10,name:'出货箱',verb:'出货'},{id:'fish',x:29,y:19,name:'木栈桥',verb:'垂钓'},{id:'mira',x:18,y:10,name:'米拉',verb:'交谈'},{id:'levi',x:27,y:17,name:'阿岚',verb:'交谈'}];
export const RESOURCES=Array.from({length:15},(_,i)=>({id:'g'+i,x:3+(i*7)%23,y:17+(i*3)%5,item:['wood','herb','shell'][i%3]}));
const integer=(n,min,max,fallback)=>Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback;
export const level=s=>Math.min(4,1+Math.floor(s.xp/100));
export const season=s=>SEASONS[Math.floor((s.day-1)/14)%4];
export const weather=s=>s.day%5===0?'雨':s.day%3===0?'薄雾':'晴';
export const timeText=s=>`${String(Math.floor(s.minute/60)).padStart(2,'0')}:${String(Math.floor(s.minute%60)).padStart(2,'0')}`;
export function land(x,y){return x>=1+Math.sin(y*.4)*.65&&y>=2+Math.sin(x*.3)*1.3&&x<32-Math.max(0,y-16)*.65+Math.sin(y*.5)*.5&&y<24+Math.sin(x*.3)*1.5;}
export function elevation(x,y){return .5+Math.round(Math.max(0,Math.min(1,(5.5-y)/1.4))*4)*.225;}
export function walkable(x,y){return (land(x,y)||(x>=27&&x<=31&&Math.abs(y-19)<.55))&&Math.hypot(x-16,y-13)>.7&&!(x>5.5&&x<11.8&&Math.abs(y-11)<.2&&Math.abs(x-9)>.6)&&!STATIONS.some(p=>p.solid&&Math.abs(p.x-x)<(p.id==='craft'?1.65:1.95)&&y>p.y-1.9&&y<p.y+.85);}
export const plots=s=>Array.from({length:6+level(s)*2+s.expansion*4},(_,i)=>({id:i,x:6+i%6,y:12+Math.floor(i/6)}));
export function freshBay(){return {v:1,day:1,minute:420,energy:100,coins:65,xp:0,expansion:0,player:{x:12,y:12},inventory:{},seeds:{turnip:8},fields:{},gathered:[],orders:[],friendship:{mira:0,levi:0},talked:[],collection:{},rng:19713,stats:{harvest:0,fish:0,orders:0},sound:true};}
export function restoreBay(raw){
 if(!raw||raw.v!==1) return freshBay();
 const s=freshBay();for(const k of ['day','minute','energy','coins','xp','expansion','rng'])s[k]=integer(raw[k],k==='day'?1:0,({day:999999,minute:1320,energy:100,coins:99999999,xp:9999999,expansion:4,rng:2147483646})[k],s[k]);
 if(raw.player&&walkable(raw.player.x,raw.player.y))s.player={x:raw.player.x,y:raw.player.y};
 for(const k of ['inventory','seeds','collection'])for(const [id,n] of Object.entries(raw[k]||{}))if(ITEMS[id])s[k][id]=integer(n,0,99999,0);
 for(const p of plots(s)){const f=raw.fields?.[p.id];if(f&&CROPS[f.crop])s.fields[p.id]={crop:f.crop,growth:integer(f.growth,0,20,0),watered:f.watered===true};}
 s.gathered=RESOURCES.filter(p=>raw.gathered?.includes(p.id)).map(p=>p.id);
 s.orders=Array.isArray(raw.orders)?raw.orders.filter(Number.isInteger).filter(n=>n>=0&&n<3):[];
 for(const id of ['mira','levi'])s.friendship[id]=integer(raw.friendship?.[id],0,9999,0);
 s.talked=['mira','levi'].filter(id=>raw.talked?.includes(id));
 for(const k of Object.keys(s.stats))s.stats[k]=integer(raw.stats?.[k],0,999999,0);
 s.sound=raw.sound!==false;return s;
}
export function random(s){s.rng=(Math.imul(s.rng,16807)>>>0)%2147483647;return s.rng/2147483647;}
export function receive(s,id,n=1){s.inventory[id]=(s.inventory[id]||0)+n;s.collection[id]=(s.collection[id]||0)+n;}
export function spendEnergy(s,cost,minutes=6){if(s.energy<cost)throw Error('有点累了。回小屋睡一觉，或喝一杯海风茶。');if(s.minute>=1320)throw Error('夜深了，回小屋休息吧。');s.energy-=cost;s.minute=Math.min(1320,s.minute+minutes);}
export function farm(s,id,seed='turnip'){
 if(!plots(s).some(p=>p.id===Number(id)))throw Error('这块田还没有开垦');
 const f=s.fields[id];
 if(!f){if(!CROPS[seed]||level(s)<CROPS[seed].level||!(s.seeds[seed]>0))throw Error('种子不够，去鲸尾杂货看看');spendEnergy(s,3);s.seeds[seed]--;s.fields[id]={crop:seed,growth:0,watered:weather(s)==='雨'};return '种下了'+CROPS[seed].name;}
 if(f.growth>=CROPS[f.crop].days){spendEnergy(s,2);receive(s,f.crop,1);s.xp+=12;s.stats.harvest++;delete s.fields[id];return CROPS[f.crop].name+'成熟了 · +12 经验';}
 if(f.watered)return '已经浇过水了';spendEnergy(s,2);f.watered=true;return '水珠渗进了泥土';
}
export function gather(s,id){const p=RESOURCES.find(p=>p.id===id);if(!p||s.gathered.includes(id))throw Error('明天这里会有新的发现');spendEnergy(s,4);s.gathered.push(id);receive(s,p.item,1);s.xp+=3;return '拾起了'+ITEMS[p.item].name;}
export function buy(s,id,n=1){const c=CROPS[id];if(!c||level(s)<c.level)throw Error('农园等级还不够');n=integer(n,1,10,1);if(s.coins<c.seed*n)throw Error('贝币不够');s.coins-=c.seed*n;s.seeds[id]=(s.seeds[id]||0)+n;return `买到了 ${n} 颗种子`;}
export function sell(s,id,n=1){if(!ITEMS[id]||!(s.inventory[id]>=n)||!Number.isInteger(n)||n<1)throw Error('背包里的数量不够');s.inventory[id]-=n;s.coins+=ITEMS[id].value*n;return `出货成功 · +${ITEMS[id].value*n} 贝币`;}
export function make(s,id){const r=RECIPES[id];if(!r||level(s)<r.level)throw Error('配方还没有解锁');if(Object.entries(r.needs).some(([k,n])=>(s.inventory[k]||0)<n))throw Error('材料还没有备齐');spendEnergy(s,3,10);for(const [k,n] of Object.entries(r.needs))s.inventory[k]-=n;receive(s,id);s.xp+=8;return '做好了'+ITEMS[id].name;}
export function dailyOrders(s){const pool=['shell','herb','wood','sardine',...Object.keys(CROPS).filter(k=>level(s)>=CROPS[k].level)];return Array.from({length:3},(_,i)=>{const item=pool[(s.day*3+i*2)%pool.length],count=2+(s.day+i)%2;return {id:i,item,count,pay:ITEMS[item].value*count+30+(level(s)-1)*10,name:['米拉的野餐篮','渔会的补给','街角的小心愿'][i]};});}
export function deliver(s,id){const o=dailyOrders(s).find(o=>o.id===Number(id));if(!o||s.orders.includes(o.id))throw Error('这份委托已经完成了');if((s.inventory[o.item]||0)<o.count)throw Error('再攒一些材料就能交货了');s.inventory[o.item]-=o.count;s.orders.push(o.id);s.coins+=o.pay;s.xp+=25;s.stats.orders++;return `委托完成 · +${o.pay} 贝币 · +25 经验`;}
export function expand(s){const cost=100+s.expansion*150;if(s.expansion>=4)throw Error('农园已经全部开垦');if(s.coins<cost||(s.inventory.wood||0)<5)throw Error(`还需要 ${cost} 贝币和 5 根漂流木`);s.coins-=cost;s.inventory.wood-=5;s.expansion++;s.xp+=20;return '新田地开垦好了';}
export function fish(s,quality){const roll=random(s),id=quality>.88&&s.day>4?'moonfish':quality>.55||weather(s)==='雨'&&roll>.4?'bream':'sardine';receive(s,id);s.xp+=10;s.stats.fish++;return '钓到了'+ITEMS[id].name+' · +10 经验';}
export function drink(s){if(!(s.inventory.tea>0))throw Error('还没有海风茶，可以去工坊做');s.inventory.tea--;s.energy=Math.min(100,s.energy+25);return '海风茶 · 恢复 25 体力';}
export function sleep(s){const income=[];for(const f of Object.values(s.fields)){if(f.watered)f.growth++;f.watered=false;}s.day++;s.minute=420;s.energy=100;s.gathered=[];s.orders=[];s.talked=[];s.player={x:10,y:8};if(weather(s)==='雨')for(const f of Object.values(s.fields))f.watered=true;return income;}
export function tick(s,dt){s.minute=Math.min(1320,s.minute+Math.min(.1,Math.max(0,dt))*1.4);}
export function talk(s,id){if(!['mira','levi'].includes(id))return '';const first=!s.talked.includes(id);if(first){s.talked.push(id);s.friendship[id]=(s.friendship[id]||0)+1;s.xp+=4;}
 const mira=['我把第一包萝卜种子留给你了。记得浇水，过两晚就能收成。','海边的东西每天都不一样。漂流木可以拿去开垦农园。','听见了吗？冬天海面上也会有鲸的歌声。这里的四季，都会再回来。','等你种出鲸蓝花，我们一起给码头换一束新的花吧。'];
 const levi=['想试试钓鱼吗？到木栈桥，等浮标经过亮起来的地方再收线。','下雨是钓珊瑚鲷的好时候。工坊的浓汤配方，你可以试试。','第七天，船队会来收货。其实每天的委托，都有愿意等你的人。','我见过月鳍鱼。等你在这儿住久一点，也许它也会来找你。'];
 return (id==='mira'?mira:levi)[Math.min(3,Math.floor((s.friendship[id]||0)/3))]+(!first?' 今天的话，已经说过了。':'');
}
export function nearby(s){const list=[...STATIONS,...plots(s).map(p=>({...p,id:'plot'+p.id,plot:p.id,name:s.fields[p.id]?CROPS[s.fields[p.id].crop].name:'空田地',verb:s.fields[p.id]?(s.fields[p.id].growth>=CROPS[s.fields[p.id].crop].days?'收获':s.fields[p.id].watered?'查看':'浇水'):'播种'})),...RESOURCES.filter(p=>!s.gathered.includes(p.id)).map(p=>({...p,name:ITEMS[p.item].name,verb:'拾取'}))];return list.map(p=>({...p,d:Math.hypot(s.player.x-p.x,s.player.y-p.y)})).filter(p=>p.d<1.65).sort((a,b)=>a.d-b.d)[0]||null;}
export function route(start,end){const ex=Math.round(end.x),ey=Math.round(end.y),sx=Math.round(start.x),sy=Math.round(start.y),queue=[[sx,sy]],prev=new Map([[`${sx},${sy}`,null]]);let goal=null;
 while(queue.length){const [x,y]=queue.shift();if(Math.hypot(x-ex,y-ey)<(walkable(ex,ey)?0.6:1.7)){goal=[x,y];break;}for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=`${xx},${yy}`;if(!prev.has(k)&&walkable(xx,yy)){prev.set(k,[x,y]);queue.push([xx,yy]);}}}
 if(!goal)return [];const out=[];while(goal&&!(goal[0]===sx&&goal[1]===sy)){out.unshift({x:goal[0],y:goal[1]});goal=prev.get(goal.join(','));}return out;
}

import {normalizeAvatar} from './avatar.js';
import {SCENES,ITEMS,SKILLS,floorAt,collides} from './world.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const integer=(n,a,b,f=0)=>clamp(Math.floor(finite(n,f)),a,b);
export function freshEnclave(appearance){return {kind:'antarctic-enclave',v:1,avatar:normalizeAvatar(appearance),scene:'whalebay',day:1,minute:540,coins:80,hp:100,stamina:100,inventory:{tea:2},flags:{},found:[],defeated:[],gathered:[],talked:[],friendship:{mira:0,lan:0,construct:0},garden:{planted:0,watered:false,age:0},visited:['whalebay'],skill:'wind',skills:[],player:{x:16,z:15,y:0,vx:0,vz:0,vy:0,faceX:0,faceZ:1,grounded:true,coyote:.1,jumpBuffer:0,attack:0,combo:0,comboWindow:0,dash:0,ward:0,hurt:0,land:0,cooldowns:{}},respawn:{scene:'whalebay',x:16,z:15},sound:true};}
export function restoreEnclave(raw){
 const s=freshEnclave(raw?.avatar);if(!raw||raw.kind!=='antarctic-enclave'||raw.v!==1)return s;
 for(const k of ['day','minute','coins','hp','stamina'])s[k]=integer(raw[k],k==='day'?1:0,({day:999999,minute:1320,coins:9999999,hp:100,stamina:100})[k],s[k]);
 s.scene=Object.prototype.hasOwnProperty.call(SCENES,raw.scene)?raw.scene:'whalebay';
 for(const key of Object.keys(ITEMS)){const n=integer(raw.inventory?.[key],0,99999);if(n)s.inventory[key]=n;else delete s.inventory[key];}
 const flags=['intro','echoUnlocked','waterUnlocked','parcelFound','reported','constructHelped','beacon-a','beacon-b','beacon-c',...Object.entries(SCENES).flatMap(([scene,data])=>data.objects.filter(o=>o.type==='secret').map(o=>scene+':'+o.id))];for(const id of flags)if(raw.flags?.[id]===true)s.flags[id]=true;
 for(const k of ['found','defeated','gathered','talked'])s[k]=Array.isArray(raw[k])?[...new Set(raw[k].filter(x=>typeof x==='string'&&x.length<80))].slice(0,300):[];
 s.skills=['wind','echo','water'].filter(id=>id==='wind'?s.flags.intro:id==='echo'?s.flags.echoUnlocked:s.flags.waterUnlocked);s.skill=s.skills.includes(raw.skill)?raw.skill:s.skills[0]||'wind';
 s.visited=Object.keys(SCENES).filter(id=>Array.isArray(raw.visited)&&raw.visited.includes(id));if(!s.visited.includes(s.scene))s.visited.push(s.scene);
 for(const id of Object.keys(s.friendship))s.friendship[id]=integer(raw.friendship?.[id],0,9999);
 s.garden={planted:integer(raw.garden?.planted,0,s.day),watered:raw.garden?.watered===true,age:integer(raw.garden?.age,0,4)};
 const scene=SCENES[s.scene],x=finite(raw.player?.x,scene.spawn.x),z=finite(raw.player?.z,scene.spawn.z),h=floorAt(scene,x,z);
 if(Number.isFinite(h)&&!collides(scene,x,z,h))Object.assign(s.player,{x,z,y:h});else Object.assign(s.player,{...scene.spawn,y:floorAt(scene,scene.spawn.x,scene.spawn.z)});
 s.respawn={scene:s.scene,...scene.spawn};s.sound=raw.sound!==false;return s;
}
export function dateInfo(s){const d=new Date(Date.UTC(2026,8,s.day));const m=d.getUTCMonth()+1;return {year:d.getUTCFullYear(),month:m,day:d.getUTCDate(),season:m===12||m<3?'夏':m<6?'秋':m<9?'冬':'春'};}
export function objective(s){if(!s.flags.intro)return '先去广场认识居民向导米拉';if(!s.flags.echoUnlocked)return `听潮岸 · 点亮风灯 ${['beacon-a','beacon-b','beacon-c'].filter(id=>s.flags[id]).length}/3`;if(!s.flags.parcelFound)return '回声庭院 · 用回声寻找遗落的航运记录';if(!s.flags.reported)return '把航运记录带回鲸湾，交给阿岚';return '故事仍在继续 · 自由探索、寻找隐匣或照料院落';}
export function nearby(s){const scene=SCENES[s.scene],p=s.player;return scene.objects.filter(o=>Math.abs((o.y||0)-p.y)<1.1&&Math.hypot(o.x-p.x,o.z-p.z)<1.7).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]||null;}
export function give(s,id,n=1){if(!ITEMS[id]||!Number.isInteger(n)||n<1)return;if(id==='token')s.coins+=n;else s.inventory[id]=(s.inventory[id]||0)+n;}
export function travel(s,to){if(!Object.prototype.hasOwnProperty.call(SCENES,to))throw Error('这条航线还没有开放');if(to==='coast'&&!s.flags.intro)throw Error('先向广场的米拉登记近郊步道');if(to==='garden'&&!s.flags.echoUnlocked)throw Error('先点亮听潮岸的三盏风灯');s.scene=to;Object.assign(s.player,{...SCENES[to].spawn,y:0,vx:0,vz:0,vy:0,dash:0,attack:0,ward:0,hurt:.5,grounded:true});s.respawn={scene:to,...SCENES[to].spawn};if(!s.visited.includes(to))s.visited.push(to);return SCENES[to].name;}
export function interact(s,object=nearby(s)){
 if(!object)throw Error('再走近一点');const key=s.scene+':'+object.id;
 if(object.type==='travel')return {travel:object.to};
 if(object.type==='person'){
  if(!s.talked.includes(object.id)){s.talked.push(object.id);s.friendship[object.id]=(s.friendship[object.id]||0)+1;}
  if(object.id==='mira'){
   if(!s.flags.intro){s.flags.intro=true;s.skills.push('wind');return {name:object.name,text:'欢迎来到鲸湾。我帮你登记了听潮岸步道。带上这枚踏风符，去把三盏归航灯重新点亮吧。风会托住空中的你。',reward:'习得 · 踏风',speaker:'mira'};}
   return {name:object.name,text:s.flags.reported?'下周的故事之夜，想听听你眼中的鲸湾。冒险之外，也记得给自己留一张可以回来坐的椅子。':'风灯沿着海岸分布，有一盏在高台上。起跳后再借风向前，落地前松开方向，试着把脚步停在石台中央。',speaker:'mira'};
  }
  if(object.id==='lan'){
   if(s.flags.parcelFound&&!s.flags.reported){s.flags.reported=true;s.flags.waterUnlocked=true;if(!s.skills.includes('water'))s.skills.push('water');s.coins+=120;return {name:object.name,text:'就是这份航运记录！原来货物被雾中回声引进了旧庭院。谢谢你。送你一枚潮幕符，遇险时能替你挡下一击。',reward:'习得 · 潮幕　+120 代币',speaker:'lan'};}
   return {name:object.name,text:'今早有一份航运记录遗落在回声庭院。那里能量不太稳定，已经登记为灰区。等米拉确认你的踏风练习，再去看看。',speaker:'lan'};
  }
  if(!s.flags.constructHelped){s.flags.constructHelped=true;give(s,'tea',2);return {name:'拾音',text:'……记录单元恢复。不是怪物，是旧阵列里逸散的能量。感知回声后，石缝里的东西会显出轮廓。要不要先喝杯茶？',reward:'暖潮茶 ×2',speaker:'construct'};}
  return {name:'拾音',text:'我会慢慢把庭院修好。下次来时，你可以告诉我港口的潮声是什么样。',speaker:'construct'};
 }
 if(object.type==='beacon'){if(s.flags[object.id])return {notice:'风灯已经亮着'};s.flags[object.id]=true;give(s,'token',15);if(['beacon-a','beacon-b','beacon-c'].every(id=>s.flags[id])){s.flags.echoUnlocked=true;if(!s.skills.includes('echo'))s.skills.push('echo');return {notice:'三盏风灯响应了你的气息 · 习得回声',reward:true};}return {notice:'风灯亮了 · +15 代币',reward:true};}
 if(object.type==='gather'){if(s.gathered.includes(key))throw Error('明天再来看看');s.gathered.push(key);give(s,object.item);return {notice:'拾起了'+ITEMS[object.item].name};}
 if(object.type==='cache'||object.type==='secret'){
  if(s.found.includes(key))throw Error('已经收好里面的东西了');if(object.type==='secret'&&!s.flags[key])throw Error('石缝里似乎藏着什么气息……');
  s.found.push(key);give(s,object.item,object.item==='token'?30:1);if(object.item==='parcel')s.flags.parcelFound=true;return {notice:'发现 · '+ITEMS[object.item].name,reward:true};
 }
 return {menu:object.type};
}
export function useSkill(s,events=[]){const id=s.skill,r=SKILLS[id],p=s.player;if(!s.skills.includes(id))return events.push({message:'先向米拉学习踏风'});if(p.cooldowns[id]>0||p.dash>0||p.hurt>.6)return;if(s.stamina<r.cost)return events.push({message:'稍等一下，气息还没恢复'});s.stamina-=r.cost;p.cooldowns[id]=r.cooldown;
 if(id==='wind'){p.dash=.2;p.vy=Math.max(p.vy,1.3);events.push({kind:'wind',x:p.x,z:p.z,y:p.y});}
 if(id==='water'){p.ward=2;events.push({kind:'water',x:p.x,z:p.z,y:p.y});}
 if(id==='echo'){for(const o of SCENES[s.scene].objects)if(o.type==='secret'&&Math.hypot(o.x-p.x,o.z-p.z)<8)s.flags[s.scene+':'+o.id]=true;events.push({kind:'echo',x:p.x,z:p.z,y:p.y});}
}
export function attack(s,events=[]){const p=s.player;if(p.attack>0){p.attackBuffer=.18;return;}if(p.dash>0||p.hurt>.6)return;p.attackBuffer=0;p.combo=p.comboWindow>0?(p.combo+1)%3:0;p.attack=.26+p.combo*.055;p.comboWindow=.75;p.hitIssued=false;events.push({kind:'swing',combo:p.combo});}
export function enemiesFor(s){return (SCENES[s.scene].enemies||[]).filter(e=>!s.defeated.includes(s.scene+':'+e.id)).map(e=>({...e,hp:42,phase:'idle',timer:0,hurt:0,vx:0,vz:0,hit:false}));}
function damage(s,amount,events){const p=s.player;if(p.hurt>0||p.dash>0)return;if(p.ward>0){p.ward=0;events.push({kind:'block',message:'潮幕挡住了冲击'});return;}s.hp=Math.max(0,s.hp-amount);p.hurt=.85;events.push({kind:'hurt',message:'受到 '+amount+' 点冲击'});if(!s.hp)recover(s,events);}
function recover(s,events){s.hp=Math.max(55,s.hp);Object.assign(s.player,{x:s.respawn.x,z:s.respawn.z,y:floorAt(SCENES[s.scene],s.respawn.x,s.respawn.z),vy:0,vx:0,vz:0,dash:0,hurt:1,grounded:true});events.push({kind:'recover',message:'回到安全落脚处 · 随身物品保留'});}
export function update(s,input,dt,enemies=[]){
 dt=clamp(finite(dt),0,1/30);const events=[],p=s.player,scene=SCENES[s.scene];
 p.hurt=Math.max(0,p.hurt-dt);p.land=Math.max(0,p.land-dt);p.attackBuffer=Math.max(0,(p.attackBuffer||0)-dt);p.comboWindow=Math.max(0,p.comboWindow-dt);p.ward=Math.max(0,p.ward-dt);for(const k of Object.keys(p.cooldowns))p.cooldowns[k]=Math.max(0,p.cooldowns[k]-dt);
 if(input.jump)p.jumpBuffer=.13;else p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);p.coyote=p.grounded ? .11 : Math.max(0,p.coyote-dt);
 if(p.jumpBuffer>0&&p.coyote>0){p.vy=8.1;p.grounded=false;p.coyote=0;p.jumpBuffer=0;events.push({kind:'jump'});}if(input.jumpReleased&&p.vy>3)p.vy*=.55;
 let x=finite(input.x),z=finite(input.z),length=Math.hypot(x,z);if(length>1){x/=length;z/=length;length=1;}if(length>.12){p.faceX=x/length;p.faceZ=z/length;}
 if(input.attack)attack(s,events);if(input.skill)useSkill(s,events);
 const speed=p.dash>0?15.5:input.run?6.3:3.9,slow=p.attack>0?.38:1;
 const wantedX=p.dash>0?p.faceX*speed:x*speed*slow,wantedZ=p.dash>0?p.faceZ*speed:z*speed*slow;
 const smoothing=p.grounded?Math.min(1,dt*20):Math.min(1,dt*11);p.vx+=(wantedX-p.vx)*smoothing;p.vz+=(wantedZ-p.vz)*smoothing;
 if(p.dash>0){p.vx=wantedX;p.vz=wantedZ;}p.dash=Math.max(0,p.dash-dt);
 const nx=clamp(p.x+p.vx*dt,-1,scene.bounds.w+1),nz=clamp(p.z+p.vz*dt,-1,scene.bounds.d+1);
 if(!collides(scene,nx,p.z,p.y))p.x=nx;else p.vx=0;if(!collides(scene,p.x,nz,p.y))p.z=nz;else p.vz=0;
 const oldY=p.y;p.vy-=21*dt;p.y+=p.vy*dt;const ground=floorAt(scene,p.x,p.z,oldY+.3);
 if(p.vy<=0&&Number.isFinite(ground)&&p.y<=ground&&oldY>=ground-.3){if(!p.grounded&&p.vy<-4){p.land=.12;events.push({kind:'land'});}p.y=ground;p.vy=0;p.grounded=true;}else p.grounded=false;
 if(p.y<-5)recover(s,events);
 s.stamina=Math.min(100,s.stamina+dt*(p.dash>0?0:15));s.minute=Math.min(1320,s.minute+dt*.6);
 if(p.attack>0){p.attack=Math.max(0,p.attack-dt);if(p.attack===0&&p.attackBuffer>0)attack(s,events);if(!p.hitIssued&&p.attack<.17){p.hitIssued=true;for(const o of scene.objects){if(o.type==='dummy'&&Math.hypot(o.x-p.x,o.z-p.z)<2.3&&p.y<1.5&&(o.x-p.x)*p.faceX+(o.z-p.z)*p.faceZ>-.1)events.push({kind:'hit',x:o.x,z:o.z,dummy:true});}for(const e of enemies){const dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz);if(e.hp>0&&d<2.05+p.combo*.15&&p.y<1.6&&(dx*p.faceX+dz*p.faceZ)>-.15){e.hp-=14+p.combo*6;e.hurt=.32;e.phase='stagger';e.timer=.38;e.x+=p.faceX*.35;e.z+=p.faceZ*.35;events.push({kind:'hit',x:e.x,z:e.z,amount:14+p.combo*6});if(e.hp<=0){const key=s.scene+':'+e.id;if(!s.defeated.includes(key)){s.defeated.push(key);give(s,'token',12);}events.push({kind:'defeat',message:'逸散能量平息了 · +12 代币'});}}}}}
 for(const e of enemies){if(e.hp<=0)continue;e.timer=Math.max(0,e.timer-dt);e.hurt=Math.max(0,e.hurt-dt);const dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);
  if(e.phase==='stagger'){if(!e.timer)e.phase='idle';continue;}
  if(e.phase==='idle'&&d<6){if(d<2.7){e.phase='windup';e.timer=.6;e.vx=dx/Math.max(.01,d);e.vz=dz/Math.max(.01,d);e.hit=false;}else{const xx=e.x+dx/d*1.4*dt,zz=e.z+dz/d*1.4*dt;if(floorAt(scene,xx,zz)>-Infinity&&!collides(scene,xx,zz,0)){e.x=xx;e.z=zz;}}}
  else if(e.phase==='windup'&&!e.timer){e.phase='rush';e.timer=.3;}
  else if(e.phase==='rush'){const xx=e.x+e.vx*5.4*dt,zz=e.z+e.vz*5.4*dt;if(floorAt(scene,xx,zz)>-Infinity&&!collides(scene,xx,zz,0)){e.x=xx;e.z=zz;}if(!e.hit&&Math.hypot(p.x-e.x,p.z-e.z)<1.1&&p.y<.85){e.hit=true;damage(s,12,events);}if(!e.timer){e.phase='rest';e.timer=.8;}}
  else if(e.phase==='rest'&&!e.timer)e.phase='idle';
 }
 return events;
}
export function drink(s){if(!(s.inventory.tea>0))throw Error('还没有暖潮茶');s.inventory.tea--;s.hp=Math.min(100,s.hp+30);s.stamina=100;return '暖潮茶 · 恢复 30 生命与全部气息';}
export function craftTea(s){if((s.inventory.herb||0)<2)throw Error('需要 2 份海岸香草');s.inventory.herb-=2;give(s,'tea');return '做好了暖潮茶';}
export function rest(s){s.day++;s.minute=540;s.hp=100;s.stamina=100;s.gathered=[];s.talked=[];if(s.garden.planted&&s.garden.watered)s.garden.age++;s.garden.watered=false;return '睡到新的一天';}
export function tendGarden(s){const g=s.garden;if(!g.planted){g.planted=s.day;g.age=0;g.watered=false;return '种下了小花';}if(g.age>=2){give(s,'flower',3);g.planted=0;g.age=0;return '收获了 3 朵院落小花';}if(g.watered)return '花圃已经浇过水';g.watered=true;return '替小花浇过水了';}

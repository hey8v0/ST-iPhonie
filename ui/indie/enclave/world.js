// Playable neighborhoods use local metres. They are not continent latitude/longitude.
const floor=(x,z,w,d,h=0)=>({x,z,w,d,h});
export const SCENES={
 whalebay:{name:'鲸湾 · 灯街',region:'沿海环带',kind:'town',spawn:{x:16,z:15},bounds:{w:40,d:31},
  floors:[floor(0,0,38,25),floor(26,24,5,7)],
  solids:[{id:'home',x:6,z:5,w:5,d:4,h:4.5},{id:'shop',x:21,z:5,w:5,d:4,h:4.4},{id:'workshop',x:29,z:13,w:4.6,d:3.6,h:4.1},{id:'hall',x:11,z:19,w:5.8,d:3.7,h:4.8},{id:'crate',x:23,z:12,w:1.2,d:1,h:.65}],
  platforms:[floor(21,12,1.1,1,.7),floor(22.8,12,1.4,1.2,1.35)],
  objects:[{id:'mira',type:'person',name:'米拉',role:'居民向导',x:17,z:10},{id:'lan',type:'person',name:'阿岚',role:'港岸摆渡人',x:28.5,z:23.5},{id:'home',type:'home',name:'海风阁楼',x:8.5,z:10.4},{id:'shop',type:'shop',name:'灯街杂货',x:23.5,z:10.3},{id:'workshop',type:'workshop',name:'岸边工坊',x:31.3,z:17.8},{id:'board',type:'board',name:'社区公告',x:14,z:17},{id:'garden',type:'garden',name:'院落花圃',x:5,z:15},{id:'ferry',type:'travel',name:'前往听潮岸',x:36,z:14,to:'coast'},{id:'dummy',type:'dummy',name:'训练木偶',x:24,z:15},{id:'herb-a',type:'gather',item:'herb',name:'海岸香草',x:4,z:20},{id:'wood-a',type:'gather',item:'wood',name:'漂流木',x:33,z:21},{id:'perch-a',type:'cache',name:'阁楼边的旧盒',x:23.4,z:12.5,y:1.35,item:'token'}],
 },
 coast:{name:'听潮岸',region:'鲸湾近郊 · 已登记步道',kind:'coast',spawn:{x:5,z:10},bounds:{w:44,d:34},
  floors:[floor(0,0,18,31),floor(22,0,20,18),floor(26,22,16,10)],
  platforms:[floor(6,17,5,3,.65),floor(6,22,5,4,1.45),floor(30,4,5,3,.8),floor(34,25,4,4,1.1)],
  solids:[{id:'rock-a',x:11,z:8,w:2,d:2,h:1.05},{id:'rock-b',x:25,z:12,w:2,d:1.5,h:.7}],
  objects:[{id:'back',type:'travel',name:'返回鲸湾',x:2,z:10,to:'whalebay'},{id:'beacon-a',type:'beacon',name:'西风灯',x:8.4,z:24,y:1.45},{id:'beacon-b',type:'beacon',name:'潮声灯',x:32,z:5.5,y:.8},{id:'beacon-c',type:'beacon',name:'归航灯',x:35.8,z:27,y:1.1},{id:'ruins',type:'travel',name:'回声庭院',x:39,z:8,to:'garden'},{id:'herb-b',type:'gather',item:'herb',name:'海岸香草',x:8,z:13},{id:'shell-a',type:'gather',item:'shell',name:'月白贝',x:14,z:27},{id:'wood-b',type:'gather',item:'wood',name:'漂流木',x:27,z:15},{id:'secret-coast',type:'secret',name:'潮隙中的匣子',x:29,z:27,item:'charm'}],
 },
 garden:{name:'回声庭院',region:'鲸湾近郊 · 灰区勘察点',kind:'ruins',spawn:{x:5,z:8},bounds:{w:31,d:29},
  floors:[floor(0,0,29,27)],platforms:[floor(9,17,4,3,.7),floor(14,20,4,4,1.5),floor(22,7,5,5,1.6)],
  solids:[{id:'pillar-a',x:11,z:7,w:1.2,d:1.2,h:3.1},{id:'pillar-b',x:19,z:15,w:1.2,d:1.2,h:3.5},{id:'wall-a',x:1,z:18,w:5,d:1,h:2.5}],
  objects:[{id:'back',type:'travel',name:'返回听潮岸',x:2,z:8,to:'coast'},{id:'construct',type:'person',name:'拾音',role:'庭院维护构造体',x:21,z:22},{id:'parcel',type:'secret',name:'遗落的航运记录',x:24.5,z:9.5,y:1.6,item:'parcel'},{id:'secret-garden',type:'secret',name:'古石缝里的匣子',x:16,z:21.5,y:1.5,item:'relic'},{id:'herb-c',type:'gather',item:'herb',name:'荧光香草',x:7,z:23}],
  enemies:[{id:'rift-a',x:15,z:10},{id:'rift-b',x:23,z:17},{id:'rift-c',x:12,z:21}],
 },
};
export const TREES={whalebay:[[1,3],[2,8],[35,3],[34,7],[2,23],[35,22],[19,23],[18,2]],coast:[[2,3],[14,3],[3,27],[15,28],[25,2],[38,3],[39,15],[28,30],[40,30]],garden:[[2,2],[26,2],[3,24],[26,24],[23,4],[5,17]]};
export const ITEMS={herb:{name:'海岸香草',value:6},wood:{name:'漂流木',value:7},shell:{name:'月白贝',value:12},tea:{name:'暖潮茶',value:22},flower:{name:'院落小花',value:15},charm:{name:'潮纹护符',value:60},relic:{name:'残响石片',value:45},parcel:{name:'遗落的航运记录',value:0},token:{name:'通用代币',value:1}};
export const SKILLS={wind:{name:'踏风',cost:22,cooldown:1.1,description:'朝移动方向冲刺，空中也能使用'},echo:{name:'回声',cost:14,cooldown:3,description:'感知附近隐藏物与能量团'},water:{name:'潮幕',cost:20,cooldown:5,description:'抵挡下一次伤害'}};
export const DESTINATIONS=[{id:'whalebay',name:'鲸湾',region:'沿海环带',open:true},{id:'qiming',name:'启明港',region:'半岛区',open:false},{id:'deepbay',name:'深湾港',region:'沿海环带',open:false},{id:'waterhall',name:'千垸城',region:'中央盆地',open:false},{id:'frostmoon',name:'霜月港',region:'沿海环带',open:false}];
export const inside=(r,x,z,margin=0)=>x>=r.x-margin&&x<=r.x+r.w+margin&&z>=r.z-margin&&z<=r.z+r.d+margin;
export function floorAt(scene,x,z,ceiling=Infinity){let height=-Infinity;for(const r of [...scene.floors,...(scene.platforms||[])])if(inside(r,x,z)&&r.h<=ceiling)height=Math.max(height,r.h);return height;}
export function collides(scene,x,z,y){return (TREES[Object.keys(SCENES).find(id=>SCENES[id]===scene)]||[]).some(([tx,tz])=>Math.hypot(x-tx,z-tz)<.48&&y<2.5)||(scene.solids||[]).some(r=>inside(r,x,z,.24)&&y<r.h-.04)||[...(scene.platforms||[])].some(r=>inside(r,x,z,.18)&&r.h>y+.3);}
export function findPath(scene,start,end){const step=.75,sx=Math.round(start.x/step),sz=Math.round(start.z/step),ex=Math.round(end.x/step),ez=Math.round(end.z/step),queue=[[sx,sz]],previous=new Map([[sx+','+sz,null]]);let goal=null;
 for(let cursor=0;cursor<queue.length&&cursor<4000;cursor++){const [x,z]=queue[cursor];if(Math.hypot(x*step-end.x,z*step-end.z)<1){goal=[x,z];break;}for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,key=xx+','+zz;if(previous.has(key)||xx<0||zz<0||xx*step>scene.bounds.w||zz*step>scene.bounds.d)continue;const y=floorAt(scene,xx*step,zz*step,.3);if(!Number.isFinite(y)||collides(scene,xx*step,zz*step,y))continue;previous.set(key,[x,z]);queue.push([xx,zz]);}}
 if(!goal)return [];const result=[];while(goal&&(goal[0]!==sx||goal[1]!==sz)){result.unshift({x:goal[0]*step,z:goal[1]*step});goal=previous.get(goal.join(','));}return result;
}

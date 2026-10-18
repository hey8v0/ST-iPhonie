import {WORLD,passable,PLACES,DOCKS} from './model.js';

// A bounded search on the current tide. All returned segments stay on the same
// walkable surface; steering with keys or the stick always takes precedence.
const CELL=20, COLS=Math.ceil(WORLD.w/CELL), ROWS=Math.ceil(WORLD.h/CELL);
export function clearSegment(s,a,b){
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/4));
 for(let i=0;i<=steps;i++)if(!passable(s,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
 return true;
}
export function planRoute(s,goal){
 if(!Number.isFinite(goal?.x)||!Number.isFinite(goal?.y)||!passable(s,goal.x,goal.y))return [];
 const start={x:s.x,y:s.y};if(clearSegment(s,start,goal))return [goal];
 const point=id=>({x:(id%COLS)*CELL+CELL/2,y:Math.floor(id/COLS)*CELL+CELL/2});
 const closest=p=>{let found=-1,best=Infinity;const cx=Math.floor(p.x/CELL),cy=Math.floor(p.y/CELL);
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=COLS||y>=ROWS)continue;const id=y*COLS+x,q=point(id),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best&&clearSegment(s,p,q)){best=d;found=id;}}return found;};
 const first=closest(start),last=closest(goal);if(first<0||last<0)return [];
 const prev=new Int32Array(COLS*ROWS).fill(-2),queue=new Int32Array(prev.length);let head=0,tail=1;queue[0]=first;prev[first]=-1;
 while(head<tail&&prev[last]===-2){const id=queue[head++],x=id%COLS,y=Math.floor(id/COLS),a=point(id);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;const n=ny*COLS+nx;if(prev[n]!==-2||!clearSegment(s,a,point(n)))continue;prev[n]=id;queue[tail++]=n;}
 }
 if(prev[last]===-2)return [];
 const raw=[goal];for(let id=last;id!==-1;id=prev[id])raw.push(point(id));raw.push(start);raw.reverse();
 const result=[];let from=0;
 while(from<raw.length-1){let to=raw.length-1;while(to>from+1&&!clearSegment(s,raw[from],raw[to]))to--;result.push(raw[to]);from=to;}
 return result;
}

// Click a visible object to approach its ground contact point and interact.
export function destinationAt(s,point){
 const spots=PLACES.filter(p=>!!p.boat===(s.mode==='boat')&&!(['shell','bottle'].includes(p.id)&&s.flags[p.id]));
 if(s.mode==='boat')spots.push(...DOCKS.map(d=>({id:'dock:'+d.id,x:d.water[0],y:d.water[1],label:d.name})));
 else{const d=DOCKS.find(d=>d.id===s.dock);spots.push({id:'boat',x:d.land[0],y:d.land[1],label:'邮差的小船'});}
 return spots.filter(p=>Math.hypot(p.x-point.x,p.y-point.y)<(p.id.startsWith('dock:')?42:30)||(p.id==='lighthouse'&&Math.abs(point.x-p.x)<32&&point.y>p.y-185&&point.y<p.y)||(p.id==='office'&&Math.abs(point.x-p.x)<63&&point.y>p.y-90&&point.y<p.y)).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]||null;
}

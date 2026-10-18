import {ISLANDS,PATHS,DOCKS,WORLD,tideAt} from './model.js';
const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
export function createPainter(canvas) {
 const g=canvas.getContext('2d',{alpha:false}),win=canvas.ownerDocument.defaultView,rng=random(11897);
 const waves=Array.from({length:760},()=>({x:rng()*WORLD.w,y:rng()*WORLD.h,w:8+rng()*27,p:rng()*TAU}));
 const flecks=Array.from({length:170},()=>({x:rng()*WORLD.w,y:rng()*WORLD.h,w:1+rng()*3,p:rng()*TAU}));
 const trees=[];
 for(const island of ISLANDS.filter(i=>i.id!=='office'))for(let j=0;j<(island.id==='egret'?55:12);j++){const a=rng()*TAU,r=Math.sqrt(rng())*.77,x=island.x+Math.cos(a)*island.rx*r,y=island.y+Math.sin(a)*island.ry*r;if((island.id==='egret'&&Math.hypot(x-1460,y-870)<125)||Math.hypot(x-1750,y-475)<60||Math.hypot(x-520,y-1190)<65)continue;trees.push({x,y,size:15+rng()*15,tall:rng()>.64,shade:rng()});}
 const rocks=ISLANDS.flatMap(i=>Array.from({length:24},()=>{const a=rng()*TAU,r=.89+rng()*.24;return{x:i.x+Math.cos(a)*i.rx*r,y:i.y+Math.sin(a)*i.ry*r,w:4+rng()*11,h:3+rng()*8};}));
 const paper=canvas.ownerDocument.createElement('canvas');paper.width=paper.height=160;const pg=paper.getContext('2d'),pixels=pg.createImageData(160,160);for(let i=0;i<pixels.data.length;i+=4){const n=rng()*255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=n;pixels.data[i+3]=16;}pg.putImageData(pixels,0,0);
 const grain=g.createPattern(paper,'repeat');let width=1280,height=720,dpr=1,view={x:650,y:1250,zoom:1},time=0;
 const cameraScale=()=>Math.min(width/1080,height/540);
 function resize(){const box=canvas.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);dpr=Math.min(1.75,win.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 function ellipse(x,y,rx,ry,color){g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fillStyle=color;g.fill();}
 function line(points,color,size=2){g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=size;g.lineCap='round';g.lineJoin='round';g.stroke();}
 function label(text,x,y,size=14,color='#faf0d2'){g.fillStyle=color;g.font=`${size}px "Songti SC",serif`;g.textAlign='center';g.fillText(text,x,y);}
 function crown(x,y,rx,ry,color,seed){
  const points=[];for(let j=0;j<12;j++){const a=j/12*TAU,r=1+.09*Math.sin(j*2.3+seed);points.push([x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r]);}
  g.beginPath();const last=points.at(-1);g.moveTo((last[0]+points[0][0])/2,(last[1]+points[0][1])/2);
  for(let j=0;j<12;j++){const p=points[j],n=points[(j+1)%12];g.quadraticCurveTo(p[0],p[1],(p[0]+n[0])/2,(p[1]+n[1])/2);}g.fillStyle=color;g.fill();
 }
 function tree(t){
  g.save();g.translate(t.x,t.y);ellipse(9,5,t.size*.75,t.size*.25,'#254c4826');
  line([[0,0],[-2,-t.size*1.7]],'#77734e',3);
  if(t.tall){g.fillStyle='#496e58';g.beginPath();g.moveTo(-2,-t.size*2.65);g.bezierCurveTo(-t.size,-t.size*1.25,-t.size*.5,-t.size*.35,0,-t.size*.15);g.bezierCurveTo(t.size*.65,-t.size*.6,t.size*.5,-t.size*1.65,-2,-t.size*2.65);g.fill();line([[-2,-t.size*2.1],[0,-t.size*.5]],'#94a27677',1.2);}
  else{crown(0,-t.size*1.15,t.size,t.size*.93,'#54775a',t.shade*7);crown(-t.size*.2,-t.size*1.42,t.size*.87,t.size*.8,t.shade>.5?'#849b6b':'#769368',t.shade*9);crown(-t.size*.38,-t.size*1.65,t.size*.48,t.size*.45,'#a3b282',t.shade*5);line([[-5,-t.size*.65],[-9,-t.size*1.02]],'#b5bd9055',1.3);line([[7,-t.size*1.15],[11,-t.size*1.43]],'#c4ca9955',1.3);}
  g.restore();
 }
 function building(x,y,type='house'){
  g.save();g.translate(x,y);const office=type==='office';ellipse(12,7,70,19,'#31554c29');
  g.fillStyle='#b6b89a';g.beginPath();g.moveTo(46,0);g.lineTo(61,-13);g.lineTo(61,-52);g.lineTo(46,-43);g.fill();
  g.fillStyle='#e5d9b4';g.fillRect(-48,-45,94,45);g.fillStyle='#f1e6c7';g.beginPath();g.moveTo(-48,-45);g.lineTo(-4,-79);g.lineTo(46,-45);g.fill();
  g.fillStyle=office?'#406e6b':'#6d8370';g.beginPath();g.moveTo(-60,-43);g.lineTo(-5,-87);g.lineTo(62,-52);g.lineTo(51,-42);g.lineTo(-5,-75);g.lineTo(-49,-40);g.fill();
  line([[-60,-43],[-5,-87],[62,-52]],'#a6b496',2.3);line([[-47,-40],[47,-40]],'#b6aa8244',2);
  for(let j=0;j<5;j++)line([[j*10-3,-80+j*5],[j*10+8,-73+j*5]],'#b3c19f44',1.3);
  g.fillStyle='#adab8d';g.fillRect(29,-86,12,21);g.fillStyle='#d7ceac';g.fillRect(27,-88,17,5);
  g.fillStyle='#47736d';g.fillRect(-12,-31,23,31);g.fillStyle='#cba975';g.fillRect(-9,-28,17,28);ellipse(4,-14,1.4,1.4,'#f5e0aa');
  for(const wx of [-34,25]){g.fillStyle='#416d68';g.fillRect(wx,-29,15,18);line([[wx+7.5,-28],[wx+7.5,-12]],'#e6d6ae',1.7);line([[wx,-20],[wx+15,-20]],'#e6d6ae',1.7);line([[wx-2,-10],[wx+17,-10]],'#c5b88e',2.5);}
  line([[-17,2],[17,2]],'#c9bd98',5);line([[-22,6],[22,6]],'#ded3ae',4);
  g.fillStyle='#bb8061';g.fillRect(office?17:-44,-4,12,9);line([[office?23:-38,-5],[office?20:-40,-15]],'#6d8a61',2);line([[office?23:-38,-5],[office?27:-33,-12]],'#8da473',2);
  if(office){g.fillStyle='#d9cba5';g.fillRect(-34,-49,68,15);label('白 鹭 邮 局',0,-38,8,'#43665d');g.fillStyle='#b97d5f';g.fillRect(-21,-18,7,10);line([[-20,-14],[-15,-14]],'#ecd9a9',1);line([[66,0],[66,-60]],'#847753',2.5);g.fillStyle='#c78c6d';g.beginPath();g.moveTo(67,-58);g.quadraticCurveTo(80,-62+Math.sin(time*2)*4,91,-53+Math.sin(time*2)*3);g.lineTo(67,-43);g.fill();}
  else{g.fillStyle='#a49673';g.fillRect(-56,-4,11,7);line([[-56,-1],[-45,-1]],'#d5c7a2',1);}
  g.restore();
 }
 function lighthouse(lit){g.save();g.translate(1750,475);ellipse(24,4,55,18,'#31554c38');g.fillStyle='#bdbca3';g.beginPath();g.moveTo(-24,2);g.lineTo(-16,-116);g.lineTo(16,-116);g.lineTo(24,2);g.fill();g.fillStyle='#f4e8bd';g.beginPath();g.moveTo(-24,2);g.lineTo(-16,-116);g.lineTo(3,-116);g.lineTo(6,2);g.fill();g.fillStyle='#bd8b70';g.beginPath();g.moveTo(-19,-80);g.lineTo(19,-80);g.lineTo(20,-68);g.lineTo(-20,-68);g.fill();line([[-22,-38],[22,-38]],'#a9aa8a66',1);g.fillStyle='#638482';g.fillRect(-7,-30,14,32);g.fillStyle='#324f52';g.fillRect(-2,-83,6,14);g.fillRect(-1,-57,6,11);g.fillStyle=lit?'#f4d592':'#597778';g.fillRect(-20,-141,40,29);g.fillStyle='#4c6a65';g.fillRect(-25,-146,50,6);g.beginPath();g.moveTo(-27,-146);g.lineTo(0,-168);g.lineTo(27,-146);g.fill();line([[-28,-110],[28,-110]],'#3b6363',4);for(let i=-2;i<=2;i++)line([[i*12,-113],[i*12,-125]],'#426767',1.4);line([[-28,-125],[28,-125]],'#426767',2);line([[0,-168],[0,-183]],'#597471',2);if(lit){const glow=g.createRadialGradient(0,-127,2,0,-127,49);glow.addColorStop(0,'#ffe6a499');glow.addColorStop(1,'#ffe6a400');g.fillStyle=glow;g.fillRect(-50,-177,100,100);}g.restore();}
 function person(x,y,angle,walking=false,coat='#cc785a',hat=true){g.save();g.translate(x,y);ellipse(3,4,12,5,'#294b483b');const stride=walking?Math.sin(time*13)*4:0;line([[-4,1],[-4+stride,8]],'#314f50',3);line([[4,1],[4-stride,8]],'#314f50',3);g.fillStyle=coat;g.beginPath();g.moveTo(-5,-19);g.quadraticCurveTo(-12,-10,-9,1);g.quadraticCurveTo(0,5,9,1);g.quadraticCurveTo(12,-10,5,-19);g.fill();line([[7,-15],[10,-5+stride/2]],'#ddb18b',3);ellipse(0,-22,7,8,'#e4bc93');if(hat){ellipse(0,-27,12,3,'#dbb779');ellipse(0,-29,7,4,'#e6c387');}else{ellipse(0,-27,8,5,'#d0d1b6');}g.fillStyle='#795f42';g.fillRect(-6,-13,10,8);line([[-7,-17],[6,-4]],'#edd2a0',1.8);g.restore();}
 function boat(x,y,angle,occupied,velocity){
  g.save();g.translate(x,y+Math.sin(time*2.1)*1.5);g.rotate(angle);
  if(velocity>6){for(let j=0;j<3;j++){g.beginPath();g.ellipse(-22-j*12,0,12+j*7,11+j*4,0,Math.PI*.35,Math.PI*1.65);g.strokeStyle=`rgba(214,237,214,${.28-j*.07})`;g.lineWidth=1.5;g.stroke();}}
  ellipse(3,4,33,14,'#073b4d3b');
  g.fillStyle='#725a40';g.beginPath();g.moveTo(34,0);g.bezierCurveTo(12,-20,-28,-17,-30,0);g.bezierCurveTo(-28,17,12,20,34,0);g.fill();g.fillStyle='#bd9462';g.beginPath();g.moveTo(29,0);g.bezierCurveTo(10,-14,-24,-12,-25,0);g.bezierCurveTo(-24,12,10,14,29,0);g.fill();for(let j=-2;j<=2;j++)line([[-20,j*4],[20-Math.abs(j)*3,j*4]],'#e0be8c88',1);line([[-15,-11],[-15,11]],'#736548',4);line([[10,-10],[10,10]],'#736548',4);
  g.fillStyle='#d9ccaa';g.fillRect(-23,-7,12,13);g.fillStyle='#f2e6c4';g.fillRect(-22,-6,11,7);line([[-22,-6],[-16.5,-2],[-11,-6]],'#b49a72',.8);
  g.save();g.rotate(-angle);if(occupied)person(-3,-3,angle,false,'#c77b5a');line([[13,-4],[13,-42]],'#655c3c',2);line([[13,-42],[23,-35]],'#655c3c',2);const glow=g.createRadialGradient(23,-32,1,23,-32,15);glow.addColorStop(0,'#ffdf9566');glow.addColorStop(1,'#ffdf9500');g.fillStyle=glow;g.fillRect(7,-48,32,32);ellipse(23,-32,3,5,'#f1d18b');g.restore();g.restore();
 }

 function dock(d){g.save();const [x,y]=d.land,[bx,by]=d.water,a=Math.atan2(by-y,bx-x),len=Math.hypot(bx-x,by-y);g.translate(x,y);g.rotate(a);g.fillStyle='#2b514b33';g.fillRect(6,-15,len+12,34);g.fillStyle='#a98c60';g.fillRect(0,-13,len+9,26);for(let i=0;i<len;i+=9)line([[i,-12],[i,12]],'#ddc394',2);for(const v of [12,len-8])for(const sign of [-1,1]){ellipse(v,sign*18,4,4,'#584e3b');line([[v,sign*18],[v,sign*18-9]],'#a58a5f',4);}g.restore();}
 function draw(s,dt,{target=null,near=null,menu=false,postcard=false}={}) {
  time+=dt;
  if(postcard){view.zoom=Math.max(width/WORLD.w,height/WORLD.h)*1.08;view.x=1260;view.y=790;}
  else{const desired=s.mode==='boat'?.88:1.12,scale=cameraScale();view.zoom+=(Math.max(desired*scale,width/WORLD.w,height/WORLD.h)-view.zoom)*Math.min(1,dt*2.5);const vw=width/view.zoom,vh=height/view.zoom;view.x+=(clamp(s.x,vw/2,WORLD.w-vw/2)-view.x)*Math.min(1,dt*4);view.y+=(clamp(s.y,vh/2,WORLD.h-vh/2)-view.y)*Math.min(1,dt*4);}
  const vw=width/view.zoom,vh=height/view.zoom;
  g.setTransform(dpr,0,0,dpr,0,0);const bg=g.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#2c717b');bg.addColorStop(.52,'#245e6e');bg.addColorStop(1,'#184b60');g.fillStyle=bg;g.fillRect(0,0,width,height);
  g.save();g.translate(width/2,height/2);g.scale(view.zoom,view.zoom);g.translate(-view.x,-view.y);
  const tide=tideAt(s.clock),visible=(x,y,pad=80)=>Math.abs(x-view.x)<vw/2+pad&&Math.abs(y-view.y)<vh/2+pad;
  for(const w of waves){if(!visible(w.x,w.y,40))continue;const x=w.x+Math.sin(time*.4+w.p)*9,y=w.y+Math.cos(time*.24+w.p)*3;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+w.w/2,y-2+Math.sin(time+w.p),x+w.w,y);g.strokeStyle=`rgba(183,217,204,${.10+.08*Math.sin(time*.6+w.p)})`;g.lineWidth=1;g.stroke();}
  for(const i of ISLANDS){const flooded=i.level>=0&&tide>=i.level;for(let k=5;k>=1;k--)ellipse(i.x,i.y+5,i.rx+k*14,i.ry+k*12,`rgba(99,167,151,${.025+(6-k)*.008})`);if(flooded){ellipse(i.x,i.y,i.rx,i.ry,'#79ad9270');ellipse(i.x,i.y,i.rx*.8,i.ry*.8,'#a3b59132');continue;}ellipse(i.x+4,i.y+18,i.rx+2,i.ry+1,'#988f71');ellipse(i.x,i.y+8,i.rx+6,i.ry+6,'#d3c3a0');ellipse(i.x,i.y,i.rx,i.ry,'#ece0b8');ellipse(i.x-4,i.y-8,i.rx*.91,i.ry*.86,'#c0c79b');ellipse(i.x-17,i.y-15,i.rx*.78,i.ry*.73,'#b0bd8d');ellipse(i.x-33,i.y-21,i.rx*.56,i.ry*.58,'#a8b884');g.beginPath();g.ellipse(i.x,i.y+1,i.rx+11+Math.sin(time)*2,i.ry+10,0,0,TAU);g.strokeStyle='#eaf0d6aa';g.lineWidth=2;g.stroke();g.beginPath();g.ellipse(i.x,i.y+1,i.rx+18+Math.sin(time+1)*3,i.ry+16,0,.15,Math.PI*.9);g.strokeStyle='#eaf0d63a';g.stroke();}
  for(const p of PATHS){const flooded=tide>=p.level;line([p.a,p.b],flooded?'#a6c4a342':'#c8c39f',p.width);const len=Math.hypot(p.b[0]-p.a[0],p.b[1]-p.a[1]);for(let j=0;j<len;j+=20){const t=j/len,x=p.a[0]+(p.b[0]-p.a[0])*t,y=p.a[1]+(p.b[1]-p.a[1])*t;ellipse(x,y,8,6,flooded?'#c3d2b533':'#ede3bb');}}
  for(const r of rocks)if(visible(r.x,r.y)) {ellipse(r.x+2,r.y+3,r.w,r.h,'#425f5b33');ellipse(r.x,r.y,r.w,r.h,'#a2aa8a');ellipse(r.x-r.w*.2,r.y-r.h*.3,r.w*.65,r.h*.52,'#d3cfaa');}
  // Footpaths worn into the grass, and the docks.
  line([[1700,990],[1600,960],[1450,920],[1430,885]],'#dfd5ad',19);line([[1450,920],[1280,940]],'#dfd5ad',14);line([[1500,930],[1580,800],[1600,735]],'#dfd5ad',15);line([[1740,575],[1750,475]],'#ded4ac',15);DOCKS.forEach(dock);
  const actors=trees.map(t=>({y:t.y,draw:()=>tree(t)}));actors.push({y:1130,draw:()=>building(355,1130)},{y:850,draw:()=>building(1460,850)},{y:935,draw:()=>building(920,935,'office')},{y:475,draw:()=>lighthouse(s.flags.aligned)});
  actors.push({y:885,draw:()=>person(1430,885,0,false,'#8a9d90',false)});
  if(s.mode==='foot')actors.push({y:s.y,draw:()=>person(s.x,s.y,s.heading,Math.hypot(s.vx,s.vy)>8)});
  actors.push({y:s.mode==='boat'?s.y:s.boat.y,draw:()=>boat(s.mode==='boat'?s.x:s.boat.x,s.mode==='boat'?s.y:s.boat.y,s.mode==='boat'?s.heading:s.boat.heading,s.mode==='boat',s.mode==='boat'?Math.hypot(s.vx,s.vy):0)});
  actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
  // The tide bench, the fog bell and tiny things worth stopping for.
  g.fillStyle='#8c7753';g.fillRect(1538,954,36,10);g.fillStyle='#c7b68a';g.fillRect(1536,948,40,6);line([[1540,960],[1540,968]],'#5c6850',3);line([[1570,960],[1570,968]],'#5c6850',3);
  line([[1590,765],[1590,715],[1610,715]],'#8d815b',4);g.fillStyle='#bcac71';g.beginPath();g.moveTo(1603,717);g.quadraticCurveTo(1598,736,1596,737);g.lineTo(1619,737);g.quadraticCurveTo(1616,732,1615,718);g.fill();
  if(!s.flags.shell){ellipse(1310,1030,7,4,'#75ab91');line([[1305,1027],[1312,1025]],'#eaf0ce',2);}
  if(!s.flags.bottle){g.save();g.translate(815,1170+Math.sin(time*1.8)*3);g.rotate(.35);g.fillStyle='#c1d2a4';g.fillRect(-4,-8,8,17);g.fillStyle='#937b4c';g.fillRect(-2,-12,4,4);g.restore();}
  if(s.flags.aligned){g.save();g.translate(1750,348);g.rotate(time*.1);const beam=g.createLinearGradient(0,0,950,0);beam.addColorStop(0,'#f4e4b53d');beam.addColorStop(1,'#f4e4b500');g.fillStyle=beam;g.beginPath();g.moveTo(0,0);g.lineTo(950,-130);g.lineTo(950,130);g.fill();g.restore();}
  for(let j=0;j<7;j++){const x=1250+Math.sin(time*.035+j*.62)*650,y=650+Math.cos(time*.048+j*.53)*410,flap=Math.sin(time*3+j)*4;line([[x-7,y+flap],[x,y],[x+7,y+flap]],'#e8ead7aa',1.6);}
  for(const f of flecks)if(visible(f.x,f.y,20)){const alpha=Math.max(0,Math.sin(time*.7+f.p))*.27;ellipse(f.x,f.y,f.w,f.w*.45,`rgba(244,239,194,${alpha})`);}
  if(target&&!menu){g.beginPath();g.arc(target.x,target.y,10+Math.sin(time*4)*2,0,TAU);g.strokeStyle='#efe3bb88';g.lineWidth=1.3;g.stroke();}
  if(near&&!menu){const pulse=1+Math.sin(time*3)*.1;g.save();g.translate(near.x,near.y-49);g.scale(pulse,pulse);ellipse(0,0,7,7,'#f0d28e');ellipse(0,0,3,3,'#407171');g.restore();}
  // A low-opacity paper finish keeps the interactive world tactile.
  g.fillStyle=grain;g.globalAlpha=.35;g.fillRect(view.x-vw/2,view.y-vh/2,vw,vh);g.globalAlpha=1;g.restore();
  if(s.flags.delivered){g.fillStyle='#e3a96616';g.fillRect(0,0,width,height);}
 }
 function screenToWorld(x,y){return{x:(x-width/2)/view.zoom+view.x,y:(y-height/2)/view.zoom+view.y};}
 function chart(c,s){const cg=c.getContext('2d'),w=800,h=500;c.width=w;c.height=h;cg.fillStyle='#e6e4cc';cg.fillRect(0,0,w,h);const sx=w/WORLD.w,sy=h/WORLD.h;cg.save();cg.scale(sx,sy);cg.strokeStyle='#a4b7a044';cg.lineWidth=2;for(let x=0;x<WORLD.w;x+=240){cg.beginPath();cg.moveTo(x,0);cg.lineTo(x,WORLD.h);cg.stroke();}for(let y=0;y<WORLD.h;y+=200){cg.beginPath();cg.moveTo(0,y);cg.lineTo(WORLD.w,y);cg.stroke();}for(const p of PATHS){cg.beginPath();cg.moveTo(...p.a);cg.lineTo(...p.b);cg.setLineDash([15,15]);cg.strokeStyle='#9f9470';cg.lineWidth=8;cg.stroke();cg.setLineDash([]);}for(const i of ISLANDS){cg.beginPath();cg.ellipse(i.x,i.y,i.rx,i.ry,0,0,TAU);cg.fillStyle=i.level>=0?'#b9c3a0':'#91aa87';cg.fill();cg.strokeStyle='#6d8c74';cg.lineWidth=4;cg.stroke();}cg.restore();cg.font='15px "Songti SC",serif';cg.fillStyle='#4c6d61';cg.textAlign='center';for(const i of ISLANDS)cg.fillText(i.name,i.x*sx,(i.y+i.ry+45)*sy);cg.beginPath();cg.arc(s.x*sx,s.y*sy,6,0,TAU);cg.fillStyle='#bc7254';cg.fill();cg.beginPath();cg.arc(s.x*sx,s.y*sy,12,0,TAU);cg.strokeStyle='#bc725477';cg.lineWidth=2;cg.stroke();cg.font='28px serif';cg.fillStyle='#607b67';cg.fillText('N',w-40,45);cg.beginPath();cg.moveTo(w-40,55);cg.lineTo(w-40,88);cg.strokeStyle='#607b67';cg.stroke();}
 resize();return{draw,resize,screenToWorld,chart,snap(s){view.x=s.x;view.y=s.y;view.zoom=Math.max(cameraScale()*(s.mode==='boat'?.88:1.12),width/WORLD.w,height/WORLD.h);}};
}

// The title card and in-game world use exactly the same drawing functions.
export function renderTideCover(canvas){const painter=createPainter(canvas);painter.draw({mode:'boat',x:1040,y:1190,heading:-.5,vx:0,vy:0,boat:{x:1040,y:1190,heading:-.5},clock:135,flags:{aligned:true},pages:[]},.016,{menu:true,postcard:true});}

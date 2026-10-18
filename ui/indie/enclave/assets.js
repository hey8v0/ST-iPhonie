import * as T from '../vendor/three.module.min.js';
import {avatarCanvas} from './avatar.js';
export {wallTexture,roofTexture} from '../whalebay/art.js';
const hash=(a,b=0)=>{let n=Math.imul(a+131,374761393)^Math.imul(b+59,668265263);return (Math.imul(n^(n>>>13),1274126177)>>>0)/4294967296;};
const rect=(g,c,x,y,w,h)=>{g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
const poly=(g,c,ps)=>{g.fillStyle=c;g.beginPath();ps.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
export function canvasTexture(c){const t=new T.CanvasTexture(c);t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.generateMipmaps=false;t.colorSpace=T.SRGBColorSpace;return t;}
export function pixels(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingEnabled=false;fn(g,w,h);return canvasTexture(c);}
export function surfaceTexture(kind){return pixels(128,128,g=>{
 const colors=kind==='grass'?['#839b83','#92a58b','#748e77','#a1ae8d']:kind==='path'?['#93998b','#b4b5a0','#a2ab98','#c5c3a9']:kind==='wood'?['#826c50','#a18763','#715b47','#bea47b']:['#6b7e7b','#8fa19a','#5b706e','#b1b9a6'];rect(g,colors[0],0,0,128,128);
 if(kind==='path'||kind==='rock')for(let y=0;y<128;y+=kind==='path'?15:22)for(let x=-25;x<150;x+=27){const offset=Math.floor(y/15)%2*13;rect(g,colors[2],x+offset,y,26,14);rect(g,colors[Math.floor(hash(x,y)*2)],x+offset+1,y+1,24,12);rect(g,colors[3],x+offset+3,y+1,19,1);if(hash(x,y)>.65)rect(g,colors[2],x+offset+19,y+8,4,1);}
 else if(kind==='wood')for(let x=0;x<128;x+=16){rect(g,colors[2],x,0,1,128);rect(g,colors[1],x+1,0,14,128);for(let j=0;j<13;j++){const y=hash(x,j)*128;rect(g,colors[0],x+2+j%6,y,1,8);rect(g,colors[3],x+2,y,9,1);}}
 else for(let i=0;i<420;i++){const x=hash(i,1)*128,y=hash(i,2)*128;rect(g,colors[i%4],x,y,2+hash(i,3)*6,1+hash(i,4)*3);if(i%7===0){rect(g,'#607e68',x,y-3,1,4);rect(g,'#a6b49a',x+2,y-2,1,3);}}
 });}
export function treeTexture(variant=0){return pixels(256,320,g=>{
 const green=variant%3!==1,palette=green?['#253e3e','#35584e','#4b7560','#6c9371','#94b18a','#bed0a4']:['#694b60','#8e667e','#b4899d','#d8adbb','#e8c8cf','#f4ddd7'];
 poly(g,'#34423f',[[99,317],[111,257],[108,195],[91,151],[105,140],[128,184],[139,150],[155,147],[136,214],[138,278],[163,317]]);
 poly(g,'#725f49',[[111,313],[120,251],[117,198],[101,156],[107,155],[128,199],[126,268],[140,314]]);poly(g,'#a18b61',[[118,307],[125,252],[123,209],[129,225],[131,282],[137,312]]);
 poly(g,'#685b48',[[119,243],[62,199],[51,172],[61,168],[77,191],[121,220]]);poly(g,'#8d7755',[[128,231],[178,177],[194,156],[199,163],[181,190],[134,246]]);
 const masses=[[119,70,53],[71,111,49],[178,110,52],[125,143,69],[55,163,38],[198,165,36],[122,190,49]];
 for(let layer=0;layer<masses.length;layer++){const [cx,cy,r]=masses[layer];
  for(let y=-r;y<r;y+=3)for(let x=-r;x<r;x+=3){const xx=cx+x,yy=cy+y,n=hash(Math.floor(xx/10),Math.floor(yy/8)+variant*107);if(x*x/(r*r)+y*y/(r*r*.72)>1+(n-.5)*.1)continue;
   const lit=-y/r*.8-x/r*.3+Math.sin(xx*.075+yy*.055)*.27,band=Math.max(0,Math.min(5,Math.floor(1.5+lit+n*2)));rect(g,palette[band],xx,yy,4,3);
   if(n>.66){rect(g,palette[Math.min(5,band+1)],xx,yy,2,1);if(green)rect(g,palette[Math.max(0,band-1)],xx+2,yy+2,3,1);}
  }
 }
 // Visible branch notches and fine sprays, kept within the crown silhouette.
 for(let i=0;i<130;i++){const x=30+hash(i,11)*193,y=30+hash(i,12)*184;if(g.getImageData(x|0,y|0,1,1).data[3])rect(g,palette[i%4===0?5:3],x,y,3,1);}
 });}
export function objectTexture(kind){return pixels(64,80,g=>{
 if(kind==='herb'){for(let i=0;i<13;i++){const x=11+hash(i,1)*40,y=21+hash(i,2)*37;rect(g,'#456e59',x,y,2,70-y);poly(g,'#8ca887',[[x,y+8],[x-7,y+3],[x-8,y+7],[x,y+12]]);rect(g,i%3?'#bbccad':'#ded5a0',x-2,y-4,5,5);rect(g,'#f0e5b9',x,y-4,1,2);}}
 if(kind==='wood'){poly(g,'#4e5b50',[[5,57],[47,33],[60,43],[57,56],[17,74]]);poly(g,'#b49a70',[[6,55],[46,31],[58,41],[17,68]]);for(let i=0;i<7;i++)poly(g,i%2?'#d0b388':'#867654',[[9+i*4,57-i*2],[45+i,35+i],[47+i,37+i],[11+i*4,59-i*2]]);}
 if(kind==='shell'){poly(g,'#7d918b',[[11,62],[15,44],[29,29],[40,30],[54,48],[55,61],[30,71]]);poly(g,'#e4ddc0',[[14,59],[17,45],[30,33],[39,34],[51,49],[51,59],[30,65]]);for(let i=0;i<6;i++)poly(g,i%2?'#b6b69d':'#f1e6c8',[[30,62],[16+i*6,45-Math.sin(i/5*Math.PI)*11],[18+i*6,46-Math.sin(i/5*Math.PI)*11],[33,61]]);}
 if(kind==='lantern'){rect(g,'#5d6250',28,0,8,12);rect(g,'#6c6451',18,11,28,5);for(let y=17;y<58;y++){const d=Math.sqrt(Math.max(0,1-Math.pow((y-37)/22,2)))*19;rect(g,'#ab6a51',32-d,y,d*2,1);rect(g,'#d9aa6c',25,y,14,1);rect(g,'#f2d59a',28,y,5,1);}rect(g,'#6e624b',18,59,28,4);rect(g,'#d7bc7f',30,64,3,13);}
 if(kind==='flower'){for(const [x,y] of [[22,31],[39,27],[31,48]]){rect(g,'#4c7f62',x,35,2,40);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;rect(g,'#d8adc1',x+Math.cos(a)*5-3,y+Math.sin(a)*5-3,6,6);}rect(g,'#f1d394',x-1,y-1,3,3);}}
 if(kind==='rift'){const gr=g.createRadialGradient(30,38,2,32,40,28);gr.addColorStop(0,'#d5e2cd');gr.addColorStop(.5,'#80b8b5');gr.addColorStop(.8,'#5d8b9a');gr.addColorStop(1,'#4e657900');g.fillStyle=gr;g.fillRect(0,8,64,64);poly(g,'#8daeb5',[[11,46],[19,24],[35,14],[48,28],[54,49],[41,64],[21,64]]);poly(g,'#b4d2c8',[[17,42],[24,25],[34,22],[45,31],[45,46],[33,56],[22,52]]);rect(g,'#3e6375',26,38,3,5);rect(g,'#3e6375',39,38,3,5);rect(g,'#e0ebcd',30,25,4,5);}
 });}
export const ATLAS_POSES=['idle','walk','run','jump','fall','attack','cast','guard','land','dash'];
export function avatarAtlas(profile){const frames=[],lookup={};for(const view of ['side','back'])for(const pose of ATLAS_POSES){lookup[view+':'+pose]=[];for(let i=0;i<(pose==='walk'||pose==='run'?6:pose==='attack'?3:1);i++){lookup[view+':'+pose].push(frames.length);frames.push({pose,view,phase:i/(pose==='walk'||pose==='run'?6:3)});}}const columns=8,rows=Math.ceil(frames.length/columns),c=document.createElement('canvas');c.width=80*columns;c.height=128*rows;const g=c.getContext('2d');frames.forEach((f,i)=>g.drawImage(avatarCanvas(profile,f.pose,f.phase,f.view),i%columns*80,Math.floor(i/columns)*128));return {texture:canvasTexture(c),frames,lookup,columns,rows};}

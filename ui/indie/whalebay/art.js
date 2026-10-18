// Original pixel assets for the Antarctic enclave's Whale Bay. Generated once at scene load.
import * as T from '../vendor/three.module.min.js';
const hash=(a,b=0)=>{let n=Math.imul(a+73,374761393)^Math.imul(b+91,668265263);return (Math.imul(n^(n>>>13),1274126177)>>>0)/4294967296;};
const rect=(g,c,x,y,w,h)=>{g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
function polygon(g,color,points){g.fillStyle=color;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(Math.round(x),Math.round(y)):g.moveTo(Math.round(x),Math.round(y)));g.closePath();g.fill();}
function pixel(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingEnabled=false;paint(g);const t=new T.CanvasTexture(c);t.magFilter=T.NearestFilter;t.minFilter=T.NearestMipmapNearestFilter;t.colorSpace=T.SRGBColorSpace;return t;}
function timber(g,x,y,w,h){rect(g,'#4a4140',x,y,w,h);rect(g,'#80654b',x+1,y,w-2,h);rect(g,'#b29a72',x+1,y,1,h);for(let i=0;i<h;i+=9)rect(g,'#5f503f',x+2,y+i,w-3,1);}
function windowPane(g,x,y,w,h,{shutter=true,lit=false}={}){
 rect(g,'#c6b690',x-3,y-3,w+6,h+7);rect(g,'#4b5450',x-1,y-1,w+2,h+2);
 rect(g,lit?'#dfb66c':'#719ba3',x,y,w,h);rect(g,lit?'#f8dda0':'#b7d0c5',x+1,y+1,w-3,Math.ceil(h*.42));
 polygon(g,lit?'#f7d69b':'#d8e2d4',[[x+1,y+2],[x+w-3,y+2],[x+1,y+h*.65]]);
 timber(g,x+Math.floor(w/2)-1,y,2,h);rect(g,'#67776e',x,y+h*.48,w,2);rect(g,'#a88f6c',x-5,y+h+2,w+10,3);rect(g,'#e2cfab',x-5,y+h+2,w+10,1);
 if(shutter)for(const side of [-1,1]){const sx=side<0?x-8:x+w+3;rect(g,'#4d7474',sx,y-1,5,h+2);rect(g,'#7da29a',sx,y,1,h);for(let i=4;i<h;i+=5)rect(g,'#385955',sx+1,y+i,4,1);}
}
export function wallTexture(kind='home'){
 return pixel(256,192,g=>{
  const chinese=kind==='shop',stone=kind==='craft';rect(g,stone?'#b0b7aa':'#e6d7b9',0,0,256,192);
  // Grouped plaster wear and masonry, rather than full-surface pixel noise.
  if(stone){for(let y=0;y<192;y+=13)for(let x=-14;x<270;x+=29){const xx=x+(Math.floor(y/13)%2)*14;rect(g,'#85988f',xx,y,28,12);rect(g,['#b5c1ae','#c9cdb7','#a4b5aa'][Math.floor(hash(x,y)*3)],xx+1,y+1,26,10);rect(g,'#d7d7bd',xx+2,y+1,23,1);}}
  else for(let i=0;i<75;i++){const x=hash(i,4)*256,y=hash(i,7)*180;rect(g,i%3?'#d6c9ab':'#f0e4ca',x,y,3+hash(i,8)*11,1+hash(i,2)*3);}
  // Ground-floor stone plinth.
  for(let y=166;y<192;y+=9)for(let x=-12;x<270;x+=24){const xx=x+(Math.floor(y/9)%2)*12;rect(g,'#727f75',xx,y,23,8);rect(g,'#a5aa95',xx+1,y+1,21,6);rect(g,'#c4c0a7',xx+2,y+1,19,1);}
  for(const x of [2,72,181,248])timber(g,x,0,6,169);for(const y of [4,18,156])timber(g,0,y,256,5);
  // Mortise brackets and diagonal braces below the loft.
  for(const x of [9,190]){polygon(g,'#7c6248',[[x,22],[x+46,22],[x+46,27],[x+6,65],[x,65]]);polygon(g,'#b4976b',[[x+3,25],[x+40,25],[x+3,59]]);}
  const doorX=101,doorY=84;rect(g,'#69634d',doorX-5,doorY-8,53,91);rect(g,'#b2a07b',doorX-3,doorY-6,49,87);rect(g,'#344c4b',doorX,doorY,43,81);
  rect(g,'#776450',doorX+3,doorY+4,37,75);for(let i=0;i<5;i++){rect(g,'#a18b65',doorX+5+i*7,doorY+6,5,70);rect(g,'#c2a87c',doorX+5+i*7,doorY+6,1,68);}
  rect(g,'#d6bb82',doorX+32,doorY+48,3,4);rect(g,'#d4c5a2',doorX-6,doorY+81,55,4);rect(g,'#7d8272',doorX-9,doorY+85,61,5);
  windowPane(g,24,87,31,49,{lit:true});windowPane(g,199,87,29,49,{lit:true});
  // Window boxes have individual stems, layered flowers and draping leaves.
  for(const x of [18,193]){rect(g,'#715b45',x,145,49,9);rect(g,'#a27f55',x,144,49,3);for(let i=0;i<13;i++){const xx=x+2+i*3.5,yy=135-hash(i,x)*8;rect(g,'#4e775e',xx,yy,2,12);rect(g,'#8fa277',xx-2,yy+3,6,2);rect(g,['#e9c6bc','#d9898c','#f5dfad'][i%3],xx-1,yy-3,4,4);rect(g,'#fff0c4',xx,yy-3,1,1);}}
  if(chinese){rect(g,'#4b6467',83,27,88,25);timber(g,81,25,92,3);rect(g,'#dbbc7b',86,30,82,1);g.textAlign='center';g.font='14px "Microsoft YaHei",sans-serif';g.fillStyle='#ecd8a6';g.fillText('鲸 湾 杂 货',127,46);}
  else{windowPane(g,113,29,23,28,{shutter:false,lit:true});}
  // Small payment rune plaque, as specified by the world's trade system.
  rect(g,'#695c49',151,105,14,23);rect(g,'#c8ad71',153,107,10,19);rect(g,'#6a7e6d',157,109,2,14);rect(g,'#6a7e6d',154,114,8,2);rect(g,'#ece0b7',153,107,10,1);
 });
}
export function roofTexture(blue=false){return pixel(256,192,g=>{
 const colors=blue?['#354b58','#526e7c','#688b95','#9eb4b2']:['#614b47','#8e6959','#ac8464','#d4ad7e'];rect(g,colors[0],0,0,256,192);
 for(let row=0;row<24;row++)for(let col=-1;col<24;col++){const x=col*12+(row%2)*6,y=row*8,n=hash(col,row),c=colors[n>.7?2:1];rect(g,colors[0],x,y,12,8);rect(g,c,x+1,y,10,7);rect(g,colors[2],x+1,y,9,1);rect(g,colors[3],x+2,y,3,1);rect(g,colors[0],x+9,y+2,2,5);if(n>.86){rect(g,blue?'#849d8c':'#b5a47b',x+2,y+2,4,2);rect(g,colors[0],x+4,y+5,4,1);}}
 });}
export function personTexture(color='#8d493f',frame=0,kind='traveler',direction='south'){
 return pixel(64,96,g=>{
  const p=(c,x,y,w,h)=>rect(g,c,x,y,w,h),step=frame%4,walk=step===1?-2:step===3?2:0,back=direction==='north',side=direction==='east'||direction==='west';
  if(direction==='west'){g.translate(64,0);g.scale(-1,1);}
  const ink='#303f4b',skin=kind==='tide'?'#a2c4bc':'#ddb795',lightSkin=kind==='tide'?'#c3ddd0':'#f3d2af',hair=kind==='mira'?'#d4cfc2':kind==='tide'?'#416f78':'#665145';
  // Feet and trousers are separate silhouettes in each walking pose.
  p(ink,20,74,10,12+walk);p('#535b65',22,75,6,9+walk);p(ink,35,74,10,12-walk);p('#73746f',36,75,6,9-walk);
  p('#263842',18,85+walk,14,5);p('#a29179',19,85+walk,10,1);p('#293c44',34,85-walk,15,5);p('#b7a389',35,85-walk,10,1);
  polygon(g,ink,[[20,50],[43,50],[49,72],[43,79],[19,79],[16,72]]);polygon(g,color,[[21,51],[41,51],[46,73],[40,76],[21,76],[19,69]]);
  p('#465756',25,52,4,22);p('#bead82',29,57,2,18);p('#ccb47f',29,60,2,2);p('#dfc590',29,66,2,2);p('#d1b981',20,73,24,2);p('#f2d9a0',33,73,5,3);
  // Rolled sleeves, small fingers and shaded shoulder seams.
  polygon(g,ink,[[18,51],[23,56],[19,70+walk],[14,69+walk],[13,59]]);polygon(g,color,[[17,53],[21,56],[18,65+walk],[14,64+walk]]);
  p('#c8bea1',14,62+walk,5,3);p(skin,14,65+walk,5,6);p(lightSkin,14,65+walk,2,4);
  polygon(g,ink,[[42,52],[47,53],[51,65-walk],[49,72-walk],[44,71-walk],[42,60]]);p(color,44,54,4,11-walk);p('#ded0aa',44,64-walk,5,3);p(skin,45,67-walk,4,5);
  // Head, ears, fringe and a clear light-facing plane.
  polygon(g,ink,[[20,21],[28,15],[41,17],[47,25],[47,41],[41,50],[24,50],[18,42],[17,29]]);
  polygon(g,hair,[[21,22],[30,18],[41,20],[44,27],[44,42],[39,47],[24,46],[20,39]]);
  if(!back){p(skin,22,28,20,17);p(lightSkin,23,29,15,12);p(skin,20,33,3,7);p(lightSkin,42,33,3,6);
   polygon(g,hair,[[20,23],[40,22],[44,29],[37,27],[34,31],[31,27],[26,32],[23,28],[20,34]]);
   if(side){p('#34434a',37,34,2,3);p('#c0927c',42,37,3,3);}else{p('#354651',25,34,2,3);p('#354651',37,34,2,3);p('#fff0d4',25,34,1,1);p('#fff0d4',37,34,1,1);}
   p(kind==='tide'?'#719fa3':'#cf9c88',24,39,3,2);p('#a47870',31,43,4,1);
  }else{p(hair,22,25,19,21);for(let i=0;i<5;i++)p('#857565',23+i*4,29,1,13);}
  // A scarf and an asymmetric satchel make the body readable at phone size.
  p('#d3b97c',22,48,21,4);p('#f3d9a0',23,48,18,1);p('#b49362',35,51,5,11);p('#e4c98b',36,52,2,7);
  polygon(g,'#6d5948',[[21,50],[24,50],[42,71],[39,73]]);p('#4e4c43',37,62,13,13);p('#a4855e',38,63,11,10);p('#c7aa7b',38,63,11,3);p('#e3c990',42,67,3,3);
  if(kind==='traveler'){p(ink,14,22,36,5);p('#b49362',15,21,33,4);p('#e6cb93',16,20,31,2);polygon(g,'#ad8b59',[[21,12],[36,10],[42,17],[43,21],[20,21]]);p('#dfc387',23,12,13,7);p('#f3dcaa',24,12,10,2);p('#694f42',21,19,21,2);}
  if(kind==='mira'){polygon(g,'#c2bea9',[[19,32],[12,28],[18,40],[22,39]]);polygon(g,'#c2bea9',[[42,31],[51,26],[46,40],[42,40]]);p('#8aa398',43,29,4,4);p('#f2db9d',44,30,2,2);}
  if(kind==='tide'){polygon(g,'#538990',[[23,23],[21,12],[27,18],[30,10],[34,18],[40,12],[42,28]]);p('#9cc5bb',27,18,2,8);p('#c0d8c3',33,16,2,9);polygon(g,'#79a9ab',[[18,33],[11,30],[16,40],[21,40]]);}
 });
}
export function foliageTexture(id=0){return pixel(160,192,g=>{
 const blossom=id<2,palette=blossom?['#7d5669','#a77286','#c992a2','#e7b3bc','#f3d1cd','#fae3d6']:['#2e514b','#426b59','#5e8868','#82a17a','#a8b58a','#ced2a0'];
 // Root flare, bent trunk and distinct branching structure.
 polygon(g,'#414a43',[[65,190],[72,139],[66,98],[77,92],[87,122],[86,153],[98,186],[113,190]]);
 polygon(g,'#75674e',[[70,188],[77,139],[72,103],[79,102],[83,142],[86,177],[95,188]]);rect(g,'#a49367',77,139,2,42);
 polygon(g,'#685e4c',[[77,136],[43,101],[31,99],[40,108],[76,149]]);polygon(g,'#877557',[[79,129],[116,89],[122,89],[116,101],[83,143]]);
 for(const [cx,cy,r] of [[73,37,30],[36,66,29],[112,64,31],[72,87,41],[119,102,25],[29,106,23],[75,116,30]]){
  // Coherent leaf clusters; shadows stay beneath the crown, highlights on its upper-left edge.
  for(let yy=-r;yy<=r;yy+=3)for(let xx=-r;xx<=r;xx+=3){const edge=xx*xx/(r*r)+yy*yy/(r*r*.72);if(edge>1+hash(xx+cx,yy+cy)*.1)continue;const n=hash(Math.floor((xx+cx)/6),Math.floor((yy+cy)/5)+id*173),light=(-yy/r*.65-xx/r*.25),band=Math.max(0,Math.min(5,Math.floor(2.1+light+n*1.8)));rect(g,palette[band],cx+xx,cy+yy,3,3);if(n>.78)rect(g,palette[Math.min(5,band+1)],cx+xx,cy+yy,2,1);}
 }
 // Small loose sprigs soften the outline without increasing mesh complexity.
 for(let i=0;i<65;i++){const x=18+hash(i,id+10)*125,y=19+hash(i,id+30)*105;if(g.getImageData(Math.floor(x),Math.floor(y),1,1).data[3]){rect(g,palette[4],x,y,3,2);if(blossom)rect(g,palette[5],x+1,y,1,1);}}
 });}
export function mountainTexture(){return pixel(1024,320,g=>{
 const layers=[{base:290,color:'#c2d1ce',peaks:[[-20,210],[55,180],[103,105],[157,160],[227,39],[276,114],[330,130],[389,60],[440,140],[511,113],[580,32],[637,110],[720,76],[778,152],[845,56],[918,149],[1000,113],[1045,195]]},{base:320,color:'#7f9e9c',peaks:[[-10,266],[50,244],[127,187],[202,242],[279,149],[350,228],[419,163],[492,244],[585,186],[651,216],[727,142],[810,224],[892,179],[964,239],[1040,205]]}];
 for(const [layerIndex,layer] of layers.entries()){polygon(g,layer.color,[[-5,layer.base],...layer.peaks,[1030,layer.base]]);for(let i=1;i<layer.peaks.length-1;i++){const [x,y]=layer.peaks[i],[px,py]=layer.peaks[i-1];if(y<py){polygon(g,layerIndex?'#6c8c89':'#a2bcb9',[[x,y],[x+24,y+72],[x+5,layer.base],[x-20,y+55]]);if(!layerIndex&&y<115)polygon(g,'#e4e7da',[[x,y],[x+22,y+38],[x+10,y+30],[x+5,y+45],[x-3,y+35],[x-17,y+43]]);}}}
 });}

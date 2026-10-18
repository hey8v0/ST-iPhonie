import * as T from '../vendor/three.module.min.js';
import {WIDTH,HEIGHT,land,elevation,plots,STATIONS,RESOURCES,CROPS,weather,season} from './model.js';
// Local, original pixel textures on actual 3D geometry. No raster-generated scene assets.
const hash=(a,b=0)=>{let n=Math.imul(a+73,374761393)^Math.imul(b+91,668265263);return (Math.imul(n^(n>>>13),1274126177)>>>0)/4294967296;};
function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingEnabled=false;draw(g,w,h);const tex=new T.CanvasTexture(c);tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestMipmapNearestFilter;tex.colorSpace=T.SRGBColorSpace;return tex;}
const fill=(g,c,x,y,w,h)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
function noise(g,w,h,colors,n=1000){for(let i=0;i<n;i++)fill(g,colors[i%colors.length],Math.floor(hash(i,4)*w),Math.floor(hash(i,8)*h),1+Math.floor(hash(i,1)*3),1);}
function wallTexture(kind){return texture(128,96,g=>{
 fill(g,'#bcb498',0,0,128,96);noise(g,128,96,['#aaa98e','#cec1a1','#c0b99b','#a4a78f'],1100);
 for(let i=0;i<8;i++){fill(g,'#62635a',0,85+i,128,1);for(let j=0;j<12;j++)fill(g,i%2?'#a4a38d':'#858c80',j*12+(i%2)*6,85+i,9,1);}
 for(const x of [2,40,85,122]){fill(g,'#464f49',x,0,4,87);fill(g,'#746c53',x+1,0,1,85);}for(const y of [3,13,78])fill(g,'#585d50',0,y,128,3);
 // Hand-painted timber diagonals under the eaves.
 for(let i=0;i<26;i++){fill(g,'#62624f',4+i,14+i*.7,3,2);fill(g,'#62624f',120-i,14+i*.7,3,2);}
 fill(g,'#4b5149',51,42,24,45);fill(g,'#826a4b',54,44,19,42);for(let i=0;i<4;i++)fill(g,'#a18b5a',55+i*5,46,1,39);fill(g,'#d6bc78',68,66,2,2);
 for(const x of [13,92]){fill(g,'#52605a',x-3,38,27,34);fill(g,'#e5c388',x,41,21,26);fill(g,'#91a99b',x+2,42,8,23);fill(g,'#b8c2aa',x+13,42,7,23);fill(g,'#5f6d5b',x+10,41,2,27);fill(g,'#718271',x,52,21,2);fill(g,'#7f785b',x-4,71,29,4);fill(g,'#9f9369',x-3,71,27,1);
  for(let j=0;j<7;j++){fill(g,'#4a6c4a',x+j*3,66,2,6);fill(g,j%2?'#c7a38b':'#dfd2a0',x+j*3,65-(j%3),2,2);}}
 if(kind==='shop'){fill(g,'#435c59',37,18,52,14);fill(g,'#d3bc7e',40,20,46,1);g.font='8px serif';g.textAlign='center';g.fillStyle='#e5d7ad';g.fillText('WHALE & CO.',63,29);}
 });}
function roofTexture(blue=false){return texture(128,96,g=>{const c=blue?['#455a65','#536e79','#6e8590','#829695']:['#755947','#8b6850','#a17a57','#b38e65'];fill(g,c[0],0,0,128,96);for(let row=0;row<16;row++)for(let col=0;col<15;col++){const x=col*10+(row%2)*5-10,y=row*6;fill(g,c[1+Math.floor(hash(row,col)*3)],x,y,9,5);fill(g,c[0],x,y+5,10,1);fill(g,c[3],x,y,8,1);if(hash(col,row)>.6)fill(g,c[0],x+6,y+2,2,1);}});}
function personTexture(color,frame=0){return texture(32,48,g=>{
 const p=(c,x,y,w,h)=>fill(g,c,x,y,w,h);
 // 32×48 sprites: crisp eyes, woven hat, scarf, satchel, two walking poses.
 p('#3e4647',11,36,5,7);p('#414b51',19,36,5,7);p('#283c46',10,42+(frame%2),7,3);p('#263947',18,42-(frame%2),8,3);
 p('#6d543e',9,12,16,15);p('#bf906c',12,14,12,12);p('#e4b58a',12,14,9,10);p('#edc299',13,16,7,7);p('#404343',13,18,2,2);p('#404343',21,18,2,2);p('#b17160',16,23,4,1);
 p(color,9,26,16,12);p('#dcbd88',12,25,10,3);p('#826651',8,27,3,10);p('#c3a073',7,31,5,7);p('#e2b888',6,29,3,5);p('#e3b78b',25,29,3,5);
 p('#987b51',6,11,23,4);p('#e2c792',5,10,23,2);p('#c4a76d',10,4,14,7);p('#e3ca8d',11,4,11,4);p('#8c6b49',10,9,14,2);p('#f3dfad',11,4,10,1);
 p('#e1c29c',11,30,1,5);p('#3f5c59',21,27,3,11);p('#a17f5e',22,30,4,7);
 });}
function foliageTexture(id){return texture(96,112,g=>{
 const p=(c,x,y,w,h)=>fill(g,c,x,y,w,h),palette=id%2?['#2f4c3e','#3d6550','#58825c','#7c9c70','#a4b48a']:['#304f45','#466c56','#67895f','#8da377','#b5ba88'];
 p('#524e3d',43,66,9,43);p('#796c49',45,68,4,40);p('#a08c5f',46,76,1,31);p('#605c43',37,105,21,4);
 const circles=[[48,23,25],[26,43,22],[67,40,24],[44,54,29],[72,63,17],[21,65,16]];
 for(let i=0;i<circles.length;i++){const [cx,cy,r]=circles[i];for(let y=-r;y<=r;y+=2)for(let x=-r;x<=r;x+=2){if(x*x+y*y>r*r)continue;const n=hash(x+y*96,i+id),light=-(y/r)*.8+(-x/r)*.35;const c=Math.max(0,Math.min(4,Math.floor(1.4+light+n*2)));p(palette[c],cx+x,cy+y,2,2);}}
 for(let i=0;i<100;i++){const x=10+hash(i,id)*75,y=12+hash(i,id+8)*66;if(g.getImageData(Math.floor(x),Math.floor(y),1,1).data[3])p('#c1c897',x,y,2,1);}
 });}
export function createBayPainter(canvas){
 const mobile=matchMedia('(pointer:coarse)').matches;let renderer;try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});}catch(error){window.stGameReport?.({kind:'3D 渲染启动',message:error.message});return {failed:error,render(){},world:()=>({x:12,y:12}),project:()=>({x:0,y:0}),dispose(){},inputVector:(x,y)=>({x,y})};}
 renderer.debug.onShaderError=(gl,program,vertex,fragment)=>window.stGameReport?.({kind:'3D 着色器编译',program:gl.getProgramInfoLog(program),vertex:gl.getShaderInfoLog(vertex),fragment:gl.getShaderInfoLog(fragment)});
 canvas.dataset.renderer='webgl';renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1:1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.info.autoReset=false;
 const scene=new T.Scene();scene.background=new T.Color('#687b78');scene.fog=new T.FogExp2('#8e9e8e',.008);
 const camera=new T.PerspectiveCamera(37,1,.1,180),target=new T.Vector3(15,.3,12),offset=new T.Vector3(5.5,14,19),ray=new T.Raycaster(),groundPlane=new T.Plane(new T.Vector3(0,1,0),-.5);
 const hemi=new T.HemisphereLight('#d9e0d0','#29392c',.85);scene.add(hemi);
 const sun=new T.DirectionalLight('#ffe1a4',3.2);sun.position.set(-12,30,16);sun.target.position.set(16,0,13);sun.castShadow=true;sun.shadow.mapSize.set(mobile?512:1024,mobile?512:1024);Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:.5,far:90});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;scene.add(sun,sun.target);
 const pickables=[];const resources=new Set(),objects=new Set(),dynamic=new T.Group();scene.add(dynamic);const matrix=new T.Matrix4(),white=new T.Color();
 const track=o=>{objects.add(o);return o;};const mat=(color,map=null,extra={})=>track(new T.MeshStandardMaterial({color,map,roughness:.98,...extra}));
 const pixel=(w,h,draw)=>{const t=texture(w,h,draw);resources.add(t);return t;};
 const grassTex=pixel(32,32,g=>{fill(g,'#8d9873',0,0,32,32);noise(g,32,32,['#7a8862','#9ca781','#b2b48b','#6c805c'],95);}),stoneTex=pixel(64,64,g=>{fill(g,'#827e68',0,0,64,64);for(let row=0;row<8;row++)for(let col=0;col<6;col++){const x=col*14+(row%2)*7-7,y=row*8;fill(g,['#b3aa8b','#9e9b81','#c1b497'][Math.floor(hash(row,col)*3)],x+1,y+1,12,6);fill(g,'#d1c7a4',x+2,y+1,9,1);}}),woodTex=pixel(64,64,g=>{fill(g,'#645940',0,0,64,64);for(let i=0;i<8;i++){fill(g,i%2?'#988565':'#b39d72',i*8+1,0,7,64);for(let j=0;j<10;j++)fill(g,'#817357',i*8+3,j*7+hash(j,i)*4,1,4);}}),soilTex=pixel(32,32,g=>{fill(g,'#78624d',0,0,32,32);noise(g,32,32,['#5b5542','#8d765b','#a38b60'],200);for(let i=0;i<4;i++)fill(g,'#544c3e',0,i*8+2,32,2);});
 const grass=mat('#b6b99b',grassTex),stone=mat('#bab7a2',stoneTex),wood=mat('#b6a17e',woodTex),dirt=mat('#696c58',stoneTex),soil=mat('#bfb39a',soilTex),beam=mat('#605c46'),trim=mat('#c4b387'),metal=mat('#4a5955');
 const boxGeo=track(new T.BoxGeometry(1,1,1));
 function box(x,y,z,w,h,d,material,parent=scene){const m=new T.Mesh(boxGeo,material);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 function batch(cells,geometry,material){const m=new T.InstancedMesh(geometry,material,cells.length);cells.forEach((p,i)=>{matrix.compose(new T.Vector3(p.x,p.y,p.z),new T.Quaternion(),new T.Vector3(p.w||1,p.h||1,p.d||1));m.setMatrixAt(i,matrix);if(p.color)m.setColorAt(i,white.set(p.color));});m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
 const cells=[],shore=[];for(let y=1;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(land(x,y)){const top=elevation(x,y),edge=!land(x+1,y)||!land(x-1,y)||!land(x,y+1)||!land(x,y-1);(edge?shore:cells).push({x,y:(top-.7)/2,z:y,w:1.015,h:top+.7,d:1.015,color:hash(x,y)>.5?'#ffffff':'#f8f9ef'});}
 pickables.push(batch(cells,boxGeo,[dirt,dirt,grass,dirt,dirt,dirt]));pickables.push(batch(shore,boxGeo,[dirt,dirt,mat('#c5b88c',grassTex),dirt,dirt,dirt]));
 const paths=[];for(let x=7;x<30;x++)paths.push({x,y:.515,z:10,w:1.02,h:.045,d:1});for(let y=8;y<20;y++)paths.push({x:14,y:.515,z:y,w:1,h:.045,d:1.02});for(let x=14;x<29;x++)paths.push({x,y:.515,z:19,w:1.02,h:.045,d:.8});batch(paths,boxGeo,stone);
 // The ocean is a real plane below the quay, with moving glints in world space.
 const waterUniforms={time:{value:0},night:{value:0}};
 const waterMat=track(new T.ShaderMaterial({uniforms:waterUniforms,vertexShader:'varying vec3 wp;void main(){vec4 p=modelMatrix*vec4(position,1.);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',fragmentShader:`varying vec3 wp;uniform float time;uniform float night;void main(){float a=sin(wp.x*2.2+time*.7+sin(wp.z*.5))*sin(wp.z*2.4-time*.4);float wave=smoothstep(.87,.94,a);float glitter=pow(max(0.,sin(wp.x*4.+wp.z*3.+time)),22.)*pow(max(0.,sin(wp.x*1.3-wp.z*2.1+time*.21)),6.);vec3 col=mix(vec3(.018,.055,.065),vec3(.07,.15,.16),.5+.18*sin(wp.z*.1));col+=wave*.018+glitter*.028;col=mix(col,col*vec3(.42,.52,.72),night);gl_FragColor=vec4(col,1.);}` }));
 const sea=new T.Mesh(track(new T.PlaneGeometry(160,160)),waterMat);sea.rotation.x=-Math.PI/2;sea.position.set(18,-.4,14);scene.add(sea);
 // Gabled houses, roofs, structural timber, windows and chimneys have actual depth.
 function house(p){const group=new T.Group();group.position.set(p.x,.5,p.y-.55);group.userData.point={x:p.x,y:p.y};pickables.push(group);scene.add(group);const shop=p.id==='shop',w=p.id==='craft'?3.3:3.9,d=2.6,h=2.6;
  const wall=wallTexture(p.id);resources.add(wall);const facade=mat('#fff2d7',wall),side=mat('#d5cbb1',wall);box(0,h/2,0,w,h,d,[side,side,side,side,facade,side],group);box(0,.12,0,w+.2,.24,d+.2,stone,group);
  const roof=roofTexture(shop);resources.add(roof);const roofMat=mat('#e5dcc2',roof),rise=1.6,half=w/2+.25,len=Math.hypot(half,rise);
  for(const sign of [-1,1]){const m=new T.Mesh(track(new T.PlaneGeometry(len,d+.5)),roofMat);m.rotation.set(-Math.PI/2,0,-sign*Math.atan2(rise,half),'ZYX');m.position.set(sign*half/2,h+rise/2,0);m.castShadow=m.receiveShadow=true;group.add(m);}
  const gableTex=pixel(64,48,g=>{fill(g,'#b3a285',0,0,64,48);noise(g,64,48,['#9e967b','#c5b294','#b7a689'],300);fill(g,'#4f5042',31,0,3,48);fill(g,'#716851',32,0,1,48);for(let i=0;i<30;i++){fill(g,'#545546',2+i,2+i*1.4,2,3);fill(g,'#545546',60-i,2+i*1.4,2,3);}fill(g,'#625f48',23,5,18,17);fill(g,'#a19a70',25,7,14,13);fill(g,'#565f4c',31,7,2,13);fill(g,'#6a745a',25,12,14,2);});
  const triangle=new T.Shape();triangle.moveTo(-w/2,0);triangle.lineTo(w/2,0);triangle.lineTo(0,rise);triangle.closePath();
  for(const z of [-d/2,d/2]){const geometry=track(new T.ShapeGeometry(triangle));const positions=geometry.attributes.position,uv=[];for(let i=0;i<positions.count;i++)uv.push((positions.getX(i)+w/2)/w,positions.getY(i)/rise);geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));const m=new T.Mesh(geometry,mat('#e1d2b0',gableTex,{side:T.DoubleSide}));m.position.set(0,h,z);group.add(m);box(0,h+.03,z,w+.1,.13,.13,beam,group);}
  box(0,h+rise+.02,0,.16,.14,d+.7,beam,group);for(const x of [-w/2,w/2])box(x,h-.05,0,.13,.14,d+.4,beam,group);
  box(w*.28,h+1,-.6,.45,1.8,.5,stone,group);box(w*.28,h+1.93,-.6,.6,.15,.64,trim,group);
  for(const x of [-w/2+.05,w/2-.05])box(x,h/2,d/2+.05,.13,h,.13,beam,group);
  for(const x of [-1.25,1.2]){box(x,1.17,d/2+.1,.88,.12,.28,beam,group);box(x,1.3,d/2+.2,.8,.15,.25,wood,group);for(let j=0;j<4;j++)box(x-.3+j*.2,1.45,d/2+.23,.14,.18,.14,mat(j%2?'#d4b4a4':'#b9c19b'),group);}
  if(shop){for(let i=0;i<10;i++)box(-w/2+.2+i*.39,1.95,d/2+.45,.4,.10,.85,mat(i%2?'#d3c49c':'#56797b'),group);box(-1.3,.8,d/2+.9,.08,1.7,.08,beam,group);box(1.3,.8,d/2+.9,.08,1.7,.08,beam,group);}
  for(let i=0;i<3;i++){box(-w/2+.6+i*.35,.22,d/2+.8,.35,.44,.6,wood,group);box(-w/2+.6+i*.35,.32,d/2+1.11,.04,.3,.02,beam,group);}
  for(const x of [-w/2-.3,w/2+.4]){const barrel=new T.Mesh(track(new T.CylinderGeometry(.22,.27,.58,12)),wood);barrel.position.set(x,.3,d/2);barrel.castShadow=true;barrel.receiveShadow=true;group.add(barrel);for(const y of [.12,.44]){const ring=new T.Mesh(track(new T.CylinderGeometry(.275,.275,.05,12)),metal);ring.position.set(x,y,d/2);group.add(ring);}}

 }
 STATIONS.filter(p=>p.solid).forEach(house);
 // Quay deck, jetty, posts, lamps, shipping chest and noticeboard.
 for(let x=27;x<32;x++){box(x,.38,19,1.02,.15,1.5,wood);for(const z of [18.25,19.75]){box(x,-.4,z,.12,1.8,.12,beam);box(x,.52,z,.2,.12,.2,trim);}}
 for(const p of STATIONS.filter(p=>['orders','sell'].includes(p.id))){box(p.x,.95,p.y,.9,.9,.55,wood);if(p.id==='orders'){box(p.x,1.35,p.y,.95,.6,.13,beam);box(p.x,1.38,p.y+.08,.69,.4,.025,mat('#dfd0aa'));box(p.x,1.72,p.y,1.15,.12,.5,metal);}else box(p.x,1.38,p.y,1.05,.13,.7,metal);}
 const lamps=[];for(const [x,z] of [[13,9],[23,10],[27,18],[5,11]]){box(x,1.7,z,.11,2.4,.11,metal);box(x,2.8,z,.3,.1,.3,metal);const bulb=mat('#ffe2a3',null,{emissive:'#ffa541',emissiveIntensity:.8});box(x,2.6,z,.2,.35,.2,bulb);const glow=new T.PointLight('#ffc789',0,5,2);glow.position.set(x,2.6,z);scene.add(glow);lamps.push(glow);}
 // A village square, usable lanes, farm gate and working harbor props give the place a purpose.
 const plaza=new T.Mesh(track(new T.CircleGeometry(1.65,24)),stone);plaza.rotation.x=-Math.PI/2;plaza.position.set(16,.54,13);plaza.receiveShadow=true;scene.add(plaza);
 const well=new T.Mesh(track(new T.CylinderGeometry(.58,.7,.65,16)),stone);well.position.set(16,.83,13);well.castShadow=well.receiveShadow=true;scene.add(well);
 const opening=new T.Mesh(track(new T.CircleGeometry(.43,16)),mat('#202f2b'));opening.rotation.x=-Math.PI/2;opening.position.set(16,1.164,13);scene.add(opening);
 for(const x of [15.35,16.65])box(x,1.65,13,.12,2.3,.12,beam);box(16,2.68,13,1.6,.16,.32,wood);box(16,2.05,13,.035,1.2,.035,trim);
 box(17.8,.8,12.7,1.4,.12,.45,wood);for(const x of [17.3,18.3])box(x,.65,12.7,.1,.3,.35,metal);
 for(let x=6;x<=11;x++){if(x===9)continue;box(x,.9,11,.1,.8,.1,wood);box(x-.35,.88,11,.65,.08,.07,trim);box(x-.35,1.08,11,.65,.08,.07,trim);}
 // Quay-side crates and a moored skiff, below the low shore.
 for(let i=0;i<5;i++){box(26+i*.48,.74,18,.42,.48,.46,wood);box(26+i*.48,.8,18.24,.04,.35,.02,beam);}
 const skiff=new T.Group();skiff.position.set(32,-.1,20.2);skiff.rotation.y=.35;scene.add(skiff);box(0,0,0,.8,.28,2.3,wood,skiff);box(-.43,.2,0,.12,.4,2.5,beam,skiff);box(.43,.2,0,.12,.4,2.5,beam,skiff);box(0,.23,-.55,.8,.1,.25,trim,skiff);box(0,.23,.55,.8,.1,.25,trim,skiff);
 // Trees use detailed nearest-filtered pixel billboards in a spatial grove, with grounded shadows.
 const treeSprites=[];const treeTextures=Array.from({length:4},(_,i)=>{const t=foliageTexture(i);resources.add(t);return t;});
 function billboard(tex,x,z,w,h,parent=scene){const material=track(new T.SpriteMaterial({map:tex,transparent:true,alphaTest:.35,depthWrite:true})),m=new T.Sprite(material);m.position.set(x,elevation(x,z)+h/2,z);m.scale.set(w,h,1);parent.add(m);return m;}
 const shadeTex=pixel(64,32,g=>{const grad=g.createRadialGradient(32,16,1,32,16,30);grad.addColorStop(0,'#142a1e85');grad.addColorStop(1,'#142a1e00');g.fillStyle=grad;g.fillRect(0,0,64,32);});
 function shadow(x,z,w=2){const m=new T.Mesh(track(new T.PlaneGeometry(w,w*.6)),track(new T.MeshBasicMaterial({map:shadeTex,transparent:true,depthWrite:false})));m.rotation.x=-Math.PI/2;m.position.set(x,elevation(x,z)+.05,z);scene.add(m);return m;}
 for(let i=0;i<65;i++){const x=2+hash(i,2)*26,z=3+hash(i,5)*19;if(Math.abs(z-10)<2||Math.abs(x-14)<2||plots({xp:300,expansion:4}).some(p=>Math.hypot(p.x-x,p.y-z)<2)||STATIONS.some(p=>Math.hypot(p.x-x,p.y-z)<3)||RESOURCES.some(p=>Math.hypot(p.x-x,p.y-z)<1.2))continue;const tree=billboard(treeTextures[i%4],x,z,3.4,4.2);tree.material.color.set('#a6af92');treeSprites.push(tree);shadow(x+.3,z,3.6);}
 const heroTextures=[personTexture('#8d493f',0),personTexture('#8d493f',1)];heroTextures.forEach(t=>resources.add(t));
 const hero=billboard(heroTextures[0],12,12,.85,1.4),heroShadow=shadow(12,12,.8);
 const npcTex=personTexture('#456273');resources.add(npcTex);for(const p of STATIONS.filter(p=>['mira','levi'].includes(p.id))){const sprite=billboard(npcTex,p.x,p.y,.85,1.4);sprite.userData.point={x:p.x,y:p.y};pickables.push(sprite);shadow(p.x,p.y,.8);}
 // Flowers, grass, collectibles and farm plants are pixel sprites placed within the 3D space.
 const herbTex=pixel(24,32,g=>{for(let i=0;i<8;i++){const x=3+hash(i,5)*19,y=13+hash(i,9)*17;fill(g,'#496a43',x,y,1,17-y);fill(g,i%2?'#c5b98b':'#e1c7b1',x-1,y-3,3,3);}});
 const tufts=[];for(let i=0;i<180;i++){const x=2+hash(i,11)*28,z=3+hash(i,15)*20;if(land(x,z)&&Math.abs(z-10)>.8&&Math.abs(x-14)>.8&&!plots({xp:300,expansion:4}).some(p=>Math.hypot(p.x-x,p.y-z)<.9)&&!STATIONS.some(p=>Math.hypot(p.x-x,p.y-z)<2))tufts.push({x,z});}
 const tuftGeo=track(new T.PlaneGeometry(1,1)),tuftMat=track(new T.MeshBasicMaterial({map:herbTex,transparent:true,alphaTest:.35,depthWrite:true})),tuftMesh=new T.InstancedMesh(tuftGeo,tuftMat,tufts.length),facing=new T.Object3D();facing.lookAt(offset);tufts.forEach((p,i)=>{matrix.compose(new T.Vector3(p.x,elevation(p.x,p.z)+.3,p.z),facing.quaternion,new T.Vector3(.55,.6,1));tuftMesh.setMatrixAt(i,matrix);});scene.add(tuftMesh);
 const cropTextures={};for(const [id,c] of Object.entries(CROPS)){cropTextures[id]=pixel(24,32,g=>{fill(g,'#4d7146',11,12,2,18);fill(g,'#69844b',5,16,6,3);fill(g,'#9ba86a',13,12,7,3);fill(g,c.color,7,4,10,11);fill(g,'#e6d5a2',9,4,5,2);});}
 const itemTextures={wood:woodTex,herb:herbTex,shell:pixel(24,24,g=>{fill(g,'#a39a81',5,15,15,4);fill(g,'#e5dabd',5,11,15,5);fill(g,'#efe2c8',8,7,9,5);for(let i=0;i<4;i++)fill(g,'#b8ad95',8+i*3,10,1,7);})};
 let dynamicKey='',dynamicMaterials=[],lastSeason='';
 function rebuild(s){dynamic.clear();dynamicMaterials.forEach(m=>m.dispose());dynamicMaterials=[];
  for(const p of plots(s)){const tile=new T.Mesh(boxGeo,soil);tile.scale.set(.85,.04,.85);tile.position.set(p.x,.56,p.y);tile.receiveShadow=true;tile.userData.point={x:p.x,y:p.y};dynamic.add(tile);const f=s.fields[p.id];if(f){const sprite=billboard(f.growth?cropTextures[f.crop]:herbTex,p.x,p.y,.55,.65,dynamic);sprite.userData.point={x:p.x,y:p.y};dynamicMaterials.push(sprite.material);if(f.watered)tile.material=soil;}}
  for(const p of RESOURCES.filter(p=>!s.gathered.includes(p.id))){const sprite=billboard(itemTextures[p.item],p.x,p.y,p.item==='wood'?.65:.45,p.item==='wood'?.2:.4,dynamic);sprite.userData.point={x:p.x,y:p.y};dynamicMaterials.push(sprite.material);}
 }
 // Atmospheric motes and glints are spatial particles, never a bitmap overlay.
 const motes=new Float32Array(120*3);for(let i=0;i<120;i++){motes[i*3]=2+hash(i,80)*31;motes[i*3+1]=.6+hash(i,81)*7;motes[i*3+2]=3+hash(i,82)*23;}const moteGeo=track(new T.BufferGeometry());moteGeo.setAttribute('position',new T.BufferAttribute(motes,3));const moteMat=track(new T.PointsMaterial({color:'#e5d7ac',size:.055,transparent:true,opacity:.5,depthWrite:false}));const particles=new T.Points(moteGeo,moteMat);scene.add(particles);
 // Scene/depth pass and a restrained, depth-aware focus/bloom pass.
 const rt=new T.WebGLRenderTarget(1,1,{depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)}),postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const uniforms={image:{value:rt.texture},depth:{value:rt.depthTexture},resolution:{value:new T.Vector2(1,1)},focus:{value:24},near:{value:.1},far:{value:180},clock:{value:0}};
 const post=track(new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 uvp;void main(){uvp=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 uvp;uniform sampler2D image;uniform sampler2D depth;uniform vec2 resolution;uniform float focus;uniform float near;uniform float far;uniform float clock;float distanceAt(vec2 p){float z=texture2D(depth,p).x*2.-1.;return 2.*near*far/(far+near-z*(far-near));}void main(){vec2 uv=uvp;float d=distanceAt(uv),blur=clamp(abs(d-focus)-3.,0.,12.)*.19;vec3 col=texture2D(image,uv).rgb;vec3 sum=col;float count=1.;for(int i=0;i<8;i++){float a=float(i)*.785398;vec2 off=vec2(cos(a),sin(a))/resolution;sum+=texture2D(image,uv+off*blur*2.).rgb;count+=1.;}col=mix(col,sum/count,min(.85,blur));vec3 bloom=vec3(0.);for(int i=0;i<4;i++){float a=float(i)*1.5708;vec3 p=texture2D(image,uv+vec2(cos(a),sin(a))*4./resolution).rgb;bloom+=max(p-vec3(.78),vec3(0.));}col+=bloom*.10;float vign=1.-.24*pow(length((uv-.5)*vec2(1.1,.9)),1.4);float grain=fract(sin(dot(uv*resolution,vec2(12.9898,78.233))+floor(clock*12.))*43758.5453);col=pow(col,vec3(.97))*vign+(grain-.5)*.008;gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}` }));postScene.add(new T.Mesh(track(new T.PlaneGeometry(2,2)),post));
 const marker=new T.Mesh(track(new T.RingGeometry(.29,.34,24)),track(new T.MeshBasicMaterial({color:'#efd69b',transparent:true,opacity:.8,depthWrite:false})));marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
 let w=0,h=0,disposed=false,renderScale=Math.min(devicePixelRatio||1,mobile?1:1.5),lastFrame=0,frames=0,intervals=[],median=0;
 function render(s,time,{title=false,moving=false,target:destination=null}={}){if(disposed)return;
  renderer.info.reset();const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);if(w!==width||h!==height){w=width;h=height;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const size=renderer.getDrawingBufferSize(new T.Vector2());rt.setSize(size.x,size.y);uniforms.resolution.value.copy(size);}
  const point=title?new T.Vector3(17,1,11):new T.Vector3(s.player.x,elevation(s.player.x,s.player.y)+.2,s.player.y);target.lerp(point,.13);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
  marker.visible=!!destination;if(destination)marker.position.set(destination.x,.59,destination.y);
  hero.position.set(s.player.x,elevation(s.player.x,s.player.y)+.7+(moving?Math.sin(time*13)*.025:0),s.player.y);hero.material.map=heroTextures[moving?Math.floor(time*7)%2:0];heroShadow.position.set(s.player.x,elevation(s.player.x,s.player.y)+.05,s.player.y);
  const signature=JSON.stringify([s.fields,s.gathered,s.expansion,s.xp>=100,s.xp>=200,s.xp>=300]);if(signature!==dynamicKey){dynamicKey=signature;rebuild(s);}
  const currentSeason=season(s);if(lastSeason!==currentSeason){lastSeason=currentSeason;grass.color.set(currentSeason==='冬'?'#d8e0dc':currentSeason==='秋'?'#d3b481':'#b6b99b');}
  const night=Math.max(0,(s.minute-1000)/320);sun.intensity=3.2-night*2.7;hemi.intensity=.85-night*.5;sun.color.set(night>.15?'#e5af7c':'#ffe1a4');lamps.forEach(l=>l.intensity=night*3);scene.fog.density=weather(s)==='薄雾'?.018:weather(s)==='雨'?.014:.008;waterUniforms.time.value=time;waterUniforms.night.value=night;particles.position.y=Math.sin(time*.2)*.15;uniforms.clock.value=time;
  uniforms.focus.value=camera.position.distanceTo(new T.Vector3(s.player.x,.8,s.player.y));if(title)uniforms.focus.value=camera.position.distanceTo(target);
  renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
  const elapsed=(time-lastFrame)*1000;lastFrame=time;frames++;if(frames>20&&elapsed>0&&elapsed<1000)intervals.push(elapsed);if(intervals.length>=60){const ordered=intervals.slice().sort((a,b)=>a-b);median=ordered[Math.floor(ordered.length/2)];intervals=[];if(median>58&&renderScale>.66){renderScale=Math.max(.65,renderScale*.8);renderer.setPixelRatio(renderScale);w=0;window.stGameReport?.({kind:'自动调整3D分辨率',pixelRatio:renderScale,frameIntervalMs:Math.round(median)},'info');}}
 }
 function world(x,y){const r=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects([...pickables,dynamic],true)[0];if(hit){let object=hit.object;while(object){if(object.userData.point)return {...object.userData.point};object=object.parent;}}if(hit)return {x:hit.point.x,y:hit.point.z};const p=new T.Vector3();ray.ray.intersectPlane(groundPlane,p);return {x:p.x,y:p.z};}
 function project(x,y){const p=new T.Vector3(x,elevation(x,y),y).project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
 function dispose(){if(disposed)return;disposed=true;scene.clear();for(const o of objects)o.dispose?.();for(const t of resources)t.dispose();dynamicMaterials.forEach(m=>m.dispose());rt.dispose();renderer.dispose();renderer.forceContextLoss();}
 return {render,world,project,dispose,inputVector:(x,y)=>{const angle=Math.atan2(offset.x,offset.z);return {x:x*Math.cos(angle)+y*Math.sin(angle),y:-x*Math.sin(angle)+y*Math.cos(angle)};},stats:()=>({calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,pixelRatio:renderScale,frameIntervalMs:Math.round(median),frames})};
}

import * as T from '../vendor/three.module.min.js';
import {SCENES,TREES,floorAt} from './world.js';
import {pixels,surfaceTexture,treeTexture,objectTexture,avatarAtlas,wallTexture,roofTexture,canvasTexture} from './assets.js';
import {avatarCanvas} from './avatar.js';
export const npcProfiles={mira:{race:'elf',hair:'long',hairColor:'silver',clothColor:'pine',outfit:'coat'},lan:{race:'tidal',hair:'short',hairColor:'teal',skin:'sea',clothColor:'ocean',outfit:'jacket'},construct:{race:'construct',hair:'bob',hairColor:'silver',skin:'copper',clothColor:'ochre',outfit:'robe'}};
const hash=(n,k=0)=>{let v=Math.imul(n+67,374761393)^Math.imul(k+29,668265263);return (Math.imul(v^(v>>>13),1274126177)>>>0)/4294967296;};
export function createEnclaveRenderer(canvas,appearance){
 const touch=matchMedia('(pointer:coarse)').matches,renderer=new T.WebGLRenderer({canvas,antialias:!touch,powerPreference:'low-power',preserveDrawingBuffer:false});
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.info.autoReset=false;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,touch?1:1.5));
 renderer.debug.onShaderError=(gl,p,v,f)=>window.stGameReport?.({kind:'着色器编译',message:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
 const scene=new T.Scene();scene.background=new T.Color('#779b9e');scene.fog=new T.FogExp2('#adc3b4',.012);
 const camera=new T.OrthographicCamera(-10,10,7,-7,.1,120),target=new T.Vector3(16,.5,15),offset=new T.Vector3(8.5,14,18),ray=new T.Raycaster(),vector=new T.Vector3();
 const ambient=new T.HemisphereLight('#eef2de','#435c61',2);scene.add(ambient);
 const sun=new T.DirectionalLight('#fff0ce',2.4);sun.position.set(-15,28,12);sun.target.position.set(19,0,14);sun.castShadow=true;sun.shadow.mapSize.set(touch?512:1024,touch?512:1024);Object.assign(sun.shadow.camera,{left:-32,right:32,top:30,bottom:-30,near:1,far:90});sun.shadow.bias=-.0003;sun.shadow.normalBias=.045;scene.add(sun,sun.target);
 const world=new T.Group();scene.add(world);let owned=[],floorMeshes=[],trees=[],enemies=new Map(),objects=new Map(),waterUniforms=null,loaded='',disposed=false;
 let atlas,heroMaterial,hero,trails=[];
 const heroShadow=new T.Mesh(new T.PlaneGeometry(1.2,.75),new T.MeshBasicMaterial({map:pixels(64,48,g=>{const r=g.createRadialGradient(32,24,2,32,24,29);r.addColorStop(0,'#142d2e88');r.addColorStop(1,'#142d2e00');g.fillStyle=r;g.fillRect(0,0,64,48);}),transparent:true,depthWrite:false}));heroShadow.rotation.x=-Math.PI/2;
 function setAppearance(profile){if(hero)world.remove(hero);atlas?.texture.dispose();heroMaterial?.dispose();atlas=avatarAtlas(profile);heroMaterial=new T.SpriteMaterial({map:atlas.texture,transparent:true,alphaTest:.12,depthWrite:true,color:'#fff4df'});hero=new T.Sprite(heroMaterial);hero.scale.set(1.3,2.08,1);world.add(hero);for(const t of trails){t.mesh.material.map=atlas.texture;t.mesh.visible=false;t.life=0;}}
 setAppearance(appearance);
 const rt=new T.WebGLRenderTarget(1,1,{depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)}),postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const uniforms={image:{value:rt.texture},depth:{value:rt.depthTexture},resolution:{value:new T.Vector2(1,1)},focus:{value:24},near:{value:.1},far:{value:120}};
 const postMaterial=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 p;uniform sampler2D image;uniform sampler2D depth;uniform vec2 resolution;uniform float focus;uniform float near;uniform float far;void main(){float d=mix(near,far,texture2D(depth,p).x);float blur=clamp((abs(d-focus)-4.)*.07,0.,.46);vec2 a=vec2(2.)/resolution;vec3 c=texture2D(image,p).rgb;vec3 b=(texture2D(image,p+vec2(a.x,0.)).rgb+texture2D(image,p-vec2(a.x,0.)).rgb+texture2D(image,p+vec2(0.,a.y)).rgb+texture2D(image,p-vec2(0.,a.y)).rgb)*.25;c=mix(c,b,blur);c*=1.-.12*pow(length((p-.5)*1.35),1.8);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
 const postQuad=new T.Mesh(new T.PlaneGeometry(2,2),postMaterial);postScene.add(postQuad);
 const fxTexture=pixels(64,64,g=>{const r=g.createRadialGradient(32,32,5,32,32,31);r.addColorStop(0,'#ecf1c900');r.addColorStop(.6,'#fff3c800');r.addColorStop(.8,'#fff5caef');r.addColorStop(.91,'#d6e4bd88');r.addColorStop(1,'#d6e4bd00');g.fillStyle=r;g.fillRect(0,0,64,64);});
 const effects=Array.from({length:12},()=>{const material=new T.MeshBasicMaterial({map:fxTexture,transparent:true,depthWrite:false,side:T.DoubleSide}),mesh=new T.Mesh(new T.PlaneGeometry(1,1),material);mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);return {mesh,age:0,life:0,size:1};});
 const ward=new T.Mesh(new T.SphereGeometry(1.05,12,8),new T.MeshBasicMaterial({color:'#8fc9de',wireframe:true,transparent:true,opacity:.24,depthWrite:false}));ward.visible=false;scene.add(ward);
 trails=Array.from({length:4},()=>{const material=new T.SpriteMaterial({map:atlas.texture,transparent:true,opacity:0,depthWrite:false,color:'#b7dedb'}),mesh=new T.Sprite(material);mesh.scale.set(1.3,2.08,1);mesh.visible=false;scene.add(mesh);return {mesh,life:0};});let trailClock=0;
 function emit(event,state){if(!['echo','wind','water','hit','block','land'].includes(event.kind))return;const item=effects.find(x=>!x.mesh.visible)||effects[0];item.age=0;item.life=event.kind==='echo'?.8:.35;item.size=event.kind==='echo'?12:event.kind==='hit'?1.7:2.5;item.mesh.position.set(event.x??state.player.x,(event.y??state.player.y)+.15,event.z??state.player.z);item.mesh.material.color.set(event.kind==='hit'?'#f4d9a1':event.kind==='water'?'#9ac5dc':'#d9e7ba');item.mesh.visible=true;}
 const own=o=>{owned.push(o);return o;};
 function clearWorld(){world.clear();for(const o of owned)o.dispose?.();owned=[];floorMeshes=[];trees=[];enemies.clear();objects.clear();world.add(hero,heroShadow);effects.forEach(e=>e.mesh.visible=false);ward.visible=false;trails.forEach(t=>t.mesh.visible=false);}
 function load(id){
  clearWorld();loaded=id;const data=SCENES[id],mats=new Map(),geos=new Map();
  scene.background.set(data.kind==='ruins'?'#6d8589':'#779b9e');scene.fog.color.set(data.kind==='ruins'?'#91ada6':'#adc3b4');
  const tex=k=>{if(!mats.has('tex:'+k)){const t=own(surfaceTexture(k));t.wrapS=t.wrapT=T.RepeatWrapping;mats.set('tex:'+k,t);}return mats.get('tex:'+k);};
  const material=(color,map=null,extra={})=>{const key=JSON.stringify([color,map?.uuid,extra]);if(!mats.has(key))mats.set(key,own(new T.MeshLambertMaterial({color,map,...extra})));return mats.get(key);};
  const geometry=(key,make)=>{if(!geos.has(key))geos.set(key,own(make()));return geos.get(key);};
  const boxGeo=geometry('box',()=>new T.BoxGeometry(1,1,1)),wood=material('#dfc7a0',tex('wood')),stone=material('#d9d8c4',tex('rock')),beam=material('#66594a'),trim=material('#cfbc91');
  const box=(x,y,z,w,h,d,m,parent=world)=>{const mesh=new T.Mesh(boxGeo,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const sprite=(texture,x,y,z,w,h)=>{const mesh=new T.Sprite(own(new T.SpriteMaterial({map:texture,alphaTest:.18,transparent:true,depthWrite:true,color:'#f6efdb'})));mesh.position.set(x,y+h/2,z);mesh.scale.set(w,h,1);world.add(mesh);return mesh;};
  function surface(r,platform=false){const shape=new T.Shape(),w=r.w,d=r.d,round=platform?.12:.55;shape.moveTo(-w/2+round,-d/2);shape.lineTo(w/2-round,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+round);shape.lineTo(w/2,d/2-round);shape.quadraticCurveTo(w/2,d/2,w/2-round,d/2);shape.lineTo(-w/2+round,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-round);shape.lineTo(-w/2,-d/2+round);shape.quadraticCurveTo(-w/2,-d/2,-w/2+round,-d/2);
   const geo=own(new T.ExtrudeGeometry(shape,{depth:r.h+1.35,bevelEnabled:false,steps:1,curveSegments:3}));geo.rotateX(-Math.PI/2);const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*.28,uv.getY(i)*.28);const mesh=new T.Mesh(geo,[material(data.kind==='ruins'?'#a4b6a2':'#d9dfc4',tex(platform?'rock':'grass')),material('#98a89c',tex('rock'))]);mesh.position.set(r.x+w/2,-1.35,r.z+d/2);mesh.castShadow=mesh.receiveShadow=true;world.add(mesh);floorMeshes.push(mesh);
   if(!platform){const rim=shape.clone(),inner=new T.Path();const inset=.42;inner.moveTo(-w/2+inset,-d/2+inset);inner.lineTo(-w/2+inset,d/2-inset);inner.lineTo(w/2-inset,d/2-inset);inner.lineTo(w/2-inset,-d/2+inset);inner.closePath();rim.holes.push(inner);const edge=new T.Mesh(own(new T.ShapeGeometry(rim)),material(data.kind==='ruins'?'#bac0a3':'#d7c7a0'));edge.rotation.x=-Math.PI/2;edge.position.set(r.x+w/2,r.h+.012,r.z+d/2);edge.receiveShadow=true;world.add(edge);}
  }
  data.floors.forEach(r=>surface(r));(data.platforms||[]).forEach(r=>surface(r,true));
  waterUniforms={time:{value:0}};const waterMat=own(new T.ShaderMaterial({uniforms:waterUniforms,vertexShader:'varying vec3 w;void main(){vec4 q=modelMatrix*vec4(position,1.);w=q.xyz;gl_Position=projectionMatrix*viewMatrix*q;}',fragmentShader:'varying vec3 w;uniform float time;void main(){float r=sin(w.x*2.+time*.8)*sin(w.z*2.7-time*.5);float g=pow(max(0.,sin(w.x*1.3+w.z*.9+time*.4)),18.)*pow(max(0.,sin(w.x*.7-w.z*1.7-time*.35)),12.);vec3 c=mix(vec3(.025,.105,.14),vec3(.08,.27,.27),.5+.2*sin(w.z*.17));c+=smoothstep(.87,.95,r)*.018+g*.018;gl_FragColor=vec4(c,1.);}'}));const sea=new T.Mesh(geometry('sea',()=>new T.PlaneGeometry(180,180)),waterMat);sea.rotation.x=-Math.PI/2;sea.position.set(20,-1.15,18);world.add(sea);
  if(data.kind==='town'){
   for(const [x,z,w,d] of [[15,1,2,22],[3,11,32,2],[15,19,17,1.5]])box(x+w/2,.025,z+d/2,w,.04,d,material('#e4dfbf',tex('path')));
   const walls=new Map(),roofs=new Map();
   function house(r){const group=new T.Group();group.position.set(r.x+r.w/2,0,r.z+r.d/2);world.add(group);const kind=r.id==='shop'?'shop':r.id==='workshop'?'craft':'home';if(!walls.has(kind))walls.set(kind,own(wallTexture(kind)));if(!roofs.has(kind))roofs.set(kind,own(roofTexture(kind!=='home')));const wall=walls.get(kind),roof=roofs.get(kind),h=r.h-1.35;
    box(0,h/2,0,r.w,h,r.d,material('#e5e0cc',wall),group);box(0,.17,0,r.w+.2,.34,r.d+.2,stone,group);const half=r.w/2+.3,rise=1.5,len=Math.hypot(half,rise);
    for(const sign of [-1,1]){const panel=new T.Mesh(geometry('roof:'+r.w+':'+r.d,()=>new T.PlaneGeometry(len,r.d+.6)),material('#f3e5ca',roof,{side:T.DoubleSide}));panel.rotation.set(-Math.PI/2,0,-sign*Math.atan2(rise,half),'ZYX');panel.position.set(sign*half/2,h+rise/2,0);panel.castShadow=panel.receiveShadow=true;group.add(panel);}
    const triangle=new T.Shape();triangle.moveTo(-r.w/2,0);triangle.lineTo(r.w/2,0);triangle.lineTo(0,rise);triangle.closePath();const geo=geometry('gable:'+r.w,()=>new T.ShapeGeometry(triangle));
    for(const z of [-r.d/2,r.d/2]){const face=new T.Mesh(geo,material('#a39170',null,{side:T.DoubleSide}));face.position.set(0,h,z);group.add(face);box(0,h+.04,z,r.w,.12,.13,beam,group);box(0,h+.75,z,.13,1.4,.13,beam,group);}
    box(0,h+rise,.02,.16,.14,r.d+.8,beam,group);for(const x of [-r.w/2,r.w/2])box(x,h-.04,0,.14,.14,r.d+.5,beam,group);
    box(0,h+.57,r.d/2+.04,.8,.62,.1,material('#e9cb92',null,{emissive:'#aa7c4f',emissiveIntensity:.15}),group);box(0,h+.57,r.d/2+.12,.05,.62,.06,beam,group);box(0,h+.57,r.d/2+.12,.8,.05,.06,beam,group);
    box(r.w*.28,h+.7,-.6,.5,1.5,.55,stone,group);box(r.w*.28,h+1.5,-.6,.65,.16,.69,trim,group);
    if(kind==='shop'){for(let i=0;i<12;i++)box(-r.w/2+.2+i*r.w/12,2.06,r.d/2+.5,r.w/12+.01,.1,1.1,material(i%2?'#e3d4b2':'#5d8386'),group);for(const x of [-r.w/2+.3,r.w/2-.3])box(x,1.05,r.d/2+1,.08,2.1,.08,beam,group);}
    if(kind==='home'){box(0,1.25,r.d/2+.45,2.3,.13,.75,wood,group);for(let i=0;i<6;i++)box(-1+i*.4,1.53,r.d/2+.75,.07,.6,.07,beam,group);box(0,1.84,r.d/2+.75,2.3,.08,.08,trim,group);}
   }
   data.solids.filter(r=>r.h>3).forEach(house);
   // A neighboring row suggests the city beyond this walkable district.
   for(let i=0;i<6;i++)house({id:i%2?'home':'shop',x:-3+i*7,z:-7,w:5,d:3.3,h:4.3});
   for(let z=25;z<31;z++)box(28.5,-.04,z,5,.16,1.02,wood);
   for(const [x,z] of [[3,10],[17,4],[27,11],[15,18],[31,23]]){box(x,1.4,z,.12,2.8,.12,beam);sprite(own(objectTexture('lantern')),x,2.25,z,.37,.5);}
   for(let i=0;i<9;i++)box(3.7+i*.45,.5,13.7,.08,1,.08,wood);box(5.5,.7,13.7,4,.08,.08,trim);
   for(let i=0;i<6;i++)box(4.3+i%3*.65,.025,14.5+Math.floor(i/3)*.65,.58,.05,.58,material('#866e52',tex('wood')));
  }
  for(const r of data.solids.filter(r=>r.h<3)){
   if(r.id==='crate'){box(r.x+r.w/2,r.h/2,r.z+r.d/2,r.w,r.h,r.d,wood);box(r.x+r.w/2,r.h*.5,r.z+r.d+.01,r.w*.08,r.h*.8,.04,beam);}
   else if(data.kind==='ruins'){box(r.x+r.w/2,r.h/2,r.z+r.d/2,r.w,r.h,r.d,stone);box(r.x+r.w/2,r.h+.08,r.z+r.d/2,r.w+.25,.16,r.d+.25,stone);}
   else{const m=new T.Mesh(geometry('rock',()=>new T.DodecahedronGeometry(1,1)),stone);m.position.set(r.x+r.w/2,r.h/2,r.z+r.d/2);m.scale.set(r.w*.6,r.h*.7,r.d*.6);m.castShadow=m.receiveShadow=true;world.add(m);}
  }
  if(data.kind==='ruins')for(const [x,z] of [[2,3],[26,3],[27,24],[3,25]]){box(x,1.55,z,.7,3.1,.7,stone);box(x,3.2,z,1,.2,1,stone);}
  const treeTex=Array.from({length:3},(_,i)=>own(treeTexture(data.kind==='ruins'?i+3:i)));
  const treePositions=TREES[id]||[];
  for(const [i,[x,z]] of treePositions.entries()){const top=floorAt(data,x,z);if(!Number.isFinite(top))continue;const t=sprite(treeTex[i%3],x,top,z,3.5,4.6);trees.push(t);}
  // Ground detail uses a single instanced plane batch per texture.
  const herb=own(objectTexture('herb')),tuftMaterial=own(new T.MeshBasicMaterial({map:herb,alphaTest:.2,transparent:true,depthWrite:true})),tuftGeo=geometry('tuft',()=>new T.PlaneGeometry(.45,.65)),cells=[];
  for(let i=0;i<100;i++){const x=1+hash(i,2)*(data.bounds.w-2),z=1+hash(i,3)*(data.bounds.d-2),top=floorAt(data,x,z);if(Number.isFinite(top)&&!data.solids.some(r=>x>r.x-.5&&x<r.x+r.w+.5&&z>r.z-.5&&z<r.z+r.d+.5)&&Math.abs(x-16)>1.5)cells.push({x,z,y:top});}
  const tufts=own(new T.InstancedMesh(tuftGeo,tuftMaterial,cells.length)),dummy=new T.Object3D();dummy.lookAt(offset);cells.forEach((p,i)=>{dummy.position.set(p.x,p.y+.32,p.z);dummy.updateMatrix();tufts.setMatrixAt(i,dummy.matrix);});world.add(tufts);
  for(const o of data.objects){let mesh=null;const y=o.y||0;
   if(o.type==='person'){const texture=own(canvasTexture(avatarCanvas(npcProfiles[o.id]||{})));mesh=sprite(texture,o.x,y,o.z,1.3,2.08);}
   if(o.type==='gather')mesh=sprite(own(objectTexture(o.item)),o.x,y,o.z,.7,o.item==='wood'?.45:.9);
   if(o.type==='beacon'){mesh=new T.Group();mesh.position.set(o.x,y,o.z);world.add(mesh);box(0,.6,0,.32,1.2,.32,stone,mesh);box(0,1.25,0,.64,.13,.64,trim,mesh);const glow=new T.Mesh(geometry('beacon-light',()=>new T.OctahedronGeometry(.2,0)),own(new T.MeshBasicMaterial({color:'#6b9295'})));glow.position.y=1.6;mesh.add(glow);mesh.userData.glow=glow;}
   if(o.type==='cache'||o.type==='secret'){mesh=new T.Group();mesh.position.set(o.x,y,o.z);world.add(mesh);box(0,.25,0,.65,.5,.5,wood,mesh);box(0,.52,0,.73,.12,.58,trim,mesh);}
   if(o.type==='dummy'){mesh=new T.Group();mesh.position.set(o.x,0,o.z);world.add(mesh);box(0,.8,0,.15,1.6,.15,wood,mesh);box(0,1.4,0,1.2,.12,.13,wood,mesh);const head=new T.Mesh(geometry('dummy-head',()=>new T.SphereGeometry(.28,8,6)),wood);head.position.y=1.8;mesh.add(head);}
   if(o.type==='board'){mesh=box(o.x,1.2,o.z,1.15,1.1,.12,wood);box(o.x,.4,o.z,.12,.8,.15,beam);box(o.x,1.2,o.z+.08,.9,.8,.03,material('#e3d2ac'));}
   if(o.type==='travel'){const m=new T.Mesh(geometry('travel-ring',()=>new T.RingGeometry(.55,.62,32)),own(new T.MeshBasicMaterial({color:'#e1d6a3',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide})));m.rotation.x=-Math.PI/2;m.position.set(o.x,y+.045,o.z);world.add(m);mesh=m;}
   if(mesh)objects.set(o.id,{mesh,data:o});
  }
  // Batch static boxes with common material. Dynamic objects keep their own visibility/state.
  world.updateMatrixWorld(true);const groups=new Map(),mutable=new Set([...objects.values()].map(x=>x.mesh));
  world.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.geometry!==boxGeo)return;let p=o;while(p){if(mutable.has(p))return;p=p.parent;}const key=o.material.uuid;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
  for(const list of groups.values()){if(list.length<2)continue;const m=own(new T.InstancedMesh(boxGeo,list[0].material,list.length));m.castShadow=m.receiveShadow=true;list.forEach((o,i)=>{m.setMatrixAt(i,o.matrixWorld);o.removeFromParent();});world.add(m);}
  renderer.shadowMap.needsUpdate=true;target.set(data.spawn.x,.7,data.spawn.z);
 }
 function setEnemies(list){for(const [id,obj] of enemies){world.remove(obj,obj.userData.tell);obj.material.dispose();}enemies.clear();const tex=own(objectTexture('rift'));for(const e of list){const m=new T.Sprite(own(new T.SpriteMaterial({map:tex,alphaTest:.1,transparent:true,color:'#e1eee0'})));m.scale.set(1.25,1.55,1);world.add(m);const tell=new T.Mesh(own(new T.RingGeometry(.4,.48,24)),own(new T.MeshBasicMaterial({color:'#d6a180',transparent:true,opacity:.65,depthWrite:false,side:T.DoubleSide})));tell.rotation.x=-Math.PI/2;tell.visible=false;world.add(tell);m.userData.tell=tell;enemies.set(e.id,m);}}
 let width=0,height=0,frames=0,lastTime=0,intervals=[],median=0,scale=Math.min(devicePixelRatio||1,touch?1:1.5);
 function render(state,time,dt=1/30,{title=false,enemies:enemyList=[]}={}){
  if(disposed)return;if(loaded!==state.scene)load(state.scene);
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);if(width!==w||height!==h){width=w;height=h;renderer.setSize(w,h,false);const half=touch?6.2:7.2;camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();const size=renderer.getDrawingBufferSize(new T.Vector2());rt.setSize(size.x,size.y);uniforms.resolution.value.copy(size);}
  const p=state.player;vector.set(p.x,.7+Math.min(1,p.y*.25),p.z);target.lerp(vector,Math.min(1,dt*7));camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
  hero.position.set(p.x,p.y+1.04-(p.land>0?.06:0),p.z);hero.visible=!(p.hurt>0&&Math.floor(time*16)%2);const angle=Math.atan2(offset.x,offset.z),sx=p.faceX*Math.cos(angle)-p.faceZ*Math.sin(angle),sy=p.faceX*Math.sin(angle)+p.faceZ*Math.cos(angle),view=sy<-.2?'back':'side';
  const moving=Math.hypot(p.vx,p.vz),pose=p.dash>0?'dash':p.attack>0?'attack':p.ward>0?'guard':!p.grounded?p.vy>0?'jump':'fall':p.land>0?'land':moving>4.5?'run':moving>.3?'walk':'idle';
  const choices=atlas.lookup[view+':'+pose],index=choices[pose==='attack'?Math.min(choices.length-1,Math.floor((1-p.attack/(.26+p.combo*.055))*choices.length)):Math.floor(time*(pose==='run'?11:7))%choices.length]||0,col=index%atlas.columns,row=Math.floor(index/atlas.columns),flip=sx<-.18;
  atlas.texture.repeat.set((flip?-1:1)/atlas.columns,1/atlas.rows);atlas.texture.offset.set((col+(flip?1:0))/atlas.columns,1-(row+1)/atlas.rows);
  const ground=floorAt(SCENES[state.scene],p.x,p.z);heroShadow.visible=Number.isFinite(ground);heroShadow.position.set(p.x,ground+.035,p.z);heroShadow.scale.setScalar(Math.max(.4,1-(p.y-ground)*.15));heroShadow.material.opacity=Math.max(.12,.8-(p.y-ground)*.18);
  for(const t of trees){const d=Math.hypot(t.position.x-p.x,t.position.z-p.z);t.material.opacity=d<2.1&&t.position.z>p.z?.25:1;t.material.depthWrite=t.material.opacity===1;}
  for(const {mesh,data:o} of objects.values()){
   const key=state.scene+':'+o.id;if(o.type==='gather')mesh.visible=!state.gathered.includes(key);if(o.type==='cache'||o.type==='secret')mesh.visible=!state.found.includes(key)&&(o.type!=='secret'||!!state.flags[key]);
   if(o.type==='beacon'){mesh.userData.glow.material.color.set(state.flags[o.id]?'#e9d49a':'#6b9295');mesh.userData.glow.rotation.y=time*.6;}
  }
  for(const e of enemyList){const m=enemies.get(e.id);if(!m)continue;m.visible=e.hp>0;m.position.set(e.x,.85+Math.sin(time*3+e.x)*.08,e.z);m.material.color.set(e.hurt>0?'#ffe2b1':e.phase==='windup'?'#d59d93':e.phase==='rest'?'#80999b':'#d5e8de');const tell=m.userData.tell;tell.visible=e.hp>0&&(e.phase==='windup'||e.phase==='rush');tell.position.set(e.x+e.vx*.6,.045,e.z+e.vz*.6);tell.scale.setScalar(e.phase==='rush'?2.3:1+(1-e.timer/.6)*1.3);}
  ward.visible=p.ward>0;ward.position.set(p.x,p.y+1,p.z);ward.rotation.y=time*.7;ward.material.opacity=.15+Math.min(1,p.ward)*.12;
  trailClock+=dt;if(p.dash>0&&trailClock>.035){trailClock=0;const t=trails.find(t=>t.life<=0)||trails[0];t.life=.16;t.mesh.position.copy(hero.position);t.mesh.material.map=atlas.texture;t.mesh.visible=true;}for(const t of trails){t.life-=dt;t.mesh.visible=t.life>0;t.mesh.material.opacity=Math.max(0,t.life)*1.7;}
  waterUniforms.time.value=time;uniforms.focus.value=camera.position.distanceTo(target);const night=Math.max(0,(state.minute-1040)/280);sun.intensity=2.4-night*1.8;ambient.intensity=2-night*.9;
  for(const f of effects){if(!f.mesh.visible)continue;f.age+=dt;const a=f.age/f.life;if(a>=1){f.mesh.visible=false;continue;}f.mesh.scale.setScalar(f.size*(.2+a*.8));f.mesh.material.opacity=(1-a)*.8;}
  renderer.info.reset();renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCamera);frames++;
  const elapsed=(time-lastTime)*1000;lastTime=time;if(frames>20&&elapsed>0&&elapsed<500)intervals.push(elapsed);if(intervals.length>=60){median=intervals.slice().sort((a,b)=>a-b)[30];intervals=[];if(median>58&&scale>.66){scale=Math.max(.65,scale*.8);renderer.setPixelRatio(scale);width=0;window.stGameReport?.({kind:'自动调整渲染分辨率',pixelRatio:scale,frameIntervalMs:Math.round(median)},'info');}}
 }
 function project(x,z,y=0){const r=canvas.getBoundingClientRect();vector.set(x,y,z).project(camera);return {x:r.left+(vector.x+1)*r.width/2,y:r.top+(1-vector.y)*r.height/2};}
 function point(x,y){const r=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);const hit=ray.intersectObjects(floorMeshes,false)[0];return hit?{x:hit.point.x,z:hit.point.z,y:hit.point.y}:null;}
 function dispose(){if(disposed)return;disposed=true;clearWorld();world.clear();atlas?.texture.dispose();heroMaterial?.dispose();heroShadow.geometry.dispose();heroShadow.material.map.dispose();heroShadow.material.dispose();effects.forEach(f=>{f.mesh.geometry.dispose();f.mesh.material.dispose();});ward.geometry.dispose();ward.material.dispose();trails.forEach(t=>t.mesh.material.dispose());fxTexture.dispose();rt.dispose();postQuad.geometry.dispose();postMaterial.dispose();renderer.dispose();renderer.forceContextLoss();}
 load('whalebay');return {render,load,setAppearance,setEnemies,emit,project,point,dispose,inputVector:(x,z)=>{const a=Math.atan2(offset.x,offset.z);return {x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};},stats:()=>({scene:loaded,frames,calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,pixelRatio:scale,frameIntervalMs:Math.round(median)})};
}

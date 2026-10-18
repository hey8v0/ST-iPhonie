// Original, layered character art. Appearance is shared by every scene and camera mode.
export const AVATAR_OPTIONS = Object.freeze({
 race:[['human','人类'],['elf','精灵'],['beast','兽族'],['tidal','水栖族'],['construct','构造体']],
 body:[['balanced','匀称'],['slender','纤细'],['broad','结实']],
 face:[['soft','柔和'],['round','圆润'],['sharp','清秀']],
 hair:[['short','短发'],['bob','齐肩'],['long','长发'],['ponytail','束发'],['braid','侧辫'],['wave','卷发']],
 outfit:[['jacket','短外套'],['coat','旅行长衣'],['robe','披肩长袍'],['overalls','工装']],
 accessory:[['none','无'],['scarf','围巾'],['glasses','眼镜'],['earring','耳饰']],
 skin:[['ivory','象牙','#edc4a3'],['sand','浅麦','#d9aa82'],['amber','暖棕','#b6815e'],['umber','深棕','#805543'],['pearl','冷白','#ddd1bc'],['sea','浅青','#a7c7be'],['slate','青灰','#7fa6ad'],['copper','古铜','#a48e70']],
 hairColor:[['ink','墨黑','#353e50'],['chestnut','栗棕','#77523f'],['honey','蜜金','#b59356'],['silver','银白','#c6cdcb'],['wine','酒红','#875566'],['teal','青蓝','#477982'],['violet','灰紫','#80758f'],['rose','粉棕','#bc8f97']],
 eyeColor:[['jade','青绿','#467b78'],['blue','海蓝','#577f9b'],['amber','琥珀','#a17b45'],['rose','绯红','#a26c80'],['violet','紫罗兰','#8471a0'],['dark','深褐','#4b4946']],
 clothColor:[['ocean','雾蓝','#547e8c'],['pine','松绿','#607c6b'],['claret','莓红','#9b5b68'],['ochre','赭金','#b18b55'],['plum','灰紫','#82728d'],['cream','米白','#cbc2a8'],['coal','炭灰','#505d66'],['coral','珊瑚','#ba8272']],
});
export const DEFAULT_AVATAR=Object.freeze({name:'新居民',race:'human',body:'balanced',face:'soft',hair:'ponytail',outfit:'jacket',accessory:'scarf',skin:'ivory',hairColor:'chestnut',eyeColor:'jade',clothColor:'ocean'});
export function normalizeAvatar(value={}){
 const result={...DEFAULT_AVATAR};
 if(value&&typeof value==='object'){
  result.name=Array.from(String(value.name||'').replace(/[\u0000-\u001f<>]/g,'').trim()).slice(0,16).join('')||DEFAULT_AVATAR.name;
  for(const [key,rows] of Object.entries(AVATAR_OPTIONS))if(rows.some(row=>row[0]===value[key]))result[key]=value[key];
 }
 return result;
}
export function randomAvatar(random=Math.random){const p={...DEFAULT_AVATAR};for(const [key,rows] of Object.entries(AVATAR_OPTIONS))p[key]=rows[Math.min(rows.length-1,Math.max(0,Math.floor(random()*rows.length)))][0];return p;}
export const avatarColor=(profile,key)=>AVATAR_OPTIONS[key]?.find(row=>row[0]===profile[key])?.[2]||'#808080';
function tint(hex,amount){const n=parseInt(hex.slice(1),16),mix=x=>Math.round(amount>0?x+(255-x)*amount:x*(1+amount));return '#'+[n>>16,(n>>8)&255,n&255].map(x=>mix(x).toString(16).padStart(2,'0')).join('');}

/** 80×128 original sprite. Pose is an actual silhouette change, not a whole-image bob. */
export function avatarCanvas(value,pose='idle',phase=0,view='side'){
 const a=normalizeAvatar(value),c=document.createElement('canvas');c.width=80;c.height=128;
 const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.lineJoin='round';
 const ink='#283b48',skin=avatarColor(a,'skin'),hair=avatarColor(a,'hairColor'),cloth=avatarColor(a,'clothColor'),eye=avatarColor(a,'eyeColor');
 const darkSkin=tint(skin,-.22),lightSkin=tint(skin,.22),darkHair=tint(hair,-.27),lightHair=tint(hair,.3),darkCloth=tint(cloth,-.28),lightCloth=tint(cloth,.27);
 const broad=a.body==='broad'?3:a.body==='slender'?-2:0,walking=pose==='run'||pose==='walk',step=walking?Math.sin(phase*Math.PI*2):0;
 const crouch=pose==='land'?4:pose==='guard'?2:0,lean=pose==='run'?4:pose==='attack'?7:pose==='dash'?13:0;
 const jumping=pose==='jump'||pose==='fall',back=view==='back';
 const rect=(color,x,y,w,h)=>{g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
 const poly=(color,points,outline=true)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(Math.round(x),Math.round(y)):g.moveTo(Math.round(x),Math.round(y)));g.closePath();g.fillStyle=color;g.fill();if(outline){g.strokeStyle=ink;g.lineWidth=1.6;g.stroke();}};
 const oval=(color,x,y,rx,ry,outline=true)=>{g.beginPath();g.ellipse(Math.round(x),Math.round(y),rx,ry,0,0,Math.PI*2);g.fillStyle=color;g.fill();if(outline){g.strokeStyle=ink;g.lineWidth=1.5;g.stroke();}};
 // Back hair and a loose coat tail react to the walk cycle.
 if(['long','wave','braid'].includes(a.hair))poly(darkHair,[[24,29],[49,27],[55,52],[54-step*2,85+crouch],[45,94+crouch],[38,80],[27,91],[22,64]]);
 if(a.hair==='ponytail'){poly(darkHair,[[26,28],[15,35],[12-step*2,48],[15-step*3,66],[23,57],[29,43]]);poly(hair,[[22,34],[16,42],[17-step*2,57],[22,52],[26,38]],false);}
 if(a.outfit==='coat'||a.outfit==='robe')poly(darkCloth,[[26-broad,64],[49+broad,64],[54-step*2,98+crouch],[39,94+crouch],[21+step*2,100+crouch]]);
 // Boots and legs, articulated at the knee.
 for(const [i,origin] of [[0,31],[1,45]]){
  const stride=(i?1:-1)*step*9,up=jumping?(i?7:1):0;
  poly(i?'#4a5663':'#66717a',[[origin-5,89+crouch],[origin+4,89+crouch],[origin+stride+4,104-up],[origin+stride+3,117-up],[origin+stride-5,117-up],[origin+stride-6,105-up]]);
  rect('#89918c',origin+stride-4,105-up,2,9);
  poly('#43515b',[[origin+stride-6,113-up],[origin+stride+4,113-up],[origin+stride+8,120-up],[origin+stride+7,123-up],[origin+stride-7,123-up]]);
  rect('#b3a387',origin+stride-5,114-up,8,2);rect('#223944',origin+stride-6,121-up,14,2);
 }
 g.save();g.translate(lean,crouch);
 // Rear arm; a spell stance raises the hand rather than shifting the whole sprite.
 const spell=pose==='cast',attack=pose==='attack',guard=pose==='guard';
 poly(darkCloth,[[25-broad,59],[19-broad,63],[17+step*3,80],[22+step*3,85],[27,71]]);
 oval(darkSkin,21+step*3,86,3.5,5.5);rect(lightSkin,19+step*3,84,2,4);
 // Tunic, waist, lapels, stitching and asymmetric satchel.
 poly(cloth,[[28-broad,55],[46+broad,55],[51+broad,68],[49+broad,88],[44,94],[27-broad,94],[24-broad,86],[24-broad,67]]);
 poly(lightCloth,[[28-broad,58],[36,57],[35,87],[27-broad,87]],false);poly(darkCloth,[[44,61],[48+broad,67],[47+broad,87],[40,89],[39,72]],false);
 if(a.outfit==='overalls'){poly('#c9b68f',[[30,57],[33,57],[33,68],[42,68],[42,57],[45,57],[46,91],[28,91]],false);rect('#8d9b9c',32,71,11,12);rect('#e7d3a7',33,72,9,1);}
 else if(a.outfit==='robe'){poly(tint(cloth,.4),[[26-broad,57],[36,62],[48+broad,57],[51+broad,69],[40,75],[23-broad,68]]);rect('#d4bd81',36,63,3,5);}
 else{poly('#cfc4a2',[[30,57],[36,60],[33,70],[27,61]],false);poly('#83968b',[[43,57],[37,60],[40,70],[47,61]],false);for(const y of [72,79,85])rect('#dfc99d',36,y,2,2);}
 rect('#725a4c',25-broad,89,24+broad*2,3);rect('#c9b17d',36,88,6,5);rect('#e3cf9d',37,89,3,2);
 poly('#705a48',[[27,57],[30,56],[49,86],[46,88]],false);poly('#8f7658',[[42,77],[52,79],[52,91],[41,91]]);rect('#b79a6c',43,79,8,4);rect('#dfc997',46,83,3,3);
 // Neck and face have separate shadow planes and a readable nose/cheek silhouette.
 rect(darkSkin,33,47,10,12);rect(skin,34,48,8,9);
 const jaw=a.face==='sharp'?3:a.face==='round'?-1:1;
 poly(darkHair,[[25,18],[34,13],[47,15],[54,23],[55,42],[50,53],[43,58],[28,53],[22,39],[22,26]]);
 if(back){poly(hair,[[26,20],[35,16],[46,18],[51,25],[51,46],[44,53],[29,49],[25,35]],false);for(let i=0;i<5;i++)rect(lightHair,28+i*4,24+(i%2)*3,1,21);}
 else{
  poly(skin,[[28,24],[45,23],[50,30],[50,38],[53,41],[49,43],[47-jaw,50],[40,55],[30,51],[26,43],[25,32]]);
  poly(lightSkin,[[29,28],[43,27],[47,32],[46,43],[41,48],[32,46],[28,39]],false);poly(darkSkin,[[46,32],[49,33],[49,39],[51,41],[47,43],[45,49],[40,52],[43,45]],false);
  oval(skin,24,37,3,5);rect(lightSkin,23,35,2,4);
  // Iris, lashes and a small reflection remain legible on a phone.
  rect('#f1e9d4',33,34,6,5);rect(eye,36,34,3,5);rect(ink,37,35,1,3);rect('#fff2cf',36,34,1,1);rect(ink,33,33,6,1);
  rect(eye,46,34,2,4);rect(ink,46,34,2,1);rect(tint(skin,-.13),31,42,4,2);rect('#a16e68',41,48,4,1);rect(tint(skin,.35),42,43,2,1);
 }
 // Hair shapes are independent layers, not recolored copies of one haircut.
 if(a.hair==='short')poly(hair,[[24,32],[22,23],[27,17],[36,14],[47,17],[53,26],[48,29],[44,24],[39,31],[35,25],[29,31],[26,26]]);
 if(a.hair==='bob')poly(hair,[[24,45],[21,34],[23,23],[28,17],[39,14],[49,19],[53,29],[52,48],[46,48],[47,31],[42,25],[36,31],[31,26],[27,35],[28,46]]);
 if(['long','braid','ponytail'].includes(a.hair))poly(hair,[[23,39],[22,27],[26,20],[35,14],[46,17],[52,24],[52,33],[45,27],[39,24],[35,32],[31,26],[27,34],[27,43]]);
 if(a.hair==='wave'){for(const [x,y,r] of [[26,25,7],[34,20,8],[44,22,8],[50,30,6],[23,36,5],[51,42,5]])oval(hair,x,y,r,r+1);}
 poly(lightHair,[[26,23],[35,17],[44,19],[40,21],[34,20],[28,27]],false);rect(tint(hair,.5),30,20,5,1);
 if(a.hair==='braid')for(let i=0;i<6;i++){oval(i%2?hair:darkHair,24+(i%2)*3,47+i*6,4,4);rect(lightHair,23+(i%2)*3,46+i*6,2,2);}if(a.hair==='ponytail')rect('#d5b979',23,28,4,5);
 if(a.race==='elf'){poly(skin,[[23,33],[13,29],[17,40],[24,42]]);poly(darkSkin,[[17,33],[20,38],[23,39]],false);}
 if(a.race==='beast'){poly(darkHair,[[25,19],[21,5],[33,14]]);poly(hair,[[42,15],[51,6],[50,24]]);poly('#c6a08f',[[24,10],[27,17],[30,15]],false);poly('#d3b29c',[[47,13],[45,17],[48,20]],false);}
 if(a.race==='tidal'){poly(tint(hair,.15),[[22,33],[13,27],[15,39],[23,44]]);rect('#d9dab0',17,32,1,7);poly(hair,[[34,15],[38,6],[43,17]]);}
 if(a.race==='construct'){rect('#a89e7f',26,41,2,8);rect('#879b99',31,51,11,2);rect('#b7d8bf',27,36,2,3);rect('#e4e6bf',28,36,1,1);}
 // Front sleeve and hand; active poses have different reach and recovery silhouettes.
 const handX=attack?61+Math.sin(phase*Math.PI)*7:spell?60:guard?48:49-step*4,handY=attack?48+phase*34:spell?43:guard?52:84;
 poly(cloth,[[45+broad,59],[50+broad,62],[handX+3,handY-6],[handX-2,handY+1],[43,70]]);poly(lightCloth,[[47,61],[50,64],[handX,handY-5],[handX-2,handY-2]],false);oval(skin,handX,handY,3.5,5);rect(lightSkin,handX-1,handY-3,2,4);
 if(attack){poly('#a7bfc0',[[handX+2,handY-2],[76,handY-25+phase*35],[78,handY-24+phase*35],[handX+6,handY+1]]);rect('#e3d3a2',handX,handY+1,10,2);}
 if(a.accessory==='scarf'){poly('#d2b57b',[[28,54],[36,58],[47,53],[48,58],[38,63],[27,59]]);poly('#b39462',[[30,60],[34,60],[31-step,76],[25-step*2,75]],false);rect('#ead6a5',29,56,8,1);}
 if(a.accessory==='glasses'&&!back){g.strokeStyle='#3c5862';g.lineWidth=1;g.strokeRect(31,32,10,8);g.strokeRect(44,32,7,7);rect('#47616a',41,34,3,1);}
 if(a.accessory==='earring'){oval('#d6bd7c',23,43,2,3,false);rect('#f6e3b0',23,42,1,2);}
 g.restore();return c;
}

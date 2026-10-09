/** Persistent, account-scoped data for the ST-TTS phone UI. No DOM or network access.
 * Public rows never expose the account scope or internal size accounting.
 * Notes: {id,title,text,createdAt,updatedAt}.
 * Photos/references: {id,name,type,size,createdAt,updatedAt,blob}; lists omit blob.
 * Favorites: {id,requestKey,role,text,translation,engine,model,voice,type,size,
 *             createdAt,updatedAt,blob}; listFavorites omits blob.
 * Phone: {wallpaper:{kind:'builtin',key}|{kind:'photo',photoId},
 *         icons:{[appId]:{kind:'glyph',key}|{kind:'photo',photoId}},
 *         iconStyle:'color'|'glass'|'mono',skin:PHONE_SKINS[number],lockOnOpen:boolean,volume:number (0..1),
 *         widgets:[{id,kind,size}] (the 今天 page, core/widgets.js)}.
 * savePhone merges icon entries; null resets an individual icon. Theme stays in
 * the existing extension settings and is composed by the backend facade.
 * Vibes: {id,name,size,createdAt,updatedAt,meta,blob}: the blob is the vibe in NovelAI's .naiv4vibe JSON (core/vibes.js),
 *        meta its summary (name, thumbnail, strength, which models are encoded); listVibes omits blob.
 * getPhoto/getReference/getFavorite return null for missing IDs; deletes return
 * whether an owned row existed. Every write resolves only after transaction commit.
 */
import {connectionLost, lostError} from './idb.js';
import {normalizeWidgets} from './widgets.js';
export const LIBRARY_LIMITS = Object.freeze({total:256*1024*1024,photo:12*1024*1024,reference:20*1024*1024,vibe:40*1024*1024});
export const PHONE_APPS = Object.freeze(['roles','engines','presets','library','gallery','notes','listen','settings','draw','chat','forum','peek','sounds']);
export const PHONE_WALLPAPERS = Object.freeze(['sky','silver','midnight','rose','sand','aero','fresh']);
export const PHONE_SKINS = Object.freeze(['sky','aero','fresh']);
export const PHONE_GLYPHS = Object.freeze(['default',...PHONE_APPS,'wave','book','music','camera','sliders','note','person','microphone','star','headphones']);
const STORES = ['notes','photos','favorites','phone','references','vibes'];
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif','image/gif']);
const encoder = new TextEncoder();
const defaults = () => ({wallpaper:{kind:'builtin',key:'sky'},icons:{},iconStyle:'color',skin:'sky',lockOnOpen:false,volume:1});
const fail = (message,code='INVALID') => Object.assign(new Error(message),{code});
function fields(value, allowed) {
 if(!value||Object.prototype.toString.call(value)!=='[object Object]')throw fail('请提供有效的设置内容');
 for(const key of Object.keys(value))if(!allowed.includes(key))throw fail('不支持的字段：'+key);
 return value;
}
function string(value,label,max,required=false) {
 if(typeof value!=='string'||value.length>max||value.includes('\u0000')||(required&&!value.trim()))throw fail(label+'无效或过长');
 return value;
}
function identifier(value) {return string(value,'条目编号',512,true);}
function blobValue(blob,max,label,kind,name='') {
 try{blob=Blob.prototype.slice.call(blob,0,blob.size,blob.type);}catch{throw fail('请选择有效的'+label);}
 if(blob.size<=0)throw fail('请选择有内容的'+label);
 if(blob.size>max)throw fail(label+'不能超过 '+Math.round(max/1024/1024)+' MB','ITEM_TOO_LARGE');
 if(kind==='image'&&!IMAGE_TYPES.has(blob.type.toLowerCase()))throw fail('图片只支持 JPEG、PNG、WebP、AVIF 和 GIF');
 if(kind==='audio'){
  const type=blob.type.toLowerCase();
  const binary=type===''||type==='application/octet-stream';
  if(!/^audio\/[a-z0-9.+-]+$/.test(type)&&!binary)throw fail('请选择音频文件');
  if(binary&&name&&!/\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|aiff|aif|pcm)$/i.test(name))throw fail('无法识别这个参考音频格式');
 }
 return blob;
}
function publicRow(row,metadata=false){
 if(!row)return null;
 const result=structuredClone(row);delete result.scope;delete result._bytes;
 if(metadata)delete result.blob;
 return result;
}
function bytes(row){const metadata={...row};delete metadata.blob;delete metadata._bytes;return encoder.encode(JSON.stringify(metadata)).byteLength+(row.blob?.size||0);}
function friendly(error){
 if(error?.code&&typeof error.code==='string'&&!(error instanceof DOMException))return error;
 if(connectionLost(error))return lostError(error);
 if(error?.name==='QuotaExceededError')return fail('设备存储空间不足，内容没有保存；请先释放空间','STORAGE_FULL');
 if(error?.name==='AbortError')return fail('保存被中止，内容没有更新，请重试','STORAGE_ABORTED');
 return fail('无法读写本地资料，请检查浏览器的存储权限后重试','STORAGE_UNAVAILABLE');
}
export class LocalLibrary {
 #scope; #factory; #now; #id; #db=null; #opening=null; #closed=false;
 constructor(scope,{indexedDB=globalThis.indexedDB,now=Date.now,id=()=>globalThis.crypto.randomUUID()}={}){
  this.#scope=string(scope,'账户编号',512,true);this.#factory=indexedDB;this.#now=now;this.#id=id;
  if(typeof now!=='function'||typeof id!=='function')throw fail('本地资料配置无效');
 }
 #time(){const n=this.#now();if(!Number.isFinite(n)||n<0)throw fail('设备时间无效');return n;}
 #key(id){return [this.#scope,identifier(id)];}
 #makeId(id){return identifier(id??this.#id());}
 async #open(){
  if(this.#closed)throw fail('本地资料已关闭','CLOSED');
  if(this.#db)return this.#db;
  if(!this.#factory?.open)throw fail('浏览器不支持本地资料保存，请检查存储权限','STORAGE_UNAVAILABLE');
  if(!this.#opening)this.#opening=new Promise((resolve,reject)=>{
   let req,settled=false;
   const rejectOnce=e=>{if(!settled){settled=true;reject(friendly(e));}};
   // Version 2 added the vibes store: an upgrade only creates the stores that are missing, the others keep their rows.
   try{req=this.#factory.open('st-tts-library-v1',2);}catch(e){rejectOnce(e);return;}
   req.onupgradeneeded=()=>{
    const db=req.result;
    for(const name of STORES){if(db.objectStoreNames.contains(name))continue;const store=db.createObjectStore(name,{keyPath:['scope','id']});store.createIndex('scope','scope');}
   };
   req.onerror=()=>rejectOnce(req.error);
   req.onblocked=()=>rejectOnce(fail('另一个页面占用了本地资料，请关闭旧页面后重试','STORAGE_BLOCKED'));
   req.onsuccess=()=>{
    if(settled||this.#closed){req.result.close();rejectOnce(fail('本地资料已关闭','CLOSED'));return;}
    settled=true;this.#db=req.result;
    const db=this.#db;db.onversionchange=()=>{db.close();if(this.#db===db)this.#db=null;};db.onclose=()=>{if(this.#db===db)this.#db=null;};
    resolve(db);
   };
  }).finally(()=>{this.#opening=null;});
  return this.#opening;
 }
 // A dropped connection (iPhone Safari after the page sat in the background) is reopened once; nothing was written.
 async #run(work,again=true){
  const db=await this.#open();
  try{return await work(db);}
  catch(error){if(error?.code!=='STORAGE_LOST'||this.#closed)throw error;if(this.#db===db){try{db.close();}catch{}this.#db=null;}if(again)return this.#run(work,false);throw error;}
 }
 async #read(name,id){
  return this.#run(db=>new Promise((resolve,reject)=>{
   let tx,result;
   try{tx=db.transaction(name,'readonly');const store=tx.objectStore(name);const req=id===undefined?store.index('scope').getAll(this.#scope):store.get(this.#key(id));req.onsuccess=()=>{result=req.result;};}
   catch(e){reject(friendly(e));return;}
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(friendly(tx.error));tx.onerror=()=>{};
  }));
 }
 async #mutate(change){
  return this.#run(db=>new Promise((resolve,reject)=>{
   let tx,result,ownError,remaining=STORES.length;const rows={},puts=[],deletes=[];
   try{tx=db.transaction(STORES,'readwrite');}catch(e){reject(friendly(e));return;}
   tx.oncomplete=()=>resolve(structuredClone(result));
   tx.onabort=()=>reject(ownError||friendly(tx.error));tx.onerror=()=>{};
   const apply=()=>{
    try{
     const put=(name,row)=>{const stored={...row,scope:this.#scope};stored._bytes=bytes(stored);rows[name].set(stored.id,stored);puts.push([name,stored]);};
     const remove=(name,id)=>{const existed=rows[name].delete(id);if(existed)deletes.push([name,id]);return existed;};
     result=change({rows,put,remove});
     const total=STORES.reduce((sum,name)=>sum+[...rows[name].values()].reduce((n,row)=>n+bytes(row),0),0);
     if(total>LIBRARY_LIMITS.total)throw fail('本地资料已达到 256 MB 上限，请删除不需要的内容后再保存','LIBRARY_FULL');
     for(const [name,id] of deletes)tx.objectStore(name).delete([this.#scope,id]);
     for(const [name,row] of puts)tx.objectStore(name).put(row);
    }catch(e){ownError=friendly(e);tx.abort();}
   };
   for(const name of STORES){
    const req=tx.objectStore(name).index('scope').getAll(this.#scope);
    req.onsuccess=()=>{rows[name]=new Map(req.result.map(row=>[row.id,row]));if(--remaining===0)apply();};
   }
  }));
 }
 async #list(name,metadata=false){const rows=await this.#read(name);return rows.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)).map(row=>publicRow(row,metadata));}
 async #remove(name,id){identifier(id);return this.#mutate(({remove})=>remove(name,id));}
 async listNotes(){return this.#list('notes');}
 async saveNote(input){
  fields(input,['id','title','text']);const id=this.#makeId(input.id),title=string(input.title??'','标题',200),text=string(input.text??'','备忘录',1_000_000);
  return this.#mutate(({rows,put})=>{const now=this.#time(),row={id,title,text,createdAt:rows.notes.get(id)?.createdAt??now,updatedAt:now};put('notes',row);return row;});
 }
 async deleteNote(id){return this.#remove('notes',id);}
 async listPhotos(){return this.#list('photos',true);}
 /** info: how a drawn picture was made, [[label, value]] (shown under 参数 when it is opened). */
 async addPhoto(input){
  fields(input,['name','blob','info']);const name=string(input.name??'图片','图片名称',512,true),blob=blobValue(input.blob,LIBRARY_LIMITS.photo,'图片','image');
  const info=(Array.isArray(input.info)?input.info:[]).filter(r=>Array.isArray(r)&&r[1]!==undefined&&r[1]!==null&&String(r[1]).trim()).slice(0,20).map(([k,v])=>[String(k).slice(0,20),String(v).slice(0,4000)]);
  return this.#saveMedia('photos',{id:this.#makeId(),name,blob,info});
 }
 async #saveMedia(store,{id,name,blob,info}){
  return this.#mutate(({rows,put})=>{const now=this.#time(),row={id,name,blob,type:blob.type,size:blob.size,...(info?.length?{info}:{}),createdAt:rows[store].get(id)?.createdAt??now,updatedAt:now};put(store,row);return publicRow(row);});
 }
 async getPhoto(id){return publicRow(await this.#read('photos',identifier(id)));}
 async deletePhoto(id){
  identifier(id);return this.#mutate(({rows,put,remove})=>{
   const removed=remove('photos',id),phone=rows.phone.get('preferences');
   if(phone){let changed=false;const next=structuredClone(phone);
    // The theme's own wallpaper comes back, not always 晴空.
    if(next.wallpaper.kind==='photo'&&next.wallpaper.photoId===id){next.wallpaper={kind:'builtin',key:PHONE_WALLPAPERS.includes(next.skin)?next.skin:'sky'};changed=true;}
    for(const [app,icon] of Object.entries(next.icons))if(icon.kind==='photo'&&icon.photoId===id){delete next.icons[app];changed=true;}
    if(changed){next.updatedAt=this.#time();put('phone',next);}
   }
   return removed;
  });
 }
 async listFavorites({role}={}){if(role!==undefined)string(role,'角色名',200,true);const rows=await this.#list('favorites',true);return role===undefined?rows:rows.filter(row=>row.role===role);}
 async saveFavorite(input){
  fields(input,['id','requestKey','role','text','translation','engine','model','voice','blob']);
  const id=this.#makeId(input.id),requestKey=string(input.requestKey,'音频编号',512,true),role=string(input.role,'角色名',200,true),text=string(input.text,'原文',1_000_000,true),translation=string(input.translation??'','译文',1_000_000),engine=input.engine,model=string(input.model??'','模型',200),voice=string(input.voice??'','音色',512),blob=blobValue(input.blob,LIBRARY_LIMITS.total,'音频','audio');
  if(!['fish','mini','eleven','mimo'].includes(engine))throw fail('语音引擎无效');
  return this.#mutate(({rows,put})=>{const now=this.#time(),row={id,requestKey,role,text,translation,engine,model,voice,blob,type:blob.type,size:blob.size,createdAt:rows.favorites.get(id)?.createdAt??now,updatedAt:now};put('favorites',row);return publicRow(row);});
 }
 async getFavorite(id){return publicRow(await this.#read('favorites',identifier(id)));}
 async deleteFavorite(id){return this.#remove('favorites',id);}
 async getPhone(){const row=await this.#read('phone','preferences');if(!row)return {...defaults(),widgets:normalizeWidgets()};const result={...defaults(),...publicRow(row)};delete result.id;delete result.createdAt;delete result.updatedAt;if(!PHONE_SKINS.includes(result.skin))result.skin='sky';if(result.wallpaper?.kind==='builtin'&&!PHONE_WALLPAPERS.includes(result.wallpaper.key))result.wallpaper=defaults().wallpaper;result.widgets=normalizeWidgets(result.widgets);return result;}
 async savePhone(patch){
  fields(patch,['wallpaper','icons','iconStyle','skin','lockOnOpen','volume','widgets']);
  let clean;try{clean=structuredClone(patch);}catch{throw fail('手机设置包含无法保存的内容');}
  if('iconStyle'in clean&&!['color','glass','mono'].includes(clean.iconStyle))throw fail('图标样式无效');
  if('skin'in clean&&!PHONE_SKINS.includes(clean.skin))throw fail('主题风格无效');
  if('lockOnOpen'in clean&&typeof clean.lockOnOpen!=='boolean')throw fail('锁屏设置无效');
  if('volume'in clean&&(typeof clean.volume!=='number'||!Number.isFinite(clean.volume)||clean.volume<0||clean.volume>1))throw fail('音量必须在 0 到 1 之间');
  if('widgets'in clean){if(!Array.isArray(clean.widgets))throw fail('小组件列表无效');clean.widgets=normalizeWidgets(clean.widgets);}
  if('wallpaper'in clean)this.#appearance(clean.wallpaper,'wallpaper');
  if('icons'in clean){fields(clean.icons,PHONE_APPS);for(const value of Object.values(clean.icons))if(value!==null)this.#appearance(value,'icon');}
  return this.#mutate(({rows,put})=>{
   const existing=rows.phone.get('preferences'),now=this.#time(),next={...defaults(),...(existing?publicRow(existing):{}),...clean};
   next.icons={...(existing?.icons||{})};for(const [key,value] of Object.entries(clean.icons||{})){if(value===null)delete next.icons[key];else next.icons[key]=value;}
   for(const item of [next.wallpaper,...Object.values(next.icons)])if(item.kind==='photo'&&!rows.photos.has(item.photoId))throw fail('找不到这张图片，请重新选择','PHOTO_MISSING');
   const row={...next,id:'preferences',createdAt:existing?.createdAt??now,updatedAt:now};put('phone',row);
   const result={...next};delete result.id;delete result.createdAt;delete result.updatedAt;return result;
  });
 }
 #appearance(value,target){
  if(value?.kind==='photo'){fields(value,['kind','photoId']);identifier(value.photoId);}
  else if(target==='wallpaper'&&value?.kind==='builtin'){fields(value,['kind','key']);if(!PHONE_WALLPAPERS.includes(value.key))throw fail('壁纸选项无效');}
  else if(target==='icon'&&value?.kind==='glyph'){fields(value,['kind','key']);if(!PHONE_GLYPHS.includes(value.key))throw fail('图标选项无效');}
  else throw fail(target==='wallpaper'?'壁纸设置无效':'图标设置无效');
 }
 async listReferences(){return this.#list('references',true);}
 async getReference(id){return publicRow(await this.#read('references',identifier(id)));}
 async saveReference(input){
  fields(input,['id','name','blob']);const id=this.#makeId(input.id),name=string(input.name??'reference.wav','音频名称',512,true),blob=blobValue(input.blob,LIBRARY_LIMITS.reference,'参考音频','audio',name);
  return this.#saveMedia('references',{id,name,blob});
 }
 async deleteReference(id){return this.#remove('references',id);}
 async listVibes(){return this.#list('vibes',true);}
 async getVibe(id){return publicRow(await this.#read('vibes',identifier(id)));}
 /** Saves a vibe (new or replacing the one with the same id): {id, name, meta, blob}. */
 async saveVibe(input){
  const v=fields(input,['id','name','meta','blob']),id=identifier(v.id),name=string(v.name,'Vibe 名字',80,true);
  if(!v.meta||typeof v.meta!=='object')throw fail('Vibe 信息无效');
  const blob=blobValue(v.blob,LIBRARY_LIMITS.vibe,'Vibe 文件','data'),time=this.#time();
  return publicRow(await this.#mutate(({rows,put})=>{const old=rows.vibes.get(id);const row={id,name,meta:structuredClone(v.meta),size:blob.size,createdAt:old?.createdAt??time,updatedAt:time,blob};put('vibes',row);return row;}),true);
 }
 async deleteVibe(id){return this.#remove('vibes',id);}
 /** Every row of the given stores with its blob, for a backup. */
 async exportRows(names=STORES){const out={};for(const name of names){if(!STORES.includes(name))throw fail('未知的资料类型：'+name);out[name]=(await this.#read(name)).map(row=>publicRow(row));}return out;}
 /** Puts backup rows back with their ids and dates, checked like new ones, in one transaction (all or nothing).
  *  replace: the given stores are emptied first. A phone appearance pointing at a photo that is not there falls back
  *  to the default. Returns how many rows each store received. */
 async importRows(data,{replace=false}={}){
  const clean={};for(const [name,list] of Object.entries(data||{})){if(!STORES.includes(name))throw fail('备份里有未知的资料类型：'+name);if(!Array.isArray(list))throw fail('备份内容无效：'+name);clean[name]=list.map(row=>this.#backupRow(name,row));}
  return this.#mutate(({rows,put,remove})=>{
   const counts={};
   for(const [name,list] of Object.entries(clean)){if(name==='phone')continue;if(replace)for(const id of [...rows[name].keys()])remove(name,id);for(const row of list)put(name,row);counts[name]=list.length;}
   const phone=clean.phone?.at(-1)||(replace&&clean.photos&&rows.phone.get('preferences'));
   if(phone){const next={...publicRow(phone)};delete next.id;if(next.wallpaper.kind==='photo'&&!rows.photos.has(next.wallpaper.photoId))next.wallpaper=defaults().wallpaper;next.icons={...next.icons};for(const [app,icon] of Object.entries(next.icons))if(icon.kind==='photo'&&!rows.photos.has(icon.photoId))delete next.icons[app];put('phone',{...next,id:'preferences'});if(clean.phone)counts.phone=1;}
   return counts;
  });
 }
 #backupRow(name,row){
  if(!row||typeof row!=='object')throw fail('备份内容无效：'+name);
  const now=this.#time(),time=v=>Number.isFinite(v)&&v>0?v:now,dates={createdAt:time(row.createdAt),updatedAt:time(row.updatedAt)};
  if(name==='notes')return {id:identifier(row.id),title:string(row.title??'','标题',200),text:string(row.text??'','备忘录',1_000_000),...dates};
  if(name==='photos'||name==='references'){const media=name==='photos',blob=blobValue(row.blob,media?LIBRARY_LIMITS.photo:LIBRARY_LIMITS.reference,media?'图片':'参考音频',media?'image':'audio',row.name);return {id:identifier(row.id),name:string(row.name??(media?'图片':'reference.wav'),media?'图片名称':'音频名称',512,true),blob,type:blob.type,size:blob.size,...dates};}
  if(name==='favorites'){if(!['fish','mini','eleven','mimo'].includes(row.engine))throw fail('备份里的收藏语音引擎无效');const blob=blobValue(row.blob,LIBRARY_LIMITS.total,'音频','audio');return {id:identifier(row.id),requestKey:string(row.requestKey,'音频编号',512,true),role:string(row.role,'角色名',200,true),text:string(row.text,'原文',1_000_000,true),translation:string(row.translation??'','译文',1_000_000),engine:row.engine,model:string(row.model??'','模型',200),voice:string(row.voice??'','音色',512),blob,type:blob.type,size:blob.size,...dates};}
  if(name==='vibes'){if(!row.meta||typeof row.meta!=='object'||Array.isArray(row.meta))throw fail('备份里的 Vibe 信息无效');const blob=blobValue(row.blob,LIBRARY_LIMITS.vibe,'Vibe 文件','data');return {id:identifier(row.id),name:string(row.name,'Vibe 名字',80,true),meta:structuredClone(row.meta),blob,size:blob.size,...dates};}
  const {wallpaper,icons,iconStyle,skin,lockOnOpen,volume,widgets}={...defaults(),...row};
  this.#appearance(wallpaper,'wallpaper');fields(icons,PHONE_APPS);for(const icon of Object.values(icons))this.#appearance(icon,'icon');
  return {wallpaper,icons,iconStyle:['color','glass','mono'].includes(iconStyle)?iconStyle:'color',skin:PHONE_SKINS.includes(skin)?skin:'sky',lockOnOpen:lockOnOpen===true,volume:Number.isFinite(volume)?Math.min(1,Math.max(0,volume)):1,...(Array.isArray(widgets)?{widgets:normalizeWidgets(widgets)}:{}),...dates};
 }
 async stats(){
  return this.#run(db=>new Promise((resolve,reject)=>{
   let tx;const result={bytes:0,limit:LIBRARY_LIMITS.total,notes:0,photos:0,favorites:0,references:0,vibes:0,sizes:{}};
   try{tx=db.transaction(STORES,'readonly');for(const name of STORES){const req=tx.objectStore(name).index('scope').getAll(this.#scope);req.onsuccess=()=>{if(name!=='phone')result[name]=req.result.length;const size=req.result.reduce((n,row)=>n+bytes(row),0);result.sizes[name]=size;result.bytes+=size;};}}
   catch(e){reject(friendly(e));return;}
   tx.oncomplete=()=>resolve(structuredClone(result));tx.onabort=()=>reject(friendly(tx.error));tx.onerror=()=>{};
  }));
 }
 async close(){this.#closed=true;const db=this.#db||await this.#opening?.catch(()=>null);db?.close();this.#db=null;}
}
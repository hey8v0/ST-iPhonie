import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../../termux/viewer-controls.js',import.meta.url),'utf8');

function rig(extended){
  const parent={postMessage:data=>ack.push(data)};
  const ack=[], keys=[], clipboard=[], sizes=[], listeners={};
  const win=new EventTarget(), rfb=new EventTarget(), classes=new Set();
  win.addEventListener('message',event=>{listeners.last=event;});
  const location={search:'?iphonie=next&resize=remote'};
  const document={documentElement:{classList:{add:x=>classes.add(x),toggle:x=>classes.has(x)?classes.delete(x):classes.add(x)}}};
  rfb.sendKey=(...args)=>keys.push(args);
  rfb.clipboardPasteFrom=text=>clipboard.push(text);
  rfb._clipboardServerCapabilitiesFormats=extended?{1:true}:{};
  rfb._clipboardServerCapabilitiesActions=extended?{[1<<27]:true}:{};
  rfb._screenSize=()=>({w:360,h:600});
  rfb._requestRemoteResize=()=>{if(rfb.resizeSession)sizes.push(rfb._screenSize());};
  let resizing=false;
  Object.defineProperty(rfb,'resizeSession',{get:()=>resizing,set:value=>{resizing=value;if(value)rfb._requestRemoteResize();}});
  vm.runInNewContext(source,{window:win,parent,document,location,URL,URLSearchParams,setTimeout,clearTimeout});
  win.iphonieControl(rfb);
  const message=(action,value,origin='http://localhost:8000')=>{
    const event=new Event('message');
    Object.assign(event,{source:parent,origin,data:{type:'iphonie-browser-control',id:1,action,value}});
    win.dispatchEvent(event);
  };
  return {message,rfb,keys,clipboard,ack,sizes,classes};
}

test('only authenticated local iframe commands can dispatch Unicode clipboard and keys',()=>{
  const v=rig(true);
  v.message('input','中文 A🙂');assert.equal(v.clipboard.length,0);
  v.rfb.dispatchEvent(new Event('connect'));
  v.message('input','malicious','https://example.com');assert.equal(v.clipboard.length,0);
  v.message('input','中文 A🙂');
  assert.deepEqual(v.clipboard,['中文 A🙂']);
  assert.equal(v.ack.at(-1).ok,true);
  assert(v.keys.some(([key])=>key===118));
  v.message('key','backspace');v.message('key','enter');v.message('key','space');
  assert.deepEqual(v.keys.slice(-3).map(([key])=>key),[0xff08,0xff0d,32]);
  v.message('native-tools');assert(v.classes.has('iphonie-show-native'));
  v.rfb.dispatchEvent(new Event('disconnect'));
});

test('legacy clipboard uses Unicode keysyms and resize suppression preserves canvas coordinates',async()=>{
  const v=rig(false);
  v.rfb.dispatchEvent(new Event('connect'));
  v.message('input','中 🙂\n\nA');
  assert.deepEqual(v.keys.map(([key])=>key),[0x1004e2d,32,0x101f642,0xff0d,0xff0d,65]);
  assert.equal(v.clipboard.length,0);
  v.message('pause-resize',true);
  v.message('mode','desktop');
  v.rfb._requestRemoteResize();
  assert.equal(v.sizes.length,1);
  v.message('pause-resize',false);
  await new Promise(resolve=>setTimeout(resolve,520));
  assert.equal(v.sizes.at(-1).w,1024);
  assert.equal(v.rfb._screenSize().w,360);
  v.message('mode','remote');
  assert.equal(v.sizes.at(-1).w,360);
  v.rfb.dispatchEvent(new Event('disconnect'));
});


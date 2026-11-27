import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const websocket=require('ws');
const {attachGraphics,serveGraphics}=require('../../termux/browser-bridge/graphics.cjs');
const {createService}=require('../../termux/browser-bridge/service.cjs');
const {createRecovery}=require('../../termux/browser-bridge/recovery.cjs');
const {repairOrigin}=require('../../termux/browser-bridge/config.cjs');
const {writeFrame}=require('../../termux/browser-bridge/frames.cjs');
const build=require('../../termux/browser-bridge/extension/manifest.json').version;
const u16=x=>{const b=Buffer.alloc(2);b.writeUInt16BE(x);return b;};
const i32=x=>{const b=Buffer.alloc(4);b.writeInt32BE(x);return b;};
const rect=(w,h,encoding,reason=0)=>Buffer.concat([u16(reason),u16(0),u16(w),u16(h),i32(encoding)]);
function testDesktop(onResize,onPointer,[initialWidth,initialHeight]=[1024,1280],onKey=()=>{}) {
  return net.createServer(socket=>{
    let stage=0, incoming=Buffer.alloc(0), sent=false;
    const size=(w,h,reason)=>Buffer.concat([rect(w,h,-308,reason),Buffer.from([1,0,0,0]),i32(1),
      u16(0),u16(0),u16(w),u16(h),i32(0)]);
    socket.write('RFB 003.008\n');
    socket.on('error',()=>{});
    socket.on('data',chunk=>{
      incoming=Buffer.concat([incoming,chunk]);
      const use=n=>{incoming=incoming.subarray(n);};
      if(stage===0 && incoming.length>=12){use(12);socket.write(Buffer.from([1,1]));stage++;}
      if(stage===1 && incoming.length>=1){use(1);socket.write(i32(0));stage++;}
      if(stage===2 && incoming.length>=1){
        use(1);stage++;
        socket.write(Buffer.concat([u16(initialWidth),u16(initialHeight),
          Buffer.from([32,24,0,1,0,255,0,255,0,255,16,8,0,0,0,0]),i32(7),Buffer.from('fixture')]));
      }
      while(stage===3 && incoming.length){
        let n;
        switch(incoming[0]){
          case 0:n=20;break;
          case 2:if(incoming.length<4)return;n=4+4*incoming.readUInt16BE(2);break;
          case 3:n=10;break;
          case 4:n=8;break;
          case 5:n=6;break;
          case 150:n=10;break;
          case 251:if(incoming.length<8)return;n=8+16*incoming[6];break;
          default:console.error('unexpected client RFB message',incoming[0]);socket.destroy();return;
        }
        if(incoming.length<n)return;
        if(incoming[0]===3 && !sent){
          sent=true;
          socket.write(Buffer.concat([Buffer.from([0,0,0,2]),size(initialWidth,initialHeight,0),rect(16,16,0),Buffer.alloc(16*16*4,145)]));
        }else if(incoming[0]===251){
          const w=incoming.readUInt16BE(2),h=incoming.readUInt16BE(4);
          onResize(w,h);
          socket.write(Buffer.concat([Buffer.from([0,0,0,1]),size(w,h,1)]));
          setTimeout(()=>{if(!socket.destroyed) socket.write(Buffer.concat([
            Buffer.from([0,0,0,1]),rect(16,16,0),Buffer.alloc(16*16*4,200)]));},150);
        }else if(incoming[0]===5 && incoming[1]===1){
          onPointer(incoming.readUInt16BE(2),incoming.readUInt16BE(4));
        }else if(incoming[0]===4 && incoming[1]===1){
          onKey(incoming.readUInt32BE(4));
        }
        use(n);
      }
    });
  });
}

test('independent repair viewer expands the framebuffer and fits its lower corner without native control', {
  skip:!process.env.STIP_TEST_NOVNC && 'set STIP_TEST_NOVNC to a noVNC v1.6.0 checkout',
},async t=>{
  const sizes=[],points=[],keys=[];
  const tcp=testDesktop((w,h)=>sizes.push([w,h]),(x,y)=>points.push([x,y]),[420,760],key=>keys.push(key));
  await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));
  t.after(()=>tcp.close());
  const origin=repairOrigin,host=new URL(origin).host,key='a'.repeat(64);
  let requested=0;
  const repair=createRecovery({panel:key,native:'b'.repeat(64),readUpdate:()=> 'extension',
    driver:{locate:async()=>true,restore:async page=>{if(page==='addons') requested++;return {ok:true};}},
    serve:(req,res,origin)=>serveGraphics(req,res,origin,process.env.STIP_TEST_NOVNC)});
  const stop=attachGraphics(repair,{host,origin,panel:key,onIdle(){},websocket,vncPort:tcp.address().port});
  t.after(()=>{stop();repair.closeAllConnections();repair.close();});
  await new Promise(resolve=>repair.listen(6092,'127.0.0.1',resolve));
  const parent=http.createServer((req,res)=>{
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<style>iframe{border:0;width:320px;height:550px}</style>
      <iframe src="${origin}/repair"></iframe><script>
      const frame=document.querySelector('iframe'), origin='${origin}';
      window.steps=[];
      addEventListener('message',event=>{
        if(event.origin!==origin)return;
        steps.push(event.data);
        if(event.data.type==='rfb-state' && event.data.stage==='ready')
          frame.contentWindow.postMessage({type:'rfb-command',id:'test',action:'repair-open'},origin);
      });
      frame.addEventListener('load',()=>frame.contentWindow.postMessage({type:'rfb-init',key:'${key}'},origin));
      </script>`);
  });
  await new Promise(resolve=>parent.listen(0,'127.0.0.1',resolve));
  t.after(()=>{parent.closeAllConnections();parent.close();});
  const browser=await chromium.launch({executablePath:process.env.STIP_TEST_CHROME || undefined});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const requests=[];
  page.on('request',req=>requests.push(req.url()));
  await page.goto('http://127.0.0.1:'+parent.address().port);
  await page.waitForFunction(()=>steps.some(step=>step.type==='rfb-result' && step.result.ok));
  assert.equal(requested,1);
  assert.deepEqual(sizes,[[1024,768]]);
  assert(!requests.some(url=>url.startsWith('http://127.0.0.1:6091')));
  const canvas=page.locator('iframe').contentFrame().locator('canvas:visible');
  assert.equal(await canvas.count(),1);
  const bounds=await canvas.boundingBox();
  assert(bounds.width<=320 && bounds.height<=550);
  await page.mouse.click(bounds.x+bounds.width-6,bounds.y+bounds.height-6);
  for (let i=0;i<10 && !points.length;i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert(points[0]?.[0]>980 && points[0]?.[1]>730);
  await page.locator('iframe').evaluate(frame=>{frame.style.width='570px';frame.style.height='325px';});
  await canvas.evaluate(el=>{
    if (el.width!==1024 || el.height!==768) throw Error('orientation changed the remote repair desktop');
  });
  await page.evaluate(origin=>document.querySelector('iframe').contentWindow.postMessage(
    {type:'rfb-command',id:'picture-keys',action:'repair-open',params:{pictureKeys:true}},origin),origin);
  await page.waitForFunction(()=>steps.some(step=>step.id==='picture-keys' && step.result.mode==='picture-keys'));
  for (let i=0;i<10 && !keys.includes(0xff0d);i++) await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(keys,[0xffe3,116,0xffe3,108,...Array.from('about:addons',char=>char.charCodeAt(0)),0xff0d]);
  assert.equal(requested,1);
});

test('real noVNC core paints and negotiates a CSS-size framebuffer through the authenticated viewer', {
  skip:!process.env.STIP_TEST_NOVNC && 'set STIP_TEST_NOVNC to a noVNC v1.6.0 checkout',
},async()=>{
  const seen=[],points=[];
  const tcp=testDesktop((w,h)=>seen.push([w,h]),(x,y)=>points.push([x,y]));
  await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));
  const host='127.0.0.1:6091',origin='http://'+host,key='a'.repeat(64);
  const service=createService({host,origin,panel:key,native:'b'.repeat(64),inspectInstall:()=>({}),onStop(){},
    serveGraphics:(req,res,origin)=>serveGraphics(req,res,origin,process.env.STIP_TEST_NOVNC)});
  const stop=attachGraphics(service.server,{host,origin,panel:key,onIdle(){},websocket,vncPort:tcp.address().port});
  await new Promise(resolve=>service.server.listen(6091,'127.0.0.1',resolve));
  await new Promise(resolve=>service.ipc.listen(0,'127.0.0.1',resolve));
  const native=net.connect(service.ipc.address().port,'127.0.0.1');
  await once(native,'connect');
  native.resume();
  writeFrame(native,{type:'authenticate',token:'b'.repeat(64)});
  writeFrame(native,{type:'hello',version:3,build,firefox:'161.0'});
  writeFrame(native,{type:'state',version:3,state:{
    tabs:[{id:1,title:'Fixture',url:'https://example.org/',access:'web',status:'ready',desktop:false,icon:''}],
    count:1,activeId:1,windowMode:'fullscreen',focus:null,field:null,
    hints:[{id:'field-1',frame:4,role:'input:text',x:100,y:120,w:90,h:40}],
    viewport:{width:390,height:670,visualWidth:390,visualHeight:670,dpr:1,scale:1,zoom:1,outerWidth:390,
      screenWidth:390,documentWidth:390,offsetTop:0,offsetLeft:0,touchPoints:0,mobileJS:false,coarse:false},
    page:{scroll:0,fullscreen:'none'},
  }});
  const parent=http.createServer((req,res)=>{
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<style>iframe{border:0;width:390px;height:670px}</style>
      <iframe src="${origin}/viewer"></iframe><script>
      window.steps=[];
      const iframe=document.querySelector('iframe');
      addEventListener('message',event=>{if(event.origin==='${origin}')steps.push(event.data);});
      iframe.addEventListener('load',()=>iframe.contentWindow.postMessage({type:'rfb-init',key:'${key}'},'${origin}'));
      </script>`);
  });
  await new Promise(resolve=>parent.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.STIP_TEST_CHROME || undefined});
  try {
    const wrong=new websocket.WebSocket(origin.replace('http:','ws:')+'/rfb',['iphonie.'+'c'.repeat(64)],{origin});
    await once(wrong,'error');
    const page=await browser.newPage({hasTouch:true});
    const failures=[];
    page.on('console',message=>{if (['warning','error'].includes(message.type())) failures.push(message.text());});
    page.on('pageerror',error=>failures.push(error.message));
    const responses=[];
    page.on('response',response=>responses.push(response.status()+' '+response.url()));
    page.on('requestfailed',request=>failures.push(request.url()+' '+request.failure()?.errorText));
    await page.goto('http://127.0.0.1:'+parent.address().port+'/');
    try {await page.waitForFunction(()=>steps.some(x=>x.stage==='ready'),null,{timeout:10000});}
    catch {assert.fail(JSON.stringify({failures,responses,frames:page.frames().map(f=>f.url()),steps:await page.evaluate(()=>steps),seen}));}
    for(let i=0;i<40 && !seen.some(([w,h])=>w===390 && h===670);i++) await new Promise(r=>setTimeout(r,25));
    assert(seen.some(([w,h])=>w===390 && h===670),JSON.stringify(seen));
    const frame=page.frameLocator('iframe');
    await frame.locator('#surface canvas[tabindex]').evaluate(canvas=>new Promise((resolve,reject)=>{
      const until=Date.now()+2500;
      function check(){
        if (canvas.width===390 && canvas.height===670) resolve();
        else if (Date.now()>until) reject(Error('framebuffer resize not acknowledged'));
        else requestAnimationFrame(check);
      }
      check();
    }));
    await frame.locator('.resize-preview').waitFor({state:'hidden'});
    const box=await page.locator('iframe').boundingBox();
    await page.mouse.click(box.x+70,box.y+90);
    for(let i=0;i<40 && !points.length;i++) await new Promise(r=>setTimeout(r,25));
    assert.deepEqual(points.at(-1),[70,90]);
    await frame.locator('.browser-ime-proxy').evaluate(el=>{
      el.addEventListener('focus',()=>{window.activatedOnFocus=navigator.userActivation.isActive;},{once:true});
    });
    await page.touchscreen.tap(box.x+150,box.y+140);
    try {await page.waitForFunction(()=>steps.some(x=>x.type==='rfb-touch'&&x.prepared===true),null,{timeout:3500});}
    catch {assert.fail(JSON.stringify({failures,steps:await page.evaluate(()=>steps.map(e=>({
      type:e.type,kind:e.kind,stage:e.stage,prepared:e.prepared,focus:e.state?.focus,hints:e.state?.hints?.length,
    })))}));}
    assert.equal(await frame.locator('.browser-ime-proxy').evaluate(el=>el===document.activeElement && activatedOnFocus),true);
    await page.touchscreen.tap(box.x+30,box.y+45);
    await page.waitForFunction(()=>steps.some(x=>x.type==='rfb-touch'&&x.prepared===false));
    assert.equal(await frame.locator('.browser-ime-proxy').evaluate(el=>el===document.activeElement),false);
    await page.locator('iframe').evaluate(iframe=>{
      window.viewerBefore=iframe;
      iframe.contentWindow.postMessage({type:'rfb-geometry',editing:true},iframe.src);
      iframe.style.height='550px';
      requestAnimationFrame(()=>{iframe.style.height='480px';requestAnimationFrame(()=>{iframe.style.height='365px';});});
    });
    await page.waitForFunction(()=>steps.some(x=>x.kind==='resize-reply'&&x.details.reported.height===365));
    await frame.locator('.resize-preview').waitFor({state:'visible'});
    await frame.locator('.resize-preview').waitFor({state:'hidden'});
    assert.deepEqual(seen,[[390,670],[390,365]]);
    assert.equal(await page.evaluate(()=>viewerBefore===document.querySelector('iframe')),true);
    await page.goto('http://localhost:'+parent.address().port+'/');
    await page.waitForFunction(()=>steps.some(x=>x.stage==='ready'),null,{timeout:10000});
  }finally{
    await browser.close();
    native.destroy();
    service.shutdown();
    stop();
    service.server.closeAllConnections();
    parent.closeAllConnections();
    await Promise.all([new Promise(r=>service.server.close(r)),new Promise(r=>service.ipc.close(r)),
      new Promise(r=>tcp.close(r)),new Promise(r=>parent.close(r))]);
  }
});

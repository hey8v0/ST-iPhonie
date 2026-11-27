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
const u16=x=>{const b=Buffer.alloc(2);b.writeUInt16BE(x);return b;};
const i32=x=>{const b=Buffer.alloc(4);b.writeInt32BE(x);return b;};
const rect=(w,h,encoding,reason=0)=>Buffer.concat([u16(reason),u16(0),u16(w),u16(h),i32(encoding)]);
function testDesktop(onResize,onPointer) {
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
        socket.write(Buffer.concat([u16(1024),u16(1280),
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
          socket.write(Buffer.concat([Buffer.from([0,0,0,2]),size(1024,1280,0),rect(16,16,0),Buffer.alloc(16*16*4,145)]));
        }else if(incoming[0]===251){
          const w=incoming.readUInt16BE(2),h=incoming.readUInt16BE(4);
          onResize(w,h);
          socket.write(Buffer.concat([Buffer.from([0,0,0,1]),size(w,h,1)]));
        }else if(incoming[0]===5 && incoming[1]===1){
          onPointer(incoming.readUInt16BE(2),incoming.readUInt16BE(4));
        }
        use(n);
      }
    });
  });
}

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
    const page=await browser.newPage();
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
    await frame.locator('canvas').evaluate(canvas=>new Promise((resolve,reject)=>{
      const until=Date.now()+2500;
      function check(){
        if (canvas.width===390 && canvas.height===670) resolve();
        else if (Date.now()>until) reject(Error('framebuffer resize not acknowledged'));
        else requestAnimationFrame(check);
      }
      check();
    }));
    const box=await page.locator('iframe').boundingBox();
    await page.mouse.click(box.x+70,box.y+90);
    for(let i=0;i<40 && !points.length;i++) await new Promise(r=>setTimeout(r,25));
    assert.deepEqual(points.at(-1),[70,90]);
    await page.goto('http://localhost:'+parent.address().port+'/');
    await page.waitForFunction(()=>steps.some(x=>x.stage==='ready'),null,{timeout:10000});
  }finally{
    await browser.close();
    stop();
    service.server.closeAllConnections();
    parent.closeAllConnections();
    await Promise.all([new Promise(r=>service.server.close(r)),new Promise(r=>tcp.close(r)),new Promise(r=>parent.close(r))]);
  }
});

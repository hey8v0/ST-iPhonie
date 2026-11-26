const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {once} = require('node:events');
const exec=promisify(execFile);
const service=path.resolve(__dirname,'../../termux/service.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('isolated desktop lifecycle over real loopback HTTP and WebSocket',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'iphonie-lifecycle-'));
  const base=path.join(home,'.local/share/st-iphonie-browser');
  const env={...process.env,HOME:home,USERPROFILE:home,PREFIX:home,
    NODE_OPTIONS:'--require "'+path.join(__dirname,'fake-desktop.cjs').split(path.sep).join('/')+'"'};
  const cli=action=>exec(process.execPath,[service,action],{env,timeout:65000});
  const status=async()=>(await fetch('http://127.0.0.1:6089/health',{signal:AbortSignal.timeout(1000)})).json();
  const write=(n,s)=>fs.writeFileSync(path.join(base,n),s);
  const scenario=s=>write('scenario',s);
  const sandboxProfile='profile/cookies.sqlite';
  for(const port of [6089,5929]) assert(await require(service).portFree(port),'QA needs unused port '+port);
  for(const dir of ['profile','viewer/core/util','viewer/app']) fs.mkdirSync(path.join(base,dir),{recursive:true});
  for(const n of ['passwd','viewer/vnc.html','viewer/core/rfb.js','viewer/core/util/browser.js','viewer/app/ui.js','testfont',sandboxProfile]) write(n,'fixture');
  t.after(async()=>{await cli('stop').catch(()=>{});fs.rmSync(home,{recursive:true,force:true});});
  const waitCode=async code=>{
    for(let i=0;i<100;i++){if((await status()).code===code) return;await delay(120);}
    assert.fail('timeout waiting for '+code);
  };
  await t.test('running tavern port remains owned by the original service',async()=>{
    const tavern=net.createServer();
    // An existing developer tavern can keep the port throughout this check.
    let opened=false;
    try{tavern.listen(8000,'127.0.0.1');await once(tavern,'listening');opened=true;}
    catch(e){if(e.code!=='EADDRINUSE') throw e;}
    try{
      scenario('good');await cli('start');await cli('stop');
      assert.equal(await require(service).portFree(8000),false);
      if(opened) assert(tavern.listening);
    }finally{if(opened) tavern.close();}
  });
  await t.test('start, real RFB header, reuse and reconnect',async()=>{
    scenario('good');await cli('start');
    assert.equal((await status()).code,'ready');
    const before=fs.readFileSync(path.join(base,'window'),'utf8');
    await cli('start');await cli('reuse');assert.equal(fs.readFileSync(path.join(base,'window'),'utf8'),before);
    assert.equal(fs.existsSync(path.join(base,'vnc-connections')),false);
    const WS=require('ws');
    for(let i=0;i<2;i++){const client=new WS('ws://127.0.0.1:6089/websockify',{origin:'http://127.0.0.1:6089'}); const [data]=await once(client,'message');assert.equal(String(data),'RFB 003.008\n');client.close();await once(client,'close');}
    assert.equal(fs.readFileSync(path.join(base,'vnc-connections'),'utf8'),'11');
    const forbidden=await fetch('http://127.0.0.1:6089/stop',{method:'POST'});assert.equal(forbidden.status,403);
    await cli('stop');
  });
  await t.test('unrelated port owner survives',async()=>{
    const listener=net.createServer();listener.listen(5929,'127.0.0.1');await once(listener,'listening');
    try{await assert.rejects(cli('start'));assert.equal((await status()).code,'port');await cli('stop');assert(listener.listening);}
    finally{listener.close();}
  });
  await t.test('incompatible loader, safe diagnostic and subsequent repaired start',async()=>{
    scenario('abi');await assert.rejects(cli('start'));assert.equal((await status()).code,'dependency');
    fs.appendFileSync(path.join(base,'runtime.log'),'Cookie: PRIVATE-DIAGNOSTIC-CANARY');
    await cli('export');assert(!fs.readFileSync(path.join(base,'diagnostics.json'),'utf8').includes('CANARY'));
    scenario('good');await cli('start');await cli('stop');
  });
  await t.test('software fallback with original profile',async()=>{
    scenario('software');await cli('start');assert.equal((await status()).code,'ready');await cli('stop');
    assert.equal(fs.readFileSync(path.join(base,sandboxProfile),'utf8'),'fixture');
  });
  for(const [bin,mode,code] of [['firefox','fail-ff','firefox'],['Xvnc','fail-x','display']]){
    await t.test(bin+' loss has bounded recovery',async()=>{
      scenario('good');await cli('start');scenario(mode);write('exit-'+bin,'1');
      await waitCode(code);assert.equal((await status()).state,'failed');await cli('stop');
    });
  }
});


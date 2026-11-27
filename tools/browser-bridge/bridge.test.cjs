const assert = require('node:assert/strict');
const {test} = require('node:test');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {PassThrough} = require('node:stream');
const {setTimeout:delay} = require('node:timers/promises');
const source = path.resolve(__dirname, '../../termux/browser-bridge');
const {createService} = require(source + '/service.cjs');
const {writeFrame,readFrames} = require(source + '/frames.cjs');
const protocol = require(source + '/extension/protocol.js');
const build = require(source + '/extension/manifest.json').version;
const command = (action='reload',params={tabId:1}) => ({version:2,id:crypto.randomUUID(),action,params});
const page = {tabs:[{id:1,url:'https://example.org/private?session=fixture',title:'Private tab',access:'web',desktop:false,status:'ready',icon:''}],
  count:1,page:{scroll:0,fullscreen:'none'},activeId:1,focus:'input:password',windowMode:'normal',
  viewport:{width:400,height:700,visualWidth:400,visualHeight:700,dpr:1,scale:1}};

async function wait(predicate) {
  for (let i=0;i<120;i++) {
    const result = await predicate();
    if (result) return result;
    await delay(25);
  }
  assert.fail('timeout waiting for test state');
}

test('command schema accepts only explicitly modeled, credential-free navigation', () => {
  for (const action of ['reload','back','forward','switch-tab','close-tab']) assert(protocol.command(command(action)));
  assert(protocol.command(command('new-tab',{url:''})));
  assert(protocol.command(command('browser-fullscreen',{enabled:false})));
  assert(protocol.command(command('navigate',{tabId:1,url:'https://example.org/a'})));
  for (const url of ['file:///tmp/file','about:config','data:text/plain,test','javascript:alert(1)','https://u:p@example.org']) {
    assert(!protocol.command(command('navigate',{tabId:1,url})));
  }
  assert(!protocol.command(command('eval',{code:'x'})));
  assert(!protocol.command(command('back',{tabId:1,extra:true})));
  assert(!protocol.command({...command(),version:3}));
  assert(!protocol.state({...page,focus:{type:'password',value:'forbidden'}}));
});

test('native frames accept split and joined UTF-8 payloads and reject oversized frames', () => {
  const stream = new PassThrough();
  const seen = [];
  let errors = 0;
  readFrames(stream, value => seen.push(value), () => errors++);
  const buffers = [];
  const sink = {write:bytes => buffers.push(bytes)};
  writeFrame(sink,{title:'浏览 😀'});
  writeFrame(sink, {ok:true});
  stream.write(buffers[0].subarray(0,3));
  stream.write(Buffer.concat([buffers[0].subarray(3),buffers[1]]));
  stream.write(Buffer.alloc(4,255));
  assert.deepEqual(seen,[{title:'浏览 😀'},{ok:true}]);
  assert.equal(errors,1);
});

test('HTTP auth and origin, native subprocess handshake, state, response, disconnection and version checks', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(),'ip-bridge-'));
  const base = path.join(home,'.local/share/st-iphonie-bridge');
  fs.mkdirSync(base,{recursive:true});
  const socket = process.platform === 'win32' ? '\\\\.\\pipe\\iphonie-' + crypto.randomUUID() : path.join(home,'nm.sock');
  const panel = crypto.randomBytes(32).toString('hex'), native = crypto.randomBytes(32).toString('hex');
  const manifest = path.join(home,'.mozilla/native-messaging-hosts/st_iphonie_browser_bridge.json');
  fs.writeFileSync(path.join(base,'auth.json'),JSON.stringify({panel,native}));
  const entry = path.join(home,'host.cjs');
  fs.writeFileSync(entry, `const cfg=require(${JSON.stringify(source+'/config.cjs')});cfg.socket=${JSON.stringify(socket)};require(${JSON.stringify(source+'/native.cjs')});`);
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const host = '127.0.0.1:' + port, origin = 'http://' + host;
  const service = createService({panel,native,host,origin,inspectInstall:() => ({manifestPresent:true}),onStop:() => {}});
  const children = [];
  t.after(async () => {
    service.shutdown();
    service.server.closeAllConnections();
    await Promise.all([new Promise(r => service.server.close(r)),new Promise(r => service.ipc.close(r))]);
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {child.stdin.end(); await once(child,'exit');}
    }
    fs.rmSync(home,{force:true,recursive:true});
  });
  await new Promise(resolve => service.ipc.listen(socket,resolve));
  await new Promise(resolve => service.server.listen(port,'127.0.0.1',resolve));
  const call = (name, {token=panel, from=origin, data, ...other}={}) => fetch(origin+name,{
    method:'POST',headers:{...(from ? {Origin:from} : {}),Authorization:'Bearer '+token,
      ...(data ? {'Content-Type':'application/json'} : {}),...other},body:data && JSON.stringify(data),
  });
  const status = () => call('/status').then(r=>r.json());
  assert.equal((await status()).status,'waiting');
  assert.equal((await call('/status',{from:'https://foreign.example'})).status,403);
  assert.equal((await call('/status',{from:''})).status,403);
  assert.equal((await call('/status',{token:'0'.repeat(64)})).status,403);
  assert.equal((await call('/status',{token:native})).status,403);
  assert.equal((await call('/admin/status')).status,403);
  assert.equal((await call('/admin/status',{token:native,from:''})).status,200);
  assert.equal((await fetch(origin+'/status')).status,404);
  const wrongHost = await new Promise(resolve => {
    http.get(origin+'/',{headers:{Host:'foreign.example'}},res=>{res.resume();resolve(res.statusCode);});
  });
  assert.equal(wrongHost,403);
  const stranger = net.connect(socket);
  await once(stranger,'connect');
  writeFrame(stranger,{type:'authenticate',token:panel});
  await once(stranger,'close');
  assert.equal((await status()).status,'waiting');

  const child = extensionId => {
    const proc = spawn(process.execPath,[entry,manifest,extensionId],{
      env:{...process.env,HOME:home,USERPROFILE:home}, stdio:['pipe','pipe','pipe'],
    });
    children.push(proc);
    return proc;
  };
  const foreign = child('other@example.org');
  assert.equal((await once(foreign,'exit'))[0],1);
  const attach = async (override={}) => {
    const proc = child('browser-bridge@st-iphonie.local');
    const messages = [];
    readFrames(proc.stdout,msg=>messages.push(msg),()=>assert.fail('invalid native stdout'));
    writeFrame(proc.stdin,{type:'hello',version:2,build,firefox:'150.0',...override});
    await wait(()=>messages.length);
    return {proc,messages};
  };
  let channel = await attach({build:'0.0.0'});
  assert.equal(channel.messages[0].reason,'version-mismatch');
  assert.equal((await status()).status,'version-mismatch');
  channel = await attach();
  assert.deepEqual(channel.messages[0],{type:'accepted',version:2});
  assert.equal((await status()).status,'connecting');
  writeFrame(channel.proc.stdin,{type:'state',version:2,state:page});
  await wait(async ()=>(await status()).status === 'connected');
  assert.deepEqual((await status()).state,page);
  const diagnostic = await call('/diagnostics').then(r=>r.text());
  assert(!/Private tab|session=fixture|password/.test(diagnostic));
  const req = command();
  const pending = call('/command',{data:req});
  const incoming = await wait(()=>channel.messages[1]);
  assert.equal(incoming.action,'reload');
  assert.notEqual(incoming.id,req.id);
  writeFrame(channel.proc.stdin,{type:'result',version:2,id:incoming.id,ok:true});
  assert.deepEqual(await (await pending).json(),{ok:true,version:2,id:req.id});
  assert.equal((await call('/command',{data:command('eval',{})})).status,409);
  const interrupted = call('/command',{data:command()});
  await wait(()=>channel.messages[2]);
  channel.proc.stdin.end();
  assert.equal((await (await interrupted).json()).error,'disconnected');
  assert.equal((await status()).state,null);
  channel = await attach();
  writeFrame(channel.proc.stdin,{type:'state',version:2,state:page});
  await wait(async ()=>(await status()).status === 'connected');
  assert.equal((await status()).connections,2);
});

test('content script reports focus and measurements without accessing values', async () => {
  const callbacks = {};
  const messages = [];
  const element = type => ({localName:'input',type,closest:()=>null,
    matches:query=>query.startsWith('textarea'),get value(){throw new Error('read password');}});
  const document = {activeElement:element('password'),addEventListener:(event,fn)=>{callbacks[event]=fn;}};
  const window = {innerWidth:420,innerHeight:760,devicePixelRatio:1.25,
    visualViewport:{width:410,height:700,scale:1.1,addEventListener(){}},addEventListener(){}};
  const browser = {runtime:{id:'bridge',onMessage:{addListener(fn){callbacks.inspect=fn;}},
    sendMessage:async msg=>messages.push(msg)}};
  vm.runInNewContext(fs.readFileSync(source+'/extension/content.js','utf8'),{document,window,browser,setTimeout,clearTimeout});
  const snapshot = () => callbacks.inspect({type:'bridge-inspect'},{id:'bridge'});
  assert.equal((await snapshot()).focus,'input:password');
  assert.equal((await snapshot()).viewport.dpr,1.25);
  assert.equal(callbacks.inspect({type:'bridge-inspect'},{id:'other'}),undefined);
  document.activeElement = null;
  callbacks.focusout();
  assert.equal((await snapshot()).focus,null);
  await wait(()=>messages.length);
  assert.equal(JSON.stringify(messages), '[{"type":"bridge-page-changed"}]');
});

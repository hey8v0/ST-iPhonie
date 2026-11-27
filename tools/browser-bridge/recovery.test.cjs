const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {firefoxRepair,findSessions}=require('../../termux/browser-bridge/firefox-repair.cjs');
const {createRecovery}=require('../../termux/browser-bridge/recovery.cjs');
const {repairOrigin}=require('../../termux/browser-bridge/config.cjs');

const owner='d01c95af-1e77-4770-a27f-a91f8c4b69df';
const session={pid:'71',display:':29',auth:'/private/Xauthority'};
function desktop(xprop=true) {
  const keys=[],typed=[];
  let active='11',owned=['11'],full=true;
  const driver=firefoxRepair({sessions:()=>[session],sleep:async()=>{},run:async(bin,args,context)=>{
    assert.equal(context,session);
    if (bin==='xprop') {
      if (!xprop) throw new Error('xprop unavailable');
      return '_NET_WM_STATE(ATOM) = '+(args[1]==='11' && full ? '_NET_WM_STATE_FULLSCREEN' : '_NET_WM_STATE_MAXIMIZED_VERT');
    }
    assert.equal(bin,'xdotool');
    switch(args[0]) {
      case 'search':
        assert.deepEqual(args.slice(1,5),['--onlyvisible','--all','--pid','71']);
        return owned.join('\n');
      case 'getactivewindow':return active;
      case 'windowactivate':
        if (active!=='99') active=args.at(-1);
        return '';
      case 'key':
        assert(owned.includes(active));
        keys.push(...args.slice(2));
        if (args.includes('F11')) full=!full;
        if (args.includes('ctrl+n')) {owned.push('12');active='12';}
        return '';
      case 'type':typed.push(args.at(-1));return '';
      default:assert.fail('Unexpected desktop command '+args[0]);
    }
  }});
  return {driver,keys,typed,focusOther:()=>{active='99';},active:()=>active};
}

test('detects only Firefox processes using the managed profile, session marker and X11 authorization', t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'iphonie-repair-'));
  t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
  const source=path.join(root,'browser'),proc=path.join(root,'proc');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'owner'),owner);
  for (const [pid,exe,profile,marker,auth] of [
    ['71','firefox','profile',owner,'Xauthority'],['72','firefox','other',owner,'Xauthority'],
    ['73','firefox','profile','foreign','Xauthority'],['74','other','profile',owner,'Xauthority'],
    ['75','firefox','profile',owner,'foreign'],
  ]) {
    const files=path.join(proc,pid);
    fs.mkdirSync(files,{recursive:true});
    fs.writeFileSync(path.join(files,'cmdline'),[exe,'--profile',path.join(source,profile)].join('\0'));
    fs.writeFileSync(path.join(files,'environ'),
      ['DISPLAY=:29','IPHONIE_SESSION='+marker,'XAUTHORITY='+path.join(source,auth)].join('\0'));
  }
  assert.deepEqual(findSessions(source,proc),[{...session,auth:path.join(source,'Xauthority')}]);
});

test('recovers verified Firefox chrome and opens a new debugging tab; never toggles blindly', async()=>{
  const {driver,keys,typed}=desktop();
  assert.equal((await driver.restore(true)).ok,true);
  assert.deepEqual(keys,['Escape','F11','ctrl+t','ctrl+l','Return']);
  assert.deepEqual(typed,['about:debugging#/runtime/this-firefox']);
  await driver.restore(true);
  assert.equal(keys.filter(key=>key==='F11').length,1);
});

test('without xprop uses a separate window in the same session and can return to the original', async()=>{
  const {driver,keys,focusOther,active}=desktop(false);
  assert.equal((await driver.restore()).mode,'new-window');
  assert.equal(active(),'12');
  assert.equal((await driver.restore(true)).ok,true);
  assert.equal(keys.filter(key=>key==='ctrl+n').length,1);
  assert(!keys.includes('F11'));
  await driver.finish();
  assert.equal(active(),'11');
  focusOther();
  assert.equal((await driver.restore(true)).reason,'window-focus');
});

test('authenticated recovery works while extension or control service is absent, mismatched, or update was interrupted',async t=>{
  const {driver,typed}=desktop();
  const panel='1'.repeat(64),native='2'.repeat(64),host=new URL(repairOrigin).host;
  let update='frontend',extension='absent',control='stopped',resumes=0;
  const server=createRecovery({panel,native,driver,serve:()=>false,readUpdate:()=>update,resume:async()=>{
    resumes++;
    control='running';
    return extension==='matched' || 'extension';
  }});
  t.after(()=>server.close());
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const call=(route,{token=panel,origin=repairOrigin,hostHeader=host,body}={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method:'POST',
      headers:{Host:hostHeader,Authorization:'Bearer '+token,...(origin?{Origin:origin}:{})}},res=>{
      let value='';
      res.setEncoding('utf8');res.on('data',part=>{value+=part;});
      res.on('end',()=>resolve({code:res.statusCode,body:value?JSON.parse(value):null}));
    });
    req.on('error',reject);req.end(body);
  });
  assert.equal((await call('/repair-open',{origin:'https://malicious.example'})).code,403);
  assert.equal((await call('/repair-open',{hostHeader:'malicious.example'})).code,403);
  assert.equal((await call('/repair-open',{token:native})).code,403);
  assert.equal((await call('/admin/restore',{token:panel,origin:''})).code,403);
  assert.equal((await call('/admin/restore',{token:native})).code,403);
  assert.equal((await call('/eval')).code,404);
  assert.equal((await call('/repair-open',{body:'{"url":"https://ignored.example","shell":"ignored"}'})).body.ok,true);
  assert.deepEqual(typed,['about:debugging#/runtime/this-firefox']);
  assert.equal(control,'stopped');
  assert.equal((await call('/repair-done')).body.reason,'update-incomplete');
  assert.equal(resumes,0);
  update='failed';
  assert.equal((await call('/repair-open')).body.ok,true);
  assert.equal((await call('/repair-done')).body.reason,'update-incomplete');
  update='extension';
  assert.equal((await call('/repair-done')).body.reason,'extension-update');
  assert.equal(control,'running');
  extension='old';
  assert.equal((await call('/repair-open')).body.ok,true);
  assert.equal((await call('/repair-done')).body.reason,'extension-update');
  assert.equal((await call('/admin/status',{token:native,origin:''})).body.maintenance,true);
  extension='matched';
  assert.equal((await call('/repair-done')).body.ok,true);
  const info=(await call('/admin/status',{token:native,origin:''})).body;
  assert.equal(info.maintenance,false);
  assert.equal(info.addon,undefined);
});

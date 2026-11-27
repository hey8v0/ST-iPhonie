const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {discover,firefoxRepair,findSessions}=require('../../termux/browser-bridge/firefox-repair.cjs');
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
      case 'getdisplaygeometry':return '1024 768';
      case 'search':
        assert.deepEqual(args.slice(1),['--onlyvisible','--pid','71']);
        return owned.join('\n');
      case 'getactivewindow':return active;
      case 'getwindowfocus':return active;
      case 'windowactivate':
        if (active!=='99') active=args.at(-1);
        return '';
      case 'windowraise':case 'windowfocus': return '';
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
    fs.writeFileSync(path.join(files,'stat'),pid+' (firefox) S '+Array(21).fill('5').join(' '));
  }
  const [{runtime,...managed}]=findSessions(source,proc);
  assert.equal(findSessions(source,proc).length,1);
  assert.match(runtime,/^[a-f0-9]{64}$/);
  assert.equal(managed.pid,session.pid);
  assert.equal(managed.display,session.display);
  assert.equal(managed.auth,path.join(source,'Xauthority'));

  // Gecko's re-exec can differ from the original command line and env.
  const display=path.join(proc,'76');
  fs.mkdirSync(display);
  const auth=path.join(source,'Xauthority');
  fs.writeFileSync(path.join(display,'cmdline'),['/prefix/Xvnc',':29','-localhost','-rfbport','5929','-auth',auth].join('\0'));
  fs.writeFileSync(path.join(display,'environ'),['TMPDIR='+root,'IPHONIE_SESSION='+owner].join('\0'));
  const restarted=path.join(proc,'71');
  fs.writeFileSync(path.join(restarted,'cmdline'),['/prefix/firefox','-profile='+path.join(source,'profile')].join('\0'));
  fs.writeFileSync(path.join(restarted,'environ'),'HOME='+root);
  const report=discover(source,proc);
  assert.equal(report.info.privateSession,'verified-via-xvnc');
  assert.equal(report.info.authority,'from-xvnc');
  assert.equal(report.info.display,'from-xvnc');
  assert.equal(report.sessions.length,1);
  assert.equal(report.sessions[0].tmp,root);
  assert.notEqual(report.sessions[0].runtime,runtime);
});

test('private X11 class fallback ignores foreign window PIDs and diagnoses authorization failures',async()=>{
  const managed={...session,privateDisplay:true};
  let rejected=false;
  const driver=firefoxRepair({sessions:()=>[managed],run:async (bin,args)=>{
    if (bin==='xprop') return '_NET_WM_STATE(ATOM) =';
    if (args[0]==='getdisplaygeometry') {
      if (rejected) throw Object.assign(new Error('connection failed'),{stderr:'Invalid MIT-MAGIC-COOKIE-1 key'});
      return '1024 768';
    }
    if (args[0]==='getactivewindow') return '';
    if (args[0]==='getwindowfocus') return '11';
    if (args[0]==='getwindowpid') return args[1]==='11'?'':'777';
    if (args[0]==='search') return args.includes('--pid')?'':'11\n22';
    return '';
  }});
  assert.deepEqual((await driver.locate()).owned,['11']);
  assert.equal((await driver.status()).windowManager,'x-focus');
  assert.equal((await driver.status()).windowPid,'class-fallback');
  rejected=true;
  assert.equal((await driver.status()).x11,'authorization-failed');
  assert.equal((await driver.restore('restart')).reason,'x11-unavailable');
  assert(!JSON.stringify(await driver.status()).includes('MIT-MAGIC-COOKIE'));
});

test('recovers verified Firefox chrome and opens a new debugging tab; never toggles blindly', async()=>{
  const {driver,keys,typed}=desktop();
  assert.equal((await driver.restore('addons')).ok,true);
  assert.deepEqual(keys,['Escape','F11','ctrl+t','ctrl+l','Return']);
  assert.deepEqual(typed,['about:addons']);
  await driver.restore('restart');
  assert.equal(typed.at(-1),'about:profiles');
  assert.equal((await driver.restore('install',path.resolve('signed addon.xpi'))).ok,true);
  assert.match(typed.at(-1),/^file:.*signed%20addon\.xpi$/);
  assert.equal(keys.filter(key=>key==='F11').length,1);
});

test('without xprop uses a separate window in the same session and can return to the original', async()=>{
  const {driver,keys,focusOther,active}=desktop(false);
  assert.equal((await driver.restore()).mode,'new-window');
  assert.equal(active(),'12');
  assert.equal((await driver.restore('addons')).ok,true);
  assert.equal(keys.filter(key=>key==='ctrl+n').length,1);
  assert(!keys.includes('F11'));
  await driver.finish();
  assert.equal(active(),'11');
  focusOther();
  assert.equal((await driver.restore('addons')).reason,'window-focus');
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
  assert.deepEqual(typed,['about:addons']);
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
  assert.equal(info.diagnostics.http,'available');
  assert.equal(info.diagnostics.lastAction.navigation,'dispatched');
  assert.equal(info.diagnostics.exit,'no-window-change');
  assert.equal((await call('/admin/health',{token:native,origin:''})).body.http,'available');
  assert.equal(info.addon,undefined);
});

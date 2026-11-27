const fs=require('node:fs');
const http=require('node:http');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {repairOrigin,filename,secrets,equal}=require('./config.cjs');
const {firefoxRepair}=require('./firefox-repair.cjs');
const {serveGraphics,attachGraphics}=require('./graphics.cjs');
const signed=require('./signed-release.cjs');
const {service:build}=signed.settings;
const origin=repairOrigin,host=new URL(origin).host;
const revision=1;
const addon=signed.addon;
const incomplete=stage=>['preparing','browser','frontend','failed'].includes(stage);
function updateState() {
  try {
    const value=JSON.parse(fs.readFileSync(filename('update.json'),'utf8'));
    return ['preparing','browser','frontend','extension','done','failed'].includes(value.stage) ? value.stage : null;
  } catch {return null;}
}

function createRecovery({panel,native,driver,serve=serveGraphics,onStop=()=>{},readUpdate=updateState,resume=async()=>true,
  signedStatus=()=>null,onInstall=()=>{}}) {
  let busy=false, maintenance=false, lastExit=null, windowCheck, checkedAt=0;
  async function inspectWindow() {
    if (!windowCheck || Date.now()-checkedAt>1800) {
      checkedAt=Date.now();
      windowCheck=Promise.resolve().then(async()=>{
        if (driver.status) return driver.status();
        return {ready:Boolean(await driver.locate())};
      }).catch(()=>({ready:false,x11:'probe-failed'}));
    }
    return windowCheck;
  }
  return http.createServer(async (req,res)=>{
    const json=(code,value)=>{
      res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(value));
    };
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (req.headers.host!==host) return res.writeHead(403).end();
    if (serve(req,res,origin)) return;
    const admin=['/admin/status','/admin/health','/admin/stop','/admin/restore'].includes(req.url);
    const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (req.method!=='POST' ||
      (admin ? req.headers.origin || req.headers['sec-fetch-site'] || !equal(token,native) :
        req.headers.origin!==origin || !equal(token,panel))) return res.writeHead(403).end();
    if (req.url==='/admin/stop') {
      res.once('finish',onStop);return json(200,{ok:true});
    }
    if (req.url==='/admin/health') return json(200,{service:'iphonie-firefox-recovery',revision,build,http:'available'});
    if (req.url==='/repair-link') {
      if (!maintenance || incomplete(readUpdate()) || !signed.checkedPackage())
        return json(409,{ok:false,reason:'update-incomplete'});
      onInstall();
      return json(200,{ok:true,url:pathToFileURL(addon).href});
    }
    if (req.url==='/repair-done') {
      if (busy) return json(409,{ok:false,reason:'busy'});
      const fail=(code,reason)=>{lastExit=reason;return json(code,{ok:false,reason});};
      if (incomplete(readUpdate())) return fail(409,'update-incomplete');
      busy=true;
      try {
        const result=await resume();
        if (result==='extension') return fail(409,'extension-update');
        if (result==='restart') return fail(409,'extension-restart');
        if (result==='frontend') return fail(409,'frontend-version');
        if (!result) return fail(503,'control-start');
        lastExit=await Promise.resolve().then(()=>driver.finish?.()).catch(()=> 'activation-failed') || 'complete';
        maintenance=false;return json(200,{ok:true});
      } catch {return fail(503,'control-start');}
      finally {busy=false;checkedAt=0;}
    }
    if (['/repair-open','/repair-restore','/repair-addon','/repair-restart','/admin/restore'].includes(req.url)) {
      if (busy) return json(409,{ok:false,reason:'busy'});
      busy=true;
      if (!admin) maintenance=true;
      try {
        if (req.url==='/repair-addon') {
          if (incomplete(readUpdate()) || !signed.checkedPackage())
            return json(409,{ok:false,reason:'update-incomplete'});
          onInstall();
          return json(200,await driver.restore('install',addon));
        }
        if (req.url==='/repair-open') {
          onInstall();
          return json(200,await driver.restore(signedStatus()==='restart-required'?'restart':'addons'));
        }
        if (req.url==='/repair-restart') return json(200,await driver.restore('restart'));
        return json(200,await driver.restore());
      }
      catch {return json(503,{ok:false,reason:'window-recovery'});}
      finally {busy=false;checkedAt=0;}
    }
    if (req.url!=='/status' && req.url!=='/admin/status') return res.writeHead(404).end();
    const update=readUpdate();
    const diagnostics={http:'available',...await inspectWindow(),maintenance,exit:lastExit};
    json(200,{service:'iphonie-firefox-recovery',revision,build,ready:diagnostics.ready,maintenance,busy,update,diagnostics,
      signed:signedStatus(),addon:admin ? undefined : !incomplete(update) && signed.checkedPackage()});
  }).on('clientError',(_error,socket)=>socket.destroy());
}
async function request(task,timeout=3400) {
  try {
    const response=await fetch(origin+'/admin/'+task,{
      method:'POST',redirect:'error',headers:{Authorization:'Bearer '+secrets().native},
      signal:AbortSignal.timeout(timeout),
    });
    return response.ok ? await response.json() : null;
  } catch {return null;}
}

if (require.main===module) {
  process.umask(0o077);
  const {panel,native}=secrets();
  const server=createRecovery({panel,native,driver:firefoxRepair(),onStop:stop,
    signedStatus:signed.status,onInstall:signed.markMigration,
    resume:()=>new Promise(resolve=>execFile(process.execPath,[path.join(__dirname,'cli.cjs'),'resume-control'],
      {timeout:9500,maxBuffer:8192},error=>resolve(
        ({2:'extension',3:'restart',4:'frontend'})[error?.code] || !error))),
  });
  let closeGraphics;
  function stop() {closeGraphics?.();server.close();server.closeAllConnections();}
  server.on('error',()=>{process.stderr.write('recovery-listener-failed\n');process.exitCode=1;});
  closeGraphics=attachGraphics(server,{host,origin,panel,onIdle(){}});
  server.listen(Number(new URL(origin).port),'127.0.0.1');
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,stop);
}
module.exports={createRecovery,request,revision};

const fs=require('node:fs');
const http=require('node:http');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {repairOrigin,filename,secrets,equal}=require('./config.cjs');
const {firefoxRepair}=require('./firefox-repair.cjs');
const {serveGraphics,attachGraphics}=require('./graphics.cjs');
const {version:build}=require('./extension/manifest.json');
const origin=repairOrigin,host=new URL(origin).host;
const revision=1;
const addon=filename('current/iPhonie-Browser-Bridge.xpi');
const incomplete=stage=>['preparing','browser','frontend','failed'].includes(stage);
function updateState() {
  try {
    const value=JSON.parse(fs.readFileSync(filename('update.json'),'utf8'));
    return ['preparing','browser','frontend','extension','done','failed'].includes(value.stage) ? value.stage : null;
  } catch {return null;}
}

function createRecovery({panel,native,driver,serve=serveGraphics,onStop=()=>{},readUpdate=updateState,resume=async()=>true}) {
  let busy=false, maintenance=false;
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
    const admin=req.url==='/admin/status' || req.url==='/admin/stop' || req.url==='/admin/restore';
    const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (req.method!=='POST' ||
      (admin ? req.headers.origin || req.headers['sec-fetch-site'] || !equal(token,native) :
        req.headers.origin!==origin || !equal(token,panel))) return res.writeHead(403).end();
    if (req.url==='/admin/stop') {
      res.once('finish',onStop);return json(200,{ok:true});
    }
    if (req.url==='/repair-done') {
      if (busy) return json(409,{ok:false,reason:'busy'});
      if (incomplete(readUpdate())) return json(409,{ok:false,reason:'update-incomplete'});
      busy=true;
      try {
        const result=await resume();
        if (result==='extension') return json(409,{ok:false,reason:'extension-update'});
        if (!result) return json(503,{ok:false,reason:'control-start'});
        await driver.finish?.().catch(()=>{});
        maintenance=false;return json(200,{ok:true});
      } catch {return json(503,{ok:false,reason:'control-start'});}
      finally {busy=false;}
    }
    if (['/repair-open','/repair-restore','/repair-addon','/admin/restore'].includes(req.url)) {
      if (busy) return json(409,{ok:false,reason:'busy'});
      busy=true;
      if (!admin) maintenance=true;
      try {
        if (req.url==='/repair-addon') {
          if (incomplete(readUpdate()) || !fs.existsSync(addon))
            return json(409,{ok:false,reason:'update-incomplete'});
          return json(200,await driver.fillAddon(addon));
        }
        return json(200,await driver.restore(req.url==='/repair-open'));
      }
      catch {return json(503,{ok:false,reason:'window-recovery'});}
      finally {busy=false;}
    }
    if (req.url!=='/status' && req.url!=='/admin/status') return res.writeHead(404).end();
    const update=readUpdate();
    const ready=Boolean(await driver.locate().catch(()=>null));
    json(200,{service:'iphonie-firefox-recovery',revision,build,ready,maintenance,busy,update,
      addon:admin ? undefined : !incomplete(update) && fs.existsSync(addon)});
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
    resume:()=>new Promise(resolve=>execFile(process.execPath,[path.join(__dirname,'cli.cjs'),'resume-control'],
      {timeout:9500,maxBuffer:8192},error=>resolve(error?.code===2?'extension':!error))),
  });
  let closeGraphics;
  function stop() {closeGraphics?.();server.close();server.closeAllConnections();}
  server.on('error',()=>{process.stderr.write('recovery-listener-failed\n');process.exitCode=1;});
  closeGraphics=attachGraphics(server,{host,origin,panel,onIdle(){}});
  server.listen(Number(new URL(origin).port),'127.0.0.1');
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,stop);
}
module.exports={createRecovery,request,revision};

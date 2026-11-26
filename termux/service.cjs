const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn, execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const base = path.join(os.homedir(), '.local/share/st-iphonie-browser');
const file = name => path.join(base, name);
const endpoint = 'http://127.0.0.1:6089';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const messages = {
  environment:'正在检查浏览器运行环境', screen:'正在建立虚拟屏幕', window:'屏幕已就绪，正在等待 Firefox 窗口',
  handshake:'Firefox 窗口已打开，正在检查本机端口（不发起 VNC 连接）', ready:'本机服务已就绪，请打开小手机连接（首帧尚待客户端验证）',
  software:'正在用软件渲染重试', recover:'浏览器会话中断，正在恢复',
  dependency:'Firefox 或运行库无法加载。请运行 iphonie-browser repair',
  display:'虚拟屏幕无法建立。请运行 iphonie-browser diagnose',
  font:'找不到可读字体。请重新运行安装命令', port:'本机浏览器端口被占用，若旧试玩脚本仍在运行，请先在原窗口按 Ctrl+C',
  firefox:'Firefox 已退出或未能打开可见窗口。请导出诊断',
  bridge:'未收到 VNC 协议握手。请重新连接或导出诊断',
  environmentError:'运行文件、命令或目录不可用。请重新执行安装命令',
  stopped:'服务未启动', unavailable:'连接不到本机服务'
};
function read(name) { try {return fs.readFileSync(file(name),'utf8').trim();} catch {return '';} }
function write(name, value) {
  const tmp = file(name + '.' + process.pid + '.tmp');
  fs.writeFileSync(tmp, value, {mode:0o600}); fs.renameSync(tmp,file(name));
}
function fromLog(log) {
  if (/lib[^\s/]+\.so[^\s]*[^\n]{0,100}(?:not found|cannot open shared object)|couldn.t load xpcom|CANNOT LINK EXECUTABLE/i.test(log)) return 'dependency';
  return null;
}
function record(text) {
  const dest = file('runtime.log');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2*1024*1024) fs.renameSync(dest,file('runtime.previous.log'));
  fs.appendFileSync(dest,text,{mode:0o600});
}
function issue(code) {return Object.assign(new Error(messages[code]),{stage:code});}
async function health() {
  try {
    const r = await fetch(endpoint+'/health',{signal:AbortSignal.timeout(1200),redirect:'error'});
    const data = await r.json();
    return data.service === 'iphonie-firefox-v2' ? data : null;
  } catch {return null;}
}
async function portFree(port) {
  const s = net.createServer();
  return new Promise(resolve => {
    s.once('error',()=>resolve(false));
    s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));
  });
}
// Never open a VNC socket just to test liveness: TigerVNC counts
// unauthenticated connections toward its per-address blacklist.
function vncLogFlags(log) {
  return {blacklistSeen:/blacklisted:|too many security failures/i.test(log),
    authenticationFailureSeen:/authentication failure|authfailureexception/i.test(log)};
}
async function daemon() {
  const token = crypto.randomBytes(32).toString('hex');
  const owner = crypto.randomUUID();
  let state = {service:'iphonie-firefox-v2',build:path.basename(__dirname),state:'starting',code:'environment'};
  let stopping = false, recentErrors = '', failedChild = '';
  let vncSecurity={blacklistSeen:false,authenticationFailureSeen:false};
  const children = new Set();
  function step(status, code) {
    state = {...state,state:status,code};
    write('state.json',JSON.stringify(state));
    record('\n'+new Date().toISOString()+' '+code+'\n');
  }
  function child(bin,args,env,stage) {
    const p=spawn(bin,args,{env,stdio:['ignore','pipe','pipe']});
    children.add(p);
    for(const stream of [p.stdout,p.stderr]) stream.on('data',data=>{
      record(data); recentErrors=(recentErrors+data.toString()).slice(-60000);
      if(stage==='display'){const flags=vncLogFlags(recentErrors);for(const key of Object.keys(flags))vncSecurity[key] ||= flags[key];}
    });
    p.once('error',e=>{record(bin+' '+e.message+'\n'); if(children.has(p)) failedChild ||= stage;});
    p.once('exit',(code,signal)=>{
      record(new Date().toISOString()+' '+bin+' exit '+(signal || code)+'\n');
      if(children.has(p)) failedChild ||= stage;
      children.delete(p);
    });
    return p;
  }
  async function clean() {
    const list=[...children]; children.clear();
    for(const p of list) p.kill();
    for(let i=0;i<20 && list.some(p=>p.pid && p.exitCode===null && !p.signalCode);i++) await sleep(100);
    for(const p of list) if(p.pid && p.exitCode===null && !p.signalCode) p.kill('SIGKILL');
  }
  async function stop() {
    if(stopping) return;
    stopping=true;
    await clean();
    await reap(owner);
    step('stopped','stopped'); process.exit(0);
  }
  let viewerEvents=[];
  const server=require('./bridge.cjs').createBridge({directory:file('viewer'),health:()=>({...state,healthCheck:'process-and-x11-no-vnc-probe',vncSecurity:{...vncSecurity},viewerEvents:viewerEvents.slice(-20)}),stop,token,viewerEvent:event=>{viewerEvents.push(event);viewerEvents=viewerEvents.slice(-40);write('viewer-events.json',JSON.stringify(viewerEvents));}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(6089,'127.0.0.1',resolve);});
  write('control',token);
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  // Only reap descendants carrying the previous private session identifier.
  async function reap(old) {
    if (!/^[a-f0-9-]{36}$/.test(old)) return;
    for (const signal of ['SIGTERM','SIGKILL']) {
      let processes;
      try {processes=fs.readdirSync('/proc');} catch {return;}
      for (const pid of processes.filter(n=>/^\d+$/.test(n))) {
        try {
          if (fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').includes('IPHONIE_SESSION='+old))
            process.kill(Number(pid),signal);
        } catch { /* Android can hide unrelated processes */ }
      }
      if(signal==='SIGTERM') await sleep(250);
    }
  }
  await reap(read('owner')); write('owner',owner);
  async function run(bin,args,env) {
    try {return (await exec(bin,args,{env,timeout:4000,maxBuffer:1024*1024})).stdout;}
    catch(e){
      record(bin+': '+(bin==='xauth'?'authority setup failed':e.stderr || e.message)+'\n');
      if(bin==='xauth') throw issue('display');
      throw e;
    }
  }
  async function until(check,stage,limit) {
    const end=Date.now()+limit;
    while(Date.now()<end) {
      if(stopping || failedChild) throw issue(fromLog(recentErrors)||failedChild||stage);
      try {if(await check()) return;} catch { /* transient until deadline */ }
      await sleep(350);
    }
    throw issue(fromLog(recentErrors)||stage);
  }
  let stateCode='environmentError';
  try {
    for (const name of ['viewer/vnc.html','viewer/core/rfb.js','viewer/app/ui.js','viewer/core/util/browser.js','passwd']) fs.accessSync(file(name),fs.constants.R_OK);
    fs.accessSync(file('profile'),fs.constants.W_OK);
    require('./viewer-patch.cjs').html(read('viewer/vnc.html'));
    require('./viewer-patch.cjs').compatibility(read('viewer/core/util/browser.js'));
    try {await run('firefox',['--version'],process.env);}
    catch(e){throw issue(fromLog([e.stderr,e.stdout,e.message].join('\n')) || 'environmentError');}
    const font=(await run('fc-match',['-f','%{file}','sans-serif'],process.env)).trim();
    if(!font || !fs.existsSync(font)) throw issue('font');
    try {await run('pulseaudio',['--start'],process.env);} catch {record('Audio unavailable\n');}
    for(let attempt=0;attempt<2;attempt++) {
      try {
        failedChild=''; recentErrors='';
        vncSecurity={blacklistSeen:false,authenticationFailureSeen:false};
        if(!await portFree(5929)) throw issue('port');
        const tmp=process.env.TMPDIR || os.tmpdir();
        let display=29;
        while(display<64 && ['.X'+display+'-lock','.X11-unix/X'+display].some(n=>fs.existsSync(path.join(tmp,n)))) display++;
        if(display===64) throw issue('display');
        const env={...process.env,IPHONIE_SESSION:owner,DISPLAY:':'+display,XAUTHORITY:file('Xauthority'),GDK_BACKEND:'x11'};
        if(attempt) env.LIBGL_ALWAYS_SOFTWARE='true';
        step('starting',attempt?'software':'screen');
        fs.closeSync(fs.openSync(env.XAUTHORITY,'a',0o600));
        await run('xauth',['add',env.DISPLAY,'.',crypto.randomBytes(16).toString('hex')],env);
        const fontRoot=path.join(env.PREFIX,'share/fonts');
        const fontDirs=['misc','TTF','Type1','75dpi','100dpi'].map(n=>path.join(fontRoot,n))
          .filter(dir=>fs.existsSync(path.join(dir,'fonts.dir')));
        const fonts=fontDirs.length ? ['-fp',fontDirs.join(',')+',built-ins'] : [];
        child('Xvnc',[env.DISPLAY,...fonts,'-localhost','-nolisten','tcp','-auth',env.XAUTHORITY,'-geometry','600x900','-depth','24','-rfbport','5929','-SecurityTypes','VncAuth','-PasswordFile',file('passwd')],env,'display');
        await until(async()=>Boolean(await run('xdpyinfo',[],env)),'display',10000);
        step('starting','window');
        child('firefox',['--no-remote','--profile',file('profile'),'--width','600','--height','900','about:home'],env,'firefox');
        await until(async()=>/\d/.test(await run('xdotool',['search','--onlyvisible','--class','firefox'],env)),'firefox',35000);
        // Binding an already occupied local port does not open a TCP client.
        // Check that Xvnc has bound its port, without making a VNC connection.
        // Real protocol authentication and rendering are checked by the viewer.
        step('starting','handshake');
        await until(async()=>!await portFree(5929),'bridge',6500);
        if(failedChild) throw issue(fromLog(recentErrors)||failedChild);
        step('ready','ready');
        // Child exit notifications supervise the session. No periodic VNC
        // probes, including while a viewer is disconnected or Android sleeps.
        while(!failedChild && !stopping) await sleep(400);
        if(stopping) return;
        throw issue(fromLog(recentErrors)||failedChild||'firefox');
      } catch(e) {
        if(stopping) return;
        const code=e.stage || 'environmentError';
        await clean(); await reap(owner);
        if(attempt || !['display','firefox','bridge'].includes(code)) throw e;
        step('starting','recover'); await sleep(400);
      }
    }
  } catch(e) {
    stateCode=e.stage || 'environmentError';
    record(String(e.stack)+'\n'); await clean();
    step(['dependency','environmentError','font'].includes(stateCode)?'environment':'failed',stateCode);
  }
}
async function stopCurrent() {
  const r=await fetch(endpoint+'/stop',{method:'POST',headers:{Authorization:'Bearer '+read('control')},signal:AbortSignal.timeout(3000)});
  if(!r.ok) throw Error('无法确认服务归属，已保留现有进程。');
  for(let i=0;i<50;i++){if(!await health()) return;await sleep(100);}
  throw Error('服务仍在退出，请稍后重试。');
}
function summary(h) {
  let saved={};
  try {saved=JSON.parse(read('state.json'));} catch {}
  let viewerEvents=[];try{viewerEvents=JSON.parse(read('viewer-events.json'));}catch{}
  const installLog=read('install.log');
  const missingCommands=[...new Set([...installLog.matchAll(/(?:line \d+: )?([a-zA-Z0-9_-]+): command not found/g)].map(m=>m[1]))];
  // Export only enumerated fields. Raw logs can contain visited URLs or profile data.
  return {platform:process.platform,arch:process.arch,node:process.version,
    viewerEvents:h?.viewerEvents || viewerEvents, healthCheck:h?.healthCheck || 'unknown', vncSecurity:h?.vncSecurity || null, historicalVncSecurity:vncLogFlags(read('runtime.log')+'\n'+read('runtime.previous.log')), historicalMissingCommands:missingCommands, h264Compatibility:'disabled',
    state:h?.state || 'stopped',code:h?.code || (Object.hasOwn(messages,saved.code)?saved.code:'stopped'),
    displayWarnings:Object.fromEntries(['GL_EXT_shader_texture_lod','GBM','DRI3','font path','channel error','XPCOM'].map(k=>[k,read('runtime.log').toLowerCase().includes(k.toLowerCase())]))};
}
async function main(action) {
  process.umask(0o077);
  if(action==='daemon') return daemon();
  let h=await health();
  if(action==='old-build'){process.exitCode=h && h.build!==path.basename(__dirname)?0:1;return;}
  if(action==='reuse') {
    if(h && ['ready','starting'].includes(h.state)) {
      if(h.build!==path.basename(__dirname)) console.log('新版已安装，现有会话仍可用。关闭网页后运行 iphonie-browser stop，再启动即可切换。');
      if(h.state==='ready'){console.log(messages.ready);return;}
      return waitReady();
    }
    process.exitCode=1; return;
  }
  if(action==='diagnose'||action==='export'){
    const report=summary(h);
    try {
      const sdk=(await exec('getprop',['ro.build.version.sdk'],{timeout:1500})).stdout.trim();
      if(/^\d+$/.test(sdk)) report.androidSDK=sdk;
      const packages=await exec('dpkg-query',['-W','firefox','libicu','tigervnc','fontconfig-utils','xdotool'],{timeout:2500});
      report.packages=Object.fromEntries(packages.stdout.trim().split('\n')
        .map(s=>s.split(/\s+/)).filter(([k,v])=>['firefox','libicu','tigervnc','fontconfig-utils','xdotool'].includes(k) && /^[\w.:+~-]+$/.test(v)));
    } catch { /* A partial report is still useful. */ }
    const data=JSON.stringify(report,null,2);
    if(action==='export'){
      write('diagnostics.json',data);
      let output=file('diagnostics.json');
      const downloads=path.join(os.homedir(),'storage/downloads');
      try {
        const dest=path.join(downloads,'iphonie-diagnostics-'+Date.now()+'.json');
        fs.writeFileSync(dest,data,{flag:'wx'});output=dest;
      } catch { /* The private copy is available without Android storage permission. */ }
      console.log('可分享的诊断文件：'+output);
    }
    else console.log(data+'\n完整本地日志：'+file('runtime.log')+' 和 '+file('install.log'));
    return;
  }
  if(action==='status'){console.log(messages[h?.code || 'stopped']);return;}
  if(action==='needs-repair'){process.exitCode=h?.code==='dependency'?0:1;return;}
  if(action==='stop'){if(h) await stopCurrent(); console.log(messages.stopped);return;}
  if(action!=='start') throw Error('未知命令');
  if(h && ['failed','environment','stopped'].includes(h.state)){await stopCurrent();h=null;}
  if(!h) {
    if(!await portFree(6089)) throw issue('port');
    const fd=fs.openSync(file('daemon.log'),'a',0o600);
    try {spawn(process.execPath,[__filename,'daemon'],{detached:true,stdio:['ignore',fd,fd]}).unref();}
    finally {fs.closeSync(fd);}
  }
  await waitReady();
}
async function waitReady() {
  let last='',offline=0;
  for(let i=0;i<230;i++){
    const h=await health();
    if(!h && ++offline>10) throw Error('本机服务未响应，请运行 iphonie-browser diagnose。');
    if(h) offline=0;
    if(h && h.code!==last){console.log(messages[h.code]);last=h.code;}
    if(h?.state==='ready') return;
    if(h && ['environment','failed','stopped'].includes(h.state)){process.exitCode=1;return;}
    await sleep(500);
  }
  throw Error('启动超时。请运行 iphonie-browser diagnose。');
}
module.exports={fromLog,portFree,vncLogFlags,summary};
if(require.main===module) main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});


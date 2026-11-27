const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {browser:base} = require('./config.cjs');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {pathToFileURL} = require('node:url');
const exec = promisify(execFile);
const pages = {addons:'about:addons', restart:'about:profiles'};
const firefox = /^(firefox|firefox-bin|firefox-esr)$/i;
const vnc = /^(Xvnc|Xtigervnc)$/i;
const windowClass = '^(firefox(-esr|-bin)?|navigator)$';
const ids = value => value.trim().split(/\s+/).filter(id=>/^\d+$/.test(id));
const displayName = value => /^:\d{1,3}(\.0)?$/.test(value || '') ? value.split('.')[0] : null;

function read(file) {
  try {return fs.readFileSync(file,'utf8');} catch {return '';}
}
function sameFile(a,b) {
  if (a===b) return true;
  if (!a || !b || !path.isAbsolute(a) || !path.isAbsolute(b)) return false;
  try {return fs.realpathSync(a)===fs.realpathSync(b);} catch {return false;}
}
function commandOption(args,name) {
  const pos=args.findIndex(arg=>name.test(arg));
  return pos<0 ? null : args[pos].includes('=') ? args[pos].slice(args[pos].indexOf('=')+1) : args[pos+1];
}
function hasProfileFile(proc,pid,profile) {
  const dir=path.join(proc,pid,'fd');
  try {
    return fs.readdirSync(dir).some(fd=>{
      try {
        const file=fs.readlinkSync(path.join(dir,fd));
        return ['.parentlock','places.sqlite','cookies.sqlite'].includes(path.basename(file)) &&
          sameFile(path.dirname(file),profile);
      } catch {return false;}
    });
  } catch {return false;}
}

function discover(root=base,proc='/proc') {
  const info={privateSession:'marker-missing',firefox:'not-checked',profile:'not-checked',display:'not-checked',authority:'not-checked'};
  const owner=read(path.join(root,'owner')).trim();
  if (!/^[a-f0-9-]{36}$/.test(owner)) return {info,sessions:[]};
  info.privateSession='server-not-found';
  const profile=path.join(root,'profile'),auth=path.join(root,'Xauthority');
  let entries;
  try {entries=fs.readdirSync(proc);} catch {info.firefox='proc-unreadable';return {info,sessions:[]};}
  const processes=entries.filter(pid=>/^\d+$/.test(pid)).flatMap(pid=>{
    const prefix=path.join(proc,pid);
    const args=read(path.join(prefix,'cmdline')).split('\0');
    let name=path.basename(args[0] || '');
    if (!vnc.test(name) && !firefox.test(name)) {
      try {name=path.basename(fs.readlinkSync(path.join(prefix,'exe')));} catch {return [];}
    }
    if (!vnc.test(name) && !firefox.test(name)) return [];
    const env=new Map(read(path.join(prefix,'environ')).split('\0').filter(row=>row.includes('='))
      .map(row=>[row.slice(0,row.indexOf('=')),row.slice(row.indexOf('=')+1)]));
    return [{pid,prefix,args,name,env}];
  });
  const displayServer=processes.find(({args,env,name})=>vnc.test(name) &&
    env.get('IPHONIE_SESSION')===owner && args.includes('-localhost') &&
    commandOption(args,/^-rfbport(=|$)/)==='5929' && sameFile(commandOption(args,/^-auth(=|$)/),auth) &&
    args.some(arg=>displayName(arg)));
  const serverDisplay=displayServer?.args.map(displayName).find(Boolean);
  const browserProcesses=processes.filter(({args,name})=>firefox.test(name) && !args.includes('-contentproc'));
  if (!browserProcesses.length) info.firefox='process-not-found';
  const sessions=[];
  for (const {pid,prefix,args,env} of browserProcesses) {
    info.firefox=info.firefox==='matched' ? 'matched' : env.size?'candidate':'environment-unreadable';
    const declared=commandOption(args,/^--?profile(=|$)/i) || env.get('XRE_PROFILE_PATH');
    const marker=env.get('IPHONIE_SESSION'),display=displayName(env.get('DISPLAY')),actualAuth=env.get('XAUTHORITY');
    const explicitProfile=declared && sameFile(declared,profile);
    if ((declared && !explicitProfile) || (marker && marker!==owner) ||
      (actualAuth && !sameFile(actualAuth,auth)) || (serverDisplay && display && display!==serverDisplay)) continue;
    const anchored=Boolean(displayServer && (explicitProfile || hasProfileFile(proc,pid,profile) ||
      (marker===owner && display===serverDisplay)));
    const exact=Boolean(explicitProfile && marker===owner && display && sameFile(actualAuth,auth));
    if (!anchored && !exact) continue;
    const stat=read(path.join(prefix,'stat'));
    const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
    const runtime=/^\d+$/.test(fields[19]) ? crypto.createHash('sha256')
      .update([owner,pid,fields[19],fields[25],fields[45],...args].join('\0')).digest('hex') : null;
    const tmp=displayServer?.env.get('TMPDIR') || env.get('TMPDIR') ||
      (process.env.PREFIX && path.join(process.env.PREFIX,'tmp'));
    const session={pid,display:serverDisplay || display,auth,runtime,privateDisplay:anchored};
    if (tmp && path.isAbsolute(tmp)) session.tmp=tmp;
    sessions.push(session);
    info.firefox='matched';
    info.privateSession=marker===owner?'matched':'verified-via-xvnc';
    info.profile=explicitProfile?'matched':'private-display';
    info.display=display?'matched':'from-xvnc';
    info.authority=actualAuth?'matched':'from-xvnc';
  }
  if (!sessions.length && displayServer) info.privateSession='xvnc-matched';
  if (!sessions.length && browserProcesses.length) {
    const candidates=browserProcesses.map(({args,env})=>({
      marker:env.get('IPHONIE_SESSION'),
      profile:commandOption(args,/^--?profile(=|$)/i) || env.get('XRE_PROFILE_PATH'),
      display:env.get('DISPLAY'),auth:env.get('XAUTHORITY'),
    }));
    info.profile=candidates.some(row=>sameFile(row.profile,profile))?'matched':
      candidates.some(row=>row.profile)?'different':'unavailable';
    info.display=candidates.some(row=>displayName(row.display))?'available':'missing';
    info.authority=candidates.some(row=>sameFile(row.auth,auth))?'matched':
      candidates.some(row=>row.auth)?'different':'missing';
    if (!displayServer && candidates.some(row=>row.marker===owner)) info.privateSession='process-marker-matched';
  }
  return {info,sessions};
}

function findSessions(root=base,proc='/proc') {
  return discover(root,proc).sessions;
}

const execute=async (bin,args,session)=>(await exec(bin,args,{
  timeout:850,maxBuffer:8192,env:{...process.env,DISPLAY:session.display,XAUTHORITY:session.auth,
    ...(session.tmp?{TMPDIR:session.tmp}:{})},
})).stdout;
function x11Error(error) {
  if (error.code==='ENOENT') return 'tool-missing';
  if (/authori[sz]ation required|invalid MIT-MAGIC-COOKIE|no protocol specified/i.test(String(error.stderr))) return 'authorization-failed';
  if (error.killed) return 'timeout';
  return 'connection-failed';
}

function firefoxRepair({sessions,run=execute,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let repairWindow,previousWindow,lastAction;
  const command=(session,...args)=>run('xdotool',args,session);
  const query=(session,...args)=>command(session,...args).then(value=>value.trim()).catch(()=> '');
  async function windows(session, candidates=[session]) {
    const byPid=ids(await query(session,'search','--onlyvisible','--pid',session.pid));
    if (byPid.length) return {owned:byPid,windowPid:'matched',windowClass:'not-required'};
    if (!session.privateDisplay) return {owned:[],windowPid:'not-found',windowClass:'not-attempted'};
    const matches=new Set([...ids(await query(session,'search','--onlyvisible','--class',windowClass)),
      ...ids(await query(session,'search','--onlyvisible','--classname',windowClass))]);
    const owned=[];
    for (const id of [...matches].slice(0,10)) {
      const pid=await query(session,'getwindowpid',id);
      if (!pid || pid==='0' || candidates.some(row=>row.pid===pid)) owned.push(id);
    }
    return {owned,windowPid:owned.length?'class-fallback':'not-found',windowClass:matches.size?'matched':'not-found'};
  }
  async function probe() {
    const discovered=sessions ? {sessions:sessions(),info:{firefox:'matched'}} : discover();
    const state={...discovered.info,x11:'not-checked',window:'not-checked',windowManager:'not-checked'};
    for (const session of discovered.sessions) {
      try {
        const dimensions=await command(session,'getdisplaygeometry');
        if (!/^\s*\d+\s+\d+\s*$/.test(dimensions)) {state.x11='connection-failed';continue;}
        state.x11='authorized';
      } catch (error) {state.x11=x11Error(error);continue;}
      const candidates=discovered.sessions.filter(row=>row.display===session.display);
      const {owned,windowPid,windowClass}=await windows(session,candidates);
      Object.assign(state,{window:owned.length?'found':'not-found',windowPid,windowClass});
      if (!owned.length) continue;
      const active=await query(session,'getactivewindow');
      const focus=owned.includes(active) ? active : await query(session,'getwindowfocus');
      state.windowManager=active?'ewmh':focus?'x-focus':'unavailable';
      state.windowFocus=owned.includes(focus)?'matched':(focus || active)?'other':'unavailable';
      const full=await fullscreen(session,owned.includes(focus)?focus:owned[0]);
      state.fullscreen=full===null?'unknown':full?'fullscreen':'normal';
      const context={session,owned,candidates};
      return {state,context,ready:state.windowFocus==='matched'};
    }
    return {state,context:null,ready:false};
  }
  async function locate() {return (await probe()).context;}
  async function status() {
    const {state,ready}=await probe();
    return {...state,ready,lastAction:lastAction || null};
  }
  async function fullscreen(session,window) {
    const output=await run('xprop',['-id',window,'_NET_WM_STATE'],session).catch(()=>null);
    return !output?.includes('_NET_WM_STATE(ATOM)') ? null : /\b_NET_WM_STATE_FULLSCREEN\b/.test(output);
  }
  async function focused(session,window) {
    return await query(session,'getactivewindow')===window || await query(session,'getwindowfocus')===window;
  }
  async function activate(session,window) {
    if (await focused(session,window)) return true;
    await query(session,'windowactivate','--sync',window);
    if (await focused(session,window)) return true;
    await query(session,'windowraise',window);
    await query(session,'windowfocus','--sync',window);
    return focused(session,window);
  }
  async function restore(page=null,addon) {
    const address=page==='install' && addon ? pathToFileURL(addon).href : pages[page];
    const outcome={action:page || 'restore',activation:'not-run',fullscreen:'unknown',navigation:'not-run'};
    const done=(result)=>{lastAction={...outcome,outcome:result.ok?'ok':result.reason};return result;};
    if (page && !address) return done({ok:false,reason:'window-recovery'});
    const report=await probe();
    if (!report.context) return done({ok:false,reason:report.state.x11==='authorized'?'window-not-found':
      report.state.x11==='not-checked'?'firefox-unavailable':'x11-unavailable'});
    const {session,owned,candidates}=report.context;
    const active=await query(session,'getactivewindow') || await query(session,'getwindowfocus');
    let window=repairWindow?.pid===session.pid && owned.includes(repairWindow.id) ? repairWindow.id :
      owned.includes(active) ? active : owned.at(-1);
    outcome.activation=await activate(session,window) ? 'ok':'failed';
    if (outcome.activation!=='ok') return done({ok:false,reason:'window-focus'});
    try {
      let full=await fullscreen(session,window);
      if (full===true) {
        await command(session,'key','--clearmodifiers','Escape');
        if (await fullscreen(session,window)===true) await command(session,'key','--clearmodifiers','F11');
        for (let attempt=0;attempt<5 && full===true;attempt++) {
          await sleep(90);full=await fullscreen(session,window);
        }
      }
      outcome.fullscreen=full===null?'unknown':full?'fullscreen':'normal';
      if (full!==false && !(repairWindow?.pid===session.pid && repairWindow.id===window && full===null)) {
        await command(session,'key','--clearmodifiers','Escape');
        await command(session,'key','--clearmodifiers','ctrl+n');
        let normal;
        for (let attempt=0;attempt<8 && !normal;attempt++) {
          await sleep(100);
          const candidate=await query(session,'getactivewindow') || await query(session,'getwindowfocus');
          if (!owned.includes(candidate) && (await windows(session,candidates)).owned.includes(candidate)) normal=candidate;
        }
        if (!normal || !await activate(session,normal) || await fullscreen(session,normal)===true)
          return done({ok:false,reason:'window-recovery'});
        previousWindow={pid:session.pid,id:window};
        window=normal;
        repairWindow={pid:session.pid,id:window};
        if (!address) return done({ok:true,mode:'new-window'});
      }
      if (address) {
        if (!await activate(session,window)) return done({ok:false,reason:'window-focus'});
        await command(session,'key','--clearmodifiers','ctrl+t');
        await sleep(110);
        await command(session,'key','--clearmodifiers','ctrl+l');
        if (!await focused(session,window)) return done({ok:false,reason:'window-focus'});
        await command(session,'type','--clearmodifiers','--delay','1','--',address);
        await command(session,'key','--clearmodifiers','Return');
        // Firefox does not expose completion for a privileged about: tab via X11.
        outcome.navigation='dispatched';
      }
      return done({ok:true,mode:'native-toolbar'});
    } catch {
      if (address) outcome.navigation='failed';
      return done({ok:false,reason:address?'navigation-failed':'window-recovery'});
    }
  }
  async function finish() {
    const previous=previousWindow;
    previousWindow=null;
    repairWindow=null;
    if (!previous) return 'no-window-change';
    const current=await locate();
    if (!current || current.session.pid!==previous.pid || !current.owned.includes(previous.id))
      return 'previous-window-unavailable';
    return await activate(current.session,previous.id) ? 'restored':'activation-failed';
  }
  return {locate,status,restore,finish};
}

module.exports={discover,findSessions,firefoxRepair};

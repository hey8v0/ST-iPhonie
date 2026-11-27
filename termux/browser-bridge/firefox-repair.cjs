const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {browser:base} = require('./config.cjs');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {pathToFileURL} = require('node:url');
const exec = promisify(execFile);
const pages = {addons:'about:addons', restart:'about:profiles'};
const ids = value => value.trim().split(/\s+/).filter(id=>/^\d+$/.test(id));

// Use the private session marker and exact profile argument from the existing
// launcher. This also works with a running pre-recovery version of the launcher.
function findSessions(root=base,proc='/proc') {
  try {
    const owner=fs.readFileSync(path.join(root,'owner'),'utf8').trim();
    if (!/^[a-f0-9-]{36}$/.test(owner)) return [];
    const profile=path.join(root,'profile'), auth=path.join(root,'Xauthority');
    return fs.readdirSync(proc).filter(pid=>/^\d+$/.test(pid)).flatMap(pid=>{
      try {
        const args=fs.readFileSync(path.join(proc,pid,'cmdline'),'utf8').split('\0');
        const i=args.findIndex(arg=>arg==='--profile' || arg==='-profile');
        if (!/^firefox(?:-bin)?$/.test(path.basename(args[0]))) return [];
        const env=fs.readFileSync(path.join(proc,pid,'environ'),'utf8').split('\0');
        if (args[i+1]!==profile && !env.includes('XRE_PROFILE_PATH='+profile)) return [];
        const display=env.find(item=>/^DISPLAY=:\d{1,3}$/.test(item))?.slice(8);
        if (!display || !env.includes('IPHONIE_SESSION='+owner) || !env.includes('XAUTHORITY='+auth)) return [];
        const stat=fs.readFileSync(path.join(proc,pid,'stat'),'utf8');
        const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
        const startTime=fields[19];
        if (!/^\d+$/.test(startTime)) return [];
        // Linux Gecko can exec a fresh Firefox without changing PID or start
        // ticks. The initial stack and argument addresses detect that case.
        const runtime=crypto.createHash('sha256')
          .update([owner,pid,startTime,fields[25],fields[45],...args].join('\0')).digest('hex');
        return [{pid,display,auth,runtime}];
      } catch {return [];}
    });
  } catch {return [];}
}

function firefoxRepair({sessions=findSessions,run=async (bin,args,session)=>(await exec(bin,args,{
  timeout:850,maxBuffer:8192,env:{...process.env,DISPLAY:session.display,XAUTHORITY:session.auth},
})).stdout,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let repairWindow,previousWindow;
  const command=(session,...args)=>run('xdotool',args,session);
  const windows=session=>command(session,'search','--onlyvisible','--all','--pid',session.pid,'--class','^[Ff]irefox$')
    .then(ids).catch(()=>[]);
  async function locate() {
    for (const session of sessions()) {
      const owned=await windows(session);
      if (owned.length) return {session,owned};
    }
    return null;
  }
  async function fullscreen(session,window) {
    const output=await run('xprop',['-id',window,'_NET_WM_STATE'],session).catch(()=>null);
    return !output?.includes('_NET_WM_STATE(ATOM)') ? null : /\b_NET_WM_STATE_FULLSCREEN\b/.test(output);
  }
  async function restore(page=null,addon) {
    const address=page==='install' && addon ? pathToFileURL(addon).href : pages[page];
    if (page && !address) return {ok:false,reason:'window-recovery'};
    const current=await locate();
    if (!current) return {ok:false,reason:'firefox-unavailable'};
    const {session,owned}=current;
    const active=(await command(session,'getactivewindow').catch(()=> '')).trim();
    let window=repairWindow?.pid===session.pid && owned.includes(repairWindow.id) ? repairWindow.id :
      owned.includes(active) ? active : owned.at(-1);
    const activate=async id=>{
      await command(session,'windowactivate','--sync',id);
      return (await command(session,'getactivewindow')).trim()===id;
    };
    if (!await activate(window)) return {ok:false,reason:'window-focus'};
    let full=await fullscreen(session,window);
    if (full===true) {
      await command(session,'key','--clearmodifiers','Escape');
      if (await fullscreen(session,window)===true) await command(session,'key','--clearmodifiers','F11');
      for (let attempt=0;attempt<5 && full===true;attempt++) {
        await sleep(90);full=await fullscreen(session,window);
      }
    }
    // xprop is optional. When we cannot verify the old window's state,
    // Firefox's own New Window gives us normal chrome in the same profile.
    if (full!==false && !(repairWindow?.pid===session.pid && repairWindow.id===window && full===null)) {
      await command(session,'key','--clearmodifiers','Escape');
      await command(session,'key','--clearmodifiers','ctrl+n');
      let normal;
      for (let attempt=0;attempt<8 && !normal;attempt++) {
        await sleep(100);
        const candidate=(await command(session,'getactivewindow').catch(()=> '')).trim();
        if (!owned.includes(candidate) && (await windows(session)).includes(candidate)) normal=candidate;
      }
      if (!normal || !await activate(normal) || await fullscreen(session,normal)===true)
        return {ok:false,reason:'window-recovery'};
      previousWindow={pid:session.pid,id:window};
      window=normal;
      repairWindow={pid:session.pid,id:window};
      if (!address) return {ok:true,mode:'new-window'};
    }
    if (address) {
      if (!await activate(window)) return {ok:false,reason:'window-focus'};
      // A fresh tab keeps the user's selected page and every existing tab.
      await command(session,'key','--clearmodifiers','ctrl+t');
      await sleep(110);
      await command(session,'key','--clearmodifiers','ctrl+l');
      if ((await command(session,'getactivewindow')).trim()!==window) return {ok:false,reason:'window-focus'};
      await command(session,'type','--clearmodifiers','--delay','1','--',address);
      await command(session,'key','--clearmodifiers','Return');
    }
    return {ok:true,mode:'native-toolbar'};
  }
  async function finish() {
    const previous=previousWindow;
    previousWindow=null;
    if (!previous) return;
    const current=await locate();
    if (current?.session.pid===previous.pid && current.owned.includes(previous.id))
      await command(current.session,'windowactivate','--sync',previous.id);
  }
  return {locate,restore,finish};
}

module.exports={findSessions,firefoxRepair};

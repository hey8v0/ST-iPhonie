const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {filename} = require('./config.cjs');
const selectionFile = filename('frontend.json');
const repository = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)hey8v0\/(?:ST-iPhonie|ST-TTS)(?:\.git)?\/?$/i;
const knownNames=['ST-iPhonie','ST-TTS'];
const commit = /^[a-f0-9]{40}$/;
const real = value => fs.realpathSync.native(value);
const samePath = (a,b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const git = (directory,args) => execFileSync('git',['-C',directory,...args],{
  encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,
}).trim();
function writeSelection(record) {
  const next=selectionFile+'.next';
  fs.writeFileSync(next,JSON.stringify(record),{flag:'w',mode:0o600});
  fs.renameSync(next,selectionFile);
}

function option(args,name) {
  const flag=args.find(value=>value===name || value.startsWith(name+'='));
  return flag===name ? args[args.indexOf(flag)+1] : flag?.slice(name.length+1);
}
function configRoot(file) {
  try {
    const line=fs.readFileSync(file,'utf8').match(/^dataRoot[ \t]*:[ \t]*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^#\r\n]+))/m);
    return line?.slice(1).find(value=>value!==undefined)?.trim();
  } catch {return undefined;}
}
function runningTaverns() {
  try {
    return fs.readdirSync('/proc').filter(pid=>/^\d+$/.test(pid)).flatMap(pid=>{
      try {
        const handle='/proc/'+pid;
        const cwd=real(handle+'/cwd'),args=fs.readFileSync(handle+'/cmdline','utf8').split('\0');
        if (!/^node(?:js)?$/.test(path.basename(args[0])) || !args.some(arg=>path.basename(arg)==='server.js') ||
          !fs.existsSync(path.join(cwd,'src/command-line.js'))) return [];
        const env=fs.readFileSync(handle+'/environ','utf8').split('\0');
        const data=env.find(row=>row.startsWith('SILLYTAVERN_DATAROOT='))?.split('=').slice(1).join('=');
        return [{cwd,args,data}];
      } catch {return [];}
    });
  } catch {return [];}
}
function pluginDir(given) {
  const rows = [];
  const at=dir=>{for (const name of knownNames) rows.push(path.join(dir,name));};
  const inData=users=>{
    at(path.join(users,'extensions'));
    try {
      for (const entry of fs.readdirSync(users,{withFileTypes:true})) {
        if (entry.isDirectory() || entry.isSymbolicLink()) at(path.join(users,entry.name,'extensions'));
      }
    } catch {}
  };
  if (given) rows.push(path.resolve(given));
  else {
    rows.push(process.cwd());
    try {rows.push(JSON.parse(fs.readFileSync(selectionFile,'utf8')).directory);} catch {}
    const home=os.homedir();
    for (const {cwd,args,data} of [...runningTaverns(),{cwd:path.join(home,'SillyTavern'),args:[]},
      {cwd:path.join(home,'sillytavern'),args:[]}]) {
      const config=option(args,'--configPath') || option(args,'--config-path') || 'config.yaml';
      const custom=option(args,'--dataRoot') || option(args,'--data-root') || configRoot(path.resolve(cwd,config));
      inData(path.resolve(cwd,custom || data || 'data'));
      at(path.join(cwd,'public/scripts/extensions/third-party'));
    }
    if (process.env.SILLYTAVERN_DATAROOT) inData(path.resolve(process.env.SILLYTAVERN_DATAROOT));
    for (const root of [process.env.XDG_DATA_HOME || path.join(home,'.local/share'),home]) {
      inData(path.join(root,'SillyTavern','data'));
      inData(path.join(root,'sillytavern','data'));
    }
  }
  const found = new Set();
  for (const dir of rows) {
    try {
      const local = real(dir);
      if (samePath(real(git(local,['rev-parse','--show-toplevel'])),local) &&
          repository.test(git(local,['config','--get','remote.origin.url'])) &&
          fs.existsSync(path.join(local,'manifest.json'))) found.add(local);
    } catch {}
  }
  if (found.size === 1) return [...found][0];
  throw new Error('请指定小手机插件目录，例如 iphonie-bridge plugin "/完整路径/ST-iPhonie"。');
}
function clean(directory) {
  if (git(directory,['status','--porcelain=v1','--untracked-files=all']))
    throw new Error('插件目录中有本地修改或未跟踪文件。已保留这些文件和当前版本。');
}

function prepare(given,expected,expectedRelease) {
  const directory = pluginDir(given);
  clean(directory);
  if (expected && !commit.test(expected)) throw new Error('测试前端提交号无效。');
  try {git(directory,['fetch','--no-tags','origin','refs/heads/browser-phase2']);}
  catch {throw new Error('无法从已配置的 GitHub 地址下载测试前端。请检查网络后重跑同一个安装包。');}
  const target = git(directory,['rev-parse','--verify','FETCH_HEAD^{commit}']);
  if (expected && !git(directory,['rev-parse','--verify',expected+'^{commit}']).startsWith(expected))
    throw new Error('测试包对应的前端版本不可用。');
  const selected = expected || target;
  execFileSync('git',['-C',directory,'merge-base','--is-ancestor',selected,target],{stdio:'ignore'});
  if (expectedRelease) {
    const descriptor=JSON.parse(git(directory,['show',selected+':termux/browser-bridge/release.json']));
    if (Object.entries(expectedRelease).some(([key,value])=>JSON.stringify(descriptor[key])!==JSON.stringify(value)))
      throw new Error('下载的安装包与目标前端版本不同，请使用同一批次的测试包。');
  }
  const head = git(directory,['rev-parse','HEAD']);
  const previous = fs.existsSync(selectionFile) ? JSON.parse(fs.readFileSync(selectionFile,'utf8')) : null;
  if (previous && (previous.directory!==directory || ![previous.head,previous.target,previous.pending].includes(head)))
    throw new Error('插件目录已切换到其他版本。当前文件已保留。');
  return {directory,head,target:selected,branch:git(directory,['branch','--show-current']),previous};
}

function activate(given,expected,expectedRelease) {
  apply(prepare(given,expected,expectedRelease));
}

function checkCompatibility(given,{protocol,service}) {
  const directory=pluginDir(given);
  let descriptor;
  try {descriptor=JSON.parse(git(directory,['show','HEAD:termux/browser-bridge/release.json']));} catch {}
  if (descriptor?.protocol!==protocol || !descriptor.compatibleServices?.includes(service) ||
    git(directory,['status','--porcelain=v1','--','ui/browser.js','ui/browser.css','ui/browser-phase2.js','ui/browser-phase2-link.js']))
    throw new Error('当前前端未通过服务兼容检查。请使用完整测试安装包。');
  return {directory,head:git(directory,['rev-parse','HEAD'])};
}

function apply({directory,head,target:selected,branch}) {
  clean(directory);
  if (git(directory,['rev-parse','HEAD'])!==head) throw new Error('插件版本在安装期间已更改，请重跑安装包。');
  if (fs.existsSync(selectionFile)) {
    const previous = JSON.parse(fs.readFileSync(selectionFile,'utf8'));
    if (previous.directory!==directory || ![previous.head,previous.target,previous.pending].includes(head))
      throw new Error('已有实验前端记录，请先运行 iphonie-bridge restore-plugin。');
    if (head === selected) {writeSelection({...previous,target:selected,pending:undefined});return;}
    const old={...previous,target:head,pending:undefined};
    writeSelection({...old,pending:selected});
    try {git(directory,['switch','--detach',selected]);}
    catch {writeSelection(old);throw new Error('Git 无法更新实验前端，现有文件已保留。');}
    writeSelection({...old,target:selected});
    return;
  }
  if (head === selected) return;
  const record = {directory,head,target:selected,branch};
  fs.writeFileSync(selectionFile,JSON.stringify(record),{flag:'wx',mode:0o600});
  try {git(directory,['switch','--detach',selected]);}
  catch {
    if (git(directory,['rev-parse','HEAD']) === head) fs.unlinkSync(selectionFile);
    throw new Error('Git 无法切换到测试提交，现有文件已保留。');
  }
}

function rollbackUpdate({directory,head,target,branch,previous}) {
  if (pluginDir(directory)!==directory || !commit.test(head) || !commit.test(target))
    throw new Error('回退记录无效。');
  clean(directory);
  const actual=git(directory,['rev-parse','HEAD']);
  if (![head,target].includes(actual)) throw new Error('插件已切换至其他版本。已保留当前版本。');
  if (actual!==head) {
    let original;
    try {if (branch) original=git(directory,['rev-parse','--verify','refs/heads/'+branch]);} catch {}
    git(directory,original===head ? ['switch',branch] : ['switch','--detach',head]);
  }
  if (previous) writeSelection(previous);
  else fs.rmSync(selectionFile,{force:true});
}

function restore() {
  if (!fs.existsSync(selectionFile)) return;
  const {directory,head,branch,target,pending} = JSON.parse(fs.readFileSync(selectionFile,'utf8'));
  if (pluginDir(directory) !== directory || !commit.test(head) || !commit.test(target) ||
    (pending!==undefined && !commit.test(pending))) throw new Error('回退记录无效。');
  clean(directory);
  const current = git(directory,['rev-parse','HEAD']);
  if (![target,head,pending].includes(current)) throw new Error('插件已切换至其他版本。已保留当前版本。');
  if (current === target || current === pending) {
    let original = '';
    try {if (branch) original=git(directory,['rev-parse','--verify','refs/heads/'+branch]);} catch {}
    if (original === head)
      git(directory,['switch',branch]);
    else git(directory,['switch','--detach',head]);
  }
  fs.unlinkSync(selectionFile);
}
module.exports = {activate,restore,prepare,apply,rollbackUpdate,checkCompatibility};

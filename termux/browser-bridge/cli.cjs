const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {filename, origin, secrets, manifest, manifestName, extensionId} = require('./config.cjs');
const signed = require('./signed-release.cjs');
const {service:build,protocol:version,extension} = signed.settings;
const frontend = require('./frontend.cjs');
const recovery = require('./recovery.cjs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const nativeWrapper = filename('native-host');
const manifestBody = JSON.stringify({
  name:manifestName, description:'iPhonie Browser Bridge', path:nativeWrapper,
  type:'stdio', allowed_extensions:[extensionId],
}, null, 2) + '\n';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const launcher = filename('launcher');
const current = filename('current');
const journal = filename('update.json');

function atomic(file, contents, mode = 0o600) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, contents, {mode, flag:'wx'});
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, {force:true});
  }
}
function record() {
  try {return JSON.parse(fs.readFileSync(journal,'utf8'));} catch {return null;}
}
function bundleLink(target) {
  const next=filename('current.'+crypto.randomUUID());
  fs.symlinkSync(target,next);
  try {fs.renameSync(next,current);} finally {fs.rmSync(next,{force:true});}
}
function previousBundle() {
  if (!fs.lstatSync(current,{throwIfNoEntry:false})) return null;
  const target=fs.readlinkSync(current);
  if (path.dirname(target)!==filename('bundles') || !fs.existsSync(path.join(target,'cli.cjs')))
    throw new Error('现有控制服务路径无法识别，已保留。');
  return target;
}
function releaseVerified(state) {
  return state?.status==='connected' && state.build===build && state.version===version &&
    state.extension===extension && signed.status()==='installed';
}
async function waitForFirefox(state) {
  for (let i=0;i<10 && ['waiting','connecting','disconnected'].includes(state?.status);i++) {
    await delay(250);
    state=await admin('status');
  }
  return state;
}

async function admin(task) {
  try {
    const res = await fetch(origin + '/admin/' + task, {method:'POST', redirect:'error',
      headers:{Authorization:'Bearer ' + secrets().native}, signal:AbortSignal.timeout(800)});
    if (!res.ok) return null;
    const data = await res.json();
    return data.service === 'iphonie-browser-bridge' ? data : null;
  } catch {return null;}
}

async function stop() {
  if (!await admin('stop')) return;
  for (let i=0; i<20; i++) {
    await delay(100);
    if (!await admin('status')) return;
  }
  throw new Error('控制服务仍在停止，请稍后重试。');
}

function serviceVersion(directory) {
  if (directory===__dirname) return build;
  const metadata=path.join(directory,'release.json');
  return fs.existsSync(metadata) ? require(metadata).service : require(path.join(directory,'extension/manifest.json')).version;
}

async function start(directory=__dirname) {
  const expected=serviceVersion(directory);
  try {secrets();}
  catch {throw new Error('未找到实验服务的授权配置，请重新运行实验安装包。');}
  let current = await admin('status');
  if (current && (current.build !== expected || current.version !== version)) {
    await stop();
    current = null;
  }
  if (!current) {
    const log = fs.openSync(filename('service.log'), 'w', 0o600);
    try {
      const child = spawn(process.execPath, [path.join(directory,'service.cjs')], {
        detached:true, stdio:['ignore',log,log],
      });
      child.on('error', () => {});
      child.unref();
    } finally {fs.closeSync(log);}
  }
  for (let i=0; i<24; i++) {
    const state = await admin('status');
    if (state?.ipcReady && state.build === expected && state.version === version) return state;
    await delay(125);
  }
  const log = fs.readFileSync(filename('service.log'),'utf8');
  if (log.includes('port-in-use')) throw new Error('测试面板端口 6091 已被占用。现有进程仍在运行。');
  throw new Error('实验控制服务启动失败。请运行 iphonie-bridge diagnose。');
}

async function startRecovery(directory=__dirname) {
  const expected=serviceVersion(directory);
  const health=async()=>await recovery.request('health',1150) || await recovery.request('status',1150);
  let current=await health();
  const matches=status=>status?.service==='iphonie-firefox-recovery' &&
    status.revision===recovery.revision && status.build===expected;
  if (matches(current)) return current;
  if (current?.service==='iphonie-firefox-recovery') {
    await recovery.request('stop');
    for (let i=0;i<12 && await health();i++) await delay(100);
  }
  const log=fs.openSync(filename('recovery.log'),'w',0o600);
  try {
    const child=spawn(process.execPath,[path.join(directory,'recovery.cjs')],{detached:true,stdio:['ignore',log,log]});
    child.on('error',()=>{});
    child.unref();
  } finally {fs.closeSync(log);}
  for (let i=0;i<20;i++) {
    current=await health();
    if (matches(current)) return current;
    await delay(125);
  }
  throw new Error('独立维修服务未启动，浏览模式尚未更新。原画面服务仍可使用。');
}

function marked(file, expected) {
  const stats = fs.lstatSync(file, {throwIfNoEntry:false});
  if (!stats) return false;
  if (!stats.isFile() || !fs.readFileSync(file,'utf8').startsWith(expected)) {
    throw new Error('检测到已有的同名配置，已保留。');
  }
  return true;
}

async function install({plugin=false,directory,expected}={}) {
  const release=signed.readBundle();
  if (expected && expected!==release.frontend) throw new Error('安装命令指定的提交与测试包不匹配。');
  const prefix = process.env.PREFIX;
  if (!prefix || !path.isAbsolute(prefix)) throw new Error('请从 Termux 执行安装。');
  const bin = path.join(prefix,'bin','iphonie-bridge');
  const oldLink = fs.lstatSync(bin, {throwIfNoEntry:false});
  if (oldLink && (!oldLink.isSymbolicLink() || fs.readlinkSync(bin) !== launcher)) {
    throw new Error('检测到已有的 iphonie-bridge 命令，已保留。');
  }
  marked(manifest, manifestBody);
  const shebang = '#!' + path.join(prefix,'bin','sh') + '\n# iPhonie Browser Bridge POC\n';
  marked(launcher, shebang);
  marked(nativeWrapper, shebang);
  const plan=plugin ? frontend.prepare(directory,release.frontend,signed.settings) : null;
  const client=plan ? {directory:plan.directory,head:plan.target} : frontend.checkCompatibility(directory,signed.settings);
  const old=record();
  const previous=old?.bundle===__dirname ? old.previous :
    {bundle:previousBundle(),update:old};
  const rollbackPlan=old?.bundle===__dirname && old.rollbackPlan ? old.rollbackPlan : plan;
  fs.mkdirSync(path.dirname(manifest), {recursive:true, mode:0o700});
  const auth = filename('auth.json');
  if (!fs.existsSync(auth)) atomic(auth, JSON.stringify({
    panel:crypto.randomBytes(32).toString('hex'), native:crypto.randomBytes(32).toString('hex'),
  }));
  secrets();
  let stage='preparing';
  const mark=(next,extra={})=>{
    stage=next;
    atomic(journal,JSON.stringify({build,protocol:version,stage,release,frontend:client,
      bundle:__dirname,previous,rollbackPlan,...extra}));
  };
  // Bring up recovery while the previous browser and control service are
  // still running. It holds no lock on the profile and survives control stop.
  mark('preparing');
  try {
    signed.markMigration();
    const repairHealth=await startRecovery().catch(()=>null);
    if (!repairHealth) console.log('独立维修服务未启动，浏览时会保留 Firefox 工具栏。');
    const rescue=!repairHealth || signed.status()==='installed' ? null : await recovery.request('status');
    if (rescue?.ready) {
      const restored=await recovery.request('restore',8500);
      console.log(restored?.ok ? 'Firefox 原生界面可用于更新扩展。' : '可在小手机打开「维修与更新」恢复 Firefox 界面。');
    } else if (rescue && !rescue.ready) console.log('Firefox 自动窗口控制暂不可用，可在小手机检查画面。');
    if (!(await admin('status'))?.ipcReady) fs.rmSync(filename('native-invoked'), {force:true});
    bundleLink(__dirname);
    atomic(launcher, shebang + 'exec ' + quote(process.execPath) + ' ' + quote(path.join(current,'cli.cjs')) + ' "$@"\n', 0o700);
    atomic(nativeWrapper, shebang + 'exec ' + quote(process.execPath) + ' ' + quote(path.join(current,'native.cjs')) + ' "$@"\n', 0o700);
    atomic(manifest, manifestBody);
    if (!oldLink) fs.symlinkSync(launcher, bin);
    mark('browser');
    await start();
    if (plan) {
      mark('frontend');
      frontend.apply(plan);
      console.log('前端已切换到 '+release.frontend.slice(0,7)+'。请刷新酒馆以加载新版。');
    }
    const signedInstalled=signed.status()==='installed';
    const control=signedInstalled ? await waitForFirefox(await admin('status')) : await admin('status');
    const connected=releaseVerified(control);
    mark(connected?'done':'extension');
    const completion=connected ? '已连接签名扩展 '+extension+'。刷新酒馆后直接连接浏览器。' :
      signedInstalled ? '签名扩展 '+extension+' 已保留，正在等待 Firefox 重新连接。刷新酒馆后直接连接浏览器。' :
      '请打开「浏览器 → 更多 → 维修与更新」，检查签名扩展 '+extension+' 的安装状态。';
    console.log('控制服务 '+build+' 已启动。'+completion);
  } catch (error) {
    mark('failed',{failedAt:stage});
    throw error;
  }
}

async function rollback() {
  const transaction=record();
  if (transaction?.bundle===__dirname) {
    if (transaction.rollbackPlan) frontend.rollbackUpdate(transaction.rollbackPlan);
    await recovery.request('restore',8500);
    await recovery.request('stop');
    await stop();
    const prior=transaction.previous?.bundle;
    if (prior && prior!==__dirname && path.dirname(prior)===filename('bundles') &&
      fs.existsSync(path.join(prior,'cli.cjs'))) {
      bundleLink(prior);
      if (transaction.previous.update) atomic(journal,JSON.stringify(transaction.previous.update));
      else fs.rmSync(journal,{force:true});
      if (fs.existsSync(path.join(prior,'recovery.cjs'))) {
        await startRecovery(prior).catch(()=>null);
        await start(prior);
      }
    } else fs.rmSync(journal,{force:true});
    console.log('已回退本次更新。请刷新酒馆。Firefox 会话及签名扩展仍由 Firefox 管理。');
    return;
  }
  console.log('没有需要回退的签名版更新记录。');
}

async function main() {
  process.umask(0o077);
  switch (process.argv[2] || 'start') {
    case 'install': {
      const mode=process.argv[3] || '--plugin';
      if (!['--plugin','--service-only'].includes(mode)) throw new Error('安装方式可选 --plugin 或 --service-only。');
      await install({plugin:mode==='--plugin',directory:process.argv[4],expected:process.argv[5]});
      break;
    }
    case 'plugin':
      frontend.activate(process.argv[3],signed.readBundle().frontend,signed.settings);
      console.log('Phase 2 前端已启用，请刷新酒馆。');
      break;
    case 'restore-plugin': frontend.restore();console.log('已恢复原插件版本，请刷新酒馆。');break;
    case 'pair': await start();console.log(secrets().panel);break;
    case 'resume-control': {
      const state=await waitForFirefox(await start());
      if (!state) throw new Error('实验控制服务已断开。');
      if (signed.status()==='restart-required') {process.exitCode=3;break;}
      if (!releaseVerified(state)) {process.exitCode=2;break;}
      const update=record();
      if (update?.frontend) {
        let actual;
        try {actual=frontend.checkCompatibility(update.frontend.directory,signed.settings);} catch {}
        if (actual?.head!==update.frontend.head) {process.exitCode=4;break;}
      }
      if (update?.build===build && update.stage==='extension')
        atomic(journal,JSON.stringify({...update,stage:'done'}));
      break;
    }
    case 'start':
      {
        const graphics=spawnSync('iphonie-browser',[],{stdio:'inherit',timeout:120000});
        if (graphics.status !== 0) throw new Error('本机浏览器启动失败。请查看上方提示或运行 iphonie-browser diagnose。');
      }
      if (!await startRecovery().catch(()=>null)) console.log('独立维修服务未启动，浏览时会保留 Firefox 工具栏。');
      await start();
      console.log('控制服务已就绪。回到小手机浏览器继续使用。');
      break;
    case 'panel': {
      await start();
      const res = spawnSync('termux-open-url', [origin + '/#key=' + secrets().panel], {stdio:'ignore',timeout:5000});
      if (res.status !== 0) throw new Error('无法打开手机浏览器，请运行 iphonie-bridge url 并仅在本机打开该地址。');
      break;
    }
    case 'url': await start(); console.log(origin + '/#key=' + secrets().panel); break;
    case 'diagnose': {
      const update=record();
      console.log(JSON.stringify({
        control:await admin('status') || {service:'iphonie-browser-bridge',version,build,status:'offline',
          manifestPresent:fs.existsSync(manifest),hostInvoked:fs.existsSync(filename('native-invoked'))},
        recovery:await recovery.request('status') || await recovery.request('health') || {http:'unavailable'},
        release:update?.release,frontend:update?.frontend?.head,update:update?.stage,
      },null,2));
      break;
    }
    case 'stop': await stop(); console.log('已停止实验控制服务。'); break;
    case 'rollback': await rollback(); break;
    default: throw new Error('用法：iphonie-bridge [start|panel|diagnose|stop|rollback]');
  }
}
main().catch(err => {
  console.error(err instanceof Error && !err.code ? err.message : '控制桥操作失败。请检查 Termux 的运行目录及权限。');
  process.exitCode = 1;
});

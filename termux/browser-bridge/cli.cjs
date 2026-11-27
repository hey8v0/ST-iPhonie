const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {filename, origin, secrets, manifest, manifestName, extensionId} = require('./config.cjs');
const {version:build} = require('./extension/manifest.json');
const {version} = require('./extension/protocol.js');
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

function atomic(file, contents, mode = 0o600) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, contents, {mode, flag:'wx'});
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, {force:true});
  }
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

async function start() {
  try {secrets();}
  catch {throw new Error('未找到实验服务的授权配置，请重新运行实验安装包。');}
  let current = await admin('status');
  if (current && (current.build !== build || current.version !== version)) {
    await stop();
    current = null;
  }
  if (!current) {
    const log = fs.openSync(filename('service.log'), 'w', 0o600);
    try {
      const child = spawn(process.execPath, [path.join(__dirname,'service.cjs')], {
        detached:true, stdio:['ignore',log,log],
      });
      child.on('error', () => {});
      child.unref();
    } finally {fs.closeSync(log);}
  }
  for (let i=0; i<24; i++) {
    const state = await admin('status');
    if (state?.ipcReady && state.build === build && state.version === version) return state;
    await delay(125);
  }
  const log = fs.readFileSync(filename('service.log'),'utf8');
  if (log.includes('port-in-use')) throw new Error('测试面板端口 6091 已被占用。现有进程仍在运行。');
  throw new Error('实验控制服务启动失败。请运行 iphonie-bridge diagnose。');
}

async function startRecovery() {
  let current=await recovery.request('status',1150);
  const matches=status=>status?.service==='iphonie-firefox-recovery' &&
    status.revision===recovery.revision && status.build===build;
  if (matches(current)) return current;
  if (current?.service==='iphonie-firefox-recovery') {
    await recovery.request('stop');
    for (let i=0;i<12 && await recovery.request('status',350);i++) await delay(100);
  }
  const log=fs.openSync(filename('recovery.log'),'w',0o600);
  try {
    const child=spawn(process.execPath,[path.join(__dirname,'recovery.cjs')],{detached:true,stdio:['ignore',log,log]});
    child.on('error',()=>{});
    child.unref();
  } finally {fs.closeSync(log);}
  for (let i=0;i<20;i++) {
    current=await recovery.request('status',1150);
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
  fs.mkdirSync(path.dirname(manifest), {recursive:true, mode:0o700});
  const auth = filename('auth.json');
  if (!fs.existsSync(auth)) atomic(auth, JSON.stringify({
    panel:crypto.randomBytes(32).toString('hex'), native:crypto.randomBytes(32).toString('hex'),
  }));
  secrets();
  let stage='preparing';
  const mark=(next,extra={})=>{
    stage=next;
    atomic(filename('update.json'),JSON.stringify({build,protocol:version,stage,...extra}));
  };
  // Bring up recovery while the previous browser and control service are
  // still running. It holds no lock on the profile and survives control stop.
  mark('preparing');
  try {
    const rescue=await startRecovery();
    if (rescue.ready) {
      const restored=await recovery.request('restore',8500);
      console.log(restored?.ok ? 'Firefox 原生界面可用于更新扩展。' : '可在小手机打开「维修与更新」恢复 Firefox 界面。');
    }
    if (!(await admin('status'))?.ipcReady) fs.rmSync(filename('native-invoked'), {force:true});
    const current = filename('current');
    const prior = fs.lstatSync(current,{throwIfNoEntry:false});
    if (prior?.isSymbolicLink()) {
      const target = fs.readlinkSync(current);
      if (path.dirname(target) === filename('bundles') &&
          /^0\.1\./.test(JSON.parse(fs.readFileSync(path.join(target,'extension/manifest.json'),'utf8')).version) &&
          !fs.existsSync(filename('phase1-bundle'))) {
        atomic(filename('phase1-bundle'),target);
      }
    }
    const next = filename('current.' + crypto.randomUUID());
    fs.symlinkSync(__dirname, next);
    try {fs.renameSync(next, current);}
    finally {fs.rmSync(next, {force:true});}
    atomic(launcher, shebang + 'exec ' + quote(process.execPath) + ' ' + quote(path.join(current,'cli.cjs')) + ' "$@"\n', 0o700);
    atomic(nativeWrapper, shebang + 'exec ' + quote(process.execPath) + ' ' + quote(path.join(current,'native.cjs')) + ' "$@"\n', 0o700);
    atomic(manifest, manifestBody);
    if (!oldLink) fs.symlinkSync(launcher, bin);
    mark('browser');
    await start();
    if (plugin) {
      mark('frontend');
      frontend.activate(directory,expected,build);
      console.log('前端已更新。请刷新酒馆，打开「浏览器 → 更多 → 维修与更新」。');
    }
    const control=await admin('status');
    const connected=control?.status==='connected' && control.extension===build;
    mark(connected?'done':'extension',{frontend:plugin?'ready':'separate'});
    console.log(connected ? '本机服务和 Firefox 扩展 '+build+' 已连接。' :
      '本机服务 '+build+' 已启动，等待 Firefox 临时扩展更新。');
    console.log('配套 XPI：'+path.join(current,'iPhonie-Browser-Bridge.xpi'));
  } catch (error) {
    mark('failed',{failedAt:stage});
    throw error;
  }
}

async function rollback() {
  frontend.restore();
  await recovery.request('restore',8500);
  await recovery.request('stop');
  await stop();
  const previous = filename('phase1-bundle');
  if (fs.existsSync(previous)) {
    const target = fs.readFileSync(previous,'utf8');
    if (path.dirname(target) === filename('bundles') && fs.existsSync(path.join(target,'cli.cjs'))) {
      const link=filename('restore-current.'+crypto.randomUUID());
      fs.symlinkSync(target,link);
      try {fs.renameSync(link,filename('current'));}
      finally {fs.rmSync(link,{force:true});}
      console.log('Phase 1 控制服务已恢复到可启动状态。若要使用 Phase 1，重新加载之前的扩展。');
      return;
    }
  }
  if (marked(manifest, manifestBody)) fs.unlinkSync(manifest);
  fs.rmSync(filename('native-invoked'), {force:true});
  fs.rmSync(filename('auth.json'), {force:true});
  console.log('控制服务已停止，宿主注册和测试授权已撤销。已加载的临时扩展可在 Firefox 中移除。');
}

async function main() {
  process.umask(0o077);
  switch (process.argv[2] || 'start') {
    case 'install': await install({plugin:process.argv[3]==='--plugin',directory:process.argv[4],expected:process.argv[5]});break;
    case 'plugin':
      frontend.activate(process.argv[3],process.argv[4],build);
      console.log('Phase 2 前端已启用，请刷新酒馆。');
      break;
    case 'restore-plugin': frontend.restore();console.log('已恢复原插件版本，请刷新酒馆。');break;
    case 'pair': await start();console.log(secrets().panel);break;
    case 'resume-control': {
      let state=await start();
      for (let i=0;i<8 && ['waiting','connecting','disconnected'].includes(state?.status);i++) {
        await delay(250);state=await admin('status');
      }
      if (!state) throw new Error('实验控制服务已断开。');
      if (state.status!=='connected' || state.extension!==build) {process.exitCode=2;break;}
      let update;
      try {update=JSON.parse(fs.readFileSync(filename('update.json'),'utf8'));} catch {}
      if (update?.build===build && update.stage==='extension')
        atomic(filename('update.json'),JSON.stringify({...update,stage:'done'}));
      break;
    }
    case 'signed-addon': {
      const source=process.argv[3];
      if (!source || !/\.xpi$/i.test(source)) throw new Error('请提供 Mozilla 签名的 .xpi 文件。');
      const xpi=filename('signed-addon.xpi');
      const data = fs.readFileSync(source);
      if (data.length > 2*1024*1024 || !data.includes(Buffer.from('META-INF/')))
        throw new Error('此文件没有 Mozilla 签名包应有的目录。请使用从 AMO 下载的签名 XPI。');
      atomic(xpi,data);
      console.log('请在 Termux Firefox 的 about:addons 齿轮菜单选择「从文件安装附加组件」。Firefox 会校验签名。');
      console.log(xpi);
      break;
    }
    case 'start':
      {
        const graphics=spawnSync('iphonie-browser',[],{stdio:'inherit',timeout:120000});
        if (graphics.status !== 0) throw new Error('本机浏览器启动失败。请查看上方提示或运行 iphonie-browser diagnose。');
      }
      await startRecovery();
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
    case 'diagnose':
      console.log(JSON.stringify({
        control:await admin('status') || {service:'iphonie-browser-bridge',version,build,status:'offline',
          manifestPresent:fs.existsSync(manifest),hostInvoked:fs.existsSync(filename('native-invoked'))},
        recovery:await recovery.request('status'),
      },null,2));
      break;
    case 'stop': await stop(); console.log('已停止实验控制服务。'); break;
    case 'rollback': await rollback(); break;
    default: throw new Error('用法：iphonie-bridge [start|panel|diagnose|stop|rollback]');
  }
}
main().catch(err => {
  console.error(err instanceof Error && !err.code ? err.message : '控制桥操作失败。请检查 Termux 的运行目录及权限。');
  process.exitCode = 1;
});

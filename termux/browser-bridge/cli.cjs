const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {filename, origin, secrets, manifest, manifestName, extensionId} = require('./config.cjs');
const {version:build} = require('./extension/manifest.json');
const {version} = require('./extension/protocol.js');
const frontend = require('./frontend.cjs');

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

function marked(file, expected) {
  const stats = fs.lstatSync(file, {throwIfNoEntry:false});
  if (!stats) return false;
  if (!stats.isFile() || !fs.readFileSync(file,'utf8').startsWith(expected)) {
    throw new Error('检测到已有的同名配置，已保留。');
  }
  return true;
}

async function install() {
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
  await start();
  console.log('【小手机浏览器 Phase 2 · ' + build + '】');
  console.log('开发测试 XPI：' + path.join(current,'iPhonie-Browser-Bridge.xpi'));
  console.log('已取得 Mozilla 签名时，运行 iphonie-bridge signed-addon "/签名文件路径"。');
  console.log('更新插件后，在小手机浏览器首次连接时使用 iphonie-bridge pair 配对。');
}

async function rollback() {
  frontend.restore();
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
    case 'install': await install(); break;
    case 'plugin':
      frontend.activate(process.argv[3],process.argv[4]);
      console.log('Phase 2 前端已启用，请刷新酒馆。');
      break;
    case 'restore-plugin': frontend.restore();console.log('已恢复原插件版本，请刷新酒馆。');break;
    case 'pair': await start();console.log(secrets().panel);break;
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
      console.log(JSON.stringify(await admin('status') || {service:'iphonie-browser-bridge',version,build,status:'offline',
        manifestPresent:fs.existsSync(manifest), hostInvoked:fs.existsSync(filename('native-invoked'))}, null, 2));
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

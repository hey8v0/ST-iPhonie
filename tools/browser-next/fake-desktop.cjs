// Used only by the isolated service integration test, never shipped to Termux.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {promisify} = require('node:util');
const base = path.join(os.homedir(), '.local/share/st-iphonie-browser');
const flag = n => path.join(base, n);
const mode = () => fs.readFileSync(flag('scenario'),'utf8');
const spawn = cp.spawn;
const realExec=cp.execFile;
cp.execFile=(...args)=>realExec(...args);
cp.execFile[promisify.custom] = async (bin,args) => {
  if (bin==='fc-match') return {stdout:flag('testfont')};
  if (bin==='firefox' && mode()==='abi') throw Object.assign(Error('loader'),{stderr:'libicui18n.so.79 not found'});
  if (bin==='xdpyinfo' && !fs.existsSync(flag('display'))) throw Error('not ready');
  if (bin==='xdotool' && !fs.existsSync(flag('window'))) throw Error('not ready');
  return {stdout:'1'};
};
cp.spawn = (bin,args,opts) => {
  if (!['openbox','Xvnc','firefox'].includes(bin)) return spawn(bin,args,opts);
  if(bin!=='openbox') fs.rmSync(flag(bin==='firefox'?'window':'display'),{force:true});
  return spawn(process.execPath,[__filename,bin],{...opts,env:{...opts.env,NODE_OPTIONS:''}});
};
if(require.main===module) {
  const bin=process.argv[2];
  const marker = flag(bin==='firefox'?'window':bin==='Xvnc'?'display':'wm');
  if(bin==='firefox' && mode()==='software' && !process.env.LIBGL_ALWAYS_SOFTWARE) process.exit(3);
  if(bin==='firefox' && mode()==='fail-ff') process.exit(5);
  if(bin==='Xvnc' && mode()==='fail-x') process.exit(6);
  if(bin==='Xvnc') require('node:net').createServer(s=>{fs.appendFileSync(flag('vnc-connections'),'1');s.on('error',()=>{});s.write('RFB 003.008\n');}).listen(5929,'127.0.0.1');
  fs.writeFileSync(marker,String(process.pid));
  setInterval(()=>{if(fs.existsSync(flag('exit-'+bin))){fs.unlinkSync(flag('exit-'+bin));process.exit(3);}},100);
}


const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const {command, error:knownError, exact, state:validState, version} = require('./extension/protocol.js');
const signed = require('./signed-release.cjs');
const {service:build,compatibleExtensions} = signed.settings;
const {readFrames, writeFrame} = require('./frames.cjs');
const config = require('./config.cjs');

const assets = new Map([
  ['/', ['index.html','text/html']], ['/panel.css',['panel.css','text/css']],
  ['/panel.js',['panel.js','text/javascript']], ['/fixture',['fixture.html','text/html']],
]);

function createService({panel, native, host, origin, inspectInstall, onStop, serveGraphics, recovery,
  signedStatus=()=>null}) {
  const staticFiles = new Map([...assets].map(([route,[name,mime]]) => [
    route,[fs.readFileSync(path.join(__dirname,'panel',name)),mime],
  ]));
  let peer, pending, state, browserBuild, extensionBuild, checkingChrome=false;
  let status = 'waiting';
  let connections = 0;
  const peers = new Set();

  function finish(result) {
    if (!pending) return;
    const {timer, resolve} = pending;
    pending = null;
    clearTimeout(timer);
    resolve(result);
  }

  function diagnostics() {
    return {service:'iphonie-browser-bridge', version, build, status, connections,
      firefox:browserBuild || null, extension:extensionBuild || null, observedTabs:state?.tabs.length ?? null,
      pageInspectable:state?.viewport != null, viewport:state?.viewport || null,
      focus:state?.focus || null,focusFrame:state?.field?.frame ?? null,ipcReady:ipc.listening,
      signed:signedStatus(), ...inspectInstall()};
  }

  const ipc = net.createServer(stream => {
    if (peers.size >= 4) {stream.destroy(); return;}
    peers.add(stream);
    let authenticated = false;
    const timer = setTimeout(() => stream.destroy(), 3500);
    stream.on('error', () => stream.destroy());
    stream.on('close', () => {
      peers.delete(stream);
      clearTimeout(timer);
      if (peer !== stream) return;
      peer = null;
      state = null;
      status = 'disconnected';
      finish({ok:false,error:'disconnected'});
    });
    readFrames(stream, msg => {
      if (stream.destroyed) return;
      if (!authenticated) {
        if (!exact(msg,['type','token']) || msg.type !== 'authenticate' || !config.equal(msg.token, native)) {
          stream.destroy();
          return;
        }
        authenticated = true;
        return;
      }
      if (peer !== stream) {
        if (!exact(msg,['type','version','build','firefox']) || msg.type !== 'hello' ||
          typeof msg.firefox !== 'string' || !/^[a-z0-9.]{0,32}$/i.test(msg.firefox) || peer) {
          stream.destroy();
          return;
        }
        extensionBuild=typeof msg.build==='string' && /^\d+\.\d+\.\d+$/.test(msg.build) ? msg.build : null;
        if (msg.version !== version || !compatibleExtensions.includes(msg.build)) {
          status = 'version-mismatch';
          writeFrame(stream, {type:'rejected', version, reason:'version-mismatch'});
          stream.end();
          return;
        }
        clearTimeout(timer);
        peer = stream;
        browserBuild = msg.firefox;
        status = 'connecting';
        connections++;
        writeFrame(stream, {type:'accepted', version});
        return;
      }
      if (msg?.version !== version) {stream.destroy(); return;}
      if (exact(msg,['type','version','state']) && msg.type === 'state' && validState(msg.state)) {
        status = 'connected';
        state = msg.state;
        return;
      }
      const success = exact(msg,['type','version','id','ok']) && msg.ok === true;
      const failure = exact(msg,['type','version','id','ok','error']) && msg.ok === false && knownError(msg.error);
      if (msg.type === 'result' && pending && msg.id === pending.id && (success || failure)) {
        finish(success ? {ok:true} : {ok:false,error:msg.error});
      }
    }, () => stream.destroy());
  });

  async function run(msg) {
    if (!command(msg)) return {ok:false,error:msg?.version === version ? 'invalid-command' : 'version-mismatch'};
    if (status !== 'connected' || !peer) return {ok:false,error:'disconnected'};
    if (pending || checkingChrome) return {ok:false,error:'busy'};
    if (msg.action==='browser-fullscreen' && msg.params.enabled) {
      const installation=signedStatus();
      if (installation && installation!=='installed') return {ok:false,error:'repair-active'};
      const active=peer;
      checkingChrome=true;
      let rescue;
      try {rescue=await recovery?.();} catch {}
      finally {checkingChrome=false;}
      if (peer!==active || status!=='connected') return {ok:false,error:'disconnected'};
      if (!rescue?.ready) return {ok:false,error:'recovery-unavailable'};
      if (rescue.maintenance || ['preparing','browser','frontend','failed'].includes(rescue.update))
        return {ok:false,error:'repair-active'};
    }
    return new Promise(resolve => {
      pending = {id:crypto.randomUUID(), resolve, timer:setTimeout(() => finish({ok:false,error:'timeout'}), 3500)};
      writeFrame(peer, {...msg,id:pending.id});
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (code, value) => {
      res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(value));
    };
    if (req.headers.host !== host) {res.writeHead(403).end(); return;}
    if (serveGraphics?.(req,res,origin)) return;
    const asset = req.method === 'GET' && staticFiles.get(req.url);
    if (asset) {
      const [contents, mime] = asset;
      res.writeHead(200, {'Content-Type':mime + '; charset=utf-8'});
      res.end(contents);
      return;
    }
    if (req.method !== 'POST') {res.writeHead(404).end(); return;}
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (req.url === '/admin/status' || req.url === '/admin/stop') {
      if (req.headers.origin || req.headers['sec-fetch-site'] || !config.equal(token, native)) {
        res.writeHead(403).end();
        return;
      }
      if (req.url === '/admin/stop') res.on('finish', onStop);
      json(200, diagnostics());
      return;
    }
    if (req.headers.origin !== origin || !config.equal(token, panel)) {res.writeHead(403).end(); return;}
    if (req.url === '/status') {json(200, {...diagnostics(), state:state || null}); return;}
    if (req.url === '/diagnostics') {json(200, diagnostics()); return;}
    if (req.url !== '/command') {res.writeHead(404).end(); return;}
    if (req.headers['content-type'] !== 'application/json') {res.writeHead(415).end(); return;}
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8192) {json(413, {ok:false,error:'invalid-command'}); return;}
        chunks.push(chunk);
      }
      const msg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = await run(msg);
      json(result.ok ? 200 : 409, {...result, id:typeof msg?.id === 'string' ? msg.id.slice(0,64) : null, version});
    } catch {
      if (!res.destroyed) json(400, {ok:false,error:'invalid-command',version});
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  return {server, ipc, releaseViewer:()=>{
    if (peer && !peer.destroyed) writeFrame(peer,{version,type:'viewer-detached'});
  }, shutdown:() => {for (const stream of peers) stream.destroy();}};
}

function listen(server, ...options) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(...options, () => {server.removeListener('error', reject); resolve();});
  });
}

async function daemon() {
  process.umask(0o077);
  const {panel,native} = config.secrets();
  const {serveGraphics,attachGraphics} = require('./graphics.cjs');
  const recovery=require('./recovery.cjs');
  let checkedAt=0, signedState;
  const {server, ipc, shutdown,releaseViewer} = createService({
    panel, native, host:config.host, origin:config.origin, serveGraphics,
    recovery:async()=>{
      const state=await recovery.request('status');
      return state?.build===build ? state : null;
    },
    signedStatus:()=>{
      if (Date.now()-checkedAt>900) {signedState=signed.status();checkedAt=Date.now();}
      return signedState;
    },
    inspectInstall:() => ({manifestPresent:fs.existsSync(config.manifest),
      hostInvoked:fs.existsSync(config.filename('native-invoked'))}),
    onStop:stop,
  });
  let ownsSocket = false, stopping = false, closeGraphics;
  function stop() {
    if (stopping) return;
    stopping = true;
    closeGraphics?.();
    shutdown();
    // Close the Unix socket before releasing the HTTP port used as the startup lock.
    if (ipc.listening) ipc.close();
    if (ownsSocket && fs.existsSync(config.socket)) fs.unlinkSync(config.socket);
    server.close();
    server.closeAllConnections();
  }
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, stop);
  try {
    await listen(server, config.port, '127.0.0.1');
    closeGraphics = attachGraphics(server,{host:config.host,origin:config.origin,panel,onIdle:releaseViewer});
    const previous = fs.lstatSync(config.socket, {throwIfNoEntry:false});
    if (previous) {
      if (!previous.isSocket()) throw new Error('unexpected-socket-path');
      fs.unlinkSync(config.socket);
    }
    await listen(ipc, config.socket);
    ownsSocket = true;
    fs.chmodSync(config.socket, 0o600);
  } catch (err) {
    process.stderr.write((err.code === 'EADDRINUSE' ? 'port-in-use' : 'service-init-failed') + '\n');
    stop();
    process.exitCode = 1;
  }
}

if (require.main === module) daemon().catch(() => {
  process.stderr.write('bridge-configuration-failed\n');
  process.exitCode = 1;
});
module.exports = {createService};

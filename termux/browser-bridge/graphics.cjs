const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const {equal} = require('./config.cjs');

const fallback = path.join(os.homedir(),'.local/share/st-iphonie-browser');
const viewer = path.join(fallback,'viewer');
const assets = new Map([
  ['/viewer', ['viewer.html','text/html']],
  ['/viewer.js', ['viewer.js','text/javascript']],
  ['/viewer.css', ['viewer.css','text/css']],
]);
const localAncestors = 'http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:* https://127.0.0.1:* https://[::1]:*';
const browserModule = '/core/util/browser.js';
const compatibilityNeedle = 'supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();';

function attachGraphics(server, {host,origin,panel,onIdle,vncPort=5929,websocket=require(path.join(fallback,'node_modules/ws'))}) {
  const {WebSocketServer,createWebSocketStream} = websocket;
  const sockets = new WebSocketServer({noServer:true,perMessageDeflate:false});
  let cleanup;
  sockets.on('error',()=>{});
  server.on('upgrade',(req,socket,head)=>{
    const key = req.headers['sec-websocket-protocol']?.match(/^iphonie\.([a-f0-9]{64})$/)?.[1];
    if (req.headers.host !== host || req.headers.origin !== origin || req.url !== '/rfb' || !equal(key,panel) ||
        sockets.clients.size >= 3) return socket.destroy();
    sockets.handleUpgrade(req,socket,head,ws=>{
      clearTimeout(cleanup);
      ws.on('close',()=>{
        if (!sockets.clients.size) cleanup=setTimeout(()=>{
          if (!sockets.clients.size) onIdle();
        },750);
      });
      const desktop = net.connect(vncPort,'127.0.0.1');
      const stream = createWebSocketStream(ws);
      desktop.on('error',()=>stream.destroy());
      stream.on('error',()=>desktop.destroy());
      desktop.on('close',()=>stream.destroy());
      stream.on('close',()=>desktop.destroy());
      stream.pipe(desktop).pipe(stream);
    });
  });
  return () => {
    clearTimeout(cleanup);
    for (const client of sockets.clients) client.terminate();
    sockets.close();
  };
}

function serveGraphics(req,res,origin,directory=viewer) {
  if (req.method !== 'GET') return false;
  const asset = assets.get(req.url);
  const dependency = /^\/(?:core|vendor)\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.js$/i.test(req.url);
  if (!asset && !dependency) return false;
  try {
    let body = asset ? fs.readFileSync(path.join(__dirname,'viewer',asset[0])) :
      fs.readFileSync(path.join(directory,req.url));
    if (req.url === browserModule) {
      body = body.toString('utf8');
      if (body.split(compatibilityNeedle).length !== 2) throw new Error('version');
      body = body.replace(compatibilityNeedle,'supportsWebCodecsH264Decode = false;');
    }
    res.setHeader('Content-Security-Policy',
      `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; connect-src 'self' ${origin.replace('http:','ws:')}; frame-ancestors ${localAncestors}; base-uri 'none'; form-action 'none'`);
    res.writeHead(200,{'Content-Type':(asset?.[1] || 'text/javascript')+'; charset=utf-8'});
    res.end(body);
  } catch {res.writeHead(503).end();}
  return true;
}

module.exports = {serveGraphics,attachGraphics};

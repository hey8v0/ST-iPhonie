const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const {WebSocketServer, createWebSocketStream} = require('ws');

const host = '127.0.0.1:6089';
const origin = 'http://' + host;
const patch = require('./viewer-patch.cjs');
const stages=new Set('bootstrap modules ui-start ui-ready ws-start password authenticated first-frame disconnect security-failure module-failure module-timeout ui-failure ui-timeout connection-timeout frame-timeout render-failure script-error'.split(' '));
function createBridge({directory, health, stop, token, viewerEvent=()=>{}}) {
  const serve = require('sirv')(directory, {dotfiles: false});
  const server = http.createServer((req, res) => {
    if (req.headers.host !== host) return res.writeHead(403).end();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "frame-ancestors http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:* http://[::1]:* https://[::1]:*");
    if (req.url === '/health' && req.method === 'GET') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.origin || '')) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify(health()));
    }
    if (req.method === 'POST' && req.url === '/viewer-event') {
      if(req.headers.origin!==origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) return res.writeHead(403).end();
      let body='', bytes=0;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>512){res.writeHead(413).end();req.destroy();}else body+=chunk;});
      req.on('end',()=>{if(bytes>512)return;try{const e=JSON.parse(body);if(!stages.has(e.stage)||typeof e.session!=='string'||! /^[a-z0-9-]{1,64}$/i.test(e.session))return res.writeHead(400).end();viewerEvent({stage:e.stage,session:e.session,at:Date.now()});res.writeHead(204).end();}catch{res.writeHead(400).end();}});
      return;
    }
    if (req.method === 'POST' && req.url === '/stop') {
      if (req.headers.origin || !token || req.headers.authorization !== 'Bearer ' + token) return res.writeHead(403).end();
      res.end('ok'); setImmediate(stop); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    const pathname = req.url.split('?')[0];
    if (pathname === '/vnc.html') {
      let html;
      try {html = fs.readFileSync(path.join(directory, 'vnc.html'), 'utf8');}
      catch {return res.writeHead(503).end('Viewer unavailable');}
      res.setHeader('Content-Type','text/html; charset=utf-8');
      try{return res.end(patch.html(html));}catch{return res.writeHead(503).end('Viewer version mismatch');}
    }
    if (['/viewer-state.js','/viewer-bootstrap.js','/viewer-controls.js'].includes(pathname)) {
      res.setHeader('Content-Type','text/javascript');
      return res.end(fs.readFileSync(path.join(__dirname, pathname.slice(1))));
    }
    if (pathname === '/viewer-mobile.css') {
      res.setHeader('Content-Type','text/css; charset=utf-8');
      return res.end('.iphonie-embedded:not(.iphonie-show-native) #noVNC_control_bar_anchor{visibility:hidden}.iphonie-embedded #noVNC_container{max-width:1280px;max-height:1280px;margin:auto}');
    }
    if(pathname==='/core/util/browser.js'){
      try{const js=patch.compatibility(fs.readFileSync(path.join(directory,'core/util/browser.js'),'utf8'));res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(js);}catch{return res.writeHead(503).end('Viewer compatibility mismatch');}
    }
    serve(req, res, () => res.writeHead(404).end());
  });
  const sockets = new WebSocketServer({noServer:true, perMessageDeflate:false});
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.host !== host || req.headers.origin !== origin || req.url !== '/websockify') return socket.destroy();
    if (!['handshake','ready'].includes(health().code)) return socket.destroy();
    sockets.handleUpgrade(req, socket, head, ws => {
      const desktop = net.connect(5929, '127.0.0.1');
      const viewer = createWebSocketStream(ws);
      desktop.on('error', () => viewer.destroy());
      viewer.on('error', () => desktop.destroy());
      desktop.on('close', () => viewer.destroy());
      viewer.on('close', () => desktop.destroy());
      viewer.pipe(desktop).pipe(viewer);
    });
  });
  return server;
}
module.exports = {createBridge, origin};


// The viewer and its WebSocket share a dedicated loopback origin.
const http = require('node:http');
const net = require('node:net');
const { WebSocketServer, createWebSocketStream } = require('ws');
const serve = require('sirv')(process.argv[2], { dev: true, dotfiles: false });
const host = '127.0.0.1:6089';
const server = http.createServer((req, res) => {
  if (req.headers.host !== host) { res.writeHead(403).end(); return; }
  serve(req, res, () => res.writeHead(404).end());
});
const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  if (req.headers.host !== host || req.headers.origin !== 'http://' + host || req.url !== '/websockify') {
    socket.destroy();
    return;
  }
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
server.listen(6089, '127.0.0.1');

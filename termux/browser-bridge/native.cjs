const net = require('node:net');
const fs = require('node:fs');
const {filename, socket, secrets, manifest, extensionId} = require('./config.cjs');
const {readFrames, writeFrame} = require('./frames.cjs');

// Gecko passes the manifest path and extension ID on Unix. The Gecko manifest
// allowlist gates access before this process starts; the IPC token is separate.
if (process.argv[2] !== manifest || process.argv[3] !== extensionId) {
  process.stderr.write('iPhonie bridge: unexpected native caller arguments\n');
  process.exit(1);
}

let token;
try {
  fs.writeFileSync(filename('native-invoked'), '', {mode:0o600});
  token = secrets().native;
} catch {
  process.stderr.write('iPhonie bridge: local configuration unavailable\n');
  process.exit(1);
}

const peer = net.connect(socket);
let done = false;
const stop = () => {
  if (done) return;
  done = true;
  peer.destroy();
  process.stdin.destroy();
};
const fail = () => {
  process.stderr.write('iPhonie bridge: local channel unavailable or invalid\n');
  stop();
  process.exitCode = 1;
};
const waiting = setTimeout(fail, 2500);
peer.on('connect', () => {
  clearTimeout(waiting);
  writeFrame(peer, {type:'authenticate', token});
  readFrames(process.stdin, message => {
    if (!writeFrame(peer, message)) process.stdin.pause();
  }, fail);
});
peer.on('drain', () => process.stdin.resume());
peer.on('error', fail);
peer.on('close', () => {clearTimeout(waiting); stop();});
process.stdin.on('end', stop);
process.stdin.on('error', fail);
process.stdout.on('error', stop);
process.stdout.on('drain', () => peer.resume());
readFrames(peer, message => {
  if (!writeFrame(process.stdout, message)) peer.pause();
}, fail);

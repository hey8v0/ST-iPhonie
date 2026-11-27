const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const base = path.join(os.homedir(), '.local/share/st-iphonie-bridge');
const port = 6091;
const host = '127.0.0.1:' + port;
const origin = 'http://' + host;
const extensionId = 'browser-bridge@st-iphonie.local';
const manifestName = 'st_iphonie_browser_bridge';
const manifest = path.join(os.homedir(), '.mozilla/native-messaging-hosts', manifestName + '.json');
const filename = name => path.join(base, name);
const socket = filename('native.sock');
const tokenPattern = /^[a-f0-9]{64}$/;

function secrets() {
  const value = JSON.parse(fs.readFileSync(filename('auth.json'), 'utf8'));
  if (![value.panel, value.native].every(token => typeof token === 'string' && tokenPattern.test(token))) {
    throw new Error('invalid-service-secrets');
  }
  return value;
}

function equal(a, b) {
  return typeof a === 'string' && tokenPattern.test(a) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = {base, host, port, origin, manifestName, extensionId, manifest, filename, socket, secrets, equal};

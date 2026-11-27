const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {filename, profile} = require('./config.cjs');
const {findSessions} = require('./firefox-repair.cjs');
const settings = require('./release.json');
const addon = path.join(__dirname,'iPhonie-Browser-Bridge-signed.xpi');
const cached = new Map();

function hash(file) {
  const stat=fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 2*1024*1024) return null;
  const fingerprint=[stat.ino,stat.mtimeMs,stat.ctimeMs,stat.size].join(':');
  if (cached.get(file)?.fingerprint===fingerprint) return cached.get(file).digest;
  const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  cached.set(file,{fingerprint,digest});
  return digest;
}

function readBundle() {
  const bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'bundle-release.json'),'utf8'));
  if (!/^[a-f0-9]{40}$/.test(bundle.frontend) ||
    Object.entries(settings).some(([key,value])=>JSON.stringify(bundle[key])!==JSON.stringify(value)) ||
    !checkedPackage()) throw new Error('签名扩展或配套版本清单未通过校验，请重新下载同一批安装包。');
  return bundle;
}
function checkedPackage() {
  try {return hash(addon)===settings.signedSha256;} catch {return false;}
}

function actualProfile(root=profile) {
  const installed=path.join(root,'extensions',settings.extensionId+'.xpi');
  try {
    if (hash(installed)!==settings.signedSha256) return 'different';
  } catch (error) {return error.code==='ENOENT' ? 'missing' : 'unreadable';}
  try {
    const database=JSON.parse(fs.readFileSync(path.join(root,'extensions.json'),'utf8'));
    const entry=database.addons.find(row=>row.id===settings.extensionId && row.location==='app-profile' &&
      row.version===settings.extension && row.path===installed && row.signedState>=2);
    if (!entry) return 'checking';
    if (entry.userDisabled || entry.appDisabled) return 'disabled';
    return entry.active && entry.visible ? 'installed' : 'checking';
  } catch {return 'staged';}
}

function markMigration(root=profile, sessions=findSessions, migration=filename('signed-migration')) {
  if (!['missing','different'].includes(actualProfile(root))) return;
  const runtime=sessions()[0]?.runtime;
  if (runtime) fs.writeFileSync(migration,runtime,{mode:0o600});
}

function status(root=profile, sessions=findSessions, migration=filename('signed-migration')) {
  const installed=actualProfile(root);
  if (!['installed','checking','staged'].includes(installed)) return installed;
  let previous;
  try {previous=fs.readFileSync(migration,'utf8');} catch {}
  if (previous && sessions()[0]?.runtime===previous) return 'restart-required';
  return installed;
}

module.exports={settings,addon,readBundle,actualProfile,status,markMigration,checkedPackage};

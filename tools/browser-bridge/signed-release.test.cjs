const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const signed=require('../../termux/browser-bridge/signed-release.cjs');
const {settings}=signed;

test('temporary attachment cannot substitute for a Firefox-installed signed archive and restarted runtime', t=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'iphonie-signed-'));
  t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
  fs.mkdirSync(path.join(profile,'extensions'));
  const migration=path.join(profile,'migration'), db=path.join(profile,'extensions.json');
  const file=path.join(profile,'extensions',settings.extensionId+'.xpi');
  let runtime='first';
  const sessions=()=>[{runtime}];
  const state=()=>signed.status(profile,sessions,migration);
  const row={id:settings.extensionId,version:settings.extension,path:file,location:'app-profile',
    signedState:2,active:true,visible:true};
  const save=entry=>fs.writeFileSync(db,JSON.stringify({addons:[entry]}));
  const fixture=path.join(__dirname,'iPhonie-Browser-Bridge-'+settings.extension+'-signed.xpi');
  assert.equal(state(),'missing');
  signed.markMigration(profile,sessions,migration);
  fs.writeFileSync(file,'corrupted bytes');
  save(row);
  assert.equal(state(),'different');
  fs.copyFileSync(fixture,file);
  save({...row,active:false,visible:false});
  assert.equal(state(),'restart-required');
  save(row);
  assert.equal(state(),'restart-required');
  runtime='after-restart';
  assert.equal(state(),'installed');
  save({...row,active:false,userDisabled:true});
  assert.equal(state(),'disabled');
  save({...row,location:'app-temporary'});
  assert.equal(state(),'checking');
  assert.deepEqual(fs.readFileSync(file),fs.readFileSync(fixture));
});

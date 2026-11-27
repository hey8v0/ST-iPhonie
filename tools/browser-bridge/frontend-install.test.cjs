const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');
const modulePath = path.resolve(__dirname,'../../termux/browser-bridge/frontend.cjs');
const official = 'https://github.com/hey8v0/ST-iPhonie.git';

test('real Git activation and rollback preserve a clean repository and protect local edits', t=>{
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'iphonie-phase2-git-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const remote = path.join(root,'remote'), plugin = path.join(root,'plugin'), home = path.join(root,'home');
  for (const dir of [remote,plugin,path.join(home,'.local/share/st-iphonie-bridge')])
    fs.mkdirSync(dir,{recursive:true});
  const git = (dir,args) => execFileSync('git',['-C',dir,'-c','user.name=QA','-c','user.email=qa@example.org',...args],
    {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(remote,['init','-b','main']);
  fs.writeFileSync(path.join(remote,'manifest.json'),'{}');
  git(remote,['add','manifest.json']);git(remote,['commit','-m','base']);
  const base=git(remote,['rev-parse','HEAD']);
  git(remote,['switch','-c','browser-phase2']);
  fs.writeFileSync(path.join(remote,'test-ui.js'),'// experiment');
  git(remote,['add','test-ui.js']);git(remote,['commit','-m','phase2']);
  const target=git(remote,['rev-parse','HEAD']);
  git(root,['clone','-b','main',remote,plugin]);
  git(plugin,['remote','set-url','origin',official]);
  const env = {...process.env,HOME:home,USERPROFILE:home,GIT_CONFIG_COUNT:'1',
    GIT_CONFIG_KEY_0:'url.'+pathToFileURL(remote).href+'.insteadOf',GIT_CONFIG_VALUE_0:official};
  function call(action) {
    return execFileSync(process.execPath,['-e',`const api=require(${JSON.stringify(modulePath)});
      try {api[process.argv[1]](process.argv[2],process.argv[3]);}catch(e){console.error(e.message);process.exitCode=1;}`,
      action,plugin,target],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  }
  const userFile=path.join(plugin,'draft.txt');
  fs.writeFileSync(userFile,'existing data');
  assert.throws(()=>call('activate'),/未跟踪文件/);
  assert.equal(git(plugin,['rev-parse','HEAD']),base);
  assert.equal(fs.readFileSync(userFile,'utf8'),'existing data');
  fs.unlinkSync(userFile);
  call('activate');call('activate');
  assert.equal(git(plugin,['rev-parse','HEAD']),target);
  assert.equal(git(plugin,['status','--porcelain']),'');
  fs.writeFileSync(userFile,'test notes');
  assert.throws(()=>call('restore'),/未跟踪文件/);
  assert.equal(fs.readFileSync(userFile,'utf8'),'test notes');
  fs.unlinkSync(userFile);
  call('restore');
  assert.equal(git(plugin,['branch','--show-current']),'main');
  assert.equal(git(plugin,['rev-parse','HEAD']),base);
  assert.equal(git(plugin,['status','--porcelain']),'');
});

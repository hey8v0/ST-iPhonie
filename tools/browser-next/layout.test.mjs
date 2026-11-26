import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=new URL('../../',import.meta.url);
const local='http://localhost:8000';
const remote='http://127.0.0.1:6089';
const launch=()=>chromium.launch({executablePath:process.env.STIP_TEST_CHROME || undefined,headless:true});
const commandsScript=`
const send=(data)=>parent.postMessage(data,'${local}');
addEventListener('message',({data})=>{
  if(data.type!=='iphonie-browser-control')return;
  send({type:'test-command',action:data.action,value:data.value});
  send({type:'iphonie-browser-result',id:data.id,ok:true,text:data.action==='url'?'https://example.org/current':''});
});
send({type:'iphonie-vnc',state:'connected'});`;
const entryScript=`
import {browserApp} from './ui/browser.js';
localStorage.setItem('stip-browser-recent:layout',JSON.stringify([{url:'https://example.org/page',title:'A very long saved website title that should not cause horizontal overflow'},'https://example.com/history']));
window.commands=[];
window.addEventListener('message',event=>{if(event.data.type==='test-command')window.commands.push(event.data);});
window.notifications=[];
const ctx={doc:document,win:window,api:{
  getState:()=>({scope:'layout'}),
  listThreads:async()=>[{id:'1',members:['Char'],name:'Char'}]
}, notify:s=>notifications.push(s),dialog:(title,html)=>{
  const body=document.createElement('article');body.dataset.dialog=title;body.innerHTML=html;document.querySelector('.screen').append(body);
  return {body,close:()=>body.remove()};
}};
window.view=browserApp(ctx);document.querySelector('.screen').append(view.root);`;

async function within(page,selector,parent){
  const data=await page.locator(selector).evaluateAll((elements,outer)=>{
    const bounds=document.querySelector(outer).getBoundingClientRect();
    return elements.filter(el=>el.getClientRects().length).map(el=>{
      const rect=el.getBoundingClientRect();
      return {left:rect.left-bounds.left,right:bounds.right-rect.right};
    });
  },parent);
  assert(data.length);
  for(const d of data)assert(d.left>=-1 && d.right>=-1,JSON.stringify(d));
}

test('phone-width layout, full screen, rotation, and composition on the real browser rendering engine',async()=>{
  const browser=await launch();
  const context=await browser.newContext({viewport:{width:728,height:960},userAgent:'Android Layout QA',reducedMotion:'reduce'});
  const page=await context.newPage();
  try{
    await page.route(remote+'/**',async route=>{
      if(route.request().url().endsWith('/health'))return route.fulfill({json:{service:'iphonie-firefox-v2',state:'ready',controls:true,localKeyboard:true},
        headers:{'access-control-allow-origin':local}});
      return route.fulfill({contentType:'text/html',body:'<body>Viewer fixture<script>'+commandsScript+'</script>'});
    });
    await page.route(local+'/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/')return route.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/ui/phone.css"><link rel="stylesheet" href="/ui/skins.css"><link rel="stylesheet" href="/ui/browser.css"><style>.screen{position:relative;width:390px;height:660px}.screen>.view{width:100%;height:100%;position:absolute;inset:0}</style><main class="screen"></main><script type="module" src="/entry.js"></script>`});
      if(path==='/entry.js')return route.fulfill({contentType:'text/javascript',body:entryScript});
      const file=new URL(path.slice(1),root);
      try{return route.fulfill({body:await fs.readFile(file),contentType:path.endsWith('.css')?'text/css':'text/javascript'});}
      catch{return route.fulfill({status:404});}
    });
    await page.goto(local);
    await page.getByText('已安装 · 服务就绪').waitFor();
    for(const [width,theme,skin] of [[320,'light','sky'],[360,'dark','sky'],[390,'light','fresh'],[430,'dark','aero']]){
      await page.evaluate(({width,theme,skin})=>{
        document.documentElement.dataset.theme=theme;
        document.documentElement.dataset.skin=skin;
        document.querySelector('.screen').style.width=width+'px';
      },{width,theme,skin});
      const card=await page.locator('.browser-connect-card').boundingBox(), history=await page.locator('.browser-history').boundingBox();
      assert(history.y>=card.y+card.height);
      assert(history.width>=width-2);
      await within(page,'.browser-address input,.browser-recent,.browser-connect-card','.screen');
    }
    await page.getByRole('button',{name:'连接本机 Firefox'}).click();
    await page.getByRole('button',{name:'键盘',exact:true}).waitFor();
    for(const width of [320,360,390,430]){
      await page.evaluate(w=>document.querySelector('.screen').style.width=w+'px',width);
      await within(page,'.browser-actions button,.browser-address input,.browser-address>button','.screen');
    }
    await page.getByRole('button',{name:'全屏',exact:true}).click();
    await page.getByRole('button',{name:'键盘',exact:true}).click();
    const input=page.getByRole('textbox',{name:'输入到 Firefox'});
    await input.evaluate(el=>{
      assertFocus(el);
      function assertFocus(field){if(document.activeElement!==field)throw Error('Local input was not focused in click');}
      el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ni'}));
      el.value='ni';el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'ni',isComposing:true}));
      el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',isComposing:true}));
    });
    assert.equal(await page.getByRole('button',{name:'输入',exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>commands.some(c=>c.action==='input')),false);
    await input.evaluate(el=>{
      el.value='中文 A9 🙂';
      el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:el.value}));
    });
    await page.getByRole('button',{name:'输入',exact:true}).click();
    await page.waitForFunction(()=>commands.some(c=>c.action==='input' && c.value==='中文 A9 🙂'));
    await page.evaluate(()=>document.querySelector('.screen').style.height='340px');
    await within(page,'.browser-keyboard textarea,.browser-keyboard button,.browser-actions button','.screen');
    await page.getByRole('button',{name:'收起键盘'}).click();
    await page.getByRole('button',{name:'切换横屏'}).click();
    assert.equal(await page.locator('.view').getAttribute('data-landscape'),'');
    await page.getByRole('button',{name:'分享给角色'}).click();
    const dialog=page.locator('[data-dialog="分享网页"]');
    await dialog.waitFor();
    assert.equal(await dialog.locator('[name=url]').inputValue(),'https://example.org/current');
    assert.equal(await page.evaluate(()=>commands.some(c=>c.action==='pause-resize' && c.value===true)),true);
  }finally{await browser.close();}
});


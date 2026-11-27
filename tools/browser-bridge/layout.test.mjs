import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {visibleBrowserArea} from '../../ui/browser-phase2-link.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const app='http://localhost:8000';
const origin='http://127.0.0.1:6091';
const frontend=new URL('../../',import.meta.url);

test('keyboard viewport intersects a phone iframe in its own coordinates even when the top viewport pans',()=>{
  const host={visualViewport:{offsetTop:160,height:350,width:400,scale:1}};
  host.parent=host;
  const win={parent:host,visualViewport:{offsetTop:0,height:800,width:400,scale:1},
    frameElement:{clientTop:0,clientHeight:800,offsetHeight:800,getBoundingClientRect:()=>({top:80,height:640})}};
  const content={getBoundingClientRect:()=>({top:60,bottom:740,height:680,width:400})};
  const {top,height,width}=visibleBrowserArea(win,content);
  assert.deepEqual({top,height,width},{top:40,height:437,width:400});
});

const mockRfb = `
const send=(type,data={})=>parent.postMessage({type,...data},'${app}');
const state={activeId:1,count:1,tabs:[{id:1,title:'网页测试',url:'https://example.org/start',access:'web',status:'ready',desktop:false,icon:''}],
  focus:null,field:null,hints:[],windowMode:'normal',page:{scroll:0,fullscreen:'none'},viewport:{width:390,height:640,visualWidth:390,visualHeight:640,dpr:1,scale:1,zoom:1}};
const publish=()=>send('browser-state',{status:'connected',version:3,state});
let recoveryReady=false;
addEventListener('message',({data})=>{
  if(data.type==='rfb-init'){publish();send('rfb-state',{stage:'ready'});return;}
  if(data.type==='rfb-input'){send('qa-ime',{data});return;}
  if(data.type!=='rfb-command')return;
  send('qa-command',{data});
  if(data.action==='browser-fullscreen'){
    if(!recoveryReady){
      send('rfb-result',{id:data.id,result:{ok:false,error:'recovery-unavailable'}});return;
    }
    state.windowMode=data.params.enabled?'fullscreen':'normal';
  }
  if(data.action==='navigate')state.tabs[0].url=data.params.url;
  if(data.action==='new-tab'){state.tabs.push({id:2,title:'第二张',url:'',status:'ready',desktop:false,icon:''});state.count=2;state.activeId=2;}
  if(data.action==='switch-tab')state.activeId=data.params.tabId;
  if(data.action==='view-mode')state.tabs.find(t=>t.id===data.params.tabId).desktop=data.params.desktop;
  send('rfb-result',{id:data.id,result:{ok:true}});
  publish();
});
window.scrollToTest=(n,d)=>{send('rfb-gesture',{direction:d,edge:false});state.page.scroll=n;publish();};
window.focusForTest=(id='test-input')=>{state.focus='input:text';state.field={frame:2,id};publish();};
window.waitForTest=()=>send('browser-state',{status:'waiting',version:3,state:null});
window.revealForTest=()=>send('rfb-gesture',{direction:'up',edge:true});
window.allowRecovery=()=>{recoveryReady=true;};
`;

const entry = `
import {browserApp} from '/ui/browser.js';
localStorage.setItem('stip-browser-phase2-pair',JSON.stringify('a'.repeat(64)));
localStorage.setItem('stip-browser-recent:test',JSON.stringify([{url:'https://example.org/',title:'最近打开的网站'}]));
window.observed=[];
addEventListener('message',e=>{if(e.data.type?.startsWith('qa-'))observed.push(e.data);});
const ctx={doc:document,win:window,api:{getState:()=>({scope:'test'}),panelFull(){},listThreads:async()=>[{id:1,name:'Char'}]},
  notify(){},confirm:async()=>true,
  dialog(title,html){const body=document.createElement('aside');body.dataset.title=title;body.innerHTML=html;document.querySelector('.screen').append(body);
    return {body,close:()=>body.remove()};}};
window.view=browserApp(ctx);document.querySelector('.screen').prepend(view.root);
`;

test('Phase 2 home, five tools, true layout release, tabs, desktop command and invisible IME', async()=>{
  const browser=await chromium.launch({executablePath:process.env.STIP_TEST_CHROME || undefined});
  try {
    const page=await browser.newPage({viewport:{width:640,height:900},userAgent:'Android test',hasTouch:true});
    await page.route(origin+'/**',route=>route.fulfill({contentType:'text/html',body:'<div>网页区域</div><script>'+mockRfb+'</script>'}));
    await page.route('http://127.0.0.1:6092/repair',route=>route.fulfill({contentType:'text/html',body:`
      <div>维修画面</div><script>
      const send=(type,data)=>parent.postMessage({type,...data},'${app}');
      addEventListener('message',({data})=>{
        if (data.type==='rfb-init') {
          send('repair-info',{build:'0.2.4',addon:true,update:'extension'});
          send('rfb-state',{stage:'ready'});
        }
        if (data.type==='rfb-command') {
          send('qa-repair',{action:data.action});
          send('rfb-result',{id:data.id,result:data.action==='repair-done'?
            {ok:false,reason:'extension-update'}:data.action==='repair-open' && !data.params?.pictureKeys?
              {ok:false,reason:'x11-unavailable'}:{ok:true}});
        }
      });
      </script>`}));
    await page.route('http://127.0.0.1:6089/health',route=>route.fulfill({
      headers:{'access-control-allow-origin':app},json:{service:'iphonie-firefox-v2',state:'ready'},
    }));
    await page.route(app+'/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if (path==='/') return route.fulfill({contentType:'text/html',body:`
        <link rel="stylesheet" href="/ui/phone.css"><link rel="stylesheet" href="/ui/skins.css">
        <link rel="stylesheet" href="/ui/browser.css"><style>
          .screen{position:relative;width:390px;height:670px}
          .screen>.view{position:absolute;inset:0;width:100%;height:100%}
          .screen>aside{position:absolute;z-index:5;inset:auto 0 0;background:var(--card);max-height:90%;overflow:auto}
        </style><main class="screen"></main><script type="module" src="/entry.js"></script>`});
      if (path==='/entry.js') return route.fulfill({contentType:'text/javascript',body:entry});
      try{return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',
        body:await fs.readFile(new URL(path.slice(1),frontend))});
      }catch{return route.fulfill({status:404});}
    });
    await page.goto(app);
    await page.getByRole('button',{name:'连接浏览器',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'前往',exact:true}).count(),0);
    assert.equal(await page.locator('.browser-v2-bottom').isVisible(),false);
    for (const [width,theme,skin] of [[280,'light','sky'],[320,'dark','sky'],[360,'light','fresh'],[390,'dark','aero']]) {
      await page.evaluate(([width,theme,skin])=>{
        document.documentElement.dataset.theme=theme;document.documentElement.dataset.skin=skin;
        document.querySelector('.screen').style.width=width+'px';
      },[width,theme,skin]);
      const bounds=await page.locator('.browser-v2-home').evaluate(el=>({w:el.clientWidth,s:el.scrollWidth}));
      assert.equal(bounds.w,bounds.s);
    }
    const address=page.getByRole('textbox',{name:'网址或搜索词'});
    await address.fill('https://example.org/new');
    await address.press('Enter');
    await page.getByRole('button',{name:'1 个标签页'}).waitFor();
    await page.waitForFunction(()=>observed.some(row=>row.type==='qa-command'&&row.data.action==='navigate'));
    assert.deepEqual(await page.locator('.browser-v2-bottom button').evaluateAll(nodes=>nodes.map(n=>n.dataset.action)),
      ['back','forward','home','tabs','more-browser']);
    const oldFrame=await page.locator('.browser-v2-screen').boundingBox();
    const iframe=await page.locator('iframe').elementHandle();
    const frame=await iframe.contentFrame();
    await page.getByText('Firefox 工具栏可见',{exact:true}).waitFor();
    assert.equal(await page.locator('.browser-v2-feedback').isVisible(),false);
    assert.equal(await address.inputValue(),'https://example.org/new');
    await frame.evaluate(()=>allowRecovery());
    await page.getByRole('button',{name:'浏览器菜单'}).click();
    await page.getByRole('button',{name:'重试隐藏 Firefox 工具栏'}).click();
    await page.getByText('Firefox 工具栏可见',{exact:true}).waitFor({state:'hidden'});
    assert.equal(await iframe.contentFrame(),frame);
    await frame.evaluate(()=>scrollToTest(135,'down'));
    await page.locator('.browser-v2[data-immersive]').waitFor();
    assert.equal(await address.isVisible(),false);
    assert.equal(await page.locator('.browser-v2-bottom').isVisible(),false);
    assert((await page.locator('.browser-v2-screen').boundingBox()).height>oldFrame.height+75);
    await page.waitForTimeout(690);
    await frame.evaluate(()=>scrollToTest(40,'up'));
    await page.locator('.browser-v2-bottom').waitFor();
    await page.getByRole('button',{name:'浏览器菜单'}).click();
    await page.getByRole('button',{name:'隐藏浏览工具'}).click();
    await page.locator('.browser-v2[data-immersive]').waitFor();
    await frame.evaluate(()=>revealForTest());
    await page.locator('.browser-v2-bottom').waitFor();
    await page.getByRole('button',{name:'1 个标签页'}).click();
    await page.getByRole('button',{name:'新建标签页'}).click();
    await page.getByRole('button',{name:'2 个标签页'}).waitFor();
    await page.getByRole('button',{name:'浏览器菜单'}).click();
    await page.getByRole('button',{name:'请求桌面版网页'}).click();
    await page.waitForFunction(()=>observed.some(row=>row.data?.action==='view-mode'&&row.data.params.desktop));
    await frame.evaluate(()=>focusForTest());
    await page.getByRole('button',{name:'浏览器菜单'}).click();
    await page.getByRole('button',{name:'打开键盘'}).click();
    await page.locator('.browser-ime-proxy').evaluate(el=>{
      if (document.activeElement!==el) throw Error('代理未在用户操作时获得焦点');
      el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      el.value='pin';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
    });
    assert.equal(await page.evaluate(()=>observed.some(row=>row.type==='qa-ime')),false);
    await page.locator('.browser-ime-proxy').evaluate(el=>{
      el.value='中文🙂';
      el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
      el.dispatchEvent(new InputEvent('input',{bubbles:true}));
    });
    await page.waitForFunction(()=>observed.some(row=>row.type==='qa-ime'&&row.data.text==='中文🙂'));
    assert.equal(await page.evaluate(()=>observed.filter(row=>row.type==='qa-ime').length),1);
    await page.locator('.browser-ime-proxy').evaluate(el=>{
      el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      el.value='stale';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
    });
    await frame.evaluate(()=>focusForTest('second-input'));
    await page.waitForFunction(()=>document.querySelector('.browser-ime-proxy').value==='');
    await page.locator('.browser-ime-proxy').evaluate(el=>{
      el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Backspace'}));
      el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter'}));
    });
    await page.waitForFunction(()=>observed.some(row=>row.data?.id==='second-input'&&row.data.key==='Enter'));
    assert.equal(await page.evaluate(()=>observed.some(row=>row.data?.text==='stale')),false);
    await page.evaluate(()=>{
      const visual = new EventTarget();
      Object.assign(visual,{height:510,width:640,offsetTop:60,scale:1});
      Object.defineProperty(window,'visualViewport',{value:visual,configurable:true});
      document.querySelector('.screen').style.height='490px';
    });
    await page.waitForFunction(()=>document.querySelector('iframe').getBoundingClientRect().height>250);
    assert.equal((await page.locator('iframe').boundingBox()).width,oldFrame.width);
    assert.equal(await page.evaluate(()=>document.querySelector('iframe').style.transform),'');
    await frame.evaluate(()=>waitForTest());
    const card=page.locator('.browser-v2-feedback .browser-connect-card');
    await card.waitFor();
    await card.evaluate(el=>window.firstFeedbackCard=el);
    await frame.evaluate(()=>{waitForTest();waitForTest();waitForTest();});
    const same=await card.evaluate(el=>window.firstFeedbackCard===el);
    assert.equal(same,true);
    await page.getByRole('button',{name:'维修与更新',exact:true}).click();
    await page.waitForFunction(()=>observed.some(row=>row.type==='qa-repair'&&row.action==='repair-open'));
    assert.match(await page.locator('iframe').getAttribute('src'),/:6092\/repair$/);
    const tools=page.locator('.browser-v2-repair');
    await tools.getByText(/自动控制无法访问/).waitFor();
    await tools.getByRole('button',{name:'打开附加组件'}).click();
    await page.waitForFunction(()=>observed.filter(row=>row.action==='repair-open').length===3);
    for (const width of [320,430]) {
      await page.evaluate(width=>{document.querySelector('.screen').style.width=width+'px';},width);
      assert(await tools.evaluate(el=>el.scrollWidth<=el.clientWidth));
    }
    await tools.getByRole('button',{name:'安装签名扩展'}).click();
    await page.waitForFunction(()=>observed.some(row=>row.type==='qa-repair'&&row.action==='repair-addon'));
    await tools.getByRole('button',{name:'回到浏览'}).click();
    await tools.getByText(/正在等待签名扩展/).waitFor();
    assert.equal(await tools.getByRole('button',{name:'外部打开画面'}).isVisible(),true);
  } finally {await browser.close();}
});

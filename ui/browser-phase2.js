import {btn,copyText,createView,esc,toggle} from './common.js';
import {icon} from './icons.js';
import {connectTermux,knownTermux,termuxCard,termuxHealth} from './termux-connection.js';
import {mountSwipeList,swipeRow} from './swipe-list.js';
import {shareWebPage,webSearchSettings} from './web-share.js';
import {bridgeKey,bridgeVersion,browserLink,visibleBrowserArea} from './browser-phase2-link.js';
import {browserInput} from '../termux/browser-bridge/viewer/input.js';

const recentLimit = 30;
const deletion = {key:'delete',label:'删除',icon:'trash',danger:true};
const messages = {
  'version-mismatch':'扩展与测试包的版本不匹配。',
  disconnected:'浏览连接已断开，请重试。',
  timeout:'没有收到浏览器确认，请检查当前页面。',
  'action-failed':'这次操作没有完成。',
  busy:'上一项操作还在处理。',
};
const pictureError = {
  unavailable:'本机连接未响应，请检查 Termux 中的服务。',
  version:'请安装与小手机匹配的浏览器测试包。',
  security:'画面密码未通过，请确认密码后重连。',
  timeout:'画面连接超时，请重连。',
  closed:'画面已断开，网页会话仍可继续。',
};
function webUrl(value) {
  try {
    const url = new URL(value);
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {return null;}
}

export function browserPhase2(ctx,parse) {
  const {doc,win} = ctx;
  const view = createView(ctx,'browser');
  const {root} = view;
  const keyPrefix = 'stip-browser-recent:'+ctx.api.getState().scope;
  const pairKey = 'stip-browser-phase2-pair';
  function stored(key,backup) {
    try {return JSON.parse(win.localStorage.getItem(key)) ?? backup;} catch {return backup;}
  }
  function store(key,value) {
    try {win.localStorage.setItem(key,JSON.stringify(value));} catch {}
  }
  function readList(key) {
    const rows=stored(key,[]);
    return Array.isArray(rows) ? rows.map(item=>typeof item === 'string' ? {url:item} : item)
      .filter(item=>webUrl(item?.url)).slice(0,recentLimit) : [];
  }
  let recent = readList(keyPrefix), bookmarks = readList(keyPrefix+':bookmarks');
  let key = stored(pairKey,''), credentials = '', surface, legacy, historyList, probe;
  let home = true, alive = true, mounted = false, state, rfbReady = false, initializing = false, shell = false;
  let queuedNav, busy = false, immerse = false, manual = false, fullscreen = '', previous = false;
  let preferImmersive = stored(keyPrefix+':immersive',false) === true;
  let autoHide = stored(keyPrefix+':auto-hide',true) !== false, framebuffer;
  let lastScroll, gesture, lastToggle = 0, touch, passwordPrompt, rotationHint = false;
  let activeDialog, failure, pageKey, feedbackKey, viewerIME=false, geometryKey, layoutKey;
  let fullHeight=0, keyboardShown=false, revealTimer, revealTab, geometryRAF;
  const trace=[];
  root.classList.add('browser-v2');
  view.draw(`<div class="browser-toolbar"><form class="browser-address">
    <label class="browser-address-field">${icon('search')}<input type="text" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="网址或搜索词" placeholder="搜索或输入网址"></label>
    ${btn('home-more',icon('more'),'browser-icon','aria-label="浏览器菜单" title="更多"')}
    </form></div>
    <div class="browser-progress" aria-hidden="true" hidden><i></i></div>
    <div class="browser-v2-body"><div class="browser-v2-home"></div><div class="browser-v2-screen"></div><div class="browser-v2-feedback" hidden></div></div>
    <nav class="browser-v2-bottom" aria-label="浏览网页">
      ${btn('back',icon('back'),'browser-icon','aria-label="后退"')}
      ${btn('forward',icon('next'),'browser-icon','aria-label="前进"')}
      ${btn('home',icon('home'),'browser-icon','aria-label="浏览器首页"')}
      ${btn('tabs','<span class="browser-v2-count">0</span>','browser-icon','aria-label="标签页"')}
      ${btn('more-browser',icon('more'),'browser-icon','aria-label="浏览器菜单"')}
    </nav>
    ${btn('restore','显示浏览工具','browser-v2-assist','aria-label="显示浏览工具" hidden')}`);
  const find = selector => root.querySelector(selector);
  const address = find('input');
  const frameHost = find('.browser-v2-screen'), homepage = find('.browser-v2-home');
  const feedback = find('.browser-v2-feedback'), progress = find('.browser-progress');
  const active = () => state?.tabs.find(row=>row.id === state.activeId);
  const selection = (action,params) => surface?.command(action,params) || Promise.resolve({ok:false,error:'disconnected'});
  function record(event,details={}) {
    trace.push({ms:Math.round(win.performance.now()),event,...details});
    if (trace.length>100) trace.shift();
  }
  const keyboard = browserInput(ctx,root,payload=>surface?.send('rfb-input',payload),queueGeometry);
  const typing=()=>viewerIME || keyboard.isFocused() || doc.activeElement===address;
  function revealField() {
    win.clearTimeout(revealTimer);
    revealTimer=null;
    if (!keyboardShown || !state?.field || !active()) return;
    revealTab=active().id;
    void selection('reveal-field',{tabId:revealTab});
  }
  function queueGeometry() {
    if (geometryRAF || !alive) return;
    geometryRAF=win.requestAnimationFrame(()=>{
      geometryRAF=0;
      updateGeometry();
    });
  }
  function updateGeometry() {
    const layout=visibleBrowserArea(win,frameHost);
    const editing=typing() && !home;
    const activeKeyboard=editing && fullHeight-layout.height>65;
    if (!editing && !home && layout.height>80) fullHeight=layout.height;
    const available=Math.max(0,layout.height);
    const clip=editing && available>=80 && layout.containerHeight-available>2;
    const signature=JSON.stringify([layout,editing,clip,home]);
    if (signature!==layoutKey) {
      layoutKey=signature;
      frameHost.style.setProperty('--browser-visible-top',clip ? layout.top+'px' : '0px');
      frameHost.style.setProperty('--browser-visible-height',clip ? available+'px' : '100%');
      const canvas=surface?.frame?.getBoundingClientRect();
      record('host-layout',{area:layout,editing,iframe:canvas && {width:Math.round(canvas.width),height:Math.round(canvas.height)}});
    }
    const key=String(editing)+String(home);
    if (surface && geometryKey!==key) {
      geometryKey=key;
      surface.send('rfb-geometry',{editing,hold:home});
    }
    if (keyboardShown===activeKeyboard) return;
    keyboardShown=activeKeyboard;
    gesture=null;
    record(activeKeyboard?'keyboard-shown':'keyboard-hidden',{area:layout});
    win.clearTimeout(revealTimer);
    revealTimer=null;
    if (activeKeyboard && doc.activeElement!==address) revealTimer=win.setTimeout(revealField,650);
    else if (revealTab!=null) {
      void selection('restore-field',{tabId:revealTab});
      revealTab=null;
    }
  }
  const observer = win.ResizeObserver ? new win.ResizeObserver(queueGeometry) : null;
  observer?.observe(frameHost);
  const visual=new Set([win.visualViewport]);
  try {visual.add(win.top.visualViewport);} catch {}
  for (const viewport of visual) {
    viewport?.addEventListener('resize',queueGeometry);
    viewport?.addEventListener('scroll',queueGeometry);
  }
  function layout() {
    root.toggleAttribute('data-start',home);
    root.toggleAttribute('data-immersive',!home && immerse);
    root.toggleAttribute('data-remote-connected',!home && !!shell && rfbReady);
    find('[data-action=restore]').hidden = home || !immerse;
    doc.documentElement.toggleAttribute('data-browser-immersive',!home && immerse);
    const count = state?.count ?? 0;
    find('.browser-v2-count').textContent = count > 99 ? '99+' : count;
    find('[data-action=tabs]').setAttribute('aria-label',count+' 个标签页');
    find('[data-action=back]').disabled = !state?.activeId && state?.activeId !== 0;
    find('[data-action=forward]').disabled = find('[data-action=back]').disabled;
    queueGeometry();
  }
  function feedbackFor(text,actions=[],tone='notice') {
    const key=JSON.stringify([text,actions,tone]);
    if (key===feedbackKey) return;
    feedbackKey=key;
    record(text?'connection-message':'connection-message-cleared',{tone});
    feedback.hidden = !text;
    feedback.innerHTML = text ? termuxCard('本机浏览器','',text,
      actions.map(([id,label])=>btn(id,label,id==='retry'?'primary':'secondary')).join(''),tone) : '';
  }
  function writeRecent(tab) {
    const url = webUrl(tab?.url);
    if (!url || url.origin === 'http://127.0.0.1:6091') return;
    const old = recent.find(item=>item.url === url.href);
    const row = {url:url.href,title:tab.title || old?.title || '',icon:tab.icon || old?.icon || ''};
    recent = [row,...recent.filter(item=>item.url !== row.url)].slice(0,recentLimit);
    store(keyPrefix,recent);
  }
  function smallIcon(item) {
    const data = String(item.icon || '');
    const valid = data.length <= 3072 && /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i.test(data);
    return `<span class="browser-site-icon" aria-hidden="true">${valid?`<img alt="" src="${esc(data)}">`:icon('browser')}</span>`;
  }
  function historyRows(rows,removable=false) {
    return rows.map((row,i)=>{
      const hostname = webUrl(row.url)?.hostname;
      const title = row.title || hostname;
      const node = `<button type="button" class="browser-recent" data-recent="${i}">${smallIcon(row)}<span class="browser-site-label"><strong>${esc(title)}</strong><small>${esc(hostname)}</small></span></button>`;
      return removable ? swipeRow(String(i),node,[deletion],{label:title}) : node;
    }).join('');
  }
  function drawHome() {
    probe?.abort();
    historyList?.dispose();
    homepage.innerHTML = `<section class="browser-page" data-local></section><section class="browser-page browser-history">
      <h2>最近打开</h2>${recent.length ? `<div class="browser-history-list" data-browser-recent>${historyRows(recent,true)}</div>` : ''}</section>`;
    const local = homepage.querySelector('[data-local]');
    const paint = (label,text,tone) => {
      local.innerHTML = termuxCard('本机浏览器',label,text,btn('connect-browser',
        shell && rfbReady ? '继续浏览' : '连接浏览器','primary'),tone);
    };
    if (shell && rfbReady) paint('已连接','','ready');
    else {
      paint('正在检查','','busy');
      const current = probe = new AbortController();
      termuxHealth(win,current).then(info=>{
        if (current!==probe || !home) return;
        if (info?.state === 'ready') paint('已就绪','','ready');
        else if (info?.state === 'starting') paint('正在启动','','busy');
        else paint('需要检查','在 Termux 启动本机浏览器。','notice');
      }).catch(()=>{
        if (current!==probe || !home) return;
        paint(knownTermux(win)?'服务未启动':'未连接','可从更多菜单查看安装帮助。','notice');
      });
    }
    const list = homepage.querySelector('[data-browser-recent]');
    if (list) {
      const remove = ids=>{
        recent = recent.filter((row,i)=>!ids.includes(String(i)));
        store(keyPrefix,recent);
        drawHome();
      };
      historyList = mountSwipeList(list,{ctx,bulk:[{...deletion,label:'删除所选'}],onAction:(_key,id)=>remove([id]),onBulk:(_key,ids)=>remove(ids)});
    }
  }

  function setImmersive(on,requested=false) {
    if (on && (home || !rfbReady || !shell || typing())) return;
    if (immerse === on) return;
    immerse=on;
    record(on?'toolbar-hide':'toolbar-show',{manual:requested});
    manual=on && requested;
    lastToggle=Date.now();
    gesture=null;
    layout();
  }
  async function exitFull() {
    if (!fullscreen) return;
    const kind = fullscreen;
    fullscreen='';
    try {win.screen.orientation.unlock?.();} catch {}
    if (doc.fullscreenElement===root) await doc.exitFullscreen?.().catch(()=>{});
    doc.documentElement.removeAttribute('data-browser-full');
    ctx.api.panelFull?.(false);
    setImmersive(previous);
    if (kind !== 'manual' && active() && state?.page?.fullscreen !== 'none') {
      const result = await selection('leave-page-fullscreen',{tabId:active().id});
      if (!result?.ok) ctx.notify('可在播放器里退出全屏。');
    }
  }
  function enterFull(kind) {
    if (fullscreen) return;
    previous=immerse;
    fullscreen=kind;
    keyboard.release();
    setImmersive(true,true);
    doc.documentElement.setAttribute('data-browser-full','');
    ctx.api.panelFull?.(true);
    const request = root.requestFullscreen?.();
    if (kind !== 'video' || !win.matchMedia('(pointer: coarse)').matches) {
      request?.catch(()=>{});
      return;
    }
    Promise.resolve(request).then(()=>fullscreen === 'video' ? win.screen.orientation.lock('landscape') : undefined)
    .then(()=>{if (!fullscreen) win.screen.orientation.unlock?.();}).catch(()=>{
      if (fullscreen === 'video' && !rotationHint && win.innerWidth < win.innerHeight) {
        rotationHint = true;
        ctx.notify('可旋转手机横屏观看。');
      }
    });
  }
  function stageChanged(stage) {
    if (stage === 'password') {
      if (credentials) {surface?.send('rfb-password',{password:credentials});return;}
      if (passwordPrompt) return;
      const d = passwordPrompt = ctx.dialog('连接画面',`<form class="pick-list"><input type="password" aria-label="画面密码" autocomplete="off" maxlength="128">
        <button type="submit" class="primary">连接</button></form>`);
      d.onClose?.(()=>{if (passwordPrompt===d) passwordPrompt=null;});
      d.body.querySelector('form').onsubmit = event=>{
        event.preventDefault();
        credentials=d.body.querySelector('input').value;
        if (!credentials) return;
        d.close();passwordPrompt=null;
        surface?.send('rfb-password',{password:credentials});
      };
      return;
    }
    if (stage === 'ready') {rfbReady=true;failure=null;geometryKey=null;queueGeometry();void initialize();return;}
    if (stage === 'pair') {forgetConnection();feedbackFor('请配对本机浏览器。',[['pair-browser','配对'],['legacy-browser','兼容连接']]);return;}
    if (stage === 'closed' && failure) return;
    if (pictureError[stage]) {
      failure=stage;
      rfbReady=false;
      shell=false;
      if (stage === 'security') credentials='';
      keyboard.bind(null,null);
      if (fullscreen) void exitFull();
      setImmersive(false);
      feedbackFor(pictureError[stage],[['retry','重连'],['help','帮助'],['legacy-browser','兼容连接'],['diagnostics','导出诊断'],
        ...(queuedNav?[['external','外部打开']]:[])]);
      layout();
    }
  }
  function browserState(data) {
    if (data.version && data.version !== bridgeVersion) {stageChanged('version');return;}
    if (data.status !== 'connected' || !data.state) {
      state=null;
      shell=false;
      keyboard.bind(null,null);
      progress.hidden=true;
      if (!failure && surface) {
        setImmersive(false);
        feedbackFor(data.status === 'version-mismatch' ? messages['version-mismatch'] : '正在等待浏览连接。',
          [['help','帮助'],['legacy-browser','兼容连接']]);
      }
      layout();return;
    }
    state=data.state;
    void initialize();
    const tab=active(), nextKey=tab?.id+'|'+tab?.url;
    if (pageKey!==nextKey) {
      keyboard.release();lastScroll=state.page?.scroll;gesture=null;pageKey=nextKey;
    }
    if (tab?.status === 'ready' && tab.url && recent[0]?.url !== tab.url) writeRecent(tab);
    if (!home && doc.activeElement !== address) address.value=webUrl(tab?.url)?.href || '';
    progress.hidden=home || tab?.status !== 'loading';
    const focusBefore=state.field?.id;
    keyboard.bind(state.activeId,state.focus,state.field);
    if (!home && !viewerIME && state.focus && !touch?.prepared && focusBefore!==touch?.field &&
        touch && Date.now()-touch.at<1000 && win.matchMedia('(pointer: coarse)').matches) {
      keyboard.focus();
      touch=null;
    }
    const focusMark=[state.focus,state.field?.frame,state.field?.id].join('|');
    if (focusMark!==lastFocus) {
      lastFocus=focusMark;
      record('remote-focus',{focus:state.focus,frame:state.field?.frame ?? null});
      if (keyboardShown && state.field) {
        win.clearTimeout(revealTimer);
        revealTimer=win.setTimeout(revealField,480);
      }
    }
    const metrics=JSON.stringify(state.viewport);
    if (metrics!==lastMetrics) {lastMetrics=metrics;record('firefox-viewport',{viewport:state.viewport});}
    if (!home && shell && rfbReady && tab?.status === 'error')
      feedbackFor('网页暂时打不开。',[['reload','重试'],['external','在外部打开']]);
    else if (shell && rfbReady && !failure) feedbackFor('');
    const current = state.page?.scroll;
    if (!typing() && current != null && lastScroll != null && gesture && Date.now()-gesture.at<1100 && Date.now()-lastToggle>650) {
      const diff = current-gesture.baseline;
      if (autoHide && !manual && gesture.direction === 'down' && diff >= 65) setImmersive(true);
      else if ((!manual || gesture.direction === 'up') && gesture.direction === 'up' && diff <= -35) setImmersive(false);
    }
    lastScroll=current;
    if (!home && rfbReady && state.page?.fullscreen && state.page.fullscreen !== 'none') {
      if (!fullscreen && !previousVideo) enterFull(state.page.fullscreen);
      previousVideo=true;
    } else if (state.page?.fullscreen === 'none') {
      previousVideo=false;
      if (fullscreen === 'video' || fullscreen === 'page') void exitFull();
    }
    layout();
  }
  let previousVideo=false,lastFocus,lastMetrics,lastControlStatus;
  function linkEvent(type,data) {
    if (!alive || !mounted) return;
    if (type === 'rfb-state') {
      record('rfb-status',{stage:data.stage});
      stageChanged(data.stage);
    }
    if (type === 'rfb-trace') {
      framebuffer=data.details?.framebuffer;
      record(data.kind,data.details);
      if (data.kind==='frame-painted' && keyboardShown && revealTimer) revealField();
    }
    if (type === 'browser-state') {
      if (data.status!==lastControlStatus) {
        lastControlStatus=data.status;
        record('control-state',{status:data.status});
      }
      browserState(data);
    }
    if (type === 'rfb-touch') touch={at:Date.now(),prepared:data.prepared,field:state?.field?.id};
    if (type === 'rfb-ime') {viewerIME=data.active===true;queueGeometry();}
    if (type === 'rfb-gesture' && data.direction === 'escape' && immerse) {
      if (fullscreen) void exitFull(); else setImmersive(false);
      return;
    }
    if (type === 'rfb-gesture' && !home) {
      const now=Date.now();
      if (data.edge && immerse && (manual || now-lastToggle>350)) {
        if (fullscreen) void exitFull();
        else {preferImmersive=false;store(keyPrefix+':immersive',false);setImmersive(false);}
        return;
      }
      if (typing()) return;
      if (!gesture || gesture.direction!==data.direction || now-gesture.at>1100)
        gesture={at:now,baseline:lastScroll ?? 0,direction:data.direction};
      else if (gesture) gesture.at=now;
    }
  }
  async function initialize() {
    if (!rfbReady || !state || shell || initializing || !surface) return;
    initializing=true;
    const current=surface;
    const result=await selection('browser-fullscreen',{enabled:true});
    if (surface !== current) return;
    initializing=false;
    if (!result.ok && state?.windowMode !== 'fullscreen') {
      feedbackFor('无法切换到浏览视图。',[['retry','重试'],['legacy-browser','兼容连接']]);return;
    }
    shell=true;
    feedbackFor('');
    if (preferImmersive && !fullscreen) setImmersive(true,true);
    layout();
    const entry=queuedNav;queuedNav=null;
    if (entry) await navigate(entry);
  }
  function forgetConnection() {
    surface?.close();surface=null;
    legacy?.();legacy=null;
    initializing=false;shell=false;rfbReady=false;state=null;
    mounted=false;failure=null;framebuffer=null;viewerIME=false;geometryKey=null;
    keyboard.bind(null,null);
  }
  function pair() {
    const d = ctx.dialog('配对本机浏览器',`<p>在 Termux 运行 <code>iphonie-bridge pair</code>，复制显示的配对码。</p>
      <form class="pick-list"><input type="password" autocomplete="off" aria-label="配对码" maxlength="64"><button type="submit" class="primary">配对</button></form>`);
    d.body.querySelector('form').onsubmit = event=>{
      event.preventDefault();
      const value=d.body.querySelector('input').value.trim();
      if (!bridgeKey.test(value)) {ctx.notify('请粘贴完整配对码。');return;}
      key=value;store(pairKey,key);
      d.close();connect();
    };
  }
  function connect() {
    home=false;address.value='';layout();
    if (surface) {
      queueGeometry();
      if (preferImmersive && shell) setImmersive(true,true);
      if (shell && queuedNav) {const entry=queuedNav;queuedNav=null;void navigate(entry);}
      else void initialize();
      return;
    }
    if (!bridgeKey.test(key)) {
      feedbackFor('首次使用需要配对。',[['pair-browser','配对'],['help','帮助'],['legacy-browser','兼容连接'],
        ...(queuedNav?[['external','外部打开']]:[])]);
      pair();return;
    }
    forgetConnection();
    mounted=true;
    feedbackFor('正在连接…',[],'busy');
    surface=browserLink(ctx,frameHost,key,linkEvent);
  }
  function goHome() {
    if (fullscreen) void exitFull();
    keyboard.release();setImmersive(false);
    if (legacy) forgetConnection();
    else surface?.send('rfb-ime-release');
    home=true;address.value='';progress.hidden=true;
    drawHome();layout();
  }
  async function run(action,params) {
    if (busy) return false;
    busy=true;
    try {
      const result=await selection(action,params);
      if (!result.ok) ctx.notify(messages[result.error] || '请稍后重试。');
      return !!result.ok;
    } finally {busy=false;}
  }
  async function navigate(entry) {
    if (home || !shell) {queuedNav=entry;connect();return;}
    keyboard.release();
    if (active()) await run('navigate',{tabId:active().id,url:entry.url});
    else await run('new-tab',{url:entry.url});
  }
  function openTabs() {
    if (!state) {ctx.notify('连接后可管理标签页。');return;}
    const d=activeDialog=ctx.dialog('标签页',`<div class="pick-list">
      ${state.tabs.map(tab=>`<div class="browser-v2-tab" data-current="${tab.id===state.activeId}">
        <button type="button" class="list-row" data-tab="${tab.id}">${smallIcon(tab)}<span>${esc(tab.title || '新标签页')}</span>
        ${tab.id===state.activeId?icon('check'):''}</button>
        <button type="button" class="browser-icon" data-close-tab="${tab.id}" aria-label="关闭 ${esc(tab.title || '标签页')}">${icon('close')}</button></div>`).join('')}
      ${btn('new-tab','新建标签页','primary')}
      ${state.count>1?btn('close-others','关闭其他标签页','list-row'):''}
      ${btn('close-all','关闭全部标签页','list-row')}
      </div>`);
    d.body.onclick = async event=>{
      const button=event.target.closest('button');
      if (!button) return;
      const {action,tab,closeTab}=button.dataset;
      if (['close-others','close-all'].includes(action)) {
        if (!await ctx.confirm(action==='close-all'?'关闭全部标签页？':'关闭其他标签页？','浏览记录会保留。',{over:true})) return;
        const keep=action==='close-all'?null:active()?.id;
        if (keep === undefined) return;
        keyboard.release();
        if (await run('close-tabs',{keep})) {
          d.close();
          if (action==='close-all') goHome();
        }
      } else if (tab !== undefined || closeTab !== undefined || action === 'new-tab') {
        keyboard.release();
        const last=state?.count===1;
        const ok=action==='new-tab' ? await run('new-tab',{url:''}) :
          await run(tab!==undefined?'switch-tab':'close-tab',{tabId:Number(tab ?? closeTab)});
        if (ok) {d.close();if (closeTab!==undefined && last)goHome();}
      }
    };
  }
  async function share() {
    const url=webUrl(active()?.url);
    if (!url) return;
    if (fullscreen) await exitFull();
    await shareWebPage(ctx,{url:url.href,command:selection,onShared:writeRecent});
  }
  function showHistory(saved=false) {
    const rows=saved ? bookmarks : recent;
    const d=ctx.dialog(saved?'收藏':'最近打开',rows.length?historyRows(rows):'<p>还没有网页。</p>');
    d.body.onclick=event=>{
      const row=rows[Number(event.target.closest('[data-recent]')?.dataset.recent)];
      if (row) {d.close();void navigate(row);}
    };
  }
  function help() {
    ctx.dialog('浏览器帮助',`<div class="pick-list"><p>在 Termux 运行 <code>iphonie-browser</code> 和 <code>iphonie-bridge</code>。连接后，从画面最上沿向下滑或最下沿向上滑，可恢复浏览工具。</p>
      <p>首次使用请按测试包说明安装配套扩展。点网页输入框后，也可从更多菜单打开系统键盘。</p></div>`);
  }
  function menu() {
    const tab=active();
    const items=home ? [['history','最近打开'],['saved','收藏'],['settings','浏览器设置'],['help','浏览器帮助'],
      ['pair-browser','配对本机浏览器'],['web-search','Char 搜索设置']] : [
      ['reload','刷新'],['share','分享给角色'],['bookmark',bookmarks.some(row=>row.url===tab?.url)?'取消收藏':'收藏此页'],
      ['saved','收藏'],['history','最近打开'],['external','外部打开'],
      ['mode',tab?.desktop?'切回手机版网页':'请求桌面版网页'],
      ...(state?.viewport && Math.abs(state.viewport.zoom-1)>.02?[['reset-zoom','还原此页缩放']]:[]),
      ['fullscreen','全屏'],
      ['immersive','隐藏浏览工具'],['keyboard','打开键盘'],['copy','复制选中文字'],['paste','从剪贴板粘贴'],
      ['settings','浏览器设置'],['help','浏览器帮助'],
      ['diagnostics','导出诊断'],['web-search','Char 搜索设置']];
    const d=ctx.dialog('浏览器操作',`<div class="pick-list">${items.map(([id,label])=>btn(id,label,'list-row')).join('')}</div>`);
    d.body.onclick=event=>{
      const action=event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      d.close();
      void doAction(action);
    };
  }
  async function doAction(action) {
    const tab=active();
    switch (action) {
      case 'home-more':case 'more-browser':menu();break;
      case 'connect-browser':connect();break;
      case 'home':goHome();break;
      case 'pair-browser':pair();break;
      case 'help':help();break;
      case 'tabs':openTabs();break;
      case 'retry':forgetConnection();connect();break;
      case 'legacy-browser':
        forgetConnection();
        feedbackFor('');
        legacy=connectTermux(ctx,frameHost,text=>{if(text && !frameHost.querySelector('iframe'))feedbackFor(text);},
          (state)=>{if (state==='connected') feedbackFor('');},{compatibility:true});
        break;
      case 'immersive':
        setImmersive(true,true);
        if (immerse) {preferImmersive=true;store(keyPrefix+':immersive',true);}
        break;
      case 'restore':
        if (fullscreen) await exitFull();
        else {preferImmersive=false;store(keyPrefix+':immersive',false);setImmersive(false);}
        break;
      case 'fullscreen':if(fullscreen)await exitFull();else if (rfbReady && shell) enterFull('manual');break;
      case 'keyboard':
        surface?.send('rfb-ime-release');
        if (!keyboard.focus()) ctx.notify('请先点网页上的输入框。');
        break;
      case 'settings': {
        const d=ctx.dialog('浏览器设置',toggle('auto-hide','滚动时自动隐藏浏览工具',autoHide));
        d.body.querySelector('input').onchange=event=>{
          autoHide=event.target.checked;store(keyPrefix+':auto-hide',autoHide);
        };
        break;
      }
      case 'copy': {
        const result=await selection('selection');
        if (!result.text || !await copyText(win,result.text)) ctx.notify('请先在网页中选中文字。');
        break;
      }
      case 'paste': {
        if (!tab || !state?.focus) {ctx.notify('请先点网页上的输入框。');break;}
        try {
          const text=await win.navigator.clipboard.readText();
          if (active()?.id===tab.id && state?.focus && text) keyboard.paste(text);
        } catch {ctx.notify('可用手机输入法的粘贴功能。');}
        break;
      }
      case 'share':await share();break;
      case 'web-search':await webSearchSettings(ctx);break;
      case 'history':showHistory(false);break;
      case 'saved':showHistory(true);break;
      case 'external': {
        const url=webUrl(tab?.url || queuedNav?.url);
        if (url) win.open(url.href,'_blank','noopener,noreferrer');
        break;
      }
      case 'bookmark':
        if (!webUrl(tab?.url)) break;
        if (bookmarks.some(row=>row.url===tab.url)) bookmarks=bookmarks.filter(row=>row.url!==tab.url);
        else bookmarks=[tab,...bookmarks].slice(0,recentLimit);
        store(keyPrefix+':bookmarks',bookmarks);
        break;
      case 'diagnostics': {
        const result=await selection('diagnostics');
        const {width,height}=frameHost.getBoundingClientRect();
        const blob=new win.Blob([JSON.stringify({...(result?.service?result:{}),protocol:bridgeVersion,framebuffer,
          container:{width:Math.round(width),height:Math.round(height)},events:trace},null,2)],{type:'application/json'});
        const url=win.URL.createObjectURL(blob);
        const a=doc.createElement('a');a.href=url;a.download='iphonie-browser-diagnostics.json';a.click();
        win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
        break;
      }
      case 'back': case 'forward': case 'reload': case 'mode': case 'reset-zoom':
        if (tab) {
          keyboard.release();
          if (action==='mode') await run('view-mode',{tabId:tab.id,desktop:!tab.desktop});
          else await run(action,{tabId:tab.id});
        }
        break;
    }
  }
  address.addEventListener('focus',queueGeometry);
  address.addEventListener('blur',queueGeometry);
  address.closest('form').onsubmit=event=>{
    event.preventDefault();
    const entry=parse(address.value);
    if (!entry) {if (address.value.trim())ctx.notify('请输入有效的网址或搜索词。');return;}
    address.blur();void navigate(entry);
  };
  view.on('click','.browser-toolbar [data-action],.browser-v2-bottom [data-action],.browser-v2-home [data-action],.browser-v2-feedback [data-action],.browser-v2-assist',
    el=>void doAction(el.dataset.action));
  view.on('click','.browser-v2-home [data-recent]',el=>{
    const row=recent[Number(el.dataset.recent)];
    if (row) void navigate(row);
  });
  function fullscreenChanged() {
    if (!doc.fullscreenElement && fullscreen) void exitFull();
  }
  doc.addEventListener('fullscreenchange',fullscreenChanged);
  view.openURL=(url,title)=>{if (webUrl(url)) void navigate({url,title});};
  view.back=()=>{
    if (keyboard.isFocused()) {keyboard.release();return true;}
    if (viewerIME) {surface?.send('rfb-ime-release');return true;}
    if (fullscreen) {void exitFull();return true;}
    if (immerse) {setImmersive(false);return true;}
    if (!home) {goHome();return true;}
    return false;
  };
  view.leave=()=>{
    keyboard.release();
    surface?.send('rfb-ime-release');
    if (fullscreen) void exitFull();
    setImmersive(false);
  };
  const dispose=view.dispose;
  view.dispose=()=>{
    alive=false;
    if (shell) void selection('browser-fullscreen',{enabled:false});
    view.leave();
    activeDialog?.close();
    passwordPrompt?.close();
    forgetConnection();
    observer?.disconnect();
    win.clearTimeout(revealTimer);
    win.cancelAnimationFrame(geometryRAF);
    for (const viewport of visual) {
      viewport?.removeEventListener('resize',queueGeometry);
      viewport?.removeEventListener('scroll',queueGeometry);
    }
    keyboard.dispose();
    probe?.abort();
    historyList?.dispose();
    doc.removeEventListener('fullscreenchange',fullscreenChanged);
    dispose();
  };
  goHome();
  return view;
}

import {shareWebPage, webSearchSettings} from './web-share.js';
import {browserKeyboard} from './browser-keyboard.js';
import {connectTermux, knownTermux, termuxCard, termuxHealth, TERMUX_VIEW} from './termux-connection.js';
import {btn, copyText, createView, esc} from './common.js';
import {icon} from './icons.js';
import {mountSwipeList, swipeRow} from './swipe-list.js';

function webAddress(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function browserTarget(value, tavernHome) {
  const text = value.trim();
  if (!text) return null;
  const authority = text.replace(/^\/\//, '').split(/[/?#]/, 1)[0].toLowerCase();
  const ownHost = authority === tavernHome?.host;
  const domain = ownHost || /^(?:localhost|[^\s/:?#]+\.[^\s/:?#]+)(?::\d+)?(?:[/?#].*)?$/iu.test(text);
  if (domain || /^[a-z][a-z\d+.-]*:/i.test(text) || text.startsWith('//')) {
    const scheme = ownHost ? tavernHome.protocol : 'https:';
    const address = text.startsWith('//') ? scheme + text : domain ? scheme + '//' + text : text;
    const url = webAddress(address);
    return url ? {url: url.href} : null;
  }
  const url = new URL('https://duckduckgo.com/');
  url.searchParams.set('q', text);
  return {url: url.href, query: text};
}

const MAX_RECENT = 30;
const REMOVE = {key: 'delete', label: '删除', icon: 'trash', danger: true};

function currentTavernHome(win) {
  try {
    if (win.parent === win || !win.parent.SillyTavern?.getContext) return null;
    const home = webAddress(win.parent.location.href);
    if (!home || home.origin !== win.location.origin || !/(?:\/|\/index\.html)$/.test(home.pathname)) return null;
    home.search = '';
    home.hash = '';
    return home;
  } catch { return null; }
}

function mobileAddress(address) {
  const url = new URL(address);
  if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname) || url.port) return url.href;
  const video = url.pathname.match(/^\/video\/(BV[a-zA-Z0-9]+|av\d+)\/?$/);
  const episode = url.pathname.match(/^\/bangumi\/play\/ep(\d+)\/?$/);
  if (video || episode) {
    const player = new URL('https://player.bilibili.com/player.html');
    if (episode) player.searchParams.set('episodeId', episode[1]);
    else if (video[1].startsWith('BV')) player.searchParams.set('bvid', video[1]);
    else player.searchParams.set('aid', video[1].slice(2));
    for (const key of ['p', 'cid', 't']) {
      const value = url.searchParams.get(key);
      if (value && /^\d+$/.test(value)) player.searchParams.set(key, value);
    }
    player.searchParams.set('autoplay', '0');
    return player.href;
  }
  url.hostname = 'm.bilibili.com';
  return url.href;
}
export function browserApp(ctx) {
  const {win, doc} = ctx, view = createView(ctx, 'browser');
  const tavernHome = currentTavernHome(win);
  const localAndroid = /Android/i.test(win.navigator?.userAgent || '') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(win.location.hostname) &&
    win.location.origin !== new URL(TERMUX_VIEW).origin;
  const storageKey = 'stip-browser-recent:' + ctx.api.getState().scope;
  let recent = [];
  try {
    recent = JSON.parse(win.localStorage.getItem(storageKey) || '[]').map(item=>typeof item==='string'?{url:item}:item)
      .filter(item=>item && typeof item.url==='string' && webAddress(item.url) && item.url!==TERMUX_VIEW).slice(0, MAX_RECENT);
  } catch { /* browsing still works without local storage */ }
  const history = [null];
  let termuxControls = false;
  let disconnectTermux, homeProbe, nativeOverlay=false;
  let index = 0, timer, frame, layers, full = false, landscape = false, generation = 0;
  view.draw(`<div class="browser-toolbar">
    <form class="browser-address"><label class="browser-address-field">${icon('search')}<input type="text" inputmode="url" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="网址或搜索词" placeholder="输入网址或搜索词"></label><button type="submit" class="browser-icon browser-go" aria-label="前往">${icon('next')}</button></form>
    <div class="browser-actions" role="group" aria-label="浏览网页">
      ${btn('back', icon('back'), 'browser-icon', 'aria-label="后退" title="后退"')}
      ${btn('forward', icon('next'), 'browser-icon', 'aria-label="前进" title="前进"')}
      ${btn('reload', icon('refresh'), 'browser-icon', 'aria-label="刷新" title="刷新"')}
      ${btn('keyboard', icon('keyboard'), 'browser-icon', 'aria-label="键盘" title="键盘" hidden')}
      ${btn('share', icon('share'), 'browser-icon', 'aria-label="分享给角色" title="分享给角色" hidden')}
      ${btn('rotate', icon('refresh'), 'browser-icon browser-rotate', 'aria-label="切换横屏" title="切换横屏" hidden')}
      ${btn('full', icon('expand'), 'browser-icon', 'aria-label="全屏" title="全屏" hidden')}
      ${btn('more-browser', '•••', 'browser-icon', 'aria-label="更多浏览器操作" title="更多"')}
    </div>
  </div><div class="browser-progress" aria-hidden="true" hidden><i></i></div>
  <div class="browser-content"></div><div class="browser-status" role="status" hidden></div>`);
  const root = view.root, address = root.querySelector('input'), form = root.querySelector('form');
  const content = root.querySelector('.browser-content'), progress = root.querySelector('.browser-progress');
  const status = root.querySelector('.browser-status');
  const command = (action,value) => disconnectTermux?.command(action,value) || Promise.resolve({});
  const keyboard = browserKeyboard(ctx,command);
  content.before(keyboard.panel);
  const control = key => root.querySelector(`[data-action=${key}]`);
  function setFull(on) {
    full = on;
    root.toggleAttribute('data-full', on);
    doc.documentElement.toggleAttribute('data-browser-full', on);
    control('rotate').hidden = !on;
    control('full').setAttribute('aria-label', on ? '退出全屏' : '全屏');
    control('full').title = on ? '退出全屏' : '全屏';
    control('full').innerHTML = icon(on ? 'close' : 'expand');
    if (!on) {
      landscape = false;
      root.removeAttribute('data-landscape');
      control('rotate').setAttribute('aria-pressed', 'false');
      if (doc.fullscreenElement === root) doc.exitFullscreen?.().catch(() => {});
    }
    try { ctx.api.panelFull?.(on); } catch { /* the browser view still fills the phone */ }
  }
  function fullscreenChanged() {
    if (doc.fullscreenElement === root) root.dataset.nativeFull = '';
    else if (root.hasAttribute('data-native-full')) {
      root.removeAttribute('data-native-full');
      if(nativeOverlay)nativeOverlay=false;
      else if(full)setFull(false);
    }
  }
  doc.addEventListener('fullscreenchange', fullscreenChanged);
  async function toggleFull() {
    const ticket = ++generation;
    if (full) { setFull(false); return; }
    setFull(true);
    if(localAndroid)return;
    try {
      await root.requestFullscreen?.();
      if ((ticket !== generation || !full) && doc.fullscreenElement === root) await doc.exitFullscreen();
    } catch { /* the host panel and phone viewport already expanded */ }
  }
  async function beforeOverlay(){
    keyboard.hide();
    if(doc.fullscreenElement!==root)return;
    nativeOverlay=true;
    try{await doc.exitFullscreen();}catch{nativeOverlay=false;}
  }
  function note(message = '') {
    status.textContent = message;
    status.hidden = !message;
  }
  function openFrame(url) {
    progress.hidden = false;
    note('正在打开网页…');
    const next = doc.createElement('iframe');
    next.title = '正在浏览的网页';
    next.referrerPolicy = 'no-referrer';
    const target = new URL(url);
    const permissions = ['allow-scripts', 'allow-forms'];
    if (tavernHome && target.href === tavernHome.href) {
      // Only this installed host's canonical entry can start another signed-in tavern view.
      next.dataset.stipTavern = '';
      target.searchParams.set('stip-view', 'tavern');
      permissions.push('allow-same-origin');
    } else if (localAndroid && target.href === TERMUX_VIEW) {
      permissions.push('allow-same-origin');
    } else if (target.origin === 'https://m.bilibili.com' || target.origin === 'https://player.bilibili.com') {
      // These pages read their own cookies and storage while initializing the video controls.
      if (target.origin !== win.location.origin) permissions.push('allow-same-origin');
      if (target.hostname === 'm.bilibili.com') permissions.push('allow-popups');
    }
    next.setAttribute('sandbox', permissions.join(' '));
    next.setAttribute('allow', "fullscreen *; camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'");
    next.allowFullscreen = true;
    next.addEventListener('load', () => {
      if (frame !== next) return;
      win.clearTimeout(timer);
      progress.hidden = true;
      note();
    });
    next.src = target.href;
    frame = next;
    timer = win.setTimeout(() => {
      if (frame !== next) return;
      progress.hidden = true;
      note('网页加载较慢，可继续等待或在外部打开。');
    }, 8000);
    content.replaceChildren(next);
  }
  function render() {
    homeProbe?.abort();
    keyboard.hide();
    disconnectTermux?.();
    disconnectTermux = null;
    termuxControls=false;
    root.removeAttribute('data-remote');
    control('keyboard').hidden=true;
    address.placeholder='输入网址或搜索词';
    layers?.dispose();
    layers = null;
    win.clearTimeout(timer);
    frame = null;
    progress.hidden = true;
    note();
    const entry = history[index];
    root.toggleAttribute('data-start', !entry);
    control('full').hidden = !entry;
    address.value = entry?.query ?? entry?.url ?? '';
    control('back').disabled = index === 0;
    control('forward').disabled = index === history.length - 1;
    control('reload').disabled = !entry;
    control('share').hidden=!entry || entry.url===TERMUX_VIEW;
    if (localAndroid && entry?.url === TERMUX_VIEW) {
      disconnectTermux = connectTermux(ctx, content, note, (state,supported)=>{
        termuxControls=supported && state==='connected';
        root.toggleAttribute('data-remote',termuxControls);
        control('keyboard').hidden=!termuxControls;
        control('share').hidden=!termuxControls;
        if(!termuxControls)keyboard.hide();
        if(state==='connected' && !supported)note('已连接。此服务使用原有键盘，更新安装包可启用小手机键盘。');
        if(termuxControls){
          control('back').disabled=false;control('forward').disabled=false;
          address.value='';address.placeholder='搜索或输入网址';
        }
      });
    } else if (entry) openFrame(mobileAddress(entry.url));
    else {
      if (full) setFull(false);
      const rows = recent.map(({url,title}, i) => {
        const {hostname,pathname}=new URL(url);
        const path=pathname.split('/').filter(Boolean).at(-1);
        const label=String(title || path || hostname).slice(0,120);
        const letter=(hostname.replace(/^www\./,'')[0] || '•').toUpperCase();
        const display=label.includes('%')?hostname:label;
        return swipeRow(String(i), `<button type="button" class="browser-recent" data-recent="${i}"><span class="browser-site-icon" aria-hidden="true">${esc(letter)}</span><span class="browser-site-label"><strong>${esc(display)}</strong><small>${esc(hostname)}</small></span></button>`, [REMOVE], {label:display});
      }).join('');
      content.innerHTML=`${localAndroid?'<div data-local-card></div>':''}<section class="browser-page browser-history"><h2>最近打开</h2>${rows?`<div class="browser-history-list" data-browser-recent>${rows}</div>`:`<p class="browser-empty">${icon('clock')}<span>打开的网页会显示在这里</span></p>`}</section>`;
      if(localAndroid){
        const target=content.querySelector('[data-local-card]');
        const actions=btn('termux','连接本机 Firefox','primary');
        const paint=(state,text,tone)=>{target.innerHTML=termuxCard('本机 Firefox',state,text,actions,tone);};
        paint('检查服务中',knownTermux(win)?'此设备已连接过 Firefox。':'正在确认此设备的安装状态。','busy');
        const requested=homeProbe=new AbortController();
        termuxHealth(win,requested).then(health=>{
          if(requested.signal.aborted || !target.isConnected)return;
          if(health?.state==='ready')paint('已安装 · 服务就绪',health.localKeyboard?'连接之前打开的 Firefox 会话。':'已检测到旧版服务，仍可用原有键盘。','ready');
          else if(health?.state==='starting')paint('已安装 · 正在启动','可以先进入连接页面等待 Firefox 启动。','busy');
          else if(health)paint('已安装 · 启动异常','进入连接页面查看原因。','notice');
          else paint('服务状态未知','本机端口返回了无法识别的响应。','notice');
        }).catch(()=>{
          if(requested!==homeProbe || !target.isConnected)return;
          if(knownTermux(win))paint('已安装 · 服务未响应','在 Termux 运行 iphonie-browser 后连接。','notice');
          else paint('未检测到安装','首次使用请打开连接页面，查看启动教程。','neutral');
        });
      }
      const list = content.querySelector('[data-browser-recent]');
      if (list) layers = mountSwipeList(list, {ctx, bulk: [{...REMOVE, label: '删除所选'}],
        onAction: (_key, id) => removeRecent([id]),
        onBulk: (_key, ids) => removeRecent(ids)
      });
    }
  }
  function removeRecent(ids) {
    const selected = new Set(ids.map(Number));
    recent = recent.filter((_, index) => !selected.has(index));
    saveRecent();
    render();
  }
  async function shareCurrent() {
    const entry=history[index];
    const useFirefox=entry?.url===TERMUX_VIEW;
    if(useFirefox && !termuxControls)return;
    await beforeOverlay();
    const transport=useFirefox?command:undefined;
    const current=transport?await transport('url'):null;
    const url=transport?current?.text:entry?.url;
    await shareWebPage(ctx,{url,command:transport,onShared:page=>remember(page)});
  }
  function remember(entry){
    if(!entry?.url || entry.query || entry.url===TERMUX_VIEW)return;
    const prior=recent.find(row=>row.url===entry.url);
    recent=[{url:entry.url,title:entry.title || prior?.title || ''},...recent.filter(row=>row.url!==entry.url)].slice(0,MAX_RECENT);
    saveRecent();
  }
  async function navigateFirefox(entry){
    const result=await command('open',entry.url);
    if(result.ok)remember(entry);
    else ctx.notify('Firefox 没有响应，请重新连接后再试。');
  }
  function open(entry) {
    remember(entry);
    if (history[index]?.url !== entry?.url) {
      history.splice(index + 1, Infinity, entry);
      if (history.length > MAX_RECENT + 1) history.splice(1, 1);
      index = history.length - 1;
    }
    render();
  }
  function saveRecent() {
    try { win.localStorage.setItem(storageKey, JSON.stringify(recent)); } catch { /* optional history */ }
  }
  address.addEventListener('focus',()=>{if(termuxControls)command('pause-resize',true);});
  address.addEventListener('blur',()=>{if(termuxControls&&!keyboard.isOpen())command('pause-resize',false);});
  form.addEventListener('submit', event => {
    event.preventDefault();
    const entry = browserTarget(address.value, tavernHome);
    if (!entry) { if (address.value.trim()) ctx.notify('请输入有效的 HTTP 或 HTTPS 网址', {error: true}); return; }
    address.blur();
    if(termuxControls){navigateFirefox(entry);return;}
    open(entry);
  });
  view.on('click', '[data-recent]', el => {
    const entry = recent[Number(el.dataset.recent)];
    if (entry) open(entry);
  });
  function back() {
    if (keyboard.isOpen()) {keyboard.hide();return true;}
    if (full) { setFull(false); return true; }
    if (layers?.chosen) { layers.done(); return true; }
    if (!index) return false;
    index--;
    render();
    return true;
  }
  view.on('click', '.browser-toolbar [data-action], .browser-content [data-action=termux]', async el => {
    switch (el.dataset.action) {
      case 'termux':
        if (localAndroid) open({url: TERMUX_VIEW, query: '本机 Firefox'});
        break;
      case 'back': if(termuxControls)command('back');else back();break;
      case 'forward':
        if(termuxControls)command('forward');
        else if(index<history.length-1){index++;render();}
        break;
      case 'reload': if(termuxControls)command('reload');else render();break;
      case 'keyboard':
        if(termuxControls){if(keyboard.isOpen())keyboard.hide();else keyboard.show();}
        break;
      case 'share': await shareCurrent();break;
      case 'more-browser': {
        await beforeOverlay();
        const remoteItems=[['home','Firefox 主页'],['tabs','下一个标签页'],['newTab','新建标签页'],['closeTab','关闭标签页'],
          ['mobile','手机宽度'],['desktop','桌面宽度'],['fit','适应画面'],['firefoxFull','切换 Firefox 紧凑模式'],
          ['zoomIn','放大网页'],['zoomOut','缩小网页'],['zoomReset','恢复网页缩放'],['escape','退出视频全屏'],
          ['copy-selection','复制 Firefox 选中文字'],['paste','直接粘贴文字'],['native-tools','原有 noVNC 工具栏与键盘'],['reconnect','重新连接']];
        const entry=history[index];
        const isFirefox=entry?.url===TERMUX_VIEW;
        const items=[...(termuxControls?remoteItems:[]),...(entry?[['browser-home','小手机浏览器首页']]:[]),
          ...(isFirefox&&!termuxControls?[['reconnect','重新连接']]:[]),...(isFirefox?[['diagnostics','导出诊断']]:[]),
          ...(entry&&(!isFirefox||termuxControls)?[['external','在系统浏览器打开网页']]:[]),
          ['web-search','Char 真实搜索设置']];
        const d=ctx.dialog('浏览器操作','<div class="pick-list">'+items.map(([key,name])=>btn(key,name,'list-row')).join('')+'</div>');
        d.body.addEventListener('click',async event=>{
          const key=event.target.closest('[data-action]')?.dataset.action;
          if(!key)return;
          if(key==='external'){
            const url=isFirefox?webAddress((await command('url')).text):webAddress(entry?.url);
            if(!url){ctx.notify('暂时没有读到 Firefox 当前网址。');return;}
            const link=doc.createElement('a');
            link.className='list-row';
            link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
            link.textContent='打开 '+url.hostname;
            event.target.closest('button').replaceWith(link);
            return;
          }
          d.close();
          if(key==='web-search'){await webSearchSettings(ctx);return;}
          if(key==='reconnect'){render();return;}
          if(key==='diagnostics'){await disconnectTermux?.exportDiagnostics();return;}
          if(key==='browser-home'){open(null);return;}
          if(key==='copy-selection'){
            const {text}=await command('selection');
            if(!text){ctx.notify('请先在 Firefox 中选择要复制的文字。');return;}
            const copy=ctx.dialog('Firefox 选中文字',`<textarea readonly aria-label="选中文字">${esc(text)}</textarea>`+btn('copy-now','复制文字','primary'));
            copy.body.querySelector('button').onclick=async ()=>{
              if(await copyText(win,text)){copy.close();ctx.notify('已复制');}
              else copy.body.querySelector('textarea').select();
            };
            return;
          }
          if(key==='paste'){
            const input=ctx.dialog('输入文字','<textarea aria-label="发送到 Firefox 的文字" maxlength="8000"></textarea>'+btn('paste-now','输入到 Firefox','primary'));
            input.body.querySelector('button').onclick=async ()=>{
              const result=await command('paste',input.body.querySelector('textarea').value);
              if(result.ok)input.close();else ctx.notify('Firefox 没有响应，文字已保留。');
            };
            return;
          }
          if(['fit','mobile','desktop'].includes(key))command('mode',key==='fit'?'scale':key==='mobile'?'remote':'desktop');
          else command(key);
        });
        break;
      }
      case 'full': return toggleFull();
      case 'rotate':
        landscape = !landscape;
        root.toggleAttribute('data-landscape', landscape);
        control('rotate').setAttribute('aria-pressed', String(landscape));
        break;
    }
  });
  view.openURL = (url,title) => {
    const entry=browserTarget(url,tavernHome);
    if(!entry?.url || entry.query)return;
    entry.title=typeof title==='string'?title.slice(0,120):'';
    if(termuxControls)navigateFirefox(entry);
    else open(entry);
  };
  view.back = back;
  view.leave = () => { generation++; keyboard.hide(); if (full) setFull(false); };
  const dispose = view.dispose;
  view.dispose = () => {
    homeProbe?.abort();
    disconnectTermux?.();
    view.leave();
    doc.removeEventListener('fullscreenchange', fullscreenChanged);
    layers?.dispose();
    win.clearTimeout(timer);
    frame = null;
    content.replaceChildren();
    dispose();
  };
  render();
  return view;
}

import {shareWebPage, webSearchSettings} from './web-share.js';
import {connectTermux, TERMUX_VIEW} from './termux-connection.js';
import {btn, createView, esc} from './common.js';
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
    recent = JSON.parse(win.localStorage.getItem(storageKey) || '[]').filter(url => typeof url === 'string' && webAddress(url)).slice(0, MAX_RECENT);
  } catch { /* browsing still works without local storage */ }
  const history = [null];
  let termuxControls = false;
  let disconnectTermux;
  let index = 0, timer, frame, layers, full = false, landscape = false, generation = 0;
  view.draw(`<div class="browser-toolbar">
    <form class="browser-address"><label class="browser-address-field">${icon('search')}<input type="text" inputmode="url" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="网址或搜索词" placeholder="输入网址或搜索词"></label><button type="submit" class="browser-icon browser-go" aria-label="前往">${icon('next')}</button></form>
    <div class="browser-actions" role="group" aria-label="浏览网页">
      ${btn('back', icon('back'), 'browser-icon', 'aria-label="后退一个地址" title="后退一个地址"')}
      ${btn('forward', icon('next'), 'browser-icon', 'aria-label="前进一个地址" title="前进一个地址"')}
      ${btn('reload', icon('refresh'), 'browser-icon', 'aria-label="重新打开此地址" title="重新打开此地址"')}
      ${btn('more-browser', '•••', 'browser-icon', 'aria-label="浏览器操作" hidden')}
      ${btn('start', icon('home'), 'browser-icon', 'aria-label="浏览器首页" title="浏览器首页"')}
      ${btn('rotate', icon('refresh'), 'browser-icon browser-rotate', 'aria-label="切换横屏" title="切换横屏" hidden')}
      ${btn('full', icon('expand'), 'browser-icon', 'aria-label="全屏" title="全屏" hidden')}
      <a class="browser-external" target="_blank" rel="noopener noreferrer" aria-label="外部打开" title="外部打开" hidden>${icon('share')}<span>外部打开</span></a>
    </div>
  </div><div class="browser-progress" aria-hidden="true" hidden><i></i></div>
  <div class="browser-content"></div><div class="browser-status" role="status" hidden></div>`);
  const root = view.root, address = root.querySelector('input'), form = root.querySelector('form');
  const content = root.querySelector('.browser-content'), progress = root.querySelector('.browser-progress');
  const status = root.querySelector('.browser-status'), external = root.querySelector('.browser-external');
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
      if (full) setFull(false);
    }
  }
  doc.addEventListener('fullscreenchange', fullscreenChanged);
  async function toggleFull() {
    const ticket = ++generation;
    if (full) { setFull(false); return; }
    setFull(true);
    try {
      await root.requestFullscreen?.();
      if ((ticket !== generation || !full) && doc.fullscreenElement === root) await doc.exitFullscreen();
    } catch { /* the host panel and phone viewport already expanded */ }
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
    disconnectTermux?.();
    disconnectTermux = null;
    termuxControls=false;root.removeAttribute('data-remote');control('more-browser').hidden=false;address.placeholder='输入网址或搜索词';
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
    control('start').disabled = !entry;
    external.hidden = !entry?.url;
    if (entry?.url) external.href = entry.url;
    else external.removeAttribute('href');
    if (localAndroid && entry?.url === TERMUX_VIEW) {
      disconnectTermux = connectTermux(ctx, content, note, (state,supported)=>{
        termuxControls=supported && state==='connected';
        root.toggleAttribute('data-remote',termuxControls);
        control('more-browser').hidden=false;
        if(termuxControls){
          control('back').disabled=false;control('forward').disabled=false;
          address.value='';address.placeholder='搜索或输入网址';
        }
      });
    } else if (entry) openFrame(mobileAddress(entry.url));
    else {
      if (full) setFull(false);
      const rows = recent.map((address, i) => {
        const {hostname, pathname, search} = new URL(address);
        const label = hostname + (pathname === '/' && !search ? '' : pathname + search);
        return swipeRow(String(i), `<button type="button" class="browser-recent" data-recent="${i}">${icon('clock')}<span>${esc(label)}</span></button>`, [REMOVE], {label});
      }).join('');
      content.innerHTML = rows ? `<section class="browser-page"><h2>最近打开</h2><div data-browser-recent>${rows}</div></section>` : '';
      if (localAndroid) content.insertAdjacentHTML('afterbegin', `<section class="browser-page">${btn('termux', '连接本机 Firefox', 'browser-recent')}</section>`);
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
    const command=termuxControls?disconnectTermux?.command:undefined;
    const current=command?await command('url'):null;
    await shareWebPage(ctx,{url:command?current?.text:entry?.url,command});
  }
  function open(entry) {
    if (entry?.url && !entry.query) {
      recent = [entry.url, ...recent.filter(url => url !== entry.url)].slice(0, MAX_RECENT);
      saveRecent();
    }
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
  form.addEventListener('submit', event => {
    event.preventDefault();
    const entry = browserTarget(address.value, tavernHome);
    if (!entry) { if (address.value.trim()) ctx.notify('请输入有效的 HTTP 或 HTTPS 网址', {error: true}); return; }
    address.blur();
    if(termuxControls){disconnectTermux.command('open',entry.url);return;}
    open(entry);
  });
  view.on('click', '[data-recent]', el => {
    const url = recent[Number(el.dataset.recent)];
    if (url) open({url});
  });
  function back() {
    if (full) { setFull(false); return true; }
    if (layers?.chosen) { layers.done(); return true; }
    if (!index) return false;
    index--;
    render();
    return true;
  }
  view.on('click', '[data-action]', el => {
    switch (el.dataset.action) {
      case 'termux':
        if (localAndroid) open({url: TERMUX_VIEW, query: '本机 Firefox'});
        break;
      case 'back': if(termuxControls) disconnectTermux.command('back'); else back(); break;
      case 'forward': if(termuxControls){disconnectTermux.command('forward');break;} if (index < history.length - 1) { index++; render(); } break;
      case 'reload': if(termuxControls) disconnectTermux.command('reload'); else render(); break;
      case 'start': if(termuxControls) disconnectTermux.command('home'); else open(null); break;
      case 'more-browser': {
        const remoteItems = [['keyboard','键盘'],['paste','粘贴或输入中文'],['tabs','下一个标签页'],['newTab','新建标签页'],['closeTab','关闭标签页'],['responsive','移动视口 / 退出响应式模式'],['zoomIn','放大'],['zoomOut','缩小'],['zoomReset','恢复网页缩放'],['fit','适应画面'],['remote','匹配屏幕'],['firefoxFull','Firefox 全屏'],['escape','退出视频全屏'],['reconnect','重新连接']];
        const canShare=termuxControls || history[index]?.url && history[index].url!==TERMUX_VIEW;
        const items = [...(termuxControls?remoteItems:[]),...(canShare?[['share','分享网页']]:[]),['web-search','Char 真实搜索设置']];
        const d=ctx.dialog('浏览器操作', '<div class="pick-list">'+items.map(([key,name])=>btn(key,name,'list-row')).join('')+'</div>');
        d.body.addEventListener('click', async e=>{
          const key=e.target.closest('[data-action]')?.dataset.action;
          if(!key)return;
          d.close();
          if(key==='web-search'){await webSearchSettings(ctx);return;}
          if(key==='share'){await shareCurrent();return;}
          if(key==='reconnect'){render();return;}
          if(key==='paste'){
            const input=ctx.dialog('输入文字','<textarea aria-label="发送到 Firefox 的文字" maxlength="8000"></textarea>'+btn('paste-now','输入到 Firefox','primary'));
            input.body.querySelector('button').onclick=()=>{disconnectTermux?.command('paste',input.body.querySelector('textarea').value);input.close();};
            return;
          }
          if(key==='fit'||key==='remote')disconnectTermux.command('mode',key==='remote'?'remote':'scale');
          else disconnectTermux.command(key);
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
  view.openURL = url => {
    const entry=browserTarget(url,tavernHome);
    if(!entry?.url || entry.query)return;
    if(termuxControls)disconnectTermux.command('open',entry.url);
    else open(entry);
  };
  view.back = back;
  view.leave = () => { generation++; if (full) setFull(false); };
  const dispose = view.dispose;
  view.dispose = () => {
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

(() => {
  const {version, command, webUrl, metrics, focus, page:validPage, favicon} = bridgeProtocol;
  const host = 'st_iphonie_browser_bridge';
  let port, timer, shell, stoppedByVersion = false;
  let accepted = false, retry = 1000, status = 'connecting', running = false;
  let revision = 0, managed = false, firefoxMajor;
  const desktop = new Map(), failed = new Map();
  const modeKey = 'iphonie-desktop-site';
  const supported = {urls:['http://*/*','https://*/*']};

  browser.webRequest.onBeforeSendHeaders.addListener(details => {
    if (!accepted || !managed || details.tabId < 0 || desktop.get(details.tabId) || !firefoxMajor) return undefined;
    const value = `Mozilla/5.0 (Android 14; Mobile; rv:${firefoxMajor}.0) Gecko/${firefoxMajor}.0 Firefox/${firefoxMajor}.0`;
    return {requestHeaders:details.requestHeaders.map(header => header.name.toLowerCase() === 'user-agent' ?
      {...header,value} : header)};
  },supported,['blocking','requestHeaders']);

  async function restoreModes(tabs) {
    await Promise.all(tabs.filter(tab=>!desktop.has(tab.id)).map(async tab => {
      const value = await browser.sessions.getTabValue(tab.id,modeKey).catch(()=>false);
      if (!desktop.has(tab.id)) desktop.set(tab.id,value === true);
    }));
  }

  function post(message, target = port) {
    if (target && port === target) target.postMessage({version, ...message});
  }

  async function browserWindow() {
    const win = await browser.windows.getLastFocused({windowTypes:['normal']});
    return !win.incognito && win.type === 'normal' ? win : null;
  }

  function displayUrl(url) {
    try {
      const address = new URL(url);
      if (webUrl(url)) {
        if (address.origin === 'http://127.0.0.1:6091') return address.origin + address.pathname;
        return address.href;
      }
      if (address.protocol === 'about:') return address.protocol + address.pathname;
      return address.protocol;
    } catch {return '';}
  }

  async function state() {
    const win = await browserWindow().catch(() => null);
    const all = win ? (await browser.tabs.query({windowId:win.id})).filter(tab => !tab.incognito) : [];
    const active = all.find(tab => tab.active);
    const tabs = all.slice(0, 64);
    if (active && !tabs.includes(active)) tabs[tabs.length - 1] = active;
    await restoreModes(tabs);
    let page = null;
    if (active && webUrl(active.url)) {
      let deadline;
      try {
        page = await Promise.race([
          browser.tabs.sendMessage(active.id, {type:'bridge-inspect'}, {frameId:0}),
          new Promise(resolve => {deadline = setTimeout(() => resolve(null), 650);}),
        ]);
      } catch {} finally {clearTimeout(deadline);}
    }
    const hasTelemetry = metrics(page?.viewport) && focus(page?.focus) && validPage(page?.page);
    return {
      tabs:tabs.map(tab => ({
        id:tab.id, title:(tab.title || '').slice(0, 256), url:tab.active ? displayUrl(tab.url).slice(0, 4096) : '',
        status:failed.get(tab.id) === tab.url ? 'error' : tab.status === 'loading' ? 'loading' : 'ready',
        desktop:desktop.get(tab.id) === true,
        icon:favicon(tab.favIconUrl) ? tab.favIconUrl : '',
        access:!webUrl(tab.url) ? 'internal' : tab.id === active?.id && hasTelemetry ? 'web' :
          tab.status === 'loading' || tab.id !== active?.id ? 'loading' : 'unavailable',
      })),
      count:all.length,
      activeId:active?.id ?? null,
      windowMode:win ? (win.state === 'fullscreen' ? 'fullscreen' : 'normal') : 'unknown',
      focus:hasTelemetry ? page.focus : null,
      viewport:hasTelemetry ? page.viewport : null,
      page:hasTelemetry ? page.page : null,
    };
  }

  function sync() {
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      const requested = ++revision;
      const target = port;
      if (!accepted) return;
      try {
        const snapshot = await state();
        if (revision === requested && accepted) post({type:'state', state:snapshot}, target);
      } catch {}
    }, 100);
  }

  async function restoreShell() {
    if (!shell) return 'fullscreen-owned';
    const saved = shell;
    try {
      const win = await browser.windows.get(saved.id).catch(() => null);
      if (win?.state === 'fullscreen') await browser.windows.update(win.id, {state:saved.state});
      if (shell === saved) shell = null;
    } catch {return 'action-failed';}
  }

  async function perform(msg) {
    const win = await browserWindow();
    if (!win) return 'no-window';
    const p = msg.params;
    if (msg.action === 'browser-fullscreen') {
      if (!p.enabled) {managed = false; return restoreShell();}
      managed = true;
      if (shell && win.state === 'fullscreen' && shell.id === win.id) return;
      if (shell || win.state === 'fullscreen') return 'fullscreen-owned';
      const saved = {id:win.id, state:win.state === 'maximized' ? 'maximized' : 'normal'};
      await browser.windows.update(win.id, {state:'fullscreen'});
      shell = saved;
      if (!accepted) await restoreShell();
      return;
    }
    if (msg.action === 'new-tab') {
      await browser.tabs.create({windowId:win.id, ...(p.url ? {url:webUrl(p.url)} : {})});
      return;
    }
    if (msg.action === 'close-tabs') {
      const rows = (await browser.tabs.query({windowId:win.id})).filter(tab=>!tab.incognito);
      if (p.keep !== null && !rows.some(tab=>tab.id === p.keep)) return 'tab-unavailable';
      if (p.keep === null) await browser.tabs.create({windowId:win.id,url:'about:blank'});
      const ids = rows.map(tab=>tab.id).filter(id=>id !== p.keep);
      if (ids.length) await browser.tabs.remove(ids);
      return;
    }
    const tab = await browser.tabs.get(p.tabId).catch(() => null);
    if (!tab || tab.incognito || tab.windowId !== win.id) return 'tab-unavailable';
    switch (msg.action) {
      case 'navigate': await browser.tabs.update(tab.id, {url:webUrl(p.url)}); break;
      case 'back': await browser.tabs.goBack(tab.id); break;
      case 'forward': await browser.tabs.goForward(tab.id); break;
      case 'reload': await browser.tabs.reload(tab.id); break;
      case 'switch-tab': await browser.tabs.update(tab.id, {active:true}); break;
      case 'close-tab':
        if ((await browser.tabs.query({windowId:win.id})).length <= 1)
          await browser.tabs.create({windowId:win.id,url:'about:blank'});
        await browser.tabs.remove(tab.id);
        break;
      case 'view-mode':
        await browser.sessions.setTabValue(tab.id,modeKey,p.desktop);
        desktop.set(tab.id,p.desktop);
        if (webUrl(tab.url)) await browser.tabs.reload(tab.id,{bypassCache:true});
        break;
      case 'leave-page-fullscreen': case 'reveal-field': {
        const message = msg.action === 'reveal-field' ? 'bridge-reveal-field' : 'bridge-leave-fullscreen';
        const ok = await browser.tabs.sendMessage(tab.id,{type:message},{frameId:0});
        if (!ok) return 'action-failed';
        break;
      }
    }
  }

  async function onMessage(msg, target) {
    if (target !== port) return;
    if (msg?.type === 'rejected' && msg.reason === 'version-mismatch') {
      stoppedByVersion = true;
      status = 'version-mismatch';
      target.disconnect();
      return;
    }
    if (msg?.version === version && msg.type === 'accepted') {
      accepted = true;
      status = 'connected';
      retry = 1000;
      sync();
      return;
    }
    if (accepted && msg?.version === version && msg.type === 'viewer-detached') {
      managed = false;
      await restoreShell();
      sync();
      return;
    }
    if (!accepted || !command(msg)) return;
    if (running) {post({type:'result', id:msg.id, ok:false, error:'busy'}, target); return;}
    running = true;
    let error;
    try {error = await perform(msg);}
    catch {error = 'action-failed';}
    finally {running = false;}
    post({type:'result', id:msg.id, ok:!error, ...(error ? {error} : {})}, target);
    sync();
  }

  function reconnect() {
    if (stoppedByVersion) return;
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 30000);
  }

  function connect() {
    try {
      if (!browser.runtime.connectNative) {status = 'native-unavailable'; return;}
      const target = browser.runtime.connectNative(host);
      port = target;
      target.onMessage.addListener(msg => {void onMessage(msg, target);});
      target.onDisconnect.addListener(() => {
        if (port !== target) return;
        const reason = target.error?.message || browser.runtime.lastError?.message || '';
        if (!stoppedByVersion) {
          status = /no such native application|not found/i.test(reason) ? 'manifest-unavailable' :
            /permission|access forbidden/i.test(reason) ? 'native-denied' : 'native-disconnected';
        }
        accepted = false;
        managed = false;
        port = null;
        void restoreShell();
        reconnect();
      });
      void browser.runtime.getBrowserInfo().catch(() => null).then(info => {
        const firefox = /^[a-z0-9.]{1,32}$/i.test(info?.version || '') ? info.version : '';
        firefoxMajor = parseInt(firefox,10) || null;
        post({type:'hello', build:browser.runtime.getManifest().version, firefox}, target);
      });
    } catch {
      status = 'native-unavailable';
      reconnect();
    }
  }

  const nav = details => {if (details.frameId === 0) sync();};
  for (const event of [browser.tabs.onCreated, browser.tabs.onActivated, browser.tabs.onRemoved,
    browser.tabs.onAttached, browser.tabs.onDetached, browser.tabs.onUpdated,
    browser.windows.onFocusChanged, browser.windows.onBoundsChanged]) event?.addListener(sync);
  for (const event of [browser.webNavigation.onCommitted, browser.webNavigation.onCompleted,
    browser.webNavigation.onHistoryStateUpdated, browser.webNavigation.onReferenceFragmentUpdated]) event.addListener(nav);
  browser.webNavigation.onBeforeNavigate.addListener(details=>{
    if (details.frameId === 0) {failed.delete(details.tabId);sync();}
  });
  browser.webNavigation.onErrorOccurred.addListener(details=>{
    if (details.frameId === 0 && details.error !== 'NS_BINDING_ABORTED') {failed.set(details.tabId,details.url);sync();}
  });
  browser.tabs.onRemoved.addListener(id=>{desktop.delete(id);failed.delete(id);});
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if (msg?.type === 'bridge-page-changed' && sender.frameId === 0 && sender.tab && !sender.tab.incognito) sync();
    if (msg?.type === 'bridge-extension-status' && sender.url === browser.runtime.getURL('popup.html')) {
      return Promise.resolve(status);
    }
    return undefined;
  });
  connect();
})();

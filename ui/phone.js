import '../core/compat.js';
import {connectBackend} from './backend-client.js';
import {glyph, icon, spark, wave} from './icons.js';
import {esc, avatar, plate, setAvatarPictures} from './common.js';
import {APPS, HOME, SLOT} from './apps.js';
import {wallpaperLook, motionLayer} from './wallpapers.js';
import {rolesApp} from './roles.js';
import {enginesApp} from './engines.js';
import {presetsApp} from './presets.js';
import {libraryApp, galleryApp, notesApp, listenApp} from './media-apps.js';
import {settingsApp} from './settings.js';
import {drawApp} from './draw.js';
import {forumApp} from './forum.js';
import {peekApp} from './peek.js';
import {chatApp} from './chat.js';
import {soundsApp} from './sounds.js';
import {momentsNew, momentsSeen} from './moments.js';
import {callScreen} from './call.js';
import {installMotion} from './motion.js';
import {grow, launch, nudge, within, visible, islandIn, moving} from './carry.js';
import {todayPage} from './today.js';

// App factories, keyed by the ids in apps.js.
const FACTORIES = {roles: rolesApp, engines: enginesApp, presets: presetsApp, library: libraryApp, gallery: galleryApp, notes: notesApp, listen: listenApp, settings: settingsApp, draw: drawApp, chat: chatApp, forum: forumApp, peek: peekApp, sounds: soundsApp};
const ACTIVE_PHASES = ['playing', 'paused', 'generating', 'waiting'];

// Network and battery in the status bar come from the user's own device (where the browser tells them).
const BARS = n => `<svg viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">${[[0, 8, 4], [5, 5.5, 6.5], [10, 3, 9], [15, 0, 12]].map(([x, y, h], i) => `<rect x="${x}" y="${y}" width="3" height="${h}" rx="1"${i < n ? '' : ' opacity=".3"'}/>`).join('')}</svg>`;
const WIFI = (n, off = false) => `<svg viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">${['M1.6 4.9a10.5 10.5 0 0 1 14.8 0', 'M4.4 7.7a6.6 6.6 0 0 1 9.2 0', 'M7.2 10.5a2.6 2.6 0 0 1 3.6 0'].map((d, i) => `<path d="${d}"${3 - i <= n ? '' : ' opacity=".3"'}/>`).join('')}${off ? '<path d="M2.5 1.2 15.5 12"/>' : ''}</svg>`;
const BOLT = '<svg class="bolt" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true"><path d="M4.8 0 0 7h3.2L2.6 12 8 4.6H4.6z"/></svg>';
/** What the browser knows about the connection: offline, mobile data (with a guess at its strength) or Wi-Fi/wired. */
export function networkState(nav) {
  const c = nav?.connection, strength = ({'slow-2g': 1, '2g': 2, '3g': 3, '4g': 4})[c?.effectiveType] || 4;
  if (nav && nav.onLine === false) return {kind: 'offline', level: 0, label: '没有网络'};
  if (c?.type === 'cellular') return {kind: 'cell', level: strength, label: '移动网络' + (c.effectiveType ? ' · ' + c.effectiveType.toUpperCase().replace('SLOW-', '慢速 ') : '')};
  return {kind: 'wifi', level: Math.max(1, strength - 1), label: c?.type === 'ethernet' ? '有线网络' : c?.type === 'wifi' ? 'Wi-Fi' : '已联网'};
}
/** Battery from navigator.getBattery(); null when the browser does not tell (Firefox, Safari). */
export function batteryState(b) {
  if (!b || !Number.isFinite(b.level)) return null;
  const level = Math.round(b.level * 100);
  return {level, charging: !!b.charging, low: level <= 20 && !b.charging};
}

export function createPhoneApp({window: win, api, mount = win.document.getElementById('root')}) {
  const doc = win.document;
  const controller = new win.AbortController(), signal = controller.signal;
  const views = new Map(), assets = new Map();
  let today = null;
  const media = win.matchMedia('(prefers-color-scheme: dark)'), motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let panelVisible = true, active = null, locked = false, sheet = null, disposed = false;
  let lastPhase = '', preferences = null, appearanceKey = '', appearanceEpoch = 0, toastTimer, animation, openTimer, unread = 0, unreadTimer, fresh = 0, freshTimer;
  let playback = api.status();

  mount.innerHTML = `
    <div class="stage">
      <div class="stage-bar" title="按住这里拖动手机，双击放回原处"><span>ST-iPhonie</span><div class="stage-actions"><button class="size-button" data-system="size" aria-label="换手机大小" hidden></button><button class="info" data-system="help" aria-label="手机界面说明">i</button><button class="close" data-system="close" aria-label="返回酒馆">${icon('close')}</button></div></div>
      <div class="device">
        <button class="power-key" data-system="power" aria-label="锁屏或唤醒"></button>
        <div class="screen" data-view="home">
          <div class="wallpaper"></div>
          <div class="statusbar"><time data-clock="small"></time><button class="status-icons" data-system="control" aria-label="打开控制中心，或向下拖动"><span class="net" data-net></span><span class="battery" data-battery aria-hidden="true"></span></button></div>
          <button class="pull-tab" data-system="control" aria-label="打开控制中心，也可以从屏幕顶端往下拉"></button><span class="safe-probe" aria-hidden="true"></span>
          <button class="island" data-system="island" aria-label="打开听取"><span class="island-avatar"></span><span class="island-title"></span><span class="island-wave" hidden>${wave}</span><span class="camera"></span></button>
          <div class="island-card" role="dialog" aria-label="正在播放" hidden><div class="ic-head"><span class="ic-avatar"></span><div><strong data-playing-speaker></strong><small data-playing-message></small></div><span class="island-wave ic-wave">${wave}</span></div><div class="ic-actions"><button data-system="toggle" aria-label="暂停或继续"></button><button data-system="stop" aria-label="停止播放">${icon('stop', true)}</button><button class="ic-open" data-app="listen">打开听取</button></div></div>
          <main class="home"><div class="today-veil" aria-hidden="true"></div>
            <button class="home-close" data-system="close" aria-label="返回酒馆">${icon('close')}</button>
            <div class="home-pages"></div>
            <div class="home-foot"><div class="dots" aria-hidden="true"></div>
            <nav class="phone-dock" aria-label="常用应用"></nav></div>
          </main>
          <section class="app-frame" hidden><div class="app-window"><header class="app-nav"><button class="nav-button" data-system="back" aria-label="返回">${icon('back')}</button><button class="nav-button" data-system="home" aria-label="返回桌面">${icon('home')}</button></header><div class="app-content"></div></div></section>
          <button class="home-indicator" data-system="home" aria-label="返回桌面"></button>
          <section class="lockscreen" role="dialog" aria-modal="true" aria-label="锁屏" hidden></section>
          <div class="toast" role="status" hidden></div>
        </div>
      </div>
    </div>`;
  const $ = s => mount.querySelector(s);
  const screen = $('.screen'), home = $('.home'), frame = $('.app-frame'), content = $('.app-content'), lockscreen = $('.lockscreen');

  /** A short note out of the island (it grows out of it and goes back in). Errors stay longer (20 s), can be closed
   *  with ×, and can be selected to copy. */
  let toastMove = null;
  function hideToast() {
    const el = $('.toast');
    win.clearTimeout(toastTimer);
    if (el.hidden) return;
    toastMove?.cancel();
    toastMove = grow(win, el, islandIn($('.island'), el), {back: true, radius: 16, duration: 240});
    if (!toastMove) { el.hidden = true; return; }
    const move = toastMove;
    move.finished.then(() => { if (toastMove !== move) return; el.hidden = true; move.cancel(); toastMove = null; }, () => {});
  }
  function notify(text, {error = false} = {}) {
    if (disposed) return;
    if (error) api.noteError?.(text || '操作未完成');
    const el = $('.toast');
    el.innerHTML = `<span class="toast-text">${esc(text || '操作未完成')}</span>${error ? `<button type="button" class="toast-close" data-toast-close aria-label="关闭提示">${icon('close')}</button>` : ''}`;
    el.classList.toggle('error', error);
    el.setAttribute('role', error ? 'alert' : 'status');
    const fresh = el.hidden || !!toastMove;
    toastMove?.cancel(); toastMove = null;
    el.hidden = false;
    if (fresh) {
      const island = $('.island');
      toastMove = grow(win, el, islandIn(island, el), {radius: 16, duration: 380, easing: 'bounce', fade: 1});
      const move = toastMove;
      move?.finished.then(() => { if (toastMove === move) toastMove = null; }, () => {});
      nudge(win, island, [{scale: '1'}, {scale: '1.07 1.12'}, {scale: '1'}], {duration: 360, easing: 'soft'});
    }
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(hideToast, error ? 20000 : 4500);
  }
  const fail = error => notify(error?.message, {error: true});
  function run(fn) {
    try {
      const result = fn();
      result?.catch?.(fail);
      return result;
    } catch (error) { fail(error); }
  }
  mount.addEventListener('click', e => {
    if (!e.target.closest('[data-toast-close]')) return;
    hideToast();
  });
  function syncInert() {
    home.inert = !!active || locked || !!sheet;
    frame.inert = !active || locked || !!sheet;
    for (const s of ['.statusbar', '.pull-tab', '.island', '.home-indicator']) $(s).inert = locked || !!sheet;
    lockscreen.inert = !locked || !!sheet;
  }

  // ---------- Sheets ----------
  function dialog(title, html, {top = false} = {}) {
    sheet?.close(null);
    const focus = doc.activeElement, overlay = doc.createElement('div');
    overlay.className = 'overlay' + (top ? ' top' : '');
    overlay.innerHTML = `<section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="sheet-header"><h2>${esc(title)}</h2><button class="nav-button" data-sheet-close aria-label="关闭">${icon('close')}</button></header><div class="sheet-body">${html}</div></section>`;
    screen.append(overlay);
    let live = true;
    const callbacks = [];
    const result = {
      overlay,
      body: overlay.querySelector('.sheet-body'),
      get live() { return live; },
      onClose(fn) { callbacks.push(fn); },
      close(value = null) {
        if (!live) return;
        live = false;
        overlay.remove();
        if (sheet === result) sheet = null;
        syncInert();
        for (const callback of callbacks) callback(value);
        if (focus?.isConnected && !focus.closest('[inert]')) focus.focus({preventScroll: true});
      }
    };
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-sheet-close]')) result.close(null); });
    // An 「i」 inside a sheet opens its note right under the row (opening the 说明 sheet would close this one); again to fold it.
    overlay.addEventListener('click', e => {
      const info = e.target.closest('[data-help]');
      if (!info || !overlay.contains(info)) return;
      e.preventDefault();
      const row = info.closest('.setting-row, .field, .actions, .row-heading') || info.parentElement, next = row.nextElementSibling;
      if (next?.classList.contains('sheet-help')) { next.remove(); info.setAttribute('aria-expanded', 'false'); return; }
      const note = doc.createElement('p');
      note.className = 'help-copy sheet-help';
      note.textContent = info.dataset.help;
      row.after(note);
      info.setAttribute('aria-expanded', 'true');
    });
    overlay.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const controls = [...overlay.querySelectorAll('button,input,select,textarea,a[href]')].filter(el => !el.disabled && !el.hidden);
      if (!controls.length) return;
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    sheet = result;
    syncInert();
    overlay.querySelector('button').focus({preventScroll: true});
    return result;
  }
  function confirm(title, text = '') {
    return new Promise(resolve => {
      const d = dialog(title, `<p class="help-copy">${esc(text)}</p><div class="actions"><button type="button" class="secondary" data-action="cancel">取消</button><button type="button" class="primary" data-action="confirm">确认</button></div>`);
      d.onClose(value => resolve(value === true));
      d.body.addEventListener('click', e => {
        const action = e.target.closest('button')?.dataset.action;
        if (action === 'confirm') d.close(true);
        if (action === 'cancel') d.close(false);
      });
    });
  }
  const help = text => dialog('说明', `<p class="help-copy">${esc(text)}</p>`);

  const routeFor = name => api.getState().routes.find(r => r.name === name);
  const engineOf = name => { const r = routeFor(name); return r?.voice ? r.engine : 'none'; };
  const ctx = {api, doc, win, notify, dialog, confirm, help, lock, open, routeFor, engineOf, openPendingRole: name => openPendingRole(name), visible: name => active === name && !locked,
    editEngine: id => views.get('engines')?.edit?.(id), showPresetKind: kind => views.get('presets')?.showKind?.(kind), momentsSeen: () => { if (fresh) { fresh = 0; renderHome(); } }};
  installMotion(win, mount, signal);
  // On a computer the phone is a floating window: its top bar moves it.
  const stageBar = $('.stage-bar'), sizeButton = $('[data-system=size]');
  function floatingBar() {
    let float = false;
    try { float = !!api.panelFloating?.(); } catch { /* outside the tavern */ }
    stageBar.toggleAttribute('data-draggable', float);
    doc.documentElement.toggleAttribute('data-floating', float);
    sizeButton.hidden = !float;
    if (float) sizeButton.textContent = api.panelSizeName?.() || '中';
  }
  stageBar.addEventListener('pointerdown', e => {
    if (e.button || e.target.closest('button') || !stageBar.hasAttribute('data-draggable')) return;
    e.preventDefault();
    stageBar.setPointerCapture?.(e.pointerId);
    stageBar.dataset.dragging = '';
    api.panelDrag?.('start', e.screenX, e.screenY);
  }, {signal});
  stageBar.addEventListener('pointermove', e => { if ('dragging' in stageBar.dataset) api.panelDrag?.('move', e.screenX, e.screenY); }, {signal});
  for (const type of ['pointerup', 'pointercancel']) stageBar.addEventListener(type, () => { if (!('dragging' in stageBar.dataset)) return; delete stageBar.dataset.dragging; api.panelDrag?.('end'); }, {signal});
  stageBar.addEventListener('dblclick', e => { if (!e.target.closest('button')) api.panelDrag?.('reset'); }, {signal});
  // 来电: one layer over everything, drawn from what the tavern side reports.
  const calls = callScreen(ctx, screen);
  // Opening the phone shows a call still going on; one that already ended (the host keeps it) is not shown again.
  const callState = () => { try { const c = api.callStatus?.() || null; calls.update(c?.state === 'ended' ? null : c); } catch { /* not in the tavern */ } };

  // ---------- Navigation ----------
  // An app grows out of what opened it (its icon, the island) and shrinks back into it, or into its icon, on the way
  // home, as on an iPhone (ui/carry.js launch); the home screen zooms past behind it. Turning round halfway (home
  // while it opens, or the icon again while it closes) carries on from where the window is. Without motion it just shows.
  let carrying = [], openedFrom = null, launching = null;
  function stopCarry() { const o = launching ? {at: launching.openness(), speed: launching.speed()} : null; for (const a of carrying) a?.cancel(); carrying = []; launching = null; delete screen.dataset.carrying; return o; }
  const iconOf = name => home.querySelector(`.app-icon[data-app="${name}"] .icon-tile`);
  function open(name, roleId, from = null) {
    if (!FACTORIES[name]) return;
    sheet?.close(null);
    unlock();
    const source = from || (!active && !home.hidden ? iconOf(name) : null);
    const was = stopCarry();
    active = name;
    let v = views.get(name);
    if (!v) { v = FACTORIES[name](ctx); views.set(name, v); content.append(v.root); }
    else run(() => v.refresh());
    for (const [id, view] of views) view.root.hidden = id !== name;
    frame.hidden = false;
    screen.dataset.view = 'app';
    openedFrom = source;
    const grown = source && !home.hidden ? launch(win, screen, frame, source, {home, ...(was || {})}) : null;
    if (grown) {
      screen.dataset.carrying = '';
      carrying = [grown]; launching = grown;
      grown.finished.then(ok => { if (!ok || launching !== grown) return; if (active === name) home.hidden = true; grown.cancel(); delete screen.dataset.carrying; carrying = []; launching = null; });
    } else {
      // Not out of an icon: the page rises in.
      home.hidden = true;
      screen.dataset.opening = 'true';
      win.clearTimeout(openTimer);
      openTimer = win.setTimeout(() => delete screen.dataset.opening, 260);
    }
    syncInert();
    $('.app-nav [data-system=back]').focus({preventScroll: true});
    if (roleId && v.edit) v.edit(roleId);
    v.onPlayback?.(playback);
  }
  function showHome() {
    sheet?.close(null);
    if (locked) return;
    const leaving = active, was = stopCarry();
    active = null;
    home.hidden = false;
    screen.dataset.view = 'home';
    placeHome();
    syncInert();
    if (!leaving) { frame.hidden = true; today?.leave(); const pagesEl = $('.home-pages'); pagesEl.scrollTo({left: pagesEl.clientWidth, behavior: moving(win) ? 'smooth' : 'auto'}); return; }
    // Back into what it came out of, or its own icon on the page showing; else it sinks away in the middle.
    const target = [openedFrom, iconOf(leaving)].find(el => el?.isConnected && visible(within(el, frame)));
    const shrink = target ? launch(win, screen, frame, target, {back: true, home, ...(was || {})}) : null;
    if (shrink) {
      screen.dataset.carrying = '';
      carrying = [shrink]; launching = shrink;
      shrink.finished.then(ok => { if (!ok || launching !== shrink) return; if (!active) frame.hidden = true; shrink.cancel(); delete screen.dataset.carrying; carrying = []; launching = null; });
      return;
    }
    // No icon to go back into: it sinks away in the middle.
    const sink = nudge(win, frame, [{transform: 'scale(1)', opacity: 1}, {transform: 'scale(.9)', opacity: 0}], {duration: 240, easing: 'out', fill: 'forwards'});
    if (!sink) { frame.hidden = true; homeIn(); return; }
    screen.dataset.carrying = '';
    const back = nudge(win, home, [{transform: 'scale(1.06)', opacity: 0}, {transform: 'scale(1)', opacity: 1}], {duration: 340, easing: 'out'});
    carrying = [sink, back];
    sink.finished.then(() => { if (carrying[0] !== sink) return; if (!active) frame.hidden = true; sink.cancel(); delete screen.dataset.carrying; carrying = []; }, () => {});
  }
  /** The first app page shows first, the first time the home screen can be seen (not while an app hides it); 今天 is a swipe to the right. */
  let placed = false;
  function placeHome() { const el = $('.home-pages'); if (placed || !today || home.hidden || !el.clientWidth) return; el.scrollLeft = el.clientWidth; placed = true; }
  // The dots and the dock float over the bottom of the pages: the app pages keep their height clear.
  const foot = $('.home-foot'), footRoom = () => { if (foot.offsetHeight) home.style.setProperty('--home-foot', foot.offsetHeight + 'px'); };
  if (win.ResizeObserver) { const watch = new win.ResizeObserver(footRoom); watch.observe(foot); signal.addEventListener('abort', () => watch.disconnect()); }
  // The phone may open hidden (a closed panel): placed when it first has a size.
  if (win.ResizeObserver) { const watch = new win.ResizeObserver(() => { placeHome(); if (placed) watch.disconnect(); }); watch.observe($('.home-pages')); signal.addEventListener('abort', () => watch.disconnect()); }
  /** The app page showing (0: the first), 今天 not counted; -1 on 今天. */
  function pageNow() { const el = $('.home-pages'); return Math.round(el.scrollLeft / (el.clientWidth || 1)) - (today ? 1 : 0); }
  let todayTimer = 0;
  function todayLater() { win.clearTimeout(todayTimer); todayTimer = win.setTimeout(() => run(() => today?.refresh()), 300); }
  // Icons and widgets come in one after another when the home screen appears (not when a badge redraws it).
  let homeTimer = 0;
  function homeIn() {
    win.clearTimeout(homeTimer);
    delete screen.dataset.homeIn;
    void screen.offsetWidth;
    screen.dataset.homeIn = '';
    homeTimer = win.setTimeout(() => delete screen.dataset.homeIn, 800);
  }
  function back() {
    if (sheet) { sheet.close(null); return; }
    if (locked) { unlock(); return; }
    if (active && views.get(active)?.back?.()) return;
    showHome();
  }
  function lock() {
    sheet?.close(null);
    locked = true;
    renderLock();
    lockscreen.hidden = false;
    syncInert();
    lockscreen.querySelector('[data-system=unlock]').focus({preventScroll: true});
  }
  function unlock() {
    if (!locked) return;
    locked = false;
    lockscreen.hidden = true;
    syncInert();
    if (!active) homeIn();
    if (active) $('.app-nav [data-system=back]').focus({preventScroll: true});
    else home.querySelector('.app-icon')?.focus({preventScroll: true});
  }
  function openPendingRole(name) {
    const route = routeFor(name);
    if (route) { open('roles', route.id); return; }
    open('roles');
    views.get('roles')?.create?.(name);
  }

  // ---------- Clock and theme ----------
  let lastClock = '';
  function clock() {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false});
    const date = now.toLocaleDateString('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'});
    for (const el of mount.querySelectorAll('[data-clock]')) el.textContent = el.dataset.clock === 'date' ? date : time;
    // The 今天 clock and calendar move on with the minute.
    if (time !== lastClock) { lastClock = time; today?.paint(['clock', 'calendar']); }
  }
  const isDark = () => doc.documentElement.dataset.theme === 'dark';
  function applyThemeMode() {
    const mode = preferences?.theme || api.getState().theme;
    doc.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    doc.documentElement.dataset.skin = preferences?.skin || 'sky';
  }
  function theme() {
    applyThemeMode();
    if (preferences) run(() => appearance(preferences));
  }

  // ---------- Home screen ----------
  function appIcon(id) {
    if (id === SLOT) return `<button class="app-icon slot" data-slot aria-label="预留位置"><span class="icon-tile">${icon('add')}</span><span class="app-label">预留</span></button>`;
    const meta = APPS[id], custom = preferences?.icons?.[id], [t1, t2, tac] = meta.colors;
    const image = custom?.kind === 'photo' ? assets.get(custom.photoId) : null;
    const art = image ? `<img src="${esc(image)}" alt="">` : glyph(custom?.kind === 'glyph' && custom.key !== 'default' ? custom.key : id);
    // The chat icon: unread messages as a number; new 动态 alone as a dot.
    const count = id === 'chat' ? unread : 0, dot = id === 'chat' && !unread && fresh;
    const badge = count ? `<span class="badge app-badge">${count > 99 ? '99+' : count}</span>` : dot ? '<span class="badge app-badge dot"></span>' : '';
    return `<button class="app-icon" data-app="${id}" aria-label="${esc(meta.name)}${count ? `，${count} 条未读` : dot ? '，有新动态' : ''}"><span class="icon-tile" style="--t1:${t1};--t2:${t2};--tac:${tac}">${art}</span>${badge}<span class="app-label">${esc(meta.name)}</span></button>`;
  }
  function renderHome() {
    const shown = HOME.pages.map(ids => ids.filter(id => id !== SLOT)).filter((ids, index) => index === 0 || ids.length);
    const pages = shown.map((ids, index) => `<div class="home-page">${index === 0
      ? `<div class="clock-block"><p class="home-date" data-clock="date"></p><p class="home-clock" data-clock="large"></p></div><div class="widgets"><button class="widget live-wave" data-system="island" data-widget="playing"></button><div class="widget" data-widget="cast"></div></div>`
      : ''}<div class="apps-grid">${ids.map(appIcon).join('')}</div></div>`).join('');
    // 今天 (ui/today.js) stays first and is not drawn again; the app pages after it are.
    const pagesEl = $('.home-pages'), made = doc.createElement('template');
    made.innerHTML = pages;
    pagesEl.replaceChildren(...(today ? [today.root] : []), ...made.content.children);
    placeHome();
    $('.dots').innerHTML = shown.length > 1 ? shown.map((_, i) => `<i${i === pageNow() ? ' data-on' : ''}></i>`).join('') : '';
    today?.paint();
    $('.phone-dock').innerHTML = HOME.dock.map(appIcon).join('');
    clock();
    renderWidgets();
  }
  function renderWidgets() {
    const playing = $('[data-widget=playing]'), cast = $('[data-widget=cast]');
    if (playing) {
      const line = playback.line, speaker = playback.speaker, on = ACTIVE_PHASES.includes(playback.phase) && speaker;
      playing.dataset.engine = on ? engineOf(speaker) : 'none';
      playing.innerHTML = `<span class="widget-head"><span class="eyebrow">Now Playing</span>${wave}</span>${on
        ? `<span class="who">${avatar(speaker, engineOf(speaker), 30)}${plate(speaker)}</span><span class="widget-line">${esc(line?.translation ? '“' + line.translation + '”' : playback.message || '')}</span>`
        : '<span class="widget-line">还没有在播放</span><small>点聊天里的声波，或打开听取</small>'}`;
    }
    if (cast) {
      const routes = api.getState().routes.slice(0, 4);
      cast.innerHTML = `<span class="widget-head"><span class="eyebrow">Cast</span></span>${routes.length
        ? `<div class="cast">${routes.map(r => `<button data-open-role="${esc(r.id)}" aria-label="打开 ${esc(r.name)} 的配音">${avatar(r.name, r.voice ? r.engine : 'none', 28)}<span>${esc(r.name)}</span></button>`).join('')}</div>`
        : `<span class="widget-line">还没有角色</span><button class="chip-button" data-app="roles">新增角色</button>`}`;
    }
  }
  function renderLock() {
    const on = ACTIVE_PHASES.includes(playback.phase) && playback.speaker;
    lockscreen.innerHTML = `${icon('lock')}<p class="home-date" data-clock="date"></p><p class="home-clock" data-clock="large"></p>
      <div class="widget live-wave" data-engine="${on ? engineOf(playback.speaker) : 'none'}"><span class="widget-head"><span class="eyebrow">Now Playing</span>${wave}</span>${on ? `<span class="who">${avatar(playback.speaker, engineOf(playback.speaker), 30)}${plate(playback.speaker)}</span>` : ''}<span class="widget-line" data-playing-message>${esc(playback.line?.translation || playback.message || '点击台词开始')}</span></div>
      <div class="lock-bottom"><button class="primary" data-system="unlock">点这里进入</button><button class="chip-button" data-system="unlock">跳过锁屏</button></div>`;
    clock();
  }

  async function appearance(phone) {
    preferences = phone;
    today?.setList(phone.widgets);
    applyThemeMode();
    const dark = isDark();
    const key = JSON.stringify([phone.wallpaper, phone.icons, phone.iconStyle, dark]);
    if (key === appearanceKey) return;
    const ticket = ++appearanceEpoch;
    const photoIds = new Set([phone.wallpaper.kind === 'photo' ? phone.wallpaper.photoId : null, ...Object.values(phone.icons).filter(x => x?.kind === 'photo').map(x => x.photoId)].filter(Boolean));
    const records = await Promise.all([...photoIds].map(async id => [id, await api.getPhoto(id)]));
    if (disposed || ticket !== appearanceEpoch) return;
    for (const url of assets.values()) win.URL.revokeObjectURL(url);
    assets.clear();
    for (const [id, record] of records) if (record) assets.set(id, win.URL.createObjectURL(record.blob));
    const photo = phone.wallpaper.kind === 'photo' ? assets.get(phone.wallpaper.photoId) : null;
    const look = wallpaperLook(phone.wallpaper.key, dark);
    const vars = photo
      ? {'--wall': `linear-gradient(#0000001f,#0000001f),url("${photo}")`, '--wall-size': 'cover', '--wall-pos': 'center', '--wall-ink': '#fff', '--label-halo': '#000'}
      : {'--wall': look.background, '--wall-size': look.size || 'auto', '--wall-pos': look.pos || 'center', '--wall-ink': look.ink, '--clock-stroke': look.stroke, '--clock-shadow': look.shadow || look.stroke, '--label-halo': look.halo};
    for (const [name, value] of Object.entries(vars)) screen.style.setProperty(name, value);
    screen.dataset.clockStyle = photo ? 'shade' : look.clock;
    screen.dataset.iconStyle = phone.iconStyle;
    $('.wallpaper').innerHTML = (photo || look.clock === 'glow' ? '' : [['12%', '20%', 14], ['84%', '14%', 22], ['72%', '28%', 10], ['20%', '58%', 12]].map(([x, y, s]) => spark('spark').replace('<svg', `<svg style="left:${x};top:${y};width:${s}px;height:${s}px"`)).join('')) + (photo ? '' : motionLayer(look.motion));
    wallMotion();
    appearanceKey = key;
    renderHome();
  }

  /** 动态壁纸 on or off (settings); the CSS also stops it for reduced motion and while an app is open. */
  function wallMotion() { screen.dataset.wallMotion = api.getState().general.wallpaperMotion === false ? 'off' : 'on'; }

  // ---------- The island's mini player ----------
  // A tap on the island while something plays opens it into a small player (who, the line, pause, stop, 听取); a tap
  // anywhere else, or the playing ending, takes it back in.
  let cardMove = null;
  const card = () => $('.island-card');
  function openCard() {
    const el = card();
    if (!el.hidden && !cardMove) return;
    cardMove?.cancel(); cardMove = null;
    el.hidden = false;
    $('.island').dataset.open = '';
    cardMove = grow(win, el, islandIn($('.island'), el), {radius: 16, duration: 380, easing: 'bounce', fade: 1});
    const move = cardMove;
    move?.finished.then(() => { if (cardMove === move) cardMove = null; }, () => {});
    el.querySelector('[data-system=toggle]')?.focus({preventScroll: true});
  }
  function closeCard({now = false} = {}) {
    const el = card();
    if (el.hidden) return;
    cardMove?.cancel();
    cardMove = now ? null : grow(win, el, islandIn($('.island'), el), {back: true, radius: 16, duration: 240});
    const done = () => { el.hidden = true; delete $('.island').dataset.open; };
    if (!cardMove) { done(); return; }
    const move = cardMove;
    move.finished.then(() => { if (cardMove !== move) return; done(); move.cancel(); cardMove = null; }, () => {});
  }
  mount.addEventListener('pointerdown', e => { if (!card().hidden && !e.target.closest('.island-card,.island')) closeCard(); }, {signal, capture: true});

  // ---------- Playback ----------
  function animate() {
    win.cancelAnimationFrame(animation);
    for (const bar of mount.querySelectorAll('.wave i,.visualizer i')) bar.style.removeProperty('transform');
    for (const el of mount.querySelectorAll('.portrait')) el.style.removeProperty('--level');
    if (disposed || !panelVisible || doc.hidden || motion.matches || playback.phase !== 'playing' || !api.getState().general.waveformEnabled) return;
    let before = 0;
    const draw = time => {
      if (time - before > 32) {
        const levels = api.levels();
        const five = [...mount.querySelectorAll('.island-wave .wave i,.live-wave .wave i,[data-state=playing] .wave i')];
        five.forEach((bar, i) => bar.style.transform = 'scaleY(' + (.2 + .8 * (levels[i % 5] || 0)) + ')');
        for (const viz of mount.querySelectorAll('.visualizer')) {
          const bars = viz.children, n = bars.length;
          for (let i = 0; i < n; i++) {
            const envelope = .35 + .65 * Math.sin(Math.PI * (i + .5) / n);
            bars[i].style.transform = 'scaleY(' + (.08 + .92 * envelope * (levels[Math.floor(i * 5 / n)] || 0)) + ')';
          }
        }
        const average = levels.reduce((a, b) => a + b, 0) / (levels.length || 1);
        for (const el of mount.querySelectorAll('.portrait')) el.style.setProperty('--level', average.toFixed(3));
        before = time;
      }
      animation = win.requestAnimationFrame(draw);
    };
    animation = win.requestAnimationFrame(draw);
  }
  function paintPlayback(state) {
    playback = state;
    const on = ACTIVE_PHASES.includes(state.phase);
    const island = $('.island');
    island.toggleAttribute('data-active', on && !!state.speaker);
    island.dataset.engine = state.speaker ? engineOf(state.speaker) : 'none';
    $('.island-avatar').textContent = (state.speaker || '').slice(0, 1);
    $('.island-title').textContent = on ? (state.phase === 'waiting' ? '等待 ' + state.speaker : state.speaker || '听取') : '';
    $('.island-wave').hidden = !on || state.phase === 'waiting';
    const c = card();
    c.dataset.engine = island.dataset.engine;
    c.querySelector('.ic-avatar').innerHTML = on && state.speaker ? avatar(state.speaker, engineOf(state.speaker), 40) : '';
    if (!on || !state.speaker) closeCard();
    island.setAttribute('aria-label', on ? '查看 ' + state.speaker + ' 的播放状态' : '打开听取');
    renderWidgets();
    today?.paint(['playing']);
    for (const el of mount.querySelectorAll('[data-playing-speaker]')) el.textContent = state.speaker || '等待播放';
    for (const el of mount.querySelectorAll('[data-playing-message]')) el.textContent = state.line?.translation || state.message || '点击台词开始';
    for (const el of mount.querySelectorAll('[data-system=toggle]')) {
      el.innerHTML = icon(state.phase === 'playing' ? 'pause' : 'play', true);
      el.disabled = !['playing', 'paused', 'generating'].includes(state.phase);
    }
    for (const v of views.values()) v.onPlayback?.(state);
    animate();
  }

  // ---------- Avatars ----------
  // Pictures for avatars: the user's choice (an album photo, or text), else the tavern's own avatar for that name
  // (character card, current persona). Loaded once and again when the choices or the tavern's avatars change.
  const avatarURLs = new Map();
  let avatarKey = '', avatarRun = 0, lastSyncAt = 0;
  async function refreshAvatars() {
    const run = ++avatarRun, chosen = api.getState().chat?.avatars || {};
    let tavern = {me: '', characters: {}};
    try { tavern = api.tavernAvatars?.() || tavern; } catch { /* outside the tavern */ }
    const map = {...tavern.characters, ...(tavern.me ? {me: tavern.me} : {})}, used = new Set();
    for (const [name, a] of Object.entries(chosen)) {
      if (a.kind === 'text') { delete map[name]; continue; }
      used.add(a.photoId);
      if (!avatarURLs.has(a.photoId)) {
        const photo = await api.getPhoto(a.photoId).catch(() => null);
        if (run !== avatarRun || disposed) return;
        avatarURLs.set(a.photoId, photo?.blob ? win.URL.createObjectURL(photo.blob) : '');
      }
      if (avatarURLs.get(a.photoId)) map[name] = avatarURLs.get(a.photoId);
    }
    for (const [id, url] of avatarURLs) if (!used.has(id)) { if (url) win.URL.revokeObjectURL(url); avatarURLs.delete(id); }
    const key = JSON.stringify(map);
    if (key === avatarKey || disposed) return;
    avatarKey = key;
    setAvatarPictures(map);
    renderHome();
    paintPlayback(playback);
    const v = active && views.get(active);
    if (v) run === avatarRun && (v.onAvatars ? v.onAvatars() : v.refresh?.());
  }

  // ---------- Device (network and battery) ----------
  const nav = win.navigator;
  let battery = null;
  function paintDevice() {
    if (disposed) return;
    const n = networkState(nav), b = batteryState(battery);
    const netIcon = n.kind === 'cell' ? BARS(n.level) : WIFI(n.level, n.kind === 'offline');
    const batteryText = b ? `电量 ${b.level}%${b.charging ? '，正在充电' : ''}` : '这个浏览器不提供电量';
    for (const el of mount.querySelectorAll('[data-net]')) { el.innerHTML = netIcon; el.dataset.kind = n.kind; }
    for (const el of mount.querySelectorAll('[data-battery]')) {
      el.style.setProperty('--level', b ? Math.max(b.level, 4) + '%' : '100%');
      el.toggleAttribute('data-unknown', !b);
      el.toggleAttribute('data-charging', !!b?.charging);
      el.toggleAttribute('data-low', !!b?.low);
      el.innerHTML = b?.charging ? BOLT : '';
    }
    for (const el of mount.querySelectorAll('[data-net-label]')) el.textContent = n.label;
    for (const el of mount.querySelectorAll('[data-battery-label]')) el.textContent = b ? `${b.level}%${b.charging ? ' · 充电中' : b.low ? ' · 电量低' : ''}` : '电量未知';
    $('.status-icons').setAttribute('aria-label', `打开控制中心，或向下拖动（${n.label}，${batteryText}）`);
    today?.paint(['battery']);
  }
  win.addEventListener('online', paintDevice, {signal});
  win.addEventListener('offline', paintDevice, {signal});
  nav.connection?.addEventListener?.('change', paintDevice, {signal});
  Promise.resolve(nav.getBattery?.()).then(b => {
    if (!b || disposed) return;
    battery = b;
    for (const type of ['levelchange', 'chargingchange']) b.addEventListener(type, paintDevice, {signal});
    paintDevice();
  }).catch(() => {});

  // ---------- Control center ----------
  function control({pulling = false} = {}) {
    const s = api.getState(), p = preferences || {volume: api.getVolume(), theme: s.theme};
    const on = ACTIVE_PHASES.includes(playback.phase) && playback.speaker;
    const toggles = [['floating', 'float', '悬浮入口', s.general.floatingEnabled], ['waves', 'wave', '声波动画', s.general.waveformEnabled], ['motion', 'image', '动态壁纸', s.general.wallpaperMotion !== false]];
    const d = dialog('控制中心', `<div class="control-grid">
      <div class="control-tile wide cc-device"><span class="net" data-net></span><span data-net-label></span><span class="cc-battery"><span class="battery" data-battery aria-hidden="true"></span><span data-battery-label></span></span></div>
      <div class="control-tile wide live-wave" data-engine="${on ? engineOf(playback.speaker) : 'none'}">${on ? avatar(playback.speaker, engineOf(playback.speaker), 42) : wave}<div><strong data-playing-speaker></strong><small data-playing-message></small></div><button class="play-round" data-system="toggle" aria-label="暂停或继续">${icon('play', true)}</button></div>
      <div class="control-tile wide" style="flex-direction:column;align-items:stretch"><div class="meter-label"><span>播放音量</span><output>${Math.round(p.volume * 100)}%</output></div><input class="slider" data-control="volume" type="range" min="0" max="100" value="${Math.round(p.volume * 100)}" aria-label="播放音量"></div>
      <div class="control-tile wide cc-toggles">${toggles.map(([key, glyphKey, label, value]) => `<button class="cc-toggle" data-control="${key}" aria-pressed="${value}"><span class="bubble">${icon(glyphKey)}</span>${label}</button>`).join('')}<button class="cc-toggle" data-system="power" aria-pressed="true"><span class="bubble">${icon('lock')}</span>锁屏</button></div>
      <div class="control-tile wide" style="flex-direction:column;align-items:stretch"><span>主题</span><div class="segmented">${[['system', '跟随系统'], ['light', '日间'], ['dark', '夜间']].map(([key, label]) => `<button data-theme="${key}" aria-pressed="${p.theme === key}">${label}</button>`).join('')}</div></div>
      <button class="control-tile" data-control="stop" aria-pressed="true"><span class="bubble">${icon('stop', true)}</span>停止播放<small>清空当前队列</small></button>
      <button class="control-tile" data-app="listen" aria-pressed="true"><span class="bubble">${icon('wave')}</span>打开听取<small>整条播放与记录</small></button>
    </div>`, {top: true});
    d.control = true;
    if (pulling) pullTo(d, 0);
    d.body.addEventListener('input', e => { if (e.target.dataset.control === 'volume') d.body.querySelector('output').textContent = e.target.value + '%'; });
    d.body.addEventListener('change', e => { if (e.target.dataset.control === 'volume') run(() => api.setVolume(Number(e.target.value) / 100)); });
    d.body.addEventListener('click', e => {
      const el = e.target.closest('button');
      if (!el) return;
      run(async () => {
        if (el.dataset.theme) {
          await api.savePhone({theme: el.dataset.theme});
          if (d.live) for (const b of d.body.querySelectorAll('[data-theme]')) b.setAttribute('aria-pressed', String(b === el));
        }
        const flip = {floating: 'floatingEnabled', waves: 'waveformEnabled', motion: 'wallpaperMotion'}[el.dataset.control];
        if (flip) {
          const enabled = el.getAttribute('aria-pressed') !== 'true';
          api.updateGeneral({[flip]: enabled});
          el.setAttribute('aria-pressed', String(enabled));
        }
        if (el.dataset.control === 'stop') api.stop();
      });
    });
    paintPlayback(playback);
    paintDevice();
    return d;
  }
  // Pulled down from the top of the screen it follows the finger (or mouse) and stays open once pulled far enough;
  // pushed back up the same way it closes.
  function pullTo(d, amount) {
    d.overlay.classList.add('pulling');
    d.overlay.classList.remove('settling');
    d.overlay.style.setProperty('--pull', String(Math.min(1, Math.max(0, amount))));
  }
  function settle(d, open) {
    if (!d.live) return;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      d.overlay.classList.remove('pulling', 'settling');
      d.overlay.style.removeProperty('--pull');
      if (!open) d.close(null);
    };
    d.overlay.classList.add('settling');
    d.overlay.style.setProperty('--pull', open ? '1' : '0');
    if (motion.matches) done();
    else { d.overlay.querySelector('.sheet').addEventListener('transitionend', done, {once: true}); win.setTimeout(done, 360); }
  }
  let gesture = null, pulledAt = 0;
  /** Where a drag may start: the top strip of the screen (the status bar; on a real phone, where it would be), the
   *  status icons, an open control center (to push it back up), or the lock screen (to swipe it away). */
  function gestureStart(target, x, y) {
    gesture = null;
    if (disposed || !panelVisible) return;
    if (locked && !sheet) { if (target.closest('.lockscreen')) gesture = {kind: 'unlock', x, y}; return; }
    if (sheet?.control && target.closest('.overlay.top') && !target.closest('input,select,textarea')) {
      const body = target.closest('.sheet-body');
      if (!body || body.scrollHeight <= body.clientHeight + 1) gesture = {kind: 'close', x, y, d: sheet};
      return;
    }
    if (sheet || locked || target.closest('.stage-bar')) return;
    const top = y - screen.getBoundingClientRect().top;
    if (target.closest('.status-icons,.pull-tab') || top >= 0 && top < Math.max(34, $('.safe-probe').offsetHeight + 26)) gesture = {kind: 'open', x, y};
  }
  /** Returns true while the drag is ours, so the page does not scroll under it. */
  function gestureMove(x, y) {
    const g = gesture;
    if (!g) return false;
    const dx = x - g.x, dy = y - g.y;
    if (!g.decided) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return false;
      if (Math.abs(dx) > Math.abs(dy)) { gesture = null; return false; }
      g.decided = true;
    }
    if (g.kind === 'unlock') return true;
    if (!g.pulling) {
      if (g.kind === 'open' && dy > 8) g.d = control({pulling: true});
      else if (g.kind === 'close' && dy < -8) pullTo(g.d, 1);
      else return true;
      g.pulling = true;
    }
    if (!g.d.live) { gesture = null; return false; }
    const h = g.d.overlay.querySelector('.sheet').offsetHeight || 400;
    g.amount = g.kind === 'open' ? (dy + 30) / h : 1 + dy / h;
    pullTo(g.d, g.amount);
    return true;
  }
  function gestureEnd(x, y, cancelled = false) {
    const g = gesture;
    gesture = null;
    if (!g) return;
    const dx = x - g.x, dy = y - g.y;
    if (g.kind === 'unlock') { if (!cancelled && Math.abs(dx) <= 70 && dy < -45) unlock(); return; }
    if (!g.pulling) return;
    pulledAt = Date.now();
    settle(g.d, g.kind === 'open' ? !cancelled && (g.amount > .3 || dy > 90) : cancelled || !(g.amount < .75 || dy < -80));
  }

  // ---------- Events ----------
  mount.addEventListener('click', event => {
    const b = event.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.app) { open(b.dataset.app, undefined, b.closest('.island-card') || b.querySelector('.icon-tile') || b); closeCard({now: true}); return; }
    if (b.dataset.openRole) { open('roles', b.dataset.openRole); return; }
    if (b.hasAttribute('data-slot')) { notify('这个位置留给以后的新 App'); return; }
    if (!b.dataset.system) return;
    run(() => {
      switch (b.dataset.system) {
        case 'close': api.close(); break;
        case 'home': showHome(); break;
        case 'back': back(); break;
        case 'power': locked ? unlock() : lock(); break;
        case 'unlock': unlock(); break;
        case 'island': {
          const pending = playback.phase === 'waiting' && api.pendingRole();
          if (pending) openPendingRole(pending);
          else if (b.hasAttribute('data-active') && b.classList.contains('island')) { if (card().hidden) openCard(); else closeCard(); }
          else open('listen', undefined, b);
          break;
        }
        case 'control': if (Date.now() - pulledAt > 400) control(); break;
        case 'size': b.textContent = api.panelSize?.() || b.textContent; break;
        case 'toggle': api.toggle(); break;
        case 'stop': api.stop(); break;
        case 'help': help('桌面左右滑动翻页，图标打开对应应用；第一页再往右滑是「今天」小组件页，点「编辑」或长按小组件可以添加、移除、拖动换位置；底部横条或左上角返回键回到桌面。\n从屏幕顶端往下拉（或点右上角的信号和电量）打开控制中心，往上推收起。侧键可以看锁屏，锁屏随时可以跳过。\n\n信号和电量是你设备上的真实状态（有的浏览器不提供电量，比如 Safari、Firefox）。语音只在点击台词、播放或试听时生成。'); break;
      }
    });
  }, {signal});
  // A mouse drags the home screen sideways to change page (fingers swipe it natively); a drag is not also a tap.
  {
    const pagesEl = $('.home-pages');
    let drag = null, dragged = 0;
    pagesEl.addEventListener('pointerdown', e => { if (e.target.closest('.today-page[data-editing] .tw, .today-page input')) return; if (e.pointerType === 'mouse' && e.button === 0 && pagesEl.children.length > 1) drag = {id: e.pointerId, x: e.clientX, left: pagesEl.scrollLeft, moved: false}; }, {signal});
    win.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; pagesEl.style.scrollSnapType = 'none'; pagesEl.style.scrollBehavior = 'auto'; }
      pagesEl.scrollLeft = drag.left - dx;
    }, {signal});
    win.addEventListener('pointerup', e => {
      const d = drag; drag = null;
      if (!d?.moved) return;
      const w = pagesEl.clientWidth || 1, dx = e.clientX - d.x;
      let page = Math.round(d.left / w);
      if (Math.abs(dx) > w * 0.15) page += dx < 0 ? 1 : -1;
      page = Math.max(0, Math.min(pagesEl.children.length - 1, page));
      pagesEl.style.scrollSnapType = ''; pagesEl.style.scrollBehavior = '';
      pagesEl.scrollTo({left: page * w, behavior: 'smooth'});
      dragged = Date.now();
    }, {signal});
    pagesEl.addEventListener('click', e => { if (Date.now() - dragged < 350) { e.stopPropagation(); e.preventDefault(); } }, {signal, capture: true});
  }
  // How far 今天 is in (1: all of it): the wallpaper blurs and the dock and dots go, following the finger.
  $('.home-pages').addEventListener('scroll', e => {
    const w = e.target.clientWidth || 1, i = pageNow(), into = today ? Math.min(1, Math.max(0, 1 - e.target.scrollLeft / w)) : 0;
    mount.querySelectorAll('.dots i').forEach((dot, k) => dot.toggleAttribute('data-on', k === i));
    home.style.setProperty('--today', into.toFixed(3));
    home.toggleAttribute('data-today', into > .5);
    home.toggleAttribute('data-today-in', into > .002);
    if (into < .2 && today?.editing) today.leave();
  }, {signal, passive: true});
  // Mouse and pen through pointer events; fingers through touch events, whose moves can be held back from scrolling.
  mount.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' && e.button === 0) gestureStart(e.target, e.clientX, e.clientY); }, {signal});
  mount.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' && gesture && gestureMove(e.clientX, e.clientY)) e.preventDefault(); }, {signal});
  mount.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') gestureEnd(e.clientX, e.clientY); }, {signal});
  mount.addEventListener('pointercancel', e => { if (e.pointerType !== 'touch') gestureEnd(e.clientX, e.clientY, true); }, {signal});
  mount.addEventListener('touchstart', e => { const t = e.touches[0]; if (e.touches.length === 1) gestureStart(e.target, t.clientX, t.clientY); else gestureEnd(0, 0, true); }, {signal, passive: true});
  mount.addEventListener('touchmove', e => { const t = e.touches[0]; if (t && gesture && gestureMove(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); }, {signal, passive: false});
  mount.addEventListener('touchend', e => { const t = e.changedTouches[0]; if (t) gestureEnd(t.clientX, t.clientY); }, {signal});
  mount.addEventListener('touchcancel', () => gestureEnd(0, 0, true), {signal});
  doc.addEventListener('keydown', e => {
    doc.documentElement.dataset.keyboard = 'true';
    if (e.key === 'Escape') {
      e.preventDefault();
      if (sheet || locked || active) back(); else api.close();
    }
    if (locked && e.key === 'Tab') {
      const focusable = [...lockscreen.querySelectorAll('button')].filter(el => !el.disabled), first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, {signal});
  doc.addEventListener('pointerdown', () => delete doc.documentElement.dataset.keyboard, {signal});
  doc.addEventListener('visibilitychange', animate, {signal});
  media.addEventListener('change', theme, {signal});
  motion.addEventListener('change', animate, {signal});

  const unsubscribe = api.subscribe(event => {
    if (disposed) return;
    if (event.type === 'playback') {
      // A failed play (试听, a line, a voice message) says why right where the user is, not only on the lock screen.
      if (event.phase === 'error' && lastPhase !== 'error') notify(event.message || '播放失败', {error: true});
      lastPhase = event.phase;
      paintPlayback(event);
    }
    if (event.type === 'settings') { theme(); renderWidgets(); today?.paint(['cast', 'wallet']); animate(); wallMotion(); run(refreshAvatars); }
    if (event.type === 'phone') run(() => appearance(event.preferences));
    if (['chat', 'library', 'space'].includes(event.type)) todayLater();
    if (event.type === 'library') {
      const key = ({favorites: 'library', cache: 'library', photos: 'gallery', notes: 'notes'})[event.collection];
      if (active === key) run(() => views.get(key)?.refresh());
    }
    if (event.type === 'audio-ready') views.get('listen')?.onPlayback?.(api.status());
    if (event.type === 'draw') views.get('draw')?.onDraw?.(event);
    if (event.type === 'balance') run(() => views.get('engines')?.onBalance?.(event));
    if (event.type === 'chat') { run(() => views.get('chat')?.onChat?.(event)); countUnread(); if (event.incoming && !(active === 'chat' && views.get('chat')?.showing?.() === event.threadId)) notify(`${event.incoming.from}：${event.incoming.kind === 'text' ? event.incoming.text : '发来' + (event.incoming.count > 1 ? ` ${event.incoming.count} 条` : '一条') + '消息'}`.slice(0, 80)); }
    if (event.type === 'moments') { views.get('chat')?.onMoments?.(event); countMoments(); }
    if (event.type === 'call') calls.update(event.call);
    if (event.type === 'forum' || event.type === 'peek') { const app = event.type; if (active === app) run(() => views.get(app)?.refresh()); }
    // 分区: another card was opened in the tavern; the open app and the badges follow it.
    if (event.type === 'space') { if (active && views.get(active)?.refresh) run(() => views.get(active).refresh()); countUnread(); countMoments(); }
    if (event.type === 'sync') {
      views.get('settings')?.onSync?.();
      // Content from another device: say so once, when that sync is over.
      const r = event.lastResult;
      if (!event.busy && event.lastAt !== lastSyncAt && (r?.pulled?.length || r?.merged?.length)) notify(r.merged?.length ? '两台设备都有改动，已经合并好了' : '已读取别的设备的新内容');
      if (!event.busy) lastSyncAt = event.lastAt;
    }
    if (event.type === 'settings') run(() => views.get('chat')?.onChat?.({}));
  });

  // Unread chat messages, shown as a badge on the chat icon.
  // New 朋友圈 posts and comments by others since the user last opened it.
  function countMoments() {
    win.clearTimeout(freshTimer);
    freshTimer = win.setTimeout(() => run(async () => {
      const n = momentsNew(await api.listMoments(), momentsSeen(win));
      if (disposed || n === fresh) return;
      fresh = n;
      renderHome();
    }), 150);
  }
  function countUnread() {
    win.clearTimeout(unreadTimer);
    unreadTimer = win.setTimeout(() => run(async () => {
      const n = await api.chatUnread();
      if (disposed || n === unread) return;
      unread = n;
      renderHome();
    }), 120);
  }

  // ---------- Host hooks ----------
  const previousOpenRole = win.stTtsOpenRole, previousVisibility = win.stTtsPanelVisibility, previousOpenDraw = win.stTtsOpenDraw, previousOpenThread = win.stTtsOpenThread;
  win.stTtsOpenRole = id => open('roles', id);
  function takeDraw() {
    const request = api.takeDraw?.();
    if (!request) return false;
    open('draw');
    views.get('draw')?.load?.(request);
    return true;
  }
  win.stTtsOpenDraw = () => run(takeDraw);
  /** The chat a message card on the tavern page was double-tapped for (msg-island.js). */
  function takeThread() {
    const id = api.takeThread?.();
    if (!id) return false;
    open('chat');
    views.get('chat')?.openThread?.(id);
    return true;
  }
  win.stTtsOpenThread = () => run(takeThread);
  win.stTtsPanelVisibility = visible => {
    panelVisible = visible;
    if (visible) { callState(); run(refreshAvatars); floatingBar(); }
    if (!visible) sheet?.close(null);
    else if (takeDraw()) { /* opened from a chat picture */ }
    else if (takeThread()) { /* opened from a message card */ }
    else if (preferences?.lockOnOpen && !api.pendingRole()) lock();
    animate();
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    appearanceEpoch++;
    unsubscribe();
    controller.abort();
    sheet?.close(null);
    for (const v of views.values()) v.dispose();
    calls.dispose();
    for (const url of avatarURLs.values()) if (url) win.URL.revokeObjectURL(url);
    setAvatarPictures({});
    for (const url of assets.values()) win.URL.revokeObjectURL(url);
    assets.clear();
    win.clearInterval(clockTimer); win.clearTimeout(todayTimer);
    today?.dispose();
    win.clearTimeout(toastTimer);
    win.clearTimeout(openTimer);
    win.clearTimeout(unreadTimer); win.clearTimeout(freshTimer);
    win.cancelAnimationFrame(animation);
    win.stTtsOpenRole = previousOpenRole;
    win.stTtsPanelVisibility = previousVisibility;
    win.stTtsOpenDraw = previousOpenDraw;
    win.stTtsOpenThread = previousOpenThread;
  }
  win.addEventListener('pagehide', dispose, {signal});
  today = todayPage({doc, win, api, open, confirm, dialog, notify, signal, engineOf, appIcon, playback: () => playback, battery: () => batteryState(battery),
    openThread: (id, from) => { open('chat', undefined, from); views.get('chat')?.openThread?.(id); }});
  applyThemeMode();
  renderHome();
  run(() => today.refresh());
  const clockTimer = win.setInterval(clock, 15000);
  paintDevice();
  countUnread();
  countMoments();
  callState();
  run(refreshAvatars);
  floatingBar();
  paintPlayback(playback);

  const fallback = {wallpaper: {kind: 'builtin', key: 'sky'}, icons: {}, iconStyle: 'color', lockOnOpen: false, volume: api.getVolume(), theme: api.getState().theme};
  const ready = api.getPhone().then(async p => {
    if (disposed) return;
    preferences = p;
    theme();
    await appearance(p);
    if (disposed) return;
    const pending = api.pendingRole();
    if (pending) openPendingRole(pending);
    else if (takeDraw()) { /* opened from a chat picture */ }
    else if (p.lockOnOpen) lock();
  }).catch(error => {
    if (disposed) return;
    notify(error.message, {error: true});
    return appearance(fallback);
  });
  return {ready, open, home: showHome, back, lock, unlock, dispose, views, get active() { return active; }, get locked() { return locked; }};
}

if (typeof window !== 'undefined' && window.document.getElementById('root')) {
  try { window.stTtsPhone = createPhoneApp({window, api: connectBackend()}); }
  catch (error) {
    const el = window.document.querySelector('.startup');
    if (el) { el.textContent = error.message; el.setAttribute('role', 'alert'); }
  }
}

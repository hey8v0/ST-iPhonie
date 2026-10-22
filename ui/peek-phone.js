// 查手机: the character's own phone, held in the user's hands. A layer over the whole screen (like a call) with its own
// status bar, lock screen, home screen and apps: 消息 (their chats with other people), 相册, 备忘录, 浏览器 (what they
// searched for), 购物 (their cart), and 电话, 日历, 音乐, 天气, 时钟, 设置, 相机 (ui/peek-apps.js). Every app opens.
// Everything shown comes from one snapshot (core/peek.js) or from the owner's name and the day; nothing here talks to
// the model.
import {esc, avatarPicture} from './common.js';
import {peekApps} from './peek-apps.js';

const WEEK = '日一二三四五六';
const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// How long ago each chat last moved, newest first (minutes before the look).
const AGO = [2, 41, 186, 60 * 26, 60 * 52];
function stamp(at, minutes) {
  const d = new Date(at - minutes * 60000), now = new Date(at);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return days === 0 ? hhmm(d) : days === 1 ? '昨天' : days < 7 ? '星期' + WEEK[d.getDay()] : `${d.getMonth() + 1}/${d.getDate()}`;
}
const money = n => '¥' + (Number(n) || 0).toFixed(2);
const clipText = (text, n) => { const s = String(text || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// App icons drawn for this phone (60×60): not the user's phone's icons, so it reads as someone else's phone.
const petals = Array.from({length: 8}, (_, i) => `<ellipse cx="30" cy="17.5" rx="6.6" ry="11" fill="hsl(${i * 45} 86% 60%)" opacity=".82" transform="rotate(${i * 45} 30 30)"/>`).join('');
const GLYPH = {
  messages: '<path d="M30 13c-11.6 0-21 7.4-21 16.6 0 5.3 3.1 10 8 13l-1.6 6.6 8.3-4.5c2 .5 4.1.7 6.3.7 11.6 0 21-7.4 21-16.6S41.6 13 30 13z" fill="#fff"/>',
  photos: petals,
  notes: '<rect width="60" height="17" fill="#ffd43b"/><path d="M11 29h38M11 38h38M11 47h26" stroke="#cfcfcf" stroke-width="2.2" stroke-linecap="round"/>',
  browser: '<circle cx="30" cy="30" r="19.5" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M38.5 21.5 33.4 33.4 21.5 38.5 26.6 26.6z" fill="#fff"/><path d="M38.5 21.5 26.6 26.6l6.8 6.8z" fill="#ff3b30"/>',
  cart: '<path d="M11 15h6.5l5.5 22h20.5l5-15.5H20" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25.5" cy="44.5" r="3.4" fill="#fff"/><circle cx="41" cy="44.5" r="3.4" fill="#fff"/>',
  weather: '<circle cx="23" cy="24" r="9" fill="#ffd60a"/><path d="M22.5 45h20a8 8 0 0 0 .4-16 11 11 0 0 0-21 3.2 6.4 6.4 0 0 0 .6 12.8z" fill="#fff"/>',
  clock: '<circle cx="30" cy="30" r="20" fill="#fff"/><path d="M30 17.5V30l8 5" stroke="#111" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="30" cy="30" r="2" fill="#ff9500"/>',
  settings: '<circle cx="30" cy="30" r="14" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="4.6 3"/><circle cx="30" cy="30" r="8.5" fill="none" stroke="#fff" stroke-width="3.2"/>',
  music: '<path d="M25 41V19.5l17-4v21" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/><circle cx="20.5" cy="41" r="5.2" fill="#fff"/><circle cx="37.5" cy="36.5" r="5.2" fill="#fff"/>',
  phone: '<path d="M21.5 14.5c2.2 0 5.2 6.2 5.2 8.3s-3 3-3 4.3c1 4.2 7 10.2 11.2 11.2 1.3 0 2.2-3 4.3-3s8.3 3 8.3 5.2c0 3-3.4 7-7.4 7C28.7 47.5 14.5 33.3 14.5 21.9c0-4 4-7.4 7-7.4z" fill="#fff"/>',
  camera: '<rect x="11" y="20" width="38" height="26" rx="5.5" fill="#fff"/><path d="M22.5 20.5l3-5.5h9l3 5.5" fill="#fff"/><circle cx="30" cy="33" r="7.6" fill="#4a4a4a"/><circle cx="30" cy="33" r="4.6" fill="#8d8d8d"/>'
};
const APPS = {
  calendar: {label: '日历'}, photos: {label: '相册'}, notes: {label: '备忘录'}, weather: {label: '天气'},
  clock: {label: '时钟'}, browser: {label: '浏览器'}, cart: {label: '购物'}, settings: {label: '设置'},
  music: {label: '音乐'}, phone: {label: '电话'}, messages: {label: '消息'}, camera: {label: '相机'}
};
// Pages whose top is dark (the status bar and the home bar go white there).
const DARK = new Set(['lock', 'home', 'photo', 'camera', 'weather', 'clock']);
const GRID = ['calendar', 'photos', 'notes', 'weather', 'clock', 'cart', 'settings', 'music'], DOCK = ['phone', 'messages', 'browser', 'camera'];

// Small line icons of the phone's own chrome.
const UI = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14M5.5 12l6.5 6.5 6.5-6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 17 7 7M7 15V7h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/** A wallpaper made from the owner's name, for when there is no drawn one. */
function painted(name) {
  const h = hash(name) % 360, k = (h + 35) % 360, m = (h + 70) % 360;
  return `radial-gradient(120% 70% at 15% 10%, hsl(${h} 85% 82%), transparent 60%), radial-gradient(90% 60% at 90% 55%, hsl(${k} 75% 70% / .9), transparent 65%), radial-gradient(100% 60% at 20% 100%, hsl(${m} 60% 45%), transparent 70%), linear-gradient(170deg, hsl(${h} 60% 72%), hsl(${k} 55% 58%) 55%, hsl(${m} 50% 38%))`;
}
const tile = (index, text) => { const h = (hash(text) + index * 47) % 360; return `linear-gradient(135deg, hsl(${h} 70% 80%), hsl(${(h + 40) % 360} 62% 62%))`; };

/**
 * Opens the phone of snap.name over `host` (the phone's .screen). draw(index) draws a photo (index 'wallpaper': the
 * wallpaper) and resolves when done; photo(id) gives a drawn picture's URL; view(img) shows a picture large; play(song)
 * plays a song of theirs on the user's phone; close() is called when the user puts the phone down. Returns
 * {update(snap), back(), close()}.
 */
export function peekPhone(ctx, {host, snap, canDraw, draw, photo, view, play = () => {}, close}) {
  const doc = ctx.doc, layer = doc.createElement('div');
  layer.className = 'peek-phone';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', `${snap.name} 的手机`);
  // page: lock | home | messages | thread | photos | photo | notes | note | browser | cart | phone | calendar | music |
  // weather | clock | settings | camera
  let page = 'lock', item = -1, closed = false, enter = 'pp-anim-in';
  const battery = 18 + hash(snap.name + snap.at) % 80;
  const own = l => l.from === snap.name;
  const unread = c => { let n = 0; for (let i = c.lines.length - 1; i >= 0 && !own(c.lines[i]); i--) n++; return n; };
  const chats = () => snap.chats.map((c, i) => ({...c, index: i, when: stamp(snap.at, AGO[i] ?? 60 * 24 * (i + 1)), unread: unread(c)}));
  // People in this phone: their tavern picture when they have one, else a coloured square with their first letter.
  const face = (name, size) => {
    const picture = avatarPicture(name), h = hash(name) % 360;
    return `<span class="pp-avatar" style="--s:${size}px;background:${picture ? '#ddd' : `linear-gradient(135deg, hsl(${h} 62% 66%), hsl(${(h + 30) % 360} 58% 52%))`}">${picture ? `<img src="${esc(picture)}" alt="">` : esc([...String(name || '?').trim()][0] || '?')}</span>`;
  };

  function status(light) {
    const now = new Date();
    const bars = [5, 8, 11, 14].map((h, i) => `<rect x="${i * 4.5}" y="${14 - h}" width="3" height="${h}" rx="1" fill="currentColor"${i === 3 ? ' opacity=".35"' : ''}/>`).join('');
    return `<div class="pp-status${light ? ' light' : ''}"><span>${page === 'lock' ? '中国移动' : hhmm(now)}</span><span class="pp-icons">
      <svg viewBox="0 0 17 14" aria-hidden="true">${bars}</svg>
      <svg viewBox="0 0 18 14" aria-hidden="true"><path d="M9 12.6 6.6 10a3.4 3.4 0 0 1 4.8 0zM4.4 7.8a6.5 6.5 0 0 1 9.2 0l-1.6 1.6a4.2 4.2 0 0 0-6 0zM2 5.4a9.9 9.9 0 0 1 14 0l-1.6 1.6a7.6 7.6 0 0 0-10.8 0z" fill="currentColor"/></svg>
      <span class="pp-battery${battery <= 20 ? ' low' : ''}"><i style="width:${battery}%"></i></span><small>${battery}</small></span></div>`;
  }
  function icon(id, badge = 0) {
    const app = APPS[id], now = new Date();
    const art = id === 'calendar' ? `<span class="pp-cal"><small>星期${WEEK[now.getDay()]}</small><b>${now.getDate()}</b></span>` : `<svg viewBox="0 0 60 60" aria-hidden="true">${GLYPH[id]}</svg>`;
    return `<button type="button" class="pp-app-icon" data-pp="open" data-id="${id}" aria-label="${app.label}${badge ? `，${badge} 条未读` : ''}"><span class="pp-tile pp-t-${id}">${art}${badge ? `<em>${badge > 99 ? '99+' : badge}</em>` : ''}</span><span class="pp-label">${app.label}</span></button>`;
  }
  const bar = (title, back = '', right = '') => `<header class="pp-bar"><button type="button" class="pp-back" data-pp="back">${UI.back}<span>${esc(back)}</span></button><b>${title}</b><span class="pp-right">${right}</span></header>`;

  function lockPage() {
    const now = new Date(), notes = chats().filter(c => c.unread).slice(0, 3);
    return `<div class="pp-lock" data-pp="unlock">
      <div class="pp-lock-head">${UI.lock}<p class="pp-date">${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}</p><p class="pp-clock">${hhmm(now)}</p></div>
      <div class="pp-notices">${notes.map(c => `<button type="button" class="pp-notice" data-pp="notice" data-index="${c.index}"><span class="pp-notice-head"><span class="pp-tile pp-t-messages mini"><svg viewBox="0 0 60 60" aria-hidden="true">${GLYPH.messages}</svg></span>消息<small>${esc(c.when)}</small></span><b>${esc(c.with)}${c.unread > 1 ? ` <small>(${c.unread} 条)</small>` : ''}</b><span class="pp-notice-text">${esc(clipText(c.lines.at(-1).text, 60))}</span></button>`).join('')}</div>
      <div class="pp-lock-foot"><button type="button" class="pp-round" data-pp="put" aria-label="放下手机">${UI.down}</button><span>点一下解锁</span><button type="button" class="pp-round" data-pp="open" data-id="camera" aria-label="相机">${UI.camera}</button></div>
    </div>`;
  }
  function homePage() {
    const badge = chats().reduce((n, c) => n + c.unread, 0);
    // Two widgets on top, as on a phone someone uses: the album's first photo and the first note.
    const shot = album()[0], note = snap.notes[0];
    const widgets = (shot ? `<button type="button" class="pp-widget pp-w-photo" data-pp="open" data-id="photos" aria-label="相册">${picture(shot, 0)}<span>${esc(clipText(shot.text, 18))}</span></button>` : '')
      + (note ? `<button type="button" class="pp-widget pp-w-note" data-pp="note" data-index="0" aria-label="备忘录"><small>备忘录</small><b>${esc(noteTitle(note))}</b><span>${esc(clipText(note.title ? note.text : note.text.slice(noteTitle(note).length), 50))}</span></button>` : '');
    return `<div class="pp-home"><div class="pp-grid">${widgets}${GRID.map(id => icon(id)).join('')}</div>
      <div class="pp-dots" aria-hidden="true"><i class="on"></i><i></i></div>
      <div class="pp-dock">${DOCK.map(id => icon(id, id === 'messages' ? badge : 0)).join('')}</div></div>`;
  }
  function messagesPage() {
    const list = chats(), total = list.reduce((n, c) => n + c.unread, 0);
    return `<div class="pp-app pp-wechat">${bar(`消息${total ? `(${total})` : ''}`)}
      <div class="pp-body"><div class="pp-searchbox">${UI.search}搜索</div>
      ${list.length ? `<div class="pp-list">${list.map(c => `<button type="button" class="pp-chat-row" data-pp="thread" data-index="${c.index}"><span class="pp-face">${face(c.with, 46)}${c.unread ? `<em>${c.unread}</em>` : ''}</span><span class="pp-row-main"><span class="pp-row-top"><b>${esc(c.with)}</b><small>${esc(c.when)}</small></span><span class="pp-row-sub">${esc(clipText(c.lines.at(-1).text, 40))}</span></span></button>`).join('')}</div>` : '<p class="pp-empty">没有聊天</p>'}</div></div>`;
  }
  function threadPage() {
    const c = chats()[item];
    if (!c) { page = 'messages'; return messagesPage(); }
    return `<div class="pp-app pp-wechat pp-thread">${bar(esc(c.with), '', '')}
      <div class="pp-body"><p class="pp-chip">${esc(c.when)}</p>
      ${c.lines.map(l => `<div class="pp-msg${own(l) ? ' own' : ''}">${face(own(l) ? snap.name : l.from === 'me' ? '我' : l.from, 36)}<p>${esc(l.text)}</p></div>`).join('')}</div>
      <footer class="pp-input"><span>不能替 ${esc(snap.name)} 回消息</span></footer></div>`;
  }
  // The album: the photos, then the wallpaper. Index 'wallpaper' stands for the wallpaper.
  const album = () => [...snap.photos.map((p, i) => ({...p, key: i})), ...(snap.wallpaper ? [{...snap.wallpaper, key: 'wallpaper'}] : [])];
  function picture(p, i) {
    return p.photoId ? `<img data-photo="${esc(p.photoId)}" alt="${esc(p.text)}">` : `<span class="pp-blank" style="background:${tile(i, p.text)}">${UI.image}<em>${esc(clipText(p.text, 24))}</em></span>`;
  }
  function photosPage() {
    const list = album(), drawable = canDraw() && list.some(p => p.tags && !p.photoId && p.state !== 'waiting');
    return `<div class="pp-app pp-photos">${bar('相册', '', drawable ? '<button type="button" class="pp-link" data-pp="draw-all">全部画出来</button>' : '')}
      <div class="pp-body"><p class="pp-big">最近项目<small>${list.length} 张</small></p>
      ${list.length ? `<div class="pp-grid3">${list.map((p, i) => `<button type="button" class="pp-shot" data-pp="photo" data-index="${i}" aria-label="${esc(p.text)}">${picture(p, i)}${p.key === 'wallpaper' ? '<small>壁纸</small>' : ''}${p.state === 'waiting' ? '<i class="pp-wait"></i>' : ''}</button>`).join('')}</div>` : '<p class="pp-empty">相册里没有照片</p>'}</div></div>`;
  }
  function photoPage() {
    const list = album(), p = list[item];
    if (!p) { page = 'photos'; return photosPage(); }
    const action = !canDraw() || !p.tags || p.photoId ? '' : p.state === 'waiting' ? '<p class="pp-note">正在画……</p>'
      : `<button type="button" class="pp-pill" data-pp="draw" data-key="${p.key}">${esc(p.state === 'failed' ? (p.note || '没画出来') + ' · 重画' : '画出来')}</button>`;
    return `<div class="pp-app pp-viewer">${bar(p.key === 'wallpaper' ? '壁纸' : `${item + 1} / ${list.length}`, '相册')}
      <div class="pp-body">${p.photoId ? `<button type="button" class="pp-full" data-pp="zoom"><img data-photo="${esc(p.photoId)}" alt="${esc(p.text)}"></button>` : `<div class="pp-full pp-said" style="background:${tile(item, p.text)}"><p>${esc(p.text)}</p></div>`}
      ${p.photoId ? `<p class="pp-caption">${esc(p.text)}</p>` : ''}${action}</div></div>`;
  }
  const noteDay = i => stamp(snap.at, 60 * 24 * i + 90 + i * 37);
  const noteTitle = n => n.title || n.text.split(/\n/)[0].slice(0, 20);
  function notesPage() {
    return `<div class="pp-app pp-notes">${bar('', '文件夹')}<div class="pp-body"><p class="pp-big">备忘录<small>${snap.notes.length} 个备忘录</small></p>
      ${snap.notes.length ? `<div class="pp-group">${snap.notes.map((n, i) => `<button type="button" class="pp-note-row" data-pp="note" data-index="${i}"><b>${esc(noteTitle(n))}</b><span><small>${esc(noteDay(i))}</small>${esc(clipText(n.title ? n.text : n.text.slice(noteTitle(n).length), 30) || '没有其他文本')}</span></button>`).join('')}</div>` : '<p class="pp-empty">没有备忘录</p>'}</div></div>`;
  }
  function notePage() {
    const n = snap.notes[item];
    if (!n) { page = 'notes'; return notesPage(); }
    return `<div class="pp-app pp-notes pp-paper">${bar('', '备忘录')}<div class="pp-body"><p class="pp-when">${esc(noteDay(item))}</p>${n.title ? `<h3>${esc(n.title)}</h3>` : ''}<p class="pp-text">${esc(n.text)}</p></div></div>`;
  }
  function browserPage() {
    return `<div class="pp-app pp-browser">${bar('', '')}<div class="pp-body"><div class="pp-searchbox big">${UI.search}搜索或输入网址</div>
      <p class="pp-head">最近搜索</p>${snap.searches.length ? `<div class="pp-group">${snap.searches.map(q => `<div class="pp-search-row">${UI.history}<span>${esc(q)}</span>${UI.arrow}</div>`).join('')}</div>` : '<p class="pp-empty">没有搜索记录</p>'}</div></div>`;
  }
  function cartPage() {
    const total = snap.cart.reduce((n, x) => n + x.price, 0);
    return `<div class="pp-app pp-cart">${bar(`购物车(${snap.cart.length})`, '', '<span class="pp-link">管理</span>')}
      <div class="pp-body">${snap.cart.length ? snap.cart.map((x, i) => `<div class="pp-item"><span class="pp-radio on">${UI.check}</span><span class="pp-thumb" style="background:${tile(i, x.name)}">${esc([...x.name][0] || '?')}</span><span class="pp-item-main"><b>${esc(x.name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}<span class="pp-price">${money(x.price)}</span></span></div>`).join('') : '<p class="pp-empty">购物车是空的</p>'}</div>
      ${snap.cart.length ? `<footer class="pp-checkout"><span class="pp-radio on">${UI.check}</span>全选<span class="pp-sum">合计：<b>${money(total)}</b></span><button type="button" data-pp="shake">结算(${snap.cart.length})</button></footer>` : ''}</div>`;
  }
  const more = () => peekApps({snap, hash, stamp, bar, face, battery, album, picture});
  const PAGES = {lock: lockPage, home: homePage, messages: messagesPage, thread: threadPage, photos: photosPage, photo: photoPage, notes: notesPage, note: notePage, browser: browserPage, cart: cartPage,
    ...Object.fromEntries(['phone', 'calendar', 'music', 'weather', 'clock', 'settings', 'camera'].map(id => [id, () => more()[id]()]))};

  async function paint() {
    if (closed) return;
    const inner = PAGES[page](), dark = DARK.has(page);
    layer.dataset.page = page;
    layer.innerHTML = `<div class="pp-wall" aria-hidden="true"></div>${status(dark && page !== 'photo')}<div class="pp-page ${enter}">${inner}</div>${page === 'lock' ? '' : `<button type="button" class="pp-homebar${dark ? ' light' : ''}" data-pp="home" aria-label="${page === 'home' ? '锁屏' : '回到主屏幕'}"></button>`}`;
    enter = '';
    const wall = layer.querySelector('.pp-wall'), drawn = snap.wallpaper?.photoId;
    wall.style.background = painted(snap.name);
    const fill = async () => {
      if (drawn) { const url = await photo(drawn); if (url && !closed) wall.style.background = `center / cover no-repeat url("${url}")`; }
      for (const img of layer.querySelectorAll('img[data-photo]')) { const url = await photo(img.dataset.photo); if (closed) return; if (url) img.src = url; }
    };
    await fill();
  }
  // Pictures load after the page is drawn; a phone closed meanwhile (or a backend gone) just leaves them out.
  const repaint = () => { paint().catch(() => {}); };
  function go(next, index = -1, how = 'pp-anim-open') { page = next; item = index; enter = how; repaint(); layer.scrollTop = 0; }
  function shake(el) { el.classList.remove('pp-shake'); void el.offsetWidth; el.classList.add('pp-shake'); }
  function back() {
    if (closed) return false;
    const up = page === 'home' ? 'lock' : {thread: 'messages', photo: 'photos', note: 'notes'}[page] || (page === 'lock' ? '' : 'home');
    if (up) go(up, -1, up === 'lock' ? 'pp-anim-down' : 'pp-anim-back');
    else done();
    return true;
  }
  function done() { if (closed) return; closed = true; clearInterval(timer); layer.classList.add('pp-leave'); setTimeout(() => layer.remove(), 220); close(); }

  layer.addEventListener('click', async event => {
    const el = event.target.closest('[data-pp]');
    if (!el || !layer.contains(el)) return;
    event.preventDefault(); event.stopPropagation();
    const index = Number(el.dataset.index);
    switch (el.dataset.pp) {
      case 'unlock': go('home', -1, 'pp-anim-unlock'); break;
      case 'notice': go('thread', index, 'pp-anim-unlock'); break;
      case 'put': done(); break;
      case 'home': page === 'home' ? go('lock', -1, 'pp-anim-down') : go('home', -1, 'pp-anim-back'); break;
      case 'back': back(); break;
      case 'open': go(el.dataset.id); break;
      case 'shake': shake(el.querySelector('.pp-tile') || el); break;
      case 'thread': go('thread', index); break;
      case 'photo': go('photo', index); break;
      case 'note': go('note', index); break;
      case 'zoom': { const img = el.querySelector('img'); if (img?.src) view(img); break; }
      case 'draw': await draw([el.dataset.key === 'wallpaper' ? 'wallpaper' : Number(el.dataset.key)]); break;
      case 'draw-all': await draw(album().filter(p => p.tags && !p.photoId && p.state !== 'waiting').map(p => p.key)); break;
      case 'song': { const song = snap.songs?.[index]; if (song) play(song); break; }
      // The camera: a flash for the shutter, the view turned round for the other lens. Nothing is taken.
      case 'snap': { const finder = layer.querySelector('.pp-finder'); finder?.classList.remove('pp-flash'); void finder?.offsetWidth; finder?.classList.add('pp-flash'); break; }
      case 'flip': layer.querySelector('.pp-finder')?.classList.toggle('pp-selfie'); break;
    }
  });
  // The clock in the status bar keeps time while the phone is held.
  const timer = setInterval(() => { const el = layer.querySelector('.pp-status > span'), clock = layer.querySelector('.pp-clock'), now = hhmm(new Date()); if (page !== 'lock' && el) el.textContent = now; if (clock) clock.textContent = now; }, 15000);
  host.append(layer);
  repaint();
  return {
    update(next) { if (!next || closed) return; snap = next; repaint(); },
    back,
    close: done,
    get page() { return page; }
  };
}

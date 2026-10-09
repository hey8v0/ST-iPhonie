// 今天: the page left of the first home page, as on an iPhone. A search field for the apps on top, then the user's
// widgets (core/widgets.js), two small ones side by side, and 编辑 at the bottom. 编辑 (or a long press on a widget)
// makes them jiggle: − takes one away (after asking), ＋ opens the widget gallery (pick one, swipe through its sizes,
// 添加小组件 puts it on top), and dragging moves one, the others making room; 完成 or a tap on the background ends it.
// A tap on a widget opens its app, growing out of the widget (ui/carry.js launch). The phone (ui/phone.js) keeps the
// list in its preferences and calls refresh / paint / setList when what the widgets show changes.
import {esc, avatar, plate} from './common.js';
import {icon, wave} from './icons.js';
import {APPS} from './apps.js';
import {preview} from './chat.js';
import {nudge, moving} from './carry.js';
import {WIDGETS, SIZE_NAMES, normalizeWidgets, makeWidget} from '../core/widgets.js';
import {yuan} from '../core/wallet.js';

const KIND_ICONS = {calendar: 'calendar', clock: 'clock', playing: 'wave', chat: 'chat', cast: 'group', photo: 'image', notes: 'book', battery: 'battery', wallet: 'wallet'};
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const HOLD = 500;

/**
 * deps: {doc, win, api, open(app, roleId, from), openThread(id, from), confirm, dialog, appIcon(id), engineOf(name),
 * playback(), battery() → {level, charging, low}|null}.
 */
export function todayPage(deps) {
  const {doc, win, api, open, confirm, dialog} = deps;
  const root = doc.createElement('section');
  root.className = 'today-page';
  root.setAttribute('aria-label', '今天：小组件');
  root.innerHTML = `<div class="today-top"><button type="button" class="today-add" data-today="add" aria-label="添加小组件">${icon('add')}</button><label class="today-search">${icon('search')}<input type="search" data-today-search placeholder="搜索" aria-label="搜索 App" autocomplete="off" enterkeyhint="search"></label><button type="button" class="today-done" data-today="done">完成</button></div>
    <div class="today-results" hidden></div>
    <div class="today-grid"></div>
    <div class="today-foot"><button type="button" class="today-edit" data-today="edit">编辑</button></div>`;
  const grid = root.querySelector('.today-grid'), results = root.querySelector('.today-results'), search = root.querySelector('[data-today-search]');
  let list = normalizeWidgets(undefined), editing = false, drag = null, press = null, swallow = 0, ticket = 0, pending = false;
  const data = {threads: [], notes: [], photo: null, photoId: ''};

  // ---------- What each widget shows ----------
  const now = () => new Date();
  function calendarBody(size) {
    const d = now(), day = d.getDate();
    if (size === 's') return `<span class="tw-red">星期${WEEK[d.getDay()]}</span><b class="tw-day">${day}</b><small class="tw-dim">${d.getMonth() + 1}月 · ${d.getFullYear()}</small>`;
    const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay(), days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cells = [...Array(first).fill(''), ...Array.from({length: days}, (_, i) => i + 1)];
    return `<span class="tw-head"><b class="tw-red">${d.getMonth() + 1}月</b><small class="tw-dim">${d.getFullYear()}</small></span><div class="tw-month">${WEEK.map(w => `<i>${w}</i>`).join('')}${cells.map(n => `<span${n === day ? ' class="today"' : ''}>${n}</span>`).join('')}</div>`;
  }
  function face() {
    const d = now(), m = d.getMinutes(), h = d.getHours() % 12 + m / 60;
    const ticks = Array.from({length: 12}, (_, i) => `<line x1="50" y1="${i % 3 ? 9 : 7}" x2="50" y2="${i % 3 ? 13 : 16}" transform="rotate(${i * 30} 50 50)"/>`).join('');
    return `<svg class="tw-face" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"/><g class="ticks">${ticks}</g><line class="hand h" x1="50" y1="50" x2="50" y2="27" transform="rotate(${h * 30} 50 50)"/><line class="hand m" x1="50" y1="50" x2="50" y2="15" transform="rotate(${m * 6} 50 50)"/><circle class="pin" cx="50" cy="50" r="3.5"/></svg>`;
  }
  function clockBody(size) {
    if (size === 's') return face();
    const d = now();
    return `<div class="tw-row">${face()}<span class="tw-stack"><b class="tw-time">${d.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false})}</b><small class="tw-dim">${d.toLocaleDateString('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'})}</small></span></div>`;
  }
  function playingBody(size) {
    const p = deps.playback(), on = ['generating', 'playing', 'paused', 'waiting'].includes(p.phase) && p.speaker;
    const head = `<span class="tw-head"><span class="tw-eyebrow">正在播放</span>${on ? wave : ''}</span>`;
    if (!on) return head + `<span class="tw-line">还没有在播放</span>${size === 'm' ? '<small class="tw-dim">点聊天里的声波，或打开听取</small>' : ''}`;
    const said = p.line?.translation ? '“' + p.line.translation + '”' : p.message || '';
    return head + `<span class="tw-who">${avatar(p.speaker, deps.engineOf(p.speaker), size === 's' ? 26 : 30)}${size === 's' ? `<b>${esc(p.speaker)}</b>` : plate(p.speaker)}</span><span class="tw-line">${esc(said)}</span>`;
  }
  function threadRow(t) {
    const face = t.type === 'group' ? avatar(t.name, 'none', 32) : avatar(t.members?.[0] || t.name, deps.engineOf(t.members?.[0] || t.name), 32);
    return `<button type="button" class="tw-thread" data-thread="${esc(t.id)}">${face}<span><b>${esc(t.name)}</b><small>${esc(preview(t.last))}</small></span>${t.unread ? `<i class="tw-badge${t.muted ? ' muted' : ''}">${t.unread > 99 ? '99+' : t.unread}</i>` : ''}</button>`;
  }
  function chatBody(size) {
    const threads = data.threads, unread = threads.reduce((n, t) => n + (t.muted ? 0 : t.unread || 0), 0);
    if (size === 's') {
      const who = threads.filter(t => t.unread).slice(0, 3);
      return `<span class="tw-head"><span class="tw-eyebrow">消息</span></span><b class="tw-big">${unread}</b><small class="tw-dim">${unread ? '条未读' : threads.length ? '都看过了' : '还没有聊天'}</small>${who.length ? `<span class="tw-faces">${who.map(t => avatar(t.type === 'group' ? t.name : t.members?.[0] || t.name, 'none', 22)).join('')}</span>` : ''}`;
    }
    const rows = threads.slice(0, size === 'm' ? 2 : 5);
    return `<span class="tw-head"><span class="tw-eyebrow">消息</span>${unread ? `<small class="tw-dim">${unread} 条未读</small>` : ''}</span>${rows.length ? `<div class="tw-threads">${rows.map(threadRow).join('')}</div>` : '<span class="tw-line">还没有聊天</span><small class="tw-dim">点一下打开聊天，和角色说说话</small>'}`;
  }
  function castBody(size) {
    const routes = api.getState().routes.filter(r => r.name?.trim()).slice(0, size === 'm' ? 4 : 8);
    if (!routes.length) return '<span class="tw-head"><span class="tw-eyebrow">角色</span></span><span class="tw-line">还没有角色</span><small class="tw-dim">点一下去角色 App 新增</small>';
    return `<span class="tw-head"><span class="tw-eyebrow">角色</span></span><div class="tw-cast">${routes.map(r => `<button type="button" data-open-role="${esc(r.id)}" aria-label="打开 ${esc(r.name)} 的配音">${avatar(r.name, r.voice ? r.engine : 'none', size === 'm' ? 40 : 46)}<span>${esc(r.name)}</span></button>`).join('')}</div>`;
  }
  function photoBody() {
    if (!data.photo) return `<span class="tw-head"><span class="tw-eyebrow">相册</span></span><span class="tw-line">相册里还没有照片</span><small class="tw-dim">绘图 App 画的图会存进来</small>`;
    return `<img class="tw-photo" src="${esc(data.photo)}" alt="" draggable="false">`;
  }
  function notesBody(size) {
    const notes = data.notes;
    if (!notes.length) return '<span class="tw-head"><span class="tw-eyebrow">备忘录</span></span><span class="tw-line">还没有备忘录</span>';
    const title = n => n.title?.trim() || n.text?.trim().split('\n')[0] || '新备忘录';
    if (size === 's') return `<span class="tw-head"><span class="tw-eyebrow">备忘录</span></span><b class="tw-note">${esc(title(notes[0]))}</b><small class="tw-dim tw-clamp">${esc(notes[0].text || '')}</small>`;
    return `<span class="tw-head"><span class="tw-eyebrow">备忘录</span><small class="tw-dim">${notes.length} 条</small></span><div class="tw-notes">${notes.slice(0, 3).map(n => `<span><b>${esc(title(n))}</b><small>${esc(new Date(n.updatedAt || n.createdAt).toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'}))}</small></span>`).join('')}</div>`;
  }
  function batteryBody(size) {
    const b = deps.battery();
    const ring = b ? `<svg class="tw-ring${b.low ? ' low' : ''}${b.charging ? ' charging' : ''}" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"/><circle class="fill" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${b.level} 100"/></svg>` : `<span class="tw-ring none">${icon('battery')}</span>`;
    const text = b ? `${b.level}%` : '—', say = b ? (b.charging ? '正在充电' : b.low ? '电量低' : '这台设备') : '这个浏览器不提供电量';
    if (size === 's') return `<span class="tw-head"><span class="tw-eyebrow">电池</span></span><span class="tw-ringbox">${ring}<b>${text}</b></span><small class="tw-dim">${say}</small>`;
    return `<span class="tw-head"><span class="tw-eyebrow">电池</span></span><div class="tw-row">${ring}<span class="tw-stack"><b class="tw-time">${text}</b><small class="tw-dim">${say}</small></span></div>`;
  }
  function walletBody() {
    const w = api.wallet?.();
    return `<span class="tw-head"><span class="tw-eyebrow">零钱</span>${icon('wallet')}</span><b class="tw-big">¥${w ? esc(yuan(w.balance)) : '—'}</b><small class="tw-dim">聊天 App 钱包</small>`;
  }
  const BODIES = {calendar: calendarBody, clock: clockBody, playing: playingBody, chat: chatBody, cast: castBody, photo: photoBody, notes: notesBody, battery: batteryBody, wallet: walletBody};
  const body = w => { try { return BODIES[w.kind](w.size); } catch { return `<span class="tw-line">${esc(WIDGETS[w.kind].name)}</span>`; } };
  const widgetHTML = w => `<div class="tw" data-id="${esc(w.id)}" data-kind="${w.kind}" data-size="${w.size}" role="button" tabindex="0" aria-label="${esc(WIDGETS[w.kind].name)}小组件"><div class="tw-body">${body(w)}</div><button type="button" class="tw-remove" data-today="remove" aria-label="移除「${esc(WIDGETS[w.kind].name)}」">−</button></div>`;

  // ---------- Drawing ----------
  function render() {
    if (drag) { pending = true; return; }
    grid.innerHTML = list.map(widgetHTML).join('');
    root.querySelector('.today-foot').hidden = editing;
    if (!list.length) grid.innerHTML = `<p class="today-empty">${editing ? '点左上角的 ＋ 添加小组件' : '还没有小组件，点下面的「编辑」添加'}</p>`;
  }
  /** Only these kinds again (the clock each minute, the player each line), in place. */
  function paint(kinds) {
    if (drag) { pending = true; return; }
    for (const el of grid.querySelectorAll('.tw')) {
      const w = list.find(x => x.id === el.dataset.id);
      if (w && (!kinds || kinds.includes(w.kind))) el.querySelector('.tw-body').innerHTML = body(w);
    }
  }
  const has = kind => list.some(w => w.kind === kind);
  /** What the chat, notes and photo widgets show, read again. */
  async function refresh() {
    const mine = ++ticket;
    const safe = p => Promise.resolve().then(p).catch(() => null);
    const [threads, notes, photos] = await Promise.all([has('chat') ? safe(() => api.listThreads()) : null, has('notes') ? safe(() => api.listNotes()) : null, has('photo') ? safe(() => api.listPhotos()) : null]);
    if (mine !== ticket) return;
    if (threads) data.threads = [...threads].sort((a, b) => (b.pinned - a.pinned) || ((b.last?.at || b.updatedAt || 0) - (a.last?.at || a.updatedAt || 0)));
    if (notes) data.notes = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (photos) {
      // 精选照片: one of the album, another each hour.
      const rows = [...photos].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), pick = rows.length ? rows[Math.floor(Date.now() / 3.6e6) % rows.length].id : '';
      if (pick !== data.photoId) {
        const photo = pick ? await safe(() => api.getPhoto(pick)) : null;
        if (mine !== ticket) return;
        if (data.photo) win.URL.revokeObjectURL(data.photo);
        data.photoId = pick; data.photo = photo?.blob ? win.URL.createObjectURL(photo.blob) : null;
      }
    }
    paint(['chat', 'notes', 'photo']);
  }
  function setList(next) {
    const clean = normalizeWidgets(next);
    if (JSON.stringify(clean) === JSON.stringify(list)) return;
    list = clean;
    render();
    refresh();
  }
  function save() { return Promise.resolve(api.savePhone({widgets: list})).catch(error => deps.notify?.(error.message, {error: true})); }

  // ---------- Editing ----------
  function edit(on) {
    if (editing === on) return;
    editing = on;
    root.toggleAttribute('data-editing', on);
    if (on) { search.value = ''; searchFor(''); }
    render();
  }
  /** FLIP: whatever moved since `before` (rects by element) slides from there. */
  function settle(before, skip = null) {
    for (const [el, r] of before) {
      if (el === skip || !el.isConnected) continue;
      const n = el.getBoundingClientRect(), dx = r.left - n.left, dy = r.top - n.top;
      if (dx || dy) nudge(win, el, [{transform: `translate(${dx}px,${dy}px)`}, {transform: 'none'}], {duration: 300, easing: 'soft'});
    }
  }
  const rects = () => new Map([...grid.querySelectorAll('.tw')].map(el => [el, el.getBoundingClientRect()]));
  async function remove(el) {
    const w = list.find(x => x.id === el.dataset.id);
    if (!w || !await confirm(`移除「${WIDGETS[w.kind].name}」小组件？`, '移除后，可以从左上角的 ＋ 再加回来。')) return;
    const gone = nudge(win, el, [{transform: 'scale(1)', opacity: 1}, {transform: 'scale(.6)', opacity: 0}], {duration: 180, easing: 'out', fill: 'forwards'});
    if (gone) await gone.finished.catch(() => {});
    const before = rects();
    list = list.filter(x => x.id !== w.id);
    el.remove();
    if (!list.length) render();
    settle(before);
    save();
  }
  /** The gallery: every widget, then one of them with its sizes and 添加小组件. */
  function gallery() {
    const d = dialog('添加小组件', '');
    const showAll = () => {
      d.body.innerHTML = `<div class="pick-list">${Object.entries(WIDGETS).map(([kind, m]) => `<button type="button" class="list-row" data-pick="${kind}"><span class="tw-mini" data-kind="${kind}">${icon(KIND_ICONS[kind])}</span><span><strong>${esc(m.name)}</strong><small>${esc(m.about)}</small></span>${icon('next')}</button>`).join('')}</div>`;
    };
    const showOne = (kind, size) => {
      const m = WIDGETS[kind];
      d.body.innerHTML = `<button type="button" class="text-button tw-back" data-pick-back>${icon('back')}全部小组件</button><h3 class="tw-gallery-name">${esc(m.name)}</h3><p class="help-copy">${esc(m.about)}</p>
        <div class="tw-preview" data-size="${size}"><div class="today-grid">${widgetHTML({id: 'preview', kind, size})}</div></div>
        ${m.sizes.length > 1 ? `<div class="tw-sizes" role="radiogroup" aria-label="大小">${m.sizes.map(s => `<button type="button" role="radio" data-pick-size="${s}" aria-checked="${s === size}">${SIZE_NAMES[s]}</button>`).join('')}</div>` : ''}
        <div class="actions"><button type="button" class="primary" data-pick-add="${kind}" data-size="${size}">${icon('add')}添加小组件</button></div>`;
    };
    showAll();
    let current = null, x0 = null;
    d.body.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pick) { current = b.dataset.pick; showOne(current, WIDGETS[current].sizes[0]); }
      else if (b.hasAttribute('data-pick-back')) { current = null; showAll(); }
      else if (b.dataset.pickSize) showOne(current, b.dataset.pickSize);
      else if (b.dataset.pickAdd) {
        const w = makeWidget(b.dataset.pickAdd, b.dataset.size, list);
        d.close();
        list = [w, ...list];
        edit(true); render(); refresh(); save();
        root.scrollTo?.({top: 0, behavior: 'smooth'});
        const el = grid.querySelector(`.tw[data-id="${w.id}"]`);
        nudge(win, el, [{transform: 'scale(.5)', opacity: 0}, {transform: 'scale(1)', opacity: 1}], {duration: 420, easing: 'bounce'});
      }
    });
    // Swiping the preview sideways changes its size, as in the iPhone's gallery.
    d.body.addEventListener('pointerdown', e => { x0 = e.target.closest('.tw-preview') ? e.clientX : null; });
    d.body.addEventListener('pointerup', e => {
      if (x0 === null || !current) return;
      const dx = e.clientX - x0, sizes = WIDGETS[current].sizes, at = sizes.indexOf(d.body.querySelector('.tw-preview')?.dataset.size);
      x0 = null;
      if (Math.abs(dx) < 40 || at < 0) return;
      const next = sizes[Math.min(sizes.length - 1, Math.max(0, at + (dx < 0 ? 1 : -1)))];
      if (next !== sizes[at]) showOne(current, next);
    });
  }

  // ---------- Search ----------
  function searchFor(q) {
    q = q.trim().toLowerCase();
    results.hidden = !q;
    grid.hidden = !!q;
    root.querySelector('.today-foot').hidden = !!q || editing;
    if (!q) { results.innerHTML = ''; return; }
    const found = Object.keys(APPS).filter(id => APPS[id].name.toLowerCase().includes(q) || id.includes(q));
    results.innerHTML = found.length ? `<div class="apps-grid">${found.map(deps.appIcon).join('')}</div>` : `<p class="today-empty">没有找到「${esc(q)}」</p>`;
  }
  search.addEventListener('input', () => searchFor(search.value));

  // ---------- Taps, long presses and drags ----------
  root.addEventListener('click', e => {
    if (Date.now() - swallow < 400) { e.preventDefault(); e.stopPropagation(); return; }
    const b = e.target.closest('button'), tw = e.target.closest('.tw');
    if (b?.dataset.today === 'edit') return edit(true);
    if (b?.dataset.today === 'done') return edit(false);
    if (b?.dataset.today === 'add') return gallery();
    if (b?.dataset.today === 'remove') { e.stopPropagation(); return remove(b.closest('.tw')); }
    if (editing) {
      // A tap on the background ends editing, as on the phone.
      if (!tw && !b) edit(false);
      if (tw) e.stopPropagation();
      return;
    }
    if (!tw) return;
    const thread = e.target.closest('[data-thread]');
    if (thread) { e.stopPropagation(); deps.openThread(thread.dataset.thread, thread.querySelector('.avatar') || thread); return; }
    // Buttons inside (a role in 角色) are the phone's to handle.
    if (b) return;
    const app = WIDGETS[tw.dataset.kind]?.app;
    if (app) open(app, undefined, tw);
    else nudge(win, tw, [{transform: 'scale(1)'}, {transform: 'scale(.96)'}, {transform: 'scale(1)'}], {duration: 260, easing: 'bounce'});
  }, true);
  root.addEventListener('keydown', e => {
    const tw = e.target.closest?.('.tw');
    if (tw && e.target === tw && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tw.click(); }
  });
  grid.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('.tw-remove')) return;
    const tw = e.target.closest('.tw');
    if (!tw) return;
    if (editing) { drag = {el: tw, id: e.pointerId, x0: e.clientX, y0: e.clientY, live: false}; return; }
    // Held still: editing starts, as on the phone, and the same finger can go on to move the widget.
    win.clearTimeout(press?.timer);
    const id = tw.dataset.id, pointer = e.pointerId, x = e.clientX, y = e.clientY;
    press = {x, y, timer: win.setTimeout(() => {
      press = null; swallow = Date.now() + 200; edit(true);
      const el = grid.querySelector(`.tw[data-id="${id}"]`);
      if (el) drag = {el, id: pointer, x0: x, y0: y, live: false};
    }, HOLD)};
  });
  const cancelPress = () => { if (press) { win.clearTimeout(press.timer); press = null; } };
  function lift(e) {
    const el = drag.el, r = el.getBoundingClientRect();
    drag.live = true;
    drag.grab = {x: drag.x0 - r.left, y: drag.y0 - r.top};
    el.classList.add('tw-lifted');
    try { el.setPointerCapture?.(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
  }
  function follow(x, y) {
    const el = drag.el, g = grid.getBoundingClientRect();
    // Over another widget: this one takes its place and the rest make room.
    const hit = [...grid.querySelectorAll('.tw')].find(o => { if (o === el) return false; const r = o.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    if (hit && hit !== drag.over) {
      const before = rects(), all = [...grid.children], after = all.indexOf(hit) > all.indexOf(el);
      grid.insertBefore(el, after ? hit.nextSibling : hit);
      settle(before, el);
    }
    drag.over = hit || null;
    el.style.transform = `translate(${x - g.left - drag.grab.x - el.offsetLeft}px,${y - g.top - drag.grab.y - el.offsetTop}px) scale(1.05)`;
  }
  function drop() {
    const d = drag;
    drag = null;
    if (!d?.live) return;
    swallow = Date.now();
    const el = d.el, from = el.style.transform;
    el.style.transform = '';
    el.classList.remove('tw-lifted');
    nudge(win, el, [{transform: from}, {transform: 'none'}], {duration: 320, easing: 'soft'});
    const order = [...grid.querySelectorAll('.tw')].map(t => t.dataset.id);
    const next = order.map(id => list.find(w => w.id === id)).filter(Boolean);
    if (next.map(w => w.id).join() !== list.map(w => w.id).join()) { list = next; save(); }
    if (pending) { pending = false; paint(); }
  }
  const signal = deps.signal;
  win.addEventListener('pointermove', e => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.live) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; lift(e); }
    e.preventDefault();
    follow(e.clientX, e.clientY);
  }, {signal, passive: false});
  win.addEventListener('pointerup', () => { cancelPress(); drop(); }, {signal});
  win.addEventListener('pointercancel', () => { cancelPress(); drop(); }, {signal});

  render();
  return {
    root, setList, refresh, paint, edit,
    get editing() { return editing; },
    /** Leaving the page: editing and a search end. */
    leave() { edit(false); if (search.value) { search.value = ''; searchFor(''); } },
    dispose() { cancelPress(); if (data.photo) win.URL.revokeObjectURL(data.photo); },
    moving: () => moving(win),
  };
}

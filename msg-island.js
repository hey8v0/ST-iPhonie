// 消息小窗 on the tavern page: a character texted (主动发消息, or any message the phone was told of with `incoming`)
// while the phone is put away — a dynamic-island card drops in with the chat's latest messages and a box to answer:
// words typed are sent, the empty box's bubble asks for a reply, as in the chat app. A double tap opens the phone on
// that chat; × puts the card away until the next message. Dragged by its top (the place is remembered). It wears the
// call island's look (style.css .sttts-call-island).

const KEY = 'sttts.msgIsland';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
const ASK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 5h16v11H11l-5 4v-4H4zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>';
const KINDS = {photo: '[图片]', sticker: '[表情包]', redpacket: '[红包]', transfer: '[转账]', gift: '[礼物]', location: '[位置]', call: '[通话]', pat: '[拍一拍]', dice: '[骰子]'};
/** A message as one line of text. */
export function messageText(m) {
  if (!m) return '';
  if (m.kind === 'text') return m.text || '';
  if (m.kind === 'voice') return '[语音] ' + (m.translation || m.text || '');
  if (m.kind === 'notice' || m.kind === 'system') return '';
  return [KINDS[m.kind] || '[消息]', m.text || m.gift?.name || ''].filter(Boolean).join(' ');
}

/**
 * doc: the tavern page. load(threadId) → the thread ({id, name, members, messages}) or null. phoneOpen(): whether the
 * phone is showing. openChat(threadId): the phone on that chat. send(threadId, text), ask(threadId): as in the chat
 * app. read(threadId): marks it read (the user saw it here). avatar(name): a picture URL or ''.
 * Returns {show(threadId), refresh(), typing(threadId, on), changed(threadId), dispose()}.
 */
export function createMessageIsland({doc = document, load, phoneOpen, openChat, send, ask, read = () => {}, avatar = () => ''}) {
  const win = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'sttts-call-island sttts-msg-island';
  el.dataset.kind = 'talking';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  doc.body.append(el);
  let threadId = null, thread = null, typed = '', busy = false, typingNow = false, place = null, drawnFor = '', listHTML = '', ticket = 0;
  try { place = JSON.parse(win.localStorage.getItem(KEY) || 'null'); } catch { /* the top middle */ }

  function where() {
    if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.y)) { el.style.left = '50%'; el.style.top = 'max(10px, env(safe-area-inset-top))'; el.style.transform = 'translateX(-50%)'; el.style.setProperty('--ci-from', 'translateX(-50%)'); return; }
    const w = el.offsetWidth || 320, vw = win.innerWidth, vh = win.innerHeight;
    el.style.transform = 'none'; el.style.setProperty('--ci-from', 'translate(0,0)');
    el.style.left = Math.min(vw - w - 6, Math.max(6, place.x * vw)) + 'px';
    el.style.top = Math.min(vh - 126, Math.max(6, place.y * vh)) + 'px';
  }
  const who = () => thread?.type === 'group' ? thread.name : thread?.members?.[0] || thread?.name || '';
  function build() {
    if (drawnFor === threadId) return;
    drawnFor = threadId;
    const name = who(), pic = avatar(name);
    el.innerHTML = `<div class="ci-head" title="拖动移动；双击打开小手机"><span class="ci-av">${pic ? `<img src="${esc(pic)}" alt="">` : esc(String(name || '?').slice(0, 1))}</span>
        <span class="ci-text"><b>${esc(thread?.name || name)}</b><small data-mi-status></small></span>
        <button type="button" class="ci-end ci-close" data-mi="close" aria-label="收起">${CLOSE}</button></div>
      <div class="ci-lines" data-mi-lines aria-live="polite"></div>
      <form class="ci-say" data-mi-form><input data-mi-input maxlength="1000" autocomplete="off" enterkeyhint="send" placeholder="回复……" aria-label="回复 ${esc(thread?.name || name)}"><button type="submit" class="ci-send" data-mi="send"></button></form>`;
    listHTML = '';
    const input = el.querySelector('[data-mi-input]');
    input.value = typed;
    input.addEventListener('input', () => { typed = input.value; sendButton(); });
  }
  function sendButton() {
    const b = el.querySelector('.ci-send');
    if (!b) return;
    const asking = !typed.trim();
    b.innerHTML = asking ? ASK : SEND;
    b.classList.toggle('ask', asking);
    b.setAttribute('aria-label', asking ? `让${who()}回消息` : '发送');
    b.disabled = asking && (busy || typingNow);
  }
  function draw() {
    if (!thread) return;
    build();
    el.querySelector('[data-mi-status]').textContent = typingNow ? '正在输入…' : '新消息 · 双击打开小手机';
    const box = el.querySelector('[data-mi-lines]');
    const html = thread.messages.filter(m => messageText(m)).slice(-12).map(m => m.from === 'me'
      ? `<p class="me">${esc(messageText(m))}</p>`
      : `<p>${thread.type === 'group' ? `<b class="mi-from">${esc(m.from)}</b> ` : ''}${esc(messageText(m))}</p>`).join('');
    if (html !== listHTML) {
      const near = !listHTML || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      box.innerHTML = html; listHTML = html;
      if (near) box.scrollTop = box.scrollHeight;
    }
    sendButton();
  }
  async function reload() {
    if (!threadId) return;
    const mine = ++ticket, next = await Promise.resolve(load(threadId)).catch(() => null);
    if (mine !== ticket || !threadId) return;
    if (!next) { hide(); return; }
    thread = next;
    draw();
  }
  function hide() {
    el.hidden = true; threadId = null; thread = null; drawnFor = ''; typed = ''; typingNow = false;
  }
  /** A message came in: the card for that chat (another chat's message takes its place). */
  async function show(id) {
    if (phoneOpen()) return;
    if (threadId !== id) { threadId = id; thread = null; drawnFor = ''; typed = ''; typingNow = false; }
    await reload();
    if (!thread || phoneOpen()) return;
    if (el.hidden) {
      el.hidden = false; where();
      const box = el.querySelector('[data-mi-lines]');
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  // Dragging by the top moves it; a double tap opens the phone on the chat; × puts it away.
  let drag = null, lastTap = null;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || !e.target.closest('.ci-head') || e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    drag = {id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, live: false};
    try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.live && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.live = true; el.dataset.dragging = '';
    place = {x: (e.clientX - drag.dx) / win.innerWidth, y: (e.clientY - drag.dy) / win.innerHeight};
    where();
  });
  el.addEventListener('pointerup', e => {
    const dragged = drag?.live;
    if (drag && e.pointerId === drag.id) { drag = null; delete el.dataset.dragging; if (dragged) { lastTap = null; try { win.localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* this visit only */ } } }
    if (dragged || e.target.closest('button, input, form')) return;
    const now = Date.now();
    if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      const id = threadId;
      hide();
      if (id) openChat(id);
      return;
    }
    lastTap = {t: now, x: e.clientX, y: e.clientY};
  });
  el.addEventListener('pointercancel', () => { drag = null; delete el.dataset.dragging; });
  el.addEventListener('dblclick', e => { if (!e.target.closest('button, input, form')) e.preventDefault(); });
  el.addEventListener('click', e => { if (e.target.closest('[data-mi=close]')) { if (threadId) Promise.resolve(read(threadId)).catch(() => {}); hide(); } });
  el.addEventListener('submit', async e => {
    e.preventDefault();
    if (!threadId || busy) return;
    const id = threadId, input = el.querySelector('[data-mi-input]'), words = input?.value.trim();
    busy = true; sendButton();
    try {
      if (words) { input.value = ''; typed = ''; await send(id, words); }
      else if (!typingNow) await ask(id);
      await read(id);
    } catch { /* the phone shows what went wrong when it is opened */ }
    finally { busy = false; sendButton(); reload(); }
  });
  el.addEventListener('keydown', e => { if (e.target.closest('input')) e.stopPropagation(); });
  const onResize = () => { if (!el.hidden) where(); };
  win.addEventListener('resize', onResize);

  return {
    show,
    /** The phone was taken out: the card goes (the chat is there). */
    refresh() { if (phoneOpen() && !el.hidden) hide(); },
    /** The contact started or stopped typing in a chat. */
    typing(id, on) { if (id === threadId) { typingNow = !!on; draw(); if (!on) reload(); } },
    /** Something in a chat changed: the card follows if it is that chat. */
    changed(id) { if (id === threadId && !el.hidden) reload(); },
    get shown() { return !el.hidden; },
    get threadId() { return threadId; },
    dispose() { win.removeEventListener('resize', onResize); el.remove(); },
  };
}

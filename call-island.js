// 通话小窗 on the tavern page: while a call goes on and the phone is put away, a dynamic-island pill floats over the
// story — who, how long, whether they are talking or thinking, their last words — so the user can read the story while
// waiting for an answer. Drag it anywhere (the place is remembered); a tap opens the phone back on the call; the red
// button hangs up (or declines).

const KEY = 'sttts.callIsland';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * doc: the tavern page. status(): the call now (callHost.status) or null. phoneOpen(): whether the phone is showing.
 * open(): shows the phone. hangup(call): ends (or declines) it. avatar(name): a picture URL or ''.
 * Returns {refresh(call?), dispose()}.
 */
export function createCallIsland({doc = document, status, phoneOpen, open, hangup, avatar = () => ''}) {
  const win = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'sttts-call-island';
  el.hidden = true;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  doc.body.append(el);
  let call = null, timer = 0, drawn = '', place = null;
  try { place = JSON.parse(win.localStorage.getItem(KEY) || 'null'); } catch { /* the top middle */ }

  function where() {
    if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.y)) { el.style.left = '50%'; el.style.top = 'max(10px, env(safe-area-inset-top))'; el.style.transform = 'translateX(-50%)'; el.style.setProperty('--ci-from', 'translateX(-50%)'); return; }
    const w = el.offsetWidth || 240, h = el.offsetHeight || 52, vw = win.innerWidth, vh = win.innerHeight;
    el.style.transform = 'none';
    el.style.setProperty('--ci-from', 'translate(0,0)');
    el.style.left = Math.min(vw - w - 6, Math.max(6, place.x * vw)) + 'px';
    el.style.top = Math.min(vh - h - 6, Math.max(6, place.y * vh)) + 'px';
  }
  function state(c) {
    if (c.state === 'ringing') return c.dir === 'in' ? '来电' : '呼叫中…';
    if (c.error) return '没有回应';
    if (c.thinking) return '在想……';
    if (c.speaking) return '正在说';
    return c.lines?.at(-1)?.from === 'me' ? '等你让 TA 回话' : '轮到你了';
  }
  function draw() {
    const c = call;
    const time = c.state === 'talking' && c.answeredAt ? clock((Date.now() - c.answeredAt) / 1000) : '';
    const last = [...(c.lines || [])].reverse().find(l => l.from !== 'me'), pic = avatar(c.name);
    const html = `<span class="ci-av">${pic ? `<img src="${esc(pic)}" alt="">` : esc(String(c.name || '?').slice(0, 1))}</span>
      <span class="ci-text"><b>${esc(c.name)}</b><small><span data-ci-time>${time}</span>${time ? ' · ' : ''}${esc(state(c))}</small>${last ? `<em>${esc(last.translation || last.text)}</em>` : ''}</span>
      <span class="ci-wave${c.speaking ? ' on' : ''}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <button type="button" class="ci-end" aria-label="${c.state === 'ringing' && c.dir === 'in' ? '拒绝' : '挂断'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg></button>`;
    if (html !== drawn) { el.innerHTML = html; drawn = html; }
    el.setAttribute('aria-label', `和${c.name}通话中，${state(c)}。点一下回到通话`);
  }
  /** The call changed (or the phone was put away / taken out): shown only while there is a call and the phone is away. */
  function refresh(next = undefined) {
    if (next !== undefined) call = next && next.state !== 'ended' ? next : null;
    else { try { const c = status(); call = c && c.state !== 'ended' ? c : null; } catch { call = null; } }
    const show = !!call && !phoneOpen();
    if (!show) { if (!el.hidden) { el.hidden = true; win.clearInterval(timer); timer = 0; } return; }
    draw();
    if (el.hidden) { el.hidden = false; where(); }
    if (!timer) timer = win.setInterval(() => { const t = el.querySelector('[data-ci-time]'); if (call?.answeredAt && t) t.textContent = clock((Date.now() - call.answeredAt) / 1000); }, 1000);
  }

  // Dragging moves it; a tap (no drag) opens the phone; the red button hangs up.
  let drag = null, moved = 0;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('.ci-end')) return;
    const r = el.getBoundingClientRect();
    drag = {id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, live: false};
    try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.live && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.live = true;
    el.dataset.dragging = '';
    const vw = win.innerWidth, vh = win.innerHeight;
    place = {x: (e.clientX - drag.dx) / vw, y: (e.clientY - drag.dy) / vh};
    where();
  });
  const drop = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag.live;
    drag = null;
    delete el.dataset.dragging;
    if (was) { moved = Date.now(); try { win.localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* this visit only */ } }
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
  el.addEventListener('click', e => {
    if (Date.now() - moved < 300) return;
    if (e.target.closest('.ci-end')) { const c = call; if (c) Promise.resolve().then(() => hangup(c)).catch(() => {}); return; }
    open();
  });
  el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); open(); } });
  const onResize = () => { if (!el.hidden) where(); };
  win.addEventListener('resize', onResize);

  return {
    refresh,
    get shown() { return !el.hidden; },
    dispose() { win.clearInterval(timer); win.removeEventListener('resize', onResize); el.remove(); },
  };
}

// 通话小窗 on the tavern page: while a call goes on and the phone is put away, a dynamic-island card floats over the
// story, so the user can read the story and still talk: who, how long, whether they are talking or thinking, the lines
// so far (scrolling, each with its wave state as in the phone), and a box to answer from — words typed are said, the
// empty box's bubble asks for an answer, as in the phone. Drag it by its top (the place is remembered); a double tap
// opens the phone on the call; the red button hangs up (or declines).

const KEY = 'sttts.callIsland';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
const ASK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 5h16v11H11l-5 4v-4H4zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/></svg>';

/**
 * doc: the tavern page. status(): the call now (callHost.status) or null. phoneOpen(): whether the phone is showing.
 * open(): shows the phone. hangup(call): ends (or declines) it. say(text) / reply(): as in the phone's call screen.
 * avatar(name): a picture URL or ''. Returns {refresh(call?), dispose()}.
 */
export function createCallIsland({doc = document, status, phoneOpen, open, hangup, say = async () => {}, reply = async () => {}, avatar = () => ''}) {
  const win = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'sttts-call-island';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  doc.body.append(el);
  let call = null, timer = 0, built = '', place = null, typed = '', linesHTML = '';
  try { place = JSON.parse(win.localStorage.getItem(KEY) || 'null'); } catch { /* the top middle */ }

  function where() {
    if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.y)) {
      el.style.left = '50%'; el.style.top = 'max(10px, env(safe-area-inset-top))'; el.style.transform = 'translateX(-50%)'; el.style.setProperty('--ci-from', 'translateX(-50%)');
      return;
    }
    const w = el.offsetWidth || 300, h = el.offsetHeight || 60, vw = win.innerWidth, vh = win.innerHeight;
    el.style.transform = 'none';
    el.style.setProperty('--ci-from', 'translate(0,0)');
    el.style.left = Math.min(vw - w - 6, Math.max(6, place.x * vw)) + 'px';
    el.style.top = Math.min(vh - Math.min(h, 120) - 6, Math.max(6, place.y * vh)) + 'px';
  }
  function state(c) {
    if (c.state === 'ringing') return c.dir === 'in' ? '来电' : '呼叫中…';
    if (c.error) return '没有回应';
    if (c.thinking) return '在想……';
    if (c.speaking) return '正在说';
    return c.lines?.at(-1)?.from === 'me' ? '说完了点气泡，TA 才会回' : '轮到你了';
  }
  const talking = () => call?.state === 'talking';
  function build() {
    const c = call, kind = c.state === 'talking' ? 'talking' : 'pill', pic = avatar(c.name);
    if (built === kind + '|' + c.id) return;
    built = kind + '|' + c.id;
    el.dataset.kind = kind;
    el.innerHTML = `<div class="ci-head" title="拖动移动；双击回到小手机"><span class="ci-av">${pic ? `<img src="${esc(pic)}" alt="">` : esc(String(c.name || '?').slice(0, 1))}</span>
        <span class="ci-text"><b>${esc(c.name)}</b><small data-ci-status></small></span>
        <span class="ci-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <button type="button" class="ci-end" data-ci="end">${PHONE}</button></div>
      ${kind === 'talking' ? `<div class="ci-lines" data-ci-lines aria-live="polite"></div>
      <form class="ci-say" data-ci-form><input data-ci-input maxlength="1000" autocomplete="off" enterkeyhint="send" placeholder="说点什么……" aria-label="对 ${esc(c.name)} 说"><button type="submit" class="ci-send" data-ci="send"></button></form>` : ''}`;
    linesHTML = '';
    const input = el.querySelector('[data-ci-input]');
    if (input) { input.value = typed; input.addEventListener('input', () => { typed = input.value; sendButton(); }); }
  }
  function lines(c) {
    return (c.lines || []).slice(-20).map(l => l.from === 'me'
      ? `<p class="me">${esc(l.text)}</p>`
      : `<p${l.heard ? ` data-heard="${l.heard}"` : ''}>${l.heard ? '<i class="ci-dot" aria-hidden="true"></i>' : ''}${esc(l.translation || l.text)}</p>`).join('');
  }
  function sendButton() {
    const send = el.querySelector('.ci-send');
    if (!send || !call) return;
    const ask = !typed.trim();
    send.innerHTML = ask ? ASK : SEND;
    send.classList.toggle('ask', ask);
    send.setAttribute('aria-label', ask ? `让${call.name}回话` : '说');
    send.disabled = ask && (!!call.thinking || !!call.speaking);
  }
  function draw() {
    const c = call;
    build();
    const time = c.state === 'talking' && c.answeredAt ? clock((Date.now() - c.answeredAt) / 1000) : '';
    el.querySelector('[data-ci-status]').innerHTML = `<span data-ci-time>${time}</span>${time ? ' · ' : ''}${esc(state(c))}`;
    el.querySelector('.ci-wave').classList.toggle('on', !!c.speaking);
    el.querySelector('.ci-end').setAttribute('aria-label', c.state === 'ringing' && c.dir === 'in' ? '拒绝' : '挂断');
    el.setAttribute('aria-label', `和${c.name}通话，${state(c)}。双击回到小手机`);
    const box = el.querySelector('[data-ci-lines]');
    if (box) {
      const html = lines(c);
      if (html !== linesHTML) {
        // New words scroll into view, unless the user scrolled back to read.
        const near = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        box.innerHTML = html; linesHTML = html;
        if (near || !box.dataset.read) box.scrollTop = box.scrollHeight;
      }
    }
    sendButton();
  }
  /** The call changed (or the phone was put away / taken out): shown only while there is a call and the phone is away. */
  function refresh(next = undefined) {
    if (next !== undefined) call = next && next.state !== 'ended' ? next : null;
    else { try { const c = status(); call = c && c.state !== 'ended' ? c : null; } catch { call = null; } }
    if (!call) typed = '';
    const show = !!call && !phoneOpen();
    if (!show) { if (!el.hidden) { el.hidden = true; win.clearInterval(timer); timer = 0; } return; }
    draw();
    if (el.hidden) {
      el.hidden = false; where();
      // Hidden, it could not scroll: the newest lines in view now.
      const box = el.querySelector('[data-ci-lines]');
      if (box) { box.scrollTop = box.scrollHeight; box.dataset.read = ''; }
    }
    if (!timer) timer = win.setInterval(() => { const t = el.querySelector('[data-ci-time]'); if (call?.answeredAt && t) t.textContent = clock((Date.now() - call.answeredAt) / 1000); }, 1000);
  }

  // Dragging by the top moves it; a double tap opens the phone; the red button hangs up.
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
    drag.live = true;
    el.dataset.dragging = '';
    place = {x: (e.clientX - drag.dx) / win.innerWidth, y: (e.clientY - drag.dy) / win.innerHeight};
    where();
  });
  const drop = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag.live;
    drag = null;
    delete el.dataset.dragging;
    if (was) { lastTap = null; try { win.localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* this visit only */ } }
  };
  el.addEventListener('pointerup', e => {
    const dragged = drag?.live;
    drop(e);
    if (dragged || e.target.closest('button, input, form')) return;
    // Two taps close together, anywhere but the box and the buttons: back to the phone.
    const now = Date.now();
    if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap = null; open(); return; }
    lastTap = {t: now, x: e.clientX, y: e.clientY};
  });
  el.addEventListener('pointercancel', drop);
  el.addEventListener('dblclick', e => { if (!e.target.closest('button, input, form')) e.preventDefault(); });
  el.addEventListener('scroll', e => { if (e.target.matches?.('[data-ci-lines]')) e.target.dataset.read = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight > 40 ? '1' : ''; }, true);
  const run = task => Promise.resolve().then(task).catch(() => {});
  el.addEventListener('click', e => {
    if (e.target.closest('[data-ci=end]')) { const c = call; if (c) run(() => hangup(c)); }
  });
  el.addEventListener('submit', e => {
    e.preventDefault();
    if (!talking()) return;
    const input = el.querySelector('[data-ci-input]'), words = input?.value.trim();
    if (!words) { if (!call.thinking && !call.speaking) run(() => reply()); return; }
    input.value = ''; typed = ''; sendButton();
    run(() => say(words));
  });
  // Keys typed here stay here (the tavern's own shortcuts do not see them).
  el.addEventListener('keydown', e => { if (e.target.closest('input')) e.stopPropagation(); });
  const onResize = () => { if (!el.hidden) where(); };
  win.addEventListener('resize', onResize);

  return {
    refresh,
    get shown() { return !el.hidden; },
    dispose() { win.clearInterval(timer); win.removeEventListener('resize', onResize); el.remove(); },
  };
}

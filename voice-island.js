// 台词小窗 on the tavern page (设置 → 台词小窗, off at first): the latest story reply's voiced lines in a small pill over
// the story — and over a visual-novel sprite that may cover the waves in the text — so they can be heard one by one at
// the reader's pace. The pill says how many lines there are (or shows the one being said); a tap opens the list: tap a
// line to hear it (again to pause), 整条 plays them all, ✕ puts it away until the next reply; a tap elsewhere takes it
// back in. Drag it anywhere (kept by its middle); at the default place it lines up with the other islands at the top.
// It steps aside while the phone is out or a call is on.
import {joinStack, stackTop} from './island-stack.js';

const KEY = 'sttts.voiceIsland';
const HEIGHT_KEY = KEY + '.height';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const WAVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>';
const BUSY = ['playing', 'generating'];

/**
 * enabled(): the setting is on. latest(): {id, name, lines: [{role, text, translation}]} of the latest reply with lines,
 * or null. now(): {id, index, phase} of what is being said. play(id, index): that line (again: pause/resume).
 * playAll(id): every line. phoneOpen(), callShown(): whether to step aside.
 */
export function createVoiceIsland({doc = document, enabled, latest, now, play, playAll, playStep = null, toggle = null, phoneOpen, callShown = () => false}) {
  const win = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'sttts-voice-island';
  el.hidden = true;
  el.setAttribute('role', 'region');
  el.innerHTML = `<div class="vi-pill"><span class="vi-ico">${WAVE}</span><span class="vi-line"><span class="vi-scroll" data-vi-line></span></span><span class="vi-bars" aria-hidden="true"><i></i><i></i><i></i></span></div>
    <div class="vi-card"><div class="vi-head"><span class="vi-ico">${WAVE}</span><b data-vi-title></b><button type="button" class="vi-btn vi-all" data-vi="all"></button><button type="button" class="vi-btn vi-step" data-vi="step" aria-label="逐句播放">${PLAY}<span>逐句</span></button><button type="button" class="vi-btn vi-close" data-vi="close" aria-label="收起">${CLOSE}</button></div>
      <div class="vi-list" data-vi-list></div><div class="vi-resize" data-vi-resize role="separator" tabindex="0" aria-label="调整台词小窗高度" aria-orientation="horizontal"></div></div>`;
  doc.body.append(el);
  let place = null, dismissed = '', reply = null, built = '', expanded = false, width = 0, openedAt = 0, dragged = false;
  try { place = JSON.parse(win.localStorage.getItem(KEY) || 'null'); } catch { /* the top middle */ }
  const list = el.querySelector('.vi-list'), grip = el.querySelector('[data-vi-resize]');
  let preferredHeight = null, sizing = null, following = '';
  const lineViewport=el.querySelector('.vi-line'),lineText=el.querySelector('[data-vi-line]');
  function marquee(){const distance=lineText.scrollWidth-lineViewport.clientWidth;const moving=!expanded&&lineViewport.clientWidth>0&&distance>1;lineText.classList.toggle('vi-scrolling',moving);if(moving){lineText.style.setProperty('--vi-travel',-distance+'px');lineText.style.setProperty('--vi-duration',Math.max(6,distance/24+4)+'s');}}
  function follow(force=false){if(!expanded)return;const row=list.querySelector('[data-state]');if(!row)return;const id=built+'|'+row.dataset.viI;if(!force&&following===id)return;following=id;const r=row.getBoundingClientRect(),box=list.getBoundingClientRect();if(r.top<box.top||r.bottom>box.bottom)list.scrollTop+=r.top-box.top;}
  try { const saved = Number(win.localStorage.getItem(HEIGHT_KEY)); if (Number.isFinite(saved) && saved > 0) preferredHeight = saved; } catch { /* this visit */ }
  function heightBounds() {
    // Reserve the grip inside the former maximum card height. Even the smallest list keeps one dialogue row.
    const max = Math.max(1, Math.min(win.innerHeight * .46, 320) - 24);
    const min = Math.min(max, list.querySelector('.vi-row')?.offsetHeight || 64);
    return {min, max};
  }
  function sizeList() {
    if (!expanded) return;
    const {min, max} = heightBounds(), height = Math.min(max, Math.max(min, preferredHeight ?? max));
    list.style.maxHeight = height + 'px';
    grip.setAttribute('aria-valuemin', Math.round(min));
    grip.setAttribute('aria-valuemax', Math.round(max));
    grip.setAttribute('aria-valuenow', Math.round(height));
  }
  function rememberHeight() {
    try {
      if (preferredHeight === null) win.localStorage.removeItem(HEIGHT_KEY);
      else win.localStorage.setItem(HEIGHT_KEY, String(preferredHeight));
    } catch { /* this visit */ }
  }
  const free = () => !place || !Number.isFinite(place.cx) || !Number.isFinite(place.y);
  function where() {
    el.style.transform = 'translateX(-50%)';
    const w = el.offsetWidth || 220, h = el.offsetHeight || 40, vw = win.innerWidth, vh = win.innerHeight;
    width = w;
    if (free()) { el.style.left = '50%'; el.style.top = stackTop(el); return; }
    el.style.left = Math.min(vw - w / 2 - 6, Math.max(w / 2 + 6, place.cx * vw)) + 'px';
    el.style.top = Math.min(vh - Math.min(h, 120) - 6, Math.max(6, place.y * vh)) + 'px';
  }
  const leave = joinStack({el, order: 2, free, place: where});
  const key = r => r ? JSON.stringify([r.id,r.lines.map(l=>[l.role,l.text,l.translation])]) : '';
  const text = (sel, value) => { const p = el.querySelector(sel); if (p.textContent !== value) {p.textContent = value;if(p===lineText){p.classList.remove('vi-scrolling');void p.offsetWidth;}} };

  function draw(r, s) {
    const mine = s && s.id === r.id && BUSY.includes(s.phase) ? s.index : -1, paused = s && s.id === r.id && s.phase === 'paused' ? s.index : -1;
    el.dataset.playing = mine >= 0 ? '1' : '';
    if (built !== key(r)) {
      built = key(r);
      text('[data-vi-title]', `${r.name || '台词'} · ${r.lines.length} 句`);
      el.querySelector('[data-vi-list]').innerHTML = r.lines.map((l, i) => `<button type="button" class="vi-row" data-vi-i="${i}"><b>${esc(l.role || '')}</b><span>${esc(l.translation || l.text)}</span>${l.translation && l.translation !== l.text ? `<small>${esc(l.text)}</small>` : ''}</button>`).join('');
      sizeList();
    }
    for (const row of el.querySelectorAll('.vi-row')) {
      const i = Number(row.dataset.viI), state = i === mine ? 'playing' : i === paused ? 'paused' : '';
      if ((row.dataset.state || '') !== state) { if (state) row.dataset.state = state; else delete row.dataset.state; }
    }
    follow();
    // 整篇朗读: while the 旁白 reads, no line is the one playing, but the reply is.
    const mineAll = s && s.id === r.id && BUSY.includes(s.phase), pausedAll = s && s.id === r.id && s.phase === 'paused';
    const said = mine >= 0 ? r.lines[mine] : paused >= 0 ? r.lines[paused] : null;
    text('[data-vi-line]', said ? `${said.role ? said.role + '：' : ''}${said.translation || said.text}` : mineAll && s.narration ? `旁白：${s.narration}` : `${r.lines.length} 句台词`);
    marquee();
    const stepping=s?.id===r.id&&s.stepwise;
    const step=el.querySelector('[data-vi=step]'),stepOn=stepping&&mineAll;
    if(step.dataset.on!==String(!!stepOn)){step.dataset.on=String(!!stepOn);step.innerHTML=(stepOn?PAUSE:PLAY)+'<span>逐句</span>';}step.setAttribute('aria-pressed',String(!!stepping));step.title=stepOn?'暂停':stepping&&pausedAll?'继续下一句':'逐句播放';
    const all = el.querySelector('[data-vi=all]'), on = stepping ? 'all' : mine >= 0 || mineAll ? 'pause' : paused >= 0 || pausedAll ? 'resume' : 'all';
    if (all.dataset.on !== on) { all.dataset.on = on; all.innerHTML = on === 'pause' ? `${PAUSE}<span>暂停</span>` : on === 'resume' ? `${PLAY}<span>继续</span>` : `${PLAY}<span>整条</span>`; }
    el.setAttribute('aria-label', `台词小窗：${r.name || ''} ${r.lines.length} 句。点一下展开`);
  }
  function setExpanded(on) {
    if (expanded === on) return;
    expanded = on; openedAt = on ? Date.now() : 0;
    el.dataset.expanded = on ? '1' : '';
    if (!on && sizing) { preferredHeight = sizing.before; sizing = null; }
    if (on) sizeList();
    if (on) follow(true);else following='';
    (win.requestAnimationFrame || (fn => win.setTimeout(fn, 16))).call(win, () => {where();marquee();});
  }
  function refresh() {
    let r = null, s = null;
    try { r = enabled() ? latest() : null; s = r ? now() : null; } catch { r = null; }
    reply = r?.lines?.length ? r : null;
    if (reply && dismissed && dismissed !== key(reply)) dismissed = '';
    const show = reply && !phoneOpen() && !callShown() && dismissed !== key(reply);
    if (!show) { el.hidden = true; setExpanded(false); return; }
    draw(reply, s);
    if (el.hidden) { el.hidden = false; where(); }
    else if (el.offsetWidth !== width) where();
    marquee();
  }

  let drag = null;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('button, .vi-list, [data-vi-resize]')) return;
    const r = el.getBoundingClientRect();
    drag = {id: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, live: false};
    try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.live && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.live = true; el.dataset.dragging = '';
    place = {cx: (e.clientX - drag.dx) / win.innerWidth, y: (e.clientY - drag.dy) / win.innerHeight};
    where();
  });
  el.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.live; drag = null; delete el.dataset.dragging;
    if (moved) { dragged = true; try { win.localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* this visit */ } }
  });
  el.addEventListener('pointercancel', () => { drag = null; delete el.dataset.dragging; });
  grip.addEventListener('pointerdown', e => {
    if (e.button > 0 || !expanded || sizing) return;
    e.preventDefault(); e.stopPropagation();
    sizing = {id: e.pointerId, y: e.clientY, height: list.clientHeight || Number(grip.getAttribute('aria-valuenow')), before: preferredHeight};
    try { grip.setPointerCapture(e.pointerId); } catch { /* gone */ }
  });
  grip.addEventListener('pointermove', e => {
    if (!sizing || e.pointerId !== sizing.id) return;
    e.preventDefault();
    const {min, max} = heightBounds();
    preferredHeight = Math.min(max, Math.max(min, sizing.height + e.clientY - sizing.y));
    sizeList();
  });
  function finishSizing(e, cancel = false) {
    if (!sizing || e.pointerId !== sizing.id) return;
    if (cancel) preferredHeight = sizing.before;
    sizing = null; sizeList();
    if (!cancel) rememberHeight();
    try { grip.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  grip.addEventListener('pointerup', e => finishSizing(e));
  grip.addEventListener('pointercancel', e => finishSizing(e, true));
  grip.addEventListener('lostpointercapture', e => finishSizing(e, true));
  grip.addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const {min, max} = heightBounds(), height = list.clientHeight || Number(grip.getAttribute('aria-valuenow'));
    preferredHeight = e.key === 'Home' ? min : e.key === 'End' ? max : Math.min(max, Math.max(min, height + (e.key === 'ArrowUp' ? -16 : 16)));
    sizeList(); rememberHeight();
  });
  // Opening and closing happen on click, not on pointerup: a phone hit-tests the tap's click after the card has opened
  // under the finger, and that click used to land on 整条 or a line and play it. A tap in the first moment after
  // opening is that same tap, so it does nothing.
  el.addEventListener('click', e => {
    if (e.target.closest('[data-vi-resize]')) return;
    if (dragged) { dragged = false; return; }
    const b = e.target.closest('[data-vi], [data-vi-i]');
    if (!b) { if (!e.target.closest('.vi-list')) setExpanded(!expanded); return; }
    if (!reply || Date.now() - openedAt < 350) return;
    const id = reply.id;
    if (b.dataset.viI !== undefined) Promise.resolve().then(() => play(id, Number(b.dataset.viI))).catch(() => {});
    else if (b.dataset.vi === 'step') { Promise.resolve().then(()=>playStep?.(id)).catch(()=>{}); }
    else if (b.dataset.vi === 'all') { const s = now(); Promise.resolve().then(() => s && s.id === id && !s.stepwise && [...BUSY, 'paused'].includes(s.phase) ? (toggle && !(s.index >= 0) ? toggle() : play(id, s.index)) : playAll(id)).catch(() => {}); }
    else if (b.dataset.vi === 'close') { dismissed = key(reply); el.hidden = true; setExpanded(false); }
  });
  // A tap anywhere else takes the list back in.
  const away = e => { if (expanded && !el.contains(e.target)) setExpanded(false); };
  doc.addEventListener('pointerdown', away, true);
  const onResize = () => { if (sizing) { preferredHeight = sizing.before; sizing = null; } sizeList(); if (!el.hidden) {where();marquee();follow(true);} };
  win.addEventListener('resize', onResize);
  return {refresh, open() { dismissed = ''; refresh(); if (!el.hidden) setExpanded(true); }, get shown() { return !el.hidden; }, get expanded() { return expanded; },
    dispose() { leave(); doc.removeEventListener('pointerdown', away, true); win.removeEventListener('resize', onResize); el.remove(); }};
}

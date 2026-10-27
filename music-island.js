// 音乐小窗 on the tavern page, like a dynamic island: while a song plays and the phone is put away, a small black pill
// floats over the story — a turning disc, the lyric line being sung (or the song; nothing for 纯音乐) and a little wave.
// A tap opens it into a card (the song, the lines around, play/pause, next, ✕); a tap elsewhere takes it back in. A double tap opens the
// phone's 音乐. Drag it anywhere (the place is remembered, by its middle: a longer or shorter line grows or shrinks it
// evenly on both sides, so it stays where it was put); ✕ puts it away until the next song. It steps aside while the
// call island is up.

import {joinStack, stackTop} from './island-stack.js';
import {hasWords} from './core/music.js';

const KEY = 'sttts.musicIsland';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>';
const TAP = 260;

/** status(): musicHost.status(). phoneOpen(), callShown(): whether to step aside. open(): the phone's 音乐. */
export function createMusicIsland({doc = document, status, phoneOpen, callShown = () => false, open, toggle, next}) {
  const win = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'sttts-music-island';
  el.hidden = true;
  el.setAttribute('role', 'region');
  el.innerHTML = `<div class="mi-pill"><span class="mi-disc" aria-hidden="true"><i></i></span><span class="mi-line" data-mi-line></span><span class="mi-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
    <div class="mi-card"><div class="mi-row"><span class="mi-disc big" aria-hidden="true"><i></i></span><span class="mi-text"><b data-mi-title></b><small data-mi-sub></small></span>
      <button type="button" class="mi-btn" data-mi="toggle"></button><button type="button" class="mi-btn" data-mi="next" aria-label="下一首">${NEXT}</button><button type="button" class="mi-btn mi-close" data-mi="close" aria-label="收起">${CLOSE}</button></div>
      <div class="mi-lyrics" aria-live="polite"><p data-mi-prev></p><p class="now" data-mi-now></p><p data-mi-next></p></div></div>`;
  doc.body.append(el);
  let place = null, dismissed = '', now = null, built = '', expanded = false, tapTimer = 0, width = 0;
  try { place = JSON.parse(win.localStorage.getItem(KEY) || 'null'); } catch { /* top middle */ }
  // {cx, y}: the middle across and the top, as parts of the window. (Kept before 0.7.40 as {x, y}, the left edge.)
  function where() {
    el.style.transform = 'translateX(-50%)';
    const w = el.offsetWidth || 200, h = el.offsetHeight || 40, vw = win.innerWidth, vh = win.innerHeight;
    width = w;
    if (place && !Number.isFinite(place.cx) && Number.isFinite(place.x)) place = {cx: place.x + w / 2 / vw, y: place.y};
    if (!place || !Number.isFinite(place.cx) || !Number.isFinite(place.y)) { el.style.left = '50%'; el.style.top = stackTop(el); return; }
    el.style.left = Math.min(vw - w / 2 - 6, Math.max(w / 2 + 6, place.cx * vw)) + 'px';
    el.style.top = Math.min(vh - h - 6, Math.max(6, place.y * vh)) + 'px';
  }
  const leave = joinStack({el, order: 3, free: () => !place || !Number.isFinite(place.cx) || !Number.isFinite(place.y), place: where});
  const key = s => s?.track ? `${s.track.title}|${s.track.artist}` : '';
  const text = (sel, value) => { const p = el.querySelector(sel); if (p.textContent !== value) p.textContent = value; };
  function draw(s) {
    const t = s.track, lines = s.lyrics || [], i = s.lyricIndex ?? -1, playing = s.phase === 'playing';
    if (built !== key(s)) { built = key(s); text('[data-mi-title]', t.title); text('[data-mi-sub]', t.artist || (t.from === 'bgm' ? '背景音乐' : '')); }
    el.dataset.playing = playing ? '1' : '';
    const b = el.querySelector('[data-mi=toggle]');
    if (b.dataset.on !== String(playing)) { b.dataset.on = String(playing); b.innerHTML = playing ? PAUSE : PLAY; b.setAttribute('aria-label', playing ? '暂停' : '播放'); }
    // 纯音乐 (no sung line): just the disc and the wave in the pill, and no lyrics in the card.
    const words = hasWords(lines), plain = !words && (s.phase === 'playing' || s.phase === 'paused');
    if ((el.dataset.plain === '1') !== plain) el.dataset.plain = plain ? '1' : '';
    const sung = lines.length && i >= 0 ? lines[i].text : '';
    text('[data-mi-line]', s.phase === 'loading' ? '正在找这首歌……' : s.phase === 'error' ? s.message : plain ? '' : sung || (t.artist ? `${t.title} - ${t.artist}` : t.title));
    if (words) { text('[data-mi-prev]', lines[i - 1]?.text || ''); text('[data-mi-now]', i >= 0 ? lines[i].text || '♪' : '♪'); text('[data-mi-next]', lines[i + 1]?.text || ''); }
    else { text('[data-mi-prev]', ''); text('[data-mi-now]', s.phase === 'error' ? s.message : s.phase === 'loading' ? '正在找这首歌……' : ''); text('[data-mi-next]', ''); }
    el.setAttribute('aria-label', `正在放 ${t.title}${t.artist ? ' - ' + t.artist : ''}。点一下展开，双击打开音乐`);
  }
  function setExpanded(on) {
    if (expanded === on) return;
    expanded = on;
    el.dataset.expanded = on ? '1' : '';
    (win.requestAnimationFrame || (fn => win.setTimeout(fn, 16))).call(win, where);
  }
  /** Shown while a song is on (playing, paused or loading), the phone is away, no call island, and not put away. */
  function refresh() {
    try { now = status(); } catch { now = null; }
    const on = now?.track && ['playing', 'paused', 'loading', 'error'].includes(now.phase);
    if (on && dismissed && dismissed !== key(now)) dismissed = '';
    const show = on && !phoneOpen() && !callShown() && dismissed !== key(now);
    if (!show) { el.hidden = true; setExpanded(false); return; }
    draw(now);
    if (el.hidden) { el.hidden = false; where(); }
    else if (el.offsetWidth !== width) where(); // near an edge, a longer line must not go off the screen
  }

  let drag = null, lastTap = 0;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('button')) return;
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
    if (moved) { lastTap = 0; try { win.localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* this visit */ } return; }
    // One tap opens or closes the card (after a moment, in case a second tap comes); two open the phone's 音乐.
    const t = Date.now();
    if (t - lastTap < 350) { lastTap = 0; win.clearTimeout(tapTimer); setExpanded(false); open(); return; }
    lastTap = t;
    win.clearTimeout(tapTimer);
    tapTimer = win.setTimeout(() => { lastTap = 0; setExpanded(!expanded); }, TAP);
  });
  el.addEventListener('pointercancel', () => { drag = null; delete el.dataset.dragging; });
  el.addEventListener('dblclick', e => e.preventDefault());
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mi]');
    if (!b) return;
    if (b.dataset.mi === 'toggle') Promise.resolve().then(toggle).catch(() => {});
    if (b.dataset.mi === 'next') Promise.resolve().then(next).catch(() => {});
    if (b.dataset.mi === 'close') { dismissed = key(now); el.hidden = true; setExpanded(false); }
  });
  // A tap anywhere else takes the card back in.
  const away = e => { if (expanded && !el.contains(e.target)) setExpanded(false); };
  doc.addEventListener('pointerdown', away, true);
  const onResize = () => { if (!el.hidden) where(); };
  win.addEventListener('resize', onResize);
  return {refresh, get shown() { return !el.hidden; }, get expanded() { return expanded; },
    dispose() { leave(); win.clearTimeout(tapTimer); doc.removeEventListener('pointerdown', away, true); win.removeEventListener('resize', onResize); el.remove(); }};
}

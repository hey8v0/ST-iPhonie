// 宠物 in a chat (0.9.36): a layer over the messages (in .msgs-wrap, which the chat keeps when it draws again) where the
// pets live. They walk the floor, hop onto bubbles and ride them as the chat scrolls (falling off when the bubble goes),
// answer a tap by how they are (happy, hungry, sulky), can be held and dropped (onto a bubble they sit there), come to a
// new message (all of them to a red packet or a present), jump at a keyword egg, eat when fed, and sleep at night.
// Only what moves is moved frame by frame (one requestAnimationFrame loop, stopped when nothing moves); the rest is CSS.
import {PET_SIZE, PET_FRAMES, petStrip} from './pet-sprites.js';
import {petMood} from '../core/pets.js';

export const PET_PX = PET_SIZE * 2;
const FRAME = Object.fromEntries(PET_FRAMES.map((f, i) => [f, i]));
const BUBBLES = '.msg .chat-bubble, .msg .share-card, .msg .letter-card, .msg .game-card, .msg .fwd-card, .msg .song-card, .msg .packet, .msg .gift-card, .msg .loc-card, .msg .voice-msg';
const MOVING = new Set(['walk', 'hop', 'fall']);
const GRAVITY = 1400;

/**
 * pets(): the pets as kept ({list, show}). onPlay(id, amount): played with (心情). onCard(id): held a moment (its card).
 * Answers {attach(wrap, msgs), detach(), arrived(el, big), cheer(), fed(id), entities}.
 */
export function petLayer({win, doc, pets, onPlay = () => {}, onCard = () => {}}) {
  let layer = null, wrap = null, msgs = null, raf = 0, last = 0, touched = Date.now();
  const live = new Map(), timers = new Set();
  const later = (fn, ms) => { const t = win.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const night = () => { const h = new Date().getHours(); return h >= 23 || h < 7; };
  const floor = () => Math.max(0, (wrap?.clientHeight || 0) - PET_PX - 2);
  const width = () => Math.max(PET_PX, wrap?.clientWidth || 0);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const petOf = e => pets().list.find(p => p.id === e.id);
  const moodOf = e => { const p = petOf(e); return p ? petMood(p) : 'fine'; };

  function setFrame(e, f) { if (e.frame !== f) { e.frame = f; e.sprite.style.backgroundPosition = `${-FRAME[f] * PET_PX}px 0`; } }
  function place(e) {
    e.el.style.transform = `translate(${Math.round(e.x)}px, ${Math.round(e.y)}px)`;
    // (The facing is on a box of its own: the sprite's animations would take the place of a transform of its own.)
    e.body.style.transform = e.facing < 0 ? 'scaleX(-1)' : '';
  }
  function setState(e, state) {
    e.state = state;
    e.el.dataset.state = state;
    if (MOVING.has(state)) start();
  }
  function say(e, words, ms = 1800) {
    const box = e.el.querySelector('.pet-say');
    box.textContent = words;
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    win.clearTimeout(e.sayTimer);
    e.sayTimer = win.setTimeout(() => box.classList.remove('show'), ms);
  }
  function make(p) {
    const el = doc.createElement('div');
    el.className = 'pet';
    el.dataset.pet = p.id;
    el.dataset.kind = p.kind;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', p.name);
    el.innerHTML = '<span class="pet-body"><span class="pet-sprite"></span></span><span class="pet-say" aria-hidden="true"></span>';
    const body = el.firstChild, sprite = body.firstChild, url = petStrip(p.kind);
    if (url) sprite.style.backgroundImage = `url("${url}")`;
    const e = {id: p.id, el, body, sprite, x: 12 + Math.random() * Math.max(0, width() - PET_PX - 24), y: floor(), facing: Math.random() < .5 ? 1 : -1, state: 'idle', seat: null, seatX: 0};
    setFrame(e, 'stand');
    place(e);
    el.addEventListener('pointerdown', ev => grab(e, ev));
    return e;
  }

  // ---------- where they can be: the floor, and the bubbles on the screen ----------
  function bubbles() {
    if (!msgs || !wrap) return [];
    const w = wrap.getBoundingClientRect(), top = w.top + 24, bottom = w.top + floor();
    return [...msgs.querySelectorAll(BUBBLES)].map(el => ({el, r: el.getBoundingClientRect()})).filter(({r}) => r.width > PET_PX * .8 && r.top > top && r.top < bottom - 8);
  }
  function seatAt(e) {
    if (!e.seat?.isConnected || !wrap) return null;
    const r = e.seat.getBoundingClientRect(), w = wrap.getBoundingClientRect(), y = r.top - w.top - PET_PX + 5;
    if (y < -PET_PX / 2 || y > floor() - 4 || !r.width) return null;
    return {x: Math.max(0, Math.min(width() - PET_PX, r.left - w.left + e.seatX)), y};
  }
  /** Scrolled: the ones on bubbles ride along; a bubble gone out of sight lets its rider fall. */
  function follow() {
    for (const e of live.values()) {
      if (!e.seat || e.state === 'held' || e.state === 'hop') continue;
      const at = seatAt(e);
      if (at) { e.x = at.x; e.y = at.y; place(e); }
      else { e.seat = null; e.vy = 0; setState(e, 'fall'); setFrame(e, 'held'); }
    }
  }

  // ---------- moving: one loop for all ----------
  function start() { if (!raf && layer) { last = 0; raf = win.requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    if (!layer) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : .016;
    last = now;
    let moving = false;
    for (const e of live.values()) {
      if (e.state === 'walk') {
        const speed = moodOf(e) === 'hungry' ? 18 : 34, dx = e.tx - e.x;
        e.facing = dx < 0 ? -1 : 1;
        e.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        setFrame(e, Math.floor(now / 170) % 2 ? 'walk1' : 'walk2');
        if (Math.abs(e.tx - e.x) < .5) { setFrame(e, 'stand'); rest(e); } else moving = true;
        place(e);
      } else if (e.state === 'hop') {
        const t = Math.min(1, (now - e.t0) / e.dur), to = e.seat ? seatAt(e) || {x: e.tx, y: e.ty} : {x: e.tx, y: e.ty};
        e.x = e.fx + (to.x - e.fx) * t;
        e.y = e.fy + (to.y - e.fy) * t - 46 * 4 * t * (1 - t);
        place(e);
        if (t >= 1) { e.el.classList.remove('squish'); void e.el.offsetWidth; e.el.classList.add('squish'); if (e.seat) bump(e.seat); setFrame(e, 'stand'); rest(e); } else moving = true;
      } else if (e.state === 'fall') {
        e.vy = (e.vy || 0) + GRAVITY * dt;
        e.y += e.vy * dt;
        const land = e.landOn ? seatAt(e) : null, ground = land ? land.y : floor();
        if (e.y >= ground) { e.y = ground; e.vy = 0; if (!land) { e.seat = null; } else bump(e.seat); e.landOn = false; e.el.classList.remove('squish'); void e.el.offsetWidth; e.el.classList.add('squish'); setFrame(e, 'stand'); rest(e); } else moving = true;
        place(e);
      }
    }
    if (moving) raf = win.requestAnimationFrame(tick);
  }
  /** A bubble a pet lands on gives a little. */
  function bump(el) { el.classList.remove('pet-bump'); void el.offsetWidth; el.classList.add('pet-bump'); }

  // ---------- what they do on their own ----------
  function rest(e) {
    setState(e, 'idle');
    win.clearTimeout(e.next);
    e.next = later(() => decide(e), 2500 + Math.random() * 5500);
    blinkSoon(e);
  }
  function blinkSoon(e) {
    win.clearTimeout(e.blink);
    e.blink = later(() => {
      if (e.state !== 'idle' || e.frame !== 'stand') return blinkSoon(e);
      setFrame(e, 'blink');
      later(() => { if (e.frame === 'blink' && e.state === 'idle') setFrame(e, 'stand'); blinkSoon(e); }, 160);
    }, 2200 + Math.random() * 3600);
  }
  function walkTo(e, x) { e.tx = Math.max(4, Math.min(width() - PET_PX - 4, x)); e.seat = null; setState(e, 'walk'); }
  function hopTo(e, target) {
    const r = target.el.getBoundingClientRect();
    e.seat = target.el;
    e.seatX = Math.max(-PET_PX / 3, Math.min(r.width - PET_PX * .66, Math.random() * (r.width - PET_PX)));
    const at = seatAt(e);
    if (!at) { e.seat = null; return false; }
    e.fx = e.x; e.fy = e.y; e.tx = at.x; e.ty = at.y; e.t0 = win.performance?.now?.() || Date.now(); e.dur = 460;
    e.facing = at.x < e.x ? -1 : 1;
    setFrame(e, 'happy');
    setState(e, 'hop');
    return true;
  }
  function hopDown(e) {
    e.seat = null;
    e.fx = e.x; e.fy = e.y; e.tx = Math.max(4, Math.min(width() - PET_PX - 4, e.x + (Math.random() - .5) * 80)); e.ty = floor();
    e.t0 = win.performance?.now?.() || Date.now(); e.dur = 420;
    setState(e, 'hop');
  }
  function decide(e) {
    if (!layer || e.state !== 'idle') return;
    if (reduced()) return rest(e);
    const mood = moodOf(e);
    if (night() && Date.now() - touched > 60_000) { setState(e, 'sleep'); setFrame(e, 'blink'); return; }
    if (mood === 'starving') { setFrame(e, 'sad'); if (Math.random() < .4) say(e, '……饿'); return rest(e); }
    if (mood === 'hungry' && Math.random() < .35) { setFrame(e, 'sad'); say(e, '🍖?'); return rest(e); }
    const roll = Math.random();
    if (e.seat) { if (roll < .45) return hopDown(e); if (roll < .65) { const b = bubbles().filter(x => x.el !== e.seat); if (b.length && hopTo(e, pick(b))) return; } return rest(e); }
    if (roll < .4) return walkTo(e, e.x + (Math.random() - .5) * width() * .8);
    if (roll < .65 && mood !== 'sulky') { const b = bubbles(); if (b.length && hopTo(e, pick(b))) return; }
    if (roll < .8) { e.facing = -e.facing; place(e); }
    rest(e);
  }

  // ---------- the user's hands ----------
  function grab(e, ev) {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    touched = Date.now();
    const w = wrap.getBoundingClientRect(), startX = ev.clientX, startY = ev.clientY, offX = ev.clientX - w.left - e.x, offY = ev.clientY - w.top - e.y;
    let held = false, done = false;
    try { e.el.setPointerCapture?.(ev.pointerId); } catch { /* fine without */ }
    const card = win.setTimeout(() => { if (!held && !done) { done = true; off(); onCard(e.id); } }, 550);
    const move = mv => {
      if (done) return;
      if (!held && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 6) return;
      if (!held) { held = true; win.clearTimeout(card); win.clearTimeout(e.next); e.seat = null; setState(e, 'held'); setFrame(e, 'held'); e.el.classList.add('struggle'); }
      e.x = Math.max(0, Math.min(width() - PET_PX, mv.clientX - w.left - offX));
      e.y = Math.max(-8, Math.min(floor(), mv.clientY - w.top - offY));
      place(e);
    };
    const up = () => {
      if (done) return;
      done = true;
      win.clearTimeout(card);
      off();
      if (held) { e.el.classList.remove('struggle'); drop(e); onPlay(e.id, 3); } else tap(e);
    };
    const off = () => { e.el.removeEventListener('pointermove', move); e.el.removeEventListener('pointerup', up); e.el.removeEventListener('pointercancel', up); };
    e.el.addEventListener('pointermove', move);
    e.el.addEventListener('pointerup', up);
    e.el.addEventListener('pointercancel', up);
  }
  /** Let go: onto a bubble under it (it sits there), else down to the floor. */
  function drop(e) {
    const w = wrap.getBoundingClientRect(), mid = w.left + e.x + PET_PX / 2, feet = w.top + e.y + PET_PX;
    const under = bubbles().find(({r}) => mid > r.left + 4 && mid < r.right - 4 && feet <= r.top + 14 && r.top - feet < 160);
    if (under) { e.seat = under.el; e.seatX = mid - under.r.left - PET_PX / 2; e.landOn = true; }
    e.vy = 0;
    setState(e, 'fall');
  }
  /** A tap answers by how the pet is. */
  function tap(e) {
    touched = Date.now();
    const mood = moodOf(e);
    win.clearTimeout(e.next);
    if (e.state === 'sleep') { setFrame(e, 'stand'); say(e, night() ? '……zzz？' : '醒啦'); return rest(e); }
    if (mood === 'starving') { setFrame(e, 'sad'); say(e, '饿……'); return rest(e); }
    if (mood === 'hungry') { setFrame(e, 'sad'); say(e, '🍖'); onPlay(e.id, 1); return rest(e); }
    if (mood === 'sulky') { e.facing = -e.facing; place(e); setFrame(e, 'stand'); say(e, '哼'); onPlay(e.id, 1); return rest(e); }
    setFrame(e, 'happy');
    say(e, pick(['❤', '♪', '✨', '嘿嘿']));
    e.el.classList.remove('jump'); void e.el.offsetWidth; e.el.classList.add('jump');
    onPlay(e.id, 2);
    later(() => { if (e.frame === 'happy' && e.state === 'idle') setFrame(e, 'stand'); }, 900);
    rest(e);
  }

  // ---------- the chat's own goings-on ----------
  /** A message came (big: a red packet or a present — everyone comes): they go to it, or look. */
  function arrived(el, big = false) {
    if (!layer || reduced()) return;
    const target = el?.matches?.(BUBBLES) ? el : el?.querySelector?.(BUBBLES);
    for (const e of live.values()) {
      if (['held', 'hop', 'fall'].includes(e.state) || ['starving'].includes(moodOf(e))) continue;
      if (e.state === 'sleep') { if (!big) continue; setFrame(e, 'stand'); }
      if (!big && Math.random() > .55) continue;
      say(e, big ? '！！' : '！');
      const at = target ? bubbles().find(b => b.el === target) : null;
      if (at && hopTo(e, at)) continue;
      if (target) { const r = target.getBoundingClientRect(), w = wrap.getBoundingClientRect(); walkTo(e, r.left - w.left + r.width / 2 - PET_PX / 2); }
    }
  }
  /** A keyword egg (生日快乐…): they jump. */
  function cheer() {
    if (!layer) return;
    for (const e of live.values()) {
      if (e.state === 'held' || moodOf(e) === 'starving') continue;
      setFrame(e, 'happy'); say(e, '🎉');
      e.el.classList.remove('jump'); void e.el.offsetWidth; e.el.classList.add('jump');
    }
  }
  /** Fed (from its card or the list): it eats, then is glad. */
  function fed(id) {
    const e = live.get(id);
    if (!e || e.state === 'held') return;
    win.clearTimeout(e.next);
    setState(e, 'idle');
    let n = 0;
    const chew = () => { setFrame(e, n % 2 ? 'blink' : 'eat'); if (++n < 6) later(chew, 200); else { setFrame(e, 'happy'); say(e, '😋'); later(() => rest(e), 900); } };
    chew();
  }

  // ---------- on and off ----------
  function sync() {
    const list = pets().list, ids = new Set(list.map(p => p.id));
    for (const [id, e] of live) if (!ids.has(id)) { e.el.remove(); live.delete(id); }
    for (const p of list) if (!live.has(p.id)) { const e = make(p); live.set(p.id, e); layer.append(e.el); rest(e); }
    for (const p of list) { const e = live.get(p.id); if (e) e.el.setAttribute('aria-label', p.name); }
  }
  const onScroll = () => follow();
  const onVisible = () => { if (doc.hidden) { win.cancelAnimationFrame(raf); raf = 0; } else if (layer) for (const e of live.values()) if (MOVING.has(e.state)) start(); };
  function attach(nextWrap, nextMsgs) {
    const p = pets();
    if (!nextWrap || !p.show || !p.list.length) return detach();
    if (layer && wrap === nextWrap && layer.isConnected) { if (msgs !== nextMsgs) { msgs?.removeEventListener('scroll', onScroll); msgs = nextMsgs; msgs?.addEventListener('scroll', onScroll, {passive: true}); } sync(); follow(); return; }
    detach();
    wrap = nextWrap; msgs = nextMsgs;
    layer = doc.createElement('div');
    layer.className = 'pet-layer';
    wrap.append(layer);
    msgs?.addEventListener('scroll', onScroll, {passive: true});
    doc.addEventListener('visibilitychange', onVisible);
    sync();
  }
  function detach() {
    for (const t of timers) win.clearTimeout(t);
    timers.clear();
    for (const e of live.values()) { win.clearTimeout(e.next); win.clearTimeout(e.blink); win.clearTimeout(e.sayTimer); }
    live.clear();
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    msgs?.removeEventListener('scroll', onScroll);
    doc.removeEventListener('visibilitychange', onVisible);
    layer?.remove();
    layer = null; wrap = null; msgs = null;
  }
  return {attach, detach, arrived, cheer, fed, get entities() { return live; }};
}

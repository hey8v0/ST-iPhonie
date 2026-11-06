// 宠物 in a chat: a layer over the messages (in .msgs-wrap, which the chat keeps when it draws again) where the pets live.
// 0.9.36: they walk the floor, hop onto bubbles and ride them as the chat scrolls, answer a tap by how they are (happy,
// hungry, sulky), can be held and dropped, come to a new message (all of them to a red packet or a present), jump at a
// keyword egg, eat when fed, and sleep at night.
// 0.9.37, a herd with a day of its own:
// - Together: on the floor they bump into each other (stop, back off, look round; a sleeper half wakes) and are pushed
//   apart when one comes down on another's spot. One let go over another's head sits on it (three high at most); the
//   one below carries it and does not walk off, and taken away from under it, the one on top comes down smoothly (a
//   sleeper sleeps on). Now and then two play tag and end nose to nose (贴贴).
// - Thrown: let go while moving fast, it flies, bounces off the sides and the top, lands on a bubble (which gives), a
//   head or the floor (bouncing on the floor), and is dizzy a moment after landing hard.
// - A day: awake a few minutes (a few steps and a stop, a look about, its own habit, a stretch), then a nap (tucked up,
//   z's, breathing like jelly), longer at night; woken by a tap it rubs its eyes. The cat licks its paw, the chick
//   pecks, the slime bounces, the crab snaps its claws and walks sideways.
// - Company: while the user types they come and sit by the box and look at it, and jump when it is sent. Scrolling, the
//   ones on bubbles hold on to the top edge and let go when it stops. Where each was is kept per chat (after a refresh
//   they are on the same bubble, or the same spot of the floor).
// Only what moves is moved frame by frame (one requestAnimationFrame loop, stopped when nothing moves); the rest is CSS
// and Web Animations (z's, breathing, the dizzy stars).
import {PET_SIZE, PET_FRAMES, petStrip} from './pet-sprites.js';
import {petMood} from '../core/pets.js';

export const PET_PX = PET_SIZE * 2;
const FRAME = Object.fromEntries(PET_FRAMES.map((f, i) => [f, i]));
const BUBBLES = '.msg .chat-bubble, .msg .share-card, .msg .letter-card, .msg .game-card, .msg .fwd-card, .msg .song-card, .msg .packet, .msg .gift-card, .msg .loc-card, .msg .voice-msg';
const MOVING = new Set(['walk', 'hop', 'fall']);
const GRAVITY = 1500, THROW = 450, HARD = 950, BOUNCE = 700;
// Where a rider's feet go on each kind: the top of its head, from the top of its picture (px; the crab's is between its claws).
export const PET_HEAD = Object.freeze({cat: 10, chick: 8, slime: 10, crab: 18});
const STACK = 3;
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * pets(): the pets as kept ({list, show}). onPlay(id, amount): played with (心情). onCard(id): held a moment (its card).
 * storage: where the spots are kept (localStorage; none: not kept). Answers {attach(wrap, msgs, {key, box}), detach(),
 * arrived(el, big), cheer(), fed(id), typing(on), sent(), entities}.
 */
export function petLayer({win, doc, pets, onPlay = () => {}, onCard = () => {}, storage = (() => { try { return win.localStorage; } catch { return null; } })()}) {
  let layer = null, wrap = null, msgs = null, box = null, key = '', raf = 0, last = 0, touched = Date.now(), typingUntil = 0;
  let zTimer = 0, zel = null, scrolling = 0, saveTimer = 0;
  const live = new Map(), timers = new Set();
  const later = (fn, ms) => { const t = win.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const cancel = t => { if (t) { win.clearTimeout(t); timers.delete(t); } };
  const now = () => win.performance?.now?.() || Date.now();
  const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const night = () => { const h = new Date().getHours(); return h >= 23 || h < 7; };
  const floor = () => Math.max(0, (wrap?.clientHeight || 0) - PET_PX - 2);
  const width = () => Math.max(PET_PX, wrap?.clientWidth || 0);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const petOf = e => pets().list.find(p => p.id === e.id);
  const moodOf = e => { const p = petOf(e); return p ? petMood(p) : 'fine'; };
  const onFloor = e => !e.seat && !e.on && !['held', 'hop', 'fall', 'cling'].includes(e.state);
  const riderOf = e => [...live.values()].find(x => x.on === e.id);
  const below = e => e.on ? live.get(e.on) : null;
  const height = e => { let n = 1, x = e; while ((x = below(x)) && n < STACK + 1) n++; return n; };

  // ---------- drawing ----------
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
    const bubble = e.el.querySelector('.pet-say');
    bubble.textContent = words;
    bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show');
    win.clearTimeout(e.sayTimer);
    e.sayTimer = win.setTimeout(() => bubble.classList.remove('show'), ms);
  }
  const once = (e, name) => { e.el.classList.remove(name); void e.el.offsetWidth; e.el.classList.add(name); };
  function make(p) {
    const el = doc.createElement('div');
    el.className = 'pet';
    el.dataset.pet = p.id;
    el.dataset.kind = p.kind;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', p.name);
    el.innerHTML = '<span class="pet-body"><span class="pet-sprite"></span></span><span class="pet-stars" aria-hidden="true">✦ ✧ ✦</span><span class="pet-say" aria-hidden="true"></span>';
    const body = el.firstChild, sprite = body.firstChild, url = petStrip(p.kind);
    if (url) sprite.style.backgroundImage = `url("${url}")`;
    const e = {id: p.id, kind: p.kind, el, body, sprite, x: 12 + Math.random() * Math.max(0, width() - PET_PX - 24), y: floor(), vx: 0, vy: 0,
      facing: Math.random() < .5 ? 1 : -1, state: 'idle', seat: null, seatX: 0, on: null, onDx: 0, walks: 0, napAt: Date.now() + napGap(), wakeAt: 0};
    setFrame(e, 'stand');
    place(e);
    el.addEventListener('pointerdown', ev => grab(e, ev));
    return e;
  }
  // How long it stays up before a nap (shorter at night), and how long a nap is (longer at night).
  const napGap = () => night() ? rand(25_000, 70_000) : rand(90_000, 240_000);
  const napLength = () => night() ? rand(180_000, 360_000) : rand(40_000, 110_000);

  // ---------- where they can be: the floor, the bubbles on the screen, one another's heads ----------
  function bubbles() {
    if (!msgs || !wrap) return [];
    const w = wrap.getBoundingClientRect(), top = w.top + 24, bottom = w.top + floor();
    return [...msgs.querySelectorAll(BUBBLES)].map(el => ({el, r: el.getBoundingClientRect()})).filter(({r}) => r.width > PET_PX * .8 && r.top > top && r.top < bottom - 8);
  }
  /** Sat on a bubble: kept by its message too, so a bubble the chat draws anew is found again. */
  function sitOn(e, el, x) { e.seat = el; e.seatX = x; e.seatMid = el?.closest?.('.msg[data-mid]')?.dataset.mid || ''; }
  function seatAt(e) {
    if (e.seat && !e.seat.isConnected && e.seatMid && msgs) {
      const again = [...msgs.querySelectorAll('.msg[data-mid]')].find(m => m.dataset.mid === e.seatMid)?.querySelector(BUBBLES);
      if (again) e.seat = again;
    }
    if (!e.seat?.isConnected || !wrap) return null;
    const r = e.seat.getBoundingClientRect(), w = wrap.getBoundingClientRect(), y = r.top - w.top - PET_PX + 5;
    if (y < -PET_PX / 2 || y > floor() - 4 || !r.width) return null;
    return {x: Math.max(0, Math.min(width() - PET_PX, r.left - w.left + e.seatX)), y};
  }
  /** Where one riding p stands: on top of its head. */
  const onHead = (p, dx = 0) => ({x: Math.max(0, Math.min(width() - PET_PX, p.x + dx)), y: p.y + PET_HEAD[p.kind] - PET_PX + 3});
  /** The ones riding e move with it (and theirs with them). */
  function carry(e) {
    for (let r = riderOf(e), base = e, n = 0; r && n < STACK; base = r, r = riderOf(r), n++) {
      if (['held', 'hop', 'fall'].includes(r.state)) break;
      const at = onHead(base, r.onDx);
      r.x = at.x; r.y = at.y; place(r);
    }
  }
  /**
   * The first thing under e that its feet cross going down from feetBefore: a bubble (it sits there), a head with room
   * on it (it rides), or the floor. Answers {y, seat, seatX, on, onDx, floor}.
   */
  function surfaceUnder(e, feetBefore) {
    const feet = e.y + PET_PX, mid = e.x + PET_PX / 2, found = [];
    if (wrap) {
      const w = wrap.getBoundingClientRect();
      for (const {el, r} of bubbles()) {
        const left = r.left - w.left, y = r.top - w.top - PET_PX + 5;
        if (mid > left + 4 && mid < left + r.width - 4) found.push({y, seat: el, seatX: e.x - left});
      }
    }
    for (const p of live.values()) {
      if (p === e || riderOf(p) || ['held', 'hop', 'fall', 'cling'].includes(p.state) || height(p) >= STACK) continue;
      if (Math.abs(p.x - e.x) < PET_PX * .55) { const at = onHead(p); found.push({y: at.y, on: p.id, onDx: Math.max(-8, Math.min(8, e.x - p.x))}); }
    }
    found.push({y: floor(), floor: true});
    return found.filter(s => s.y + PET_PX >= feetBefore - 2 && s.y + PET_PX <= feet + 1).sort((a, b) => a.y - b.y)[0] || null;
  }
  /** Scrolled: the ones on bubbles ride along; a bubble gone up out of sight, its rider holds on to the top edge. */
  function follow() {
    for (const e of live.values()) {
      if (!e.seat || ['held', 'hop', 'fall'].includes(e.state)) continue;
      const at = seatAt(e);
      if (at) { e.x = at.x; e.y = at.y; place(e); carry(e); continue; }
      // Scrolled up out of sight: it holds on to the top edge. A bubble gone (deleted, or not found again): it drops.
      const above = !!e.seat?.isConnected && !!wrap && e.seat.getBoundingClientRect().top - wrap.getBoundingClientRect().top < 0;
      e.seat = null;
      if (above && !reduced()) { cancel(e.next); setState(e, 'cling'); e.y = -6; setFrame(e, 'held'); place(e); }
      else fall(e);
      for (const r of [riderOf(e)].filter(Boolean)) lower(r);
    }
    // Let go of the edge once the scrolling stops.
    cancel(scrolling);
    scrolling = later(() => { for (const e of live.values()) if (e.state === 'cling') fall(e); }, 450);
  }

  // ---------- moving: one loop for all ----------
  function start() { if (!raf && layer) { last = 0; raf = win.requestAnimationFrame(tick); } }
  function tick(time) {
    raf = 0;
    if (!layer) return;
    const dt = last ? Math.min(.05, (time - last) / 1000) : .016;
    last = time;
    let moving = false;
    for (const e of live.values()) {
      if (e.state === 'walk') { moving = walkStep(e, dt, time) || moving; carry(e); }
      else if (e.state === 'hop') {
        const t = Math.min(1, (time - e.t0) / e.dur), p = e.toOn ? live.get(e.toOn) : null;
        const to = p ? onHead(p, e.onDx) : e.seat ? seatAt(e) || {x: e.tx, y: e.ty} : {x: e.tx, y: e.ty};
        e.x = e.fx + (to.x - e.fx) * t;
        e.y = e.fy + (to.y - e.fy) * t - e.lift * 4 * t * (1 - t);
        place(e); carry(e);
        if (t >= 1) {
          if (p) { e.on = p.id; e.toOn = null; }
          once(e, 'squish'); if (e.seat) bump(e.seat);
          if (e.sleepOn) { e.sleepOn = false; setState(e, 'sleep'); setFrame(e, 'sleep'); keep(); }
          else if (e.watchAt != null) { const x = e.watchAt; e.watchAt = null; setFrame(e, 'stand'); walkTo(e, x); }
          else { setFrame(e, 'stand'); if (!(onFloor(e) && settle(e))) rest(e); }
        } else moving = true;
      } else if (e.state === 'fall') moving = fallStep(e, dt) || moving;
    }
    if (moving) raf = win.requestAnimationFrame(tick);
  }
  function walkStep(e, dt, time) {
    const chased = e.chase ? live.get(e.chase) : null;
    // (Close enough to touch: nose to nose.)
    if (chased) e.tx = chased.x + (chased.x > e.x ? -1 : 1) * (PET_PX - 12);
    const speed = (moodOf(e) === 'hungry' ? 18 : 34) * (e.chase ? 2 : e.flee ? 1.7 : e.hurry ? 2.4 : 1), dx = e.tx - e.x;
    if (e.kind !== 'crab') e.facing = dx < 0 ? -1 : 1;
    e.walking = true;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt), next = e.x + step;
    // On the floor they are in each other's way: stop, back off, look (the chased one is the end of a chase).
    if (!e.hurry) for (const p of live.values()) {
      if (p === e || !onFloor(p) || p.state === 'walk' && p.chase === e.id) continue;
      const toward = Math.sign(p.x - e.x) === Math.sign(step), gap = Math.abs(next - p.x);
      if (toward && gap < PET_PX - 8) {
        if (chased === p) { nuzzle(e, p); return false; }
        bumpInto(e, p, Math.sign(step));
        return false;
      }
    }
    e.x = next;
    setFrame(e, Math.floor(time / 170) % 2 ? 'walk1' : 'walk2');
    place(e);
    if (Math.abs(e.tx - e.x) < .5 && !chased) { e.walking = false; e.hurry = false; e.flee = false; setFrame(e, 'stand'); arrive(e); return false; }
    return true;
  }
  function fallStep(e, dt) {
    const feetBefore = e.y + PET_PX;
    e.vy += GRAVITY * dt;
    e.vx *= Math.pow(.5, dt);
    e.x += e.vx * dt; e.y += e.vy * dt;
    const right = width() - PET_PX;
    if (e.x < 0 || e.x > right) { e.x = e.x < 0 ? 0 : right; e.vx = -e.vx * .55; if (Math.abs(e.vx) > 120) once(e, 'squish-side'); }
    if (e.y < -PET_PX * .3) { e.y = -PET_PX * .3; e.vy = Math.abs(e.vy) * .4; }
    if (e.vy > 0) {
      const s = surfaceUnder(e, feetBefore);
      if (s) { land(e, s); place(e); return MOVING.has(e.state); }
    }
    place(e);
    return true;
  }
  /** Down on something: a bounce on the floor if it came fast, dizzy if it came very fast; a bubble gives a little. */
  function land(e, s) {
    const impact = e.vy;
    e.y = s.y;
    // (How hard it first came down decides the dizziness, after the bounces.)
    e.hit = Math.max(e.hit || 0, impact);
    if (s.floor && impact > BOUNCE && (e.bounces || 0) < 2 && !reduced()) { e.vy = -impact * .3; e.bounces = (e.bounces || 0) + 1; once(e, 'squish'); return; }
    const hard = e.hit > HARD;
    e.vy = 0; e.vx = 0; e.bounces = 0; e.hit = 0;
    sitOn(e, s.seat || null, s.seatX || 0); e.on = s.on || null; e.onDx = s.onDx || 0;
    e.el.classList.remove('tumble');
    once(e, 'squish');
    if (s.seat) bump(s.seat, impact > HARD);
    if (s.on) { const at = onHead(live.get(s.on), e.onDx); e.x = at.x; e.y = at.y; const under = live.get(s.on); if (under?.state === 'sleep') nudge(under); }
    if (hard && !reduced()) return dizzy(e);
    setFrame(e, 'stand');
    // (Sliding aside to some room is a walk of its own: it rests when it gets there.)
    if (!(s.floor && settle(e))) rest(e);
  }
  /** A bubble a pet lands on gives a little (more when it came down hard). */
  function bump(el, hard = false) { const name = hard ? 'pet-bump-hard' : 'pet-bump'; el.classList.remove('pet-bump', 'pet-bump-hard'); void el.offsetWidth; el.classList.add(name); }
  function dizzy(e) {
    setState(e, 'dizzy'); setFrame(e, 'dizzy'); say(e, '@_@', 1600);
    cancel(e.next);
    e.next = later(() => { if (e.state !== 'dizzy') return; setFrame(e, 'stand'); setState(e, 'idle'); if (!(onFloor(e) && settle(e))) rest(e); }, 2200);
  }
  function fall(e, vy = 0) { e.vy = vy; e.vx = e.vx || 0; e.seat = null; e.on = null; e.toOn = null; e.walking = false; setState(e, 'fall'); if (e.frame === 'stand' || e.frame === 'sleep') setFrame(e, 'held'); if (reduced()) fallNow(e); }
  /** Without motion: straight down onto what is under it. */
  function fallNow(e) { const feet = e.y + PET_PX; e.y = floor() + 1; const s = surfaceUnder(e, feet) || {y: floor(), floor: true}; e.vy = 0; land(e, s); place(e); }
  /** Taken away from under it: the one on top comes down smoothly (onto whoever is still under, or the floor). */
  function lower(r) {
    const asleep = r.state === 'sleep';
    r.on = null;
    if (reduced()) { fallNow(r); return; }
    r.fx = r.x; r.fy = r.y; r.tx = r.x; r.ty = floor(); r.seat = null; r.toOn = null;
    // Someone else right under it: onto them instead.
    const under = [...live.values()].find(p => p !== r && onFloor(p) && !riderOf(p) && Math.abs(p.x - r.x) < PET_PX * .55);
    if (under) { r.toOn = under.id; r.onDx = Math.max(-8, Math.min(8, r.x - under.x)); }
    r.t0 = now(); r.dur = 320; r.lift = 6; r.sleepOn = asleep;
    setState(r, 'hop');
  }
  /** Down on the floor where another stands: it slides aside to the nearest room. */
  function settle(e) {
    const clash = [...live.values()].find(p => p !== e && onFloor(p) && Math.abs(p.x - e.x) < PET_PX - 10);
    if (!clash) return false;
    // The nearest room on either side, further out while the near ones are taken.
    const right = width() - PET_PX - 4, step = PET_PX - 4, spots = [];
    for (let n = 1; n <= 6; n++) spots.push(clash.x + n * step, clash.x - n * step);
    const free = spots.filter(x => x >= 4 && x <= right).find(x => ![...live.values()].some(p => p !== e && onFloor(p) && Math.abs(p.x - x) < PET_PX - 10));
    if (free == null) return false;
    e.tx = free; e.hurry = true; e.walking = false;
    setState(e, 'walk');
    return true;
  }
  function bumpInto(e, p, dir) {
    e.x -= dir * 4; e.walking = false; e.walks = 0; e.chase = null; e.flee = false;
    setFrame(e, 'look'); place(e);
    setState(e, 'idle');
    cancel(e.next);
    e.next = later(() => { if (e.state === 'idle' && e.frame === 'look') setFrame(e, 'stand'); rest(e); }, 900);
    if (p.state === 'sleep') nudge(p);
    else if (p.state === 'idle' && Math.random() < .3 && !riderOf(p) && !riderOf(e)) nuzzle(e, p);
    else if (p.state === 'idle') { p.facing = p.x > e.x ? -1 : 1; place(p); }
  }
  /** A sleeper bumped or sat on: an eye opens a moment. */
  function nudge(p) {
    if (p.state !== 'sleep') return;
    setFrame(p, 'look');
    later(() => { if (p.state === 'sleep') setFrame(p, 'sleep'); }, 700);
  }
  /** Two nose to nose: hearts, a little hop each. */
  function nuzzle(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      cancel(x.next);
      x.chase = null; x.flee = false; x.walking = false; x.walks = 0;
      x.facing = y.x > x.x ? 1 : -1;
      setState(x, 'idle'); setFrame(x, 'happy'); place(x);
      say(x, '♥', 1500); once(x, 'jump');
      onPlay(x.id, 2);
      x.next = later(() => { if (x.frame === 'happy') setFrame(x, 'stand'); rest(x); }, 1400);
    }
  }
  /** A walk ended: by the box while the user types it stays and watches; else on with the day. */
  function arrive(e) {
    if (e.watching && Date.now() < typingUntil) { setState(e, 'idle'); faceBox(e); setFrame(e, 'look'); blinkSoon(e); return; }
    rest(e, e.walks > 0 ? rand(1500, 4000) : null);
  }

  // ---------- what they do on their own ----------
  function rest(e, wait = null) {
    setState(e, 'idle');
    cancel(e.next);
    e.next = later(() => decide(e), wait ?? rand(2500, 7000));
    blinkSoon(e);
    keep();
  }
  function blinkSoon(e) {
    cancel(e.blink);
    e.blink = later(() => {
      if (e.state !== 'idle' || !['stand', 'look'].includes(e.frame)) return blinkSoon(e);
      const was = e.frame;
      setFrame(e, 'blink');
      later(() => { if (e.frame === 'blink' && e.state === 'idle') setFrame(e, was); blinkSoon(e); }, 160);
    }, rand(2200, 5800));
  }
  function walkTo(e, x) { e.tx = Math.max(4, Math.min(width() - PET_PX - 4, x)); e.seat = null; e.walking = false; setState(e, 'walk'); }
  function hopTo(e, target) {
    const r = target.el.getBoundingClientRect();
    sitOn(e, target.el, Math.max(-PET_PX / 3, Math.min(r.width - PET_PX * .66, Math.random() * (r.width - PET_PX))));
    const at = seatAt(e);
    if (!at) { e.seat = null; return false; }
    e.fx = e.x; e.fy = e.y; e.tx = at.x; e.ty = at.y; e.t0 = now(); e.dur = 460; e.lift = 46; e.on = null;
    e.facing = at.x < e.x ? -1 : 1;
    setFrame(e, 'happy');
    setState(e, 'hop');
    return true;
  }
  function hopDown(e) {
    const r = riderOf(e);
    e.seat = null; e.on = null;
    e.fx = e.x; e.fy = e.y; e.tx = Math.max(4, Math.min(width() - PET_PX - 4, e.x + rand(-40, 40))); e.ty = floor();
    e.t0 = now(); e.dur = 420; e.lift = 46;
    setState(e, 'hop');
    if (r) lower(r);
  }
  function nap(e) {
    setState(e, 'sleep'); setFrame(e, 'sleep');
    e.wakeAt = Date.now() + napLength();
    cancel(e.next);
    e.next = later(() => wake(e), e.wakeAt - Date.now());
    keep();
  }
  /** Up from a nap: a yawn, a stretch, then the day goes on. rubbed: woken by a tap (it rubs its eyes first). */
  function wake(e, rubbed = false) {
    if (e.state !== 'sleep') return;
    setState(e, 'idle');
    e.napAt = Date.now() + napGap();
    const steps = rubbed ? ['blink', 'look', 'blink', 'yawn', 'stand'] : ['yawn', 'yawn', 'happy', 'stand'];
    let i = 0;
    const next = () => { if (e.state !== 'idle') return; setFrame(e, steps[i]); if (++i < steps.length) later(next, rubbed ? 180 : 320); else rest(e); };
    next();
  }
  /** Its own habit, a second or two. */
  function habit(e) {
    setState(e, 'idle');
    cancel(e.next);
    const frames = {cat: ['habit1', 'habit2'], chick: ['habit1', 'stand'], slime: ['habit1', 'habit2'], crab: ['habit1', 'habit2']}[e.kind] || ['stand'];
    if (e.kind === 'chick') once(e, 'peck');
    if (e.kind === 'slime') once(e, 'boing');
    if (e.kind === 'crab' && Math.random() < .5) say(e, '咔嚓', 1000);
    let n = 0;
    const step = () => { if (e.state !== 'idle') return; setFrame(e, frames[n % 2]); if (++n < 6) later(step, e.kind === 'crab' ? 140 : 190); else { setFrame(e, 'stand'); rest(e); } };
    step();
  }
  function lookAbout(e) {
    setFrame(e, 'look');
    later(() => { if (e.state !== 'idle') return; e.facing = -e.facing; place(e); later(() => { if (e.state === 'idle' && e.frame === 'look') setFrame(e, 'stand'); }, 700); }, 700);
    rest(e, rand(2600, 4000));
  }
  function decide(e) {
    if (!layer || e.state !== 'idle') return;
    if (reduced()) return rest(e, rand(6000, 12000));
    const mood = moodOf(e), floorNow = onFloor(e), carrying = !!riderOf(e);
    if (e.watching && Date.now() < typingUntil) return rest(e);
    if (night() && Date.now() - touched > 60_000 && Date.now() > e.napAt - 20_000) return nap(e);
    if (Date.now() >= e.napAt && !['hop', 'fall'].includes(e.state)) return nap(e);
    if (mood === 'starving') { setFrame(e, 'sad'); if (Math.random() < .4) say(e, '……饿'); return rest(e); }
    if (mood === 'hungry' && Math.random() < .35) { setFrame(e, 'sad'); say(e, '🍖?'); return rest(e); }
    // A few steps and a stop, two to four times over (the one carrying another stays put).
    if (e.walks > 0 && floorNow && !carrying) { e.walks--; return walkTo(e, e.x + e.dir * rand(30, 110)); }
    const roll = Math.random();
    if (e.on) { if (roll < .35) return hopDown(e); return roll < .55 ? habit(e) : rest(e); }
    if (e.seat) { if (roll < .4) return hopDown(e); if (roll < .6 && !carrying) { const b = bubbles().filter(x => x.el !== e.seat); if (b.length && hopTo(e, pick(b))) return; } return roll < .8 ? habit(e) : rest(e); }
    if (carrying) return roll < .4 ? habit(e) : roll < .6 ? lookAbout(e) : rest(e);
    // Tag: one runs after a friend that is up and about, which runs off.
    const friends = [...live.values()].filter(p => p !== e && onFloor(p) && p.state === 'idle' && !riderOf(p) && !p.watching);
    if (roll < .08 && friends.length && mood !== 'sulky') return chase(e, pick(friends));
    if (roll < .45) { e.dir = Math.random() < .5 ? -1 : 1; e.walks = Math.floor(rand(1, 4)); return walkTo(e, e.x + e.dir * rand(30, 110)); }
    if (roll < .62 && mood !== 'sulky') { const b = bubbles(); if (b.length && hopTo(e, pick(b))) return; }
    if (roll < .75) return habit(e);
    if (roll < .86) return lookAbout(e);
    if (roll < .9) { setFrame(e, 'yawn'); later(() => { if (e.frame === 'yawn' && e.state === 'idle') setFrame(e, 'stand'); }, 700); }
    rest(e);
  }
  function chase(e, p) {
    e.chase = p.id; setFrame(e, 'happy'); say(e, '！', 900);
    setState(e, 'walk');
    const away = p.x >= e.x ? 1 : -1;
    p.flee = true; cancel(p.next);
    walkTo(p, p.x + away * rand(60, 120));
    // Not caught soon: they give up.
    later(() => { if (e.chase === p.id) { e.chase = null; e.walking = false; if (e.state === 'walk') rest(e); } }, 5000);
  }

  // ---------- the user's hands ----------
  function grab(e, ev) {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    touched = Date.now();
    const w = wrap.getBoundingClientRect(), startX = ev.clientX, startY = ev.clientY, offX = ev.clientX - w.left - e.x, offY = ev.clientY - w.top - e.y;
    let held = false, done = false;
    const trail = [{x: ev.clientX, y: ev.clientY, t: now()}];
    try { e.el.setPointerCapture?.(ev.pointerId); } catch { /* fine without */ }
    const card = win.setTimeout(() => { if (!held && !done) { done = true; off(); onCard(e.id); } }, 550);
    const move = mv => {
      if (done) return;
      trail.push({x: mv.clientX, y: mv.clientY, t: now()});
      if (trail.length > 6) trail.shift();
      if (!held && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 6) return;
      if (!held) {
        held = true; win.clearTimeout(card); cancel(e.next);
        const r = riderOf(e);
        e.seat = null; e.on = null; e.chase = null; e.walking = false;
        setState(e, 'held'); setFrame(e, 'held'); e.el.classList.add('struggle');
        if (r) lower(r);
      }
      e.x = Math.max(0, Math.min(width() - PET_PX, mv.clientX - w.left - offX));
      e.y = Math.max(-8, Math.min(floor(), mv.clientY - w.top - offY));
      place(e);
    };
    const up = () => {
      if (done) return;
      done = true;
      win.clearTimeout(card);
      off();
      if (!held) return tap(e);
      e.el.classList.remove('struggle');
      // How fast it was going when let go: from the last tenth of a second of the drag.
      const end = trail.at(-1), from = trail.find(p => end.t - p.t <= 100) || trail[0], dt = Math.max(16, end.t - from.t) / 1000;
      const vx = (end.x - from.x) / dt, vy = (end.y - from.y) / dt;
      if (Math.hypot(vx, vy) > THROW && !reduced()) throwIt(e, vx, vy); else fall(e);
      onPlay(e.id, 3);
    };
    const off = () => { e.el.removeEventListener('pointermove', move); e.el.removeEventListener('pointerup', up); e.el.removeEventListener('pointercancel', up); };
    e.el.addEventListener('pointermove', move);
    e.el.addEventListener('pointerup', up);
    e.el.addEventListener('pointercancel', up);
  }
  function throwIt(e, vx, vy) {
    e.vx = Math.max(-1600, Math.min(1600, vx)); e.bounces = 0;
    if (Math.hypot(vx, vy) > 900) e.el.classList.add('tumble');
    fall(e, Math.max(-1600, Math.min(1600, vy)));
    e.vx = Math.max(-1600, Math.min(1600, vx));
    say(e, Math.random() < .5 ? '哇——' : '呀！', 1000);
  }
  /** A tap answers by how the pet is; a sleeper rubs its eyes. */
  function tap(e) {
    touched = Date.now();
    const mood = moodOf(e);
    cancel(e.next);
    if (e.state === 'sleep') { say(e, night() ? '……zzz？' : '……？'); return wake(e, true); }
    if (e.state === 'dizzy') { say(e, '晕……'); return; }
    if (mood === 'starving') { setFrame(e, 'sad'); say(e, '饿……'); return rest(e); }
    if (mood === 'hungry') { setFrame(e, 'sad'); say(e, '🍖'); onPlay(e.id, 1); return rest(e); }
    if (mood === 'sulky') { e.facing = -e.facing; place(e); setFrame(e, 'stand'); say(e, '哼'); onPlay(e.id, 1); return rest(e); }
    setFrame(e, 'happy');
    say(e, pick(['❤', '♪', '✨', '嘿嘿']));
    once(e, 'jump');
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
      if (['held', 'hop', 'fall', 'cling', 'dizzy'].includes(e.state) || moodOf(e) === 'starving' || riderOf(e) || e.watching) continue;
      if (e.state === 'sleep') { if (!big) continue; wake(e, true); }
      if (!big && Math.random() > .55) continue;
      say(e, big ? '！！' : '！');
      const at = target ? bubbles().find(b => b.el === target) : null;
      if (at && hopTo(e, at)) continue;
      if (target && wrap) { const r = target.getBoundingClientRect(), w = wrap.getBoundingClientRect(); walkTo(e, r.left - w.left + r.width / 2 - PET_PX / 2); }
    }
  }
  /** A keyword egg (生日快乐…): they jump. */
  function cheer() {
    if (!layer) return;
    for (const e of live.values()) {
      if (['held', 'fall', 'cling'].includes(e.state) || moodOf(e) === 'starving') continue;
      if (e.state === 'sleep') continue;
      setFrame(e, 'happy'); say(e, '🎉'); once(e, 'jump');
    }
  }
  /** Fed (from its card or the list): it eats, then is glad. */
  function fed(id) {
    const e = live.get(id);
    if (!e || ['held', 'fall', 'hop'].includes(e.state)) return;
    cancel(e.next);
    setState(e, 'idle');
    let n = 0;
    const chew = () => { setFrame(e, n % 2 ? 'blink' : 'eat'); if (++n < 6) later(chew, 200); else { setFrame(e, 'happy'); say(e, '😋'); later(() => rest(e), 900); } };
    chew();
  }
  /** The box the user writes in, in the layer's terms. */
  function boxSpan() {
    const el = box?.(), w = wrap?.getBoundingClientRect();
    if (!el?.isConnected || !w) return null;
    const r = el.getBoundingClientRect();
    return r.width ? {left: Math.max(4, r.left - w.left), right: Math.min(width() - PET_PX - 4, r.right - w.left - PET_PX)} : null;
  }
  function faceBox(e) { const b = boxSpan(); if (b) { e.facing = (b.left + b.right) / 2 > e.x ? 1 : -1; place(e); } }
  /** The user is writing: the ones up and about come and sit by the box, looking at it, until a while after the last key. */
  function typing(on = true) {
    if (!layer) return;
    if (!on) { typingUntil = 0; for (const e of live.values()) if (e.watching) { e.watching = false; if (e.state === 'idle') rest(e); } return; }
    const fresh = Date.now() >= typingUntil;
    typingUntil = Date.now() + 4000;
    cancel(typing.timer);
    typing.timer = later(() => { if (Date.now() >= typingUntil) typing(false); }, 4200);
    if (!fresh || reduced()) return;
    const span = boxSpan();
    if (!span) return;
    // (One sitting on a bubble comes down too; one carrying another, or riding one, stays.)
    const comers = [...live.values()].filter(e => !e.watching && ['idle', 'walk'].includes(e.state) && !riderOf(e) && !e.on && moodOf(e) !== 'starving');
    // Places along the box, past the ones already standing there (asleep, carrying another).
    const taken = [...live.values()].filter(p => !comers.includes(p) && onFloor(p)).map(p => p.x), spots = [];
    for (let x = span.left + 10; x <= span.right && spots.length < comers.length; x += PET_PX + 6) if (!taken.some(t => Math.abs(t - x) < PET_PX - 6)) spots.push(x);
    comers.forEach((e, i) => {
      e.watching = true; e.chase = null; e.walks = 0;
      const x = spots[i] ?? Math.min(span.right, span.left + 10 + i * (PET_PX + 6));
      if (e.seat) { e.watchAt = x; hopDown(e); return; }
      if (Math.abs(x - e.x) < 6) { setState(e, 'idle'); faceBox(e); setFrame(e, 'look'); cancel(e.next); return; }
      walkTo(e, x);
    });
  }
  /** Sent: the ones watching jump for it. */
  function sent() {
    if (!layer) return;
    for (const e of live.values()) {
      if (!e.watching) continue;
      setFrame(e, 'happy'); say(e, pick(['♪', '✈', '发出去啦']), 1200); once(e, 'jump');
      e.watching = false;
      later(() => { if (e.state === 'idle' && e.frame === 'happy') setFrame(e, 'stand'); rest(e); }, 900);
    }
    typingUntil = 0;
  }

  // ---------- z's from sleepers (one at a time, every few seconds) ----------
  function zLoop() {
    cancel(zTimer);
    zTimer = later(() => {
      const sleepers = [...live.values()].filter(e => e.state === 'sleep');
      if (sleepers.length && zel && !doc.hidden && !reduced() && typeof zel.animate === 'function') {
        const e = pick(sleepers), x = e.x + PET_PX * .62, y = e.y + 2;
        zel.textContent = Math.random() < .5 ? 'z' : 'Z';
        zel.animate([{opacity: 0, transform: `translate(${x}px, ${y}px) scale(.6)`}, {opacity: .9, offset: .2}, {opacity: 0, transform: `translate(${x + 14}px, ${y - 30}px) scale(1.1)`}], {duration: 3600, easing: 'ease-out'});
      }
      zLoop();
    }, 5000);
  }

  // ---------- where each was, kept per chat ----------
  const spotsKey = () => `st-iphonie-pet-spots:${key}`;
  function keep() {
    if (!key || !storage) return;
    win.clearTimeout(saveTimer);
    saveTimer = win.setTimeout(keepNow, 800);
  }
  function keepNow() {
    saveTimer = 0;
    if (!key || !storage || !layer) return;
    {
      const out = {}, wide = width();
      for (const e of live.values()) {
        if (['held', 'hop', 'fall', 'cling'].includes(e.state)) continue;
        const mid = e.seat?.closest?.('.msg[data-mid]')?.dataset.mid, r = e.seat?.getBoundingClientRect?.();
        out[e.id] = {x: Math.round(e.x / wide * 1000) / 1000, ...(mid && r?.width ? {mid, dx: Math.round(e.seatX / r.width * 1000) / 1000} : {}), ...(e.on ? {on: e.on, onDx: e.onDx} : {}), ...(e.state === 'sleep' ? {sleep: true} : {})};
      }
      try { storage.setItem(spotsKey(), JSON.stringify(out)); } catch { /* this visit only */ }
    }
  }
  function spots() { try { return JSON.parse(storage?.getItem(spotsKey()) || 'null') || {}; } catch { return {}; } }
  /** A new one is put where it was last time in this chat: its bubble if it is on the screen, else that spot of the floor. */
  function restore(e, at) {
    if (!at) return;
    e.x = Math.max(4, Math.min(width() - PET_PX - 4, (Number(at.x) || 0) * width()));
    const bubble = at.mid ? [...(msgs?.querySelectorAll('.msg[data-mid]') || [])].find(m => m.dataset.mid === at.mid)?.querySelector(BUBBLES) : null;
    if (bubble) { sitOn(e, bubble, (Number(at.dx) || 0) * bubble.getBoundingClientRect().width); const s = seatAt(e); if (s) { e.x = s.x; e.y = s.y; } else e.seat = null; }
    if (!e.seat) e.y = floor();
  }

  // ---------- on and off ----------
  function sync() {
    const list = pets().list, ids = new Set(list.map(p => p.id)), saved = spots(), added = [];
    for (const [id, e] of live) if (!ids.has(id)) { const r = riderOf(e); e.el.remove(); live.delete(id); if (r) lower(r); }
    for (const p of list) if (!live.has(p.id)) { const e = make(p); live.set(p.id, e); layer.append(e.el); restore(e, saved[p.id]); added.push(e); }
    // Riders after the ones they ride on.
    for (const e of added) { const at = saved[e.id]; if (at?.on && live.has(at.on) && !riderOf(live.get(at.on)) && height(live.get(at.on)) < STACK) { e.on = at.on; e.onDx = Number(at.onDx) || 0; } }
    for (const e of added) { if (e.on) carry(live.get(e.on)); place(e); if (saved[e.id]?.sleep) nap(e); else rest(e); }
    for (const p of list) { const e = live.get(p.id); if (e) e.el.setAttribute('aria-label', p.name); }
  }
  const onScroll = () => follow();
  const onVisible = () => { if (doc.hidden) { win.cancelAnimationFrame(raf); raf = 0; } else if (layer) for (const e of live.values()) if (MOVING.has(e.state)) start(); };
  /** wrap: .msgs-wrap; msgs: .msgs; key: the chat (where they were is kept by it); box(): the box the user writes in. */
  function attach(nextWrap, nextMsgs, {key: place = '', box: writer = null} = {}) {
    const p = pets();
    if (!nextWrap || !p.show || !p.list.length) return detach();
    box = writer;
    if (layer && wrap === nextWrap && layer.isConnected && key === place) { if (msgs !== nextMsgs) { msgs?.removeEventListener('scroll', onScroll); msgs = nextMsgs; msgs?.addEventListener('scroll', onScroll, {passive: true}); } sync(); follow(); return; }
    detach();
    wrap = nextWrap; msgs = nextMsgs; key = place; box = writer;
    layer = doc.createElement('div');
    layer.className = 'pet-layer';
    zel = doc.createElement('span');
    zel.className = 'pet-z';
    zel.setAttribute('aria-hidden', 'true');
    layer.append(zel);
    wrap.append(layer);
    msgs?.addEventListener('scroll', onScroll, {passive: true});
    doc.addEventListener('visibilitychange', onVisible);
    sync();
    zLoop();
  }
  function detach() {
    if (layer && saveTimer) { win.clearTimeout(saveTimer); keepNow(); }
    for (const t of timers) win.clearTimeout(t);
    timers.clear();
    for (const e of live.values()) { cancel(e.next); cancel(e.blink); win.clearTimeout(e.sayTimer); }
    live.clear();
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0; zTimer = 0; scrolling = 0; typingUntil = 0;
    msgs?.removeEventListener('scroll', onScroll);
    doc.removeEventListener('visibilitychange', onVisible);
    layer?.remove();
    layer = null; wrap = null; msgs = null; zel = null; box = null;
  }
  return {attach, detach, arrived, cheer, fed, typing, sent, get entities() { return live; }};
}

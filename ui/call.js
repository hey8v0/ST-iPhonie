// 来电: the full-screen call layer over the phone. It only draws what the tavern side reports (host-call.js) and sends
// the user's taps and words back: answer, decline, hang up, say something, ask again. While it rings, a ringtone is
// made with WebAudio (no sound files) and the phone vibrates where the browser allows it.
import {esc, avatar} from './common.js';
import {icon} from './icons.js';
import {motionLayer} from './wallpapers.js';
import {bloom, islandIn} from './carry.js';

// The moving background of the call screen: the phone skin's own wallpaper scene (day / night), laid out at random for
// each call like the home screen's moving wallpaper, instead of a repeating pattern.
const CALL_SCENES = {sky: ['clouds', 'stars'], aero: ['bubbles', 'aurora'], fresh: ['petals', 'fireflies']};

const clock = seconds => { const s = Math.max(0, Math.floor(seconds)), pad = n => String(n).padStart(2, '0'); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const ENDED = {answered: '通话结束', missed: '未接听', declined: '已拒绝', cancelled: '已取消'};

/** A ring made of short tones: incoming rings brightly, an outgoing call hears a slow ring-back. */
function ringtone(win, volume) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  if (!Ctx) return {start() {}, stop() {}};
  let audio = null, timer = 0, kind = '';
  const beep = (at, freq, length, level) => {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(level, at + .02); gain.gain.setValueAtTime(level, at + length - .05); gain.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + length + .02);
  };
  // Browsers only vibrate after the user has touched the page; before that, asking only logs a warning.
  const buzz = () => { try { if (win.navigator.userActivation?.hasBeenActive !== false) win.navigator.vibrate?.([400, 200, 400]); } catch { /* not allowed here */ } };
  const play = () => {
    if (!audio) return;
    const t = audio.currentTime + .05, level = Math.max(.02, Math.min(.25, volume() * .18));
    if (kind === 'in') [[0, 988], [.18, 1319], [.36, 988], [.54, 1319], [1.1, 988], [1.28, 1319], [1.46, 988], [1.64, 1319]].forEach(([d, f]) => beep(t + d, f, .16, level));
    else beep(t, 450, 1, level * .7);
  };
  return {
    start(which) {
      if (kind === which) return;
      this.stop();
      kind = which;
      try { audio = new Ctx(); audio.resume?.().catch(() => {}); } catch { audio = null; }
      play();
      timer = win.setInterval(() => { play(); if (kind === 'in') buzz(); }, which === 'in' ? 3000 : 3500);
      if (which === 'in') buzz();
    },
    stop() {
      if (kind === 'in' && win.navigator.userActivation?.hasBeenActive !== false) try { win.navigator.vibrate?.(0); } catch { /* ignore */ }
      kind = '';
      win.clearInterval(timer);
      audio?.close?.().catch?.(() => {});
      audio = null;
    }
  };
}

export function callScreen(ctx, host) {
  const {api, doc, win} = ctx;
  const layer = doc.createElement('section');
  layer.className = 'call-screen';
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '语音通话');
  host.append(layer);
  const tone = ringtone(win, () => api.getVolume?.() ?? 1);
  let call = null, tick = 0, hideTimer = 0, drawnKey = '', typed = '';

  const engine = name => ctx.engineOf?.(name) || 'none';
  function status(c) {
    if (c.state === 'ringing') return c.dir === 'in' ? '邀请你语音通话…' : '正在呼叫…';
    if (c.state === 'ended') return (ENDED[c.ended?.state] || '通话结束') + (c.ended?.duration ? ' ' + clock(c.ended.duration) : '');
    return clock((Date.now() - c.answeredAt) / 1000);
  }
  function note(c) {
    if (c.state !== 'talking') return '';
    if (c.error) return '';
    if (c.thinking) return `${c.name} 在想……`;
    if (c.speaking) return `${c.name} 正在说`;
    if (c.lines.at(-1)?.from === 'me') return `说完了点右边的气泡，${c.name} 才会回`;
    return c.voiced ? '轮到你了，打字说话' : `${c.name} 还没有配音，只显示字幕`;
  }
  // The contact's lines carry a small wave, like the story's: not played yet, being made, playing, played. A line
  // already heard plays again on a tap (not while the contact is thinking or speaking).
  const HEARD = {pending: '还没播', generating: '正在生成', playing: '正在播放', played: '播过了，点一下再听'};
  function linesHTML(c) {
    const shown = c.lines.slice(-8), from = c.lines.length - shown.length, free = c.state === 'talking' && !c.thinking && !c.speaking;
    return shown.map((l, i) => l.from === 'me'
      ? `<p class="cl me">${esc(l.text)}</p>`
      : `<p class="cl"${l.heard ? ` data-heard="${l.heard}" data-line="${from + i}"${free ? ' role="button" tabindex="0"' : ''} aria-label="${esc(HEARD[l.heard] || '')}：${esc(l.translation || l.text)}"` : ''}>${l.heard ? `<i class="cl-wave" aria-hidden="true"><b></b><b></b><b></b><b></b></i>` : ''}<span>${esc(l.translation || l.text)}</span>${l.text && l.translation && l.text !== l.translation ? `<small>${esc(l.text)}</small>` : ''}</p>`).join('');
  }
  // One layout per call (and per look), so answering does not reshuffle it.
  let backdrop = {key: '', html: ''};
  function background(id) {
    const rootEl = ctx.doc.documentElement, [day, night] = CALL_SCENES[rootEl.dataset.skin] || CALL_SCENES.sky, scene = rootEl.dataset.theme === 'dark' ? night : day, key = id + '|' + scene;
    if (backdrop.key !== key) backdrop = {key, html: motionLayer(scene, {random: true, className: 'call-motion'})};
    return backdrop.html;
  }
  function draw() {
    const c = call;
    if (!c) return;
    const talking = c.state === 'talking';
    // Typing survives redraws: only the parts that change are drawn again once the layout is there.
    const key = [c.id, c.state].join('|');
    if (key !== drawnKey) {
      drawnKey = key;
      layer.dataset.state = c.state;
      layer.dataset.engine = engine(c.name);
      layer.innerHTML = `<div class="call-bg" aria-hidden="true">${background(c.id)}</div>
        ${c.state !== 'ended' && api.close ? `<button type="button" class="call-mini" data-call="mini" aria-label="缩成小窗，回去看正文">${icon('down')}<span>小窗</span></button>` : ''}
        <div class="call-top"><div class="call-av${c.state === 'ringing' ? ' ringing' : ''}">${avatar(c.name, engine(c.name), talking ? 64 : 104)}</div><h2>${esc(c.name)}</h2><p class="call-status" data-call-status></p><p class="call-note" data-call-note></p></div>
        <div class="call-lines" data-call-lines aria-live="polite"></div>
        <div class="call-error" data-call-error hidden></div>
        ${talking ? `<form class="call-say" data-call-form><input data-call-input maxlength="1000" autocomplete="off" enterkeyhint="send" placeholder="说点什么……" aria-label="对 ${esc(c.name)} 说"><button class="call-send" type="submit"></button></form>` : ''}
        <div class="call-actions">${c.state === 'ringing' && c.dir === 'in'
          ? `<button class="call-btn decline" data-call="decline" aria-label="拒绝">${icon('phone', true)}<span>拒绝</span></button><button class="call-btn answer" data-call="answer" aria-label="接听">${icon('phone', true)}<span>接听</span></button>`
          : c.state === 'ended' ? '' : `<button class="call-btn decline" data-call="hangup" aria-label="${c.state === 'ringing' ? '取消' : '挂断'}">${icon('phone', true)}<span>${c.state === 'ringing' ? '取消' : '挂断'}</span></button>`}</div>`;
      const input = layer.querySelector('[data-call-input]');
      if (input) { input.value = typed; input.addEventListener('input', () => { typed = input.value; sendButton(); }); }
    }
    layer.querySelector('[data-call-status]').textContent = status(c);
    layer.querySelector('[data-call-note]').textContent = note(c);
    const lines = layer.querySelector('[data-call-lines]'), html = linesHTML(c);
    if (lines.innerHTML !== html) { lines.innerHTML = html; lines.scrollTop = lines.scrollHeight; }
    const error = layer.querySelector('[data-call-error]');
    error.hidden = !c.error;
    if (c.error) error.innerHTML = `<span>${esc(c.error)}</span><button data-call="retry">再说一次</button>`;
    sendButton();
  }
  // Same as the chat app: a paper plane while there is text (it only says it), a bubble when the box is empty (the
  // contact answers everything said so far).
  function sendButton() {
    const send = layer.querySelector('.call-send');
    if (!send || !call) return;
    const ask = !typed.trim(), label = ask ? `让${call.name}回话` : '说';
    if (send.dataset.mode !== (ask ? 'ask' : 'say')) {
      send.dataset.mode = ask ? 'ask' : 'say';
      send.classList.toggle('ask', ask);
      send.innerHTML = icon(ask ? 'bubble' : 'send');
      send.setAttribute('aria-label', label); send.title = label;
    }
    send.disabled = ask && !!call.thinking;
  }

  // The call comes out of the island and goes back into it when it is over (ui/carry.js).
  let move = null;
  const island = () => host.querySelector('.island');
  function update(next) {
    win.clearTimeout(hideTimer);
    call = next || null;
    if (!call) {
      tone.stop(); drawnKey = ''; win.clearInterval(tick); tick = 0;
      if (layer.hidden) return;
      move?.cancel();
      move = bloom(win, host, layer, islandIn(island(), layer), {back: true, paint: '#000'});
      if (!move) { layer.hidden = true; return; }
      const going = move;
      going.finished.then(ok => { if (!ok || move !== going) return; layer.hidden = true; going.cancel(); move = null; });
      return;
    }
    const appearing = layer.hidden || !!move;
    move?.cancel(); move = null;
    layer.hidden = false;
    if (appearing) { layer.dataset.carried = ''; move = bloom(win, host, layer, islandIn(island(), layer), {paint: '#000'}); const coming = move; coming?.finished.then(() => { if (move === coming) move = null; delete layer.dataset.carried; }); if (!coming) delete layer.dataset.carried; }
    if (call.state === 'ringing') tone.start(call.dir); else tone.stop();
    if (call.state === 'talking' && !tick) tick = win.setInterval(() => { if (call?.state === 'talking') layer.querySelector('[data-call-status]').textContent = status(call); }, 1000);
    if (call.state !== 'talking') { win.clearInterval(tick); tick = 0; }
    if (call.state === 'ended') { typed = ''; hideTimer = win.setTimeout(() => update(null), 1800); }
    draw();
    if (call.state === 'talking' && !call.thinking && win.matchMedia?.('(pointer:fine)').matches) layer.querySelector('[data-call-input]')?.focus({preventScroll: true});
  }

  const run = task => { try { const r = task(); r?.catch?.(e => ctx.notify(e.message, {error: true})); } catch (e) { ctx.notify(e.message, {error: true}); } };
  layer.addEventListener('click', e => {
    const b = e.target.closest('[data-call]');
    if (!b) return;
    const what = b.dataset.call;
    if (what === 'answer') run(() => api.callAnswer());
    if (what === 'decline' || what === 'hangup') run(() => call?.state === 'ringing' && call.dir === 'in' ? api.callDecline() : api.callHangup());
    if (what === 'retry') run(() => api.callRetry());
    if (what === 'mini') run(() => api.close());
  });
  const replay = el => { const line = el?.closest('.cl[data-line][role=button]'); if (line) run(() => api.callReplay?.(Number(line.dataset.line))); };
  layer.addEventListener('click', e => replay(e.target));
  layer.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.cl[data-line]')) { e.preventDefault(); replay(e.target); } });
  layer.addEventListener('submit', e => {
    e.preventDefault();
    const input = layer.querySelector('[data-call-input]'), words = input?.value.trim();
    if (!words) { if (call?.state === 'talking' && !call.thinking) run(() => api.callReply()); return; }
    input.value = ''; typed = ''; sendButton();
    run(() => api.callSay(words));
  });
  // Keys stay in the call: Escape does not close the phone under it.
  layer.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });

  return {
    update,
    get active() { return !!call && call.state !== 'ended'; },
    dispose() { tone.stop(); win.clearInterval(tick); win.clearTimeout(hideTimer); layer.remove(); }
  };
}

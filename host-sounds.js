// 音效 on the tavern page: plays the ambience and sound effects written into the story's replies (core/sounds.js) from
// the sound library (backend.sounds). An AudioContext of its own, so the voice player's volume and pauses do not touch it.
// - A new reply: its sounds play as fast as it is read (core readingGaps), each waiting while its place is still below
//   the screen. When its voice is played, the voice leads instead: the sounds before a line play as the line starts.
// - An ambience loops (its 底子, faded in and out) with its 点缀 now and then, until the next one or 停.
// - A name the library has none of: ElevenLabs makes it when that is on and the tag has an English description,
//   else it is noted under 缺的声音 in the 音效 App.
import {parseSounds, findSounds, pickSound, variation, soundNames, soundRule, soundPromptPlan, readingGaps, latestAmbience} from './core/sounds.js';

const FADE = 2.5, DOT_GAP = [8, 25], KEEP_BUFFERS = 40, LATE = 15000, VOICE_AGAIN = 60000;

export function createSoundHost({context, settings, backend, notice = () => {}, AudioContextClass = globalThis.AudioContext, doc = globalThis.document,
  random = Math.random, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id)}) {
  const opts = () => settings()?.sounds || {};
  const on = () => opts().enabled === true;
  let ctx = null, sfxOut = null, ambienceOut = null, rows = [], closed = false, told = false, voicing = null, preview = null;
  // The ambience playing: {name, src, gain, dots, timer}; wanted: the one asked for (it may wait for the browser to allow sound).
  let ambience = {name: ''}, wanted = '', ambienceTicket = 0;
  const buffers = new Map(), last = new Map(), plans = new Map(), fired = new Map(), fresh = new Set(), making = new Map();

  // ---------- The library ----------
  let loading = null;
  // Read only while 音效 is on: someone who never turns it on never loads the shipped pack's list.
  function reload() { if (!on()) { rows = []; loading = null; return Promise.resolve(rows); } loading = backend.listSounds().then(list => { if (!closed) rows = list; return rows; }).catch(() => rows); return loading; }
  const unsubscribe = backend.subscribe?.(event => {
    if (event.type === 'sounds' && !event.missing) { for (const id of buffers.keys()) if (!rows.some(r => r.id === id)) buffers.delete(id); reload(); }
    // Settings: the volumes, and the shipped pack turned on or off (or some of it taken out).
    if (event.type === 'settings') { refresh(); reload(); }
  });
  reload();

  // ---------- Sound out ----------
  function audio() {
    if (!ctx && AudioContextClass && !closed) {
      ctx = new AudioContextClass();
      sfxOut = ctx.createGain(); ambienceOut = ctx.createGain();
      sfxOut.connect(ctx.destination); ambienceOut.connect(ctx.destination);
      volumes(0);
    }
    return ctx;
  }
  const running = () => ctx?.state === 'running';
  function ramp(param, value, seconds) {
    const t = ctx.currentTime;
    try { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(value, t + Math.max(0.01, seconds)); } catch { param.value = value; }
  }
  function volumes(seconds = 0.2) { if (!ctx) return; ramp(sfxOut.gain, opts().sfxVolume ?? 0.8, seconds); ramp(ambienceOut.gain, opts().ambienceVolume ?? 0.45, seconds); }
  /** A tap or a key on the page: the browser lets sound start from here on, and an ambience waiting for it starts. */
  function unlock() {
    if (closed || (!on() && !preview)) return Promise.resolve(false);
    const c = audio();
    if (!c) return Promise.resolve(false);
    const go = () => { if (on() && wanted && wanted !== ambience.name) setAmbience(wanted); return running(); };
    return c.state === 'running' ? Promise.resolve(go()) : Promise.resolve(c.resume()).then(go, () => false);
  }
  function buffer(row) {
    if (!buffers.has(row.id)) {
      const job = backend.soundBlob(row.id).then(async blob => {
        if (!blob) throw Error('这个声音已经不在了');
        return ctx.decodeAudioData(await blob.arrayBuffer());
      });
      job.catch(() => buffers.delete(row.id));
      buffers.set(row.id, job);
      while (buffers.size > KEEP_BUFFERS) buffers.delete(buffers.keys().next().value);
    }
    return buffers.get(row.id);
  }
  /** Plays one sound once (a little different each time); resolves to its source node, or null. */
  async function shot(row, {strength = '', pan = 0, gain = 1, out = sfxOut} = {}) {
    if (!row || !running()) return null;
    let data;
    try { data = await buffer(row); } catch { return null; }
    if (closed || !running()) return null;
    const v = variation({strength, vary: opts().vary !== false, random});
    const src = ctx.createBufferSource(), level = ctx.createGain();
    src.buffer = data; src.playbackRate.value = v.rate; level.gain.value = v.gain * gain;
    src.connect(level);
    let tail = level;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; level.connect(p); tail = p; }
    tail.connect(out);
    src.onended = () => { try { src.disconnect(); level.disconnect(); tail.disconnect(); } catch {} };
    src.start();
    return src;
  }

  // ---------- Ambience ----------
  /**
   * A bed that loops without a seam: each pass fades out over its last seconds while the next one fades in from the
   * start (most recordings were not made to loop). The first pass starts at `offset`, and fades in with the whole bed.
   */
  function loopBed(data, out, offset) {
    const fade = Math.min(3, data.duration / 4), live = new Set();
    let timer = 0, stopped = false;
    function pass(from, fadeIn) {
      const src = ctx.createBufferSource(), level = ctx.createGain(), t = ctx.currentTime, rest = data.duration - from;
      src.buffer = data; src.connect(level); level.connect(out);
      try {
        level.gain.setValueAtTime(fadeIn ? 0 : 1, t);
        if (fadeIn) level.gain.linearRampToValueAtTime(1, t + fade);
        level.gain.setValueAtTime(1, t + Math.max(fade, rest - fade));
        level.gain.linearRampToValueAtTime(0, t + rest);
      } catch { /* a context without automation keeps it at 1 */ }
      src.onended = () => { live.delete(src); try { src.disconnect(); level.disconnect(); } catch {} };
      src.start(t, from);
      live.add(src);
      timer = setTimer(() => { if (!stopped && !closed) pass(0, true); }, Math.max(0.5, rest - fade) * 1000);
    }
    // Not so near the end that the first pass is over before the next one could come in.
    pass(Math.min(offset, Math.max(0, data.duration - 3 * fade)), false);
    return {stop() { stopped = true; clearTimer(timer); for (const src of live) { try { src.stop(); } catch {} } live.clear(); }};
  }
  function stopAmbience(seconds = FADE) {
    const old = ambience;
    ambience = {name: ''};
    if (old.timer) clearTimer(old.timer);
    if (old.src && ctx) {
      ramp(old.gain.gain, 0, seconds);
      const bed = old.src;
      setTimer(() => { try { bed.stop(); old.gain.disconnect(); } catch {} }, seconds * 1000 + 100);
    }
    if (old.name) changed();
  }
  /** Changes the ambience: '' stops it; the same one goes on as it is. describe: what ElevenLabs makes when it is missing. */
  async function setAmbience(name, {describe = ''} = {}) {
    wanted = name;
    if (!name) { stopAmbience(); return; }
    if (name === ambience.name) return;
    if (!running()) { if (!told) { told = true; notice('点一下页面任意位置，就能放出氛围音和音效（浏览器要先点一下才允许出声）'); } return; }
    const ticket = ++ambienceTicket;
    if (loading) await loading;
    let list = findSounds(rows, name, 'ambience');
    if (!list.length) {
      if (!describe || !canMake()) { stopAmbience(); missing('ambience', name, describe); return; }
      const row = await make('ambience', name, describe);
      if (!row || ticket !== ambienceTicket || wanted !== name) return;
      list = [row];
    } else more('ambience', name, describe, list);
    const beds = list.filter(r => r.layer !== 'dot'), dots = list.filter(r => r.layer === 'dot');
    const bed = pickSound(beds, {last: last.get('a:' + name), random});
    let src = null, gain = null;
    if (bed) {
      let data;
      try { data = await buffer(bed); } catch { data = null; }
      if (ticket !== ambienceTicket || closed || !running()) return;
      if (data) {
        last.set('a:' + name, bed.id);
        gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ambienceOut);
        // Each time from somewhere else in the recording, so the same rain does not always start the same way.
        src = loopBed(data, gain, opts().vary !== false ? random() * data.duration : 0);
        ramp(gain.gain, 1, FADE);
      }
    }
    if (ticket !== ambienceTicket) return;
    stopAmbience();
    ambience = {name, src, gain, dots, timer: 0};
    wanted = name;
    if (dots.length) dot(ambience);
    changed();
  }
  /** 点缀: one now and then, from a random side, at a random level. */
  function dot(current) {
    const wait = (DOT_GAP[0] + random() * (DOT_GAP[1] - DOT_GAP[0])) * 1000;
    current.timer = setTimer(() => {
      if (ambience !== current || closed) return;
      const row = pickSound(current.dots, {last: last.get('d:' + current.name), random});
      if (row) { last.set('d:' + current.name, row.id); shot(row, {pan: (random() - 0.5) * 1.2, gain: 0.5 + random() * 0.4, out: ambienceOut}); }
      dot(current);
    }, wait);
  }
  const changed = () => { try { backend.emit?.('sound-state', state()); } catch {} };

  // ---------- Missing sounds: ElevenLabs, or 缺的声音 ----------
  const canMake = () => opts().generate === true && !!backend.keyStatus?.('eleven');
  function missing(type, name, describe = '') { backend.noteMissing?.({type, name, describe}).catch(() => {}); }
  function make(type, name, describe) {
    const key = type + '|' + name;
    if (!making.has(key)) {
      const job = backend.generateSound({name, type, describe}).then(row => { if (!rows.some(r => r.id === row.id)) rows = [row, ...rows]; return row; })
        .catch(error => { notice(`没能生成「${name}」：${error.message}`); missing(type, name, describe); return null; })
        .finally(() => { making.delete(key); changed(); });
      making.set(key, job);
      changed();
    }
    return making.get(key);
  }
  /** A name only ElevenLabs made, with fewer versions than allowed: now and then one more (it is played next time). */
  function more(type, name, describe, list) {
    if (!canMake() || !list.every(r => r.source === 'eleven') || list.length >= (opts().versions || 1) || random() >= 0.35) return;
    const said = describe || list.find(r => r.describe)?.describe;
    if (said) make(type, list[0].name, said);
  }

  // ---------- One sound of a reply ----------
  async function cue(tag) {
    if (!on() || closed) return;
    if (tag.kind === 'ambience') return setAmbience(tag.stop ? '' : tag.name, {describe: tag.describe});
    if (!running()) { if (!told) { told = true; notice('点一下页面任意位置，就能放出氛围音和音效（浏览器要先点一下才允许出声）'); } return; }
    if (loading) await loading;
    let list = findSounds(rows, tag.name, 'sfx');
    if (!list.length) {
      if (!tag.describe || !canMake()) { missing('sfx', tag.name, tag.describe); return; }
      const asked = now(), row = await make('sfx', tag.name, tag.describe);
      // Made too late to belong to the moment: kept for next time.
      if (!row || now() - asked > LATE) return;
      list = [row];
    } else more('sfx', tag.name, tag.describe, list);
    const row = pickSound(list, {strength: tag.strength, last: last.get('s:' + tag.name), random});
    if (!row) return;
    last.set('s:' + tag.name, row.id);
    await shot(row, {strength: tag.strength});
  }
  /** Whether this sound of this reply already played lately (a reply read, then voiced: not twice). */
  function once(id, raw, tag, within = Infinity) {
    let f = fired.get(id);
    if (!f || f.raw !== raw) { f = {raw, at: new Map()}; fired.set(id, f); if (fired.size > 30) fired.delete(fired.keys().next().value); }
    const at = f.at.get(tag.index);
    if (at !== undefined && now() - at < within) return false;
    f.at.set(tag.index, now());
    return true;
  }

  /** Whether sounds play by themselves (reading, voice, another chat): not when they wait for a tap on their ♪. */
  const byItself = () => opts().tapOnly !== true;

  // ---------- A new reply, at reading pace ----------
  const message = id => context()?.chat?.[id];
  const rawOf = id => { const m = message(id); return m && !m.is_user && !m.is_system ? String(m.mes ?? '') : null; };
  /** Still below the screen: not read yet. */
  function below(id, index) {
    const el = doc?.querySelector?.(`#chat .mes[mesid="${id}"] [data-sttts-sound="${index}"]`);
    if (!el?.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect(), box = doc.querySelector('#chat')?.getBoundingClientRect?.(), bottom = Math.min(box?.bottom ?? Infinity, globalThis.innerHeight ?? Infinity);
    return r.height > 0 && r.top > bottom - 16;
  }
  function cancel(id) { const p = plans.get(id); if (p) { p.cancelled = true; clearTimer(p.timer); plans.delete(id); } }
  function cancelAll() { for (const id of [...plans.keys()]) cancel(id); }
  // A new reply is drawn right after it arrives; should the drawing not be announced, its sounds start anyway.
  function received(id) { if (!on() || !Number.isInteger(Number(id))) return; id = Number(id); fresh.add(id); setTimer(() => { if (fresh.has(id)) rendered(id); }, 1500); }
  /** The tavern drew a reply: a new one plays its sounds now. */
  function rendered(id) {
    id = Number(id);
    if (!fresh.delete(id) || !on()) return;
    const raw = rawOf(id);
    if (raw !== null) read(id, raw);
  }
  function read(id, raw) {
    const tags = parseSounds(raw);
    cancel(id);
    if (!tags.length) return;
    const gaps = readingGaps(raw, tags), plan = {cancelled: false, timer: 0};
    plans.set(id, plan);
    let i = 0, waited = 0;
    const step = () => {
      if (plan.cancelled || closed) return;
      if (rawOf(id) !== raw) { cancel(id); return; }
      const tag = tags[i];
      if (below(id, tag.index) && waited < 60000) { waited += 500; plan.timer = setTimer(step, 500); return; }
      waited = 0;
      if (byItself(tag) && once(id, raw, tag)) cue(tag);
      if (++i >= tags.length) { plans.delete(id); return; }
      plan.timer = setTimer(step, gaps[i] * 1000);
    };
    plan.timer = setTimer(step, gaps[0] * 1000);
  }

  // ---------- With the voice ----------
  /**
   * The voice player's state, with the reply it plays ({id, raw}) and that reply's lines: as a line starts, the sounds
   * between the line before it and this one play; when the whole reply has played, those after its last line.
   */
  function voice(status, snap, lines = []) {
    if (!on() || !snap || closed) return;
    const line = status?.line;
    if (status.phase === 'playing' && line && Number.isFinite(line.start)) {
      if (!voicing || voicing.id !== snap.id || voicing.raw !== snap.raw) { voicing = {id: snap.id, raw: snap.raw, tags: parseSounds(snap.raw), start: -1, index: -1}; cancel(snap.id); }
      if (voicing.start === line.start) return;
      voicing.start = line.start;
      const k = Number.isInteger(line.uiIndex) ? line.uiIndex : lines.findIndex(l => l.start === line.start);
      voicing.index = k;
      const from = k > 0 && lines[k - 1] ? lines[k - 1].end : 0;
      for (const tag of voicing.tags) if (tag.start >= from && tag.start < line.start && byItself(tag) && once(snap.id, snap.raw, tag, VOICE_AGAIN)) cue(tag);
      return;
    }
    if (status.phase === 'idle' && voicing && voicing.id === snap.id && voicing.raw === snap.raw && /^播放完成/.test(status.message || '')) {
      const lastLine = lines.at(-1);
      if (lastLine && voicing.index === lines.length - 1) for (const tag of voicing.tags) if (tag.start >= lastLine.end && byItself(tag) && once(snap.id, snap.raw, tag, VOICE_AGAIN)) cue(tag);
      voicing = null;
    }
  }

  // ---------- The chat, the settings, a tap ----------
  /** Another chat: the sounds of the old one stop, and the latest ambience of this one starts (when there is one). */
  function chatChanged() {
    cancelAll(); fresh.clear(); voicing = null;
    const chat = context()?.chat || [];
    const name = on() && byItself() ? latestAmbience(chat.slice(-30).filter(m => m && !m.is_user && !m.is_system).map(m => String(m.mes ?? ''))) : '';
    if (name) setAmbience(name); else { wanted = ''; stopAmbience(1); }
  }
  /** A message changed or went away: its sounds stop coming. */
  function messageChanged(id) { if (id === undefined) cancelAll(); else cancel(Number(id)); }
  function refresh() {
    volumes();
    if (!on()) { cancelAll(); fresh.clear(); wanted = ''; if (ambience.name) stopAmbience(1); }
  }
  /** A tap on a sound's chip in the chat: plays it again; an ambience's chip starts it, or stops it while it plays. */
  async function tap(id, index) {
    const raw = rawOf(Number(id)), tag = raw === null ? null : parseSounds(raw)[Number(index)];
    if (!tag || !on()) return;
    await unlock();
    if (tag.kind === 'ambience' && !tag.stop && ambience.name === tag.name) { wanted = ''; stopAmbience(1); return; }
    return cue(tag);
  }
  /** 试听 in the 音效 App: one sound as it is, once (again: stops it). */
  async function listen(soundId) {
    if (preview) { const p = preview; preview = null; try { p.stop(); } catch {} if (p.soundId === soundId) return false; }
    preview = {soundId, stop() {}};
    audio();
    try { await (ctx.state === 'running' ? null : ctx.resume()); } catch {}
    if (!running()) { preview = null; throw Error('浏览器还不让出声：点一下页面再试'); }
    if (loading) await loading;
    const row = rows.find(r => r.id === soundId) || (await backend.listSounds()).find(r => r.id === soundId);
    if (!row) { preview = null; throw Error('这个声音已经不在了'); }
    const src = await shot(row, {out: row.type === 'ambience' ? ambienceOut : sfxOut, strength: row.strength});
    if (!src) { preview = null; throw Error('这个声音放不出来（文件可能坏了，或者浏览器不支持这种格式）'); }
    const mine = {soundId, stop: () => { try { src.stop(); } catch {} }};
    preview = mine;
    src.addEventListener?.('ended', () => { if (preview === mine) preview = null; });
    return true;
  }
  /** For the 音效 App: the ambience now (or waiting for a tap), what is being made. */
  function state() {
    return {ambience: ambience.name || '', waiting: wanted && wanted !== ambience.name ? wanted : '', running: running(), making: [...making.keys()].map(k => k.split('|')[1])};
  }
  /** The rule for the story model ([] while 音效 is off, or there is nothing to play). */
  function promptPlan() {
    if (!on()) return [];
    return soundPromptPlan(soundRule({names: soundNames(rows), generate: canMake(), now: ambience.name || wanted || ''}));
  }
  function close() {
    closed = true; cancelAll(); unsubscribe?.();
    stopAmbience(0.05);
    try { preview?.stop(); } catch {}
    const c = ctx; ctx = null;
    setTimer(() => { try { c?.close(); } catch {} }, 200);
  }
  return {unlock, received, rendered, voice, chatChanged, messageChanged, refresh, tap, listen, state, promptPlan, close, stopAmbience: () => { wanted = ''; stopAmbience(1); }, reload, cue};
}

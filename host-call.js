// 来电, tavern side. One call at a time: it rings (the contact calling, or the user dialing), is answered, and each turn
// the contact's words are generated with the tavern's connected model (generateRaw) and read aloud with the contact's
// own voice through the normal player. A missed call gets a short voice message. When the call ends it is kept in
// the private chat with that contact. Nothing is written into the story.
import {buildCallRequest, parseCallReply, CALL_LIMITS} from './core/call.js';
import {chatContacts, activeChatPreset, messageLine, cleanTagged} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {storyLines} from './core/moments.js';
import {modelRules} from './core/state.js';

const DAY_KEY = 'st-iphonie-calls-day';
const today = () => new Date().toLocaleDateString('en-CA');

// timing (tests only): ring(), pick() give milliseconds instead of settings().calls.ring and a few random rings.
export function createCallHost({context, settings, backend, notice, ringing = () => {}, timing = {}, memory = null}) {
  let call = null, since = 0, ringTimer = 0, pickTimer = 0, seq = 0;

  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500);
  function card(name) {
    const c = context()?.characters?.find(ch => ch?.name === name);
    if (!c) return '';
    return [c.description, c.personality && '性格：' + c.personality].filter(Boolean).join('\n')
      .replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).slice(0, 2000);
  }
  function contactOf(name) {
    const s = settings(), c = chatContacts(s).find(x => x.name === name);
    if (!c) throw Error(`联系人里没有「${name}」`);
    return {name, persona: c.persona || '', card: c.persona ? '' : card(name), voice: c.voice && s.general.voiceEnabled !== false, language: c.language || s.general.defaultLanguage};
  }
  /** What the phone shows: a copy without timers. */
  const snapshot = () => call && structuredClone({id: call.id, name: call.name, dir: call.dir, state: call.state, since: call.since, answeredAt: call.answeredAt,
    lines: call.lines, thinking: call.thinking, speaking: call.speaking, voiced: call.voiced, error: call.error, ended: call.ended || null, auto: call.auto});
  const emit = () => backend.emit('call', {call: snapshot()});
  const live = id => call?.id === id && call.state !== 'ended';

  async function dmThread(name) {
    const existing = (await backend.threads()).find(t => t.type === 'dm' && t.members[0] === name);
    return existing || backend.chats.create({type: 'dm', members: [name], space: backend.spaceKey()});
  }
  /** Keeps the finished call in the private chat. A missed incoming call counts as unread. */
  async function keep(c, voicemail = []) {
    const thread = await dmThread(c.name);
    const duration = c.answeredAt ? Math.round((c.endedAt - c.answeredAt) / 1000) : 0;
    const message = {from: c.dir === 'in' ? c.name : 'me', kind: 'call', dir: c.dir, state: c.ended.state, duration, lines: c.lines, voicemail};
    const saved = await backend.chatMutate(thread.id, () => backend.chats.append(thread.id, [message], {read: !(c.dir === 'in' && c.ended.state === 'missed')}));
    memory?.after(thread.id);
    return saved;
  }

  function start(name, dir, {reason = '', auto = false} = {}) {
    if (call && call.state !== 'ended') throw Error(call.name === name ? `正在和${name}通话` : `正在和${call.name}通话，先挂断再打`);
    const contact = contactOf(name);
    clearTimeout(ringTimer); clearTimeout(pickTimer);
    call = {id: ++seq, name, dir, state: 'ringing', since: Date.now(), answeredAt: 0, lines: [], thinking: false, speaking: false, voiced: contact.voice, error: '', reason, auto, contact};
    return call;
  }

  /** The contact calls the user. Rings for settings().calls.ring seconds; unanswered, it becomes a missed call. */
  function ring(name, options = {}) {
    const c = start(name, 'in', options), id = c.id;
    ringTimer = setTimeout(() => { if (live(id) && call.state === 'ringing') end('missed').catch(() => {}); }, timing.ring?.() ?? settings().calls.ring * 1000);
    emit();
    ringing(name, options);
    return snapshot();
  }
  /** The user calls a contact, who picks up after a few rings. */
  function dial(name) {
    const c = start(name, 'out'), id = c.id;
    pickTimer = setTimeout(() => { if (live(id) && call.state === 'ringing') connect('outgoing'); }, timing.pick?.() ?? 2500 + Math.round(Math.random() * 2500));
    emit();
    return snapshot();
  }
  function answer() {
    if (!call || call.state !== 'ringing' || call.dir !== 'in') throw Error('现在没有来电');
    clearTimeout(ringTimer);
    connect('incoming');
    return snapshot();
  }
  function connect(mode) {
    call.state = 'talking';
    call.answeredAt = Date.now();
    emit();
    turn(mode).catch(() => {});
  }
  function decline() {
    if (!call || call.state !== 'ringing') throw Error('现在没有来电');
    return end(call.dir === 'in' ? 'declined' : 'cancelled');
  }
  function hangup() {
    if (!call || call.state === 'ended') return Promise.resolve(null);
    if (call.state === 'ringing') return end(call.dir === 'in' ? 'declined' : 'cancelled');
    return end('answered');
  }
  /**
   * What the user says. Like the chat app, saying only puts the words in the call, so the user can say several things
   * in a row; the contact answers when the user asks with reply().
   */
  function say(text) {
    const words = String(text || '').trim().slice(0, 1000);
    if (!words) throw Error('先说点什么');
    if (!call || call.state !== 'talking') throw Error('通话已经结束了');
    if (call.speaking) backend.player.stop('你插话了');
    call.lines.push({from: 'me', text: words, translation: words, emotion: 'calm'});
    if (call.lines.length > CALL_LIMITS.lines) call.lines = call.lines.slice(-CALL_LIMITS.lines);
    emit();
    return Promise.resolve(snapshot());
  }
  /** The contact answers everything said so far (or, when the user said nothing, goes on talking). */
  function reply() {
    if (!call || call.state !== 'talking') throw Error('通话已经结束了');
    if (call.thinking) throw Error(`${call.name}还在想，等一下`);
    if (call.speaking) backend.player.stop('你插话了');
    return turn('reply');
  }
  /** Asks again after a failed turn. */
  function retry() {
    if (!call || call.state !== 'talking' || call.thinking) return Promise.resolve();
    return turn(call.lines.some(l => l.from !== 'me') || call.lines.length ? 'reply' : call.dir === 'in' ? 'incoming' : 'outgoing');
  }

  async function ask(mode, c) {
    const ctx = context();
    const s = settings(), preset = activeChatPreset(s.chat), user = userName(), thread = (await backend.threads()).find(t => t.type === 'dm' && t.members[0] === c.name);
    const history = thread ? (await backend.chats.get(thread.id)).messages.filter(m => m.kind !== 'system' && m.kind !== 'call').slice(-CALL_LIMITS.history) : [];
    const voiceFormat = backend.voiceFormat(), story = storyLines(ctx.chat || [], preset, user);
    const lore = preset.lore === false ? '' : await worldInfoFor(context, {...loreOptions(preset), persona: userPersona(), characters: c.contact.persona || c.contact.card || '',
      texts: [c.name, c.reason, ...story.map(r => `${r.name}: ${r.text}`), ...history.map(m => messageLine(m, user)), ...c.lines.map(l => `${l.from === 'me' ? user : c.name}: ${l.translation || l.text}`)]});
    // 记忆: looked up on the call's first turn (with why the call was made and the last chat) and kept for the call.
    if (c.memory === undefined && memory && thread) {
      const full = await backend.chats.get(thread.id);
      c.memory = (await memory.contextFor(full, {query: [c.reason, ...history.slice(-4).map(m => messageLine(m, user))].filter(Boolean).join('\n')}).catch(() => ({text: ''}))).text;
    }
    const prompt = buildCallRequest({preset, mode, contact: c.contact, lines: c.lines, history, story, user, userPersona: userPersona(),
      voiceFormat, voiceRules: c.voiced ? modelRules(s, [c.name]) : '', reason: c.reason, lore, memory: c.memory || '', earlier: memory?.storyMemory() || ''});
    const text = cleanTagged(await backend.generateText(ctx, {prompt, trimNames: false}), preset.cleanTags);
    return parseCallReply(text, {name: c.name, user, voiceFormat, voiced: c.voiced});
  }

  /** One turn of the contact: generate, show, read aloud; hangs up afterwards when the contact wanted to. */
  async function turn(mode) {
    const c = call, id = c.id;
    c.thinking = true; c.error = '';
    emit();
    let found;
    try {
      found = await ask(mode, c);
      if (!found.lines.length && !found.hangup) throw Error(`没听清${c.name}说什么`);
    } catch (error) {
      if (!live(id)) return;
      c.thinking = false; c.error = (error.message || '这次没有回应') + '，可以点「再说一次」';
      emit();
      return;
    }
    if (!live(id)) return;
    c.thinking = false;
    const lines = found.lines.map(l => ({from: c.name, ...l}));
    c.lines.push(...lines);
    if (c.lines.length > CALL_LIMITS.lines) c.lines = c.lines.slice(-CALL_LIMITS.lines);
    emit();
    if (c.voiced && lines.length) {
      c.speaking = true; emit();
      try { await backend.player.start(lines.map(l => ({role: c.name, emotion: l.emotion, text: l.text, translation: l.translation, effect: 'phone'})), () => live(id)); } catch { /* the words are on screen */ }
      if (call?.id === id) { c.speaking = false; emit(); }
    }
    if (found.hangup && live(id)) {
      // A short pause after the last words, like a real hang-up.
      await new Promise(resolve => setTimeout(resolve, timing.hang?.() ?? (c.voiced ? 600 : 1800)));
      if (live(id)) await end('answered', {by: c.name});
    }
  }

  async function end(state, {by = 'me'} = {}) {
    const c = call;
    if (!c || c.state === 'ended') return null;
    clearTimeout(ringTimer); clearTimeout(pickTimer);
    if (c.speaking) backend.player.stop('通话已结束');
    c.state = 'ended'; c.speaking = false; c.thinking = false; c.endedAt = Date.now();
    c.ended = {state, by, duration: c.answeredAt ? Math.round((c.endedAt - c.answeredAt) / 1000) : 0};
    emit();
    let voicemail = [];
    if (state === 'missed' && c.dir === 'in') {
      notice(`${c.name} 的未接来电`);
      try { voicemail = (await ask('voicemail', c)).lines.slice(0, 3); } catch { /* a missed call without a message */ }
    }
    try { await keep(c, voicemail); } catch (error) { notice('通话记录没有存上：' + error.message); }
    return snapshot();
  }

  /** Counts finished story replies; every `every` of them a character may call, at most `dailyMax` a day. */
  async function storyReplied() {
    const o = settings().calls;
    if (!o.auto) { since = 0; return; }
    if (++since < o.every || (call && call.state !== 'ended')) return;
    since = 0;
    let day = {day: today(), n: 0};
    try { const saved = JSON.parse(localStorage.getItem(DAY_KEY) || 'null'); if (saved?.day === day.day) day = saved; } catch { /* no storage: count this session only */ }
    if (day.n >= o.dailyMax) return;
    const callers = backend.contacts().filter(c => c.source === 'role' && c.voice), now = context()?.name2;
    const name = callers.find(c => c.name === now)?.name || callers[Math.floor(Math.random() * callers.length)]?.name;
    if (!name) return;
    try {
      ring(name, {auto: true});
      day.n++;
      try { localStorage.setItem(DAY_KEY, JSON.stringify(day)); } catch { /* counted for this session */ }
    } catch { /* a call already going on */ }
  }

  function dispose() { clearTimeout(ringTimer); clearTimeout(pickTimer); if (call?.speaking) backend.player.stop(); call = null; }

  return {ring, dial, answer, decline, hangup, say, reply, retry, storyReplied, dispose, status: snapshot};
}

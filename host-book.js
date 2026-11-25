// 绘本 on the tavern page: what the phone's 绘本 app needs from the tavern — the story (its messages as steps with
// their pictures, whole lines), the text model (to retell it as a picture book), and the voices: a page read aloud (a
// voice line of the story in the voice already made for it, the 旁白 for the rest and for anyone without a voice), or
// made into sound for an export; and the book opened over the whole page to read (book-stage.js).
import {NARRATOR} from './core/narration.js';
import {parseSounds, soundNames} from './core/sounds.js';
import {findRoute} from './core/routes.js';
import {storyMessage} from './core/outgoing.js';
import {storyScript} from './core/book.js';
import {activeChatPreset, plainStory} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';

/**
 * steps(id): a message as the stage's steps (host-vn.js bookSteps); lines(id): the voice lines of a story reply as the
 * player takes them; voiced(line): whether a line has a voice; speech: the browser's speech (整篇朗读's system voice);
 * active(): the plugin is on. sprite(name, emotion): a character's 立绘 for a feeling (the 视觉小说's); closePanel():
 * puts the phone away; sounds(): the sound host (host-sounds.js), for a page's ambience and sound.
 */
export function createBookHost({context, settings, backend, steps, lines, voiced, speech, active = () => true, sprite = () => '', closePanel = () => {}, sounds = () => null, doc = globalThis.document, lore = worldInfoFor}) {
  const chat = () => context()?.chat || [];
  /** The open chat: {chat, title, length, user}. */
  function info() {
    const ctx = context();
    if (!ctx?.chat) throw Error('先在酒馆里打开一个聊天');
    const title = ctx.groupId ? ctx.groups?.find(g => String(g.id) === String(ctx.groupId))?.name || '群聊' : ctx.name2 || '';
    const group = ctx.groupId ? ctx.groups?.find(g => String(g.id) === String(ctx.groupId)) : null;
    const cards = group ? (ctx.characters || []).filter(card => group.members?.includes(card.avatar)) : [ctx.characters?.[ctx.characterId]];
    return {chat:String(ctx.getCurrentChatId?.() ?? ctx.chatId ?? ''), title, length:ctx.chat.length, user:ctx.name1 || '你',
      roles:cards.map(card => card?.name).filter(Boolean)};
  }
  /** The story from message `from` to `to` (both kept): [{id, user, name, steps}] (messages not in the story left out). */
  function source(from = 0, to = Infinity) {
    const list = chat(), out = [], end = Math.min(list.length - 1, to);
    for (let id = Math.max(0, from); id <= end; id++) {
      const m = list[id];
      if (!storyMessage(m)) continue;
      const s = steps(id);
      // The story's own sound tags go with it, by name (an ambience, a sound) when 音效 is on.
      const tags = s?.some(x => x.kind === 'sound') ? parseSounds(m.mes || '') : [];
      if (s?.length) out.push({id, user: !!m.is_user, name: String(m.name || ''), steps: s.filter(x => ['say', 'narrate', 'bg', 'sound'].includes(x.kind)).map(x => x.kind === 'sound' ? {kind: 'sound', sound: tags[x.index] ? {kind: tags[x.index].kind, name: tags[x.index].name, stop: !!tags[x.index].stop} : null} : {...x}).filter(x => x.kind !== 'sound' || x.sound)});
    }
    return {...info(), from: Math.max(0, from), to: end, messages: out};
  }
  function messages() {
    const scope = settings().narration;
    return chat().flatMap((m, id) => {
      if (!storyMessage(m)) return [];
      const preview = plainStory(m.mes || '', [], scope).slice(0, 78);
      return preview ? [{id, name:String(m.name || ''), preview}] : [];
    });
  }
  async function references({chat: expected, range, names = [], persona = false, world = false, skipBooks = [], skipEntries = [], extraBooks = [], script = ''} = {}) {
    const ctx = context(), current = () => String(context()?.getCurrentChatId?.() ?? context()?.chatId ?? '');
    if (expected !== undefined && current() !== expected) throw Error('酒馆剧情已切换，请重新选择参考资料');
    const state = settings(), people = [], user = String(ctx?.name1 || '你');
    for (const name of [...new Set(names)].slice(0, 12)) {
      if (typeof name !== 'string' || !name || name.length > 40) continue;
      const role = findRoute(state.routes, name), card = ctx?.characters?.find(row => row?.name === name);
      const desc = role?.persona || [card?.description || card?.data?.description, card?.personality || card?.data?.personality].filter(Boolean).join('\n');
      const details = [desc && desc.slice(0, 500), role?.appearance && '外貌：' + role.appearance.slice(0, 220)].filter(Boolean).join('\n');
      if (details) people.push(name + '：' + details.replaceAll('{{char}}', name).replaceAll('{{user}}', user));
    }
    const profile = persona ? String(ctx?.powerUserSettings?.persona_description || '').slice(0, 1400) : '';
    const before = Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= 0 && range[1] >= range[0]
      ? storyScript(source(Math.max(range[0], range[1] - 19), range[1]).messages).script.slice(-3500) : '';
    const preset = activeChatPreset(state.chat);
    const options = loreOptions(preset);
    const entryText = world ? await lore(context, {...options, strictFilter:true, max:3800,
      texts:[before], always:[String(script).slice(0, 10000), ...names], characters:people.join('\n'), persona:profile,
      skipBooks:[...new Set([...(options.skipBooks || []), ...skipBooks])],
      skipEntries:[...new Set([...(options.skipEntries || []), ...skipEntries])], extraBooks:[...new Set([...(preset.loreExtraBooks || []), ...extraBooks])]}) : '';
    if (current() !== (expected ?? String(ctx?.getCurrentChatId?.() ?? ctx?.chatId ?? '')) || ctx?.chat !== context()?.chat) throw Error('酒馆剧情已切换，请重新选择参考资料');
    return [people.length && '【角色设定】\n' + people.join('\n\n').slice(0, 3400), profile && '【User 人设 · ' + user + '】\n' + profile,
      before && '【前情】\n' + before.slice(-3100), entryText && '【世界书】\n' + entryText].filter(Boolean).join('\n\n');
  }
  /** The text model's answer to a system and a user prompt (the 绘本 written from the story). */
  async function write(system, user, {length = 8192} = {}) {
    const text = await backend.generateText(context(), {use: 'book', prompt: [{role: 'system', content: String(system)}, {role: 'user', content: String(user)}], trimNames: false, responseLength: length});
    if (!String(text || '').trim()) throw Error('文字模型没有回答，看看连接再试一次');
    return String(text);
  }
  /**
   * A page's lines as the player's queue: a line of the story ({from: {id, line}}) as that line (its voice already
   * made), a character with a voice as theirs, everything else as the 旁白 (整篇朗读's voice). Lines nobody can say
   * (no 旁白 voice and no system speech) are left out.
   */
  function queueOf(pageLines, from = null) {
    const s = settings(), narrate = s.narration?.voice === 'role' ? voiced({role: NARRATOR}) : !!speech;
    const out = [];
    (pageLines || []).forEach((l, k) => {
      const text = String(l?.text || '').trim();
      if (!text) return;
      const put = item => { out.push(item); from?.push(k); };
      if (l.from && Number.isInteger(l.from.id)) {
        const line = lines(l.from.id)?.[l.from.line];
        if (line && voiced(line)) { put({...line}); return; }
      }
      if (l.role && voiced({role: l.role})) { put({role: l.role, text, emotion: l.emotion || 'calm', translation: text}); return; }
      if (narrate) put({role: NARRATOR, narration: true, emotion: 'calm', text: l.role ? `${l.role}说：${text}` : text, translation: text});
    });
    return out;
  }
  /**
   * Reads a page aloud; resolves when it has been read (or stopped). False when nothing on it can be read. onLine(k):
   * line k of the page starts (its words come in as it is read).
   */
  async function read(pageLines, {onLine = null} = {}) {
    const from = [], queue = queueOf(pageLines, from);
    if (!queue.length) return false;
    if (queue.some(x => x.narration) && settings().narration?.voice !== 'role') speech?.prime?.();
    let last = -1, started = false;
    const off = onLine && backend.subscribe ? backend.subscribe(e => {
      if (e?.type !== 'playback' || !started || !['generating', 'playing'].includes(e.phase) || !Number.isInteger(e.index)) return;
      const k = from[e.index];
      if (k != null && k !== last) { last = k; try { onLine(k); } catch {} }
    }) : null;
    started = true;
    try { await backend.player.start(queue, () => active(), null, {ahead: true}); }
    finally { off?.(); }
    return true;
  }
  /**
   * A page's sound from the 音效 library (when 音效 is on): kind 'ambience' (it loops until another one or 停), 'sfx'
   * (once), or 'stop' (the ambience ends).
   */
  async function sound(kind, name = '') {
    const host = sounds?.();
    if (!host || settings().sounds?.enabled !== true) return false;
    if (kind === 'stop') { host.stopAmbience?.(); return true; }
    try { await host.unlock?.(); } catch {}
    await host.cue?.({kind: kind === 'ambience' ? 'ambience' : 'sfx', name: String(name || ''), strength: '', describe: '', stop: kind === 'ambience' && /^(停|stop)$/i.test(name)});
    return true;
  }
  /** The names the 音效 library has ({ambience: [], sfx: []}; none while 音效 is off), for the text model to choose from. */
  async function soundList() {
    if (settings().sounds?.enabled !== true || !backend.listSounds) return {ambience: [], sfx: []};
    const names = soundNames(await backend.listSounds().catch(() => []));
    return {ambience: names.ambience || [], sfx: names.sfx || []};
  }
  /**
   * The sound of a page's lines for an export: [Blob | null] by line — made now when not made before (it uses the
   * engine's quota like any voice). The 旁白 read by the browser's own speech cannot be kept: null there.
   */
  async function audio(pageLines, {signal} = {}) {
    const s = settings(), out = [];
    for (const l of queueOf(pageLines)) {
      if (signal?.aborted) break;
      if (l.narration && s.narration?.voice !== 'role') { out.push(null); continue; }
      const route = findRoute(s.routes, l.role);
      if (!route) { out.push(null); continue; }
      try { out.push((await backend.player.make(l, route, s, signal || new AbortController().signal))?.blob || null); } catch (error) { if (signal?.aborted) break; throw error; }
    }
    return out;
  }
  /** Whether the 旁白 has a voice that can be kept in a file (a 旁白 role), and whether it can be read at all. */
  const narration = () => { const s = settings(), role = s.narration?.voice === 'role'; return {kept: role && voiced({role: NARRATOR}), readable: role ? voiced({role: NARRATOR}) : !!speech}; };
  /** Opens a book over the whole tavern page at page `at`. */
  let stage = null, stageCode = null;
  async function open(id, at = 0) {
    const book = await backend.library.getBook(String(id || ''));
    if (!book) throw Error('这本绘本找不到了');
    // the reader (book-stage.js, its pages and effects, about 140 KB) is loaded the first time a book is opened
    const {openBookStage} = await (stageCode ||= import('./book-stage.js').catch(error => { stageCode = null; throw error; }));
    stage?.close();
    closePanel();
    const made = [];
    const absolute = url => /^(https?:|data:|blob:|\/)/.test(url) ? url : '/' + String(url).replace(/^\.?\//, '');
    const picture = async p => {
      if (p?.url) return absolute(p.url);
      const photo = p?.id ? await backend.library.getPhoto(p.id).catch(() => null) : null;
      if (!photo?.blob) return '';
      const u = URL.createObjectURL(photo.blob);
      made.push(u);
      return u;
    };
    stage = openBookStage({doc, book, at: Math.max(0, Number(at) || 0), picture, sprite, read: (pageLines, onLine) => read(pageLines, {onLine}), sound, stop: () => backend.player.stop(),
      onClose: () => { stage = null; backend.player.stop(); setTimeout(() => made.forEach(u => URL.revokeObjectURL(u)), 600); }});
    return true;
  }
  return {info, source, messages, references, write, read, audio, narration, open, sound, soundList, stop: () => backend.player.stop(), close: () => stage?.close(), get showing() { return !!stage; }};
}

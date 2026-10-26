// 绘本 on the tavern page: what the phone's 绘本 app needs from the tavern — the story (its messages as steps with
// their pictures, whole lines), the text model (to retell it as a picture book), and the voices: a page read aloud (a
// voice line of the story in the voice already made for it, the 旁白 for the rest and for anyone without a voice), or
// made into sound for an export; and the book opened over the whole page to read (book-stage.js).
import {NARRATOR} from './core/narration.js';
import {openBookStage} from './book-stage.js';
import {findRoute} from './core/routes.js';
import {storyMessage} from './core/outgoing.js';

/**
 * steps(id): a message as the stage's steps (host-vn.js bookSteps); lines(id): the voice lines of a story reply as the
 * player takes them; voiced(line): whether a line has a voice; speech: the browser's speech (整篇朗读's system voice);
 * active(): the plugin is on. sprite(name, emotion): a character's 立绘 for a feeling (the 视觉小说's); closePanel():
 * puts the phone away.
 */
export function createBookHost({context, settings, backend, steps, lines, voiced, speech, active = () => true, sprite = () => '', closePanel = () => {}, doc = globalThis.document}) {
  const chat = () => context()?.chat || [];
  /** The open chat: {chat, title, length, user}. */
  function info() {
    const ctx = context();
    if (!ctx?.chat) throw Error('先在酒馆里打开一个聊天');
    const title = ctx.groupId ? ctx.groups?.find(g => String(g.id) === String(ctx.groupId))?.name || '群聊' : ctx.name2 || '';
    return {chat: String(ctx.getCurrentChatId?.() ?? ctx.chatId ?? ''), title, length: ctx.chat.length, user: ctx.name1 || '你'};
  }
  /** The story from message `from` to `to` (both kept): [{id, user, name, steps}] (messages not in the story left out). */
  function source(from = 0, to = Infinity) {
    const list = chat(), out = [], end = Math.min(list.length - 1, to);
    for (let id = Math.max(0, from); id <= end; id++) {
      const m = list[id];
      if (!storyMessage(m)) continue;
      const s = steps(id);
      if (s?.length) out.push({id, user: !!m.is_user, name: String(m.name || ''), steps: s.filter(x => ['say', 'narrate', 'bg'].includes(x.kind)).map(x => ({...x}))});
    }
    return {...info(), from: Math.max(0, from), to: end, messages: out};
  }
  /** The text model's answer to a system and a user prompt (the 绘本 written from the story). */
  async function write(system, user, {length = 8192} = {}) {
    const text = await backend.generateText(context(), {prompt: [{role: 'system', content: String(system)}, {role: 'user', content: String(user)}], trimNames: false, responseLength: length});
    if (!String(text || '').trim()) throw Error('文字模型没有回答，看看连接再试一次');
    return String(text);
  }
  /**
   * A page's lines as the player's queue: a line of the story ({from: {id, line}}) as that line (its voice already
   * made), a character with a voice as theirs, everything else as the 旁白 (整篇朗读's voice). Lines nobody can say
   * (no 旁白 voice and no system speech) are left out.
   */
  function queueOf(pageLines) {
    const s = settings(), narrate = s.narration?.voice === 'role' ? voiced({role: NARRATOR}) : !!speech;
    const out = [];
    for (const l of pageLines || []) {
      const text = String(l?.text || '').trim();
      if (!text) continue;
      if (l.from && Number.isInteger(l.from.id)) {
        const line = lines(l.from.id)?.[l.from.line];
        if (line && voiced(line)) { out.push({...line}); continue; }
      }
      if (l.role && voiced({role: l.role})) { out.push({role: l.role, text, emotion: l.emotion || 'calm', translation: text}); continue; }
      if (narrate) out.push({role: NARRATOR, narration: true, emotion: 'calm', text: l.role ? `${l.role}说：${text}` : text, translation: text});
    }
    return out;
  }
  /** Reads a page aloud; resolves when it has been read (or stopped). False when nothing on it can be read. */
  async function read(pageLines) {
    const queue = queueOf(pageLines);
    if (!queue.length) return false;
    if (queue.some(x => x.narration) && settings().narration?.voice !== 'role') speech?.prime?.();
    await backend.player.start(queue, () => active(), null, {ahead: true});
    return true;
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
  let stage = null;
  async function open(id, at = 0) {
    const book = await backend.library.getBook(String(id || ''));
    if (!book) throw Error('这本绘本找不到了');
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
    stage = openBookStage({doc, book, at: Math.max(0, Number(at) || 0), picture, sprite, read, stop: () => backend.player.stop(),
      onClose: () => { stage = null; backend.player.stop(); setTimeout(() => made.forEach(u => URL.revokeObjectURL(u)), 600); }});
    return true;
  }
  return {info, source, write, read, audio, narration, open, stop: () => backend.player.stop(), close: () => stage?.close(), get showing() { return !!stage; }};
}

// What the story model is sent: the tavern's chat keeps every tag (waves and pictures are drawn from them),
// but the copies handed to the model can leave the tags out, so users need no regex of their own.
import {parseDialogue} from './protocol.js';
import {withoutPictures} from './draw.js';
import {withoutSounds} from './sounds.js';

/**
 * A message of the story: also one hidden from the model (/hide, or a summary plugin hiding old floors marks it
 * is_system), which can still be listened to and watched again; not the tavern's own notes (they carry extra.type).
 */
export const storyMessage = m => !!m && (!m.is_system || !m.extra?.type);
/** A character's reply of the story (hidden ones too). */
export const storyReply = m => storyMessage(m) && !m.is_user;

/** A reply with each voiced line turned back into its translation: “你好”<tts>A|calm|Hello</tts> → “你好”. */
export function withoutVoice(message, formats) {
  const text = String(message);
  if (!/<tts\b/i.test(text) && !formats.some(f => !/<tts\b/i.test(f))) return text;
  for (const format of formats) {
    let lines;
    try { lines = parseDialogue(text, format); } catch { continue; }
    if (!lines.length) continue;
    let out = '', at = 0;
    for (const line of lines) { out += text.slice(at, line.start) + (line.tagOnly ? '' : '“' + line.translation + '”'); at = line.end; }
    return out + text.slice(at);
  }
  return text;
}

/**
 * The chat for one story request, changed in place by replacing messages (never mutating them).
 * pictures: drop picture blocks. voice: drop voice tags; keepLatest leaves the newest reply that has voice lines
 * as it is, so the model still sees one example of the format. sounds: drop 音效 tags (the rule says how to write them).
 */
export function outgoingChat(chat, {pictures = true, voice = true, keepLatest = true, formats = [], sounds = true} = {}) {
  if (!Array.isArray(chat) || (!pictures && !sounds && !(voice && formats.length))) return chat;
  const voiced = m => !m?.is_user && typeof m?.mes === 'string' && withoutVoice(m.mes, formats) !== m.mes;
  let keep = -1;
  if (voice && keepLatest) for (let i = chat.length - 1; i >= 0; i--) if (voiced(chat[i])) { keep = i; break; }
  for (let i = 0; i < chat.length; i++) {
    const m = chat[i];
    if (typeof m?.mes !== 'string') continue;
    let mes = m.mes;
    if (pictures && /<img\b/i.test(mes)) mes = withoutPictures(mes);
    if (sounds && /<(?:sfx|ambience)\b/i.test(mes)) mes = withoutSounds(mes);
    if (voice && formats.length && i !== keep) mes = withoutVoice(mes, formats);
    if (mes !== m.mes) chat[i] = {...m, mes};
  }
  return chat;
}

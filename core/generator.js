// 生成器 (0.9.30): 开场白 (the user's old 酒馆助手 script, plus 「照这句改一改」), a User 人设 for the tavern, 接下来的走向
// (one picked steers the next story reply only) and 小剧场 (a script read with the roles' voices, or a card made of HTML),
// all with the phone's text connection, its 世界书 reading and the blocks of 系统提示词 (core/prompt-rule-defaults.js).
// 小剧场 are kept (theater:* documents in the apps store, part 'theater'). No DOM here.
import {promptText} from './prompt-rules.js';
import {parseDialogue} from './protocol.js';
import {NARRATOR} from './narration.js';

export const OPENING_LENGTHS = Object.freeze([['short', '简短', '约 150–250 字'], ['medium', '适中', '约 350–600 字'], ['long', '详细', '约 700–1000 字']]);
export const PERSONA_LENGTHS = Object.freeze([['short', '简短', '约 150 字'], ['medium', '适中', '约 300 字'], ['long', '详细', '约 600 字']]);
export const THEATER_LENGTHS = Object.freeze([['short', '短', '十来句'], ['medium', '中', '二十句左右'], ['long', '长', '三四十句']]);
export const GENERATOR_LIMITS = Object.freeze({brief: 500, focus: 200, wish: 500, opening: 8000, persona: 4000, name: 40, directions: 6, title: 40, direction: 300, theaters: 200, lines: 80, line: 600, html: 150000});
const L = GENERATOR_LIMITS;

const lengthOf = (list, key) => (list.find(x => x[0] === key) || list[1])[2];
const unthink = text => String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
const unfence = text => String(text ?? '').replace(/^\s*```[\w-]*[ \t]*\n?/, '').replace(/\n?```\s*$/, '').trim();
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const block = (value, max) => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const time = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const space = doc => ({...(doc?.space ? {space: String(doc.space).slice(0, 300)} : {}), ...(doc?.save ? {save: String(doc.save).slice(0, 400)} : {})});
const uuid = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);

/** The open card as the requests read it ({{char}} and {{user}} filled in): its name may be a person, a world or a tool. */
export function cardText(card, user = '我') {
  if (!card?.name) return '';
  const fill = text => String(text || '').replaceAll('{{char}}', card.name).replaceAll('{{user}}', user).trim();
  return [`名字（可能是人物名、世界名或工具名）：${card.name}`, card.description && `描述：${fill(card.description)}`, card.personality && `性格：${fill(card.personality)}`,
    card.scenario && `场景：${fill(card.scenario)}`, card.examples && `示例对话：${fill(card.examples)}`].filter(Boolean).join('\n').slice(0, 12000);
}
const greetings = (card, user) => (card?.greetings || []).slice(0, 3).map(g => block(String(g).replaceAll('{{char}}', card.name).replaceAll('{{user}}', user), 1500)).join('\n---\n');
const storyText = story => (story || []).map(s => `${s.name}：${s.text}`).join('\n');
/**
 * This card's people ([{name, persona}], 角色 App, or their own tavern card) as a request reads them. named: everyone,
 * a name alone where nothing is written (who not to be, in 人设); else only those with something written, and never
 * the open card's own character with nothing more than the card says.
 */
export function castText(cast = [], {card = null, named = false} = {}) {
  return (cast || []).filter(c => c?.name && (named || String(c.persona || '').trim()) && !(c.name === card?.name && !String(c.persona || '').trim()))
    .slice(0, 16).map(c => String(c.persona || '').trim() ? `- ${c.name}：${block(c.persona, 1200).replace(/\n+/g, ' ')}` : `- ${c.name}`).join('\n');
}

// ---------- 开场白 ----------
/** brief: the situation asked for ('' = 随机); before + wish: 「照这句改一改」 of a version. */
export function openingRequest({prompts = {}, card = null, user = '我', persona = '', lore = '', cast = [], brief = '', focus = '', length = 'medium', before = '', wish = ''}) {
  const values = {'用户': user, '角色卡': cardText(card, user), '人物': castText(cast, {card}), '已有开场白': greetings(card, user), '用户设定': String(persona || '').trim(), '世界书': String(lore || '').trim(),
    '情境': oneLine(brief, L.brief), '出场人物': oneLine(focus, L.focus), '篇幅': lengthOf(OPENING_LENGTHS, length), '原来的开场白': block(before, L.opening), '想怎么改': oneLine(wish, L.wish)};
  return [{role: 'system', content: promptText(prompts, 'opening', 'system', values)}, {role: 'user', content: promptText(prompts, 'opening', 'ask', values)}];
}
/** An opening as the model wrote it: its paragraphs, without a fence or a wrapping tag. */
export const cleanOpening = text => block(unfence(unthink(text)).replace(/^<(opening|开场白)>\s*([\s\S]*?)\s*<\/\1>$/i, '$2'), L.opening);

// ---------- User 人设 ----------
/**
 * A new 人设 (0.9.33: not the one in use, {{用户}}, nor one of this card's people, whose names it is given). persona:
 * the one in use, for who {{用户}} is when the new person is someone of theirs.
 */
export function personaRequest({prompts = {}, card = null, user = '我', persona = '', cast = [], lore = '', wish = '', length = 'medium'}) {
  const values = {'用户': user, '用户设定': String(persona || '').trim(), '角色卡': cardText(card, user), '人物': castText(cast, {card, named: true}), '世界书': String(lore || '').trim(), '想要': oneLine(wish, L.wish), '篇幅': lengthOf(PERSONA_LENGTHS, length)};
  return [{role: 'system', content: promptText(prompts, 'persona', 'system', values)}, {role: 'user', content: promptText(prompts, 'persona', 'ask', values)}];
}
/** The name a card-shaped 人设 carries: its <名字_CharacterCard> tag, else its 姓名 / 名字 line. */
const cardName = text => String(text).match(/^\s*<([^<>/\n]{1,40}?)_CharacterCard\s*>/i)?.[1] || String(text).match(/(?:^|\n)\s*(?:基本信息\s*[:：][^\n]*?)?(?:姓名|名字)\s*[:：]\s*([^\s，,。；;、（(\n]{1,20})/)?.[1] || '';
/**
 * {name, description}: from <name> and <persona>, or 「名字：…」 on the first line, or the whole answer as the 人设. A
 * card-shaped 人设 (<名字_CharacterCard>…) is kept whole, tags and all, and gives the name when <name> is missing.
 */
export function parsePersona(text) {
  const body = unfence(unthink(text)), tag = name => body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1];
  let name = oneLine(tag('name'), L.name), description = block(tag('persona') ?? '', L.persona);
  if (!description) {
    const rest = body.replace(/<name>[\s\S]*?<\/name>/i, '').trim(), lines = rest.split('\n'), first = lines[0]?.match(/^\s*(?:名字|姓名|name)\s*[:：]\s*(.+)$/i);
    if (first) { name = name || oneLine(first[1], L.name); description = block(lines.slice(1).join('\n').replace(/^\s*(?:人设|设定)\s*[:：]\s*/, ''), L.persona); }
    else description = block(rest.replace(/<\/?[a-z]+>/gi, ''), L.persona);
  }
  return {name: name || oneLine(cardName(description), L.name), description};
}

// ---------- 接下来的走向 ----------
export function directionsRequest({prompts = {}, card = null, user = '我', persona = '', lore = '', cast = [], earlier = '', story = [], count = 4, wish = ''}) {
  const values = {'用户': user, '角色卡': cardText(card, user), '人物': castText(cast, {card}), '用户设定': String(persona || '').trim(), '世界书': String(lore || '').trim(), '更早的剧情': String(earlier || '').trim(),
    '最近的剧情': storyText(story), '几个': count, '想要': oneLine(wish, L.wish)};
  return [{role: 'system', content: promptText(prompts, 'direction', 'system', values)}, {role: 'user', content: promptText(prompts, 'direction', 'ask', values)}];
}
/** [{title, text}] from lines like 「标题｜会发生什么」 (numbered or bulleted too); at most six. */
export function parseDirections(text) {
  const out = [];
  for (const raw of unfence(unthink(text)).split('\n')) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+\s*[.、)）]|[（(]\d+[)）])\s*/, '').replace(/\*\*/g, '').trim();
    if (!line) continue;
    const m = line.match(/^([^｜|：:]{1,20})\s*[｜|：:]\s*(.+)$/);
    const words = oneLine(m ? m[2] : line, L.direction);
    if (words) out.push({title: oneLine(m ? m[1] : '', L.title), text: words});
    if (out.length >= L.directions) break;
  }
  return out;
}
/** What the next story reply is told of the one picked. */
export const directionText = (prompts, d, user = '我') => promptText(prompts, 'direction', 'story', {'用户': user, '走向': d.title ? `${d.title}——${d.text}` : d.text});

// ---------- 小剧场 ----------
/**
 * form: {kind 'script' | 'card', source 'story' | 'card', length, wish, focus}. cast: [{name, persona}] who may be in it;
 * voiced: [{name, language}] of them with a voice (a script writes their lines as the story's voice lines).
 */
export function theaterRequest({prompts = {}, form = {}, card = null, user = '我', persona = '', lore = '', earlier = '', story = [], cast = [], voiced = [], voiceFormat = '', voiceRules = ''}) {
  const fromStory = form.source !== 'card', script = form.kind !== 'card';
  const values = {'用户': user, '角色卡': cardText(card, user), '用户设定': String(persona || '').trim(), '世界书': String(lore || '').trim(),
    '更早的剧情': fromStory ? String(earlier || '').trim() : '', '最近的剧情': fromStory ? storyText(story) : '', '来自剧情': fromStory, '剧本': script, '卡片': !script,
    '人物': cast.map(c => `- ${c.name}：${block(c.persona, 1200).replace(/\n+/g, ' ') || '（按角色卡和剧情里的表现来）'}`).join('\n'), '名单': [...new Set([...cast.map(c => c.name), user, NARRATOR])].join('、'),
    '语音': script && voiced.length > 0, '语音名单': voiced.map(v => v.name).join('、'), '语音格式': voiceFormat, '语音语言': voiced.map(v => `${v.name}说${v.language}`).join('，'),
    '朗读规则': script && voiced.length ? String(voiceRules || '').trim() : '', '篇幅': lengthOf(THEATER_LENGTHS, form.length), '想看什么': oneLine(form.wish, L.wish), '出场人物': oneLine(form.focus, L.focus)};
  return [{role: 'system', content: promptText(prompts, 'theater', 'system', values)}, {role: 'user', content: promptText(prompts, 'theater', 'ask', values)}];
}
const line = (role, text, translation = text, emotion = 'calm') => ({role, text: String(text).slice(0, L.line), translation: String(translation || text).slice(0, L.line), emotion: String(emotion || 'calm').slice(0, 40)});
/**
 * A 旁白 line as words. A voice tag the model put on it anyway gives the words it shows, never what is inside the tag
 * (its insides, 「旁白|calm|…」, used to be shown and read).
 */
function narrationWords(said, voiceFormat) {
  const found = voiceFormat ? parseDialogue(said, voiceFormat) : [];
  let outside = '', at = 0;
  for (const v of found) { outside += said.slice(at, v.start) + ' '; at = v.end; }
  outside = (outside + said.slice(at)).replace(/<tts\b[^>]*>[\s\S]*?<\/tts\s*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^[「“"『](.*)[」”"』]$/s, '$1').replace(/^[（(](.*)[)）]$/, '$1').trim();
  // The words outside the tag when there are any (「她转过身。<tts>…</tts>」), else what the tag shows.
  return oneLine(/[\p{L}\p{N}]/u.test(outside) ? outside : found.map(v => v.translation.trim() || v.text.trim()).join(' '), L.line);
}
/**
 * A 小剧场 as the model wrote it: {title, lines} for a script (旁白 lines marked narration; a voiced person's lines as the
 * story's voice lines, the others as plain words), {title, html} for a card.
 */
export function parseTheater(text, {kind = 'script', voiceFormat = '', voiced = []} = {}) {
  const body = unthink(text), title = oneLine(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '', L.title), rest = body.replace(/<title>[\s\S]*?<\/title>/i, '').trim();
  if (kind === 'card') {
    const html = (rest.match(/```html?[ \t]*\n([\s\S]*?)```/i)?.[1] ?? rest.match(/<(?:!doctype|html|body|div|section|article|main|style)\b[\s\S]*$/i)?.[0] ?? '').trim();
    if (!html) throw Error('模型没写出卡片，再试一次');
    return {title: title || '小剧场', html: html.slice(0, L.html)};
  }
  const lines = [], voice = new Set(voiced);
  for (const raw of rest.replace(/```[\w-]*\n?|```/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(/^\s*(?:\*\*)?([^:：\n]{1,40}?)(?:\*\*)?\s*[:：]\s*(.+)$/);
    // A voice line with nobody written in front: its tag says who.
    const lone = !m && voiceFormat ? parseDialogue(raw, voiceFormat)[0] : null, speaker = m ? m[1].trim() : String(lone?.role || '').trim();
    if (!speaker || speaker === NARRATOR) {
      const words = narrationWords(m ? m[2] : raw, voiceFormat);
      if (words) lines.push({role: NARRATOR, narration: true, text: words, translation: words, emotion: 'calm'});
    } else {
      const who = speaker, said = m ? m[2] : raw, v = voiceFormat ? parseDialogue(said, voiceFormat)[0] : null;
      if (v && (v.text.trim() || v.translation.trim())) {
        const spoken = v.text.trim(), shown = v.translation.trim() || spoken;
        lines.push(voice.has(who) && spoken ? line(who, spoken, shown, v.emotion) : line(who, shown, shown, v.emotion));
      } else {
        const plain = said.replace(/<[^>]+>/g, '').trim().replace(/^[「“"『](.*)[」”"』]$/s, '$1').trim();
        if (plain) lines.push(line(who, plain));
      }
    }
    if (lines.length >= L.lines) break;
  }
  if (!lines.some(l => !l.narration)) throw Error('模型没写出台词，再试一次');
  return {title: title || '小剧场', lines};
}
/** A 小剧场 kept: a script (its lines) or a card (its HTML), what it came from and the wish it was written for. */
export function cleanTheater(doc, now = Date.now()) {
  const form = doc?.form === 'card' ? 'card' : 'script';
  const lines = form === 'script' ? (Array.isArray(doc?.lines) ? doc.lines : []).slice(0, L.lines).filter(l => l && typeof l.text === 'string' && l.text.trim() && typeof l.role === 'string' && l.role.trim())
    .map(l => ({...line(l.role.trim().slice(0, 40), l.text, l.translation, l.emotion), ...(l.narration ? {narration: true} : {})})) : [];
  const html = form === 'card' ? String(doc?.html || '').slice(0, L.html) : '';
  if (form === 'script' ? !lines.length : !html.trim()) throw Error('这段小剧场是空的');
  const id = /^theater:[\w-]{4,80}$/.test(doc?.id || '') ? doc.id : 'theater:' + uuid();
  return {id, kind: 'theater', form, title: oneLine(doc?.title, L.title) || '小剧场', ...(form === 'script' ? {lines} : {html}), source: doc?.source === 'card' ? 'card' : 'story',
    wish: oneLine(doc?.wish, L.wish), at: time(doc?.at, now), ...space(doc)};
}

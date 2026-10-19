// 自动挑音色: a character met for the first time in the story gets a voice picked for them — from the user's 候选音色池
// (voices they trust, marked with gender, age and style) first, and only when none of those fits, from the engine's
// voice library searched by what the character sounds like. The text model picks; the route is marked as picked
// automatically so it can be changed in the 角色 App.
//
// 候选音色池 entry: {engine, voice, model, name, gender: 'female'|'male'|'', age: 'child'|'young'|'adult'|'old'|'', style}.
import {promptText} from './prompt-rules.js';

export const POOL_LIMIT = 200;
export const VOICE_GENDERS = Object.freeze({female: '女', male: '男'});
export const VOICE_AGES = Object.freeze({child: '孩子', young: '少年少女', adult: '成年', old: '老年'});
const ENGINES = ['fish', 'mini', 'eleven', 'mimo', 'doubao'];
const text = (value, max) => String(value ?? '').trim().slice(0, max);

export function normalizePool(list) {
  const out = [], seen = new Set();
  for (const v of Array.isArray(list) ? list : []) {
    const engine = ENGINES.includes(v?.engine) ? v.engine : '', voice = text(v?.voice, 2000);
    if (!engine || !voice || seen.has(engine + '\n' + voice)) continue;
    seen.add(engine + '\n' + voice);
    out.push({engine, voice, model: text(v.model, 120), name: text(v.name, 60) || voice.slice(0, 24),
      gender: VOICE_GENDERS[v.gender] ? v.gender : '', age: VOICE_AGES[v.age] ? v.age : '', style: text(v.style, 120)});
    if (out.length >= POOL_LIMIT) break;
  }
  return out;
}
// ---------- 音色池文件 ----------
const LANGUAGE_WORDS = {zh: '中文', ja: '日语', en: '英语', ko: '韩语', yue: '粤语', fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'};
/** Gender and age guessed from the words that describe a voice (少女、大叔、妈妈…); '' when they do not say or disagree. */
export function guessVoice(words) {
  const t = String(words ?? '').toLowerCase(), either = t.replace(/少年少女|男女|男声女声/g, '');
  const female = /女|妇|妹|姐|妈|母|娘|萝莉|阿姨|奶奶|婆|girl|female|woman|lady/.test(either), male = /男|叔|爷|爸|父|哥|弟|正太|少年|boy|\bmale|\bman\b|guy/.test(either);
  const age = /萝莉|正太|小孩|孩子|儿童|幼|child|kid/.test(t) ? 'child' : /奶奶|爷爷|老人|老年|老爷|婆婆|elder|old/.test(t) ? 'old'
    : /少女|少年|妹|青梅|学生|元气|萌|teen|young/.test(t) ? 'young' : /大叔|叔|妈|母亲|父亲|爸|少妇|成熟|御姐|阿姨|男性|女性|adult|mature/.test(t) ? 'adult' : '';
  return {gender: female === male ? '' : female ? 'female' : 'male', age};
}
/**
 * A voice pool file as pool entries: ST-iPhonie's own (st-iphonie-voice-pool), FishDialogue's voice library
 * (fish_dialogue_voice_library: Fish voices {id, name, category: language, sub: style, desc}), or a plain list.
 * Gender and age that the file does not give are guessed from its words.
 */
export function readPoolFile(source) {
  let data;
  try { data = typeof source === 'string' ? JSON.parse(source.replace(/^﻿/, '')) : source; } catch { throw Error('读不懂这个文件：要是 JSON 格式的音色池'); }
  const list = Array.isArray(data) ? data : Array.isArray(data?.voices) ? data.voices : Array.isArray(data?.pool) ? data.pool : null;
  if (!list) throw Error('这个文件里没有音色列表');
  const fish = data?.type === 'fish_dialogue_voice_library';
  const out = normalizePool(list.map(v => {
    if (!v || typeof v !== 'object') return null;
    const engine = ENGINES.includes(v.engine) ? v.engine : fish || !v.engine ? 'fish' : '';
    const language = LANGUAGE_WORDS[String(v.category || v.language || '').toLowerCase()] || '';
    const style = text(v.style, 120) || [v.sub, v.desc && v.desc !== v.name ? v.desc : '', language].map(x => text(x, 60)).filter(Boolean).join(' · ');
    const guess = guessVoice([v.name, v.sub, v.desc, v.style].join(' '));
    return {engine, voice: v.voice || v.id || v.reference_id || v.voice_id, model: v.model, name: v.name, gender: VOICE_GENDERS[v.gender] ? v.gender : guess.gender, age: VOICE_AGES[v.age] ? v.age : guess.age, style};
  }));
  if (!out.length) throw Error('这个文件里没有能用的音色（要有音色 ID）');
  return out;
}
/** The pool as a file to share. */
export const poolFile = pool => JSON.stringify({type: 'st-iphonie-voice-pool', version: 1, voices: normalizePool(pool)}, null, 2);

/** A pool entry as one line for the model: name, gender, age, style. */
export const poolLine = v => [v.name, VOICE_GENDERS[v.gender], VOICE_AGES[v.age], v.style].filter(Boolean).join(' · ');

/**
 * What is known of a character, for picking a voice: their card (when the tavern has one by that name), what they
 * said, and the story lines that mention them. Kept short (the model only needs gender, age and manner).
 */
export function voiceProfile({name, card = '', said = [], story = []}) {
  const lines = [`名字：${name}`];
  if (card.trim()) lines.push(`角色卡：${card.trim().slice(0, 800)}`);
  if (said.length) lines.push(`TA 说过的话：\n${said.slice(-6).map(s => '- ' + s).join('\n').slice(0, 600)}`);
  if (story.length) lines.push(`剧情里提到 TA 的地方：\n${story.slice(-8).map(s => '- ' + s).join('\n').slice(0, 1400)}`);
  return lines.join('\n\n');
}

/** Picking one of a list: {index (from 0), reason} by the reply, or null when the model found none fitting. */
export function pickRequest(profile, candidates, {prompts = {}, allowNone = true} = {}) {
  const list = candidates.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
  return [{role: 'system', content: promptText(prompts, 'auto-voice', 'pick', {'可以不选': allowNone})}, {role: 'user', content: `【角色】\n${profile}\n\n【候选音色】\n${list}\n\n挑一个：`}];
}
export function parsePick(reply, count) {
  const body = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
  const line = body.split('\n').map(l => l.trim()).filter(Boolean).find(l => /^(?:\d+|无)/.test(l.replace(/^[^\d无]*/, ''))) || '';
  const clean = line.replace(/^[^\d无]*/, '');
  if (!clean || /^无/.test(clean)) return null;
  const index = Number(clean.match(/^\d+/)?.[0]) - 1;
  if (!(index >= 0 && index < count)) return null;
  return {index, reason: clean.replace(/^\d+\s*[|｜:：.、]?\s*/, '').slice(0, 80)};
}

/** What to search a voice library for: {gender, age, words} by the model (words: a few short search terms). */
export function searchRequest(profile, engine, prompts = {}) {
  return [{role: 'system', content: promptText(prompts, 'auto-voice', 'search', {'Fish': engine === 'fish'})},
    {role: 'user', content: `【角色】\n${profile}\n\n要找什么样的声音？`}];
}
export function parseSearch(reply) {
  const line = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').split('\n').map(l => l.trim()).find(l => /[|｜]/.test(l)) || '';
  const [g = '', a = '', w = ''] = line.split(/[|｜]/).map(x => x.trim());
  const gender = /女|female/i.test(g) ? 'female' : /男|male/i.test(g) ? 'male' : '';
  const age = /孩|child|kid/i.test(a) ? 'child' : /少|young|teen/i.test(a) ? 'young' : /老|old|elder/i.test(a) ? 'old' : /成|adult/i.test(a) ? 'adult' : '';
  const words = w.split(/[、,，;；/]+/).map(x => x.trim()).filter(Boolean).slice(0, 4);
  return {gender, age, words};
}

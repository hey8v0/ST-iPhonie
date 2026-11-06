// 衣柜 (0.9.29): clothes for the user and for this card's roles (角色 App), outfits made of them or designed freely, and
// what each person wears. 穿上 tells the next story reply once (as 带进剧情 does); when the story changes someone's
// clothes it writes a hidden <outfit name="…">…</outfit> line, and the 衣柜 follows (no request of its own). No DOM here.
// Kept in the apps store (core/app-store.js) as wardrobe:* documents: wardrobe-item, wardrobe-set, wardrobe-wear.

import {promptText} from './prompt-rules.js';

export const WARDROBE_CATEGORIES = Object.freeze(['上衣', '下装', '外套', '连衣裙', '鞋', '配饰', '整套']);
export const WARDROBE_LIMITS = Object.freeze({items: 600, sets: 200, name: 40, description: 300, wear: 600, wish: 300, pool: 60, pieces: 12});
export const WARDROBE_KINDS = Object.freeze(['wardrobe-item', 'wardrobe-set', 'wardrobe-wear']);
/** Whose 衣柜: the user's own ('me') or a role's, by its name. */
export const ownerKey = name => name ? 'role:' + String(name).slice(0, 40) : 'me';
export const ownerName = (key, user = '我') => key === 'me' ? user : String(key || '').replace(/^role:/, '');

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const time = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const owner = value => /^(?:me|role:.{1,40})$/.test(String(value || '')) ? String(value) : '';
const space = doc => ({...(doc?.space ? {space: String(doc.space).slice(0, 300)} : {}), ...(doc?.save ? {save: String(doc.save).slice(0, 400)} : {})});

/** A piece of clothing: from a photo (photoId, recognized or written by hand) or only words. */
export function cleanItem(doc, now = Date.now()) {
  const who = owner(doc?.owner);
  if (!who) throw Error('这件衣服不知道是谁的');
  const description = clip(doc?.description, WARDROBE_LIMITS.description), photoId = clip(doc?.photoId, 200);
  if (!photoId && !description) throw Error('写一下这件衣服是什么样的');
  const id = /^wardrobe:item:[\w-]{4,80}$/.test(doc?.id) ? doc.id : 'wardrobe:item:' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  return {id, kind: 'wardrobe-item', owner: who, name: clip(doc?.name, WARDROBE_LIMITS.name) || (description ? description.slice(0, 12) : '衣物'),
    category: WARDROBE_CATEGORIES.includes(doc?.category) ? doc.category : '', description, ...(photoId ? {photoId} : {}),
    recognized: doc?.recognized === true, at: time(doc?.at, now), updatedAt: time(doc?.updatedAt, now), ...space(doc)};
}
/** An outfit kept (存成一套): its words (as long as what is worn), and the pieces it was made of when there were any. */
export function cleanSet(doc, now = Date.now()) {
  const who = owner(doc?.owner), description = clip(doc?.description, WARDROBE_LIMITS.wear);
  if (!who) throw Error('这套衣服不知道是谁的');
  if (!description) throw Error('这套衣服还没有描述');
  const id = /^wardrobe:set:[\w-]{4,80}$/.test(doc?.id) ? doc.id : 'wardrobe:set:' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const items = [...new Set((Array.isArray(doc?.items) ? doc.items : []).filter(x => /^wardrobe:item:/.test(x)))].slice(0, 30);
  return {id, kind: 'wardrobe-set', owner: who, name: clip(doc?.name, WARDROBE_LIMITS.name) || '一套搭配', description, items, at: time(doc?.at, now), updatedAt: time(doc?.updatedAt, now), ...space(doc)};
}
/**
 * What someone wears now: put on from the phone (pending until the next story reply has it) or changed by the story. One
 * a person in each 分区: key is the 分区 it is worn in ('' with 分区 off, where there is one); a kept one keeps its id.
 */
export function cleanWear(doc, now = Date.now()) {
  const who = owner(doc?.owner), text = clip(doc?.text, WARDROBE_LIMITS.wear);
  if (!who || !text) return null;
  const kept = doc?.key === undefined && /^wardrobe:wear:.{2,260}$/.test(doc?.id || ''), key = String(doc?.key || '').slice(0, 160);
  return {id: kept ? doc.id : 'wardrobe:wear:' + who + (key ? '@' + key : ''), kind: 'wardrobe-wear', owner: who, text, from: doc?.from === 'story' ? 'story' : 'phone',
    pending: doc?.pending === true, at: time(doc?.at, now), ...space(doc)};
}

// ---------- the model (the words are the 衣柜 block of 系统提示词, core/prompt-rule-defaults.js) ----------
/** Recognizing a photo of clothes: only what is seen, as JSON. */
export function recognizeRequest(image, prompts = {}) {
  return [{role: 'system', content: promptText(prompts, 'wardrobe', 'recognize', {'分类': WARDROBE_CATEGORIES.join('|')})},
    {role: 'user', content: [{type: 'text', text: '识别这张衣服的照片。'}, {type: 'image_url', image_url: {url: image}}]}];
}
/** {name, category, description} from what the model answered (a fenced or loose JSON, or plain words as the description). */
export function parseRecognition(text) {
  const raw = String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
  let obj = null;
  for (const candidate of [raw.replace(/^```(?:json)?\s*|\s*```$/g, ''), raw.match(/\{[\s\S]*\}/)?.[0]]) { try { obj = JSON.parse(candidate); break; } catch { /* next */ } }
  const description = clip(obj?.description ?? (obj ? '' : raw), WARDROBE_LIMITS.description);
  return {name: clip(obj?.name, WARDROBE_LIMITS.name), category: WARDROBE_CATEGORIES.includes(String(obj?.category || '').trim()) ? String(obj.category).trim() : '', description};
}
/**
 * Putting an outfit together: from the 衣柜 (the pieces picked, else all of them) or designed from the user's wish;
 * the scene of the story now, so it fits; the last one, not to repeat it. Answers 35–80 characters of plain words.
 */
export function suggestRequest({wearer, mode = 'closet', wish = '', pool = [], last = '', scene = '', prompts = {}}) {
  const values = {'穿的人': wearer, '从衣柜选': mode === 'closet', '衣物': pool.slice(0, WARDROBE_LIMITS.pool).map(x => `- ${x.name}：${x.description}`).join('\n'),
    '偏好': clip(wish, WARDROBE_LIMITS.wish), '场景': clip(scene, 600), '上一套': clip(last, 200)};
  return [{role: 'system', content: promptText(prompts, 'wardrobe', 'suggest', values)}, {role: 'user', content: promptText(prompts, 'wardrobe', 'suggestAsk', values)}];
}
/**
 * 存成一套 of an outfit designed freely (0.9.33): split into the pieces it is made of, so they go into the 衣柜 too. The
 * words are the 衣柜 block's 拆成单件.
 */
export function splitRequest(text, prompts = {}) {
  return [{role: 'system', content: promptText(prompts, 'wardrobe', 'split', {'分类': WARDROBE_CATEGORIES.join('|')})}, {role: 'user', content: '这套穿着：' + clip(text, WARDROBE_LIMITS.wear)}];
}
/** [{name, category, description}] from what the model answered: a JSON list (fenced, loose, or as {items}); at most 12. */
export function parseSplit(text) {
  const raw = String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
  let list = [];
  for (const candidate of [raw.replace(/^```(?:json)?\s*|\s*```$/g, ''), raw.match(/\[[\s\S]*\]/)?.[0], raw.match(/\{[\s\S]*\}/)?.[0]]) {
    try { const got = JSON.parse(candidate); list = Array.isArray(got) ? got : Array.isArray(got?.items) ? got.items : []; if (list.length) break; } catch { /* next */ }
  }
  return list.filter(x => x && typeof x === 'object').map(x => ({name: clip(x.name, WARDROBE_LIMITS.name), category: WARDROBE_CATEGORIES.includes(String(x.category || '').trim()) ? String(x.category).trim() : '',
    description: clip(x.description, WARDROBE_LIMITS.description)})).filter(x => x.description).slice(0, WARDROBE_LIMITS.pieces);
}
/** An outfit as the model answered it: plain words, one paragraph. */
export const cleanOutfit = text => String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^```\w*\s*|\s*```$/g, '').replace(/^[「“"]|[」”"]$/g, '').replace(/\s+/g, ' ').trim().slice(0, WARDROBE_LIMITS.wear);

// ---------- the story ----------
/** 穿上 for the next story reply: who wears what now (told once). */
export const wearText = (list, user = '我', prompts = {}) => list.length ? promptText(prompts, 'wardrobe', 'wear', {'衣着': list.map(w => `${ownerName(w.owner, user)}此刻穿着：${w.text}`).join('\n')}) : '';
/** The story's rule while the 衣柜 is in use: someone's clothes changed, a hidden line says what they wear now. */
export const outfitRule = (names, prompts = {}) => names.length ? promptText(prompts, 'wardrobe', 'rule', {'名单': names.join('、')}) : '';
const TAG = /<outfit\b([^>]*)>([\s\S]*?)<\/outfit\s*>/gi;
/** The <outfit> lines of a reply: [{name, text}], the last one of a name counting. */
export function parseOutfits(text) {
  const by = new Map();
  for (const m of String(text ?? '').matchAll(TAG)) {
    const name = m[1].match(/name\s*=\s*["'“”「『]?([^"'“”」』>]+)/)?.[1]?.trim(), words = clip(m[2].replace(/<[^>]+>/g, ''), WARDROBE_LIMITS.wear);
    if (name && words) by.set(name, words);
  }
  return [...by].map(([name, words]) => ({name, text: words}));
}
/** A reply as shown and read: the <outfit> lines left out (and the line they stood on). */
export const withoutOutfits = text => String(text ?? '').replace(/\n?[ \t]*<outfit\b[^>]*>[\s\S]*?<\/outfit\s*>[ \t]*/gi, '');

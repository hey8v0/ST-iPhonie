// 衣柜 (0.9.29): clothes for the user and for this card's roles (角色 App), outfits made of them or designed freely, and
// what each person wears. 穿上 tells the next story reply once (as 带进剧情 does); when the story changes someone's
// clothes it writes a hidden <outfit name="…">…</outfit> line, and the 衣柜 follows (no request of its own). No DOM here.
// Kept in the apps store (core/app-store.js) as wardrobe:* documents: wardrobe-item, wardrobe-set, wardrobe-wear.

export const WARDROBE_CATEGORIES = Object.freeze(['上衣', '下装', '外套', '连衣裙', '鞋', '配饰', '整套']);
export const WARDROBE_LIMITS = Object.freeze({items: 600, sets: 200, name: 40, description: 300, wear: 600, wish: 300, pool: 60});
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
/** An outfit kept (存成一套): its words, and the pieces it was made of when there were any. */
export function cleanSet(doc, now = Date.now()) {
  const who = owner(doc?.owner), description = clip(doc?.description, WARDROBE_LIMITS.description);
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

// ---------- the model ----------
/** Recognizing a photo of clothes: only what is seen, as JSON. */
export function recognizeRequest(image) {
  return [{role: 'system', content: `你在帮人整理衣柜。只依据图片里看得见的衣服，说出颜色、款式、材质或图案、鞋和配饰。单件就描述这一件；整身照描述看得见的整套。只输出 JSON：{"name":"简短名称（12 字以内）","category":"${WARDROBE_CATEGORIES.join('|')} 中的一个","description":"一两句精致准确的服装描述"}。不要猜人物是谁、品牌、季节，也不要写图片外的衣服。`},
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
export function suggestRequest({wearer, mode = 'closet', wish = '', pool = [], last = '', scene = ''}) {
  const system = `你是服装搭配师。只输出一段给角色扮演模型读的「${wearer}」此刻的穿着，35–80 个汉字：用静态描述交代上衣、下装、鞋或配饰、颜色和层次，语言精致具体。不写人物的动作、表情、心理、体貌和故事，不解释搭配理由，不要标题和列表。${mode === 'closet' ? '只能用下面给的衣物；衣物不够一整套时只写有的这些。' : ''}`;
  const parts = [mode === 'closet' ? `衣柜里能用的（只能用这些）：\n${pool.slice(0, WARDROBE_LIMITS.pool).map(x => `- ${x.name}：${x.description}`).join('\n')}\n挑一套协调的穿着。${wish ? `偏好：${clip(wish, WARDROBE_LIMITS.wish)}。` : ''}` : `想要的样子：${clip(wish, WARDROBE_LIMITS.wish)}。按这个设计一套，不用参考衣柜。`];
  if (scene) parts.push(`现在剧情里的场景（衣服要合适）：${clip(scene, 600)}`);
  if (last) parts.push(`上一次搭的是：${clip(last, 200)}。能换就换一套不一样的。`);
  return [{role: 'system', content: system}, {role: 'user', content: parts.join('\n\n')}];
}
/** An outfit as the model answered it: plain words, one paragraph. */
export const cleanOutfit = text => String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^```\w*\s*|\s*```$/g, '').replace(/^[「“"]|[」”"]$/g, '').replace(/\s+/g, ' ').trim().slice(0, WARDROBE_LIMITS.wear);

// ---------- the story ----------
/** 穿上 for the next story reply: who wears what now (told once). */
export const wearText = (list, user = '我') => list.length ? `【本轮的衣着】\n${list.map(w => `${ownerName(w.owner, user)}此刻穿着：${w.text}`).join('\n')}\n这些衣服只代表此刻；正文里换衣、脱衣、洗澡或睡觉时，按剧情自然改变。` : '';
/** The story's rule while the 衣柜 is in use: someone's clothes changed, a hidden line says what they wear now. */
export const outfitRule = names => names.length ? `【衣着变化】正文里有人换了衣服（换装、脱下外套、换上睡衣……）时，在回复最后为每个换了的人单独写一行 <outfit name="名字">现在穿着的完整描述（20–60 字）</outfit>；没有人换就不写。名字只用：${names.join('、')}。` : '';
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

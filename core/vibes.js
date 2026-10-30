// Vibe Transfer (NovelAI V3 / V4 / V4.5): reference images turned into "vibes" that steer the look of every picture.
// A vibe is kept in NovelAI's own .naiv4vibe form (identifier 'novelai-vibe-transfer', version 1): the image, a
// thumbnail, and its encodings per model and per 提取信息量 (information_extracted). Encoding an image costs 2 Anlas,
// once per model and 提取信息量; an encoding already in the file is reused for free. V3 takes the picture itself, not an
// encoding; V5 takes no vibes at all.
// Files read: .naiv4vibe, .naiv4vibebundle, 智绘姬 (st-chatu8) group exports {groups, vibeData, vibePresets}, images, and
// pictures that carry a vibe (their naidata text, as NovelAI writes it).
// Files written: .naiv4vibe (one), .naiv4vibebundle (a group), the 智绘姬 form (everything, with the groups), and either
// of the first two without the picture (encodings only) or inside a PNG.
import {sha256Hex} from './hash.js';
import {pngText, addPngText} from './png-text.js';

/** The key a model's encodings sit under in a .naiv4vibe; '' for models without vibes (V5, V3). */
export const VIBE_KEYS = Object.freeze({'nai-diffusion-4-5-full': 'v4-5full', 'nai-diffusion-4-5-curated': 'v4-5curated', 'nai-diffusion-4-full': 'v4full', 'nai-diffusion-4-curated-preview': 'v4curated'});
export const vibeKey = model => VIBE_KEYS[model] || '';
/** How a model takes vibes: 'encoded' (V4, V4.5), 'raw' (V3: the picture itself), '' (V5). */
export const vibeMode = model => VIBE_KEYS[model] ? 'encoded' : /^nai-diffusion-(furry-)?3/.test(model) ? 'raw' : '';
/** What a new vibe starts with, as NovelAI's app has it for the model in use. */
export const vibeDefaults = model => ({strength: 0.6, information_extracted: !vibeMode(model) || model === 'nai-diffusion-4-5-full' ? 0.7 : 1});
/** Up to four vibes a picture costs nothing extra; each one more adds 2 Anlas. Encoding also costs 2 Anlas. */
export const MAX_FREE_VIBES = 4;
export const VIBE_ANLAS = 2;
const SINGLE = 'novelai-vibe-transfer', BUNDLE = 'novelai-vibe-transfer-bundle';

const fail = message => Object.assign(Error(message), {code: 'VIBE'});
export const strength = (value, fallback = 0.6) => { const n = Number(value); return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : fallback; };
/** 提取信息量: (0, 1], 1 when unknown. */
export const extracted = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.round(Math.min(1, n) * 100) / 100 : 1; };
export const sha256 = text => sha256Hex(text);
/** NovelAI names an encoding variant by the hash of its parameters: sha256('information_extracted:1') for 1. */
export const variantKey = ie => sha256('information_extracted:' + String(extracted(ie)));
const firstEncoding = doc => Object.values(doc.encodings || {}).flatMap(v => Object.values(v)).find(v => v?.encoding)?.encoding || '';
const baseName = name => String(name || '').replace(/(\.(naiv4vibe|naiv4vibebundle|json|png|jpe?g|webp|avif|gif))+$/i, '').trim();
const uuidish = text => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) || /^[0-9a-f]{32,}$/i.test(text);

/** A vibe in the form kept and written: NovelAI's own, cleaned. Its id is NovelAI's: the hash of the image (or the encoding). */
export async function normalizeVibe(raw, fallbackName = 'Vibe') {
  if (!raw || typeof raw !== 'object' || raw.identifier !== SINGLE) throw fail('不是 NovelAI 的 Vibe 数据');
  const image = typeof raw.image === 'string' ? raw.image.replace(/^data:[^,]*,/, '').trim() : '';
  const info = raw.importInfo && typeof raw.importInfo === 'object' ? raw.importInfo : {};
  const encodings = {};
  for (const [key, variants] of Object.entries(raw.encodings && typeof raw.encodings === 'object' ? raw.encodings : {})) {
    if (!variants || typeof variants !== 'object') continue;
    for (const [variant, value] of Object.entries(variants)) {
      const encoding = typeof value?.encoding === 'string' ? value.encoding : typeof value?.encoding?.data === 'string' ? value.encoding.data : '';
      if (encoding) (encodings[key] ??= {})[variant] = {encoding, params: {information_extracted: extracted(value.params?.information_extracted ?? info.information_extracted)}};
    }
  }
  if (!image && !Object.keys(encodings).length) throw fail('这个 Vibe 里既没有图片也没有编码');
  const doc = {identifier: SINGLE, version: 1, type: image ? 'image' : 'encoding', ...(image ? {image} : {}), id: '', encodings,
    name: String(raw.name || '').trim().slice(0, 80) || fallbackName.slice(0, 80) || 'Vibe',
    ...(typeof raw.thumbnail === 'string' && /^data:image\/[^;]+;base64,/.test(raw.thumbnail) ? {thumbnail: raw.thumbnail} : {}),
    createdAt: Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
    importInfo: {model: typeof info.model === 'string' && info.model ? info.model : 'nai-diffusion-4-5-full', information_extracted: extracted(info.information_extracted), strength: strength(info.strength), ...(info.picked === true ? {picked: true} : {})}};
  // A file's own id is kept (a vibe whose picture was made small keeps the id of the picture it was made from).
  doc.id = typeof raw.id === 'string' && /^[0-9a-f]{64}$/.test(raw.id) ? raw.id : await sha256(image || firstEncoding(doc));
  return doc;
}

/** A vibe made from a picture: no encoding yet (the first use pays for it). model: the one in use, for its starting 提取信息量 (else 1). */
export async function imageVibe(name, base64, thumbnail = '', model = '') {
  return normalizeVibe({identifier: SINGLE, version: 1, type: 'image', image: base64, encodings: {}, name: baseName(name) || '图片', ...(thumbnail ? {thumbnail} : {}), importInfo: {model: vibeKey(model) ? model : 'nai-diffusion-4-5-full', information_extracted: model ? vibeDefaults(model).information_extracted : 1, strength: 0.6}});
}
/** A vibe known only by its encoding (read from a picture's parameters): it cannot be encoded again. */
export function encodingVibe(name, encoding, model, ie = 1, s = 0.6) {
  return normalizeVibe({identifier: SINGLE, version: 1, type: 'encoding', encodings: {[vibeKey(model)]: {unknown: {encoding, params: {information_extracted: extracted(ie)}}}}, name, importInfo: {model, information_extracted: extracted(ie), strength: strength(s)}});
}

/** Adds what `incoming` has and `doc` lacks (encodings, image, thumbnail); the kept name and strength stay. */
export function mergeVibe(doc, incoming) {
  const out = structuredClone(doc);
  for (const [key, variants] of Object.entries(incoming.encodings || {})) for (const [variant, value] of Object.entries(variants)) (out.encodings[key] ??= {})[variant] ??= value;
  if (!out.image && incoming.image) { out.image = incoming.image; out.type = 'image'; }
  if (!out.thumbnail && incoming.thumbnail) out.thumbnail = incoming.thumbnail;
  return out;
}

/**
 * What a file holds: {vibes: normalized docs, groups: [{name, items: [{id, strength}]}]}.
 * text: the file's text (JSON kinds). A picture comes through imageVibe instead.
 */
export async function readVibeFile(name, text) {
  let data;
  try { data = JSON.parse(text); } catch { throw fail('认不出这个文件：不是 Vibe 文件，也不是图片'); }
  if (data?.identifier === SINGLE) return {vibes: [await normalizeVibe(data, baseName(name))], groups: []};
  if (data?.identifier === BUNDLE) {
    if (!Array.isArray(data.vibes) || !data.vibes.length) throw fail('这个 Vibe 组文件是空的');
    const vibes = [];
    for (const [i, raw] of data.vibes.entries()) vibes.push(await normalizeVibe(raw, `${baseName(name)} ${i + 1}`));
    return {vibes, groups: [{name: baseName(name) || 'Vibe 组', items: vibes.map((v, i) => ({id: v.id, strength: strength(data.vibes[i]?.importInfo?.strength)}))}]};
  }
  // 智绘姬 (st-chatu8): {groups: {name: {vibes: [{vibeDataId, strength}]}}, vibeData: {key: vibe}, vibePresets: {name: {vibeDataId, strength}}}
  if (data && typeof data === 'object' && data.vibeData && typeof data.vibeData === 'object') {
    const ids = new Map(), docs = new Map();
    for (const [key, raw] of Object.entries(data.vibeData)) {
      try { const doc = await normalizeVibe(raw, uuidish(key) ? 'Vibe' : key); ids.set(key, doc.id); docs.set(doc.id, docs.has(doc.id) ? mergeVibe(docs.get(doc.id), doc) : doc); } catch { /* one bad entry does not stop the rest */ }
    }
    // A single saved vibe in 智绘姬 is a preset: its name (the one the user knows it by, over the file's own) and
    // strength go onto the vibe. Two presets of one vibe: the first names it.
    const named = new Set();
    for (const [key, preset] of Object.entries(data.vibePresets && typeof data.vibePresets === 'object' ? data.vibePresets : {})) {
      const doc = docs.get(ids.get(preset?.vibeDataId));
      if (!doc) continue;
      const presetName = String(preset.name || (uuidish(key) ? '' : key)).trim();
      if (presetName && !named.has(doc.id)) { doc.name = presetName.slice(0, 80); named.add(doc.id); }
      if (preset.strength !== undefined) doc.importInfo.strength = strength(preset.strength, doc.importInfo.strength);
    }
    const groups = Object.entries(data.groups && typeof data.groups === 'object' ? data.groups : {}).map(([groupName, group]) => ({
      name: String(group?.name || groupName).trim().slice(0, 40) || 'Vibe 组',
      items: (Array.isArray(group?.vibes) ? group.vibes : []).map(ref => ({id: ids.get(ref?.vibeDataId), strength: strength(ref?.strength)})).filter(item => item.id)
    })).filter(group => group.items.length);
    if (!docs.size) throw fail('这个文件里没有能用的 Vibe');
    // named: the vibes 智绘姬 has a name for, so a second import from it can bring those names over.
    return {vibes: [...docs.values()], groups, named: [...named]};
  }
  throw fail('认不出这个文件：支持 .naiv4vibe、.naiv4vibebundle、智绘姬导出的 Vibe 组和图片');
}

/**
 * The encoding to send for a model: the one at the vibe's own 提取信息量, else any for that model; '' when it needs
 * encoding. A 提取信息量 the user picked counts: a vibe with its picture is encoded for it rather than sent as something else.
 */
export function encodingFor(doc, key, ie = doc?.importInfo?.information_extracted) {
  const variants = key && doc?.encodings?.[key];
  if (!variants) return '';
  const list = Object.values(variants).filter(v => v?.encoding), exact = list.find(v => v.params?.information_extracted === extracted(ie));
  return (exact || (doc.image && doc.importInfo?.picked ? null : variants.unknown || list[0]))?.encoding || '';
}
/** Stores a new encoding on the vibe (a copy). */
export async function withEncoding(doc, key, ie, encoding) {
  const out = structuredClone(doc);
  (out.encodings[key] ??= {})[await variantKey(ie)] = {encoding, params: {information_extracted: extracted(ie)}};
  return out;
}

/** The small description kept beside each vibe: enough for the list and for knowing what a picture would cost. */
export function vibeSummary(doc) {
  return {id: doc.id, name: doc.name, thumb: doc.thumbnail || '', strength: doc.importInfo.strength, ie: doc.importInfo.information_extracted, image: !!doc.image,
    keys: Object.keys(doc.encodings).filter(key => Object.values(doc.encodings[key]).some(v => v?.encoding)),
    // The models that need no encoding at the 提取信息量 picked now, and the values each has been encoded at.
    ready: Object.keys(doc.encodings).filter(key => encodingFor(doc, key)),
    ies: Object.fromEntries(Object.keys(doc.encodings).map(key => [key, [...new Set(Object.values(doc.encodings[key]).filter(v => v?.encoding).map(v => v.params?.information_extracted))]]))};
}
/** Whether a summary has what a model needs, without paying (a summary saved before `ready` goes by `keys`). */
export const vibeReady = (summary, key) => (summary.ready || summary.keys || []).includes(key);

/** The request fields for the vibes, as NovelAI's own site sends them; strengths over 1 in total are scaled back to 1. */
export function vibeParameters(list, normalize = true) {
  const total = list.reduce((sum, v) => sum + Math.abs(v.strength), 0), scale = normalize && total > 1 ? 1 / total : 1;
  return {reference_image_multiple_cached: list.map(v => ({cache_secret_key: crypto.randomUUID(), data: v.encoding})),
    reference_strength_multiple: list.map(v => Math.round(v.strength * scale * 1000) / 1000), normalize_reference_strength_multiple: normalize};
}

/** V3's fields: the pictures themselves (fitted by the caller), each with its 提取信息量 and strength. list: [{image, ie, strength}]. */
export const rawVibeParameters = (list, normalize = true) => ({reference_image_multiple: list.map(v => v.image), reference_information_extracted_multiple: list.map(v => extracted(v.ie)),
  reference_strength_multiple: list.map(v => v.strength), normalize_reference_strength_multiple: normalize});

const forFile = (doc, s = doc.importInfo.strength) => { const {picked, ...info} = doc.importInfo; return {...structuredClone(doc), importInfo: {...info, strength: strength(s)}}; };
/**
 * A vibe as an encodings-only file holds it, for the model named: no picture or thumbnail, so it is small, but it cannot
 * be encoded again for another model or 提取信息量. null when it has no encoding for that model yet.
 */
export async function encodingsOnly(doc, model) {
  const key = vibeKey(model), encoding = encodingFor(doc, key);
  if (!encoding) return null;
  const ie = extracted(doc.importInfo.information_extracted);
  return {identifier: SINGLE, version: 1, type: 'encoding', id: await sha256(encoding), encodings: {[key]: {unknown: {encoding, params: {information_extracted: ie}}}}, name: doc.name, createdAt: doc.createdAt, importInfo: {...doc.importInfo, model}};
}
const utf8Base64 = text => { let out = ''; const bytes = new TextEncoder().encode(text); for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(out); };
/** A vibe file's text inside a PNG, where NovelAI's app looks for it. */
export const embedVibeFile = (buffer, text) => addPngText(buffer, 'naidata', utf8Base64(text));
/** The vibe file's text a picture carries, or null. */
export async function embeddedVibeFile(buffer) {
  const text = (await pngText(buffer)).naidata;
  if (!text) return null;
  try {
    const json = new TextDecoder().decode(Uint8Array.from(atob(text.trim()), c => c.charCodeAt(0))), data = JSON.parse(json);
    return data?.identifier === SINGLE || data?.identifier === BUNDLE ? json : null;
  } catch { return null; }
}
/** One vibe as a .naiv4vibe file's text. */
export const singleFile = (doc, s) => JSON.stringify(forFile(doc, s), null, 2);
/** A group as a .naiv4vibebundle file's text. entries: [{doc, strength}]. */
export const bundleFile = entries => JSON.stringify({identifier: BUNDLE, version: 1, vibes: entries.map(e => forFile(e.doc, e.strength))}, null, 2);
/** Everything in the 智绘姬 form: every vibe once, the groups by name, each vibe also as a single preset. */
export function chatu8File(groups, docs) {
  const used = new Set(), out = {groups: {}, vibeData: {}, vibePresets: {}, presetImages: {}};
  for (const group of groups) {
    let name = group.name, n = 1;
    while (used.has(name)) name = `${group.name} (${++n})`;
    used.add(name);
    out.groups[name] = {vibes: group.items.filter(i => docs.has(i.id)).map(i => ({vibeDataId: i.id, strength: strength(i.strength)})), createdAt: Date.now(), updatedAt: Date.now()};
  }
  const names = new Set();
  for (const doc of docs.values()) {
    out.vibeData[doc.id] = forFile(doc);
    let name = doc.name, n = 1;
    while (names.has(name)) name = `${doc.name} (${++n})`;
    names.add(name);
    out.vibePresets[name] = {model: doc.importInfo.model, infoExtract: doc.importInfo.information_extracted, strength: doc.importInfo.strength, vibeDataId: doc.id};
  }
  return JSON.stringify(out, null, 2);
}

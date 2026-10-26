// 模型 for the 视觉小说: a character can stand on the stage as a VRM model (one .vrm file, VRM 0.x or 1.0) or a Live2D
// model (Cubism 2, 3 or 4: a folder of files, uploaded as a .zip or picked as a folder and packed into one). The file
// is kept in the tavern (user/files), so every device sees it, like the 立绘. This file reads what a model is (which
// kind, which version, its 表情 and 动作), unpacks a Live2D zip, and works out the mouth from a voice's sound; the
// drawing is in vn-model.js.

// ---------- zip ----------
const u16 = (b, at) => b[at] | b[at + 1] << 8;
const u32 = (b, at) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
/** A zip's file names: UTF-8 when marked so (or when they read as UTF-8), else GBK (zips made on Chinese Windows). */
function zipName(bytes, utf8) {
  if (!utf8) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch {}
    try { return new TextDecoder('gbk').decode(bytes); } catch {}
  }
  return new TextDecoder().decode(bytes);
}
/** a\b\..\c → a/c, without a leading ./ or /. */
export function cleanPath(path) {
  const out = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}
async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/**
 * The files of a zip: Map(path → {size, bytes(): Promise<Uint8Array>}), folders and macOS leftovers left out. Stored and
 * deflated entries are read; anything else (an encrypted zip, zip64, another method) is an error that says so.
 */
export function readZip(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('这不是一个能读的 zip 压缩包');
  const count = u16(b, end + 10);
  let at = u32(b, end + 16);
  if (at === 0xffffffff || count === 0xffff) throw Error('压缩包太大（zip64），请重新压缩成普通的 zip');
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(b, at) !== 0x02014b50) throw Error('压缩包的目录坏了');
    const flags = u16(b, at + 8), method = u16(b, at + 10), packed = u32(b, at + 20), size = u32(b, at + 24);
    const nameLen = u16(b, at + 28), extraLen = u16(b, at + 30), noteLen = u16(b, at + 32), local = u32(b, at + 42);
    const name = zipName(b.subarray(at + 46, at + 46 + nameLen), (flags & 0x800) !== 0), path = cleanPath(name);
    at += 46 + nameLen + extraLen + noteLen;
    // Folders are entries too (their names end in /).
    if (!path || /[/\\]$/.test(name) || /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(path) || /(^|\/)\._/.test(path)) continue;
    if (flags & 1) throw Error('压缩包有密码，请解开以后重新压缩');
    if (method !== 0 && method !== 8) throw Error('压缩包用了读不了的压缩方式，请用「存储」或普通 zip 重新压缩');
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28), data = b.subarray(start, start + packed);
    let made = null;
    files.set(path, {size, bytes: () => made ??= method === 0 ? Promise.resolve(data.slice()) : inflate(data)});
  }
  return files;
}
let CRC = null;
function crc32(b) {
  CRC ??= Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ c >>> 8;
  return (c ^ 0xffffffff) >>> 0;
}
/** Files ([{path, bytes}]) packed into one zip, stored as they are (a picked folder becomes one file to keep). */
export function writeZip(list) {
  const enc = new TextEncoder(), parts = [], dir = [];
  let offset = 0;
  const head = (sig, size) => { const h = new Uint8Array(size), v = new DataView(h.buffer); v.setUint32(0, sig, true); return [h, v]; };
  for (const f of list) {
    const name = enc.encode(cleanPath(f.path)), data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes), crc = crc32(data);
    const [h, v] = head(0x04034b50, 30);
    v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
    parts.push(h, name, data);
    const [c, w] = head(0x02014b50, 46);
    w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x800, true); w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true); w.setUint16(28, name.length, true); w.setUint32(42, offset, true);
    dir.push(c, name);
    offset += 30 + name.length + data.length;
  }
  const size = dir.reduce((n, p) => n + p.length, 0), [e, x] = head(0x06054b50, 22);
  x.setUint16(8, list.length, true); x.setUint16(10, list.length, true); x.setUint32(12, size, true); x.setUint32(16, offset, true);
  return new Blob([...parts, ...dir, e], {type: 'application/zip'});
}

// ---------- what a model is ----------
/** The JSON chunk of a .vrm / .glb. */
export function glbJson(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 20 || u32(b, 0) !== 0x46546c67) throw Error('这不是 VRM 文件');
  const length = u32(b, 12);
  if (u32(b, 16) !== 0x4e4f534a) throw Error('VRM 文件坏了');
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + length)));
}
const LICENSE = {Redistribution_Prohibited: '禁止再分发', CC0: 'CC0', CC_BY: 'CC BY', CC_BY_NC: 'CC BY-NC', CC_BY_SA: 'CC BY-SA', CC_BY_NC_SA: 'CC BY-NC-SA', CC_BY_ND: 'CC BY-ND', CC_BY_NC_ND: 'CC BY-NC-ND', Other: '其他'};
/** A VRM's version ('0' or '1'), title, author, licence and the 表情 it has (VRM 1.0 names). */
export function vrmInfo(input) {
  const j = glbJson(input), e = j.extensions || {};
  if (e.VRMC_vrm) {
    const v = e.VRMC_vrm, m = v.meta || {};
    return {kind: 'vrm', version: '1', title: String(m.name || ''), author: [].concat(m.authors || []).join('、'), license: m.licenseUrl ? 'VRM 1.0 授权' : '',
      expressions: [...Object.keys(v.expressions?.preset || {}), ...Object.keys(v.expressions?.custom || {})]};
  }
  if (e.VRM) {
    const v = e.VRM, m = v.meta || {};
    // VRM 0.x names, the way three-vrm turns them into 1.0's (joy → happy …); the unnamed ones keep their own name.
    const RENAME = {a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh', joy: 'happy', sorrow: 'sad', fun: 'relaxed', blink_l: 'blinkLeft', blink_r: 'blinkRight', lookup: 'lookUp', lookdown: 'lookDown', lookleft: 'lookLeft', lookright: 'lookRight'};
    const expressions = (v.blendShapeMaster?.blendShapeGroups || []).map(g => g.presetName && g.presetName !== 'unknown' ? RENAME[g.presetName] || g.presetName : String(g.name || '')).filter(Boolean);
    return {kind: 'vrm', version: '0', title: String(m.title || ''), author: String(m.author || ''), license: LICENSE[m.licenseName] || String(m.licenseName || ''), expressions: [...new Set(expressions)]};
  }
  throw Error('这个文件是 glTF，但不是 VRM 模型');
}
const isSettings = path => /\.model3\.json$/i.test(path) || /(^|\/)[^/]*\.?model\.json$/i.test(path);
/**
 * A Live2D model in a zip's files: the settings file (the shallowest *.model3.json, else *.model.json), its version
 * (2 for Cubism 2, 4 for Cubism 3 and 4), the settings read, and its 表情 and 动作 groups.
 */
export async function live2dInfo(files) {
  const paths = [...files.keys()].filter(isSettings).sort((a, b) => a.split('/').length - b.split('/').length || /model3/i.test(b) - /model3/i.test(a) || a.length - b.length);
  if (!paths.length) throw Error('压缩包里没找到 Live2D 模型（要有 .model3.json 或 .model.json）');
  const path = paths[0];
  let json;
  try { json = JSON.parse(new TextDecoder().decode(await files.get(path).bytes()).replace(/^﻿/, '')); } catch { throw Error(`读不了 ${path}`); }
  const four = !!json.FileReferences, refs = four ? json.FileReferences : json;
  if (four ? !refs.Moc : !refs.model) throw Error(`${path} 里没写模型文件`);
  const listed = ((four ? refs.Expressions : json.expressions) || []).filter(x => x && typeof x === 'object');
  const named = new Set(listed.map(x => resolveIn(files, path, four ? x.File : x.file)).filter(Boolean));
  // Expression files in the zip that the settings do not name (VTube Studio keeps its own list, and a 捏人 model's look
  // is often one of them): they are the model's too.
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '', ext = four ? /\.exp3\.json$/i : /\.exp\.json$/i;
  const extra = [...files.keys()].filter(f => f.startsWith(dir) && ext.test(f) && !named.has(f)).map(f => ({name: f.split('/').pop().replace(ext, ''), file: f.slice(dir.length)}));
  const expressions = [...listed.map((x, i) => String((four ? x.Name : x.name) || `表情${i + 1}`)), ...extra.map(x => x.name)];
  const motions = Object.fromEntries(Object.entries((four ? refs.Motions : json.motions) || {}).map(([g, list]) => [g, Array.isArray(list) ? list.length : 0]));
  const missing = live2dFiles(json, four).map(p => resolveIn(files, path, p)).filter(p => p === null).length;
  const blinks = !four || !!(json.Groups || []).find(g => g.Name === 'EyeBlink')?.Ids?.length;
  return {kind: 'live2d', version: four ? '4' : '2', settings: path, json, title: path.split('/').pop().replace(/\.model3?\.json$/i, ''), expressions, extra, motions, missing, blinks, keep: lookExpressions(expressions)};
}
/** A Live2D 表情 that is the model's look (a 捏人 model's 「我的」, a 默认 outfit) rather than a feeling: kept on. */
const LOOK = /我的|默认|默認|自定义|自定義|捏|外观|外觀|基础|基礎|\b(?:custom|default|base|my|mine)\b/i;
/** Which 表情 stay on the whole time (guessed: the look ones, or the only one there is when it is no feeling). */
export function lookExpressions(expressions) {
  const list = (expressions || []).map(String);
  const looks = list.filter(n => LOOK.test(n) && !nameFeeling(n));
  if (looks.length) return looks;
  return list.length === 1 && !nameFeeling(list[0]) ? [...list] : [];
}
/** A 表情 file read: [{id, value, blend: 'add' | 'multiply' | 'set'}] (Cubism 3/4's exp3.json and Cubism 2's exp.json). */
export function expressionParams(json) {
  const four = Array.isArray(json?.Parameters), list = four ? json.Parameters : Array.isArray(json?.params) ? json.params : [];
  return list.map(x => {
    const id = String((four ? x.Id : x.id) || ''), value = Number(four ? x.Value : x.val), b = String((four ? x.Blend : x.calc) || 'add').toLowerCase();
    return {id, value, blend: /^mul/.test(b) ? 'multiply' : /^(set|overwrite)/.test(b) ? 'set' : 'add'};
  }).filter(x => x.id && Number.isFinite(x.value));
}
/** Every file a Live2D settings file names (relative to it). */
function live2dFiles(json, four = !!json.FileReferences) {
  if (four) {
    const r = json.FileReferences;
    return [r.Moc, ...(r.Textures || []), r.Physics, r.Pose, r.DisplayInfo, r.UserData, ...(r.Expressions || []).map(x => x.File), ...Object.values(r.Motions || {}).flatMap(l => (l || []).flatMap(m => [m.File, m.Sound]))].filter(Boolean);
  }
  return [json.model, ...(json.textures || []), json.physics, json.pose, ...(json.expressions || []).map(x => x.file), ...Object.values(json.motions || {}).flatMap(l => (l || []).flatMap(m => [m.file, m.sound]))].filter(Boolean);
}
/** The zip path a settings file means by `file` (exact, else the same ignoring case), or null. */
function resolveIn(files, settings, file) {
  const dir = settings.includes('/') ? settings.slice(0, settings.lastIndexOf('/') + 1) : '';
  let p = cleanPath(dir + String(file));
  try { p = cleanPath(dir + decodeURI(String(file))); } catch {}
  if (files.has(p)) return p;
  const low = p.toLowerCase();
  for (const k of files.keys()) if (k.toLowerCase() === low) return k;
  return null;
}
/**
 * The settings with every file it names swapped for a URL (urlOf(zip path) → blob: URL), and a made-up address of its
 * own: what the Live2D library loads. Files the zip lacks are left out (a missing motion only that motion).
 */
export function live2dSettings(info, files, urlOf) {
  const json = structuredClone(info.json), four = info.version === '4';
  const swap = file => { const p = file && resolveIn(files, info.settings, file); return p ? urlOf(p) : ''; };
  if (four) {
    const r = json.FileReferences;
    r.Moc = swap(r.Moc);
    r.Textures = (r.Textures || []).map(swap);
    for (const k of ['Physics', 'Pose', 'DisplayInfo', 'UserData']) if (r[k]) { r[k] = swap(r[k]); if (!r[k]) delete r[k]; }
    r.Expressions = [...(r.Expressions || []), ...(info.extra || []).map(x => ({Name: x.name, File: x.file}))].map(x => ({...x, File: swap(x.File)})).filter(x => x.File);
    for (const [g, list] of Object.entries(r.Motions || {})) r.Motions[g] = (list || []).map(m => { const o = {...m, File: swap(m.File)}; if (m.Sound) o.Sound = swap(m.Sound) || undefined; return o; }).filter(m => m.File);
  } else {
    json.model = swap(json.model);
    json.textures = (json.textures || []).map(swap);
    for (const k of ['physics', 'pose']) if (json[k]) { json[k] = swap(json[k]); if (!json[k]) delete json[k]; }
    json.expressions = [...(json.expressions || []), ...(info.extra || []).map(x => ({name: x.name, file: x.file}))].map(x => ({...x, file: swap(x.file)})).filter(x => x.file);
    for (const [g, list] of Object.entries(json.motions || {})) json.motions[g] = (list || []).map(m => { const o = {...m, file: swap(m.file)}; if (m.sound) o.sound = swap(m.sound) || undefined; return o; }).filter(m => m.file);
  }
  json.url = 'https://st-iphonie.model/' + encodeURIComponent(info.settings);
  return json;
}
/** What a picked file (or folder, as a zip) is: {kind, version, title, …} for the page, or an error saying why not. */
export async function modelInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u32(b, 0) === 0x46546c67) return vrmInfo(b);
  if (u32(b, 0) === 0x04034b50 || u32(b, 0) === 0x06054b50) { const info = await live2dInfo(readZip(b)); delete info.json; return info; }
  throw Error('认不出这个文件：VRM 选 .vrm，Live2D 选整个模型文件夹或它的 .zip');
}

// ---------- 情绪 → 表情 ----------
/** The 情绪 (core/visual-emotion.js) a model shows the way it shows another: worried looks sad, tender looks happy. */
export const FEEL_LIKE = Object.freeze({tender: 'happy', moved: 'happy', curious: 'happy', sulky: 'angry', worried: 'sad', tired: 'sad', fearful: 'surprised', confused: 'surprised', nervous: 'shy'});
/**
 * A VRM's face for each 情绪 (VRM 1.0 preset names, with weights); shy and the like mix a little of several. The ARKit
 * names (BrowDownLeft …) add to it on models made for face tracking (「perfect sync」); others do not have them.
 */
export const VRM_FACES = Object.freeze({
  happy: {happy: .85, CheekSquintLeft: .3, CheekSquintRight: .3},
  angry: {angry: .85, BrowDownLeft: .7, BrowDownRight: .7, NoseSneerLeft: .25, NoseSneerRight: .25, MouthFrownLeft: .35, MouthFrownRight: .35},
  sad: {sad: .8, BrowInnerUp: .6, MouthFrownLeft: .4, MouthFrownRight: .4}, surprised: {surprised: .8, EyeWideLeft: .5, EyeWideRight: .5, BrowInnerUp: .4, BrowOuterUpLeft: .5, BrowOuterUpRight: .5},
  shy: {happy: .35, relaxed: .3, MouthPressLeft: .3, MouthPressRight: .3},
  nervous: {sad: .2, surprised: .25}, fearful: {surprised: .5, sad: .35}, tired: {relaxed: .55, sad: .2}, confused: {surprised: .3, sad: .1},
  tender: {relaxed: .6, happy: .25}, sulky: {angry: .4, sad: .25}, worried: {sad: .45}, curious: {surprised: .2, happy: .2}, moved: {sad: .35, happy: .4}, neutral: {},
});
/** How a VRM holds itself for a 情绪: the head (pitch, yaw, roll in radians), a lean of the body, and where the eyes go. */
export const VRM_POSES = Object.freeze({
  happy: {head: [-.04, 0, .05]}, angry: {head: [.08, 0, 0], lean: .05}, sad: {head: [.2, 0, .04], lean: -.02, eyes: 'down'},
  surprised: {head: [-.1, 0, 0], lean: -.06}, shy: {head: [.12, -.22, .12], eyes: 'away'}, nervous: {head: [.06, .1, -.05], eyes: 'away'},
  fearful: {head: [.06, 0, 0], lean: -.07}, tired: {head: [.16, 0, .08], lean: -.03, eyes: 'down'}, confused: {head: [0, .05, .16]},
  tender: {head: [.04, 0, .1]}, sulky: {head: [.05, .25, 0], eyes: 'away'}, worried: {head: [.1, 0, .05]}, curious: {head: [-.02, 0, .14], lean: .04},
  moved: {head: [.08, 0, .06]}, neutral: {},
});
/**
 * A Live2D face for each 情绪 made with the standard parameters every model has (眉毛, 眼睛, 嘴, 脸红, the head's
 * angles), for models without a 表情 of their own for it (most VTuber models have none). Added on top of what it does.
 * eyeOpen: how much wider (+) or narrower (−) the eyes are; the angles are in degrees.
 */
export const LIVE2D_FACES = Object.freeze({
  happy: {mouthForm: .9, eyeSmile: .8, browY: .3, angleZ: 4, angleY: 3},
  angry: {mouthForm: -.7, browY: -.4, browAngle: -.7, browForm: -.8, eyeOpen: -.15, angleY: -4},
  sad: {mouthForm: -.8, browY: -.2, browAngle: .6, browForm: -.4, eyeOpen: -.2, eyeBallY: -.4, angleY: -10, angleZ: 3},
  surprised: {mouthOpen: .35, eyeOpen: .25, browY: .8, angleY: 5},
  shy: {cheek: 1, mouthForm: .3, eyeSmile: .3, eyeBallX: -.5, eyeBallY: -.3, angleX: -10, angleY: -6, angleZ: 8},
  nervous: {mouthForm: -.3, browAngle: .4, eyeBallX: .4, angleZ: -3}, fearful: {mouthForm: -.6, eyeOpen: .2, browY: .5, browAngle: .6, angleY: -4},
  tired: {mouthForm: -.2, eyeOpen: -.4, browY: -.2, angleY: -8, angleZ: 5}, confused: {mouthForm: -.2, browAngle: .3, angleZ: 10},
  tender: {mouthForm: .6, eyeSmile: .5, angleZ: 6}, sulky: {mouthForm: -.6, cheek: .5, browForm: -.4, angleX: 12}, worried: {mouthForm: -.5, browAngle: .6, angleY: -5},
  curious: {mouthForm: .2, eyeOpen: .1, browY: .3, angleZ: 8}, moved: {mouthForm: .4, eyeSmile: .4, browAngle: .4, angleY: -4}, neutral: {},
});

/** Words in a Live2D 表情 or 动作 name that tell which 情绪 it is (names are free: f01, smile, 笑顔, angry_2 …). */
const NAME_WORDS = [
  ['happy', /happy|smile|joy|laugh|glad|fun|笑|喜|乐|樂|嬉|開心|开心|ニコ|にこ/i],
  ['angry', /angry|anger|mad|rage|annoy|怒|气|氣|ムカ/i],
  ['sad', /sad|cry|tear|sorrow|悲|哀|泣|哭|伤|傷|涙|泪|淚/i],
  ['surprised', /surpri|shock|amaze|startl|惊|驚|吃|びっくり/i],
  ['shy', /shy|blush|embarr|羞|照れ|脸红|臉紅|赤面|てれ/i],
];
/** The 情绪 a Live2D 表情 / 动作 name points to, '' when none. */
export const nameFeeling = name => NAME_WORDS.find(([, re]) => re.test(String(name || '')))?.[0] || '';
/**
 * The 表情 (and 动作) a Live2D model shows for the five 情绪, guessed from their names: {happy: {expression, motion}, …}
 * (motion: 'group:index'). What the user set wins; a 情绪 without any is left out (the model keeps its own face).
 */
export function live2dMap(info, own = {}, keep = info.keep || []) {
  const out = {};
  for (const id of ['happy', 'angry', 'sad', 'surprised', 'shy']) {
    const mine = own?.[id];
    const expression = mine && 'expression' in mine ? String(mine.expression || '') : (info.expressions || []).find(n => nameFeeling(n) === id && !keep.includes(n)) || '';
    let motion = mine && 'motion' in mine ? String(mine.motion || '') : '';
    if (!(mine && 'motion' in mine)) { const g = Object.keys(info.motions || {}).find(n => nameFeeling(n) === id); if (g) motion = g + ':0'; }
    if (expression || motion) out[id] = {expression, motion};
  }
  return out;
}
/** What a 情绪 shows on a model: its own entry, or the one it looks like (worried → sad), else nothing. */
export const feelingFor = (emotion, has) => has(emotion) ? emotion : has(FEEL_LIKE[emotion]) ? FEEL_LIKE[emotion] : '';

// ---------- 口型 ----------
export const VOWELS = Object.freeze(['aa', 'ih', 'ou', 'ee', 'oh']);
/**
 * The mouth for a moment of a voice, from its spectrum (bytes 0–255 per bin, binHz wide): open 0–1, the weight of each
 * vowel, and how loud it was (loud). Loudness opens it, against the loudest of late (peak), so quiet and loud voices
 * both open and close; where the sound sits tells the vowel, roughly: あ is strong low and in the middle, い and え reach
 * high, う and お stay low. Quiet is a closed mouth.
 */
export function mouthShape(bins, binHz, peak = .6) {
  const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / binHz)); i <= Math.min(bins.length - 1, Math.ceil(hi / binHz)); i++) { s += bins[i] / 255; n++; } return n ? s / n : 0; };
  const loud = band(90, 4000), shut = {open: 0, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0};
  if (loud < .1) return {...shut, loud};
  const open = Math.min(1, Math.max(0, (loud - .1) / (Math.max(.3, peak) - .1)) * .95), low = band(250, 900) + 1e-3, mid = band(900, 1800), high = band(1800, 3600);
  const m = Math.min(1.5, mid / low), h = Math.min(1.5, high / low);
  const raw = {aa: m * (1.2 - h), ih: h * h * 1.4, ee: h * (1.1 - Math.abs(m - .8)), oh: (1.1 - m) * (.9 - h * .5), ou: (1 - m) * (1 - h) * .8};
  let sum = 0;
  for (const k of VOWELS) { raw[k] = Math.max(0, raw[k]); sum += raw[k]; }
  if (!sum) return {...shut, open, aa: open, loud};
  return {open, ...Object.fromEntries(VOWELS.map(k => [k, raw[k] / sum * open])), loud};
}
/**
 * A mouth that moves with the text as it is typed, when the line has no voice: a little open and shut on each
 * character, a vowel picked from it, shut at punctuation. t: seconds since the line began.
 */
export function typedMouth(char, t) {
  if (!char || /[\s，。！？、；：…—,.!?;:~～「」『』“”"'（）()]/.test(char)) return {open: 0, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0};
  const open = .25 + .55 * Math.abs(Math.sin(t * Math.PI * 7)), vowel = VOWELS[(char.codePointAt(0) || 0) % 5];
  return {open, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, [vowel]: open};
}

// ---------- the entry kept in settings ----------
export const MODEL_FRAMES = Object.freeze({half: '半身', full: '全身', face: '特写'});
/** Trigger words as a list: split on commas, 、, ；, spaces (English phrases keep theirs when split by commas). */
export function wordList(value) {
  const parts = Array.isArray(value) ? value : /[,，、;；]/.test(String(value ?? '')) ? String(value).split(/[,，、;；]/) : String(value ?? '').split(/\s+/);
  return [...new Set(parts.map(w => String(w).trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}
/** A VRM motion file (.vrma): what it is, or an error saying it is not one. */
export function vrmaInfo(input) {
  let j;
  try { j = glbJson(input); } catch { throw Error('这不是 VRM 动作文件（.vrma）'); }
  const used = j.extensionsUsed || [], ext = j.extensions || {};
  if (!used.includes('VRMC_vrm_animation') && !ext.VRMC_vrm_animation) throw Error('这个文件不是 VRM 动作（.vrma），是普通的 glTF');
  const seconds = Math.max(0, ...(j.accessors || []).filter((a, i) => (j.animations || []).some(an => (an.samplers || []).some(s => s.input === i))).map(a => Number(a.max?.[0]) || 0));
  return {seconds: Math.round(seconds * 10) / 10};
}
/**
 * The user's motion files for VRM characters (vn.moves): [{id, label, words, path (user/files), file, size, seconds, at}],
 * up to 40; any VRM can play them, brought on by their words like the built-in 动作.
 */
export const MOVE_FILE_LIMIT = 40;
export function normalizeMoveFiles(list) {
  const out = [], seen = new Set();
  for (const m of Array.isArray(list) ? list : []) {
    const path = typeof m?.path === 'string' ? m.path.trim() : '', id = typeof m?.id === 'string' ? m.id : '';
    if (!/^\/?user\/files\/[\w.-]+$/.test(path) || !/^v-[\w-]{1,60}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({id, label: String(m.label || '动作').trim().slice(0, 20) || '动作', words: wordList(m.words), path, file: String(m.file || '').slice(0, 120), size: Math.max(0, Number(m.size) || 0), seconds: Math.max(0, Number(m.seconds) || 0), at: Number(m.at) || 0});
  }
  return out.slice(0, MOVE_FILE_LIMIT);
}

/** How many models a character keeps to switch between. */
export const MODEL_LIMIT = 8;
/**
 * One model of a character (cast[name].models): {id, kind, version, path (in the tavern), file, size, title, frame,
 * zoom, lift, map (Live2D 情绪 → 表情 / 动作), keep (Live2D 表情 always on, its look; absent: guessed), at}. A model kept
 * before there were several has no id: it takes one from its file.
 */
export function normalizeModel(m) {
  if (!m || typeof m !== 'object' || !['vrm', 'live2d'].includes(m.kind)) return null;
  const path = typeof m.path === 'string' ? m.path.trim().slice(0, 300) : '';
  if (!/^\/?user\/files\/[\w.-]+$/.test(path)) return null;
  const text = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  const map = {}, acts = {};
  // A Live2D model's own motions ('group:index') and the words that bring them on.
  for (const [k, w] of Object.entries(m.acts && typeof m.acts === 'object' ? m.acts : {}).slice(0, 60)) { const words = wordList(w); if (/^.{1,80}:\d{1,3}$/.test(k) && words.length) acts[k] = words; }
  for (const id of ['happy', 'angry', 'sad', 'surprised', 'shy']) {
    const e = m.map?.[id];
    if (e && typeof e === 'object') map[id] = {expression: text(e.expression, 80), motion: text(e.motion, 90)};
  }
  const zoom = Number(m.zoom), lift = Number(m.lift);
  const keep = Array.isArray(m.keep) ? [...new Set(m.keep.map(x => text(x, 80)).filter(Boolean))].slice(0, 12) : null;
  const id = typeof m.id === 'string' && /^m-[\w-]{1,60}$/.test(m.id) ? m.id : 'm-' + path.split('/').pop().replace(/[^\w-]/g, '_').slice(0, 58);
  return {id, kind: m.kind, version: text(m.version, 4), path, file: text(m.file, 120), size: Math.max(0, Number(m.size) || 0), title: text(m.title, 80),
    frame: Object.hasOwn(MODEL_FRAMES, m.frame) ? m.frame : 'half', zoom: Number.isFinite(zoom) ? Math.min(2, Math.max(.6, Math.round(zoom * 100) / 100)) : 1,
    lift: Number.isFinite(lift) ? Math.min(.4, Math.max(-.4, Math.round(lift * 100) / 100)) : 0, map, ...(keep ? {keep} : {}), ...(Object.keys(acts).length ? {acts} : {}), at: Number(m.at) || 0};
}
/**
 * A character's models and the one in use, from what is kept: {models, useModel} ('' = the 立绘). A single model kept by
 * 0.8.49 and before (entry.model) becomes the first of the list, in use.
 */
export function normalizeModels(entry) {
  const legacy = normalizeModel(entry?.model), seen = new Set(), models = [];
  for (const raw of [...(Array.isArray(entry?.models) ? entry.models : []), ...(legacy ? [legacy] : [])]) {
    const m = normalizeModel(raw);
    if (!m || seen.has(m.id) || seen.has(m.path)) continue;
    seen.add(m.id); seen.add(m.path); models.push(m);
  }
  models.splice(MODEL_LIMIT);
  const asked = typeof entry?.useModel === 'string' ? entry.useModel : legacy ? legacy.id : '';
  return {models, useModel: models.some(m => m.id === asked) ? asked : ''};
}
/** The model a character stands as now (null: their 立绘). */
export const currentModel = entry => (entry?.models || []).find(m => m.id === entry?.useModel) || null;
/** What the page says a model is: 「VRM 0.x」「Live2D Cubism 4」. */
export const modelLabel = m => !m ? '' : m.kind === 'vrm' ? `VRM ${m.version === '1' ? '1.0' : '0.x'}` : `Live2D Cubism ${m.version === '2' ? '2' : '3 / 4'}`;

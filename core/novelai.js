// NovelAI image client used directly from the browser (image.novelai.net allows cross-origin requests).
// The key stays in this browser; it goes through the tavern server only for a relay that lets no web page ask it, by
// the tavern's own /proxy/ (enableCorsProxy), or when the user wrote the relay as /proxy/….
import {proxyAddress, reachService, tavernLogin} from './proxy-url.js';

import {vibeKey, vibeParameters} from './vibes.js';
import {unpack} from './msgpack.js';

export const NAI_HOST = 'https://image.novelai.net';
/** NovelAI's other host: 放大 (upscale) is asked there. */
export const NAI_API = 'https://api.novelai.net';
/**
 * A relay the user runs in front of NovelAI: the same paths (/ai/generate-image, /user/subscription) and whatever key it
 * asks for. '' means NovelAI itself. A page opened over HTTPS cannot reach an http:// relay (except on this computer).
 */
const NAI_PATHS = /\/(ai\/generate-image(-stream)?|ai\/generate-image\/suggest-tags|ai\/augment-image|ai\/upscale|user\/subscription)$/i;
/** Fish Audio paths the plugin adds; a pasted full address keeps only what comes before them. */
export const FISH_PATHS = /\/(compat\/v1\/audio\/speech|v1\/audio\/speech|audio\/speech|v1\/tts|v1\/models|model|wallet\/self\/api-credit)$/i;
export function relayUrl(value, pageProtocol = globalThis.location?.protocol, strip = NAI_PATHS) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const proxy = proxyAddress(raw);
  if (proxy) return proxy.replace(/\/+$/, '').replace(strip, '');
  let url; try { url = new URL(raw); } catch { throw Error('中转地址格式不对，要以 https:// 开头'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('中转地址格式不对：以 https:// 开头，不带 ? 和 #');
  if (url.protocol === 'http:' && pageProtocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('酒馆是用 HTTPS 打开的，浏览器不允许连 http:// 的中转，请给中转配上 HTTPS');
  // A pasted full address (…/ai/generate-image, …/user/subscription) keeps only the part before the path the plugin adds.
  return (url.origin + url.pathname).replace(/\/+$/, '').replace(strip, '');
}
export const NAI_MODELS = ['nai-diffusion-5-full', 'nai-diffusion-5-curated', 'nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full', 'nai-diffusion-4-curated-preview', 'nai-diffusion-3', 'nai-diffusion-furry-3'];
export const NAI_MODEL_NAMES = {
  'nai-diffusion-5-full': 'V5 Full', 'nai-diffusion-5-curated': 'V5 Curated', 'nai-diffusion-4-5-full': 'V4.5 Full', 'nai-diffusion-4-5-curated': 'V4.5 Curated',
  'nai-diffusion-4-full': 'V4 Full', 'nai-diffusion-4-curated-preview': 'V4 Curated', 'nai-diffusion-3': 'Anime V3', 'nai-diffusion-furry-3': 'Furry V3'
};
export const NAI_SAMPLERS = ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m_sde', 'k_dpmpp_2m', 'k_dpmpp_sde', 'k_dpm_2', 'k_dpm_fast', 'ddim_v3'];
export const NAI_SAMPLER_NAMES = {k_euler_ancestral: 'Euler Ancestral', k_euler: 'Euler', k_dpmpp_2s_ancestral: 'DPM++ 2S Ancestral', k_dpmpp_2m_sde: 'DPM++ 2M SDE', k_dpmpp_2m: 'DPM++ 2M', k_dpmpp_sde: 'DPM++ SDE', k_dpm_2: 'DPM2', k_dpm_fast: 'DPM Fast', ddim_v3: 'DDIM'};
export const NAI_SCHEDULES = ['karras', 'exponential', 'polyexponential', 'native'];
/** NovelAI's biggest picture, in pixels; sides are multiples of 64. */
export const NAI_MAX_PIXELS = 3145728;
/** Who can do what, as NovelAI's own app has it. */
export function naiFeatures(model) {
  const m = String(model || ''), v5 = isV5(m), v45 = /^nai-diffusion-4-5/.test(m), v4 = /^nai-diffusion-4(?!-5)/.test(m), v3 = /^nai-diffusion-(furry-)?3/.test(m), captions = v5 || v45 || v4;
  return {v5, v45, v4, v3, captions, characters: v5 ? 22 : captions ? 6 : 0, freePosition: v5, positionOne: v5, schedule: !v5, variety: !v5, varietySigma: v45 ? 58 : 19, smea: v3, decrisper: v3,
    mode: captions, transparent: v5, reference: v45, effort: m === 'nai-diffusion-5-full', inpaintStrength: captions, enhanceWords: v5 || v45, autoText: v5, legacyUc: v4, maxEnhance: v5};
}
export const samplersFor = model => naiFeatures(model).v3 ? NAI_SAMPLERS : NAI_SAMPLERS.slice(0, 6);
/** The noise schedules a sampler takes on a model; none on V5 (always karras) and for DDIM and DPM Fast. */
export function schedulesFor(model, sampler) {
  const f = naiFeatures(model);
  if (!f.schedule || sampler === 'ddim_v3' || sampler === 'k_dpm_fast') return [];
  if (sampler === 'k_dpm_2') return ['exponential', 'polyexponential'];
  return f.v3 ? ['native', 'karras', 'exponential', 'polyexponential'] : ['karras', 'exponential', 'polyexponential'];
}
const defaultSchedule = sampler => sampler === 'k_dpm_2' || sampler === 'k_dpmpp_2m' ? 'exponential' : 'karras';
// Added to a prompt (quality) or in front of a negative (presets), word for word NovelAI's own; picked per model.
const QUALITY_WORDS = {v5: 'very aesthetic, masterpiece, no text', v5light: 'very aesthetic, amazing quality, no text', v45full: 'very aesthetic, masterpiece, no text', v45curated: 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general', v4full: 'no text, best quality, very aesthetic, absurdres', v4curated: 'rating:general, best quality, very aesthetic, absurdres', v3: 'best quality, amazing quality, very aesthetic, absurdres', furry3: '{best quality}, {amazing quality}'};
export function qualityPresets(model) {
  const m = String(model || ''), standard = words => [{id: 'standard', name: '标准', words}, {id: 'none', name: '不加', words: ''}];
  if (isV5(m)) return [{id: 'standard', name: '标准', words: QUALITY_WORDS.v5}, {id: 'light', name: '轻', words: QUALITY_WORDS.v5light}, {id: 'none', name: '不加', words: ''}];
  if (m === 'nai-diffusion-4-5-full') return standard(QUALITY_WORDS.v45full);
  if (m === 'nai-diffusion-4-5-curated') return standard(QUALITY_WORDS.v45curated);
  if (m === 'nai-diffusion-4-full') return standard(QUALITY_WORDS.v4full);
  if (m === 'nai-diffusion-4-curated-preview') return standard(QUALITY_WORDS.v4curated);
  return standard(m === 'nai-diffusion-furry-3' ? QUALITY_WORDS.furry3 : QUALITY_WORDS.v3);
}
const UC_HEAVY_NEW = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const UC_FURRY = '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';
const UC_HUMAN_NEW = UC_HEAVY_NEW + ', @_@, mismatched pupils, glowing eyes, bad anatomy';
const UC_V3 = 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]';
const UC_TABLE = {
  v5: [['heavy', UC_HEAVY_NEW], ['light', 'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::'], ['humanFocus', UC_HUMAN_NEW], ['furryFocus', UC_FURRY], ['none', '']],
  v45full: [['heavy', UC_HEAVY_NEW], ['light', 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page'], ['humanFocus', UC_HUMAN_NEW], ['furryFocus', UC_FURRY], ['none', '']],
  v45curated: [['heavy', 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page'], ['light', 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page'], ['humanFocus', 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page'], ['none', '']],
  v4full: [['heavy', 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page'], ['light', 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page'], ['none', '']],
  v4curated: [['heavy', 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts, white blank page, blank page'], ['light', 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature, white blank page, blank page'], ['none', '']],
  v3: [['heavy', UC_V3], ['light', 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing'], ['humanFocus', UC_V3 + ', bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes'], ['none', 'lowres']],
  furry3: [['heavy', '{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast'], ['light', '{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text'], ['none', 'lowres']]
};
const UC_NAMES = {heavy: '重', light: '轻', humanFocus: '人物', furryFocus: '福瑞', none: '不加'};
export function ucPresets(model) {
  const m = String(model || ''), key = isV5(m) ? 'v5' : m === 'nai-diffusion-4-5-full' ? 'v45full' : m === 'nai-diffusion-4-5-curated' ? 'v45curated' : m === 'nai-diffusion-4-full' ? 'v4full' : m === 'nai-diffusion-4-curated-preview' ? 'v4curated' : m === 'nai-diffusion-furry-3' ? 'furry3' : 'v3';
  return UC_TABLE[key].map(([id, words]) => ({id, name: UC_NAMES[id], words}));
}
/** The numbers NovelAI's app passes along with a preset, so the model knows which words came from it. */
const TAG_HINTS = {none: 0, standard: 1, heavy: 2, light: 3, humanFocus: 4, furryFocus: 5};
/** A size that is too big comes down to NovelAI's limit in the same shape, in multiples of 64. */
const withinPixels = (w, h) => { if (w * h <= NAI_MAX_PIXELS) return [w, h]; const k = Math.sqrt(NAI_MAX_PIXELS / (w * h)); return [Math.max(64, Math.floor(w * k / 64) * 64), Math.max(64, Math.floor(h * k / 64) * 64)]; };
// Free for active Opus subscribers: one image, at most 28 steps and 1024x1024 pixels.
// V4.5 and older are unlimited; V5 draws from a recharging allowance (subscription.usage.percent) and falls back to Anlas when it runs out.
export const FREE_STEPS = 28;
export const FREE_PIXELS = 1024 * 1024;
export const V5_MIN_PERCENT = 2;
const REFERENCE_PIXELS = 832 * 1216;

/** V4, V4.5 and V5 take v4_prompt with per-character captions. */
export const isV4 = model => /^nai-diffusion-[45]/.test(model);
export const isV5 = model => /^nai-diffusion-5/.test(model);

export function defaultDrawParams() {
  return {model: 'nai-diffusion-4-5-full', width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral', schedule: 'karras', seed: -1, cfgRescale: 0, variety: false, effort: 'high', mode: 'anime', quality: 'none', ucPreset: 'none', smea: 'auto', decrisper: false};
}

export function normalizeDrawParams(value = {}) {
  const base = defaultDrawParams(), p = {...base, ...value};
  const num = (v, min, max, fallback, step = 1) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n / step) * step)) : fallback; };
  p.model = NAI_MODELS.includes(p.model) ? p.model : base.model;
  const f = naiFeatures(p.model);
  p.sampler = samplersFor(p.model).includes(p.sampler) ? p.sampler : base.sampler;
  p.schedule = NAI_SCHEDULES.includes(p.schedule) ? p.schedule : base.schedule;
  const schedules = schedulesFor(p.model, p.sampler);
  if (schedules.length && !schedules.includes(p.schedule)) p.schedule = defaultSchedule(p.sampler);
  [p.width, p.height] = withinPixels(num(p.width, 64, 8192, base.width, 64), num(p.height, 64, 8192, base.height, 64));
  p.steps = num(p.steps, 1, 50, base.steps);
  p.scale = num(p.scale, 0, 10, base.scale, .1);
  p.cfgRescale = num(p.cfgRescale, 0, 1, 0, .02);
  p.seed = num(p.seed, -1, 4294967295, -1);
  p.variety = !!p.variety && f.variety;
  // 透明背景: V5 draws with an alpha channel (立绘 without cutting the background out).
  p.transparent = !!p.transparent && f.transparent;
  // 努力程度 is V5 Full's; 中 is a smaller model of its own, with its steps and sampler fixed (see buildImageRequest).
  p.effort = p.effort === 'medium' && f.effort ? 'medium' : 'high';
  p.mode = ['furry', 'background'].includes(p.mode) && f.mode ? p.mode : 'anime';
  p.quality = qualityPresets(p.model).some(q => q.id === p.quality) ? p.quality : 'none';
  p.ucPreset = ucPresets(p.model).some(u => u.id === p.ucPreset) ? p.ucPreset : 'none';
  p.smea = ['auto', 'on', 'dyn', 'off'].includes(p.smea) ? p.smea : 'auto';
  p.decrisper = !!p.decrisper && f.decrisper;
  // 旧版负面 is V4's; 负面强度 only comes with a picture of 参数网格 (100% is what is sent without it).
  if (p.legacyUc && f.legacyUc) p.legacyUc = true; else delete p.legacyUc;
  const uncond = Number(p.uncondScale);
  if (p.uncondScale !== undefined && p.uncondScale !== '' && Number.isFinite(uncond)) p.uncondScale = Math.min(1.5, Math.max(0, uncond)); else delete p.uncondScale;
  return p;
}

/** True when an active Opus subscription covers the request; false when it costs Anlas; null when that cannot be told yet. */
export function isFree(params, subscription) {
  const small = params.steps <= FREE_STEPS && params.width * params.height <= FREE_PIXELS;
  if (!small) return false;
  if (!subscription) return null;
  if (!subscription.unlimited) return false;
  if (!isV5(params.model)) return true;
  const usage = subscription.usage;
  if (!usage) return null;
  return !usage.negative && usage.percent >= V5_MIN_PERCENT;
}

/** Clamps parameters into the free range while keeping the aspect ratio (multiples of 64). */
export function guardParams(params) {
  const p = {...params, steps: Math.min(params.steps, FREE_STEPS)};
  if (p.width * p.height > FREE_PIXELS) {
    const ratio = Math.sqrt(FREE_PIXELS / (p.width * p.height));
    p.width = Math.max(64, Math.floor(p.width * ratio / 64) * 64);
    p.height = Math.max(64, Math.floor(p.height * ratio / 64) * 64);
  }
  return p;
}

// 5x5 position grid (index 0..24, row-major) to NovelAI's 0..1 coordinates.
export const gridCenter = index => ({x: +(.1 + (index % 5) * .2).toFixed(1), y: +(.1 + Math.floor(index / 5) * .2).toFixed(1)});

/**
 * Builds the generate-image request body.
 * prompt/negative are final strings; characters: [{prompt, negative, position}] where position is a grid index or -1 (let the model place it).
 */
/** 角色参考 (NovelAI's Precise Reference, Director reference): V4.5 only — V5 and the older models take none. */
export const takesReference = model => /^nai-diffusion-4-5/.test(model);
/** As many as NovelAI's app allows at once. */
export const MAX_REFERENCES = 16;
/** Anlas a character reference adds to each picture (never in the Opus free tier). */
export const REFERENCE_ANLAS = 5;
/** What a reference passes on: the character, the style, or both (NovelAI's own words go in the request). */
export const REFERENCE_KINDS = Object.freeze({character: 'character', style: 'style', both: 'character&style'});
/** The sizes a reference picture is fitted into (padded with black), by its shape. */
export const REFERENCE_SIZES = Object.freeze([[1024, 1536], [1536, 1024], [1472, 1472]]);
/** The model that repaints part of a picture (局部重绘). */
export const inpaintModel = model => model === 'nai-diffusion-4-curated-preview' ? 'nai-diffusion-4-curated-inpainting' : model + '-inpainting';
/** 导演工具 (Director tools): what each does to a picture. 上色 and 换表情 take words and a 去瑕疵 level. */
export const DIRECTOR_TOOLS = Object.freeze({'bg-removal': '去背景', lineart: '线稿', sketch: '素描', colorize: '上色', emotion: '换表情', declutter: '去杂物', 'declutter-keep-bubbles': '去杂物留气泡'});
export const DIRECTOR_WORDS = Object.freeze(['colorize', 'emotion']);
/** 换表情: the moods NovelAI knows (its words) with their names here. */
export const EMOTIONS = Object.freeze([['neutral', '平静'], ['happy', '开心'], ['sad', '难过'], ['angry', '生气'], ['scared', '害怕'], ['surprised', '惊讶'], ['tired', '疲惫'], ['excited', '兴奋'], ['nervous', '紧张'], ['thinking', '思考'], ['confused', '困惑'], ['shy', '害羞'], ['disgusted', '嫌弃'], ['smug', '得意'], ['bored', '无聊'], ['laughing', '大笑'], ['irritated', '烦躁'], ['aroused', '动情'], ['embarrassed', '尴尬'], ['worried', '担心'], ['love', '爱慕'], ['determined', '坚定'], ['hurt', '受伤'], ['playful', '调皮']]);
/** 放大: the biggest side NovelAI makes; it doubles a picture, with the model and sigma its own app names. */
export const UPSCALE_MAX = 4096;
const UPSCALE_MODEL = 'nai-diffusion-5-curated', UPSCALE_BLUR_SIGMA = 0;
export const upscaleBody = image => ({image, model: UPSCALE_MODEL, declared_blur_sigma: UPSCALE_BLUR_SIGMA});
/** The body of a Director tool request: the picture, its size and the tool; mood and words for 换表情 / 上色. */
export function augmentBody({tool, image, width, height, prompt = '', mood = 'neutral', defry = 0}) {
  if (!Object.hasOwn(DIRECTOR_TOOLS, tool)) throw Error('没有这个导演工具');
  const words = String(prompt || '').trim(), level = Math.max(0, Math.min(5, Math.round(Number(defry) || 0)));
  return {image, width, height, req_type: tool, ...(tool === 'emotion' ? {prompt: `${mood};;${words}`, defry: level} : tool === 'colorize' ? {prompt: words, defry: level} : {})};
}
/** 放大 doubles a picture; 0 when that is too big. */
export const upscaleBy = (width, height) => width * 2 <= UPSCALE_MAX && height * 2 <= UPSCALE_MAX ? 2 : 0;
/** 增强 at 最大 (V5): the picture is sent as it is and comes back at this size, twice as large at most. */
export function maxEnhanceSize(width, height, times = 2) {
  const grid = 8 * times, w = Math.floor(width / grid) * grid * times, h = Math.floor(height / grid) * grid * times, k = Math.min(1, Math.sqrt(NAI_MAX_PIXELS / (w * h)));
  let out = [32 * Math.round(w * k / 32), 32 * Math.round(h * k / 32)];
  if (out[0] * out[1] > NAI_MAX_PIXELS) out = [32 * Math.floor(w * k / 32), 32 * Math.floor(h * k / 32)];
  if (out[0] < 32 || out[1] < 32) throw Error('这张图太细长了，不能增强');
  return {width: out[0], height: out[1]};
}
const clampTo = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

// ---------- the words, as NovelAI's own app puts them together ----------
const TEXT_MARK = /(?:^|\s|[,.:[\]{}、。])text:(?!:)/i;
/** The parts of a prompt split by | (base | character | …); a | inside ||a|b|| belongs to the choice. At most six, as in its app. */
export function splitPromptMix(prompt) {
  const open = '\u{103B9}', close = '\u{12137}';
  const parts = String(prompt).split('||').map((part, i) => i % 2 ? part.split('|').join(open) : part).join(close).split('|');
  const out = parts.slice(0, 5);
  if (parts.length > 5) out.push(parts.slice(5).join('|'));
  return out.map(part => part.replaceAll(open, '|').replaceAll(close, '||'));
}
/** 提示词片段: !macro:Name! stands for the words saved under that name; a chunk may name other chunks. */
export function expandChunks(text, chunks = [], seen = new Set()) {
  if (!chunks.length || !String(text).includes('!macro:')) return String(text);
  return String(text).replace(/!macro:([^!\n]+)!/g, (mark, name) => {
    const chunk = chunks.find(c => c.name === name);
    if (!chunk || seen.has(name)) return chunk ? '' : mark;
    return expandChunks(chunk.text, chunks, new Set([...seen, name]));
  });
}
const joinWords = (a, b) => a ? `${a}, ${b}` : b;
/** 质量标签 (and 透明背景's tag) after the scene's words, before a Text: part, which has to stay at the very end. */
export function withQuality(prompt, model, id, transparent = false) {
  const f = naiFeatures(model);
  let words = qualityPresets(model).find(q => q.id === id)?.words || '';
  if (transparent && f.transparent && !/transparent background/i.test(prompt)) words = words ? `transparent background, ${words}` : 'transparent background';
  if (!words) return prompt;
  if (!f.captions) return String(prompt).split('|').map(part => { const weight = part.match(/(:[\d.]+$)/)?.[0] || ''; return joinWords(weight ? part.slice(0, -weight.length) : part, words) + weight; }).join('|');
  const parts = splitPromptMix(prompt), base = parts[0], mark = base.match(TEXT_MARK);
  parts[0] = mark ? joinWords(base.slice(0, mark.index), words) + base.slice(mark.index) : joinWords(base, words);
  return parts.join('|');
}
/** The negative with a preset in front; models without "curated" in their name also get nsfw there unless the prompt asks for it. */
export function withUcPreset(model, id, prompt, negative) {
  const f = naiFeatures(model), list = ucPresets(model), preset = list.find(u => u.id === id) || list.find(u => u.id === 'none');
  const words = preset.words, nsfw = !/curated/.test(model) && preset.id !== 'none' && words !== '' && !String(prompt).toLowerCase().includes('nsfw');
  if (f.captions) {
    const out = String(negative).split('|').map((part, i) => i !== 0 || words === '' ? part : part === '' ? words : `${words}, ${part}`).join('|');
    return nsfw ? `nsfw, ${out}` : out;
  }
  const head = preset.id === 'none' ? '' : words, out = negative ? (head ? `${head}, ${negative}` : negative) : words;
  return nsfw ? (out ? `nsfw, ${out}` : 'nsfw') : out;
}
const withMode = (prompt, mode) => mode === 'anime' || /^(fur|background) dataset/.test(prompt) ? prompt : `${mode === 'furry' ? 'fur' : 'background'} dataset, ${prompt}`;
const QUOTES = {'"': '"', '“': '”', '「': '」', "'": "'", '‘': '’'};
function quotedWords(text) {
  const out = [];
  for (let i = 0; i < text.length;) {
    const end = QUOTES[text[i]];
    // An apostrophe only opens after a space or a comma: don't is not a quotation.
    if (end === undefined || (text[i] === "'" && i > 0 && !/[\s,.]/.test(text[i - 1]))) { i++; continue; }
    const loose = end === "'" || end === '’';
    let j = i + 1;
    while (j < text.length && (text[j] !== end || (loose && /[\p{L}\p{N}]/u.test(text[j + 1] ?? '')))) j++;
    if (j >= text.length) { i++; continue; }
    const words = text.slice(i + 1, j).trim();
    if (words) out.push(words);
    i = j + 1;
  }
  return out;
}
/** V5: words in quotation marks are drawn as text; its app adds them as a Text: part unless the prompt has one. */
export function withAutoText(prompt, characters = []) {
  if (TEXT_MARK.test(prompt) || characters.some(c => TEXT_MARK.test(c.prompt))) return prompt;
  const parts = splitPromptMix(prompt), lists = [quotedWords(parts[0] ?? ''), ...characters.map(c => quotedWords(c.prompt))], all = lists.flat();
  if (!all.length) return prompt;
  // Mostly Japanese or Chinese reads from right to left, panel by panel.
  const cjk = all.join('').match(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFF9F\u4E00-\u9FAF\u3400-\u4DBF]/gu)?.length || 0;
  if (cjk / all.join('').length > .3) for (const list of lists) list.reverse();
  const base = (parts[0] ?? '').replace(/[\s,]+$/, ''), text = `teXt: ${lists.flat().join('\n\n')}`;
  parts[0] = base ? `${base}, ${text}` : text;
  return parts.join('|');
}
/** What goes out as the prompt and the negative, after the settings have had their say (also for counting tokens). */
export function finalWords({prompt = '', negative = '', characters = [], params = {}, chunks = []} = {}) {
  const p = normalizeDrawParams(params), f = naiFeatures(p.model), medium = p.effort === 'medium';
  const chars = characters.filter(c => c.enabled !== false && String(c.prompt || '').trim()).map(c => ({...c, prompt: expandChunks(c.prompt, chunks), negative: medium ? '' : expandChunks(c.negative || '', chunks)}));
  let text = withQuality(expandChunks(prompt, chunks), p.model, p.quality, p.transparent);
  const uc = medium ? withUcPreset(p.model, 'heavy', text, '') : withUcPreset(p.model, p.ucPreset, text, expandChunks(negative, chunks));
  text = withMode(text, p.mode);
  if (f.autoText) text = withAutoText(text, chars);
  // Models without character prompts take everyone's negative in the one they have.
  const theirs = f.captions ? '' : chars.map(c => String(c.negative || '').trim()).filter(Boolean).join(', ');
  return {prompt: text, negative: theirs ? [uc, theirs].filter(Boolean).join(', ') : uc, characters: chars};
}

/**
 * vibes: [{encoding, strength}] already encoded for this model; ignored by models without vibes (V5, V3).
 * base: {image (base64 PNG at width×height), width, height, strength, noise, mask?} — 图生图, or 局部重绘 with a mask
 * (white where it is drawn again); the picture is then drawn at the base's size. refs: [{image (fitted, base64), kind,
 * strength, fidelity}] — 角色参考, V4.5 only; with them no vibe is sent (NovelAI's own app does the same: both at once
 * come back broken). The result says whether references went (refs) so the vibes are left out.
 */
export function buildImageRequest({prompt, negative = '', characters = [], params, vibes = [], base = null, refs = [], chunks = [], normalizeVibes = true}) {
  const p = normalizeDrawParams(params), f = naiFeatures(p.model), medium = p.effort === 'medium';
  if (base?.image) { p.width = base.width; p.height = base.height; }
  const action = base?.image ? (base.mask ? 'infill' : 'img2img') : 'generate';
  if (p.sampler === 'ddim_v3' && !medium && [3, 9, 27, 36, 37].includes(p.steps)) throw Error(`DDIM 用 ${p.steps} 步会出错（NovelAI 的已知问题），请换一个步数`);
  const seed = p.seed >= 0 ? p.seed : Math.floor(Math.random() * 4294967295);
  const words = finalWords({prompt, negative, characters, params: p, chunks}), chars = words.characters;
  let input = words.prompt;
  // 增强 asks for less of what an enlarged picture tends to look like, before a Text: part as ever.
  if (base?.enhance && !base.upscaled && f.enhanceWords && !input.includes('upscaled, blurry')) { const mark = input.match(TEXT_MARK), add = ', -2::upscaled, blurry::,'; input = mark ? input.slice(0, mark.index) + add + input.slice(mark.index) : input + add; }
  const steps = medium ? 14 : p.steps, sampler = medium ? 'k_euler_ancestral' : p.sampler;
  const sm = f.smea && sampler !== 'ddim_v3' && !base?.image && (p.smea === 'on' || p.smea === 'dyn' || (p.smea === 'auto' && p.width * p.height >= 2166785));
  const parameters = {
    params_version: f.v5 ? 4 : 3, width: p.width, height: p.height, scale: p.scale, sampler, steps, n_samples: 1, seed,
    ucPreset: 0, qualityToggle: p.quality !== 'none', dynamic_thresholding: f.decrisper && p.decrisper, controlnet_strength: 1, legacy: false, add_original_image: false,
    legacy_v3_extend: false, deliberate_euler_ancestral_bug: false, prefer_brownian: true,
    skip_cfg_above_sigma: p.variety && f.variety ? Math.pow(p.width * p.height / REFERENCE_PIXELS, .5) * f.varietySigma : null,
    tag_hint_qt: TAG_HINTS[p.quality] ?? 0, tag_hint_uc_preset: TAG_HINTS[medium ? 'heavy' : p.ucPreset] ?? 0,
    negative_prompt: words.negative
  };
  // Medium effort has no rescale; V5 is always on karras; DDIM and DPM Fast take no schedule.
  if (!medium) parameters.cfg_rescale = p.cfgRescale;
  const schedules = schedulesFor(p.model, sampler);
  if (f.v5) parameters.noise_schedule = 'karras'; else if (schedules.length) parameters.noise_schedule = p.schedule;
  if (f.captions) {
    // V5 places people anywhere; the others on a 5×5 grid, and need two people for it to mean anything.
    const snap = v => [.1, .3, .5, .7, .9][Math.min(4, Math.max(0, Math.floor(5 * v)))];
    const placed = c => (c.center && Number.isFinite(c.center.x) && Number.isFinite(c.center.y)) || c.position >= 0;
    const center = c => {
      if (c.center && Number.isFinite(c.center.x) && Number.isFinite(c.center.y)) return f.freePosition ? {x: clampTo(c.center.x, 0, 1, .5), y: clampTo(c.center.y, 0, 1, .5)} : {x: snap(c.center.x), y: snap(c.center.y)};
      return c.position >= 0 ? gridCenter(c.position) : {x: .5, y: .5};
    };
    const useCoords = chars.some(placed) && (f.positionOne || chars.length > 1);
    Object.assign(parameters, {
      use_coords: useCoords,
      characterPrompts: chars.map(c => ({prompt: c.prompt, uc: c.negative || '', center: center(c), enabled: true})),
      v4_prompt: {caption: {base_caption: input, char_captions: chars.map(c => ({char_caption: c.prompt, centers: [center(c)]}))}, use_coords: useCoords, use_order: true},
      v4_negative_prompt: {caption: {base_caption: words.negative, char_captions: chars.map(c => ({char_caption: c.negative || '', centers: [center(c)]}))}, legacy_uc: !!p.legacyUc}
    });
    if (p.legacyUc) parameters.legacy_uc = true;
  } else {
    // V3 has no character captions: appearances are appended to the main prompt.
    const extra = chars.map(c => c.prompt).filter(Boolean).join(', ');
    input = [input, extra].filter(Boolean).join(', ');
    Object.assign(parameters, {sm, sm_dyn: sm && p.smea === 'dyn'});
  }
  const director = f.reference ? (refs || []).filter(r => r?.image) : [];
  if (director.length) Object.assign(parameters, {
    director_reference_images: director.map(r => r.image),
    director_reference_descriptions: director.map(r => ({caption: {base_caption: REFERENCE_KINDS[r.kind] || REFERENCE_KINDS.character, char_captions: []}, legacy_uc: false})),
    director_reference_strength_values: director.map(r => clampTo(r.strength, -1, 1, .6)),
    // 保真度 as NovelAI's app shows it is the other way round from what it is sent as.
    director_reference_secondary_strength_values: director.map(r => +(1 - clampTo(r.fidelity, -1, 1, .5)).toFixed(3)),
    director_reference_information_extracted: director.map(() => 1)
  });
  // 局部重绘 takes no vibes: NovelAI's app does not send them with a mask.
  else if (vibes.length && vibeKey(p.model) && action !== 'infill') Object.assign(parameters, vibeParameters(vibes, normalizeVibes));
  if (base?.image) {
    const strength = clampTo(base.strength, .01, action === 'infill' ? 1 : .99, .7);
    Object.assign(parameters, {image: base.image, strength: Math.min(strength, .99), add_original_image: base.overlay !== false, extra_noise_seed: Math.max(0, seed - 1),
      // 局部重绘: how much of what is under the mask stays is its own setting on the newer models; fully redrawn at 1.
      ...(action === 'infill' ? {mask: base.mask, ...(f.inpaintStrength && strength < 1 ? {img2img: {strength, color_correct: true}} : {})} : {noise: clampTo(base.noise, 0, .99, 0), ...(base.enhance ? {color_correct: false} : {}), ...(base.upscaled && f.maxEnhance ? {upscaled_enhance: true} : {})})});
  }
  // A picture of 参数网格: 负面强度 other than 100%; NovelAI does not take a plain 0.
  if (p.uncondScale !== undefined && p.uncondScale !== 1) parameters.uncond_scale = p.uncondScale || 1e-5;
  // What the official app sends with 透明背景 on (V5): the picture comes back with straight alpha.
  if (p.transparent) Object.assign(parameters, {straight_alpha: true, tag_hint_transparent_background: true});
  const model = medium ? 'nai-diffusion-5-full-medium' : p.model;
  return {body: {input, model: action === 'infill' ? inpaintModel(model) : model, action, parameters}, seed, params: {...p, steps, sampler}, refs: director.length};
}

/** A picture's kind from its first bytes. */
const pictureType = bytes => bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 ? 'image/webp' : 'image/png';
// Reads the first PNG from a ZIP archive (stored or deflated) using the central directory.
export async function unzipFirstImage(buffer) { return (await unzipImages(buffer, 1))[0]; }
/** The pictures of a ZIP in its order (去背景 answers with several); at most `limit`. */
export async function unzipImages(buffer, limit = Infinity) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), found = [];
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [new Blob([bytes], {type: 'image/png'})];
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('NovelAI 返回的内容无法识别');
  let at = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    const type = /\.webp$/i.test(name) ? 'image/webp' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : 'image/png';
    if (method === 0) found.push(new Blob([data], {type}));
    else if (method === 8) {
      if (typeof DecompressionStream !== 'function') throw Error('这个浏览器不能解压 NovelAI 的图片（iPhone 需要 iOS 16.4 或更新）');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      found.push(new Blob([await new Response(stream).arrayBuffer()], {type}));
    } else throw Error('NovelAI 返回的压缩格式不受支持');
    if (found.length >= limit) return found;
  }
  if (!found.length) throw Error('NovelAI 返回的压缩包里没有图片');
  return found;
}

/** Subscription summary. Opus (tier 3) while active means free small images; `usage` is the V5 allowance when NovelAI reports it. */
export function readSubscription(data = {}) {
  const steps = data.trainingStepsLeft || {}, tier = Number(data.tier) || 0, active = data.active === true;
  const usage = data.usage && Number.isFinite(Number(data.usage.percent)) ? {percent: Math.max(0, Math.min(100, Math.round(Number(data.usage.percent)))), negative: data.usage.isNegative === true,
    // What its app shows of the allowance: how much was bought on top, and how soon the next percent comes back.
    ...(Number(data.usage.purchasedPercent) > 0 ? {purchased: Math.round(Number(data.usage.purchasedPercent))} : {}), ...(Number(data.usage.percent) > 100 ? {over: true} : {}),
    ...(Number(data.usage.timeUntilNextPercent) > 0 ? {nextPercentIn: Number(data.usage.timeUntilNextPercent)} : {})} : null;
  const unlimited = active && (tier === 3 || data.perks?.unlimitedImageGeneration === true);
  const anlas = typeof steps === 'number' ? steps : (Number(steps.fixedTrainingStepsLeft) || 0) + (Number(steps.purchasedTrainingSteps) || 0);
  return {tier, active, unlimited, usage, anlas, checkedAt: Date.now()};
}

/** Readable error with the HTTP status kept on it (the queue retries 429). */
function failure(status, text, relay = false) {
  if (relay && status === 401) return Object.assign(Error('中转拒绝了密钥（401）：请填写中转要求的密钥'), {status});
  if (relay && status === 404) return Object.assign(Error('中转返回 404：地址不对，或者中转没有转发这个接口（查订阅失败不影响出图）'), {status});
  const message = status === 401 ? 'NovelAI 密钥无效或已过期，请在引擎卡包里重新填写'
    : status === 402 ? 'Anlas 不足，或当前订阅不支持这次生成'
    : status === 429 ? 'NovelAI 账号正忙（可能有人在用同一个账号出图），重试几次后仍然没空，已停下'
    : status === 400 ? 'NovelAI 拒绝了这次请求：' + (text || '参数无效').slice(0, 160)
    : `NovelAI 暂时不可用（${status}）`;
  return Object.assign(Error(relay ? '经中转：' + message : message), {status});
}

/** An address asked through the tavern's /proxy/: its route drops a query and decodes once, so such an address goes encoded. */
const proxied = target => '/proxy/' + (/[?%]/.test(target) ? encodeURIComponent(target) : target);
const TAVERN_GONE = '连不上酒馆的转发：刷新一下页面，看看酒馆还开着没有';

/**
 * Why a relay gave this page no answer, in plain words, from core/proxy-url.js reachService (proxy 'login': the tavern
 * asks for a browser login, which the relay's key would take the place of on the way through it). body: the request.
 */
export function relayTrouble(r, body = '') {
  const mb = typeof body === 'string' ? body.length / 1048576 : 0;
  if (r.via === 'direct') return mb >= 1
    ? `中转连得上，但这次的请求没送到：它有 ${mb.toFixed(1)} MB（底图、角色参考、Vibe 都算在里面），中转可能不收这么大的。少带一些、换小一点的图再试，或者问问中转的提供者`
    : '中转连得上，但这次没收到它的回答（中转出错或超时的时候常常不带跨域头，浏览器就读不到）：再试一次，一直这样就问问中转的提供者';
  const turnOn = '在酒馆的 config.yaml 里把 enableCorsProxy 改成 true、重启酒馆，小手机会自动经酒馆去连';
  if (r.state === 'blocked') return '中转开着，但它不让网页直接访问（没开跨域 CORS）。' + (r.proxy === 'off' ? turnOn
    : ({missing: '这个酒馆没有转发功能（TauriTavern 这类 App 酒馆现在没有），', login: '酒馆开了密码登录，经酒馆转发时中转的密钥会顶掉登录，所以没走酒馆；', on: '酒馆的转发也连不上它，'}[r.proxy] || '') + '要中转自己允许跨域，问问中转的提供者');
  if (r.state === 'mixed') return '酒馆是用 https 打开的，浏览器不让它连 http:// 的中转：给中转配上 https' + (r.proxy === 'off' ? '，或者' + turnOn : '');
  if (r.state === 'loopback') return '中转地址是 127.0.0.1，指的是正在用的这台设备自己：在手机上用时，要写运行中转的那台电脑的地址';
  return `连不上中转，它没有任何回应${r.proxy === 'on' ? '，酒馆那边也连不上它' : ''}：可能关了、换了地址、证书过期，或者这台设备的网络连不到它（有的中转要挂梯子）。问问中转的提供者，或者先换回 NovelAI 官方`;
}

export class NovelAIClient {
  // relay: the user's relay address ('' for NovelAI itself), set from the drawing settings before each call.
  // viaTavern: relays only the tavern's /proxy/ reaches (they let no web page ask them), found when one gave no answer.
  constructor(fetcher = (...args) => globalThis.fetch(...args), page = globalThis.location) { this.fetch = fetcher; this.page = page; this.now = Date.now; this.key = ''; this.relay = ''; this.viaTavern = new Set(); }
  setKey(key) { this.key = String(key || '').trim(); }
  get configured() { return !!this.key; }
  headers() {
    if (!this.key) throw Error('还没有填写 NovelAI 密钥');
    return {Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json'};
  }
  /** Where base + path is asked: through the tavern's /proxy/ for a relay only it reaches. */
  at(base, path) {
    const through = proxyAddress(base) ? base.slice(7) : this.viaTavern.has(base) ? base : '';
    return through ? proxied(through + path) : base + path;
  }
  async call(path, init, host = NAI_HOST) {
    const relay = this.relay, base = relay || host, started = this.now();
    let response;
    try { response = await this.fetch(this.at(base, path), init); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (!relay) throw Error('连不上 NovelAI，请检查网络');
      // Turned down at once (a preflight refused, nobody there) it was never drawn; a GET costs nothing. Either may go again.
      response = await this.around(base, path, init, (init.method || 'GET') === 'GET' || this.now() - started < 3000);
    }
    if (!response.ok) throw failure(response.status, await response.text().catch(() => ''), !!relay);
    return response;
  }
  /**
   * A relay this page got no answer from. An empty request, which draws nothing, tells why: the relay is not there, it
   * lets no web page ask it (CORS), or only this request did not get through (too big, say: then `unread`). When only the
   * tavern's /proxy/ reaches the relay, it is asked that way from then on, and this request goes again if `again`: a
   * request that failed only after a while may have been drawn and paid for all the same, its answer unread.
   */
  async around(base, path, init, again) {
    if (proxyAddress(base) || this.viaTavern.has(base)) throw Error(TAVERN_GONE);
    const r = await this.reach(base, init.signal);
    init.signal?.throwIfAborted?.();
    if (r.via !== 'proxy') throw Object.assign(Error(relayTrouble(r, init.body)), r.via === 'direct' ? {unread: true, again} : {});
    this.viaTavern.add(base);
    if (!again) throw Error('中转不让网页直接访问，已经改成经酒馆转发。这次等了一会儿才失败，中转那边可能已经做了，所以没有自动再发（免得扣两次）：再试一次就好');
    return this.fetch(this.at(base, path), init);
  }
  /** How a relay can be asked from this page (core/proxy-url.js reachService), knocking with an empty request. */
  async reach(base, signal) {
    const soon = () => AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]);
    const knock = url => this.fetch(url, {method: 'POST', headers: this.headers(), body: '{}', signal: soon()});
    let login = false;
    const r = await reachService(base, {page: this.page, direct: (url, how) => how?.mode ? this.fetch(url, {...how, signal: soon()}) : knock(url + '/ai/generate-image'),
      proxy: async url => { if ((login = await tavernLogin(this.fetch, this.page))) throw Error('login'); return knock(proxied(url + '/ai/generate-image')); }});
    return login ? {...r, proxy: 'login'} : r;
  }
  /**
   * Checks the drawing route without drawing: an empty request that reaches NovelAI is refused as invalid (400/422),
   * which costs nothing. {ok, status}: status 0 when the address cannot be reached at all, with why for a relay
   * (reason); via 'proxy' when only the tavern reaches the relay, which is then asked that way.
   */
  async probe(signal) {
    const relay = this.relay, base = relay || NAI_HOST;
    const knock = () => this.fetch(this.at(base, '/ai/generate-image'), {method: 'POST', headers: this.headers(), body: '{}', signal});
    let response;
    try { response = await knock(); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (!relay) return {ok: false, status: 0};
      if (proxyAddress(base) || this.viaTavern.has(base)) return {ok: false, status: 0, reason: TAVERN_GONE};
      const r = await this.reach(base, signal);
      if (r.via !== 'proxy') return {ok: false, status: 0, reason: relayTrouble(r)};
      this.viaTavern.add(base);
      try { response = await knock(); } catch { return {ok: false, status: 0}; }
    }
    await response.body?.cancel?.().catch(() => {});
    return {ok: [400, 422, 429].includes(response.status) || response.ok, status: response.status, ...(this.viaTavern.has(base) ? {via: 'proxy'} : {})};
  }
  /** Encodes a picture (base64) into a vibe for a model: 2 Anlas. Returns the encoding as base64. */
  async encodeVibe(image, model, informationExtracted, signal) {
    const response = await this.call('/ai/encode-vibe', {method: 'POST', headers: this.headers(), body: JSON.stringify({image, information_extracted: informationExtracted, model}), signal});
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 100) throw Error('Vibe 编码结果不对（只有 ' + bytes.length + ' 字节），可能是' + (this.relay ? '中转' : 'NovelAI') + '返回了错误');
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
  }
  async subscription(signal) {
    let response;try{response=await this.call('/user/subscription', {headers:this.headers(),signal});}catch(error){
      // A relay that draws but gives no answer here does not pass the subscription on, as its 404 would say (the phone then offers 按 Opus 算).
      if(error.unread)error=Object.assign(Error('这个中转没有回答查订阅（多半是没有转发这个接口），不影响出图'),{status:404});
      error.operation='subscription';if(error.name!=='AbortError')error.message='订阅查询失败：'+error.message;throw error;}
    return readSubscription(await response.json());
  }
  async generate(body, signal) {
    const response = await this.call('/ai/generate-image', {method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal});
    return unzipFirstImage(await response.arrayBuffer());
  }
  /**
   * 边画边看: the same request on NovelAI's stream, frames of a 4-byte length and a MessagePack map. onFrame({image,
   * step, steps}) with each picture on the way; the last picture comes back. Where the stream is not there (a relay
   * that does not pass it on) the plain request is made instead: nothing has been drawn or paid for by then.
   */
  async generateStream(body, signal, onFrame = () => {}) {
    const request = {...body, parameters: {...body.parameters, stream: 'msgpack'}};
    let response;
    try { response = await this.call('/ai/generate-image-stream', {method: 'POST', headers: this.headers(), body: JSON.stringify(request), signal}); }
    // A relay without the stream may also answer its address with no CORS headers, at once: the empty request got through then.
    catch (error) { if ([404, 405, 501].includes(error?.status) || error?.unread && error.again) return this.generate(body, signal); throw error; }
    const reader = response.body?.getReader?.();
    if (!reader) return unzipFirstImage(await response.arrayBuffer());
    const steps = body.parameters.steps;
    let held = new Uint8Array(0), final = null, failed = '', checked = false;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      const next = new Uint8Array(held.length + value.length);
      next.set(held); next.set(value, held.length); held = next;
      // A relay may answer the stream's address with the usual ZIP.
      if (!checked && held.length >= 2) { checked = true; if (held[0] === 0x50 && held[1] === 0x4b) { for (;;) { const more = await reader.read(); if (more.done) break; const all = new Uint8Array(held.length + more.value.length); all.set(held); all.set(more.value, held.length); held = all; } return unzipFirstImage(held.buffer.slice(held.byteOffset, held.byteOffset + held.byteLength)); } }
      while (held.length >= 4) {
        const size = new DataView(held.buffer, held.byteOffset, 4).getUint32(0);
        if (held.length < 4 + size) break;
        const frame = unpack(held.subarray(4, 4 + size));
        held = held.slice(4 + size);
        const image = typeof frame?.image === 'string' ? Uint8Array.from(atob(frame.image), c => c.charCodeAt(0)) : frame?.image;
        if (frame?.event_type === 'error') failed = String(frame.message || 'NovelAI 没画成');
        else if (frame?.event_type === 'intermediate' && image) onFrame({image: new Blob([image], {type: pictureType(image)}), step: Number(frame.step_ix) || 0, steps});
        else if (frame?.event_type === 'final' && image) final = new Blob([image], {type: pictureType(image)});
      }
    }
    if (final) return final;
    throw Object.assign(Error(failed ? 'NovelAI 没画成：' + failed : 'NovelAI 的流式回应中断了，没有收到最后的图'), {status: 0});
  }
  /** Tags that begin with what is being typed: [{tag, count}]. NovelAI asks no Anlas for this. */
  async suggestTags({model, prompt, mode = 'anime', signal} = {}) {
    const word = String(prompt || '').replace(/[/[{}\]]/g, '').trim();
    if (!word) return [];
    const v5 = isV5(model), asked = !v5 && mode === 'furry' ? 'nai-diffusion-furry-3' : model;
    const query = `?model=${encodeURIComponent(asked)}&prompt=${encodeURIComponent(word)}${v5 ? `&type=${mode === 'furry' ? 'furryv5' : 'animev5'}` : ''}`;
    const response = await this.call('/ai/generate-image/suggest-tags' + query, {headers: this.headers(), signal});
    const data = await response.json();
    return (Array.isArray(data?.tags) ? data.tags : []).map(t => ({tag: String(t.tag || ''), count: Number(t.count) || 0})).filter(t => t.tag);
  }
  /** 导演工具: body from augmentBody. Every picture back, from a ZIP (去背景 gives several versions, the rest one). */
  async augment(body, signal) {
    const response = await this.call('/ai/augment-image', {method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal});
    return unzipImages(await response.arrayBuffer());
  }
  /** 放大: body from upscaleBody. */
  async upscale(body, signal) {
    const response = await this.call('/ai/upscale', {method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal});
    return unzipFirstImage(await response.arrayBuffer());
  }
}

export const TIER_NAMES = {0: '未订阅', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'};
/** The V5 allowance in pictures, and how much of it comes back in a day, as NovelAI's app reckons them. */
export const usageImages = percent => Math.round(17.3 * percent);
export const usageRefillPerDay = usage => usage?.nextPercentIn > 0 ? Math.round(86400 / usage.nextPercentIn * 10) / 10 : 0;

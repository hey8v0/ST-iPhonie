// NovelAI image client used directly from the browser (image.novelai.net allows cross-origin requests).
// The key stays in this browser; nothing here goes through the tavern server.
import {proxyAddress} from './proxy-url.js';

import {vibeKey, vibeParameters} from './vibes.js';

export const NAI_HOST = 'https://image.novelai.net';
/** NovelAI's other host: 放大 (upscale) is asked there. */
export const NAI_API = 'https://api.novelai.net';
/**
 * A relay the user runs in front of NovelAI: the same paths (/ai/generate-image, /user/subscription) and whatever key it
 * asks for. '' means NovelAI itself. A page opened over HTTPS cannot reach an http:// relay (except on this computer).
 */
const NAI_PATHS = /\/(ai\/generate-image(-stream)?|ai\/augment-image|ai\/upscale|user\/subscription)$/i;
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
export const NAI_MODELS = ['nai-diffusion-5-full', 'nai-diffusion-5-curated', 'nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full', 'nai-diffusion-4-curated-preview', 'nai-diffusion-3'];
export const NAI_MODEL_NAMES = {
  'nai-diffusion-5-full': 'V5 Full', 'nai-diffusion-5-curated': 'V5 Curated', 'nai-diffusion-4-5-full': 'V4.5 Full', 'nai-diffusion-4-5-curated': 'V4.5 Curated',
  'nai-diffusion-4-full': 'V4 Full', 'nai-diffusion-4-curated-preview': 'V4 Curated', 'nai-diffusion-3': 'Anime V3'
};
export const NAI_SAMPLERS = ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m_sde', 'k_dpmpp_2m', 'k_dpmpp_sde'];
export const NAI_SCHEDULES = ['karras', 'exponential', 'polyexponential'];
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
  return {model: 'nai-diffusion-4-5-full', width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral', schedule: 'karras', seed: -1, cfgRescale: 0, variety: false};
}

export function normalizeDrawParams(value = {}) {
  const base = defaultDrawParams(), p = {...base, ...value};
  const num = (v, min, max, fallback, step = 1) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n / step) * step)) : fallback; };
  p.model = NAI_MODELS.includes(p.model) ? p.model : base.model;
  p.sampler = NAI_SAMPLERS.includes(p.sampler) ? p.sampler : base.sampler;
  p.schedule = NAI_SCHEDULES.includes(p.schedule) ? p.schedule : base.schedule;
  p.width = num(p.width, 64, 1856, base.width, 64);
  p.height = num(p.height, 64, 1856, base.height, 64);
  p.steps = num(p.steps, 1, 50, base.steps);
  p.scale = num(p.scale, 0, 10, base.scale, .1);
  p.cfgRescale = num(p.cfgRescale, 0, 1, 0, .02);
  p.seed = num(p.seed, -1, 4294967295, -1);
  p.variety = !!p.variety && !isV5(p.model);
  // 透明背景: V5 draws with an alpha channel (立绘 without cutting the background out).
  p.transparent = !!p.transparent && isV5(p.model);
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
/** Anlas a character reference adds to each picture (never in the Opus free tier). */
export const REFERENCE_ANLAS = 5;
/** What a reference passes on: the character, the style, or both (NovelAI's own words go in the request). */
export const REFERENCE_KINDS = Object.freeze({character: 'character', style: 'style', both: 'character&style'});
/** The sizes a reference picture is fitted into (padded with black), by its shape. */
export const REFERENCE_SIZES = Object.freeze([[1024, 1536], [1536, 1024], [1472, 1472]]);
/** The model that repaints part of a picture (局部重绘). V5 Curated has none of its own: V4.5 Curated's, asked as V4.5. */
export const inpaintModel = model => model === 'nai-diffusion-5-curated' ? 'nai-diffusion-4-5-curated-inpainting' : model === 'nai-diffusion-4-curated-preview' ? 'nai-diffusion-4-curated-inpainting' : model + '-inpainting';
/** 导演工具 (Director tools): what each does to a picture. 上色 and 换表情 take words and a 去瑕疵 level. */
export const DIRECTOR_TOOLS = Object.freeze({'bg-removal': '去背景', lineart: '线稿', sketch: '素描', colorize: '上色', emotion: '换表情', declutter: '去杂物'});
export const DIRECTOR_WORDS = Object.freeze(['colorize', 'emotion']);
/** 换表情: the moods NovelAI knows (its words) with their names here. */
export const EMOTIONS = Object.freeze([['neutral', '平静'], ['happy', '开心'], ['sad', '难过'], ['angry', '生气'], ['scared', '害怕'], ['surprised', '惊讶'], ['tired', '疲惫'], ['excited', '兴奋'], ['nervous', '紧张'], ['thinking', '思考'], ['confused', '困惑'], ['shy', '害羞'], ['disgusted', '嫌弃'], ['smug', '得意'], ['bored', '无聊'], ['laughing', '大笑'], ['irritated', '烦躁'], ['aroused', '动情'], ['embarrassed', '尴尬'], ['worried', '担心'], ['love', '爱慕'], ['determined', '坚定'], ['hurt', '受伤'], ['playful', '调皮']]);
/** 放大: the biggest side NovelAI makes. */
export const UPSCALE_MAX = 4096;
/** The body of a Director tool request: the picture, its size and the tool; mood and words for 换表情 / 上色. */
export function augmentBody({tool, image, width, height, prompt = '', mood = 'neutral', defry = 0}) {
  if (!Object.hasOwn(DIRECTOR_TOOLS, tool)) throw Error('没有这个导演工具');
  const words = String(prompt || '').trim(), level = Math.max(0, Math.min(5, Math.round(Number(defry) || 0)));
  return {image, width, height, req_type: tool, ...(tool === 'emotion' ? {prompt: `${mood};;${words}`, defry: level} : tool === 'colorize' ? {prompt: words, defry: level} : {})};
}
/** 放大 by 4 when the result stays within UPSCALE_MAX, else by 2; 0 when even that is too big. */
export const upscaleBy = (width, height) => [4, 2].find(k => width * k <= UPSCALE_MAX && height * k <= UPSCALE_MAX) || 0;
const clampTo = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

/**
 * vibes: [{encoding, strength}] already encoded for this model; ignored by models without vibes (V5, V3).
 * base: {image (base64 PNG at width×height), width, height, strength, noise, mask?} — 图生图, or 局部重绘 with a mask
 * (white where it is drawn again); the picture is then drawn at the base's size. refs: [{image (fitted, base64), kind,
 * strength, fidelity}] — 角色参考, V4.5 only; with them no vibe is sent (NovelAI's own app does the same: both at once
 * come back broken). The result says whether references went (refs) so the vibes are left out.
 */
export function buildImageRequest({prompt, negative = '', characters = [], params, vibes = [], base = null, refs = []}) {
  const p = normalizeDrawParams(params);
  if (base?.image) { p.width = base.width; p.height = base.height; }
  const action = base?.image ? (base.mask ? 'infill' : 'img2img') : 'generate';
  // V5 Curated repaints with V4.5 Curated's model, so the request is V4.5-shaped then.
  const shape = action === 'infill' && p.model === 'nai-diffusion-5-curated' ? 'nai-diffusion-4-5-curated' : p.model;
  const seed = p.seed >= 0 ? p.seed : Math.floor(Math.random() * 4294967295);
  const parameters = {
    params_version: isV5(shape) ? 4 : 3, width: p.width, height: p.height, scale: p.scale, sampler: p.sampler, steps: p.steps, n_samples: 1, seed,
    ucPreset: 0, qualityToggle: false, dynamic_thresholding: false, controlnet_strength: 1, legacy: false, add_original_image: false,
    cfg_rescale: p.cfgRescale, noise_schedule: p.schedule, legacy_v3_extend: false, deliberate_euler_ancestral_bug: false, prefer_brownian: true,
    skip_cfg_above_sigma: p.variety && !isV5(p.model) ? Math.pow(p.width * p.height / REFERENCE_PIXELS, .5) * (p.model.includes('4-5') ? 58 : 19) : null,
    negative_prompt: negative
  };
  if (isV4(p.model)) {
    const chars = characters.filter(c => c.prompt?.trim());
    const useCoords = chars.some(c => c.position >= 0);
    const center = c => c.position >= 0 ? gridCenter(c.position) : {x: .5, y: .5};
    Object.assign(parameters, {
      use_coords: useCoords,
      characterPrompts: chars.map(c => ({prompt: c.prompt, uc: c.negative || '', center: center(c), enabled: true})),
      v4_prompt: {caption: {base_caption: prompt, char_captions: chars.map(c => ({char_caption: c.prompt, centers: [center(c)]}))}, use_coords: useCoords, use_order: true},
      v4_negative_prompt: {caption: {base_caption: negative, char_captions: chars.map(c => ({char_caption: c.negative || '', centers: [center(c)]}))}, legacy_uc: false}
    });
  } else {
    // V3 has no character captions: appearances are appended to the main prompt.
    const extra = characters.map(c => c.prompt).filter(Boolean).join(', ');
    prompt = [prompt, extra].filter(Boolean).join(', ');
    Object.assign(parameters, {sm: false, sm_dyn: false});
  }
  const director = takesReference(p.model) ? (refs || []).filter(r => r?.image) : [];
  if (director.length) Object.assign(parameters, {
    director_reference_images: director.map(r => r.image),
    director_reference_descriptions: director.map(r => ({caption: {base_caption: REFERENCE_KINDS[r.kind] || REFERENCE_KINDS.character, char_captions: []}, legacy_uc: false})),
    director_reference_strength_values: director.map(r => clampTo(r.strength, 0, 1, .6)),
    // 保真度 as NovelAI's app shows it is the other way round from what it is sent as.
    director_reference_secondary_strength_values: director.map(r => +(1 - clampTo(r.fidelity, 0, 1, .5)).toFixed(3)),
    director_reference_information_extracted: director.map(() => 1)
  });
  else if (vibes.length && vibeKey(p.model)) Object.assign(parameters, vibeParameters(vibes));
  if (base?.image) Object.assign(parameters, {image: base.image, strength: clampTo(base.strength, .01, .99, .7), add_original_image: true,
    ...(action === 'infill' ? {mask: base.mask} : {noise: clampTo(base.noise, 0, .99, 0), extra_noise_seed: seed})});
  // What the official app sends with 透明背景 on (V5): the picture comes back with straight alpha.
  if (p.transparent) Object.assign(parameters, {straight_alpha: true, tag_hint_transparent_background: true});
  return {body: {input: prompt, model: action === 'infill' ? inpaintModel(p.model) : p.model, action, parameters}, seed, params: p, refs: director.length};
}

// Reads the first PNG from a ZIP archive (stored or deflated) using the central directory.
export async function unzipFirstImage(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return new Blob([bytes], {type: 'image/png'});
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
    if (method === 0) return new Blob([data], {type});
    if (method === 8) {
      if (typeof DecompressionStream !== 'function') throw Error('这个浏览器不能解压 NovelAI 的图片（iPhone 需要 iOS 16.4 或更新）');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Blob([await new Response(stream).arrayBuffer()], {type});
    }
    throw Error('NovelAI 返回的压缩格式不受支持');
  }
  throw Error('NovelAI 返回的压缩包里没有图片');
}

/** Subscription summary. Opus (tier 3) while active means free small images; `usage` is the V5 allowance when NovelAI reports it. */
export function readSubscription(data = {}) {
  const steps = data.trainingStepsLeft || {}, tier = Number(data.tier) || 0, active = data.active === true;
  const usage = data.usage && Number.isFinite(Number(data.usage.percent)) ? {percent: Math.max(0, Math.min(100, Math.round(Number(data.usage.percent)))), negative: data.usage.isNegative === true} : null;
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

export class NovelAIClient {
  // relay: the user's relay address ('' for NovelAI itself), set from the drawing settings before each call.
  constructor(fetcher = (...args) => globalThis.fetch(...args)) { this.fetch = fetcher; this.key = ''; this.relay = ''; }
  setKey(key) { this.key = String(key || '').trim(); }
  get configured() { return !!this.key; }
  headers() {
    if (!this.key) throw Error('还没有填写 NovelAI 密钥');
    return {Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json'};
  }
  async call(path, init, host = NAI_HOST) {
    const relay = this.relay;
    let response;
    try { response = await this.fetch((relay || host) + path, init); }
    catch (error) { if (error?.name === 'AbortError') throw error; throw Error(relay ? '连不上中转：请确认地址正确、中转允许跨域（CORS）；酒馆用 HTTPS 打开时，中转也要用 HTTPS' : '连不上 NovelAI，请检查网络'); }
    if (!response.ok) throw failure(response.status, await response.text().catch(() => ''), !!relay);
    return response;
  }
  /**
   * Checks the drawing route without drawing: an empty request that reaches NovelAI is refused as invalid (400/422),
   * which costs nothing. {ok, status}: status 0 when the address cannot be reached at all.
   */
  async probe(signal) {
    let response;
    try { response = await this.fetch((this.relay || NAI_HOST) + '/ai/generate-image', {method: 'POST', headers: this.headers(), body: '{}', signal}); }
    catch (error) { if (error?.name === 'AbortError') throw error; return {ok: false, status: 0}; }
    await response.body?.cancel?.().catch(() => {});
    return {ok: [400, 422, 429].includes(response.status) || response.ok, status: response.status};
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
    let response;try{response=await this.call('/user/subscription', {headers:this.headers(),signal});}catch(error){error.operation='subscription';if(error.name!=='AbortError')error.message='订阅查询失败：'+error.message;throw error;}
    return readSubscription(await response.json());
  }
  async generate(body, signal) {
    const response = await this.call('/ai/generate-image', {method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal});
    return unzipFirstImage(await response.arrayBuffer());
  }
  /** 导演工具: body from augmentBody. The picture back (from a ZIP, as a drawing is). */
  async augment(body, signal) {
    const response = await this.call('/ai/augment-image', {method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal});
    return unzipFirstImage(await response.arrayBuffer());
  }
  /** 放大: {image, width, height, scale}, asked on NovelAI's api host (or the relay). */
  async upscale(body, signal) {
    const response = await this.call('/ai/upscale', {method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal}, NAI_API);
    return unzipFirstImage(await response.arrayBuffer());
  }
}

export const TIER_NAMES = {0: '未订阅', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'};

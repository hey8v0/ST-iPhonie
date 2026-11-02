// The services that sing a song written in 音乐 App (core/song.js). Each takes the same request, {title, style, lyrics, instrumental,
// language, seconds, model}, and gives back {blob, lyric?, words?}. Requests go through tools.fetch; a key is the user's and goes only to
// its own service. Replicate's address does not allow web pages, so it goes through the tavern's proxy; the others are asked directly.
// A service that keeps working after it answers says so with tools.onTask, so the song can be picked up after the page was reloaded.
import {chunkPlan, styleFor} from './song.js';
import {noTavernProxy} from './proxy-url.js';

/** Who has a key card of its own in 引擎 (ElevenLabs and MiniMax share their voice cards' keys; ComfyUI needs none). */
export const SONG_KEYS = Object.freeze(['stepfun', 'lyria', 'replicate']);
export const SING_ENGINES = Object.freeze(['stepfun', 'eleven', 'lyria', 'replicate', 'comfy', 'mini']);
export const SING_NAMES = Object.freeze({stepfun: '阶跃星辰', eleven: 'ElevenLabs', lyria: 'Google Lyria', replicate: 'Replicate', comfy: 'ComfyUI（ACE-Step）', mini: 'MiniMax'});
/** What a service keeps working on can be waited for again. */
export const SING_RESUMES = Object.freeze(['stepfun', 'replicate']);

export const LYRIA_MODELS = Object.freeze([['lyria-3.5', 'Lyria 3.5（整首歌）'], ['lyria-3-clip-preview', 'Lyria 3 Clip（30 秒片段）']]);
/** Models on Replicate that sing given words: which of their inputs takes what, and what one costs (read from their pages, 2026-11-02). */
export const REPLICATE_MODELS = Object.freeze([
  {id: 'minimax/music-2.5', name: 'MiniMax Music 2.5', style: 'prompt', lyrics: 'lyrics', maxLyrics: 3500, price: 0.15},
  {id: 'minimax/music-1.5', name: 'MiniMax Music 1.5', style: 'prompt', lyrics: 'lyrics', maxLyrics: 600, price: 0.03},
  {id: 'lucataco/ace-step', name: 'ACE-Step', style: 'tags', lyrics: 'lyrics', duration: 'duration', price: 0.03, community: true}
]);
const STEP_FREE_UNTIL = Date.UTC(2026, 10, 8, 15, 59, 59), STEP_PREVIEW = 'stepaudio-3-music-preview', STEP_MODEL = 'stepaudio-3-music';
const POLL_LIMIT = 15 * 60 * 1000, COMFY_LIMIT = 60 * 60 * 1000;
const yuan = n => n.toFixed(n < 1 ? 2 : 1), minutes = seconds => Math.max(1, Number(seconds) || 120) / 60;

/** About what a song costs: {free, text}. Prices as the services stated them on 2026-11-02. */
export function singPrice(engine, {model = '', seconds = 120} = {}, now = Date.now()) {
  if (engine === 'comfy') return {free: true, text: '在你自己的电脑上跑，不花钱'};
  if (engine === 'stepfun') return now <= STEP_FREE_UNTIL ? {free: true, text: '限时免费到 11 月 8 日（北京时间）'} : {free: false, text: `大约 ${yuan(minutes(seconds) * 16 / 60)} 元（每小时音频 16 元，按实际长度算）`};
  if (engine === 'eleven') return {free: false, text: `大约 ${yuan(minutes(seconds) * 0.15)} 美元（每分钟 0.15 美元，从 ElevenLabs 账户扣）`};
  if (engine === 'lyria') return {free: false, text: model === 'lyria-3-clip-preview' ? '大约 0.04 美元一段（Google 按次收费）' : '大约 0.08 美元一首（Google 按次收费）'};
  if (engine === 'mini') return {free: false, text: '大约 1 元一首（MiniMax 按首收费）'};
  const known = REPLICATE_MODELS.find(m => m.id === model);
  return {free: false, text: known ? `大约 ${yuan(known.price)} 美元一首（从 Replicate 账户扣）` : '按这个模型在 Replicate 上的价格收费'};
}

const sleeper = signal => ms => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason || new DOMException('Aborted', 'AbortError')); return; }
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason || new DOMException('Aborted', 'AbortError')); }, {once: true});
});
const decodeBase64 = (data, type) => {
  const bin = atob(String(data).replace(/^data:[^,]*,/, '')), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {type});
};
const decodeHex = (data, type) => {
  const hex = String(data), bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return new Blob([bytes], {type});
};
/** The body of an answer as text and, when it is JSON, as data. */
async function bodyOf(response) {
  const text = await response.text().catch(() => '');
  try { return {text, json: JSON.parse(text)}; } catch { return {text, json: null}; }
}
const said = (text, max = 200) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const unreachable = (name, error) => error?.name === 'AbortError' ? error : Object.assign(Error(`连不上${name}：检查网络，再试一次`), {network: true});
async function asking(name, send) {
  try { return await send(); } catch (error) { throw unreachable(name, error); }
}
/** Goes on asking how a job stands until it is over (at once first: going back to a job, it may be done); a moment's trouble on the way (too many questions, the network, a busy service) does not end it. */
async function polling({name, limit = POLL_LIMIT, every, wait, ask}) {
  const start = Date.now();
  let lost = 0;
  for (;; await wait(every)) {
    if (Date.now() - start > limit) throw Error(`${name}做得太久了，没等到结果：可以过一会儿再试一次`);
    let answer;
    try { answer = await ask(); lost = 0; }
    catch (error) {
      if (error?.name === 'AbortError' || !error?.again) { if (!error?.network) throw error; }
      if (++lost > 12) throw error;
      continue;
    }
    if (answer !== undefined) return answer;
  }
}
const again = message => Object.assign(Error(message), {again: true});

// ---------- 阶跃星辰 ----------
const STEP_BASE = 'https://api.stepfun.com/v1/audio/music';
function stepFailure(status, json, text) {
  const type = json?.error?.type || '', message = said(json?.error?.message || text);
  if (status === 401) return Error('阶跃星辰拒绝了密钥：回「引擎 → 阶跃星辰」重新填一次');
  if (status === 402 || /credit/i.test(type)) return Error('阶跃星辰账户的额度不够：去它的开放平台看看余额');
  if (status === 451) return Error('这首歌的内容没过阶跃星辰的审核：改改歌词或风格再试');
  if (status === 429) return again('阶跃星辰现在太忙（请求太多），稍后再试');
  if (status === 503) return again('阶跃星辰现在太忙，稍后再试');
  return Error(`阶跃星辰没有接这首歌（${status}）${message ? '：' + message : ''}`);
}
async function stepfun({style, lyrics, instrumental, language}, {fetch, key, onTask, wait, task, now}) {
  const headers = {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json; charset=utf-8'};
  let id = task;
  if (!id) {
    // The preview model goes when the free time ends and the priced one comes: whichever this account has.
    const models = now() <= STEP_FREE_UNTIL ? [STEP_PREVIEW, STEP_MODEL] : [STEP_MODEL, STEP_PREVIEW];
    const body = model => JSON.stringify({task: 'text_to_music', model_id: model, caption: styleFor({style, language, instrumental}) || 'pop', ...(instrumental ? {instrumental: true} : {lyrics}), response_format: 'mp3'});
    for (let i = 0; !id; i++) {
      const response = await asking('阶跃星辰', () => fetch(STEP_BASE + '/submit', {method: 'POST', headers, body: body(models[i])})), {json, text} = await bodyOf(response);
      if (response.ok && json?.task_id) { id = json.task_id; onTask(id, models[i]); break; }
      if (response.status === 404 && json?.error?.type === 'model_invalid' && i + 1 < models.length) continue;
      if (response.ok) throw Error('阶跃星辰没有给任务号：' + said(text));
      if (response.status === 404) throw Error('阶跃星辰说这个账号没有音乐模型的权限：去它的开放平台看看');
      const failure = stepFailure(response.status, json, text);
      throw failure.again ? Error(failure.message) : failure;
    }
  }
  return polling({name: '阶跃星辰', every: 5000, wait, ask: async () => {
    const response = await asking('阶跃星辰', () => fetch(STEP_BASE + '/query', {method: 'POST', headers, body: JSON.stringify({task_id: id})})), {json, text} = await bodyOf(response);
    if (response.status === 404) throw Error('阶跃星辰那边已经没有这个任务了（过了保留期）：再做一次');
    if (!response.ok) throw stepFailure(response.status, json, text);
    if (json?.status === 'SUCCESS') { if (!json.audio) throw Error('阶跃星辰说做好了，但没有给音频'); return {blob: decodeBase64(json.audio, 'audio/mpeg'), words: json.rewritten_lyrics || ''}; }
    if (json?.status === 'FAILED') {
      const stage = json.error?.stage;
      throw Error(stage === 'censor' ? '这首歌的内容没过阶跃星辰的审核：改改歌词或风格再试' : stage === 'internal' ? '阶跃星辰那边出错了：稍后再试一次' : '阶跃星辰没做成：' + said(json.error?.message || stage));
    }
    return undefined;
  }});
}

// ---------- ElevenLabs ----------
async function eleven({style, lyrics, instrumental, language, seconds}, {fetch, key}) {
  const headers = {'xi-api-key': key, 'Content-Type': 'application/json'};
  const plan = instrumental ? null : chunkPlan({lyrics, style: styleFor({style, language})});
  const body = plan
    ? {composition_plan: {chunks: plan.chunks}, model_id: 'music_v2_5'}
    : {prompt: styleFor({style, instrumental: true}), music_length_ms: Math.round(Math.min(300, Math.max(3, Number(seconds) || 120)) * 1000), force_instrumental: true, model_id: 'music_v2_5'};
  const response = await asking('ElevenLabs', () => fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {method: 'POST', headers, body: JSON.stringify(body)}));
  if (!response.ok) {
    const {json, text} = await bodyOf(response), detail = json?.detail, status = typeof detail === 'object' && !Array.isArray(detail) ? detail.status || '' : '', message = typeof detail === 'string' ? detail : detail?.message || (Array.isArray(detail) ? detail[0]?.msg : '') || text;
    if (response.status === 401 && /permission/i.test(status + message)) throw Error('这个 ElevenLabs 密钥没有写歌的权限：在它的 API Keys 页面给这个密钥打开 Music Generation');
    if (response.status === 401) throw Error('ElevenLabs 拒绝了密钥：回「引擎 → ElevenLabs」看看');
    if (/bad_prompt|bad_composition_plan|copyright/i.test(status + message)) throw Error('ElevenLabs 不接受这首歌的内容（不能提真实歌手、歌名，也不能用已有的歌词）：' + said(message));
    if (response.status === 403 || /paid|plan/i.test(status)) throw Error('ElevenLabs 只给付费套餐开放写歌的接口：' + said(message));
    if (response.status === 429) throw Error('ElevenLabs 现在太忙，或者这个月的额度用完了：稍后再试');
    throw Error(`ElevenLabs 没有接这首歌（${response.status}）${message ? '：' + said(message) : ''}`);
  }
  return {blob: await response.blob(), lyric: plan?.lyric || ''};
}

// ---------- Google Lyria ----------
/** The audio and the words of an interaction: its steps hold blocks of content. */
function lyriaBlocks(data) {
  const blocks = [];
  for (const step of Array.isArray(data?.steps) ? data.steps : []) if (step?.type === 'model_output') blocks.push(...(Array.isArray(step.content) ? step.content : []));
  return blocks;
}
async function lyria({style, lyrics, instrumental, language, seconds, model, url}, {fetch, key}) {
  const base = String(url || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '').replace(/\/v1beta$/, '');
  const clipOnly = model === 'lyria-3-clip-preview', length = !clipOnly && seconds ? `Make it about ${Math.round(seconds / 60 * 2) / 2} minutes long.` : '';
  const input = [styleFor({style, language, instrumental}), length, instrumental ? 'Instrumental only, no vocals.' : `Lyrics:\n${lyrics}`].filter(Boolean).join('\n\n');
  const response = await asking('Google', () => fetch(base + '/v1beta/interactions', {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key}, body: JSON.stringify({model: model || 'lyria-3.5', input})}));
  const {json, text} = await bodyOf(response), message = said(json?.error?.message || text);
  if (!response.ok) {
    if (/location|region|country/i.test(message)) throw Error('Google 不支持你所在的地区（中国大陆和香港不在支持范围）：可以在「引擎 → Google Lyria」填一个中转地址');
    if (response.status === 401 || response.status === 403 || /api key/i.test(message)) throw Error('Google 拒绝了密钥：回「引擎 → Google Lyria」看看，这个模型要开了付费的密钥才能用');
    if (response.status === 429) throw Error('Google 说请求太多，或者额度用完了：稍后再试');
    throw Error(`Google 没有接这首歌（${response.status}）${message ? '：' + message : ''}`);
  }
  const blocks = lyriaBlocks(json), audio = blocks.find(b => b?.type === 'audio' && b.data);
  if (!audio) throw Error('Google 没有给音频，可能是内容没过它的安全检查（不能要求某个歌手的声音，也不能用已有的歌词）' + (blocks.length ? '' : '：' + said(text, 120)));
  return {blob: decodeBase64(audio.data, audio.mime_type || 'audio/mpeg')};
}

// ---------- Replicate ----------
const replicateAddress = path => '/proxy/' + encodeURIComponent('https://api.replicate.com/v1' + path);
function replicateFailure(status, json, text, login = '') {
  const message = said(json?.detail || json?.title || text);
  if (status === 401 && /basic/i.test(login)) return Error('这个酒馆开了密码登录（basicAuth），经过转发时 Replicate 的密钥和酒馆的登录用的是同一个位置，冲突了：换一家来唱，或者关掉酒馆的 basicAuth');
  if (noTavernProxy(text)) return Error('Replicate 不让网页直接访问，要经过酒馆转发，这个酒馆没有转发功能（TauriTavern 这类 App 酒馆现在没有）：换一家来唱');
  if (status === 403 && /CORS proxy is disabled/i.test(text)) return Error('Replicate 不让网页直接访问，要经过酒馆转发：在酒馆的 config.yaml 里把 enableCorsProxy 改成 true，重启酒馆');
  if (status === 401 || status === 403 || /authentication token|unauthenticated/i.test(message)) return Error('Replicate 拒绝了密钥：回「引擎 → Replicate」看看');
  if (status === 402) return Error('Replicate 账户的余额不够：去它的账单页面看看');
  if (status === 404) return Object.assign(Error('Replicate 上没有这个模型：回「引擎 → Replicate」换一个'), {noModel: true});
  if (status === 429) return again('Replicate 现在太忙（请求太多），稍后再试');
  return Error(`Replicate 没有接这首歌（${status}）${message ? '：' + message : ''}`);
}
/** Which of a model's inputs takes what, from what the model says it takes. */
export function replicateFields(properties) {
  const names = Object.keys(properties || {}), find = re => names.find(n => re.test(n));
  return {lyrics: find(/^lyrics?$/i), style: find(/^(prompt|tags|style|caption|description)$/i), duration: find(/^(duration|seconds)$/i)};
}
async function replicate({style, lyrics, instrumental, language, seconds, model}, {fetch, key, onTask, wait, task}) {
  const headers = {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'};
  const read = async response => {
    const {json, text} = await bodyOf(response);
    if (!response.ok || noTavernProxy(text)) throw replicateFailure(response.status, json, text, response.headers?.get?.('www-authenticate') || '');
    return json;
  };
  const start = async () => {
    const id = String(model || REPLICATE_MODELS[0].id).trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(id)) throw Error('Replicate 的模型要写成「作者/模型名」，比如 minimax/music-2.5');
    const listed = REPLICATE_MODELS.find(m => m.id === id);
    let info = null;
    const about = async () => info ??= await read(await asking('酒馆转发', () => fetch(replicateAddress('/models/' + id), {headers})));
    let fields = listed;
    if (!fields) {
      fields = replicateFields((await about())?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties);
      if (!fields.style && !fields.lyrics) throw Error(`看不懂「${id}」要什么参数：选列表里的模型`);
    }
    if (fields.maxLyrics && lyrics.length > fields.maxLyrics) throw Error(`这个模型的歌词最多 ${fields.maxLyrics} 字，现在有 ${lyrics.length} 字：改短一点，或者换一个模型`);
    const input = {};
    if (fields.style) input[fields.style] = styleFor({style, language, instrumental});
    if (fields.lyrics) input[fields.lyrics] = instrumental ? '[Instrumental]' : lyrics;
    else if (fields.style && !instrumental) input[fields.style] += `\n\nLyrics:\n${lyrics}`;
    if (fields.duration && seconds) input[fields.duration] = Number(seconds);
    const post = async (path, body) => read(await asking('酒馆转发', () => fetch(replicateAddress(path), {method: 'POST', headers, body: JSON.stringify(body)})));
    // An official model is run by its name; any other answers that with 404 and is run by a version of it, which its description tells.
    if (!listed?.community) {
      try { return await post(`/models/${id}/predictions`, {input}); }
      catch (error) { if (!error.noModel) throw error; }
    }
    const version = (await about())?.latest_version?.id;
    if (!version) throw Error(`Replicate 上的「${id}」没有能运行的版本：回「引擎 → Replicate」换一个`);
    return post('/predictions', {version, input});
  };
  let prediction = task ? {id: task, status: 'starting'} : await start();
  if (!task) { if (!prediction?.id) throw Error('Replicate 没有给任务号'); onTask(prediction.id); }
  const over = p => {
    if (p?.status === 'failed') throw Error('Replicate 没做成：' + said(p.error, 300));
    if (p?.status === 'canceled') throw Error('这次在 Replicate 上被取消了');
    return p?.status === 'succeeded';
  };
  if (!over(prediction)) prediction = await polling({name: 'Replicate', every: 4000, wait, ask: async () => {
    const now = await read(await asking('酒馆转发', () => fetch(replicateAddress('/predictions/' + prediction.id), {headers})));
    return over(now) ? now : undefined;
  }});
  const found = [prediction.output].flat(9).find(x => typeof x === 'string' && /^(https?:|data:)/i.test(x));
  if (!found) throw Error('Replicate 说做好了，但没有给音频');
  // The file allows web pages; should it want the key, it is asked for through the tavern.
  if (found.startsWith('data:')) return {blob: decodeBase64(found, found.slice(5).split(/[;,]/)[0] || 'audio/mpeg')};
  let file = await fetch(found).catch(() => null);
  if (!file?.ok) file = await asking('酒馆转发', () => fetch('/proxy/' + encodeURIComponent(found), {headers: {Authorization: headers.Authorization}}));
  if (!file.ok) throw Error(`拿不到 Replicate 做好的音频（${file.status}）：这个文件一小时后就没了，再做一次`);
  return {blob: await file.blob()};
}

// ---------- MiniMax ----------
async function mini({style, lyrics, instrumental, language, url}, {fetch, key}) {
  const response = await asking('MiniMax', () => fetch(url + '/v1/music_generation', {method: 'POST', headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
    body: JSON.stringify({model: 'music-3.0', prompt: styleFor({style, language, instrumental}), ...(instrumental ? {is_instrumental: true} : {lyrics}), output_format: 'hex', audio_setting: {sample_rate: 44100, bitrate: 256000, format: 'mp3'}})}));
  const {json, text} = await bodyOf(response), code = json?.base_resp?.status_code, message = said(json?.base_resp?.status_msg || text);
  if (code === 1004 || code === 2049 || response.status === 401) throw Error('MiniMax 拒绝了密钥：回「引擎 → MiniMax」看看');
  if (code === 1008) throw Error('MiniMax 账户的余额不够');
  if (code === 1026) throw Error('这首歌的内容没过 MiniMax 的审核：改改歌词或风格再试');
  if (code === 1002) throw Error('MiniMax 现在太忙（请求太多），稍后再试');
  if (!response.ok || code) throw Error(`MiniMax 没有接这首歌${message ? '：' + message : ''}。它的音乐接口从 2026 年 8 月 20 日起不再给新用户开放，以前没有付费用过的账号用不了，可以换一家，或者用 Replicate 上的 MiniMax`);
  if (!json?.data?.audio) throw Error('MiniMax 没有给音频');
  return {blob: decodeHex(json.data.audio, 'audio/mpeg')};
}

// ---------- ComfyUI: ACE-Step ----------
const ACE_LANGUAGES = {中文: 'zh', 普通话: 'zh', 粤语: 'yue', 日语: 'ja', 英语: 'en', 韩语: 'ko'};
/** ACE-Step 1.5's workflow, as ComfyUI's own template has it (audio_ace_step_1_5_checkpoint), in the form its /prompt takes. */
export function aceWorkflow({checkpoint, style, lyrics, instrumental, language, seconds, seed}) {
  const length = Math.round(Math.min(600, Math.max(10, Number(seconds) || 120))), bpm = Number(/(\d{2,3})\s*bpm/i.exec(style)?.[1]) || 120;
  return {
    1: {class_type: 'CheckpointLoaderSimple', inputs: {ckpt_name: checkpoint}},
    2: {class_type: 'ModelSamplingAuraFlow', inputs: {model: ['1', 0], shift: 3}},
    3: {class_type: 'TextEncodeAceStepAudio1.5', inputs: {clip: ['1', 1], tags: styleFor({style, language, instrumental}), lyrics: instrumental ? '[inst]' : lyrics, seed, bpm: Math.min(300, Math.max(10, bpm)), duration: length, timesignature: '4', language: ACE_LANGUAGES[language] || 'unknown', keyscale: 'E minor', generate_audio_codes: true, cfg_scale: 2, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0}},
    4: {class_type: 'ConditioningZeroOut', inputs: {conditioning: ['3', 0]}},
    5: {class_type: 'EmptyAceStep1.5LatentAudio', inputs: {seconds: length, batch_size: 1}},
    6: {class_type: 'KSampler', inputs: {model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0], seed, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1}},
    7: {class_type: 'VAEDecodeAudio', inputs: {samples: ['6', 0], vae: ['1', 2]}},
    8: {class_type: 'SaveAudioMP3', inputs: {audio: ['7', 0], filename_prefix: 'audio/ST-iPhonie', quality: 'V0'}}
  };
}
async function comfy({style, lyrics, instrumental, language, seconds, url, transport}, {fetch, wait}) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!base) throw Error('先在「引擎 → ComfyUI」填上地址');
  const through = path => transport === 'direct' ? base + path : '/proxy/' + encodeURIComponent(base + path);
  const ask = async (path, init) => {
    const response = await asking('ComfyUI', () => fetch(through(path), {...(transport === 'direct' ? {credentials: 'omit'} : {}), ...init}));
    const {json, text} = await bodyOf(response);
    if (transport !== 'direct' && noTavernProxy(text)) throw Error('这个酒馆没有转发功能（TauriTavern 这类 App 酒馆现在没有）：在「引擎 → ComfyUI」把读取方式改成浏览器直连，ComfyUI 要允许跨域');
    if (response.status === 403 && /CORS proxy is disabled/i.test(text)) throw Error('酒馆的转发没打开：在 config.yaml 里把 enableCorsProxy 改成 true，重启酒馆；或者把读取方式改成浏览器直连');
    return {response, json, text};
  };
  const specs = await ask('/object_info/CheckpointLoaderSimple');
  const models = specs.json?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
  const checkpoint = Array.isArray(models) ? models.find(name => /ace.?step/i.test(name)) : null;
  if (!checkpoint) throw Error('ComfyUI 里没有 ACE-Step 的模型：把 ace_step_1.5_turbo_aio.safetensors 放进 models/checkpoints，再刷新 ComfyUI');
  const prompt = aceWorkflow({checkpoint, style, lyrics, instrumental, language, seconds, seed: Math.floor(Math.random() * 2 ** 32)});
  const made = await ask('/prompt', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({prompt})});
  if (!made.response.ok || !made.json?.prompt_id) {
    const nodes = Object.values(made.json?.node_errors || {}).flatMap(n => n.errors || []).map(e => e.details || e.message).filter(Boolean);
    throw Error(`ComfyUI 没接受这个工作流（要更新到带 ACE-Step 1.5 节点的版本）${nodes[0] || made.json?.error?.message ? '：' + said(nodes[0] || made.json.error.message) : ''}`);
  }
  const id = made.json.prompt_id;
  const output = await polling({name: 'ComfyUI', every: 3000, limit: COMFY_LIMIT, wait, ask: async () => {
    const {response, json} = await ask('/history/' + encodeURIComponent(id));
    if (!response.ok) throw again(`ComfyUI 暂时没回答（${response.status}）`);
    const job = json?.[id];
    if (!job) return undefined;
    if (job.status?.status_str === 'error') throw Error('ComfyUI 没做成：' + said(job.status?.messages?.find(m => m[0] === 'execution_error')?.[1]?.exception_message || '看 ComfyUI 的窗口里写了什么'));
    const file = Object.values(job.outputs || {}).flatMap(o => o.audio || [])[0];
    if (file) return file;
    if (job.status?.completed) throw Error('ComfyUI 做完了，但没有音频');
    return undefined;
  }});
  const file = await asking('ComfyUI', () => fetch(through(`/view?filename=${encodeURIComponent(output.filename)}&subfolder=${encodeURIComponent(output.subfolder || '')}&type=${encodeURIComponent(output.type || 'output')}`)));
  if (!file.ok) throw Error(`拿不到 ComfyUI 做好的音频（${file.status}）`);
  return {blob: await file.blob()};
}

const RUNNERS = {stepfun, eleven, lyria, replicate, mini, comfy};
/**
 * Sings a song. tools: {fetch, key, signal, onTask(task, model), task: a job to go back to, wait, now}. An answer of the service that comes
 * as a file with no type of its own is taken as MP3.
 */
export async function singSong(engine, request, {fetch, key = '', signal, onTask = () => {}, task = '', wait = sleeper(signal), now = Date.now} = {}) {
  const run = RUNNERS[engine];
  if (!run) throw Error('这一家还不能写歌');
  const send = (url, init = {}) => { signal?.throwIfAborted?.(); return fetch(url, {...init, ...(signal ? {signal} : {})}); };
  const result = await run({...request, lyrics: String(request.lyrics ?? '')}, {fetch: send, key, onTask, wait, task, now});
  const blob = result.blob;
  return {...result, blob: !blob.type || blob.type === 'application/octet-stream' || blob.type === 'binary/octet-stream' ? new Blob([blob], {type: 'audio/mpeg'}) : blob};
}

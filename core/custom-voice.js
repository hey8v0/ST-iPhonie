// 自己的接口: a speech service the user runs or has (GPT-SoVITS, CosyVoice, IndexTTS…, or any HTTP text-to-speech),
// told by templates instead of written into the plugin. The address, the request body (JSON) and the headers say where
// each thing goes: {{text}} the line, {{lang}} its language (zh, ja, en, ko, yue…), {{emotion}} its 情绪, {{voice}} the
// voice (an ID, or a reference audio's path on the machine that runs the service), {{ref_text}} {{ref_lang}} what is
// said in the reference audio and in which language, {{ref_audio}} {{ref_audio_base64}} the reference audio uploaded
// here, {{key}} the key. The body is sent as JSON, as a form or as multipart. The answer is found out from what comes
// back: the audio itself, raw PCM, or JSON with a link to it or the audio in base64; a Gradio app's answer comes in two
// steps. The voices are the user's own list (parameters.js, 自己的接口 → 音色). core/custom-detect.js works all this
// out from the service.
import {proxyAddress} from './proxy-url.js';
import {languageCode} from './languages.js';
import {pick} from './music.js';
import {audioKind} from './audio-bytes.js';

const tidy = o => JSON.stringify(o, null, 2);
/** A format with what it does not say cleared, so nothing of the one used before is left behind. */
const format = (service, base, more) => ({service, method: 'POST', answer: 'audio', path: '', headers: '', before: '', body: '', bodyType: 'json', pcmRate: 24000, langMap: '', listUrl: '', listPath: '', url: base, ...more});
/**
 * One-click formats of services people run: only the user's own address goes in. Which paths a service has tells them
 * apart (core/custom-detect.js): paths, when it publishes them; probe, a path that answers in a way only it does.
 * detect: there is nothing to fill by hand, the address has to be read (a Gradio app's inputs differ by version).
 */
export const CUSTOM_TEMPLATES = Object.freeze([
  {id: 'gpt-sovits', name: 'GPT-SoVITS（api_v2）', short: 'GPT-SoVITS', port: 9880, example: 'http://127.0.0.1:9880', paths: ['/set_gpt_weights'],
    note: '在 GPT-SoVITS 文件夹里运行 api_v2.py（默认端口 9880）。音色的「参考音频」填参考音频在那台电脑上的路径，再填参考文本和参考语言。它不带跨域许可，要开酒馆转发。',
    fill: base => format('GPT-SoVITS（api_v2）', base + '/tts', {before: `${base}/set_gpt_weights?weights_path={{model1}}\n${base}/set_sovits_weights?weights_path={{model2}}`,
      body: tidy({text: '{{text}}', text_lang: '{{lang}}', ref_audio_path: '{{voice}}', prompt_text: '{{ref_text}}', prompt_lang: '{{ref_lang}}', text_split_method: 'cut5', media_type: 'wav', streaming_mode: false})})},
  // The format many speech relays speak (OpenAI's /v1/audio/speech): the voice is a name the service knows.
  {id: 'openai', name: 'OpenAI 格式（/v1/audio/speech）', short: 'OpenAI 格式', example: 'https://你的服务地址', paths: ['/v1/audio/speech', '/audio/speech'],
    note: '很多语音中转站和公益站用这个格式：音色是站上角色的名字。填站给的地址（/v1 前面那部分），密钥填在上面。站能列出角色的话，再填「音色列表地址」。请求体里的 model 按站的说明改。',
    fill: base => format('OpenAI 格式', base + '/v1/audio/speech', {body: tidy({model: 'tts-1', input: '{{text}}', voice: '{{voice}}'})})},
  {id: 'gpt-sovits-v1', name: 'GPT-SoVITS（旧版 api.py）', short: 'GPT-SoVITS 旧版', port: 9880, example: 'http://127.0.0.1:9880', paths: ['/change_refer'],
    note: '运行 api.py 时用这个；新的 api_v2.py 用上面那个。音色的「参考音频」填那台电脑上的路径，再填参考文本和参考语言。',
    fill: base => format('GPT-SoVITS（旧版 api.py）', base + '/', {before: `${base}/set_model?gpt_model_path={{model1}}&sovits_model_path={{model2}}`,
      body: tidy({refer_wav_path: '{{voice}}', prompt_text: '{{ref_text}}', prompt_language: '{{ref_lang}}', text: '{{text}}', text_language: '{{lang}}'})})},
  {id: 'gsvi', name: 'GSVI（GPT-SoVITS-Inference）', short: 'GSVI', port: 5000, example: 'http://127.0.0.1:5000', paths: ['/character_list'], probe: '/character_list',
    note: '默认端口 5000。音色就是它「character_list」里的角色，角色 App 里能直接选。',
    fill: base => format('GSVI', `${base}/tts?character={{voice}}&text={{text}}&text_language={{lang}}&format=wav&stream=false`, {method: 'GET', listUrl: base + '/character_list'})},
  {id: 'fish', name: 'Fish Speech（本地）', short: 'Fish Speech', port: 8080, example: 'http://127.0.0.1:8080', paths: ['/v1/references/list'], probe: '/v1/references/list?format=json',
    note: '运行 tools/api_server.py（默认端口 8080）。音色是服务里存好的参考（reference_id），角色 App 里能直接选。想直接上传参考音频，用「Fish Speech · 上传」。',
    fill: base => format('Fish Speech', base + '/v1/tts', {body: tidy({text: '{{text}}', reference_id: '{{voice}}', format: 'wav', normalize: true, streaming: false}), listUrl: base + '/v1/references/list?format=json', listPath: 'reference_ids'})},
  {id: 'fish-upload', name: 'Fish Speech · 上传参考音频', short: 'Fish Speech · 上传', port: 8080, example: 'http://127.0.0.1:8080',
    note: '不用在服务里存参考：在「音色」里上传一段参考音频，写上它说了什么。',
    fill: base => format('Fish Speech · 上传参考音频', base + '/v1/tts', {body: tidy({text: '{{text}}', references: [{audio: '{{ref_audio_base64}}', text: '{{ref_text}}'}], format: 'wav', normalize: true, streaming: false})})},
  {id: 'cosyvoice', name: 'CosyVoice（官方 FastAPI）', short: 'CosyVoice', port: 50000, example: 'http://127.0.0.1:50000', paths: ['/inference_zero_shot'],
    note: '运行 runtime/python/fastapi/server.py（默认端口 50000）。在「音色」里上传一段参考音频，写上它说了什么。CosyVoice 1 是 22050 采样率，声音又快又尖时到高级设置里改。',
    fill: base => format('CosyVoice', base + '/inference_zero_shot', {bodyType: 'multipart', body: tidy({tts_text: '{{text}}', prompt_text: '{{ref_text}}', prompt_wav: '{{ref_audio}}'})})},
  {id: 'cosyvoice-sft', name: 'CosyVoice · 预置音色', short: 'CosyVoice · 预置', port: 50000, example: 'http://127.0.0.1:50000',
    note: '只有 SFT 模型（比如 CosyVoice-300M-SFT）有预置音色：音色填「中文女」这样的名字。',
    fill: base => format('CosyVoice · 预置音色', base + '/inference_sft', {bodyType: 'form', pcmRate: 22050, body: tidy({tts_text: '{{text}}', spk_id: '{{voice}}'})})},
  {id: 'cosyvoice-api', name: 'cosyvoice-api（pyVideoTrans 用的那个）', short: 'cosyvoice-api', port: 9233, example: 'http://127.0.0.1:9233',
    note: '默认端口 9233。音色填「中文女」这样的名字，或者参考音频在那台电脑上的路径。它不带跨域许可，要开酒馆转发。',
    fill: base => format('cosyvoice-api', base + '/v1/audio/speech', {body: tidy({input: '{{text}}', voice: '{{voice}}', speed: 1})})},
  {id: 'indextts', name: 'IndexTTS（网页界面）', short: 'IndexTTS', port: 7860, example: 'http://127.0.0.1:7860', detect: true,
    note: '运行 webui.py（默认端口 7860），填它的网页地址就行，插件会读它的界面。在「音色」里上传一段参考音频。'},
  {id: 'index-vllm', name: 'IndexTTS-vLLM', short: 'IndexTTS-vLLM', port: 6006, example: 'http://127.0.0.1:6006', paths: ['/tts_url'],
    note: '运行 api_server.py（默认端口 6006）。音色是它 assets/speaker.json 里的角色，角色 App 里能直接选。',
    fill: base => format('IndexTTS-vLLM', base + '/tts', {body: tidy({text: '{{text}}', character: '{{voice}}'}), listUrl: base + '/audio/voices'})},
  {id: 'chattts-ui', name: 'ChatTTS-ui', short: 'ChatTTS-ui', port: 9966, example: 'http://127.0.0.1:9966',
    note: '默认端口 9966。音色填数字种子（比如 2222）或存好的音色文件名。它不带跨域许可，要开酒馆转发。',
    fill: base => format('ChatTTS-ui', `${base}/tts?text={{text}}&voice={{voice}}&wav=1`, {method: 'GET'})},
  {id: 'kokoro', name: 'Kokoro-FastAPI', short: 'Kokoro', port: 8880, example: 'http://127.0.0.1:8880',
    note: '默认端口 8880。音色从角色 App 直接选（中文音色是 zf_、zm_ 开头的）。',
    fill: base => format('Kokoro-FastAPI', base + '/v1/audio/speech', {body: tidy({model: 'kokoro', input: '{{text}}', voice: '{{voice}}', response_format: 'mp3', stream: false}), listUrl: base + '/v1/audio/voices', listPath: 'voices'})},
  {id: 'edge-tts', name: 'openai-edge-tts', short: 'Edge TTS', port: 5050, example: 'http://127.0.0.1:5050',
    note: '默认端口 5050，密钥是启动时设的 API_KEY。音色填 zh-CN-XiaoxiaoNeural 这样的名字。它不带跨域许可，要开酒馆转发。',
    fill: base => format('openai-edge-tts', base + '/v1/audio/speech', {body: tidy({input: '{{text}}', voice: '{{voice}}', response_format: 'mp3', speed: 1}), listUrl: base + '/v1/audio/voices', listPath: 'voices'})},
  {id: 'xtts', name: 'XTTS（xtts-api-server）', short: 'XTTS', port: 8020, example: 'http://127.0.0.1:8020', paths: ['/tts_to_audio/'],
    note: '默认端口 8020。音色是它 speakers 文件夹里的声音，角色 App 里能直接选。',
    fill: base => format('XTTS', base + '/tts_to_audio/', {langMap: 'zh=zh-cn', body: tidy({text: '{{text}}', speaker_wav: '{{voice}}', language: '{{lang}}'}), listUrl: base + '/speakers'})},
  {id: 'alltalk', name: 'AllTalk', short: 'AllTalk', port: 7851, example: 'http://127.0.0.1:7851', paths: ['/api/tts-generate'], probe: '/api/voices',
    note: '默认端口 7851。音色从角色 App 直接选。',
    fill: base => format('AllTalk', base + '/api/tts-generate', {bodyType: 'form', langMap: 'zh=zh-cn', listUrl: base + '/api/voices', listPath: 'voices',
      body: tidy({text_input: '{{text}}', text_filtering: 'standard', character_voice_gen: '{{voice}}', narrator_enabled: 'false', narrator_voice_gen: '', text_not_inside: 'character', language: '{{lang}}', output_file_name: 'st_output', output_file_timestamp: 'true', autoplay: 'false', autoplay_volume: '0.8'})})},
  {id: 'vits-simple', name: 'vits-simple-api', short: 'vits-simple-api', port: 23456, example: 'http://127.0.0.1:23456', paths: ['/voice/speakers'], probe: '/voice/speakers',
    note: '默认端口 23456。音色是角色的数字 ID，角色 App 里能直接选。',
    fill: base => format('vits-simple-api', `${base}/voice/vits?text={{text}}&id={{voice}}&lang={{lang}}&format=wav`, {method: 'GET', listUrl: base + '/voice/speakers', listPath: 'VITS'})},
  {id: 'style-bert-vits2', name: 'Style-Bert-VITS2', short: 'Style-Bert-VITS2', port: 5000, example: 'http://127.0.0.1:5000', paths: ['/models/info'],
    note: '运行 server_fastapi.py。音色是模型里说话人的名字，角色 App 里能直接选。',
    fill: base => format('Style-Bert-VITS2', `${base}/voice?text={{text}}&speaker_name={{voice}}&language={{lang}}`, {method: 'GET', langMap: 'zh=ZH\nja=JP\nen=EN', listUrl: base + '/models/info'})},
  {id: 'chatterbox', name: 'Chatterbox-TTS-Server', short: 'Chatterbox', port: 8004, example: 'http://127.0.0.1:8004', paths: ['/get_predefined_voices'],
    note: '默认端口 8004。音色是它声音文件夹里的文件名，角色 App 里能直接选。',
    fill: base => format('Chatterbox', base + '/v1/audio/speech', {body: tidy({model: 'chatterbox', input: '{{text}}', voice: '{{voice}}', response_format: 'wav'}), listUrl: base + '/v1/audio/voices', listPath: 'voices'})},
  {id: 'gradio', name: '其他网页界面（Gradio）', short: '其他网页界面', port: 7860, example: 'http://127.0.0.1:7860', detect: true,
    note: 'F5-TTS 这类只有网页界面的服务：填网页地址，插件会读它的界面，认出哪个框放台词、哪个放参考音频。认不全的到高级设置里补。'},
  {id: 'siliconflow', name: '硅基流动', short: '硅基流动', fixed: 'https://api.siliconflow.cn', example: 'https://api.siliconflow.cn',
    note: '不用自己跑服务，在上面填硅基流动的密钥。音色是 alex、anna 这几个系统音色，以及你上传过的音色。',
    voices: ['alex', 'benjamin', 'charles', 'david', 'anna', 'bella', 'claire', 'diana'].map(name => ({name, voice: 'FunAudioLLM/CosyVoice2-0.5B:' + name})),
    fill: base => format('硅基流动', base + '/v1/audio/speech', {body: tidy({model: 'FunAudioLLM/CosyVoice2-0.5B', input: '{{text}}', voice: '{{voice}}', response_format: 'mp3', stream: false}), listUrl: base + '/v1/audio/voice/list'})},
]);

const SLOT = /\{\{\s*(text|lang|emotion|voice|ref_text|ref_lang|model1|model2)\s*\}\}/g;
const KEY_SLOT = /\{\{\s*key\s*\}\}/g;
const FILE_SLOT = /\{\{\s*ref_audio\s*\}\}/g, BASE64_SLOT = /\{\{\s*ref_audio_base64\s*\}\}/g, REF_SLOT = /\{\{\s*ref_audio(?:_base64)?\s*\}\}/, ONLY_FILE = /^\s*\{\{\s*ref_audio\s*\}\}\s*$/;
/** Which slots these settings use: what they do not use is not asked for. */
export function customSlots(p) {
  const used = new Set();
  for (const m of [p.url, p.method === 'GET' ? '' : p.body, p.before, p.headers].join('\n').matchAll(/\{\{\s*(\w+)\s*\}\}/g)) used.add(m[1]);
  return used;
}
/** 语言写法: a service that writes its languages its own way (zh=zh-cn, one per line). */
function ownLanguage(map, code) {
  for (const line of String(map || '').split('\n')) { const m = line.match(/^\s*([^=\s]+)\s*=\s*(\S.*?)\s*$/); if (m && m[1].toLowerCase() === code) return m[2]; }
  return code;
}
/** A language as the short code these services take: 日语 → ja, 粤语 → yue; '' when unknown. */
export function shortLanguage(value) {
  const raw = String(value ?? '').trim(), code = languageCode(raw).split('-')[0];
  return code || (/粤|cantonese|yue/i.test(raw) ? 'yue' : '');
}
/** What goes into the slots for a line said by a role. */
export function customValues(c, route, line) {
  const name = String(route.voice || '').trim(), row = (c.params.voices || []).find(r => String(r.name || '').trim() === name);
  const code = shortLanguage(route.language) || 'zh', lang = ownLanguage(c.params.langMap, code);
  return {text: String(line.text || ''), lang, emotion: String(line.emotion || ''), voice: row ? String(row.voice || '').trim() || name : name,
    ref_text: row ? String(row.ref_text || '') : '', ref_lang: row && shortLanguage(row.ref_lang) ? ownLanguage(c.params.langMap, shortLanguage(row.ref_lang)) : lang,
    model1: row ? String(row.model1 || '').trim() : '', model2: row ? String(row.model2 || '').trim() : ''};
}
const jsonText = value => JSON.stringify(String(value)).slice(1, -1);
const fill = (template, values, as) => String(template || '').replace(SLOT, (m, key) => as(values[key] ?? ''));

/** The request for a line (the key is put in only when it is sent, so it never reaches the cache key or the preview). */
export function buildCustomRequest(c, route, line) {
  const p = c.params, url = String(p.url || '').trim();
  if (!proxyAddress(url) && !/^https?:\/\/[^\s/]+/i.test(url)) throw Error('自己的接口：先在引擎 App 里填好接口地址（http:// 或 https:// 开头）');
  const values = customValues(c, route, line), method = p.method === 'GET' ? 'GET' : 'POST', template = url + (method === 'POST' ? p.body : '');
  if (/\{\{\s*voice\s*\}\}/.test(template) && !values.voice) throw Error('请先选择角色音色');
  // A reference audio uploaded here goes in when it is sent; its id tells a line said with another one from this.
  let refFile = '';
  if (REF_SLOT.test(template)) {
    const name = String(route.voice || '').trim();
    if (!name) throw Error('请先选择角色音色');
    refFile = String((p.voices || []).find(r => String(r.name || '').trim() === name)?.ref_file || '');
    if (!refFile) throw Error(`这个接口要参考音频：在引擎 App「自己的接口」的音色里，给「${name}」上传一段`);
  }
  let body;
  if (method === 'POST' && String(p.body || '').trim()) {
    try { body = JSON.parse(fill(p.body, values, jsonText)); } catch { throw Error('自己的接口：请求体不是有效的 JSON，检查一下引号和逗号'); }
  }
  // 换模型: the addresses that load this voice's model (a line whose model slot is empty is left out).
  const before = String(p.before || '').split('\n').map(l => l.trim()).filter(l => proxyAddress(l) || /^https?:\/\//i.test(l))
    .filter(l => [...l.matchAll(SLOT)].every(([, key]) => !/^model/.test(key) || values[key])).map(l => fill(l, values, encodeURIComponent));
  return {engine: 'custom', url: fill(url, values, encodeURIComponent), method, ...(body !== undefined ? {body} : {}), headers: String(p.headers || ''), before,
    answer: ['url', 'base64', 'gradio'].includes(p.answer) ? p.answer : 'audio', path: String(p.path || '').trim(), format: 'auto',
    ...(['form', 'multipart'].includes(p.bodyType) ? {bodyType: p.bodyType} : {}), ...(refFile ? {refFile} : {}), ...(Number(p.pcmRate) && Number(p.pcmRate) !== 24000 ? {pcmRate: Number(p.pcmRate)} : {})};
}

/** Every string under a value, changed. */
const eachText = (value, change) => typeof value === 'string' ? change(value) : Array.isArray(value) ? value.map(v => eachText(v, change)) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, eachText(v, change)])) : value;
const formText = value => value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
/** base64 (with or without its data: head) as bytes. */
export function bytesOf(text) {
  let bin;
  try { bin = atob(String(text).replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '')); } catch { throw Error('自己的接口：回答里的 base64 音频读不出来'); }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
/** The reference audio as a file, for a form or an upload. */
export function referenceFile(audio) { const bytes = bytesOf(audio); return new File([bytes], 'reference.' + (audioKind(bytes) || 'wav'), {type: audioType(bytes)}); }

/**
 * fetch() arguments for a request, with the key in. audio: the reference audio (base64), when the request has one;
 * uploaded: where a Gradio app keeps it after it was uploaded there.
 */
export function customInit(request, key = '', {audio = '', uploaded = ''} = {}) {
  const headers = {};
  for (const line of request.headers.split('\n')) {
    const m = line.match(/^\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*:\s*(.*)$/);
    if (m) headers[m[1]] = m[2].replace(KEY_SLOT, key).trim();
  }
  if (key && !/\{\{\s*key\s*\}\}/.test(request.headers) && !Object.keys(headers).some(h => h.toLowerCase() === 'authorization')) headers.Authorization = 'Bearer ' + key;
  const init = {method: request.method, headers};
  if (request.method === 'POST' && request.body !== undefined) {
    const named = Object.keys(headers).find(h => h.toLowerCase() === 'content-type');
    if (request.bodyType === 'form' || request.bodyType === 'multipart') {
      // The browser writes the head of these itself (a multipart one with its boundary).
      if (named) delete headers[named];
      const flat = Object.entries(request.body && typeof request.body === 'object' ? request.body : {});
      if (request.bodyType === 'form') { init.body = new URLSearchParams(flat.map(([k, v]) => [k, formText(v)])); }
      else {
        const form = new FormData();
        for (const [k, v] of flat) { if (audio && typeof v === 'string' && ONLY_FILE.test(v)) form.append(k, referenceFile(audio)); else form.append(k, formText(v)); }
        init.body = form;
      }
    } else {
      init.body = JSON.stringify(request.refFile ? eachText(request.body, text => text.replace(BASE64_SLOT, audio).replace(FILE_SLOT, uploaded)) : request.body);
      if (!named) headers['Content-Type'] = 'application/json';
    }
  }
  return {url: request.url.replace(KEY_SLOT, encodeURIComponent(key)), init};
}

/** The audio's type from its first bytes (services often say application/octet-stream). */
export function audioType(bytes, said = '') {
  const b = bytes, ascii = (at, n) => String.fromCharCode(...b.slice(at, at + n));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (b.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (b.length >= 4 && ascii(0, 4) === 'fLaC') return 'audio/flac';
  if (b.length >= 3 && (ascii(0, 3) === 'ID3' || b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (b.length >= 8 && ascii(4, 4) === 'ftyp') return 'audio/mp4';
  return /^audio\//i.test(said) ? said.split(';')[0] : 'audio/wav';
}
const fromBase64 = bytesOf;
const decode = bytes => new TextDecoder().decode(bytes);
/** What a service said when it refused, in a line: FastAPI's detail (what is missing), or its own message. */
export function serviceSaid(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  let json;
  try { json = JSON.parse(raw); } catch { return /^<(!doctype|html)/i.test(raw) ? (raw.match(/<title[^>]*>([^<]*)/i)?.[1] || '一个网页').trim().slice(0, 80) : raw.replace(/\s+/g, ' ').slice(0, 200); }
  if (typeof json === 'string') return json.slice(0, 200);
  const said = v => typeof v === 'string' ? v : '';
  if (Array.isArray(json?.detail)) {
    const parts = json.detail.map(d => [Array.isArray(d?.loc) ? d.loc.filter(x => x !== 'body' && x !== 'query').join('.') : '', said(d?.msg)].filter(Boolean).join('：')).filter(Boolean);
    if (parts.length) return parts.join('；').slice(0, 200);
  }
  const message = [json?.detail, json?.message, json?.msg, json?.error?.message, json?.error, json?.Exception].map(said).filter(Boolean);
  // A message and what caused it, when there is both.
  return (message.length ? [...new Set(message)].slice(0, 2).join('：') : raw.replace(/\s+/g, ' ')).slice(0, 200);
}
const LINK_KEYS = /^(audio[_-]?url|url|output[_-]?file[_-]?url|file[_-]?url|download[_-]?url|audio[_-]?path|audio[_-]?file|audio|file|path|output|result|data)$/i;
const BASE64_KEYS = /^(audio|audio[_-]?base64|audio[_-]?data|audio[_-]?content|b64[_-]?json|base64|wav|mp3|output|result|data)$/i;
const looksLink = text => /^https?:\/\/\S+$/i.test(text) || /^\.{0,2}\/\S+\.(wav|mp3|ogg|flac|m4a|opus|aac)(\?\S*)?$/i.test(text);
const looksBase64 = text => /^data:audio\//i.test(text) || (text.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(text.slice(0, 2000)));
/** Where the audio is in an answer no one said the shape of: {link} or {base64}, nearest the top. */
export function findAudio(json) {
  let level = [json];
  for (let depth = 0; depth < 5 && level.length; depth++) {
    const next = [];
    for (const item of level) {
      const entries = Array.isArray(item) ? item.slice(0, 8).map((v, i) => [String(i), v]) : item && typeof item === 'object' ? Object.entries(item) : [];
      for (const [k, v] of entries) {
        if (typeof v === 'string') {
          const text = v.trim();
          if (/^data:audio\//i.test(text) || (BASE64_KEYS.test(k) && looksBase64(text))) return {base64: text};
          if ((LINK_KEYS.test(k) || Array.isArray(item)) && looksLink(text)) return {link: text};
        } else if (v && typeof v === 'object') next.push(v);
      }
    }
    level = next;
  }
  return null;
}
/** The audio an answer of bytes holds, whichever way it came. tools: as in readCustomAnswer. */
async function audioFrom(bytes, type, request, {load, read, wave}) {
  if (!bytes.length) throw Error('自己的接口没有回声音');
  const kind = audioKind(bytes);
  if (kind && !['text', 'gzip', 'zstd'].includes(kind)) return new Blob([bytes], {type: audioType(bytes, type)});
  // JSON if it says so, or if it reads as that: raw samples may start with any byte.
  const typedJson = /json/i.test(type), first = bytes[0];
  if (typedJson || ((first === 0x7b || first === 0x5b) && !/^audio\//i.test(type))) {
    let json = null;
    try { json = JSON.parse(decode(bytes)); } catch { /* said below, if it said it was JSON */ }
    const found = json && findAudio(json);
    if (found?.base64) { const inner = fromBase64(found.base64); return audioFrom(inner, /^data:([^;,]+)/.exec(found.base64)?.[1] || '', request, {load, read, wave}); }
    if (found?.link) return fromLink(found.link, request, {load, read});
    if (json || typedJson) throw Error('自己的接口回的不是音频（是 ' + (type.split(';')[0] || 'JSON') + '）' + (json ? '：' + serviceSaid(decode(bytes)) : ''));
  }
  if (/text\//i.test(type) || kind === 'text') throw Error('自己的接口回的不是音频（是 ' + (type.split(';')[0] || '文字') + '）：' + serviceSaid(decode(bytes)));
  // No head at all: raw samples, as CosyVoice sends them. How fast they go is not in them.
  if (!/^audio\//i.test(type) || /pcm|l16|raw/i.test(type)) return new Blob([wave(bytes.length % 2 ? bytes.subarray(0, bytes.length - 1) : bytes, request.pcmRate || 24000)], {type: 'audio/wav'});
  return new Blob([bytes], {type: audioType(bytes, type)});
}
async function fromLink(value, request, {load, read}) {
  let link;
  try { link = new URL(String(value).trim(), new URL(request.url, globalThis.location?.href).href).href; } catch { throw Error('回答里的音频链接不是网址'); }
  const audio = await load(link);
  if (!audio.ok) throw Error(`音频链接打不开（HTTP ${audio.status}）`);
  const bytes = await read(audio);
  if (!bytes.length) throw Error('音频链接里没有声音');
  return new Blob([bytes], {type: audioType(bytes, audio.headers.get('content-type') || '')});
}
/** A Gradio app's folder for a call's address: …/gradio_api (Gradio 5) or the address itself (Gradio 4). */
export const gradioRoot = url => String(url).replace(/\/call\/[^/]+\/?$/, '');
/** Server-sent events as [{event, data}]. */
export function readEvents(text) {
  return String(text).split(/\r?\n\r?\n/).map(block => { let event = '', data = ''; for (const line of block.split(/\r?\n/)) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); } return {event, data}; }).filter(e => e.event);
}
/** The first file in what a Gradio app gave back. */
function gradioFile(value, depth = 0) {
  if (!value || depth > 4) return null;
  if (typeof value === 'string') return /\.(wav|mp3|ogg|flac|m4a|opus)$/i.test(value) ? {path: value} : null;
  if (Array.isArray(value)) { for (const item of value) { const found = gradioFile(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== 'object') return null;
  if (typeof value.url === 'string' || typeof value.path === 'string' || typeof value.name === 'string' && value.is_file) return {url: value.url, path: value.path || value.name};
  return gradioFile(value.value, depth + 1);
}
/** A Gradio call is two steps: asked, it gives a number; that number's address gives the result when it is done. */
async function readGradio(response, request, {read, load}) {
  let first;
  try { first = JSON.parse(decode(await read(response))); } catch { throw Error('Gradio 没有回排队号：检查高级设置里的接口地址'); }
  if (!first?.event_id) throw Error('Gradio 没有回排队号：' + serviceSaid(JSON.stringify(first)));
  const stream = await load(`${request.url.replace(/\/+$/, '')}/${first.event_id}`);
  if (!stream.ok) throw Error(`Gradio 的结果读不出来（HTTP ${stream.status}）`);
  const events = readEvents(decode(await read(stream))), done = events.filter(e => e.event === 'complete').at(-1);
  if (!done) {
    const said = events.find(e => e.event === 'error')?.data;
    throw Error('自己的接口（Gradio）出错了' + (said && said !== 'null' ? '：' + serviceSaid(said) : '：看看服务窗口里报了什么；常见原因是有个框没填对，到高级设置的请求体里对一下'));
  }
  let data;
  try { data = JSON.parse(done.data); } catch { throw Error('Gradio 的结果读不出来'); }
  const file = gradioFile(data);
  if (!file) throw Error('Gradio 的结果里没有音频：这个接口可能不是出声音的那个，到高级设置里换一个');
  // Its own link is wrong on some versions (Gradio 4 writes /call/file=…): where it keeps the file says the same.
  const kept = file.path && !/^https?:/i.test(file.path) ? `${gradioRoot(request.url)}/file=${encodeURIComponent(file.path)}` : '';
  if (kept) { try { return await fromLink(kept, request, {read, load}); } catch (error) { if (!file.url) throw error; } }
  return fromLink(file.url, request, {read, load});
}

/**
 * The audio from an answer. read(response) → Uint8Array (size-limited); load(url) → a Response for a link the answer
 * gave; wave(bytes, rate) → raw samples as a WAV.
 */
export async function readCustomAnswer(response, request, {read, load, wave}) {
  if (!response.ok) {
    const said = serviceSaid(await response.text().catch(() => ''));
    throw Error(`自己的接口回答 HTTP ${response.status}${said ? '：' + said : ''}`);
  }
  const type = response.headers.get('content-type') || '';
  if (request.answer === 'gradio') return readGradio(response, request, {read, load});
  if (request.answer === 'audio') return audioFrom(await read(response), type, request, {load, read, wave});
  let json;
  try { json = JSON.parse(decode(await read(response))); } catch { throw Error('自己的接口回的不是 JSON：检查「回答是什么」'); }
  const value = request.path ? pick(json, request.path) : json;
  if (typeof value !== 'string' || !value.trim()) throw Error(`回答的「${request.path || '（没填位置）'}」里没有${request.answer === 'url' ? '音频链接' : '音频'}：检查「在 JSON 的哪里」`);
  if (request.answer === 'base64') {
    const bytes = fromBase64(value), said = value.match(/^data:([^;,]+)/)?.[1] || '';
    if (!bytes.length) throw Error('自己的接口没有回声音');
    return new Blob([bytes], {type: audioType(bytes, said)});
  }
  return fromLink(value, request, {read, load});
}

/** The voices of the list, for picking one for a role. */
export function customVoices(c) {
  return (c.params.voices || []).filter(r => String(r.name || '').trim()).map(r => ({id: String(r.name).trim(), name: String(r.name).trim() + (r.voice ? ' · ' + String(r.voice).split(/[\\/]/).pop().slice(0, 40) : r.ref_file ? ' · 上传的参考音频' : '')}));
}

// ---------- 从文件夹导入 ----------
const AUDIO_FILE = /\.(wav|mp3|flac|ogg|m4a)$/i;
const LANGUAGE_DIRS = {chinese: 'zh', zh: 'zh', 中文: 'zh', japanese: 'ja', ja: 'ja', 日语: 'ja', 日文: 'ja', english: 'en', en: 'en', 英语: 'en', korean: 'ko', ko: 'ko', 韩语: 'ko', cantonese: 'yue', yue: 'yue', 粤语: 'yue'};
/** What a reference audio says, from its file name: 「default_今日は.wav」→「今日は」 (an emotion before _ is left out). */
export function spokenOf(file) {
  const base = String(file).split(/[\\/]/).pop().replace(AUDIO_FILE, '').replace(/[​-‏⁠﻿]/g, '').trim();
  const m = base.match(/^(?:【[^】]{1,12}】|\[[^\]]{1,12}\]|[A-Za-z一-鿿]{1,12}_)(.+)$/);
  return (m ? m[1] : base).trim();
}
/** A reference text's language when no folder says it: kana → ja, hangul → ko, only Latin → en, else zh. */
export const guessLanguage = text => /[぀-ヿ]/.test(text) ? 'ja' : /[가-힯]/.test(text) ? 'ko' : /^[\x00-\x7f]+$/.test(text) ? 'en' : 'zh';

/**
 * Voices from a folder of characters, as GPT-SoVITS tools keep them: one folder each, with the GPT model (.ckpt), the
 * SoVITS model (.pth) and reference audios (often reference_audios/<Language>/emotions/<情绪>_<原文>.wav).
 * paths: the files' paths inside the picked folder (the browser's webkitRelativePath, which starts with the folder's
 * own name); root: where that folder is on the computer that runs the service. Only names are read, nothing uploaded.
 * prefer: a language to pick the reference audio in when there are several. → {voices, skipped}
 */
export function voicesFromFolder(paths, root, {prefer = ''} = {}) {
  const sep = /\\|^[a-z]:/i.test(root) ? '\\' : '/', base = String(root).trim().replace(/[\\/]+$/, '');
  const full = parts => [base, ...parts].join(sep);
  const byChar = new Map();
  for (const raw of paths) {
    const parts = String(raw).split(/[\\/]/).filter(Boolean).slice(1);
    if (parts.length < 2) continue;
    const [name, ...rest] = parts;
    if (!byChar.has(name)) byChar.set(name, []);
    byChar.get(name).push(rest);
  }
  const voices = [], skipped = [];
  for (const [name, files] of byChar) {
    const top = files.filter(f => f.length === 1).map(f => f[0]);
    const model1 = top.find(f => /\.ckpt$/i.test(f)), model2 = top.find(f => /\.pth$/i.test(f));
    const refs = files.filter(f => AUDIO_FILE.test(f.at(-1))).map(f => {
      const lang = f.slice(0, -1).map(d => LANGUAGE_DIRS[d.toLowerCase()]).find(Boolean) || '', text = spokenOf(f.at(-1));
      return {parts: f, text, lang: lang || guessLanguage(text), named: !!lang, def: /^default[_\s]/i.test(f.at(-1)), inRefs: f.length > 1};
    }).filter(r => r.text);
    const score = r => (prefer && r.lang === prefer ? 8 : 0) + (r.def ? 4 : 0) + (r.inRefs ? 2 : 0) + (r.named ? 1 : 0);
    const ref = refs.sort((a, b) => score(b) - score(a))[0];
    if (!ref) { skipped.push(name); continue; }
    voices.push({name, voice: full([name, ...ref.parts]), ref_text: ref.text, ref_lang: ref.lang, model1: model1 ? full([name, model1]) : '', model2: model2 ? full([name, model2]) : ''});
  }
  return {voices, skipped};
}

// ---------- 音色列表、报错提示 ----------
/** The voices a service lists: names, or objects with an id / name; an object of names (GSVI-style) gives its keys. */
export function readVoiceList(json, path = '') {
  let list = path ? pick(json, path) : json;
  // Models with their speakers in them (Style-Bert-VITS2).
  if (!path && list && !Array.isArray(list) && typeof list === 'object' && Object.values(list).some(m => m?.spk2id)) list = Object.values(list).flatMap(m => Object.keys(m?.spk2id || {}));
  if (!path && list && !Array.isArray(list) && typeof list === 'object') list = ['voices', 'data', 'characters', 'list', 'items', 'speakers', 'results', 'result', 'reference_ids'].map(k => list[k]).find(v => v && typeof v === 'object') ?? list;
  if (list && !Array.isArray(list) && typeof list === 'object') list = Object.keys(list);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list.slice(0, 500)) {
    const id = typeof item === 'string' ? item : item && typeof item === 'object' ? String(item.id ?? item.voice_id ?? item.uri ?? item.voice ?? item.name ?? item.character ?? item.filename ?? '') : '';
    const name = typeof item === 'object' && item ? String(item.name ?? item.display_name ?? item.customName ?? item.title ?? id) : id;
    if (id.trim() && !out.some(v => v.id === id.trim())) out.push({id: id.trim(), name: name.trim() || id.trim()});
  }
  return out;
}

/** What to change when 自己的接口 fails, in plain words ('' when the message says it already). */
export function customHint(message) {
  const m = String(message || '');
  if (/unpickling stack underflow|invalid load key|version.*(?:not|un)support/i.test(m)) return '这个模型是用更新版本的 GPT-SoVITS 训练的，现在开着的 GPT-SoVITS 读不了：换一个新版的 GPT-SoVITS，模型和设置都不用动。';
  if (/No such file|not exist|找不到|cannot find|FileNotFoundError/i.test(m)) return '路径对不上：模型和参考音频的路径要写跑 GPT-SoVITS 的那台电脑上的完整路径，检查文件夹和文件名有没有改过。';
  if (/3\s*[-~～到]\s*10|outside the .*range|参考音频.*秒/i.test(m)) return '参考音频要 3～10 秒：换一段长短合适的参考音频。';
  if (/连不上自己的接口|无法连接/.test(m)) return '服务开着吗？地址和端口对吗？在手机上用的话，地址里不能写 127.0.0.1，要写电脑的局域网 IP（比如 192.168.1.5），GPT-SoVITS 启动时加 -a 0.0.0.0。';
  if (/enableCorsProxy/.test(m)) return '';
  if (/请求超时/.test(m)) return '第一次换模型可能要等一阵，再点一次试试；还是超时就看看服务的窗口有没有报错。';
  if (/HTTP 40[13]/.test(m)) return '服务拒绝了：密钥不对或者没填，检查上面的密钥。';
  if (/HTTP 404/.test(m)) return '地址的路径不对：检查接口地址后面那段（比如 GPT-SoVITS 是 /tts）。';
  if (/HTTP 405/.test(m)) return '请求方式不对：试试把 POST 换成 GET，或者反过来。';
  if (/text_lang|prompt_lang|is not supported in version/i.test(m)) return '这个语言这版 GPT-SoVITS 不认：v1 模型不支持粤语、韩语。';
  if (/HTTP 422|HTTP 400/.test(m)) return '服务看不懂请求：对照它的接口文档检查高级设置里请求体的名字；GPT-SoVITS 的话多半是参考音频或参考文本没填。';
  if (/HTTP 5\d\d/.test(m)) return '服务自己出错了：看看服务的窗口里报了什么。';
  if (/是 text\/html|一个网页/.test(m)) return '回来的是网页：接口地址的路径不对，点「自动识别」或者对照它的接口文档改。';
  if (/不是音频|不是 JSON|里没有/.test(m)) return '检查高级设置里的「回答是什么」和「在 JSON 的哪里」。';
  return '';
}

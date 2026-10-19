// 自己的接口: a speech service the user runs or has (GPT-SoVITS, CosyVoice, IndexTTS…, or any HTTP text-to-speech),
// told by templates instead of written into the plugin. The address, the request body (JSON) and the headers say where
// each thing goes: {{text}} the line, {{lang}} its language (zh, ja, en, ko, yue…), {{emotion}} its 情绪, {{voice}} the
// voice (an ID, or a reference audio's path on the machine that runs the service), {{ref_text}} {{ref_lang}} what is
// said in the reference audio and in which language, {{key}} the key. The answer is the audio itself, or JSON with a
// link to it or the audio in base64. The voices are the user's own list (parameters.js, 自己的接口 → 音色).
import {proxyAddress} from './proxy-url.js';
import {languageCode} from './languages.js';
import {pick} from './music.js';

/** One-click formats of well-known self-hosted services: only the user's own address goes in. */
export const CUSTOM_TEMPLATES = Object.freeze([
  {id: 'gpt-sovits', name: 'GPT-SoVITS（api_v2）', example: 'http://127.0.0.1:9880',
    note: '在 GPT-SoVITS 文件夹里运行 api_v2.py（默认端口 9880）。音色的「参考音频」填参考音频在那台电脑上的路径，再填参考文本和参考语言。',
    fill: base => ({url: base + '/tts', method: 'POST', answer: 'audio', path: '', headers: '', before: `${base}/set_gpt_weights?weights_path={{model1}}\n${base}/set_sovits_weights?weights_path={{model2}}`,
      body: JSON.stringify({text: '{{text}}', text_lang: '{{lang}}', ref_audio_path: '{{voice}}', prompt_text: '{{ref_text}}', prompt_lang: '{{ref_lang}}', text_split_method: 'cut5', media_type: 'wav', streaming_mode: false}, null, 2)})},
  // The format many speech relays speak (OpenAI's /v1/audio/speech): the voice is a name the service knows.
  {id: 'openai', name: 'OpenAI 格式（/v1/audio/speech）', example: 'https://你的服务地址',
    note: '很多语音中转站和公益站用这个格式：音色是站上角色的名字。填站给的地址（/v1 前面那部分），密钥填在上面。站能列出角色的话，再填「音色列表地址」。请求体里的 model 按站的说明改。',
    fill: base => ({url: base + '/v1/audio/speech', method: 'POST', answer: 'audio', path: '', headers: '', before: '',
      body: JSON.stringify({model: 'tts-1', input: '{{text}}', voice: '{{voice}}'}, null, 2)})}
]);

const SLOT = /\{\{\s*(text|lang|emotion|voice|ref_text|ref_lang|model1|model2)\s*\}\}/g;
const KEY_SLOT = /\{\{\s*key\s*\}\}/g;
/** A language as the short code these services take: 日语 → ja, 粤语 → yue; '' when unknown. */
export function shortLanguage(value) {
  const raw = String(value ?? '').trim(), code = languageCode(raw).split('-')[0];
  return code || (/粤|cantonese|yue/i.test(raw) ? 'yue' : '');
}
/** What goes into the slots for a line said by a role. */
export function customValues(c, route, line) {
  const name = String(route.voice || '').trim(), row = (c.params.voices || []).find(r => String(r.name || '').trim() === name);
  const lang = shortLanguage(route.language) || 'zh';
  return {text: String(line.text || ''), lang, emotion: String(line.emotion || ''), voice: row ? String(row.voice || '').trim() || name : name,
    ref_text: row ? String(row.ref_text || '') : '', ref_lang: (row && shortLanguage(row.ref_lang)) || lang,
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
  let body;
  if (method === 'POST' && String(p.body || '').trim()) {
    try { body = JSON.parse(fill(p.body, values, jsonText)); } catch { throw Error('自己的接口：请求体不是有效的 JSON，检查一下引号和逗号'); }
  }
  // 换模型: the addresses that load this voice's model (a line whose model slot is empty is left out).
  const before = String(p.before || '').split('\n').map(l => l.trim()).filter(l => proxyAddress(l) || /^https?:\/\//i.test(l))
    .filter(l => [...l.matchAll(SLOT)].every(([, key]) => !/^model/.test(key) || values[key])).map(l => fill(l, values, encodeURIComponent));
  return {engine: 'custom', url: fill(url, values, encodeURIComponent), method, ...(body !== undefined ? {body} : {}), headers: String(p.headers || ''), before,
    answer: ['url', 'base64'].includes(p.answer) ? p.answer : 'audio', path: String(p.path || '').trim(), format: 'auto'};
}

/** fetch() arguments for a request, with the key in. */
export function customInit(request, key = '') {
  const headers = {};
  for (const line of request.headers.split('\n')) {
    const m = line.match(/^\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*:\s*(.*)$/);
    if (m) headers[m[1]] = m[2].replace(KEY_SLOT, key).trim();
  }
  if (key && !/\{\{\s*key\s*\}\}/.test(request.headers) && !Object.keys(headers).some(h => h.toLowerCase() === 'authorization')) headers.Authorization = 'Bearer ' + key;
  const init = {method: request.method, headers};
  if (request.method === 'POST' && request.body !== undefined) { init.body = JSON.stringify(request.body); if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'; }
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
function fromBase64(text) {
  const raw = String(text).replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  let bin;
  try { bin = atob(raw); } catch { throw Error('自己的接口：回答里的 base64 音频读不出来'); }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * The audio from an answer. read(response) → Uint8Array (size-limited); load(url) → a Response for a link the answer
 * gave.
 */
export async function readCustomAnswer(response, request, {read, load}) {
  if (!response.ok) {
    const said = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
    throw Error(`自己的接口回答 HTTP ${response.status}${said ? '：' + said : ''}`);
  }
  const type = response.headers.get('content-type') || '';
  if (request.answer === 'audio') {
    if (/json|text\/html/i.test(type)) throw Error('自己的接口回的不是音频（是 ' + type.split(';')[0] + '）：检查「回答是什么」');
    const bytes = await read(response);
    if (!bytes.length) throw Error('自己的接口没有回声音');
    return new Blob([bytes], {type: audioType(bytes, type)});
  }
  let json;
  try { json = JSON.parse(new TextDecoder().decode(await read(response))); } catch { throw Error('自己的接口回的不是 JSON：检查「回答是什么」'); }
  const value = request.path ? pick(json, request.path) : json;
  if (typeof value !== 'string' || !value.trim()) throw Error(`回答的「${request.path || '（没填位置）'}」里没有${request.answer === 'url' ? '音频链接' : '音频'}：检查「在 JSON 的哪里」`);
  if (request.answer === 'base64') {
    const bytes = fromBase64(value), said = value.match(/^data:([^;,]+)/)?.[1] || '';
    if (!bytes.length) throw Error('自己的接口没有回声音');
    return new Blob([bytes], {type: audioType(bytes, said)});
  }
  let link;
  try { link = new URL(value.trim(), new URL(request.url, globalThis.location?.href).href).href; } catch { throw Error('回答里的音频链接不是网址'); }
  const audio = await load(link);
  if (!audio.ok) throw Error(`音频链接打不开（HTTP ${audio.status}）`);
  const bytes = await read(audio);
  if (!bytes.length) throw Error('音频链接里没有声音');
  return new Blob([bytes], {type: audioType(bytes, audio.headers.get('content-type') || '')});
}

/** The voices of the list, for picking one for a role. */
export function customVoices(c) {
  return (c.params.voices || []).filter(r => String(r.name || '').trim()).map(r => ({id: String(r.name).trim(), name: String(r.name).trim() + (r.voice ? ' · ' + String(r.voice).split(/[\\/]/).pop().slice(0, 40) : '')}));
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
  if (!path && list && !Array.isArray(list) && typeof list === 'object') list = ['voices', 'data', 'characters', 'list', 'items', 'speakers'].map(k => list[k]).find(v => v && typeof v === 'object') ?? list;
  if (list && !Array.isArray(list) && typeof list === 'object') list = Object.keys(list);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list.slice(0, 500)) {
    const id = typeof item === 'string' ? item : item && typeof item === 'object' ? String(item.id ?? item.voice_id ?? item.voice ?? item.name ?? item.character ?? '') : '';
    const name = typeof item === 'object' && item ? String(item.name ?? item.display_name ?? item.title ?? id) : id;
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
  if (/HTTP 422|HTTP 400/.test(m)) return '服务看不懂请求：对照它的接口文档检查请求体里的名字；GPT-SoVITS 的话多半是参考音频或参考文本没填。';
  if (/HTTP 5\d\d/.test(m)) return '服务自己出错了：看看服务的窗口里报了什么。';
  if (/不是音频|不是 JSON|里没有/.test(m)) return '检查「回答是什么」和「在 JSON 的哪里」。';
  return '';
}

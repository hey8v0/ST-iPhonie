// 文字模型: which model writes the phone's text (chat replies, 朋友圈, calls, picture plans). 'tavern' uses the model the
// tavern is connected to (generateRaw), as before; 'custom' calls an OpenAI-compatible Chat Completions API directly
// from the browser with its own address, key and model. The story itself always stays on the tavern's model.
// Several custom connections can be kept as presets (address, model, temperature, length), one of them in use.
// Each preset's key lives with the other keys (core/keys.js, engine 'llm', one line per preset) and never appears in
// settings, requests shown to the user, or error messages.
import {proxyAddress} from './proxy-url.js';

// idle: a streamed answer may go this long without sending anything (thinking counts as sending); whole: the longest
// any request may take; timeout: an answer that is not streamed (it says nothing until it is done).
export const TEXT_LIMITS = Object.freeze({maxTokens: [64, 128000], temperature: [0, 2], idle: 90000, whole: 600000, timeout: 300000});

export function defaultTextPreset(id = 'default', name = '自定义接口') {
  return {id, name, url: '', model: '', temperature: 0.9, maxTokens: 1200, thinking: 'auto', stream: true};
}
export function defaultText() {
  return {source: 'tavern', active: 'default', presets: [defaultTextPreset()]};
}
export const TEXT_PRESET_ID = /^[\w-]{1,64}$/;
const count = (value, [min, max], fallback, round = true) => { const n = round ? Math.round(Number(value)) : Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
function normalizePreset(value, index) {
  const base = defaultTextPreset();
  return {id: TEXT_PRESET_ID.test(String(value?.id || '')) ? String(value.id) : crypto.randomUUID(), name: String(value?.name || '').trim().slice(0, 40) || '接口 ' + (index + 1),
    url: String(value?.url || '').trim().slice(0, 500), model: String(value?.model || '').trim().slice(0, 200),
    temperature: Math.round(count(value?.temperature, TEXT_LIMITS.temperature, base.temperature, false) * 100) / 100, maxTokens: count(value?.maxTokens, TEXT_LIMITS.maxTokens, base.maxTokens),
    thinking: value?.thinking === 'off' ? 'off' : 'auto',
    // 流式: on unless turned off (some providers, Gemini behind some relays, cut a streamed answer short).
    stream: value?.stream !== false};
}
export function normalizeText(value) {
  const base = defaultText();
  if (!value || typeof value !== 'object') return base;
  // Before presets there was one custom connection: it becomes the first preset, and its saved key goes with it ('default').
  const list = Array.isArray(value.presets) && value.presets.length ? value.presets : [{...value, id: 'default', name: '自定义接口'}];
  const presets = [];
  for (const [i, p] of list.slice(0, 30).entries()) { const preset = normalizePreset(p, i); if (presets.some(x => x.id === preset.id)) preset.id = crypto.randomUUID(); presets.push(preset); }
  return {source: value.source === 'custom' ? 'custom' : 'tavern', active: presets.some(p => p.id === value.active) ? value.active : presets[0].id, presets};
}
/** The connection in use: the source plus the active preset's address, model, temperature and length. */
export function activeText(value) {
  const text = normalizeText(value);
  return {source: text.source, ...text.presets.find(p => p.id === text.active)};
}

/** The API base: what the user typed without a trailing slash or a pasted /chat/completions or /models. */
export function apiBase(url) {
  let base = String(url || '').trim().replace(/\/+$/, '');
  base = base.replace(/\/(chat\/completions|completions|models)$/i, '');
  if (!proxyAddress(base) && !/^https?:\/\/[^\s/]+/i.test(base)) throw Error('请填写接口地址，例如 https://api.openai.com/v1');
  return base;
}

/** The messages to send: prompts are message lists already; a plain string becomes one user message. */
export function asMessages(prompt) {
  if (Array.isArray(prompt)) return prompt.filter(m => m && (typeof m.content === 'string' || Array.isArray(m.content))).map(m => ({role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user', content: typeof m.content === 'string' ? m.content : m.content.filter(p => p?.type === 'text' && typeof p.text === 'string' || p?.type === 'image_url' && typeof p.image_url?.url === 'string').map(p => p.type === 'text' ? {type: 'text', text: p.text} : {type: 'image_url', image_url: {url: p.image_url.url}})}));
  return [{role: 'user', content: String(prompt ?? '')}];
}

// Manual image-prompt writing only: some tavern wrappers may stringify message
// arrays. Use generateRaw's string + systemPrompt form at this boundary while
// leaving the custom API's structured messages and all other features intact.
export function tavernTextRequest(request){
  const {plainText,...out}=request;
  if(!plainText||!Array.isArray(out.prompt))return out;
  const messages=asMessages(out.prompt).map(m=>{
    if(Array.isArray(m.content)&&m.content.some(p=>p.type!=='text'))throw Error('绘图提示词请求中包含非文字内容');
    return {...m,content:typeof m.content==='string'?m.content:m.content.map(p=>p.text).join('\n')};
  });
  const system=[out.systemPrompt,...messages.filter(m=>m.role==='system').map(m=>m.content)].filter(Boolean).join('\n\n');
  const body=messages.filter(m=>m.role!=='system');
  return {...out,systemPrompt:system,prompt:body.length===1&&body[0].role==='user'?body[0].content:body.map(m=>`[${m.role}]\n${m.content}`).join('\n\n')};
}

/**
 * How long an answer may be: what the task needs at least (responseLength, worked out from its size), or the user's own
 * 最长回复 when that is more. The user's number is a ceiling they chose, so a task never cuts below it.
 */
export const answerRoom = (asked, own) => Math.max(Number(asked) || 0, Number(own) || 0) || undefined;

export function chatBody(text, prompt, responseLength) {
  if (!text.model) throw Error('请先在「引擎 → 文字模型」里填写模型名');
  // 关掉思考: the switches the providers that think by default read (硅基流动 and 通义: enable_thinking; 智谱, 火山方舟: thinking).
  const quiet = text.thinking === 'off' ? {enable_thinking: false, thinking: {type: 'disabled'}} : {};
  return {model: text.model, messages: asMessages(prompt), temperature: text.temperature, max_tokens: answerRoom(responseLength, text.maxTokens), ...quiet, stream: false};
}

/** The reply text of a Chat Completions answer (reasoning kept apart by the provider is left out). */
export function replyText(json) {
  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : part?.text || '').join('');
  if (typeof content === 'string') return content;
  throw Error('接口返回的内容里没有回复文字');
}

/** The text in one streamed chunk, whatever the provider's shape: OpenAI-style deltas, Claude's content deltas, Gemini's
 *  candidate parts. Reasoning sent apart (reasoning_content, Gemini thoughts) is left out. */
export function chunkText(json) {
  const choice = json?.choices?.[0];
  if (choice) {
    const part = choice.delta?.content ?? choice.message?.content ?? choice.text;
    if (Array.isArray(part)) return part.map(p => typeof p === 'string' ? p : p?.text || '').join('');
    return typeof part === 'string' ? part : '';
  }
  if (json?.type === 'content_block_delta') return typeof json.delta?.text === 'string' ? json.delta.text : '';
  const parts = json?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.filter(p => !p?.thought).map(p => p?.text || '').join('');
  return '';
}
/**
 * Reads a streamed answer (server-sent events) to the end and returns the whole text. Some relays ("假流式" channels)
 * only answer a streamed request: asked without streaming they send back an empty message.
 */
export async function streamText(response, info = {}) {
  const reader = response.body?.getReader?.();
  const decoder = new TextDecoder();
  // raw: the whole body while no event has come, so an answer that is not a stream at all (plain JSON) can still be read.
  let buffer = '', text = '', raw = '', events = false;
  const take = block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
    if (data) events = true; else if (!events && raw.length < 4_000_000) raw += block + '\n\n';
    if (!data || data === '[DONE]') return;
    let json; try { json = JSON.parse(data); } catch { return; }
    const message = json?.error?.message || (typeof json?.error === 'string' ? json.error : '');
    if (message) throw Error(String(message).slice(0, 300));
    info.alive?.();
    const choice = json?.choices?.[0];
    if (choice?.delta?.reasoning_content || choice?.delta?.reasoning || json?.candidates?.[0]?.content?.parts?.some?.(p => p?.thought)) info.thought = true;
    if (choice?.finish_reason) info.finish = choice.finish_reason;
    info.onChunk?.(json);
    text += info.chunkText ? info.chunkText(json) : chunkText(json);
    info.onProgress?.(text);
  };
  const end = () => { info.raw = events ? '' : raw.trim(); return text; };
  if (!reader) { for (const block of (await response.text()).split(/\r?\n\r?\n/)) take(block); return end(); }
  for (;;) {
    const {done, value} = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = done ? '' : blocks.pop();
    for (const block of blocks) take(block);
    if (done) { if (buffer) take(buffer); return end(); }
  }
}

/** A readable reason for a failed request. The key is never part of it. */
export function failure(status, body, key = '') {
  if (status === 403 && /CORS proxy is disabled/i.test(typeof body === 'string' ? body : JSON.stringify(body))) return Error('酒馆的跨域代理未开启：在 config.yaml 里把 enableCorsProxy 改成 true，然后重启酒馆');
  let detail = '';
  try { const json = typeof body === 'string' ? JSON.parse(body) : body; detail = json?.error?.message || json?.message || json?.detail || ''; } catch { detail = String(body || '').slice(0, 200); }
  detail = String(detail).slice(0, 300);
  if (key) detail = detail.split(key).join('••••');
  const reason = {401: '密钥无效或已过期', 403: '这个密钥没有权限', 404: '地址或模型名不对', 408: '接口超时了', 413: '请求内容太长', 429: '请求太频繁或额度用完了', 500: '接口服务出错了', 502: '接口服务暂时不可用', 503: '接口服务暂时不可用'}[status] || `接口返回错误 ${status}`;
  return Error(`文字模型：${reason}${detail ? '（' + detail + '）' : ''}`);
}

/**
 * Calls the custom API. fetch is passed in (tests). A network error in a browser is usually the API refusing web
 * pages (CORS) or a wrong address; the message says so.
 */
const TOO_SLOW = '文字模型：等太久了，接口没有回应';
/** An answer that is empty because the model spent the whole length thinking (or only thought): say so, do not ask again. */
const thoughtOnly = finish => Error(finish === 'length'
  ? '文字模型：模型把能写的长度都用在思考上了，没写出回复。把这个接口的「最长回复」调大，或者打开「关掉思考」'
  : '文字模型：模型只写了思考，没写回复。可以再试一次，或者打开「关掉思考」');
/**
 * Calls the custom API. fetch is passed in (tests). The answer is streamed: a model that thinks for minutes (or writes a
 * long 查手机) is not cut off as long as something keeps coming; it is only given up after TEXT_LIMITS.idle of silence.
 * An API that does not stream answers with plain JSON, which is read as it is. An empty streamed answer is asked once
 * more without streaming (some channels only answer that way); one that is empty because the model only thought is not
 * asked again (it would be paid twice). A network error in a browser is usually the API refusing web pages (CORS) or a
 * wrong address; the message says so.
 */
// 火山方舟 (checked 2026-10-06): no list of models (the browser's check for /models gets 404, so it cannot even ask),
// and its error answers (a wrong key or model) carry no CORS header, so the browser cannot read them either: both look
// like "cannot connect". Chatting itself is allowed from web pages.
const ARK = /volces\.com|volcengine/i;
const ARK_MODEL = '火山方舟没有模型列表：在「模型」里直接填推理接入点 ID（ep- 开头）或模型名（比如 doubao-seed-1-6-250615），在火山方舟控制台的「在线推理」或「开通管理」里能看到';
export async function customRequest({text, key, prompt, responseLength, fetch: send = globalThis.fetch, signal, details = false, onProgress}) {
  const base = apiBase(text.url), body = chatBody(text, prompt, responseLength);
  const meta = {requestedModel: text.model};
  const finish = answer => details ? {text: answer, meta} : answer;
  const post = async stream => {
    const idle = new AbortController();
    let timer = 0;
    const alive = () => { clearTimeout(timer); timer = setTimeout(() => idle.abort(), stream ? TEXT_LIMITS.idle : TEXT_LIMITS.timeout); };
    const whole = AbortSignal.timeout ? AbortSignal.timeout(TEXT_LIMITS.whole) : null;
    const signals = [idle.signal, whole, signal].filter(Boolean);
    alive();
    let response;
    try {
      response = await send(base + '/chat/completions', {method: 'POST', headers: {'Content-Type': 'application/json', ...(key ? {Authorization: 'Bearer ' + key} : {})}, body: JSON.stringify({...body, stream}),
        signal: signals.length > 1 && AbortSignal.any ? AbortSignal.any(signals) : idle.signal});
    } catch (error) {
      clearTimeout(timer);
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw Error(TOO_SLOW);
      if (ARK.test(base)) throw Error('文字模型：火山方舟没有回答。它在密钥不对、模型名不对、没开通这个模型时返回的错误浏览器读不到，看起来就像连不上：请检查密钥，以及「模型」填的是不是推理接入点 ID（ep- 开头）或开通了的模型名');
      throw Error('文字模型：连不上这个接口。可能是地址写错了，或者这个接口不允许网页直接访问（CORS）');
    }
    /** Reads the answer while the timer keeps watch; clears it whatever happens. */
    const read = async work => {
      try { alive(); return await work(alive); }
      catch (error) { if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw Error(TOO_SLOW); throw error; }
      finally { clearTimeout(timer); }
    };
    return {response, read};
  };
  /** A plain JSON answer: its text, or why there is none ('' when it is simply empty). */
  const fromJson = raw => {
    let json;
    try { json = JSON.parse(raw); } catch { throw Error('文字模型：接口返回的不是 JSON，地址可能填错了'); }
    if (details) responseMetadata(json, meta);
    let reply = '';
    try { reply = replyText(json); } catch { /* no text */ }
    if (reply.trim()) return reply;
    const choice = json?.choices?.[0];
    if (choice?.message?.reasoning_content || choice?.message?.reasoning) throw thoughtOnly(choice.finish_reason);
    return '';
  };
  // 不用流式: asked the ordinary way at once.
  const first = text.stream === false ? null : await post(true);
  if (!first) { /* below */ }
  else if (!first.response.ok) {
    const raw = await first.read(() => first.response.text());
    // An API that refuses streaming: asked the ordinary way.
    if (!(first.response.status === 400 || first.response.status === 422) || !/stream/i.test(raw)) throw failure(first.response.status, raw, key);
  } else if (/json/i.test(first.response.headers?.get?.('content-type') || '')) {
    // Streaming not supported but not refused either: an ordinary answer came back.
    const reply = fromJson(await first.read(() => first.response.text()));
    if (reply) return finish(reply);
  } else {
    const info = details ? {onChunk: json => responseMetadata(json, meta), onProgress: content => onProgress?.(content, meta)} : {};
    const reply = await first.read(alive => streamText(first.response, Object.assign(info, {alive})));
    if (reply.trim()) return finish(reply);
    if (info.thought) throw thoughtOnly(info.finish);
    // Not a stream after all: an ordinary answer that did not say so.
    if (info.raw) { const plain = fromJson(info.raw); if (plain) return finish(plain); }
  }
  // Nothing yet: once more without streaming.
  const second = await post(false);
  const raw = await second.read(() => second.response.text());
  if (!second.response.ok) throw failure(second.response.status, raw, key);
  const reply = fromJson(raw);
  if (!reply) throw Error('文字模型：接口没有返回内容（流式请求和普通请求都试过了）');
  return finish(reply);
}

/** Model ids the API lists (GET /models): for picking a model and checking the connection. Listing costs nothing. */
export async function listModels({text, key, fetch: send = globalThis.fetch}) {
  const base = apiBase(text.url);
  let response;
  // Some APIs (火山方舟 among them) have no list of models: the model is written by hand then.
  // 火山方舟 has none to read: said at once, without asking.
  if (ARK.test(base)) throw Error('文字模型：' + ARK_MODEL);
  const byHand = '这个接口读不出模型列表：在「模型」里直接填模型名就行（接口的文档或控制台里能找到）';
  try { response = await send(base + '/models', {headers: key ? {Authorization: 'Bearer ' + key} : {}}); }
  catch { throw Error('文字模型：连不上这个接口。可能是地址写错了，或者这个接口不允许网页直接访问（CORS）'); }
  const raw = await response.text();
  if (response.status === 404 || response.status === 405) throw Error('文字模型：' + byHand);
  if (!response.ok) throw failure(response.status, raw, key);
  let json;
  try { json = JSON.parse(raw); } catch { throw Error('文字模型：' + byHand); }
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
  if (!list.length) throw Error('文字模型：' + byHand);
  return [...new Set(list.map(m => typeof m === 'string' ? m : m?.id || m?.name).filter(Boolean).map(String))].sort().slice(0, 500);
}

/** Only explicit upstream metadata; a model's self-description is never used as identification. */
export function responseMetadata(json, meta = {}) {
  const model = json?.model || json?.message?.model || json?.modelVersion;
  if (typeof model === 'string') meta.reportedModel = model.slice(0, 200);
  if (typeof json?.provider === 'string') meta.provider = json.provider.slice(0, 200);
  const choice = json?.choices?.find(c => !c.index) || json?.choices?.[0];
  const delta = choice?.delta || choice?.message;
  const thought = delta?.reasoning_content || delta?.reasoning || json?.delta?.thinking ||
    json?.candidates?.[0]?.content?.parts?.filter(p => p.thought).map(p => p.text || '').join('') || '';
  if (typeof thought === 'string') meta.reasoning = ((meta.reasoning || '') + thought).slice(0, 100000);
  return meta;
}
